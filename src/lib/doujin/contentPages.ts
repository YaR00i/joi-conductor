/** Inclusive content-page range: skip typical cover / credits / translator notes. */

export type ContentPageRange = {
  start: number;
  end: number;
};

const MAX_CUT_RATIO = 0.3;

/**
 * First/last pages of a volume are often not jerk content.
 * Short books: cover only. Longer: 2–3 front, 1–2 back, never more than 30%.
 */
export function contentPageRange(pageCount: number): ContentPageRange {
  const n = Math.max(1, Math.floor(pageCount));
  const last = n - 1;
  if (n <= 2) return { start: 0, end: last };
  if (n <= 8) return { start: 1, end: last };

  let front = n >= 40 ? 3 : 2;
  let back = n >= 24 ? 2 : 1;
  const maxCut = Math.max(1, Math.floor(n * MAX_CUT_RATIO));
  while (front + back > maxCut && (front > 1 || back > 0)) {
    if (front >= back && front > 1) front -= 1;
    else if (back > 0) back -= 1;
    else break;
  }
  const start = Math.min(front, last);
  const end = Math.max(start, last - back);
  return { start, end };
}

export function isContentPage(pageIndex: number, pageCount: number): boolean {
  const range = contentPageRange(pageCount);
  const i = Math.floor(pageIndex);
  return i >= range.start && i <= range.end;
}

/** Volume first and last page never start a task, even if they sit in the content range. */
export function canSpawnTaskOnPage(pageIndex: number, pageCount: number): boolean {
  const n = Math.max(1, Math.floor(pageCount));
  const last = n - 1;
  const i = Math.floor(pageIndex);
  if (i <= 0 || i >= last) return false;
  return isContentPage(i, n);
}

export function clipTaskSpan(
  pageIndex: number,
  span: number,
  pageCount: number,
): ContentPageRange | null {
  if (!canSpawnTaskOnPage(pageIndex, pageCount)) return null;
  const n = Math.max(1, Math.floor(pageCount));
  const last = n - 1;
  const range = contentPageRange(n);
  const start = Math.max(range.start, Math.floor(pageIndex));
  if (start <= 0 || start >= last) return null;
  const want = Math.max(1, Math.floor(span));
  let end = Math.min(range.end, start + want - 1);
  if (end >= last) end = last - 1;
  if (end < start) return null;
  return { start, end };
}
