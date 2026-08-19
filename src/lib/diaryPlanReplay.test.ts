import { describe, expect, it } from "vitest";
import {
  diaryEntryHasReplayablePlan,
  extractDiaryPlanReplay,
  looksLikeMediaTagQuery,
  parseBpmRangeFromLabel,
  parseToyIdsFromLabel,
} from "./diaryPlanReplay";
import type { DiaryEntry } from "./sessionDiary";
import { DEFAULT_PARAMS } from "./types";

function baseEntry(over: Partial<DiaryEntry> = {}): DiaryEntry {
  return {
    id: "diary-1",
    createdAt: "2026-07-22T10:00:00.000Z",
    ended: "complete",
    elapsedSec: 400,
    durationSec: 600,
    edgesDone: 3,
    edgesTarget: 5,
    ruinsDone: 0,
    ruinsTarget: 0,
    finishId: "hand",
    finishNameRu: "Рука",
    cumplayId: "none",
    cumplayNameRu: "Без",
    ateCum: "none",
    mistressNameRu: "Ху Тао",
    mood: "horny",
    moodLabelRu: "Возбуждённая",
    moodScore: 2,
    mode: "anal",
    modeNameRu: "Анал",
    ...over,
  };
}

describe("looksLikeMediaTagQuery", () => {
  it("accepts gelbooru-style queries", () => {
    expect(looksLikeMediaTagQuery("hu_tao_(genshin_impact) breasts")).toBe(
      true,
    );
    expect(looksLikeMediaTagQuery("rating:explicit 1girl")).toBe(true);
  });

  it("rejects human content labels", () => {
    expect(looksLikeMediaTagQuery("Сиськи · Ахегао")).toBe(false);
    expect(looksLikeMediaTagQuery("Контент")).toBe(false);
  });
});

describe("parseBpmRangeFromLabel", () => {
  it("parses roulette and plain ranges", () => {
    expect(parseBpmRangeFromLabel("Медленно 50–90")).toEqual({
      bpmMin: 50,
      bpmMax: 90,
    });
    expect(parseBpmRangeFromLabel("60–120 BPM")).toEqual({
      bpmMin: 60,
      bpmMax: 120,
    });
    expect(parseBpmRangeFromLabel("90 bpm")).toEqual({
      bpmMin: 90,
      bpmMax: 90,
    });
  });
});

describe("parseToyIdsFromLabel", () => {
  it("maps «Без игрушек» and catalog names", () => {
    expect(parseToyIdsFromLabel("Без игрушек")).toEqual(["__none__"]);
    const ids = parseToyIdsFromLabel("Дилдо маленький");
    expect(ids?.length).toBeGreaterThan(0);
  });
});

describe("extractDiaryPlanReplay", () => {
  it("prefers stored planParams + mediaTags", () => {
    const planParams = {
      ...DEFAULT_PARAMS,
      mode: "prone" as const,
      durationSec: 900,
      edgesTarget: 8,
      ruinsTarget: 1,
      pCum: 0.1,
      pRuin: 0.7,
      bpmMin: 50,
      bpmMax: 90,
      allowedToyIds: ["dildo_small"],
    };
    const entry = baseEntry({
      planParams,
      mediaTags: "hu_tao_(genshin_impact) rating:explicit",
      tagsLabelRu: "Ху Тао · Explicit",
      seed: 42,
    });
    expect(diaryEntryHasReplayablePlan(entry)).toBe(true);
    const replay = extractDiaryPlanReplay(entry);
    expect(replay).not.toBeNull();
    expect(replay!.fromLegacy).toBe(false);
    expect(replay!.params.mode).toBe("prone");
    expect(replay!.params.durationSec).toBe(900);
    expect(replay!.params.pRuin).toBe(0.7);
    expect(replay!.params.allowedToyIds).toEqual(["dildo_small"]);
    expect(replay!.mediaTags).toBe("hu_tao_(genshin_impact) rating:explicit");
    expect(replay!.mood).toBe("horny");
    expect(replay!.seed).toBe(42);
  });

  it("reconstructs legacy rows from summary fields", () => {
    const entry = baseEntry({
      bpmLabelRu: "Быстро 80–140",
      toysLabelRu: "Без игрушек",
      tagsLabelRu: "breasts rating:questionable",
      finishId: "face",
      cumplayId: "swallow",
    });
    const replay = extractDiaryPlanReplay(entry, DEFAULT_PARAMS);
    expect(replay).not.toBeNull();
    expect(replay!.fromLegacy).toBe(true);
    expect(replay!.params.mode).toBe("anal");
    expect(replay!.params.durationSec).toBe(600);
    expect(replay!.params.edgesTarget).toBe(5);
    expect(replay!.params.bpmMin).toBe(80);
    expect(replay!.params.bpmMax).toBe(140);
    expect(replay!.params.allowedToyIds).toEqual(["__none__"]);
    expect(replay!.params.finishId).toBe("face");
    expect(replay!.params.cumplayId).toBe("swallow");
    expect(replay!.mediaTags).toBe("breasts rating:questionable");
    // Odds fall back to base when not stored.
    expect(replay!.params.pCum).toBe(DEFAULT_PARAMS.pCum);
  });

  it("skips incomplete entries", () => {
    const entry = baseEntry({ durationSec: 0 });
    expect(diaryEntryHasReplayablePlan(entry)).toBe(false);
    expect(extractDiaryPlanReplay(entry)).toBeNull();
  });
});
