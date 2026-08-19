/**
 * Pure RU copy + view-models for Like → taste → shop/wagers discoverability.
 * Does not touch IndexedDB or wallet — callers pass already-built taste / counts.
 */

import type { FavoriteTasteProfile, TasteTag } from "./favoriteTagTaste";

export type TasteLoopNavId = "favorites" | "shop" | "session" | "roulette";

export type TasteLoopCta = {
  id: TasteLoopNavId;
  labelRu: string;
  ghost?: boolean;
};

export type TastePassportTag = {
  tag: string;
  label: string;
  count: number;
};

export type TastePassportView = {
  likeCount: number;
  topTags: TastePassportTag[];
  titleRu: string;
  explanationRu: string;
  hasTaste: boolean;
};

/** Russian plural for «лайк» (nominative count: 1 лайк, 2 лайка, 5 лайков). */
export function likesWordRu(n: number): string {
  const abs = Math.abs(Math.floor(n)) % 100;
  const d = abs % 10;
  if (abs > 10 && abs < 20) return "лайков";
  if (d === 1) return "лайк";
  if (d >= 2 && d <= 4) return "лайка";
  return "лайков";
}

/** Genitive after «из»: из 1 лайка, из 2 лайков, из 5 лайков. */
export function likesWordGenitiveRu(n: number): string {
  const abs = Math.abs(Math.floor(n)) % 100;
  const d = abs % 10;
  if (abs > 10 && abs < 20) return "лайков";
  if (d === 1) return "лайка";
  return "лайков";
}

export function formatLikesCountRu(n: number): string {
  const count = Math.max(0, Math.floor(n));
  return `${count} ${likesWordRu(count)}`;
}

/** Shop dyn_tag badge: «из 3 лайков». */
export function shopOfferFromLikesRu(count: number): string {
  const n = Math.max(1, Math.floor(count));
  return `из ${n} ${likesWordGenitiveRu(n)}`;
}

/** Dyn_tag card description. */
export function shopDynTagDescRu(tag: string, count: number): string {
  const safe = tag.trim() || "tag";
  return `Тег «${safe}» · ${shopOfferFromLikesRu(count)}.`;
}

export function shopFavoritesShelfEmptyRu(): string {
  return "Полка пуста — вкус ещё не собран.";
}

export function shopFavoritesShelfEmptyHintRu(): string {
  return "Лайкай посты в сессии (Gelbooru) — витрина подтянется из избранного.";
}

export function tasteChipRu(likeCount: number): string | null {
  const n = Math.max(0, Math.floor(likeCount));
  if (n <= 0) return null;
  return `вкус: ${formatLikesCountRu(n)}`;
}

function tagLabel(tag: string): string {
  return tag.replace(/_/g, " ");
}

function toPassportTags(tags: TasteTag[], topN: number): TastePassportTag[] {
  return tags.slice(0, Math.max(0, topN)).map((t) => ({
    tag: t.tag,
    label: tagLabel(t.tag),
    count: t.count,
  }));
}

export function buildTastePassportView(
  profile: FavoriteTasteProfile,
  opts?: { topN?: number },
): TastePassportView {
  const topN = opts?.topN ?? 6;
  const likeCount = Math.max(0, Math.floor(profile.sampleSize));
  const topTags = toPassportTags(profile.liked, topN);
  const hasTaste = likeCount > 0 && topTags.length > 0;

  if (likeCount <= 0) {
    return {
      likeCount: 0,
      topTags: [],
      titleRu: "Вкус",
      explanationRu:
        "Лайкай в сессии — топ-теги начнут смещать рулетку, ставки и полку магазина.",
      hasTaste: false,
    };
  }

  if (!hasTaste) {
    return {
      likeCount,
      topTags: [],
      titleRu: "Вкус",
      explanationRu: `Есть ${formatLikesCountRu(likeCount)}, но без тегов вкус ещё слепой — лайкай посты с тегами.`,
      hasTaste: false,
    };
  }

  return {
    likeCount,
    topTags,
    titleRu: "Вкус",
    explanationRu: `${formatLikesCountRu(likeCount)} смещают рулетку, ставки и полку магазина.`,
    hasTaste: true,
  };
}

/** One-line hint under Taste Passport CTAs. */
export function tastePassportCtaHintRu(): string {
  return "Лайки в сессии усиливают вкус и полку магазина";
}

/** Favorites page CTAs when the loop should be discoverable. */
export function favoritesTasteLoopCtas(opts: {
  likeCount: number;
  hasTasteTags: boolean;
}): TasteLoopCta[] {
  const likeCount = Math.max(0, Math.floor(opts.likeCount));
  if (likeCount <= 0) {
    return [
      { id: "session", labelRu: "Собрать лайки в сессии" },
      { id: "roulette", labelRu: "К рулетке", ghost: true },
    ];
  }
  const ctas: TasteLoopCta[] = [{ id: "shop", labelRu: "В магазин" }];
  if (!opts.hasTasteTags) {
    ctas.unshift({ id: "session", labelRu: "Собрать лайки в сессии" });
  } else {
    ctas.push({
      id: "session",
      labelRu: "Лайкать в сессии",
      ghost: true,
    });
  }
  return ctas;
}

/** Shop favorites-shelf CTAs (empty or populated). */
export function shopTasteLoopCtas(opts: {
  shelfEmpty: boolean;
  likeCount: number;
}): TasteLoopCta[] {
  const likeCount = Math.max(0, Math.floor(opts.likeCount));
  if (opts.shelfEmpty) {
    if (likeCount <= 0) {
      return [
        { id: "session", labelRu: "Лайкать в сессии" },
        { id: "favorites", labelRu: "К избранному", ghost: true },
      ];
    }
    return [
      { id: "favorites", labelRu: "К избранному" },
      { id: "session", labelRu: "Лайкать в сессии", ghost: true },
    ];
  }
  return [
    { id: "favorites", labelRu: "К избранному", ghost: true },
  ];
}
