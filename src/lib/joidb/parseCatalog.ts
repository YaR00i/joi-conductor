import { joidbMediaId, parseJoidbDuration } from "./origin";

export type JoidbVideo = {
  id: string;
  mediaId: string;
  title: string;
  duration: string;
  durationSec: number;
  thumbnail: string;
  exclusive: boolean;
  creator?: string;
};

export type JoidbCatalogPage = {
  items: JoidbVideo[];
  page: number;
  pages: number;
};

function attr(attrs: string, name: string): string {
  const re = new RegExp(`\\b${name}="([^"]*)"`, "i");
  return re.exec(attrs)?.[1]?.trim() ?? "";
}

function decodeEntities(raw: string): string {
  return raw
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

export function parseJoidbThumbnails(html: string): JoidbVideo[] {
  const out: JoidbVideo[] = [];
  const seen = new Set<string>();
  const re = /<asis-video-thumbnail\b([^>]*)>/gi;
  for (;;) {
    const m = re.exec(html);
    if (!m) break;
    const attrs = m[1] ?? "";
    const id = attr(attrs, "video-id").toLowerCase();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const title = decodeEntities(attr(attrs, "video-title"));
    const duration = attr(attrs, "duration");
    const exclusive = /^(1|true|yes)$/i.test(attr(attrs, "is_patreon_exclusive"));
    out.push({
      id,
      mediaId: joidbMediaId(id),
      title: title || id,
      duration,
      durationSec: parseJoidbDuration(duration),
      thumbnail: attr(attrs, "thumbnail"),
      exclusive,
    });
  }
  return out;
}

export function parseJoidbPager(html: string, fallbackPage = 1): {
  page: number;
  pages: number;
} {
  const nums = [...html.matchAll(/[?&]page=(\d+)/g)].map((m) => Number(m[1]));
  const pages = nums.length > 0 ? Math.max(...nums.filter(Number.isFinite)) : 1;
  const active = /page-item\s+active[\s\S]{0,180}?[?&]page=(\d+)/i.exec(html);
  const page = active ? Number(active[1]) : fallbackPage;
  return {
    page: Number.isFinite(page) && page > 0 ? page : fallbackPage,
    pages: Math.max(1, pages),
  };
}

export function parseJoidbCatalogHtml(
  html: string,
  fallbackPage = 1,
): JoidbCatalogPage {
  const pager = parseJoidbPager(html, fallbackPage);
  return {
    items: parseJoidbThumbnails(html),
    page: pager.page,
    pages: pager.pages,
  };
}

export function parseJoidbApiHtmlPayload(raw: unknown): string {
  if (!raw || typeof raw !== "object") return "";
  const rec = raw as Record<string, unknown>;
  const data = rec.data;
  if (typeof rec.html === "string") return rec.html;
  if (data && typeof data === "object") {
    const html = (data as Record<string, unknown>).html;
    if (typeof html === "string") return html;
  }
  return "";
}

export type JoidbWatchMeta = {
  tags: string[];
  description: string;
  creator?: string;
};

export function parseJoidbWatchTags(html: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const re = /href="\/videos\?search=([^"]+)"[^>]*>\s*([^<]+)/gi;
  for (;;) {
    const m = re.exec(html);
    if (!m) break;
    const tag = decodeEntities(m[2]?.trim() ?? "");
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
  }
  return out;
}

function stripWatchHtml(raw: string): string {
  return decodeEntities(raw.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

export function parseJoidbWatchPage(html: string): JoidbWatchMeta {
  const tags = parseJoidbWatchTags(html);
  const creatorMatch =
    /href=['"]\/profile\/[^'"]+['"][\s\S]{0,280}?<h5[^>]*>\s*([^<]+)/i.exec(
      html,
    );
  const creator = decodeEntities(creatorMatch?.[1]?.trim() ?? "");
  const descMatch =
    /<p class=['"]text-muted my-0 my-md-2 text-break['"]>\s*([\s\S]*?)\s*<\/p>/i.exec(
      html,
    );
  const description = stripWatchHtml(descMatch?.[1] ?? "");
  const empty =
    !description || /^no description has been written\.?$/i.test(description);
  return {
    tags,
    description: empty ? "" : description,
    creator: creator || undefined,
  };
}
