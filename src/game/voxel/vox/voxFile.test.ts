import { describe, expect, it } from "vitest";
import { defaultVoxPaletteRgba, parseVoxFile, serializeVoxFile } from "./voxFile";

describe("MagicaVoxel .vox", () => {
  it("roundtrips SIZE/XYZI/RGBA", () => {
    const palette = defaultVoxPaletteRgba();
    palette[4] = 200;
    palette[5] = 40;
    palette[6] = 12;
    palette[7] = 255;
    const bytes = serializeVoxFile({
      version: 150,
      models: [
        {
          size: { x: 3, y: 4, z: 5 },
          voxels: [
            { x: 0, y: 1, z: 2, i: 1 },
            { x: 2, y: 3, z: 4, i: 1 },
          ],
        },
      ],
      palette,
    });
    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe("VOX ");
    const parsed = parseVoxFile(bytes);
    expect(parsed.models).toHaveLength(1);
    expect(parsed.models[0]?.size).toEqual({ x: 3, y: 4, z: 5 });
    expect(parsed.models[0]?.voxels).toEqual([
      { x: 0, y: 1, z: 2, i: 1 },
      { x: 2, y: 3, z: 4, i: 1 },
    ]);
    expect(parsed.palette[4]).toBe(200);
    expect(parsed.palette[5]).toBe(40);
    expect(parsed.palette[6]).toBe(12);
  });

  it("uses the default palette when RGBA is absent", () => {
    const full = serializeVoxFile({
      version: 150,
      models: [
        {
          size: { x: 1, y: 1, z: 1 },
          voxels: [{ x: 0, y: 0, z: 0, i: 1 }],
        },
      ],
      palette: defaultVoxPaletteRgba(),
    });
    const parsedFull = parseVoxFile(full);
    expect(parsedFull.models[0]?.voxels[0]?.i).toBe(1);
  });
});
