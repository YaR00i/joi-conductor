/** Kenney 2014 isometric tiles: diamond top ~128×64, PNG ~132×99 with dirt sides. */

export const ISO_W = 128;
export const ISO_H = 64;
/** Pin the diamond top to the grid, not the extruded PNG bottom. */
export const ISO_GROUND_ORIGIN_Y = 0.45;

export const FIELD_OX = 8;
export const FIELD_OY = 6;
export const MAP_PAD = 7;

export function farmMapSize(cols: number, rows: number): { worldCols: number; worldRows: number } {
  return {
    worldCols: cols + FIELD_OX + MAP_PAD,
    worldRows: rows + FIELD_OY + MAP_PAD,
  };
}

export function isoOrigin(worldCols: number, worldRows: number, pad = 140): { x: number; y: number } {
  void worldCols;
  return {
    x: pad + worldRows * (ISO_W / 2),
    y: pad + 48,
  };
}

export function isoToScreen(
  col: number,
  row: number,
  originX: number,
  originY: number,
): { x: number; y: number } {
  return {
    x: originX + (col - row) * (ISO_W / 2),
    y: originY + (col + row) * (ISO_H / 2),
  };
}

export function screenToIso(
  x: number,
  y: number,
  originX: number,
  originY: number,
): { col: number; row: number } {
  const dx = (x - originX) / (ISO_W / 2);
  const dy = (y - originY) / (ISO_H / 2);
  return {
    col: (dx + dy) / 2,
    row: (dy - dx) / 2,
  };
}

export function isoDepth(col: number, row: number): number {
  return col + row;
}

/** Floor cubes stay in a low band so walkers never clip into tile sides. */
export const ISO_ACTOR_BAND = 120;

export function isoFloorDepth(col: number, row: number): number {
  return isoDepth(col, row);
}

export function isoActorDepth(col: number, row: number, extra = 0): number {
  return ISO_ACTOR_BAND + isoDepth(col, row) * 10 + extra;
}

export function fieldToWorld(tx: number, ty: number): { col: number; row: number } {
  return { col: tx + FIELD_OX, row: ty + FIELD_OY };
}

export function worldToField(col: number, row: number): { tx: number; ty: number } {
  return { tx: col - FIELD_OX, ty: row - FIELD_OY };
}

export function isoMapBounds(
  worldCols: number,
  worldRows: number,
  originX: number,
  originY: number,
  pad = 180,
): { x: number; y: number; width: number; height: number } {
  const corners = [
    isoToScreen(0, 0, originX, originY),
    isoToScreen(worldCols, 0, originX, originY),
    isoToScreen(0, worldRows, originX, originY),
    isoToScreen(worldCols, worldRows, originX, originY),
  ];
  const xs = corners.map((c) => c.x);
  const ys = corners.map((c) => c.y);
  const minX = Math.min(...xs) - pad;
  const minY = Math.min(...ys) - pad;
  return {
    x: minX,
    y: minY,
    width: Math.max(...xs) - minX + pad,
    height: Math.max(...ys) - minY + pad + 120,
  };
}
