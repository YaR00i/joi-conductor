/**
 * Shared contract text + instantiate. Board, series snapshot and editor
 * preview must use this leaf — do not copy fill/roll formulas.
 */

import type { MistressId } from "../mistress/types";
import {
  getContractDef,
  type ContractDef,
  type ContractRollKey,
} from "./catalog";
import { endOfLocalDayMs } from "./contractTime";
import type { ContractInstance } from "./dailyBoard";
import {
  MEDIA_DRILL_FOCUS_TAGS,
  MEDIA_DRILL_TRIGGERS,
  rollMediaDrillAction,
  timerMinForLimit,
} from "./mediaDrill";

export function fillContractTemplate(
  template: string,
  params: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => {
    const v = params[key];
    return v == null ? `{${key}}` : String(v);
  });
}

export function unresolvedPlaceholders(
  template: string,
  params: Record<string, string | number>,
): string[] {
  const found: string[] = [];
  const seen = new Set<string>();
  template.replace(/\{(\w+)\}/g, (_, key: string) => {
    if (params[key] == null && !seen.has(key)) {
      seen.add(key);
      found.push(key);
    }
    return "";
  });
  return found;
}

export function rollContractParams(
  def: ContractDef,
  rng: () => number,
): Record<string, string | number> {
  const params: Record<string, string | number> = {};
  const rolls = def.rolls;
  if (!rolls) return params;
  for (const key of Object.keys(rolls) as ContractRollKey[]) {
    const pool = rolls[key];
    if (!pool || pool.length === 0) continue;
    params[key] = pool[Math.floor(rng() * pool.length)]!;
  }
  return params;
}

export function rollContractReward(def: ContractDef, rng: () => number): number {
  const lo = Math.min(def.rewardMin, def.rewardMax);
  const hi = Math.max(def.rewardMin, def.rewardMax);
  return lo + Math.floor(rng() * (hi - lo + 1));
}

export function instantiateMediaDrill(
  def: ContractDef,
  dayKey: string,
  mistressId: MistressId,
  rng: () => number,
  paramOverrides?: Record<string, string | number>,
): ContractInstance {
  const limitPool = (def.rolls?.limit as number[] | undefined) ?? [
    20, 40, 60, 80,
  ];
  const limit = limitPool[Math.floor(rng() * limitPool.length)]!;
  const tag =
    MEDIA_DRILL_FOCUS_TAGS[
      Math.floor(rng() * MEDIA_DRILL_FOCUS_TAGS.length)
    ]!;
  const trigger =
    MEDIA_DRILL_TRIGGERS[Math.floor(rng() * MEDIA_DRILL_TRIGGERS.length)]!;
  const action = rollMediaDrillAction(rng);
  const timerMin = timerMinForLimit(limit);
  const params: Record<string, string | number> = {
    limit,
    tag,
    trigger,
    actionLabel: action.actionRu,
    actionKind: action.actionKind,
    actionN: action.actionN,
    timerMin,
    ...paramOverrides,
  };
  return {
    instanceId: `${dayKey}-${def.id}-${Math.floor(rng() * 1e9)}`,
    defId: def.id,
    dayKey,
    mistressId,
    category: def.category,
    titleRu: def.nameRu,
    bodyRu: fillContractTemplate(def.instructionRu, params),
    reward: rollContractReward(def, rng),
    deadlineMs: endOfLocalDayMs(dayKey),
    status: "open",
    params,
    difficulty: def.difficulty,
  };
}

export function instantiateContract(
  def: ContractDef,
  dayKey: string,
  mistressId: MistressId,
  rng: () => number,
  paramOverrides?: Record<string, string | number>,
): ContractInstance {
  if (def.kind === "media_drill") {
    return instantiateMediaDrill(def, dayKey, mistressId, rng, paramOverrides);
  }
  const params = { ...rollContractParams(def, rng), ...paramOverrides };
  if (def.kind === "finish_debrief" && def.finishDebriefPreset) {
    params.finishDebriefPreset = def.finishDebriefPreset;
  }
  return {
    instanceId: `${dayKey}-${def.id}-${Math.floor(rng() * 1e9)}`,
    defId: def.id,
    dayKey,
    mistressId,
    category: def.category,
    titleRu: def.nameRu,
    bodyRu: fillContractTemplate(def.instructionRu, params),
    reward: rollContractReward(def, rng),
    deadlineMs: endOfLocalDayMs(dayKey),
    status: "open",
    params,
    difficulty: def.difficulty,
  };
}

export function instantiateContractById(
  defId: string,
  dayKey: string,
  mistressId: MistressId,
  rng: () => number,
  paramOverrides?: Record<string, string | number>,
): ContractInstance | null {
  const def = getContractDef(defId);
  if (!def) return null;
  return instantiateContract(def, dayKey, mistressId, rng, paramOverrides);
}
