import { describe, expect, it } from "vitest";
import { neighborPageUrls } from "./prefetch";

function pages(n: number) {
  return Array.from({ length: n }, (_, i) => ({ url: `p${i}` }));
}

describe("neighborPageUrls", () => {
  it("walks farther pages after nearer ones", () => {
    expect(neighborPageUrls(pages(10), 5, 3)).toEqual([
      "p6",
      "p4",
      "p7",
      "p3",
      "p8",
      "p2",
    ]);
  });

  it("stays on the current gallery at the start", () => {
    expect(neighborPageUrls(pages(4), 0, 3)).toEqual(["p1", "p2", "p3"]);
  });

  it("does not invent urls past the last page", () => {
    expect(neighborPageUrls(pages(3), 2, 3)).toEqual(["p1", "p0"]);
  });
});
