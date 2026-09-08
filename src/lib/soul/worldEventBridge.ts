import { isHabitContractId } from "../contracts/catalog";
import {
  setContractLifecycleListener,
  type ContractInstance,
  type ContractLifecycleNotice,
} from "../contracts/dailyBoard";
import { contractPlayLane } from "../contracts/sessionSeed";
import { HU_TAO_PACK, getMistressPack } from "../mistress";
import type { MistressId } from "../mistress/types";
import { loadSoulState, saveSoulState } from "./store";
import type { SoulWorldEventImportance } from "./types";
import {
  checkInEventInput,
  ingestSoulWorldEvent,
  morningPackEventInput,
  questEndEventInput,
  sessionEndEventInput,
  sessionRefusedEventInput,
  type SoulEventIngestResult,
  type SoulWorldEventInput,
} from "./worldEvents";

let installed = false;

export function recordSoulWorldEvent(
  input: SoulWorldEventInput,
): SoulEventIngestResult {
  const pack = getMistressPack(input.mistressId) ?? HU_TAO_PACK;
  const cur = loadSoulState(input.mistressId, pack.bible);
  const result = ingestSoulWorldEvent(cur, input);
  if (result.changed) {
    saveSoulState(input.mistressId, result.state);
  }
  return result;
}

function contractImportance(
  instance: ContractInstance,
  outcome: ContractLifecycleNotice["outcome"],
): SoulWorldEventImportance {
  const lane = contractPlayLane(instance.defId);
  const habit = isHabitContractId(instance.defId);
  if (habit) {
    return outcome === "failed" || outcome === "expired" ? 2 : 1;
  }
  if (lane === "live") {
    return outcome === "failed" || outcome === "expired" ? 2 : 1;
  }
  if (lane === "session") {
    return outcome === "accepted" ? 2 : 3;
  }
  if (outcome === "accepted") return 2;
  if (outcome === "done" && instance.difficulty >= 3) return 3;
  return 2;
}

function contractEventInput(
  notice: ContractLifecycleNotice,
): SoulWorldEventInput {
  const { instance, outcome } = notice;
  const title = instance.titleRu.trim() || instance.defId;
  switch (outcome) {
    case "accepted":
      return {
        kind: "contract_accepted",
        mistressId: instance.mistressId,
        summary: `Принял контракт: ${title}`,
        importance: contractImportance(instance, outcome),
        subjectId: instance.instanceId,
      };
    case "done":
      return {
        kind: "contract_completed",
        mistressId: instance.mistressId,
        summary: `Контракт выполнен: ${title}`,
        importance: contractImportance(instance, outcome),
        subjectId: instance.instanceId,
      };
    case "failed":
    case "expired":
      return {
        kind: "contract_failed",
        mistressId: instance.mistressId,
        summary:
          outcome === "expired"
            ? `Контракт просрочен: ${title}`
            : `Контракт провален: ${title}`,
        importance: contractImportance(instance, outcome),
        subjectId: instance.instanceId,
      };
    default: {
      const _exhaustive: never = outcome;
      return _exhaustive;
    }
  }
}

function onContractLifecycle(notice: ContractLifecycleNotice): void {
  recordSoulWorldEvent(contractEventInput(notice));
}

/** Idempotent. Control barrel installs so contract reports land even if Chat is closed. */
export function ensureSoulWorldEventBridge(): void {
  if (installed) return;
  setContractLifecycleListener(onContractLifecycle);
  installed = true;
}

export function recordSessionEndForSoul(
  input: Parameters<typeof sessionEndEventInput>[0],
): SoulEventIngestResult {
  return recordSoulWorldEvent(sessionEndEventInput(input));
}

export function recordQuestEndForSoul(
  input: Parameters<typeof questEndEventInput>[0],
): SoulEventIngestResult {
  return recordSoulWorldEvent(questEndEventInput(input));
}

export function recordMorningPackForSoul(
  input: Parameters<typeof morningPackEventInput>[0],
): SoulEventIngestResult {
  return recordSoulWorldEvent(morningPackEventInput(input));
}

export function recordCheckInForSoul(
  mistressId: MistressId,
): SoulEventIngestResult {
  return recordSoulWorldEvent(checkInEventInput(mistressId));
}

export function recordSessionRefusedForSoul(
  mistressId: MistressId,
): SoulEventIngestResult {
  return recordSoulWorldEvent(sessionRefusedEventInput(mistressId));
}

ensureSoulWorldEventBridge();
