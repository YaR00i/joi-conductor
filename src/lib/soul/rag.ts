import {
  SOUL_RAG_MAX_TOPICS,
  type SoulTopicFile,
} from "./types";

const STOP = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "to",
  "of",
  "in",
  "on",
  "for",
  "is",
  "it",
  "this",
  "that",
  "with",
  "как",
  "что",
  "это",
  "для",
  "при",
  "или",
  "не",
  "на",
  "по",
  "из",
  "от",
]);

/** Bag-of-words tokens. e5 hook later: prefix `query: ` / `passage: `. */
export function tokenizeSoulText(raw: string): string[] {
  return raw
    .toLowerCase()
    .replace(/[`*_#>\-]/g, " ")
    .split(/[^\p{L}\p{N}]+/u)
    .map((t) => t.trim())
    .filter((t) => t.length > 1 && !STOP.has(t));
}

export function termFreq(tokens: string[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const t of tokens) map.set(t, (map.get(t) ?? 0) + 1);
  return map;
}

export function cosineTf(
  a: Map<string, number>,
  b: Map<string, number>,
): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (const v of a.values()) na += v * v;
  for (const v of b.values()) nb += v * v;
  if (na === 0 || nb === 0) return 0;
  for (const [k, va] of a) {
    const vb = b.get(k);
    if (vb) dot += va * vb;
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export function soulTextCosine(a: string, b: string): number {
  return cosineTf(termFreq(tokenizeSoulText(a)), termFreq(tokenizeSoulText(b)));
}

/**
 * SoW RAG: if ≤4 topics return all; else top-3 by similarity.
 * Embed first 600 chars (lexical stand-in until e5 is wired).
 */
export function pickSoulTopics(
  topics: readonly SoulTopicFile[],
  query: string,
  opts?: { max?: number; minScore?: number },
): SoulTopicFile[] {
  const max = opts?.max ?? SOUL_RAG_MAX_TOPICS;
  const minScore = opts?.minScore ?? 0.06;
  if (topics.length === 0) return [];
  const q = termFreq(tokenizeSoulText(`query: ${query}`));
  const ranked = topics
    .map((topic) => {
      const passage = topic.body.slice(0, 600);
      const score = cosineTf(
        q,
        termFreq(tokenizeSoulText(`passage: ${passage}`)),
      );
      return { topic, score };
    })
    .filter((row) => row.score >= minScore)
    .sort((a, b) => b.score - a.score);
  return ranked.slice(0, max).map((r) => r.topic);
}

export const SOUL_TOPIC_DEDUP = 0.82;

export function findSimilarSoulTopic(
  topics: readonly SoulTopicFile[],
  bodyOrName: string,
  minCosine = SOUL_TOPIC_DEDUP,
): SoulTopicFile | null {
  let best: SoulTopicFile | null = null;
  let bestScore = minCosine;
  for (const topic of topics) {
    const score = Math.max(
      soulTextCosine(bodyOrName, topic.filename),
      soulTextCosine(bodyOrName, topic.body.slice(0, 600)),
    );
    if (score >= bestScore) {
      best = topic;
      bestScore = score;
    }
  }
  return best;
}
