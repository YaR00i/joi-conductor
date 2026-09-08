import {
  analyzeSoulTurn,
  appearanceIsRelevant,
  conversationModeIsNatural,
  detectSoulConversationMode,
  detectSoulInitiativeInvitation,
  detectSoulTurnAct,
  detectTurnPlaySubject,
  isInitiativeOptOut,
  sessionOfferEligibleThisTurn,
  shouldHoldInitiativeCandidate,
  shouldSpeakIntent,
  type SoulInitiativeInvitation,
} from "./conversationMode";
import { looksLikeControlIntent } from "./control/actions";
import type { ChatProposal } from "./control/proposals";
import type { SessionPlannerDebug } from "./control/sessionPlanner";
import {
  SOUL_INITIATIVE_COOLDOWN_MS,
  type SoulCharacterIntent,
  type SoulInitiativeState,
  type SoulMistressState,
  type UserStance,
} from "./types";
import type { SoulInitiativeCandidate } from "./initiative";
import type { SoulChatTurn } from "./prompts";
import type { ChatGenerationPreset, ResolvedChatLlm } from "./llmSettings";
import { modelForRole } from "./llmSettings";
import { hasHardBoundaryOn } from "./stance";

export const SOUL_PROMPT_SECTION_NAMES = [
  "IDENTITY",
  "RELATIONSHIP",
  "CURRENT STATE",
  "TURN INTENT",
  "PLAY VOICE",
  "RELEVANT USER STANCE",
  "LIVE CONTEXT",
  "RELEVANT MEMORY",
  "APPEARANCE",
  "BEHAVIOR RULES",
] as const;
export type SoulPromptSectionName = (typeof SOUL_PROMPT_SECTION_NAMES)[number];

export type SoulTurnDebugCandidate = {
  id: string;
  kind: string;
  subject?: string;
  priority?: number;
  source?: string;
  eligible: boolean;
  reason: string;
};

export type SoulTurnDebugSection = {
  name: string;
  included: boolean;
  chars?: number;
  reason?: string;
};

export const SOUL_PROPOSAL_LIFECYCLE_STATES = [
  "created",
  "accepted",
  "refused",
  "blocked",
  "started",
  "failed",
] as const;
export type SoulProposalLifecycleState =
  (typeof SOUL_PROPOSAL_LIFECYCLE_STATES)[number];

export type SoulProposalLifecycleEvent = {
  proposalId: string;
  kind: ChatProposal["kind"];
  state: SoulProposalLifecycleState;
  atMs?: number;
  detail?: string;
};

export type SoulTurnDebugSnapshot = {
  turnId: string;
  userText: string;
  conversation: {
    mode: string;
    act: string;
    invitation: SoulInitiativeInvitation;
    detectedSubjects: string[];
  };
  candidates: SoulTurnDebugCandidate[];
  selectedIntent?: {
    id?: string;
    goal: string;
    subject?: string;
    priority: number;
    source?: string;
    includedInPrompt: boolean;
    reason: string;
  };
  initiative?: {
    candidateId?: string;
    intentId?: string;
    expiresAt?: number;
    consumed: boolean;
    cooldownUntil?: number;
    source?: string;
    consumeReason: string;
  };
  context: {
    sections: SoulTurnDebugSection[];
    suppressed: string[];
    totalChars: number;
    notes: string[];
  };
  model: {
    role: "chat";
    model: string;
    preset?: ChatGenerationPreset;
    temperature?: number;
    topP?: number;
    minP?: number;
    repeatPenalty?: number;
    numPredict?: number;
  };
  roles: {
    chat: string;
    router: string;
    extractor: string;
    planner: string;
  };
  speech: {
    firstAttemptValid: boolean;
    firstAttemptReason?: string;
    retryUsed: boolean;
    finalValidation?: string;
    repetitionScore?: number;
    latencyMs?: number;
  };
  extractor?: {
    ran: boolean;
    model?: string;
    speechHintDetected: boolean;
    proposals: Array<{
      kind: string;
      acceptedByValidator: boolean;
      reason?: string;
    }>;
    cardEmitted: boolean;
    firstAttemptValid?: boolean;
    retryUsed?: boolean;
    latencyMs?: number;
    parsed?: "valid" | "invalid";
  };
  router?: {
    ran: boolean;
    model?: string;
    messagesInBatch?: number;
    parsed?: "patch" | "no_change" | "invalid";
    updates: string[];
    rejected: string[];
    firstAttemptValid?: boolean;
    retryUsed?: boolean;
    latencyMs?: number;
  };
  planner?: SessionPlannerDebug;
  proposalLifecycle?: SoulProposalLifecycleEvent[];
  promptMessages: SoulChatTurn[];
};

export type SoulTurnSpeechDebug = {
  firstAttemptValid: boolean;
  firstAttemptReason?: string;
  retryUsed: boolean;
  finalValidation: string;
  repetitionScore: number;
  latencyMs: number;
};

export type SoulTurnExtractorDebug = {
  ran: boolean;
  speechHintDetected: boolean;
  greetingSkip: boolean;
  rawKinds: string[];
  droppedByStance: string[];
  proposals: ChatProposal[];
  firstAttemptValid?: boolean;
  retryUsed?: boolean;
  latencyMs?: number;
  parsed?: "valid" | "invalid";
};

const SECTION_HEADER = /^\[([A-Z][A-Z ]+)\]$/;

export function parsePromptSectionChars(
  systemPrompt: string,
): Map<string, number> {
  const lines = systemPrompt.split("\n");
  const chars = new Map<string, number>();
  let current = "";
  let buf: string[] = [];
  const flush = () => {
    if (!current) return;
    chars.set(current, buf.join("\n").trim().length);
  };
  for (const line of lines) {
    const header = SECTION_HEADER.exec(line.trim());
    if (header) {
      flush();
      current = header[1] ?? "";
      buf = [];
      continue;
    }
    if (current) buf.push(line);
  }
  flush();
  return chars;
}

function detectedSubjects(userText: string): string[] {
  return analyzeSoulTurn(userText).subjects;
}

function sessionOfferHoldReason(
  userText: string,
  stances: readonly UserStance[],
): string {
  if (isInitiativeOptOut(userText)) {
    return "suppressed: explicit conversational opt-out";
  }
  if (hasHardBoundaryOn(stances, ["session"])) {
    return "suppressed: hard boundary on session";
  }
  const invitation = detectSoulInitiativeInvitation(userText);
  const mode = detectSoulConversationMode(userText, null);
  if (invitation !== "none") {
    return `invitation=${invitation}; eligibility=true`;
  }
  switch (mode) {
    case "greeting":
      return "suppressed: ordinary greeting";
    case "casual":
      return "suppressed: ordinary casual conversation";
    case "personal":
      return "suppressed: ordinary personal conversation";
    case "play_relevant":
      return "suppressed: no invitation / subject mismatch";
    case "system_followup":
      return "suppressed: system follow-up";
    default: {
      const _exhaustive: never = mode;
      return _exhaustive;
    }
  }
}

function eligibleReason(
  userText: string,
  candidate: SoulInitiativeCandidate,
): string {
  if (candidate.reason === "session_offer") {
    const invitation = detectSoulInitiativeInvitation(userText);
    if (invitation !== "none") {
      return `invitation=${invitation}; eligibility=true`;
    }
    return `subject match (${detectTurnPlaySubject(userText)})`;
  }
  return `priority ${candidate.priority}; source ${candidate.source}`;
}

export function debugCandidateRow(
  candidate: SoulInitiativeCandidate,
  userText: string,
  intent: SoulCharacterIntent | null,
  stances: readonly UserStance[],
  initiative: SoulInitiativeState,
  nowMs: number,
): SoulTurnDebugCandidate {
  const consumed = initiative.consumedIds.includes(candidate.id);
  const cooling =
    initiative.lastAtMs != null &&
    nowMs - initiative.lastAtMs < SOUL_INITIATIVE_COOLDOWN_MS &&
    candidate.priority < 5;
  const held = shouldHoldInitiativeCandidate(
    userText,
    intent,
    candidate,
    stances,
  );
  let eligible = !consumed && !cooling && !held;
  let reason = eligibleReason(userText, candidate);
  if (consumed) {
    eligible = false;
    reason = "already consumed";
  } else if (held) {
    eligible = false;
    reason =
      candidate.reason === "session_offer"
        ? sessionOfferHoldReason(userText, stances)
        : `held: ${detectSoulConversationMode(userText, intent)}`;
  } else if (cooling) {
    eligible = false;
    reason = "cooldown";
  }
  return {
    id: candidate.id,
    kind: candidate.reason,
    ...(candidate.subject ? { subject: candidate.subject } : {}),
    priority: candidate.priority,
    source: candidate.source,
    eligible,
    reason,
  };
}

function sectionReason(
  name: SoulPromptSectionName,
  included: boolean,
  facts: {
    mode: string;
    speakIntent: boolean;
    userText: string;
    natural: boolean;
  },
): string | undefined {
  if (included) return undefined;
  switch (name) {
    case "TURN INTENT":
      return facts.speakIntent ? "empty goal" : "no eligible intent";
    case "PLAY VOICE":
      return `${facts.mode} turn`;
    case "LIVE CONTEXT":
      return "no relevant live subject";
    case "RELEVANT USER STANCE":
      return facts.natural ? "unrelated" : "none relevant";
    case "APPEARANCE":
      return appearanceIsRelevant(facts.userText)
        ? "empty appearance"
        : "not asked";
    case "RELEVANT MEMORY":
      return "none retrieved";
    case "IDENTITY":
    case "RELATIONSHIP":
    case "CURRENT STATE":
    case "BEHAVIOR RULES":
      return "empty";
    default: {
      const _exhaustive: never = name;
      return _exhaustive;
    }
  }
}

export function debugPromptSections(
  systemPrompt: string,
  facts: {
    mode: string;
    speakIntent: boolean;
    userText: string;
    natural: boolean;
  },
): { sections: SoulTurnDebugSection[]; suppressed: string[]; totalChars: number } {
  const chars = parsePromptSectionChars(systemPrompt);
  const sections = SOUL_PROMPT_SECTION_NAMES.map((name) => {
    const size = chars.get(name) ?? 0;
    const included = size > 0;
    return {
      name,
      included,
      ...(included ? { chars: size } : {}),
      ...(!included
        ? { reason: sectionReason(name, included, facts) }
        : {}),
    };
  });
  return {
    sections,
    suppressed: sections.filter((row) => !row.included).map((row) => row.name),
    totalChars: systemPrompt.length,
  };
}

function consumeReasonText(opts: {
  selected: SoulInitiativeCandidate | null;
  speech: string;
  proposalCount: number;
  consumed: boolean;
}): string {
  if (!opts.selected) return "suppressed this turn";
  if (opts.consumed) {
    return opts.proposalCount > 0 ? "spoken proposal" : "spoken session invite";
  }
  return "not consumed";
}

export function inspectSoulTurnDebug(opts: {
  userText: string;
  state: SoulMistressState;
  candidates: readonly SoulInitiativeCandidate[];
  selected: SoulInitiativeCandidate | null;
  intent: SoulCharacterIntent | null;
  stances: readonly UserStance[];
  nowMs: number;
  sessionOfferOpen: boolean;
  systemPrompt: string;
  consumed: boolean;
  speech?: string;
  proposalCount?: number;
}): Pick<
  SoulTurnDebugSnapshot,
  "conversation" | "candidates" | "selectedIntent" | "initiative" | "context"
> {
  const userText = opts.userText;
  const mode = detectSoulConversationMode(userText, opts.intent);
  const act = detectSoulTurnAct(userText, mode);
  const invitation = detectSoulInitiativeInvitation(userText);
  const speakIntent = shouldSpeakIntent(
    mode,
    opts.intent,
    userText,
    opts.stances,
  );
  const rows = opts.candidates.map((row) =>
    debugCandidateRow(
      row,
      userText,
      opts.intent,
      opts.stances,
      opts.state.initiative,
      opts.nowMs,
    ),
  );
  const notes: string[] = [];
  const hasOffer = opts.candidates.some((row) => row.reason === "session_offer");
  if (
    !hasOffer &&
    sessionOfferEligibleThisTurn(userText, opts.stances)
  ) {
    const gap = `invitation=${invitation}; sessionOfferEligible=true; but no live offer candidate exists`;
    notes.push(gap);
    rows.push({
      id: "session_offer",
      kind: "session_offer",
      source: "session",
      eligible: false,
      reason: gap,
    });
  }
  const intent = opts.intent;
  const selectedIntent = intent
    ? {
        ...(intent.candidateId ? { id: intent.candidateId } : {}),
        goal: intent.goal,
        ...(intent.subject ? { subject: intent.subject } : {}),
        priority: intent.priority,
        source: intent.source,
        includedInPrompt: speakIntent,
        reason: speakIntent
          ? invitation !== "none"
            ? `invitation=${invitation}; eligibility=true; included=true`
            : "subject-relevant; included=true"
          : opts.selected
            ? "selected but not spoken into prompt"
            : sessionOfferHoldReason(userText, opts.stances),
      }
    : undefined;
  const coolingUntil =
    opts.state.initiative.lastAtMs != null
      ? opts.state.initiative.lastAtMs + SOUL_INITIATIVE_COOLDOWN_MS
      : undefined;
  return {
    conversation: {
      mode,
      act,
      invitation,
      detectedSubjects: detectedSubjects(userText),
    },
    candidates: rows,
    ...(selectedIntent ? { selectedIntent } : {}),
    initiative: {
      ...(opts.selected?.id ? { candidateId: opts.selected.id } : {}),
      ...(intent?.candidateId ? { intentId: intent.candidateId } : {}),
      ...(intent?.expiresAtMs != null ? { expiresAt: intent.expiresAtMs } : {}),
      consumed: opts.consumed,
      ...(coolingUntil != null ? { cooldownUntil: coolingUntil } : {}),
      ...(opts.selected?.source ?? intent?.source
        ? { source: opts.selected?.source ?? intent?.source }
        : {}),
      consumeReason: consumeReasonText({
        selected: opts.selected,
        speech: opts.speech ?? "",
        proposalCount: opts.proposalCount ?? 0,
        consumed: opts.consumed,
      }),
    },
    context: {
      ...debugPromptSections(opts.systemPrompt, {
        mode,
        speakIntent,
        userText,
        natural: conversationModeIsNatural(mode),
      }),
      notes,
    },
  };
}

export function buildSoulTurnDebugSnapshot(opts: {
  turnId: string;
  userText: string;
  inspect: ReturnType<typeof inspectSoulTurnDebug>;
  promptMessages: SoulChatTurn[];
  llm?: Pick<
    ResolvedChatLlm,
    "model" | "sampling" | "generationPreset" | "roleModels"
  >;
  speech: SoulTurnSpeechDebug;
  extractor?: SoulTurnExtractorDebug;
  routerRan?: boolean;
}): SoulTurnDebugSnapshot {
  const llm = opts.llm;
  const chatModel = llm ? modelForRole({ model: llm.model, roleModels: llm.roleModels }, "chat") : "";
  const routerModel = llm
    ? modelForRole({ model: llm.model, roleModels: llm.roleModels }, "router")
    : "";
  const extractorModel = llm
    ? modelForRole({ model: llm.model, roleModels: llm.roleModels }, "extractor")
    : "";
  const plannerModel = llm
    ? modelForRole({ model: llm.model, roleModels: llm.roleModels }, "planner")
    : "";
  const extractor = opts.extractor;
  return {
    turnId: opts.turnId,
    userText: opts.userText,
    ...opts.inspect,
    model: {
      role: "chat",
      model: chatModel || "(unresolved)",
      ...(llm?.generationPreset ? { preset: llm.generationPreset } : {}),
      ...(llm
        ? {
            temperature: llm.sampling.temperature,
            topP: llm.sampling.topP,
            minP: llm.sampling.minP,
            repeatPenalty: llm.sampling.repeatPenalty,
            numPredict: llm.sampling.maxTokens,
          }
        : {}),
    },
    roles: {
      chat: chatModel || "(unresolved)",
      router: routerModel || "(unresolved)",
      extractor: extractorModel || "(unresolved)",
      planner: plannerModel || "(unresolved)",
    },
    speech: {
      firstAttemptValid: opts.speech.firstAttemptValid,
      ...(opts.speech.firstAttemptReason
        ? { firstAttemptReason: opts.speech.firstAttemptReason }
        : {}),
      retryUsed: opts.speech.retryUsed,
      finalValidation: opts.speech.finalValidation,
      repetitionScore: opts.speech.repetitionScore,
      latencyMs: opts.speech.latencyMs,
    },
    extractor: extractor
      ? {
          ran: extractor.ran,
          ...(extractorModel ? { model: extractorModel } : {}),
          speechHintDetected: extractor.speechHintDetected,
          proposals: [
            ...extractor.proposals.map((row) => ({
              kind: row.kind,
              acceptedByValidator: true,
              reason: row.source,
            })),
            ...extractor.droppedByStance.map((kind) => ({
              kind,
              acceptedByValidator: false,
              reason: "hard boundary",
            })),
          ],
          cardEmitted: extractor.proposals.length > 0,
          ...(extractor.firstAttemptValid != null
            ? { firstAttemptValid: extractor.firstAttemptValid }
            : {}),
          ...(extractor.retryUsed != null ? { retryUsed: extractor.retryUsed } : {}),
          ...(extractor.latencyMs != null ? { latencyMs: extractor.latencyMs } : {}),
          ...(extractor.parsed ? { parsed: extractor.parsed } : {}),
        }
      : {
          ran: false,
          speechHintDetected: false,
          proposals: [],
          cardEmitted: false,
        },
    router: {
      ran: Boolean(opts.routerRan),
      ...(routerModel ? { model: routerModel } : {}),
      updates: [],
      rejected: [],
    },
    proposalLifecycle: opts.extractor?.proposals.map((proposal) => ({
      proposalId: proposal.id,
      kind: proposal.kind,
      state: "created" as const,
    })) ?? [],
    promptMessages: opts.promptMessages,
  };
}

export function mergeProposalLifecycleDebug(
  snapshot: SoulTurnDebugSnapshot,
  proposal: Pick<ChatProposal, "id" | "kind">,
  state: SoulProposalLifecycleState,
  detail?: string,
  atMs = Date.now(),
): SoulTurnDebugSnapshot {
  const previous = snapshot.proposalLifecycle ?? [];
  const last = [...previous]
    .reverse()
    .find((row) => row.proposalId === proposal.id);
  if (last?.state === state && last.detail === detail) return snapshot;
  return {
    ...snapshot,
    proposalLifecycle: [
      ...previous,
      {
        proposalId: proposal.id,
        kind: proposal.kind,
        state,
        atMs,
        ...(detail ? { detail } : {}),
      },
    ],
  };
}

export function mergeRouterDebug(
  snapshot: SoulTurnDebugSnapshot,
  router: NonNullable<SoulTurnDebugSnapshot["router"]>,
): SoulTurnDebugSnapshot {
  return { ...snapshot, router };
}

export function mergePlannerDebug(
  snapshot: SoulTurnDebugSnapshot,
  planner: SessionPlannerDebug,
): SoulTurnDebugSnapshot {
  return { ...snapshot, planner };
}

export function formatSoulTurnDebugReport(snapshot: SoulTurnDebugSnapshot): string {
  const cand = snapshot.candidates
    .map((row) => `- ${row.kind} ${row.id} eligible=${row.eligible} ${row.reason}`)
    .join("\n");
  const sections = snapshot.context.sections
    .map((row) =>
      row.included
        ? `- ${row.name} ${row.chars ?? 0} chars`
        : `- ${row.name} absent (${row.reason ?? "empty"})`,
    )
    .join("\n");
  const intent = snapshot.selectedIntent
    ? [
        `id: ${snapshot.selectedIntent.id ?? "none"}`,
        `goal: ${snapshot.selectedIntent.goal}`,
        `includedInPrompt: ${snapshot.selectedIntent.includedInPrompt}`,
        `reason: ${snapshot.selectedIntent.reason}`,
      ].join("\n")
    : "none";
  const notes = snapshot.context.notes.length
    ? `\nnotes:\n${snapshot.context.notes.map((line) => `- ${line}`).join("\n")}`
    : "";
  const extractor = snapshot.extractor
    ? [
        `ran: ${snapshot.extractor.ran ? "yes" : "no"}`,
        `hint: ${snapshot.extractor.speechHintDetected ? "yes" : "no"}`,
        `card emitted: ${snapshot.extractor.cardEmitted ? "yes" : "no"}`,
        `model: ${snapshot.extractor.model ?? snapshot.roles.extractor}`,
        snapshot.extractor.proposals.length
          ? snapshot.extractor.proposals
              .map(
                (row) =>
                  `- ${row.kind} accepted=${row.acceptedByValidator} ${row.reason ?? ""}`.trim(),
              )
              .join("\n")
          : "",
        snapshot.extractor.retryUsed != null
          ? `retry: ${snapshot.extractor.retryUsed ? "yes" : "no"}`
          : "",
        snapshot.extractor.firstAttemptValid === false
          ? snapshot.extractor.retryUsed && snapshot.extractor.parsed === "valid"
            ? "attempt 1 invalid; attempt 2 valid"
            : "invalid after retry"
          : "",
        snapshot.extractor.latencyMs != null
          ? `latency: ${snapshot.extractor.latencyMs} ms`
          : "",
      ]
        .filter(Boolean)
        .join("\n")
    : "ran: no";
  const router = snapshot.router
    ? [
        `ran: ${snapshot.router.ran ? "yes" : "no"}`,
        `model: ${snapshot.router.model ?? snapshot.roles.router}`,
        snapshot.router.messagesInBatch != null
          ? `messagesInBatch: ${snapshot.router.messagesInBatch}`
          : "",
        snapshot.router.parsed ? `parsed: ${snapshot.router.parsed}` : "",
        snapshot.router.updates.length
          ? `updates:\n${snapshot.router.updates.map((line) => `- ${line}`).join("\n")}`
          : "",
        snapshot.router.rejected.length
          ? `rejected:\n${snapshot.router.rejected.map((line) => `- ${line}`).join("\n")}`
          : "",
        snapshot.router.retryUsed != null
          ? `retry: ${snapshot.router.retryUsed ? "yes" : "no"}`
          : "",
        snapshot.router.firstAttemptValid === false
          ? snapshot.router.retryUsed && snapshot.router.parsed !== "invalid"
            ? "attempt 1 invalid; attempt 2 valid"
            : "invalid after retry; patch rejected; state unchanged"
          : "",
        snapshot.router.latencyMs != null
          ? `latency: ${snapshot.router.latencyMs} ms`
          : "",
      ]
        .filter(Boolean)
        .join("\n")
    : "ran: no";
  const planner = snapshot.planner
    ? [
        `ran: ${snapshot.planner.ran ? "yes" : "no"}`,
        `source: ${snapshot.planner.source}`,
        snapshot.planner.model ? `model: ${snapshot.planner.model}` : "",
        snapshot.planner.parsed ? `parsed: ${snapshot.planner.parsed}` : "",
        snapshot.planner.retryUsed != null
          ? `retry: ${snapshot.planner.retryUsed ? "yes" : "no"}`
          : "",
        snapshot.planner.latencyMs != null
          ? `latency: ${snapshot.planner.latencyMs} ms`
          : "",
        snapshot.planner.fallbackReason ?? "",
      ]
        .filter(Boolean)
        .join("\n")
    : "ran: no";
  const lifecycle = snapshot.proposalLifecycle?.length
    ? snapshot.proposalLifecycle
        .map(
          (row) =>
            `- ${row.proposalId} ${row.kind}: ${row.state}${row.detail ? ` (${row.detail})` : ""}`,
        )
        .join("\n")
    : "none";
  return [
    "SOUL TURN DEBUG",
    `user: ${JSON.stringify(snapshot.userText)}`,
    "",
    `mode: ${snapshot.conversation.mode}`,
    `act: ${snapshot.conversation.act}`,
    `invitation: ${snapshot.conversation.invitation}`,
    `subjects: ${snapshot.conversation.detectedSubjects.join(", ") || "none"}`,
    "",
    "candidates:",
    cand || "- none",
    notes,
    "",
    "intent:",
    intent,
    "",
    "initiative:",
    `candidateId: ${snapshot.initiative?.candidateId ?? "none"}`,
    `intentId: ${snapshot.initiative?.intentId ?? "none"}`,
    `consumed: ${snapshot.initiative?.consumed ? "yes" : "no"}`,
    `consume reason: ${snapshot.initiative?.consumeReason ?? "none"}`,
    snapshot.initiative?.expiresAt != null
      ? `expiresAt: ${snapshot.initiative.expiresAt}`
      : "",
    snapshot.initiative?.cooldownUntil != null
      ? `cooldownUntil: ${snapshot.initiative.cooldownUntil}`
      : "",
    "",
    "prompt sections:",
    sections,
    `total chars: ${snapshot.context.totalChars}`,
    "",
    "model:",
    `Chat: ${snapshot.roles.chat}`,
    `Router: ${snapshot.roles.router}`,
    `Extractor: ${snapshot.roles.extractor}`,
    `Planner: ${snapshot.roles.planner}`,
    `role: chat`,
    snapshot.model.preset ? `preset: ${snapshot.model.preset}` : "",
    snapshot.model.temperature != null
      ? `temperature: ${snapshot.model.temperature}`
      : "",
    "",
    "speech validation:",
    `first attempt: ${snapshot.speech.firstAttemptValid ? "ok" : snapshot.speech.firstAttemptReason ?? "fail"}`,
    `retry: ${snapshot.speech.retryUsed ? "yes" : "no"}`,
    `final: ${snapshot.speech.finalValidation ?? ""}`,
        snapshot.speech.repetitionScore != null
          ? `repeat score: ${snapshot.speech.repetitionScore.toFixed(2)}`
          : "",
        snapshot.speech.latencyMs != null
          ? `latency: ${snapshot.speech.latencyMs} ms`
          : "",
    "",
    "extractor:",
    extractor,
    "",
    "router:",
    router,
    "",
    "planner:",
    planner,
    "",
    "proposal lifecycle:",
    lifecycle,
    "",
    `Router ran this turn: ${snapshot.router?.ran ? "yes" : "no"}`,
    `Extractor ran this turn: ${snapshot.extractor?.ran ? "yes" : "no"}`,
  ]
    .filter((line) => line !== "")
    .join("\n");
}

export function formatSoulTurnDebugPrompt(snapshot: SoulTurnDebugSnapshot): string {
  return snapshot.promptMessages
    .map((row) => `--- ${row.role} ---\n${row.content}`)
    .join("\n\n");
}

export function extractorDebugFromTurn(opts: {
  userText: string;
  speech: string;
  ran: boolean;
  greetingSkip: boolean;
  beforeStance: readonly ChatProposal[];
  afterStance: readonly ChatProposal[];
  firstAttemptValid?: boolean;
  retryUsed?: boolean;
  latencyMs?: number;
  parsed?: "valid" | "invalid";
}): SoulTurnExtractorDebug {
  const kept = new Set(opts.afterStance.map((row) => row.id));
  return {
    ran: opts.ran,
    speechHintDetected: looksLikeControlIntent(opts.userText, opts.speech),
    greetingSkip: opts.greetingSkip,
    rawKinds: opts.beforeStance.map((row) => row.kind),
    droppedByStance: opts.beforeStance
      .filter((row) => !kept.has(row.id))
      .map((row) => row.kind),
    proposals: [...opts.afterStance],
    ...(opts.firstAttemptValid != null
      ? { firstAttemptValid: opts.firstAttemptValid }
      : {}),
    ...(opts.retryUsed != null ? { retryUsed: opts.retryUsed } : {}),
    ...(opts.latencyMs != null ? { latencyMs: opts.latencyMs } : {}),
    ...(opts.parsed ? { parsed: opts.parsed } : {}),
  };
}
