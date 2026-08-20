/**
 * Drive tile/sprite emissive pulse / flicker / trigger on Three materials.
 * Callers should pass a flat cached material list (avoid scene.traverse each frame).
 */
import type * as THREE from "three";
import type {
  EmberEmissiveAnim,
  EmberEmissiveTriggerWhen,
  EmberTilesetTile,
} from "../content/types";
import {
  EMISSIVE_TRIGGER_IDLE,
  createEmissiveFlickerState,
  createLanternBulbFlickerState,
  emissiveAnimMul,
  emissiveAnimNeedsTick,
  emissiveProximityAmount,
  emissiveSmoothToward,
  emissiveTriggerAmount,
  isEmissiveTriggerAnim,
  emissiveCellSeed,
  resolveEmissiveAnim,
  resolveEmissiveFlickerPeriodRange,
  resolveEmissiveGlowStrength,
  resolveEmissiveTriggerRadius,
  resolveEmissiveTriggerWhen,
  stepEmissiveFlicker,
  stepLanternBulbFlicker,
  type EmissiveFlickerState,
  type LanternBulbFlickerState,
} from "../tile/emissivePaint";
import { tileEmissiveIntensity } from "./toonMaterials";
import { torchFlickerRadiusMul } from "./torchFlickerTick";

export type EmberEmissiveMatMeta = {
  anim: EmberEmissiveAnim | undefined;
  seed: number;
  /** Peak Mesh*Material.emissiveIntensity (or bloom opacity scale / light intensity). */
  baseIntensity: number;
  /** Bloom overlay uses opacity; basic scales RGB; light drives PointLight.intensity. */
  kind: "emissive" | "bloom" | "basic" | "light";
  /** Pulse period in seconds. */
  periodSec?: number;
  /** Flicker random cycle bounds (seconds). */
  periodMinSec?: number;
  periodMaxSec?: number;
  triggerWhen?: EmberEmissiveTriggerWhen;
  triggerRadius?: number;
  triggerEventId?: string;
  /** Tile cell for proximity triggers (map space). */
  tx?: number;
  ty?: number;
  /** Torch-style disc radius breathe (PointLight.distance). */
  torchFlicker?: boolean;
  /** Broken-bulb brief intensity cutouts (PointLight.intensity). */
  lanternFlicker?: boolean;
  /** Steady cutoff distance before torch breathe (world units). */
  baseDistance?: number;
};

/** Alias — lights reuse the same anim meta bag. */
export type EmberEmissiveLightMeta = EmberEmissiveMatMeta;

export type EmissiveTickContext = {
  timeSec: number;
  /** Frame delta for soft temporal easing. */
  dt?: number;
  /**
   * Actor positions in tile space (fractional preferred for soft falloff).
   */
  playerTiles?: Array<{ x: number; y: number }>;
  enemyTiles?: Array<{ x: number; y: number }>;
  /** Event ids considered "active" for trigger_event. */
  activeEventIds?: ReadonlySet<string> | string[];
  /**
   * Editor preview: treat proximity triggers as fully armed.
   * Event triggers still need a selected event id (shown dim if unset).
   */
  previewArmTriggers?: boolean;
  /** Map lantern torch-flicker amount 0..1 (emissive lights may floor this). */
  torchFlickerAmount?: number;
  /** Map torch-flicker tempo. */
  torchFlickerSpeed?: number;
};

const META_KEY = "emberEmissive";
const SMOOTH_KEY = "emberEmissiveSmooth";
const APPLIED_KEY = "emberEmissiveApplied";
const FLICKER_KEY = "emberEmissiveFlicker";
const BULB_KEY = "emberLanternBulb";
const DIST_APPLIED_KEY = "emberEmissiveDistApplied";
/** Skip GPU writes when intensity barely moves. */
const APPLY_EPS = 0.012;
/** Floor so torch breathe is visible even when map torchFlicker is 0. */
const EMISSIVE_TORCH_AMOUNT_FLOOR = 0.55;

export type EmberEmissiveLightRuntimeState = {
  intensity: number;
  distance: number;
  smooth?: number;
  applied?: number;
  distanceApplied?: number;
  flicker?: EmissiveFlickerState;
  bulb?: LanternBulbFlickerState;
};

/**
 * Preserve live light animation across terrain-window rebuilds. Without this,
 * every retained emissive prop is recreated at zero intensity and visibly
 * flashes back on whenever the player crosses a chunk boundary.
 */
export function captureEmissiveLightRuntimeStates(
  lights: readonly THREE.PointLight[],
): Map<string, EmberEmissiveLightRuntimeState> {
  const states = new Map<string, EmberEmissiveLightRuntimeState>();
  for (const light of lights) {
    const id = light.userData.emberEmissiveSourceId as string | undefined;
    if (!id) continue;
    const smooth = light.userData[SMOOTH_KEY];
    const applied = light.userData[APPLIED_KEY];
    const distanceApplied = light.userData[DIST_APPLIED_KEY];
    const flicker = light.userData[FLICKER_KEY] as
      | EmissiveFlickerState
      | undefined;
    const bulb = light.userData[BULB_KEY] as
      | LanternBulbFlickerState
      | undefined;
    states.set(id, {
      intensity: light.intensity,
      distance: light.distance,
      ...(typeof smooth === "number" ? { smooth } : {}),
      ...(typeof applied === "number" ? { applied } : {}),
      ...(typeof distanceApplied === "number" ? { distanceApplied } : {}),
      ...(flicker ? { flicker: { ...flicker } } : {}),
      ...(bulb ? { bulb: { ...bulb } } : {}),
    });
  }
  return states;
}

/** Restore retained sources after addThreeEmissiveLocalLights rebuilt them. */
export function restoreEmissiveLightRuntimeStates(
  lights: readonly THREE.PointLight[],
  states: ReadonlyMap<string, EmberEmissiveLightRuntimeState>,
): number {
  let restored = 0;
  for (const light of lights) {
    const id = light.userData.emberEmissiveSourceId as string | undefined;
    const state = id ? states.get(id) : undefined;
    if (!state) continue;
    light.intensity = state.intensity;
    light.distance = state.distance;
    if (state.smooth != null) light.userData[SMOOTH_KEY] = state.smooth;
    if (state.applied != null) light.userData[APPLIED_KEY] = state.applied;
    if (state.distanceApplied != null) {
      light.userData[DIST_APPLIED_KEY] = state.distanceApplied;
    }
    if (state.flicker) light.userData[FLICKER_KEY] = { ...state.flicker };
    if (state.bulb) light.userData[BULB_KEY] = { ...state.bulb };
    restored += 1;
  }
  return restored;
}

export function tagEmissiveMaterial(
  mat: THREE.Material,
  meta: EmberEmissiveMatMeta,
): void {
  mat.userData[META_KEY] = meta;
  // All modes start extinguished, then ease up toward the live target.
  mat.userData[SMOOTH_KEY] = EMISSIVE_TRIGGER_IDLE;
  mat.userData[APPLIED_KEY] = EMISSIVE_TRIGGER_IDLE;
  applyMul(mat, meta, EMISSIVE_TRIGGER_IDLE);
}

export function tagEmissiveLight(
  light: THREE.PointLight,
  meta: EmberEmissiveLightMeta,
): void {
  const lightMeta: EmberEmissiveMatMeta = { ...meta, kind: "light" };
  light.userData[META_KEY] = lightMeta;
  light.userData[SMOOTH_KEY] = EMISSIVE_TRIGGER_IDLE;
  light.userData[APPLIED_KEY] = EMISSIVE_TRIGGER_IDLE;
  light.intensity = 0;
}

export function emissiveMetaFromTile(
  tile: EmberTilesetTile,
  opts?: { tx?: number; ty?: number; kind?: EmberEmissiveMatMeta["kind"] },
): EmberEmissiveMatMeta {
  const kind = opts?.kind ?? "emissive";
  const strength = resolveEmissiveGlowStrength(tile.emissiveStrength);
  return {
    anim: tile.emissiveAnim,
    seed: emissiveCellSeed(tile.id, opts?.tx ?? 0, opts?.ty ?? 0),
    baseIntensity:
      kind === "bloom"
        ? 0.55 + strength * 0.45
        : tileEmissiveIntensity(tile),
    kind,
    periodSec: tile.emissiveAnimPeriod,
    periodMinSec: tile.emissiveAnimPeriodMin,
    periodMaxSec: tile.emissiveAnimPeriodMax,
    triggerWhen: tile.emissiveTriggerWhen,
    triggerRadius: tile.emissiveTriggerRadius,
    triggerEventId: tile.emissiveTriggerEventId,
    tx: opts?.tx,
    ty: opts?.ty,
  };
}

function eventActive(
  eventId: string | undefined,
  active: EmissiveTickContext["activeEventIds"],
): boolean {
  if (!eventId || !active) return false;
  if (active instanceof Set) return active.has(eventId);
  return (active as readonly string[]).includes(eventId);
}

function triggerAmountFor(
  meta: EmberEmissiveMatMeta,
  ctx: EmissiveTickContext,
): number {
  if (!isEmissiveTriggerAnim(meta.anim)) return 0;
  const when = resolveEmissiveTriggerWhen(meta.triggerWhen);
  if (when === "event") {
    return eventActive(meta.triggerEventId, ctx.activeEventIds) ? 1 : 0;
  }
  if (ctx.previewArmTriggers) return 1;
  const tx = meta.tx ?? 0;
  const ty = meta.ty ?? 0;
  const radius = resolveEmissiveTriggerRadius(meta.triggerRadius);
  const playerAmount = emissiveProximityAmount(
    tx,
    ty,
    radius,
    ctx.playerTiles,
  );
  const enemyAmount = emissiveProximityAmount(tx, ty, radius, ctx.enemyTiles);
  return emissiveTriggerAmount(when, {
    playerAmount,
    enemyAmount,
    eventActive: false,
  });
}

function applyMul(
  mat: THREE.Material,
  meta: EmberEmissiveMatMeta,
  mul: number,
): void {
  const v = meta.baseIntensity * mul;
  if (meta.kind === "bloom") {
    (mat as THREE.MeshBasicMaterial).opacity = Math.max(0, Math.min(1, v));
    return;
  }
  if (meta.kind === "basic") {
    (mat as THREE.MeshBasicMaterial).color.setRGB(v, v, v);
    return;
  }
  if (meta.kind === "light") {
    // Materials only — PointLights use applyLightMul.
    return;
  }
  const m = mat as THREE.MeshToonMaterial | THREE.MeshStandardMaterial;
  if ("emissiveIntensity" in m) m.emissiveIntensity = v;
}

function applyLightMul(
  light: THREE.PointLight,
  meta: EmberEmissiveMatMeta,
  mul: number,
): void {
  light.intensity = Math.max(0, meta.baseIntensity * mul);
}

/** Gather tagged animated materials once after a rebuild (not each frame). */
export function collectEmissiveMaterials(
  root: THREE.Object3D,
): THREE.Material[] {
  const out: THREE.Material[] = [];
  const seen = new Set<THREE.Material>();
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mat of mats) {
      if (!mat || seen.has(mat)) continue;
      const meta = mat.userData?.[META_KEY] as EmberEmissiveMatMeta | undefined;
      if (!meta || !emissiveAnimNeedsTick(meta.anim)) continue;
      seen.add(mat);
      out.push(mat);
    }
  });
  return out;
}

type EmissiveHost = {
  userData: Record<string, unknown>;
};

/**
 * Advance one tagged host (material or PointLight). Returns true if applied.
 */
function stepEmissiveHost(
  host: EmissiveHost,
  ctx: EmissiveTickContext,
  apply: (meta: EmberEmissiveMatMeta, mul: number) => void,
): boolean {
  const meta = host.userData[META_KEY] as EmberEmissiveMatMeta | undefined;
  if (!meta || !emissiveAnimNeedsTick(meta.anim)) return false;
  const dt = ctx.dt ?? 1 / 60;

  let flickerMul: number | undefined;
  if (resolveEmissiveAnim(meta.anim) === "flicker") {
    const range = resolveEmissiveFlickerPeriodRange(
      meta.periodMinSec,
      meta.periodMaxSec,
      meta.periodSec,
    );
    let st = host.userData[FLICKER_KEY] as EmissiveFlickerState | undefined;
    if (!st) {
      st = createEmissiveFlickerState(meta.seed, range.min, range.max);
      host.userData[FLICKER_KEY] = st;
    }
    flickerMul = stepEmissiveFlicker(st, dt, meta.seed, range.min, range.max);
  }

  const target = emissiveAnimMul(meta.anim, {
    timeSec: ctx.timeSec,
    seed: meta.seed,
    periodSec: meta.periodSec,
    periodMinSec: meta.periodMinSec,
    periodMaxSec: meta.periodMaxSec,
    flickerMul,
    triggerAmount: triggerAmountFor(meta, ctx),
  });

  let mul: number;
  if (flickerMul != null) {
    mul = target;
    host.userData[SMOOTH_KEY] = mul;
  } else {
    const prev =
      typeof host.userData[SMOOTH_KEY] === "number"
        ? (host.userData[SMOOTH_KEY] as number)
        : EMISSIVE_TRIGGER_IDLE;
    mul = emissiveSmoothToward(prev, target, dt);
    host.userData[SMOOTH_KEY] = mul;
    if (
      isEmissiveTriggerAnim(meta.anim) &&
      mul < 0.07 &&
      prev < 0.07 &&
      target < 0.07
    ) {
      return false;
    }
  }

  const applied =
    typeof host.userData[APPLIED_KEY] === "number"
      ? (host.userData[APPLIED_KEY] as number)
      : -1;
  const eps = flickerMul != null ? 0.004 : APPLY_EPS;
  if (applied >= 0 && Math.abs(applied - mul) < eps) return false;
  host.userData[APPLIED_KEY] = mul;
  apply(meta, mul);
  return true;
}

/**
 * Update a flat material list. Returns true if any material was written
 * (useful for editor render throttling).
 */
export function tickEmissiveMaterials(
  mats: THREE.Material[],
  ctx: EmissiveTickContext,
): boolean {
  if (!mats.length) return false;
  let changed = false;
  for (const mat of mats) {
    if (
      stepEmissiveHost(mat, ctx, (meta, mul) => applyMul(mat, meta, mul))
    ) {
      changed = true;
    }
  }
  return changed;
}

/** Drive weak emissive PointLights with the same pulse/flicker/trigger mul. */
export function tickEmissiveLights(
  lights: THREE.PointLight[],
  ctx: EmissiveTickContext,
): boolean {
  if (!lights.length) return false;
  let changed = false;
  const dt = ctx.dt ?? 1 / 60;
  for (const light of lights) {
    const meta = light.userData[META_KEY] as EmberEmissiveMatMeta | undefined;
    if (!meta || meta.kind !== "light") continue;

    // Intensity: base anim × optional broken-bulb cutouts (can combine).
    const applied = stepEmissiveHost(light, ctx, (m, animMul) => {
      const bulb = stepLanternBulbMul(light, m, dt);
      applyLightMul(light, m, animMul * bulb);
    });
    if (applied) changed = true;
    else if (meta.lanternFlicker) {
      // Host may skip when anim mul is steady — still advance bulb cutouts.
      const bulb = stepLanternBulbMul(light, meta, dt);
      const smooth =
        typeof light.userData[SMOOTH_KEY] === "number"
          ? (light.userData[SMOOTH_KEY] as number)
          : 1;
      const next = meta.baseIntensity * smooth * bulb;
      if (Math.abs(light.intensity - next) > 0.004) {
        light.intensity = Math.max(0, next);
        changed = true;
      }
    }

    if (stepTorchDistance(light, meta, ctx)) changed = true;
  }
  return changed;
}

function stepLanternBulbMul(
  host: EmissiveHost,
  meta: EmberEmissiveMatMeta,
  dt: number,
): number {
  if (!meta.lanternFlicker) return 1;
  let st = host.userData[BULB_KEY] as LanternBulbFlickerState | undefined;
  if (!st) {
    st = createLanternBulbFlickerState(meta.seed);
    host.userData[BULB_KEY] = st;
  }
  return stepLanternBulbFlicker(st, dt, meta.seed);
}

function stepTorchDistance(
  light: THREE.PointLight,
  meta: EmberEmissiveMatMeta,
  ctx: EmissiveTickContext,
): boolean {
  if (!meta.torchFlicker) return false;
  const base =
    typeof meta.baseDistance === "number" && meta.baseDistance > 0
      ? meta.baseDistance
      : light.distance;
  if (!(base > 0)) return false;
  const raw = Math.max(0, Math.min(1, ctx.torchFlickerAmount ?? 0));
  const amount = Math.max(raw, EMISSIVE_TORCH_AMOUNT_FLOOR);
  const speed = ctx.torchFlickerSpeed ?? 1;
  const mul = torchFlickerRadiusMul(ctx.timeSec, meta.seed, amount, speed);
  const nextDist = base * mul;
  const prev =
    typeof light.userData[DIST_APPLIED_KEY] === "number"
      ? (light.userData[DIST_APPLIED_KEY] as number)
      : -1;
  if (prev >= 0 && Math.abs(prev - nextDist) < 0.05) return false;
  light.userData[DIST_APPLIED_KEY] = nextDist;
  light.distance = nextDist;
  return true;
}

export function groupHasEmissiveAnim(root: THREE.Object3D): boolean {
  return collectEmissiveMaterials(root).length > 0;
}
