/**
 * Deck building for the Minigames → Memory pairs (Пары на память) game.
 *
 * A deck is N still-image pairs (favorites or disk files) shuffled into
 * cards. Some pairs are "cursed": matching one triggers a PuzzleTask (reward
 * on success, penalty on fail). The curse is hidden — the card backs are
 * identical, so which pair is cursed is a surprise at match time.
 */

export interface MemoryPairAsset {
  /** Unique pair id (favorite record id or upload id). */
  id: string;
  /** Object URL the game owns and revokes when the deck is torn down. */
  url: string;
  label: string;
}

export interface MemoryCard {
  /** Unique per card: `${pairId}:${0|1}`. */
  key: string;
  pairId: string;
  cursed: boolean;
}

/** Copy + Fisher–Yates shuffle with an injectable rng (for tests). */
export function shuffled<T>(items: readonly T[], rng: () => number = Math.random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Build a deck: every asset becomes two cards, then mark `cursedCount`
 * random pairs as cursed (clamped to the pair total) and shuffle.
 */
export function buildMemoryDeck(
  assets: readonly MemoryPairAsset[],
  cursedCount: number,
  rng: () => number = Math.random,
): MemoryCard[] {
  const cursedIds = new Set(
    shuffled(assets, rng)
      .slice(0, Math.max(0, Math.min(cursedCount, assets.length)))
      .map((a) => a.id),
  );
  const cards: MemoryCard[] = [];
  for (const a of assets) {
    for (const copy of [0, 1] as const) {
      cards.push({ key: `${a.id}:${copy}`, pairId: a.id, cursed: cursedIds.has(a.id) });
    }
  }
  return shuffled(cards, rng);
}

/**
 * Grid shape for a card count: the smallest column count ≥ √n that divides n
 * exactly (12 → 4×3, 16 → 4×4, 20 → 5×4, 24 → 6×4). When n has no such
 * divisor the last grid row stays partial (cols = ⌈√n⌉).
 */
export function memoryGridFor(cardCount: number): { cols: number; rows: number } {
  const n = Math.max(1, Math.floor(cardCount));
  const start = Math.ceil(Math.sqrt(n));
  for (let cols = start; cols < n; cols++) {
    if (n % cols === 0) return { cols, rows: n / cols };
  }
  if (n === 1) return { cols: 1, rows: 1 };
  return { cols: start, rows: Math.ceil(n / start) };
}
