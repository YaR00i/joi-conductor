import type { SoulLlmClient } from "./client";
import type { SoulModelRole } from "./llmSettings";
import type { SoulChatTurn } from "./prompts";
import { STRUCTURED_JSON_REPAIR_HINT } from "./prompts";

export type StructuredRoleAttempt = {
  ok: boolean;
};

export type StructuredRoleResult<T> = {
  value: T | null;
  raw: string;
  retryUsed: boolean;
  attempts: StructuredRoleAttempt[];
  latencyMs: number;
};

export async function completeStructuredRole<T>(opts: {
  client: SoulLlmClient;
  role: Exclude<SoulModelRole, "chat">;
  messages: SoulChatTurn[];
  parse: (raw: string) => T | null;
  signal?: AbortSignal;
  repairHint?: string;
}): Promise<StructuredRoleResult<T>> {
  const started = Date.now();
  const attempts: StructuredRoleAttempt[] = [];
  let messages = opts.messages;
  let raw = "";
  let retryUsed = false;

  for (let i = 0; i < 2; i += 1) {
    if (i === 1) retryUsed = true;
    try {
      raw = (
        await opts.client.complete({
          messages,
          role: opts.role,
          signal: opts.signal,
        })
      ).text;
    } catch (err) {
      if ((err as { name?: string }).name === "AbortError") throw err;
      attempts.push({ ok: false });
      if (i === 0) {
        messages = [
          ...opts.messages,
          { role: "assistant", content: "" },
          { role: "user", content: STRUCTURED_JSON_REPAIR_HINT },
        ];
        continue;
      }
      break;
    }
    const value = opts.parse(raw);
    attempts.push({ ok: value != null });
    if (value != null) {
      return {
        value,
        raw,
        retryUsed,
        attempts,
        latencyMs: Date.now() - started,
      };
    }
    if (i === 0) {
      messages = [
        ...opts.messages,
        { role: "assistant", content: raw.slice(0, 4000) },
        { role: "user", content: STRUCTURED_JSON_REPAIR_HINT },
        ...(opts.repairHint
          ? [{ role: "user" as const, content: opts.repairHint }]
          : []),
      ];
    }
  }

  return {
    value: null,
    raw,
    retryUsed,
    attempts,
    latencyMs: Date.now() - started,
  };
}
