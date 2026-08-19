import presetsData from "../../data/presets.json";
import { sanitizeSessionParams } from "./catalog";
import type { MistressId } from "./mistress/types";
import { DEFAULT_PARAMS, type SessionParams } from "./types";

export interface SessionPreset {
  id: string;
  nameRu: string;
  descriptionRu: string;
  params: Partial<SessionParams>;
}

export const sessionPresets: SessionPreset[] =
  presetsData.presets as SessionPreset[];

/** Which «Её вкусы» chips each mistress shows. */
const PRESET_IDS_BY_MISTRESS: Record<MistressId, readonly string[]> = {
  hu_tao: [
    "light",
    "medium",
    "heavy",
    "denial",
    "cei",
    "anal_focus",
    "chastity",
  ],
  furina: [
    "cbt_court",
    "prone_tide",
    "heavy_tide",
    "denial_verdict",
    "anal_focus",
    "chastity",
  ],
  sunna: [
    "idol_soft",
    "oral_rehearsal",
    "medium",
    "chastity",
    "cei",
    "denial",
  ],
  sparkle: [
    "anal_locked",
    "phantom_cage",
    "mask_deny",
    "heavy",
    "anal_focus",
    "chastity",
  ],
};

export function getPreset(id: string): SessionPreset | undefined {
  return sessionPresets.find((p) => p.id === id);
}

/** Taste chips for the active (or given) mistress pack. */
export function listMistressPresets(
  mistressId: MistressId,
): SessionPreset[] {
  const ids = PRESET_IDS_BY_MISTRESS[mistressId] ?? PRESET_IDS_BY_MISTRESS.hu_tao;
  const out: SessionPreset[] = [];
  for (const id of ids) {
    const p = getPreset(id);
    if (p) out.push(p);
  }
  return out;
}

/** Merge preset partial params over defaults (or current). */
export function applyPreset(
  presetId: string,
  base: SessionParams = DEFAULT_PARAMS,
): SessionParams {
  const preset = getPreset(presetId);
  if (!preset) return sanitizeSessionParams(base);
  return sanitizeSessionParams({ ...base, ...preset.params });
}
