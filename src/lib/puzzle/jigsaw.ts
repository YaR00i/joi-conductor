/**
 * Classic jigsaw cutting logic (no React, no DOM beyond Path2D).
 *
 * The board image area is split into a cols×rows grid. Every internal seam
 * carries one random knob descriptor (direction + size + centre shift + width);
 * both neighbours reuse it, which guarantees complementary tabs/blanks that fit
 * exactly while knobs vary like on a real puzzle. Border seams are flat.
 *
 * Knob shape (normalized per edge): a concave curved neck flowing smoothly out
 * of the flat shoulder, opening into a taller rounded head wider than the neck.
 * Control points keep (near-)collinear tangents at every joint: horizontal at
 * shoulder/neck exit, vertical at the neck/head junction, horizontal at the
 * dome apex — no straight segments or sharp corners inside the knob.
 *
 * Per-seam variety is applied via an affine remap of the x coefficients:
 * x' = cx + (x − 0.5)·(hw / 0.32), so the base silhouette (cx=0.5, hw=0.32,
 * amp=1) is exactly the classic knob, and random cx/hw/amp slide, widen and
 * resize each knob independently.
 */

/** Per-seam knob descriptor (shared by both neighbouring pieces). */
export interface SeamKnob {
  /** Polarity: +1 / -1 (which side the tab bulges to). */
  s: number;
  /** Height factor of the knob (≈0.8…1.2). */
  amp: number;
  /** Knob centre along the edge, normalized ≈0.44…0.56. */
  cx: number;
  /** Knob half-width along the edge, normalized ≈0.27…0.34 (base 0.32). */
  hw: number;
}

export interface JigsawEdges {
  /** hg[r][c] knob of horizontal seam below row r (null = flat border). */
  hg: (SeamKnob | null)[][];
  /** vg[r][c] knob of vertical seam right of col c (null = flat border). */
  vg: (SeamKnob | null)[][];
}

export interface JigsawCell {
  col: number;
  row: number;
  /** Center coords inside the image area (image top-left at 0,0). */
  correctX: number;
  correctY: number;
  path: Path2D;
  /** True if any edge is a border (used for "edge first" arrange). */
  isBorder: boolean;
}

export interface JigsawSpec {
  cols: number;
  rows: number;
  pieceW: number;
  pieceH: number;
  edges: JigsawEdges;
  cells: JigsawCell[];
}

export type Rng = () => number;

/** Knob height as a fraction of the perpendicular piece size. */
const TAB_AMP = 0.27;

type Pt = readonly [number, number];
type Seg =
  | { type: "line"; to: Pt }
  | { type: "bez"; c1: Pt; c2: Pt; to: Pt };

const FLAT_H = (w: number): Seg[] => [{ type: "line", to: [w, 0] }];
const FLAT_V = (h: number): Seg[] => [{ type: "line", to: [0, h] }];

/**
 * Horizontal knob, edge drawn in +x from (0,0) to (w,0); bulges in +y when
 * knob.s > 0. Neck base (0.40 / 0.60 at y=0.35b) is narrower than the head
 * (curve reaches ≈0.35 at y≈0.75b), so the head overhangs the neck.
 */
function horizSegs(w: number, k: SeamKnob, amp: number): Seg[] {
  const b = amp * k.amp * k.s;
  const m = (x: number) => (k.cx + (x - 0.5) * (k.hw / 0.32)) * w;
  return [
    { type: "line", to: [m(0.18), 0] },
    { type: "bez", c1: [m(0.24), 0.03 * b], c2: [m(0.38), 0.12 * b], to: [m(0.4), 0.35 * b] },
    { type: "bez", c1: [m(0.38), 0.65 * b], c2: [m(0.26), 0.9 * b], to: [m(0.5), b] },
    { type: "bez", c1: [m(0.74), b], c2: [m(0.62), 0.65 * b], to: [m(0.6), 0.35 * b] },
    { type: "bez", c1: [m(0.62), 0.12 * b], c2: [m(0.76), 0.03 * b], to: [m(0.82), 0] },
    { type: "line", to: [w, 0] },
  ];
}

/** Vertical knob, edge in +y from (0,0) to (0,h); bulges in +x (same shape). */
function vertSegs(h: number, k: SeamKnob, amp: number): Seg[] {
  const b = amp * k.amp * k.s;
  const m = (y: number) => (k.cx + (y - 0.5) * (k.hw / 0.32)) * h;
  return [
    { type: "line", to: [0, m(0.18)] },
    { type: "bez", c1: [0.03 * b, m(0.24)], c2: [0.12 * b, m(0.38)], to: [0.35 * b, m(0.4)] },
    { type: "bez", c1: [0.65 * b, m(0.38)], c2: [0.9 * b, m(0.26)], to: [b, m(0.5)] },
    { type: "bez", c1: [b, m(0.74)], c2: [0.65 * b, m(0.62)], to: [0.35 * b, m(0.6)] },
    { type: "bez", c1: [0.12 * b, m(0.62)], c2: [0.03 * b, m(0.76)], to: [0, m(0.82)] },
    { type: "line", to: [0, h] },
  ];
}

/** How far a tab dome extends beyond the piece rectangle (for texture padding). */
export const TAB_PAD = 1.4 * TAB_AMP;

function appendSegs(path: Path2D, segs: Seg[], ox: number, oy: number): void {
  for (const seg of segs) {
    if (seg.type === "line") {
      path.lineTo(ox + seg.to[0], oy + seg.to[1]);
    } else {
      path.bezierCurveTo(
        ox + seg.c1[0], oy + seg.c1[1],
        ox + seg.c2[0], oy + seg.c2[1],
        ox + seg.to[0], oy + seg.to[1],
      );
    }
  }
}

/**
 * Reverse an edge (segments all start at (0,0)): walk the SAME curve backwards.
 * Unlike mirroring, reversing keeps asymmetric knobs (cx ≠ 0.5) geometrically
 * identical on both neighbouring pieces, so tabs always mate exactly.
 */
function reverseSegs(segs: Seg[]): Seg[] {
  const starts: Pt[] = [[0, 0]];
  for (const s of segs) starts.push(s.to);
  const out: Seg[] = [];
  for (let i = segs.length - 1; i >= 0; i--) {
    const s = segs[i];
    const to = starts[i];
    if (s.type === "line") {
      out.push({ type: "line", to });
    } else {
      out.push({ type: "bez", c1: s.c2, c2: s.c1, to });
    }
  }
  return out;
}

function randKnob(rng: Rng): SeamKnob {
  return {
    s: rng() < 0.5 ? -1 : 1,
    amp: 0.8 + rng() * 0.4,
    cx: 0.44 + rng() * 0.12,
    hw: 0.27 + rng() * 0.07,
  };
}

function generateEdges(cols: number, rows: number, rng: Rng): JigsawEdges {
  const hg: (SeamKnob | null)[][] = [];
  for (let r = 0; r <= rows; r++) {
    const row: (SeamKnob | null)[] = [];
    for (let c = 0; c < cols; c++) {
      row.push(r === 0 || r === rows ? null : randKnob(rng));
    }
    hg.push(row);
  }
  const vg: (SeamKnob | null)[][] = [];
  for (let r = 0; r < rows; r++) {
    const row: (SeamKnob | null)[] = [];
    for (let c = 0; c <= cols; c++) {
      row.push(c === 0 || c === cols ? null : randKnob(rng));
    }
    vg.push(row);
  }
  return { hg, vg };
}

/**
 * Build the closed Path2D of one piece in its local coords (0,0 top-left,
 * size pieceW×pieceH), traversed clockwise: top → right → bottom → left.
 * Bottom/left edges traverse the same seam curve as their neighbour's
 * top/right, just reversed (not mirrored), so knobs mate exactly.
 */
function buildCellPath(
  col: number,
  row: number,
  pieceW: number,
  pieceH: number,
  edges: JigsawEdges,
): Path2D {
  const path = new Path2D();
  const ampH = pieceH * TAB_AMP;
  const ampV = pieceW * TAB_AMP;
  const top = edges.hg[row][col];
  const right = edges.vg[row][col + 1];
  const bottom = edges.hg[row + 1][col];
  const left = edges.vg[row][col];
  path.moveTo(0, 0);
  appendSegs(path, top ? horizSegs(pieceW, top, ampH) : FLAT_H(pieceW), 0, 0);
  appendSegs(path, right ? vertSegs(pieceH, right, ampV) : FLAT_V(pieceH), pieceW, 0);
  // bottom/left: same seam curve walked in reverse — including flat borders,
  // otherwise the path collapses and the next edge cuts a diagonal.
  const bottomSegs = bottom ? horizSegs(pieceW, bottom, ampH) : FLAT_H(pieceW);
  appendSegs(path, reverseSegs(bottomSegs), 0, pieceH);
  const leftSegs = left ? vertSegs(pieceH, left, ampV) : FLAT_V(pieceH);
  appendSegs(path, reverseSegs(leftSegs), 0, 0);
  path.closePath();
  return path;
}

export function buildJigsaw(
  cols: number,
  rows: number,
  areaW: number,
  areaH: number,
  rng: Rng = Math.random,
): JigsawSpec {
  const pieceW = areaW / cols;
  const pieceH = areaH / rows;
  const edges = generateEdges(cols, rows, rng);
  const cells: JigsawCell[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const isBorder = col === 0 || col === cols - 1 || row === 0 || row === rows - 1;
      cells.push({
        col,
        row,
        correctX: col * pieceW + pieceW / 2,
        correctY: row * pieceH + pieceH / 2,
        path: buildCellPath(col, row, pieceW, pieceH, edges),
        isBorder,
      });
    }
  }
  return { cols, rows, pieceW, pieceH, edges, cells };
}

/** Indices of the 4 grid neighbours of a cell (may be out of range). */
export function neighbourCoords(col: number, row: number, cols: number, rows: number): Array<[number, number]> {
  return [
    [col, row - 1],
    [col + 1, row],
    [col, row + 1],
    [col - 1, row],
  ].filter(([c, r]) => c >= 0 && c < cols && r >= 0 && r < rows) as Array<[number, number]>;
}

export function cellKey(col: number, row: number): string {
  return `${col}:${row}`;
}
