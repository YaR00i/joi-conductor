import {
  cageIsActive,
  loadCageLock,
  type CageLock,
  type WearTimerKind,
} from "../cageTimer";
import {
  denialIsActive,
  loadDenialQuest,
  type DenialQuest,
} from "../denialQuest";
import {
  ensureAcceptedProgramContract,
  ensureDailyContractBoard,
  isAcceptedOpen,
  type ContractInstance,
  type DailyContractBoard,
} from "./dailyBoard";
import { wearTimerKindForDefId } from "./sessionSeed";

export const DENIAL_LIVE_DEF_ID = "session_deny_tomorrow";

function wearPreferDefId(kind: WearTimerKind): string {
  return kind === "plug" ? "anal_plug_hours" : "chastity_locked_hours";
}

function wearAltDefIds(kind: WearTimerKind): readonly string[] {
  return kind === "cage" ? ["chastity_key_lost"] : [];
}

function openWearMatch(
  board: DailyContractBoard,
  kind: WearTimerKind,
): ContractInstance | undefined {
  const prefer = wearPreferDefId(kind);
  const alts = wearAltDefIds(kind);
  const ids = new Set([prefer, ...alts]);
  const accepted = board.contracts.find(
    (c) => isAcceptedOpen(c) && ids.has(c.defId),
  );
  if (accepted) return accepted;
  return board.contracts.find((c) => c.status === "open" && ids.has(c.defId));
}

function wearTitleRu(kind: WearTimerKind, hours: number): string {
  const rounded =
    hours >= 2 ? Math.round(hours) : Math.round(hours * 4) / 4;
  return kind === "plug" ? `Пробка ${rounded} ч` : `Клетка ${rounded} ч`;
}

function denialTitleRu(hours: number, edges: number): string {
  const rounded =
    hours >= 2 ? Math.round(hours) : Math.round(hours * 4) / 4;
  if (edges > 0) return `Denial ${rounded} ч · эджи ${edges}`;
  return `Denial ${rounded} ч`;
}

/** Attach an already-running wear timer to a daily-board contract. */
export function bindWearLockToContract(
  lock: CageLock,
): ContractInstance | null {
  const kind: WearTimerKind = lock.kind === "plug" ? "plug" : "cage";
  const board = ensureDailyContractBoard();
  const existing = openWearMatch(board, kind);
  const defId = existing?.defId ?? wearPreferDefId(kind);
  const already = existing != null && isAcceptedOpen(existing);
  return ensureAcceptedProgramContract(
    defId,
    { hours: lock.hours },
    {
      titleRu: already ? undefined : wearTitleRu(kind, lock.hours),
      deadlineMs: lock.untilMs,
    },
  );
}

/** Attach an already-running denial quest to a daily-board contract. */
export function bindDenialQuestToContract(
  quest: DenialQuest,
): ContractInstance | null {
  const board = ensureDailyContractBoard();
  const existing = board.contracts.find(
    (c) => c.status === "open" && c.defId === DENIAL_LIVE_DEF_ID,
  );
  const already = existing != null && isAcceptedOpen(existing);
  const params: Record<string, string | number> = { hours: quest.hours };
  if (quest.edgesTarget > 0) params.n = quest.edgesTarget;
  return ensureAcceptedProgramContract(DENIAL_LIVE_DEF_ID, params, {
    titleRu: already ? undefined : denialTitleRu(quest.hours, quest.edgesTarget),
    deadlineMs: quest.untilMs,
  });
}

/**
 * If a wear/denial timer is live without a matching accepted contract,
 * create or accept one. Safe to call from the home strip (legacy timers).
 */
export function syncLiveObligationContracts(nowMs = Date.now()): boolean {
  const before = ensureDailyContractBoard();
  const beforeKey = before.contracts
    .map((c) => `${c.instanceId}:${c.acceptedAtMs ?? 0}:${c.deadlineMs}`)
    .join("|");
  const cage = loadCageLock();
  if (cageIsActive(cage, nowMs) && cage) bindWearLockToContract(cage);
  const denial = loadDenialQuest();
  if (denialIsActive(denial, nowMs) && denial) {
    bindDenialQuestToContract(denial);
  }
  const after = ensureDailyContractBoard();
  const afterKey = after.contracts
    .map((c) => `${c.instanceId}:${c.acceptedAtMs ?? 0}:${c.deadlineMs}`)
    .join("|");
  return beforeKey !== afterKey;
}

export function liveWearKindForContract(
  contract: ContractInstance,
): WearTimerKind | null {
  return wearTimerKindForDefId(contract.defId);
}

export function isDenialLiveContract(contract: ContractInstance): boolean {
  return contract.defId === DENIAL_LIVE_DEF_ID;
}
