import { inferMediaKind, type MediaItem } from "./media";
import { booruMediaId, booruSite, type Html02SiteId } from "./booruSites";

/**
 * Typical Gelbooru 0.2 list length. Live "all" is ~29 (not 42); `pid` is a
 * post offset, so the next page is `pid + received`, not `pid + 1`.
 */
export const REALBOORU_PAGE_SIZE = 29;
/** A reasonably full HTML page still has more; 28-item pages happen. */
export const REALBOORU_PAGE_FULL_MIN = 20;

const POST_RE =
  /<a[^>]*\bid="p(\d+)"[^>]*>\s*<img\b([^>]*)>/gi;
const ATTR_RE = /([a-zA-Z:_-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
/** Dirs are two hex chars of the MD5 (`4c/19`), not decimal-only. */
const THUMB_FILE_RE =
  /realbooru\.com\/thumbnails\/+([0-9a-f]+)\/+([0-9a-f]+)\/thumbnail_([0-9a-f]+)\.(\w+)/i;

export type RealbooruListPost = {
  id: string;
  previewUrl: string;
  fileUrl: string;
  sampleUrl: string;
  tags: string;
};

export type RealbooruThumbParts = {
  dirA: string;
  dirB: string;
  hash: string;
  thumbExt: string;
};

function decodeHtml(raw: string): string {
  return raw
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

function attrs(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  ATTR_RE.lastIndex = 0;
  for (;;) {
    const m = ATTR_RE.exec(raw);
    if (!m) break;
    out[m[1]!.toLowerCase()] = m[2] ?? m[3] ?? "";
  }
  return out;
}

export function tagsFromRealbooruTitle(title: string): string {
  return decodeHtml(title)
    .split(",")
    .map((part) => part.trim().replace(/\s+/g, "_"))
    .filter(Boolean)
    .join(" ");
}

export function parseRealbooruThumb(
  previewUrl: string,
): RealbooruThumbParts | null {
  const m = THUMB_FILE_RE.exec(previewUrl);
  if (!m) return null;
  return {
    dirA: m[1]!,
    dirB: m[2]!,
    hash: m[3]!,
    thumbExt: m[4]!,
  };
}

function fileExtFromTags(tags: string): string {
  const set = new Set(tags.toLowerCase().split(/\s+/).filter(Boolean));
  if (set.has("webm")) return "webm";
  if (set.has("mp4") || set.has("video")) return "mp4";
  if (set.has("gif") || set.has("animated_gif")) return "gif";
  if (set.has("png")) return "png";
  if (set.has("webp")) return "webp";
  return "jpeg";
}

export function fileUrlFromRealbooruThumb(
  previewUrl: string,
  tags: string,
): string | null {
  const parts = parseRealbooruThumb(previewUrl);
  if (!parts) return null;
  const ext = fileExtFromTags(tags);
  return `https://realbooru.com/images/${parts.dirA}/${parts.dirB}/${parts.hash}.${ext}`;
}

/** Wall sample: `samples/{aa}/{bb}/sample_{hash}.jpg` (stills; videos 404). */
export function sampleUrlFromRealbooruThumb(previewUrl: string): string | null {
  const parts = parseRealbooruThumb(previewUrl);
  if (!parts) return null;
  return `https://realbooru.com/samples/${parts.dirA}/${parts.dirB}/sample_${parts.hash}.jpg`;
}

/**
 * Video poster lives next to the webm as `images/{aa}/{bb}/{hash}.jpg`
 * (samples 404). Stills use `.jpeg` for the original, so this jpg is video-only.
 */
export function posterUrlFromRealbooruThumb(previewUrl: string): string | null {
  const parts = parseRealbooruThumb(previewUrl);
  if (!parts) return null;
  return `https://realbooru.com/images/${parts.dirA}/${parts.dirB}/${parts.hash}.jpg`;
}

export function parseRealbooruListHtml(html: string): RealbooruListPost[] {
  const posts: RealbooruListPost[] = [];
  const seen = new Set<string>();
  POST_RE.lastIndex = 0;
  for (;;) {
    const m = POST_RE.exec(html);
    if (!m) break;
    const id = m[1]!;
    if (seen.has(id)) continue;
    const img = attrs(m[2] ?? "");
    const previewUrl = decodeHtml(img.src ?? "").trim();
    if (!previewUrl) continue;
    const tags = tagsFromRealbooruTitle(img.title ?? "");
    const fileUrl = fileUrlFromRealbooruThumb(previewUrl, tags);
    if (!fileUrl) continue;
    const kind = inferMediaKind(fileUrl, tags);
    const sampleUrl =
      kind === "video"
        ? posterUrlFromRealbooruThumb(previewUrl)
        : sampleUrlFromRealbooruThumb(previewUrl);
    if (!sampleUrl) continue;
    seen.add(id);
    posts.push({ id, previewUrl, fileUrl, sampleUrl, tags });
  }
  return posts;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchRealbooruResilient(
  url: string,
  label: string,
): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 4; attempt++) {
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => ctrl.abort(), 12_000);
    try {
      const res = await fetch(url, { signal: ctrl.signal });
      window.clearTimeout(timer);
      if (res.ok) return res;
      if (res.status === 429 || res.status >= 500) {
        lastErr = new Error(`HTTP ${res.status}`);
        await sleep(1_600 * (attempt + 1));
        continue;
      }
      const body = await res.text().catch(() => "");
      throw new Error(
        `${label} HTTP ${res.status}${body ? `: ${body.slice(0, 160)}` : ""}`,
      );
    } catch (err) {
      window.clearTimeout(timer);
      lastErr = err;
      if (err instanceof Error && err.message.startsWith(`${label} HTTP`)) {
        throw err;
      }
      await sleep(1_600 * (attempt + 1));
    }
  }
  const detail =
    lastErr instanceof Error && lastErr.message
      ? ` (${lastErr.message.slice(0, 120)})`
      : "";
  throw new Error(
    `${label} недоступен после 4 попыток${detail}. Включи VPN и повтори.`,
  );
}

function toMediaItem(post: RealbooruListPost): MediaItem {
  return {
    id: booruMediaId("realbooru", post.id),
    url: post.fileUrl,
    previewUrl: post.previewUrl,
    sampleUrl: post.sampleUrl,
    kind: inferMediaKind(post.fileUrl, post.tags),
    source: "gelbooru",
    tags: post.tags || undefined,
    gelbooruId: post.id,
    booruSite: "realbooru",
  };
}

function listQuery(tags: string): string {
  const trimmed = tags.trim();
  if (!trimmed || trimmed === "all") return "all";
  return trimmed;
}

/**
 * Fetch one Gelbooru 0.2 HTML list page via `/api/booru/realbooru`.
 * `opts.pid` is the HTML **post offset** (pid=0, then pid=29, …), not a dapi
 * page index. Do not stitch a second page to pad to 36 — first paint stays on
 * the native ~29 thumbs.
 */
export async function fetchRealbooru(
  site: Html02SiteId,
  tags: string,
  limit = REALBOORU_PAGE_SIZE,
  opts?: { pid?: number },
): Promise<MediaItem[]> {
  const want = Math.min(100, Math.max(1, Math.floor(limit)));
  const cursor = Math.max(0, Math.floor(opts?.pid ?? 0));
  const def = booruSite(site);
  const query = listQuery(tags || def.defaultTags);
  const params = new URLSearchParams({
    page: "post",
    s: "list",
    tags: query,
    pid: String(cursor),
  });
  const res = await fetchRealbooruResilient(
    `/api/booru/${site}?${params.toString()}`,
    def.label,
  );
  const html = await res.text();
  return parseRealbooruListHtml(html).map(toMediaItem).slice(0, want);
}
