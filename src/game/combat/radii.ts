/**
 * Shared combat radii — keep Three + Phaser hit tests in sync.
 */

/** Footprint radius in world units (tileSize≈16 → ~1/3 tile diameter). */
export const PLAYER_BODY_R = 2.5;
/** Slightly larger than body so melee/projectiles aren't too stingy. */
export const PLAYER_HURT_R = 3.5;

/**
 * Enemy body / hurt / bullet footprint from authored `def.radius`.
 * Slightly tighter than the visual disc so touch and shots agree.
 */
export function enemyBodyRadius(defRadius: number): number {
  if (!Number.isFinite(defRadius) || defRadius <= 0) return 3;
  return Math.max(3, Math.round(defRadius * 0.7));
}
