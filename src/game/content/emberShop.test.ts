import { describe, expect, it } from "vitest";
import type { EmberItemDef, EmberShopDef } from "./types";
import {
  buyShopItem,
  parseShopsFile,
  remainingStockOf,
  resolveSellPrice,
  seedShopRemaining,
  sellableFromInventory,
  sellShopItem,
  walletCount,
  wouldFireForShop,
} from "./emberShop";

const catalog: Record<string, EmberItemDef> = {
  coin: {
    id: "coin",
    nameRu: "Монета",
    kind: "material",
    slot: "none",
    rarity: "common",
    stackMax: 99,
    useIn: "both",
  },
  herb: {
    id: "herb",
    nameRu: "Погребальная трава",
    kind: "material",
    slot: "none",
    rarity: "common",
    stackMax: 99,
    useIn: "explore",
    sellPrice: 1,
  },
  silk_flower: {
    id: "silk_flower",
    nameRu: "Шёлковый цветок",
    kind: "material",
    slot: "none",
    rarity: "uncommon",
    stackMax: 99,
    useIn: "explore",
    sellPrice: 2,
  },
  chest_key: {
    id: "chest_key",
    nameRu: "Ключ от сундука",
    kind: "key",
    slot: "none",
    rarity: "uncommon",
    stackMax: 1,
    useIn: "explore",
    unsellable: true,
  },
};

const kiosk: EmberShopDef = {
  id: "village_kiosk",
  nameRu: "Киоск деревни",
  listings: [
    { itemId: "herb", buyPrice: 3, sellPrice: 1, stock: 2 },
    { itemId: "meat_bun", buyPrice: 4, sellPrice: 2 },
  ],
};

describe("ember shops", () => {
  it("parses a shop file and snapshots listings", () => {
    const shops = parseShopsFile({
      shops: [kiosk, { id: "skip" }],
    });
    expect(shops.village_kiosk?.listings).toHaveLength(2);
    const remaining = seedShopRemaining(kiosk);
    expect(remainingStockOf(kiosk, remaining, "herb")).toBe(2);
    expect(remainingStockOf(kiosk, remaining, "meat_bun")).toBeNull();
    const fire = wouldFireForShop(
      kiosk,
      "village_kiosk",
      { coin: 10 },
      remaining,
      catalog,
    );
    expect(fire).toMatchObject({
      action: "shop",
      shopId: "village_kiosk",
      nameRu: "Киоск деревни",
      wallet: 10,
    });
    expect(fire.listings[0]).toMatchObject({
      itemId: "herb",
      nameRu: "Погребальная трава",
      buyPrice: 3,
      stock: 2,
    });
  });

  it("buys an item by spending coins and shrinking stock", () => {
    const remaining = seedShopRemaining(kiosk);
    const bought = buyShopItem(
      kiosk,
      "herb",
      { coin: 10 },
      remaining,
      catalog,
    );
    expect(bought).toMatchObject({
      ok: true,
      itemId: "herb",
      inventory: { coin: 7, herb: 1 },
      remaining: { herb: 1 },
    });
    expect(walletCount(bought.inventory)).toBe(7);
  });

  it("refuses a buy when the wallet cannot cover the price", () => {
    const remaining = seedShopRemaining(kiosk);
    const failed = buyShopItem(kiosk, "herb", { coin: 2 }, remaining, catalog);
    expect(failed).toEqual({
      ok: false,
      reason: "broke",
      inventory: { coin: 2 },
      remaining: { herb: 2 },
    });
  });

  it("sells a listed item back for coins and restocks finite stock", () => {
    const remaining = seedShopRemaining(kiosk);
    const sold = sellShopItem(
      kiosk,
      "herb",
      { coin: 1, herb: 2 },
      remaining,
      catalog,
    );
    expect(sold).toMatchObject({
      ok: true,
      inventory: { coin: 2, herb: 1 },
      remaining: { herb: 3 },
    });
    expect(remainingStockOf(kiosk, sold.remaining, "herb")).toBe(3);
  });

  it("sells an unlisted inventory item at catalog sellPrice", () => {
    const remaining = seedShopRemaining(kiosk);
    const sold = sellShopItem(
      kiosk,
      "silk_flower",
      { coin: 4, silk_flower: 1 },
      remaining,
      catalog,
    );
    expect(sold).toMatchObject({
      ok: true,
      inventory: { coin: 6 },
      remaining: { herb: 2 },
    });
    expect(resolveSellPrice("silk_flower", kiosk, catalog)).toBe(2);
  });

  it("refuses to sell unsellable catalog items", () => {
    const remaining = seedShopRemaining(kiosk);
    const failed = sellShopItem(
      kiosk,
      "chest_key",
      { coin: 1, chest_key: 1 },
      remaining,
      catalog,
    );
    expect(failed).toEqual({
      ok: false,
      reason: "unsellable",
      inventory: { coin: 1, chest_key: 1 },
      remaining: { herb: 2 },
    });
  });

  it("lists any priced inventory item as sellable", () => {
    const rows = sellableFromInventory(
      kiosk,
      { coin: 3, herb: 1, silk_flower: 2, chest_key: 1 },
      catalog,
    );
    expect(rows.map((row) => row.itemId).sort()).toEqual(["herb", "silk_flower"]);
    expect(rows.find((row) => row.itemId === "silk_flower")).toMatchObject({
      sellPrice: 2,
      count: 2,
    });
  });
});
