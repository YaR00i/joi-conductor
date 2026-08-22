import type { CharacterBible } from "../character";
import type { MistressId } from "../mistress/types";
import { pickSoulTopics } from "./rag";
import { characterMemoryToMd, userMemoryToMd } from "./markdown";
import type { SoulChatMessage, SoulMistressState, SoulTopicFile } from "./types";
import { buildControlPromptSlice } from "./control/slice";
import { controlLiveSnapshot } from "./control/live";
import { loadControlState } from "./control/store";

export type SoulChatTurn = {
  role: "system" | "user" | "assistant";
  content: string;
};

const HISTORY_CAP = 16;

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

export function formatRetrievedTopics(topics: readonly SoulTopicFile[]): string {
  if (topics.length === 0) return "(no topic files yet)";
  return topics
    .map((t) => `### ${t.filename}\n${t.body.trim()}`)
    .join("\n\n");
}

/** Session bible is JOI JSON. Chat only needs the persona, not the conductor block. */
export function chatPersonaFromBible(bible: CharacterBible): string {
  const raw = bible.systemPrompt.trim();
  const markers = [
    "\nYou are the CONDUCTOR",
    "\nReply with ONLY one JSON",
    "\nVOICE RECIPE:",
  ];
  let cut = raw.length;
  for (const marker of markers) {
    const at = raw.indexOf(marker);
    if (at >= 0 && at < cut) cut = at;
  }
  return raw
    .slice(0, cut)
    .replace(/\bEnglish only\.?\s*/gi, "")
    .replace(/\bAlways 'you'\.?\s*/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
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

/** Free chat — bible persona + compact mistress OS + live control slices. */
export function buildChatSystemPrompt(
  bible: CharacterBible,
  state: SoulMistressState,
  retrieved: readonly SoulTopicFile[],
  userText = "",
): string {
  const emoji = bible.emojiAllowed
    ? "Emoji: at most 1–2 if they fit this mistress."
    : "No emoji.";
  const guide = bible.llmVoiceGuide?.trim() || "";
  const nicknames = bible.diminutives.slice(0, 4).join(", ");
  const mistressId = mistressIdFromBible(bible);
  const control = loadControlState(mistressId);
  const slice = buildControlPromptSlice(
    mistressId,
    control,
    controlLiveSnapshot(control),
    userText,
  );
  return [
    chatPersonaFromBible(bible),
    "",
    `You are ${bible.nameRu} in a private chat that can set real constraints and seed a session.`,
    "Spoken words only. Do not output JSON, action blocks, or markdown fences.",
    "Reply in the same language as the user's last message. Russian in → Russian out.",
    `Tone: ${bible.tone.join("; ")}.`,
    `Taboos: ${bible.taboo.filter((t) => !/finale_|BPM|edges|JSON/i.test(t)).join("; ") || "stay in character"}.`,
    nicknames ? `Nicknames if they fit: ${nicknames}.` : "",
    guide ? `Voice guide: ${guide}` : "",
    emoji,
    "",
    slice,
    "",
    "Output spoken words only. No JSON, no 示例, no examples, no rule recap.",
    "Do not repeat a line. Stop after the spoken reply.",
    "",
    "--- MEMORY.md ---",
    state.memoryMd.trim() || characterMemoryToMd(state.character),
    "",
    "--- USER.md ---",
    state.userMd.trim() || userMemoryToMd(state.user),
    "",
    "--- Retrieved topics ---",
    formatRetrievedTopics(retrieved),
    "",
    "Stay in character. Speak as her, first person. Keep replies to 1–4 short paragraphs.",
    "THIS TURN: answer his last message first. A greeting or small talk gets a short in-character reply — do not recap cage, check-in, or standing rules, and do not seed a session.",
    "Ask his name only if he asked yours.",
    "/think",
  ]
    .filter((line) => line !== "")
    .join("\n");
}

export function buildChatMessages(
  bible: CharacterBible,
  state: SoulMistressState,
  userText: string,
): SoulChatTurn[] {
  const retrieved = pickSoulTopics(state.topics, userText);
  const history = state.messages.slice(-HISTORY_CAP).map((m) => ({
    role: m.role,
    content: m.text,
  }));
  return [
    {
      role: "system",
      content: buildChatSystemPrompt(bible, state, retrieved, userText),
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
  const extra = lite
    ? "Lite mode: do not plan topic files. Leave topic_plan.actions empty."
    : "If a new lasting episode appeared, plan at most two topic actions (create or update). Filenames like first_meeting.md.";
  return [
    `You are the Soul Memory Router for ${bible.nameRu}.`,
    "Read the recent chat and rewrite memory files only when something lasting changed.",
    "You may note a control hint, but do not invent cage/denial timers — those are written by her action JSON.",
    extra,
    "Reply with ONLY one JSON object. No markdown fences.",
    "If nothing lasting changed, return {\"no_significant_change\": true}.",
    "Otherwise return:",
    JSON.stringify({
      no_significant_change: false,
      character_memory: {
        core_identity: ["short fact"],
        internal_state: {
          primary_emotion: "string",
          intensity: "n/5",
          psychological_tension: "string",
          emotional_decay_counter: 0,
        },
        cognitive_drive: {
          active_agenda: "string",
          immediate_focus: "string",
        },
        cognitive_dissonance: "None or a tension",
      },
      user_memory: {
        identity: {
          role_in_story: "string",
          known_attributes: "string",
        },
        relationship_dynamic: {
          trust_level: "string",
          dynamic_description: "string",
          unspoken_tension: "string",
        },
        preferences_and_habits: ["habit"],
        shared_milestones: ["milestone"],
      },
      topic_plan: {
        actions: [{ action: "create", filename: "topic.md", reason: "why" }],
      },
      control: { bump_id: "cage", note: "optional lasting progression note" },
    }),
    "",
    "Current MEMORY.md:",
    state.memoryMd.trim() || characterMemoryToMd(state.character),
    "",
    "Current USER.md:",
    state.userMd.trim() || userMemoryToMd(state.user),
    "",
    `Existing topic files: ${topics}`,
    "",
    "Recent chat:",
    formatSoulTranscript(state.messages, 10),
    "",
    "JSON only. No <think>, no preamble.",
    "/no_think",
  ].join("\n");
}

export function buildArchivistPrompt(
  bible: CharacterBible,
  filename: string,
  reason: string,
  previous: string,
  transcript: string,
): string {
  return [
    `You are the Archivist for ${bible.nameRu}.`,
    `Write or update the topic file ${filename}.`,
    `Reason: ${reason}`,
    "Under 300 words. Prose, not a list of quotes. No asterisks.",
    "Third person about the user, first person thoughts only if they belong in the file as her notes.",
    previous.trim()
      ? `Previous file:\n${previous.trim()}`
      : "This is a new file.",
    "",
    "Chat to distill:",
    transcript,
    "",
    "Reply with the file body only. Start with the first sentence of the file. No planning, no <think>.",
    "/no_think",
  ].join("\n");
}

export function buildDiaryPrompt(
  bible: CharacterBible,
  state: SoulMistressState,
): string {
  return [
    `Write ${bible.nameRu}'s private diary entry about the latest chat.`,
    "First person as her. The user is third person (he / the boy / his name if known).",
    "4–6 sentences. No quotation marks, no asterisks, no roleplay actions.",
    "Do not mention the JOI session queue.",
    "Same language as the chat (Russian if he wrote Russian).",
    "",
    "MEMORY.md:",
    characterMemoryToMd(state.character),
    "",
    "Recent chat:",
    formatSoulTranscript(state.messages, 8),
    "",
    "Reply with the diary text only. Start immediately with her first diary sentence.",
    "No 'okay let's see', no restating these rules, no <think>.",
    "/no_think",
  ].join("\n");
}

/** Second pass: speech already happened; pull typed orders without mixing them into the bubble. */
export function buildControlExtractPrompt(
  bible: CharacterBible,
  userText: string,
  speech: string,
): string {
  return [
    `Extract control actions for ${bible.nameRu} after she already spoke.`,
    "Reply with ONLY one JSON object. No speech, no markdown fences, no <think>.",
    'Default: {"actions":[]}',
    "Use the field op, never id, for the action name.",
    "ops: set_wear, clear_wear, set_denial, clear_denial, clear_checkin, set_clothing, clear_clothing, bump_progression, note_trigger, patch_queue.",
    "set_wear needs kind cage|plug and hours.",
    "Do not emit propose_session or set_checkin — the app offers sessions and morning reports as chat commands.",
    "If the user refused a session, return {\"actions\":[]}. Punishment is already a contract chip.",
    "If she did not issue a new timer, clothing, or denial, return {\"actions\":[]}.",
    "",
    `User: ${userText.trim()}`,
    `Her spoken reply: ${speech.trim()}`,
    "",
    "JSON only.",
    "/no_think",
  ].join("\n");
}
