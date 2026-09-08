import { FIELD_OX, FIELD_OY, farmMapSize } from "./farmIso";

export type FarmGroundCell = { col: number; row: number; land: number };

export type FarmDecorSprite = {
  col: number;
  row: number;
  tex: string;
  scale?: number;
  tint?: number;
};

/** Same Kenney block: green top + brown sides. Not canals / shores / ramps. */
export const FARM_LAND_GRASS = 67;
/** Same block, brown top. */
export const FARM_LAND_DIRT = 83;

function hash(c: number, r: number): number {
  return (Math.imul(c + 3, 374761393) ^ Math.imul(r + 7, 668265263)) >>> 0;
}

function inField(c: number, r: number, cols: number, rows: number): boolean {
  return c >= FIELD_OX && c < FIELD_OX + cols && r >= FIELD_OY && r < FIELD_OY + rows;
}

function isPath(c: number, r: number, cols: number, rows: number): boolean {
  const left = c === FIELD_OX - 1 && r >= FIELD_OY - 1 && r <= FIELD_OY + rows;
  const bottom = r === FIELD_OY + rows && c >= FIELD_OX - 1 && c <= FIELD_OX + cols + 1;
  const cut =
    Math.abs(c - r - (FIELD_OX - FIELD_OY - 2)) <= 0 && r >= FIELD_OY - 2 && c <= FIELD_OX + cols;
  return left || bottom || cut;
}

/** Decorative ground around the playable plots. One block shape so tops form a plane. */
export function farmGround(cols: number, rows: number): FarmGroundCell[] {
  const { worldCols, worldRows } = farmMapSize(cols, rows);
  const out: FarmGroundCell[] = [];
  for (let r = 0; r < worldRows; r++) {
    for (let c = 0; c < worldCols; c++) {
      if (inField(c, r, cols, rows)) continue;
      const land = isPath(c, r, cols, rows) ? FARM_LAND_DIRT : FARM_LAND_GRASS;
      out.push({ col: c, row: r, land });
    }
  }
  return out;
}

function reserved(cols: number): Set<string> {
  const s = new Set<string>();
  const add = (c: number, r: number) => s.add(`${c},${r}`);
  add(FIELD_OX - 2, FIELD_OY - 1);
  add(FIELD_OX + cols + 1, FIELD_OY);
  add(FIELD_OX + cols + 2, FIELD_OY + 2);
  for (let i = 0; i < 3; i++) add(FIELD_OX + cols + 1, FIELD_OY + 4 + i * 2);
  add(FIELD_OX - 3, FIELD_OY + 2);
  add(FIELD_OX - 4, FIELD_OY + 5);
  add(FIELD_OX + cols + 3, FIELD_OY - 2);
  add(FIELD_OX + cols + 4, FIELD_OY + 1);
  add(FIELD_OX + 2, FIELD_OY - 3);
  add(FIELD_OX + cols - 1, FIELD_OY - 2);
  return s;
}

export function farmDecor(cols: number, rows: number): FarmDecorSprite[] {
  const { worldCols, worldRows } = farmMapSize(cols, rows);
  const blocked = reserved(cols);
  const out: FarmDecorSprite[] = [];
  for (let r = 0; r < worldRows; r++) {
    for (let c = 0; c < worldCols; c++) {
      if (inField(c, r, cols, rows)) continue;
      if (blocked.has(`${c},${r}`)) continue;
      if (isPath(c, r, cols, rows)) continue;
      const n = hash(c, r);
      if (n % 13 === 0) {
        out.push({ col: c, row: r, tex: "iso-tree", scale: 0.85 + (n % 5) * 0.04 });
      } else if (n % 19 === 0) {
        out.push({ col: c, row: r, tex: "iso-heart", scale: 0.9 });
      }
    }
  }
  out.push(
    { col: FIELD_OX - 3, row: FIELD_OY + 2, tex: "b-18", scale: 1 },
    { col: FIELD_OX - 4, row: FIELD_OY + 5, tex: "b-33", scale: 1 },
    { col: FIELD_OX + cols + 3, row: FIELD_OY - 2, tex: "b-62", scale: 1 },
    { col: FIELD_OX + cols + 4, row: FIELD_OY + 1, tex: "b-77", scale: 1 },
    { col: FIELD_OX + 2, row: FIELD_OY - 3, tex: "b-100", scale: 1 },
    { col: FIELD_OX + cols - 1, row: FIELD_OY - 2, tex: "b-85", scale: 1 },
    { col: 2, row: worldRows - 3, tex: "b-48", scale: 1 },
    { col: 4, row: worldRows - 2, tex: "heel", scale: 1.1 },
  );
  return out;
}

export function farmWellCell(): { col: number; row: number } {
  return { col: FIELD_OX - 2, row: FIELD_OY - 1 };
}

export function farmWarehouseCell(cols: number): { col: number; row: number } {
  return { col: FIELD_OX + cols + 1, row: FIELD_OY };
}

export function farmTruckCell(cols: number): { col: number; row: number } {
  return { col: FIELD_OX + cols + 2, row: FIELD_OY + 2 };
}

export function farmFactoryCell(cols: number, index: number): { col: number; row: number } {
  return { col: FIELD_OX + cols + 1, row: FIELD_OY + 4 + index * 2 };
}
