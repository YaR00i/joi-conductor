import {
  collectFavoriteTagStats,
  listFavoriteMetadata,
  type FavoriteRecord,
} from "./mediaFavorites";
import type { FetishPrefs, MistressPromptDef } from "./mistressPrompts";
import { isJunkBooruTag } from "./shopTagNoise";

/** Meta / quality / count tags that should not drive taste or wagers. */
const NOISE_TAGS = new Set(
  [
    "1girl",
    "2girls",
    "3girls",
    "4girls",
    "5girls",
    "6+girls",
    "multiple_girls",
    "1boy",
    "2boys",
    "3boys",
    "multiple_boys",
    "solo",
    "duo",
    "group",
    "male_focus",
    "female_focus",
    "looking_at_viewer",
    "from_above",
    "from_below",
    "from_side",
    "cowboy_shot",
    "upper_body",
    "full_body",
    "portrait",
    "close-up",
    "simple_background",
    "white_background",
    "gradient_background",
    "highres",
    "absurdres",
    "incredibly_absurdres",
    "lowres",
    "blurry",
    "jpeg_artifacts",
    "watermark",
    "artist_name",
    "signature",
    "commentary",
    "translated",
    "english_commentary",
    "commission",
    "patreon_username",
    "twitter_username",
    "pixiv_id",
    "animated",
    "video",
    "webm",
    "mp4",
    "gif",
    "sound",
    "nude",
    "completely_nude",
    "clothes",
    "clothing",
    "bare_shoulders",
    "bare_arms",
    "bare_legs",
    "long_hair",
    "short_hair",
    "blonde_hair",
    "black_hair",
    "brown_hair",
    "white_hair",
    "pink_hair",
    "blue_hair",
    "red_hair",
    "purple_hair",
    "green_hair",
    "grey_hair",
    "silver_hair",
    "ahoge",
    "twintails",
    "ponytail",
    "bangs",
    "blue_eyes",
    "red_eyes",
    "brown_eyes",
    "green_eyes",
    "purple_eyes",
    "yellow_eyes",
    "heterochromia",
    "open_mouth",
    "closed_mouth",
    "smile",
    "blush",
    "sweat",
    "tongue",
    "tongue_out",
    "teeth",
    "breasts",
    "large_breasts",
    "medium_breasts",
    "small_breasts",
    "nipples",
    "pussy",
    "ass",
    "thighs",
    "navel",
    "collarbone",
  ].map((t) => t.toLowerCase()),
);

/**
 * Common fetish / vibe tags used as "not in your likes" bait for harsh mood.
 * Only offered when absent (or very rare) in favorites.
 */
const CONTRAST_CANDIDATES = [
  "covered_eyes",
  "huge_penis",
  "big_penis",
  "ahegao",
  "bondage",
  "bdsm",
  "gangbang",
  "netorare",
  "cuckold",
  "femdom",
  "futanari",
  "monster",
  "tentacles",
  "inflation",
  "pregnant",
  "lactation",
  "public",
  "exhibitionism",
  "toilet",
  "mind_break",
  "slave",
  "collar",
  "leash",
  "pet_play",
  "ugly_bastard",
  "body_writing",
  "cum_inflation",
  "excessive_cum",
  "bukkake",
  "facial",
  "cum_in_mouth",
  "cum_in_pussy",
  "creampie",
  "after_sex",
  "used_condom",
  "condom",
  "choking",
  "spit",
  "armpits",
  "feet",
  "foot_focus",
  "soles",
  "smelling_feet",
  "pee",
  "watersports",
];

export type TasteTag = {
  tag: string;
  count: number;
};

export type FavoriteTasteProfile = {
  liked: TasteTag[];
  disliked: TasteTag[];
  prefsSeed: FetishPrefs;
  sampleSize: number;
};

function isNoiseTag(tag: string): boolean {
  const t = tag.toLowerCase();
  if (NOISE_TAGS.has(t)) return true;
  if (isJunkBooruTag(t)) return true;
  if (t.startsWith("rating:")) return true;
  if (t.startsWith("score:")) return true;
  if (t.startsWith("sort:")) return true;
  if (t.startsWith("width:")) return true;
  if (t.startsWith("height:")) return true;
  if (/^\d+$/.test(t)) return true;
  return false;
}

function tagLabel(tag: string): string {
  return tag.replace(/_/g, " ");
}

export function filterTasteTags(
  stats: { tag: string; count: number }[],
): TasteTag[] {
  return stats
    .filter((s) => !isNoiseTag(s.tag))
    .map((s) => ({ tag: s.tag, count: s.count }));
}

export function buildFavoriteTasteProfile(
  records: Array<Pick<FavoriteRecord, "tags">>,
  opts?: { likedTop?: number; dislikedTop?: number },
): FavoriteTasteProfile {
  const likedTop = opts?.likedTop ?? 12;
  const dislikedTop = opts?.dislikedTop ?? 8;
  const withTags = records.filter(
    (r) => (r.tags?.trim().length ?? 0) > 0,
  );
  const stats = filterTasteTags(collectFavoriteTagStats(withTags));
  const liked = stats.slice(0, likedTop);

  const likedSet = new Set(liked.map((t) => t.tag.toLowerCase()));
  const rareSet = new Set(
    stats.filter((t) => t.count <= 1).map((t) => t.tag.toLowerCase()),
  );

  const disliked: TasteTag[] = [];
  for (const cand of CONTRAST_CANDIDATES) {
    const key = cand.toLowerCase();
    if (likedSet.has(key)) continue;
    // Prefer tags user never (or barely) liked
    const hit = stats.find((s) => s.tag.toLowerCase() === key);
    if (hit && hit.count >= 3) continue;
    disliked.push({ tag: cand, count: hit?.count ?? 0 });
    if (disliked.length >= dislikedTop) break;
  }

  // If still thin, pull rare tags from favorites as "weak / not really yours"
  if (disliked.length < Math.min(4, dislikedTop)) {
    for (const s of [...stats].reverse()) {
      if (!rareSet.has(s.tag.toLowerCase())) continue;
      if (likedSet.has(s.tag.toLowerCase())) continue;
      if (disliked.some((d) => d.tag.toLowerCase() === s.tag.toLowerCase())) {
        continue;
      }
      disliked.push(s);
      if (disliked.length >= dislikedTop) break;
    }
  }

  const prefsSeed: FetishPrefs = {};
  liked.forEach((t, i) => {
    prefsSeed[t.tag] = Math.max(2, 10 - i);
  });
  disliked.forEach((t, i) => {
    prefsSeed[t.tag] = Math.min(-2, -3 - Math.floor(i / 2));
  });
  if (liked.length > 0) prefsSeed.favorite_tag = 4;
  if (disliked.length > 0) prefsSeed.unliked_tag = -3;

  return {
    liked,
    disliked,
    prefsSeed,
    // The passport says "in favorites", so untagged media still belongs in
    // this total. Only tag ranking is limited to records that have tags.
    sampleSize: records.length,
  };
}

export function buildTasteWagers(
  profile: FavoriteTasteProfile,
  opts?: { unlockedTags?: string[] },
): { good: MistressPromptDef[]; bad: MistressPromptDef[] } {
  const unlocked = (opts?.unlockedTags ?? [])
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t && !isNoiseTag(t));

  const likedExtra: TasteTag[] = [];
  for (const tag of unlocked) {
    if (profile.liked.some((l) => l.tag.toLowerCase() === tag)) continue;
    likedExtra.push({ tag, count: 2 });
  }

  const likedPool = [...profile.liked, ...likedExtra];
  if (profile.sampleSize < 2 && likedPool.length === 0 && unlocked.length === 0) {
    return { good: [], bad: [] };
  }

  const goodSource =
    likedPool.length > 0
      ? likedPool.slice(0, 10)
      : unlocked.slice(0, 8).map((tag) => ({ tag, count: 1 }));

  const good: MistressPromptDef[] = goodSource.map((t, i) => {
    const label = tagLabel(t.tag);
    return {
      id: `wg_fav_${t.tag.toLowerCase().replace(/[^a-z0-9_]/g, "_")}_${i}`,
      kind: "wager",
      pool: "good",
      preferKeys: [t.tag, "favorite_tag"],
      moods: ["sweet", "horny", "calm", "chaotic"],
      speakEn: `Your likes keep whispering "${label}". Switch the feed to that?`,
      labelRu: `Показать на экране то, что тебе нравится: «${label}»?`,
      tags: `rating:explicit ${t.tag}`,
      options: [
        { id: "yes", labelRu: "Да", effect: "wager_yes" },
        { id: "no", labelRu: "Нет", effect: "wager_no" },
        { id: "mute", labelRu: "Не отвечу", effect: "mute" },
      ],
    };
  });

  const bad: MistressPromptDef[] = profile.disliked.slice(0, 8).map((t, i) => {
    const label = tagLabel(t.tag);
    return {
      id: `wb_unfav_${t.tag.toLowerCase().replace(/[^a-z0-9_]/g, "_")}_${i}`,
      kind: "wager",
      pool: "bad",
      preferKeys: [t.tag, "unliked_tag"],
      moods: ["cruel", "chaotic", "bored", "horny"],
      speakEn: `You barely ever like "${label}". Still — switch the screen to that?`,
      labelRu: `Показать на экране то, что обычно не твоё: «${label}»?`,
      tags: `rating:explicit ${t.tag}`,
      options: [
        { id: "yes", labelRu: "Да", effect: "wager_yes" },
        { id: "no", labelRu: "Нет", effect: "wager_no" },
        { id: "mute", labelRu: "Не отвечу", effect: "mute" },
      ],
    };
  });

  return { good, bad };
}

/**
 * Build bad wagers from tags on media the user skipped quickly.
 * Prefer tags that are not in favorites / unlocked likes.
 */
export function buildSkipTagWagers(
  skippedTags: string[],
  opts?: {
    likedTags?: string[];
    unlockedTags?: string[];
    max?: number;
  },
): MistressPromptDef[] {
  const max = opts?.max ?? 6;
  const blocked = new Set(
    [...(opts?.likedTags ?? []), ...(opts?.unlockedTags ?? [])].map((t) =>
      t.toLowerCase(),
    ),
  );
  const counts = new Map<string, number>();
  for (const raw of skippedTags) {
    const tag = raw.trim().toLowerCase();
    if (!tag || isNoiseTag(tag) || blocked.has(tag)) continue;
    counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  const ranked = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, max);
  return ranked.map(([tag], i) => {
    const label = tagLabel(tag);
    return {
      id: `wb_skip_${tag.replace(/[^a-z0-9_]/g, "_")}_${i}`,
      kind: "wager",
      pool: "bad",
      preferKeys: [tag, "unliked_tag", "skip_tag"],
      moods: ["cruel", "chaotic", "bored", "horny"],
      speakEn: `You skipped past "${label}" fast. Still — put it on screen?`,
      labelRu: `Ты быстро листал мимо «${label}». Показать это на экране?`,
      tags: `rating:explicit ${tag}`,
      options: [
        { id: "yes", labelRu: "Да", effect: "wager_yes" },
        { id: "no", labelRu: "Нет", effect: "wager_no" },
        { id: "mute", labelRu: "Не отвечу", effect: "mute" },
      ],
    };
  });
}

export async function loadFavoriteTasteProfile(): Promise<FavoriteTasteProfile> {
  const records = await listFavoriteMetadata();
  return buildFavoriteTasteProfile(records);
}
