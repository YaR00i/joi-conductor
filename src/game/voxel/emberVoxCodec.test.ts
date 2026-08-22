import { describe, expect, it } from "vitest";
import type { EmberVoxelModel } from "../content/types";
import {
  decodeVoxToEmberModel,
  encodeEmberModelToVox,
  joinEmberVoxelPrefab,
  splitEmberVoxelPrefab,
  applyVoxBytesToEmberModel,
  nameRuFromVoxFileName,
} from "./emberVoxCodec";
import { getVoxel, voxelGridSize } from "./voxelModel";
import { parseVoxFile } from "./vox/voxFile";

function lampStub(): EmberVoxelModel {
  const sx = 16;
  const sy = 8;
  const sz = 16;
  const n = sx * sy * sz;
  const voxels = new Array(n).fill(0);
  const set = (x: number, y: number, z: number, pi: number) => {
    voxels[x + z * sx + y * sx * sz] = pi;
  };
  set(4, 0, 4, 1);
  set(4, 1, 4, 1);
  set(4, 2, 4, 2);
  return {
    id: "vox_test_lamp",
    nameRu: "Тест-фонарь",
    sizeBlocks: { x: 1, y: 1, z: 1 },
    heightVoxels: sy,
    palette: ["", "#3a342e", "#ffb44a"],
    voxels,
    physical: true,
    material: "metal",
    emissiveCastsLight: true,
    emissiveLightRange: 2.5,
    emissiveLightShadows: false,
  };
}

describe("Ember ↔ MagicaVoxel", () => {
  it("maps Ember Y-up onto MagicaVoxel Z-up", () => {
    const bytes = encodeEmberModelToVox(lampStub());
    const vox = parseVoxFile(bytes);
    const model = vox.models[0]!;
    expect(model.size).toEqual({ x: 16, y: 16, z: 8 });
    const cells = new Set(
      model.voxels.map((v) => `${v.x},${v.y},${v.z}`),
    );
    expect(cells.has("4,4,0")).toBe(true);
    expect(cells.has("4,4,1")).toBe(true);
    expect(cells.has("4,4,2")).toBe(true);
  });

  it("roundtrips occupied cells and colors", () => {
    const src = lampStub();
    const back = decodeVoxToEmberModel(
      encodeEmberModelToVox(src),
      src.id,
      src.nameRu,
    );
    const { sx, sy, sz } = voxelGridSize(src);
    expect(voxelGridSize(back)).toEqual({ sx, sy, sz });
    for (let y = 0; y < sy; y++) {
      for (let z = 0; z < sz; z++) {
        for (let x = 0; x < sx; x++) {
          const a = getVoxel(src, x, y, z);
          const b = getVoxel(back, x, y, z);
          expect(Boolean(b)).toBe(Boolean(a));
          if (a > 0) {
            expect(back.palette[b]?.toLowerCase()).toBe(
              src.palette[a]?.toLowerCase(),
            );
          }
        }
      }
    }
  });

  it("keeps Ember components on the json prefab when the grid moves to .vox", () => {
    const src = lampStub();
    const { asset, vox } = splitEmberVoxelPrefab(src);
    expect(asset.mesh?.kind).toBe("vox");
    expect(asset.mesh?.file).toBe("voxels/models/vox_test_lamp.vox");
    expect(asset.model.voxels).toEqual([]);
    expect(asset.model.physical).toBe(true);
    expect(asset.model.emissiveCastsLight).toBe(true);
    expect(asset.model.emissiveLightRange).toBe(2.5);
    expect(asset.model.material).toBe("metal");
    expect(asset.tags).toBeUndefined();

    const tagged = { ...src, tags: ["light", "street"] };
    const splitTagged = splitEmberVoxelPrefab(tagged);
    expect(splitTagged.asset.tags).toEqual(["light", "street"]);
    expect(joinEmberVoxelPrefab(splitTagged.asset, splitTagged.vox).tags).toEqual([
      "light",
      "street",
    ]);

    const joined = joinEmberVoxelPrefab(asset, vox);
    expect(joined.physical).toBe(true);
    expect(joined.emissiveCastsLight).toBe(true);
    expect(joined.emissiveLightRange).toBe(2.5);
    expect(getVoxel(joined, 4, 2, 4)).toBeGreaterThan(0);
    expect(joined.palette[getVoxel(joined, 4, 2, 4)]?.toLowerCase()).toBe(
      "#ffb44a",
    );
  });

  it("keeps extra voxel channels on the json prefab", () => {
    const src = lampStub();
    const n = src.voxels.length;
    const emissive = new Array(n).fill(0);
    emissive[4 + 4 * 16 + 2 * 16 * 16] = 200;
    src.emissive = emissive;
    const { asset, vox } = splitEmberVoxelPrefab(src);
    expect(asset.model.voxels).toEqual([]);
    expect(asset.model.emissive?.[4 + 4 * 16 + 2 * 16 * 16]).toBe(200);
    const joined = joinEmberVoxelPrefab(asset, vox);
    expect(joined.emissive?.[4 + 4 * 16 + 2 * 16 * 16]).toBe(200);
    expect(getVoxel(joined, 4, 2, 4)).toBeGreaterThan(0);
  });

  it("keeps Ember components when a .vox mesh is applied onto a prefab", () => {
    const src = lampStub();
    const n = src.voxels.length;
    src.physical = true;
    src.emissiveCastsLight = true;
    src.emissive = new Array(n).fill(0);
    src.emissive[4 + 4 * 16 + 2 * 16 * 16] = 180;
    const applied = applyVoxBytesToEmberModel(src, encodeEmberModelToVox(src));
    expect(applied.id).toBe(src.id);
    expect(applied.physical).toBe(true);
    expect(applied.emissiveCastsLight).toBe(true);
    expect(applied.emissive?.[4 + 4 * 16 + 2 * 16 * 16]).toBe(180);
    expect(getVoxel(applied, 4, 2, 4)).toBeGreaterThan(0);
  });

  it("drops extra channels when imported .vox has a different grid", () => {
    const src = lampStub();
    src.emissive = new Array(src.voxels.length).fill(0);
    src.emissive[0] = 200;
    const wider: EmberVoxelModel = {
      ...src,
      id: "wide",
      sizeBlocks: { x: 2, y: 1, z: 1 },
      voxels: new Array(16 * 8 * 32).fill(0),
    };
    wider.voxels[0] = 1;
    const applied = applyVoxBytesToEmberModel(src, encodeEmberModelToVox(wider));
    expect(applied.sizeBlocks.x).toBe(2);
    expect(applied.physical).toBe(true);
    expect(applied.emissive?.every((value) => value === 0)).toBe(true);
    expect(getVoxel(applied, 0, 0, 0)).toBeGreaterThan(0);
  });

  it("reads a display name from a MagicaVoxel file name", () => {
    expect(nameRuFromVoxFileName("pack/vox_vil_lamp.vox")).toBe("vox_vil_lamp");
    expect(nameRuFromVoxFileName(".vox")).toBe("Импорт MagicaVoxel");
  });
});
