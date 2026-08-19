/**
 * Activity debrief — post-contract questionnaire for non-session contracts.
 *
 * Where finishDebrief.ts handles «did you earn your cum?» finish-permission
 * flows inside a session, this module handles the broader «go do X and report
 * back» contracts (visit a site, perform an edging task, etc.). It asks the
 * questions the user described: how many edges, how long held, how finished,
 * what you did afterwards.
 *
 * Mirrors the finishDebrief shape so the debrief sheet, scoring and ContractsPage
 * wiring reuse the same patterns. Answers are a flat Record<string,string>.
 */

import type { ContractInstance } from "./dailyBoard";
import { getContractDef } from "./catalog";

export type ActivityDebriefOption = {
  id: string;
  labelRu: string;
  hintRu?: string;
  /** Added to base reward (can be negative; total clamped ≥ 0). */
  delta: number;
};

export type ActivityDebriefQuestion = {
  id: string;
  promptRu: string;
  options?: ActivityDebriefOption[];
  /** Free-text numeric entry instead of options (for edge count / hold time). */
  freeform?: { kind: "number"; unit: string; min: number; max: number; deltaPer?: number; deltaCap?: number };
};

export type ActivityDebriefAnswers = Record<string, string>;

export type ActivityDebriefScore = {
  rewarded: number;
  baseReward: number;
  delta: number;
  summaryRu: string;
  tone: "sweet" | "cruel" | "neutral";
};

/** Does this contract require the activity debrief before reporting done? */
export function requiresActivityDebrief(c: ContractInstance): boolean {
  const def = getContractDef(c.defId);
  return Boolean(def?.requireActivityDebrief);
}

const HOW_FINISHED_OPTIONS: ActivityDebriefOption[] = [
  { id: "full", labelRu: "Полный финал", delta: 4 },
  { id: "ruin", labelRu: "Руин", delta: 2 },
  { id: "deny", labelRu: "Денай (не закончил)", delta: 8 },
  { id: "none", labelRu: "Не закончил вообще", delta: 0 },
];

const POST_ACTION_OPTIONS: ActivityDebriefOption[] = [
  { id: "ate", labelRu: "Съел", delta: 6 },
  { id: "swallowed", labelRu: "Проглотил", delta: 6 },
  { id: "smeared", labelRu: "Смазал / намазал", delta: 2 },
  { id: "poured", labelRu: "Вылил / смешал", delta: 1 },
  { id: "wiped", labelRu: "Вытерся и выбросил", delta: -2 },
  { id: "left", labelRu: "Оставил как есть", delta: 0 },
  { id: "na", labelRu: "Не применимо (денай)", delta: 0 },
];

const FOLLOW_THROUGH_OPTIONS: ActivityDebriefOption[] = [
  { id: "full", labelRu: "Полностью выполнил задание", delta: 6 },
  { id: "mostly", labelRu: "В основном, с отклонениями", delta: 2 },
  { id: "partial", labelRu: "Частично — сорвал половину", delta: -4 },
  { id: "skipped", labelRu: "Почти ничего не сделал", delta: -10 },
];

/** Build the question list. Post-action only shows when there was a finish. */
export function activityDebriefQuestions(): ActivityDebriefQuestion[] {
  return [
    {
      id: "follow_through",
      promptRu: "Насколько честно ты выполнил задание контракта?",
      options: FOLLOW_THROUGH_OPTIONS,
    },
    {
      id: "edge_count",
      promptRu: "Сколько раз ты эджил?",
      freeform: { kind: "number", unit: "эджей", min: 0, max: 200, deltaPer: 1, deltaCap: 10 },
    },
    {
      id: "edge_hold_sec",
      promptRu: "Сколько в среднем держал эдж (секунд)?",
      freeform: { kind: "number", unit: "сек", min: 0, max: 600, deltaPer: 0.05, deltaCap: 6 },
    },
    {
      id: "how_finished",
      promptRu: "Как ты закончил?",
      options: HOW_FINISHED_OPTIONS,
    },
    {
      id: "post_action",
      promptRu: "Что ты сделал потом со спермой?",
      options: POST_ACTION_OPTIONS,
    },
  ];
}

/** Questions visible given current answers (handles showWhen on post_action). */
export function visibleActivityDebriefQuestions(
  answers: ActivityDebriefAnswers,
): ActivityDebriefQuestion[] {
  const all = activityDebriefQuestions();
  return all.filter((q) => {
    if (q.id !== "post_action") return true;
    const how = answers.how_finished;
    return how === "full" || how === "ruin";
  });
}

export function activityDebriefComplete(
  answers: ActivityDebriefAnswers,
): boolean {
  const visible = visibleActivityDebriefQuestions(answers);
  return visible.every((q) => Boolean(answers[q.id]));
}

/** Upper bound on bonus, for the reward hint. */
export function activityDebriefMaxBonus(): number {
  const visible = visibleActivityDebriefQuestions({});
  let bonus = 0;
  for (const q of visible) {
    if (q.freeform && q.freeform.deltaCap) {
      bonus += q.freeform.deltaCap;
    } else {
      const pos = (q.options ?? [])
        .map((o) => o.delta)
        .filter((d) => d > 0);
      if (pos.length > 0) bonus += Math.max(...pos);
    }
  }
  return bonus;
}

function findOption(
  q: ActivityDebriefQuestion,
  id: string | undefined,
): ActivityDebriefOption | undefined {
  return (q.options ?? []).find((o) => o.id === id);
}

export function scoreActivityDebrief(
  baseReward: number,
  answers: ActivityDebriefAnswers,
): ActivityDebriefScore {
  const base = Math.max(0, Math.floor(baseReward));
  const visible = visibleActivityDebriefQuestions(answers);
  let delta = 0;
  const bits: string[] = [];

  for (const q of visible) {
    const val = answers[q.id];
    if (!val) continue;
    if (q.freeform) {
      const n = Number(val);
      if (!Number.isFinite(n)) continue;
      const per = q.freeform.deltaPer ?? 0;
      const cap = q.freeform.deltaCap ?? 0;
      const gained = Math.min(cap, n * per);
      delta += gained;
      if (gained > 0 && q.id === "edge_count") {
        bits.push(`${Math.round(n)} эджей`);
      }
      continue;
    }
    const opt = findOption(q, val);
    if (!opt) continue;
    delta += opt.delta;
    if (Math.abs(opt.delta) >= 4) bits.push(opt.labelRu.toLowerCase());
  }

  const rewarded = Math.max(0, Math.min(base + 24, base + delta));

  let tone: ActivityDebriefScore["tone"] = "neutral";
  if (rewarded === 0) tone = "cruel";
  else if (rewarded >= base + 8) tone = "sweet";

  let summaryRu: string;
  if (rewarded === 0) {
    summaryRu = "Отчёт слабый — награды нет";
  } else if (rewarded > base) {
    summaryRu = `+${rewarded} · бонус за честный отчёт`;
  } else if (rewarded < base) {
    summaryRu = `+${rewarded} · урезано по ответу`;
  } else {
    summaryRu = `+${rewarded} угольков`;
  }
  if (bits.length > 0 && rewarded > 0) {
    summaryRu += ` (${bits.slice(0, 2).join(", ")})`;
  }

  return { rewarded, baseReward: base, delta, summaryRu, tone };
}

export function activityDebriefTitleRu(): string {
  return "Отчёт по заданию";
}
