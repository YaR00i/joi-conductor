import { beforeEach, describe, expect, it } from "vitest";
import {
  installLocalStorageMock,
  resetLocalStorage,
} from "../../test/localStorageMock";
import {
  DEFAULT_DOUJIN_RECS,
  DOUJIN_SETTINGS_KEY,
  loadDoujinSettings,
  saveDoujinSettings,
} from "./settings";

installLocalStorageMock();

beforeEach(() => {
  resetLocalStorage();
});

describe("doujin settings", () => {
  it("round-trips the api key and trims it without wiping recs", () => {
    saveDoujinSettings({ apiKey: "  abc123  " });
    expect(loadDoujinSettings()).toEqual({
      apiKey: "abc123",
      recs: DEFAULT_DOUJIN_RECS,
      lovedTags: [],
      librarySortTags: [],
      libraryCatalogSort: "added",
    });
  });

  it("defaults recommendations to english when missing", () => {
    expect(loadDoujinSettings()).toEqual({
      apiKey: "",
      recs: DEFAULT_DOUJIN_RECS,
      lovedTags: [],
      librarySortTags: [],
      libraryCatalogSort: "added",
    });
    expect(DEFAULT_DOUJIN_RECS.language).toBe("english");
  });

  it("fills english recs for a legacy key-only blob", () => {
    localStorage.setItem(
      DOUJIN_SETTINGS_KEY,
      JSON.stringify({ apiKey: "old-key" }),
    );
    expect(loadDoujinSettings()).toEqual({
      apiKey: "old-key",
      recs: DEFAULT_DOUJIN_RECS,
      lovedTags: [],
      librarySortTags: [],
      libraryCatalogSort: "added",
    });
  });

  it("merges recs patch and rejects unknown values", () => {
    saveDoujinSettings({
      apiKey: "k",
      recs: {
        language: "japanese",
        sort: "date",
        category: "manga",
        pagesBand: "long",
        minFavorites: "500",
      },
    });
    saveDoujinSettings({ recs: { language: "not-a-lang" as never } });
    expect(loadDoujinSettings().recs.language).toBe("japanese");
    saveDoujinSettings({ recs: { language: "chinese" } });
    expect(loadDoujinSettings()).toEqual({
      apiKey: "k",
      recs: {
        language: "chinese",
        sort: "date",
        category: "manga",
        pagesBand: "long",
        minFavorites: "500",
      },
      lovedTags: [],
      librarySortTags: [],
      libraryCatalogSort: "added",
    });
  });

  it("keeps loved tags when only recs or the api key are patched", () => {
    saveDoujinSettings({
      apiKey: "k",
      lovedTags: [{ type: "parody", name: "Genshin Impact" }],
    });
    saveDoujinSettings({ recs: { language: "japanese" } });
    saveDoujinSettings({ apiKey: "k2" });
    expect(loadDoujinSettings().apiKey).toBe("k2");
    expect(loadDoujinSettings().recs.language).toBe("japanese");
    expect(loadDoujinSettings().lovedTags).toEqual([
      { type: "parody", name: "genshin impact" },
    ]);
    expect(loadDoujinSettings().librarySortTags).toEqual([]);
  });

  it("round-trips library sort tags without requiring recs types", () => {
    saveDoujinSettings({
      librarySortTags: [
        { type: "group", name: "Circle Nine", id: 90 },
        { type: "tag", name: "glasses", id: 12 },
      ],
    });
    expect(loadDoujinSettings().librarySortTags).toEqual([
      { type: "group", name: "circle nine", id: 90 },
      { type: "tag", name: "glasses", id: 12 },
    ]);
  });

  it("round-trips local catalog order and rejects unknown values", () => {
    saveDoujinSettings({ libraryCatalogSort: "uploaded" });
    expect(loadDoujinSettings().libraryCatalogSort).toBe("uploaded");
    saveDoujinSettings({ libraryCatalogSort: "not-a-sort" as never });
    expect(loadDoujinSettings().libraryCatalogSort).toBe("uploaded");
    saveDoujinSettings({ apiKey: "k" });
    expect(loadDoujinSettings().libraryCatalogSort).toBe("uploaded");
  });
});
