/**
 * Global torch flicker for lantern PointLights.
 * Amount/speed come from map.light; per-lamp opt-out via lampTorchFlicker.
 * Flicker breathes disc radii (cutoff distance), not candela intensity.
 */
import type * as THREE from "three";

export type EmberLampUserData = {
  /** Steady candela — flicker does not touch this. */
  intensity: number;
  /** Base outer rim in world units (lampRange × tileSize). */
  distance: number;
  torchFlicker: boolean;
  seed: number;
  coreMat?: THREE.MeshBasicMaterial;
  coreBase?: THREE.Color;
  coreMesh?: THREE.Mesh;
};

export type TorchFlickerContext = {
  timeSec: number;
  /** 0..1 global amount (0 = off). */
  amount: number;
  /** Tempo multiplier (default 1). */
  speed?: number;
};

/**
 * Soft multi-sine flame wobble → disc radius multiplier around 1.
 * At full amount ≈ ±14% rim (core/mid scale with it via packed fractions).
 */
export function torchFlickerRadiusMul(
  timeSec: number,
  seed: number,
  amount: number,
  speed = 1,
): number {
  const a = Math.max(0, Math.min(1, amount));
  if (a < 0.01) return 1;
  const s = Math.max(0.25, Math.min(3, speed));
  const t = timeSec * s;
  const ph = seed * 0.001;
  const wobble =
    0.55 * Math.sin(t * 6.8 + ph) +
    0.28 * Math.sin(t * 11.3 + ph * 1.7) +
    0.17 * Math.sin(t * 19.1 + ph * 2.4);
  return Math.max(0.72, Math.min(1.28, 1 + a * 0.18 * wobble));
}

/** @deprecated Use {@link torchFlickerRadiusMul}. */
export function torchFlickerMul(
  timeSec: number,
  seed: number,
  amount: number,
  speed = 1,
): number {
  return torchFlickerRadiusMul(timeSec, seed, amount, speed);
}

/**
 * Apply flicker to tagged lantern PointLights.
 * Returns true if any disc radius changed enough to redraw.
 */
export function tickTorchFlicker(
  lights: THREE.PointLight[],
  ctx: TorchFlickerContext,
): boolean {
  if (!lights.length) return false;
  const amount = Math.max(0, Math.min(1, ctx.amount));
  const speed = ctx.speed ?? 1;
  let changed = false;
  for (const pl of lights) {
    const ud = pl.userData.emberLamp as EmberLampUserData | undefined;
    if (!ud || typeof ud.distance !== "number" || !(ud.distance > 0)) continue;

    // Intensity stays steady — only the hard disc radii breathe.
    if (
      typeof ud.intensity === "number" &&
      Math.abs(pl.intensity - ud.intensity) > 0.001
    ) {
      pl.intensity = ud.intensity;
      changed = true;
    }

    const mul =
      amount > 0.01 && ud.torchFlicker
        ? torchFlickerRadiusMul(ctx.timeSec, ud.seed, amount, speed)
        : 1;
    const nextDist = ud.distance * mul;
    if (Math.abs(pl.distance - nextDist) > 0.05) {
      pl.distance = nextDist;
      if (pl.castShadow) {
        pl.shadow.camera.far = Math.max(nextDist * 1.05, nextDist + 1);
        pl.shadow.camera.updateProjectionMatrix();
      }
      changed = true;
    }

    // Optional core sphere tracks radius slightly (not brightness).
    if (ud.coreMesh) {
      const s = 0.92 + 0.08 * mul;
      if (Math.abs(ud.coreMesh.scale.x - s) > 0.004) {
        ud.coreMesh.scale.setScalar(s);
        changed = true;
      }
    }
  }
  return changed;
}
