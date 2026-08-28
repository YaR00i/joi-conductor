import type {
  AssembleTag,
  AssembleTagKind,
  MistressAssemblePreset,
} from "./mistress/types";

export const ASSEMBLE_THIN_MIN = 12;
export const ASSEMBLE_MAX_FETCHES = 12;

export type AssembleBucket = "liked" | "disliked" | "own";

export type AssembleQuotas = Record<AssembleBucket, number>;

export type AssemblePick = {
  bucket: AssembleBucket;
  query: string;
  key: string;
};

export function assembleBodyTags(): AssembleTag[] {
  return [
    {
      tag: "foot_focus",
      kind: "body",
      cluster: "feet",
      fallback: ["feet", "cum_on_feet", "soles", "footjob"],
    },
    { tag: "armpits", kind: "body" },
    {
      tag: "breast_focus",
      kind: "body",
      cluster: "breasts",
      fallback: ["paizuri"],
    },
    {
      tag: "ass_focus",
      kind: "body",
      cluster: "ass",
      fallback: ["from_behind"],
    },
    {
      tag: "cum_in_mouth",
      kind: "body",
      cluster: "mouth",
      fallback: ["oral", "fellatio"],
    },
  ];
}

export function withAssembleActs(
  weights: Pick<
    MistressAssemblePreset,
    "likedWeight" | "dislikedWeight" | "ownWeight"
  >,
  acts: readonly AssembleTag[] = [],
): MistressAssemblePreset {
  return {
    likedWeight: weights.likedWeight,
    dislikedWeight: weights.dislikedWeight,
    ownWeight: weights.ownWeight,
    tags: [...assembleBodyTags(), ...acts],
  };
}

function splitByWeights(total: number, weights: readonly number[]): number[] {
  const want = Math.max(0, Math.floor(total));
  if (want === 0 || weights.length === 0) {
    return weights.map(() => 0);
  }
  const sum = weights.reduce((n, w) => n + Math.max(0, w), 0);
  if (sum <= 0) {
    const out = weights.map(() => 0);
    out[0] = want;
    return out;
  }
  const raw = weights.map((w) => (want * Math.max(0, w)) / sum);
  const floors = raw.map((n) => Math.floor(n));
  let rem = want - floors.reduce((n, v) => n + v, 0);
  const order = raw
    .map((n, i) => ({ i, frac: n - floors[i]! }))
    .sort((a, b) => b.frac - a.frac);
  const out = floors.slice();
  for (let k = 0; k < rem; k += 1) {
    const idx = order[k % order.length]?.i;
    if (idx == null) break;
    out[idx] = (out[idx] ?? 0) + 1;
  }
  return out;
}

export function assembleQuotas(
  total: number,
  preset: Pick<
    MistressAssemblePreset,
    "likedWeight" | "dislikedWeight" | "ownWeight"
  >,
): AssembleQuotas {
  const [liked, disliked, own] = splitByWeights(total, [
    preset.likedWeight,
    preset.dislikedWeight,
    preset.ownWeight,
  ]);
  return {
    liked: liked ?? 0,
    disliked: disliked ?? 0,
    own: own ?? 0,
  };
}

export function spillOwnShortfall(
  leftover: number,
  preset: Pick<MistressAssemblePreset, "likedWeight" | "dislikedWeight">,
): { liked: number; disliked: number } {
  const [liked, disliked] = splitByWeights(leftover, [
    preset.likedWeight,
    preset.dislikedWeight,
  ]);
  return { liked: liked ?? 0, disliked: disliked ?? 0 };
}

export function perQueryCap(bucketTarget: number): number {
  return Math.max(ASSEMBLE_THIN_MIN, Math.ceil(Math.max(0, bucketTarget) / 3));
}

export function formatAssembleQuery(
  tag: string,
  kind: AssembleTagKind | "shelf",
  character: string,
): string {
  const token = tag.trim();
  if (!token) return "rating:explicit";
  if (kind === "body") {
    const who = character.trim();
    return who
      ? `${who} ${token} rating:explicit`
      : `${token} rating:explicit`;
  }
  return `${token} rating:explicit`;
}

export function assembleQueryTokens(query: string): string[] {
  return query
    .trim()
    .split(/\s+/)
    .filter((t) => t && !t.startsWith("rating:"));
}

export function isThinAssembleBatch(newUnique: number): boolean {
  return newUnique < ASSEMBLE_THIN_MIN;
}

function shuffleCopy<T>(items: readonly T[], rng: () => number): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const a = out[i]!;
    out[i] = out[j]!;
    out[j] = a;
  }
  return out;
}

function tagKey(tag: string): string {
  return `tag:${tag.trim().toLowerCase()}`;
}

function clusterKey(cluster: string): string {
  return `cluster:${cluster.trim().toLowerCase()}`;
}

export type AssemblePicker = {
  nextOwn: () => AssemblePick | null;
  fallbackOwn: () => AssemblePick | null;
  nextShelf: (bucket: "liked" | "disliked") => AssemblePick | null;
  characterRescueQuery: () => string | null;
};

export function createAssemblePicker(opts: {
  preset: MistressAssemblePreset;
  character: string;
  liked: readonly string[];
  disliked: readonly string[];
  rng?: () => number;
}): AssemblePicker {
  const rng = opts.rng ?? Math.random;
  const character = opts.character.trim();
  const used = new Set<string>();
  const ownQueue = shuffleCopy(opts.preset.tags, rng);
  let ownCursor = 0;
  let current: AssembleTag | null = null;
  let fallbackIdx = 0;

  const likedQueue = shuffleCopy(
    opts.liked.map((t) => t.trim()).filter(Boolean),
    rng,
  );
  const dislikedQueue = shuffleCopy(
    opts.disliked.map((t) => t.trim()).filter(Boolean),
    rng,
  );
  let likedCursor = 0;
  let dislikedCursor = 0;

  const mark = (tag: string, cluster?: string) => {
    used.add(tagKey(tag));
    if (cluster) used.add(clusterKey(cluster));
  };

  const taken = (tag: string, cluster?: string): boolean => {
    if (used.has(tagKey(tag))) return true;
    if (cluster && used.has(clusterKey(cluster))) return true;
    return false;
  };

  return {
    nextOwn() {
      current = null;
      fallbackIdx = 0;
      while (ownCursor < ownQueue.length) {
        const row = ownQueue[ownCursor]!;
        ownCursor += 1;
        if (taken(row.tag, row.cluster)) continue;
        mark(row.tag, row.cluster);
        current = row;
        fallbackIdx = 0;
        return {
          bucket: "own",
          query: formatAssembleQuery(row.tag, row.kind, character),
          key: row.tag,
        };
      }
      return null;
    },
    fallbackOwn() {
      if (!current) return null;
      const extras = current.fallback ?? [];
      while (fallbackIdx < extras.length) {
        const tag = extras[fallbackIdx]!;
        fallbackIdx += 1;
        if (taken(tag)) continue;
        mark(tag);
        return {
          bucket: "own",
          query: formatAssembleQuery(tag, current.kind, character),
          key: tag,
        };
      }
      return null;
    },
    nextShelf(bucket) {
      const queue = bucket === "liked" ? likedQueue : dislikedQueue;
      let cursor = bucket === "liked" ? likedCursor : dislikedCursor;
      while (cursor < queue.length) {
        const tag = queue[cursor]!;
        cursor += 1;
        if (bucket === "liked") likedCursor = cursor;
        else dislikedCursor = cursor;
        if (taken(tag)) continue;
        mark(tag);
        return {
          bucket,
          query: formatAssembleQuery(tag, "shelf", character),
          key: tag,
        };
      }
      if (bucket === "liked") likedCursor = cursor;
      else dislikedCursor = cursor;
      return null;
    },
    characterRescueQuery() {
      if (!character) return null;
      const key = tagKey(character);
      if (used.has(key)) return `${character} rating:explicit`;
      used.add(key);
      return `${character} rating:explicit`;
    },
  };
}

export type AssemblePullLog = {
  bucket: AssembleBucket | "rescue" | "recs";
  query: string;
  added: number;
};

export function assembleBucketLabelRu(
  bucket: AssemblePullLog["bucket"],
): string {
  switch (bucket) {
    case "own":
      return "её";
    case "liked":
      return "любимое";
    case "disliked":
      return "нелюбимое";
    case "rescue":
      return "запас";
    case "recs":
      return "полка";
    default: {
      const _never: never = bucket;
      return _never;
    }
  }
}

export function formatAssembleQueryLine(query: string): string {
  return query
    .replace(/\brating:explicit\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function formatAssembleNote(opts: {
  mistressName: string;
  want: number;
  got: number;
  pulls: readonly AssemblePullLog[];
}): string {
  const head = `Автоочередь ${opts.mistressName.trim() || "госпожи"} · ${opts.got} из ${opts.want}`;
  const lines = opts.pulls.map((row) => {
    const q = formatAssembleQueryLine(row.query) || row.query;
    const n = row.added > 0 ? String(row.added) : "пусто";
    return `${assembleBucketLabelRu(row.bucket)} · ${q} → ${n}`;
  });
  return [head, "", ...lines].join("\n").trim();
}

export function formatTagPullNote(opts: {
  mediaTypeLabel: string;
  tags: string;
  query: string;
  usedTags?: string;
  attempted?: readonly string[];
  got: number;
  want: number;
}): string {
  const type = opts.mediaTypeLabel.trim() || "Теги";
  const query = opts.query.trim();
  const used = (opts.usedTags ?? "").trim();
  const lines = [
    `Теги · ${type} · ${opts.got} из ${opts.want}`,
    "",
    `ввод · ${opts.tags.trim() || "—"}`,
    `запрос · ${formatAssembleQueryLine(query) || query || "—"}`,
  ];
  if (used && used !== query) {
    lines.push(`подошло · ${formatAssembleQueryLine(used) || used}`);
  }
  const attempted = opts.attempted ?? [];
  const usedIndex = used ? attempted.indexOf(used) : -1;
  const failed = usedIndex > 0 ? attempted.slice(0, usedIndex) : [];
  if (failed.length > 0) {
    lines.push("", "не подошло:");
    for (const q of failed.slice(0, 8)) {
      lines.push(`· ${formatAssembleQueryLine(q) || q}`);
    }
  }
  return lines.join("\n").trim();
}
