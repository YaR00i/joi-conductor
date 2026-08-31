import { describe, expect, it } from "vitest";
import {
  applyBooruRatingToQuery,
  booruEmptyComposeQuery,
  booruRatingToken,
  booruRatingUsesLegacySafe,
  booruRatingUsesMediaMeta,
  isBooruRatingId,
} from "./booruRating";

describe("booruRating", () => {
  it("accepts the four hub ids", () => {
    expect(isBooruRatingId("general")).toBe(true);
    expect(isBooruRatingId("sensitive")).toBe(true);
    expect(isBooruRatingId("questionable")).toBe(true);
    expect(isBooruRatingId("explicit")).toBe(true);
    expect(isBooruRatingId("safe")).toBe(false);
  });

  it("maps dapi sites to Danbooru-style tokens", () => {
    expect(booruRatingToken("gelbooru", "sensitive")).toBe("rating:sensitive");
    expect(booruRatingToken("xbooru", "general")).toBe("rating:general");
    expect(booruRatingUsesMediaMeta("hypnohub")).toBe(true);
    expect(booruRatingUsesLegacySafe("gelbooru")).toBe(false);
  });

  it("maps html01/html02 general+sensitive to rating:safe", () => {
    expect(booruRatingToken("realbooru", "general")).toBe("rating:safe");
    expect(booruRatingToken("censored", "sensitive")).toBe("rating:safe");
    expect(booruRatingToken("blacked", "explicit")).toBe("rating:explicit");
    expect(booruRatingUsesLegacySafe("realbooru")).toBe(true);
    expect(booruRatingUsesMediaMeta("realbooru")).toBe(false);
  });

  it("replaces existing rating tokens from the Media tab", () => {
    expect(
      applyBooruRatingToQuery(
        "rating:explicit soles feet",
        "gelbooru",
        "general",
      ),
    ).toBe("rating:general soles feet");
  });

  it("does not inject 1girl on empty compose", () => {
    expect(booruEmptyComposeQuery("gelbooru", "explicit")).toBe(
      "rating:explicit",
    );
    expect(booruEmptyComposeQuery("realbooru", "sensitive")).toBe(
      "rating:safe all",
    );
  });
});
