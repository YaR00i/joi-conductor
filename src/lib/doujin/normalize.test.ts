import { describe, expect, it } from "vitest";
import { defaultCdnConfig, joinCdn, parseCdnConfig } from "./cdn";
import {
  cardMatchesLanguage,
  displayTitle,
  formatUploadedAt,
  galleryCoverUrls,
  groupGalleryTags,
  languageBadges,
  parseCard,
  parseFavorited,
  parseGallery,
  parseListPage,
} from "./normalize";

const cdn = defaultCdnConfig();

describe("parseListPage", () => {
  it("reads v2 search wrapper with simplified cards", () => {
    const page = parseListPage(
      {
        result: [
          {
            id: 42,
            media_id: "9",
            english_title: "Hello",
            japanese_title: "ハロー",
            thumbnail: "https://t.nhentai.net/galleries/9/thumb.jpg",
            num_pages: 16,
            tags: [{ id: 1, type: "tag", name: "sole female" }],
          },
        ],
        num_pages: 8,
        page: 2,
      },
      cdn,
    );
    expect(page.numPages).toBe(8);
    expect(page.page).toBe(2);
    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.id).toBe(42);
    expect(page.items[0]?.mediaId).toBe("9");
    expect(page.items[0]?.title.english).toBe("Hello");
    expect(page.items[0]?.coverUrl).toContain("thumb.jpg");
    expect(page.items[0]?.tags[0]?.name).toBe("sole female");
  });

  it("resolves spoken language from well-known tag ids on list cards", () => {
    const page = parseListPage(
      {
        result: [
          {
            id: 1,
            media_id: "1",
            english_title: "En",
            tag_ids: [33172, 12227, 17249],
          },
          {
            id: 2,
            media_id: "2",
            english_title: "Jp",
            tag_ids: [6346],
          },
          {
            id: 3,
            media_id: "3",
            english_title: "Zh",
            tag_ids: [29963, 8010],
          },
        ],
      },
      cdn,
    );
    expect(page.items[0]?.language).toBe("english");
    expect(page.items[1]?.language).toBe("japanese");
    expect(page.items[2]?.language).toBe("chinese");
  });

  it("keeps every spoken language on a multilingual card", () => {
    const card = parseCard(
      {
        id: 5,
        media_id: "5",
        tags: [
          { type: "language", name: "translated" },
          { type: "language", name: "japanese" },
          { type: "language", name: "chinese" },
          { type: "language", name: "english" },
        ],
      },
      cdn,
    );
    expect(card?.languages).toEqual(["japanese", "chinese", "english"]);
    expect(card?.language).toBe("japanese");
  });

  it("resolves several spoken language ids on list cards", () => {
    const card = parseCard(
      {
        id: 6,
        media_id: "6",
        tag_ids: [6346, 29963, 12227, 8010],
      },
      cdn,
    );
    expect(card?.languages).toEqual(["japanese", "chinese", "english"]);
  });

  it("prefers named language tags over ids", () => {
    const card = parseCard(
      {
        id: 4,
        media_id: "4",
        tags: [{ type: "language", name: "chinese" }],
        tag_ids: [12227],
      },
      cdn,
    );
    expect(card?.language).toBe("chinese");
  });

  it("keeps tag_ids from lightweight list items", () => {
    const page = parseListPage(
      {
        result: [
          {
            id: 9,
            media_id: "2",
            english_title: "Fav",
            thumbnail: "https://t.nhentai.net/galleries/2/thumb.jpg",
            tag_ids: [33172, 8010, 33172],
          },
        ],
        num_pages: 3,
        total: 70,
      },
      cdn,
    );
    expect(page.total).toBe(70);
    expect(page.items[0]?.tagIds).toEqual([33172, 8010]);
  });

  it("merges artist ids from tags onto lightweight tag_ids", () => {
    const card = parseCard(
      {
        id: 12,
        media_id: "12",
        tag_ids: [33172],
        tags: [{ id: 77, type: "artist", name: "muk" }],
      },
      cdn,
    );
    expect(card?.tagIds).toEqual([33172, 77]);
  });
});

describe("parseGallery", () => {
  it("reads detail with path-based pages and related", () => {
    const gallery = parseGallery(
      {
        id: 7,
        media_id: "100",
        title: { english: "En", japanese: "Jp", pretty: "Pretty" },
        tags: [
          { type: "language", name: "english" },
          { type: "tag", name: "glasses" },
        ],
        pages: [
          { path: "/galleries/100/1.jpg", thumbnail: "/galleries/100/1t.jpg" },
          { path: "/galleries/100/2.jpg", thumbnail: "/galleries/100/2t.jpg" },
        ],
        related: [{ id: 8, media_id: "101", english_title: "Other", num_pages: 4 }],
      },
      cdn,
    );
    expect(gallery).not.toBeNull();
    expect(gallery?.title.pretty).toBe("Pretty");
    expect(gallery?.language).toBe("english");
    expect(gallery?.languages).toEqual(["english"]);
    expect(gallery?.pages).toHaveLength(2);
    expect(gallery?.pages[0]?.url).toMatch(/\/galleries\/100\/1\.jpg$/);
    expect(gallery?.related[0]?.id).toBe(8);
  });

  it("skips translated when picking spoken language", () => {
    const gallery = parseGallery(
      {
        id: 11,
        media_id: "3",
        title: { pretty: "Jp" },
        tags: [
          { type: "language", name: "translated" },
          { type: "language", name: "japanese" },
        ],
        pages: [{ path: "/galleries/3/1.jpg" }],
      },
      cdn,
    );
    expect(gallery?.language).toBe("japanese");
  });

  it("keeps tag counts, favorites and upload date", () => {
    const gallery = parseGallery(
      {
        id: 3,
        media_id: "7",
        title: { pretty: "Meta" },
        upload_date: 1_667_520_000,
        num_favorites: 175,
        tags: [{ type: "artist", name: "yuuk", count: 42 }],
        pages: [{ path: "/galleries/7/1.jpg" }],
      },
      cdn,
    );
    expect(gallery?.uploadedAt).toBe(1_667_520_000);
    expect(gallery?.numFavorites).toBe(175);
    expect(gallery?.tags[0]?.count).toBe(42);
  });

  it("falls back to legacy type codes", () => {
    const gallery = parseGallery(
      {
        id: 1,
        media_id: "55",
        title: { pretty: "Legacy" },
        images: {
          pages: [
            { t: "p", w: 10, h: 20 },
            { t: "j", w: 10, h: 20 },
          ],
          cover: { t: "p", w: 1, h: 2 },
        },
      },
      cdn,
    );
    expect(gallery?.pages).toHaveLength(2);
    expect(gallery?.pages[0]?.url).toContain("/galleries/55/1.png");
    expect(gallery?.coverUrl).toContain("t.nhentai.net");
    expect(gallery?.coverUrl).toContain("/galleries/55/cover.png");
    expect(gallery?.coverUrl).not.toContain("i.nhentai.net");
    expect(gallery?.thumbnailUrl).toContain("/galleries/55/thumb.png");
  });
});

describe("parseCard / displayTitle", () => {
  it("drops junk without an id", () => {
    expect(parseCard({ english_title: "x" }, cdn)).toBeNull();
  });

  it("prefers pretty title", () => {
    expect(
      displayTitle({ english: "E", japanese: "J", pretty: "P" }),
    ).toBe("P");
  });
});

describe("parseCdnConfig", () => {
  it("reads imageServers / thumbServers", () => {
    const cfg = parseCdnConfig({
      imageServers: ["https://i5.nhentai.net"],
      thumbServers: ["https://t5.nhentai.net"],
    });
    expect(cfg.imageServers).toEqual(["https://i5.nhentai.net"]);
    expect(cfg.thumbServers).toEqual(["https://t5.nhentai.net"]);
  });

  it("falls back when empty", () => {
    const cfg = parseCdnConfig({});
    expect(cfg.imageServers.length).toBeGreaterThan(0);
  });
});

describe("joinCdn", () => {
  it("keeps absolute urls", () => {
    expect(joinCdn("https://t.nhentai.net", "https://cdn.example/a.jpg")).toBe(
      "https://cdn.example/a.jpg",
    );
  });
});

describe("parseFavorited", () => {
  it("reads the v2 favorite flag", () => {
    expect(parseFavorited({ favorited: true })).toBe(true);
    expect(parseFavorited({ favorited: false })).toBe(false);
    expect(parseFavorited({})).toBe(false);
  });
});

describe("gallery detail helpers", () => {
  it("groups tags in nhentai order", () => {
    const groups = groupGalleryTags([
      { type: "tag", name: "full color" },
      { type: "parody", name: "fate stay night" },
      { type: "artist", name: "yuuk" },
    ]);
    expect(groups.map((g) => g.type)).toEqual(["parody", "tag", "artist"]);
    expect(groups[0]?.label).toBe("Пародии");
  });

  it("formats upload time", () => {
    const now = Date.parse("2026-08-27T00:00:00Z");
    expect(formatUploadedAt(now / 1000 - 40 * 86400, now)).toContain("мес. назад");
  });

  it("falls back from cover to the first page thumb", () => {
    const gallery = parseGallery(
      {
        id: 4,
        media_id: "8",
        title: { pretty: "X" },
        images: { cover: { t: "j" }, pages: [{ t: "j" }] },
      },
      cdn,
    );
    expect(galleryCoverUrls(gallery!).length).toBeGreaterThan(1);
    expect(galleryCoverUrls(gallery!)[0]).toContain("cover.jpg");
  });
});

describe("cardMatchesLanguage", () => {
  it("lets every card through when the filter is all", () => {
    expect(cardMatchesLanguage("japanese", "all")).toBe(true);
    expect(cardMatchesLanguage(undefined, "all")).toBe(true);
  });

  it("keeps only the spoken language for recs defaults", () => {
    expect(cardMatchesLanguage("english", "english")).toBe(true);
    expect(cardMatchesLanguage("English", "english")).toBe(true);
    expect(cardMatchesLanguage("japanese", "english")).toBe(false);
    expect(cardMatchesLanguage("", "english")).toBe(false);
  });

  it("keeps a card if any spoken language matches", () => {
    expect(cardMatchesLanguage(["japanese", "english"], "english")).toBe(true);
    expect(cardMatchesLanguage(["japanese", "chinese"], "english")).toBe(false);
  });
});

describe("languageBadges", () => {
  it("renders every spoken language and skips translated", () => {
    expect(
      languageBadges(["translated", "japanese", "chinese", "english"]).map(
        (b) => b.code,
      ),
    ).toEqual(["JP", "ZH", "EN"]);
  });
});
