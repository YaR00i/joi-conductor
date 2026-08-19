/**
 * Mood-based 12-slot fetish tag wheel for plan roulette.
 * Bought favorites / mid / disliked-rare; shortfall → unbought but locked.
 */
import {
  isFetishUnlocked,
  type ContentUnlockLists,
} from "./contentUnlocks";
import type { FavoriteTasteProfile, TasteTag } from "./favoriteTagTaste";
import {
  allResolvedFetishEntries,
  loadRouletteSettings,
  type RouletteSettings,
} from "./rouletteSettings";
import type { SessionMood } from "./types";

type TagRouletteOption = {
  id: string;
  labelRu: string;
  weight?: number;
  color?: string;
  payload?: Record<string, unknown>;
  unlocked?: boolean;
};

type TagRouletteStep = {
  id: "tags";
  titleRu: string;
  speakEn: string;
  options: TagRouletteOption[];
};

export type TagMoodBand = "good" | "normal" | "bad";

export type TagSlotKind = "fav" | "mid" | "dislike";

type TagCandidate = {
  id: string;
  tag: string;
  labelRu: string;
  kind: TagSlotKind;
  bought: boolean;
  count: number;
};

const COLORS_FAV = ["#2fbf6a", "#3d7ea6", "#0d9488", "#e6b422", "#8b5cf6"];
const COLORS_MID = ["#c45c26", "#db2777", "#f59e0b"];
const COLORS_DISLIKE = ["#e04545", "#9f1239", "#7f1d1d"];

export function tagMoodBand(mood: SessionMood): TagMoodBand {
  switch (mood) {
    case "sweet":
    case "calm":
      return "good";
    case "horny":
    case "bored":
      return "normal";
    case "cruel":
    case "chaotic":
      return "bad";
    default: {
      const _exhaustive: never = mood;
      return _exhaustive;
    }
  }
}

/** How many fav / mid / dislike slots for a 12-slice wheel. */
export function tagSlotPlan(band: TagMoodBand): {
  fav: number;
  mid: number;
  dislike: number;
} {
  switch (band) {
    case "good":
      return { fav: 9, mid: 0, dislike: 3 };
    case "normal":
      return { fav: 6, mid: 3, dislike: 3 };
    case "bad":
      return { fav: 3, mid: 3, dislike: 6 };
    default: {
      const _exhaustive: never = band;
      return _exhaustive;
    }
  }
}

function tagLabel(tag: string): string {
  return tag.replace(/_/g, " ");
}

function boughtTagSet(unlocks: ContentUnlockLists): Set<string> {
  const set = new Set<string>();
  for (const t of unlocks.unlockedTags ?? []) {
    const k = t.trim().toLowerCase();
    if (k) set.add(k);
  }
  // Unlocked catalog fetishes → their gelbooru tokens count as bought
  const settings = loadRouletteSettings();
  for (const f of allResolvedFetishEntries(settings)) {
    if (!isFetishUnlocked(f.id, unlocks)) continue;
    for (const tok of f.tags.split(/\s+/)) {
      const bare = tok.replace(/^-/, "").toLowerCase();
      if (!bare || bare.startsWith("rating:") || bare.startsWith("sort:")) {
        continue;
      }
      set.add(bare);
    }
  }
  return set;
}

function catalogFillCandidates(
  settings: RouletteSettings,
  unlocks: ContentUnlockLists,
  bought: Set<string>,
): TagCandidate[] {
  const out: TagCandidate[] = [];
  const seen = new Set<string>();
  for (const f of allResolvedFetishEntries(settings)) {
    const unlocked = isFetishUnlocked(f.id, unlocks);
    for (const tok of f.tags.split(/\s+/)) {
      const bare = tok.replace(/^-/, "").toLowerCase();
      if (!bare || bare.startsWith("rating:") || bare.startsWith("sort:")) {
        continue;
      }
      if (seen.has(bare)) continue;
      seen.add(bare);
      out.push({
        id: `cat_${bare}`,
        tag: bare,
        labelRu: f.labelRu,
        kind: "fav",
        bought: unlocked || bought.has(bare),
        count: unlocked ? 2 : 0,
      });
    }
  }
  return out;
}

function splitLikedByFrequency(liked: TasteTag[]): {
  fav: TasteTag[];
  mid: TasteTag[];
} {
  if (liked.length === 0) return { fav: [], mid: [] };
  const sorted = [...liked].sort((a, b) => b.count - a.count);
  const third = Math.max(1, Math.ceil(sorted.length / 3));
  return {
    fav: sorted.slice(0, Math.max(third, Math.min(9, sorted.length))),
    mid: sorted.slice(Math.max(third, Math.min(9, sorted.length))),
  };
}

function toCandidates(
  tags: TasteTag[],
  kind: TagSlotKind,
  bought: Set<string>,
): TagCandidate[] {
  return tags.map((t) => {
    const key = t.tag.toLowerCase();
    return {
      id: `${kind}_${key}`,
      tag: key,
      labelRu: tagLabel(key),
      kind,
      bought: bought.has(key),
      count: t.count,
    };
  });
}

function takeSlots(
  need: number,
  kind: TagSlotKind,
  preferred: TagCandidate[],
  fallback: TagCandidate[],
  used: Set<string>,
): TagCandidate[] {
  const out: TagCandidate[] = [];
  const tryTake = (pool: TagCandidate[], requireBought: boolean | null) => {
    for (const c of pool) {
      if (out.length >= need) return;
      if (used.has(c.tag)) continue;
      if (requireBought === true && !c.bought) continue;
      if (requireBought === false && c.bought) continue;
      used.add(c.tag);
      out.push({ ...c, kind });
    }
  };
  // Prefer bought for fav/mid; for dislike bought-or-not is fine
  if (kind === "dislike") {
    tryTake(preferred, null);
    tryTake(fallback, null);
  } else {
    tryTake(preferred, true);
    tryTake(fallback, true);
    // shortfall → unbought (locked on wheel)
    tryTake(preferred, false);
    tryTake(fallback, false);
  }
  return out;
}

export function buildMoodFetishTagStep(
  mood: SessionMood,
  taste: FavoriteTasteProfile,
  unlocks: ContentUnlockLists,
  settings: RouletteSettings = loadRouletteSettings(),
): TagRouletteStep {
  const band = tagMoodBand(mood);
  const plan = tagSlotPlan(band);
  const bought = boughtTagSet(unlocks);
  const { fav: favLiked, mid: midLiked } = splitLikedByFrequency(taste.liked);
  const dislikePool = toCandidates(taste.disliked, "dislike", bought);
  const favPool = toCandidates(favLiked, "fav", bought);
  const midPool = toCandidates(midLiked, "mid", bought);
  const catalog = catalogFillCandidates(settings, unlocks, bought);

  const used = new Set<string>();
  const picked: TagCandidate[] = [
    ...takeSlots(plan.fav, "fav", favPool, catalog, used),
    ...takeSlots(plan.mid, "mid", midPool, catalog, used),
    ...takeSlots(
      plan.dislike,
      "dislike",
      dislikePool,
      catalog.map((c) => ({ ...c, kind: "dislike" as const })),
      used,
    ),
  ];

  // Pad to 12 if still short
  while (picked.length < 12) {
    const filler = catalog.find((c) => !used.has(c.tag));
    if (!filler) break;
    used.add(filler.tag);
    picked.push({
      ...filler,
      kind: picked.length < plan.fav + plan.mid ? "mid" : "dislike",
    });
  }

  const options: TagRouletteOption[] = picked.slice(0, 12).map((c, i) => {
    const dislikeMark = c.kind === "dislike";
    // Disliked/rare must be landable (Hu Tao mocks). Unbought fav/mid stay locked.
    const unlocked = dislikeMark ? true : c.bought;
    let labelRu = c.labelRu;
    if (dislikeMark) labelRu = `${labelRu} · нелюбимое`;
    if (!unlocked) labelRu = `${labelRu} · закрыто`;
    const color = !unlocked
      ? "#3a3a3a"
      : dislikeMark
        ? COLORS_DISLIKE[i % COLORS_DISLIKE.length]!
        : c.kind === "mid"
          ? COLORS_MID[i % COLORS_MID.length]!
          : COLORS_FAV[i % COLORS_FAV.length]!;
    return {
      id: c.id,
      labelRu,
      weight: dislikeMark ? 0.9 : unlocked ? 1.15 : 1,
      color,
      unlocked,
      payload: {
        tags: c.tag,
        preferKey: c.tag,
        tagKind: c.kind,
        disliked: dislikeMark,
        bought: c.bought,
      },
    };
  });

  if (options.length === 0) {
    options.push({
      id: "fallback_tag",
      labelRu: "looking at viewer",
      weight: 1,
      color: COLORS_FAV[0],
      unlocked: true,
      payload: {
        tags: "looking_at_viewer",
        preferKey: "looking_at_viewer",
        tagKind: "fav",
        disliked: false,
        bought: true,
      },
    });
  }

  const bandRu =
    band === "good" ? "мягкий" : band === "bad" ? "злой" : "обычный";

  return {
    id: "tags",
    titleRu: `Фетиш-теги · ${bandRu} пул`,
    speakEn:
      band === "bad"
        ? "Your likes… and the ones you hate. I stacked the deck."
        : band === "good"
          ? "Mostly your favorites. A little spice, maybe."
          : "Favorites, middling, and a few you avoid.",
    options,
  };
}

/** Placeholder tags step until mood is known. */
export function buildPlaceholderTagStep(): TagRouletteStep {
  return {
    id: "tags",
    titleRu: "Фетиш-теги",
    speakEn: "Tags after I pick my mood…",
    options: [
      {
        id: "tags_pending",
        labelRu: "Соберу после настроения…",
        weight: 1,
        color: "#3a3a3a",
        unlocked: false,
        payload: { tags: "", pending: true },
      },
    ],
  };
}
