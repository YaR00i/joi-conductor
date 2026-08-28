import { displayMediaUrl, type MediaItem, type MediaKind } from "./media";
import { getMatchingFavoriteRecord } from "./mediaFavorites";

export type PreloadProgress = {
  percent: number | null;
  phase: "loading" | "ready" | "error";
  loadedBytes?: number;
  totalBytes?: number | null;
};

/** Overall queue download progress (file-count based). */
export type PlaylistPreloadStatus = {
  active: boolean;
  total: number;
  ready: number;
  failed: number;
  /** ready + failed */
  done: number;
  /** 0–100 */
  percent: number;
};

export type FilePreloadPhase = "queued" | "loading" | "ready" | "error";

export type FilePreloadEntry = {
  itemId: string;
  order: number;
  kind: MediaKind;
  label: string;
  phase: FilePreloadPhase;
  percent: number | null;
  loadedBytes: number;
  totalBytes: number | null;
  bytesPerSec: number | null;
  attempt: number;
  maxAttempts: number;
  /** Human-readable transport/decode failure for diagnostics. */
  errorDetail: string | null;
  /** While backoff is running, approximate next attempt time. */
  retryAt: number | null;
};

export type PlaylistPreloadDetail = PlaylistPreloadStatus & {
  files: FilePreloadEntry[];
  /** Sum of in-flight download speeds */
  aggregateBytesPerSec: number | null;
};

type CacheEntry = {
  itemId: string;
  playUrl: string;
  blobUrl: string | null;
  ready: boolean;
  error: boolean;
  promise: Promise<string> | null;
  lastUsed: number;
  progressListeners: Set<(p: PreloadProgress) => void>;
  /** Live download samples for speed */
  loadedBytes: number;
  totalBytes: number | null;
  speedEma: number | null;
  lastSampleAt: number;
  lastSampleBytes: number;
  attempt: number;
  lastError: string | null;
  retryAt: number | null;
};

const cache = new Map<string, CacheEntry>();
/** Floor when not retaining a full playlist. */
const MAX_ENTRIES_FLOOR = 8;

/** CDN / proxy hang (often no VPN) — abort and retry. */
const MEDIA_DOWNLOAD_TIMEOUT_MS = 25_000;
/** Videos are large; give them a longer per-attempt timeout. */
const MEDIA_VIDEO_DOWNLOAD_TIMEOUT_MS = 45_000;
const MEDIA_DOWNLOAD_ATTEMPTS = 6;
const MEDIA_DOWNLOAD_RETRY_BASE_MS = 2_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function downloadMediaBlob(
  remote: string,
  onProgress: (loaded: number, total: number | null) => void,
  kind?: MediaKind,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("GET", remote);
    xhr.responseType = "blob";
    const timeout =
      kind === "video" || kind === "gif"
        ? MEDIA_VIDEO_DOWNLOAD_TIMEOUT_MS
        : MEDIA_DOWNLOAD_TIMEOUT_MS;
    xhr.timeout = timeout;
    xhr.onprogress = (e) => {
      const total = e.lengthComputable && e.total > 0 ? e.total : null;
      onProgress(e.loaded, total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300 && xhr.response) {
        resolve(xhr.response as Blob);
        return;
      }
      // Retryable gateway / rate-limit
      if (xhr.status === 429 || xhr.status >= 500) {
        reject(new Error(`preload HTTP ${xhr.status}`));
        return;
      }
      reject(new Error(`preload HTTP ${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error("preload network error"));
    xhr.ontimeout = () => reject(new Error("preload timeout"));
    xhr.onabort = () => reject(new Error("preload aborted"));
    xhr.send();
  });
}

function isRetryableDownloadError(err: unknown): boolean {
  if (!(err instanceof Error)) return true;
  const m = err.message.toLowerCase();
  if (m.includes("http 4") && !m.includes("http 429")) return false;
  return (
    m.includes("network") ||
    m.includes("timeout") ||
    m.includes("abort") ||
    m.includes("429") ||
    m.includes("http 5")
  );
}

function errorDetail(err: unknown): string {
  if (err instanceof Error && err.message.trim()) return err.message.trim();
  return "неизвестная ошибка сети";
}

/** Playlist ids protected from eviction during full preload / session. */
let retainedIds = new Set<string>();
/**
 * Extra ids kept across overlay warms (quest/cumplay prefetch must not
 * wipe the main session cache before the overlay is applied).
 */
let stickyRetainIds = new Set<string>();
let preloadGen = 0;

/** Current preload job metadata (playback order). */
let jobItems: MediaItem[] = [];
const fileMeta = new Map<
  string,
  { order: number; kind: MediaKind; label: string; phase: FilePreloadPhase }
>();

type StatusListener = (s: PlaylistPreloadStatus) => void;
type DetailListener = (d: PlaylistPreloadDetail) => void;
const statusListeners = new Set<StatusListener>();
const detailListeners = new Set<DetailListener>();

let lastStatus: PlaylistPreloadStatus = {
  active: false,
  total: 0,
  ready: 0,
  failed: 0,
  done: 0,
  percent: 0,
};

let lastDetailEmitAt = 0;

function now() {
  return Date.now();
}

function budget(): number {
  return Math.max(MAX_ENTRIES_FLOOR, retainedIds.size || MAX_ENTRIES_FLOOR);
}

function shortLabel(item: MediaItem, order: number): string {
  const kind =
    item.kind === "video" ? "видео" : item.kind === "gif" ? "gif" : "фото";
  const id = item.gelbooruId?.trim() || item.id.replace(/^gb-/, "").slice(0, 10);
  return `#${order + 1} · ${kind} · ${id}`;
}

function evict(id: string) {
  if (retainedIds.has(id)) return;
  forgetCachedMedia(id);
}

/** Drop a cached blob so the next ensureMediaCached actually re-downloads. */
export function forgetCachedMedia(itemId: string): void {
  const entry = cache.get(itemId);
  if (!entry) return;
  if (entry.blobUrl) URL.revokeObjectURL(entry.blobUrl);
  cache.delete(itemId);
}

function trimToMax() {
  const max = budget();
  while (cache.size > max) {
    let oldestId: string | null = null;
    let oldestAt = Infinity;
    for (const [id, entry] of cache) {
      if (retainedIds.has(id)) continue;
      if (entry.lastUsed < oldestAt) {
        oldestAt = entry.lastUsed;
        oldestId = id;
      }
    }
    if (!oldestId) break;
    evict(oldestId);
  }
}

function countPlaylist(items: MediaItem[]): {
  ready: number;
  failed: number;
} {
  let ready = 0;
  let failed = 0;
  for (const item of items) {
    const e = cache.get(item.id);
    if (e?.ready && !e.error) ready += 1;
    else if (e?.error) failed += 1;
  }
  return { ready, failed };
}

function updateSpeed(entry: CacheEntry, loaded: number): number | null {
  const t = now();
  const dt = (t - entry.lastSampleAt) / 1000;
  if (dt >= 0.2 && loaded >= entry.lastSampleBytes) {
    const inst = (loaded - entry.lastSampleBytes) / dt;
    entry.speedEma =
      entry.speedEma == null ? inst : entry.speedEma * 0.7 + inst * 0.3;
    entry.lastSampleAt = t;
    entry.lastSampleBytes = loaded;
  }
  entry.loadedBytes = loaded;
  return entry.speedEma;
}

function buildDetail(active: boolean): PlaylistPreloadDetail {
  const items = jobItems;
  const total = items.length;
  const { ready, failed } = countPlaylist(items);
  const done = ready + failed;
  const percent =
    total <= 0 ? 0 : Math.min(100, Math.round((done / total) * 100));

  const files: FilePreloadEntry[] = items.map((item, order) => {
    const meta = fileMeta.get(item.id);
    const entry = cache.get(item.id);
    let phase: FilePreloadPhase =
      meta?.phase ??
      (entry?.ready && !entry.error
        ? "ready"
        : entry?.error
          ? "error"
          : entry?.promise
            ? "loading"
            : "queued");
    if (entry?.ready && !entry.error) phase = "ready";
    else if (entry?.error) phase = "error";
    else if (entry?.promise) phase = "loading";

    const percentFile =
      phase === "ready"
        ? 100
        : phase === "error"
          ? null
          : entry && entry.totalBytes && entry.totalBytes > 0
            ? Math.min(
                99,
                Math.round((entry.loadedBytes / entry.totalBytes) * 100),
              )
            : null;

    return {
      itemId: item.id,
      order: meta?.order ?? order,
      kind: meta?.kind ?? item.kind,
      label: meta?.label ?? shortLabel(item, order),
      phase,
      percent: percentFile,
      loadedBytes: entry?.loadedBytes ?? 0,
      totalBytes: entry?.totalBytes ?? null,
      bytesPerSec:
        phase === "loading" ? (entry?.speedEma ?? null) : null,
      attempt: entry?.attempt ?? 0,
      maxAttempts: MEDIA_DOWNLOAD_ATTEMPTS,
      errorDetail: entry?.lastError ?? null,
      retryAt: entry?.retryAt ?? null,
    };
  });

  let aggregate = 0;
  let anySpeed = false;
  for (const f of files) {
    if (f.phase === "loading" && f.bytesPerSec != null) {
      aggregate += f.bytesPerSec;
      anySpeed = true;
    }
  }

  return {
    active,
    total,
    ready,
    failed,
    done,
    percent,
    files,
    aggregateBytesPerSec: anySpeed ? aggregate : null,
  };
}

function emitStatus(
  items: MediaItem[],
  active: boolean,
): PlaylistPreloadStatus {
  jobItems = items;
  const total = items.length;
  const { ready, failed } = countPlaylist(items);
  const done = ready + failed;
  const percent =
    total <= 0 ? 0 : Math.min(100, Math.round((done / total) * 100));
  lastStatus = { active, total, ready, failed, done, percent };
  for (const fn of statusListeners) fn(lastStatus);
  emitDetail(active, true);
  return lastStatus;
}

function emitDetail(active: boolean, force = false) {
  const t = now();
  if (!force && t - lastDetailEmitAt < 120) return;
  lastDetailEmitAt = t;
  if (detailListeners.size === 0) return;
  const detail = buildDetail(active);
  for (const fn of detailListeners) fn(detail);
}

function setFilePhase(itemId: string, phase: FilePreloadPhase) {
  const meta = fileMeta.get(itemId);
  if (meta) meta.phase = phase;
}

function fanOutProgress(entry: CacheEntry, p: PreloadProgress) {
  for (const fn of entry.progressListeners) {
    try {
      fn(p);
    } catch {
      /* ignore listener errors */
    }
  }
}

export function getPlaylistPreloadStatus(): PlaylistPreloadStatus {
  return lastStatus;
}

export function subscribePlaylistPreload(
  fn: StatusListener,
): () => void {
  statusListeners.add(fn);
  fn(lastStatus);
  return () => {
    statusListeners.delete(fn);
  };
}

export function getPlaylistPreloadDetail(): PlaylistPreloadDetail {
  return buildDetail(lastStatus.active);
}

export function subscribePlaylistPreloadDetail(
  fn: DetailListener,
): () => void {
  detailListeners.add(fn);
  fn(buildDetail(lastStatus.active));
  return () => {
    detailListeners.delete(fn);
  };
}

/** Instant hit if already downloaded. */
export function peekCachedPlayUrl(itemId: string): string | null {
  const entry = cache.get(itemId);
  if (!entry?.ready || entry.error) return null;
  entry.lastUsed = now();
  return entry.playUrl;
}

export function isMediaCached(itemId: string): boolean {
  const entry = cache.get(itemId);
  return Boolean(entry?.ready && !entry.error);
}

/** Wait out an in-flight RAM cache download so a shelf save can reuse it. */
export async function waitForMediaCache(itemId: string): Promise<void> {
  const pending = cache.get(itemId)?.promise;
  if (!pending) return;
  try {
    await pending;
  } catch {
    /* save can still fetch */
  }
}

/** Copy RAM-cache bytes without hitting the CDN again. */
export async function readCachedMediaBlob(
  itemId: string,
): Promise<Blob | null> {
  const entry = cache.get(itemId);
  const url = entry?.blobUrl?.trim();
  if (!entry?.ready || entry.error || !url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return blob.size > 0 ? blob : null;
  } catch {
    return null;
  }
}

function commitReadyBlob(
  itemId: string,
  stub: CacheEntry,
  blobUrl: string,
  size: number,
): string {
  const live = cache.get(itemId) ?? stub;
  live.playUrl = blobUrl;
  live.blobUrl = blobUrl;
  live.ready = true;
  live.error = false;
  live.promise = null;
  live.lastUsed = now();
  live.loadedBytes = size;
  live.totalBytes = size;
  live.lastError = null;
  live.retryAt = null;
  live.progressListeners.clear();
  cache.set(itemId, live);
  setFilePhase(itemId, "ready");
  trimToMax();
  fanOutProgress(live, {
    percent: 100,
    phase: "ready",
    loadedBytes: size,
    totalBytes: size,
  });
  emitDetail(lastStatus.active, true);
  return blobUrl;
}

async function playUrlFromSavedFavorite(
  item: MediaItem,
): Promise<{ url: string; size: number } | null> {
  if (
    item.source === "local" ||
    item.source === "favorites" ||
    item.url.startsWith("blob:") ||
    item.url.startsWith("data:")
  ) {
    return null;
  }
  try {
    const rec = await getMatchingFavoriteRecord(item);
    if (!rec?.blob || rec.blob.size <= 0) return null;
    return { url: URL.createObjectURL(rec.blob), size: rec.blob.size };
  } catch {
    return null;
  }
}

/**
 * Ensure item bytes are local (blob URL). Reuses in-flight downloads.
 * If the post is already on the shelf, plays that file instead of the CDN.
 */
export function ensureMediaCached(
  item: MediaItem,
  onProgress?: (p: PreloadProgress) => void,
): Promise<string> {
  const existing = cache.get(item.id);
  if (existing?.ready && !existing.error) {
    existing.lastUsed = now();
    onProgress?.({ percent: 100, phase: "ready", loadedBytes: existing.loadedBytes, totalBytes: existing.totalBytes });
    setFilePhase(item.id, "ready");
    return Promise.resolve(existing.playUrl);
  }
  if (existing?.promise) {
    if (onProgress) existing.progressListeners.add(onProgress);
    return existing.promise.then(
      (url) => {
        if (onProgress) existing.progressListeners.delete(onProgress);
        onProgress?.({
          percent: 100,
          phase: "ready",
          loadedBytes: existing.loadedBytes,
          totalBytes: existing.totalBytes,
        });
        return url;
      },
      (err) => {
        if (onProgress) existing.progressListeners.delete(onProgress);
        onProgress?.({ percent: null, phase: "error" });
        throw err;
      },
    );
  }

  const remote = displayMediaUrl(item);
  if (
    item.source === "local" ||
    item.source === "favorites" ||
    remote.startsWith("blob:") ||
    remote.startsWith("data:")
  ) {
    const entry: CacheEntry = {
      itemId: item.id,
      playUrl: remote,
      blobUrl: null,
      ready: true,
      error: false,
      promise: null,
      lastUsed: now(),
      progressListeners: new Set(),
      loadedBytes: 0,
      totalBytes: null,
      speedEma: null,
      lastSampleAt: now(),
      lastSampleBytes: 0,
      attempt: 0,
      lastError: null,
      retryAt: null,
    };
    cache.set(item.id, entry);
    setFilePhase(item.id, "ready");
    onProgress?.({ percent: 100, phase: "ready" });
    emitDetail(lastStatus.active, true);
    return Promise.resolve(remote);
  }

  setFilePhase(item.id, "loading");
  onProgress?.({ percent: null, phase: "loading", loadedBytes: 0, totalBytes: null });

  const progressListeners = new Set<(p: PreloadProgress) => void>();
  if (onProgress) progressListeners.add(onProgress);

  const entryStub: CacheEntry = {
    itemId: item.id,
    playUrl: remote,
    blobUrl: null,
    ready: false,
    error: false,
    promise: null,
    lastUsed: now(),
    progressListeners,
    loadedBytes: 0,
    totalBytes: null,
    speedEma: null,
    lastSampleAt: now(),
    lastSampleBytes: 0,
    attempt: 0,
    lastError: null,
    retryAt: null,
  };

  const promise = (async () => {
    const saved = await playUrlFromSavedFavorite(item);
    if (saved) {
      return commitReadyBlob(item.id, entryStub, saved.url, saved.size);
    }

    let lastErr: unknown;
    for (let attempt = 0; attempt < MEDIA_DOWNLOAD_ATTEMPTS; attempt++) {
      const cur = cache.get(item.id) ?? entryStub;
      cur.error = false;
      cur.ready = false;
      cur.loadedBytes = 0;
      cur.totalBytes = null;
      cur.speedEma = null;
      cur.lastSampleAt = now();
      cur.lastSampleBytes = 0;
      cur.attempt = attempt + 1;
      cur.retryAt = null;
      setFilePhase(item.id, "loading");
      fanOutProgress(cur, {
        percent: null,
        phase: "loading",
        loadedBytes: 0,
        totalBytes: null,
      });
      emitDetail(true);

      try {
        const blob = await downloadMediaBlob(
          remote,
          (loaded, total) => {
            const live = cache.get(item.id) ?? entryStub;
            live.totalBytes = total;
            updateSpeed(live, loaded);
            const pct =
            total != null
              ? Math.min(99, Math.round((loaded / total) * 100))
              : null;
          fanOutProgress(live, {
            percent: pct,
            phase: "loading",
            loadedBytes: loaded,
            totalBytes: total,
          });
          emitDetail(true);
        },
          item.kind,
        );

        if (blob.size <= 0) {
          throw new Error("сервер вернул пустой файл");
        }
        if (
          (item.kind === "video" || item.kind === "gif") &&
          /^(text\/html|application\/json)/i.test(blob.type)
        ) {
          throw new Error(
            `сервер вернул ${blob.type} вместо медиа (возможна блокировка CDN)`,
          );
        }

        const live = cache.get(item.id) ?? entryStub;
        const blobUrl = URL.createObjectURL(blob);
        return commitReadyBlob(item.id, live, blobUrl, blob.size);
      } catch (err) {
        lastErr = err;
        const cur = cache.get(item.id) ?? entryStub;
        cur.lastError = errorDetail(err);
        if (
          attempt < MEDIA_DOWNLOAD_ATTEMPTS - 1 &&
          isRetryableDownloadError(err)
        ) {
          const delay =
            MEDIA_DOWNLOAD_RETRY_BASE_MS * (attempt + 1) +
            Math.floor(Math.random() * 400);
          cur.retryAt = now() + delay;
          emitDetail(true, true);
          await sleep(delay);
          continue;
        }
        break;
      }
    }

    const cur = cache.get(item.id) ?? entryStub;
    cur.ready = false;
    cur.error = true;
    cur.promise = null;
    cur.retryAt = null;
    cur.progressListeners.clear();
    cache.set(item.id, cur);
    setFilePhase(item.id, "error");
    fanOutProgress(cur, { percent: null, phase: "error" });
    emitDetail(lastStatus.active, true);
    const detail =
      lastErr instanceof Error && lastErr.message
        ? lastErr.message
        : "network error";
    throw new Error(
      `preload failed after ${MEDIA_DOWNLOAD_ATTEMPTS} attempts (${detail}). Включи VPN и повтори.`,
    );
  })();

  entryStub.promise = promise;
  cache.set(item.id, entryStub);
  emitDetail(true, true);

  return promise;
}

/** Current phase for a file in the playlist (or undefined if unknown). */
export function getFilePreloadPhase(itemId: string): FilePreloadPhase | undefined {
  return fileMeta.get(itemId)?.phase;
}

/**
 * Manually retry a single failed media item: resets its cache entry and
 * re-runs ensureMediaCached (which goes through the full attempt loop again).
 * Returns false if the item is not part of the current job.
 */
export async function retryMediaItem(itemId: string): Promise<boolean> {
  const item = jobItems.find((m) => m.id === itemId);
  if (!item) return false;
  const entry = cache.get(itemId);
  if (entry) {
    entry.error = false;
    entry.ready = false;
    entry.promise = null;
    entry.playUrl = "";
    entry.blobUrl = null;
    entry.lastError = null;
    entry.retryAt = null;
    entry.attempt = 0;
  }
  setFilePhase(itemId, "queued");
  emitStatus(jobItems, true);
  try {
    await ensureMediaCached(item);
    emitStatus(jobItems, false);
    return true;
  } catch {
    // phase already set to "error" by ensureMediaCached
    emitStatus(jobItems, false);
    return false;
  }
}

/** Mark a successfully downloaded Blob as unplayable by the browser codec. */
export function markMediaPlaybackError(
  itemId: string,
  detail = "браузер не смог декодировать формат видео",
): void {
  const entry = cache.get(itemId);
  if (!entry) return;
  if (entry.blobUrl) URL.revokeObjectURL(entry.blobUrl);
  entry.playUrl = "";
  entry.blobUrl = null;
  entry.ready = false;
  entry.error = true;
  entry.promise = null;
  entry.lastError = detail;
  entry.retryAt = null;
  setFilePhase(itemId, "error");
  emitStatus(jobItems, false);
}

/**
 * Retry every item currently in the "error" phase. Returns the number of items
 * re-queued. Useful as a one-click "retry all failed" in the cache panel.
 */
export async function retryAllFailedMedia(): Promise<number> {
  const failedIds: string[] = [];
  for (const [id, meta] of fileMeta) {
    if (meta.phase === "error") failedIds.push(id);
  }
  if (failedIds.length === 0) return 0;
  // Kick them off in parallel (ensureMediaCached has its own concurrency guard
  // via the cache promise slot).
  await Promise.allSettled(failedIds.map((id) => retryMediaItem(id)));
  return failedIds.length;
}

/**
 * Warm next/prev slides around `centerIndex`.
 * Skips eviction of retained playlist ids.
 */
export function preloadAround(
  items: MediaItem[],
  centerIndex: number,
  ahead = 3,
  behind = 1,
): void {
  if (items.length === 0) return;
  const order: MediaItem[] = [];

  for (let d = 1; d <= ahead; d++) {
    const i = (centerIndex + d + items.length * 8) % items.length;
    order.push(items[i]!);
  }
  for (let d = 1; d <= behind; d++) {
    const i = (centerIndex - d + items.length * 8) % items.length;
    order.push(items[i]!);
  }

  for (const item of order) {
    if (isMediaCached(item.id)) continue;
    const entry = cache.get(item.id);
    if (entry?.promise) continue;
    void ensureMediaCached(item).catch(() => {
      /* preload miss is fine */
    });
  }
}

function initJobMeta(list: MediaItem[]) {
  fileMeta.clear();
  list.forEach((item, order) => {
    const ready = isMediaCached(item.id);
    const failed = cache.get(item.id)?.error === true;
    fileMeta.set(item.id, {
      order,
      kind: item.kind,
      label: shortLabel(item, order),
      phase: ready ? "ready" : failed ? "error" : "queued",
    });
  });
}

/**
 * Download the whole playlist in the background (limited concurrency).
 * Order of `items` = playback / download priority.
 * Cancels the previous full-preload job when called again.
 */
export function preloadEntirePlaylist(
  items: MediaItem[],
  opts?: { concurrency?: number; preserveExisting?: boolean },
): void {
  const list = items.slice();

  // Overlay warm: pin + download new ids without cancelling the main job
  // or evicting already-cached session images.
  if (opts?.preserveExisting) {
    for (const id of list.map((i) => i.id)) {
      retainedIds.add(id);
      stickyRetainIds.add(id);
    }
    for (const id of stickyRetainIds) retainedIds.add(id);
    const pending = list.filter((i) => !isMediaCached(i.id));
    if (pending.length === 0) return;
    const concurrency = Math.max(1, Math.min(opts?.concurrency ?? 3, 4));
    let cursor = 0;
    const worker = async () => {
      while (cursor < pending.length) {
        const idx = cursor;
        cursor += 1;
        const item = pending[idx]!;
        try {
          await ensureMediaCached(item);
        } catch {
          /* leave uncached; stage can retry */
        }
      }
    };
    void Promise.all(
      Array.from({ length: concurrency }, () => worker()),
    );
    return;
  }

  const gen = ++preloadGen;
  retainedIds = new Set([
    ...list.map((i) => i.id),
    ...stickyRetainIds,
  ]);
  syncPreloadCacheToPlaylist(list);
  initJobMeta(list);
  jobItems = list;
  emitStatus(list, list.length > 0);

  if (list.length === 0) {
    lastStatus = {
      active: false,
      total: 0,
      ready: 0,
      failed: 0,
      done: 0,
      percent: 0,
    };
    for (const fn of statusListeners) fn(lastStatus);
    emitDetail(false, true);
    return;
  }

  const pending = list.filter((i) => !isMediaCached(i.id));
  for (const item of pending) {
    setFilePhase(item.id, "queued");
  }
  emitStatus(list, pending.length > 0);

  if (pending.length === 0) {
    emitStatus(list, false);
    return;
  }

  const concurrency = Math.max(1, Math.min(opts?.concurrency ?? 3, 4));
  let cursor = 0;

  const tick = () => {
    if (gen !== preloadGen) return;
    emitStatus(list, true);
  };

  const worker = async () => {
    while (cursor < pending.length) {
      if (gen !== preloadGen) return;
      const idx = cursor;
      cursor += 1;
      const item = pending[idx]!;
      setFilePhase(item.id, "loading");
      emitDetail(true, true);
      try {
        await ensureMediaCached(item);
        setFilePhase(item.id, "ready");
      } catch {
        setFilePhase(item.id, "error");
      }
      tick();
    }
  };

  void (async () => {
    const workers = Array.from({ length: concurrency }, () => worker());
    await Promise.all(workers);
    if (gen !== preloadGen) return;
    emitStatus(list, false);
  })();
}

/** Alias used by App at session start. */
export function warmSessionMedia(
  items: MediaItem[],
  opts?: { preserveExisting?: boolean },
): void {
  preloadEntirePlaylist(items, {
    concurrency: 3,
    preserveExisting: opts?.preserveExisting,
  });
}

/** Keep these ids while quest/cumplay decks warm in the background. */
export function retainMediaPreloadIds(ids: Iterable<string>): void {
  for (const id of ids) stickyRetainIds.add(id);
  for (const id of stickyRetainIds) retainedIds.add(id);
}

export function releaseMediaPreloadIds(ids?: Iterable<string>): void {
  if (!ids) {
    stickyRetainIds.clear();
    return;
  }
  for (const id of ids) stickyRetainIds.delete(id);
}

/** Drop everything (leave session / reset). */
export function clearMediaPreloadCache(): void {
  preloadGen += 1;
  retainedIds = new Set();
  stickyRetainIds = new Set();
  jobItems = [];
  fileMeta.clear();
  for (const id of [...cache.keys()]) {
    const entry = cache.get(id);
    if (entry?.blobUrl) URL.revokeObjectURL(entry.blobUrl);
    cache.delete(id);
  }
  lastStatus = {
    active: false,
    total: 0,
    ready: 0,
    failed: 0,
    done: 0,
    percent: 0,
  };
  for (const fn of statusListeners) fn(lastStatus);
  emitDetail(false, true);
}

/** Drop entries not in the new playlist; retain the rest (+ sticky pins). */
export function syncPreloadCacheToPlaylist(items: MediaItem[]): void {
  retainedIds = new Set([
    ...items.map((i) => i.id),
    ...stickyRetainIds,
  ]);
  for (const id of [...cache.keys()]) {
    if (!retainedIds.has(id)) {
      const entry = cache.get(id);
      if (entry?.blobUrl) URL.revokeObjectURL(entry.blobUrl);
      cache.delete(id);
    }
  }
}

export function formatBytesPerSec(bps: number | null | undefined): string {
  if (bps == null || !Number.isFinite(bps) || bps <= 0) return "—";
  if (bps >= 1024 * 1024) return `${(bps / (1024 * 1024)).toFixed(1)} MB/s`;
  if (bps >= 1024) return `${Math.round(bps / 1024)} KB/s`;
  return `${Math.round(bps)} B/s`;
}

export function formatByteSize(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n) || n < 0) return "—";
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${Math.round(n)} B`;
}
