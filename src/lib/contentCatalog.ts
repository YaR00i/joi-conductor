import type { MediaKind } from "./media";

export type ContentCharacterId =
  | "girl"
  | "trap"
  | "group"
  | "futanari"
  | "sissy"
  | "yuri"
  | "femboy";

export type ContentMediaTypeId =
  | "photo"
  | "gifs"
  | "video"
  | "photo_gifs"
  | "all"
  | "list";

export type CharacterCatalogEntry = {
  id: ContentCharacterId;
  labelRu: string;
  /** Gelbooru person clause */
  tags: string;
  weight?: number;
  hint?: string;
};

export type MediaTypeCatalogEntry = {
  id: ContentMediaTypeId;
  labelRu: string;
  /** Extra search tokens (may include excludes) */
  queryTags: string;
  /** Client-side kind filter; empty = all kinds */
  kinds: MediaKind[];
  weight?: number;
  hint?: string;
};

export const CHARACTER_CATALOG: CharacterCatalogEntry[] = [
  {
    id: "girl",
    labelRu: "Девочка",
    tags: "1girl",
    weight: 1.4,
    hint: "1girl",
  },
  {
    id: "trap",
    labelRu: "Трап",
    tags: "1boy trap",
    weight: 1.1,
    hint: "1boy trap",
  },
  {
    id: "group",
    labelRu: "Группа",
    tags: "2girls",
    weight: 1,
    hint: "2girls",
  },
  {
    id: "futanari",
    labelRu: "Футанари",
    tags: "futanari",
    weight: 1,
    hint: "futanari",
  },
  {
    id: "sissy",
    labelRu: "Сисси",
    tags: "1boy crossdressing",
    weight: 0.95,
    hint: "1boy crossdressing",
  },
  {
    id: "yuri",
    labelRu: "Юри",
    tags: "2girls yuri",
    weight: 0.9,
    hint: "2girls yuri",
  },
  {
    id: "femboy",
    labelRu: "Фембой",
    tags: "1boy femboy",
    weight: 0.9,
    hint: "1boy femboy",
  },
];

export const MEDIA_TYPE_CATALOG: MediaTypeCatalogEntry[] = [
  {
    id: "photo",
    labelRu: "Фото",
    queryTags: "-animated -video",
    kinds: ["image"],
    weight: 1.2,
    hint: "только статичные",
  },
  {
    id: "gifs",
    labelRu: "Гифки",
    queryTags: "animated -video",
    kinds: ["gif"],
    weight: 1.1,
    hint: "animated",
  },
  {
    id: "video",
    labelRu: "Видео",
    queryTags: "video",
    kinds: ["video"],
    weight: 1,
    hint: "video / webm",
  },
  {
    id: "photo_gifs",
    labelRu: "Фото + гифки",
    queryTags: "-video",
    kinds: ["image", "gif"],
    weight: 1.25,
    hint: "без видео",
  },
  {
    id: "all",
    labelRu: "Всё",
    queryTags: "",
    kinds: [],
    weight: 1.15,
    hint: "без фильтра",
  },
  {
    id: "list",
    labelRu: "Список",
    queryTags: "",
    kinds: [],
    weight: 1.05,
    hint: "готовая очередь",
  },
];

export function isContentMediaTypeId(
  value: string,
): value is ContentMediaTypeId {
  return MEDIA_TYPE_CATALOG.some((row) => row.id === value);
}

export function isListMediaType(value: string): boolean {
  return value === "list";
}

/** Tags that belong to character / person identity — not fetish content. */
export const PERSON_CONTENT_TAGS = new Set([
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
  "solo",
]);

/** Booru meta tags owned by the media-type wheel. */
export const MEDIA_META_TAGS = new Set(["animated", "video", "webm", "mp4"]);
