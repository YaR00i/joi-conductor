import type { CharacterBible } from "../character";
import type { MistressId } from "../mistress/types";
import {
  analyzeSoulTurn,
  conversationAllowsLiveControl,
  detectSoulConversationMode,
  shouldSpeakIntent,
  type SoulCanonicalSubject,
} from "./conversationMode";
import {
  budgetHistory,
  buildLayeredChatPrompt,
  detectChatPromptFocus,
  selectRelevantTopics,
} from "./promptContext";
import type { SoulChatMessage, SoulMistressState, SoulTopicFile } from "./types";
import {
  buildControlPromptSlice,
} from "./control/slice";
import { controlLiveSnapshot } from "./control/live";
import { loadControlState } from "./control/store";
import { liveSoulIntent } from "./initiative";
import {
  lastSoulSessionEvent,
  stripSoulInternalIds,
  userTurnNeedsSessionContinuity,
} from "./sessionSummary";
import { characterMemoryToMd, userMemoryToPromptMd } from "./markdown";


export type SoulChatTurn = {
  role: "system" | "user" | "assistant";
  content: string;
};

export function formatSoulTranscript(
  messages: readonly SoulChatMessage[],
  max = 8,
): string {
  return messages
    .slice(-max)
    .map((m) => {
      const who = m.role === "user" ? "User" : "Character";
      return `${who}: ${m.text}`;
    })
    .join("\n");
}

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

function continuityPromptLines(
  state: SoulMistressState,
  userText: string,
  mode: ReturnType<typeof detectSoulConversationMode>,
): string[] {
  if (!conversationAllowsLiveControl(mode)) return [];
  if (!userTurnNeedsSessionContinuity(userText)) return [];
  const event = lastSoulSessionEvent(state);
  if (!event) return [];
  const fact = stripSoulInternalIds(event.summary);
  if (!fact) return [];
  return [
    "--- RECENT CONTINUITY ---",
    "Last meaningful session:",
    fact,
    "Use only if he is talking about it. Do not recap unprompted. Do not mention internal ids.",
  ];
}

function intentSubject(source: NonNullable<SoulMistressState["intent"]>["source"]): SoulCanonicalSubject | null {
  switch (source) {
    case "session":
      return "session";
    case "checkin":
      return "checkin";
    case "contract":
      return "contract";
    case "conversation":
    case "relationship":
    case "system":
      return null;
    default: {
      const _exhaustive: never = source;
      return _exhaustive;
    }
  }
}

export type BuildChatPromptOpts = {
  nowMs?: number;
  voiceExamples?: boolean;
};

/** Free chat — layered persona, relevant live context, no state carpet. */
export function buildChatSystemPrompt(
  bible: CharacterBible,
  state: SoulMistressState,
  retrieved: readonly SoulTopicFile[],
  userText = "",
  opts: BuildChatPromptOpts = {},
): string {
  const nowMs = opts.nowMs ?? Date.now();
  const intent = liveSoulIntent(state.intent, nowMs);
  const analysis = analyzeSoulTurn(userText, intent);
  const mode = analysis.mode;
  const subjects = [...analysis.subjects];
  if (intent && shouldSpeakIntent(mode, intent, userText, state.user.stances)) {
    const subject = intentSubject(intent.source);
    if (subject && !subjects.includes(subject)) subjects.push(subject);
  }
  const mistressId = mistressIdFromBible(bible);
  const control = loadControlState(mistressId);
  const liveContext =
    !conversationAllowsLiveControl(mode) || subjects.length === 0
      ? ""
      : buildControlPromptSlice(
          mistressId,
          control,
          controlLiveSnapshot(control, nowMs),
          userText,
          subjects,
        );
  return buildLayeredChatPrompt(bible, state, userText, retrieved, {
    nowMs,
    voiceExamples: opts.voiceExamples,
    liveContext,
    continuity: continuityPromptLines(state, userText, mode),
  });
}

export function buildChatMessages(
  bible: CharacterBible,
  state: SoulMistressState,
  userText: string,
  opts: BuildChatPromptOpts = {},
): SoulChatTurn[] {
  const focus = detectChatPromptFocus(
    userText,
    liveSoulIntent(state.intent, opts.nowMs ?? Date.now()),
  );
  const retrieved = selectRelevantTopics(state.topics, userText, focus);
  const history = budgetHistory(
    state.messages.map((m) => ({
      role: m.role,
      content: m.text,
    })),
  );
  return [
    {
      role: "system",
      content: buildChatSystemPrompt(bible, state, retrieved, userText, opts),
    },
    ...history,
  ];
}

export function buildRouterPrompt(
  bible: CharacterBible,
  state: SoulMistressState,
  lite: boolean,
): string {
  const topics = state.topics.map((t) => t.filename).join(", ") || "(none)";
  const wantsTopics = state.mode === 0 && !lite;
  const wantsDiary = state.mode === 0 || state.mode === 1 || state.mode === 3;
  const extra = wantsTopics
    ? "If a new lasting episode appeared, write at most two topic actions (create or update). Include the complete body under 300 words. Filenames like first_meeting.md."
    : "Do not write topic files. Leave topic_plan.actions empty.";
  const diaryRule = wantsDiary
    ? `Also include diary_entry: ${bible.nameRu}'s private 4–6 sentence diary note about this chat, first person, same language as the chat, without quotes or roleplay actions.`
    : "Set diary_entry to an empty string.";
  const memoryRule = state.mode === 3
    ? "Diary-only mode: do not alter character_memory, user_memory, or stances."
    : "Update structured memory only when the conversation supports a lasting change.";
  return [
    "You are a state update classifier.",
    "Read the recent conversation and return only the requested structured update.",
    "Do not roleplay.",
    "Do not answer the user.",
    "Do not explain your reasoning.",
    "Do not add markdown fences.",
    "Do not invent facts not supported by the conversation.",
    `Memory files belong to ${bible.nameRu}.`,
    "Prefer skipping an uncertain inference over inventing stance, hard boundaries, relationship, milestones, or known attributes.",
    "A direct 'remember this' statement with a durable everyday fact is significant and must update user_memory.",
    "A direct statement that something is a hard boundary is significant and must create a hard_boundary stance_update.",
    "Never update Control, timers, contracts, session plans, or app state. This role writes Soul memory only.",
    extra,
    diaryRule,
    memoryRule,
    "If he stated a lasting play preference or hard boundary, add at most two stance_updates. Use only facts from this chat. valid kind: hard_boundary, liked, disliked_once, often_refuses, struggles_with, curious_about, responds_well_to. explicit true only for a direct statement. Do not invent stance from a single vague vibe.",
    "preferences_and_habits is everyday life only: coffee, work hours, games, drawing, short replies. Never put JOI/play mechanics, session kinds, contract/quest preferences, fetishes, refusals, or boundaries there, and do not restate stance in words. Those belong only in stance_updates.",
    "Reply with ONLY one JSON object. No markdown fences.",
    "Return a delta, not a copy of Current MEMORY/USER. Omit unchanged fields.",
    "Allowed top-level keys only: no_significant_change, character_memory, user_memory, stance_updates, topic_plan, diary_entry.",
    'Everyday habit example: {"user_memory":{"preferences_and_habits":["drinks tea at night"]},"topic_plan":{"actions":[]},"diary_entry":""}',
    'Stance example: {"stance_updates":[{"subject":"edges","kind":"liked","evidence":"he explicitly said he likes edging","explicit":true}],"topic_plan":{"actions":[]},"diary_entry":""}',
    'Topic action shape: {"action":"create","filename":"topic.md","reason":"why this episode is lasting","body":"complete topic body"}',
    "character_memory and user_memory may contain only the nested fields that actually changed.",
    "",
    "Current MEMORY.md:",
    state.memoryMd.trim() || characterMemoryToMd(state.character),
    "",
    "Current USER.md:",
    userMemoryToPromptMd(state.user),
    "",
    `Existing topic files: ${topics}`,
    "",
    "Recent chat:",
    formatSoulTranscript(state.messages, 10),
    "",
    "Decision gate for the recent chat above:",
    "- explicit durable fact or 'remember this' → write the smallest matching delta; do not return no_significant_change",
    "- explicit hard boundary → write stance_updates; do not put it in preferences_and_habits",
    wantsTopics
      ? "- explicitly important lasting episode → write one complete topic action"
      : "- topic actions are disabled in this memory mode",
    wantsDiary
      ? "- diary is enabled: write diary_entry about this batch"
      : "- diary is disabled: omit diary_entry or use an empty string",
    '- only when none of these applies, return {"no_significant_change":true}',
    "",
    "JSON only. No <think>, no preamble.",
    "/no_think",
  ].join("\n");
}

/** Second pass: speech already happened; pull typed proposals without mixing them into the bubble. */
export function buildControlExtractPrompt(
  bible: CharacterBible,
  userText: string,
  speech: string,
): string {
  return [
    "Return structured proposals only.",
    "Do not rewrite the speech.",
    "Do not roleplay.",
    "Do not infer an action merely because it would fit the character.",
    "Extract only what she actually said.",
    "Character intent is not a spoken proposal.",
    "If she did not clearly propose/order anything, return an empty proposal list.",
    `Speaker: ${bible.nameRu}. She already spoke; do not answer the user.`,
    "Reply with ONLY one JSON object. No speech, no markdown fences, no <think>.",
    'Default: {"proposals":[]}',
    "Use the field op. Allowed ops only: set_wear, set_denial, propose_session, propose_task, set_checkin.",
    'Exact wear example: {"proposals":[{"op":"set_wear","kind":"cage","hours":3}]}',
    'Never replace op with kind. Invalid: {"proposals":[{"kind":"cage","hours":3}]}',
    "set_wear needs kind cage|plug and hours. set_denial needs hours and optional edges.",
    "propose_session kind must be one of: edges, hump, dildo_sit, one_stroke_one_hit, cage_vibe, slow_tease, clit_tease, oral, plug, day_drips, prone, phantom.",
    "If she explicitly proposes a session but gives no subtype, use slow_tease; do not drop the proposal for missing details.",
    'Exact session example for «Я предлагаю тебе сессию на пять минут»: {"proposals":[{"op":"propose_session","kind":"slow_tease","durationSec":300,"edgesTarget":0,"finalePolicy":"ruin_norm"}]}',
    "propose_task has no defId — the app picks a catalog task. Do not invent contracts.",
    "set_checkin needs kind morning|hours|when_told and optional hours/note.",
    "Do not emit any other op. Do not create a new contract def.",
    "If the user refused a session, return {\"proposals\":[]}.",
    "If she did not issue a new timer, session, task, or check-in, return {\"proposals\":[]}.",
    "",
    `User: ${userText.trim()}`,
    `Her spoken reply: ${speech.trim()}`,
    "",
    "JSON only.",
    "/no_think",
  ].join("\n");
}

export const STRUCTURED_JSON_REPAIR_HINT =
  "Your previous output was invalid. Return ONLY one valid JSON object matching the schema. No prose. No markdown.";
