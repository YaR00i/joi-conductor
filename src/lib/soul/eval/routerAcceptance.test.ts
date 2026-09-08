import { describe, expect, it } from "vitest";
import type { SoulLlmClient } from "../client";
import { runSoulRouterAcceptance } from "./routerAcceptance";
import { huTaoBible } from "../../character";

function scriptedClient(replies: string[]): SoulLlmClient {
  const queue = [...replies];
  return {
    async complete() {
      const text = queue.shift();
      if (text == null) throw new Error("missing scripted router output");
      return { text };
    },
  };
}

describe("live Router acceptance harness", () => {
  it("checks no-op, everyday habit, boundary ownership and topic/diary", async () => {
    const results = await runSoulRouterAcceptance({
      bible: huTaoBible,
      client: scriptedClient([
        '{"no_significant_change":true}',
        '{"user_memory":{"preferences_and_habits":["вечерний чай"]}}',
        '{"stance_updates":[{"subject":"cage","kind":"hard_boundary","evidence":"прямая жёсткая граница","explicit":true}]}',
        '{"topic_plan":{"actions":[{"action":"create","filename":"first_meeting.md","reason":"важная первая встреча","body":"Они познакомились ночью за чаем."}]},"diary_entry":"Мы познакомились ночью за чаем. Я запомню эту встречу."}',
      ]),
      nowMs: 1_000,
    });
    expect(results).toHaveLength(4);
    expect(results.every((row) => row.pass)).toBe(true);
    expect(results.map((row) => row.id)).toEqual([
      "no_op",
      "everyday_habit",
      "hard_boundary",
      "topic_diary",
    ]);
  });
});
