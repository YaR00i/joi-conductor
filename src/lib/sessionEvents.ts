import type { SessionMood, SessionParams } from "./types";
import { isHarshMood } from "./moodEngine";

export type DiceChaosOutcome =
  | "edge_ad"
  | "long_rest"
  | "extra_edges"
  | "harsher_rebuild"
  | "denial_bias"
  | "soft_mercy";

export type DiceChaosResult = {
  roll: number;
  outcome: DiceChaosOutcome;
  labelRu: string;
  speakEn: string;
};

const OUTCOMES: {
  outcome: DiceChaosOutcome;
  labelRu: string;
  speakEn: string;
}[] = [
  {
    outcome: "edge_ad",
    labelRu: "Edge-ad",
    speakEn: "Dice says edge ad — several edges, tiny rests. Suffer.",
  },
  {
    outcome: "long_rest",
    labelRu: "Hands off",
    speakEn: "Dice says hands off. Soft cock. Wait.",
  },
  {
    outcome: "extra_edges",
    labelRu: "+эджи",
    speakEn: "Dice adds edges to your quota. More control tests.",
  },
  {
    outcome: "harsher_rebuild",
    labelRu: "Жёстче",
    speakEn: "Dice turns me meaner. Session rebuilds harsher.",
  },
  {
    outcome: "denial_bias",
    labelRu: "Denial bias",
    speakEn: "Dice hates your orgasm. Finale leans denial.",
  },
  {
    outcome: "soft_mercy",
    labelRu: "Пощада",
    speakEn: "Lucky. Tiny mercy — softer odds, one less edge.",
  },
];

/** Roll 1–6 chaos outcome (Hu Tao dice event). */
export function rollDiceChaos(
  rng: () => number = Math.random,
): DiceChaosResult {
  const roll = 1 + Math.floor(rng() * 6);
  const row = OUTCOMES[roll - 1]!;
  return {
    roll,
    outcome: row.outcome,
    labelRu: row.labelRu,
    speakEn: row.speakEn,
  };
}

export function applyDenialBiasParams(params: SessionParams): SessionParams {
  return {
    ...params,
    pCum: Math.max(0, params.pCum - 0.2),
    pRuin: Math.min(0.55, params.pRuin + 0.05),
    // No hollow edgesTarget bump — denial is a finale bias, not unpaid edges
  };
}

export function applySoftMercyParams(params: SessionParams): SessionParams {
  return {
    ...params,
    pCum: Math.min(0.65, params.pCum + 0.1),
    edgesTarget: Math.max(1, params.edgesTarget - 1),
  };
}

export function applyFinaleBiasParams(
  params: SessionParams,
  effect: "finale_want_cum" | "finale_want_deny" | "finale_want_ruin",
): SessionParams {
  switch (effect) {
    case "finale_want_cum":
      return {
        ...params,
        pCum: Math.min(0.75, params.pCum + 0.2),
        pRuin: Math.max(0.05, params.pRuin - 0.05),
      };
    case "finale_want_deny":
      return {
        ...params,
        pCum: 0,
        pRuin: Math.min(0.35, params.pRuin),
      };
    case "finale_want_ruin":
      return {
        ...params,
        pCum: Math.max(0, params.pCum - 0.1),
        pRuin: Math.min(0.7, params.pRuin + 0.25),
      };
    default: {
      const _exhaustive: never = effect;
      return _exhaustive;
    }
  }
}

export function applyBegPleaseParams(params: SessionParams): SessionParams {
  return {
    ...params,
    pCum: Math.min(0.7, params.pCum + 0.15),
  };
}

export function applyBegDenyWantParams(params: SessionParams): SessionParams {
  return {
    ...params,
    pCum: 0,
    pRuin: Math.min(0.4, params.pRuin),
  };
}

/** Default post-session denial from mood / unauthorized cum. */
export function denialQuestFromMood(mood: SessionMood): {
  hours: number;
  edges: number;
} {
  if (isHarshMood(mood) || mood === "bored") {
    return { hours: 6, edges: 4 };
  }
  if (mood === "horny") {
    return { hours: 3, edges: 3 };
  }
  return { hours: 2, edges: 2 };
}
