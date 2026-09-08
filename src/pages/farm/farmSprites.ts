/** How 2D critters sit on the isometric field: size, facing, walk bob. */

export const FARM_CRITTER_SCALE = 5.4;
export const FARM_DROP_SCALE = 4.4;
export const FARM_FARMER_SCALE = 5.8;

export function isoFlipX(vx: number, vy: number): boolean {
  return vx - vy > 0.02;
}

export function isMoving(vx: number, vy: number): boolean {
  return Math.hypot(vx, vy) > 0.12;
}

export function walkBobPx(timeMs: number, moving: boolean, amp = 5): number {
  if (!moving) return 0;
  return Math.abs(Math.sin(timeMs * 0.014)) * amp;
}

export type FarmPatrolPoint = { x: number; y: number };

/** Clockwise lap just outside the playable plots. */
export function farmerPatrol(cols: number, rows: number): FarmPatrolPoint[] {
  return [
    { x: -0.75, y: 0.45 },
    { x: cols - 0.25, y: 0.45 },
    { x: cols - 0.25, y: rows - 0.35 },
    { x: -0.75, y: rows - 0.35 },
  ];
}

export function stepPatrol(
  pos: FarmPatrolPoint,
  route: readonly FarmPatrolPoint[],
  index: number,
  speed: number,
  dtMs: number,
): { pos: FarmPatrolPoint; index: number; vx: number; vy: number } {
  if (route.length === 0) return { pos, index: 0, vx: 0, vy: 0 };
  const i = ((index % route.length) + route.length) % route.length;
  const target = route[i];
  const dx = target.x - pos.x;
  const dy = target.y - pos.y;
  const len = Math.hypot(dx, dy);
  if (len < 0.12) {
    return { pos: { ...target }, index: (i + 1) % route.length, vx: 0, vy: 0 };
  }
  const step = speed * (dtMs / 1000);
  const k = Math.min(1, step / len);
  return {
    pos: { x: pos.x + dx * k, y: pos.y + dy * k },
    index: i,
    vx: dx / len,
    vy: dy / len,
  };
}
