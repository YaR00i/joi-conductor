import { beforeEach, describe, expect, it } from "vitest";
import {
  installLocalStorageMock,
  resetLocalStorage,
} from "../../../test/localStorageMock";
import { setActiveMistress } from "../../mistress/activeMistress";
import { loadCageLock } from "../../cageTimer";
import { loadDenialQuest } from "../../denialQuest";
import { loadControlState } from "./store";
import { emptyMistressState } from "../types";
import { acceptChatProposal } from "./proposalApply";
import {
  collectTurnProposals,
  proposalsFromExtract,
  type ChatProposalContext,
} from "./proposals";

installLocalStorageMock();

beforeEach(() => {
  resetLocalStorage();
  setActiveMistress("hu_tao");
});

function ctx(
  overrides: Partial<ChatProposalContext> = {},
): ChatProposalContext {
  return {
    nowMs: 1_000,
    userText: "ок",
    speech: "Клетка на три часа.",
    moodScore: 0,
    cageOn: false,
    plugOn: false,
    denialOn: false,
    checkInSet: false,
    sessionOfferOpen: false,
    pendingSession: false,
    candidateId: "event:ev-1",
    intentId: "event:ev-1",
    ...overrides,
  };
}

describe("chat proposals", () => {
  it("drops malformed JSON", () => {
    expect(proposalsFromExtract("not-json", ctx())).toEqual([]);
    expect(proposalsFromExtract(null, ctx())).toEqual([]);
    expect(proposalsFromExtract({ proposals: [{ op: 1 }] }, ctx())).toEqual([]);
  });

  it("drops hallucinated action types and unknown contract defs", () => {
    const rows = proposalsFromExtract(
      {
        actions: [
          { op: "launch_nukes" },
          { op: "create_contract", defId: "brand_new_torture" },
          { op: "propose_task", defId: "not_a_real_def" },
        ],
      },
      ctx(),
    );
    expect(rows.every((row) => row.kind !== "wear")).toBe(true);
    const task = rows.find((row) => row.kind === "task");
    if (task && task.kind === "task") {
      expect(task.defId).not.toBe("brand_new_torture");
      expect(task.defId).not.toBe("not_a_real_def");
    }
  });

  it("dedupes two wear proposals into one card", () => {
    const rows = proposalsFromExtract(
      {
        actions: [
          { op: "set_wear", kind: "cage", hours: 3 },
          { op: "set_wear", kind: "cage", hours: 10 },
        ],
      },
      ctx(),
    );
    expect(rows.filter((row) => row.kind === "wear")).toHaveLength(1);
  });

  it("does not card a greeting even if speech mentions a cage today", () => {
    const rows = collectTurnProposals({
      userText: "Привет",
      speech: "Привет. Клетку на сегодня, давай.",
      extracted: true,
      extractedRaw: {
        actions: [{ op: "set_wear", kind: "cage", hours: 8 }],
      },
      ctx: ctx({ userText: "Привет", speech: "Привет. Клетку на сегодня, давай." }),
    });
    expect(rows).toEqual([]);
  });

  it("uses the extractor as the only card source", () => {
    const rows = collectTurnProposals({
      userText: "Запирай",
      speech: "Хочу клетку на 10 часов сегодня.",
      extracted: true,
      extractedRaw: {
        actions: [{ op: "set_wear", kind: "cage", hours: 4 }],
      },
      ctx: ctx({
        userText: "Запирай",
        speech: "Хочу клетку на 10 часов сегодня.",
      }),
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.source).toBe("extractor");
    expect(rows[0]?.kind).toBe("wear");
    if (rows[0]?.kind === "wear") expect(rows[0].hours).toBe(4);
  });

  it("does not synthesize a regex fallback when extraction is empty", () => {
    const rows = collectTurnProposals({
      userText: "Запирай",
      speech: "Хочу клетку на 10 часов сегодня.",
      extracted: true,
      extractedRaw: { actions: [] },
      ctx: ctx({
        userText: "Запирай",
        speech: "Хочу клетку на 10 часов сегодня.",
      }),
    });
    expect(rows).toEqual([]);
  });

  it("does not start wear on a session refusal", () => {
    const rows = proposalsFromExtract(
      { actions: [{ op: "set_wear", kind: "cage", hours: 8 }] },
      ctx({
        userText:
          "Отказываюсь от сессии — не от утреннего пака и не от зарядки.",
      }),
    );
    expect(rows).toEqual([]);
  });

  it("does not apply wear until accept", () => {
    const rows = proposalsFromExtract(
      { actions: [{ op: "set_wear", kind: "cage", hours: 3 }] },
      ctx(),
    );
    expect(loadCageLock()).toBeNull();
    const accepted = acceptChatProposal({
      mistressId: "hu_tao",
      proposal: rows[0]!,
      soul: emptyMistressState("Ху Тао", ["playful"]),
    });
    expect(loadCageLock()?.hours).toBe(3);
    expect(accepted.applied?.wearChanged).toBe(true);
  });

  it("accepts denial and check-in only after confirm", () => {
    const denial = proposalsFromExtract(
      { actions: [{ op: "set_denial", hours: 12, edges: 2 }] },
      ctx(),
    )[0]!;
    expect(loadDenialQuest()).toBeNull();
    acceptChatProposal({
      mistressId: "hu_tao",
      proposal: denial,
      soul: emptyMistressState("Ху Тао", ["playful"]),
    });
    expect(loadDenialQuest()?.hours).toBe(12);

    const checkin = proposalsFromExtract(
      {
        actions: [{ op: "set_checkin", kind: "hours", hours: 2, note: "напиши" }],
      },
      ctx(),
    )[0]!;
    acceptChatProposal({
      mistressId: "hu_tao",
      proposal: checkin,
      soul: emptyMistressState("Ху Тао", ["playful"]),
    });
    expect(loadControlState("hu_tao").checkIn?.note).toBe("напиши");
  });

  it("returns an accepted session build request without a second pending card", () => {
    const row = proposalsFromExtract(
      {
        actions: [
          {
            op: "propose_session",
            kind: "edges",
            durationSec: 600,
            edgesTarget: 5,
            finalePolicy: "ruin_norm",
          },
        ],
      },
      ctx(),
    )[0]!;
    expect(row.kind).toBe("session");
    const soul = emptyMistressState("Ху Тао", ["playful"]);
    soul.openLoops.push({
      id: "ev-1",
      summary: "Сессия",
      source: "session_refused",
      atMs: 1,
      importance: 2,
    });
    const accepted = acceptChatProposal({
      mistressId: "hu_tao",
      proposal: { ...row, candidateId: "loop:ev-1" },
      soul,
    });
    expect(loadControlState("hu_tao").pendingProposal).toBeNull();
    expect(accepted.applied).toBeNull();
    expect(accepted.session?.sessionKind).toBe("edges");
    expect(accepted.soul.openLoops).toEqual([]);
  });

  it("rechecks a hard boundary at acceptance time", () => {
    const row = proposalsFromExtract(
      {
        actions: [
          {
            op: "propose_session",
            kind: "edges",
            durationSec: 600,
            edgesTarget: 5,
            finalePolicy: "ruin_norm",
          },
        ],
      },
      ctx(),
    )[0]!;
    const soul = emptyMistressState("Ху Тао", ["playful"]);
    soul.user.stances = [
      {
        subject: "session",
        kind: "hard_boundary",
        confidence: 1,
        evidenceCount: 1,
        lastEvidenceAtMs: 1,
        source: "explicit_chat",
      },
    ];
    const accepted = acceptChatProposal({
      mistressId: "hu_tao",
      proposal: row,
      soul,
    });
    expect(accepted.session).toBeNull();
    expect(loadControlState("hu_tao").pendingProposal).toBeNull();
  });

  it("refuses without changing control", () => {
    const row = proposalsFromExtract(
      { actions: [{ op: "set_wear", kind: "plug", hours: 2 }] },
      ctx(),
    )[0]!;
    expect(row).toBeTruthy();
    expect(loadCageLock()).toBeNull();
  });

  it("stamps candidateId from the turn onto the card", () => {
    const rows = proposalsFromExtract(
      { actions: [{ op: "set_wear", kind: "cage", hours: 3 }] },
      ctx({ candidateId: "event:ev-9", intentId: "event:ev-9" }),
    );
    expect(rows[0]?.candidateId).toBe("event:ev-9");
    expect(rows[0]?.intentId).toBe("event:ev-9");
  });
});
