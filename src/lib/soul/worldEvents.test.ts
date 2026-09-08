import { describe, expect, it } from "vitest";
import { emptyMistressState } from "./types";
import {
  addSoulMilestone,
  closeSoulOpenLoops,
  createSoulOpenLoop,
  decideSoulEventMemory,
  expireSoulOpenLoops,
  ingestSoulWorldEvent,
  isDuplicateSoulEvent,
  makeSoulWorldEvent,
  morningPackEventInput,
  sessionEndEventInput,
  sessionRefusedEventInput,
} from "./worldEvents";

function state() {
  return emptyMistressState("Ху Тао", ["playful"]);
}

describe("soul world events", () => {
  it("forgets low-importance check-ins and live ticks", () => {
    const event = makeSoulWorldEvent({
      kind: "checkin_submitted",
      mistressId: "hu_tao",
      summary: "Отчитался по check-in",
      importance: 1,
    });
    expect(decideSoulEventMemory(event)).toBe("forget");
    const next = ingestSoulWorldEvent(state(), {
      kind: "live_obligation_changed",
      mistressId: "hu_tao",
      summary: "Клетка 4ч",
      importance: 1,
    });
    expect(next.changed).toBe(false);
    expect(next.state.recentEvents).toEqual([]);
    expect(next.state.openLoops).toEqual([]);
  });

  it("does not treat a completed session as a milestone from importance alone", () => {
    const event = makeSoulWorldEvent(
      sessionEndEventInput({
        mistressId: "hu_tao",
        reason: "complete",
        finaleOutcome: "ruin",
        sessionId: "sess:hu_tao:decide:complete",
        endedAtMs: 1,
      }),
    );
    expect(decideSoulEventMemory(event)).toBe("remember");
  });

  it("keeps an ordinary completed session in recent events, not milestones", () => {
    const first = ingestSoulWorldEvent(
      state(),
      sessionEndEventInput({
        mistressId: "hu_tao",
        reason: "complete",
        finaleOutcome: "ruin",
        edgesDone: 6,
        sessionId: "sess:hu_tao:1:complete",
        endedAtMs: 1_000,
      }),
    );
    expect(first.decision).toBe("milestone");
    expect(first.state.recentEvents).toHaveLength(1);
    expect(first.state.openLoops).toHaveLength(0);

    const again = ingestSoulWorldEvent(
      first.state,
      sessionEndEventInput({
        mistressId: "hu_tao",
        reason: "complete",
        finaleOutcome: "cum",
        edgesDone: 3,
        sessionId: "sess:hu_tao:2:complete",
        endedAtMs: 2_000,
      }),
    );
    expect(again.decision).toBe("remember");
    expect(again.state.recentEvents).toHaveLength(2);
    expect(again.state.openLoops).toHaveLength(0);
    const sessionMilestones = again.state.user.sharedMilestones.filter((row) =>
      /сессия завершена/i.test(row),
    );
    expect(sessionMilestones).toHaveLength(1);
  });

  it("does not treat a later completed session as another milestone", () => {
    const seeded = state();
    seeded.recentEvents.push({
      id: "prior",
      kind: "session_completed",
      atMs: 1,
      mistressId: "hu_tao",
      summary: "Сессия завершена. Руина.",
      importance: 3,
      subjectId: "sess:prior",
    });
    const result = ingestSoulWorldEvent(
      seeded,
      sessionEndEventInput({
        mistressId: "hu_tao",
        reason: "complete",
        finaleOutcome: "ruin",
        edgesDone: 6,
        sessionId: "sess:hu_tao:later:complete",
        endedAtMs: 2_000,
      }),
    );
    expect(result.decision).toBe("remember");
    expect(result.state.user.sharedMilestones).toEqual([]);
  });

  it("may write one milestone for the first completed session with this mistress", () => {
    const result = ingestSoulWorldEvent(
      state(),
      sessionEndEventInput({
        mistressId: "hu_tao",
        reason: "complete",
        finaleOutcome: "ruin",
        edgesDone: 6,
        sessionId: "sess:hu_tao:first:complete",
        endedAtMs: 1_000,
      }),
    );
    expect(result.decision).toBe("milestone");
    expect(result.state.user.sharedMilestones.filter((row) => /Сессия завершена/.test(row))).toHaveLength(1);
  });

  it("opens a loop on session refuse and closes it after a later session", () => {
    const refused = ingestSoulWorldEvent(
      state(),
      sessionRefusedEventInput("hu_tao"),
    );
    expect(refused.decision).toBe("open_loop");
    expect(refused.state.openLoops).toHaveLength(1);

    const done = ingestSoulWorldEvent(
      refused.state,
      sessionEndEventInput({
        mistressId: "hu_tao",
        reason: "complete",
        finaleOutcome: "cum",
      }),
    );
    expect(done.state.openLoops).toHaveLength(0);
    expect(done.decision).toBe("milestone");
  });

  it("dedupes the same contract outcome inside the window", () => {
    const first = ingestSoulWorldEvent(state(), {
      kind: "contract_failed",
      mistressId: "hu_tao",
      summary: "Контракт провален: зарядка",
      importance: 2,
      subjectId: "c1",
      atMs: 1_000,
    });
    expect(first.decision).toBe("open_loop");
    const again = ingestSoulWorldEvent(first.state, {
      kind: "contract_failed",
      mistressId: "hu_tao",
      summary: "Контракт провален: зарядка ещё раз",
      importance: 2,
      subjectId: "c1",
      atMs: 2_000,
    });
    expect(again.duplicate).toBe(true);
    expect(again.changed).toBe(false);
    expect(again.state.openLoops).toHaveLength(1);
    expect(
      isDuplicateSoulEvent(first.state.recentEvents, again.event),
    ).toBe(true);
  });

  it("closes an accepted-contract loop when that contract completes", () => {
    const accepted = ingestSoulWorldEvent(state(), {
      kind: "contract_accepted",
      mistressId: "hu_tao",
      summary: "Принял контракт: Hands-off",
      importance: 2,
      subjectId: "seed-1",
    });
    expect(accepted.state.openLoops[0]?.subjectId).toBe("seed-1");
    const done = ingestSoulWorldEvent(accepted.state, {
      kind: "contract_completed",
      mistressId: "hu_tao",
      summary: "Контракт выполнен: Hands-off",
      importance: 3,
      subjectId: "seed-1",
    });
    expect(done.decision).toBe("milestone");
    expect(done.state.openLoops).toHaveLength(0);
    expect(done.state.recentEvents).toHaveLength(2);
  });

  it("does not treat a finished morning pack as something to bring up", () => {
    const result = ingestSoulWorldEvent(
      state(),
      morningPackEventInput({ mistressId: "hu_tao", done: 2, skipped: 0 }),
    );
    expect(result.decision).toBe("forget");
    expect(result.changed).toBe(false);
  });

  it("opens a loop when the morning pack was skipped", () => {
    const result = ingestSoulWorldEvent(
      state(),
      morningPackEventInput({ mistressId: "hu_tao", done: 1, skipped: 1 }),
    );
    expect(result.decision).toBe("open_loop");
    expect(result.state.openLoops[0]?.summary).toMatch(/пропустил/);
  });

  it("create/close/expire/dedupe loops without a second store", () => {
    const first = createSoulOpenLoop(
      [],
      {
        id: "a",
        summary: "Принял контракт: Hands-off",
        source: "contract_accepted",
        atMs: 1_000,
        importance: 2,
        subjectId: "seed-1",
      },
      1_000,
    );
    const replaced = createSoulOpenLoop(
      first,
      {
        id: "b",
        summary: "Контракт провален: Hands-off",
        source: "contract_failed",
        atMs: 2_000,
        importance: 2,
        subjectId: "seed-1",
      },
      2_000,
    );
    expect(replaced).toHaveLength(1);
    expect(replaced[0]?.summary).toMatch(/провален/);
    expect(replaced[0]?.expiresAtMs).toBeGreaterThan(2_000);

    const closed = closeSoulOpenLoops(
      replaced,
      (loop) => loop.subjectId === "seed-1",
    );
    expect(closed).toEqual([]);

    const expired = expireSoulOpenLoops(
      [
        {
          id: "old",
          summary: "Утренний пак: пропустил 1",
          source: "morning_pack",
          atMs: 1,
          importance: 2,
          expiresAtMs: 10,
        },
      ],
      11,
    );
    expect(expired).toEqual([]);
  });

  it("replaces a milestone with the same text instead of growing a second list", () => {
    const once = addSoulMilestone([], "Сессия завершена");
    const twice = addSoulMilestone(once, "сессия завершена");
    expect(twice).toEqual(["сессия завершена"]);
  });
});
