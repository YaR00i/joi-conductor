import { describe, expect, it } from "vitest";
import {
  buildDiaryStats,
  formatAbortPct,
} from "./diaryStats";
import type { DiaryEntry } from "./sessionDiary";

function entry(
  over: Partial<DiaryEntry> & Pick<DiaryEntry, "ended" | "createdAt">,
): DiaryEntry {
  const {
    id,
    createdAt,
    ended,
    elapsedSec,
    durationSec,
    edgesDone,
    edgesTarget,
    ruinsDone,
    ruinsTarget,
    finishId,
    finishNameRu,
    cumplayId,
    cumplayNameRu,
    ateCum,
    mistressNameRu,
    mood,
    moodLabelRu,
    moodScore,
    mode,
    modeNameRu,
    ...rest
  } = over;
  return {
    id: id ?? `e-${createdAt}`,
    createdAt,
    ended,
    elapsedSec: elapsedSec ?? 120,
    durationSec: durationSec ?? elapsedSec ?? 120,
    edgesDone: edgesDone ?? 1,
    edgesTarget: edgesTarget ?? 3,
    ruinsDone: ruinsDone ?? 0,
    ruinsTarget: ruinsTarget ?? 0,
    finishId: finishId ?? "",
    finishNameRu: finishNameRu ?? "",
    cumplayId: cumplayId ?? "",
    cumplayNameRu: cumplayNameRu ?? "",
    ateCum: ateCum ?? "none",
    mistressNameRu: mistressNameRu ?? "Ху Тао",
    mood: mood ?? "calm",
    moodLabelRu: moodLabelRu ?? "Спокойная",
    moodScore: moodScore ?? 0,
    mode: mode ?? "stroke",
    modeNameRu: modeNameRu ?? "Дрочка",
    ...rest,
  };
}

describe("diaryStats abort honesty", () => {
  it("computes abortPct and counts aborted in sessions", () => {
    const stats = buildDiaryStats(
      [
        entry({
          createdAt: "2026-07-20T12:00:00.000Z",
          ended: "complete",
          elapsedSec: 180,
        }),
        entry({
          createdAt: "2026-07-21T12:00:00.000Z",
          ended: "abort",
          elapsedSec: 60,
        }),
      ],
      "all",
    );
    expect(stats.summary.sessions).toBe(2);
    expect(stats.summary.completed).toBe(1);
    expect(stats.summary.aborted).toBe(1);
    expect(stats.summary.abortPct).toBe(50);
    expect(formatAbortPct(stats.summary.abortPct)).toBe("50%");
  });

  it("formats null abort pct as dash", () => {
    expect(formatAbortPct(null)).toBe("—");
  });
});
