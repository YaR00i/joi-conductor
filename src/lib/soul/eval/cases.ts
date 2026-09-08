import type { SoulMistressState } from "../types";
import { emptyMistressState } from "../types";
import { applyExplicitUserTextToStances } from "../stance";

export type SoulEvalLanguage = "ru" | "en";

export type SoulEvalExpectation = {
  noJson?: boolean;
  noThink?: boolean;
  maxChars?: number;
  minChars?: number;
  language?: SoulEvalLanguage;
  noForbiddenRecap?: boolean;
  noBoundaryViolation?: boolean;
  forbidProposal?: boolean;
  allowProposal?: boolean;
  noPlayMention?: boolean;
  noSessionMention?: boolean;
  noInventedWatch?: boolean;
  noWantTemplate?: boolean;
  maxRepeatScore?: number;
  requireProposal?: boolean;
  mode?: string;
  subjectsInclude?: string[];
  subjectsExclude?: string[];
  sectionsInclude?: string[];
  sectionsExclude?: string[];
  candidateGap?: boolean;
};

export type SoulStateFixture = {
  label?: string;
  lastSession?: string;
  cageTalk?: boolean;
  hardBoundary?: string;
  teaHabit?: boolean;
  priorAssistant?: string[];
  priorTurns?: Array<{ user: string; assistant: string }>;
  liveSessionOffer?: boolean;
};

export type SoulEvalCase = {
  id: string;
  category: string;
  userText: string;
  fixture: SoulStateFixture;
  expectations: SoulEvalExpectation;
};

export type SoulEvalScenario = {
  id: string;
  fixture: SoulStateFixture;
  turns: Array<{
    userText: string;
    expectations: SoulEvalExpectation;
  }>;
};

export function applySoulEvalFixture(
  nameRu: string,
  tone: string[],
  fixture: SoulStateFixture,
): SoulMistressState {
  const state = emptyMistressState(nameRu, tone);
  if (fixture.lastSession) {
    state.recentEvents.push({
      id: "ev-eval-session",
      kind: "session_completed",
      atMs: 1,
      mistressId: "hu_tao",
      summary: fixture.lastSession,
      importance: 3,
    });
  }
  if (fixture.teaHabit) {
    state.user.preferencesHabits = ["tea at night"];
  }
  if (fixture.hardBoundary) {
    state.user.stances = applyExplicitUserTextToStances(
      [],
      fixture.hardBoundary,
      1,
    );
  }
  if (fixture.cageTalk) {
    state.user.stances = applyExplicitUserTextToStances(
      state.user.stances ?? [],
      "я люблю клетку",
      1,
    );
  }
  for (const turn of fixture.priorTurns ?? []) {
    state.messages.push({
      id: `u-${state.messages.length}`,
      role: "user",
      text: turn.user,
      atMs: state.messages.length + 1,
    });
    state.messages.push({
      id: `a-${state.messages.length}`,
      role: "assistant",
      text: turn.assistant,
      atMs: state.messages.length + 1,
    });
  }
  for (const line of fixture.priorAssistant ?? []) {
    state.messages.push({
      id: `a-${state.messages.length}`,
      role: "assistant",
      text: line,
      atMs: state.messages.length + 1,
    });
  }
  if (fixture.liveSessionOffer) {
    state.intent = {
      goal: "В приложении уже есть чип сессии. Можно намекнуть в речи, не пересказывать CONTROL.",
      tone: "playful",
      priority: 2,
      source: "session",
      candidateId: "session_offer:eval",
      expiresAtMs: 1_000_000_000,
    };
  }
  return state;
}

export const SOUL_EVAL_CASES: readonly SoulEvalCase[] = [
  {
    id: "greeting-ru",
    category: "greeting",
    userText: "Привет",
    fixture: { lastSession: "Сессия завершена. Руина." },
    expectations: {
      noJson: true,
      noThink: true,
      language: "ru",
      maxChars: 420,
      noForbiddenRecap: true,
      forbidProposal: true,
    },
  },
  {
    id: "how-are-you",
    category: "casual",
    userText: "как ты?",
    fixture: {},
    expectations: {
      noJson: true,
      noThink: true,
      language: "ru",
      maxChars: 480,
      forbidProposal: true,
    },
  },
  {
    id: "hello-en",
    category: "greeting",
    userText: "Hey",
    fixture: {},
    expectations: {
      noJson: true,
      noThink: true,
      language: "en",
      maxChars: 420,
      forbidProposal: true,
    },
  },
  {
    id: "known-name",
    category: "known-fact",
    userText: "Как тебя зовут?",
    fixture: {},
    expectations: { noJson: true, noThink: true, language: "ru", maxChars: 360 },
  },
  {
    id: "last-session",
    category: "recent-session",
    userText: "Ну что, как тебе сессия?",
    fixture: { lastSession: "Сессия завершена. Руина, эджи 4." },
    expectations: {
      noJson: true,
      noThink: true,
      language: "ru",
      noForbiddenRecap: true,
    },
  },
  {
    id: "yesterday-hard",
    category: "recent-session",
    userText: "Вчера было жёстко",
    fixture: { lastSession: "Сессия завершена. Руина." },
    expectations: { noJson: true, noThink: true, language: "ru" },
  },
  {
    id: "open-loop",
    category: "open-loop",
    userText: "Я вчера отказался от сессии. Ты злишься?",
    fixture: { lastSession: "Сессия отклонена." },
    expectations: { noJson: true, noThink: true, language: "ru" },
  },
  {
    id: "hard-boundary",
    category: "hard-boundary",
    userText: "Давай клетку",
    fixture: { hardBoundary: "никакой клетки, это жёсткая граница" },
    expectations: {
      noJson: true,
      noThink: true,
      noBoundaryViolation: true,
      forbidProposal: true,
    },
  },
  {
    id: "cage-topic",
    category: "wear",
    userText: "клетка как сидится",
    fixture: { cageTalk: true },
    expectations: { noJson: true, noThink: true, language: "ru" },
  },
  {
    id: "tea-chat",
    category: "everyday",
    userText: "Как заваривать чай?",
    fixture: { teaHabit: true },
    expectations: {
      noJson: true,
      noThink: true,
      language: "ru",
      forbidProposal: true,
    },
  },
  {
    id: "work-day",
    category: "everyday",
    userText: "Устал после работы",
    fixture: {},
    expectations: {
      noJson: true,
      noThink: true,
      language: "ru",
      forbidProposal: true,
    },
  },
  {
    id: "curiosity",
    category: "curiosity",
    userText: "А что ты любишь, кроме работы?",
    fixture: {},
    expectations: { noJson: true, noThink: true, language: "ru", forbidProposal: true },
  },
  {
    id: "refusal",
    category: "refusal",
    userText: "Не хочу сессию сегодня",
    fixture: {},
    expectations: {
      noJson: true,
      noThink: true,
      language: "ru",
      forbidProposal: true,
    },
  },
  {
    id: "emotional",
    category: "emotional",
    userText:
      "Мне сегодня тяжело. Кажется, я всех подвёл, и не знаю, зачем вообще писать.",
    fixture: {},
    expectations: { noJson: true, noThink: true, language: "ru" },
  },
  {
    id: "proposal-window",
    category: "proposal",
    userText: "Запри меня в клетку на три часа",
    fixture: {},
    expectations: {
      noJson: true,
      noThink: true,
      language: "ru",
      allowProposal: true,
      requireProposal: true,
    },
  },
  {
    id: "no-proposal-hello",
    category: "no-proposal",
    userText: "Привет, Хутао",
    fixture: { cageTalk: true },
    expectations: {
      noJson: true,
      noThink: true,
      language: "ru",
      forbidProposal: true,
    },
  },
  {
    id: "repeat-turn-1",
    category: "repetition",
    userText: "Привет",
    fixture: {
      priorAssistant: [
        "Хе-хе. Опять ты. Садись, чай сам себя не выпьет.",
        "Хе-хе. Опять ты. Садись, чай сам себя не выпьет.",
      ],
    },
    expectations: {
      noJson: true,
      noThink: true,
      maxRepeatScore: 0.82,
      forbidProposal: true,
    },
  },
  {
    id: "short-question",
    category: "casual",
    userText: "Ок?",
    fixture: {},
    expectations: { noJson: true, noThink: true, maxChars: 360, forbidProposal: true },
  },
  {
    id: "english-smalltalk",
    category: "casual",
    userText: "How are you?",
    fixture: {},
    expectations: {
      noJson: true,
      noThink: true,
      language: "en",
      maxChars: 480,
      forbidProposal: true,
    },
  },
  {
    id: "games",
    category: "everyday",
    userText: "Во что играешь?",
    fixture: {},
    expectations: { noJson: true, noThink: true, language: "ru", forbidProposal: true },
  },
  {
    id: "checkin-ask",
    category: "wear",
    userText: "Напомни, я должен отчитаться?",
    fixture: {},
    expectations: { noJson: true, noThink: true, language: "ru" },
  },
  {
    id: "joke",
    category: "casual",
    userText: "Расскажи шутку про гробы",
    fixture: {},
    expectations: { noJson: true, noThink: true, language: "ru", forbidProposal: true },
  },
  {
    id: "care-ask",
    category: "emotional",
    userText: "Можно просто посидеть молча? Мне тревожно.",
    fixture: {},
    expectations: { noJson: true, noThink: true, language: "ru", forbidProposal: true },
  },
    {
      id: "offer-decline",
      category: "refusal",
      userText: "Если предложишь сессию — нет.",
      fixture: {},
      expectations: {
        noJson: true,
        noThink: true,
        language: "ru",
        forbidProposal: true,
      },
    },
    {
      id: "natural-day-chat",
      category: "natural-conversation",
      userText: "А ты чем занималась?",
      fixture: {
        lastSession: "Сессия завершена. Руина.",
        cageTalk: true,
        priorTurns: [
          {
            user: "Привет",
            assistant: "О, живой. Садись — чай сам себя не выпьет.",
          },
          {
            user: "Устал сегодня на работе",
            assistant: "Рабочий день выжал? Ладно. Можешь просто выдохнуть.",
          },
          {
            user: "Да ничего, просто день длинный",
            assistant: "Бывает. Я никуда не делась.",
          },
        ],
      },
      expectations: {
        noJson: true,
        noThink: true,
        language: "ru",
        forbidProposal: true,
        noPlayMention: true,
        noInventedWatch: true,
        noWantTemplate: true,
      },
    },
    {
      id: "natural-interesting",
      category: "natural-conversation",
      userText: "Что-нибудь интересное было?",
      fixture: {
        priorTurns: [
          {
            user: "А ты чем занималась?",
            assistant: "Играла и дважды потеряла чай.",
          },
        ],
      },
      expectations: {
        noJson: true,
        noThink: true,
        language: "ru",
        forbidProposal: true,
        noPlayMention: true,
        noInventedWatch: true,
        noWantTemplate: true,
      },
    },
    {
      id: "natural-hmm-react",
      category: "natural-conversation",
      userText: "Хм, звучит неплохо",
      fixture: {
        priorTurns: [
          {
            user: "Что-нибудь интересное было?",
            assistant: "Играла и дважды потеряла чай. Ничего легендарного.",
          },
        ],
      },
      expectations: {
        noJson: true,
        noThink: true,
        language: "ru",
        forbidProposal: true,
        noPlayMention: true,
        noInventedWatch: true,
        noWantTemplate: true,
      },
    },
    {
      id: "wear-becomes-relevant",
      category: "natural-conversation",
      userText: "Кстати, клетка сегодня уже надоела",
      fixture: {
        cageTalk: true,
        priorTurns: [
          {
            user: "Привет",
            assistant: "О, живой. Садись.",
          },
          {
            user: "Устал сегодня на работе",
            assistant: "Рабочий день выжал? Ладно.",
          },
        ],
      },
      expectations: {
        noJson: true,
        noThink: true,
        language: "ru",
      },
    },
    {
      id: "session-continuity-relevant",
      category: "natural-conversation",
      userText: "А вчерашняя сессия была жёсткой",
      fixture: {
        lastSession: "Сессия завершена. Руина, эджи 4.",
      },
      expectations: {
        noJson: true,
        noThink: true,
        language: "ru",
        noForbiddenRecap: true,
        noInventedWatch: true,
      },
    },
    {
      id: "share-about-self-followup",
      category: "natural-conversation",
      userText: "И что-нибудь интересное случилось?",
      fixture: {
        priorTurns: [
          {
            user: "А ты чем занималась?",
            assistant: "Сидела с чаем и чуть не уснула над игрой.",
          },
        ],
      },
      expectations: {
        noJson: true,
        noThink: true,
        language: "ru",
        forbidProposal: true,
        noPlayMention: true,
        noInventedWatch: true,
        noWantTemplate: true,
      },
    },
    {
      id: "initiative-allowed-greeting",
      category: "initiative-relevance",
      userText: "Привет",
      fixture: { liveSessionOffer: true },
      expectations: {
        noJson: true,
        noThink: true,
        language: "ru",
        forbidProposal: true,
        noPlayMention: true,
        noSessionMention: true,
      },
    },
    {
      id: "initiative-allowed-ask",
      category: "initiative-relevance",
      userText: "Чем займёмся?",
      fixture: {
        liveSessionOffer: true,
        priorTurns: [
          {
            user: "Привет",
            assistant: "О, живой. Садись.",
          },
          {
            user: "Сегодня ничего не планировал.",
            assistant: "Значит, вечер ещё свободен.",
          },
        ],
      },
      expectations: {
        noJson: true,
        noThink: true,
        language: "ru",
        allowProposal: true,
        noInventedWatch: true,
      },
    },
    {
      id: "initiative-blocked-chat",
      category: "initiative-relevance",
      userText: "Просто хочу немного поболтать.",
      fixture: {
        liveSessionOffer: true,
        priorTurns: [
          {
            user: "Устал сегодня на работе.",
            assistant: "Длинный день? Ладно, я здесь.",
          },
        ],
      },
      expectations: {
        noJson: true,
        noThink: true,
        language: "ru",
        forbidProposal: true,
        noPlayMention: true,
        noSessionMention: true,
        noInventedWatch: true,
      },
    },
    {
      id: "initiative-wear-mismatch",
      category: "initiative-relevance",
      userText: "Клетка сегодня надоела.",
      fixture: {
        liveSessionOffer: true,
        cageTalk: true,
      },
      expectations: {
        noJson: true,
        noThink: true,
        language: "ru",
        noSessionMention: true,
        noInventedWatch: true,
      },
    },
    {
      id: "initiative-no-live-candidate",
      category: "initiative-relevance",
      userText: "Чем займёмся?",
      fixture: {},
      expectations: {
        noJson: true,
        noThink: true,
        language: "ru",
        candidateGap: true,
        forbidProposal: true,
      },
    },
    {
      id: "play-masturbation-context",
      category: "play-context",
      userText: "Хочу подрочить",
      fixture: {},
      expectations: {
        noJson: true,
        noThink: true,
        language: "ru",
        mode: "play_relevant",
        subjectsInclude: ["masturbation"],
        subjectsExclude: ["wear:cage", "wear:plug", "cei"],
        sectionsInclude: ["PLAY VOICE"],
        sectionsExclude: ["APPEARANCE"],
      },
    },
    {
      id: "play-edging-context",
      category: "play-context",
      userText: "Хочу эджиться",
      fixture: {},
      expectations: {
        noJson: true,
        noThink: true,
        language: "ru",
        mode: "play_relevant",
        subjectsInclude: ["edging"],
        subjectsExclude: ["wear:cage", "wear:plug", "cei"],
        sectionsInclude: ["PLAY VOICE"],
      },
    },
    {
      id: "play-orgasm-context",
      category: "play-context",
      userText: "Хочу кончить",
      fixture: {},
      expectations: {
        noJson: true,
        noThink: true,
        language: "ru",
        mode: "play_relevant",
        subjectsInclude: ["orgasm"],
        subjectsExclude: ["wear:cage", "wear:plug", "cei"],
        sectionsInclude: ["PLAY VOICE"],
      },
    },
    {
      id: "explicit-opt-out",
      category: "opt-out",
      userText: "Не хочу сегодня играть. Просто поболтаем.",
      fixture: { liveSessionOffer: true },
      expectations: {
        noJson: true,
        noThink: true,
        language: "ru",
        forbidProposal: true,
        noPlayMention: true,
        noSessionMention: true,
        sectionsExclude: ["TURN INTENT", "PLAY VOICE", "LIVE CONTEXT"],
      },
    },
    {
      id: "return-from-play-to-games",
      category: "multi-turn-return",
      userText: "Ладно, а во что ты сегодня играла?",
      fixture: {
        priorTurns: [
          {
            user: "Я сегодня весь твой",
            assistant: "Тогда не торопись. Я ещё решу, чем тебя занять.",
          },
        ],
      },
      expectations: {
        noJson: true,
        noThink: true,
        language: "ru",
        mode: "personal",
        subjectsInclude: ["games"],
        subjectsExclude: ["session", "masturbation", "edging", "orgasm"],
        sectionsExclude: ["PLAY VOICE", "LIVE CONTEXT"],
        forbidProposal: true,
        noPlayMention: true,
      },
    },
];

/** Real sequential run: every generated answer becomes context for the next turn. */
export const SOUL_EVAL_SCENARIOS: readonly SoulEvalScenario[] = [
  {
    id: "casual-play-casual",
    fixture: {},
    turns: [
      {
        userText: "Привет",
        expectations: {
          mode: "greeting",
          forbidProposal: true,
          noPlayMention: true,
        },
      },
      {
        userText: "Устал сегодня",
        expectations: {
          forbidProposal: true,
          noPlayMention: true,
        },
      },
      {
        userText: "А ты чем занималась?",
        expectations: {
          forbidProposal: true,
          noPlayMention: true,
          noInventedWatch: true,
        },
      },
      {
        userText: "Мне скучно",
        expectations: { forbidProposal: true },
      },
      {
        userText: "Я сегодня весь твой",
        expectations: {
          mode: "play_relevant",
          sectionsInclude: ["PLAY VOICE"],
        },
      },
      {
        userText: "Ладно, а во что ты сегодня играла?",
        expectations: {
          mode: "personal",
          subjectsInclude: ["games"],
          sectionsExclude: ["PLAY VOICE", "LIVE CONTEXT"],
          forbidProposal: true,
          noPlayMention: true,
          noInventedWatch: true,
        },
      },
    ],
  },
];
