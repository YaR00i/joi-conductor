import { describe, expect, it } from "vitest";
import { consumeShopFocusTag, setShopFocusTag } from "./shopFocus";

describe("shopFocus", () => {
  it("stores and consumes a tag once", () => {
    sessionStorage.clear();
    setShopFocusTag(" hu_tao ");
    expect(consumeShopFocusTag()).toBe("hu_tao");
    expect(consumeShopFocusTag()).toBeNull();
  });

  it("ignores empty tags", () => {
    sessionStorage.clear();
    setShopFocusTag("   ");
    expect(consumeShopFocusTag()).toBeNull();
  });
});
