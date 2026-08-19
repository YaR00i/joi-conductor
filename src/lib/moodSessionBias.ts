import type { SessionMood, SessionParams } from "./types";

/** Multipliers for mid-session edge / ruin rolls. */
export function moodEdgeChanceMult(mood: SessionMood): number {
  switch (mood) {
    case "sweet":
      // Soft mood: fewer random edges, but buildQueue fill-pass still hits quota
      return 0.9;
    case "calm":
      return 0.95;
    case "horny":
      return 1.25;
    case "bored":
      return 1.35;
    case "cruel":
      return 1.55;
    case "chaotic":
      return 1.7;
    default: {
      const _exhaustive: never = mood;
      return _exhaustive;
    }
  }
}

export function moodRuinChanceMult(mood: SessionMood): number {
  switch (mood) {
    case "sweet":
      return 0.7;
    case "calm":
      return 0.85;
    case "horny":
      return 1.1;
    case "bored":
      return 1.2;
    case "cruel":
      return 1.4;
    case "chaotic":
      return 1.55;
    default: {
      const _exhaustive: never = mood;
      return _exhaustive;
    }
  }
}

/** Chance that a rolled edge expands into an edge-ad cluster. */
export function moodEdgeAdChance(mood: SessionMood): number {
  switch (mood) {
    case "sweet":
      return 0.1;
    case "calm":
      return 0.14;
    case "horny":
      return 0.26;
    case "bored":
      return 0.32;
    case "cruel":
      return 0.42;
    case "chaotic":
      return 0.5;
    default: {
      const _exhaustive: never = mood;
      return _exhaustive;
    }
  }
}

export type EdgeAdPlan = {
  edges: number;
  pauseSec: number;
};

/** Size of an edge-ad: several edges with short rests between. */
export function moodEdgeAdPlan(
  mood: SessionMood,
  rng: () => number = Math.random,
): EdgeAdPlan {
  switch (mood) {
    case "sweet":
    case "calm":
      return {
        edges: 2,
        pauseSec: 12 + Math.floor(rng() * 6),
      };
    case "horny":
      return {
        edges: rng() < 0.45 ? 3 : 2,
        pauseSec: 8 + Math.floor(rng() * 5),
      };
    case "bored":
      return {
        edges: 3,
        pauseSec: 9 + Math.floor(rng() * 4),
      };
    case "cruel":
      return {
        edges: rng() < 0.5 ? 4 : 3,
        pauseSec: 6 + Math.floor(rng() * 3),
      };
    case "chaotic":
      return {
        edges: 3 + Math.floor(rng() * 3),
        pauseSec: 5 + Math.floor(rng() * 4),
      };
    default: {
      const _exhaustive: never = mood;
      return _exhaustive;
    }
  }
}

/**
 * One-shot param tweak when the user accepts a mood offer.
 * Applied before rebuildTail so the new queue feels the change.
 */
export function paramsAfterMoodOffer(
  params: SessionParams,
  effect: "mood_harsher" | "mood_softer" | "mood_horny",
): SessionParams {
  switch (effect) {
    case "mood_harsher":
      return {
        ...params,
        edgesTarget: params.edgesTarget + 2,
        ruinsTarget: Math.min(params.ruinsTarget + 1, 3),
        pCum: Math.max(0, params.pCum - 0.15),
        pRuin: Math.min(0.55, params.pRuin + 0.08),
        bpmMin: Math.min(params.bpmMax - 5, params.bpmMin + 8),
        bpmMax: Math.min(140, params.bpmMax + 8),
        blockSecMin: Math.max(20, params.blockSecMin - 3),
      };
    case "mood_softer":
      return {
        ...params,
        edgesTarget: Math.max(1, params.edgesTarget - 1),
        pCum: Math.min(0.65, params.pCum + 0.12),
        pRuin: Math.max(0.1, params.pRuin - 0.05),
        bpmMin: Math.max(40, params.bpmMin - 5),
        bpmMax: Math.max(params.bpmMin + 10, params.bpmMax - 5),
      };
    case "mood_horny":
      return {
        ...params,
        edgesTarget: params.edgesTarget + 1,
        pCum: Math.min(0.55, params.pCum + 0.05),
        bpmMin: Math.min(params.bpmMax - 5, params.bpmMin + 5),
        bpmMax: Math.min(130, params.bpmMax + 5),
      };
    default: {
      const _exhaustive: never = effect;
      return _exhaustive;
    }
  }
}

/** Scale timed-dare seconds by mood (harsh = shorter / meaner). */
export function moodScaleTaskSec(taskSec: number, mood: SessionMood): number {
  switch (mood) {
    case "sweet":
      return Math.round(taskSec * 1.15);
    case "calm":
      return taskSec;
    case "horny":
      return Math.round(taskSec * 0.95);
    case "bored":
      return Math.round(taskSec * 0.9);
    case "cruel":
      return Math.round(taskSec * 0.8);
    case "chaotic":
      return Math.max(5, Math.round(taskSec * 0.75));
    default: {
      const _exhaustive: never = mood;
      return _exhaustive;
    }
  }
}

/** Chance a stroke slot becomes a timed hold-on-edge. */
export function moodHoldChance(mood: SessionMood): number {
  switch (mood) {
    case "sweet":
      return 0.08;
    case "calm":
      return 0.12;
    case "horny":
      return 0.18;
    case "bored":
      return 0.2;
    case "cruel":
      return 0.28;
    case "chaotic":
      return 0.22;
    default: {
      const _exhaustive: never = mood;
      return _exhaustive;
    }
  }
}

export function moodHoldSec(
  mood: SessionMood,
  rng: () => number = Math.random,
): number {
  switch (mood) {
    case "sweet":
    case "calm":
      return 12 + Math.floor(rng() * 8);
    case "horny":
      return 15 + Math.floor(rng() * 10);
    case "bored":
      return 18 + Math.floor(rng() * 8);
    case "cruel":
    case "chaotic":
      return 20 + Math.floor(rng() * 15);
    default: {
      const _exhaustive: never = mood;
      return _exhaustive;
    }
  }
}

/** Chance to insert a countdown burst block. */
export function moodCountdownChance(mood: SessionMood): number {
  switch (mood) {
    case "sweet":
      return 0.06;
    case "calm":
      return 0.1;
    case "horny":
      return 0.16;
    case "bored":
      return 0.14;
    case "cruel":
      return 0.2;
    case "chaotic":
      return 0.24;
    default: {
      const _exhaustive: never = mood;
      return _exhaustive;
    }
  }
}

/** Chance to insert a stroke-ladder cluster. */
export function moodLadderChance(mood: SessionMood): number {
  switch (mood) {
    case "sweet":
      return 0.05;
    case "calm":
      return 0.08;
    case "horny":
      return 0.18;
    case "bored":
      return 0.12;
    case "cruel":
      return 0.16;
    case "chaotic":
      return 0.22;
    default: {
      const _exhaustive: never = mood;
      return _exhaustive;
    }
  }
}
