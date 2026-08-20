import { describe, expect, it } from "vitest";
import { initialEquippedFromAllowed } from "./toyLoadout";
import type { ToyDef } from "./types";

const wand: ToyDef = {
  id: "wand",
  nameRu: "Wand",
  descriptionRu: "",
  owned: true,
  tags: ["vibe"],
  satisfies: ["wand", "external_vibe"],
};

const bullet: ToyDef = {
  id: "vibe_bullet",
  nameRu: "Пуля",
  descriptionRu: "",
  owned: true,
  tags: ["vibe"],
  satisfies: ["wand", "external_vibe"],
};

const plug: ToyDef = {
  id: "plug",
  nameRu: "Пробка",
  descriptionRu: "",
  owned: true,
  tags: ["anal"],
};

describe("initialEquippedFromAllowed", () => {
  it("does not auto-equip when the allow list is empty (all owned)", () => {
    expect(initialEquippedFromAllowed([wand, plug], [])).toEqual([]);
    expect(initialEquippedFromAllowed([wand, plug])).toEqual([]);
  });

  it("equips a selected wand or vibe bullet so vibe blocks can appear", () => {
    expect(initialEquippedFromAllowed([wand, plug], ["wand"])).toEqual([
      "wand",
    ]);
    expect(
      initialEquippedFromAllowed([wand, bullet, plug], ["vibe_bullet"]),
    ).toEqual(["vibe_bullet"]);
  });

  it("ignores toys that are not in the session allow list", () => {
    expect(initialEquippedFromAllowed([wand, plug], ["plug"])).toEqual([]);
  });
});
