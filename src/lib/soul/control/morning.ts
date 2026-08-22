import type { MistressId } from "../../mistress/types";
import { cageIsActive, loadCageLock } from "../../cageTimer";
import {
  assignProgramContract,
  contractsTodayKey,
  ensureDailyContractBoard,
} from "../../contracts/dailyBoard";
import { notifyControlChanged, loadControlState, saveControlState } from "./store";
import type { ControlState } from "./types";

const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;

export function smoothnessDue(state: ControlState, nowMs = Date.now()): boolean {
  if (state.lastShavedAtMs == null) return true;
  return nowMs - state.lastShavedAtMs >= TWO_DAYS_MS;
}

function morningHourOk(now: Date): boolean {
  return now.getHours() >= 9;
}

function assignMorningIds(
  state: ControlState,
  now: Date,
  force: boolean,
): string[] {
  ensureDailyContractBoard(now);
  const ids: string[] = [];
  if (force || state.rules.morningComplex) {
    const ex = assignProgramContract("body_daily_exercise");
    if (ex) ids.push(ex.instanceId);
  }
  if (force || smoothnessDue(state, now.getTime())) {
    const shave = assignProgramContract("body_smooth_shave");
    if (shave) ids.push(shave.instanceId);
  }
  const lock = loadCageLock();
  if (cageIsActive(lock, now.getTime()) && lock?.kind !== "plug") {
    const inspect = assignProgramContract("chastity_morning_inspect");
    if (inspect) ids.push(inspect.instanceId);
  }
  return ids;
}

/** Assign today's habit contracts once after local morning. */
export function ensureMorningPack(
  mistressId: MistressId,
  now = new Date(),
): ControlState {
  return openMorningPack(mistressId, now, { force: false });
}

/** Open (or reopen) the morning pack. `force` ignores hour and «already today». */
export function openMorningPack(
  mistressId: MistressId,
  now = new Date(),
  opts: { force?: boolean } = {},
): ControlState {
  const state = loadControlState(mistressId);
  const dayKey = contractsTodayKey(now);
  const force = Boolean(opts.force);
  if (!force) {
    if (state.lastMorningDate === dayKey) return state;
    if (!morningHourOk(now)) return state;
  }

  const ids = assignMorningIds(state, now, force);
  const next: ControlState = {
    ...state,
    lastMorningDate: dayKey,
    dispatch:
      ids.length > 0
        ? {
            ...state.dispatch,
            phase: "morning",
            morningIds: ids,
            punishIds: [],
          }
        : {
            ...state.dispatch,
            morningIds: [],
          },
  };
  saveControlState(mistressId, next);
  notifyControlChanged();
  return next;
}
