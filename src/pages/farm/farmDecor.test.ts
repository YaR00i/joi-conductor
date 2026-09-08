import { describe, expect, it } from "vitest";
import { FIELD_OX, FIELD_OY } from "./farmIso";
import {
  FARM_LAND_DIRT,
  FARM_LAND_GRASS,
  farmGround,
} from "./farmDecor";

describe("farm decorative ground", () => {
  it("uses only matching grass/dirt blocks", () => {
    const cells = farmGround(8, 6);
    expect(cells.length).toBeGreaterThan(40);
    for (const cell of cells) {
      expect([FARM_LAND_GRASS, FARM_LAND_DIRT]).toContain(cell.land);
    }
  });

  it("does not cover playable plots", () => {
    const cols = 8;
    const rows = 6;
    for (const cell of farmGround(cols, rows)) {
      const onField =
        cell.col >= FIELD_OX &&
        cell.col < FIELD_OX + cols &&
        cell.row >= FIELD_OY &&
        cell.row < FIELD_OY + rows;
      expect(onField).toBe(false);
    }
  });
});
