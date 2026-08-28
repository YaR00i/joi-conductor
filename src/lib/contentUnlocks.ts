/**
 * Base content unlocks + helpers for fetish / mode / mood / character gating.
 */

import {
  CHARACTER_CATALOG,
  type ContentCharacterId,
  type ContentMediaTypeId,
} from "./contentCatalog";
import {
  FETISH_HARD,
  FETISH_LIGHT,
  FETISH_MEDIUM,
  FETISH_SADISTIC,
  type FetishEntry,
  type FetishTier,
} from "./fetishCatalog";
import { TAG_PACKS } from "./tagPackCatalog";
import type { SessionMode, SessionMood } from "./types";

/** Minimal unlock lists (matches WalletUnlocks content fields). */
export type ContentUnlockLists = {
  fetishIds: string[];
  characterIds: string[];
  mediaTypeIds: string[];
  modeIds: string[];
  moodIds: string[];
  /** Dynamically purchased gelbooru tags from the favorites shop. */
  unlockedTags: string[];
  /** Bought shop tag packs (e.g. hutao_ember). */
  tagPacks?: string[];
  /** Shop-unlocked function ids (for mistress pack gates). */
  functionIds?: string[];
  /** Shop feature keys (soul keys, breath_hold, …). */
  featureIds?: string[];
  /**
   * Tags currently on the favorites shop shelf (gated until bought).
   * Not persisted on wallet.unlocks — merged in UI from shopOfferTags.
   */
  pendingShopTags?: string[];
};

export const BASE_FETISH_IDS = [
  "light_breasts",
  "light_ass",
  "light_thighs",
  "light_cleavage",
  "light_lingerie",
  "light_panties",
  "light_beauty",
  "light_nude",
] as const;

export const BASE_CHARACTER_IDS: ContentCharacterId[] = ["girl"];

export const BASE_MEDIA_TYPE_IDS: ContentMediaTypeId[] = [
  "photo",
  "photo_gifs",
  "list",
];

export const BASE_MODE_IDS: SessionMode[] = ["stroke"];

export const BASE_MOOD_IDS: SessionMood[] = ["sweet", "calm", "horny"];

export type ContentUnlockCatalogEntry = FetishEntry & { tier: FetishTier };

const ALL_FETISHES: ContentUnlockCatalogEntry[] = [
  ...FETISH_LIGHT.map((f) => ({ ...f, tier: "light" as const })),
  ...FETISH_MEDIUM.map((f) => ({ ...f, tier: "medium" as const })),
  ...FETISH_HARD.map((f) => ({ ...f, tier: "hard" as const })),
  ...FETISH_SADISTIC.map((f) => ({ ...f, tier: "sadistic" as const })),
];

const FETISH_BY_ID = new Map(ALL_FETISHES.map((f) => [f.id, f]));

/** Primary gelbooru token → fetish entries that use it. */
const FETISH_BY_TAG = new Map<string, ContentUnlockCatalogEntry[]>();
for (const f of ALL_FETISHES) {
  for (const tok of f.tags.split(/\s+/).filter(Boolean)) {
    if (tok.startsWith("rating:")) continue;
    const key = tok.toLowerCase();
    const list = FETISH_BY_TAG.get(key) ?? [];
    list.push(f);
    FETISH_BY_TAG.set(key, list);
  }
}

const CHARACTER_BY_TAG = new Map<string, ContentCharacterId>();
for (const c of CHARACTER_CATALOG) {
  for (const tok of c.tags.split(/\s+/).filter(Boolean)) {
    CHARACTER_BY_TAG.set(tok.toLowerCase(), c.id);
  }
}

export function allFetishCatalog(): ContentUnlockCatalogEntry[] {
  return ALL_FETISHES.slice();
}

export function findFetishById(
  id: string,
): ContentUnlockCatalogEntry | undefined {
  return FETISH_BY_ID.get(id);
}

export function fetishTierCost(tier: FetishTier): number {
  switch (tier) {
    case "light":
      return 18;
    case "medium":
      return 26;
    case "hard":
      return 34;
    case "sadistic":
      return 42;
    default: {
      const _exhaustive: never = tier;
      return _exhaustive;
    }
  }
}

export function isFetishUnlocked(
  fetishId: string,
  unlocks: ContentUnlockLists,
): boolean {
  if ((BASE_FETISH_IDS as readonly string[]).includes(fetishId)) return true;
  return unlocks.fetishIds.includes(fetishId);
}

export function isCharacterUnlocked(
  characterId: string,
  unlocks: ContentUnlockLists,
): boolean {
  if ((BASE_CHARACTER_IDS as readonly string[]).includes(characterId)) {
    return true;
  }
  return unlocks.characterIds.includes(characterId);
}

export function isMediaTypeUnlocked(
  mediaTypeId: string,
  unlocks: ContentUnlockLists,
): boolean {
  if ((BASE_MEDIA_TYPE_IDS as readonly string[]).includes(mediaTypeId)) {
    return true;
  }
  return unlocks.mediaTypeIds.includes(mediaTypeId);
}

export function isModeUnlocked(
  mode: SessionMode,
  unlocks: ContentUnlockLists,
): boolean {
  if ((BASE_MODE_IDS as readonly string[]).includes(mode)) return true;
  return unlocks.modeIds.includes(mode);
}

export function isMoodUnlocked(
  mood: SessionMood,
  unlocks: ContentUnlockLists,
): boolean {
  if ((BASE_MOOD_IDS as readonly string[]).includes(mood)) return true;
  return unlocks.moodIds.includes(mood);
}

export function matchFetishesForTag(
  tag: string,
): ContentUnlockCatalogEntry[] {
  return FETISH_BY_TAG.get(tag.toLowerCase()) ?? [];
}

/** Whether a gelbooru token is shop-gated and currently unlocked. */
export type TagPurchaseStatus = "unlocked" | "locked" | "free";

function pendingShopTagSet(unlocks: ContentUnlockLists): Set<string> {
  return new Set(
    (unlocks.pendingShopTags ?? []).map((t) => t.toLowerCase()),
  );
}

export function isDynamicTagUnlocked(
  tag: string,
  unlocks: ContentUnlockLists,
): boolean {
  const key = tag.toLowerCase().replace(/^-/, "");
  if (unlocks.unlockedTags.some((t) => t.toLowerCase() === key)) return true;
  for (const packId of unlocks.tagPacks ?? []) {
    const pack = TAG_PACKS[packId];
    if (!pack) continue;
    if (
      pack.tags
        .split(/\s+/)
        .some((t) => t.toLowerCase() === key)
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Purchase / unlock status for a single tag token.
 * - catalog / shop-shelf tags → unlocked | locked
 * - everything else → free (always usable)
 */
export function tagPurchaseStatus(
  tag: string,
  unlocks: ContentUnlockLists,
): TagPurchaseStatus {
  const key = tag.toLowerCase().replace(/^-/, "");
  if (!key || key.startsWith("rating:")) return "free";

  if (isDynamicTagUnlocked(key, unlocks)) return "unlocked";

  const charId = CHARACTER_BY_TAG.get(key);
  if (charId) {
    return isCharacterUnlocked(charId, unlocks) ? "unlocked" : "locked";
  }

  const matches = matchFetishesForTag(key);
  if (matches.length > 0) {
    return matches.some((f) => isFetishUnlocked(f.id, unlocks))
      ? "unlocked"
      : "locked";
  }

  if (pendingShopTagSet(unlocks).has(key)) return "locked";
  return "free";
}

export type TagSanitizeResult = {
  tags: string;
  replaced: { from: string; to: string }[];
  modeFixed?: { from: SessionMode; to: SessionMode };
  moodFixed?: { from: SessionMood; to: SessionMood };
};

function fallbackUnlockedTag(unlocks: ContentUnlockLists): string {
  for (const id of BASE_FETISH_IDS) {
    const f = FETISH_BY_ID.get(id);
    if (f) {
      const tok = f.tags.split(/\s+/).find((t) => !t.startsWith("rating:"));
      if (tok) return tok;
    }
  }
  void unlocks;
  return "breasts";
}

/**
 * Replace locked fetish / character tokens with unlocked stand-ins.
 * Leaves noise / rating / unknown tags alone.
 */
export function sanitizeMediaTagsForUnlocks(
  tags: string,
  unlocks: ContentUnlockLists,
): TagSanitizeResult {
  const parts = tags.trim().split(/\s+/).filter(Boolean);
  const replaced: { from: string; to: string }[] = [];
  const out: string[] = [];
  const fallback = fallbackUnlockedTag(unlocks);

  for (const tok of parts) {
    if (tok.startsWith("rating:") || tok.startsWith("-")) {
      out.push(tok);
      continue;
    }

    const key = tok.toLowerCase();
    if (isDynamicTagUnlocked(key, unlocks)) {
      out.push(tok);
      continue;
    }

    const charId = CHARACTER_BY_TAG.get(key);
    if (charId && !isCharacterUnlocked(charId, unlocks)) {
      const to = "1girl";
      if (tok !== to) replaced.push({ from: tok, to });
      if (!out.includes(to)) out.push(to);
      continue;
    }

    const matches = matchFetishesForTag(tok);
    if (matches.length > 0) {
      const anyUnlocked = matches.some((f) => isFetishUnlocked(f.id, unlocks));
      if (anyUnlocked) {
        out.push(tok);
        continue;
      }
      if (tok !== fallback) replaced.push({ from: tok, to: fallback });
      if (!out.includes(fallback)) out.push(fallback);
      continue;
    }

    if (pendingShopTagSet(unlocks).has(key)) {
      if (tok !== fallback) replaced.push({ from: tok, to: fallback });
      if (!out.includes(fallback)) out.push(fallback);
      continue;
    }

    out.push(tok);
  }

  return { tags: out.join(" "), replaced };
}

export function sanitizeModeForUnlocks(
  mode: SessionMode,
  unlocks: ContentUnlockLists,
): { mode: SessionMode; fixed: boolean } {
  if (isModeUnlocked(mode, unlocks)) return { mode, fixed: false };
  return { mode: "stroke", fixed: true };
}

export function sanitizeMoodForUnlocks(
  mood: SessionMood,
  unlocks: ContentUnlockLists,
): { mood: SessionMood; fixed: boolean } {
  if (isMoodUnlocked(mood, unlocks)) return { mood, fixed: false };
  return { mood: "sweet", fixed: true };
}

export function formatSanitizeMessage(result: TagSanitizeResult): string | null {
  const bits: string[] = [];
  if (result.replaced.length > 0) {
    const pairs = result.replaced
      .slice(0, 4)
      .map((r) => `«${r.from}» → «${r.to}»`)
      .join(", ");
    bits.push(`теги: ${pairs}`);
  }
  if (result.modeFixed) {
    bits.push(
      `режим «${result.modeFixed.from}» → «${result.modeFixed.to}»`,
    );
  }
  if (result.moodFixed) {
    bits.push(
      `настроение «${result.moodFixed.from}» → «${result.moodFixed.to}»`,
    );
  }
  if (bits.length === 0) return null;
  return `Часть настроек ещё не открыта. Заменил на доступные (${bits.join("; ")}). Остальное — в Магазине.`;
}

export type OwnedLibraryTag = {
  tag: string;
  labelRu: string;
  /** Where the unlock came from */
  source: "shop" | "fetish" | "character" | "pack";
};

/**
 * All gelbooru tags the player can freely use: base + unlocked fetishes /
 * characters + shop-bought dynamic tags + bought tag packs.
 */
export function listOwnedLibraryTags(
  unlocks: ContentUnlockLists,
): OwnedLibraryTag[] {
  const byKey = new Map<string, OwnedLibraryTag>();

  const add = (
    raw: string,
    labelRu: string,
    source: OwnedLibraryTag["source"],
  ) => {
    const tag = raw.trim();
    if (!tag || tag.startsWith("rating:") || tag.startsWith("-")) return;
    const key = tag.toLowerCase();
    const prev = byKey.get(key);
    // Prefer named sources over raw shop tokens
    if (prev && prev.source !== "shop" && source === "shop") return;
    byKey.set(key, {
      tag,
      labelRu: labelRu.trim() || tag.replace(/_/g, " "),
      source,
    });
  };

  for (const f of ALL_FETISHES) {
    if (!isFetishUnlocked(f.id, unlocks)) continue;
    for (const tok of f.tags.split(/\s+/).filter(Boolean)) {
      add(tok, f.labelRu, "fetish");
    }
  }

  for (const c of CHARACTER_CATALOG) {
    if (!isCharacterUnlocked(c.id, unlocks)) continue;
    for (const tok of c.tags.split(/\s+/).filter(Boolean)) {
      add(tok, c.labelRu, "character");
    }
  }

  for (const packId of unlocks.tagPacks ?? []) {
    const pack = TAG_PACKS[packId];
    if (!pack) continue;
    for (const tok of pack.tags.split(/\s+/).filter(Boolean)) {
      add(tok, pack.nameRu, "pack");
    }
  }

  for (const t of unlocks.unlockedTags) {
    add(t, t.replace(/_/g, " "), "shop");
  }

  return [...byKey.values()].sort((a, b) =>
    a.tag.localeCompare(b.tag, "en"),
  );
}

/** Toggle a tag token inside a space-separated booru query. */
export function toggleTagInQuery(tags: string, tag: string): string {
  const key = tag.toLowerCase().replace(/^-/, "");
  if (!key) return tags;
  const parts = tags.trim().split(/\s+/).filter(Boolean);
  const idx = parts.findIndex(
    (p) => p.toLowerCase().replace(/^-/, "") === key,
  );
  if (idx >= 0) {
    return [...parts.slice(0, idx), ...parts.slice(idx + 1)].join(" ");
  }
  return [...parts, tag].join(" ");
}

export function queryHasTag(tags: string, tag: string): boolean {
  const key = tag.toLowerCase().replace(/^-/, "");
  return tags
    .trim()
    .split(/\s+/)
    .some((p) => p.toLowerCase().replace(/^-/, "") === key);
}
