import type {
  BeatPatternDef,
  CumplayDef,
  FinishDef,
  FunctionDef,
  ToyComboDef,
  ToyDef,
} from "./types";

import functionsData from "../../data/functions.json";
import patternsData from "../../data/patterns.json";
import finishData from "../../data/finish.json";
import cumplayData from "../../data/cumplay.json";
import toysData from "../../data/toys.json";
import { coerceCumplayForFinish } from "./finishCumplayCompat";

export const functions: FunctionDef[] = functionsData.functions as FunctionDef[];
export const patterns: BeatPatternDef[] =
  patternsData.patterns as BeatPatternDef[];
export const finishOptions: FinishDef[] = finishData.finish as FinishDef[];
export const cumplayOptions: CumplayDef[] =
  cumplayData.cumplay as CumplayDef[];
export const toys: ToyDef[] = toysData.toys as ToyDef[];
export const toyCombos: ToyComboDef[] = ((
  toysData as { combos?: ToyComboDef[] }
).combos ?? []) as ToyComboDef[];

export function getFunction(id: string): FunctionDef | undefined {
  return functions.find((f) => f.id === id);
}

export function getPattern(id: string): BeatPatternDef | undefined {
  return patterns.find((p) => p.id === id);
}

export function getFinish(id: string): FinishDef | undefined {
  return finishOptions.find((f) => f.id === id);
}

export function getCumplay(id: string): CumplayDef | undefined {
  return cumplayOptions.find((c) => c.id === id);
}

/** Drop disabled / incompatible finish / cumplay ids from saved or preset params. */
export function sanitizeSessionParams<T extends { finishId: string; cumplayId: string }>(
  params: T,
): T {
  const finishOk = finishOptions.some(
    (f) => f.enabled && f.id === params.finishId,
  );
  const finishId = finishOk
    ? params.finishId
    : (finishOptions.find((f) => f.enabled)?.id ?? "hand");
  const cumEnabled = cumplayOptions.some(
    (c) => c.enabled && c.id === params.cumplayId,
  );
  const cumplayId = cumEnabled
    ? coerceCumplayForFinish(params.cumplayId, finishId)
    : coerceCumplayForFinish("none", finishId);
  if (finishId === params.finishId && cumplayId === params.cumplayId) {
    return params;
  }
  return { ...params, finishId, cumplayId };
}

export function getToy(id: string): ToyDef | undefined {
  return toys.find((t) => t.id === id);
}
