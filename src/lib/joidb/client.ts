import {
  parseJoidbApiHtmlPayload,
  parseJoidbCatalogHtml,
  parseJoidbThumbnails,
  parseJoidbWatchPage,
  type JoidbCatalogPage,
  type JoidbVideo,
  type JoidbWatchMeta,
} from "./parseCatalog";
import { parseJoidbVtt, type JoidbVttCue } from "./parseVtt";
import { joidbProxyPath, joidbStreamProxyUrl, joidbVttProxyUrl } from "./origin";

async function joidbFetch(
  path: string,
  signal?: AbortSignal,
): Promise<Response> {
  const res = await fetch(joidbProxyPath(path), { signal });
  if (!res.ok) {
    throw new Error(`JOI Database ${res.status}`);
  }
  return res;
}

export async function fetchJoidbVideos(
  opts: { page?: number; search?: string; signal?: AbortSignal } = {},
): Promise<JoidbCatalogPage> {
  const page = Math.max(1, opts.page ?? 1);
  const params = new URLSearchParams();
  if (page > 1) params.set("page", String(page));
  const search = opts.search?.trim();
  if (search) params.set("search", search);
  const qs = params.toString();
  const path = qs ? `/videos?${qs}` : "/videos";
  const res = await joidbFetch(path, opts.signal);
  const html = await res.text();
  return parseJoidbCatalogHtml(html, page);
}

export async function fetchJoidbHome(
  signal?: AbortSignal,
): Promise<JoidbCatalogPage> {
  const res = await joidbFetch("/", signal);
  const html = await res.text();
  return parseJoidbCatalogHtml(html, 1);
}

async function fetchJoidbHtmlFeed(
  endpoint: string,
  offset: number,
  limit: number,
  signal?: AbortSignal,
): Promise<JoidbVideo[]> {
  const params = new URLSearchParams({
    lstart: String(Math.max(0, offset)),
    lend: String(Math.max(1, limit)),
  });
  const res = await joidbFetch(`${endpoint}?${params.toString()}`, signal);
  const json: unknown = await res.json();
  return parseJoidbThumbnails(parseJoidbApiHtmlPayload(json));
}

export async function fetchJoidbPopular(
  offset: number,
  limit = 24,
  signal?: AbortSignal,
): Promise<JoidbVideo[]> {
  return fetchJoidbHtmlFeed("/api/video_popular/daily", offset, limit, signal);
}

export async function fetchJoidbRandom(
  offset: number,
  limit = 24,
  signal?: AbortSignal,
): Promise<JoidbVideo[]> {
  return fetchJoidbHtmlFeed("/api/video_random", offset, limit, signal);
}

export async function fetchJoidbVtt(
  hexId: string,
  signal?: AbortSignal,
): Promise<JoidbVttCue[]> {
  const res = await fetch(joidbVttProxyUrl(hexId), { signal });
  if (!res.ok) return [];
  return parseJoidbVtt(await res.text());
}

const watchMetaCache = new Map<string, JoidbWatchMeta>();

export async function fetchJoidbWatch(
  hexId: string,
  signal?: AbortSignal,
): Promise<JoidbWatchMeta> {
  const id = hexId.trim().toLowerCase();
  const cached = watchMetaCache.get(id);
  if (cached) return cached;
  const res = await joidbFetch(`/watch/${encodeURIComponent(id)}`, signal);
  const meta = parseJoidbWatchPage(await res.text());
  if (!signal?.aborted) watchMetaCache.set(id, meta);
  return meta;
}

export function joidbPlayUrl(hexId: string): string {
  return joidbStreamProxyUrl(hexId);
}
