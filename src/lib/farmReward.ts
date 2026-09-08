/**
 * Cinders for Пошлая ферма visits.
 * In-yard currency is farm gold; JOI wallet only changes on leave.
 */

export function formatRoundClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

export const FARM_INSPECTION_WARN_MS = 6000;
export const FARM_VISIT_MIN_MS = 15_000;
const FARM_VISIT_CAP = 18;

export type FarmRewardResult = {
  visit: number;
  goldConvert: number;
  xpConvert: number;
  taskReward: number;
  taskPenalty: number;
  total: number;
};

export type FarmVisitInput = {
  visitMs: number;
  goldEarned: number;
  xpGained: number;
  taskReward: number;
  taskPenalty: number;
};

export function calcFarmVisitReward(input: FarmVisitInput): FarmRewardResult {
  const goldConvert = Math.floor(Math.max(0, input.goldEarned) / 20);
  const xpConvert = Math.floor(Math.max(0, input.xpGained) / 25);
  const visit = input.visitMs >= FARM_VISIT_MIN_MS && (goldConvert > 0 || xpConvert > 0) ? 2 : 0;
  const total = Math.max(
    0,
    Math.min(
      FARM_VISIT_CAP,
      visit + goldConvert + xpConvert + input.taskReward - input.taskPenalty,
    ),
  );
  return {
    visit,
    goldConvert,
    xpConvert,
    taskReward: input.taskReward,
    taskPenalty: input.taskPenalty,
    total,
  };
}
