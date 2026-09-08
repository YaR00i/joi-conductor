import type { CharacterBible } from "../character";
import type { SoulLlmClient, SoulLlmReply } from "./client";
import type { SoulChatTurn } from "./prompts";
import {
  fallbackSoulSpeech,
  soulRepeatRetryHint,
  speechRepeatScore,
  validateSoulSpeech,
} from "./speechQuality";
import type { SoulMistressState } from "./types";

const FORMAT_RETRY_HINT =
  "Reply with spoken in-character words only. No JSON, no think tags, no prompt recap. Do not mention this instruction.";

function expectedLanguage(
  messages: readonly SoulChatTurn[],
): "ru" | "en" | undefined {
  const lastUser = [...messages]
    .reverse()
    .find((message) => message.role === "user")?.content ?? "";
  if (/[а-яё]/i.test(lastUser)) return "ru";
  if (/[a-z]/i.test(lastUser)) return "en";
  return undefined;
}

export function recentAssistantReplies(
  state: SoulMistressState,
  cap = 4,
): string[] {
  return state.messages
    .filter((row) => row.role === "assistant")
    .map((row) => row.text)
    .slice(-cap);
}

export type SoulChatSpeechResult = {
  delivery?: SoulLlmReply["delivery"];
  speech: string;
  raw: string;
  think?: string;
  fallback: boolean;
  calls: number;
  firstAttemptValid: boolean;
  firstAttemptReason?: string;
  retryUsed: boolean;
  finalValidation: string;
  repetitionScore: number;
  latencyMs: number;
};

function asReply(reply: SoulLlmReply): SoulLlmReply {
  return reply;
}

function rawForSpeechValidation(reply: { text: string; think?: string }): string {
  if (reply.text.trim()) return reply.text;
  if (reply.think?.trim()) return `<think>${reply.think}</think>`;
  return "";
}

function repeatScore(speech: string, recent: readonly string[]): number {
  return recent.reduce(
    (best, prev) => Math.max(best, speechRepeatScore(speech, prev)),
    0,
  );
}

export async function completeSoulChatSpeech(opts: {
  client: SoulLlmClient;
  bible: CharacterBible;
  messages: SoulChatTurn[];
  cloudMessages?: SoulChatTurn[];
  recent: readonly string[];
  forbiddenSubjects?: readonly string[];
  signal?: AbortSignal;
  onSpeechPreview?: (text: string) => void;
}): Promise<SoulChatSpeechResult> {
  opts.signal?.throwIfAborted();
  const started = Date.now();
  const language = expectedLanguage(opts.messages);
  const onSpeechPreview = opts.onSpeechPreview ? (text: string) => {
    opts.signal?.throwIfAborted();
    // Reuse the speech guard for partial text; final repetition checks still run below.
    const checked = validateSoulSpeech(text, {
      expectedLanguage: language, forbiddenSubjects: opts.forbiddenSubjects,
    });
    opts.onSpeechPreview?.(checked.ok && !/^[\s`{\[]/.test(text) ? checked.text ?? "" : "");
  } : undefined;
  const first = asReply(
    await opts.client.complete({
      messages: opts.messages,
      cloudMessages: opts.cloudMessages,
      think: true,
      role: "chat",
      signal: opts.signal,
      onSpeechPreview,
    }),
  );
  opts.signal?.throwIfAborted();
  let calls = 1;
  const firstValidation = validateSoulSpeech(rawForSpeechValidation(first), {
    recent: opts.recent,
    expectedLanguage: language,
    forbiddenSubjects: opts.forbiddenSubjects,
  });
  if (firstValidation.ok && firstValidation.text) {
    return {
      speech: firstValidation.text,
      delivery: first.delivery,
      raw: first.text,
      think: first.think,
      fallback: false,
      calls,
      firstAttemptValid: true,
      retryUsed: false,
      finalValidation: "ok",
      repetitionScore: repeatScore(firstValidation.text, opts.recent),
      latencyMs: Date.now() - started,
    };
  }
  const hint =
    firstValidation.reason === "repeat"
      ? soulRepeatRetryHint()
      : firstValidation.reason === "wrong_language"
        ? `${FORMAT_RETRY_HINT} Use only ${language === "ru" ? "Russian" : "English"}, matching the user's last message.`
        : firstValidation.reason === "hard_boundary"
          ? `${FORMAT_RETRY_HINT} The requested activity is a hard boundary. Briefly decline without naming, describing, or implying that activity.`
        : FORMAT_RETRY_HINT;
  opts.onSpeechPreview?.("");
  const retry = asReply(
    await opts.client.complete({
      messages: [
        ...opts.messages,
        { role: "user", content: hint },
      ],
      think: true,
      role: "chat",
      signal: opts.signal,
      onSpeechPreview,
      cloudMessages: opts.cloudMessages ? [...opts.cloudMessages, { role: "user", content: hint }] : undefined,
    }),
  );
  opts.signal?.throwIfAborted();
  calls += 1;
  const retryValidation = validateSoulSpeech(rawForSpeechValidation(retry), {
    recent: opts.recent,
    expectedLanguage: language,
    forbiddenSubjects: opts.forbiddenSubjects,
  });
  if (retryValidation.ok && retryValidation.text) {
    return {
      speech: retryValidation.text,
      delivery: retry.delivery,
      raw: retry.text,
      think: retry.think,
      fallback: false,
      calls,
      firstAttemptValid: false,
      firstAttemptReason: firstValidation.reason,
      retryUsed: true,
      finalValidation: "retry_ok",
      repetitionScore: repeatScore(retryValidation.text, opts.recent),
      latencyMs: Date.now() - started,
    };
  }
  const fallback = fallbackSoulSpeech(opts.bible, language);
  opts.onSpeechPreview?.("");
  return {
    speech: fallback,
    raw: fallback,
    fallback: true,
    calls,
    firstAttemptValid: false,
    firstAttemptReason: firstValidation.reason,
    retryUsed: true,
    finalValidation: "fallback",
    repetitionScore: repeatScore(fallback, opts.recent),
    latencyMs: Date.now() - started,
  };
}
