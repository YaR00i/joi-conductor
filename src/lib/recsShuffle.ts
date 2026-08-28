/** Deterministic shuffle index: walk every slot once, then reshuffle the next cycle. */
export function recsShuffleIndex(length: number, tick: number): number {
  const n = Math.max(1, Math.floor(length));
  const t = Math.max(0, Math.floor(tick));
  const cycle = Math.floor(t / n);
  const pos = t % n;
  const order = Array.from({ length: n }, (_, i) => i);
  let seed = (Math.imul(cycle + 1, 2654435761) ^ (n * 0x9e3779b9)) >>> 0;
  for (let i = n - 1; i > 0; i--) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const j = seed % (i + 1);
    const cur = order[i]!;
    order[i] = order[j]!;
    order[j] = cur;
  }
  return order[pos] ?? 0;
}
