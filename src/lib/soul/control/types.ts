import type { MistressId } from "../../mistress/types";
import type { SessionMode } from "../../types";

export const CONTROL_STORAGE_KEY = "joi-soul-control-v1";
export const CONTROL_CHANGED_EVENT = "joi-control-changed";

export const WEAR_KINDS = ["cage", "plug"] as const;
export type WearKind = (typeof WEAR_KINDS)[number];

export const CHECK_IN_KINDS = ["morning", "hours", "when_told"] as const;
export type CheckInKind = (typeof CHECK_IN_KINDS)[number];

export const FINALE_POLICIES = ["hide", "ruin_norm", "full_mercy"] as const;
export type FinalePolicy = (typeof FINALE_POLICIES)[number];

export const MISTRESS_SESSION_KINDS = [
  "edges",
  "hump",
  "dildo_sit",
  "one_stroke_one_hit",
  "cage_vibe",
  "slow_tease",
  "clit_tease",
  "oral",
  "plug",
  "day_drips",
  "prone",
  "phantom",
] as const;
export type MistressSessionKind = (typeof MISTRESS_SESSION_KINDS)[number];

export const PROGRESSION_IDS = [
  "cage",
  "plug",
  "smooth",
  "session_variety",
  "ruin_cei",
  "sensitivity",
  "oral",
  "morning",
] as const;
export type ProgressionId = (typeof PROGRESSION_IDS)[number];

export const TRIGGER_NEEDS = ["always", "boosts", "optional"] as const;
export type TriggerNeed = (typeof TRIGGER_NEEDS)[number];

export const QUEUE_PATCH_EDITS = ["insert_rest", "drop_next", "pause"] as const;
export type QueuePatchEdit = (typeof QUEUE_PATCH_EDITS)[number];

export type ControlRules = {
  smoothnessMin: string;
  morningComplex: boolean;
  orgasmNeedsPermission: boolean;
  initiative: boolean;
  notes: string[];
};

export type ProgressionTrack = {
  id: ProgressionId;
  level: number;
  labelRu: string;
  note: string;
};

export type TriggerEntry = {
  id: string;
  actionRu: string;
  need: TriggerNeed;
  phrases: string[];
};

export type ClothingState = {
  active: boolean;
  detail: string;
};

export type ControlCheckIn = {
  atMs: number;
  kind: CheckInKind;
  note: string;
};

export type MistressSessionProposal = {
  kind: MistressSessionKind;
  durationSec: number;
  edgesTarget: number;
  mode: SessionMode;
  finalePolicy: FinalePolicy;
  noteRu: string;
  atMs: number;
};

export const DISPATCH_PHASES = [
  "idle",
  "morning",
  "session_offer",
  "punish",
] as const;
export type DispatchPhase = (typeof DISPATCH_PHASES)[number];

export type ControlDispatch = {
  phase: DispatchPhase;
  morningIds: string[];
  punishIds: string[];
  /** Out-of-session contract instance ids offered from chat. */
  taskIds: string[];
  lastOfferDate: string | null;
};

export type ControlState = {
  version: 1;
  seeded: boolean;
  clothing: ClothingState;
  checkIn: ControlCheckIn | null;
  progressions: ProgressionTrack[];
  triggers: TriggerEntry[];
  lastSessionKinds: MistressSessionKind[];
  pendingProposal: MistressSessionProposal | null;
  rules: ControlRules;
  /** Same −3…+3 scale as moodEngine / roulette. */
  moodScore: number;
  moodAtMs: number;
  lastShavedAtMs: number | null;
  lastMorningDate: string | null;
  dispatch: ControlDispatch;
};

export type ControlStoreFile = {
  version: 1;
  byMistress: Partial<Record<MistressId, ControlState>>;
};

export type ControlWearLive = {
  kind: WearKind;
  hours: number;
  untilMs: number;
  remainingMs: number;
} | null;

export type ControlDenialLive = {
  hours: number;
  untilMs: number;
  remainingMs: number;
  edgesTarget: number;
  edgesDone: number;
} | null;

export type ControlLiveSnapshot = {
  wear: ControlWearLive;
  denial: ControlDenialLive;
  clothing: ClothingState;
  checkIn: ControlCheckIn | null;
  checkInOverdue: boolean;
};

export type ControlAction =
  | { op: "set_wear"; kind: WearKind; hours: number }
  | { op: "clear_wear" }
  | { op: "set_denial"; hours: number; edges: number }
  | { op: "clear_denial" }
  | { op: "set_checkin"; kind: CheckInKind; hours?: number; note: string }
  | { op: "clear_checkin" }
  | { op: "set_clothing"; detail: string }
  | { op: "clear_clothing" }
  | {
      op: "bump_progression";
      id: ProgressionId;
      level?: number;
      note: string;
    }
  | { op: "note_trigger"; id: string; phrase: string; need?: TriggerNeed }
  | {
      op: "propose_session";
      kind: MistressSessionKind;
      durationSec: number;
      edgesTarget: number;
      mode?: SessionMode;
      finalePolicy: FinalePolicy;
      noteRu: string;
    }
  | { op: "patch_queue"; edit: QueuePatchEdit };

export type AppliedControlResult = {
  state: ControlState;
  queueEdits: QueuePatchEdit[];
  proposal: MistressSessionProposal | null;
  wearChanged: boolean;
  denialChanged: boolean;
};
