/** Neighbor page URLs around the current index, farther pages first in each step. */
export function neighborPageUrls(
  pages: readonly { url: string }[],
  index: number,
  radius = 3,
): string[] {
  const i = Math.max(0, Math.floor(index));
  const r = Math.max(1, Math.floor(radius));
  const out: string[] = [];
  const seen = new Set<string>();
  for (let d = 1; d <= r; d += 1) {
    for (const page of [pages[i + d], pages[i - d]]) {
      const url = page?.url;
      if (!url || seen.has(url)) continue;
      seen.add(url);
      out.push(url);
    }
  }
  return out;
}
