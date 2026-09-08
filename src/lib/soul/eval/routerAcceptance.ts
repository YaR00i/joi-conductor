import type { CharacterBible } from "../../character";
import type { SoulLlmClient } from "../client";
import { syncSoulMemoryDetailed } from "../engine";
import { hasHardBoundaryOn } from "../stance";
import { applyExplicitUserTextToStances } from "../stance";
import { emptyMistressState, type SoulMemoryMode } from "../types";

export type SoulRouterAcceptanceCaseId =
  | "no_op"
  | "everyday_habit"
  | "hard_boundary"
  | "topic_diary";

export type SoulRouterAcceptanceResult = {
  id: SoulRouterAcceptanceCaseId;
  pass: boolean;
  checks: Array<{ id: string; ok: boolean }>;
  debug: Awaited<ReturnType<typeof syncSoulMemoryDetailed>>["router"];
  rawAttempts: string[];
};

type AcceptanceCase = {
  id: SoulRouterAcceptanceCaseId;
  mode: SoulMemoryMode;
  turns: Array<{ user: string; assistant: string }>;
  check: (
    before: ReturnType<typeof emptyMistressState>,
    after: ReturnType<typeof emptyMistressState>,
  ) => Array<{ id: string; ok: boolean }>;
};

const CASES: readonly AcceptanceCase[] = [
  {
    id: "no_op",
    mode: 2,
    turns: [{ user: "Привет.", assistant: "Привет." }],
    check: (before, after) => [
      {
        id: "structured_memory_unchanged",
        ok:
          JSON.stringify(after.character) === JSON.stringify(before.character) &&
          JSON.stringify(after.user) === JSON.stringify(before.user),
      },
    ],
  },
  {
    id: "everyday_habit",
    mode: 2,
    turns: [
      {
        user: "Запомни: я обычно пью чай поздно вечером.",
        assistant: "Запомню твой вечерний чай.",
      },
    ],
    check: (_before, after) => [
      {
        id: "habit_saved",
        ok: after.user.preferencesHabits.some((line) => /чай|tea/i.test(line)),
      },
      {
        id: "habit_has_no_play_dump",
        ok: after.user.preferencesHabits.every(
          (line) => !/клетк|cage|plug|пробк|denial|эдж|edge|cei/i.test(line),
        ),
      },
    ],
  },
  {
    id: "hard_boundary",
    mode: 2,
    turns: [
      {
        user: "Запомни: клетка — моя жёсткая граница, никогда её не предлагай.",
        assistant: "Поняла. Клетку больше не предлагаю.",
      },
    ],
    check: (_before, after) => [
      {
        id: "hard_boundary_saved",
        ok: hasHardBoundaryOn(after.user.stances, ["wear:cage", "cage"]),
      },
      {
        id: "boundary_not_duplicated_as_habit",
        ok: after.user.preferencesHabits.every(
          (line) => !/клетк|cage/i.test(line),
        ),
      },
    ],
  },
  {
    id: "topic_diary",
    mode: 0,
    turns: [
      {
        user:
          "Запомни нашу первую встречу: мы познакомились ночью за чаем, и это для меня важно.",
        assistant: "Такую первую встречу я не забуду.",
      },
    ],
    check: (_before, after) => [
      { id: "topic_written", ok: after.topics.some((topic) => topic.body.trim()) },
      { id: "diary_written", ok: after.diaryMd.trim().length > 0 },
    ],
  },
];

function stateForCase(
  bible: CharacterBible,
  testCase: AcceptanceCase,
) {
  const state = emptyMistressState(bible.nameRu, bible.tone);
  state.mode = testCase.mode;
  for (const turn of testCase.turns) {
    state.user.stances = applyExplicitUserTextToStances(
      state.user.stances,
      turn.user,
      state.messages.length + 1,
    );
    state.messages.push({
      id: `router-user-${state.messages.length}`,
      role: "user",
      text: turn.user,
      atMs: state.messages.length + 1,
    });
    state.messages.push({
      id: `router-assistant-${state.messages.length}`,
      role: "assistant",
      text: turn.assistant,
      atMs: state.messages.length + 1,
    });
  }
  state.pendingSinceRouter = state.messages.length;
  return state;
}

/** Live acceptance of the production Router path; no state is persisted. */
export async function runSoulRouterAcceptance(opts: {
  bible: CharacterBible;
  client: SoulLlmClient;
  nowMs?: number;
}): Promise<SoulRouterAcceptanceResult[]> {
  const results: SoulRouterAcceptanceResult[] = [];
  for (let index = 0; index < CASES.length; index += 1) {
    const testCase = CASES[index]!;
    const before = stateForCase(opts.bible, testCase);
    const rawAttempts: string[] = [];
    const recordingClient: SoulLlmClient = {
      async complete(request) {
        const reply = await opts.client.complete(request);
        rawAttempts.push(reply.text);
        return reply;
      },
    };
    const synced = await syncSoulMemoryDetailed(
      before,
      opts.bible,
      recordingClient,
      undefined,
      (opts.nowMs ?? Date.now()) + index,
    );
    const checks = testCase.check(before, synced.state);
    checks.unshift({
      id: "router_json_valid",
      ok: synced.router.parsed !== "invalid",
    });
    results.push({
      id: testCase.id,
      pass: checks.every((row) => row.ok),
      checks,
      debug: synced.router,
      rawAttempts,
    });
  }
  return results;
}
