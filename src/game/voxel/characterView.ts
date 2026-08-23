/**
 * Octopath-style camera-relative facing for 2.5D voxel cards.
 * Pick a drawing (front / back / side), then billboard it in play.
 * Do not yaw a single card in world space — profile would be a thread.
 */
import {
  EMBER_CHARACTER_CARD_VIEWS,
  type EmberCharacterCardView,
} from "../content/types";

export {
  EMBER_CHARACTER_CARD_VIEWS,
  type EmberCharacterCardView,
};

export const EMBER_CHARACTER_CARD_VIEW_LABEL_RU: Record<
  EmberCharacterCardView,
  string
> = {
  front: "анфас",
  back: "затылок",
  side_l: "бок Л",
  side_r: "бок П",
};

const HALF_PI = Math.PI / 2;

export function wrapPi(angle: number): number {
  let yaw = angle;
  while (yaw > Math.PI) yaw -= Math.PI * 2;
  while (yaw <= -Math.PI) yaw += Math.PI * 2;
  return yaw;
}

/**
 * Yaw of the look vector on XZ (Three/Ember voxel: +Z forward).
 * `from` = camera, `to` = character.
 */
export function lookYawToward(
  from: { x: number; z: number },
  to: { x: number; z: number },
): number {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  if (dx * dx + dz * dz < 1e-12) return 0;
  return Math.atan2(dx, dz);
}

/**
 * Character faces `charYaw` (0 = +Z). Camera looks along `lookYaw`.
 * Walking toward the camera → front; walking with the camera → back.
 */
export function characterCardViewFromYaw(
  lookYaw: number,
  charYaw = 0,
): EmberCharacterCardView {
  const rel = wrapPi(charYaw - lookYaw);
  const q = (((Math.round(rel / HALF_PI) % 4) + 4) % 4) as 0 | 1 | 2 | 3;
  switch (q) {
    case 0:
      return "back";
    case 1:
      return "side_l";
    case 2:
      return "front";
    case 3:
      return "side_r";
    default: {
      const _never: never = q;
      return _never;
    }
  }
}

export type CharacterCardViewState = { view: EmberCharacterCardView };

/**
 * Hysteresis so orbiting past a 45° seam does not flicker frames.
 * `stick` is a fraction of a 90° sector (0.25 ≈ 22.5° past the border).
 */
export function characterCardViewSticky(
  lookYaw: number,
  state: CharacterCardViewState,
  charYaw = 0,
  stick = 0.28,
): EmberCharacterCardView {
  const next = characterCardViewFromYaw(lookYaw, charYaw);
  if (next === state.view) return state.view;
  const rel = wrapPi(charYaw - lookYaw);
  const currentCenter = viewCenterRel(state.view);
  const nextCenter = viewCenterRel(next);
  const distCurrent = Math.abs(wrapPi(rel - currentCenter));
  const distNext = Math.abs(wrapPi(rel - nextCenter));
  const hold = HALF_PI * Math.max(0, Math.min(0.45, stick));
  if (distCurrent < distNext + hold) return state.view;
  state.view = next;
  return next;
}

function viewCenterRel(view: EmberCharacterCardView): number {
  switch (view) {
    case "back":
      return 0;
    case "side_l":
      return HALF_PI;
    case "side_r":
      return -HALF_PI;
    case "front":
      return Math.PI;
    default: {
      const _never: never = view;
      return _never;
    }
  }
}
