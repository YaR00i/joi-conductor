/**
 * Build shop fetish offers from favorite tag frequency (self-sufficient).
 * Titles: Доступен фетиш "XXX" where XXX is Google-translated RU label.
 */

import {
  isDynamicTagUnlocked,
  isFetishUnlocked,
  matchFetishesForTag,
} from "./contentUnlocks";
import { humanizeTagLabel, translateTagsToRu } from "./googleTranslate";
import {
  collectFavoriteTagStats,
  listFavoriteRecords,
} from "./mediaFavorites";
import { isShopNoiseTag } from "./shopTagNoise";
import {
  setShopOffers,
  type ShopTagOffer,
  type WalletState,
} from "./wallet";

/** How many cards to show / append per load. */
export const SHOP_OFFER_PAGE_SIZE = 16;

/** Bump to force rebuild when offer algorithm changes. */
const OFFER_ALGO = "v6-pack-credit";

export async function favoritesFingerprintNow(): Promise<string> {
  const rows = await listFavoriteRecords();
  const ids = rows
    .map((r) => r.id)
    .sort()
    .join("|");
  return `${OFFER_ALGO}:${rows.length}:${ids.length}:${hashStr(ids)}`;
}

function hashStr(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

function favoritesFp(rows: { id: string }[]): string {
  const ids = rows
    .map((r) => r.id)
    .sort()
    .join("|");
  return `${OFFER_ALGO}:${rows.length}:${ids.length}:${hashStr(ids)}`;
}

/** Base shop price; rises with how often the tag appears in favorites. */
function offerCost(count: number): number {
  const n = Math.max(1, Math.floor(count));
  const extra = Math.round(2 * (n - 1) + Math.sqrt(Math.max(0, n - 1)));
  return Math.min(96, 36 + extra);
}

function offersEqual(a: ShopTagOffer[], b: ShopTagOffer[]): boolean {
  if (a.length !== b.length) return false;
  return a.every(
    (row, i) =>
      row.tag === b[i]!.tag &&
      row.labelRu === b[i]!.labelRu &&
      row.count === b[i]!.count &&
      row.cost === b[i]!.cost &&
      row.fetishId === b[i]!.fetishId,
  );
}

function buildAllCandidates(
  stats: { tag: string; count: number }[],
  state: WalletState,
  excludeTags: Set<string> = new Set(),
): { tag: string; count: number; fetishId?: string }[] {
  const candidates: { tag: string; count: number; fetishId?: string }[] = [];

  for (const { tag, count } of stats) {
    if (isShopNoiseTag(tag)) continue;
    const key = tag.toLowerCase();
    if (excludeTags.has(key)) continue;
    // Packs + dyn_tag purchases both count as owned
    if (isDynamicTagUnlocked(key, state.unlocks)) continue;

    const matches = matchFetishesForTag(key);
    if (matches.length > 0) {
      const locked = matches.filter(
        (f) => !isFetishUnlocked(f.id, state.unlocks),
      );
      if (locked.length > 0) {
        candidates.push({ tag: key, count, fetishId: locked[0]!.id });
        continue;
      }
      continue;
    }

    candidates.push({ tag: key, count });
  }

  return candidates.sort(
    (a, b) => b.count - a.count || a.tag.localeCompare(b.tag),
  );
}

async function candidatesToOffers(
  ranked: { tag: string; count: number; fetishId?: string }[],
): Promise<ShopTagOffer[]> {
  if (ranked.length === 0) return [];
  const labels = await translateTagsToRu(ranked.map((c) => c.tag));
  return ranked.map((c) => ({
    tag: c.tag,
    labelRu: labels.get(c.tag) ?? humanizeTagLabel(c.tag),
    count: c.count,
    cost: offerCost(c.count),
    fetishId: c.fetishId,
  }));
}

/**
 * Recompute shopOfferTags if favorites changed, or shelf is empty while
 * favorites still have eligible tags (recovers from a stuck empty sync).
 * Preserves already-loaded pages when fingerprint is unchanged.
 */
export async function syncShopOffersFromFavorites(
  state: WalletState,
): Promise<{ state: WalletState; changed: boolean }> {
  const rows = await listFavoriteRecords();
  const fp = favoritesFp(rows);

  if (rows.length === 0) {
    if (
      state.shopOfferTags.length === 0 &&
      state.favoritesFingerprint === fp
    ) {
      return { state, changed: false };
    }
    const next = setShopOffers(state, [], fp);
    return { state: next, changed: true };
  }

  const stats = collectFavoriteTagStats(rows);
  const all = buildAllCandidates(stats, state);
  const shelfEmpty = state.shopOfferTags.length === 0;
  const fpSame = fp === state.favoritesFingerprint;

  // Fingerprint unchanged and shelf has cards → keep pages, but drop
  // anything already owned via packs / prior purchases.
  if (fpSame && !shelfEmpty) {
    const pruned = state.shopOfferTags.filter(
      (o) => !isDynamicTagUnlocked(o.tag, state.unlocks),
    );
    if (pruned.length !== state.shopOfferTags.length) {
      const next = setShopOffers(state, pruned, fp);
      return { state: next, changed: true };
    }
    return { state, changed: false };
  }
  if (fpSame && shelfEmpty && all.length === 0) {
    return { state, changed: false };
  }

  // On favorites change (or empty recovery): first page only
  const pageSize = Math.max(
    SHOP_OFFER_PAGE_SIZE,
    state.shopOfferTags.length || SHOP_OFFER_PAGE_SIZE,
  );
  // Fresh rebuild after fp change → first page; empty recovery → first page
  const take = fpSame ? pageSize : SHOP_OFFER_PAGE_SIZE;
  const ranked = all.slice(0, take);
  const offers = await candidatesToOffers(ranked);

  if (offersEqual(offers, state.shopOfferTags) && fpSame) {
    return { state, changed: false };
  }

  const next = setShopOffers(state, offers, fp);
  return { state: next, changed: true };
}

/**
 * Append the next page of favorite-tag offers.
 * Returns `loaded: 0` when nothing left.
 */
export async function loadMoreShopOffersFromFavorites(
  state: WalletState,
): Promise<{ state: WalletState; loaded: number }> {
  const rows = await listFavoriteRecords();
  if (rows.length === 0) {
    return { state, loaded: 0 };
  }

  const already = new Set(state.shopOfferTags.map((o) => o.tag.toLowerCase()));
  const stats = collectFavoriteTagStats(rows);
  const nextBatch = buildAllCandidates(stats, state, already).slice(
    0,
    SHOP_OFFER_PAGE_SIZE,
  );
  if (nextBatch.length === 0) {
    return { state, loaded: 0 };
  }

  const extra = await candidatesToOffers(nextBatch);
  const fp = favoritesFp(rows);
  const next = setShopOffers(state, [...state.shopOfferTags, ...extra], fp);
  return { state: next, loaded: extra.length };
}

/** Whether more eligible favorite tags exist beyond the current shelf. */
export async function hasMoreShopOffersFromFavorites(
  state: WalletState,
): Promise<boolean> {
  const rows = await listFavoriteRecords();
  if (rows.length === 0) return false;
  const already = new Set(state.shopOfferTags.map((o) => o.tag.toLowerCase()));
  const stats = collectFavoriteTagStats(rows);
  return buildAllCandidates(stats, state, already).length > 0;
}

/**
 * Search purchasable favorite tags (beyond the loaded shelf).
 * Returns priced offers ready for the fetish shop UI.
 */
export async function searchPurchasableFavoriteOffers(
  state: WalletState,
  query: string,
  limit = 32,
): Promise<ShopTagOffer[]> {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const rows = await listFavoriteRecords();
  if (rows.length === 0) return [];
  const stats = collectFavoriteTagStats(rows);
  const onShelf = new Set(state.shopOfferTags.map((o) => o.tag.toLowerCase()));
  const ranked = buildAllCandidates(stats, state).filter((c) => {
    if (onShelf.has(c.tag)) return false;
    const label = humanizeTagLabel(c.tag).toLowerCase();
    return c.tag.includes(q) || label.includes(q);
  });
  if (ranked.length === 0) return [];
  return candidatesToOffers(ranked.slice(0, Math.max(1, limit)));
}

/** Merge extra offers into the shelf (e.g. search hits) without dropping pages. */
export function mergeShopOffers(
  state: WalletState,
  extra: ShopTagOffer[],
): WalletState {
  if (extra.length === 0) return state;
  const seen = new Set(state.shopOfferTags.map((o) => o.tag.toLowerCase()));
  const merged = [...state.shopOfferTags];
  for (const row of extra) {
    const key = row.tag.toLowerCase();
    if (seen.has(key)) continue;
    if (isDynamicTagUnlocked(key, state.unlocks)) continue;
    seen.add(key);
    merged.push(row);
  }
  if (merged.length === state.shopOfferTags.length) return state;
  return setShopOffers(state, merged, state.favoritesFingerprint);
}
