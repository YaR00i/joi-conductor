import type { EmberTransformScale } from "../content/types";

export const EMBER_TRANSFORM_SCALE_MIN = 0.125;
export const EMBER_TRANSFORM_SCALE_MAX = 8;

export const IDENTITY_EMBER_TRANSFORM_SCALE: Readonly<EmberTransformScale> = {
  x: 1,
  y: 1,
  z: 1,
};

function finiteScale(value: number | undefined): number {
  if (!Number.isFinite(value)) return 1;
  return Math.max(
    EMBER_TRANSFORM_SCALE_MIN,
    Math.min(EMBER_TRANSFORM_SCALE_MAX, value as number),
  );
}

/** Resolve malformed/legacy authored data into a safe positive scale. */
export function resolveEmberTransformScale(
  value: Partial<EmberTransformScale> | undefined,
): EmberTransformScale {
  return {
    x: finiteScale(value?.x),
    y: finiteScale(value?.y),
    z: finiteScale(value?.z),
  };
}

/** Keep default transforms out of JSON while always returning a fresh value. */
export function compactEmberTransformScale(
  value: Partial<EmberTransformScale> | undefined,
): EmberTransformScale | undefined {
  const next = resolveEmberTransformScale(value);
  return next.x === 1 && next.y === 1 && next.z === 1 ? undefined : next;
}
