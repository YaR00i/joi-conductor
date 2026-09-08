import { describe, expect, it } from "vitest";
import {
  applyIntentFromCandidate,
  consumeInitiative,
  formatIntentLabelRu,
  isCasualOpener,
  listInitiativeCandidates,
  prepareSoulTurnIntent,
  selectInitiativeCandidate,
  shouldConsumeSelectedInitiative,
  type SoulInitiativeContext,
} from "./initiative";
import {
  SOUL_INITIATIVE_COOLDOWN_MS,
  emptyMistressState,
  type SoulMistressState,
} from "./types";

function ctx(
  overrides: Partial<SoulInitiativeContext> = {},
): SoulInitiativeContext {
  return {
    nowMs: 1_000_000,
    checkInOverdue: false,
    sessionOfferOpen: false,
    ...overrides,
  };
}

function withSession(atMs = 900_000): SoulMistressState {
  const state = emptyMistressState("Ху Тао", ["playful"]);
  state.recentEvents.push({
    id: "ev-session",
    kind: "session_completed",
    atMs,
    mistressId: "hu_tao",
    summary: "Сессия завершена · Руина",
    importance: 3,
  });
  return state;
}

describe("soul initiative", () => {
  it("treats short greetings as casual openers", () => {
    expect(isCasualOpener("Привет")).toBe(true);
    expect(isCasualOpener("hi")).toBe(true);
    expect(isCasualOpener("Привет, Хутао")).toBe(true);
    expect(isCasualOpener("Ну что, как тебе сессия?")).toBe(false);
    expect(isCasualOpener("")).toBe(false);
  });

  it("picks overdue check-in over a finished session", () => {
    const state = withSession();
    const candidates = listInitiativeCandidates(
      state,
      ctx({ checkInOverdue: true, checkInAtMs: 800_000 }),
    );
    const picked = selectInitiativeCandidate(
      candidates,
      state.initiative,
      "Ну что",
      1_000_000,
    );
    expect(picked?.reason).toBe("checkin_overdue");
    expect(picked?.priority).toBe(5);
  });

  it("does not pick check-in, session offer, or last session on a greeting", () => {
    const state = withSession();
    const candidates = listInitiativeCandidates(
      state,
      ctx({
        checkInOverdue: true,
        checkInAtMs: 800_000,
        sessionOfferOpen: true,
        sessionOfferKey: "2026-09-04",
      }),
    );
    const picked = selectInitiativeCandidate(
      candidates,
      state.initiative,
      "Привет",
      1_000_000,
    );
    expect(picked).toBeNull();
  });

  it("respects cooldown unless priority is 5", () => {
    const state = withSession();
    state.initiative = { lastAtMs: 1_000_000 - 60_000, consumedIds: [] };
    const later = 1_000_000;
    const cooled = selectInitiativeCandidate(
      listInitiativeCandidates(state, ctx({ nowMs: later })),
      state.initiative,
      "Ну что",
      later,
    );
    expect(cooled).toBeNull();

    const urgent = selectInitiativeCandidate(
      listInitiativeCandidates(
        state,
        ctx({
          nowMs: later,
          checkInOverdue: true,
          checkInAtMs: 900_000,
        }),
      ),
      state.initiative,
      "Ну что",
      later,
    );
    expect(urgent?.reason).toBe("checkin_overdue");
    expect(later - (state.initiative.lastAtMs ?? 0)).toBeLessThan(
      SOUL_INITIATIVE_COOLDOWN_MS,
    );
  });

  it("does not re-initiate a consumed event", () => {
    const state = withSession();
    const first = selectInitiativeCandidate(
      listInitiativeCandidates(state, ctx()),
      state.initiative,
      "Ну что, как тебе сессия?",
      1_000_000,
    );
    expect(first?.id).toBe("event:ev-session");
    const consumed = consumeInitiative(state, first!.id, 1_000_000);
    const again = selectInitiativeCandidate(
      listInitiativeCandidates(consumed, ctx({ nowMs: 1_000_000 + SOUL_INITIATIVE_COOLDOWN_MS + 1 })),
      consumed.initiative,
      "Ну что",
      1_000_000 + SOUL_INITIATIVE_COOLDOWN_MS + 1,
    );
    expect(again).toBeNull();
  });

  it("does not duplicate an open loop that already has an event candidate", () => {
    const state = withSession();
    state.openLoops.push({
      id: "ev-session",
      summary: "Сессия завершена · Руина",
      source: "session_completed",
      atMs: 900_000,
      importance: 3,
    });
    const ids = listInitiativeCandidates(state, ctx()).map((row) => row.id);
    expect(ids.filter((id) => id.endsWith("ev-session"))).toEqual([
      "event:ev-session",
    ]);
  });

  it("prepare sets intent from the selected candidate without closing loops", () => {
    const state = emptyMistressState("Ху Тао", ["playful"]);
    state.openLoops.push({
      id: "loop-refuse",
      summary: "Отказался от предложенной сессии",
      source: "session_refused",
      atMs: 900_000,
      importance: 2,
    });
    const prepared = prepareSoulTurnIntent(
      state,
      "Я вчера отказался от сессии. Ты злишься?",
      ctx(),
    );
    expect(prepared.selected?.reason).toBe("open_loop");
    expect(prepared.state.intent?.goal).toMatch(/Отказался/);
    expect(prepared.state.intent?.candidateId).toBe("loop:loop-refuse");
    expect(prepared.state.openLoops).toHaveLength(1);
    const applied = applyIntentFromCandidate(
      prepared.state,
      prepared.selected!,
      ctx().nowMs,
    );
    expect(applied.openLoops).toHaveLength(1);
  });

  it("drops expired loops before listing candidates", () => {
    const state = emptyMistressState("Ху Тао", ["playful"]);
    state.openLoops.push({
      id: "old",
      summary: "Утренний пак: пропустил 1",
      source: "morning_pack",
      atMs: 1,
      importance: 2,
      expiresAtMs: 10,
    });
    const prepared = prepareSoulTurnIntent(
      state,
      "Ну что",
      ctx({ nowMs: 11 }),
    );
    expect(prepared.state.openLoops).toEqual([]);
    expect(prepared.selected).toBeNull();
  });

  it("does not let an old session beat a fresher higher-priority candidate", () => {
    const state = emptyMistressState("Ху Тао", ["playful"]);
    state.recentEvents.push(
      {
        id: "ev-old-session",
        kind: "session_completed",
        atMs: 100_000,
        mistressId: "hu_tao",
        summary: "Сессия завершена. Руина.",
        importance: 3,
        subjectId: "sess:old",
      },
      {
        id: "ev-fresh-contract",
        kind: "contract_failed",
        atMs: 900_000,
        mistressId: "hu_tao",
        summary: "Контракт провален: зарядка",
        importance: 2,
        subjectId: "c-fresh",
      },
    );
    const picked = selectInitiativeCandidate(
      listInitiativeCandidates(state, ctx()),
      state.initiative,
      "Что с контрактом?",
      1_000_000,
    );
    expect(picked?.reason).toBe("contract_failed");
    expect(picked?.id).toBe("event:ev-fresh-contract");
  });

  it("holds a low-priority session offer during tired small talk", () => {
    const state = emptyMistressState("Ху Тао", ["playful"]);
    const held = selectInitiativeCandidate(
      listInitiativeCandidates(state, ctx({ sessionOfferOpen: true })),
      state.initiative,
      "Устал сегодня на работе",
      1_000_000,
    );
    expect(held).toBeNull();
    const asked = selectInitiativeCandidate(
      listInitiativeCandidates(state, ctx({ sessionOfferOpen: true })),
      state.initiative,
      "Ну что, как тебе сессия?",
      1_000_000,
    );
    expect(asked?.reason).toBe("session_offer");
  });

  it("selects a live session offer on a natural invitation, not on questions about her", () => {
    const state = emptyMistressState("Ху Тао", ["playful"]);
    const offer = listInitiativeCandidates(
      state,
      ctx({ sessionOfferOpen: true }),
    );
    expect(
      selectInitiativeCandidate(offer, state.initiative, "Привет", 1_000_000)
        ?.reason,
    ).toBeUndefined();
    expect(
      selectInitiativeCandidate(
        offer,
        state.initiative,
        "А ты чем занималась?",
        1_000_000,
      )?.reason,
    ).toBeUndefined();
    expect(
      selectInitiativeCandidate(
        offer,
        state.initiative,
        "Чем займёмся?",
        1_000_000,
      )?.reason,
    ).toBe("session_offer");
    expect(
      selectInitiativeCandidate(
        offer,
        state.initiative,
        "Клетка сегодня надоела",
        1_000_000,
      )?.reason,
    ).toBeUndefined();
    expect(
      selectInitiativeCandidate(
        offer,
        state.initiative,
        "Клетка надоела, придумай что-нибудь другое",
        1_000_000,
      )?.reason,
    ).toBe("session_offer");
    const prepared = prepareSoulTurnIntent(
      state,
      "Просто хочу поболтать",
      ctx({ sessionOfferOpen: true }),
    );
    expect(prepared.selected).toBeNull();
    expect(prepared.state.intent).toBeNull();
  });

  it("consumes a session offer only when speech or a card actually expressed it", () => {
    expect(
      shouldConsumeSelectedInitiative(
        { reason: "session_offer" },
        "Можем просто посидеть с чаем.",
        0,
      ),
    ).toBe(false);
    expect(
      shouldConsumeSelectedInitiative(
        { reason: "session_offer" },
        "Сессия будет.",
        0,
      ),
    ).toBe(true);
    expect(
      shouldConsumeSelectedInitiative(
        { reason: "session_offer" },
        "Можем просто посидеть с чаем.",
        1,
      ),
    ).toBe(true);
    expect(
      shouldConsumeSelectedInitiative(
        { reason: "session_completed" },
        "Славно.",
        0,
      ),
    ).toBe(true);
  });

  it("keeps only the latest session event as a candidate", () => {
    const state = emptyMistressState("Ху Тао", ["playful"]);
    state.recentEvents.push(
      {
        id: "ev-old",
        kind: "session_completed",
        atMs: 100_000,
        mistressId: "hu_tao",
        summary: "Сессия завершена вчера.",
        importance: 3,
      },
      {
        id: "ev-new",
        kind: "session_aborted",
        atMs: 900_000,
        mistressId: "hu_tao",
        summary: "Сессия оборвана.",
        importance: 2,
      },
    );
    const ids = listInitiativeCandidates(state, ctx()).map((row) => row.id);
    expect(ids).toContain("event:ev-new");
    expect(ids).not.toContain("event:ev-old");
  });
});

describe("formatIntentLabelRu", () => {
  it("maps known session and check-in intents to short Russian labels", () => {
    expect(
      formatIntentLabelRu({
        goal: "Если к месту — коротко отметить последнюю сессию. Не отчёт и не пересказ.",
        subject: "последняя сессия",
        source: "session",
        candidateId: "event:ev-session",
      }),
    ).toBe("Вспомнить недавнюю сессию");
    expect(
      formatIntentLabelRu({
        goal: "Если к месту — спросить, почему он оборвал сессию. Не отчитывать списком.",
        subject: "оборванная сессия",
        source: "session",
        candidateId: "event:ev-abort",
      }),
    ).toBe("Вернуться к оборванной сессии");
    expect(
      formatIntentLabelRu({
        goal: "После ответа спросить просроченный отчёт — не вместо приветствия.",
        source: "checkin",
        candidateId: "checkin:800000",
      }),
    ).toBe("Дождаться отчёта");
    expect(
      formatIntentLabelRu({
        goal: "В приложении уже есть чип сессии. Можно намекнуть в речи, не пересказывать CONTROL.",
        source: "session",
        candidateId: "session_offer:open",
      }),
    ).toBe("Подвести разговор к сессии");
  });

  it("falls back when the intent is unknown", () => {
    expect(
      formatIntentLabelRu({
        goal: "something the UI should not dump",
        source: "conversation",
      }),
    ).toBe("Текущая тема разговора");
  });
});
