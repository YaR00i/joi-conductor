import { cumplayOptions, finishOptions } from "./catalog";
import {
  CHARACTER_CATALOG,
  MEDIA_TYPE_CATALOG,
} from "./contentCatalog";
import {
  FETISH_HARD,
  FETISH_LIGHT,
  FETISH_MEDIUM,
  FETISH_SADISTIC,
  type FetishEntry,
  type FetishTier,
} from "./fetishCatalog";
import {
  applyMistressParamPool,
  getActiveRouletteBias,
  mistressDefaultParamPool,
  type MistressRouletteParamGroup,
} from "./mistress/rouletteBias";

const STORAGE_KEY = "joi-roulette-settings-v1";

/** All plan roulette step ids (kept here to avoid cycle with planRoulette). */
export type RouletteStepId =
  | "mood"
  | "mode"
  | "duration"
  | "edges"
  | "ruins"
  | "finaleOdds"
  | "finish"
  | "cumplay"
  | "cumplay_heavy"
  | "bpm"
  | "tags"
  | "tags_medium"
  | "tags_hard"
  | "tags_sadistic"
  | "character"
  | "media_type"
  | "toys_count"
  | "toys_1"
  | "toys_2"
  | "toys_3";

/** Discrete option groups that can be toggled per-id. */
export type RouletteOptionGroup =
  | "mood"
  | "mode"
  | "duration"
  | "edges"
  | "ruins"
  | "finaleOdds"
  | "bpm"
  | "finish"
  | "cumplay"
  | "fetish"
  | "character"
  | "media_type";

export type CustomFetishEntry = {
  id: string;
  tier: FetishTier;
  labelRu: string;
  tags: string;
  weight?: number;
  enabled?: boolean;
};

/** Override label/tags/tier for a built-in fetish id. */
export type FetishOverride = {
  labelRu?: string;
  tags?: string;
  tier?: FetishTier;
  weight?: number;
};

/** Groups whose wheel slices (values) can be fully edited. */
export type EditableParamGroup =
  | "mood"
  | "mode"
  | "duration"
  | "edges"
  | "ruins"
  | "finaleOdds"
  | "bpm";

export type ParamPoolOption = {
  id: string;
  labelRu: string;
  weight?: number;
  /** duration → SessionParams.durationSec */
  sec?: number;
  /**
   * edges / ruins — legacy fixed count (treated as nMin=nMax when range absent).
   */
  n?: number;
  /** Inclusive count band; session rolls a concrete target inside. */
  nMin?: number;
  nMax?: number;
  /** bpm range */
  bpmMin?: number;
  bpmMax?: number;
  /** finale odds */
  pCum?: number;
  pRuin?: number;
};

/** Inclusive lo/hi for an edges/ruins wheel slice. */
export function countBandFromOption(opt: {
  id: string;
  n?: number;
  nMin?: number;
  nMax?: number;
}): { lo: number; hi: number } {
  const fallback = Number(opt.id);
  const base = Number.isFinite(fallback) ? fallback : 0;
  const lo = opt.nMin ?? opt.n ?? base;
  const hi = opt.nMax ?? opt.n ?? lo;
  const a = Math.max(0, Math.round(lo));
  const b = Math.max(0, Math.round(hi));
  return { lo: Math.min(a, b), hi: Math.max(a, b) };
}

export function rollCountInBand(
  lo: number,
  hi: number,
  rng: () => number = Math.random,
): number {
  const a = Math.min(lo, hi);
  const b = Math.max(lo, hi);
  return a + Math.floor(rng() * (b - a + 1));
}

export function formatEdgesBandLabel(lo: number, hi: number): string {
  if (lo === hi) {
    if (lo <= 0) return "Без эджей";
    if (lo === 1) return "1 эдж";
    if (lo >= 2 && lo <= 4) return `${lo} эджа`;
    return `${lo} эджей`;
  }
  return `${lo}–${hi} эджей`;
}

export function formatRuinsBandLabel(lo: number, hi: number): string {
  if (lo === hi) {
    if (lo <= 0) return "Без руинов";
    if (lo === 1) return "1 руин";
    if (lo >= 2 && lo <= 4) return `${lo} руина`;
    return `${lo} руинов`;
  }
  if (lo <= 0 && hi === 1) return "0–1 руин";
  return `${lo}–${hi} руинов`;
}

export type RouletteSettings = {
  version: 1;
  /** Entire steps omitted from the spin sequence */
  disabledSteps: RouletteStepId[];
  /** Per-option enable map (missing key → default on / catalog.enabled) */
  enabled: Partial<Record<RouletteOptionGroup, Record<string, boolean>>>;
  fetishEscalate: {
    allowMedium: boolean;
    allowHard: boolean;
    allowSadistic: boolean;
    weight: number;
  };
  cumplayEscalate: {
    allowHeavy: boolean;
    weight: number;
  };
  customFetishes: CustomFetishEntry[];
  /** Edits to built-in fetish presets */
  fetishOverrides: Record<string, FetishOverride>;
  /**
   * Full replacement pools for discrete wheels.
   * Missing / empty group → built-in defaults.
   */
  paramPools: Partial<Record<EditableParamGroup, ParamPoolOption[]>>;
};

export type RouletteCatalogOption = {
  id: string;
  labelRu: string;
  /** Extra hint under the label (e.g. tags) */
  hint?: string;
  tier?: FetishTier;
  /** Built-in preset (can be overridden) vs user-added */
  builtin?: boolean;
};

export const DEFAULT_ROULETTE_SETTINGS: RouletteSettings = {
  version: 1,
  disabledSteps: [],
  enabled: {},
  fetishEscalate: {
    allowMedium: true,
    allowHard: true,
    allowSadistic: true,
    weight: 2.8,
  },
  cumplayEscalate: {
    allowHeavy: true,
    weight: 2.8,
  },
  customFetishes: [],
  fetishOverrides: {},
  paramPools: {},
};

export const EDITABLE_PARAM_GROUPS: EditableParamGroup[] = [
  "mood",
  "mode",
  "duration",
  "edges",
  "ruins",
  "finaleOdds",
  "bpm",
];

/** Built-in wheel slices (values + payloads). */
export const DEFAULT_PARAM_POOLS: Record<
  EditableParamGroup,
  ParamPoolOption[]
> = {
  mood: [
    { id: "sweet", labelRu: "Добрая", weight: 1.2 },
    { id: "horny", labelRu: "Похотливая", weight: 1.1 },
    { id: "calm", labelRu: "Спокойная", weight: 1 },
    { id: "bored", labelRu: "Скучающая", weight: 0.9 },
    { id: "cruel", labelRu: "Злая", weight: 1 },
    { id: "chaotic", labelRu: "Хаос", weight: 0.95 },
  ],
  mode: [
    { id: "stroke", labelRu: "Дрочка", weight: 1.4 },
    { id: "anal", labelRu: "Анал", weight: 1 },
    { id: "chastity", labelRu: "Клетка", weight: 0.7 },
    { id: "onahole", labelRu: "Онахол", weight: 1 },
    { id: "cbt", labelRu: "CBT", weight: 1.1 },
    { id: "oral", labelRu: "Орал", weight: 1 },
    { id: "prone", labelRu: "Prone", weight: 1 },
    { id: "plapping", labelRu: "Plapping", weight: 1 },
  ],
  duration: [
    { id: "420", labelRu: "7 мин", weight: 1, sec: 420 },
    { id: "600", labelRu: "10 мин", weight: 1.3, sec: 600 },
    { id: "720", labelRu: "12 мин", weight: 1.1, sec: 720 },
    { id: "900", labelRu: "15 мин", weight: 0.9, sec: 900 },
  ],
  edges: [
    {
      id: "e_2_4",
      labelRu: formatEdgesBandLabel(2, 4),
      weight: 1.05,
      nMin: 2,
      nMax: 4,
    },
    {
      id: "e_4_6",
      labelRu: formatEdgesBandLabel(4, 6),
      weight: 1.3,
      nMin: 4,
      nMax: 6,
    },
    {
      id: "e_5_8",
      labelRu: formatEdgesBandLabel(5, 8),
      weight: 1.25,
      nMin: 5,
      nMax: 8,
    },
    {
      id: "e_7_10",
      labelRu: formatEdgesBandLabel(7, 10),
      weight: 0.95,
      nMin: 7,
      nMax: 10,
    },
  ],
  ruins: [
    {
      id: "r_0_0",
      labelRu: formatRuinsBandLabel(0, 0),
      weight: 1.2,
      nMin: 0,
      nMax: 0,
    },
    {
      id: "r_0_1",
      labelRu: formatRuinsBandLabel(0, 1),
      weight: 1.15,
      nMin: 0,
      nMax: 1,
    },
    {
      id: "r_1_2",
      labelRu: formatRuinsBandLabel(1, 2),
      weight: 1.1,
      nMin: 1,
      nMax: 2,
    },
    {
      id: "r_2_3",
      labelRu: formatRuinsBandLabel(2, 3),
      weight: 0.75,
      nMin: 2,
      nMax: 3,
    },
  ],
  finaleOdds: [
    {
      id: "mercy",
      labelRu: "Мягкий (cum↑)",
      weight: 1.1,
      pCum: 0.7,
      pRuin: 0.15,
    },
    {
      id: "balanced",
      labelRu: "Баланс",
      weight: 1.3,
      pCum: 0.5,
      pRuin: 0.25,
    },
    { id: "mean", labelRu: "Жёсткий", weight: 1, pCum: 0.3, pRuin: 0.35 },
    {
      id: "denial",
      labelRu: "Denial",
      weight: 0.85,
      pCum: 0.08,
      pRuin: 0.22,
    },
  ],
  bpm: [
    { id: "slow", labelRu: "Медленно 50–90", weight: 1, bpmMin: 50, bpmMax: 90 },
    {
      id: "mid",
      labelRu: "Средне 60–120",
      weight: 1.4,
      bpmMin: 60,
      bpmMax: 120,
    },
    {
      id: "fast",
      labelRu: "Быстро 80–140",
      weight: 1,
      bpmMin: 80,
      bpmMax: 140,
    },
  ],
};

/** Built-in discrete options shown in the settings UI (labels only). */
export const ROULETTE_CATALOG: Record<
  EditableParamGroup,
  RouletteCatalogOption[]
> = {
  mood: DEFAULT_PARAM_POOLS.mood.map((o) => ({
    id: o.id,
    labelRu: o.labelRu,
  })),
  mode: DEFAULT_PARAM_POOLS.mode.map((o) => ({
    id: o.id,
    labelRu: o.labelRu,
  })),
  duration: DEFAULT_PARAM_POOLS.duration.map((o) => ({
    id: o.id,
    labelRu: o.labelRu,
  })),
  edges: DEFAULT_PARAM_POOLS.edges.map((o) => ({
    id: o.id,
    labelRu: o.labelRu,
  })),
  ruins: DEFAULT_PARAM_POOLS.ruins.map((o) => ({
    id: o.id,
    labelRu: o.labelRu,
  })),
  finaleOdds: DEFAULT_PARAM_POOLS.finaleOdds.map((o) => ({
    id: o.id,
    labelRu: o.labelRu,
  })),
  bpm: DEFAULT_PARAM_POOLS.bpm.map((o) => ({
    id: o.id,
    labelRu: o.labelRu,
  })),
};

export const ROULETTE_STEP_TOGGLES: {
  id: RouletteStepId;
  labelRu: string;
}[] = [
  { id: "mood", labelRu: "Настроение" },
  { id: "mode", labelRu: "Режим" },
  { id: "duration", labelRu: "Длительность" },
  { id: "edges", labelRu: "Эджи" },
  { id: "ruins", labelRu: "Руины mid" },
  { id: "finish", labelRu: "Куда кончить" },
  { id: "cumplay", labelRu: "Cumplay" },
  { id: "bpm", labelRu: "Темп" },
  { id: "tags", labelRu: "Фетиш-теги (из избранного)" },
  { id: "character", labelRu: "Архетип" },
  { id: "media_type", labelRu: "Тип контента" },
  { id: "toys_count", labelRu: "Игрушки · сколько" },
];

const BUILTIN_FETISHES: (FetishEntry & { tier: FetishTier })[] = [
  ...FETISH_LIGHT.map((f) => ({ ...f, tier: "light" as const })),
  ...FETISH_MEDIUM.map((f) => ({ ...f, tier: "medium" as const })),
  ...FETISH_HARD.map((f) => ({ ...f, tier: "hard" as const })),
  ...FETISH_SADISTIC.map((f) => ({ ...f, tier: "sadistic" as const })),
];

export function finishCatalogOptions(): RouletteCatalogOption[] {
  return finishOptions.map((f) => ({
    id: f.id,
    labelRu: f.nameRu,
    hint: f.enabled ? undefined : "выкл. в каталоге",
  }));
}

export function cumplayCatalogOptions(): RouletteCatalogOption[] {
  return cumplayOptions.map((c) => ({
    id: c.id,
    labelRu: c.nameRu,
    hint: c.enabled ? undefined : "выкл. в каталоге",
  }));
}

export function characterCatalogOptions(): RouletteCatalogOption[] {
  return CHARACTER_CATALOG.map((c) => ({
    id: c.id,
    labelRu: c.labelRu,
    hint: c.hint,
  }));
}

export function mediaTypeCatalogOptions(): RouletteCatalogOption[] {
  return MEDIA_TYPE_CATALOG.map((m) => ({
    id: m.id,
    labelRu: m.labelRu,
    hint: m.hint,
  }));
}

export function fetishCatalogOptions(
  settings: RouletteSettings = DEFAULT_ROULETTE_SETTINGS,
): RouletteCatalogOption[] {
  return allResolvedFetishEntries(settings).map((f) => ({
    id: f.id,
    labelRu: f.labelRu,
    hint: f.tags,
    tier: f.tier,
    builtin: f.builtin,
  }));
}

function asBoolMap(raw: unknown): Record<string, boolean> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === "boolean") out[k] = v;
  }
  return out;
}

function asFetishOverrides(raw: unknown): Record<string, FetishOverride> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, FetishOverride> = {};
  for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!v || typeof v !== "object") continue;
    const o = v as Record<string, unknown>;
    const next: FetishOverride = {};
    if (typeof o.labelRu === "string") next.labelRu = o.labelRu;
    if (typeof o.tags === "string") next.tags = o.tags;
    if (
      o.tier === "light" ||
      o.tier === "medium" ||
      o.tier === "hard" ||
      o.tier === "sadistic"
    ) {
      next.tier = o.tier;
    }
    if (typeof o.weight === "number") next.weight = o.weight;
    if (Object.keys(next).length > 0) out[id] = next;
  }
  return out;
}

function parseParamOption(raw: unknown): ParamPoolOption | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== "string" || typeof o.labelRu !== "string") return null;
  const next: ParamPoolOption = {
    id: o.id,
    labelRu: o.labelRu,
  };
  if (typeof o.weight === "number") next.weight = o.weight;
  if (typeof o.sec === "number") next.sec = o.sec;
  if (typeof o.n === "number") next.n = o.n;
  if (typeof o.nMin === "number") next.nMin = o.nMin;
  if (typeof o.nMax === "number") next.nMax = o.nMax;
  if (typeof o.bpmMin === "number") next.bpmMin = o.bpmMin;
  if (typeof o.bpmMax === "number") next.bpmMax = o.bpmMax;
  if (typeof o.pCum === "number") next.pCum = o.pCum;
  if (typeof o.pRuin === "number") next.pRuin = o.pRuin;
  return next;
}

function asParamPools(
  raw: unknown,
): Partial<Record<EditableParamGroup, ParamPoolOption[]>> {
  if (!raw || typeof raw !== "object") return {};
  const out: Partial<Record<EditableParamGroup, ParamPoolOption[]>> = {};
  for (const group of EDITABLE_PARAM_GROUPS) {
    const list = (raw as Record<string, unknown>)[group];
    if (!Array.isArray(list)) continue;
    const parsed = list
      .map(parseParamOption)
      .filter((x): x is ParamPoolOption => x != null);
    if (parsed.length > 0) out[group] = parsed;
  }
  return out;
}

export function resolveParamPool(
  group: EditableParamGroup,
  settings: RouletteSettings = DEFAULT_ROULETTE_SETTINGS,
): ParamPoolOption[] {
  const bias = getActiveRouletteBias();
  const g = group as MistressRouletteParamGroup;
  const custom = settings.paramPools[group];
  let base: ParamPoolOption[];
  if (custom && custom.length > 0) {
    base = custom.map((o) => ({ ...o }));
  } else {
    const replaced = mistressDefaultParamPool(g, bias);
    base =
      replaced.length > 0
        ? replaced.map((o) => ({ ...o }))
        : DEFAULT_PARAM_POOLS[group].map((o) => ({ ...o }));
  }
  const applied = applyMistressParamPool(g, base, bias);
  if (applied.length > 0) return applied;
  // Custom pool entirely banned — fall back to mistress defaults then global.
  const fallback =
    mistressDefaultParamPool(g, bias).length > 0
      ? mistressDefaultParamPool(g, bias).map((o) => ({ ...o }))
      : DEFAULT_PARAM_POOLS[group].map((o) => ({ ...o }));
  return applyMistressParamPool(g, fallback, bias);
}

export function paramHint(
  group: EditableParamGroup,
  opt: ParamPoolOption,
): string {
  switch (group) {
    case "duration": {
      const sec = opt.sec ?? Number(opt.id);
      const min = Number.isFinite(sec) ? Math.round(sec / 60) : null;
      return min != null ? `${min} мин · ${sec} сек` : String(opt.sec ?? "");
    }
    case "edges":
    case "ruins": {
      const { lo, hi } = countBandFromOption(opt);
      return lo === hi ? `n=${lo}` : `n=${lo}–${hi}`;
    }
    case "bpm":
      return `${opt.bpmMin ?? "?"}–${opt.bpmMax ?? "?"} BPM`;
    case "finaleOdds":
      return `cum ${opt.pCum ?? "?"} · ruin ${opt.pRuin ?? "?"}`;
    case "mood":
    case "mode":
      return opt.id;
    default: {
      const _exhaustive: never = group;
      return _exhaustive;
    }
  }
}

export function paramCatalogOptions(
  group: EditableParamGroup,
  settings: RouletteSettings,
): RouletteCatalogOption[] {
  return resolveParamPool(group, settings).map((o) => ({
    id: o.id,
    labelRu: o.labelRu,
    hint: paramHint(group, o),
  }));
}

export function setParamPool(
  settings: RouletteSettings,
  group: EditableParamGroup,
  options: ParamPoolOption[],
): RouletteSettings {
  return {
    ...settings,
    paramPools: {
      ...settings.paramPools,
      [group]: options.map((o) => ({ ...o })),
    },
  };
}

export function upsertParamOption(
  settings: RouletteSettings,
  group: EditableParamGroup,
  option: ParamPoolOption,
): RouletteSettings {
  const pool = resolveParamPool(group, settings);
  const idx = pool.findIndex((o) => o.id === option.id);
  const next =
    idx >= 0
      ? pool.map((o, i) => (i === idx ? { ...option } : o))
      : [...pool, { ...option }];
  return setParamPool(settings, group, next);
}

export function removeParamOption(
  settings: RouletteSettings,
  group: EditableParamGroup,
  id: string,
): RouletteSettings {
  const pool = resolveParamPool(group, settings).filter((o) => o.id !== id);
  if (pool.length === 0) {
    // Keep at least defaults rather than empty wheel
    return setParamPool(settings, group, DEFAULT_PARAM_POOLS[group]);
  }
  return setParamPool(settings, group, pool);
}

export function resetParamPool(
  settings: RouletteSettings,
  group: EditableParamGroup,
): RouletteSettings {
  const paramPools = { ...settings.paramPools };
  delete paramPools[group];
  return { ...settings, paramPools };
}

export function newParamOptionId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function loadRouletteSettings(): RouletteSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_ROULETTE_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<RouletteSettings>;
    return mergeRouletteSettings(parsed);
  } catch {
    return { ...DEFAULT_ROULETTE_SETTINGS };
  }
}

export function saveRouletteSettings(settings: RouletteSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export function mergeRouletteSettings(
  partial: Partial<RouletteSettings> | null | undefined,
): RouletteSettings {
  const d = DEFAULT_ROULETTE_SETTINGS;
  const enabledIn = partial?.enabled ?? {};
  const enabled: RouletteSettings["enabled"] = {};
  const groups: RouletteOptionGroup[] = [
    "mood",
    "mode",
    "duration",
    "edges",
    "ruins",
    "finaleOdds",
    "bpm",
    "finish",
    "cumplay",
    "fetish",
    "character",
    "media_type",
  ];
  for (const g of groups) {
    const map = asBoolMap(enabledIn[g]);
    if (Object.keys(map).length > 0) enabled[g] = map;
  }

  const custom = Array.isArray(partial?.customFetishes)
    ? partial!.customFetishes!
        .filter(
          (c) =>
            c &&
            typeof c.id === "string" &&
            typeof c.labelRu === "string" &&
            typeof c.tags === "string" &&
            (c.tier === "light" ||
              c.tier === "medium" ||
              c.tier === "hard" ||
              c.tier === "sadistic"),
        )
        .map((c) => ({
          id: c.id,
          tier: c.tier,
          labelRu: c.labelRu,
          tags: c.tags,
          weight: typeof c.weight === "number" ? c.weight : undefined,
          enabled: c.enabled !== false,
        }))
    : [];

  const disabledSteps = Array.isArray(partial?.disabledSteps)
    ? (partial!.disabledSteps!.filter((s) => typeof s === "string") as RouletteStepId[])
    : [];

  return {
    version: 1,
    disabledSteps,
    enabled,
    fetishEscalate: {
      allowMedium:
        partial?.fetishEscalate?.allowMedium ?? d.fetishEscalate.allowMedium,
      allowHard:
        partial?.fetishEscalate?.allowHard ?? d.fetishEscalate.allowHard,
      allowSadistic:
        partial?.fetishEscalate?.allowSadistic ??
        d.fetishEscalate.allowSadistic,
      weight:
        typeof partial?.fetishEscalate?.weight === "number"
          ? Math.max(0.5, Math.min(8, partial.fetishEscalate.weight))
          : d.fetishEscalate.weight,
    },
    cumplayEscalate: {
      allowHeavy:
        partial?.cumplayEscalate?.allowHeavy ?? d.cumplayEscalate.allowHeavy,
      weight:
        typeof partial?.cumplayEscalate?.weight === "number"
          ? Math.max(0.5, Math.min(8, partial.cumplayEscalate.weight))
          : d.cumplayEscalate.weight,
    },
    customFetishes: custom,
    fetishOverrides: asFetishOverrides(partial?.fetishOverrides),
    paramPools: asParamPools(partial?.paramPools),
  };
}

export function isOptionEnabled(
  settings: RouletteSettings,
  group: RouletteOptionGroup,
  id: string,
  defaultOn = true,
): boolean {
  const map = settings.enabled[group];
  if (!map || !(id in map)) return defaultOn;
  return map[id] !== false;
}

export function setOptionEnabled(
  settings: RouletteSettings,
  group: RouletteOptionGroup,
  id: string,
  on: boolean,
): RouletteSettings {
  return {
    ...settings,
    enabled: {
      ...settings.enabled,
      [group]: { ...(settings.enabled[group] ?? {}), [id]: on },
    },
  };
}

export function isStepEnabled(
  settings: RouletteSettings,
  stepId: RouletteStepId,
): boolean {
  return !settings.disabledSteps.includes(stepId);
}

export function setStepEnabled(
  settings: RouletteSettings,
  stepId: RouletteStepId,
  on: boolean,
): RouletteSettings {
  const disabled = new Set(settings.disabledSteps);
  if (on) disabled.delete(stepId);
  else disabled.add(stepId);
  return { ...settings, disabledSteps: [...disabled] };
}

export function filterByEnabled<T extends { id: string }>(
  items: T[],
  settings: RouletteSettings,
  group: RouletteOptionGroup,
  defaultOn: (item: T) => boolean = () => true,
): T[] {
  return items.filter((item) =>
    isOptionEnabled(settings, group, item.id, defaultOn(item)),
  );
}

export function builtinFetishesForTier(tier: FetishTier): FetishEntry[] {
  switch (tier) {
    case "light":
      return FETISH_LIGHT;
    case "medium":
      return FETISH_MEDIUM;
    case "hard":
      return FETISH_HARD;
    case "sadistic":
      return FETISH_SADISTIC;
    default: {
      const _exhaustive: never = tier;
      return _exhaustive;
    }
  }
}

export type ResolvedFetishEntry = FetishEntry & {
  tier: FetishTier;
  builtin: boolean;
};

/** All fetishes with overrides + customs applied. */
export function allResolvedFetishEntries(
  settings: RouletteSettings,
): ResolvedFetishEntry[] {
  const out: ResolvedFetishEntry[] = [];
  for (const base of BUILTIN_FETISHES) {
    const o = settings.fetishOverrides[base.id];
    out.push({
      id: base.id,
      labelRu: o?.labelRu?.trim() || base.labelRu,
      tags: o?.tags?.trim() || base.tags,
      weight: o?.weight ?? base.weight,
      tier: o?.tier ?? base.tier,
      builtin: true,
    });
  }
  for (const c of settings.customFetishes) {
    if (c.enabled === false) continue;
    out.push({
      id: c.id,
      labelRu: c.labelRu,
      tags: c.tags,
      weight: c.weight,
      tier: c.tier,
      builtin: false,
    });
  }
  return out;
}

export function resolvedFetishesForTier(
  tier: FetishTier,
  settings: RouletteSettings,
): FetishEntry[] {
  return allResolvedFetishEntries(settings)
    .filter((f) => f.tier === tier)
    .filter((f) => isOptionEnabled(settings, "fetish", f.id, true))
    .map(({ id, labelRu, tags, weight }) => ({ id, labelRu, tags, weight }));
}

export function upsertFetishOverride(
  settings: RouletteSettings,
  id: string,
  patch: FetishOverride,
): RouletteSettings {
  const prev = settings.fetishOverrides[id] ?? {};
  const next: FetishOverride = { ...prev, ...patch };
  // Drop empty override keys
  if (!next.labelRu?.trim()) delete next.labelRu;
  if (!next.tags?.trim()) delete next.tags;
  if (next.tier == null) delete next.tier;
  if (next.weight == null) delete next.weight;
  const fetishOverrides = { ...settings.fetishOverrides };
  if (Object.keys(next).length === 0) delete fetishOverrides[id];
  else fetishOverrides[id] = next;
  return { ...settings, fetishOverrides };
}

export function clearFetishOverride(
  settings: RouletteSettings,
  id: string,
): RouletteSettings {
  if (!(id in settings.fetishOverrides)) return settings;
  const fetishOverrides = { ...settings.fetishOverrides };
  delete fetishOverrides[id];
  return { ...settings, fetishOverrides };
}

export function findFetishEntry(
  settings: RouletteSettings,
  id: string,
): ResolvedFetishEntry | null {
  return allResolvedFetishEntries(settings).find((f) => f.id === id) ?? null;
}

export function canEscalateFetishTo(
  settings: RouletteSettings,
  next: FetishTier,
): boolean {
  switch (next) {
    case "medium":
      return settings.fetishEscalate.allowMedium;
    case "hard":
      return settings.fetishEscalate.allowHard;
    case "sadistic":
      return settings.fetishEscalate.allowSadistic;
    case "light":
      return true;
    default: {
      const _exhaustive: never = next;
      return _exhaustive;
    }
  }
}

export function newCustomFetishId(): string {
  return `custom_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}
