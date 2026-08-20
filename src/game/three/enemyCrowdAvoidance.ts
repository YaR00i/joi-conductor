export type CrowdSeparationAccumulator = {
  x: number;
  y: number;
  weight: number;
};

function pairAngle(a: number, b: number): number {
  const lo = Math.min(a, b) | 0;
  const hi = Math.max(a, b) | 0;
  let hash = Math.imul(lo ^ 0x9e3779b9, 0x85ebca6b);
  hash = Math.imul(hash ^ hi, 0xc2b2ae35);
  return ((hash >>> 0) / 0xffffffff) * Math.PI * 2;
}

/** Adds one allocation-free, symmetric overlap repulsion contribution. */
export function addCrowdSeparation(
  out: CrowdSeparationAccumulator,
  self: { lx: number; ly: number; radius: number; uid?: number },
  other: { lx: number; ly: number; radius: number; uid?: number },
  padding = 1.5,
): boolean {
  let dx = self.lx - other.lx;
  let dy = self.ly - other.ly;
  const minDistance = Math.max(0.01, self.radius + other.radius + padding);
  const distanceSq = dx * dx + dy * dy;
  if (distanceSq >= minDistance * minDistance) return false;

  let distance = Math.sqrt(distanceSq);
  if (distance <= 1e-5) {
    const selfUid = self.uid ?? 0;
    const otherUid = other.uid ?? 1;
    const angle = pairAngle(selfUid, otherUid);
    const sign = selfUid <= otherUid ? 1 : -1;
    dx = Math.cos(angle) * sign;
    dy = Math.sin(angle) * sign;
    distance = 0;
  } else {
    dx /= distance;
    dy /= distance;
  }
  const overlap = 1 - distance / minDistance;
  out.x += dx * overlap;
  out.y += dy * overlap;
  out.weight += overlap;
  return true;
}

/** Blend pursuit with normalized separation; returns the written output. */
export function resolveCrowdSteering(
  out: { x: number; y: number },
  pursuitX: number,
  pursuitY: number,
  separation: CrowdSeparationAccumulator,
): { x: number; y: number } {
  const separationLength = Math.hypot(separation.x, separation.y);
  if (separationLength <= 1e-6 || separation.weight <= 0) {
    out.x = pursuitX;
    out.y = pursuitY;
    return out;
  }
  const pressure = Math.min(1, separation.weight / 2.5);
  const strength = 0.72 * pressure;
  const sx = separation.x / separationLength;
  const sy = separation.y / separationLength;
  const x = pursuitX * (1 - strength) + sx * strength;
  const y = pursuitY * (1 - strength) + sy * strength;
  const length = Math.hypot(x, y) || 1;
  out.x = x / length;
  out.y = y / length;
  return out;
}
