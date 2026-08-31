import { inferMediaKind, type MediaItem } from "./media";
import {
  booruMediaId,
  booruSite,
  type Gelbooru01SiteId,
} from "./booruSites";

/** Gelbooru Beta 0.1.11 HTML list is 20 thumbs per page; `pid` is an offset. */
export const GELBOORU01_PAGE_SIZE = 20;

const THUMB_RE =
  /<span class="thumb">\s*<a id="p(\d+)"[^>]*>\s*<img\b([^>]*)>/gi;
const ATTR_RE = /([a-zA-Z:_-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
const THUMB_FILE_RE =
  /thumbs\.booru\.org\/([^/]+)\/thumbnails\/+(\d+)\/thumbnail_([0-9a-f]+)\.(\w+)/i;

export type Gelbooru01ListPost = {
  id: string;
  previewUrl: string;
  fileUrl: string;
  tags: string;
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

export function fileUrlFromGelbooru01Thumb(previewUrl: string): string | null {
  const m = THUMB_FILE_RE.exec(previewUrl);
  if (!m) return null;
  const slug = m[1]!;
  const dir = m[2]!;
  const hash = m[3]!;
  const ext = m[4]!;
  return `https://img.booru.org/${slug}//images/${dir}/${hash}.${ext}`;
}

export function tagsFromGelbooru01Title(title: string): string {
  const decoded = decodeHtml(title).trim();
  return decoded
    .replace(/\s+rating:\s*\S+/i, "")
    .replace(/\s+score:-?\d+\b/i, "")
    .trim();
}

export function parseGelbooru01ListHtml(html: string): Gelbooru01ListPost[] {
  const posts: Gelbooru01ListPost[] = [];
  const seen = new Set<string>();
  THUMB_RE.lastIndex = 0;
  for (;;) {
    const m = THUMB_RE.exec(html);
    if (!m) break;
    const id = m[1]!;
    if (seen.has(id)) continue;
    const img = attrs(m[2] ?? "");
    const previewUrl = decodeHtml(img.src ?? "").trim();
    if (!previewUrl) continue;
    const fileUrl = fileUrlFromGelbooru01Thumb(previewUrl);
    if (!fileUrl) continue;
    seen.add(id);
    posts.push({
      id,
      previewUrl,
      fileUrl,
      tags: tagsFromGelbooru01Title(img.title ?? ""),
    });
  }
  return posts;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchGelbooru01Resilient(
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

function toMediaItem(
  site: Gelbooru01SiteId,
  post: Gelbooru01ListPost,
): MediaItem {
  return {
    id: booruMediaId(site, post.id),
    url: post.fileUrl,
    previewUrl: post.previewUrl,
    sampleUrl: post.fileUrl,
    kind: inferMediaKind(post.fileUrl, post.tags),
    source: "gelbooru",
    tags: post.tags || undefined,
    gelbooruId: post.id,
    booruSite: site,
  };
}

function listQuery(tags: string): string {
  const trimmed = tags.trim();
  if (!trimmed || trimmed === "all") return "all";
  return trimmed;
}

/**
 * Fetch one HTML list page via `/api/booru/{site}` (Gelbooru 0.1.11).
 * `pid` is a 0-based *page* of `limit` items (same as Gelbooru dapi).
 */
export async function fetchGelbooru01(
  site: Gelbooru01SiteId,
  tags: string,
  limit = GELBOORU01_PAGE_SIZE,
  opts?: { pid?: number },
): Promise<MediaItem[]> {
  const want = Math.min(100, Math.max(1, Math.floor(limit)));
  const page = Math.max(0, Math.floor(opts?.pid ?? 0));
  const offset = page * want;
  const def = booruSite(site);
  const query = listQuery(tags || def.defaultTags);
  const out: MediaItem[] = [];
  const seen = new Set<string>();
  const maxPages = Math.max(1, Math.ceil(want / GELBOORU01_PAGE_SIZE) + 1);
  let cursor = offset;
  for (let pageNo = 0; pageNo < maxPages && out.length < want; pageNo += 1) {
    const params = new URLSearchParams({
      page: "post",
      s: "list",
      tags: query,
      pid: String(cursor),
    });
    const res = await fetchGelbooru01Resilient(
      `/api/booru/${site}?${params.toString()}`,
      def.label,
    );
    const html = await res.text();
    const batch = parseGelbooru01ListHtml(html).map((post) =>
      toMediaItem(site, post),
    );
    if (batch.length === 0) break;
    const before = out.length;
    for (const item of batch) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      out.push(item);
      if (out.length >= want) break;
    }
    if (out.length === before) break;
    if (batch.length < GELBOORU01_PAGE_SIZE) break;
    cursor += GELBOORU01_PAGE_SIZE;
  }
  return out.slice(0, want);
}
