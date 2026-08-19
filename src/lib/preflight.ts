/** Before beats: 3-2-1 → (Sunna prep) → media warmup → user presses ГОТОВ */

export type SunnaPrepStep = "cage" | "balls" | "vibes";

export type Preflight =
  | { kind: "countdown"; n: number }
  | {
      kind: "sunna_prep";
      /** Steps already confirmed */
      done: SunnaPrepStep[];
    }
  | { kind: "warmup" }
  | null;

export const SUNNA_PREP_STEPS: {
  id: SunnaPrepStep;
  labelRu: string;
  subRu: string;
  speakEn: string;
}[] = [
  {
    id: "cage",
    labelRu: "Клетка надета",
    subRu: "замок на клиторе — без споров",
    speakEn:
      "Lock that clitty first. Cage on. No session until it's cute and trapped.",
  },
  {
    id: "balls",
    labelRu: "Яички помассировала",
    subRu: "погладь, разомни — ствол не трогай",
    speakEn:
      "Massage those balls for me. Soft pets only — that shaft stays locked.",
  },
  {
    id: "vibes",
    labelRu: "Вибраторы готовы",
    subRu: "они теперь твои постоянные друзья",
    speakEn:
      "Get the vibrators ready. They're your permanent friends now — not your hand.",
  },
];

export function sunnaPrepComplete(done: SunnaPrepStep[]): boolean {
  return SUNNA_PREP_STEPS.every((s) => done.includes(s.id));
}
