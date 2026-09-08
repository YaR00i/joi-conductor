import type { CharacterBible } from "../character";
import type { SoulLlmClient } from "./client";
import { createSoulChatClient } from "./client";
import { proposalsFromExtract } from "./control/proposals";
import { parseSessionPlannerDraft } from "./control/sessionPlanner";
import { functions, patterns } from "../catalog";
import { DEFAULT_PARAMS } from "../types";
import { parseJsonObject } from "./json";
import {
  modelForRole,
  resolveChatLlm,
  type ChatLlmSettings,
  type ResolvedChatLlm,
} from "./llmSettings";
import { buildControlExtractPrompt } from "./prompts";
import { parseSoulRouterOutput } from "./router";
import { completeStructuredRole } from "./structuredComplete";
import { emptyMistressState } from "./types";
import { loadVoiceSettings } from "../voiceSettings";

const HEALTH_BIBLE: CharacterBible = {
  id: "hu_tao",
  nameRu: "Ху Тао",
  locale: "ru",
  tone: ["playful"],
  taboo: [],
  diminutives: [],
  emojiAllowed: false,
  systemPrompt: "You are Hu Tao.",
  fallbackLines: {},
};

export type SoulRoleHealthRow = {
  model: string;
  ok: boolean;
  latencyMs: number;
  detail: string;
  retryUsed: boolean;
  /** Dev diagnostics for soul-eval; UI does not render or persist it. */
  raw?: string;
};

export type SoulRoleHealthResult = {
  router: SoulRoleHealthRow;
  extractor: SoulRoleHealthRow;
  planner: SoulRoleHealthRow;
};

function wearCtx() {
  return {
    nowMs: 1,
    userText: "надень клетку",
    speech: "Надень клетку на три часа.",
    moodScore: 0,
    cageOn: false,
    plugOn: false,
    denialOn: false,
    checkInSet: false,
    sessionOfferOpen: false,
    pendingSession: false,
  };
}

export async function probeSoulRoleHealthWithClient(opts: {
  client: SoulLlmClient;
  resolved: Pick<ResolvedChatLlm, "model" | "roleModels">;
}): Promise<SoulRoleHealthResult> {
  const state = emptyMistressState(HEALTH_BIBLE.nameRu, HEALTH_BIBLE.tone);
  const router = await completeStructuredRole({
    client: opts.client,
    role: "router",
    messages: [
      {
        role: "user",
        content: [
          "Router transport health check. There are no user facts to save.",
          'Return exactly this JSON object: {"no_significant_change":true}',
          "No prose, markdown, extra keys, memory copies, topics, diary or stance updates.",
        ].join("\n"),
      },
    ],
    parse: (raw) => parseSoulRouterOutput(raw, state),
  });

  const extractor = await completeStructuredRole({
    client: opts.client,
    role: "extractor",
    messages: [
      {
        role: "user",
        content: buildControlExtractPrompt(
          HEALTH_BIBLE,
          "надень клетку",
          "Надень клетку на три часа.",
        ),
      },
    ],
    parse: parseJsonObject,
  });
  const wearFound =
    extractor.value != null &&
    proposalsFromExtract(extractor.value, wearCtx(), "extractor").some(
      (row) => row.kind === "wear",
    );
  const functionId = functions.find(
    (row) =>
      row.enabled &&
      row.modes.includes(DEFAULT_PARAMS.mode) &&
      row.requiresToys.length === 0,
  )?.id;
  const patternId = patterns.find((row) => row.enabled)?.id;
  const planner = await completeStructuredRole({
    client: opts.client,
    role: "planner",
    messages: [
      {
        role: "user",
        content: [
          "Role health check. Return JSON only.",
          "Copy this exact JSON shape and keep the exact key names:",
          JSON.stringify({
            bpmMin: 60,
            bpmMax: 120,
            blockSecMin: 20,
            blockSecMax: 40,
            allowedFunctionIds: functionId ? [functionId] : [],
            allowedPatternIds: patternId ? [patternId] : [],
          }),
          "Do not rename allowedFunctionIds or allowedPatternIds.",
        ].join("\n"),
      },
    ],
    parse: (raw) => parseSessionPlannerDraft(raw, DEFAULT_PARAMS),
  });

  return {
    router: {
      model: modelForRole(opts.resolved, "router"),
      ok: router.value != null,
      latencyMs: router.latencyMs,
      detail: router.value ? "valid JSON" : "invalid JSON",
      retryUsed: router.retryUsed,
      raw: router.raw,
    },
    extractor: {
      model: modelForRole(opts.resolved, "extractor"),
      ok: wearFound,
      latencyMs: extractor.latencyMs,
      detail:
        extractor.value == null
          ? "invalid JSON"
          : wearFound
            ? "valid proposal"
            : "JSON parsed, no wear",
      retryUsed: extractor.retryUsed,
      raw: extractor.raw,
    },
    planner: {
      model: modelForRole(opts.resolved, "planner"),
      ok: planner.value != null,
      latencyMs: planner.latencyMs,
      detail: planner.value ? "valid bounded plan" : "invalid plan",
      retryUsed: planner.retryUsed,
      raw: planner.raw,
    },
  };
}

/** Live probe from settings. Does not read or write Soul memory. */
export async function probeSoulRoleHealth(
  settings: ChatLlmSettings,
): Promise<SoulRoleHealthResult> {
  const config = resolveChatLlm(settings, loadVoiceSettings());
  const resolved = config.localFallback ?? config;
  return probeSoulRoleHealthWithClient({
    client: createSoulChatClient(resolved),
    resolved,
  });
}
