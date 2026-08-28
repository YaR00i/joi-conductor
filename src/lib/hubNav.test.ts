import { beforeEach, describe, expect, it } from "vitest";
import {
  installLocalStorageMock,
  resetLocalStorage,
} from "../test/localStorageMock";
import {
  isPlayNav,
  isProgressNav,
  lastPlayNav,
  lastProgressNav,
  playTabOf,
  progressTabOf,
  rememberHubNav,
} from "./hubNav";

installLocalStorageMock();

beforeEach(() => {
  resetLocalStorage();
});

describe("hubNav", () => {
  it("maps contract journal onto the stats tab", () => {
    expect(progressTabOf("contract_journal")).toBe("stats");
    expect(progressTabOf("diary")).toBe("diary");
    expect(progressTabOf("roulette")).toBeNull();
  });

  it("groups play routes under minigames", () => {
    expect(isPlayNav("ember")).toBe(true);
    expect(isPlayNav("ember_editor")).toBe(true);
    expect(isPlayNav("minigames")).toBe(true);
    expect(isPlayNav("diary")).toBe(false);
    expect(playTabOf("ember_editor")).toBe("ember_editor");
  });

  it("treats diary/stats/achievements as one progress hub", () => {
    expect(isProgressNav("achievements")).toBe(true);
    expect(isProgressNav("stats")).toBe(true);
    expect(isProgressNav("minigames")).toBe(false);
  });

  it("remembers last tab per hub", () => {
    expect(lastProgressNav()).toBe("diary");
    expect(lastPlayNav()).toBe("minigames");

    rememberHubNav("achievements");
    rememberHubNav("ember_editor");
    expect(lastProgressNav()).toBe("achievements");
    expect(lastPlayNav()).toBe("ember_editor");

    rememberHubNav("contract_journal");
    expect(lastProgressNav()).toBe("stats");
    expect(lastPlayNav()).toBe("ember_editor");
  });
});
