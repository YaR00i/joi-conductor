import { describe, expect, it } from "vitest";
import { buildBooruFlexibleQueries } from "./booruFetch";

describe("buildBooruFlexibleQueries", () => {
  it("strips sort:random and keeps rating as last fallback", () => {
    const q = buildBooruFlexibleQueries(
      "realbooru",
      "rating:safe feet soles sort:random:12",
    );
    expect(q[0]).toBe("rating:safe feet soles");
    expect(q.some((row) => row.includes("sort:random"))).toBe(false);
    expect(q[q.length - 1]).toBe("rating:safe");
  });

  it("does not inject 1girl", () => {
    const q = buildBooruFlexibleQueries("xbooru", "rating:explicit armpits");
    expect(q.join(" ")).not.toContain("1girl");
  });

  it("keeps sort:random on non-gelbooru dapi boards", () => {
    const q = buildBooruFlexibleQueries(
      "xbooru",
      "rating:explicit armpits sort:random:3",
    );
    expect(q[0]).toBe("rating:explicit armpits sort:random:3");
  });
});
