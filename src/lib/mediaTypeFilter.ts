import {
  MEDIA_META_TAGS,
  MEDIA_TYPE_CATALOG,
  type ContentMediaTypeId,
} from "./contentCatalog";
import type { MediaKind } from "./media";

/** Hub / shelf pills: Все · Картинки · Гифки · Видео */
export type HubKindFilter = "all" | "image" | "gif" | "video";

const HUB_KIND_TO_MEDIA_TYPE = {
  all: "all",
  image: "photo",
  gif: "gifs",
  video: "video",
} as const satisfies Record<HubKindFilter, ContentMediaTypeId>;

export const MEDIA_TYPE_FILTER_IDS: ContentMediaTypeId[] = [
  "photo",
  "gifs",
  "video",
  "photo_gifs",
  "all",
];

export function isMediaTypeFilterId(value: string): value is ContentMediaTypeId {
  return MEDIA_TYPE_FILTER_IDS.includes(value as ContentMediaTypeId);
}

export function mediaTypeEntry(typeId: string) {
  return (
    MEDIA_TYPE_CATALOG.find((m) => m.id === typeId) ??
    MEDIA_TYPE_CATALOG.find((m) => m.id === "all")!
  );
}

/** Client-side kind allow-list; empty = no kind filter. */
export function kindsForMediaType(typeId: string): MediaKind[] {
  return [...mediaTypeEntry(typeId).kinds];
}

/**
 * Merge the media-type Gelbooru tokens into a tag query.
 * Existing animated/video meta tokens are replaced so the hub picker wins.
 */
export function applyMediaTypeQuery(tags: string, typeId: string): string {
  const extra = mediaTypeEntry(typeId)
    .queryTags.split(/\s+/)
    .filter(Boolean);
  const kept = tags
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .filter((token) => {
      const raw = (token.startsWith("-") ? token.slice(1) : token).toLowerCase();
      return !MEDIA_META_TAGS.has(raw);
    });
  return [...kept, ...extra].join(" ").replace(/\s+/g, " ").trim();
}

export function applyHubKindQuery(tags: string, kind: HubKindFilter): string {
  return applyMediaTypeQuery(tags, HUB_KIND_TO_MEDIA_TYPE[kind]);
}

export function kindsForHubKind(kind: HubKindFilter): MediaKind[] {
  return kindsForMediaType(HUB_KIND_TO_MEDIA_TYPE[kind]);
}
