export type DoujinGridFit = {
  cols: number;
  rows: number;
  pageSize: number;
};

const GAP = 14;
const MIN_CARD = 236;
const MAX_COLS = 5;
/** Library tab leaves a column for the taste rail (5×2 → 4×2). */
export const LIBRARY_GRID_MAX_COLS = 4;
const MIN_COLS = 3;
const MAX_ROWS = 4;
const MIN_ROWS = 2;
const COVER_RATIO = 1.5;

/** Fit a 2:3 cover grid into a viewport so every cell is filled. */
export function fitDoujinGrid(
  width: number,
  height: number,
  opts?: { maxCols?: number },
): DoujinGridFit {
  const maxCols = clampCols(opts?.maxCols ?? MAX_COLS);
  const w = Math.max(MIN_CARD, width);
  const h = Math.max(MIN_CARD * COVER_RATIO, height);
  const cols = Math.max(
    MIN_COLS,
    Math.min(maxCols, Math.floor((w + GAP) / (MIN_CARD + GAP))),
  );
  const cardW = (w - GAP * (cols - 1)) / cols;
  const cardH = cardW * COVER_RATIO;
  const rows = Math.max(
    MIN_ROWS,
    Math.min(MAX_ROWS, Math.floor((h + GAP) / (cardH + GAP))),
  );
  return { cols, rows, pageSize: cols * rows };
}

function clampCols(n: number): number {
  if (!Number.isFinite(n)) return MAX_COLS;
  return Math.max(MIN_COLS, Math.min(MAX_COLS, Math.round(n)));
}

export const DEFAULT_DOUJIN_GRID_FIT: DoujinGridFit = {
  cols: 5,
  rows: 3,
  pageSize: 15,
};

/** Map a fitted-grid page onto an API list that uses a different page size. */
export function apiWindowForGridPage(
  gridPage: number,
  pageSize: number,
  apiSize: number,
): { apiPage: number; offset: number } {
  const size = Math.max(1, Math.round(apiSize));
  const take = Math.max(1, Math.round(pageSize));
  const start = (Math.max(1, gridPage) - 1) * take;
  return {
    apiPage: Math.floor(start / size) + 1,
    offset: start % size,
  };
}

export function gridPageCount(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(Math.max(0, total) / Math.max(1, pageSize)));
}

export function windowListItems<T>(
  apiItems: T[],
  offset: number,
  pageSize: number,
  nextItems?: T[],
): T[] {
  const n = Math.max(1, pageSize);
  const head = apiItems.slice(Math.max(0, offset), Math.max(0, offset) + n);
  if (head.length >= n || !nextItems?.length) return head;
  return head.concat(nextItems.slice(0, n - head.length));
}
