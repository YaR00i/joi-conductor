import { describe, expect, it } from "vitest";
import {
  applyItemKind,
  createBlankItem,
  duplicateItem,
  nextItemId,
  renameItemId,
  sanitizeItemId,
} from "./itemEditorHelpers";

describe("item editor helpers", () => {
  it("allocates unique ids and duplicates", () => {
    expect(sanitizeItemId(" Coin-Bag ")).toBe("coin_bag");
    expect(nextItemId(["item"], "item")).toBe("item_2");
    const blank = createBlankItem(["coin"], "consumable");
    expect(blank.kind).toBe("consumable");
    expect(blank.slot).toBe("none");
    expect(blank.useIn).toBe("both");
    const copy = duplicateItem(blank, [blank.id]);
    expect(copy.id).not.toBe(blank.id);
    expect(copy.nameRu).toContain("копия");
  });

  it("resets slot/useIn when kind changes", () => {
    const item = createBlankItem([], "material");
    const weapon = applyItemKind(item, "weapon_jrpg");
    expect(weapon.kind).toBe("weapon_jrpg");
    expect(weapon.slot).toBe("weapon");
    expect(weapon.useIn).toBe("explore");
    const armor = applyItemKind(weapon, "armor");
    expect(armor.slot).toBe("body");
    expect(renameItemId(armor, "plum helm", ["plum_helm"])).toBeNull();
    expect(renameItemId(armor, "plum_helm", ["other"])?.id).toBe("plum_helm");
  });
});
