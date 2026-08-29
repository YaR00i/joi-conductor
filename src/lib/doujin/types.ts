import type { ReadingListPlayStats } from "./readingListPlayStats";

export type DoujinTagType =
  | "tag"
  | "artist"
  | "character"
  | "parody"
  | "group"
  | "language"
  | "category"
  | "unknown";

export type DoujinTag = {
  id?: number;
  type: DoujinTagType;
  name: string;
  count?: number;
};

export type DoujinTitle = {
  english: string;
  japanese: string;
  pretty: string;
};

export type DoujinCard = {
  id: number;
  mediaId: string;
  title: DoujinTitle;
  numPages: number;
  coverUrl: string;
  thumbnailUrl: string;
  tags: DoujinTag[];
  language?: string;
  /** Spoken languages (skip translated/rewrite). Works may have more than one. */
  languages?: string[];
  /** Unix seconds from the gallery payload, if the API sent it. */
  uploadedAt?: number;
  numFavorites?: number;
  /** Lightweight list payloads (search/favorites) often send ids instead of names. */
  tagIds?: number[];
};

export type DoujinPage = {
  url: string;
  previewUrl: string;
  width?: number;
  height?: number;
};

export type DoujinGallery = DoujinCard & {
  pages: DoujinPage[];
  related: DoujinCard[];
};

export type DoujinSearchSort =
  | "date"
  | "popular"
  | "popular-today"
  | "popular-week"
  | "popular-month";

/** Local Избранное order. Tag rail still filters; this only ranks the matches. */
export type DoujinLibraryCatalogSort =
  | "added"
  | "uploaded"
  | "popular"
  | "pages";

export type DoujinListPage = {
  items: DoujinCard[];
  page: number;
  numPages: number;
  total?: number;
};

export type DoujinLanguageFilter = "all" | "english" | "japanese" | "chinese";

export type DoujinCategoryFilter =
  | "all"
  | "doujinshi"
  | "manga"
  | "artistcg"
  | "gamecg"
  | "imageset"
  | "western"
  | "non-h"
  | "misc";

export type DoujinPagesBand = "all" | "short" | "mid" | "long";

export type DoujinMinFavorites = "all" | "100" | "500" | "1000";

export type DoujinRecsPrefs = {
  language: DoujinLanguageFilter;
  sort: DoujinSearchSort;
  category: DoujinCategoryFilter;
  pagesBand: DoujinPagesBand;
  minFavorites: DoujinMinFavorites;
};

export type DoujinSettings = {
  apiKey: string;
  recs: DoujinRecsPrefs;
  /** Starred nhentai tags — extra weight in the recs query. */
  lovedTags: DoujinTag[];
  /** Ordered tags that pin matching favorites to the top of Избранное. */
  librarySortTags: DoujinTag[];
  /** How the local favorites catalog is ordered (after tag filter). */
  libraryCatalogSort: DoujinLibraryCatalogSort;
};

export type DoujinAccountTaste = {
  tags: DoujinTag[];
  favoriteIds: number[];
  sampled: number;
  total: number;
  at: number;
  complete?: boolean;
};

export type DoujinLibraryRecord = {
  id: number;
  mediaId: string;
  title: DoujinTitle;
  tags: DoujinTag[];
  numPages: number;
  coverUrl: string;
  coverBlob?: Blob;
  savedAt: number;
  pageIndex: number;
  /** Last reader page-turn; used to resume a list mid-work. */
  readAt?: number;
};

export type DoujinLanguageBadge = {
  code: string;
  title: string;
  kind: "jp" | "en" | "zh" | "other";
};

export type DoujinReadingListItem = {
  galleryId: number;
  addedAt: number;
  mediaId: string;
  title: DoujinTitle;
  coverUrl: string;
  numPages: number;
  language?: string;
  languages?: string[];
  tags?: DoujinTag[];
  uploadedAt?: number;
  numFavorites?: number;
  /** Cached page preview URLs for the list pane; not full reader pages. */
  pagePreviews?: string[];
};

export type DoujinReadingListOrigin = "user" | "mistress";

export type DoujinReadingList = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  cursorIndex: number;
  items: DoujinReadingListItem[];
  /** Missing on older lists — treat as user. */
  origin?: DoujinReadingListOrigin;
  /** User text. Missing on older lists. */
  note?: string;
  /** Lifetime E/R/C from reading runs on this queue. Missing on older lists. */
  playStats?: ReadingListPlayStats;
};

export type DoujinPlaylistNav = {
  name: string;
  index: number;
  total: number;
  hasPrev: boolean;
  hasNext: boolean;
};

export const DOUJIN_SEARCH_SORTS: readonly DoujinSearchSort[] = [
  "date",
  "popular",
  "popular-today",
  "popular-week",
  "popular-month",
] as const;

export const DOUJIN_LIBRARY_CATALOG_SORTS: readonly DoujinLibraryCatalogSort[] =
  ["added", "uploaded", "popular", "pages"] as const;

export const DOUJIN_LIBRARY_CATALOG_SORT_ITEMS: readonly {
  value: DoujinLibraryCatalogSort;
  label: string;
  hint: string;
}[] = [
  {
    value: "added",
    label: "В избранное",
    hint: "Как на сайте — свежие сердечки сверху. Если врёт — Обновить каталог",
  },
  {
    value: "uploaded",
    label: "Дата выхода",
    hint: "Когда работу выложили на nhentai",
  },
  {
    value: "popular",
    label: "Популярность",
    hint: "Число сердечек на сайте",
  },
  {
    value: "pages",
    label: "Страницы",
    hint: "Длинные работы сверху",
  },
] as const;
