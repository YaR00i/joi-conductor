import type { CharacterBible } from "../character";
import { appendDiaryEntry, clampTopicBody } from "./markdown";
import type { SoulLlmClient } from "./client";
import {
  buildArchivistPrompt,
  buildChatMessages,
  buildDiaryPrompt,
  buildRouterPrompt,
  formatSoulTranscript,
} from "./prompts";
import {
  applySoulRouterPatch,
  parseSoulRouterOutput,
  resolveTopicActionTarget,
  upsertSoulTopic,
  type SoulTopicAction,
} from "./router";
import { newSoulMessage } from "./store";
import {
  SOUL_ROUTER_BATCH,
  soulRouterLite,
  soulUsesDiary,
  soulUsesRouter,
  soulUsesTopics,
  type SoulMistressState,
} from "./types";

export type SoulTurnResult = {
  state: SoulMistressState;
  reply: string;
  error?: string;
};

async function writeTopicFile(
  client: SoulLlmClient,
  bible: CharacterBible,
  state: SoulMistressState,
  action: SoulTopicAction,
  signal?: AbortSignal,
): Promise<SoulMistressState> {
  const resolved = resolveTopicActionTarget(state.topics, action);
  const previous =
    state.topics.find((t) => t.filename === resolved.filename)?.body ?? "";
  const body = await client.complete({
    messages: [
      {
        role: "user",
        content: buildArchivistPrompt(
          bible,
          resolved.filename,
          resolved.reason,
          previous,
          formatSoulTranscript(state.messages, 10),
        ),
      },
    ],
    maxTokens: 700,
    temperature: 0.55,
    signal,
  });
  return {
    ...state,
    topics: upsertSoulTopic(
      state.topics,
      resolved.filename,
      clampTopicBody(body),
    ),
  };
}

export function soulNeedsSync(state: SoulMistressState): boolean {
  return state.pendingSinceRouter >= SOUL_ROUTER_BATCH;
}

export async function syncSoulMemory(
  state: SoulMistressState,
  bible: CharacterBible,
  client: SoulLlmClient,
  signal?: AbortSignal,
  nowMs = Date.now(),
): Promise<SoulMistressState> {
  let next = { ...state, pendingSinceRouter: 0 };

  if (soulUsesRouter(state.mode)) {
    const raw = await client.complete({
      messages: [
        {
          role: "user",
          content: buildRouterPrompt(
            bible,
            state,
            soulRouterLite(state.mode),
          ),
        },
      ],
      maxTokens: 1400,
      temperature: 0.15,
      signal,
    });
    const parsed = parseSoulRouterOutput(raw, state);
    if (parsed) next = applySoulRouterPatch(next, parsed);
    if (
      parsed?.kind === "patch" &&
      soulUsesTopics(state.mode) &&
      parsed.topicActions.length > 0
    ) {
      for (const action of parsed.topicActions) {
        next = await writeTopicFile(client, bible, next, action, signal);
      }
    }
  }

  if (soulUsesDiary(state.mode)) {
    const diary = await client.complete({
      messages: [{ role: "user", content: buildDiaryPrompt(bible, next) }],
      maxTokens: 420,
      temperature: 0.7,
      signal,
    });
    next = {
      ...next,
      diaryMd: appendDiaryEntry(next.diaryMd, diary, nowMs),
    };
  }

  return next;
}

export async function sendSoulChatTurn(opts: {
  state: SoulMistressState;
  bible: CharacterBible;
  userText: string;
  client: SoulLlmClient;
  signal?: AbortSignal;
  nowMs?: number;
}): Promise<SoulTurnResult> {
  const text = opts.userText.trim();
  if (!text) {
    return { state: opts.state, reply: "" };
  }
  const nowMs = opts.nowMs ?? Date.now();
  const withUser: SoulMistressState = {
    ...opts.state,
    messages: [...opts.state.messages, newSoulMessage("user", text, nowMs)],
  };
  const messages = buildChatMessages(opts.bible, withUser, text);
  try {
    const reply = await opts.client.complete({
      messages,
      signal: opts.signal,
    });
    return {
      reply,
      state: {
        ...withUser,
        messages: [
          ...withUser.messages,
          newSoulMessage("assistant", reply, nowMs + 1),
        ],
        pendingSinceRouter: withUser.pendingSinceRouter + 2,
      },
    };
  } catch (err) {
    if ((err as { name?: string }).name === "AbortError") throw err;
    return {
      state: withUser,
      reply: "",
      error: err instanceof Error ? err.message : "модель не ответила",
    };
  }
}

export function lastSoulUserText(state: SoulMistressState): string {
  for (let i = state.messages.length - 1; i >= 0; i--) {
    if (state.messages[i]?.role === "user") return state.messages[i]!.text;
  }
  return "";
}

/** Drop the assistant bubble and everything after it (SoW / SillyTavern reroll). */
export function truncateForRegenerate(
  state: SoulMistressState,
  assistantMessageId: string,
): SoulMistressState | null {
  const index = state.messages.findIndex(
    (m) => m.id === assistantMessageId && m.role === "assistant",
  );
  if (index < 0) return null;
  return {
    ...state,
    messages: state.messages.slice(0, index),
  };
}

export function editSoulMessage(
  state: SoulMistressState,
  messageId: string,
  text: string,
): SoulMistressState {
  const trimmed = text.trim();
  if (!trimmed) return state;
  return {
    ...state,
    messages: state.messages.map((m) =>
      m.id === messageId ? { ...m, text: trimmed } : m,
    ),
  };
}

export async function regenerateSoulReply(opts: {
  state: SoulMistressState;
  bible: CharacterBible;
  messageId: string;
  client: SoulLlmClient;
  signal?: AbortSignal;
  nowMs?: number;
}): Promise<SoulTurnResult> {
  const sliced = truncateForRegenerate(opts.state, opts.messageId);
  if (!sliced) {
    return { state: opts.state, reply: "", error: "нечего перегенерировать" };
  }
  const userText = lastSoulUserText(sliced);
  if (!userText) {
    return { state: opts.state, reply: "", error: "нет реплики, от которой крутить" };
  }
  const nowMs = opts.nowMs ?? Date.now();
  const messages = buildChatMessages(opts.bible, sliced, userText);
  try {
    const reply = await opts.client.complete({
      messages,
      signal: opts.signal,
    });
    return {
      reply,
      state: {
        ...sliced,
        messages: [
          ...sliced.messages,
          newSoulMessage("assistant", reply, nowMs),
        ],
      },
    };
  } catch (err) {
    if ((err as { name?: string }).name === "AbortError") throw err;
    return {
      state: opts.state,
      reply: "",
      error: err instanceof Error ? err.message : "модель не ответила",
    };
  }
}
