import { beforeEach, describe, expect, it } from "vitest";
import {
  installLocalStorageMock,
  resetLocalStorage,
} from "../../test/localStorageMock";
import {
  DEFAULT_BLOCKLIST,
  effectiveBlacklist,
  galleryIsBlocked,
  parseBlacklistText,
  saveSandboxBlacklist,
  tagIsBlocked,
} from "./safety";
import { saveSaveSlotsMeta } from "../saveSlots";

installLocalStorageMock();

beforeEach(() => {
  resetLocalStorage();
});

function setSlot(active: "live" | "sandbox"): void {
  saveSaveSlotsMeta({ version: 1, active, parked: {} });
}

describe("parseBlacklistText", () => {
  it("splits lines and commas, keeps multi-word tags", () => {
    expect(parseBlacklistText("lolicon\nbig breasts, shota")).toEqual([
      "lolicon",
      "big breasts",
      "shota",
    ]);
  });

  it("dedupes and strips leading minus", () => {
    expect(parseBlacklistText("-loli\nloli\nLOLI")).toEqual(["loli"]);
  });
});

describe("tagIsBlocked / galleryIsBlocked", () => {
  it("matches default underage tags", () => {
    expect(tagIsBlocked("lolicon")).toBe(true);
    expect(tagIsBlocked("shotacon")).toBe(true);
    expect(tagIsBlocked("loli")).toBe(true);
    expect(tagIsBlocked("big breasts")).toBe(false);
  });

  it("matches a blocked token inside a compound tag", () => {
    expect(tagIsBlocked("oppai loli", DEFAULT_BLOCKLIST)).toBe(true);
  });

  it("flags a gallery when any tag hits the list", () => {
    expect(
      galleryIsBlocked(
        [{ name: "sole female" }, { name: "lolicon" }],
        DEFAULT_BLOCKLIST,
      ),
    ).toBe(true);
    expect(
      galleryIsBlocked([{ name: "sole female" }], DEFAULT_BLOCKLIST),
    ).toBe(false);
  });
});

describe("effectiveBlacklist", () => {
  it("live always uses the default list and ignores sandbox storage", () => {
    setSlot("live");
    saveSandboxBlacklist(["custom_tag"]);
    expect(effectiveBlacklist()).toEqual([...DEFAULT_BLOCKLIST]);
    expect(effectiveBlacklist({ slot: "live" })).toEqual([...DEFAULT_BLOCKLIST]);
  });

  it("sandbox uses stored override as the whole list", () => {
    setSlot("sandbox");
    saveSandboxBlacklist(["femdom", "yaoi"]);
    expect(effectiveBlacklist()).toEqual(["femdom", "yaoi"]);
  });

  it("sandbox falls back to default when storage is empty", () => {
    setSlot("sandbox");
    expect(effectiveBlacklist()).toEqual([...DEFAULT_BLOCKLIST]);
  });

  it("sandbox empty override is an empty blacklist", () => {
    setSlot("sandbox");
    expect(effectiveBlacklist({ slot: "sandbox", sandboxStored: [] })).toEqual(
      [],
    );
  });
});
