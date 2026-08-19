/** Shop tag packs — shared by wallet shop + media library. */

export type TagPackDef = {
  nameRu: string;
  tags: string;
};

export const TAG_PACKS: Record<string, TagPackDef> = {
  hutao_ember: {
    nameRu: "Искорки Ху Тао",
    tags: "hu_tao_(genshin_impact) solo male_focus",
  },
  mid_ruin_taste: {
    nameRu: "Грань и руин",
    tags: "cum_on_body precum edged",
  },
  censored_court: {
    nameRu: "Суд: censored",
    tags: "censored_penis mosaic_censoring bar_censor",
  },
  blacked_court: {
    nameRu: "Суд: blacked",
    tags: "dark-skinned_male interracial dark_skin",
  },
};

export function tagsForPack(packId: string): string[] {
  const raw = TAG_PACKS[packId]?.tags ?? "";
  return raw.split(/\s+/).filter(Boolean);
}
