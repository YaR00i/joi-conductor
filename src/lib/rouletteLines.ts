/**
 * Mistress-aware roulette line pack lookup.
 */

import {
  FURINA_ROULETTE_PACK,
  type FurinaRoulettePack,
} from "./furinaRouletteLines";
import { getActiveMistress } from "./mistress";
import type { MistressId } from "./mistress/types";
import { SPARKLE_ROULETTE_PACK } from "./sparkleRouletteLines";
import { SUNNA_ROULETTE_PACK } from "./sunnaRouletteLines";

const PACKS: Partial<Record<MistressId, FurinaRoulettePack>> = {
  furina: FURINA_ROULETTE_PACK,
  sunna: SUNNA_ROULETTE_PACK,
  sparkle: SPARKLE_ROULETTE_PACK,
};

/** Non-default mistress packs; null = Hu Tao defaults in huTaoRouletteLines. */
export function getActiveRouletteLinePack(): FurinaRoulettePack | null {
  return PACKS[getActiveMistress().id] ?? null;
}
