import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { encodeAseprite, parseAseprite } from "./asepriteFile";
import {
  importAsepriteBytes,
  importAsepriteDocument,
  spriteIdFromAsepriteName,
} from "./asepriteImport";
import { SPRITE_DIM_MAX } from "./pixelSprite";

function rgbaFill(
  width: number,
  height: number,
  r: number,
  g: number,
  b: number,
  a = 255,
): Uint8Array {
  const out = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const o = i * 4;
    out[o] = r;
    out[o + 1] = g;
    out[o + 2] = b;
    out[o + 3] = a;
  }
  return out;
}

function plot(
  buf: Uint8Array,
  width: number,
  x: number,
  y: number,
  r: number,
  g: number,
  b: number,
  a = 255,
): void {
  const o = (y * width + x) * 4;
  buf[o] = r;
  buf[o + 1] = g;
  buf[o + 2] = b;
  buf[o + 3] = a;
}

describe("aseprite import", () => {
  it("round-trips a two-layer RGBA sprite into Ember pixels", async () => {
    const width = 8;
    const height = 8;
    const layer0 = rgbaFill(width, height, 0, 0, 0, 0);
    const layer1 = rgbaFill(width, height, 0, 0, 0, 0);
    plot(layer0, width, 1, 1, 255, 0, 0, 255);
    plot(layer1, width, 2, 2, 0, 255, 0, 255);
    const bytes = await encodeAseprite({
      width,
      height,
      layers: [{ name: "Base" }, { name: "Detail" }],
      frames: [
        {
          durationMs: 80,
          cels: [
            { layerIndex: 0, width, height, rgba: layer0 },
            { layerIndex: 1, width, height, rgba: layer1 },
          ],
        },
      ],
    });
    const parsed = await parseAseprite(bytes);
    expect(parsed.width).toBe(8);
    expect(parsed.layers.map((l) => l.name)).toEqual(["Base", "Detail"]);
    const result = importAsepriteDocument(parsed, { id: "spr_test" });
    if (!result.ok) throw new Error(result.error);
    expect(result.sprite.width).toBe(8);
    expect(result.sprite.topHeight).toBe(8);
    expect(result.sprite.pixels[1 * 8 + 1]).toBe("#ff0000");
    expect(result.sprite.pixels[2 * 8 + 2]).toBe("#00ff00");
    expect(result.sprite.artLayers).toHaveLength(2);
    expect(result.sprite.frames).toBeUndefined();
  });

  it("maps named layers to card views, emissive, and shine", async () => {
    const width = 4;
    const height = 4;
    const front = rgbaFill(width, height, 20, 20, 20, 255);
    const back = rgbaFill(width, height, 0, 0, 40, 255);
    const glow = rgbaFill(width, height, 0, 0, 0, 0);
    const shine = rgbaFill(width, height, 0, 0, 0, 0);
    plot(glow, width, 0, 0, 255, 200, 40, 255);
    plot(shine, width, 1, 0, 255, 255, 255, 255);
    const bytes = await encodeAseprite({
      width,
      height,
      layers: [
        { name: "front" },
        { name: "back" },
        { name: "emissive" },
        { name: "shine" },
      ],
      frames: [
        {
          cels: [
            { layerIndex: 0, width, height, rgba: front },
            { layerIndex: 1, width, height, rgba: back },
            { layerIndex: 2, width, height, rgba: glow },
            { layerIndex: 3, width, height, rgba: shine },
          ],
        },
      ],
    });
    const result = await importAsepriteBytes(bytes, { id: "spr_card" });
    if (!result.ok) throw new Error(result.error);
    expect(result.sprite.pixels[0]).toBe("#141414");
    expect(result.sprite.views?.back?.pixels[0]).toBe("#000028");
    expect(result.sprite.emissivePixels?.[0]).toBe("#ffc828");
    expect(result.sprite.shinePixels?.[1]).toBe("#ffffff");
  });

  it("keeps Ember gameplay fields when replacing an existing sprite", async () => {
    const width = 8;
    const height = 8;
    const fill = rgbaFill(width, height, 10, 20, 30, 255);
    const bytes = await encodeAseprite({
      width,
      height,
      layers: [{ name: "Paint" }],
      frames: [{ cels: [{ layerIndex: 0, width, height, rgba: fill }] }],
    });
    const result = await importAsepriteBytes(bytes, {
      id: "spr_keep",
      existing: {
        id: "spr_keep",
        nameRu: "Стол",
        tags: ["village"],
        width: 8,
        topHeight: 8,
        wallHeights: [],
        pixels: Array(64).fill(""),
        color: "#abcdef",
        roles: ["prop"],
        glow: true,
        collider: { enabled: true, heightVoxels: 6 },
      },
    });
    if (!result.ok) throw new Error(result.error);
    expect(result.sprite.nameRu).toBe("Стол");
    expect(result.sprite.tags).toEqual(["village"]);
    expect(result.sprite.color).toBe("#abcdef");
    expect(result.sprite.roles).toEqual(["prop"]);
    expect(result.sprite.glow).toBe(true);
    expect(result.sprite.collider?.heightVoxels).toBe(6);
    expect(result.sprite.pixels[0]).toBe("#0a141e");
  });

  it("stores extra frames and rejects canvases above 64", async () => {
    const width = 8;
    const height = 8;
    const a = rgbaFill(width, height, 255, 0, 0, 255);
    const b = rgbaFill(width, height, 0, 0, 255, 255);
    const okBytes = await encodeAseprite({
      width,
      height,
      layers: [{ name: "Anim" }],
      frames: [
        { durationMs: 90, cels: [{ layerIndex: 0, width, height, rgba: a }] },
        { durationMs: 110, cels: [{ layerIndex: 0, width, height, rgba: b }] },
      ],
    });
    const ok = await importAsepriteBytes(okBytes, { id: "spr_anim" });
    if (!ok.ok) throw new Error(ok.error);
    expect(ok.sprite.frames).toHaveLength(2);
    expect(ok.sprite.frames?.[1]?.pixels[0]).toBe("#0000ff");

    const huge = await encodeAseprite({
      width: SPRITE_DIM_MAX + 1,
      height: 8,
      layers: [{ name: "TooBig" }],
      frames: [
        {
          cels: [
            {
              layerIndex: 0,
              width: SPRITE_DIM_MAX + 1,
              height: 8,
              rgba: rgbaFill(SPRITE_DIM_MAX + 1, 8, 1, 2, 3, 255),
            },
          ],
        },
      ],
    });
    const fail = await importAsepriteBytes(huge, { id: "spr_huge" });
    expect(fail.ok).toBe(false);
  });

  it("derives spr_ ids from filenames", () => {
    expect(spriteIdFromAsepriteName("table.aseprite")).toBe("spr_table");
    expect(spriteIdFromAsepriteName("spr_vil_porter.ase")).toBe("spr_vil_porter");
  });

  it("parses a file resaved by Aseprite when the local build is present", async () => {
    const exe =
      process.env.ASEPRITE ??
      "C:\\Users\\novos\\Projects\\aseprite\\build\\bin\\aseprite.exe";
    if (!existsSync(exe)) return;
    const width = 8;
    const height = 8;
    const fill = rgbaFill(width, height, 9, 8, 7, 255);
    plot(fill, width, 3, 4, 200, 10, 10, 255);
    const original = await encodeAseprite({
      width,
      height,
      layers: [{ name: "Ink" }],
      frames: [{ cels: [{ layerIndex: 0, width, height, rgba: fill }] }],
    });
    const dir = os.tmpdir();
    const src = path.join(dir, "ember-ase-src.aseprite");
    const dst = path.join(dir, "ember-ase-dst.aseprite");
    writeFileSync(src, original);
    const resaved = spawnSync(exe, ["-b", src, "--save-as", dst], {
      encoding: "utf8",
    });
    expect(resaved.status).toBe(0);
    const parsed = await parseAseprite(new Uint8Array(readFileSync(dst)));
    const result = importAsepriteDocument(parsed, { id: "spr_live" });
    if (!result.ok) throw new Error(result.error);
    expect(result.sprite.pixels[4 * 8 + 3]).toBe("#c80a0a");
  });
});
