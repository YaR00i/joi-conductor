import { useEffect, useRef, useState } from "react";

export type FavoriteSaveKind = "save" | "remove" | "cache";

export type FavoriteSaveMediaKind = "image" | "video" | "gif" | "gallery";

export type FavoriteSaveItemPhase = "queued" | "loading" | "ready" | "error";

export type FavoriteSaveGroup = {
  id: string;
  label: string;
};

export type FavoriteSaveProgress = {
  percent: number | null;
  loadedBytes?: number;
  totalBytes?: number | null;
};

export type FavoriteSaveJob = {
  id: string;
  kind: FavoriteSaveKind;
  mediaKind?: FavoriteSaveMediaKind;
  publicId?: string;
  detail?: string;
  group?: FavoriteSaveGroup;
  run: (report: (progress: FavoriteSaveProgress) => void) => Promise<void>;
};

export type FavoriteSaveToastState = {
  status: "live" | "done" | "error";
  kicker: string;
  text: string;
};

export type FavoriteSaveItem = {
  id: string;
  order: number;
  kind: FavoriteSaveKind;
  label: string;
  detail: string | null;
  phase: FavoriteSaveItemPhase;
  errorDetail: string | null;
  groupId: string | null;
  groupLabel: string | null;
  percent?: number | null;
  loadedBytes?: number;
  totalBytes?: number | null;
};

export type FavoriteSaveHold = {
  startedAt: number;
  durationMs: number;
  generation: number;
};

export type FavoriteSaveSnapshot = {
  busyIds: ReadonlySet<string>;
  pending: number;
  batch: number;
  ready: number;
  failed: number;
  toast: FavoriteSaveToastState | null;
  items: readonly FavoriteSaveItem[];
  hold: FavoriteSaveHold | null;
};

const EMPTY_BUSY: ReadonlySet<string> = new Set();

export const EMPTY_FAVORITE_SAVE_SNAPSHOT: FavoriteSaveSnapshot = {
  busyIds: EMPTY_BUSY,
  pending: 0,
  batch: 0,
  ready: 0,
  failed: 0,
  toast: null,
  items: [],
  hold: null,
};

export function favoriteSaveMediaKindRu(
  kind: FavoriteSaveMediaKind,
): string {
  switch (kind) {
    case "video":
      return "видео";
    case "gif":
      return "gif";
    case "gallery":
      return "галерея";
    case "image":
      return "фото";
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

/** Nhentai API + unfavorite stay serial; Gelbooru file jobs may overlap. */
export const FAVORITE_SAVE_DOWNLOAD_CONCURRENCY = 2;

export function favoriteSaveJobExclusive(job: FavoriteSaveJob): boolean {
  return job.kind === "remove" || job.mediaKind === "gallery";
}

export function formatFavoriteSaveItemLabel(input: {
  order: number;
  mediaKind: FavoriteSaveMediaKind;
  publicId: string;
}): string {
  const id = input.publicId.trim() || "—";
  return `#${input.order} · ${favoriteSaveMediaKindRu(input.mediaKind)} · ${id}`;
}

export function favoriteSaveItemPhaseRu(
  phase: FavoriteSaveItemPhase,
): string {
  switch (phase) {
    case "queued":
      return "очередь";
    case "loading":
      return "качаю";
    case "ready":
      return "готово";
    case "error":
      return "ошибка";
    default: {
      const _exhaustive: never = phase;
      return _exhaustive;
    }
  }
}

export function favoriteSaveItemPhaseLabel(item: FavoriteSaveItem): string {
  if (item.phase === "loading" && item.percent != null) {
    return `${Math.max(0, Math.min(100, Math.round(item.percent)))}%`;
  }
  return favoriteSaveItemPhaseRu(item.phase);
}

export function favoriteSaveItemFill(item: FavoriteSaveItem): number {
  switch (item.phase) {
    case "ready":
      return 100;
    case "error":
      return 100;
    case "loading":
      if (item.percent != null) {
        return Math.max(4, Math.min(99, Math.round(item.percent)));
      }
      return (item.loadedBytes ?? 0) > 0 ? 12 : 4;
    case "queued":
      return 0;
    default: {
      const _exhaustive: never = item.phase;
      return _exhaustive;
    }
  }
}

export function favoriteSaveLiveBarWidth(
  items: readonly FavoriteSaveItem[],
  doneCount: number,
  total: number,
): number {
  const cap = Math.max(1, total);
  const loading = items.find((row) => row.phase === "loading");
  const frac =
    loading?.percent != null
      ? Math.max(0, Math.min(100, loading.percent)) / 100
      : 0;
  return Math.max(
    0,
    Math.min(100, Math.round(((doneCount + frac) / cap) * 100)),
  );
}

function formatSaveBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "";
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} МБ`;
  if (n >= 1024) return `${Math.round(n / 1024)} КБ`;
  return `${Math.round(n)} Б`;
}

export function favoriteSaveItemDetail(item: FavoriteSaveItem): string {
  const status = favoriteSaveItemStatusDetail(item);
  const extra = item.detail?.trim();
  if (item.phase === "error" || item.phase === "queued" || item.phase === "ready") {
    if (item.phase === "error" || !extra) return status;
    return `${status} · ${extra}`;
  }
  const parts: string[] = [];
  if (item.percent != null) {
    parts.push(`${Math.max(0, Math.min(100, Math.round(item.percent)))}%`);
  }
  if ((item.loadedBytes ?? 0) > 0) {
    const loaded = formatSaveBytes(item.loadedBytes ?? 0);
    const total =
      item.totalBytes != null && item.totalBytes > 0
        ? formatSaveBytes(item.totalBytes)
        : "";
    parts.push(total ? `${loaded} / ${total}` : loaded);
  }
  parts.push(status);
  if (extra) parts.push(extra);
  return parts.join(" · ");
}

function favoriteSaveItemStatusDetail(item: FavoriteSaveItem): string {
  switch (item.phase) {
    case "queued":
      return "ожидает";
    case "loading":
      switch (item.kind) {
        case "remove":
          return "убираю с полки";
        case "save":
          return "пишу на полку";
        case "cache":
          return "качаю в кэш";
        default: {
          const _never: never = item.kind;
          return _never;
        }
      }
    case "ready":
      switch (item.kind) {
        case "remove":
          return "убрано";
        case "save":
          return "сохранено";
        case "cache":
          return "скачано";
        default: {
          const _never: never = item.kind;
          return _never;
        }
      }
    case "error":
      if (item.errorDetail?.trim()) return item.errorDetail.trim();
      return item.kind === "cache"
        ? "не удалось скачать"
        : "не удалось сохранить";
    default: {
      const _exhaustive: never = item.phase;
      return _exhaustive;
    }
  }
}

export type FavoriteSaveItemGroup = {
  id: string;
  label: string;
  items: FavoriteSaveItem[];
};

export function favoriteSaveGroupCount(
  items: readonly FavoriteSaveItem[],
): number {
  const ids = new Set<string>();
  for (const item of items) {
    const id = item.groupId?.trim();
    if (id) ids.add(id);
  }
  return ids.size;
}

export function favoriteSaveListsRu(count: number): string {
  const n = Math.max(0, Math.floor(count));
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n} список`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return `${n} списка`;
  }
  return `${n} списков`;
}

export function groupFavoriteSaveItems(
  items: readonly FavoriteSaveItem[],
): FavoriteSaveItemGroup[] {
  const groups: FavoriteSaveItemGroup[] = [];
  const index = new Map<string, FavoriteSaveItemGroup>();
  for (const item of items) {
    const id = item.groupId?.trim() || "";
    let group = index.get(id);
    if (!group) {
      group = {
        id,
        label: item.groupLabel?.trim() || (id ? id : "Полка"),
        items: [],
      };
      index.set(id, group);
      groups.push(group);
    }
    group.items.push(item);
  }
  return groups;
}

export function listDownloadJobId(itemId: string): string {
  return `dl:${itemId}`;
}

export function formatFavoriteSaveToast(input: {
  phase: "live" | "done";
  kind: FavoriteSaveKind | null;
  batch: number;
  current: number;
  savedOk: number;
  removedOk: number;
  cachedOk: number;
  failed: number;
  error: string | null;
  groupCount?: number;
}): FavoriteSaveToastState | null {
  if (input.phase === "live") {
    const batch = Math.max(1, input.batch);
    const current = Math.min(batch, Math.max(1, input.current));
    const groups = Math.max(0, input.groupCount ?? 0);
    if (input.kind === "cache") {
      if (batch > 1) {
        return {
          status: "live",
          kicker: "Кэш",
          text:
            groups > 1
              ? `${favoriteSaveListsRu(groups)} · ${current} / ${batch}`
              : `Качаю ${current} / ${batch}`,
        };
      }
      return { status: "live", kicker: "Кэш", text: "Качаю…" };
    }
    if (batch > 1) {
      const head =
        groups > 1
          ? `${favoriteSaveListsRu(groups)} · ${current} / ${batch}`
          : input.kind === "remove"
            ? `Убираю ${current} / ${batch}`
            : `Сохранение ${current} / ${batch}`;
      return {
        status: "live",
        kicker: "Очередь",
        text: head,
      };
    }
    return {
      status: "live",
      kicker: input.kind === "remove" ? "Полка" : "Сохранение",
      text:
        input.kind === "remove"
          ? "Убираю из избранного…"
          : "Сохранение…",
    };
  }

  const cachedText =
    input.cachedOk <= 0
      ? ""
      : input.cachedOk === 1
        ? "Скачано"
        : `Скачано · ${input.cachedOk}`;
  const savedText =
    input.savedOk <= 0
      ? ""
      : input.savedOk === 1
        ? "Успешно сохранено"
        : `Успешно сохранено · ${input.savedOk}`;
  const removedText =
    input.removedOk <= 0
      ? ""
      : input.removedOk === 1
        ? "Убрано из избранного"
        : `Убрано · ${input.removedOk}`;
  const okText = [cachedText, savedText, removedText]
    .filter(Boolean)
    .join(" · ");

  if (input.failed > 0 && input.savedOk + input.removedOk + input.cachedOk === 0) {
    return {
      status: "error",
      kicker: "Ошибка",
      text:
        input.error?.trim() ||
        (input.kind === "cache" ? "Не удалось скачать" : "Не удалось сохранить"),
    };
  }
  if (input.failed > 0) {
    return {
      status: "error",
      kicker: "Ошибка",
      text: okText
        ? `${okText} · ${input.failed} не удалось`
        : input.error?.trim() || "Не удалось сохранить",
    };
  }
  if (!okText) return null;
  return { status: "done", kicker: "Готово", text: okText };
}

function errorMessage(err: unknown): string {
  return err instanceof Error && err.message.trim()
    ? err.message
    : "Не удалось сохранить";
}

type TimeoutId = ReturnType<typeof setTimeout>;

type QueueTimers = {
  setTimeout: (fn: () => void, ms: number) => TimeoutId;
  clearTimeout: (id: TimeoutId) => void;
};

/** Call through wrappers — `{ setTimeout }` then `timers.setTimeout()` is an illegal invocation in the browser. */
function defaultQueueTimers(): QueueTimers {
  return {
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (id) => {
      clearTimeout(id);
    },
  };
}

export type FavoriteSaveQueue = {
  enqueue(job: FavoriteSaveJob): boolean;
  enqueueMany(jobs: readonly FavoriteSaveJob[]): number;
  isBusy(id: string): boolean;
  snapshot(): FavoriteSaveSnapshot;
  flush(): Promise<void>;
  setHoldPaused(paused: boolean): void;
  dismissToast(): void;
  dispose(): void;
};

export function createFavoriteSaveQueue(opts?: {
  onChange?: (snap: FavoriteSaveSnapshot) => void;
  onIdle?: () => void;
  doneHoldMs?: number;
  timers?: QueueTimers;
}): FavoriteSaveQueue {
  const doneHoldMs = opts?.doneHoldMs ?? 2800;
  const timers = opts?.timers ?? defaultQueueTimers();
  const jobs: FavoriteSaveJob[] = [];
  const items: FavoriteSaveItem[] = [];
  const busyIds = new Set<string>();
  const runningIds = new Set<string>();
  const runningExclusive = new Set<string>();
  const inflight = new Set<Promise<void>>();
  let pumping = false;
  let disposed = false;
  let holdPaused = false;
  let batch = 0;
  let savedOk = 0;
  let removedOk = 0;
  let cachedOk = 0;
  let failed = 0;
  let lastError: string | null = null;
  let toast: FavoriteSaveToastState | null = null;
  let holdTimer: TimeoutId | null = null;
  let holdStartedAt = 0;
  let holdGeneration = 0;
  let pumpTail = Promise.resolve();

  function emit(): void {
    opts?.onChange?.(snapshot());
  }

  function clearHold(): void {
    if (holdTimer == null) return;
    timers.clearTimeout(holdTimer);
    holdTimer = null;
  }

  function clearHoldState(): void {
    clearHold();
    holdStartedAt = 0;
  }

  function resetBatch(): void {
    batch = 0;
    savedOk = 0;
    removedOk = 0;
    cachedOk = 0;
    failed = 0;
    lastError = null;
    items.length = 0;
  }

  function currentHold(): FavoriteSaveHold | null {
    if (!toast || toast.status === "live" || holdStartedAt <= 0) return null;
    return {
      startedAt: holdStartedAt,
      durationMs: doneHoldMs,
      generation: holdGeneration,
    };
  }

  function snapshot(): FavoriteSaveSnapshot {
    return {
      busyIds: new Set(busyIds),
      pending: jobs.length + runningIds.size,
      batch,
      ready: savedOk + removedOk + cachedOk,
      failed,
      toast,
      items: items.map((row) => ({ ...row })),
      hold: currentHold(),
    };
  }

  function liveCurrent(): number {
    return Math.max(
      1,
      savedOk + removedOk + cachedOk + failed + runningIds.size,
    );
  }

  function liveToast(kind: FavoriteSaveKind): FavoriteSaveToastState | null {
    return formatFavoriteSaveToast({
      phase: "live",
      kind,
      batch,
      current: liveCurrent(),
      savedOk,
      removedOk,
      cachedOk,
      failed,
      error: lastError,
      groupCount: favoriteSaveGroupCount(items),
    });
  }

  function finishToast(): FavoriteSaveToastState | null {
    const hadCache = items.some((row) => row.kind === "cache");
    const hadShelf = items.some(
      (row) => row.kind === "save" || row.kind === "remove",
    );
    const kind: FavoriteSaveKind | null = hadCache && !hadShelf
      ? "cache"
      : hadShelf && !hadCache
        ? "save"
        : null;
    return formatFavoriteSaveToast({
      phase: "done",
      kind,
      batch,
      current: batch,
      savedOk,
      removedOk,
      cachedOk,
      failed,
      error: lastError,
    });
  }

  function patchItem(
    id: string,
    patch: Partial<
      Pick<
        FavoriteSaveItem,
        "phase" | "errorDetail" | "percent" | "loadedBytes" | "totalBytes"
      >
    >,
  ): void {
    const row = items.find((item) => item.id === id);
    if (!row) return;
    if (patch.phase) row.phase = patch.phase;
    if (patch.errorDetail !== undefined) row.errorDetail = patch.errorDetail;
    if (patch.percent !== undefined) row.percent = patch.percent;
    if (patch.loadedBytes !== undefined) row.loadedBytes = patch.loadedBytes;
    if (patch.totalBytes !== undefined) row.totalBytes = patch.totalBytes;
  }

  function scheduleHold(): void {
    clearHoldState();
    if (holdPaused) return;
    if (doneHoldMs <= 0) {
      toast = null;
      resetBatch();
      emit();
      return;
    }
    holdGeneration += 1;
    holdStartedAt = Date.now();
    holdTimer = timers.setTimeout(() => {
      holdTimer = null;
      if (disposed || holdPaused || jobs.length > 0 || runningIds.size > 0) return;
      toast = null;
      holdStartedAt = 0;
      resetBatch();
      emit();
    }, doneHoldMs);
    emit();
  }

  function dismissToast(): void {
    if (disposed) return;
    if (jobs.length > 0 || runningIds.size > 0) return;
    clearHoldState();
    toast = null;
    resetBatch();
    emit();
  }

  function setHoldPaused(paused: boolean): void {
    if (disposed) return;
    if (holdPaused === paused) return;
    holdPaused = paused;
    if (paused) {
      clearHold();
      return;
    }
    if (toast && toast.status !== "live" && jobs.length === 0 && runningIds.size === 0) {
      scheduleHold();
    }
  }

  function canStart(job: FavoriteSaveJob): boolean {
    if (disposed) return false;
    if (runningExclusive.size > 0) return false;
    if (favoriteSaveJobExclusive(job)) return runningIds.size === 0;
    return runningIds.size < FAVORITE_SAVE_DOWNLOAD_CONCURRENCY;
  }

  async function runOne(job: FavoriteSaveJob): Promise<void> {
    if (disposed) return;
    let lastProgressAt = 0;
    patchItem(job.id, {
      phase: "loading",
      percent: null,
      loadedBytes: 0,
      totalBytes: null,
    });
    toast = liveToast(job.kind);
    emit();
    try {
      await job.run((progress) => {
        if (disposed) return;
        const row = items.find((item) => item.id === job.id);
        if (!row || row.phase !== "loading") return;
        const pct =
          progress.percent == null
            ? null
            : Math.max(0, Math.min(99, Math.round(progress.percent)));
        const loaded = progress.loadedBytes ?? row.loadedBytes ?? 0;
        const total =
          progress.totalBytes === undefined
            ? (row.totalBytes ?? null)
            : progress.totalBytes;
        const pctChanged = row.percent !== pct;
        const now = Date.now();
        row.percent = pct;
        row.loadedBytes = loaded;
        row.totalBytes = total;
        if (!pctChanged && now - lastProgressAt < 150) return;
        lastProgressAt = now;
        emit();
      });
      if (disposed) return;
      if (job.kind === "save") savedOk += 1;
      else if (job.kind === "remove") removedOk += 1;
      else if (job.kind === "cache") cachedOk += 1;
      else {
        const _never: never = job.kind;
        void _never;
      }
      patchItem(job.id, {
        phase: "ready",
        percent: 100,
      });
    } catch (err) {
      if (disposed) return;
      failed += 1;
      lastError = errorMessage(err);
      patchItem(job.id, { phase: "error", errorDetail: lastError });
    } finally {
      busyIds.delete(job.id);
    }
  }

  function startJob(job: FavoriteSaveJob): void {
    runningIds.add(job.id);
    if (favoriteSaveJobExclusive(job)) runningExclusive.add(job.id);
    let p: Promise<void>;
    p = runOne(job).finally(() => {
      runningIds.delete(job.id);
      runningExclusive.delete(job.id);
      inflight.delete(p);
    });
    inflight.add(p);
  }

  function fillSlots(): void {
    while (jobs.length > 0 && !disposed) {
      const next = jobs[0]!;
      if (!canStart(next)) break;
      startJob(jobs.shift()!);
    }
  }

  function kickPump(): void {
    fillSlots();
    if (!pumping && (jobs.length > 0 || runningIds.size > 0)) {
      pumping = true;
      pumpTail = pumpLoop();
    }
  }

  async function pumpLoop(): Promise<void> {
    try {
      while (!disposed && (jobs.length > 0 || runningIds.size > 0)) {
        fillSlots();
        if (inflight.size === 0) break;
        await Promise.race([...inflight]);
      }
      if (disposed || jobs.length > 0 || runningIds.size > 0) return;
      toast = finishToast();
      emit();
      opts?.onIdle?.();
      scheduleHold();
    } finally {
      if (!disposed && (jobs.length > 0 || runningIds.size > 0)) {
        pumpTail = pumpLoop();
        await pumpTail;
      } else {
        pumping = false;
      }
    }
  }

  function enqueue(job: FavoriteSaveJob): boolean {
    if (disposed) return false;
    if (busyIds.has(job.id)) return false;
    clearHoldState();
    if (!pumping && jobs.length === 0 && runningIds.size === 0) {
      resetBatch();
    }
    jobs.push(job);
    busyIds.add(job.id);
    batch += 1;
    items.push({
      id: job.id,
      order: batch,
      kind: job.kind,
      label: formatFavoriteSaveItemLabel({
        order: batch,
        mediaKind: job.mediaKind ?? "image",
        publicId: job.publicId?.trim() || job.id,
      }),
      detail: job.detail?.trim() || null,
      phase: runningIds.size > 0 || pumping ? "queued" : "loading",
      errorDetail: null,
      groupId: job.group?.id.trim() || null,
      groupLabel: job.group?.label.trim() || null,
      percent: null,
      loadedBytes: 0,
      totalBytes: null,
    });
    toast = liveToast(job.kind);
    emit();
    kickPump();
    return true;
  }

  function enqueueMany(next: readonly FavoriteSaveJob[]): number {
    let added = 0;
    for (const job of next) {
      if (enqueue(job)) added += 1;
    }
    return added;
  }

  function isBusy(id: string): boolean {
    return busyIds.has(id);
  }

  function dispose(): void {
    disposed = true;
    jobs.length = 0;
    items.length = 0;
    busyIds.clear();
    runningIds.clear();
    runningExclusive.clear();
    inflight.clear();
    clearHoldState();
  }

  function flush(): Promise<void> {
    return pumpTail.then(() => undefined);
  }

  return {
    enqueue,
    enqueueMany,
    isBusy,
    snapshot,
    flush,
    setHoldPaused,
    dismissToast,
    dispose,
  };
}

const idleListeners = new Set<() => void>();
const changeListeners = new Set<(snap: FavoriteSaveSnapshot) => void>();
let sharedQueue: FavoriteSaveQueue | null = null;

function emitSharedChange(snap: FavoriteSaveSnapshot): void {
  for (const listener of changeListeners) listener(snap);
}

function emitSharedIdle(): void {
  for (const listener of idleListeners) listener();
}

function getSharedFavoriteSaveQueue(): FavoriteSaveQueue {
  if (!sharedQueue) {
    sharedQueue = createFavoriteSaveQueue({
      onChange: emitSharedChange,
      onIdle: emitSharedIdle,
    });
  }
  return sharedQueue;
}

export function useFavoriteSaveQueue(opts?: {
  onIdle?: () => void;
}): {
  enqueue: (job: FavoriteSaveJob) => boolean;
  enqueueMany: (jobs: readonly FavoriteSaveJob[]) => number;
  isBusy: (id: string) => boolean;
  busyIds: ReadonlySet<string>;
  toast: FavoriteSaveToastState | null;
  items: readonly FavoriteSaveItem[];
  hold: FavoriteSaveHold | null;
  batch: number;
  ready: number;
  failed: number;
  pending: number;
  setHoldPaused: (paused: boolean) => void;
  dismissToast: () => void;
} {
  const [snap, setSnap] = useState<FavoriteSaveSnapshot>(() =>
    getSharedFavoriteSaveQueue().snapshot(),
  );
  const onIdleRef = useRef(opts?.onIdle);
  onIdleRef.current = opts?.onIdle;

  useEffect(() => {
    const onChange = (next: FavoriteSaveSnapshot) => setSnap(next);
    const onIdle = () => onIdleRef.current?.();
    changeListeners.add(onChange);
    idleListeners.add(onIdle);
    setSnap(getSharedFavoriteSaveQueue().snapshot());
    return () => {
      changeListeners.delete(onChange);
      idleListeners.delete(onIdle);
    };
  }, []);

  const queue = getSharedFavoriteSaveQueue();
  return {
    enqueue: (job) => queue.enqueue(job),
    enqueueMany: (jobs) => queue.enqueueMany(jobs),
    isBusy: (id) => queue.isBusy(id),
    busyIds: snap.busyIds,
    toast: snap.toast,
    items: snap.items,
    hold: snap.hold,
    batch: snap.batch,
    ready: snap.ready,
    failed: snap.failed,
    pending: snap.pending,
    setHoldPaused: (paused) => queue.setHoldPaused(paused),
    dismissToast: () => queue.dismissToast(),
  };
}
