import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  ITEM_CATALOG_REL,
  ITEM_ICON_SIZE,
  defaultSlotForKind,
  grantItemCounts,
  isEmberItemKind,
  isEmberItemSlot,
  normalizeItemDef,
  parseItemsFile,
  resolveLootLabels,
  slotAllowedForKind,
  validateItemCatalog,
} from "./emberItem";

const catalogPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../content/ember",
  ITEM_CATALOG_REL,
);

describe("ember item catalog", () => {
  const raw = JSON.parse(readFileSync(catalogPath, "utf8")) as unknown;
  const { items, itemIcons } = parseItemsFile(raw);

  it("loads the disk catalog with starter icons and Hu Tao-ish items", () => {
    expect(Object.keys(itemIcons).length).toBeGreaterThanOrEqual(8);
    expect(itemIcons.sword?.pixels.length).toBe(ITEM_ICON_SIZE * ITEM_ICON_SIZE);
    expect(itemIcons.coin?.pixels.some((c) => c.startsWith("#"))).toBe(true);
    expect(items.coin?.nameRu).toBe("Монета");
    expect(items.herb?.kind).toBe("material");
    expect(items.funeral_polearm?.kind).toBe("weapon_jrpg");
    expect(items.spirit_bolt?.kind).toBe("weapon_arena");
    expect(items.meat_bun?.hpRestore).toBe(18);
    expect(items.lantern_charm?.slot).toBe("accessory");
    expect(validateItemCatalog(items, itemIcons).filter((i) => i.level === "error")).toEqual(
      [],
    );
  });

  it("rejects invalid kind and slot combinations", () => {
    expect(isEmberItemKind("weapon_jrpg")).toBe(true);
    expect(isEmberItemKind("hydrant")).toBe(false);
    expect(isEmberItemSlot("head")).toBe(true);
    expect(slotAllowedForKind("weapon_arena", "weapon")).toBe(true);
    expect(slotAllowedForKind("weapon_jrpg", "head")).toBe(false);
    expect(slotAllowedForKind("armor", "head")).toBe(true);
    expect(slotAllowedForKind("material", "none")).toBe(true);
    expect(normalizeItemDef({ id: "x", kind: "nope" })).toBeNull();
    const bad = normalizeItemDef({
      id: "bad_sword",
      nameRu: "Плохо",
      kind: "weapon_jrpg",
      slot: "head",
    });
    expect(bad).toMatchObject({ id: "bad_sword", slot: "head" });
    const issues = validateItemCatalog(
      { bad_sword: bad! },
      {},
    );
    expect(issues.some((i) => i.level === "error" && i.path.includes("slot"))).toBe(
      true,
    );
    expect(defaultSlotForKind("armor")).toBe("body");
  });

  it("resolves chest loot against the catalog and keeps unknown stubs", () => {
    expect(resolveLootLabels(["coin", "herb", "mystery"], items)).toEqual([
      "Монета",
      "Погребальная трава",
      "mystery",
    ]);
    expect(grantItemCounts({}, ["coin", "coin", "herb"], items)).toEqual({
      coin: 2,
      herb: 1,
    });
  });
});
