import { describe, expect, it } from "vitest";
import {
  buildMemoryDeck,
  memoryGridFor,
  prettyMediaLabel,
  shuffled,
  type MemoryPairAsset,
} from "./memoryDeck";

function assets(n: number): MemoryPairAsset[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `a${i}`,
    url: `blob:${i}`,
    label: `p${i}`,
  }));
}

describe("shuffled", () => {
  it("keeps all elements and the source array untouched", () => {
    const src = [1, 2, 3, 4, 5, 6, 7, 8];
    const out = shuffled(src, () => 0);
    expect(out).not.toBe(src);
    expect([...out].sort()).toEqual(src);
    expect(src).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("deterministic with a seeded rng", () => {
    const makeRng = (seed: number) => {
      let s = seed;
      return () => {
        s = (s * 1103515245 + 12345) % 2147483648;
        return s / 2147483648;
      };
    };
    expect(shuffled([1, 2, 3, 4], makeRng(42))).toEqual(
      shuffled([1, 2, 3, 4], makeRng(42)),
    );
  });
});

describe("buildMemoryDeck", () => {
  it("makes two cards per asset", () => {
    const deck = buildMemoryDeck(assets(8), 0);
    expect(deck).toHaveLength(16);
    const byPair = new Map<string, number>();
    for (const c of deck) byPair.set(c.pairId, (byPair.get(c.pairId) ?? 0) + 1);
    for (const n of byPair.values()) expect(n).toBe(2);
  });

  it("keys are unique across both copies", () => {
    const deck = buildMemoryDeck(assets(6), 0);
    expect(new Set(deck.map((c) => c.key)).size).toBe(12);
  });

  it("marks exactly cursedCount pairs as cursed (both copies)", () => {
    const deck = buildMemoryDeck(assets(8), 3);
    const cursedPairs = new Set(
      deck.filter((c) => c.cursed).map((c) => c.pairId),
    );
    expect(cursedPairs.size).toBe(3);
    for (const pid of cursedPairs) {
      expect(deck.filter((c) => c.pairId === pid && c.cursed)).toHaveLength(2);
    }
  });

  it("clamps cursedCount to the pair total", () => {
    const deck = buildMemoryDeck(assets(2), 99);
    expect(deck.every((c) => c.cursed)).toBe(true);
  });

  it("zero cursed leaves a clean deck", () => {
    expect(buildMemoryDeck(assets(4), 0).every((c) => !c.cursed)).toBe(true);
  });
});

describe("memoryGridFor", () => {
  it.each([
    [12, 4, 3],
    [16, 4, 4],
    [20, 5, 4],
    [24, 6, 4],
    [8, 4, 2],
    [4, 2, 2],
    [2, 2, 1],
    [1, 1, 1],
  ])("%i cards → %ix%i", (n, cols, rows) => {
    expect(memoryGridFor(n)).toEqual({ cols, rows });
  });

  it("falls back to a partial last row for awkward counts", () => {
    expect(memoryGridFor(7)).toEqual({ cols: 3, rows: 3 });
    expect(memoryGridFor(0)).toEqual({ cols: 1, rows: 1 });
  });
});

describe("prettyMediaLabel", () => {
  it("strips a file extension from trophy captions", () => {
    expect(prettyMediaLabel("cruel.png")).toBe("cruel");
    expect(prettyMediaLabel("Calm.JPEG")).toBe("Calm");
    expect(prettyMediaLabel("без расширения")).toBe("без расширения");
  });
});
