export type ReadingTaskKind = "strokes" | "edge" | "hands_off" | "slap";

export type ReadingTaskSpec = {
  id: string;
  kind: ReadingTaskKind;
  nameRu: string;
  ruleRu: string;
  spanPages: number;
  strokesPerPage?: number;
  slapsPerPage?: number;
  severity: 1 | 2 | 3;
};

export const READING_TASK_SPECS: readonly ReadingTaskSpec[] = [
  {
    id: "strokes_20_span4",
    kind: "strokes",
    nameRu: "Счёт",
    ruleRu: "На каждой из следующих страниц — 20 движений.",
    spanPages: 4,
    strokesPerPage: 20,
    severity: 1,
  },
  {
    id: "strokes_30_span3",
    kind: "strokes",
    nameRu: "Тридцать",
    ruleRu: "Следующие 3 страницы: 30 движений на каждой.",
    spanPages: 3,
    strokesPerPage: 30,
    severity: 1,
  },
  {
    id: "strokes_50_span3",
    kind: "strokes",
    nameRu: "Полсотни",
    ruleRu: "Следующие 3 страницы: 50 движений на каждой.",
    spanPages: 3,
    strokesPerPage: 50,
    severity: 2,
  },
  {
    id: "strokes_80_span2",
    kind: "strokes",
    nameRu: "Жёсткий счёт",
    ruleRu: "Две страницы подряд: 80 движений на каждой.",
    spanPages: 2,
    strokesPerPage: 80,
    severity: 3,
  },
  {
    id: "edge_span3",
    kind: "edge",
    nameRu: "К грани",
    ruleRu: "На каждой из следующих 3 страниц доведи себя до края. Без срыва.",
    spanPages: 3,
    severity: 2,
  },
  {
    id: "edge_span5",
    kind: "edge",
    nameRu: "Долгий край",
    ruleRu: "Пять страниц: на каждой — к грани. Без срыва.",
    spanPages: 5,
    severity: 3,
  },
  {
    id: "hands_off_span2",
    kind: "hands_off",
    nameRu: "Руки прочь",
    ruleRu: "Две страницы смотри без рук.",
    spanPages: 2,
    severity: 1,
  },
  {
    id: "hands_off_span4",
    kind: "hands_off",
    nameRu: "Смотри",
    ruleRu: "Четыре страницы без касаний.",
    spanPages: 4,
    severity: 2,
  },
  {
    id: "slap_once",
    kind: "slap",
    nameRu: "Шлепок",
    ruleRu: "Шлепни себя по яйцам и листай дальше.",
    spanPages: 1,
    slapsPerPage: 1,
    severity: 1,
  },
  {
    id: "slap_span3",
    kind: "slap",
    nameRu: "Шлепки",
    ruleRu: "На каждой из следующих 3 страниц — шлепок по яйцам.",
    spanPages: 3,
    slapsPerPage: 1,
    severity: 2,
  },
];

const MIN_GAP = 6;
const MAX_GAP = 10;

export function rollTaskGap(rng: () => number): number {
  return MIN_GAP + Math.floor(rng() * (MAX_GAP - MIN_GAP + 1));
}

export function isHeavyTask(spec: ReadingTaskSpec): boolean {
  return spec.severity >= 2 && (spec.kind === "edge" || spec.kind === "slap");
}

export function scaledStrokesPerPage(
  spec: ReadingTaskSpec,
  hardness: number,
): number {
  const base = spec.strokesPerPage ?? 0;
  if (base <= 0) return 0;
  const extra = 1 + Math.max(0, hardness) * 0.25;
  return Math.round(base * extra);
}

export function pickReadingTask(
  hardness: number,
  lastHeavy: boolean,
  rng: () => number,
): ReadingTaskSpec {
  const cap = Math.min(3, Math.max(1, 1 + Math.floor(hardness))) as 1 | 2 | 3;
  let pool = READING_TASK_SPECS.filter((spec) => spec.severity <= cap);
  if (lastHeavy) {
    const light = pool.filter((spec) => !isHeavyTask(spec));
    if (light.length > 0) pool = light;
  } else if (hardness >= 2) {
    const hard = pool.filter((spec) => spec.severity >= 2);
    if (hard.length > 0) pool = hard;
  }
  const pick = pool[Math.floor(rng() * pool.length)];
  return pick ?? READING_TASK_SPECS[0]!;
}

export function taskRuleRu(spec: ReadingTaskSpec, hardness: number): string {
  if (spec.kind !== "strokes") return spec.ruleRu;
  const n = scaledStrokesPerPage(spec, hardness);
  return `Следующие ${spec.spanPages} стр.: ${n} движений на каждой.`;
}
