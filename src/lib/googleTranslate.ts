/**
 * Tag → Russian via Google Translate (unofficial gtx endpoint).
 * Cached in localStorage so the shop stays self-sufficient offline after first sync.
 */

const CACHE_KEY = "joi-tag-translate-v1";
const TRANSLATE_TIMEOUT_MS = 2500;

type TranslateCache = Record<string, string>;

function loadCache(): TranslateCache {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as TranslateCache;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveCache(cache: TranslateCache): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // ignore quota
  }
}

/** Booru token → readable English phrase for the translator. */
export function tagToTranslateQuery(tag: string): string {
  return tag
    .trim()
    .toLowerCase()
    .replace(/^\-+/, "")
    .replace(/_\([^)]*\)/g, " ")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Fallback label when network translate fails. */
export function humanizeTagLabel(tag: string): string {
  const q = tagToTranslateQuery(tag);
  if (!q) return tag;
  return q.replace(/\b\w/g, (c) => c.toUpperCase());
}

function parseGtxPayload(data: unknown): string | null {
  // Shape: [[["перевод","source",...],...], ...]
  if (!Array.isArray(data) || !Array.isArray(data[0])) return null;
  const chunks: string[] = [];
  for (const part of data[0]) {
    if (Array.isArray(part) && typeof part[0] === "string") {
      chunks.push(part[0]);
    }
  }
  const joined = chunks.join("").trim();
  return joined || null;
}

async function fetchWithTimeout(
  url: string,
  ms: number,
): Promise<Response | null> {
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { signal: ctrl.signal });
  } catch {
    return null;
  } finally {
    window.clearTimeout(timer);
  }
}

async function fetchGoogleTranslate(text: string): Promise<string | null> {
  const q = encodeURIComponent(text);
  const paths = [
    `/api/gtranslate?sl=en&tl=ru&q=${q}`,
    `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=ru&dt=t&q=${q}`,
  ];
  for (const url of paths) {
    const res = await fetchWithTimeout(url, TRANSLATE_TIMEOUT_MS);
    if (!res?.ok) continue;
    try {
      const data: unknown = await res.json();
      const translated = parseGtxPayload(data);
      if (translated) return translated;
    } catch {
      /* try next */
    }
  }
  return null;
}

/**
 * Translate a gelbooru tag into Russian (cached).
 * Never throws — falls back to a humanized English label.
 */
export async function translateTagToRu(tag: string): Promise<string> {
  const key = tag.trim().toLowerCase();
  if (!key) return tag;

  const cache = loadCache();
  if (cache[key]) return cache[key];

  const query = tagToTranslateQuery(key);
  const translated =
    (query ? await fetchGoogleTranslate(query) : null) ??
    humanizeTagLabel(key);

  cache[key] = translated;
  saveCache(cache);
  return translated;
}

/** Batch translate; preserves order. */
export async function translateTagsToRu(
  tags: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  // Parallel with a small concurrency limit so one hang doesn't block the shelf.
  await Promise.all(
    tags.map(async (tag) => {
      out.set(tag, await translateTagToRu(tag));
    }),
  );
  return out;
}
