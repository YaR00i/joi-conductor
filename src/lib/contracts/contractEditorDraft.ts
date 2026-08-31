import type {
  ContractCategory,
  ContractDef,
  ContractRollKey,
  FinishDebriefPreset,
} from "./catalog";
import { makeUserContractId, type UserContractDef } from "./userCatalog";
import type { MistressId } from "../mistress/types";

export const CONTRACT_ROLL_KEYS: ContractRollKey[] = [
  "n",
  "minutes",
  "hours",
  "tag",
  "taps",
  "pages",
  "sec",
  "limit",
];

export const CONTRACT_ROLL_KEY_RU: Record<ContractRollKey, string> = {
  n: "Число (n)",
  minutes: "Минуты",
  hours: "Часы",
  tag: "Тег",
  taps: "Удары",
  pages: "Страницы",
  sec: "Секунды",
  limit: "Кадров",
};

export const CONTRACT_KIND_RU: Record<
  NonNullable<ContractDef["kind"]> | "",
  string
> = {
  "": "Обычный",
  media_drill: "Колода из Контента",
  finish_debrief: "Отчёт о финале",
};

export const FINISH_DEBRIEF_PRESET_RU: Record<FinishDebriefPreset, string> = {
  cum_allowed: "Право кончить",
  ruin_allowed: "Только руин",
  cei_required: "Вкусняшка",
  choice: "Выбор финала",
  faproulette: "После колоды",
};

export const INSTRUCTION_PLACEHOLDERS = [
  "{n}",
  "{minutes}",
  "{hours}",
  "{tag}",
  "{taps}",
  "{pages}",
  "{sec}",
  "{limit}",
  "{trigger}",
  "{actionLabel}",
  "{timerMin}",
] as const;

export type ContractEditorDraft = {
  id: string;
  nameRu: string;
  briefRu: string;
  instructionRu: string;
  category: ContractCategory;
  difficulty: 1 | 2 | 3;
  durationHintMin: string;
  durationLimitMin: string;
  rewardMin: string;
  rewardMax: string;
  rolls: Record<ContractRollKey, string>;
  biasHints: string;
  mistressBias: MistressId[];
  kind: "" | NonNullable<ContractDef["kind"]>;
  finishDebriefPreset: "" | FinishDebriefPreset;
  requireActivityDebrief: boolean;
  clonedFrom?: string;
};

function emptyRolls(): Record<ContractRollKey, string> {
  return {
    n: "",
    minutes: "",
    hours: "",
    tag: "",
    taps: "",
    pages: "",
    sec: "",
    limit: "",
  };
}

export const EMPTY_CONTRACT_DRAFT: ContractEditorDraft = {
  id: "",
  nameRu: "",
  briefRu: "",
  instructionRu: "",
  category: "life",
  difficulty: 1,
  durationHintMin: "",
  durationLimitMin: "",
  rewardMin: "10",
  rewardMax: "20",
  rolls: emptyRolls(),
  biasHints: "",
  mistressBias: [],
  kind: "",
  finishDebriefPreset: "",
  requireActivityDebrief: false,
};

export function draftFromContractDef(def: ContractDef): ContractEditorDraft {
  const rolls = emptyRolls();
  if (def.rolls) {
    for (const key of CONTRACT_ROLL_KEYS) {
      const vals = def.rolls[key];
      if (vals && vals.length > 0) rolls[key] = vals.join(", ");
    }
  }
  return {
    id: def.id,
    nameRu: def.nameRu,
    briefRu: def.briefRu,
    instructionRu: def.instructionRu,
    category: def.category,
    difficulty: def.difficulty,
    durationHintMin:
      typeof def.durationHintMin === "number" ? String(def.durationHintMin) : "",
    durationLimitMin:
      typeof def.durationLimitMin === "number"
        ? String(def.durationLimitMin)
        : "",
    rewardMin: String(def.rewardMin),
    rewardMax: String(def.rewardMax),
    rolls,
    biasHints: (def.biasHints ?? []).join(", "),
    mistressBias: def.mistressBias ?? [],
    kind: def.kind ?? "",
    finishDebriefPreset: def.finishDebriefPreset ?? "",
    requireActivityDebrief: Boolean(def.requireActivityDebrief),
    clonedFrom: def.clonedFrom,
  };
}

function parseRollValues(text: string): (string | number)[] {
  return text
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean)
    .map((v) => {
      const num = Number(v);
      return Number.isFinite(num) && /^\d+(\.\d+)?$/.test(v) ? num : v;
    });
}

export function rollsFromDraft(
  rolls: Record<ContractRollKey, string>,
): ContractDef["rolls"] {
  const out: NonNullable<ContractDef["rolls"]> = {};
  for (const key of CONTRACT_ROLL_KEYS) {
    const vals = parseRollValues(rolls[key] ?? "");
    if (vals.length > 0) out[key] = vals;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export function draftToContractPayload(
  draft: ContractEditorDraft,
  existingIds: string[],
): Omit<UserContractDef, "userCreated" | "createdAt" | "updatedAt"> {
  const id =
    draft.id || makeUserContractId(draft.nameRu || "contract", existingIds);
  const rewardMin = Math.max(0, Math.round(Number(draft.rewardMin) || 0));
  const rewardMax = Math.max(
    rewardMin,
    Math.round(Number(draft.rewardMax) || 0),
  );
  const durationHintMin = Number(draft.durationHintMin);
  const durationLimitMin = Number(draft.durationLimitMin);
  const kind = draft.kind || undefined;
  return {
    id,
    nameRu: draft.nameRu.trim() || "Без названия",
    briefRu: draft.briefRu.trim(),
    instructionRu: draft.instructionRu.trim(),
    category: draft.category,
    difficulty: draft.difficulty,
    durationHintMin:
      Number.isFinite(durationHintMin) && durationHintMin > 0
        ? durationHintMin
        : undefined,
    durationLimitMin:
      Number.isFinite(durationLimitMin) && durationLimitMin > 0
        ? durationLimitMin
        : undefined,
    rewardMin,
    rewardMax,
    rolls: rollsFromDraft(draft.rolls),
    biasHints: draft.biasHints
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    mistressBias:
      draft.mistressBias.length > 0 ? draft.mistressBias : undefined,
    kind,
    finishDebriefPreset:
      kind === "finish_debrief" && draft.finishDebriefPreset
        ? draft.finishDebriefPreset
        : undefined,
    requireActivityDebrief: draft.requireActivityDebrief || undefined,
    clonedFrom: draft.clonedFrom,
  };
}

export function previewInstructionRu(draft: ContractEditorDraft): string {
  const rolls = rollsFromDraft(draft.rolls) ?? {};
  return draft.instructionRu.replace(/\{(\w+)\}/g, (_, key: string) => {
    const vals = (rolls as Record<string, (string | number)[] | undefined>)[key];
    if (vals && vals.length > 0) return String(vals[0]);
    return `{${key}}`;
  });
}

export function draftsLookEqual(
  a: ContractEditorDraft,
  b: ContractEditorDraft,
): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
