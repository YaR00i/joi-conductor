import type { VibeProfileDef } from "./types";
import vibeData from "../../data/vibeProfiles.json";

export const vibeProfiles: VibeProfileDef[] =
  vibeData.profiles as VibeProfileDef[];

export function getVibeProfile(id: string): VibeProfileDef | undefined {
  return vibeProfiles.find((p) => p.id === id);
}

export function pickVibeProfile(
  intensity: number,
  rng: () => number,
): VibeProfileDef {
  const byIntensity: Record<number, string[]> = {
    1: ["vibe_soft_waves"],
    2: ["vibe_soft_waves", "vibe_pulse_hold"],
    3: ["vibe_build", "vibe_pulse_hold"],
    4: ["vibe_build", "vibe_edge_plateau", "vibe_tease_deny"],
    5: ["vibe_tease_deny", "vibe_edge_plateau"],
  };
  const ids = byIntensity[Math.min(5, Math.max(1, intensity))] ?? [
    "vibe_soft_waves",
  ];
  const id = ids[Math.floor(rng() * ids.length)]!;
  return getVibeProfile(id) ?? vibeProfiles[0]!;
}
