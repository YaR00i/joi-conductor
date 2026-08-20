export type EnemyMovementCadence = 1 | 2 | 3 | 4;

export type EnemySimLod = {
  cadence: EnemyMovementCadence;
  /** Full tile/sprite collision. Distant crowd members slide kinematically. */
  collideWorld: boolean;
  /** Neighbor separation. Off-screen hordes just chase the player. */
  crowdSteer: boolean;
  maxNeighbors: number;
};

function distanceTiles(distanceWorld: number, tileSize: number): number {
  return distanceWorld / Math.max(1, tileSize);
}

/**
 * Expensive map movement is LOD-ed independently from 30 Hz combat logic.
 * Small ordinary encounters keep full-rate movement; large crowds and distant
 * actors are staggered while preserving their accumulated travel time.
 */
export function enemyMovementCadence(
  distanceWorld: number,
  tileSize: number,
  crowdSize: number,
): EnemyMovementCadence {
  const tiles = distanceTiles(distanceWorld, tileSize);
  if (crowdSize <= 40) {
    if (tiles <= 10) return 1;
    if (tiles <= 18) return 2;
    return 3;
  }
  if (crowdSize <= 96) {
    return tiles <= 8 ? 2 : 3;
  }
  if (crowdSize > 160) return 4;
  return 3;
}

/** World collision stays on-screen. Vampire Survivors-style hordes clip off-camera. */
export function enemyWorldCollisionEnabled(
  distanceWorld: number,
  tileSize: number,
  crowdSize: number,
): boolean {
  const tiles = distanceTiles(distanceWorld, tileSize);
  if (crowdSize <= 40) return tiles <= 16;
  if (crowdSize <= 96) return tiles <= 12;
  return tiles <= 8;
}

export function enemyCrowdSteerEnabled(
  distanceWorld: number,
  tileSize: number,
  crowdSize: number,
): boolean {
  const tiles = distanceTiles(distanceWorld, tileSize);
  if (crowdSize <= 40) return true;
  if (crowdSize <= 96) return tiles <= 14;
  return tiles <= 10;
}

export function enemyCrowdNeighborLimit(crowdSize: number): number {
  if (crowdSize <= 40) return 8;
  if (crowdSize <= 96) return 6;
  return 4;
}

export function enemySimLod(
  distanceWorld: number,
  tileSize: number,
  crowdSize: number,
): EnemySimLod {
  return {
    cadence: enemyMovementCadence(distanceWorld, tileSize, crowdSize),
    collideWorld: enemyWorldCollisionEnabled(
      distanceWorld,
      tileSize,
      crowdSize,
    ),
    crowdSteer: enemyCrowdSteerEnabled(distanceWorld, tileSize, crowdSize),
    maxNeighbors: enemyCrowdNeighborLimit(crowdSize),
  };
}

export function runsOnStaggeredTick(
  tick: number,
  phase: number,
  cadence: EnemyMovementCadence,
): boolean {
  if (cadence === 1) return true;
  return ((tick + phase) % cadence + cadence) % cadence === 0;
}

export function noteMovementCadence(
  counts: {
    full: number;
    half: number;
    third: number;
    quarter: number;
  },
  cadence: EnemyMovementCadence,
): void {
  switch (cadence) {
    case 1:
      counts.full += 1;
      return;
    case 2:
      counts.half += 1;
      return;
    case 3:
      counts.third += 1;
      return;
    case 4:
      counts.quarter += 1;
      return;
    default: {
      const _never: never = cadence;
      void _never;
    }
  }
}

/** Kinematic far-crowd slides stay on the authored map rectangle. */
export function clampCoordToMap(
  value: number,
  radius: number,
  cells: number,
  tileSize: number,
): number {
  const min = radius;
  const max = cells * tileSize - radius;
  if (max <= min) return Math.max(0, Math.min(cells * tileSize, value));
  if (value < min) return min;
  if (value > max) return max;
  return value;
}
