import { describe, expect, it } from "vitest";
import {
  beatDriftMs,
  buildLabBlock,
  defaultLabDraft,
  diagnoseBeatSilence,
  canAppendToLiveLab,
  canForceLabQuest,
  clonePlanBlockForLab,
  isLabBlockId,
  isLabPracticeRun,
  isLabPracticeState,
  labBlockCaptionRu,
  labBlocksToStart,
  labPlanSourceBlocks,
  labQuestTriggerTitleRu,
  labQueueCountRu,
  labSourceBlockCaptionRu,
  MAX_LAB_QUEUE,
} from "./sessionBlockLab";

describe("buildLabBlock", () => {
  it("builds a stroke block from the draft", () => {
    const block = buildLabBlock({
      ...defaultLabDraft(),
      goal: "stroke",
      bpm: 90,
      durationSec: 18,
    });
    expect(block.goal).toBe("stroke");
    expect(block.drive).toBe("beat");
    expect(block.bpm).toBe(90);
    expect(block.durationSec).toBe(18);
    expect(isLabBlockId(block.id)).toBe(true);
    expect(isLabPracticeState({ labPractice: true })).toBe(true);
    expect(isLabPracticeState({ labPractice: false })).toBe(false);
    expect(isLabPracticeState(null)).toBe(false);
    expect(
      isLabPracticeRun({ labPractice: false, queue: [block] }),
    ).toBe(true);
    expect(isLabPracticeRun({ labPractice: false, queue: [] })).toBe(
      false,
    );
  });

  it("maps vibe goal to a vibe-driven stroke block", () => {
    const block = buildLabBlock({
      ...defaultLabDraft(),
      goal: "vibe",
    });
    expect(block.goal).toBe("stroke");
    expect(block.drive).toBe("vibe");
    expect(block.vibeProfileId).toBeTruthy();
  });

  it("forces rest onto rest_hands_off", () => {
    const block = buildLabBlock({
      ...defaultLabDraft(),
      goal: "rest",
    });
    expect(block.goal).toBe("rest");
    expect(block.functionId).toBe("rest_hands_off");
  });

  it("gives each lab block a unique id", () => {
    const a = buildLabBlock(defaultLabDraft());
    const b = buildLabBlock(defaultLabDraft());
    expect(a.id).not.toBe(b.id);
    expect(isLabBlockId(a.id)).toBe(true);
    expect(isLabBlockId(b.id)).toBe(true);
  });
});

describe("lab queue copy", () => {
  it("names a two-block queue in Russian", () => {
    const stroke = buildLabBlock({
      ...defaultLabDraft(),
      goal: "stroke",
      durationSec: 12,
    });
    const rest = buildLabBlock({
      ...defaultLabDraft(),
      goal: "rest",
      durationSec: 8,
    });
    expect(labBlockCaptionRu(stroke)).toBe("Дрочка · 12 с");
    expect(labBlockCaptionRu(rest)).toBe("Отдых · 8 с");
    expect(labQueueCountRu(1)).toBe("1 блок");
    expect(labQueueCountRu(2)).toBe("2 блока");
    expect(labQueueCountRu(5)).toBe("5 блоков");
    expect(labQueueCountRu(12)).toBe("12 блоков");
  });
});

describe("lab plan clone", () => {
  it("skips finale and clones a unique lab id", () => {
    const stroke = buildLabBlock({
      ...defaultLabDraft(),
      goal: "stroke",
      durationSec: 16,
    });
    const plan = [
      { ...stroke, id: "plan-stroke-1" },
      {
        ...stroke,
        id: "plan-finale",
        goal: "finale" as const,
        durationSec: 8,
      },
    ];
    const sources = labPlanSourceBlocks(plan);
    expect(sources).toHaveLength(1);
    expect(sources[0]?.id).toBe("plan-stroke-1");
    const clone = clonePlanBlockForLab(sources[0]!, "cbt");
    expect(isLabBlockId(clone.id)).toBe(true);
    expect(clone.id).not.toBe(sources[0]!.id);
    expect(clone.durationSec).toBe(16);
    expect(clone.functionId).toBe(stroke.functionId);
    expect(clone.mode).toBe("cbt");
    expect(clone.modifiers).not.toBe(sources[0]!.modifiers);
    expect(labSourceBlockCaptionRu(clone)).toMatch(/16 с/);
    expect(labSourceBlockCaptionRu(clone)).toMatch(/Дрочка/);
  });
});

describe("labBlocksToStart", () => {
  it("prefers the compose list, then the live queue, then the draft", () => {
    const compose = buildLabBlock({
      ...defaultLabDraft(),
      durationSec: 12,
    });
    const live = buildLabBlock({
      ...defaultLabDraft(),
      durationSec: 30,
    });
    const draft = buildLabBlock({
      ...defaultLabDraft(),
      durationSec: 8,
    });
    expect(labBlocksToStart([compose], [live], draft)).toEqual([compose]);
    expect(labBlocksToStart([], [live], draft)).toEqual([live]);
    expect(labBlocksToStart([], undefined, draft)).toEqual([draft]);
    expect(labBlocksToStart([], [], draft)).toEqual([draft]);
  });
});

describe("canForceLabQuest", () => {
  it("allows a running session without an in-progress quest", () => {
    expect(
      canForceLabQuest({
        status: "running",
        inPreflight: false,
        promptGate: false,
        pendingQuest: false,
        activeQuest: false,
      }),
    ).toBe(true);
    expect(
      canForceLabQuest({
        status: "paused",
        inPreflight: false,
        promptGate: false,
        pendingQuest: false,
        activeQuest: false,
      }),
    ).toBe(false);
    expect(
      canForceLabQuest({
        status: "running",
        inPreflight: false,
        promptGate: false,
        pendingQuest: false,
        activeQuest: true,
      }),
    ).toBe(false);
    expect(
      labQuestTriggerTitleRu({
        status: "idle",
        inPreflight: false,
        promptGate: false,
        pendingQuest: false,
        activeQuest: false,
        hasOffer: false,
      }),
    ).toMatch(/запусти/);
  });
});

describe("canAppendToLiveLab", () => {
  it("allows append only during a running lab under the cap", () => {
    const block = buildLabBlock(defaultLabDraft());
    expect(
      canAppendToLiveLab({
        status: "running",
        labPractice: true,
        queue: [block],
      }),
    ).toBe(true);
    expect(
      canAppendToLiveLab({
        status: "idle",
        labPractice: true,
        queue: [block],
      }),
    ).toBe(false);
    expect(
      canAppendToLiveLab({
        status: "running",
        labPractice: false,
        queue: [{ ...block, id: "stroke-1" }],
      }),
    ).toBe(false);
    const full = Array.from({ length: MAX_LAB_QUEUE }, (_, i) => ({
      ...block,
      id: `lab-stroke-${i}`,
    }));
    expect(
      canAppendToLiveLab({
        status: "paused",
        labPractice: true,
        queue: full,
      }),
    ).toBe(false);
  });
});

describe("diagnoseBeatSilence", () => {
  it("names rest as intentional silence", () => {
    const d = diagnoseBeatSilence({
      block: buildLabBlock({ ...defaultLabDraft(), goal: "rest" }),
      pattern: { id: "meter_straight" },
      promptGate: false,
      breathPhase: null,
      inPreflight: false,
    });
    expect(d?.code).toBe("rest");
    expect(d?.labelRu).toMatch(/осознанн/);
  });

  it("names a mistress prompt", () => {
    const d = diagnoseBeatSilence({
      block: buildLabBlock(defaultLabDraft()),
      pattern: { id: "meter_straight" },
      promptGate: true,
      breathPhase: null,
      inPreflight: false,
    });
    expect(d?.code).toBe("prompt");
  });

  it("is silent during breath prep", () => {
    const d = diagnoseBeatSilence({
      block: buildLabBlock({
        ...defaultLabDraft(),
        goal: "breath",
        breathMode: "stroke_timer",
      }),
      pattern: { id: "meter_straight" },
      promptGate: false,
      breathPhase: "prep",
      inPreflight: false,
    });
    expect(d?.code).toBe("breath_prep");
  });
});

describe("beatDriftMs", () => {
  it("is fired minus planned", () => {
    expect(
      beatDriftMs({
        originPerf: 1000,
        lastBeatAtMs: 2400,
        lastBeatFiredPerf: 3412,
      }),
    ).toBe(12);
  });
});
