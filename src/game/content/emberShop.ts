/**
 * Explore shops: catalog listings, session stock, buy/sell against coin wallet.
 * Constructor: interactivity kind shop + shopId, not a new zone type.
 */
import type {
  EmberItemDef,
  EmberShopDef,
  EmberShopListing,
  EmberShopsFile,
  ValidationIssue,
} from "./types";
import type { InteractivityWouldFire } from "./interactivity";
import {
  compactInventory,
  grantItemCounts,
  itemDisplayName,
} from "./emberItem";

export const SHOP_CATALOG_REL = "shops/catalog.json";
export const SHOP_WALLET_ITEM_ID = "coin";

export type ShopListingView = {
  itemId: string;
  nameRu: string;
  buyPrice: number;
  sellPrice: number;
  stock: number | null;
};

export type ShopWouldFire = Extract<InteractivityWouldFire, { action: "shop" }>;

export type ShopBuyResult =
  | {
      ok: true;
      shopId: string;
      itemId: string;
      inventory: Record<string, number>;
      remaining: Record<string, number>;
    }
  | {
      ok: false;
      reason: "unknown_shop" | "unknown_item" | "broke" | "out_of_stock";
      inventory: Record<string, number>;
      remaining: Record<string, number>;
    };

export type ShopSellResult =
  | {
      ok: true;
      shopId: string;
      itemId: string;
      inventory: Record<string, number>;
      remaining: Record<string, number>;
    }
  | {
      ok: false;
      reason:
        | "unknown_shop"
        | "unknown_item"
        | "nothing_to_sell"
        | "unsellable";
      inventory: Record<string, number>;
      remaining: Record<string, number>;
    };

function clampPrice(value: unknown, fallback = 0): number {
  const n =
    typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.max(0, Math.round(n));
}

function optionalStock(value: unknown): number | undefined {
  if (value == null) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return Math.max(0, Math.round(value));
}

function addItemCount(
  inventory: Record<string, number>,
  itemId: string,
  amount: number,
  catalog: Record<string, EmberItemDef> | undefined,
): Record<string, number> {
  if (amount <= 0) return { ...inventory };
  const stackMax = catalog?.[itemId]?.stackMax ?? 99;
  const next = { ...inventory };
  next[itemId] = Math.min(stackMax, (next[itemId] ?? 0) + amount);
  return compactInventory(next) ?? {};
}

export function normalizeShopListing(raw: unknown): EmberShopListing | null {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const rec = raw as Record<string, unknown>;
  if (typeof rec.itemId !== "string" || !rec.itemId.trim()) return null;
  const listing: EmberShopListing = {
    itemId: rec.itemId.trim(),
    buyPrice: clampPrice(rec.buyPrice),
  };
  if (rec.sellPrice != null) listing.sellPrice = clampPrice(rec.sellPrice);
  const stock = optionalStock(rec.stock);
  if (stock != null) listing.stock = stock;
  return listing;
}

export function normalizeShopDef(raw: unknown): EmberShopDef | null {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const rec = raw as Record<string, unknown>;
  if (typeof rec.id !== "string" || !rec.id.trim()) return null;
  const listings: EmberShopListing[] = [];
  const seen = new Set<string>();
  if (Array.isArray(rec.listings)) {
    for (const entry of rec.listings) {
      const listing = normalizeShopListing(entry);
      if (!listing || seen.has(listing.itemId)) continue;
      seen.add(listing.itemId);
      listings.push(listing);
    }
  }
  const nameRu =
    typeof rec.nameRu === "string" && rec.nameRu.trim()
      ? rec.nameRu.trim()
      : rec.id.trim();
  return { id: rec.id.trim(), nameRu, listings };
}

export function parseShopsFile(raw: unknown): Record<string, EmberShopDef> {
  const shops: Record<string, EmberShopDef> = {};
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return shops;
  const rec = raw as Record<string, unknown>;
  const list = Array.isArray(rec.shops) ? rec.shops : [];
  for (const entry of list) {
    const shop = normalizeShopDef(entry);
    if (shop) shops[shop.id] = shop;
  }
  return shops;
}

export function shopsFileFromPack(
  shops: Record<string, EmberShopDef>,
): EmberShopsFile {
  return {
    shops: Object.values(shops).sort((a, b) => a.id.localeCompare(b.id)),
  };
}

export function walletCount(inventory: Record<string, number>): number {
  return Math.max(0, Math.round(inventory[SHOP_WALLET_ITEM_ID] ?? 0));
}

export function listingSellPrice(listing: EmberShopListing): number {
  if (listing.sellPrice != null) return listing.sellPrice;
  return Math.max(0, Math.floor(listing.buyPrice / 2));
}

export function isItemUnsellable(
  itemId: string,
  catalog: Record<string, EmberItemDef> | undefined,
): boolean {
  if (itemId === SHOP_WALLET_ITEM_ID) return true;
  return catalog?.[itemId]?.unsellable === true;
}

/** Shop listing sell price if listed, otherwise catalog sellPrice. */
export function resolveSellPrice(
  itemId: string,
  shop: EmberShopDef | undefined,
  catalog: Record<string, EmberItemDef> | undefined,
): number | null {
  if (isItemUnsellable(itemId, catalog)) return null;
  const listing = shop?.listings.find((entry) => entry.itemId === itemId);
  if (listing) return listingSellPrice(listing);
  const catalogPrice = catalog?.[itemId]?.sellPrice;
  if (catalogPrice == null) return null;
  return clampPrice(catalogPrice);
}

export function remainingStockOf(
  shop: EmberShopDef,
  remaining: Record<string, number>,
  itemId: string,
): number | null {
  const listing = shop.listings.find((entry) => entry.itemId === itemId);
  if (!listing) return 0;
  if (listing.stock == null) return null;
  if (Object.prototype.hasOwnProperty.call(remaining, itemId)) {
    return Math.max(0, remaining[itemId] ?? 0);
  }
  return listing.stock;
}

export function seedShopRemaining(shop: EmberShopDef): Record<string, number> {
  const remaining: Record<string, number> = {};
  for (const listing of shop.listings) {
    if (listing.stock == null) continue;
    remaining[listing.itemId] = listing.stock;
  }
  return remaining;
}

export function shopListingViews(
  shop: EmberShopDef,
  remaining: Record<string, number>,
  catalog: Record<string, EmberItemDef> | undefined,
): ShopListingView[] {
  return shop.listings.map((listing) => ({
    itemId: listing.itemId,
    nameRu: itemDisplayName(catalog?.[listing.itemId], listing.itemId),
    buyPrice: listing.buyPrice,
    sellPrice: listingSellPrice(listing),
    stock: remainingStockOf(shop, remaining, listing.itemId),
  }));
}

export function wouldFireForShop(
  shop: EmberShopDef | undefined,
  shopId: string | null,
  inventory: Record<string, number>,
  remaining: Record<string, number>,
  catalog: Record<string, EmberItemDef> | undefined,
): ShopWouldFire {
  if (!shop) {
    return {
      action: "shop",
      shopId,
      nameRu: null,
      wallet: walletCount(inventory),
      listings: [],
    };
  }
  return {
    action: "shop",
    shopId: shop.id,
    nameRu: shop.nameRu,
    wallet: walletCount(inventory),
    listings: shopListingViews(shop, remaining, catalog),
  };
}

function takeItemCount(
  inventory: Record<string, number>,
  itemId: string,
  amount: number,
): Record<string, number> | null {
  if (amount <= 0) return { ...inventory };
  const have = inventory[itemId] ?? 0;
  if (have < amount) return null;
  const next = { ...inventory, [itemId]: have - amount };
  return compactInventory(next) ?? {};
}

export function buyShopItem(
  shop: EmberShopDef | undefined,
  itemId: string,
  inventory: Record<string, number>,
  remaining: Record<string, number>,
  catalog: Record<string, EmberItemDef> | undefined,
): ShopBuyResult {
  const inv = compactInventory(inventory) ?? {};
  const stock = { ...remaining };
  if (!shop) {
    return { ok: false, reason: "unknown_shop", inventory: inv, remaining: stock };
  }
  const listing = shop.listings.find((entry) => entry.itemId === itemId);
  if (!listing) {
    return { ok: false, reason: "unknown_item", inventory: inv, remaining: stock };
  }
  const left = remainingStockOf(shop, stock, itemId);
  if (left === 0) {
    return { ok: false, reason: "out_of_stock", inventory: inv, remaining: stock };
  }
  const spent = takeItemCount(inv, SHOP_WALLET_ITEM_ID, listing.buyPrice);
  if (!spent) {
    return { ok: false, reason: "broke", inventory: inv, remaining: stock };
  }
  const granted = grantItemCounts(spent, [itemId], catalog);
  if (left != null) stock[itemId] = left - 1;
  return {
    ok: true,
    shopId: shop.id,
    itemId,
    inventory: compactInventory(granted) ?? {},
    remaining: stock,
  };
}

export function sellShopItem(
  shop: EmberShopDef | undefined,
  itemId: string,
  inventory: Record<string, number>,
  remaining: Record<string, number>,
  catalog: Record<string, EmberItemDef> | undefined,
): ShopSellResult {
  const inv = compactInventory(inventory) ?? {};
  const stock = { ...remaining };
  if (!shop) {
    return { ok: false, reason: "unknown_shop", inventory: inv, remaining: stock };
  }
  if (itemId === SHOP_WALLET_ITEM_ID) {
    return { ok: false, reason: "unknown_item", inventory: inv, remaining: stock };
  }
  if (isItemUnsellable(itemId, catalog)) {
    return { ok: false, reason: "unsellable", inventory: inv, remaining: stock };
  }
  const price = resolveSellPrice(itemId, shop, catalog);
  if (price == null) {
    return { ok: false, reason: "unknown_item", inventory: inv, remaining: stock };
  }
  const taken = takeItemCount(inv, itemId, 1);
  if (!taken) {
    return {
      ok: false,
      reason: "nothing_to_sell",
      inventory: inv,
      remaining: stock,
    };
  }
  const listing = shop.listings.find((entry) => entry.itemId === itemId);
  if (listing && listing.stock != null) {
    const left = remainingStockOf(shop, stock, itemId);
    if (left != null) stock[itemId] = left + 1;
  }
  const paid = addItemCount(taken, SHOP_WALLET_ITEM_ID, price, catalog);
  return {
    ok: true,
    shopId: shop.id,
    itemId,
    inventory: compactInventory(paid) ?? {},
    remaining: stock,
  };
}

export function sellableFromInventory(
  shop: EmberShopDef,
  inventory: Record<string, number>,
  catalog: Record<string, EmberItemDef> | undefined,
): Array<{ itemId: string; nameRu: string; count: number; sellPrice: number }> {
  const out: Array<{
    itemId: string;
    nameRu: string;
    count: number;
    sellPrice: number;
  }> = [];
  const seen = new Set<string>();
  for (const [itemId, count] of Object.entries(inventory)) {
    if (count <= 0) continue;
    if (seen.has(itemId)) continue;
    const price = resolveSellPrice(itemId, shop, catalog);
    if (price == null) continue;
    seen.add(itemId);
    out.push({
      itemId,
      nameRu: itemDisplayName(catalog?.[itemId], itemId),
      count,
      sellPrice: price,
    });
  }
  out.sort((a, b) => a.nameRu.localeCompare(b.nameRu, "ru"));
  return out;
}

export function validateShops(
  shops: Record<string, EmberShopDef>,
  catalog: Record<string, EmberItemDef> | undefined,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const shop of Object.values(shops)) {
    const base = `shops/${shop.id}`;
    if (!shop.listings.length) {
      issues.push({
        level: "warn",
        path: `${base}.listings`,
        message: "Магазин без товаров",
      });
    }
    for (const listing of shop.listings) {
      if (listing.buyPrice < 0) {
        issues.push({
          level: "error",
          path: `${base}.listings.${listing.itemId}.buyPrice`,
          message: "Цена покупки должна быть >= 0",
        });
      }
      if (catalog && !catalog[listing.itemId]) {
        issues.push({
          level: "warn",
          path: `${base}.listings.${listing.itemId}`,
          message: `Предмет «${listing.itemId}» нет в каталоге — останется stub`,
        });
      }
    }
  }
  return issues;
}
