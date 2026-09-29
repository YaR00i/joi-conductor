import type { CharacterBible } from "../character";
import type { MistressId } from "../mistress/types";
import { appendDiaryEntry, clampTopicBody } from "./markdown";
import type { SoulLlmClient } from "./client";
import { buildCloudConversation, markCloudExchange } from "./cloudConversation";
import { completeSoulChatSpeech, recentAssistantReplies } from "./chatComplete";
import {
  buildChatMessages,
  buildControlExtractPrompt,
  buildRouterPrompt,
} from "./prompts";
import { parseJsonObject } from "./json";
import { completeStructuredRole } from "./structuredComplete";
import {
  applySoulRouterPatch,
  parseSoulRouterOutput,
  upsertSoulTopic,
  type SoulRouterResult,
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
import {
  buildSoulInitiativeContext,
  consumeInitiative,
  isCasualOpener,
  listInitiativeCandidates,
  prepareSoulTurnIntent,
  shouldConsumeSelectedInitiative,
  type SoulTurnInitiative,
} from "./initiative";
import {
  collectTurnProposals,
  applyStanceToProposals,
  shouldRunProposalExtractor,
  type ChatProposal,
} from "./control/proposals";
import {
  applyExplicitUserTextToStances,
  hasHardBoundaryOn,
  stanceSubjectFromTurnSubject,
} from "./stance";
import {
  detectSoulTurnSubjects,
  isInitiativeOptOut,
} from "./conversationMode";
import { loadControlState } from "./control/store";
import { controlLiveSnapshot } from "./control/live";
import type { ResolvedChatLlm } from "./llmSettings";
import {
  buildSoulTurnDebugSnapshot,
  extractorDebugFromTurn,
  inspectSoulTurnDebug,
  type SoulTurnDebugSnapshot,
} from "./turnDebug";

export type SoulTurnResult = {
  delivery?: import("./client").SoulLlmReply["delivery"];
  state: SoulMistressState;
  reply: string;
  proposals: ChatProposal[];
  error?: string;
  /** Phase D hook: which candidate was spoken this turn. Not a card. */
  initiative?: SoulTurnInitiative;
  /** Dev diagnostics only. Not saved with Soul memory. */
  debug?: SoulTurnDebugSnapshot;
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

async function resolveChatProposals(opts: {
  speech: string;
  userText: string;
  bible: CharacterBible;
  client: SoulLlmClient;
  signal?: AbortSignal;
  nowMs: number;
  candidateId?: string;
  intentId?: string;
  stances?: SoulMistressState["user"]["stances"];
}): Promise<{
  speech: string;
  proposals: ChatProposal[];
  extractor: ReturnType<typeof extractorDebugFromTurn>;
}> {
  const mistressId = mistressIdFromBible(opts.bible);
  const control = loadControlState(mistressId);
  const live = controlLiveSnapshot(control, opts.nowMs);
  const ctx = {
    nowMs: opts.nowMs,
    userText: opts.userText,
    speech: opts.speech,
    moodScore: control.moodScore,
    cageOn: live.wear?.kind === "cage",
    plugOn: live.wear?.kind === "plug",
    denialOn: Boolean(live.denial),
    checkInSet: Boolean(live.checkIn),
    sessionOfferOpen: control.dispatch.phase === "session_offer",
    pendingSession: Boolean(control.pendingProposal),
    ...(opts.candidateId ? { candidateId: opts.candidateId } : {}),
    ...(opts.intentId ? { intentId: opts.intentId } : {}),
  };
  const pack = (
    extracted?: unknown,
    didExtract = false,
  ) => {
    const before = collectTurnProposals({
      userText: opts.userText,
      speech: opts.speech,
      extractedRaw: extracted,
      extracted: didExtract,
      ctx,
    });
    const after = applyStanceToProposals(
      opts.stances ?? [],
      before,
      opts.nowMs,
    );
    return { before, after };
  };
  const finish = (
    proposals: ChatProposal[],
    before: ChatProposal[],
    ran: boolean,
    greetingSkip: boolean,
    structured?: {
      firstAttemptValid?: boolean;
      retryUsed?: boolean;
      latencyMs?: number;
      parsed?: "valid" | "invalid";
    },
  ) => ({
    speech: opts.speech,
    proposals,
    extractor: extractorDebugFromTurn({
      userText: opts.userText,
      speech: opts.speech,
      ran,
      greetingSkip,
      beforeStance: before,
      afterStance: proposals,
      ...structured,
    }),
  });
  if (isCasualOpener(opts.userText)) {
    return finish([], [], false, true);
  }
  if (isInitiativeOptOut(opts.userText)) {
    return finish([], [], false, false);
  }
  if (!shouldRunProposalExtractor(opts.userText, opts.speech)) {
    const packed = pack();
    return finish(packed.after, packed.before, false, false);
  }
  const extracted = await completeStructuredRole({
    client: opts.client,
    role: "extractor",
    messages: [
      {
        role: "user",
        content: buildControlExtractPrompt(
          opts.bible,
          opts.userText,
          opts.speech,
        ),
      },
    ],
    parse: parseJsonObject,
    signal: opts.signal,
  });
  const fromJson = extracted.value ?? { proposals: [] };
  const packed = pack(fromJson, true);
  return finish(packed.after, packed.before, true, false, {
    firstAttemptValid: extracted.attempts[0]?.ok === true,
    retryUsed: extracted.retryUsed,
    latencyMs: extracted.latencyMs,
    parsed: extracted.value ? "valid" : "invalid",
  });
}

export function soulNeedsSync(state: SoulMistressState): boolean {
  return state.pendingSinceRouter >= SOUL_ROUTER_BATCH;
}

function hardBoundarySubjectsForTurn(
  state: SoulMistressState,
  userText: string,
): string[] {
  return detectSoulTurnSubjects(userText)
    .map(stanceSubjectFromTurnSubject)
    .filter((subject): subject is string => Boolean(subject))
    .filter((subject) => hasHardBoundaryOn(state.user.stances ?? [], [subject]));
}

function describeRouterSync(
  before: SoulMistressState,
  after: SoulMistressState,
  parsed: SoulRouterResult | null,
  ran: boolean,
  structured?: {
    firstAttemptValid?: boolean;
    retryUsed?: boolean;
    latencyMs?: number;
  },
): NonNullable<SoulTurnDebugSnapshot["router"]> {
  const extra = {
    ...(structured?.firstAttemptValid != null
      ? { firstAttemptValid: structured.firstAttemptValid }
      : {}),
    ...(structured?.retryUsed != null ? { retryUsed: structured.retryUsed } : {}),
    ...(structured?.latencyMs != null ? { latencyMs: structured.latencyMs } : {}),
  };
  if (!ran) {
    return { ran: false, updates: [], rejected: [] };
  }
  if (!parsed) {
    return {
      ran: true,
      messagesInBatch: SOUL_ROUTER_BATCH,
      parsed: "invalid",
      updates: [],
      rejected: ["router output was not valid JSON patch"],
      ...extra,
    };
  }
  if (parsed.kind === "no_change") {
    return {
      ran: true,
      messagesInBatch: SOUL_ROUTER_BATCH,
      parsed: "no_change",
      updates: ["no_significant_change"],
      rejected: parsed.rejected ?? [],
      ...extra,
    };
  }
  const updates: string[] = [];
  const trustBefore = before.user.trustLevel;
  const trustAfter = after.user.trustLevel;
  updates.push(
    trustBefore === trustAfter
      ? "trust: unchanged"
      : `trust: ${trustBefore} → ${trustAfter}`,
  );
  const stanceDelta =
    (after.user.stances?.length ?? 0) - (before.user.stances?.length ?? 0);
  updates.push(
    stanceDelta === 0
      ? "stance_updates: none accepted"
      : `stance_updates: ${stanceDelta > 0 ? stanceDelta : 0} accepted`,
  );
  const mileBefore = before.user.sharedMilestones.join("|");
  const mileAfter = after.user.sharedMilestones.join("|");
  updates.push(
    mileBefore === mileAfter ? "milestones: none" : "milestones: updated",
  );
  if (parsed.topicActions.length > 0) {
    updates.push(
      `topic_actions: ${parsed.topicActions.map((row) => row.filename).join(", ")}`,
    );
  }
  return {
    ran: true,
    messagesInBatch: SOUL_ROUTER_BATCH,
    parsed: "patch",
    updates,
    rejected: parsed.rejected ?? [],
    ...extra,
  };
}

export async function syncSoulMemory(
  state: SoulMistressState,
  bible: CharacterBible,
  client: SoulLlmClient,
  signal?: AbortSignal,
  nowMs = Date.now(),
): Promise<SoulMistressState> {
  return (await syncSoulMemoryDetailed(state, bible, client, signal, nowMs))
    .state;
}

export async function syncSoulMemoryDetailed(
  state: SoulMistressState,
  bible: CharacterBible,
  client: SoulLlmClient,
  signal?: AbortSignal,
  nowMs = Date.now(),
): Promise<{
  state: SoulMistressState;
  router: NonNullable<SoulTurnDebugSnapshot["router"]>;
}> {
  let next = { ...state, pendingSinceRouter: 0 };
  let parsed: SoulRouterResult | null = null;
  const memoryEnabled = soulUsesRouter(state.mode);
  const ran = memoryEnabled || soulUsesDiary(state.mode);
  let routerAttempt: {
    firstAttemptValid?: boolean;
    retryUsed?: boolean;
    latencyMs?: number;
  } = {};

  if (ran) {
    const routed = await completeStructuredRole({
      client,
      role: "router",
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
      parse: (raw) => parseSoulRouterOutput(raw, state),
      repairHint: soulUsesTopics(state.mode)
        ? "Router semantic repair: if the recent user explicitly asked to remember an important lasting episode, include topic_plan.actions with one complete action containing action, filename, reason, and body. Preserve a valid diary_entry."
        : undefined,
      signal,
    });
    parsed = routed.value;
    routerAttempt = {
      firstAttemptValid: routed.attempts[0]?.ok === true,
      retryUsed: routed.retryUsed,
      latencyMs: routed.latencyMs,
    };
    if (parsed && memoryEnabled) next = applySoulRouterPatch(next, parsed);
    if (
      parsed?.kind === "patch" &&
      soulUsesTopics(state.mode) &&
      parsed.topicActions.length > 0
    ) {
      for (const action of parsed.topicActions.filter((row) => row.body)) {
        next = {
          ...next,
          topics: upsertSoulTopic(
            next.topics,
            action.filename,
            clampTopicBody(action.body),
          ),
        };
      }
    }
    if (soulUsesDiary(state.mode) && parsed?.diaryEntry) {
      next = {
        ...next,
        diaryMd: appendDiaryEntry(next.diaryMd, parsed.diaryEntry, nowMs),
      };
    }
  }

  return {
    state: next,
    router: describeRouterSync(state, next, parsed, ran, routerAttempt),
  };
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

function snapshotForTurn(opts: {
  turnId: string;
  userText: string;
  prepared: ReturnType<typeof prepareSoulTurnIntent>;
  initiativeCtx: ReturnType<typeof buildSoulInitiativeContext>;
  messages: ReturnType<typeof buildChatMessages>;
  speech: string;
  proposals: ChatProposal[];
  consumed: boolean;
  spoken: {
    firstAttemptValid: boolean;
    firstAttemptReason?: string;
    retryUsed: boolean;
    finalValidation: string;
    repetitionScore: number;
    latencyMs: number;
  };
  extractor?: ReturnType<typeof extractorDebugFromTurn>;
  llm?: Pick<
    ResolvedChatLlm,
    "model" | "sampling" | "generationPreset" | "roleModels"
  >;
}): SoulTurnDebugSnapshot {
  const systemPrompt = opts.messages[0]?.content ?? "";
  const inspect = inspectSoulTurnDebug({
    userText: opts.userText,
    state: opts.prepared.state,
    candidates: listInitiativeCandidates(
      opts.prepared.state,
      opts.initiativeCtx,
    ),
    selected: opts.prepared.selected,
    intent: opts.prepared.state.intent,
    stances: opts.prepared.state.user.stances ?? [],
    nowMs: opts.initiativeCtx.nowMs,
    sessionOfferOpen: opts.initiativeCtx.sessionOfferOpen,
    systemPrompt,
    consumed: opts.consumed,
    speech: opts.speech,
    proposalCount: opts.proposals.length,
  });
  return buildSoulTurnDebugSnapshot({
    turnId: opts.turnId,
    userText: opts.userText,
    inspect,
    promptMessages: opts.messages,
    llm: opts.llm,
    speech: opts.spoken,
    extractor: opts.extractor,
  });
}

export async function sendSoulChatTurn(opts: {
  onSpeechPreview?: (text: string) => void;
  cloudConversationId?: string;
  skipServiceRoles?: boolean;
  state: SoulMistressState;
  bible: CharacterBible;
  userText: string;
  client: SoulLlmClient;
  signal?: AbortSignal;
  nowMs?: number;
  voiceExamples?: boolean;
  llm?: Pick<
    ResolvedChatLlm,
    "model" | "sampling" | "generationPreset" | "roleModels"
  >;
}): Promise<SoulTurnResult> {
  opts.signal?.throwIfAborted();
  const text = opts.userText.trim();
  if (!text) {
    return { state: opts.state, reply: "", proposals: [] };
  }
  const nowMs = opts.nowMs ?? Date.now();
  const initiativeCtx = buildSoulInitiativeContext(
    mistressIdFromBible(opts.bible),
    nowMs,
  );
  const prepared = prepareSoulTurnIntent(opts.state, text, initiativeCtx);
  const stances = applyExplicitUserTextToStances(
    prepared.state.user.stances ?? [],
    text,
    nowMs,
  );
  const withStance: SoulMistressState = {
    ...prepared.state,
    user: { ...prepared.state.user, stances },
  };
  const withUser = appendUserIfNeeded(withStance, text, nowMs);
  const messages = buildChatMessages(opts.bible, withUser, text, {
    voiceExamples: opts.voiceExamples,
  });
  const cloudMessages = buildCloudConversation(opts.bible.id, withUser, text, opts.cloudConversationId);
  try {
    const spoken = await completeSoulChatSpeech({
      client: opts.client,
      bible: opts.bible,
      messages,
      recent: recentAssistantReplies(withUser),
      onSpeechPreview: opts.onSpeechPreview,
      cloudMessages,
      forbiddenSubjects: hardBoundarySubjectsForTurn(withUser, text),
      signal: opts.signal,
    });
    const resolved = spoken.fallback || opts.skipServiceRoles
      ? {
          speech: spoken.speech,
          proposals: [] as ChatProposal[],
          extractor: extractorDebugFromTurn({
            userText: text,
            speech: spoken.speech,
            ran: false,
            greetingSkip: false,
            beforeStance: [],
            afterStance: [],
          }),
        }
      : await resolveChatProposals({
          speech: spoken.speech,
          userText: text,
          bible: opts.bible,
          client: opts.client,
          signal: opts.signal,
          nowMs,
          candidateId: prepared.selected?.id,
          intentId: prepared.state.intent?.candidateId,
          stances,
        });
    opts.signal?.throwIfAborted();
    const { speech, proposals, extractor } = resolved;
    let nextState: SoulMistressState = {
      ...withUser,
      messages: speech
        ? [
            ...withUser.messages,
            newSoulMessage("assistant", speech, nowMs + 1, spoken.think),
          ]
        : withUser.messages,
      pendingSinceRouter: withUser.pendingSinceRouter + (speech ? 2 : 1),
    };
    const expressedInitiative =
      Boolean(speech) &&
      prepared.selected &&
      shouldConsumeSelectedInitiative(
        prepared.selected,
        speech,
        proposals.length,
      );
    if (spoken.delivery?.provider === "groq" && speech) {
      nextState = markCloudExchange(nextState, opts.cloudConversationId);
    }
    if (expressedInitiative && prepared.selected) {
      nextState = consumeInitiative(nextState, prepared.selected.id, nowMs);
    }
    const assistantId =
      nextState.messages[nextState.messages.length - 1]?.id ?? `turn-${nowMs}`;
    const debug = snapshotForTurn({
      turnId: assistantId,
      userText: text,
      prepared,
      initiativeCtx,
      messages: spoken.delivery?.provider === "groq" ? cloudMessages! : messages,
      speech,
      proposals,
      consumed: Boolean(expressedInitiative),
      spoken: {
        firstAttemptValid: spoken.firstAttemptValid,
        firstAttemptReason: spoken.firstAttemptReason,
        retryUsed: spoken.retryUsed,
        finalValidation: spoken.finalValidation,
        repetitionScore: spoken.repetitionScore,
        latencyMs: spoken.latencyMs,
      },
      extractor,
      llm: opts.llm,
    });
    return {
      reply: speech,
      proposals,
      state: nextState,
      debug,
      delivery: spoken.delivery,
      ...(expressedInitiative && prepared.selected
        ? {
            initiative: {
              candidateId: prepared.selected.id,
              reason: prepared.selected.reason,
            },
          }
        : {}),
    };
  } catch (err) {
    if ((err as { name?: string }).name === "AbortError") throw err;
    return {
      state: withUser,
      reply: "",
      proposals: [],
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
      m.id === messageId ? { ...m, text: trimmed, cloudContextId: undefined } : m,
    ),
  };
}

export async function regenerateSoulReply(opts: {
  onSpeechPreview?: (text: string) => void;
  cloudConversationId?: string;
  skipServiceRoles?: boolean;
  state: SoulMistressState;
  bible: CharacterBible;
  messageId: string;
  client: SoulLlmClient;
  signal?: AbortSignal;
  nowMs?: number;
  voiceExamples?: boolean;
  llm?: Pick<
    ResolvedChatLlm,
    "model" | "sampling" | "generationPreset" | "roleModels"
  >;
}): Promise<SoulTurnResult> {
  opts.signal?.throwIfAborted();
  const sliced = truncateForRegenerate(opts.state, opts.messageId);
  if (!sliced) {
    return { state: opts.state, reply: "", proposals: [], error: "нечего перегенерировать" };
  }
  const userText = lastSoulUserText(sliced);
  if (!userText) {
    return { state: opts.state, reply: "", proposals: [], error: "нет реплики, от которой крутить" };
  }
  const nowMs = opts.nowMs ?? Date.now();
  const messages = buildChatMessages(opts.bible, sliced, userText, {
    voiceExamples: opts.voiceExamples,
  });
  const cloudMessages = sliced.messages.at(-1)?.cloudContextId === opts.cloudConversationId
    ? buildCloudConversation(opts.bible.id, sliced, userText, opts.cloudConversationId) : undefined;
  const initiativeCtx = buildSoulInitiativeContext(
    mistressIdFromBible(opts.bible),
    nowMs,
  );
  try {
    const spoken = await completeSoulChatSpeech({
      client: opts.client,
      bible: opts.bible,
      messages,
      recent: recentAssistantReplies(sliced),
      onSpeechPreview: opts.onSpeechPreview,
      cloudMessages,
      forbiddenSubjects: hardBoundarySubjectsForTurn(sliced, userText),
      signal: opts.signal,
    });
    const resolved = spoken.fallback || opts.skipServiceRoles
      ? {
          speech: spoken.speech,
          proposals: [] as ChatProposal[],
          extractor: extractorDebugFromTurn({
            userText,
            speech: spoken.speech,
            ran: false,
            greetingSkip: false,
            beforeStance: [],
            afterStance: [],
          }),
        }
      : await resolveChatProposals({
          speech: spoken.speech,
          userText,
          bible: opts.bible,
          client: opts.client,
          signal: opts.signal,
          nowMs,
          candidateId: sliced.intent?.candidateId,
          intentId: sliced.intent?.candidateId,
        });
    opts.signal?.throwIfAborted();
    const { speech, proposals, extractor } = resolved;
    let nextState = {
      ...sliced,
      messages: speech
        ? [
            ...sliced.messages,
            newSoulMessage("assistant", speech, nowMs, spoken.think),
          ]
        : sliced.messages,
    };
    if (spoken.delivery?.provider === "groq" && speech) {
      nextState = markCloudExchange(nextState, opts.cloudConversationId);
    }
    const assistantId =
      nextState.messages[nextState.messages.length - 1]?.id ?? `turn-${nowMs}`;
    return {
      reply: speech,
      delivery: spoken.delivery,
      proposals,
      state: nextState,
      debug: snapshotForTurn({
        turnId: assistantId,
        userText,
        prepared: { state: sliced, selected: null },
        initiativeCtx,
        messages: spoken.delivery?.provider === "groq" ? cloudMessages! : messages,
        speech,
        proposals,
        consumed: false,
        spoken: {
          firstAttemptValid: spoken.firstAttemptValid,
          firstAttemptReason: spoken.firstAttemptReason,
          retryUsed: spoken.retryUsed,
          finalValidation: spoken.finalValidation,
          repetitionScore: spoken.repetitionScore,
          latencyMs: spoken.latencyMs,
        },
        extractor,
        llm: opts.llm,
      }),
    };
  } catch (err) {
    if ((err as { name?: string }).name === "AbortError") throw err;
    return {
      state: opts.state,
      reply: "",
      proposals: [],
      error: err instanceof Error ? err.message : "модель не ответила",
    };
  }
}
