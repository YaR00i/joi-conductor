import {
  defaultCdnConfig,
  extFromType,
  joinCdn,
  pickServer,
  type DoujinCdnConfig,
} from "./cdn";
import { normalizeTagName } from "./safety";
import type {
  DoujinCard,
  DoujinGallery,
  DoujinLanguageBadge,
  DoujinLanguageFilter,
  DoujinListPage,
  DoujinPage,
  DoujinTag,
  DoujinTagType,
  DoujinTitle,
} from "./types";

function rec(v: unknown): Record<string, unknown> | null {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    return v as Record<string, unknown>;
  }
  return null;
}

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function pickStr(obj: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = str(obj[k]);
    if (v) return v;
  }
  return "";
}

function pickNum(obj: Record<string, unknown>, keys: string[]): number | null {
  for (const k of keys) {
    const n = num(obj[k]);
    if (n != null) return n;
  }
  return null;
}

const TAG_TYPES: readonly DoujinTagType[] = [
  "tag",
  "artist",
  "character",
  "parody",
  "group",
  "language",
  "category",
];

function parseTagType(raw: string): DoujinTagType {
  const n = raw.trim().toLowerCase();
  for (const t of TAG_TYPES) {
    if (t === n) return t;
  }
  return "unknown";
}

export function parseTag(raw: unknown): DoujinTag | null {
  if (typeof raw === "string") {
    const name = normalizeTagName(raw);
    return name ? { type: "tag", name } : null;
  }
  const o = rec(raw);
  if (!o) return null;
  const name = normalizeTagName(pickStr(o, ["name", "tag", "value"]));
  if (!name) return null;
  const id = pickNum(o, ["id", "tag_id", "tagId"]);
  const count = pickNum(o, ["count", "gallery_count", "num_galleries"]);
  return {
    id: id ?? undefined,
    type: parseTagType(pickStr(o, ["type", "kind"])),
    name,
    count: count ?? undefined,
  };
}

export function parseTagIds(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  const out: number[] = [];
  const seen = new Set<number>();
  for (const item of raw) {
    const id = num(item);
    if (id == null || id <= 0 || !Number.isInteger(id) || seen.has(id)) {
      continue;
    }
    seen.add(id);
    out.push(id);
  }
  return out;
}

export function parseTags(raw: unknown): DoujinTag[] {
  if (!raw) return [];
  const list = Array.isArray(raw)
    ? raw
    : typeof raw === "string"
      ? raw.split(/\s+/)
      : [];
  const out: DoujinTag[] = [];
  const seen = new Set<string>();
  for (const item of list) {
    const tag = parseTag(item);
    if (!tag) continue;
    const key = `${tag.type}:${tag.name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
  }
  return out;
}

export function parseTitle(raw: unknown, fallback = ""): DoujinTitle {
  const o = rec(raw);
  if (!o) {
    const s = str(raw) || fallback;
    return { english: s, japanese: s, pretty: s };
  }
  const english = pickStr(o, ["english", "english_title", "englishTitle"]);
  const japanese = pickStr(o, ["japanese", "japanese_title", "japaneseTitle"]);
  const pretty = pickStr(o, ["pretty", "pretty_title", "prettyTitle", "short"]);
  const any = english || pretty || japanese || fallback;
  return {
    english: english || any,
    japanese: japanese || any,
    pretty: pretty || english || japanese || any,
  };
}

const LANGUAGE_META = new Set(["translated", "rewrite", "speechless"]);

/** Spoken-language ids on lightweight search/newest/favorites cards (names omitted). */
const LANGUAGE_TAG_IDS: Readonly<Record<number, string>> = {
  6346: "japanese",
  12227: "english",
  29963: "chinese",
};

function spokenLanguageName(name: string | undefined): string | undefined {
  const n = (name ?? "").trim().toLowerCase();
  if (!n || LANGUAGE_META.has(n)) return undefined;
  return n;
}

function uniqueSpoken(names: readonly string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of names) {
    const spoken = spokenLanguageName(raw);
    if (!spoken || seen.has(spoken)) continue;
    seen.add(spoken);
    out.push(spoken);
  }
  return out;
}

function languagesFromTags(tags: DoujinTag[]): string[] {
  return uniqueSpoken(
    tags.filter((t) => t.type === "language").map((t) => t.name),
  );
}

function languagesFromTagIds(ids: readonly number[]): string[] {
  return uniqueSpoken(ids.map((id) => LANGUAGE_TAG_IDS[id] ?? ""));
}

export function cardSpokenLanguages(
  tags: DoujinTag[],
  tagIds: readonly number[],
  rawLang: string,
): string[] {
  const fromTags = languagesFromTags(tags);
  if (fromTags.length > 0) return fromTags;
  const fromIds = languagesFromTagIds(tagIds);
  if (fromIds.length > 0) return fromIds;
  return uniqueSpoken(rawLang ? [rawLang] : []);
}

export function languagesOf(card: {
  languages?: readonly string[];
  language?: string;
}): string[] {
  if (card.languages && card.languages.length > 0) {
    return uniqueSpoken(card.languages);
  }
  return uniqueSpoken(card.language ? [card.language] : []);
}

export function languageBadge(
  lang?: string | null,
): DoujinLanguageBadge | null {
  if (!lang) return null;
  const n = lang.trim().toLowerCase();
  if (!n || LANGUAGE_META.has(n)) return null;
  if (n === "japanese" || n === "jp" || n === "ja") {
    return { code: "JP", title: "Японский", kind: "jp" };
  }
  if (n === "english" || n === "en") {
    return { code: "EN", title: "English", kind: "en" };
  }
  if (n === "chinese" || n === "zh") {
    return { code: "ZH", title: "中文", kind: "zh" };
  }
  return {
    code: n.slice(0, 2).toUpperCase(),
    title: lang,
    kind: "other",
  };
}

export function languageBadges(
  langs?: readonly string[] | string | null,
): DoujinLanguageBadge[] {
  const list = Array.isArray(langs) ? langs : langs ? [langs] : [];
  const out: DoujinLanguageBadge[] = [];
  const seen = new Set<string>();
  for (const lang of list) {
    const badge = languageBadge(lang);
    if (!badge) continue;
    const key = badge.kind === "other" ? badge.code : badge.kind;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(badge);
  }
  return out;
}

export function cardMatchesLanguage(
  language: string | readonly string[] | undefined,
  filter: DoujinLanguageFilter,
): boolean {
  if (filter === "all") return true;
  const list = Array.isArray(language)
    ? language
    : language
      ? [language]
      : [];
  return list.some((lang) => (lang ?? "").trim().toLowerCase() === filter);
}

function pagePath(
  raw: Record<string, unknown>,
  kind: "full" | "thumb",
): string {
  if (kind === "thumb") {
    const t = pickStr(raw, ["thumbnail", "thumb", "preview"]);
    if (t) return t;
  }
  return pickStr(raw, ["path", "url", "src"]);
}

function legacyPageUrl(
  mediaId: string,
  index: number,
  typeCode: string,
  thumbs: boolean,
  cdn: DoujinCdnConfig,
): string {
  if (!mediaId) return "";
  const ext = extFromType(typeCode);
  const file = thumbs ? `${index}t.${ext}` : `${index}.${ext}`;
  const server = pickServer(thumbs ? cdn.thumbServers : cdn.imageServers);
  return joinCdn(server, `/galleries/${mediaId}/${file}`);
}

/** Covers live on the thumb CDN (`cover.jpg` / `thumb.jpg`), not i.*. */
function legacyCoverUrl(
  mediaId: string,
  typeCode: string,
  kind: "cover" | "thumb",
  cdn: DoujinCdnConfig,
): string {
  if (!mediaId) return "";
  const ext = extFromType(typeCode || "j");
  const file = kind === "thumb" ? `thumb.${ext}` : `cover.${ext}`;
  return joinCdn(pickServer(cdn.thumbServers), `/galleries/${mediaId}/${file}`);
}

function rewriteToThumbCdn(url: string, cdn: DoujinCdnConfig): string {
  try {
    const parsed = new URL(url);
    if (!/\/(cover|thumb)\.[a-z0-9]+$/i.test(parsed.pathname)) return url;
    return joinCdn(pickServer(cdn.thumbServers), parsed.pathname);
  } catch {
    return url;
  }
}

function parseImagePage(
  raw: unknown,
  opts: {
    mediaId: string;
    index: number;
    cdn: DoujinCdnConfig;
    cover?: boolean;
  },
): DoujinPage | null {
  const o = rec(raw);
  if (!o) return null;
  const typeCode = pickStr(o, ["t", "type"]);
  const width = pickNum(o, ["w", "width"]);
  const height = pickNum(o, ["h", "height"]);
  const asCover = opts.cover === true || opts.index === 0;
  let url = pagePath(o, "full");
  let previewUrl = pagePath(o, "thumb");
  if (asCover) {
    if (!url && typeCode) {
      url = legacyCoverUrl(opts.mediaId, typeCode, "cover", opts.cdn);
    } else if (url && !/^https?:\/\//i.test(url)) {
      url = joinCdn(pickServer(opts.cdn.thumbServers), url);
    } else if (url) {
      url = rewriteToThumbCdn(url, opts.cdn);
    }
    if (!previewUrl && typeCode) {
      previewUrl = legacyCoverUrl(opts.mediaId, typeCode, "thumb", opts.cdn);
    } else if (previewUrl && !/^https?:\/\//i.test(previewUrl)) {
      previewUrl = joinCdn(pickServer(opts.cdn.thumbServers), previewUrl);
    } else if (previewUrl) {
      previewUrl = rewriteToThumbCdn(previewUrl, opts.cdn);
    }
  } else {
    if (!url && typeCode) {
      url = legacyPageUrl(
        opts.mediaId,
        opts.index,
        typeCode,
        false,
        opts.cdn,
      );
    } else if (url && !/^https?:\/\//i.test(url)) {
      url = joinCdn(pickServer(opts.cdn.imageServers), url);
    }
    if (!previewUrl && typeCode) {
      previewUrl = legacyPageUrl(
        opts.mediaId,
        opts.index,
        typeCode,
        true,
        opts.cdn,
      );
    } else if (previewUrl && !/^https?:\/\//i.test(previewUrl)) {
      previewUrl = joinCdn(pickServer(opts.cdn.thumbServers), previewUrl);
    }
  }
  if (!url) return null;
  return {
    url,
    previewUrl: previewUrl || url,
    width: width ?? undefined,
    height: height ?? undefined,
  };
}

function coverFromCard(
  o: Record<string, unknown>,
  mediaId: string,
  cdn: DoujinCdnConfig,
): { coverUrl: string; thumbnailUrl: string } {
  const thumbField = pickStr(o, ["thumbnail", "thumb", "cover"]);
  if (thumbField && /^https?:\/\//i.test(thumbField)) {
    const url = rewriteToThumbCdn(thumbField, cdn);
    return { coverUrl: url, thumbnailUrl: url };
  }
  const coverObj = rec(o.cover) ?? rec(o.thumbnail);
  if (coverObj) {
    const page = parseImagePage(coverObj, {
      mediaId,
      index: 0,
      cdn,
      cover: true,
    });
    if (page) {
      return { coverUrl: page.url, thumbnailUrl: page.previewUrl || page.url };
    }
  }
  if (thumbField) {
    const url = joinCdn(pickServer(cdn.thumbServers), thumbField);
    return { coverUrl: url, thumbnailUrl: url };
  }
  const images = rec(o.images);
  const cover = images ? rec(images.cover) ?? rec(images.thumbnail) : null;
  if (cover) {
    const page = parseImagePage(cover, {
      mediaId,
      index: 0,
      cdn,
      cover: true,
    });
    if (page) {
      return { coverUrl: page.url, thumbnailUrl: page.previewUrl || page.url };
    }
  }
  const fallback = mediaCoverUrls(mediaId, cdn);
  return fallback;
}

export function mediaCoverUrls(
  mediaId: string,
  cdn: DoujinCdnConfig = defaultCdnConfig(),
): { coverUrl: string; thumbnailUrl: string } {
  if (!mediaId) return { coverUrl: "", thumbnailUrl: "" };
  const url = joinCdn(pickServer(cdn.thumbServers), `/galleries/${mediaId}/cover.jpg`);
  return { coverUrl: url, thumbnailUrl: url };
}

export function parseCard(
  raw: unknown,
  cdn: DoujinCdnConfig = defaultCdnConfig(),
): DoujinCard | null {
  const o = rec(raw);
  if (!o) return null;
  const id = pickNum(o, ["id", "gallery_id", "galleryId"]);
  if (id == null || id <= 0) return null;
  const mediaId = String(
    pickStr(o, ["media_id", "mediaId"]) || pickNum(o, ["media_id", "mediaId"]) || "",
  );
  const title = parseTitle(
    o.title ?? {
      english: o.english_title ?? o.englishTitle,
      japanese: o.japanese_title ?? o.japaneseTitle,
      pretty: o.pretty_title ?? o.prettyTitle,
    },
    `#${id}`,
  );
  const tags = parseTags(o.tags ?? o.tag);
  const tagIds = parseTagIds([
    ...(Array.isArray(o.tag_ids) ? o.tag_ids : Array.isArray(o.tagIds) ? o.tagIds : []),
    ...tags.map((tag) => tag.id),
  ]);
  const languages = cardSpokenLanguages(
    tags,
    tagIds,
    pickStr(o, ["language", "lang"]),
  );
  const numPages =
    pickNum(o, ["num_pages", "numPages", "pages", "page_count"]) ??
    (Array.isArray(o.pages) ? o.pages.length : 0);
  const { coverUrl, thumbnailUrl } = coverFromCard(o, mediaId, cdn);
  const uploadedAt =
    pickNum(o, ["upload_date", "uploaded", "uploaded_at", "uploadedAt"]) ??
    undefined;
  const numFavorites =
    pickNum(o, ["num_favorites", "numFavorites", "favorites", "favorite_count"]) ??
    undefined;
  return {
    id,
    mediaId,
    title,
    numPages,
    coverUrl,
    thumbnailUrl,
    tags,
    language: languages[0],
    languages: languages.length > 0 ? languages : undefined,
    uploadedAt,
    numFavorites,
    tagIds: tagIds.length > 0 ? tagIds : undefined,
  };
}

export function parseListPage(
  raw: unknown,
  cdn: DoujinCdnConfig = defaultCdnConfig(),
  page = 1,
): DoujinListPage {
  const o = rec(raw);
  const list = Array.isArray(raw)
    ? raw
    : o
      ? Array.isArray(o.result)
        ? o.result
        : Array.isArray(o.galleries)
          ? o.galleries
          : Array.isArray(o.data)
            ? o.data
            : []
      : [];
  const items: DoujinCard[] = [];
  for (const row of list) {
    const card = parseCard(row, cdn);
    if (card) items.push(card);
  }
  const numPages =
    (o && pickNum(o, ["num_pages", "numPages", "total_pages", "totalPages"])) ??
    1;
  const current =
    (o && pickNum(o, ["page", "current_page", "currentPage"])) ?? page;
  const total = o ? pickNum(o, ["total", "count"]) ?? undefined : undefined;
  return {
    items,
    page: current,
    numPages: Math.max(1, numPages),
    total: total ?? undefined,
  };
}

function parsePages(
  o: Record<string, unknown>,
  mediaId: string,
  cdn: DoujinCdnConfig,
): DoujinPage[] {
  const images = rec(o.images);
  const rawPages = Array.isArray(o.pages)
    ? o.pages
    : images && Array.isArray(images.pages)
      ? images.pages
      : [];
  const out: DoujinPage[] = [];
  rawPages.forEach((row, i) => {
    const page = parseImagePage(row, { mediaId, index: i + 1, cdn });
    if (page) out.push(page);
  });
  return out;
}

export function parseGallery(
  raw: unknown,
  cdn: DoujinCdnConfig = defaultCdnConfig(),
): DoujinGallery | null {
  const card = parseCard(raw, cdn);
  if (!card) return null;
  const o = rec(raw);
  if (!o) return null;
  const pages = parsePages(o, card.mediaId, cdn);
  const relatedRaw = o.related;
  const related: DoujinCard[] = [];
  if (Array.isArray(relatedRaw)) {
    for (const row of relatedRaw) {
      const rel = parseCard(row, cdn);
      if (rel) related.push(rel);
    }
  }
  return {
    ...card,
    numPages: pages.length > 0 ? pages.length : card.numPages,
    pages,
    related,
  };
}

export function galleryCoverUrls(gallery: DoujinGallery): string[] {
  const out: string[] = [];
  const add = (url?: string) => {
    const u = url?.trim();
    if (!u || out.includes(u)) return;
    out.push(u);
  };
  add(gallery.coverUrl);
  add(gallery.thumbnailUrl);
  add(gallery.pages[0]?.previewUrl);
  add(gallery.pages[0]?.url);
  return out;
}

export function displayTitle(title: DoujinTitle): string {
  return title.pretty || title.english || title.japanese || "";
}

export function formatUploadedAt(
  unixSeconds?: number,
  nowMs = Date.now(),
): string {
  if (unixSeconds == null || !Number.isFinite(unixSeconds) || unixSeconds <= 0) {
    return "";
  }
  const then = unixSeconds * 1000;
  const stamp = new Date(then).toLocaleDateString("ru-RU");
  const days = Math.max(0, Math.floor((nowMs - then) / 86_400_000));
  if (days < 1) return `сегодня (${stamp})`;
  if (days < 30) return `${days} дн. назад (${stamp})`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} мес. назад (${stamp})`;
  const years = Math.floor(months / 12);
  return `${years} г. назад (${stamp})`;
}

const TAG_GROUP_ORDER: readonly DoujinTagType[] = [
  "parody",
  "character",
  "tag",
  "artist",
  "group",
  "language",
  "category",
  "unknown",
];

export function tagGroupLabel(type: DoujinTagType): string {
  switch (type) {
    case "parody":
      return "Пародии";
    case "character":
      return "Персонажи";
    case "tag":
      return "Теги";
    case "artist":
      return "Авторы";
    case "group":
      return "Круги";
    case "language":
      return "Языки";
    case "category":
      return "Категория";
    case "unknown":
      return "Прочее";
    default: {
      const _never: never = type;
      return _never;
    }
  }
}

export type DoujinTagGroup = {
  type: DoujinTagType;
  label: string;
  tags: DoujinTag[];
};

export function groupGalleryTags(tags: readonly DoujinTag[]): DoujinTagGroup[] {
  const buckets = new Map<DoujinTagType, DoujinTag[]>();
  for (const tag of tags) {
    const list = buckets.get(tag.type) ?? [];
    list.push(tag);
    buckets.set(tag.type, list);
  }
  const out: DoujinTagGroup[] = [];
  for (const type of TAG_GROUP_ORDER) {
    const list = buckets.get(type);
    if (!list || list.length === 0) continue;
    out.push({ type, label: tagGroupLabel(type), tags: list });
  }
  return out;
}

export function parseFavorited(raw: unknown): boolean {
  const o = rec(raw);
  if (!o) return false;
  if (o.favorited === true || o.favorite === true || o.is_favorited === true) {
    return true;
  }
  return false;
}
