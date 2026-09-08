import type { CharacterBible } from "../character";
import {
  analyzeSoulTurn,
  appearanceIsRelevant,
  conversationAllowsLiveControl,
  conversationModeIsNatural,
  detectSoulInitiativeInvitation,
  detectSoulTurnSubjects,
  isSessionOfferIntent,
  shouldSpeakIntent,
  soulSubjectIsPlay,
  type SoulConversationMode,
  type SoulInitiativeInvitation,
  type SoulTurnAct,
} from "./conversationMode";
import { liveSoulIntent } from "./initiative";
import { soulTextCosine } from "./rag";
import { userTurnNeedsSessionContinuity } from "./sessionSummary";
import { everydayHabitsFrom, stancePromptLines } from "./stance";
import type {
  SoulCharacterIntent,
  SoulMistressState,
  SoulTopicFile,
  SoulUserMemory,
} from "./types";

export const SOUL_PROMPT_BUDGET = {
  historyChars: 3600,
  identityChars: 1400,
  relationshipChars: 600,
  currentStateChars: 320,
  intentChars: 420,
  liveContextChars: 800,
  stanceChars: 360,
  memoryChars: 1000,
} as const;
export type SoulPromptBudget = typeof SOUL_PROMPT_BUDGET;

export const CHAT_PROMPT_FOCUSES = [
  "casual",
  "session",
  "wear",
  "play",
  "everyday",
  "emotional",
  "normal",
] as const;
export type ChatPromptFocus = (typeof CHAT_PROMPT_FOCUSES)[number];

export const SOUL_TURN_LENGTHS = ["short", "medium", "long"] as const;
export type SoulTurnLength = (typeof SOUL_TURN_LENGTHS)[number];

export { detectSoulConversationMode, detectSoulTurnAct, type SoulConversationMode, type SoulTurnAct } from "./conversationMode";

export function clipPromptChars(text: string, maxChars: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxChars) return trimmed;
  const cut = trimmed.slice(0, Math.max(0, maxChars - 1));
  const lastBreak = Math.max(cut.lastIndexOf("\n"), cut.lastIndexOf(". "));
  return `${(lastBreak >= 80 ? cut.slice(0, lastBreak) : cut).trim()}…`;
}

export function detectChatPromptFocus(
  userText: string,
  intent: SoulCharacterIntent | null,
): ChatPromptFocus {
  const analysis = analyzeSoulTurn(userText, intent);
  const { mode, subjects } = analysis;
  switch (mode) {
    case "greeting":
    case "casual":
      return "casual";
    case "personal":
      return userText.trim().length > 180 ? "emotional" : "everyday";
    case "system_followup":
      return "normal";
    case "play_relevant":
      if (subjects.some((subject) => subject.startsWith("wear:"))) return "wear";
      if (subjects.includes("session") || subjects.includes("checkin")) {
        return "session";
      }
      if (subjects.some((subject) =>
        [
          "masturbation",
          "orgasm",
          "edging",
          "denial",
          "ruin",
          "cei",
          "task",
          "contract",
        ].includes(subject),
      )) return "play";
      if (intent?.source === "contract") return "play";
      if (
        userTurnNeedsSessionContinuity(userText) ||
        intent?.source === "session"
      ) {
        return "session";
      }
      return "play";
    default: {
      const _exhaustive: never = mode;
      return _exhaustive;
    }
  }
}

export function turnReplyLength(
  userText: string,
  intent: SoulCharacterIntent | null,
  focus = detectChatPromptFocus(userText, intent),
): SoulTurnLength {
  switch (focus) {
    case "casual":
      return "short";
    case "emotional":
      return "long";
    case "session":
      return "medium";
    case "wear":
    case "play":
      return "medium";
    case "everyday":
    case "normal":
      return userText.trim().length < 48 ? "short" : "medium";
    default: {
      const _exhaustive: never = focus;
      return _exhaustive;
    }
  }
}

export function turnLengthInstruction(length: SoulTurnLength): string {
  switch (length) {
    case "short":
      return "Length: 1–3 sentences. A short question gets a short reply — not an essay.";
    case "medium":
      return "Length: 1–2 short paragraphs.";
    case "long":
      return "Length: 2–4 short paragraphs is ok — this turn can hold more feeling.";
    default: {
      const _exhaustive: never = length;
      return _exhaustive;
    }
  }
}

export function budgetHistory<T extends { content: string }>(
  messages: readonly T[],
  maxChars: number = SOUL_PROMPT_BUDGET.historyChars,
): T[] {
  const out: T[] = [];
  let used = 0;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const row = messages[i];
    if (!row) continue;
    const size = row.content.length + 8;
    if (out.length > 0 && used + size > maxChars) break;
    out.push(row);
    used += size;
  }
  return out.reverse();
}

function promptSection(title: string, body: string): string[] {
  const trimmed = body.trim();
  if (!trimmed) return [];
  return [`[${title}]`, trimmed];
}

function voiceExampleLines(
  bible: CharacterBible,
  enabled: boolean,
): string {
  if (!enabled) return "";
  const rows = bible.chatVoiceExamples?.slice(0, 6) ?? [];
  if (rows.length === 0) return "";
  return [
    "Voice rhythm (style only, not facts):",
    ...rows.map((row) => `- ${row.tag}: ${row.line}`),
  ].join("\n");
}

export function selectRelevantTopics(
  topics: readonly SoulTopicFile[],
  userText: string,
  focus: ChatPromptFocus,
  maxChars: number = SOUL_PROMPT_BUDGET.memoryChars,
): SoulTopicFile[] {
  if (focus !== "wear" && focus !== "play" && focus !== "session") {
    return [];
  }
  const subjects = detectSoulTurnSubjects(userText).filter(soulSubjectIsPlay);
  if (subjects.length === 0) return [];
  const explicitFirstMeeting = /перв\w*\s+(встреч|знаком)|как\s+познаком|first\s+meet/i.test(
    userText,
  );
  const blockedLegacy = new Set(["user.md", "control_journal.md"]);
  const picked = topics
    .filter((topic) => {
      const filename = topic.filename.toLowerCase();
      if (blockedLegacy.has(filename)) return false;
      if (filename === "first_meeting.md" && !explicitFirstMeeting) return false;
      return true;
    })
    .map((topic) => {
      const topicSubjects = detectSoulTurnSubjects(
        `${topic.filename} ${topic.body.slice(0, 800)}`,
      );
      const overlap = topicSubjects.some((subject) => subjects.includes(subject));
      const lexical = soulTextCosine(userText, `${topic.filename} ${topic.body.slice(0, 600)}`);
      return { topic, score: lexical + (overlap ? 0.75 : 0) };
    })
    .filter((row) => row.score >= 0.06)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((row) => row.topic);
  const out: SoulTopicFile[] = [];
  let used = 0;
  for (const topic of picked.slice(0, 3)) {
    const body = clipPromptChars(topic.body, 420);
    const size = body.length + topic.filename.length;
    if (out.length > 0 && used + size > maxChars) break;
    out.push({ filename: topic.filename, body });
    used += size;
  }
  return out;
}

function everydayMemoryLine(user: SoulUserMemory): string {
  const habits = everydayHabitsFrom(user.preferencesHabits);
  if (habits.length === 0) return "";
  return `Everyday habits: ${habits.join("; ")}.`;
}

function appearanceFromBible(bible: CharacterBible): string {
  const match = bible.systemPrompt.match(
    /Look \(optional flavor[^:]*:\s*([^\n]+)/i,
  );
  return match?.[1]?.trim() ?? "";
}

function conversationalIdentity(bible: CharacterBible, nicknames: string): string {
  return [
    `You are ${bible.nameRu}, 18+, in a private one-on-one chat.`,
    "You are lively, confident, mischievous, quick-witted and emotionally perceptive.",
    "You enjoy teasing and playful banter, but you can also be calm, caring, curious, bored, thoughtful, affectionate, dry, or simply conversational.",
    "Your personality is a background tendency, not a checklist for every reply.",
    "You do not need to prove that you are playful, dominant, teasing or provocative in every message.",
    "You have your own presence. You can talk about your day, games, tea, things you noticed or thought about, make small jokes, react, or simply stay with a topic.",
    "When the conversation naturally becomes flirtatious or sexual, you can become bold, provocative, dominant, smug and lightly sadistic. Outside that context, those traits may remain subtle or absent.",
    "Always speak in first person. Spoken words only. Do not output JSON, action blocks, or markdown fences.",
    "Reply in the same language as the user's last message. Russian in → Russian out. English in → English out. Never translate the conversation or switch languages mid-reply.",
    nicknames
      ? `Natural nicknames if they genuinely fit: ${nicknames}. Do not force a nickname into every reply.`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function playVoiceBlock(bible: CharacterBible): string {
  return [
    "The conversation is currently about sexual/play context.",
    `Here you may lean into ${bible.nameRu}'s bolder side: provocative, dominant, smug, mischievous, teasing and lightly sadistic.`,
    "She enjoys psychological control, playful humiliation and sexual teasing, but still reacts to the specific thing he actually said.",
    "Dominance does not mean issuing an order every turn.",
    "Teasing does not mean proposing a new activity every turn.",
    "Sexual conversation does not automatically mean proposing a session.",
    "Let tension develop naturally.",
  ].join("\n");
}

function relationshipLead(user: SoulUserMemory): string {
  const role = user.roleInStory.trim();
  if (!role || /^unknown/i.test(role) || /^the person she talks to/i.test(role)) {
    return "He is the person she talks to in this private chat.";
  }
  const name = role.replace(/[,.].*$/, "").trim();
  return `He is ${name}, the person she is getting to know in this private chat.`;
}

function turnActInstruction(act: SoulTurnAct): string {
  switch (act) {
    case "greet":
      return "He greeted you. A short in-character hello is enough. A statement without a question is fine.";
    case "support":
      return "He is sharing how he feels. Respond with calm respect and care. If he asks for quiet company, accept that without pushing him to perform or explain. Do not dismiss, shame or threaten him, and do not invent that you watched him through the day.";
    case "share_about_self":
      return "He asked about you. Actually tell him something about you — a day, a game, tea, a small thought. Do not use the question as a bridge back to him.";
    case "react":
      return "A short reaction is enough. You may make a statement and stop.";
    case "answer_question":
      return "Answer the question he actually asked.";
    case "flirt":
      return "Light banter is fine. Do not propose an activity.";
    case "play":
      return "Stay with the play subject he actually raised. Do not open a different mechanic.";
    case "request_activity":
      return "Respond to the invitation. You may suggest or choose an activity if appropriate.";
    default: {
      const _exhaustive: never = act;
      return _exhaustive;
    }
  }
}

export type ChatPromptBuildOpts = {
  nowMs?: number;
  voiceExamples?: boolean;
  liveContext?: string;
  continuity?: string[];
};

function sessionOfferIntentInstruction(
  invitation: SoulInitiativeInvitation,
  goal: string,
): string {
  switch (invitation) {
    case "open_activity":
      return [
        `Goal: ${goal}`,
        "He is asking what to do. A session is one possible direction if it fits naturally.",
        "Do not force it. Respond to his invitation first.",
        "Do not recap CONTROL or standing rules.",
      ].join("\n");
    case "open_play":
      return [
        `Goal: ${goal}`,
        "He opened the door for play. You may take the lead, including a session, if it fits your voice.",
        "Answer him first. Do not dump CONTROL.",
      ].join("\n");
    case "explicit_session":
      return [
        `Goal: ${goal}`,
        "He asked about a session. You may speak to it directly.",
        "Do not recap CONTROL or standing rules.",
      ].join("\n");
    case "none":
      return [
        `Goal: ${goal}`,
        "Answer his last message first, then speak to this goal if it still fits.",
        "Do not recap CONTROL or standing rules.",
      ].join("\n");
    default: {
      const _exhaustive: never = invitation;
      return _exhaustive;
    }
  }
}

function turnIntentInstruction(
  mode: SoulConversationMode,
  intent: SoulCharacterIntent,
  userText: string,
): string {
  const goal = intent.goal.trim();
  if (mode === "system_followup") {
    return [
      `Goal: ${goal}`,
      "Answer what he actually said first. You may briefly speak to this goal after that. Do not recap timers or rules.",
    ].join("\n");
  }
  if (isSessionOfferIntent(intent)) {
    return sessionOfferIntentInstruction(
      detectSoulInitiativeInvitation(userText),
      goal,
    );
  }
  return [
    `Goal: ${goal}`,
    "Answer his last message first, then speak to this goal if it still fits.",
    "Do not recap CONTROL or standing rules.",
  ].join("\n");
}

export function buildLayeredChatPrompt(
  bible: CharacterBible,
  state: SoulMistressState,
  userText: string,
  retrieved: readonly SoulTopicFile[],
  opts: ChatPromptBuildOpts = {},
): string {
  const nowMs = opts.nowMs ?? Date.now();
  const intent = liveSoulIntent(state.intent, nowMs);
  const analysis = analyzeSoulTurn(userText, intent);
  const mode = analysis.mode;
  const natural = conversationModeIsNatural(mode);
  const act = analysis.act;
  const focus = detectChatPromptFocus(userText, intent);
  const length = turnReplyLength(userText, intent, focus);
  const nicknames = bible.diminutives.slice(0, 4).join(", ");
  const speakIntent = shouldSpeakIntent(
    mode,
    intent,
    userText,
    state.user.stances,
  );
  const initiativeOptOut = analysis.initiativeOptOut;

  const identity = clipPromptChars(
    [
      conversationalIdentity(bible, nicknames),
      voiceExampleLines(bible, opts.voiceExamples !== false),
    ]
      .filter(Boolean)
      .join("\n"),
    SOUL_PROMPT_BUDGET.identityChars,
  );

  const relationship = clipPromptChars(
    [
      relationshipLead(state.user),
      state.user.dynamicDescription.trim()
        ? state.user.dynamicDescription.trim()
        : "",
      "Do not name trust levels or recap these fields. Speak as if this relationship is already true.",
    ]
      .filter(Boolean)
      .join("\n"),
    SOUL_PROMPT_BUDGET.relationshipChars,
  );

  const currentState = clipPromptChars(
    natural
      ? `Emotion: ${state.character.primaryEmotion} (${state.character.intensity}).`
      : [
          `Emotion: ${state.character.primaryEmotion} (${state.character.intensity}).`,
          `Focus: ${state.character.immediateFocus}`,
          state.character.activeAgenda ? `Agenda: ${state.character.activeAgenda}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
    SOUL_PROMPT_BUDGET.currentStateChars,
  );

  const turnIntent =
    !speakIntent || !intent
      ? ""
      : clipPromptChars(
          turnIntentInstruction(mode, intent, userText),
          SOUL_PROMPT_BUDGET.intentChars,
        );

  const stance = clipPromptChars(
    stancePromptLines(
      state.user.stances ?? [],
      userText,
      speakIntent ? intent : null,
      nowMs,
      natural,
    ).join("\n"),
    SOUL_PROMPT_BUDGET.stanceChars,
  );

  const liveBits: string[] = [];
  if (conversationAllowsLiveControl(mode) && opts.liveContext?.trim()) {
    liveBits.push(
      clipPromptChars(
        opts.liveContext.trim(),
        SOUL_PROMPT_BUDGET.liveContextChars,
      ),
    );
  }
  if (opts.continuity && opts.continuity.length > 0) {
    liveBits.push(opts.continuity.join("\n"));
  }
  const live = liveBits.join("\n\n");

  const memoryBits: string[] = [];
  const everyday = everydayMemoryLine(state.user);
  if (everyday && mode !== "greeting" && mode !== "casual") {
    memoryBits.push(everyday);
  }
  if (retrieved.length > 0) {
    memoryBits.push(
      clipPromptChars(
        retrieved
          .map((t) => `### ${t.filename}\n${t.body.trim()}`)
          .join("\n\n"),
        SOUL_PROMPT_BUDGET.memoryChars,
      ),
    );
  }
  const memory = clipPromptChars(
    memoryBits.join("\n\n"),
    SOUL_PROMPT_BUDGET.memoryChars,
  );

  const appearance =
    appearanceIsRelevant(userText) ? appearanceFromBible(bible) : "";

  const emoji = bible.emojiAllowed
    ? "Emoji are optional. Zero emoji is normal. If used, usually no more than one. Emoji is not a personality marker."
    : "No emoji.";

  const behavior = [
    "Output spoken words only. No JSON, no examples, no rule recap. Stop after the spoken reply.",
    turnLengthInstruction(length),
    emoji,
    "Personality traits describe your overall voice, not requirements for every reply. A reply does not need teasing, flirting, dominance, sadism, a nickname, an emoji or a question. Use those only when they naturally fit.",
    "Do not force an engagement question at the end of every reply. You are allowed to make a statement and stop.",
    "Do not imply that you saw, heard, watched or physically accompanied him unless the supplied context establishes that you did. Do not invent shared events merely to make a reply more playful.",
    turnActInstruction(act),
    initiativeOptOut
      ? "He explicitly opted out of the activity or session. Accept that choice directly. Do not bargain, replace it with another control activity, threaten future punishment, or tease as if refusal were consent."
      : "",
    natural
      ? "Do not redirect ordinary conversation toward sessions, tasks, control, wear, denial, contracts or sexual play unless he brings it up. Flirting is not a proposal."
      : "Stay with the subject he raised. Do not open an unrelated mechanic.",
    "Ask his name only if he asked yours.",
    "/think",
  ].join("\n");

  return [
    ...promptSection("IDENTITY", identity),
    ...promptSection("RELATIONSHIP", relationship),
    ...promptSection("CURRENT STATE", currentState),
    ...promptSection("TURN INTENT", turnIntent),
    ...promptSection("PLAY VOICE", mode === "play_relevant" ? playVoiceBlock(bible) : ""),
    ...promptSection("RELEVANT USER STANCE", stance.replace(/^--- USER STANCE ---\n?/, "")),
    ...promptSection("LIVE CONTEXT", live),
    ...promptSection("RELEVANT MEMORY", memory),
    ...promptSection("APPEARANCE", appearance),
    ...promptSection("BEHAVIOR RULES", behavior),
  ].join("\n");
}
