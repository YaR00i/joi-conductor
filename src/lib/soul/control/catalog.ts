import type { MistressId } from "../../mistress/types";
import type { Block, SessionMode, SessionParams } from "../../types";
import { DEFAULT_PARAMS } from "../../types";
import huTaoFacts from "../../../../data/character/hu-tao-control/facts.json";
import huTaoOs from "../../../../data/character/hu-tao-control/os.json";
import huTaoProgressions from "../../../../data/character/hu-tao-control/progressions.json";
import huTaoRules from "../../../../data/character/hu-tao-control/rules.json";
import huTaoTriggers from "../../../../data/character/hu-tao-control/triggers.json";
import {
  FINALE_POLICIES,
  MISTRESS_SESSION_KINDS,
  PROGRESSION_IDS,
  QUEUE_PATCH_EDITS,
  TRIGGER_NEEDS,
  WEAR_KINDS,
  CHECK_IN_KINDS,
  DISPATCH_PHASES,
  type ControlDispatch,
  type ControlRules,
  type ControlState,
  type DispatchPhase,
  type FinalePolicy,
  type MistressSessionKind,
  type ProgressionId,
  type ProgressionTrack,
  type QueuePatchEdit,
  type TriggerEntry,
  type TriggerNeed,
  type WearKind,
  type CheckInKind,
} from "./types";
import { DEFAULT_MOOD_SCORE } from "../../moodEngine";

const EMPTY_RULES: ControlRules = {
  smoothnessMin: "",
  morningComplex: false,
  orgasmNeedsPermission: true,
  initiative: false,
  notes: [],
};

const EMPTY_PROGRESSIONS: ProgressionTrack[] = PROGRESSION_IDS.map((id) => ({
  id,
  level: 0,
  labelRu: progressionLabelRu(id),
  note: "",
}));

export function progressionLabelRu(id: ProgressionId): string {
  switch (id) {
    case "cage":
      return "Клетка";
    case "plug":
      return "Пробка";
    case "smooth":
      return "Гладкость";
    case "session_variety":
      return "Разнообразие сессий";
    case "ruin_cei":
      return "Ruined / CEI";
    case "sensitivity":
      return "Чувствительность";
    case "oral":
      return "Орал";
    case "morning":
      return "Утренний комплекс";
    default: {
      const _exhaustive: never = id;
      return _exhaustive;
    }
  }
}

export function sessionKindLabelRu(kind: MistressSessionKind): string {
  switch (kind) {
    case "edges":
      return "Эджи";
    case "hump":
      return "Hump";
    case "dildo_sit":
      return "Сидеть на дилдо";
    case "one_stroke_one_hit":
      return "Один удар — один удар";
    case "cage_vibe":
      return "Клетка + вибра";
    case "slow_tease":
      return "Медленный тиз";
    case "clit_tease":
      return "Тиз головки";
    case "oral":
      return "Орал";
    case "plug":
      return "Пробка";
    case "day_drips":
      return "Дневные капли";
    case "prone":
      return "Prone / Tide";
    case "phantom":
      return "Фантом";
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

export function finalePolicyLabelRu(policy: FinalePolicy): string {
  switch (policy) {
    case "hide":
      return "Финал скрыт";
    case "ruin_norm":
      return "Ruined как норма";
    case "full_mercy":
      return "Полная милость";
    default: {
      const _exhaustive: never = policy;
      return _exhaustive;
    }
  }
}

export function emptyDispatch(): ControlDispatch {
  return {
    phase: "idle",
    morningIds: [],
    punishIds: [],
    taskIds: [],
    lastOfferDate: null,
  };
}

export function isDispatchPhase(v: unknown): v is DispatchPhase {
  return (
    typeof v === "string" && (DISPATCH_PHASES as readonly string[]).includes(v)
  );
}

export function emptyControlState(): ControlState {
  return {
    version: 1,
    seeded: false,
    clothing: { active: false, detail: "" },
    checkIn: null,
    progressions: EMPTY_PROGRESSIONS.map((p) => ({ ...p })),
    triggers: [],
    lastSessionKinds: [],
    pendingProposal: null,
    rules: { ...EMPTY_RULES, notes: [] },
    moodScore: DEFAULT_MOOD_SCORE,
    moodAtMs: 0,
    lastShavedAtMs: null,
    lastMorningDate: null,
    dispatch: emptyDispatch(),
  };
}

export function huTaoMistressOs(): string {
  return typeof huTaoOs.text === "string" ? huTaoOs.text.trim() : "";
}

export function huTaoControlSeed(): ControlState {
  const rules = huTaoRules as ControlRules;
  const progressions = (huTaoProgressions as ProgressionTrack[]).map((p) => ({
    ...p,
    id: isProgressionId(p.id) ? p.id : "cage",
    level: Math.max(0, Math.min(5, Math.round(p.level))),
    labelRu: p.labelRu?.trim() || progressionLabelRu(isProgressionId(p.id) ? p.id : "cage"),
    note: p.note?.trim() ?? "",
  }));
  const byId = new Map(progressions.map((p) => [p.id, p]));
  return {
    version: 1,
    seeded: true,
    clothing: { active: false, detail: "" },
    checkIn: null,
    progressions: PROGRESSION_IDS.map(
      (id) => byId.get(id) ?? { id, level: 0, labelRu: progressionLabelRu(id), note: "" },
    ),
    triggers: (huTaoTriggers as TriggerEntry[]).map((t) => ({
      id: t.id,
      actionRu: t.actionRu,
      need: isTriggerNeed(t.need) ? t.need : "optional",
      phrases: Array.isArray(t.phrases) ? t.phrases.slice(0, 6) : [],
    })),
    lastSessionKinds: [],
    pendingProposal: null,
    rules: {
      smoothnessMin: rules.smoothnessMin,
      morningComplex: Boolean(rules.morningComplex),
      orgasmNeedsPermission: Boolean(rules.orgasmNeedsPermission),
      initiative: Boolean(rules.initiative),
      notes: Array.isArray(rules.notes) ? rules.notes.slice(0, 8) : [],
    },
    moodScore: DEFAULT_MOOD_SCORE,
    moodAtMs: 0,
    lastShavedAtMs: null,
    lastMorningDate: null,
    dispatch: emptyDispatch(),
  };
}

export function huTaoSoulFacts(): typeof huTaoFacts {
  return huTaoFacts;
}

export function defaultControlState(mistressId: MistressId): ControlState {
  switch (mistressId) {
    case "hu_tao":
      return huTaoControlSeed();
    case "furina":
    case "sunna":
    case "sparkle":
      return { ...emptyControlState(), seeded: true };
    default: {
      const _exhaustive: never = mistressId;
      return _exhaustive;
    }
  }
}

export function compactMistressOs(mistressId: MistressId): string {
  switch (mistressId) {
    case "hu_tao":
      return huTaoMistressOs();
    case "furina":
    case "sunna":
    case "sparkle":
      return [
        "You are his mistress in private chat. You may set real app constraints (cage, plug, denial, check-ins) and seed a session.",
        "Ruined orgasm is the normal finale. Full orgasm is rare mercy — never announce it early.",
        "Speak only. Do not output JSON — the app records orders separately.",
        "Match his last message. A hello gets a hello. Do not seed a session on small talk.",
      ].join("\n");
    default: {
      const _exhaustive: never = mistressId;
      return _exhaustive;
    }
  }
}

export function isWearKind(v: unknown): v is WearKind {
  return typeof v === "string" && (WEAR_KINDS as readonly string[]).includes(v);
}

export function isCheckInKind(v: unknown): v is CheckInKind {
  return typeof v === "string" && (CHECK_IN_KINDS as readonly string[]).includes(v);
}

export function isFinalePolicy(v: unknown): v is FinalePolicy {
  return typeof v === "string" && (FINALE_POLICIES as readonly string[]).includes(v);
}

export function isMistressSessionKind(v: unknown): v is MistressSessionKind {
  return (
    typeof v === "string" &&
    (MISTRESS_SESSION_KINDS as readonly string[]).includes(v)
  );
}

export function normalizeSessionKind(v: unknown): MistressSessionKind | null {
  if (isMistressSessionKind(v)) return v;
  if (typeof v !== "string") return null;
  const n = v
    .trim()
    .toLowerCase()
    .replace(/[+-\s]+/g, "_")
    .replace(/_+/g, "_");
  if (n === "cagevibe" || n === "cage_and_vibe") return "cage_vibe";
  return isMistressSessionKind(n) ? n : null;
}

export function isProgressionId(v: unknown): v is ProgressionId {
  return typeof v === "string" && (PROGRESSION_IDS as readonly string[]).includes(v);
}

export function isTriggerNeed(v: unknown): v is TriggerNeed {
  return typeof v === "string" && (TRIGGER_NEEDS as readonly string[]).includes(v);
}

export function isQueuePatchEdit(v: unknown): v is QueuePatchEdit {
  return (
    typeof v === "string" && (QUEUE_PATCH_EDITS as readonly string[]).includes(v)
  );
}

export function modeForSessionKind(kind: MistressSessionKind): SessionMode {
  switch (kind) {
    case "edges":
    case "slow_tease":
    case "clit_tease":
    case "day_drips":
      return "stroke";
    case "hump":
    case "prone":
      return "prone";
    case "dildo_sit":
    case "plug":
      return "anal";
    case "one_stroke_one_hit":
      return "cbt";
    case "cage_vibe":
    case "phantom":
      return "chastity";
    case "oral":
      return "oral";
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

export function applyFinalePolicy(
  params: SessionParams,
  policy: FinalePolicy,
): SessionParams {
  switch (policy) {
    case "hide":
      return { ...params, pCum: 0.45, pRuin: 0.4, ruinsTarget: 0 };
    case "ruin_norm":
      return {
        ...params,
        pCum: 0.12,
        pRuin: 0.82,
        ruinsTarget: Math.max(1, Math.round(params.edgesTarget / 3)),
      };
    case "full_mercy":
      return { ...params, pCum: 0.88, pRuin: 0.06, ruinsTarget: 0 };
    default: {
      const _exhaustive: never = policy;
      return _exhaustive;
    }
  }
}

export function applyProposalToParams(
  base: SessionParams,
  kind: MistressSessionKind,
  durationSec: number,
  edgesTarget: number,
  finalePolicy: FinalePolicy,
  mode?: SessionMode,
): SessionParams {
  const duration = Math.max(180, Math.min(2400, Math.round(durationSec)));
  const edges = Math.max(0, Math.min(20, Math.round(edgesTarget)));
  const next: SessionParams = {
    ...DEFAULT_PARAMS,
    ...base,
    durationSec: duration,
    edgesTarget: edges,
    mode: mode ?? modeForSessionKind(kind),
    bpmMin: kind === "slow_tease" || kind === "clit_tease" ? 48 : base.bpmMin,
    bpmMax: kind === "slow_tease" || kind === "clit_tease" ? 90 : base.bpmMax,
  };
  return applyFinalePolicy(next, finalePolicy);
}

export function makeMistressRestBlock(id: string, mode: SessionMode): Block {
  return {
    id,
    durationSec: 20,
    functionId: "rest_hands_off",
    patternId: "meter_straight",
    bpm: 40,
    mode,
    modifiers: [],
    goal: "rest",
    drive: "beat",
  };
}
