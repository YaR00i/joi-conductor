import { describe, expect, it } from "vitest";
import {
  buildTasteFromLedger,
  cardTagIds,
  catalogNeedsCardBackfill,
  catalogNeedsOrdBackfill,
  tasteSyncStartPage,
  applyFavoriteListOrds,
  ledgerCatalogReady,
  nextUnresolvedIds,
  pageHasSortCards,
  pageIsFullyKnown,
  tasteCardStub,
  windowLedgerFavorites,
  formatTasteSyncProgress,
  tasteSyncProgressRatio,
  type TasteGalleryRow,
  type TasteSyncStatus,
} from "./tasteSync";

describe("pageIsFullyKnown", () => {
  it("stops an incremental pass when every id is already in the ledger", () => {
    expect(pageIsFullyKnown([3, 1, 2], new Set([1, 2, 3, 9]))).toBe(true);
    expect(pageIsFullyKnown([3, 8], new Set([1, 2, 3]))).toBe(false);
    expect(pageIsFullyKnown([], new Set([1]))).toBe(false);
  });

  it("requires cover stubs before skipping a catch-up page", () => {
    const withCover = {
      id: 1,
      tagIds: [7],
      card: {
        id: 1,
        mediaId: "10",
        title: { english: "A", japanese: "A", pretty: "A" },
        numPages: 1,
        coverUrl: "https://t.example/1.jpg",
        thumbnailUrl: "https://t.example/1.jpg",
        tags: [],
      },
    };
    const byId = new Map<number, TasteGalleryRow>([
      [1, withCover],
      [2, { id: 2, tagIds: [7] }],
    ]);
    expect(pageHasSortCards([1, 2], byId)).toBe(false);
    expect(pageHasSortCards([1], byId)).toBe(true);
    expect(catalogNeedsCardBackfill([...byId.values()])).toBe(true);
    expect(catalogNeedsCardBackfill([withCover])).toBe(false);
    expect(ledgerCatalogReady([...byId.values()])).toBe(false);
    expect(ledgerCatalogReady([withCover])).toBe(true);
    expect(catalogNeedsOrdBackfill([withCover])).toBe(true);
    expect(catalogNeedsOrdBackfill([{ ...withCover, ord: 0 }])).toBe(false);
  });
});

describe("applyFavoriteListOrds", () => {
  const stub = (id: number, ord?: number): TasteGalleryRow => ({
    id,
    tagIds: [1],
    ord,
    card: {
      id,
      mediaId: String(id),
      title: { english: `W${id}`, japanese: "", pretty: `W${id}` },
      numPages: 8,
      coverUrl: `https://t.example/${id}.jpg`,
      thumbnailUrl: `https://t.example/${id}.jpg`,
      tags: [],
    },
  });

  it("rewrites list positions without dropping existing covers", () => {
    const byId = new Map<number, TasteGalleryRow>([
      [10, stub(10, 40)],
      [11, stub(11, 41)],
    ]);
    const cards = [stub(11).card!, stub(10).card!];
    const stamped = applyFavoriteListOrds(cards, 0, byId, false);
    expect(stamped.nextOrd).toBe(2);
    expect(stamped.rows.map((row) => [row.id, row.ord])).toEqual([
      [11, 0],
      [10, 1],
    ]);
    expect(stamped.rows[0]?.card?.coverUrl).toContain("/11.jpg");
  });
});

describe("tasteSyncStartPage", () => {
  it("restarts a finished catalog that still needs favorite order", () => {
    expect(
      tasteSyncStartPage({
        complete: true,
        lastPage: 507,
        needsBackfill: false,
        needsOrd: true,
      }),
    ).toEqual({ page: 1, resetProgress: true });
  });

  it("resumes an interrupted walk instead of starting over", () => {
    expect(
      tasteSyncStartPage({
        complete: false,
        lastPage: 40,
        needsBackfill: false,
        needsOrd: true,
      }),
    ).toEqual({ page: 41, resetProgress: false });
  });
});

describe("nextUnresolvedIds", () => {
  it("takes the most frequent unknown ids first", () => {
    expect(
      nextUnresolvedIds(
        [
          { id: 10, count: 9 },
          { id: 20, count: 4 },
          { id: 30, count: 1 },
        ],
        new Set([10]),
        2,
      ),
    ).toEqual([20, 30]);
  });
});

describe("cardTagIds", () => {
  it("unions tagIds with tag.id so artists are not dropped", () => {
    expect(cardTagIds({ tagIds: [2, 2, 5], tags: [] })).toEqual([2, 5]);
    expect(
      cardTagIds({
        tags: [
          { type: "tag", name: "glasses", id: 7 },
          { type: "tag", name: "x" },
        ],
      }),
    ).toEqual([7]);
    expect(
      cardTagIds({
        tagIds: [2],
        tags: [{ type: "artist", name: "muk", id: 9 }],
      }),
    ).toEqual([2, 9]);
  });
});

describe("windowLedgerFavorites", () => {
  const card = (id: number, artistId?: number): TasteGalleryRow => ({
    id,
    tagIds: artistId ? [artistId] : [1],
    ord: id,
    card: {
      id,
      mediaId: String(id * 10),
      title: { english: `Work ${id}`, japanese: "", pretty: `Work ${id}` },
      numPages: 12,
      coverUrl: "",
      thumbnailUrl: "",
      tags: [],
    },
  });

  it("pages the local catalog and fills cover from mediaId", () => {
    const page = windowLedgerFavorites([card(3), card(1), card(2)], 1, 2);
    expect(page?.items.map((item) => item.id)).toEqual([1, 2]);
    expect(page?.items[0]?.title.pretty).toBe("Work 1");
    expect(page?.items[0]?.numPages).toBe(12);
    expect(page?.items[0]?.coverUrl).toContain("/galleries/10/cover.jpg");
    expect(page?.numPages).toBe(2);
  });

  it("filters the catalog to matching tags and shrinks page count", () => {
    const page = windowLedgerFavorites(
      [card(1), card(2, 77), card(3, 77)],
      1,
      8,
      [{ type: "artist", name: "muk", id: 77 }],
    );
    expect(page?.items.map((item) => item.id)).toEqual([2, 3]);
    expect(page?.total).toBe(2);
    expect(page?.numPages).toBe(1);
    expect(page?.items[0]?.coverUrl).toContain("/galleries/20/cover.jpg");
    const page2 = windowLedgerFavorites(
      [card(1), card(2, 77), card(3, 77), card(4, 77)],
      2,
      2,
      [{ type: "artist", name: "muk", id: 77 }],
    );
    expect(page2?.items.map((item) => item.id)).toEqual([4]);
    expect(page2?.total).toBe(3);
    expect(page2?.numPages).toBe(2);
  });

  it("reorders matching works by publication date", () => {
    const withUpload = (
      id: number,
      artistId: number | undefined,
      uploadedAt: number,
    ): TasteGalleryRow => {
      const row = card(id, artistId);
      return { ...row, card: { ...row.card!, uploadedAt } };
    };
    const rows = [
      withUpload(1, undefined, 900),
      withUpload(2, 77, 100),
      withUpload(3, 77, 400),
    ];
    const page = windowLedgerFavorites(
      rows,
      1,
      8,
      [{ type: "artist", name: "muk", id: 77 }],
      "uploaded",
    );
    expect(page?.items.map((item) => item.id)).toEqual([3, 2]);
    expect(
      windowLedgerFavorites(rows, 1, 8, [], "uploaded")?.items.map(
        (item) => item.id,
      ),
    ).toEqual([1, 3, 2]);
  });

  it("returns null until every row has a catalog card", () => {
    expect(windowLedgerFavorites([{ id: 1, tagIds: [7] }], 1, 8)).toBeNull();
    expect(
      windowLedgerFavorites(
        [card(1), { id: 2, tagIds: [1] }],
        1,
        8,
      ),
    ).toBeNull();
  });
});

describe("tasteCardStub", () => {
  it("stores a cover url even when the list item only has mediaId", () => {
    const stub = tasteCardStub({
      id: 4,
      mediaId: "99",
      title: { english: "A", japanese: "A", pretty: "A" },
      numPages: 3,
      coverUrl: "",
      thumbnailUrl: "",
      tags: [],
    });
    expect(stub.coverUrl).toContain("/galleries/99/cover.jpg");
    expect(stub.thumbnailUrl).toBe(stub.coverUrl);
  });
});

describe("buildTasteFromLedger", () => {
  it("uses personal frequency and skips unnamed ids", () => {
    const taste = buildTasteFromLedger(
      [
        { id: 1, tagIds: [10, 20] },
        { id: 2, tagIds: [10] },
      ],
      new Map([
        [10, { id: 10, type: "parody", name: "genshin impact" }],
      ]),
      50,
      true,
    );
    expect(taste.complete).toBe(true);
    expect(taste.sampled).toBe(2);
    expect(taste.total).toBe(50);
    expect(taste.tags[0]).toMatchObject({
      name: "genshin impact",
      count: 2,
    });
    expect(taste.tags.some((tag) => tag.id === 20)).toBe(false);
  });

  it("keeps every named tag and still appends a loved tag without a resolved name", () => {
    const names = new Map<number, { id: number; type: "tag"; name: string }>();
    for (let i = 1; i <= 250; i += 1) {
      names.set(i, { id: i, type: "tag", name: `popular ${i}` });
    }
    const popularIds = Array.from({ length: 250 }, (_, i) => i + 1);
    const taste = buildTasteFromLedger(
      [
        { id: 1, tagIds: popularIds },
        { id: 2, tagIds: popularIds },
        { id: 3, tagIds: [999] },
        { id: 4, tagIds: [999] },
      ],
      names,
      10,
      true,
      [{ type: "tag", name: "focus blowjob", id: 999 }],
    );
    expect(taste.tags).toHaveLength(251);
    expect(taste.tags.find((tag) => tag.id === 250)).toMatchObject({
      name: "popular 250",
      count: 2,
    });
    expect(taste.tags.find((tag) => tag.id === 999)).toMatchObject({
      name: "focus blowjob",
      count: 2,
    });
  });
});

describe("formatTasteSyncProgress", () => {
  const base: TasteSyncStatus = {
    running: false,
    complete: false,
    phase: "idle",
    page: 0,
    numPages: 0,
    galleries: 0,
    total: 0,
    error: null,
  };

  it("names the favorites page and catalog size", () => {
    expect(
      formatTasteSyncProgress({
        ...base,
        running: true,
        phase: "favorites",
        page: 3,
        numPages: 40,
        galleries: 75,
        total: 1000,
      }),
    ).toBe("Избранное 3 из 40 · 75 из 1000");
    expect(
      tasteSyncProgressRatio({
        ...base,
        running: true,
        phase: "favorites",
        page: 20,
        numPages: 40,
      }),
    ).toBe(0.5);
  });

  it("calls out the tag-name pass separately from pages", () => {
    expect(
      formatTasteSyncProgress({
        ...base,
        running: true,
        phase: "names",
        page: 2,
        galleries: 800,
      }),
    ).toContain("Имена тегов");
    expect(
      formatTasteSyncProgress({
        ...base,
        complete: true,
        galleries: 800,
      }),
    ).toBe("Каталог готов: 800 работ");
  });
});
