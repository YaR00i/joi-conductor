import { describe, expect, it } from "vitest";
import type { EmberVoxelModel } from "../content/types";
import { EMBER_CHIBI32_SLOTS } from "../content/types";
import { getVoxel, voxelGridSize } from "./voxelModel";
import {
  CHIBI32_BODY_HEIGHT_VOXELS,
  CHIBI32_BODY_RADIUS_VOXELS,
  CHIBI32_REQUIRED_SLOTS,
  characterCapsule,
  characterCapsuleCenterRelativeTo,
  characterSlotForObject,
  createChibi32Character,
  createVoxelCharacter,
  isCharacterScene,
  isLockedCharacterObject,
  normalizeVoxelCharacterDef,
  SLASHER_HAIR_HEX,
} from "./voxelCharacter";
import { normalizeVoxelScene } from "./voxelScene";

describe("chibi_32 character template", () => {
  it("builds every slot, joints, and idle/walk clips", () => {
    const { scene, models } = createChibi32Character("vox_chr_test", "Тест");
    const normalized = normalizeVoxelScene(scene);
    expect(isCharacterScene(normalized)).toBe(true);
    expect(normalized.character?.templateId).toBe("chibi_32");
    expect(normalized.objects).toHaveLength(EMBER_CHIBI32_SLOTS.length);
    for (const slot of EMBER_CHIBI32_SLOTS) {
      const objectId = normalized.character?.slots?.[slot];
      expect(objectId).toBe(`obj_${slot}`);
      const obj = normalized.objects.find((o) => o.id === objectId);
      expect(obj?.modelId).toBe(`vox_chr_test_${slot}`);
      expect(models[obj!.modelId]?.voxels.some((v) => v > 0)).toBe(true);
    }
    for (const slot of CHIBI32_REQUIRED_SLOTS) {
      expect(models[`vox_chr_test_${slot}`]?.physical).not.toBe(false);
    }
    expect(models.vox_chr_test_hair?.physical).toBe(false);
    expect(models.vox_chr_test_twin_l?.physical).toBe(false);
    expect(models.vox_chr_test_ears?.physical).toBe(false);
    expect(normalized.joints?.length).toBe(10);
    expect(normalized.character?.clips?.idle).toBe("clip_idle");
    expect(normalized.character?.clips?.walk).toBe("clip_walk");
    const walk = normalized.animations?.find((c) => c.id === "clip_walk");
    expect(walk?.tracks.length).toBe(4);
  });

  it("keeps all parts in one 16-voxel tile and capsule below the crown", () => {
    const { scene, models } = createVoxelCharacter(
      "chibi_32",
      "vox_chr_fit",
      "Чиби",
    );
    for (const obj of scene.objects) {
      expect(obj.offset.x).toBe(0);
      expect(obj.offset.z).toBe(0);
      const g = voxelGridSize(models[obj.modelId]!);
      expect(g.sx).toBe(16);
      expect(g.sz).toBe(16);
    }
    const cap = characterCapsule(scene);
    expect(cap.height).toBe(CHIBI32_BODY_HEIGHT_VOXELS);
    expect(cap.radius).toBe(CHIBI32_BODY_RADIUS_VOXELS);
    const head = scene.objects.find((o) => o.id === "obj_head")!;
    expect(head.offset.y + (models[head.modelId]?.heightVoxels ?? 0)).toBe(32);
    expect(cap.height).toBeLessThan(32);
  });

  it("places the capsule on the feet when editing the head", () => {
    const { scene } = createChibi32Character("vox_chr_cap", "Капсула");
    const head = scene.objects.find((o) => o.id === "obj_head")!;
    const pos = characterCapsuleCenterRelativeTo(scene, head.offset);
    expect(pos.y).toBe(CHIBI32_BODY_HEIGHT_VOXELS * 0.5 - head.offset.y);
    expect(pos.x).toBe(8);
    expect(pos.z).toBe(8);
  });

  it("locks slotted objects and round-trips character JSON", () => {
    const { scene } = createChibi32Character("vox_chr_lock", "Лок");
    expect(isLockedCharacterObject(scene, "obj_torso")).toBe(true);
    expect(characterSlotForObject(scene, "obj_hair")).toBe("hair");
    expect(isLockedCharacterObject(scene, "missing")).toBe(false);
    const again = normalizeVoxelCharacterDef(
      JSON.parse(JSON.stringify(scene.character)),
    );
    expect(again?.templateId).toBe("chibi_32");
    expect(again?.slots.head).toBe("obj_head");
    expect(again?.clips?.walk).toBe("clip_walk");
  });
});

function solidZSpan(model: EmberVoxelModel): number {
  const g = voxelGridSize(model);
  let min = Infinity;
  let max = -Infinity;
  for (let y = 0; y < g.sy; y++) {
    for (let z = 0; z < g.sz; z++) {
      for (let x = 0; x < g.sx; x++) {
        if (getVoxel(model, x, y, z) <= 0) continue;
        min = Math.min(min, z);
        max = Math.max(max, z);
      }
    }
  }
  return max >= min ? max - min + 1 : 0;
}

describe("chibi_25d character template", () => {
  it("keeps a thin body card and extra depth on hair and nose", () => {
    const { scene, models } = createVoxelCharacter(
      "chibi_25d",
      "vox_chr_25d",
      "Плоский",
    );
    expect(scene.character?.templateId).toBe("chibi_25d");
    expect(isCharacterScene(scene)).toBe(true);
    const torso = models.vox_chr_25d_torso!;
    const head = models.vox_chr_25d_head!;
    const hair = models.vox_chr_25d_hair!;
    expect(solidZSpan(torso)).toBeLessThanOrEqual(5);
    expect(solidZSpan(torso)).toBeGreaterThanOrEqual(3);
    expect(solidZSpan(hair)).toBeGreaterThan(solidZSpan(torso));
    expect(getVoxel(head, 7, 4, 10)).toBeGreaterThan(0);
    expect(getVoxel(head, 5, 6, 9)).toBe(4);
    expect(getVoxel(models.vox_chr_25d_head__back!, 5, 6, 9)).not.toBe(4);
    expect(scene.character?.facing).toBe("card4");
    expect(scene.character?.views?.back?.head).toBe("vox_chr_25d_head__back");
  });
});

describe("slasher character style", () => {
  it("paints red hair, persists style, and keeps the chibi capsule", () => {
    const { scene, models } = createVoxelCharacter(
      "chibi_32",
      "vox_chr_sl",
      "Slasher",
      "slasher",
    );
    expect(scene.character?.style).toBe("slasher");
    expect(scene.character?.templateId).toBe("chibi_32");
    const hair = models.vox_chr_sl_hair!;
    expect(hair.palette).toContain(SLASHER_HAIR_HEX);
    expect(hair.voxels.some((v) => v > 0)).toBe(true);
    expect(models.vox_chr_sl_ears?.voxels.some((v) => v > 0)).toBe(true);
    expect(models.vox_chr_sl_hair?.tags).toContain("slasher");
    const cap = characterCapsule(scene);
    expect(cap.height).toBe(CHIBI32_BODY_HEIGHT_VOXELS);
    const again = normalizeVoxelCharacterDef(
      JSON.parse(JSON.stringify(scene.character)),
    );
    expect(again?.style).toBe("slasher");
    const chibi = normalizeVoxelCharacterDef({
      ...scene.character,
      style: "chibi",
    });
    expect(chibi?.style).toBeUndefined();
  });

  it("keeps the 2.5D card thin when styled as slasher", () => {
    const { scene, models } = createVoxelCharacter(
      "chibi_25d",
      "vox_chr_sl25",
      "Slasher 2.5D",
      "slasher",
    );
    expect(scene.character?.style).toBe("slasher");
    expect(scene.character?.facing).toBe("card4");
    expect(solidZSpan(models.vox_chr_sl25_torso!)).toBeLessThanOrEqual(5);
  });
});
