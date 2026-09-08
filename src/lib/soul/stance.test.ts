import { describe, expect, it } from "vitest";
import type { CharacterBible } from "../character";
import { applyStanceToProposals } from "./control/proposals";
import type { ChatProposal } from "./control/proposals";
import { buildChatMessages } from "./prompts";
import { parseSoulRouterOutput } from "./router";
import {
  applyExplicitUserTextToStances,
  applyStanceUpdate,
  applyStanceUpdates,
  applyWorldEventToStances,
  explicitStancesFromUserText,
  isStanceActive,
  normalizeStanceSubject,
  stancePromptLines,
} from "./stance";
import { emptyMistressState, type UserStance } from "./types";
import { ingestSoulWorldEvent, sessionEndEventInput } from "./worldEvents";

const bible: CharacterBible = {
  id: "hu_tao",
  nameRu: "Ху Тао",
  locale: "ru",
  tone: ["playful"],
  taboo: ["break character"],
  diminutives: ["silly"],
  emojiAllowed: false,
  systemPrompt: "You are Hu Tao.",
  fallbackLines: {},
};

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function wear(kind: "cage" | "plug"): ChatProposal {
  return {
    id: `wear-${kind}`,
    kind: "wear",
    wearKind: kind,
    hours: 4,
    titleRu: kind,
    hintRu: "",
    confirmRu: "Ок",
    refuseRu: "Нет",
    source: "extractor",
  };
}

function session(kind: "edges" | "oral"): ChatProposal {
  return {
    id: `session-${kind}`,
    kind: "session",
    sessionKind: kind,
    durationSec: 600,
    edgesTarget: 5,
    finalePolicy: "ruin_norm",
    noteRu: "",
    titleRu: kind,
    hintRu: "",
    confirmRu: "Ок",
    refuseRu: "Нет",
    source: "extractor",
  };
}

function refuseEvent(atMs: number) {
  return {
    id: `ref-${atMs}`,
    kind: "session_refused" as const,
    atMs,
    mistressId: "hu_tao" as const,
    summary: "Отказался от предложенной сессии",
    importance: 2 as const,
  };
}

function failQuest(atMs: number, questId: string) {
  return {
    id: `fail-${atMs}`,
    kind: "quest_failed" as const,
    atMs,
    mistressId: "hu_tao" as const,
    summary: "Квест провален",
    importance: 2 as const,
    subjectId: questId,
  };
}

describe("stance subjects", () => {
  it("normalizes edge/edging/edges to one subject", () => {
    expect(normalizeStanceSubject("edge")).toBe("edges");
    expect(normalizeStanceSubject("edging")).toBe("edges");
    expect(normalizeStanceSubject("edges")).toBe("edges");
    expect(normalizeStanceSubject("edge play")).toBe("edges");
    expect(normalizeStanceSubject("эджи")).toBe("edges");
  });
});

describe("stance from behavior", () => {
  it("one refusal is disliked_once, never a hard boundary", () => {
    const next = applyWorldEventToStances([], refuseEvent(1_000));
    expect(next).toHaveLength(1);
    expect(next[0]?.kind).toBe("disliked_once");
    expect(next[0]?.subject).toBe("session");
    expect(next.some((row) => row.kind === "hard_boundary")).toBe(false);
  });

  it("three spaced refusals become often_refuses", () => {
    let stances: UserStance[] = [];
    stances = applyWorldEventToStances(stances, refuseEvent(HOUR));
    stances = applyWorldEventToStances(stances, refuseEvent(2 * HOUR));
    stances = applyWorldEventToStances(stances, refuseEvent(3 * HOUR));
    expect(stances.some((row) => row.kind === "often_refuses")).toBe(true);
    expect(stances.some((row) => row.kind === "disliked_once")).toBe(false);
  });

  it("duplicate evidence in the same hour does not raise the count twice", () => {
    const first = applyWorldEventToStances([], refuseEvent(1_000));
    const again = applyWorldEventToStances(first, refuseEvent(2_000));
    expect(again[0]?.evidenceCount).toBe(1);
  });

  it("one quest fail is not an active struggles_with", () => {
    const next = applyWorldEventToStances([], failQuest(1_000, "ball_taps"));
    const row = next.find((s) => s.kind === "struggles_with");
    expect(row).toBeTruthy();
    expect(isStanceActive(row!, 1_000)).toBe(false);
  });

  it("two quest fails of the same subject become struggles_with", () => {
    let stances: UserStance[] = [];
    stances = applyWorldEventToStances(stances, failQuest(HOUR, "ball_taps"));
    stances = applyWorldEventToStances(stances, failQuest(2 * HOUR, "ball_taps"));
    const row = stances.find((s) => s.kind === "struggles_with");
    expect(row?.evidenceCount).toBeGreaterThanOrEqual(2);
    expect(isStanceActive(row!, 2 * HOUR)).toBe(true);
  });

  it("a completed session does not become liked", () => {
    const result = ingestSoulWorldEvent(
      emptyMistressState("Ху Тао", ["playful"]),
      sessionEndEventInput({
        mistressId: "hu_tao",
        reason: "complete",
        sessionId: "sess:hu_tao:stance:complete",
        endedAtMs: 5_000,
        finaleOutcome: "ruin",
      }),
    );
    expect(result.state.user.stances.some((row) => row.kind === "liked")).toBe(
      false,
    );
  });
});

describe("explicit chat stance", () => {
  it("explicit never X is a hard boundary", () => {
    const rows = explicitStancesFromUserText("никогда не предлагай клетку", 1);
    expect(rows[0]?.kind).toBe("hard_boundary");
    expect(rows[0]?.subject).toBe("cage");
  });

  it("explicit X is my hard boundary is a hard boundary", () => {
    const ru = explicitStancesFromUserText(
      "Запомни: клетка — моя жёсткая граница, никогда её не предлагай.",
      1,
    );
    const en = explicitStancesFromUserText("Remember: cage is my hard boundary.", 1);
    expect(ru[0]).toMatchObject({ kind: "hard_boundary", subject: "cage" });
    expect(en[0]).toMatchObject({ kind: "hard_boundary", subject: "cage" });
  });

  it("understands a direct Russian 'no X' hard boundary", () => {
    const rows = explicitStancesFromUserText(
      "никакой клетки, это жёсткая граница",
      1,
    );
    expect(rows[0]).toMatchObject({ kind: "hard_boundary", subject: "cage" });
  });

  it("explicit love is liked", () => {
    const rows = explicitStancesFromUserText("я люблю эджи", 1);
    expect(rows[0]?.kind).toBe("liked");
    expect(rows[0]?.subject).toBe("edges");
  });

  it("explicit love of coffee is not a play stance", () => {
    expect(explicitStancesFromUserText("я люблю кофе", 1)).toEqual([]);
  });

  it("explicit curiosity is curious_about", () => {
    const rows = explicitStancesFromUserText("интересно попробовать пробку", 1);
    expect(rows[0]?.kind).toBe("curious_about");
    expect(rows[0]?.subject).toBe("plug");
  });

  it("a later explicit like replaces disliked_once", () => {
    let stances = applyStanceUpdate([], {
      subject: "edges",
      kind: "disliked_once",
      source: "session",
      atMs: 1,
      evidenceKey: "a",
    });
    stances = applyExplicitUserTextToStances(stances, "я люблю эджи", 2);
    expect(stances.some((row) => row.kind === "disliked_once")).toBe(false);
    expect(
      stances.some((row) => row.kind === "liked" && row.subject === "edges"),
    ).toBe(true);
  });

  it("hard boundary is not lifted by a completed session event", () => {
    const withBound = applyExplicitUserTextToStances(
      [],
      "никогда не предлагай сессию",
      1,
    );
    expect(withBound[0]?.kind).toBe("hard_boundary");
    const after = applyWorldEventToStances(withBound, {
      id: "done",
      kind: "session_completed",
      atMs: 2,
      mistressId: "hu_tao",
      summary: "Сессия завершена.",
      importance: 3,
    });
    expect(after.some((row) => row.kind === "hard_boundary")).toBe(true);
  });
});

describe("stance decay and prompt", () => {
  it("disliked_once decays out of influence", () => {
    const stances = applyWorldEventToStances([], refuseEvent(1));
    expect(isStanceActive(stances[0]!, 1)).toBe(true);
    expect(isStanceActive(stances[0]!, 1 + 4 * DAY)).toBe(false);
  });

  it("greeting does not dump preferences", () => {
    const state = emptyMistressState("Ху Тао", ["playful"]);
    state.user.stances = applyExplicitUserTextToStances([], "я люблю эджи", 1);
    const greeting = buildChatMessages(bible, state, "Привет")[0]?.content ?? "";
    expect(greeting).not.toContain("--- USER STANCE ---");
    expect(greeting).not.toContain("[RELEVANT USER STANCE]");
  });

  it("unrelated stance stays out of the prompt slice", () => {
    const stances = applyExplicitUserTextToStances([], "я люблю эджи", 1);
    const lines = stancePromptLines(stances, "Как заваривать чай?", null, 1, false);
    expect(lines.join("\n")).not.toMatch(/edges|эджи/i);
    expect(lines).toEqual([]);
  });

  it("drops legacy play habits from the USER slice beside stance", () => {
    const state = emptyMistressState("Ху Тао", ["playful"]);
    const now = Date.now();
    state.user.preferencesHabits = ["likes edging", "tea at night"];
    state.user.stances = applyExplicitUserTextToStances([], "я люблю эджи", now);
    state.userMd = [
      "# User memory",
      "## Preferences and habits",
      "- likes edging",
      "- tea at night",
    ].join("\n");
    const prompt = buildChatMessages(bible, state, "давай эджи")[0]?.content ?? "";
    expect(prompt).toContain("tea at night");
    expect(prompt).not.toContain("likes edging");
    expect(prompt).toContain("[RELEVANT USER STANCE]");
    expect(prompt).toMatch(/liked|edges|эджи/i);
  });

  it("keeps the stance slice bounded", () => {
    let stances: UserStance[] = [];
    for (let i = 0; i < 10; i += 1) {
      stances = applyStanceUpdate(stances, {
        subject: `topic_${i}xx`,
        kind: "liked",
        source: "explicit_chat",
        atMs: 1,
        explicit: true,
        evidenceKey: `k${i}`,
      });
    }
    const lines = stancePromptLines(
      stances,
      "topic_0xx topic_1xx topic_2xx topic_3xx topic_4xx topic_5xx topic_6xx",
      null,
      1,
      false,
    );
    const prefs = lines.filter((line) => line.startsWith("- liked"));
    expect(prefs.length).toBeLessThanOrEqual(6);
  });
});

describe("stance vs proposals", () => {
  it("hard boundary drops the matching proposal", () => {
    const stances = applyExplicitUserTextToStances(
      [],
      "никогда не предлагай клетку",
      1,
    );
    const next = applyStanceToProposals(
      stances,
      [wear("cage"), session("edges")],
      1,
    );
    expect(next.some((row) => row.kind === "wear")).toBe(false);
    expect(next.some((row) => row.kind === "session")).toBe(true);
  });

  it("liked raises weight but does not guarantee the only proposal", () => {
    const stances = applyExplicitUserTextToStances([], "я люблю эджи", 1);
    const next = applyStanceToProposals(
      stances,
      [session("oral"), session("edges")],
      1,
    );
    expect(next).toHaveLength(2);
    expect(next[0]?.kind === "session" && next[0].sessionKind).toBe("edges");
  });
});

describe("router stance_updates", () => {
  it("ignores malformed stance JSON and does not rewrite the array", () => {
    const prev = emptyMistressState("Ху Тао", ["playful"]);
    prev.user.stances = applyExplicitUserTextToStances([], "я люблю эджи", 1);
    const parsed = parseSoulRouterOutput(
      JSON.stringify({
        no_significant_change: false,
        user_memory: {
          identity: { role_in_story: "boy", known_attributes: "tea" },
          relationship_dynamic: {
            trust_level: "Warming",
            dynamic_description: "ok",
            unspoken_tension: "none",
          },
          preferences_and_habits: ["tea"],
          shared_milestones: [],
          stances: [{ subject: "hack", kind: "liked" }],
        },
        stance_updates: [{ subject: "cage", kind: "not_a_kind", explicit: true }],
      }),
      prev,
    );
    expect(parsed?.kind).toBe("patch");
    if (parsed?.kind !== "patch") return;
    expect(parsed.user.stances.some((row) => row.subject === "edges")).toBe(true);
    expect(parsed.user.stances.some((row) => row.subject === "hack")).toBe(false);
    expect(parsed.user.stances.some((row) => row.subject === "cage")).toBe(false);
  });

  it("applies a valid explicit router update", () => {
    const previous = emptyMistressState("Ху Тао", ["playful"]);
    previous.messages.push({
      id: "u1",
      role: "user",
      text: "Я хочу попробовать пробку.",
      atMs: 1,
    });
    const parsed = parseSoulRouterOutput(
      JSON.stringify({
        no_significant_change: false,
        stance_updates: [
          {
            subject: "plug",
            kind: "curious_about",
            evidence: "wants to try",
            explicit: true,
          },
        ],
      }),
      previous,
    );
    expect(parsed?.kind).toBe("patch");
    if (parsed?.kind !== "patch") return;
    expect(
      parsed.user.stances.some(
        (row) => row.kind === "curious_about" && row.subject === "plug",
      ),
    ).toBe(true);
  });
});

describe("often_refuses plus curiosity keeps nuance", () => {
  it("does not erase often_refuses when he is also curious", () => {
    let stances: UserStance[] = [];
    stances = applyWorldEventToStances(stances, refuseEvent(HOUR));
    stances = applyWorldEventToStances(stances, refuseEvent(2 * HOUR));
    stances = applyWorldEventToStances(stances, refuseEvent(3 * HOUR));
    stances = applyStanceUpdates(
      stances,
      [{ subject: "session", kind: "curious_about", explicit: true }],
      4 * HOUR,
    );
    expect(stances.some((row) => row.kind === "often_refuses")).toBe(true);
    expect(stances.some((row) => row.kind === "curious_about")).toBe(true);
  });
});
