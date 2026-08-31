import { booruSite, type BooruSiteId } from "./booruSites";

/** Hub / roulette heat. Same four slices on every board; token differs by API. */
export const BOORU_RATING_IDS = [
  "general",
  "sensitive",
  "questionable",
  "explicit",
] as const;
export type BooruRatingId = (typeof BOORU_RATING_IDS)[number];

export const DEFAULT_BOORU_RATING: BooruRatingId = "explicit";

export const BOORU_RATING_CATALOG: ReadonlyArray<{
  id: BooruRatingId;
  labelRu: string;
  hintRu: string;
}> = [
  { id: "general", labelRu: "Спокойно", hintRu: "Без секса, обычные кадры" },
  {
    id: "sensitive",
    labelRu: "Fanservice",
    hintRu: "Лёгкий etchi, не порно",
  },
  {
    id: "questionable",
    labelRu: "Намёк",
    hintRu: "Провокация, без гениталий",
  },
  { id: "explicit", labelRu: "Explicit", hintRu: "Секс / гениталии" },
];

export function isBooruRatingId(v: unknown): v is BooruRatingId {
  return (
    typeof v === "string" &&
    (BOORU_RATING_IDS as readonly string[]).includes(v)
  );
}

/** dapi (gelbooru / xbooru / hypnohub) uses Danbooru-style four ratings. */
export function booruRatingUsesLegacySafe(site: BooruSiteId): boolean {
  const api = booruSite(site).api;
  return api === "html01" || api === "html02";
}

/** Gelbooru-style `animated` / `video` search tokens — not on html01/html02. */
export function booruRatingUsesMediaMeta(site: BooruSiteId): boolean {
  return booruSite(site).api === "dapi";
}

/**
 * Search token for the Media-tab rating. html01/html02 map general+sensitive
 * to `rating:safe` (no `rating:sensitive` on those boards).
 */
export function booruRatingToken(
  site: BooruSiteId,
  rating: BooruRatingId,
): string {
  if (booruRatingUsesLegacySafe(site)) {
    switch (rating) {
      case "general":
      case "sensitive":
        return "rating:safe";
      case "questionable":
        return "rating:questionable";
      case "explicit":
        return "rating:explicit";
      default: {
        const _never: never = rating;
        return _never;
      }
    }
  }
  switch (rating) {
    case "general":
      return "rating:general";
    case "sensitive":
      return "rating:sensitive";
    case "questionable":
      return "rating:questionable";
    case "explicit":
      return "rating:explicit";
    default: {
      const _never: never = rating;
      return _never;
    }
  }
}

/** Drop existing `rating:` tokens, then prepend the Media-tab rating. */
export function applyBooruRatingToQuery(
  tags: string,
  site: BooruSiteId,
  rating: BooruRatingId,
): string {
  const token = booruRatingToken(site, rating);
  const rest = tags
    .trim()
    .split(/\s+/)
    .filter((t) => t && !t.toLowerCase().startsWith("rating:"));
  return [token, ...rest].join(" ").replace(/\s+/g, " ").trim();
}

/**
 * Empty compose fallback: rating token only. Never injects `1girl`.
 * realbooru's browse default `all` stays if the query would otherwise be
 * rating-only on a board that needs a tag.
 */
export function booruEmptyComposeQuery(
  site: BooruSiteId,
  rating: BooruRatingId,
): string {
  const token = booruRatingToken(site, rating);
  if (site === "realbooru") {
    return `${token} all`.trim();
  }
  return token;
}
