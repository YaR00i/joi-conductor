export function runtimeXpAfterPickup(
  currentXp: number,
  pickupXp: number,
  suppressXp: boolean,
): number {
  return suppressXp ? currentXp : currentXp + pickupXp;
}

export const RUNTIME_STRESS_ENEMY_MAX = 700;
export const RUNTIME_NORMAL_ENEMY_MAX = 180;

/** Dev-only fixed crowd presets; F6 deliberately avoids browser reload keys. */
export function runtimeStressTargetForShortcut(
  code: string,
  shiftKey: boolean,
): number | null {
  if (code === "F4") return shiftKey ? 180 : 120;
  if (code === "F6") return shiftKey ? 700 : 400;
  return null;
}

export function normalizeRuntimeStressTarget(target: number): number {
  if (!Number.isFinite(target)) return 0;
  return Math.max(
    0,
    Math.min(RUNTIME_STRESS_ENEMY_MAX, Math.round(target)),
  );
}

/** Normal waves keep their safety cap; a fixed stress run owns its target. */
export function runtimeEnemySpawnLimit(stressEnemyTarget: number): number {
  const stressTarget = normalizeRuntimeStressTarget(stressEnemyTarget);
  return stressTarget > 0 ? stressTarget : RUNTIME_NORMAL_ENEMY_MAX;
}

/** F4 profiling owns the actor count; authored waves must not drift it upward. */
export function runtimeAllowsStageSpawns(stressEnemyTarget: number): boolean {
  return stressEnemyTarget <= 0;
}

/** Keep the F4 crowd stable instead of replacing killed enemies with gem FX. */
export function runtimeAllowsEnemyDamage(stressEnemyTarget: number): boolean {
  return stressEnemyTarget <= 0;
}
