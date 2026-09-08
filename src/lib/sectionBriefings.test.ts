import { beforeEach, describe, expect, it } from "vitest";
import {
  installLocalStorageMock,
  resetLocalStorage,
} from "../test/localStorageMock";
import {
  BRIEFABLE_NAV_IDS,
  SECTION_BRIEFINGS,
  SECTION_BRIEFINGS_STORAGE_KEY,
  defaultSectionBriefingsState,
  briefingNavFor,
  isBriefableNav,
  loadSectionBriefingsState,
  markSectionBriefingCompleted,
  markSectionBriefingDismissed,
  reopenAllSectionBriefings,
  dismissAllSectionBriefings,
  reopenSectionBriefing,
  sectionBriefingCopy,
  shouldShowSectionBriefing,
} from "./sectionBriefings";

installLocalStorageMock();

beforeEach(() => {
  resetLocalStorage();
});

describe("sectionBriefings", () => {
  it("defaults to pending for every briefable section", () => {
    expect(loadSectionBriefingsState()).toEqual(defaultSectionBriefingsState());
    for (const id of BRIEFABLE_NAV_IDS) {
      expect(shouldShowSectionBriefing(id)).toBe(true);
    }
  });

  it("excludes Ember play and editor", () => {
    expect(isBriefableNav("ember")).toBe(false);
    expect(isBriefableNav("ember_editor")).toBe(false);
    expect(isBriefableNav("roulette")).toBe(true);
    expect(BRIEFABLE_NAV_IDS).not.toContain("ember");
    expect(BRIEFABLE_NAV_IDS).not.toContain("ember_editor");
  });

  it("folds diary/stats/achievements into one progress briefing", () => {
    expect(isBriefableNav("stats")).toBe(false);
    expect(isBriefableNav("achievements")).toBe(false);
    expect(briefingNavFor("stats")).toBe("diary");
    expect(briefingNavFor("achievements")).toBe("diary");
    expect(briefingNavFor("contract_journal")).toBe("diary");
    expect(briefingNavFor("ember")).toBeNull();
    expect(sectionBriefingCopy("diary").eyebrowRu).toContain("Прогресс");
  });

  it("folds favorites into the Content briefing", () => {
    expect(isBriefableNav("favorites")).toBe(false);
    expect(briefingNavFor("favorites")).toBe("doujin");
    expect(briefingNavFor("doujin")).toBe("doujin");
    expect(sectionBriefingCopy("doujin").eyebrowRu).toContain("Контент");
  });

  it("hides after completed or dismissed", () => {
    markSectionBriefingCompleted("shop");
    expect(shouldShowSectionBriefing("shop")).toBe(false);
    expect(shouldShowSectionBriefing("diary")).toBe(true);

    markSectionBriefingDismissed("diary");
    expect(shouldShowSectionBriefing("diary")).toBe(false);
  });

  it("reopenAll clears dismissals", () => {
    markSectionBriefingDismissed("diary");
    reopenAllSectionBriefings();
    expect(shouldShowSectionBriefing("diary")).toBe(true);
  });

  it("reopenSection resets one id", () => {
    markSectionBriefingCompleted("doujin");
    reopenSectionBriefing("doujin");
    expect(shouldShowSectionBriefing("doujin")).toBe(true);
  });

  it("tolerates corrupt JSON", () => {
    localStorage.setItem(SECTION_BRIEFINGS_STORAGE_KEY, "{not-json");
    expect(loadSectionBriefingsState()).toEqual({ byId: {} });
  });

  it("covers all briefable ids with copy", () => {
    expect(SECTION_BRIEFINGS).toHaveLength(BRIEFABLE_NAV_IDS.length);
    for (const id of BRIEFABLE_NAV_IDS) {
      expect(sectionBriefingCopy(id).id).toBe(id);
      expect(sectionBriefingCopy(id).titleRu.length).toBeGreaterThan(0);
    }
  });

  it("dismisses every first-visit overlay at once", () => {
    dismissAllSectionBriefings();
    for (const id of BRIEFABLE_NAV_IDS) {
      expect(shouldShowSectionBriefing(id)).toBe(false);
    }
  });
});
