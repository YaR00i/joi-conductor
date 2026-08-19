import { getActiveMistress } from "./activeMistress";
import type { MistressId } from "./types";

/** Param groups that mistress packs can ban / reweight / replace. */
export type MistressRouletteParamGroup =
  | "mood"
  | "mode"
  | "duration"
  | "edges"
  | "ruins"
  | "finaleOdds"
  | "bpm";

export type MistressRouletteOptionDef = {
  id: string;
  labelRu: string;
  weight?: number;
  sec?: number;
  n?: number;
  /** Inclusive edges/ruins band (preferred over fixed `n`). */
  nMin?: number;
  nMax?: number;
  bpmMin?: number;
  bpmMax?: number;
  pCum?: number;
  pRuin?: number;
};

/**
 * Hard gates + soft weights + full pool replacements for roulette / Plan / settings.
 */
export type MistressRouletteBias = {
  summaryRu?: string;
  bannedIds: Partial<
    Record<MistressRouletteParamGroup, readonly string[]>
  >;
  weightMult: Partial<
    Record<MistressRouletteParamGroup, Record<string, number>>
  >;
  /**
   * Full replacement of the default wheel for this group (when user has no
   * custom paramPools override). Numbers/difficulty shift with the pack.
   */
  replacePools?: Partial<
    Record<MistressRouletteParamGroup, MistressRouletteOptionDef[]>
  >;
  extraOptions?: Partial<
    Record<MistressRouletteParamGroup, MistressRouletteOptionDef[]>
  >;
  minDurationSec?: number;
  minEdges?: number;
  minRuins?: number;
  maxPCum?: number;
  minPRuin?: number;
  /** Plan wheel upper bounds (minutes / counts / %). */
  planDurationMaxMin?: number;
  planEdgesMax?: number;
  planRuinsMax?: number;
};

export type PlanWheelLimits = {
  durationMinMin: number;
  durationMaxMin: number;
  edgesMin: number;
  edgesMax: number;
  ruinsMin: number;
  ruinsMax: number;
  pCumMinPct: number;
  pCumMaxPct: number;
  pRuinMinPct: number;
  pRuinMaxPct: number;
};

export const EMPTY_ROULETTE_BIAS: MistressRouletteBias = {
  bannedIds: {},
  weightMult: {},
};

/** Hu Tao — baseline; keep default catalog, soft weights only. */
export const HU_TAO_ROULETTE_BIAS: MistressRouletteBias = {
  summaryRu: "Классика: дрочка руками + онахол.",
  bannedIds: {
    mode: ["cbt", "oral", "prone", "plapping"],
  },
  weightMult: {
    mode: { stroke: 1.25, anal: 0.95, chastity: 0.8, onahole: 1.45 },
    mood: {
      sweet: 1.15,
      horny: 1.1,
      calm: 1,
      bored: 0.95,
      cruel: 1,
      chaotic: 0.95,
    },
    finaleOdds: {
      mercy: 1.1,
      balanced: 1.2,
      mean: 0.95,
      denial: 0.85,
    },
  },
};

/**
 * Furina Tide — replaced hard pools (no soft slices in the list at all).
 */
export const FURINA_ROULETTE_BIAS: MistressRouletteBias = {
  summaryRu:
    "Суд Tide: свои пулы · ≥10 мин · ≥5 эджей · ≥1 руин · cum ≤50% · без sweet/slow.",
  bannedIds: {
    mood: ["sweet"],
    bpm: ["slow"],
    mode: ["onahole", "oral", "plapping"],
  },
  weightMult: {
    mood: {
      cruel: 1.55,
      calm: 1.2,
      chaotic: 1.15,
      horny: 1.1,
      bored: 0.85,
    },
    mode: {
      stroke: 0.45,
      anal: 0.85,
      chastity: 0.7,
      cbt: 1.65,
      prone: 1.5,
      oral: 0.2,
      onahole: 0.2,
    },
  },
  replacePools: {
    duration: [
      { id: "600", labelRu: "10 мин", weight: 0.85, sec: 600 },
      { id: "720", labelRu: "12 мин", weight: 1.2, sec: 720 },
      { id: "900", labelRu: "15 мин", weight: 1.4, sec: 900 },
      { id: "1200", labelRu: "20 мин", weight: 1.25, sec: 1200 },
      { id: "1500", labelRu: "25 мин", weight: 1.0, sec: 1500 },
    ],
    edges: [
      { id: "e_4_6", labelRu: "4–6 эджей", weight: 0.95, nMin: 4, nMax: 6 },
      { id: "e_5_8", labelRu: "5–8 эджей", weight: 1.25, nMin: 5, nMax: 8 },
      { id: "e_7_10", labelRu: "7–10 эджей", weight: 1.35, nMin: 7, nMax: 10 },
      { id: "e_9_12", labelRu: "9–12 эджей", weight: 1.15, nMin: 9, nMax: 12 },
    ],
    ruins: [
      { id: "r_1_2", labelRu: "1–2 руина", weight: 1.25, nMin: 1, nMax: 2 },
      { id: "r_2_3", labelRu: "2–3 руина", weight: 1.35, nMin: 2, nMax: 3 },
      { id: "r_2_4", labelRu: "2–4 руина", weight: 1.05, nMin: 2, nMax: 4 },
    ],
    finaleOdds: [
      {
        id: "balanced",
        labelRu: "Баланс (≤50%)",
        weight: 1.1,
        pCum: 0.45,
        pRuin: 0.32,
      },
      {
        id: "mean",
        labelRu: "Жёсткий",
        weight: 1.35,
        pCum: 0.28,
        pRuin: 0.4,
      },
      {
        id: "denial",
        labelRu: "Denial",
        weight: 1.25,
        pCum: 0.08,
        pRuin: 0.3,
      },
      {
        id: "verdict",
        labelRu: "Приговор суда",
        weight: 1.2,
        pCum: 0.18,
        pRuin: 0.42,
      },
    ],
    bpm: [
      {
        id: "mid",
        labelRu: "Средне 60–120",
        weight: 1.15,
        bpmMin: 60,
        bpmMax: 120,
      },
      {
        id: "fast",
        labelRu: "Быстро 80–140",
        weight: 1.3,
        bpmMin: 80,
        bpmMax: 140,
      },
      {
        id: "harsh",
        labelRu: "Суд 90–150",
        weight: 1.15,
        bpmMin: 90,
        bpmMax: 150,
      },
    ],
  },
  minDurationSec: 600,
  minEdges: 5,
  minRuins: 1,
  maxPCum: 0.5,
  minPRuin: 0.28,
  planDurationMaxMin: 90,
  planEdgesMax: 30,
  planRuinsMax: 15,
};

/** Sunna — softer replaced pools. */
export const SUNNA_ROULETTE_BIAS: MistressRouletteBias = {
  summaryRu:
    "Idol Soft: vibe/oral/клетка/plapping · без hand-stroke · soft finale.",
  bannedIds: {
    mode: ["stroke", "onahole", "cbt", "prone"],
  },
  weightMult: {
    mode: {
      chastity: 1.55,
      oral: 1.75,
      plapping: 1.65,
      anal: 0.55,
      stroke: 0.15,
      onahole: 0.1,
      cbt: 0.1,
      prone: 0.1,
    },
    mood: {
      sweet: 1.4,
      horny: 1.3,
      calm: 1.1,
      bored: 1.05,
      cruel: 0.65,
      chaotic: 0.7,
    },
  },
  replacePools: {
    duration: [
      { id: "300", labelRu: "5 мин", weight: 1.1, sec: 300 },
      { id: "420", labelRu: "7 мин", weight: 1.25, sec: 420 },
      { id: "600", labelRu: "10 мин", weight: 1.3, sec: 600 },
      { id: "720", labelRu: "12 мин", weight: 1.0, sec: 720 },
      { id: "900", labelRu: "15 мин", weight: 0.75, sec: 900 },
    ],
    edges: [
      { id: "e_2_4", labelRu: "2–4 эджа", weight: 1.2, nMin: 2, nMax: 4 },
      { id: "e_3_5", labelRu: "3–5 эджей", weight: 1.3, nMin: 3, nMax: 5 },
      { id: "e_4_6", labelRu: "4–6 эджей", weight: 1.15, nMin: 4, nMax: 6 },
      { id: "e_5_7", labelRu: "5–7 эджей", weight: 0.9, nMin: 5, nMax: 7 },
    ],
    ruins: [
      { id: "r_0_0", labelRu: "Без руинов", weight: 1.35, nMin: 0, nMax: 0 },
      { id: "r_0_1", labelRu: "0–1 руин", weight: 1.15, nMin: 0, nMax: 1 },
      { id: "r_1_2", labelRu: "1–2 руина", weight: 0.7, nMin: 1, nMax: 2 },
    ],
    finaleOdds: [
      {
        id: "mercy",
        labelRu: "Мягкий (cum↑)",
        weight: 1.4,
        pCum: 0.7,
        pRuin: 0.15,
      },
      {
        id: "balanced",
        labelRu: "Баланс",
        weight: 1.2,
        pCum: 0.55,
        pRuin: 0.22,
      },
      {
        id: "mean",
        labelRu: "Жёсткий",
        weight: 0.7,
        pCum: 0.35,
        pRuin: 0.3,
      },
      {
        id: "denial",
        labelRu: "Denial",
        weight: 0.5,
        pCum: 0.12,
        pRuin: 0.2,
      },
    ],
    bpm: [
      {
        id: "slow",
        labelRu: "Медленно 50–90",
        weight: 1.3,
        bpmMin: 50,
        bpmMax: 90,
      },
      {
        id: "mid",
        labelRu: "Средне 60–120",
        weight: 1.2,
        bpmMin: 60,
        bpmMax: 120,
      },
      {
        id: "fast",
        labelRu: "Быстро 80–140",
        weight: 0.75,
        bpmMin: 80,
        bpmMax: 140,
      },
    ],
  },
  maxPCum: 0.75,
  minPRuin: 0.12,
  planDurationMaxMin: 60,
  planEdgesMax: 12,
  planRuinsMax: 5,
};

/** Sparkle — hard replaced pools. */
export const SPARKLE_ROULETTE_BIAS: MistressRouletteBias = {
  summaryRu:
    "Mask Circus: анал/клетка↑ · свои пулы · ≥1 руин · cum ≤45% · без sweet/onahole.",
  bannedIds: {
    mood: ["sweet"],
    mode: ["onahole", "plapping"],
  },
  weightMult: {
    mode: {
      anal: 1.7,
      chastity: 1.55,
      stroke: 0.45,
      cbt: 0.9,
      oral: 0.4,
      plapping: 0.1,
    },
    mood: {
      chaotic: 1.55,
      cruel: 1.35,
      horny: 1.2,
      bored: 1.05,
      calm: 0.8,
    },
  },
  replacePools: {
    duration: [
      { id: "600", labelRu: "10 мин", weight: 0.9, sec: 600 },
      { id: "720", labelRu: "12 мин", weight: 1.15, sec: 720 },
      { id: "900", labelRu: "15 мин", weight: 1.35, sec: 900 },
      { id: "1200", labelRu: "20 мин", weight: 1.3, sec: 1200 },
      { id: "1500", labelRu: "25 мин", weight: 1.1, sec: 1500 },
    ],
    edges: [
      { id: "e_4_6", labelRu: "4–6 эджей", weight: 0.95, nMin: 4, nMax: 6 },
      { id: "e_5_8", labelRu: "5–8 эджей", weight: 1.2, nMin: 5, nMax: 8 },
      { id: "e_6_9", labelRu: "6–9 эджей", weight: 1.35, nMin: 6, nMax: 9 },
      { id: "e_8_12", labelRu: "8–12 эджей", weight: 1.25, nMin: 8, nMax: 12 },
    ],
    ruins: [
      { id: "r_1_2", labelRu: "1–2 руина", weight: 1.2, nMin: 1, nMax: 2 },
      { id: "r_2_3", labelRu: "2–3 руина", weight: 1.4, nMin: 2, nMax: 3 },
      { id: "r_2_4", labelRu: "2–4 руина", weight: 1.15, nMin: 2, nMax: 4 },
    ],
    finaleOdds: [
      {
        id: "balanced",
        labelRu: "Баланс",
        weight: 0.95,
        pCum: 0.4,
        pRuin: 0.32,
      },
      {
        id: "mean",
        labelRu: "Жёсткий",
        weight: 1.3,
        pCum: 0.25,
        pRuin: 0.4,
      },
      {
        id: "denial",
        labelRu: "Denial",
        weight: 1.45,
        pCum: 0.08,
        pRuin: 0.35,
      },
      {
        id: "glitch",
        labelRu: "Глитч-финал",
        weight: 1.2,
        pCum: 0.15,
        pRuin: 0.45,
      },
    ],
    bpm: [
      {
        id: "mid",
        labelRu: "Средне 60–120",
        weight: 1.1,
        bpmMin: 60,
        bpmMax: 120,
      },
      {
        id: "fast",
        labelRu: "Быстро 80–140",
        weight: 1.35,
        bpmMin: 80,
        bpmMax: 140,
      },
      {
        id: "chaos",
        labelRu: "Хаос 100–160",
        weight: 1.2,
        bpmMin: 100,
        bpmMax: 160,
      },
    ],
  },
  minDurationSec: 600,
  minEdges: 4,
  minRuins: 1,
  maxPCum: 0.45,
  minPRuin: 0.3,
  planDurationMaxMin: 90,
  planEdgesMax: 30,
  planRuinsMax: 15,
};

const BY_ID: Record<MistressId, MistressRouletteBias> = {
  hu_tao: HU_TAO_ROULETTE_BIAS,
  furina: FURINA_ROULETTE_BIAS,
  sunna: SUNNA_ROULETTE_BIAS,
  sparkle: SPARKLE_ROULETTE_BIAS,
};

export function getRouletteBias(
  id: MistressId = getActiveMistress().id,
): MistressRouletteBias {
  return BY_ID[id] ?? EMPTY_ROULETTE_BIAS;
}

export function getActiveRouletteBias(): MistressRouletteBias {
  return getRouletteBias(getActiveMistress().id);
}

export function isRouletteOptionBanned(
  group: MistressRouletteParamGroup,
  optionId: string,
  bias: MistressRouletteBias = getActiveRouletteBias(),
): boolean {
  return (bias.bannedIds[group] ?? []).includes(optionId);
}

/** Plan / manual editor limits from active (or given) bias. */
export function getPlanWheelLimits(
  bias: MistressRouletteBias = getActiveRouletteBias(),
): PlanWheelLimits {
  const durationMinMin = Math.max(
    5,
    Math.round((bias.minDurationSec ?? 300) / 60),
  );
  const durationMaxMin = Math.max(
    durationMinMin,
    bias.planDurationMaxMin ?? 90,
  );
  const edgesMin = bias.minEdges ?? 0;
  const edgesMax = Math.max(edgesMin, bias.planEdgesMax ?? 30);
  const ruinsMin = bias.minRuins ?? 0;
  const ruinsMax = Math.max(ruinsMin, bias.planRuinsMax ?? 15);
  const pCumMaxPct = Math.round((bias.maxPCum ?? 1) * 100);
  const pRuinMinPct = Math.round((bias.minPRuin ?? 0) * 100);
  return {
    durationMinMin,
    durationMaxMin,
    edgesMin,
    edgesMax,
    ruinsMin,
    ruinsMax,
    pCumMinPct: 0,
    pCumMaxPct: Math.max(0, Math.min(100, pCumMaxPct)),
    pRuinMinPct: Math.max(0, Math.min(100, pRuinMinPct)),
    pRuinMaxPct: 100,
  };
}

export type ApplyPoolOption = MistressRouletteOptionDef & { weight?: number };

/**
 * Filter banned ids, apply weight multipliers, clamp finale payloads,
 * drop options below absolute floors, inject extras.
 * When `replacePools` is set for the group, callers should pass that as `pool`.
 */
export function applyMistressParamPool<T extends ApplyPoolOption>(
  group: MistressRouletteParamGroup,
  pool: T[],
  bias: MistressRouletteBias = getActiveRouletteBias(),
): T[] {
  const banned = new Set(bias.bannedIds[group] ?? []);
  const mult = bias.weightMult[group] ?? {};

  const mapped = pool
    .filter((o) => !banned.has(o.id))
    .map((o) => {
      const copy: T = { ...o };
      const m = mult[o.id];
      if (m != null) {
        copy.weight = (copy.weight ?? 1) * m;
      }

      if (group === "duration") {
        const sec = copy.sec ?? Number(copy.id);
        if (
          bias.minDurationSec != null &&
          Number.isFinite(sec) &&
          sec < bias.minDurationSec
        ) {
          return null;
        }
      }
      if (group === "edges") {
        const lo = copy.nMin ?? copy.n ?? Number(copy.id);
        const hi = copy.nMax ?? copy.n ?? lo;
        const top = Math.max(lo, hi);
        if (
          bias.minEdges != null &&
          Number.isFinite(top) &&
          top < bias.minEdges
        ) {
          return null;
        }
      }
      if (group === "ruins") {
        const lo = copy.nMin ?? copy.n ?? Number(copy.id);
        const hi = copy.nMax ?? copy.n ?? lo;
        const top = Math.max(lo, hi);
        if (
          bias.minRuins != null &&
          Number.isFinite(top) &&
          top < bias.minRuins
        ) {
          return null;
        }
      }
      if (group === "finaleOdds") {
        if (typeof copy.pCum === "number" && bias.maxPCum != null) {
          copy.pCum = Math.min(copy.pCum, bias.maxPCum);
        }
        if (typeof copy.pRuin === "number" && bias.minPRuin != null) {
          copy.pRuin = Math.max(copy.pRuin, bias.minPRuin);
        }
        if (typeof copy.pCum === "number" && typeof copy.pRuin === "number") {
          copy.pRuin = Math.min(copy.pRuin, Math.max(0, 1 - copy.pCum));
        }
      }
      return copy;
    })
    .filter((o): o is T => o != null);

  // Only inject extras when not using a full replace pool for this group
  const usingReplace = (bias.replacePools?.[group]?.length ?? 0) > 0;
  if (usingReplace) return mapped;

  const extras = bias.extraOptions?.[group] ?? [];
  const out = [...mapped];
  for (const extra of extras) {
    if (banned.has(extra.id)) continue;
    if (out.some((o) => o.id === extra.id)) continue;
    const withWeight: T = {
      ...(extra as T),
      weight: (extra.weight ?? 1) * (mult[extra.id] ?? 1),
    };
    if (group === "duration" && bias.minDurationSec != null) {
      const sec = withWeight.sec ?? Number(withWeight.id);
      if (Number.isFinite(sec) && sec < bias.minDurationSec) continue;
    }
    out.push(withWeight);
  }
  return out;
}

/** Default pool for a group before user custom overrides (mistress-aware). */
export function mistressDefaultParamPool(
  group: MistressRouletteParamGroup,
  bias: MistressRouletteBias = getActiveRouletteBias(),
): MistressRouletteOptionDef[] {
  const replaced = bias.replacePools?.[group];
  if (replaced && replaced.length > 0) {
    return replaced.map((o) => ({ ...o }));
  }
  return [];
}

/** Clamp finale odds after mood / pack gates. */
export function clampFinaleOddsForMistress(
  odds: { pCum: number; pRuin: number },
  bias: MistressRouletteBias = getActiveRouletteBias(),
): { pCum: number; pRuin: number } {
  let pCum = odds.pCum;
  let pRuin = odds.pRuin;
  if (bias.maxPCum != null) pCum = Math.min(pCum, bias.maxPCum);
  if (bias.minPRuin != null) pRuin = Math.max(pRuin, bias.minPRuin);
  pCum = Math.max(0, Math.min(1, pCum));
  pRuin = Math.max(0, Math.min(1 - pCum, pRuin));
  return { pCum, pRuin };
}

/** Enforce duration / edges / ruins floors on session params. */
export function enforceRouletteFloors(
  params: {
    durationSec: number;
    edgesTarget: number;
    ruinsTarget: number;
  },
  bias: MistressRouletteBias = getActiveRouletteBias(),
): {
  durationSec: number;
  edgesTarget: number;
  ruinsTarget: number;
} {
  return {
    durationSec: Math.max(params.durationSec, bias.minDurationSec ?? 0),
    edgesTarget: Math.max(params.edgesTarget, bias.minEdges ?? 0),
    ruinsTarget: Math.max(params.ruinsTarget, bias.minRuins ?? 0),
  };
}
