#!/usr/bin/env node
/**
 * Dev-only local chat eval. Not part of npm test.
 *
 *   npm run soul-eval
 *   npm run soul-eval -- --model qwen2.5:14b --preset expressive
 *   npm run soul-eval -- --model chat-model --service-model small-instruct
 *   npm run soul-eval -- --case greeting-ru,work-day --scenario casual-play-casual
 *   npm run soul-eval -- --compare qwen2.5:14b:balanced,qwen2.5:14b:expressive
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { huTaoBible } from "../src/lib/character";
import {
  createSoulChatClient,
  type SoulLlmClient,
} from "../src/lib/soul/client";
import { sendSoulChatTurn } from "../src/lib/soul/engine";
import {
  applySoulEvalFixture,
  SOUL_EVAL_CASES,
  SOUL_EVAL_SCENARIOS,
  type SoulEvalExpectation,
} from "../src/lib/soul/eval/cases";
import { scoreSoulEvalReply, soulEvalSpeechStats } from "../src/lib/soul/eval/score";
import { collectSoulEvalTurnMetrics } from "../src/lib/soul/eval/metrics";
import type { SoulTurnDebugSnapshot } from "../src/lib/soul/turnDebug";
import type { SoulMistressState } from "../src/lib/soul/types";
import { probeSoulRoleHealthWithClient } from "../src/lib/soul/roleHealth";
import { runSoulRouterAcceptance } from "../src/lib/soul/eval/routerAcceptance";
import {
  applyChatGenerationPreset,
  CHAT_GENERATION_PRESET_SAMPLING,
  DEFAULT_CHAT_SAMPLING,
  DEFAULT_ROLE_MODELS,
  isChatGenerationPreset,
  type ChatGenerationPreset,
  type ResolvedChatLlm,
} from "../src/lib/soul/llmSettings";

type RunSpec = { model: string; preset: ChatGenerationPreset };

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function argValue(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx < 0) return undefined;
  return process.argv[idx + 1];
}

function parseRuns(): RunSpec[] {
  const compare = argValue("--compare");
  if (compare) {
    return compare.split(",").map((part) => {
      const bits = part.trim().split(":");
      const presetRaw = bits.at(-1) ?? "balanced";
      const preset = isChatGenerationPreset(presetRaw) ? presetRaw : "balanced";
      const model = isChatGenerationPreset(presetRaw)
        ? bits.slice(0, -1).join(":")
        : part.trim();
      return { model: model || "qwen2.5:14b", preset };
    });
  }
  return [
    {
      model: argValue("--model") || process.env.SOUL_EVAL_MODEL || "qwen2.5:14b",
      preset: isChatGenerationPreset(argValue("--preset"))
        ? (argValue("--preset") as ChatGenerationPreset)
        : "balanced",
    },
  ];
}

function resolvedFor(spec: RunSpec): ResolvedChatLlm {
  const serviceModel =
    argValue("--service-model") || process.env.SOUL_EVAL_SERVICE_MODEL || "";
  const base = applyChatGenerationPreset(
    {
      provider: "ollama",
      model: spec.model,
      endpoint: "",
      apiKey: "",
      sampling: { ...DEFAULT_CHAT_SAMPLING },
      generationPreset: "balanced",
      roleModels: { ...DEFAULT_ROLE_MODELS },
      voiceExamples: true,
    },
    spec.preset,
  );
  const endpoint =
    process.env.SOUL_EVAL_ENDPOINT ||
    "http://127.0.0.1:11434/v1/chat/completions";
  return {
    provider: "ollama",
    model: spec.model,
    endpoint,
    apiKey: "",
    sampling: {
      ...DEFAULT_CHAT_SAMPLING,
      ...CHAT_GENERATION_PRESET_SAMPLING[spec.preset],
      timeoutMs: base.sampling.timeoutMs,
    },
    generationPreset: spec.preset,
    roleModels: {
      ...DEFAULT_ROLE_MODELS,
      ...(serviceModel
        ? {
            router: serviceModel,
            extractor: serviceModel,
            planner: serviceModel,
          }
        : {}),
    },
    voiceExamples: true,
  };
}

function stamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function selectedByFlag(id: string, flag: string): boolean {
  const raw = argValue(flag);
  if (!raw) return true;
  const wanted = raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  return wanted.some((part) => id === part || id.startsWith(`${part}:`));
}

async function evaluateTurn(opts: {
  id: string;
  category: string;
  userText: string;
  expectations: SoulEvalExpectation;
  state: SoulMistressState;
  client: SoulLlmClient;
  resolved: ResolvedChatLlm;
  nowMs: number;
}) {
  const started = Date.now();
  let reply = "";
  let error = "";
  let proposalCount = 0;
  let debug: SoulTurnDebugSnapshot | undefined;
  let nextState = opts.state;
  try {
    const result = await sendSoulChatTurn({
      state: opts.state,
      bible: huTaoBible,
      userText: opts.userText,
      client: opts.client,
      nowMs: opts.nowMs,
      voiceExamples: true,
      llm: opts.resolved,
    });
    reply = result.reply;
    proposalCount = result.proposals.length;
    debug = result.debug;
    nextState = result.state;
    if (result.error) error = result.error;
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }
  const latencyMs = Date.now() - started;
  const scored = scoreSoulEvalReply({
    text: reply,
    userText: opts.userText,
    expectations: opts.expectations,
    recent: opts.state.messages
      .filter((row) => row.role === "assistant")
      .map((row) => row.text)
      .slice(-4),
    proposalCount,
    debug,
  });
  const stats = soulEvalSpeechStats(reply);
  const metrics = collectSoulEvalTurnMetrics({
    debug,
    expectations: opts.expectations,
    proposalCount,
  });
  const passed = scored.pass && !error;
  return {
    state: nextState,
    latencyMs,
    passed,
    row: {
      id: opts.id,
      category: opts.category,
      userText: opts.userText,
      reply,
      error: error || undefined,
      latencyMs,
      pass: passed,
      repeatScore: scored.repeatScore,
      checks: scored.checks,
      proposalCount,
      stats,
      metrics,
      rawPromptMessages: debug?.promptMessages ?? [],
    },
    markdown: [
      `## ${opts.id} · ${opts.category}`,
      "",
      `**User:** ${opts.userText}`,
      "",
      error ? `**Error:** ${error}` : reply || "_(empty)_",
      "",
      `pass=${passed} · total=${latencyMs}ms · chat=${metrics.latencyMs.chat ?? "n/a"}ms · prompt=${metrics.promptChars ?? "n/a"} chars · sections=${metrics.includedSectionCount} · irrelevant=${metrics.irrelevantSectionCount} · retries=${metrics.structuredRetryCount} · repeat=${scored.repeatScore.toFixed(2)} · proposals=${proposalCount} · q=${stats.endsWithQuestion} · emoji=${stats.emojiCount} · want=${stats.wantTemplate} · watch=${stats.inventedWatch}`,
      "",
    ],
  };
}

async function runSpec(spec: RunSpec, outDir: string): Promise<void> {
  const resolved = resolvedFor(spec);
  const client = createSoulChatClient(resolved);
  const rows: Array<Record<string, unknown>> = [];
  let pass = 0;
  let fail = 0;
  let latencySum = 0;
  const md: string[] = [
    `# Soul eval · ${spec.model} · ${spec.preset}`,
    "",
    `endpoint: ${resolved.endpoint}`,
    "",
  ];
  const caseSelection = argValue("--case");
  const scenarioSelection = argValue("--scenario");
  const routerAcceptanceRequested = process.argv.includes(
    "--router-acceptance",
  );
  const explicitSelection = Boolean(
    caseSelection || scenarioSelection || routerAcceptanceRequested,
  );
  const slug = `${spec.model.replace(/[^\w.-]+/g, "_")}-${spec.preset}-${stamp()}`;
  const jsonPath = join(outDir, `${slug}.json`);
  const markdownPath = join(outDir, `${slug}.md`);
  await mkdir(outDir, { recursive: true });

  const saveProgress = async () => {
    await writeFile(
      jsonPath,
      JSON.stringify(
        {
          status: "running",
          model: spec.model,
          preset: spec.preset,
          pass,
          fail,
          cases: rows,
        },
        null,
        2,
      ),
      "utf8",
    );
    await writeFile(markdownPath, md.join("\n"), "utf8");
  };

  for (const testCase of SOUL_EVAL_CASES.filter(
    (row) =>
      (caseSelection ? selectedByFlag(row.id, "--case") : !explicitSelection),
  )) {
    const state = applySoulEvalFixture(
      huTaoBible.nameRu,
      huTaoBible.tone,
      testCase.fixture,
    );
    const outcome = await evaluateTurn({
      id: testCase.id,
      category: testCase.category,
      userText: testCase.userText,
      expectations: testCase.expectations,
      state,
      client,
      resolved,
      nowMs: 1_000,
    });
    latencySum += outcome.latencyMs;
    if (outcome.passed) pass += 1;
    else fail += 1;
    rows.push(outcome.row);
    md.push(...outcome.markdown);
    await saveProgress();
    console.log(`${outcome.passed ? "PASS" : "FAIL"} ${testCase.id}`);
  }

  for (const scenario of SOUL_EVAL_SCENARIOS.filter(
    (row) =>
      (scenarioSelection
        ? selectedByFlag(row.id, "--scenario")
        : !explicitSelection),
  )) {
    let state = applySoulEvalFixture(
      huTaoBible.nameRu,
      huTaoBible.tone,
      scenario.fixture,
    );
    for (let index = 0; index < scenario.turns.length; index += 1) {
      const turn = scenario.turns[index]!;
      const outcome = await evaluateTurn({
        id: `${scenario.id}:${index + 1}`,
        category: `scenario:${scenario.id}`,
        userText: turn.userText,
        expectations: turn.expectations,
        state,
        client,
        resolved,
        nowMs: 10_000 + index * 1_000,
      });
      state = outcome.state;
      latencySum += outcome.latencyMs;
      if (outcome.passed) pass += 1;
      else fail += 1;
      rows.push(outcome.row);
      md.push(...outcome.markdown);
      await saveProgress();
      console.log(
        `${outcome.passed ? "PASS" : "FAIL"} ${scenario.id}:${index + 1}`,
      );
    }
  }

  const roleHealth = process.argv.includes("--skip-role-health")
    ? null
    : await probeSoulRoleHealthWithClient({ client, resolved });
  if (roleHealth) {
    md.push("## Structured role probe", "");
    for (const [role, row] of Object.entries(roleHealth)) {
      md.push(
        `- ${role}: ok=${row.ok} · ${row.latencyMs}ms · retry=${row.retryUsed} · ${row.detail}`,
      );
    }
    md.push("");
  }
  const routerAcceptance = routerAcceptanceRequested
    ? await runSoulRouterAcceptance({
        bible: huTaoBible,
        client,
        nowMs: Date.now(),
      })
    : null;
  if (routerAcceptance) {
    md.push("## Router live acceptance", "");
    for (const row of routerAcceptance) {
      md.push(
        `- ${row.id}: pass=${row.pass} · parsed=${row.debug.parsed ?? "none"} · retry=${row.debug.retryUsed ?? false} · ${row.debug.latencyMs ?? 0}ms · ${row.checks.map((check) => `${check.id}=${check.ok}`).join(", ")}`,
      );
      console.log(`${row.pass ? "PASS" : "FAIL"} router:${row.id}`);
    }
    md.push("");
  }

  const questionEndingCount = rows.filter(
    (row) => (row.stats as ReturnType<typeof soulEvalSpeechStats>).endsWithQuestion,
  ).length;
  const summary = {
    model: spec.model,
    preset: spec.preset,
    pass,
    fail,
    total: rows.length,
    avgLatencyMs: Math.round(latencySum / Math.max(rows.length, 1)),
    roleHealth,
    routerAcceptance,
    metrics: {
      questionEndingFrequency:
        questionEndingCount / Math.max(rows.length, 1),
      proposalFalsePositives: rows.filter(
        (row) =>
          (row.metrics as ReturnType<typeof collectSoulEvalTurnMetrics>)
            .proposalFalsePositive,
      ).length,
      structuredRetryCount: rows.reduce(
        (sum, row) =>
          sum +
          (row.metrics as ReturnType<typeof collectSoulEvalTurnMetrics>)
            .structuredRetryCount,
        0,
      ),
      avgPromptChars: Math.round(
        rows.reduce(
          (sum, row) =>
            sum +
            ((row.metrics as ReturnType<typeof collectSoulEvalTurnMetrics>)
              .promptChars ?? 0),
          0,
        ) / Math.max(rows.length, 1),
      ),
      irrelevantSectionCount: rows.reduce(
        (sum, row) =>
          sum +
          (row.metrics as ReturnType<typeof collectSoulEvalTurnMetrics>)
            .irrelevantSectionCount,
        0,
      ),
    },
    cases: rows,
  };
  await writeFile(jsonPath, JSON.stringify({ status: "complete", ...summary }, null, 2), "utf8");
  await writeFile(markdownPath, md.join("\n"), "utf8");
  console.log(
    `${spec.model} ${spec.preset}: ${pass}/${rows.length} pass, avg ${summary.avgLatencyMs}ms`,
  );
  console.log(`report: ${markdownPath}`);
}

async function main(): Promise<void> {
  const outDir = argValue("--out") || join(ROOT, "tmp", "soul-eval");
  const runs = parseRuns();
  for (const spec of runs) {
    await runSpec(spec, outDir);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
