import type { EmberMap, EmberMapPlayProfile } from "./types";

export const MAP_PLAY_PROFILES = ["arena", "explore"] as const;

export function isMapPlayProfile(
  value: unknown,
): value is EmberMapPlayProfile {
  return value === "arena" || value === "explore";
}

/**
 * Runtime default: missing / empty field is arena.
 * Unknown strings are treated as arena so play never crashes; validate flags them.
 */
export function resolveMapPlayProfile(
  map: Pick<EmberMap, "playProfile"> | { playProfile?: unknown },
): EmberMapPlayProfile {
  return isMapPlayProfile(map.playProfile) ? map.playProfile : "arena";
}

export function resolveMapAutoAttack(
  map:
    | Pick<EmberMap, "playProfile" | "autoAttack">
    | { playProfile?: unknown; autoAttack?: unknown },
): boolean {
  if (typeof map.autoAttack === "boolean") return map.autoAttack;
  return resolveMapPlayProfile(map) === "arena";
}

/** Arena runs are timed; explore walks until the player stops. */
export function stageUsesTimedClear(profile: EmberMapPlayProfile): boolean {
  switch (profile) {
    case "arena":
      return true;
    case "explore":
      return false;
    default: {
      const _never: never = profile;
      return _never;
    }
  }
}

/** Keep valid profiles; drop empty; leave unknown strings for validatePack. */
export function normalizeMapPlayProfile(
  raw: unknown,
): EmberMapPlayProfile | undefined {
  if (raw == null || raw === "") return undefined;
  if (isMapPlayProfile(raw)) return raw;
  return undefined;
}

export function playProfileValidationMessage(raw: unknown): string | null {
  if (raw == null || raw === "") return null;
  if (isMapPlayProfile(raw)) return null;
  return `Неизвестный playProfile «${String(raw)}» (ожидалось arena или explore)`;
}

export function autoAttackValidationMessage(raw: unknown): string | null {
  if (raw == null || typeof raw === "boolean") return null;
  return `autoAttack должен быть boolean, получено «${String(raw)}»`;
}
