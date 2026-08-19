import { describe, expect, it } from "vitest";
import type { EmberMap, EmberTileset } from "../content/types";
import {
  buildMapSurfaces,
  lightSurfaces,
  litSurfacesToFloorGlow,
} from "./mapLighting";
import type { LanternSource } from "./mapUtils";
import { createEmptyMap, ensureMapLayers, layerData } from "./mapUtils";

const tileset: EmberTileset = {
  id: "test",
  tileSize: 16,
  columns: 3,
  tileCount: 3,
  tiles: [
    { id: 1, name: "floor", color: "#808080" },
    { id: 2, name: "wall", color: "#404040", solid: true, defaultHeight: 1 },
    { id: 3, name: "stair_n", color: "#706050", stair: "n" },
  ],
};

function setCell(
  map: EmberMap,
  layer: string,
  x: number,
  y: number,
  value: number,
) {
  const data = layerData(map, layer);
  if (!data) throw new Error(`missing ${layer}`);
  const index = y * map.width + x;
  data[index] = layer === "height" ? value * map.tileSize : value;

  // Runtime/editor elevation now uses ground_z* as the source of truth.
  // Keep this legacy-oriented fixture helper in sync with that stack so the
  // tests exercise current map data instead of the stale `elevation` mirror.
  if (layer === "ground") {
    const elev = layerData(map, "elevation")?.[index] ?? 0;
    const top = layerData(map, `ground_z${elev}`);
    if (top) top[index] = value;
  } else if (layer === "elevation") {
    const ground = layerData(map, "ground")?.[index] ?? 1;
    for (const stack of map.layers.filter((item) =>
      /^ground_z-?\d+$/.test(item.name),
    )) {
      const elev = Number(stack.name.slice("ground_z".length));
      stack.data[index] =
        value >= 0
          ? elev >= 0 && elev <= value
            ? ground
            : 0
          : elev === value
            ? ground
            : 0;
    }
  }
}

function lampAt(x: number, y: number, range = 8): LanternSource {
  return {
    id: `L${x},${y}`,
    x,
    y,
    kind: "placed",
    hasOverride: true,
    params: {
      lampColor: "#ffaa48",
      lampFaceColor: "#ff9030",
      lampRange: range,
      lampDiscCore: Math.max(1, Math.round(range * 0.4)),
      lampDiscMid: Math.max(1, Math.round(range * 0.7)),
      lampHeight: 1.15,
      lampShowCore: true,
      lampStrength0: 1,
      lampStrengthFalloff: 0.45,
      lampTorchFlicker: true,
    },
  };
}

/** Open 9x9 courtyard; clear border walls in the interior. */
function openYard(): EmberMap {
  const map = ensureMapLayers(createEmptyMap("yard", 9, 9, "test", 16));
  for (let y = 1; y < 8; y++) {
    for (let x = 1; x < 8; x++) {
      setCell(map, "ground", x, y, 1);
      setCell(map, "collision", x, y, 0);
      setCell(map, "height", x, y, 0);
      setCell(map, "elevation", x, y, 0);
    }
  }
  return map;
}

describe("mapLighting surfaces + light pass", () => {
  it("z2 lamp lights z2 floors/faces/treads, soft-tops z1↔z2, skips z0", () => {
    const map = openYard();
    // z2 platform; wall north of lamp so south floor IS the lamp cell.
    setCell(map, "elevation", 4, 4, 2);
    setCell(map, "elevation", 4, 3, 2);
    setCell(map, "ground", 4, 3, 2);
    setCell(map, "collision", 4, 3, 1);
    setCell(map, "height", 4, 3, 1);

    // Stairs east of lamp on a z2 bridge (LOS cannot jump z0 pits).
    setCell(map, "elevation", 5, 4, 2);
    setCell(map, "elevation", 6, 3, 3);
    setCell(map, "ground", 6, 4, 3);
    setCell(map, "elevation", 6, 4, 2);
    setCell(map, "ground", 4, 5, 3);
    setCell(map, "elevation", 4, 5, 1);
    setCell(map, "ground", 4, 6, 3);
    setCell(map, "elevation", 4, 6, 0);
    // distant z0 floor
    setCell(map, "elevation", 2, 2, 0);

    const surfaces = buildMapSurfaces(map, tileset);
    const lit = lightSurfaces(map, tileset, surfaces, [lampAt(4, 4)]);

    expect(lit.get("floor:4,4")?.strength).toBeGreaterThan(0);
    expect(lit.get("face:w:4,3")?.strength).toBeGreaterThan(0);
    expect(lit.get("tread:6,4")?.treadMode).toBe("full");
    expect(lit.get("tread:4,5")?.treadMode).toBe("highSoft");
    expect(lit.get("tread:4,6")).toBeUndefined();
    expect(lit.get("floor:2,2")).toBeUndefined();

    const glow = litSurfacesToFloorGlow(lit);
    expect(glow.has("2,2")).toBe(false);
    expect(glow.get("4,4")?.lampElev).toBe(2);
  });

  it("z0 lamp fully lights z0↔z1 and soft-bottoms z1↔z2", () => {
    const map = openYard();
    // Landing floors for stair forward neighbors.
    setCell(map, "elevation", 4, 3, 1);
    setCell(map, "elevation", 4, 2, 2);
    setCell(map, "ground", 4, 4, 3);
    setCell(map, "elevation", 4, 4, 0); // z0↔z1 stair → north to elev 1
    setCell(map, "ground", 4, 3, 3);
    setCell(map, "elevation", 4, 3, 1); // z1↔z2 stair → north to elev 2
    setCell(map, "elevation", 3, 4, 0);

    const surfaces = buildMapSurfaces(map, tileset);
    const lit = lightSurfaces(map, tileset, surfaces, [lampAt(3, 4)]);

    expect(lit.get("tread:4,4")?.treadMode).toBe("full");
    expect(lit.get("tread:4,3")?.treadMode).toBe("lowSoft");
  });

  it("hard manhattan range does not light stairs beyond lampRange", () => {
    const map = openYard();
    setCell(map, "elevation", 2, 2, 0);
    setCell(map, "elevation", 6, 1, 1); // stair at (6,2) climbs north to elev 1
    setCell(map, "ground", 6, 2, 3);
    setCell(map, "elevation", 6, 2, 0);
    // dist = |6-2|+|2-2| = 4
    const surfaces = buildMapSurfaces(map, tileset);
    const lit = lightSurfaces(map, tileset, surfaces, [lampAt(2, 2, 3)]);
    expect(lit.get("tread:6,2")).toBeUndefined();
    const litOk = lightSurfaces(map, tileset, surfaces, [lampAt(2, 2, 4)]);
    expect(litOk.get("tread:6,2")?.strength).toBeGreaterThan(0);
  });

  it("wall face lights from lit south courtyard and from a lamp beside the wall", () => {
    const map = openYard();
    // Vertical wall column west of lamp (same row) — side feeder washes face.
    setCell(map, "ground", 2, 4, 2);
    setCell(map, "collision", 2, 4, 1);
    setCell(map, "height", 2, 4, 1);
    // North wall with lit courtyard south — SHOULD wash.
    setCell(map, "ground", 4, 3, 2);
    setCell(map, "collision", 4, 3, 1);
    setCell(map, "height", 4, 3, 1);

    const surfaces = buildMapSurfaces(map, tileset);
    const lit = lightSurfaces(map, tileset, surfaces, [lampAt(4, 4)]);

    expect(lit.get("floor:4,4")?.strength).toBeGreaterThan(0);
    expect(lit.get("face:w:4,3")?.strength).toBeGreaterThan(0);
    expect(lit.get("face:w:2,4")?.strength).toBeGreaterThan(0);
  });

  it("tall wall beside mid-height lamp washes remaining face upward", () => {
    const map = openYard();
    setCell(map, "elevation", 4, 4, 1);
    // Tall wall east of the z1 lamp (height 3 from z0).
    setCell(map, "ground", 5, 4, 2);
    setCell(map, "collision", 5, 4, 1);
    setCell(map, "height", 5, 4, 3);

    const surfaces = buildMapSurfaces(map, tileset);
    const lit = lightSurfaces(map, tileset, surfaces, [lampAt(4, 4)]);

    const face = lit.get("face:w:5,4");
    expect(face?.strength).toBeGreaterThan(0);
    expect(face?.washZ0).toBe(1);
    expect(face?.washZ1).toBe(3);
  });

  it("z2 earth beside z1 lamp occludes stairs but cliffs catch side light", () => {
    const map = openYard();
    // Lamp on z1; earth mounds z2 left/right; stairs beyond mounds.
    setCell(map, "elevation", 4, 4, 1);
    setCell(map, "elevation", 3, 4, 2);
    setCell(map, "elevation", 5, 4, 2);
    // Stairs west of left mound / east of right mound
    setCell(map, "elevation", 1, 4, 0);
    setCell(map, "elevation", 2, 3, 1);
    setCell(map, "ground", 2, 4, 3);
    setCell(map, "elevation", 2, 4, 0);
    setCell(map, "elevation", 7, 4, 0);
    setCell(map, "elevation", 6, 3, 1);
    setCell(map, "ground", 6, 4, 3);
    setCell(map, "elevation", 6, 4, 0);

    const surfaces = buildMapSurfaces(map, tileset);
    const lit = lightSurfaces(map, tileset, surfaces, [lampAt(4, 4)]);

    expect(lit.get("floor:4,4")?.strength).toBeGreaterThan(0);
    // Raised earth blocks LOS at lamp elev — stairs behind stay dark.
    expect(lit.get("tread:2,4")).toBeUndefined();
    expect(lit.get("tread:6,4")).toBeUndefined();
    // Side cliffs next to the lamp do catch face wash.
    expect(lit.get("face:c:3,4")?.strength).toBeGreaterThan(0);
    expect(lit.get("face:c:5,4")?.strength).toBeGreaterThan(0);
  });

  it("lamp on high ledge does not wash wall/cliff faces below", () => {
    const map = openYard();
    // High platform north; wall south of it; lamp on high floor.
    setCell(map, "elevation", 4, 3, 2);
    setCell(map, "ground", 4, 4, 2);
    setCell(map, "collision", 4, 4, 1);
    setCell(map, "height", 4, 4, 1);
    setCell(map, "elevation", 4, 4, 0);
    setCell(map, "elevation", 4, 5, 0);

    const surfaces = buildMapSurfaces(map, tileset);
    const lit = lightSurfaces(map, tileset, surfaces, [lampAt(4, 3)]);

    expect(lit.get("floor:4,3")?.strength).toBeGreaterThan(0);
    // South floor at z0 is not lit by z2 lamp → wall face stays dark.
    expect(lit.get("face:w:4,4")).toBeUndefined();
  });

  it("flood reaches L-shaped same-elev floors and adjacent same-level stairs", () => {
    const map = openYard();
    // L-shaped z2: (3,3)-(4,3)-(4,4); stair east of lamp cell (4,4)
    setCell(map, "elevation", 3, 3, 2);
    setCell(map, "elevation", 4, 3, 2);
    setCell(map, "elevation", 4, 4, 2);
    setCell(map, "elevation", 5, 3, 3);
    setCell(map, "ground", 5, 4, 3);
    setCell(map, "elevation", 5, 4, 2);

    const surfaces = buildMapSurfaces(map, tileset);
    // Lamp on the corner next to the stair (adjacent — no ray through z3).
    const lit = lightSurfaces(map, tileset, surfaces, [lampAt(4, 4)]);

    expect(lit.get("floor:3,3")?.strength).toBeGreaterThan(0);
    expect(lit.get("tread:5,4")?.treadMode).toBe("full");
  });

  it("z0 lamp washes tall cliff face fully upward", () => {
    const map = openYard();
    // High z3 ledge with south drop to z0; lamp on the low floor.
    setCell(map, "elevation", 4, 3, 3);
    setCell(map, "elevation", 4, 4, 0);

    const surfaces = buildMapSurfaces(map, tileset);
    const lit = lightSurfaces(map, tileset, surfaces, [lampAt(4, 4)]);

    const face = lit.get("face:c:4,3");
    expect(face?.strength).toBeGreaterThan(0);
    expect(face?.washZ0).toBe(0);
    expect(face?.washZ1).toBe(3);
  });

  it("z3 lamp reaches other z3 floors across a z0 air gap", () => {
    const map = openYard();
    // Pillar top at (3,3); plateau at (6,3) — same elev, gap of z0 between.
    setCell(map, "elevation", 3, 3, 3);
    setCell(map, "elevation", 6, 3, 3);
    setCell(map, "elevation", 6, 4, 3);
    setCell(map, "elevation", 4, 3, 0);
    setCell(map, "elevation", 5, 3, 0);

    const surfaces = buildMapSurfaces(map, tileset);
    const lit = lightSurfaces(map, tileset, surfaces, [lampAt(3, 3)]);

    expect(lit.get("floor:3,3")?.strength).toBeGreaterThan(0);
    expect(lit.get("floor:6,3")?.strength).toBeGreaterThan(0);
    expect(lit.get("floor:6,4")?.strength).toBeGreaterThan(0);
    // Lower gap stays unlit (different elev).
    expect(lit.get("floor:4,3")).toBeUndefined();
  });

  it("z0 lamp does not pierce through elevated blocks to z0 behind them", () => {
    const map = openYard();
    // Lamp — z3 block — z0 beyond (same row).
    setCell(map, "elevation", 4, 4, 0);
    setCell(map, "elevation", 3, 4, 3);
    setCell(map, "elevation", 2, 4, 0);
    // Also a z2 blocker north of the lamp.
    setCell(map, "elevation", 4, 3, 2);
    setCell(map, "elevation", 4, 2, 0);

    const surfaces = buildMapSurfaces(map, tileset);
    const lit = lightSurfaces(map, tileset, surfaces, [lampAt(4, 4)]);

    expect(lit.get("floor:4,4")?.strength).toBeGreaterThan(0);
    expect(lit.get("floor:2,4")).toBeUndefined();
    expect(lit.get("floor:4,2")).toBeUndefined();
    // Elevated top itself never receives a z0 lamp.
    expect(lit.get("floor:3,4")).toBeUndefined();
    // Side paths around the block can still light other z0 cells.
    expect(lit.get("floor:5,4")?.strength).toBeGreaterThan(0);
  });

  it("z0 lamp beside a z3 pillar does not light the z3 top (only cliff from south)", () => {
    const map = openYard();
    // Vertical lit z0 column; z3 pillar west of mid column.
    setCell(map, "elevation", 4, 5, 0);
    setCell(map, "elevation", 4, 4, 0);
    setCell(map, "elevation", 4, 3, 0);
    setCell(map, "elevation", 3, 3, 3);
    // South of pillar is also z0 (may feed cliff), but top stays unlit.
    setCell(map, "elevation", 3, 4, 0);

    const surfaces = buildMapSurfaces(map, tileset);
    const lit = lightSurfaces(map, tileset, surfaces, [lampAt(4, 5)]);

    expect(lit.get("floor:4,5")?.strength).toBeGreaterThan(0);
    expect(lit.get("floor:4,3")?.strength).toBeGreaterThan(0);
    expect(lit.get("floor:3,3")).toBeUndefined();
    expect(litSurfacesToFloorGlow(lit).has("3,3")).toBe(false);
    // Cliff may wash from lit south floor — that is face, not top.
    expect(lit.get("face:c:3,3")?.strength).toBeGreaterThan(0);
  });

  it("z3 lamp lights contiguous and gapped z3 floors; glow keeps lampElev 3", () => {
    const map = openYard();
    setCell(map, "elevation", 3, 3, 3);
    setCell(map, "elevation", 4, 3, 3);
    setCell(map, "elevation", 6, 3, 3);
    // Solid south of plateau — must not prevent same-level data (paint clip fixed separately).
    setCell(map, "ground", 4, 4, 2);
    setCell(map, "collision", 4, 4, 1);
    setCell(map, "height", 4, 4, 3);

    const surfaces = buildMapSurfaces(map, tileset);
    const lit = lightSurfaces(map, tileset, surfaces, [lampAt(3, 3)]);
    const glow = litSurfacesToFloorGlow(lit);

    expect(lit.get("floor:3,3")?.strength).toBeGreaterThan(0);
    expect(lit.get("floor:4,3")?.strength).toBeGreaterThan(0);
    expect(lit.get("floor:6,3")?.strength).toBeGreaterThan(0);
    expect(glow.get("4,3")?.lampElev).toBe(3);
    expect(glow.get("6,3")?.lampElev).toBe(3);
  });

  it("stairs occlude z0 light — floor behind a flight stays dark", () => {
    const map = openYard();
    // Lamp (4,4) — stair (5,4) — z0 beyond (6,4)
    setCell(map, "elevation", 5, 3, 1);
    setCell(map, "ground", 5, 4, 3);
    setCell(map, "elevation", 5, 4, 0);
    setCell(map, "elevation", 6, 4, 0);

    const surfaces = buildMapSurfaces(map, tileset);
    const lit = lightSurfaces(map, tileset, surfaces, [lampAt(4, 4)]);

    // Stair itself may receive light (same-level flight), but not through it.
    expect(lit.get("tread:5,4")?.strength).toBeGreaterThan(0);
    expect(lit.get("floor:6,4")).toBeUndefined();
  });
});
