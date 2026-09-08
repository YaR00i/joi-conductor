import { describe, expect, it } from "vitest";
import type { SoulLlmClient } from "./client";
import { probeSoulRoleHealthWithClient } from "./roleHealth";
import { functions, patterns } from "../catalog";
import { DEFAULT_PARAMS } from "../types";

function scriptedClient(replies: string[]): SoulLlmClient {
  const queue = [...replies];
  return {
    async complete() {
      const next = queue.shift();
      if (next == null) throw new Error("no scripted reply");
      return { text: next };
    },
  };
}

describe("soul role health probe", () => {
  it("does not mutate Soul and reports valid JSON plus a wear proposal", async () => {
    const functionId = functions.find(
      (row) =>
        row.enabled &&
        row.modes.includes(DEFAULT_PARAMS.mode) &&
        row.requiresToys.length === 0,
    )!.id;
    const patternId = patterns.find((row) => row.enabled)!.id;
    const result = await probeSoulRoleHealthWithClient({
      client: scriptedClient([
        '{"no_significant_change": true}',
        '{"proposals":[{"op":"set_wear","kind":"cage","hours":3}]}',
        JSON.stringify({
          bpmMin: 60,
          bpmMax: 100,
          blockSecMin: 20,
          blockSecMax: 40,
          allowedFunctionIds: [functionId],
          allowedPatternIds: [patternId],
        }),
      ]),
      resolved: {
        model: "chat-14b",
        roleModels: {
          router: "instruct-7b",
          extractor: "instruct-7b",
          planner: "",
        },
      },
    });
    expect(result.router.ok).toBe(true);
    expect(result.router.model).toBe("instruct-7b");
    expect(result.router.detail).toBe("valid JSON");
    expect(result.extractor.ok).toBe(true);
    expect(result.extractor.model).toBe("instruct-7b");
    expect(result.extractor.detail).toBe("valid proposal");
    expect(result.planner.ok).toBe(true);
    expect(result.planner.model).toBe("chat-14b");
    expect(result.planner.detail).toBe("valid bounded plan");
  });
});
