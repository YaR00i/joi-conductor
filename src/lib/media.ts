export type MediaKind = "image" | "video" | "gif";

export type MediaSourceKind = "gelbooru" | "local" | "favorites";

/** Tag score row from an auto-tagger (WD14). */
export type MediaTagScore = { tag: string; score: number };

/** Where an item's tags came from — affects whether the tagger re-tags it. */
export type MediaTagSource = "filename" | "auto" | "manual";

export interface MediaItem {
  id: string;
  url: string;
  previewUrl?: string;
  kind: MediaKind;
  source: MediaSourceKind;
  /** Space-separated booru tags (prefer post tags, not the search query). */
  tags?: string;
  /** Stable Gelbooru post id when known */
  gelbooruId?: string;
  /** Per-tag confidence scores when produced by an auto-tagger. */
  tagScores?: MediaTagScore[];
  /** Origin of `tags` — controls re-tagging and UI hints. */
  tagSource?: MediaTagSource;
}

export interface MediaSettings {
  source: MediaSourceKind;
  /** Gelbooru / booru tags, space-separated */
  tags: string;
  /** Slide duration seconds */
  slideSec: number;
  /** Max posts to pull from booru */
  limit: number;
  /** Gelbooru API Access Credentials (account options) */
  gelbooruUserId: string;
  gelbooruApiKey: string;
  /** Session video element volume 0..1 */
  videoVolume: number;
  /** Beats / vibe hum / UI SFX volume 0..1 (shared metronome bus) */
  sfxVolume: number;
  /** Auto-tag locally-imported images via WD14 on import (default: on). */
  autoTagOnImport: boolean;
  /** WD14 Python server base URL. */
  wd14Url: string;
  /** WD14 general-tag threshold (0..1). */
  wd14Threshold: number;
  /**
   * Hub / session media-type filter (same ids as the roulette wheel:
   * photo, gifs, video, photo_gifs, all).
   */
  mediaTypeId: "photo" | "gifs" | "video" | "photo_gifs" | "all";
}

export const DEFAULT_MEDIA_SETTINGS: MediaSettings = {
  source: "gelbooru",
  tags: "rating:explicit 1girl",
  slideSec: 12,
  limit: 40,
  gelbooruUserId: "",
  gelbooruApiKey: "",
  videoVolume: 1,
  sfxVolume: 0.35,
  autoTagOnImport: true,
  wd14Url: "http://127.0.0.1:7878",
  wd14Threshold: 0.35,
  mediaTypeId: "all",
};

const SETTINGS_KEY = "joi-conductor-media-settings";
const PLAYLIST_KEY = "joi-conductor-media-playlist";

export function loadMediaSettings(): MediaSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_MEDIA_SETTINGS };
    const parsed = { ...DEFAULT_MEDIA_SETTINGS, ...(JSON.parse(raw) as MediaSettings) };
    if (
      parsed.source !== "gelbooru" &&
      parsed.source !== "local" &&
      parsed.source !== "favorites"
    ) {
      parsed.source = "gelbooru";
    }
    if (typeof parsed.videoVolume !== "number" || !Number.isFinite(parsed.videoVolume)) {
      parsed.videoVolume = DEFAULT_MEDIA_SETTINGS.videoVolume;
    } else {
      parsed.videoVolume = Math.min(1, Math.max(0, parsed.videoVolume));
    }
    if (typeof parsed.sfxVolume !== "number" || !Number.isFinite(parsed.sfxVolume)) {
      parsed.sfxVolume = DEFAULT_MEDIA_SETTINGS.sfxVolume;
    } else {
      parsed.sfxVolume = Math.min(1, Math.max(0, parsed.sfxVolume));
    }
    parsed.autoTagOnImport = parsed.autoTagOnImport !== false;
    if (typeof parsed.wd14Url !== "string" || !parsed.wd14Url.trim()) {
      parsed.wd14Url = DEFAULT_MEDIA_SETTINGS.wd14Url;
    }
    if (
      typeof parsed.wd14Threshold !== "number" ||
      !Number.isFinite(parsed.wd14Threshold)
    ) {
      parsed.wd14Threshold = DEFAULT_MEDIA_SETTINGS.wd14Threshold;
    } else {
      parsed.wd14Threshold = Math.min(0.95, Math.max(0.05, parsed.wd14Threshold));
    }
    const typeId = parsed.mediaTypeId;
    parsed.mediaTypeId =
      typeId === "photo" ||
      typeId === "gifs" ||
      typeId === "video" ||
      typeId === "photo_gifs" ||
      typeId === "all"
        ? typeId
        : "all";
    return parsed;
  } catch {
    return { ...DEFAULT_MEDIA_SETTINGS };
  }
}

export function saveMediaSettings(settings: MediaSettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

/** Persist Gelbooru playlist (stable URLs). Local blob URLs are skipped. */
export function saveMediaPlaylist(items: MediaItem[]): void {
  const persistable = items
    .filter((item) => item.source === "gelbooru" && Boolean(item.url))
    .map((item) => ({
      id: item.id,
      url: item.url,
      previewUrl: item.previewUrl,
      kind: item.kind,
      source: "gelbooru" as const,
      tags: item.tags,
      gelbooruId: item.gelbooruId,
    }));
  localStorage.setItem(PLAYLIST_KEY, JSON.stringify(persistable));
}

export function loadMediaPlaylist(): MediaItem[] {
  try {
    const raw = localStorage.getItem(PLAYLIST_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as MediaItem[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item) =>
          item &&
          typeof item.id === "string" &&
          typeof item.url === "string" &&
          item.source === "gelbooru",
      )
      .map((item) => {
        const fromId = /^gb-(\d+)(?:-\d+)?$/.exec(item.id)?.[1];
        const gelbooruId = item.gelbooruId?.trim() || fromId;
        return {
          ...item,
          gelbooruId,
          // Normalize legacy `gb-123-7` → `gb-123` when post id known
          id: gelbooruId ? `gb-${gelbooruId}` : item.id,
        };
      });
  } catch {
    return [];
  }
}

export function clearMediaPlaylist(): void {
  localStorage.removeItem(PLAYLIST_KEY);
}

/** Settings + optional Gelbooru playlist snapshot. */
export function saveMediaLibrary(
  settings: MediaSettings,
  items: MediaItem[],
): { savedSettings: true; playlistCount: number } {
  saveMediaSettings(settings);
  if (settings.source === "gelbooru") {
    saveMediaPlaylist(items);
    return {
      savedSettings: true,
      playlistCount: items.filter((i) => i.source === "gelbooru").length,
    };
  }
  // Local source: keep settings, do not overwrite booru cache with blobs
  return { savedSettings: true, playlistCount: 0 };
}

function guessKindFromName(url: string): MediaKind {
  const u = url.toLowerCase();
  if (u.includes(".mp4") || u.includes(".webm") || u.includes(".mkv")) {
    return "video";
  }
  if (u.includes(".gif")) return "gif";
  return "image";
}

/** File extension plus Gelbooru tags (`animated` vs `video`). */
export function inferMediaKind(url: string, tags?: string): MediaKind {
  const u = url.toLowerCase();
  const tagSet = new Set(
    (tags ?? "").toLowerCase().split(/\s+/).filter(Boolean),
  );
  const taggedVideo =
    tagSet.has("video") || tagSet.has("webm") || tagSet.has("mp4");
  const taggedAnimated =
    tagSet.has("animated") || tagSet.has("animated_gif");
  if (u.includes(".mp4") || u.includes(".mkv") || taggedVideo) return "video";
  if (u.includes(".gif") || taggedAnimated) return "gif";
  if (u.includes(".webm")) return "video";
  return guessKindFromName(url);
}

interface GelbooruPost {
  id?: number | string;
  file_url?: string;
  sample_url?: string;
  preview_url?: string;
  image?: string;
  directory?: string;
  /** Space-separated tags from Gelbooru */
  tags?: string;
}

/** Gelbooru default account limit: 10 requests / 1 second. */
const GELBOORU_MAX_REQ = 10;
const GELBOORU_WINDOW_MS = 1000;
const gelbooruRequestTimes: number[] = [];

/** Slow / blocked Gelbooru (no VPN): abort and retry a few times. */
const GELBOORU_FETCH_TIMEOUT_MS = 12_000;
const GELBOORU_FETCH_ATTEMPTS = 4;
const GELBOORU_RETRY_BASE_MS = 1_600;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isGelbooruNetworkFailure(err: unknown): boolean {
  if (err instanceof DOMException && err.name === "AbortError") return true;
  if (!(err instanceof Error)) return true;
  const m = err.message.toLowerCase();
  return (
    m.includes("abort") ||
    m.includes("timeout") ||
    m.includes("network") ||
    m.includes("failed to fetch") ||
    m.includes("fetch failed") ||
    m.includes("load failed")
  );
}

function gelbooruUnavailableMessage(lastErr: unknown): string {
  const detail =
    lastErr instanceof Error && lastErr.message
      ? ` (${lastErr.message.slice(0, 120)})`
      : "";
  return `Gelbooru недоступен после ${GELBOORU_FETCH_ATTEMPTS} попыток${detail}. Включи VPN и повтори.`;
}

/**
 * fetch via Vite proxy with timeout + retries (VPN / flaky route).
 * Does not retry hard auth failures (401).
 */
async function fetchGelbooruResilient(url: string): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < GELBOORU_FETCH_ATTEMPTS; attempt++) {
    if (attempt > 0) await awaitGelbooruSlot();
    const ctrl = new AbortController();
    const timer = window.setTimeout(
      () => ctrl.abort(),
      GELBOORU_FETCH_TIMEOUT_MS,
    );
    try {
      const res = await fetch(url, { signal: ctrl.signal });
      window.clearTimeout(timer);
      if (res.ok || res.status === 401) return res;
      // Rate limit / gateway — wait and retry
      if (res.status === 429 || res.status >= 500) {
        lastErr = new Error(`HTTP ${res.status}`);
        await sleep(GELBOORU_RETRY_BASE_MS * (attempt + 1));
        continue;
      }
      return res;
    } catch (err) {
      window.clearTimeout(timer);
      lastErr = err;
      if (!isGelbooruNetworkFailure(err)) throw err;
      // Give the user time to flip VPN on
      await sleep(
        GELBOORU_RETRY_BASE_MS * (attempt + 1) + Math.floor(Math.random() * 500),
      );
    }
  }
  throw new Error(gelbooruUnavailableMessage(lastErr));
}

/** Wait so we never exceed 10 req / 1s (sliding window). */
async function awaitGelbooruSlot(): Promise<void> {
  for (;;) {
    const now = Date.now();
    while (
      gelbooruRequestTimes.length > 0 &&
      now - gelbooruRequestTimes[0]! >= GELBOORU_WINDOW_MS
    ) {
      gelbooruRequestTimes.shift();
    }
    if (gelbooruRequestTimes.length < GELBOORU_MAX_REQ) {
      gelbooruRequestTimes.push(Date.now());
      return;
    }
    const oldest = gelbooruRequestTimes[0]!;
    const waitMs = GELBOORU_WINDOW_MS - (now - oldest) + 5;
    await sleep(Math.max(5, waitMs));
  }
}

export type GelbooruTagSuggest = {
  /** Booru token to insert (underscored) */
  value: string;
  /** Display label (spaces ok) */
  label: string;
  postCount?: number;
  category?: string;
  /** From local favorites library */
  fromFavorites?: boolean;
};

/**
 * Gelbooru site-style autocomplete (`autocomplete2`), via Vite proxy.
 * No API key required (same as the website search box).
 */
export async function fetchGelbooruTagAutocomplete(
  term: string,
  limit = 12,
): Promise<GelbooruTagSuggest[]> {
  const q = term.trim().toLowerCase();
  if (q.length < 1) return [];

  await awaitGelbooruSlot();

  const params = new URLSearchParams({
    page: "autocomplete2",
    type: "tag_query",
    term: q,
    limit: String(Math.min(20, Math.max(1, limit))),
  });

  const res = await fetchGelbooruResilient(
    `/api/gelbooru?${params.toString()}`,
  );
  if (!res.ok) {
    throw new Error(`Gelbooru autocomplete HTTP ${res.status}`);
  }

  const data: unknown = await res.json();
  if (!Array.isArray(data)) return [];

  const out: GelbooruTagSuggest[] = [];
  for (const row of data) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const value =
      typeof r.value === "string"
        ? r.value.trim()
        : typeof r.label === "string"
          ? r.label.trim().replace(/\s+/g, "_")
          : "";
    if (!value) continue;
    const label =
      typeof r.label === "string" && r.label.trim()
        ? r.label.trim()
        : value.replace(/_/g, " ");
    const countRaw = r.post_count ?? r.count;
    const postCount =
      typeof countRaw === "number"
        ? countRaw
        : typeof countRaw === "string"
          ? Number(countRaw)
          : undefined;
    out.push({
      value,
      label,
      postCount: Number.isFinite(postCount) ? postCount : undefined,
      category: typeof r.category === "string" ? r.category : undefined,
    });
  }
  return out;
}

/** Fetch posts via Vite proxy. Requires api_key + user_id on every query. */
export async function fetchGelbooru(
  tags: string,
  limit = 40,
  credentials?: { userId: string; apiKey: string },
  opts?: { pid?: number },
): Promise<MediaItem[]> {
  const userId = credentials?.userId?.trim() ?? "";
  const apiKey = credentials?.apiKey?.trim() ?? "";

  if (!userId || !apiKey) {
    throw new Error(
      "Нужны Gelbooru user_id и api_key (Account → Options → API Access Credentials)",
    );
  }

  // One page is enough for ≤100 posts; still rate-limit for double-clicks / future paging.
  await awaitGelbooruSlot();

  const params = new URLSearchParams({
    page: "dapi",
    s: "post",
    q: "index",
    json: "1",
    limit: String(Math.min(100, Math.max(1, limit))),
    tags: tags.trim() || "rating:explicit",
    user_id: userId,
    api_key: apiKey,
  });
  const pid = opts?.pid;
  if (pid != null && pid > 0) {
    params.set("pid", String(Math.floor(pid)));
  }

  const res = await fetchGelbooruResilient(
    `/api/gelbooru?${params.toString()}`,
  );
  if (res.status === 401) {
    throw new Error(
      "Gelbooru 401 — проверь user_id и api_key (оба обязательны в каждом запросе)",
    );
  }
  if (res.status === 429) {
    throw new Error(
      "Gelbooru 429 — лимит 10 запросов/сек. Подожди секунду и повтори.",
    );
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Gelbooru HTTP ${res.status}${body ? `: ${body.slice(0, 160)}` : ""}`,
    );
  }

  const data: unknown = await res.json();
  const posts = normalizeGelbooruPosts(data);

  const items: MediaItem[] = [];
  for (let i = 0; i < posts.length; i++) {
    const p = posts[i]!;
    const url = p.file_url || p.sample_url || "";
    if (!url) continue;
    const gelbooruId =
      p.id != null && String(p.id).trim() !== "" ? String(p.id) : undefined;
    const postTags = (p.tags && p.tags.trim()) || tags;
    items.push({
      id: gelbooruId ? `gb-${gelbooruId}` : `gb-url-${simpleHash(url)}`,
      url,
      previewUrl: p.preview_url || p.sample_url || url,
      kind: inferMediaKind(url, p.tags),
      source: "gelbooru",
      // Prefer post tags from API (booru-style); fall back to search query
      tags: postTags,
      gelbooruId,
    });
  }
  return items;
}

function simpleHash(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

/** Gelbooru returns `post` as array, single object, or top-level array. */
function normalizeGelbooruPosts(data: unknown): GelbooruPost[] {
  if (Array.isArray(data)) return data as GelbooruPost[];
  if (!data || typeof data !== "object") return [];
  const post = (data as { post?: GelbooruPost | GelbooruPost[] }).post;
  if (Array.isArray(post)) return post;
  if (post && typeof post === "object") return [post];
  return [];
}

const PERSON_TAGS = new Set([
  "1girl",
  "1boy",
  "2girls",
  "3girls",
  "multiple_girls",
  "group",
  "trap",
  "otoko_no_ko",
  "crossdressing",
  "futanari",
  "sissy",
  "yuri",
  "femboy",
]);

/**
 * Build increasingly loose Gelbooru queries.
 * Prefers `sort:random:SEED` so repeats of the same tag don't always pull
 * the newest page of identical posts.
 */
export function buildGelbooruQueryLadder(
  raw: string,
  opts?: { seed?: number },
): string[] {
  const seed =
    opts?.seed ?? Math.floor(Math.random() * 10_001);
  const randomSort = `sort:random:${seed}`;

  const tokens = raw.trim().split(/\s+/).filter(Boolean);
  const rating =
    tokens.find((t) => t.startsWith("rating:")) ?? "rating:explicit";
  const positives = tokens.filter(
    (t) =>
      !t.startsWith("-") &&
      !t.startsWith("rating:") &&
      !t.startsWith("sort:random"),
  );

  const personBits = positives.filter((t) => PERSON_TAGS.has(t));
  const content = positives.filter((t) => !PERSON_TAGS.has(t));

  let personClause = "";
  if (personBits.includes("futanari")) {
    personClause = "futanari";
  } else if (personBits.includes("yuri")) {
    personClause = "2girls yuri";
  } else if (
    personBits.includes("2girls") ||
    personBits.includes("3girls") ||
    personBits.includes("multiple_girls") ||
    personBits.includes("group")
  ) {
    personClause = "2girls";
  } else if (personBits.includes("femboy")) {
    personClause = "1boy femboy";
  } else if (
    personBits.includes("crossdressing") ||
    personBits.includes("sissy")
  ) {
    personClause = "1boy crossdressing";
  } else if (personBits.includes("1boy") || personBits.includes("trap")) {
    personClause = personBits.includes("trap")
      ? "1boy trap"
      : personBits
          .filter((t) => t === "1boy" || t === "otoko_no_ko")
          .join(" ") || "1boy";
  } else if (personBits.includes("1girl")) {
    personClause = "1girl";
  }

  const ladder: string[] = [];
  const push = (parts: string[]) => {
    const q = parts.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
    if (q && !ladder.includes(q)) ladder.push(q);
  };

  const noExcludes = tokens.filter(
    (t) => !t.startsWith("-") && !t.startsWith("sort:random"),
  );
  const exactPositives = tokens.filter((t) => !t.startsWith("sort:random"));

  // Prefer random order first — otherwise the same tag always hits newest posts.
  if (exactPositives.length) {
    push([...exactPositives.filter((t) => !t.startsWith("-")), randomSort]);
    push([...noExcludes, randomSort]);
  }

  const primary = content[0];
  if (primary) {
    for (let n = Math.min(content.length, 3); n >= 1; n--) {
      push([rating, personClause, ...content.slice(0, n), randomSort]);
    }
    push([personClause, primary, randomSort]);
    push([rating, primary, randomSort]);
  }

  if (personClause) {
    push([rating, personClause, randomSort]);
  }
  push([rating, randomSort]);

  // Non-random fallbacks last (newest-first) if random meta fails.
  if (exactPositives.length) push(exactPositives);
  if (noExcludes.length) push(noExcludes);
  if (primary) {
    push([rating, personClause, primary]);
    push([rating, primary]);
  }
  if (personClause) push([rating, personClause]);
  push([rating]);

  return ladder;
}

/** Ensure tags include a fresh random sort seed (Gelbooru `sort:random:N`). */
export function withGelbooruRandomSort(
  tags: string,
  seed = Math.floor(Math.random() * 10_001),
): string {
  const cleaned = tags
    .trim()
    .split(/\s+/)
    .filter((t) => t && !t.startsWith("sort:random"));
  return [...cleaned, `sort:random:${seed}`].join(" ");
}

/** Excludes from the original query, applied after fetch when omitted from API. */
export function extractExcludeTags(raw: string): string[] {
  return raw
    .trim()
    .split(/\s+/)
    .filter((t) => t.startsWith("-") && t.length > 1)
    .map((t) => t.slice(1).toLowerCase());
}

export function filterMediaByExcludes(
  items: MediaItem[],
  excludes: string[],
): MediaItem[] {
  if (excludes.length === 0) return items;
  return items.filter((item) => {
    const tagStr = (item.tags ?? "").toLowerCase();
    if (!tagStr.trim()) return true;
    const set = new Set(tagStr.split(/\s+/));
    return !excludes.some((ex) => set.has(ex));
  });
}

/** Keep posts matching preferred kinds; empty kinds = no filter. */
export function filterMediaByKinds(
  items: MediaItem[],
  kinds: MediaKind[],
): MediaItem[] {
  if (!kinds.length) return items;
  const allow = new Set(kinds);
  return items.filter((item) => allow.has(item.kind));
}

export type GelbooruFlexibleResult = {
  items: MediaItem[];
  /** Tags that actually returned posts */
  usedTags: string;
  attempted: string[];
};

/**
 * Try full tags, then simpler fallbacks until Gelbooru returns posts.
 * Soft excludes from the original string are applied client-side when possible.
 */
export async function fetchGelbooruFlexible(
  tags: string,
  limit = 40,
  credentials?: { userId: string; apiKey: string },
  opts?: { random?: boolean; pid?: number },
): Promise<GelbooruFlexibleResult> {
  const wantRandom = opts?.random !== false;
  const seed = Math.floor(Math.random() * 10_001);
  const attempted = wantRandom
    ? buildGelbooruQueryLadder(tags, { seed })
    : buildGelbooruQueryLadder(tags, { seed }).map((q) =>
        q
          .split(/\s+/)
          .filter((t) => !t.startsWith("sort:random"))
          .join(" "),
      );
  const excludes = extractExcludeTags(tags);
  // Over-fetch a bit so client-side excludes still leave enough slides
  const fetchLimit = Math.min(
    100,
    Math.max(limit, excludes.length > 0 ? Math.ceil(limit * 1.5) : limit),
  );

  // Random page offset adds variety when sort:random is ignored / identical.
  const pid =
    opts?.pid ??
    (wantRandom ? Math.floor(Math.random() * 12) : 0);

  for (const q of attempted) {
    if (!q.trim()) continue;
    const rawItems = await fetchGelbooru(q, fetchLimit, credentials, {
      pid: q.includes("sort:random") ? 0 : pid,
    });
    if (rawItems.length === 0) {
      // Rare-tag + high pid can miss — retry page 0 once for this query.
      if (pid > 0 && !q.includes("sort:random")) {
        const retry = await fetchGelbooru(q, fetchLimit, credentials, {
          pid: 0,
        });
        if (retry.length === 0) continue;
        const filteredRetry = filterMediaByExcludes(retry, excludes);
        const itemsRetry = (
          filteredRetry.length > 0 ? filteredRetry : retry
        ).slice(0, limit);
        if (itemsRetry.length > 0) {
          return {
            items: shuffleMediaItems(itemsRetry),
            usedTags: q,
            attempted,
          };
        }
      }
      continue;
    }

    const filtered = filterMediaByExcludes(rawItems, excludes);
    const items = (filtered.length > 0 ? filtered : rawItems).slice(0, limit);
    if (items.length > 0) {
      return {
        items: wantRandom ? shuffleMediaItems(items) : items,
        usedTags: q,
        attempted,
      };
    }
  }
  return { items: [], usedTags: tags.trim(), attempted };
}

/** Build playlist from FileList (folder picker / multi-select). */
export function mediaFromFiles(files: FileList | File[]): MediaItem[] {
  const list = filterMediaFiles(files);

  return list.map((file, i) => {
    const url = URL.createObjectURL(file);
    return {
      id: `local-${file.name}-${i}-${file.size}`,
      url,
      kind: guessKindFromName(file.name),
      source: "local" as const,
      tags: file.name,
      tagSource: "filename" as const,
    };
  });
}

/**
 * Same as mediaFromFiles but also returns the original File[] (aligned with the
 * returned items by index) so the WD14 tagger can re-read the image bytes.
 * The File references are only valid while the caller keeps them in memory.
 */
export function mediaFromFilesWithBlobs(
  files: FileList | File[],
): { items: MediaItem[]; files: File[] } {
  const list = filterMediaFiles(files);
  const items: MediaItem[] = list.map((file, i) => {
    const url = URL.createObjectURL(file);
    return {
      id: `local-${file.name}-${i}-${file.size}`,
      url,
      kind: guessKindFromName(file.name),
      source: "local" as const,
      tags: file.name,
      tagSource: "filename" as const,
    };
  });
  return { items, files: list };
}

function filterMediaFiles(files: FileList | File[]): File[] {
  return Array.from(files).filter(
    (f) =>
      /^(image|video)\//.test(f.type) ||
      /\.(gif|webm|mp4|png|jpe?g|webp)$/i.test(f.name),
  );
}

export function revokeLocalMedia(items: MediaItem[]): void {
  for (const item of items) {
    if (
      (item.source === "local" || item.source === "favorites") &&
      item.url.startsWith("blob:")
    ) {
      URL.revokeObjectURL(item.url);
    }
  }
}

/** Fisher–Yates shuffle (copy). Used for session play order — library order stays. */
export function shuffleMediaItems(items: MediaItem[]): MediaItem[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const a = out[i]!;
    out[i] = out[j]!;
    out[j] = a;
  }
  return out;
}

/**
 * Soft tag filter for quest caches: match any positive token from the query
 * against item.tags (or id/url as weak fallback). Skips rating:/meta operators.
 */
export function filterMediaByTags(
  items: MediaItem[],
  query: string,
): MediaItem[] {
  const tokens = positiveTagTokens(query);
  if (tokens.length === 0) return [];
  const seen = new Set<string>();
  const out: MediaItem[] = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    const hay = `${item.tags ?? ""} ${item.id} ${item.url}`.toLowerCase();
    if (
      tokens.some(
        (t) => hay.includes(t.replace(/_/g, " ")) || hay.includes(t),
      )
    ) {
      seen.add(item.id);
      out.push(item);
    }
  }
  return out;
}

/** Require every positive content token to appear in item tags. */
export function filterMediaByTagsStrict(
  items: MediaItem[],
  query: string,
): MediaItem[] {
  const tokens = positiveTagTokens(query);
  if (tokens.length === 0) return [];
  const seen = new Set<string>();
  const out: MediaItem[] = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    const hay = ` ${`${item.tags ?? ""}`.toLowerCase().replace(/_/g, " ")} `;
    const ok = tokens.every((t) => {
      const spaced = t.replace(/_/g, " ");
      return hay.includes(` ${spaced} `) || hay.includes(` ${t} `);
    });
    if (!ok) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}

function positiveTagTokens(query: string): string[] {
  return query
    .split(/\s+/)
    .map((t) => t.trim().toLowerCase())
    .filter(
      (t) =>
        t.length > 0 &&
        !t.startsWith("-") &&
        !t.startsWith("rating:") &&
        !t.startsWith("sort:") &&
        !t.startsWith("score:") &&
        !t.startsWith("order:"),
    );
}

/**
 * Namespace ids so a quest deck never shares identity with the main playlist.
 * Preload eviction then drops quest blobs when the main deck is restored.
 */
export function namespaceMediaItems(
  items: MediaItem[],
  prefix: string,
): MediaItem[] {
  return items.map((item, i) => ({
    ...item,
    id: `${prefix}:${item.gelbooruId ?? item.id}:${i}`,
  }));
}

/**
 * New play cycle: reshuffle the full set.
 * Avoids starting with `avoidId` so the last slide of the previous cycle
 * doesn't immediately repeat as the first of the next.
 */
export function reshuffleMediaCycle(
  items: MediaItem[],
  avoidId?: string | null,
): MediaItem[] {
  const shuffled = shuffleMediaItems(items);
  if (shuffled.length < 2 || !avoidId) return shuffled;
  if (shuffled[0]?.id !== avoidId) return shuffled;
  const j = 1 + Math.floor(Math.random() * (shuffled.length - 1));
  const a = shuffled[0]!;
  shuffled[0] = shuffled[j]!;
  shuffled[j] = a;
  return shuffled;
}

/** Remote booru URLs → same-origin proxy (fixes hotlink / blank stage). */
export function displayMediaUrl(item: MediaItem): string {
  if (item.source === "local" || item.source === "favorites") return item.url;
  if (item.url.startsWith("blob:") || item.url.startsWith("data:")) {
    return item.url;
  }
  if (item.url.startsWith("/")) return item.url;
  return `/api/media-proxy?url=${encodeURIComponent(item.url)}`;
}

/** How long to keep a slide on screen / whether video should HTML-loop. */
export type MediaHoldPlan = {
  /** True → short clip; keep looping until holdMs elapses */
  loop: boolean;
  holdMs: number;
};

/**
 * Short clips (≤ slideSec): play at least twice, enough times to fill the slide.
 * Long clips (> slideSec): play once, then advance.
 * Unknown / still images: hold for slideSec.
 */
export function planMediaHold(
  durationSec: number | null | undefined,
  slideSec: number,
): MediaHoldPlan {
  const slideMs = Math.max(3, slideSec) * 1000;
  if (
    durationSec == null ||
    !Number.isFinite(durationSec) ||
    durationSec <= 0.05
  ) {
    return { loop: false, holdMs: slideMs };
  }
  if (durationSec > slideSec) {
    return { loop: false, holdMs: Math.ceil(durationSec * 1000) };
  }
  const loops = Math.max(2, Math.ceil(slideSec / durationSec));
  return { loop: true, holdMs: Math.ceil(loops * durationSec * 1000) };
}

/** Sum frame delays from a GIF89a/87a buffer (seconds). */
export function parseGifDurationSec(data: ArrayBuffer): number | null {
  const bytes = new Uint8Array(data);
  if (bytes.length < 14) return null;
  const header = String.fromCharCode(
    bytes[0]!,
    bytes[1]!,
    bytes[2]!,
    bytes[3]!,
    bytes[4]!,
    bytes[5]!,
  );
  if (header !== "GIF87a" && header !== "GIF89a") return null;

  let i = 13;
  const packed = bytes[10]!;
  if (packed & 0x80) {
    i += 3 * (1 << ((packed & 0x07) + 1));
  }

  let totalDelayCs = 0;
  let frames = 0;

  while (i < bytes.length) {
    const block = bytes[i]!;
    if (block === 0x3b) break;
    if (block === 0x21) {
      const label = bytes[i + 1];
      if (label === 0xf9 && bytes[i + 2] === 4) {
        const delay = bytes[i + 4]! | (bytes[i + 5]! << 8);
        // Browsers treat 0 as ~100ms
        totalDelayCs += delay === 0 ? 10 : delay;
        frames += 1;
        i += 8;
        continue;
      }
      i += 2;
      while (i < bytes.length) {
        const sz = bytes[i]!;
        i += 1;
        if (sz === 0) break;
        i += sz;
      }
      continue;
    }
    if (block === 0x2c) {
      if (i + 10 >= bytes.length) break;
      const localPacked = bytes[i + 9]!;
      i += 10;
      if (localPacked & 0x80) {
        i += 3 * (1 << ((localPacked & 0x07) + 1));
      }
      i += 1;
      while (i < bytes.length) {
        const sz = bytes[i]!;
        i += 1;
        if (sz === 0) break;
        i += sz;
      }
      continue;
    }
    break;
  }

  if (frames === 0) return null;
  return totalDelayCs / 100;
}

const gifDurationCache = new Map<string, number | null>();

/** Fetch (via same URL the stage uses) and parse GIF loop length. */
export async function fetchGifDurationSec(url: string): Promise<number | null> {
  if (gifDurationCache.has(url)) return gifDurationCache.get(url) ?? null;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      gifDurationCache.set(url, null);
      return null;
    }
    const buf = await res.arrayBuffer();
    const sec = parseGifDurationSec(buf);
    gifDurationCache.set(url, sec);
    return sec;
  } catch {
    gifDurationCache.set(url, null);
    return null;
  }
}
