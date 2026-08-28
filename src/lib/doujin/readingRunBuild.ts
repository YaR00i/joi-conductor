import { moodFromScore } from "../moodEngine";
import {
  buildRecommendPlans,
  mixUniqueCards,
  withLanguage,
  type RecommendPlan,
} from "./query";
import type { DoujinCard, DoujinTag } from "./types";

export const READING_QUEUE_SIZES = [10, 15, 20] as const;
export type ReadingQueueSize = (typeof READING_QUEUE_SIZES)[number];

export function datedQueueName(prefix: string, now = Date.now()): string {
  const d = new Date(now);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${prefix.trim() || "Теги"} · ${dd}.${mm}`;
}

export function mistressQueueName(now = Date.now()): string {
  return datedQueueName("Госпожа", now);
}

export function tagPullQueueName(typeLabel: string, now = Date.now()): string {
  return datedQueueName(typeLabel, now);
}

function shuffle<T>(items: readonly T[], rng: () => number): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const a = out[i]!;
    out[i] = out[j]!;
    out[j] = a;
  }
  return out;
}

/**
 * Loved vs rare AND-pairs for an auto-list. Never circles/languages;
 * english is forced later via withLanguage.
 */
export function pickMistressQueuePlans(
  moodScore: number,
  savedTags: readonly DoujinTag[],
  lovedTags: readonly DoujinTag[],
  blacklist: readonly string[],
  rng: () => number = Math.random,
): RecommendPlan[] {
  const plans = buildRecommendPlans(savedTags, blacklist, lovedTags);
  if (plans.length === 0) return [];
  const mood = moodFromScore(moodScore);
  const english = (plan: RecommendPlan): RecommendPlan => ({
    ...plan,
    query: withLanguage(plan.query, "english"),
  });
  switch (mood) {
    case "sweet":
    case "horny":
      return plans.slice(0, 6).map(english);
    case "bored":
    case "cruel":
      return plans.slice(-6).reverse().map(english);
    case "chaotic":
      return shuffle(plans, rng).slice(0, 8).map(english);
    case "calm":
      return [
        ...plans.slice(0, 3),
        ...plans.slice(-3),
      ].map(english);
    default: {
      const _never: never = mood;
      return _never;
    }
  }
}

export async function collectMistressQueueCards(opts: {
  size: ReadingQueueSize;
  plans: readonly RecommendPlan[];
  exclude: ReadonlySet<number>;
  search: (query: string, page: number) => Promise<readonly DoujinCard[]>;
}): Promise<DoujinCard[]> {
  const parts: DoujinCard[][] = [];
  for (const plan of opts.plans) {
    if (parts.reduce((n, p) => n + p.length, 0) >= opts.size * 2) break;
    try {
      const items = await opts.search(plan.query, 1);
      if (items.length > 0) parts.push([...items]);
    } catch {
      /* skip a failed pairing and try the next */
    }
  }
  return mixUniqueCards(parts, opts.exclude, opts.size);
}
