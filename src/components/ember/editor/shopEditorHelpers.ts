import type { EmberShopDef, EmberShopListing } from "../../../game/content/types";

const ID_RE = /^[a-z][a-z0-9_]*$/;

export function sanitizeShopId(raw: string, fallback = "shop"): string {
  const cleaned = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_{2,}/g, "_");
  const id = cleaned || fallback;
  return ID_RE.test(id) ? id : fallback;
}

export function nextShopId(
  existing: Iterable<string>,
  base = "shop",
): string {
  const taken = new Set(existing);
  const stem = sanitizeShopId(base, "shop");
  if (!taken.has(stem)) return stem;
  for (let n = 2; n < 10_000; n++) {
    const id = `${stem}_${n}`;
    if (!taken.has(id)) return id;
  }
  return `${stem}_${Date.now().toString(36)}`;
}

export function createBlankShop(
  existing: Iterable<string>,
): EmberShopDef {
  const id = nextShopId(existing, "shop");
  return {
    id,
    nameRu: "Новый магазин",
    listings: [],
  };
}

export function duplicateShop(
  shop: EmberShopDef,
  existing: Iterable<string>,
): EmberShopDef {
  const id = nextShopId(existing, shop.id);
  return {
    ...shop,
    id,
    nameRu: `${shop.nameRu} копия`,
    listings: shop.listings.map((row) => ({ ...row })),
  };
}

export function renameShopId(
  shop: EmberShopDef,
  nextId: string,
  existing: Iterable<string>,
): EmberShopDef | null {
  const id = sanitizeShopId(nextId, "");
  if (!id || !ID_RE.test(id)) return null;
  const taken = new Set(existing);
  taken.delete(shop.id);
  if (taken.has(id)) return null;
  return { ...shop, id };
}

export function createBlankListing(itemId = "herb"): EmberShopListing {
  const id = itemId.trim() || "herb";
  return { itemId: id, buyPrice: 1, sellPrice: 1 };
}

export function upsertListing(
  shop: EmberShopDef,
  listing: EmberShopListing,
  replaceItemId?: string,
): EmberShopDef {
  const itemId = listing.itemId.trim();
  if (!itemId) return shop;
  const dropId = replaceItemId ?? itemId;
  const nextRow: EmberShopListing = {
    itemId,
    buyPrice: Math.max(0, Math.round(listing.buyPrice) || 0),
  };
  if (listing.sellPrice != null) {
    nextRow.sellPrice = Math.max(0, Math.round(listing.sellPrice));
  }
  if (listing.stock != null) {
    nextRow.stock = Math.max(0, Math.round(listing.stock));
  }
  const listings = shop.listings.slice();
  const dropIndex = listings.findIndex((row) => row.itemId === dropId);
  if (itemId !== dropId && listings.some((row) => row.itemId === itemId)) {
    return shop;
  }
  if (dropIndex >= 0) {
    listings[dropIndex] = nextRow;
    return { ...shop, listings };
  }
  return { ...shop, listings: [...listings, nextRow] };
}

export function removeListing(
  shop: EmberShopDef,
  itemId: string,
): EmberShopDef {
  return {
    ...shop,
    listings: shop.listings.filter((row) => row.itemId !== itemId),
  };
}
