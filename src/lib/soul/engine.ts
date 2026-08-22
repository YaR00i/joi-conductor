import type { CharacterBible } from "../character";
import type { MistressId } from "../mistress/types";
import { appendDiaryEntry, clampTopicBody } from "./markdown";
import type { SoulLlmClient } from "./client";
import {
  buildArchivistPrompt,
  buildChatMessages,
  buildControlExtractPrompt,
  buildDiaryPrompt,
  buildRouterPrompt,
  formatSoulTranscript,
} from "./prompts";
import {
  applyRouterControlHint,
  looksLikeControlIntent,
  parseControlActions,
  splitControlReply,
  filterControlActions,
} from "./control/actions";
import { parseJsonObject } from "./json";
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
import type { ControlAction } from "./control/types";

export type SoulTurnResult = {
  state: SoulMistressState;
  reply: string;
  actions: ControlAction[];
  error?: string;
};

function mistressIdFromBible(bible: CharacterBible): MistressId {
  switch (bible.id) {
    case "hu_tao":
    case "furina":
    case "sunna":
    case "sparkle":
      return bible.id;
    default:
      return "hu_tao";
  }
}

async function resolveControlFromReply(opts: {
  raw: string;
  userText: string;
  bible: CharacterBible;
  client: SoulLlmClient;
  signal?: AbortSignal;
}): Promise<{ speech: string; actions: ControlAction[] }> {
  const split = splitControlReply(opts.raw);
  const keep = (speech: string, actions: ControlAction[]) => ({
    speech,
    actions: filterControlActions(actions, opts.userText, speech),
  });
  if (split.actions.length > 0) return keep(split.speech, split.actions);
  if (!looksLikeControlIntent(opts.userText, split.speech)) return keep(split.speech, []);
  try {
    const extracted = (
      await opts.client.complete({
        messages: [
          {
            role: "user",
            content: buildControlExtractPrompt(
              opts.bible,
              opts.userText,
              split.speech,
            ),
          },
        ],
        maxTokens: 400,
        temperature: 0.1,
        signal: opts.signal,
      })
    ).text;
    const fromJson = parseControlActions(parseJsonObject(extracted) ?? {});
    if (fromJson.length > 0) return keep(split.speech, fromJson);
    const second = splitControlReply(extracted);
    return keep(split.speech, second.actions);
  } catch (err) {
    if ((err as { name?: string }).name === "AbortError") throw err;
    return keep(split.speech, []);
  }
}

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
  const body = (
    await client.complete({
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
    })
  ).text;
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
    const raw = (
      await client.complete({
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
      })
    ).text;
    const parsed = parseSoulRouterOutput(raw, state);
    if (parsed) next = applySoulRouterPatch(next, parsed);
    applyRouterControlHint(mistressIdFromBible(bible), parseJsonObject(raw));
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
    const diary = (
      await client.complete({
        messages: [{ role: "user", content: buildDiaryPrompt(bible, next) }],
        maxTokens: 420,
        temperature: 0.7,
        signal,
      })
    ).text;
    next = {
      ...next,
      diaryMd: appendDiaryEntry(next.diaryMd, diary, nowMs),
    };
  }

  return next;
}

function appendUserIfNeeded(
  state: SoulMistressState,
  text: string,
  nowMs: number,
): SoulMistressState {
  const last = state.messages[state.messages.length - 1];
  if (last?.role === "user" && last.text === text) return state;
  return {
    ...state,
    messages: [...state.messages, newSoulMessage("user", text, nowMs)],
  };
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
    return { state: opts.state, reply: "", actions: [] };
  }
  const nowMs = opts.nowMs ?? Date.now();
  const withUser = appendUserIfNeeded(opts.state, text, nowMs);
  const messages = buildChatMessages(opts.bible, withUser, text);
  try {
    const reply = await opts.client.complete({
      messages,
      signal: opts.signal,
      think: true,
    });
    const { speech, actions } = await resolveControlFromReply({
      raw: reply.text,
      userText: text,
      bible: opts.bible,
      client: opts.client,
      signal: opts.signal,
    });
    return {
      reply: speech,
      actions,
      state: {
        ...withUser,
        messages: speech
          ? [
              ...withUser.messages,
              newSoulMessage("assistant", speech, nowMs + 1, reply.think),
            ]
          : withUser.messages,
        pendingSinceRouter: withUser.pendingSinceRouter + (speech ? 2 : 1),
      },
    };
  } catch (err) {
    if ((err as { name?: string }).name === "AbortError") throw err;
    return {
      state: withUser,
      reply: "",
      actions: [],
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
    return { state: opts.state, reply: "", actions: [], error: "нечего перегенерировать" };
  }
  const userText = lastSoulUserText(sliced);
  if (!userText) {
    return { state: opts.state, reply: "", actions: [], error: "нет реплики, от которой крутить" };
  }
  const nowMs = opts.nowMs ?? Date.now();
  const messages = buildChatMessages(opts.bible, sliced, userText);
  try {
    const reply = await opts.client.complete({
      messages,
      signal: opts.signal,
      think: true,
    });
    const { speech, actions } = await resolveControlFromReply({
      raw: reply.text,
      userText,
      bible: opts.bible,
      client: opts.client,
      signal: opts.signal,
    });
    return {
      reply: speech,
      actions,
      state: {
        ...sliced,
        messages: speech
          ? [
              ...sliced.messages,
              newSoulMessage("assistant", speech, nowMs, reply.think),
            ]
          : sliced.messages,
      },
    };
  } catch (err) {
    if ((err as { name?: string }).name === "AbortError") throw err;
    return {
      state: opts.state,
      reply: "",
      actions: [],
      error: err instanceof Error ? err.message : "модель не ответила",
    };
  }
}
