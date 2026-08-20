import type {
  EmberBodyModifier,
  EmberColliderModifier,
  EmberPhysicsLayer,
} from "../content/types";
import { VOXELS_PER_BLOCK } from "../voxel/constants";

export type WorldVerticalSpan = {
  min: number;
  max: number;
  walkableTop: boolean;
  layer: EmberPhysicsLayer;
  source?: string;
};

export type ResolvedWorldBody = {
  radiusVoxels: number;
  heightVoxels: number;
  stepHeightVoxels: number;
  skinVoxels: number;
  layer: EmberPhysicsLayer;
  mask: EmberPhysicsLayer[];
};

export type ResolvedWorldCollider = {
  enabled: boolean;
  isTrigger: boolean;
  layer: EmberPhysicsLayer;
  mask: EmberPhysicsLayer[];
  blocksMovement: boolean;
  walkableTop: boolean;
  heightVoxels?: number;
  offsetVoxels: number;
};

export type WorldVerticalMotion = {
  /** Continuous feet height in Ember elevation/story units. */
  feetElev: number;
  /** Elevation units per second; falling is negative. */
  velocity: number;
  grounded: boolean;
};

export type WorldFallConfig = {
  gravity: number;
  terminalVelocity: number;
  groundEpsilon: number;
};

export const DEFAULT_WORLD_FALL: WorldFallConfig = {
  // One-story drop takes about 0.4 s: readable, but not floaty.
  gravity: 12,
  terminalVelocity: 10,
  groundEpsilon: 1e-4,
};

export const DEFAULT_WORLD_BODY: ResolvedWorldBody = {
  radiusVoxels: 2.5,
  heightVoxels: 12,
  stepHeightVoxels: 4,
  skinVoxels: 0.15,
  layer: "actor",
  mask: ["world"],
};

const ALL_PHYSICS_LAYERS: EmberPhysicsLayer[] = [
  "world",
  "actor",
  "projectile",
  "interaction",
  "trigger",
];

function finiteOr(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) ? (value as number) : fallback;
}

export function resolveWorldBody(
  body?: EmberBodyModifier,
  radiusVoxels?: number,
): ResolvedWorldBody {
  return {
    radiusVoxels: Math.max(
      0.25,
      finiteOr(radiusVoxels ?? body?.radiusVoxels, DEFAULT_WORLD_BODY.radiusVoxels),
    ),
    heightVoxels: Math.max(
      1,
      finiteOr(body?.heightVoxels, DEFAULT_WORLD_BODY.heightVoxels),
    ),
    stepHeightVoxels: Math.max(
      0,
      finiteOr(body?.stepHeightVoxels, DEFAULT_WORLD_BODY.stepHeightVoxels),
    ),
    skinVoxels: Math.max(
      0,
      finiteOr(body?.skinVoxels, DEFAULT_WORLD_BODY.skinVoxels),
    ),
    layer: body?.layer ?? DEFAULT_WORLD_BODY.layer,
    mask: body?.mask?.length ? [...body.mask] : [...DEFAULT_WORLD_BODY.mask],
  };
}

export function resolveWorldCollider(
  base?: EmberColliderModifier,
  override?: EmberColliderModifier,
  legacyEnabled = true,
): ResolvedWorldCollider {
  const merged = { ...base, ...override };
  const isTrigger = merged.isTrigger === true;
  return {
    enabled: merged.enabled ?? legacyEnabled,
    isTrigger,
    layer: merged.layer ?? "world",
    mask: merged.mask?.length ? [...merged.mask] : [...ALL_PHYSICS_LAYERS],
    blocksMovement: merged.blocksMovement ?? !isTrigger,
    walkableTop: merged.walkableTop ?? !isTrigger,
    heightVoxels:
      merged.heightVoxels == null
        ? undefined
        : Math.max(0, finiteOr(merged.heightVoxels, 0)),
    offsetVoxels: finiteOr(merged.offsetVoxels, 0),
  };
}

export function colliderAffectsBody(
  collider: ResolvedWorldCollider,
  body: ResolvedWorldBody,
): boolean {
  return (
    collider.enabled &&
    collider.blocksMovement &&
    !collider.isTrigger &&
    body.mask.includes(collider.layer) &&
    collider.mask.includes(body.layer)
  );
}

/** A block authored at ground_zN occupies [N-1, N]. */
export function blockSpanAtElev(
  elev: number,
  collider: ResolvedWorldCollider,
  source?: string,
): WorldVerticalSpan | null {
  if (!collider.enabled || !collider.blocksMovement || collider.isTrigger) return null;
  const offset = collider.offsetVoxels / VOXELS_PER_BLOCK;
  const height = (collider.heightVoxels ?? VOXELS_PER_BLOCK) / VOXELS_PER_BLOCK;
  const max = elev + offset;
  return {
    min: max - height,
    max,
    walkableTop: collider.walkableTop,
    layer: collider.layer,
    source,
  };
}

export function bodyVerticalSpan(
  feetElev: number,
  body: ResolvedWorldBody,
): { min: number; max: number } {
  const skin = body.skinVoxels / VOXELS_PER_BLOCK;
  return {
    min: feetElev + skin,
    max: feetElev + body.heightVoxels / VOXELS_PER_BLOCK - skin,
  };
}

/** Touching faces are allowed; only actual volume overlap blocks. */
export function verticalSpansOverlap(
  a: { min: number; max: number },
  b: { min: number; max: number },
  epsilon = 1e-4,
): boolean {
  return a.max > b.min + epsilon && b.max > a.min + epsilon;
}

export function spanBlocksBody(
  span: WorldVerticalSpan,
  feetElev: number,
  body: ResolvedWorldBody,
): boolean {
  if (!body.mask.includes(span.layer)) return false;
  return verticalSpansOverlap(bodyVerticalSpan(feetElev, body), span);
}

export function bodyHasClearance(
  spans: readonly WorldVerticalSpan[],
  feetElev: number,
  body: ResolvedWorldBody,
): boolean {
  return !spans.some((span) => spanBlocksBody(span, feetElev, body));
}

export function canAutoStepTo(
  fromFeetElev: number,
  surfaceElev: number,
  body: ResolvedWorldBody,
): boolean {
  return (
    surfaceElev <=
    fromFeetElev + body.stepHeightVoxels / VOXELS_PER_BLOCK + 1e-4
  );
}

export function mergeVerticalSpans(
  spans: readonly WorldVerticalSpan[],
): WorldVerticalSpan[] {
  const sorted = [...spans]
    .filter((s) => Number.isFinite(s.min) && Number.isFinite(s.max) && s.max > s.min)
    .sort((a, b) => a.min - b.min || a.max - b.max);
  const out: WorldVerticalSpan[] = [];
  for (const span of sorted) {
    const last = out[out.length - 1];
    if (
      last &&
      last.layer === span.layer &&
      last.walkableTop === span.walkableTop &&
      span.min <= last.max + 1e-4
    ) {
      last.max = Math.max(last.max, span.max);
      continue;
    }
    out.push({ ...span });
  }
  return out;
}

/**
 * Advance a downward-only fall toward the resolved support surface.
 *
 * Horizontal collision still resolves the support story. This integrator owns
 * the continuous feet position so stepping off an edge no longer teleports the
 * actor vertically. The analytic acceleration step is stable across frame rates.
 */
export function advanceWorldFall(
  state: WorldVerticalMotion,
  supportElev: number,
  dtSeconds: number,
  config: WorldFallConfig = DEFAULT_WORLD_FALL,
): WorldVerticalMotion {
  const support = Number.isFinite(supportElev) ? supportElev : state.feetElev;
  const dt = Math.max(0, Number.isFinite(dtSeconds) ? dtSeconds : 0);
  const gravity = Math.max(0.01, config.gravity);
  const terminal = Math.max(0.01, config.terminalVelocity);
  const epsilon = Math.max(0, config.groundEpsilon);

  // Rising support is an auto-step / stair / teleport, not a fall. Keep the
  // actor out of the floor and preserve the existing responsive step behavior.
  if (support >= state.feetElev - epsilon) {
    return { feetElev: support, velocity: 0, grounded: true };
  }
  if (dt <= 0) {
    return { ...state, grounded: false };
  }

  let velocity = Math.max(-terminal, Math.min(0, state.velocity));
  let nextFeet = state.feetElev;
  const timeToTerminal = Math.max(0, (terminal + velocity) / gravity);

  if (timeToTerminal >= dt) {
    nextFeet += velocity * dt - 0.5 * gravity * dt * dt;
    velocity = Math.max(-terminal, velocity - gravity * dt);
  } else {
    nextFeet +=
      velocity * timeToTerminal -
      0.5 * gravity * timeToTerminal * timeToTerminal;
    nextFeet -= terminal * (dt - timeToTerminal);
    velocity = -terminal;
  }

  if (nextFeet <= support + epsilon) {
    return { feetElev: support, velocity: 0, grounded: true };
  }
  return { feetElev: nextFeet, velocity, grounded: false };
}
