import { hasHardBoundaryOn } from "./stance";
import type {
  SoulCharacterIntent,
  SoulIntentSource,
  UserStance,
} from "./types";

export const SOUL_CONVERSATION_MODES = [
  "greeting",
  "casual",
  "personal",
  "play_relevant",
  "system_followup",
] as const;
export type SoulConversationMode = (typeof SOUL_CONVERSATION_MODES)[number];

export const SOUL_TURN_ACTS = [
  "greet",
  "answer_question",
  "support",
  "share_about_self",
  "react",
  "flirt",
  "play",
  "request_activity",
] as const;
export type SoulTurnAct = (typeof SOUL_TURN_ACTS)[number];

export const SOUL_TURN_SUBJECTS = [
  "none",
  "wear",
  "session",
  "contract",
  "checkin",
  "play",
] as const;
export type SoulTurnSubject = (typeof SOUL_TURN_SUBJECTS)[number];

export const SOUL_CANONICAL_SUBJECTS = [
  "session",
  "masturbation",
  "orgasm",
  "edging",
  "wear:cage",
  "wear:plug",
  "denial",
  "ruin",
  "cei",
  "checkin",
  "task",
  "contract",
  "appearance",
  "clothing",
  "work",
  "games",
  "mood",
] as const;
export type SoulCanonicalSubject = (typeof SOUL_CANONICAL_SUBJECTS)[number];

export const SOUL_INITIATIVE_INVITATIONS = [
  "none",
  "open_activity",
  "open_play",
  "explicit_session",
] as const;
export type SoulInitiativeInvitation =
  (typeof SOUL_INITIATIVE_INVITATIONS)[number];

/** Numeric floor only. Casual/personal also need a semantic urgent source. */
export const SOUL_INTENT_INTERRUPT_PRIORITY = 4;

const CASUAL_OPENER =
  /^(привет|здравствуйте?|хай|ку|йоу|йо|hello|hi|hey|доброе\s+утро|добрый\s+день|добрый\s+вечер)(?=$|[\s,.!?…])/i;

export function isCasualOpener(text: string): boolean {
  const trimmed = text.trim().toLowerCase();
  if (!trimmed || trimmed.length > 48) return false;
  return CASUAL_OPENER.test(trimmed);
}

const PERSONAL_RE =
  /(работ|игр|кофе|чай|рис|фильм|музык|устал|учёб|учеба|погод|дедлайн|начальн|длинн|настроен)/i;
const ABOUT_HER_RE =
  /(чем\s+(ты\s+)?(занимал|делал)|а\s+ты\??|расскажи\s+о\s+себе|как\s+прошёл\s+(твой\s+)?день|what\s+did\s+you|how\s+was\s+your|что.?нибудь интересн|интересное было)/i;
const SMALL_TALK_RE =
  /^(как\s+(ты|дела|жизнь|настроение)|что\s+делаешь|скучно|how\s+are\s+you|what'?s\s+up|ок|ok|норм)[\s?!.…]*$/i;
const SUPPORT_RE =
  /(устал|тяжёл|плохо|тревожн|длинн|добил|выжат|после работы)/i;
const REACT_RE =
  /^(хм|ну|ладно|ок|ok|понял|звучит|неплохо|хорошо|ага|угу)([\s,.!?…].*)?$/i;
const APPEARANCE_RE =
  /(внешн|выгляд|одежд|наряд|фото|волос|глаз|фигур|груд|ног[иаеу]|фут|что на тебе|как ты выгляд|образ|outfit|body|hair|chest)/i;
const INITIATIVE_OPT_OUT_RE =
  /(просто\s+хочу\s+(?:немного\s+)?(поболтать|поговорить)|не\s+хочу\s+ничего\s+делать|давай\s+без\s+игр|без\s+игр\s+сегодня|просто\s+посиди|просто\s+посидим|не\s+хочу\s+(играть|сесс)|если\s+предлож[а-яё]*\s+сесс[а-яё]*.{0,12}нет(?:[\s.!?…]|$))/i;
const NOT_ACTIVITY_INVITE_RE =
  /(что\s+думаешь|как\s+ты\??(?:\s|$)|как\s+дела)/i;
const EXPLICIT_SESSION_INVITE_RE =
  /(давай\s+(твою\s+)?сесс|хочу\s+(твою\s+)?сесс|что\s+по\s+сесс|начинаем\s+сесс|запусти(ай)?\s+сесс|провед(ём|ем)\s+сесс)/i;
const OPEN_PLAY_RE =
  /(весь\s+твой|можешь\s+мной\s+покоманд|покомандуй\s+мной|хочу\s+поиграть|давай\s+поиграем|давай\s+поиграть|решай\s+сама|сделай\s+со\s+мной|я\s+в\s+твоих\s+руках|командуй|хочу\s+(подроч|мастурбир|кончить|кончать|эджить|эджиться))/i;
const OPEN_ACTIVITY_RE =
  /(чем\s+займ|что\s+будем\s+делать|чем\s+будем\s+занима|придумай(\s+что[-\s]?нибудь)?|есть\s+идеи|идеи\s+на\s+вечер|мне\s+скучно|^скучно[\s?!.…]*$|ничего\s+не\s+планир|не\s+планировал)/i;

const SUBJECT_RULES: ReadonlyArray<{
  subject: SoulCanonicalSubject;
  re: RegExp;
}> = [
  { subject: "session", re: /сесси[яиюе]|\bsession\b/i },
  { subject: "masturbation", re: /дроч|мастурб|\bjerk(?:ing)?\b|\bmasturbat/i },
  { subject: "orgasm", re: /конч|оргазм|\bcum\b|\borgasm/i },
  { subject: "edging", re: /эдж|\bedg(?:e|ing|es)\b/i },
  { subject: "wear:cage", re: /клетк|пояс\s+верност|\bcage\b|\bchastity\b/i },
  { subject: "wear:plug", re: /пробк|\bplug\b/i },
  {
    subject: "denial",
    re: /денайл|(?:в|на)\s+отказе|отказ\s+(?:от\s+)?(?:оргазм|конч)|запрет\w*\s+конч|\bdenial\b|\bdeny\b/i,
  },
  { subject: "ruin", re: /руин|испорчен\w*\s+оргазм|\bruin(?:ed)?\b/i },
  { subject: "cei", re: /\bcei\b|съе(?:сть|м)\s+(?:свою\s+)?сперм|лиз(?:нуть|ать)\s+сперм/i },
  { subject: "checkin", re: /check-?in|отч[её]т|отчита/i },
  { subject: "task", re: /задани|квест|\btask\b|\bquest\b/i },
  { subject: "contract", re: /контракт|\bcontract\b/i },
  { subject: "appearance", re: APPEARANCE_RE },
  { subject: "clothing", re: /одежд|наряд|что\s+на\s+тебе|\boutfit\b|\bclothes?\b/i },
  { subject: "work", re: /работ|дедлайн|начальн|\bwork\b|\bjob\b/i },
  { subject: "games", re: /игр(?:а|ы|ал|ала|аю|аешь)|гейм|\bgam(?:e|es|ing)\b/i },
  { subject: "mood", re: /настроен|как\s+ты|как\s+дела|\bmood\b/i },
];

const PLAY_SUBJECTS = new Set<SoulCanonicalSubject>([
  "session",
  "masturbation",
  "orgasm",
  "edging",
  "wear:cage",
  "wear:plug",
  "denial",
  "ruin",
  "cei",
  "checkin",
  "task",
  "contract",
]);

const SUBJECT_OPT_OUT_RE =
  /(?:не\s+хочу|не\s+буду|не\s+надо|без|не\s+предлагай)(?:\s+мне)?\s+(?:дроч|мастурб|конч|эдж|игр|сесс|клетк|пробк|денайл|отказ|руин|cei)/i;

export type SoulTurnAnalysis = {
  mode: SoulConversationMode;
  act: SoulTurnAct;
  subjects: SoulCanonicalSubject[];
  invitation: SoulInitiativeInvitation;
  initiativeOptOut: boolean;
};

export function detectSoulTurnSubjects(text: string): SoulCanonicalSubject[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  return SUBJECT_RULES.filter((rule) => rule.re.test(trimmed)).map(
    (rule) => rule.subject,
  );
}

export function soulSubjectIsPlay(subject: SoulCanonicalSubject): boolean {
  return PLAY_SUBJECTS.has(subject);
}

export function userTurnMentionsPlay(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (detectSoulTurnSubjects(trimmed).some(soulSubjectIsPlay)) return true;
  return detectSoulInitiativeInvitation(trimmed) === "open_play";
}

export function appearanceIsRelevant(text: string): boolean {
  return detectSoulTurnSubjects(text).includes("appearance");
}

export function conversationModeIsNatural(mode: SoulConversationMode): boolean {
  switch (mode) {
    case "greeting":
    case "casual":
    case "personal":
      return true;
    case "play_relevant":
    case "system_followup":
      return false;
    default: {
      const _exhaustive: never = mode;
      return _exhaustive;
    }
  }
}

export function conversationAllowsLiveControl(mode: SoulConversationMode): boolean {
  return mode === "play_relevant" || mode === "system_followup";
}

export function detectTurnPlaySubject(text: string): SoulTurnSubject {
  const subjects = detectSoulTurnSubjects(text).filter(soulSubjectIsPlay);
  if (subjects.length === 0) return "none";
  const wear = subjects.some((subject) => subject.startsWith("wear:"));
  if (wear && subjects.length === 1) return "wear";
  if (subjects.length === 1 && subjects[0] === "checkin") return "checkin";
  if (subjects.length === 1 && subjects[0] === "session") return "session";
  if (
    subjects.every((subject) => subject === "contract" || subject === "task")
  ) {
    return "contract";
  }
  if (subjects.length > 0) return "play";
  return "none";
}

function intentTurnSubject(source: SoulIntentSource): SoulTurnSubject {
  switch (source) {
    case "session":
      return "session";
    case "checkin":
      return "checkin";
    case "contract":
      return "contract";
    case "system":
      return "none";
    case "conversation":
    case "relationship":
      return "play";
    default: {
      const _exhaustive: never = source;
      return _exhaustive;
    }
  }
}

export function intentMatchesTurnSubject(
  userText: string,
  intent: Pick<SoulCharacterIntent, "source">,
): boolean {
  const turn = detectTurnPlaySubject(userText);
  const want = intentTurnSubject(intent.source);
  if (turn === "none") return false;
  if (turn === "play") return true;
  return turn === want;
}

export function isSemanticallyUrgentIntent(
  intent: SoulCharacterIntent | null,
): boolean {
  if (!intent || intent.priority < SOUL_INTENT_INTERRUPT_PRIORITY) return false;
  return intent.source === "checkin" || intent.source === "system";
}

export function isSemanticallyUrgentCandidate(candidate: {
  priority: number;
  reason: string;
  source: string;
}): boolean {
  if (candidate.priority < SOUL_INTENT_INTERRUPT_PRIORITY) return false;
  return (
    candidate.reason === "checkin_overdue" ||
    candidate.source === "checkin" ||
    candidate.source === "system"
  );
}

export function isInitiativeOptOut(userText: string): boolean {
  const text = userText.trim();
  return INITIATIVE_OPT_OUT_RE.test(text) || SUBJECT_OPT_OUT_RE.test(text);
}

export function detectSoulInitiativeInvitation(
  userText: string,
): SoulInitiativeInvitation {
  const trimmed = userText.trim();
  if (!trimmed) return "none";
  if (isInitiativeOptOut(trimmed)) return "none";
  if (ABOUT_HER_RE.test(trimmed) || NOT_ACTIVITY_INVITE_RE.test(trimmed)) {
    return "none";
  }
  if (EXPLICIT_SESSION_INVITE_RE.test(trimmed)) return "explicit_session";
  if (OPEN_PLAY_RE.test(trimmed)) return "open_play";
  if (OPEN_ACTIVITY_RE.test(trimmed)) return "open_activity";
  return "none";
}

export function isSessionOfferIntent(
  intent: Pick<SoulCharacterIntent, "source" | "candidateId" | "goal">,
): boolean {
  if (intent.candidateId?.startsWith("session_offer:")) return true;
  if (intent.source !== "session") return false;
  return /чип сессии|намекнуть/i.test(intent.goal);
}

export function sessionOfferEligibleThisTurn(
  userText: string,
  stances?: readonly UserStance[],
): boolean {
  if (isInitiativeOptOut(userText)) return false;
  if (hasHardBoundaryOn(stances ?? [], ["session"])) return false;
  const invitation = detectSoulInitiativeInvitation(userText);
  switch (invitation) {
    case "open_activity":
    case "open_play":
    case "explicit_session":
      return true;
    case "none":
      return intentMatchesTurnSubject(userText, { source: "session" });
    default: {
      const _exhaustive: never = invitation;
      return _exhaustive;
    }
  }
}

export function shouldSpeakIntent(
  mode: SoulConversationMode,
  intent: SoulCharacterIntent | null,
  userText = "",
  stances?: readonly UserStance[],
): boolean {
  if (!intent) return false;
  if (mode === "system_followup") return true;
  if (isSessionOfferIntent(intent)) {
    return sessionOfferEligibleThisTurn(userText, stances);
  }
  if (mode !== "play_relevant") return false;
  return intentMatchesTurnSubject(userText, intent);
}

export function detectSoulConversationMode(
  userText: string,
  intent: SoulCharacterIntent | null,
): SoulConversationMode {
  if (detectSoulTurnSubjects(userText).some(soulSubjectIsPlay)) {
    return "play_relevant";
  }
  if (detectSoulInitiativeInvitation(userText) === "open_play") {
    return "play_relevant";
  }
  if (isCasualOpener(userText)) return "greeting";
  if (isSemanticallyUrgentIntent(intent)) return "system_followup";
  if (SMALL_TALK_RE.test(userText.trim())) return "casual";
  if (PERSONAL_RE.test(userText) || ABOUT_HER_RE.test(userText)) {
    return "personal";
  }
  return "personal";
}

export function detectSoulTurnAct(
  userText: string,
  mode = detectSoulConversationMode(userText, null),
): SoulTurnAct {
  if (mode === "greeting" || isCasualOpener(userText)) return "greet";
  if (ABOUT_HER_RE.test(userText)) return "share_about_self";
  const invitation = detectSoulInitiativeInvitation(userText);
  switch (invitation) {
    case "open_activity":
    case "open_play":
    case "explicit_session":
      return "request_activity";
    case "none":
      break;
    default: {
      const _exhaustive: never = invitation;
      return _exhaustive;
    }
  }
  if (mode === "play_relevant") return "play";
  if (SUPPORT_RE.test(userText)) return "support";
  if (REACT_RE.test(userText.trim())) return "react";
  if (/\?/.test(userText) || /^(как|что|зачем|почему|who|what|why)\b/i.test(userText.trim())) {
    return "answer_question";
  }
  return "react";
}

export function analyzeSoulTurn(
  userText: string,
  intent: SoulCharacterIntent | null = null,
): SoulTurnAnalysis {
  const mode = detectSoulConversationMode(userText, intent);
  return {
    mode,
    act: detectSoulTurnAct(userText, mode),
    subjects: detectSoulTurnSubjects(userText),
    invitation: detectSoulInitiativeInvitation(userText),
    initiativeOptOut: isInitiativeOptOut(userText),
  };
}

export function shouldHoldInitiativeCandidate(
  userText: string,
  intent: SoulCharacterIntent | null,
  candidate: { priority: number; reason: string; source: string },
  stances?: readonly UserStance[],
): boolean {
  const invitation = detectSoulInitiativeInvitation(userText);
  if (candidate.reason === "session_offer") {
    return !sessionOfferEligibleThisTurn(userText, stances);
  }
  if (
    invitation !== "none" &&
    (candidate.reason === "session_completed" ||
      candidate.reason === "session_aborted" ||
      (candidate.reason === "open_loop" && candidate.source === "session"))
  ) {
    return true;
  }
  const mode = detectSoulConversationMode(userText, intent);
  if (mode === "play_relevant") {
    return !intentMatchesTurnSubject(userText, {
      source: candidate.source as SoulCharacterIntent["source"],
    });
  }
  if (mode === "greeting") {
    return (
      candidate.reason === "checkin_overdue" ||
      candidate.reason === "session_completed" ||
      candidate.reason === "session_aborted" ||
      (candidate.reason === "open_loop" && candidate.source === "session")
    );
  }
  if (mode === "casual" || mode === "personal") {
    return !isSemanticallyUrgentCandidate(candidate);
  }
  return false;
}
