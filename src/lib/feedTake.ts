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

export function defaultFeedTake(remaining: number, preferAll = false): number {
  const counts = feedTakeCounts(remaining);
  if (preferAll) return counts[counts.length - 1] ?? 1;
  if (counts.includes(10)) return 10;
  return counts[counts.length - 1] ?? 1;
}

export function toggleSelectedById<T extends { id: string | number }>(
  list: readonly T[],
  item: T,
): T[] {
  if (list.some((row) => row.id === item.id)) {
    return list.filter((row) => row.id !== item.id);
  }
  return [...list, item];
}
