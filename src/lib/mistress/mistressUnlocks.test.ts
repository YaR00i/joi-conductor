import { describe, expect, it } from "vitest";
import {
  isModeAllowedForMistress,
  modesGrantedWithMistress,
} from "./mistressUnlocks";

const ALL_MODES = [
  "stroke",
  "anal",
  "chastity",
  "onahole",
  "cbt",
  "oral",
  "prone",
  "plapping",
] as const;

describe("isModeAllowedForMistress", () => {
  it("lets Sparkle wear every session mask", () => {
    for (const mode of ALL_MODES) {
      expect(isModeAllowedForMistress(mode, "sparkle")).toBe(true);
    }
  });

  it("keeps exclusives on the other packs", () => {
    expect(isModeAllowedForMistress("cbt", "hu_tao")).toBe(false);
    expect(isModeAllowedForMistress("onahole", "furina")).toBe(false);
    expect(isModeAllowedForMistress("stroke", "sunna")).toBe(false);
    expect(isModeAllowedForMistress("cbt", "furina")).toBe(true);
    expect(isModeAllowedForMistress("oral", "sunna")).toBe(true);
  });
});

describe("modesGrantedWithMistress", () => {
  it("unlocks the other packs' exclusive modes with Sparkle", () => {
    expect(modesGrantedWithMistress("sparkle")).toEqual([
      "cbt",
      "prone",
      "oral",
      "plapping",
      "onahole",
    ]);
  });
});
