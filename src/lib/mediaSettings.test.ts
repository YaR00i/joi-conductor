import { beforeEach, describe, expect, it } from "vitest";
import {
  installLocalStorageMock,
  resetLocalStorage,
} from "../test/localStorageMock";
import {
  buildGelbooruQueryLadder,
  DEFAULT_MEDIA_SETTINGS,
  loadMediaSettings,
  saveMediaSettings,
} from "./media";

installLocalStorageMock();

beforeEach(() => {
  resetLocalStorage();
});

describe("media settings booruSite / rating", () => {
  it("defaults to gelbooru explicit", () => {
    const s = loadMediaSettings();
    expect(s.booruSite).toBe("gelbooru");
    expect(s.rating).toBe("explicit");
  });

  it("round-trips booruSite and rating", () => {
    saveMediaSettings({
      ...DEFAULT_MEDIA_SETTINGS,
      booruSite: "realbooru",
      rating: "sensitive",
    });
    const s = loadMediaSettings();
    expect(s.booruSite).toBe("realbooru");
    expect(s.rating).toBe("sensitive");
  });

  it("drops unknown site and rating", () => {
    localStorage.setItem(
      "joi-conductor-media-settings",
      JSON.stringify({
        ...DEFAULT_MEDIA_SETTINGS,
        booruSite: "danbooru",
        rating: "safe",
      }),
    );
    const s = loadMediaSettings();
    expect(s.booruSite).toBe("gelbooru");
    expect(s.rating).toBe("explicit");
  });
});

describe("buildGelbooruQueryLadder", () => {
  it("keeps Media-tab rating and does not inject explicit or 1girl", () => {
    const ladder = buildGelbooruQueryLadder("rating:sensitive soles", {
      seed: 7,
    });
    expect(ladder.some((q) => q.includes("rating:sensitive"))).toBe(true);
    expect(ladder.some((q) => q.includes("rating:explicit"))).toBe(false);
    expect(ladder.join(" ")).not.toContain("1girl");
    expect(ladder[ladder.length - 1]).toBe("rating:sensitive");
  });
});
