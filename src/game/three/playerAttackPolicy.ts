import type { WeaponKind } from "../content/types";

export type PlayerAttackTrigger = "auto" | "manual";

export function isTriggeredPlayerWeapon(kind: WeaponKind): boolean {
  switch (kind) {
    case "projectile":
    case "nova":
      return true;
    case "orbit":
    case "passive":
    case "instant_heal":
      return false;
    default: {
      const _never: never = kind;
      return _never;
    }
  }
}

export function shouldTriggerPlayerWeapon(
  trigger: PlayerAttackTrigger,
  autoAttack: boolean,
  cooldownMs: number,
): boolean {
  if (cooldownMs > 0) return false;
  switch (trigger) {
    case "auto":
      return autoAttack;
    case "manual":
      return true;
    default: {
      const _never: never = trigger;
      return _never;
    }
  }
}
