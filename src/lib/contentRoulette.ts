import {
  CHARACTER_CATALOG,
  MEDIA_META_TAGS,
  MEDIA_TYPE_CATALOG,
  PERSON_CONTENT_TAGS,
  isContentMediaTypeId,
  type ContentMediaTypeId,
} from "./contentCatalog";
import { resolveFetishTagPick } from "./fetishTiers";
import type { MediaKind } from "./media";
import {
  booruEmptyComposeQuery,
  booruRatingToken,
  booruRatingUsesMediaMeta,
  DEFAULT_BOORU_RATING,
  type BooruRatingId,
} from "./booruRating";
import type { BooruSiteId } from "./booruSites";
import {
  filterByEnabled,
  loadRouletteSettings,
  type RouletteSettings,
} from "./rouletteSettings";
import {
  isCharacterUnlocked,
  isMediaTypeUnlocked,
  type ContentUnlockLists,
} from "./contentUnlocks";

const EMPTY_UNLOCKS: ContentUnlockLists = {
  fetishIds: [],
  characterIds: [],
  mediaTypeIds: [],
  modeIds: [],
  moodIds: [],
  unlockedTags: [],
};

export type ContentCharacterStepId = "character";
export type ContentMediaStepId = "media_type";

export type {
  CharacterCatalogEntry,
  ContentCharacterId,
  ContentMediaTypeId,
  MediaTypeCatalogEntry,
} from "./contentCatalog";

export {
  CHARACTER_CATALOG,
  MEDIA_TYPE_CATALOG,
  PERSON_CONTENT_TAGS,
  MEDIA_META_TAGS,
} from "./contentCatalog";

export type ContentWheelOption = {
  id: string;
  labelRu: string;
  weight?: number;
  color?: string;
  payload?: Record<string, unknown>;
  unlocked?: boolean;
};

export type ContentWheelStep = {
  id: ContentCharacterStepId | ContentMediaStepId;
  titleRu: string;
  speakEn: string;
  options: ContentWheelOption[];
};

const COLORS = [
  "#c45c26",
  "#2fbf6a",
  "#3d7ea6",
  "#e6b422",
  "#e04545",
  "#8b5cf6",
  "#0d9488",
  "#db2777",
  "#64748b",
  "#f59e0b",
];

function colorAt(i: number): string {
  return COLORS[i % COLORS.length]!;
}

export function buildCharacterStep(
  settings: RouletteSettings = loadRouletteSettings(),
  unlocks: ContentUnlockLists = EMPTY_UNLOCKS,
): ContentWheelStep {
  const mapped: ContentWheelOption[] = CHARACTER_CATALOG.map((c, i) => {
    const unlocked = isCharacterUnlocked(c.id, unlocks);
    return {
      id: c.id,
      labelRu: unlocked ? c.labelRu : `${c.labelRu} · закрыто`,
      weight: c.weight ?? 1,
      color: unlocked ? colorAt(i) : "#3a3a3a",
      payload: {
        characterId: c.id,
        characterTags: c.tags,
      },
      unlocked,
    };
  });
  const options = filterByEnabled(mapped, settings, "character");

  if (options.length === 0) {
    options.push({
      id: "girl",
      labelRu: "Девочка",
      weight: 1,
      color: colorAt(0),
      payload: { characterId: "girl", characterTags: "1girl" },
      unlocked: true,
    });
  }

  return {
    id: "character",
    titleRu: "Архетип",
    speakEn: "Girl, trap, group… who do you watch?",
    options,
  };
}

export function buildMediaTypeStep(
  settings: RouletteSettings = loadRouletteSettings(),
  unlocks: ContentUnlockLists = EMPTY_UNLOCKS,
  availability?: { mediaListReady?: boolean },
): ContentWheelStep {
  const catalog = MEDIA_TYPE_CATALOG.filter(
    (entry) => availability?.mediaListReady !== false || entry.id !== "list",
  );
  const mapped: ContentWheelOption[] = catalog.map((m, i) => {
    const unlocked = isMediaTypeUnlocked(m.id, unlocks);
    return {
      id: m.id,
      labelRu: unlocked ? m.labelRu : `${m.labelRu} · закрыто`,
      weight: m.weight ?? 1,
      color: unlocked ? colorAt(i) : "#3a3a3a",
      payload: {
        mediaTypeId: m.id,
        mediaQueryTags: m.queryTags,
        mediaKinds: m.kinds,
      },
      unlocked,
    };
  });
  const options = filterByEnabled(mapped, settings, "media_type");

  if (options.length === 0) {
    options.push({
      id: "photo",
      labelRu: "Фото",
      weight: 1,
      color: colorAt(0),
      payload: {
        mediaTypeId: "photo",
        mediaQueryTags: "-animated -video",
        mediaKinds: ["image"],
      },
      unlocked: true,
    });
  }

  return {
    id: "media_type",
    titleRu: "Тип контента",
    speakEn: "Stills, gifs, video — or everything?",
    options,
  };
}

/**
 * Strip rating / person / media-meta / global excludes from fetish tag strings
 * so character + media wheels own those axes.
 */
export function extractFetishContentTags(raw: string): {
  rating: string | null;
  content: string[];
} {
  const tokens = raw.trim().split(/\s+/).filter(Boolean);
  let rating: string | null = null;
  const content: string[] = [];

  for (const t of tokens) {
    if (t.startsWith("rating:")) {
      rating = t;
      continue;
    }
    if (t === "sort:random") continue;
    const bare = t.startsWith("-") ? t.slice(1) : t;
    if (PERSON_CONTENT_TAGS.has(bare)) continue;
    if (MEDIA_META_TAGS.has(bare)) continue;
    if (bare === "furry" && !t.startsWith("-")) continue;
    content.push(t);
  }

  return { rating, content };
}

export type ComposedContentQuery = {
  tags: string;
  tagsLabelRu: string;
  /** Empty = allow all kinds */
  mediaKinds: MediaKind[];
  mediaTypeId: ContentMediaTypeId;
};

/**
 * Compose the session query from fetish + character + media-type picks.
 * Rating comes from the Media tab, not from fetish strings or a hardcoded explicit.
 */
export function composeContentQuery(
  picks: Partial<
    Record<string, { payload?: Record<string, unknown>; labelRu?: string }>
  >,
  site: BooruSiteId = "gelbooru",
  rating: BooruRatingId = DEFAULT_BOORU_RATING,
): ComposedContentQuery {
  const fetishPick = resolveFetishTagPick(picks);
  const fetishRaw =
    typeof fetishPick?.payload?.tags === "string"
      ? fetishPick.payload.tags
      : "";
  const { content } = extractFetishContentTags(fetishRaw);

  const characterTags =
    typeof picks.character?.payload?.characterTags === "string"
      ? (picks.character.payload.characterTags as string).trim()
      : "";

  const mediaQueryTags =
    booruRatingUsesMediaMeta(site) &&
    typeof picks.media_type?.payload?.mediaQueryTags === "string"
      ? (picks.media_type.payload.mediaQueryTags as string).trim()
      : "";

  const mediaTypeIdRaw = picks.media_type?.payload?.mediaTypeId;
  const mediaTypeId: ContentMediaTypeId =
    typeof mediaTypeIdRaw === "string" && isContentMediaTypeId(mediaTypeIdRaw)
      ? mediaTypeIdRaw
      : "all";

  const mediaKindsRaw = picks.media_type?.payload?.mediaKinds;
  const mediaKinds: MediaKind[] = Array.isArray(mediaKindsRaw)
    ? (mediaKindsRaw.filter(
        (k): k is MediaKind =>
          k === "image" || k === "gif" || k === "video",
      ) as MediaKind[])
    : [];

  const parts = [
    booruRatingToken(site, rating),
    characterTags,
    ...content,
    mediaQueryTags,
  ].filter(Boolean);

  let tags = parts.join(" ").replace(/\s+/g, " ").trim();
  if (!tags) {
    tags = booruEmptyComposeQuery(site, rating);
  }

  const labelParts = [
    fetishPick?.labelRu,
    picks.character?.labelRu,
    picks.media_type?.labelRu,
  ].filter(Boolean);

  return {
    tags,
    tagsLabelRu: labelParts.length > 0 ? labelParts.join(" · ") : "Контент",
    mediaKinds,
    mediaTypeId,
  };
}
