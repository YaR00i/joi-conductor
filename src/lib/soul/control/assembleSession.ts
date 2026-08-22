import { toys as catalogToys } from "../../catalog";
import { applyMoodToSessionParams } from "../../moodScale";
import { moodFromScore } from "../../moodEngine";
import { listFavoriteRecords } from "../../mediaFavorites";
import { buildFavoriteTasteProfile } from "../../favoriteTagTaste";
import {
  applyRoulettePicks,
  buildPlanRouletteSteps,
  pickWeightedOption,
  type PlanRouletteResult,
  type RouletteOption,
  type RouletteStepId,
} from "../../planRoulette";
import { loadRouletteSettings } from "../../rouletteSettings";
import { readLiveWearGate } from "../../sessionLiveGates";
import { buildMoodFetishTagStep } from "../../tagRoulette";
import { loadWallet } from "../../wallet";
import { DEFAULT_PARAMS, type SessionMood, type SessionParams } from "../../types";
import { loadControlState } from "./store";
import type { MistressId } from "../../mistress/types";

function isSessionMood(id: string): id is SessionMood {
  return (
    id === "sweet" ||
    id === "cruel" ||
    id === "calm" ||
    id === "chaotic" ||
    id === "horny" ||
    id === "bored"
  );
}

export async function assembleProgramSession(
  mistressId: MistressId,
  base: SessionParams = DEFAULT_PARAMS,
  rng: () => number = Math.random,
): Promise<PlanRouletteResult> {
  const state = loadControlState(mistressId);
  const mood = moodFromScore(state.moodScore);
  const unlocks = loadWallet().unlocks;
  const settings = loadRouletteSettings();
  const steps = buildPlanRouletteSteps(settings, unlocks, base.finishId);
  const records = await listFavoriteRecords();
  const taste = buildFavoriteTasteProfile(records);
  const gate = readLiveWearGate();

  const picks: Partial<Record<RouletteStepId, RouletteOption>> = {};
  const moodStep = steps.find((s) => s.id === "mood");
  const moodOpt = moodStep?.options.find((o) => o.id === mood);
  picks.mood = moodOpt ?? {
    id: mood,
    labelRu: mood,
    unlocked: true,
    weight: 1,
  };

  for (const step of steps) {
    if (step.id === "mood") continue;
    if (step.id === "tags") {
      const rebuilt = buildMoodFetishTagStep(mood, taste, unlocks, settings);
      if (rebuilt.options.length > 0) {
        picks.tags = pickWeightedOption(rebuilt.options, rng);
      }
      continue;
    }
    if (step.options.length === 0) continue;
    picks[step.id] = pickWeightedOption(step.options, rng);
  }

  const result = applyRoulettePicks(picks, base, rng, catalogToys);
  let params = applyMoodToSessionParams(result.params, state.moodScore);
  if (gate.denialOn) {
    params = { ...params, pCum: 0, pRuin: Math.min(params.pRuin, 0.12) };
  }
  if (gate.wearKind === "plug") {
    const toys = [...result.sessionToyIds.filter((id) => id !== "__none__")];
    if (!toys.includes("plug") && !toys.includes("vibrating_plug")) {
      toys.push("plug");
    }
    params = { ...params, allowedToyIds: toys };
    return {
      ...result,
      mood: isSessionMood(result.mood) ? result.mood : mood,
      moodScore: state.moodScore,
      params,
      sessionToyIds: toys,
    };
  }
  return {
    ...result,
    mood,
    moodScore: state.moodScore,
    params,
  };
}
