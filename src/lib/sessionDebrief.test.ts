import { describe, expect, it } from "vitest";
import {
  abortDiaryStatusRu,
  buildAbortDebrief,
  buildSessionDebrief,
  debriefContractsCtaSubRu,
  finaleOutcomeLabelRu,
  formatDebriefDurationRu,
  shouldShowAbortContractsCta,
  shouldShowSessionContractsCta,
} from "./sessionDebrief";

describe("sessionDebrief", () => {
  it("labels finale outcomes exhaustively", () => {
    expect(finaleOutcomeLabelRu("cum")).toBe("Кончить");
    expect(finaleOutcomeLabelRu("ruin")).toBe("Руина");
    expect(finaleOutcomeLabelRu("deny")).toBe("Отказ");
    expect(finaleOutcomeLabelRu(undefined)).toBe("Без финала");
  });

  it("formats duration in Russian", () => {
    expect(formatDebriefDurationRu(45)).toBe("45 с");
    expect(formatDebriefDurationRu(125)).toBe("2 мин 05 с");
  });

  it("builds a tight debrief with contract + achievement unlocks", () => {
    const debrief = buildSessionDebrief({
      mistressNameRu: "Ху Тао",
      portraitSrc: "/hu-tao/avatar-full.svg",
      mood: "cruel",
      moodLabelRu: "Жестокая",
      finaleOutcome: "ruin",
      cindersEarned: 42,
      levelUps: [
        {
          id: "edges",
          nameRu: "Эджи",
          level: 2,
          cinders: 12,
        },
      ],
      elapsedSec: 600,
      edgesDone: 5,
      likesCount: 9,
      contract: {
        status: "done",
        titleRu: "Пять граней",
        rewarded: 10,
      },
      verdictRu: "Красиво пострадал.",
    });

    expect(debrief.verdictRu).toBe("Красиво пострадал.");
    expect(debrief.finaleLabelRu).toBe("Руина");
    expect(debrief.cindersEarned).toBe(42);
    expect(debrief.likesCount).toBe(9);
    expect(debrief.unlocks[0]?.kind).toBe("contract");
    expect(debrief.unlocks[0]?.cinders).toBe(10);
    expect(debrief.unlocks.some((u) => u.kind === "achievement")).toBe(true);
    expect(debrief.contract?.titleRu).toBe("Пять граней");
    expect(shouldShowSessionContractsCta(debrief)).toBe(true);
    expect(debriefContractsCtaSubRu(debrief.contract!)).toBe("Итог контракта");
  });

  it("hides Contracts CTA when no settled contract", () => {
    const debrief = buildSessionDebrief({
      mistressNameRu: "Ху Тао",
      portraitSrc: "/hu-tao/avatar-full.svg",
      mood: "sweet",
      moodLabelRu: "Милая",
      cindersEarned: 0,
      levelUps: [],
      elapsedSec: 10,
      edgesDone: 0,
    });
    expect(shouldShowSessionContractsCta(debrief)).toBe(false);
  });

  it("labels failed contract CTA and shows abort Contracts when failed", () => {
    expect(
      debriefContractsCtaSubRu({
        status: "failed",
        titleRu: "Пять граней",
        rewarded: 0,
        reasonRu: "стоп",
      }),
    ).toBe("Провал в доске");

    const abort = buildAbortDebrief({
      mistressNameRu: "Ху Тао",
      portraitSrc: "/hu-tao/avatar-full.svg",
      mood: "bored",
      moodLabelRu: "Скучающая",
      diaryRecorded: false,
      elapsedSec: 95,
      edgesDone: 2,
      ruinsDone: 0,
      clawQuestCinders: 7,
      noteRu: "Сессия оборвана.",
      contractFailedTitleRu: "Пять граней",
    });
    expect(shouldShowAbortContractsCta(abort)).toBe(true);
    expect(
      shouldShowAbortContractsCta({ contractFailedTitleRu: undefined }),
    ).toBe(false);
  });

  it("builds a quiet abort debrief with claw and diary honesty", () => {
    const debrief = buildAbortDebrief({
      mistressNameRu: "Ху Тао",
      portraitSrc: "/hu-tao/avatar-full.svg",
      mood: "bored",
      moodLabelRu: "Скучающая",
      diaryRecorded: false,
      elapsedSec: 95,
      edgesDone: 2,
      ruinsDone: 0,
      clawQuestCinders: 7,
      noteRu: "Сессия оборвана.",
      contractFailedTitleRu: "Пять граней",
    });

    expect(debrief.noteRu).toBe("Сессия оборвана.");
    expect(debrief.clawQuestCinders).toBe(7);
    expect(debrief.diaryRecorded).toBe(false);
    expect(abortDiaryStatusRu(false)).toContain("Завершить");
    expect(abortDiaryStatusRu(true)).toContain("дневник");
    expect(debrief.contractFailedTitleRu).toBe("Пять граней");
  });

  it("marks abort debrief when diary was written", () => {
    const debrief = buildAbortDebrief({
      mistressNameRu: "Ху Тао",
      portraitSrc: "/hu-tao/avatar-full.svg",
      mood: "bored",
      moodLabelRu: "Скучающая",
      diaryRecorded: true,
      elapsedSec: 40,
      edgesDone: 0,
      ruinsDone: 0,
      clawQuestCinders: 0,
    });
    expect(debrief.diaryRecorded).toBe(true);
  });
});
