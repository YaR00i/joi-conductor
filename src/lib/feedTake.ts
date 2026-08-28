const FEED_TAKE_MARKS = [1, 5, 10, 20, 30, 40, 50, 80, 100, 140] as const;

/** How many items the pack drum may take, including the remainder. */
export function feedTakeCounts(remaining: number): number[] {
  const cap = Math.max(1, Math.floor(remaining) || 1);
  const out: number[] = [];
  for (const mark of FEED_TAKE_MARKS) {
    if (mark < cap) out.push(mark);
  }
  if (!out.includes(cap)) out.push(cap);
  return out;
}
