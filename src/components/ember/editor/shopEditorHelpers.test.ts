import { describe, expect, it } from "vitest";
import type { EmberShopDef } from "../../../game/content/types";
import {
  createBlankListing,
  createBlankShop,
  duplicateShop,
  removeListing,
  renameShopId,
  upsertListing,
} from "./shopEditorHelpers";

const kiosk: EmberShopDef = {
  id: "village_kiosk",
  nameRu: "Киоск",
  listings: [{ itemId: "herb", buyPrice: 3, sellPrice: 1, stock: 2 }],
};

describe("shop editor helpers", () => {
  it("creates, duplicates, and renames shops", () => {
    const created = createBlankShop(["village_kiosk"]);
    expect(created.id).toBe("shop");
    expect(created.listings).toEqual([]);
    const copy = duplicateShop(kiosk, ["village_kiosk"]);
    expect(copy.id).toBe("village_kiosk_2");
    expect(copy.listings[0]).toEqual(kiosk.listings[0]);
    expect(copy.listings[0]).not.toBe(kiosk.listings[0]);
    expect(renameShopId(kiosk, "tea_stall", ["village_kiosk"])?.id).toBe(
      "tea_stall",
    );
    expect(renameShopId(kiosk, "village_kiosk", ["village_kiosk", "other"])?.id).toBe(
      "village_kiosk",
    );
    expect(renameShopId(kiosk, "other", ["village_kiosk", "other"])).toBeNull();
  });

  it("upserts listings without duplicating item ids", () => {
    const added = upsertListing(kiosk, createBlankListing("silk_flower"));
    expect(added.listings).toHaveLength(2);
    const replaced = upsertListing(
      added,
      { itemId: "herb", buyPrice: 5, sellPrice: 2, stock: 9 },
      "herb",
    );
    expect(replaced.listings.find((row) => row.itemId === "herb")).toEqual({
      itemId: "herb",
      buyPrice: 5,
      sellPrice: 2,
      stock: 9,
    });
    expect(removeListing(replaced, "silk_flower").listings).toHaveLength(1);
  });
});
