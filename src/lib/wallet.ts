/** Cinders (Угольки) wallet + shop unlocks. */

import {
  findFetishById,
  fetishTierCost,
  isCharacterUnlocked,
  isDynamicTagUnlocked,
  isFetishUnlocked,
  isMediaTypeUnlocked,
  isModeUnlocked,
  isMoodUnlocked,
  type ContentUnlockLists,
} from "./contentUnlocks";
import { TAG_PACKS, tagsForPack } from "./tagPackCatalog";
import type { SessionMode, SessionMood } from "./types";
import {
  ensureAchievementsMigrated,
  loadAchievements,
} from "./achievements";
import {
  featuresGrantedWithMistress,
  isMistressIdUnlocked,
  isSparkleUnlockSatisfied,
  modesGrantedWithMistress,
  type MistressUnlockSnapshot,
} from "./mistress/mistressUnlocks";
import type { MistressId } from "./mistress/types";
import { enableSparkleSecondaryDefaults } from "./mistress/secondaryCache";
import { shopDynTagDescRu } from "./tasteLoopDisplay";

const STORAGE_KEY = "joi-cinders-v1";

/** Cost to buy out of a Hu Tao prompt / dare / promise (no mood penalty). */
export const PROMPT_BRIBE_COST = 12;

/** How much pCum increases per pending cum boost (clamped later). */
export const CUM_BOOST_DELTA = 0.15;

export type { TagPackDef } from "./tagPackCatalog";
export { TAG_PACKS } from "./tagPackCatalog";

export type WalletUnlocks = {
  functionIds: string[];
  patternIds: string[];
  tagPacks: string[];
  fetishIds: string[];
  characterIds: string[];
  mediaTypeIds: string[];
  modeIds: string[];
  moodIds: string[];
  /** Gelbooru tags unlocked via dynamic favorites shop. */
  unlockedTags: string[];
  /** Gated session features (breath hold, etc.). */
  featureIds: string[];
};

/** Auto-built shop row from a favorite tag (+ Google Translate label). */
export type ShopTagOffer = {
  tag: string;
  labelRu: string;
  count: number;
  cost: number;
  /** When the tag maps to a catalog fetish, unlock that id too. */
  fetishId?: string;
};

export type WalletState = {
  balance: number;
  unlocks: WalletUnlocks;
  /** Soft shop bonus: extra beg credits consumed on next session start. */
  pendingBegBonus: number;
  /** +pCum on next session start, then cleared. */
  pendingCumBoost: number;
  /** Dynamic tag offers from favorites (self-building shop shelf). */
  shopOfferTags: ShopTagOffer[];
  /** @deprecated Kept for migration; prefer shopOfferTags. */
  shopOfferFetishIds: string[];
  /** Fingerprint of favorites at last offer sync. */
  favoritesFingerprint: string;
};

export type ShopItemKind =
  | "function"
  | "pattern"
  | "tag_pack"
  | "beg_bonus"
  | "cum_boost"
  | "fetish"
  | "dyn_tag"
  | "mode"
  | "mood"
  | "character"
  | "media_type"
  | "feature";

export type ShopItem = {
  id: string;
  nameRu: string;
  descriptionRu: string;
  cost: number;
  kind: ShopItemKind;
  /** Catalog id or tag-pack key. */
  payload: string;
};

/** Functions locked until bought in the shop. */
export const GATED_FUNCTION_IDS = [
  "plapping",
  "cbt_medium",
  "cbt_cock_thwack",
  "stroke_prone",
  "vibe_assist",
  "hands_off_vibe",
  "vibe_press",
] as const;

/** Patterns locked until bought in the shop. */
export const GATED_PATTERN_IDS = [
  "special_rlgl",
  "special_cluster",
  "special_tease",
] as const;

export const SHOP_CATALOG: ShopItem[] = [
  {
    id: "fn_plapping",
    nameRu: "Шлёпанье",
    descriptionRu: "Разблокирует функцию «plapping» в очереди.",
    cost: 28,
    kind: "function",
    payload: "plapping",
  },
  {
    id: "fn_cbt_medium",
    nameRu: "CBT пожёстче",
    descriptionRu: "Разблокирует средний CBT по яйцам.",
    cost: 36,
    kind: "function",
    payload: "cbt_medium",
  },
  {
    id: "fn_cbt_cock_thwack",
    nameRu: "CBT жёстче по стволу",
    descriptionRu:
      "Плотные шлепки ладонью по стволу на акцент (без клетки).",
    cost: 34,
    kind: "function",
    payload: "cbt_cock_thwack",
  },
  {
    id: "fn_stroke_prone",
    nameRu: "Лёжа на животе",
    descriptionRu:
      "Ход prone (Tide): бёдрами в поверхность без рук. Нужен для Фурины / режима Prone.",
    cost: 22,
    kind: "function",
    payload: "stroke_prone",
  },
  {
    id: "fn_vibe_assist",
    nameRu: "Игра с вибратором",
    descriptionRu: "Разблокирует vibe_assist в очереди.",
    cost: 30,
    kind: "function",
    payload: "vibe_assist",
  },
  {
    id: "fn_hands_off_vibe",
    nameRu: "Руки прочь + вибро",
    descriptionRu: "Разблокирует hands_off_vibe.",
    cost: 32,
    kind: "function",
    payload: "hands_off_vibe",
  },
  {
    id: "fn_vibe_press",
    nameRu: "Wand к клетке",
    descriptionRu: "Разблокирует vibe_press (руки только на игрушке у клетки).",
    cost: 28,
    kind: "function",
    payload: "vibe_press",
  },
  {
    id: "pat_rlgl",
    nameRu: "Стоп / ход",
    descriptionRu: "Паттерн Red/Green light.",
    cost: 24,
    kind: "pattern",
    payload: "special_rlgl",
  },
  {
    id: "pat_cluster",
    nameRu: "Пачка",
    descriptionRu: "Паттерн cluster burst.",
    cost: 24,
    kind: "pattern",
    payload: "special_cluster",
  },
  {
    id: "pat_tease",
    nameRu: "Тизер",
    descriptionRu: "Паттерн tease on/off.",
    cost: 20,
    kind: "pattern",
    payload: "special_tease",
  },
  {
    id: "pack_hutao",
    nameRu: "Пак тегов: Искорки",
    descriptionRu: TAG_PACKS.hutao_ember.tags,
    cost: 16,
    kind: "tag_pack",
    payload: "hutao_ember",
  },
  {
    id: "pack_ruin",
    nameRu: "Пак тегов: Грань",
    descriptionRu: TAG_PACKS.mid_ruin_taste.tags,
    cost: 16,
    kind: "tag_pack",
    payload: "mid_ruin_taste",
  },
  {
    id: "beg_spark",
    nameRu: "Лишняя мольба",
    descriptionRu: "+1 beg-кредит на следующую сессию.",
    cost: 14,
    kind: "beg_bonus",
    payload: "beg",
  },
  {
    id: "cum_boost",
    nameRu: "Шанс кончить ↑",
    descriptionRu: `+${Math.round(CUM_BOOST_DELTA * 100)}% к pCum на следующую сессию.`,
    cost: 18,
    kind: "cum_boost",
    payload: "cum",
  },
  {
    id: "mode_anal",
    nameRu: "Режим: анал",
    descriptionRu: "Открывает режим анал в рулетке и пресетах.",
    cost: 40,
    kind: "mode",
    payload: "anal",
  },
  {
    id: "mode_chastity",
    nameRu: "Режим: клетка",
    descriptionRu: "Открывает chastity-режим.",
    cost: 44,
    kind: "mode",
    payload: "chastity",
  },
  {
    id: "mode_onahole",
    nameRu: "Режим: онахол",
    descriptionRu:
      "Фирменный режим Ху Тао — ход в онахоле под бит (только при активной Ху Тао).",
    cost: 36,
    kind: "mode",
    payload: "onahole",
  },
  {
    id: "mode_cbt",
    nameRu: "Режим: CBT",
    descriptionRu:
      "Tide: удары/сжатия по яйцам в такт. Режим CBT (Фурина) и прогресс Tide.",
    cost: 48,
    kind: "mode",
    payload: "cbt",
  },
  {
    id: "mode_prone",
    nameRu: "Режим: Prone",
    descriptionRu:
      "Tide: стимуляция бёдрами лёжа — член упирается в поверхность, без рук. Только Фурина.",
    cost: 40,
    kind: "mode",
    payload: "prone",
  },
  {
    id: "mode_oral",
    nameRu: "Режим: орал",
    descriptionRu:
      "Горло / репетиция с дилдо + вибро. Режим орал (Санна) — без обычной дрочки.",
    cost: 42,
    kind: "mode",
    payload: "oral",
  },
  {
    id: "mode_plapping",
    nameRu: "Режим: Plapping",
    descriptionRu:
      "Санна: клетка + дилдо — шлепки по яйцам в такт (счётчик). Выдаётся с паком Idol Soft.",
    cost: 40,
    kind: "mode",
    payload: "plapping",
  },
  {
    id: "pack_censored",
    nameRu: "Пак тегов: Censored",
    descriptionRu: TAG_PACKS.censored_court.tags,
    cost: 20,
    kind: "tag_pack",
    payload: "censored_court",
  },
  {
    id: "pack_blacked",
    nameRu: "Пак тегов: Blacked",
    descriptionRu: TAG_PACKS.blacked_court.tags,
    cost: 22,
    kind: "tag_pack",
    payload: "blacked_court",
  },
  {
    id: "char_sissy",
    nameRu: "Архетип: сисси",
    descriptionRu: "Открывает колесо архетипа «сисси».",
    cost: 28,
    kind: "character",
    payload: "sissy",
  },
  {
    id: "key_sparkle_mask",
    nameRu: "Маска Искорки",
    descriptionRu:
      "Ключ дуо Mask Circus: hypno / censored / tease. Вместе с «Клыком Искры» открывает Искорку/Искру.",
    cost: 58,
    kind: "feature",
    payload: "sparkle_mask",
  },
  {
    id: "key_iskra_fang",
    nameRu: "Клык Искры",
    descriptionRu:
      "Ключ дуо Mask Circus: anal / cbt / deny. Вместе с «Маской Искорки» открывает Искорку/Искру.",
    cost: 58,
    kind: "feature",
    payload: "iskra_fang",
  },
  {
    id: "mood_cruel",
    nameRu: "Настроение: злая",
    descriptionRu: "Открывает mood «cruel» в рулетке.",
    cost: 22,
    kind: "mood",
    payload: "cruel",
  },
  {
    id: "mood_chaotic",
    nameRu: "Настроение: хаос",
    descriptionRu: "Открывает mood «chaotic».",
    cost: 22,
    kind: "mood",
    payload: "chaotic",
  },
  {
    id: "mood_bored",
    nameRu: "Настроение: скучающая",
    descriptionRu: "Открывает mood «bored».",
    cost: 18,
    kind: "mood",
    payload: "bored",
  },
  {
    id: "char_trap",
    nameRu: "Архетип: трап",
    descriptionRu: "Открывает колесо архетипа «трап».",
    cost: 28,
    kind: "character",
    payload: "trap",
  },
  {
    id: "char_futanari",
    nameRu: "Архетип: футанари",
    descriptionRu: "Открывает колесо архетипа «футанари».",
    cost: 30,
    kind: "character",
    payload: "futanari",
  },
  {
    id: "media_gifs",
    nameRu: "Медиа: гифки",
    descriptionRu: "Открывает тип медиа «гифки».",
    cost: 16,
    kind: "media_type",
    payload: "gifs",
  },
  {
    id: "media_video",
    nameRu: "Медиа: видео",
    descriptionRu: "Открывает тип медиа «видео».",
    cost: 20,
    kind: "media_type",
    payload: "video",
  },
  {
    id: "media_all",
    nameRu: "Медиа: всё",
    descriptionRu: "Открывает тип медиа без фильтра.",
    cost: 24,
    kind: "media_type",
    payload: "all",
  },
  {
    id: "feat_breath_hold",
    nameRu: "Задержка дыхания",
    descriptionRu:
      "Ходы и челленджи на задержке воздуха: дрочка/эдж/удержание под таймер, счёт и биты. Перед стартом — набор воздуха. Не держи дольше, чем комфортно.",
    cost: 42,
    kind: "feature",
    payload: "breath_hold",
  },
];

/** Features locked until bought. */
export const GATED_FEATURE_IDS = ["breath_hold"] as const;

function readChastitySessionsCompleted(): number {
  try {
    return (
      ensureAchievementsMigrated(loadAchievements()).counters
        .chastitySessionsCompleted ?? 0
    );
  } catch {
    return 0;
  }
}

function unlockSnapshot(
  u: WalletUnlocks,
  chastitySessionsCompleted = readChastitySessionsCompleted(),
): MistressUnlockSnapshot {
  return {
    functionIds: u.functionIds,
    modeIds: u.modeIds,
    characterIds: u.characterIds,
    tagPacks: u.tagPacks,
    featureIds: u.featureIds,
    chastitySessionsCompleted,
  };
}

/** Auto-grant exclusive modes / sparkle FX flags when packs unlock. */
export function syncMistressModeGrants(
  unlocks: WalletUnlocks,
  opts?: { chastitySessionsCompleted?: number },
): WalletUnlocks {
  const cage =
    opts?.chastitySessionsCompleted ?? readChastitySessionsCompleted();
  let modeIds = [...unlocks.modeIds];
  let featureIds = [...unlocks.featureIds];
  const snap = unlockSnapshot(
    { ...unlocks, modeIds, featureIds },
    cage,
  );
  const hadFx = featureIds.includes("sparkle_session_fx");
  const sparkleReady = isSparkleUnlockSatisfied(snap);

  const ids: MistressId[] = ["furina", "sunna", "sparkle", "hu_tao"];
  for (const id of ids) {
    if (!isMistressIdUnlocked(id, snap)) continue;
    for (const mode of modesGrantedWithMistress(id)) {
      if (!modeIds.includes(mode)) modeIds.push(mode);
    }
    for (const feat of featuresGrantedWithMistress(id)) {
      if (!featureIds.includes(feat)) featureIds.push(feat);
    }
  }

  const next = {
    ...unlocks,
    modeIds: [...new Set(modeIds)],
    featureIds: [...new Set(featureIds)],
  };

  if (sparkleReady && !hadFx && next.featureIds.includes("sparkle_session_fx")) {
    enableSparkleSecondaryDefaults();
  }

  return next;
}

/** Snapshot for mistress picker / init from current wallet + lifetime cage sessions. */
export function mistressUnlockSnapshotFromWallet(
  state: WalletState = loadWallet(),
  chastitySessionsCompleted = readChastitySessionsCompleted(),
): MistressUnlockSnapshot {
  return unlockSnapshot(state.unlocks, chastitySessionsCompleted);
}

const EMPTY_UNLOCKS: WalletUnlocks = {
  functionIds: [],
  patternIds: [],
  tagPacks: [],
  fetishIds: [],
  characterIds: [],
  mediaTypeIds: [],
  modeIds: [],
  moodIds: [],
  unlockedTags: [],
  featureIds: [],
};

function strArr(raw: unknown): string[] {
  return Array.isArray(raw)
    ? raw.filter((x): x is string => typeof x === "string")
    : [];
}

function normalizeShopOfferTags(raw: unknown): ShopTagOffer[] {
  if (!Array.isArray(raw)) return [];
  const out: ShopTagOffer[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const o = row as Partial<ShopTagOffer>;
    if (typeof o.tag !== "string" || !o.tag.trim()) continue;
    if (typeof o.labelRu !== "string" || !o.labelRu.trim()) continue;
    const count =
      typeof o.count === "number" && Number.isFinite(o.count)
        ? Math.max(1, Math.floor(o.count))
        : 1;
    const cost =
      typeof o.cost === "number" && Number.isFinite(o.cost)
        ? Math.max(1, Math.floor(o.cost))
        : 20;
    out.push({
      tag: o.tag.trim().toLowerCase(),
      labelRu: o.labelRu.trim(),
      count,
      cost,
      fetishId:
        typeof o.fetishId === "string" && o.fetishId.trim()
          ? o.fetishId.trim()
          : undefined,
    });
  }
  return out;
}

export function emptyWallet(): WalletState {
  return {
    balance: 0,
    unlocks: { ...EMPTY_UNLOCKS },
    pendingBegBonus: 0,
    pendingCumBoost: 0,
    shopOfferTags: [],
    shopOfferFetishIds: [],
    favoritesFingerprint: "",
  };
}

function normalizeUnlocks(raw: unknown): WalletUnlocks {
  const u = (raw ?? {}) as Partial<WalletUnlocks>;
  return syncMistressModeGrants({
    functionIds: strArr(u.functionIds),
    patternIds: strArr(u.patternIds),
    tagPacks: strArr(u.tagPacks),
    fetishIds: strArr(u.fetishIds),
    characterIds: strArr(u.characterIds),
    mediaTypeIds: strArr(u.mediaTypeIds),
    modeIds: strArr(u.modeIds),
    moodIds: strArr(u.moodIds),
    unlockedTags: strArr(u.unlockedTags).map((t) => t.toLowerCase()),
    featureIds: strArr(u.featureIds),
  });
}

export function loadWallet(): WalletState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyWallet();
    const parsed = JSON.parse(raw) as Partial<WalletState>;
    return {
      balance:
        typeof parsed.balance === "number" && Number.isFinite(parsed.balance)
          ? Math.max(0, Math.floor(parsed.balance))
          : 0,
      unlocks: normalizeUnlocks(parsed.unlocks),
      pendingBegBonus:
        typeof parsed.pendingBegBonus === "number" &&
        Number.isFinite(parsed.pendingBegBonus)
          ? Math.max(0, Math.floor(parsed.pendingBegBonus))
          : 0,
      pendingCumBoost:
        typeof parsed.pendingCumBoost === "number" &&
        Number.isFinite(parsed.pendingCumBoost)
          ? Math.max(0, Math.floor(parsed.pendingCumBoost))
          : 0,
      shopOfferTags: normalizeShopOfferTags(parsed.shopOfferTags),
      shopOfferFetishIds: strArr(parsed.shopOfferFetishIds),
      favoritesFingerprint:
        typeof parsed.favoritesFingerprint === "string"
          ? parsed.favoritesFingerprint
          : "",
    };
  } catch {
    return emptyWallet();
  }
}

export function saveWallet(state: WalletState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore quota
  }
}

export function creditCinders(state: WalletState, amount: number): WalletState {
  const n = Math.max(0, Math.floor(amount));
  if (n <= 0) return state;
  const next = { ...state, balance: state.balance + n };
  saveWallet(next);
  return next;
}

/** Remove cinders (e.g. claw back quest rewards on abort). Floors at 0. */
export function debitCinders(state: WalletState, amount: number): WalletState {
  const n = Math.max(0, Math.floor(amount));
  if (n <= 0) return state;
  const next = { ...state, balance: Math.max(0, state.balance - n) };
  saveWallet(next);
  return next;
}

/** Base угольки for finishing a session via «Завершить». */
export const SESSION_COMPLETE_BASE_CINDERS = 14;

/** Scale session payout by time, edges, and finale land. */
export function calcSessionCompleteCinders(opts: {
  elapsedSec: number;
  edgesDone: number;
  outcome?: "cum" | "ruin" | "deny";
}): number {
  let n = SESSION_COMPLETE_BASE_CINDERS;
  n += Math.min(10, Math.floor(Math.max(0, opts.elapsedSec) / 90));
  n += Math.min(8, Math.max(0, opts.edgesDone));
  if (opts.outcome === "deny") n += 3;
  else if (opts.outcome === "ruin") n += 2;
  else if (opts.outcome === "cum") n += 1;
  return Math.max(10, Math.min(45, n));
}

export function spendCinders(
  state: WalletState,
  amount: number,
): WalletState | null {
  const n = Math.max(0, Math.floor(amount));
  if (n <= 0) return state;
  if (state.balance < n) return null;
  const next = { ...state, balance: state.balance - n };
  saveWallet(next);
  return next;
}

function isConsumable(kind: ShopItemKind): boolean {
  return kind === "beg_bonus" || kind === "cum_boost";
}

export function isShopOwned(state: WalletState, item: ShopItem): boolean {
  switch (item.kind) {
    case "function":
      return state.unlocks.functionIds.includes(item.payload);
    case "pattern":
      return state.unlocks.patternIds.includes(item.payload);
    case "tag_pack":
      return state.unlocks.tagPacks.includes(item.payload);
    case "fetish":
      return isFetishUnlocked(item.payload, state.unlocks);
    case "dyn_tag":
      return isDynamicTagUnlocked(item.payload, state.unlocks);
    case "mode":
      return isModeUnlocked(item.payload as SessionMode, state.unlocks);
    case "mood":
      return isMoodUnlocked(item.payload as SessionMood, state.unlocks);
    case "character":
      return isCharacterUnlocked(item.payload, state.unlocks);
    case "media_type":
      return isMediaTypeUnlocked(item.payload, state.unlocks);
    case "feature":
      return state.unlocks.featureIds.includes(item.payload);
    case "beg_bonus":
    case "cum_boost":
      return false;
    default: {
      const _exhaustive: never = item.kind;
      return _exhaustive;
    }
  }
}

/** Build a shop row for a catalog fetish offer. */
export function fetishShopItem(fetishId: string): ShopItem | null {
  const f = findFetishById(fetishId);
  if (!f) return null;
  return {
    id: `fetish_${fetishId}`,
    nameRu: `Доступен фетиш "${f.labelRu}"`,
    descriptionRu: `Открывает «${f.labelRu}» (${f.tags}) в рулетке.`,
    cost: fetishTierCost(f.tier),
    kind: "fetish",
    payload: fetishId,
  };
}

/** Template shop block for a dynamic favorite tag. */
export function dynamicTagShopItem(offer: ShopTagOffer): ShopItem {
  return {
    id: `dyn_tag:${offer.tag}`,
    nameRu: `Доступен фетиш "${offer.labelRu}"`,
    descriptionRu: shopDynTagDescRu(offer.tag, offer.count),
    cost: offer.cost,
    kind: "dyn_tag",
    payload: offer.tag,
  };
}

export function resolveShopItem(
  state: WalletState,
  itemId: string,
): ShopItem | null {
  const staticItem = SHOP_CATALOG.find((i) => i.id === itemId);
  if (staticItem) return staticItem;
  if (itemId.startsWith("dyn_tag:")) {
    const tag = itemId.slice("dyn_tag:".length).toLowerCase();
    const offer = state.shopOfferTags.find((o) => o.tag === tag);
    if (!offer) return null;
    return dynamicTagShopItem(offer);
  }
  if (itemId.startsWith("fetish_")) {
    const fetishId = itemId.slice("fetish_".length);
    if (!state.shopOfferFetishIds.includes(fetishId)) return null;
    return fetishShopItem(fetishId);
  }
  return null;
}

export function purchaseShopItem(
  state: WalletState,
  itemId: string,
): { ok: true; state: WalletState } | { ok: false; reason: string } {
  const item = resolveShopItem(state, itemId);
  if (!item) return { ok: false, reason: "Нет такой позиции" };
  if (!isConsumable(item.kind) && isShopOwned(state, item)) {
    return { ok: false, reason: "Уже куплено" };
  }
  if (state.balance < item.cost) {
    return { ok: false, reason: "Мало угольков" };
  }

  let unlocks = { ...state.unlocks };
  let pendingBegBonus = state.pendingBegBonus;
  let pendingCumBoost = state.pendingCumBoost;
  let shopOfferTags = state.shopOfferTags;

  switch (item.kind) {
    case "function":
      unlocks = {
        ...unlocks,
        functionIds: [...new Set([...unlocks.functionIds, item.payload])],
      };
      break;
    case "pattern":
      unlocks = {
        ...unlocks,
        patternIds: [...new Set([...unlocks.patternIds, item.payload])],
      };
      break;
    case "tag_pack": {
      unlocks = {
        ...unlocks,
        tagPacks: [...new Set([...unlocks.tagPacks, item.payload])],
      };
      // Drop favorite-shelf cards already covered by this pack (e.g. Hu Tao)
      const packTags = new Set(
        tagsForPack(item.payload).map((t) => t.toLowerCase()),
      );
      if (packTags.size > 0) {
        shopOfferTags = state.shopOfferTags.filter(
          (o) => !packTags.has(o.tag.toLowerCase()),
        );
      }
      break;
    }
    case "fetish":
      unlocks = {
        ...unlocks,
        fetishIds: [...new Set([...unlocks.fetishIds, item.payload])],
      };
      break;
    case "dyn_tag": {
      const tag = item.payload.toLowerCase();
      const offer = state.shopOfferTags.find((o) => o.tag === tag);
      unlocks = {
        ...unlocks,
        unlockedTags: [...new Set([...unlocks.unlockedTags, tag])],
        fetishIds: offer?.fetishId
          ? [...new Set([...unlocks.fetishIds, offer.fetishId])]
          : unlocks.fetishIds,
      };
      shopOfferTags = state.shopOfferTags.filter((o) => o.tag !== tag);
      break;
    }
    case "mode":
      unlocks = {
        ...unlocks,
        modeIds: [...new Set([...unlocks.modeIds, item.payload])],
      };
      break;
    case "mood":
      unlocks = {
        ...unlocks,
        moodIds: [...new Set([...unlocks.moodIds, item.payload])],
      };
      break;
    case "character":
      unlocks = {
        ...unlocks,
        characterIds: [...new Set([...unlocks.characterIds, item.payload])],
      };
      break;
    case "media_type":
      unlocks = {
        ...unlocks,
        mediaTypeIds: [...new Set([...unlocks.mediaTypeIds, item.payload])],
      };
      break;
    case "feature":
      unlocks = {
        ...unlocks,
        featureIds: [...new Set([...unlocks.featureIds, item.payload])],
      };
      break;
    case "beg_bonus":
      pendingBegBonus += 1;
      break;
    case "cum_boost":
      pendingCumBoost += 1;
      break;
    default: {
      const _exhaustive: never = item.kind;
      return _exhaustive;
    }
  }

  unlocks = syncMistressModeGrants(unlocks);

  const next: WalletState = {
    ...state,
    balance: state.balance - item.cost,
    unlocks,
    pendingBegBonus,
    pendingCumBoost,
    shopOfferTags,
  };
  saveWallet(next);
  return { ok: true, state: next };
}

export function setShopOffers(
  state: WalletState,
  shopOfferTags: ShopTagOffer[],
  favoritesFingerprint: string,
): WalletState {
  const next = {
    ...state,
    shopOfferTags,
    shopOfferFetishIds: [] as string[],
    favoritesFingerprint,
  };
  saveWallet(next);
  return next;
}

/** Consume pending beg bonus; returns credits to add and updated wallet. */
export function consumeBegBonus(state: WalletState): {
  bonus: number;
  state: WalletState;
} {
  const bonus = state.pendingBegBonus;
  if (bonus <= 0) return { bonus: 0, state };
  const next = { ...state, pendingBegBonus: 0 };
  saveWallet(next);
  return { bonus, state: next };
}

export function consumeCumBoost(state: WalletState): {
  stacks: number;
  state: WalletState;
} {
  const stacks = state.pendingCumBoost;
  if (stacks <= 0) return { stacks: 0, state };
  const next = { ...state, pendingCumBoost: 0 };
  saveWallet(next);
  return { stacks, state: next };
}

export function isFunctionUnlocked(
  functionId: string,
  unlocks: WalletUnlocks,
): boolean {
  if (!(GATED_FUNCTION_IDS as readonly string[]).includes(functionId)) {
    return true;
  }
  return unlocks.functionIds.includes(functionId);
}

export function isPatternUnlocked(
  patternId: string,
  unlocks: WalletUnlocks,
): boolean {
  if (!(GATED_PATTERN_IDS as readonly string[]).includes(patternId)) {
    return true;
  }
  return unlocks.patternIds.includes(patternId);
}

export function isFeatureUnlocked(
  featureId: string,
  unlocks: WalletUnlocks,
): boolean {
  if (!(GATED_FEATURE_IDS as readonly string[]).includes(featureId)) {
    return true;
  }
  return unlocks.featureIds.includes(featureId);
}

/** Merge shop unlocks into a restrictive whitelist (empty = unrestricted). */
export function mergeAllowedIds(
  base: string[],
  unlocked: string[],
): string[] {
  if (base.length === 0) return [];
  return [...new Set([...base, ...unlocked])];
}

export function tagPackTags(packId: string): string | null {
  return TAG_PACKS[packId]?.tags ?? null;
}

export { EMPTY_UNLOCKS };

/** Merge persisted unlocks with current shop shelf for gating / autocomplete. */
export function contentUnlocksFromWallet(
  state: WalletState,
): ContentUnlockLists {
  return {
    fetishIds: state.unlocks.fetishIds,
    characterIds: state.unlocks.characterIds,
    mediaTypeIds: state.unlocks.mediaTypeIds,
    modeIds: state.unlocks.modeIds,
    moodIds: state.unlocks.moodIds,
    unlockedTags: state.unlocks.unlockedTags,
    tagPacks: state.unlocks.tagPacks,
    functionIds: state.unlocks.functionIds,
    featureIds: state.unlocks.featureIds,
    pendingShopTags: state.shopOfferTags.map((o) => o.tag),
  };
}
