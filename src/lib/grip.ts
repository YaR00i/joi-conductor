export type GripStrength = "light" | "normal" | "firm" | "tight";

export const GRIP_LABELS: Record<
  GripStrength,
  { nameRu: string; descriptionRu: string }
> = {
  light: {
    nameRu: "Лёгкий",
    descriptionRu: "Едва сжимай. Больше скольжение, меньше давление.",
  },
  normal: {
    nameRu: "Обычный",
    descriptionRu: "Комфортный хват — как обычно дрочишь.",
  },
  firm: {
    nameRu: "Крепкий",
    descriptionRu: "Сожми заметно сильнее. Не до боли.",
  },
  tight: {
    nameRu: "Жёсткий",
    descriptionRu: "Сильный хват. Дыши, не пережимай сосуды надолго.",
  },
};

/** Map function intensity 1–5 → grip. */
export function gripFromIntensity(intensity: number): GripStrength {
  if (intensity <= 1) return "light";
  if (intensity === 2) return "normal";
  if (intensity === 3) return "firm";
  return "tight";
}
