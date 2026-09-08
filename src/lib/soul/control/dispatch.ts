import type { MistressId } from "../../mistress/types";
import {
  assignProgramContract,
  contractsTodayKey,
  ensureDailyContractBoard,
  findContract,
  reportContract,
  type ContractInstance,
} from "../../contracts/dailyBoard";
import {
  CONTRACT_CATEGORY_LABELS,
  getContractDef,
} from "../../contracts/catalog";
import {
  contractPlayLane,
  contractPlayLaneLabelRu,
  type ContractPlayLane,
} from "../../contracts/sessionSeed";
import {
  idleTaskSpecs,
  punishSpecsForLive,
  type PunishSpec,
} from "../../progressN";
import { readLiveWearGate } from "../../sessionLiveGates";
import { applyMoodDelta } from "../../moodEngine";
import { creditCinders, loadWallet, saveWallet } from "../../wallet";
import { ensureMorningPack } from "./morning";
import { loadControlState, notifyControlChanged, saveControlState } from "./store";
import type { ControlDispatch, ControlState, DispatchPhase } from "./types";
import {
  recordCheckInForSoul,
  recordMorningPackForSoul,
  recordSessionRefusedForSoul,
} from "../worldEventBridge";

export const REFUSE_SESSION_CHAT =
  "Отказываюсь от сессии — не от утреннего пака и не от зарядки. Кара уже карточками в приложении.";

export type ChatChipKind =
  | "accept_session"
  | "refuse_session"
  | "ask_session"
  | "accept_punish"
  | "morning_report";

export type ChatChip = {
  id: string;
  labelRu: string;
  kind: ChatChipKind;
  contractInstanceId?: string;
};

function saveDispatch(mistressId: MistressId, dispatch: ControlDispatch): ControlState {
  const next = { ...loadControlState(mistressId), dispatch };
  saveControlState(mistressId, next);
  notifyControlChanged();
  return next;
}

export function ensureChatDispatch(
  mistressId: MistressId,
  now = new Date(),
): ControlState {
  let state = ensureMorningPack(mistressId, now);
  if (state.dispatch.phase === "morning" && state.dispatch.morningIds.length > 0) {
    return state;
  }
  if (state.dispatch.phase === "punish" && state.dispatch.punishIds.length > 0) {
    return state;
  }
  const today = contractsTodayKey(now);
  if (
    state.rules.initiative &&
    state.dispatch.lastOfferDate !== today &&
    state.dispatch.phase === "idle"
  ) {
    state = saveDispatch(mistressId, {
      ...state.dispatch,
      phase: "session_offer",
      lastOfferDate: today,
    });
  }
  return state;
}

export type ChatContractTone = "punish" | "task";

export type ChatContractOffer = {
  instanceId: string;
  tone: ChatContractTone;
  lane: ContractPlayLane;
  laneRu: string;
  categoryRu: string;
  titleRu: string;
  briefRu: string;
  bodyRu: string;
};

function offerFromInstance(
  row: ContractInstance,
  tone: ChatContractTone,
): ChatContractOffer {
  const def = getContractDef(row.defId);
  const lane = contractPlayLane(row.defId);
  return {
    instanceId: row.instanceId,
    tone,
    lane,
    laneRu: contractPlayLaneLabelRu(lane),
    categoryRu: CONTRACT_CATEGORY_LABELS[row.category],
    titleRu: def?.nameRu ?? row.titleRu,
    briefRu: def?.briefRu ?? "",
    bodyRu: row.bodyRu,
  };
}

export function listChatContractOffers(
  state: ControlState,
  sessionLive: boolean,
): ChatContractOffer[] {
  if (sessionLive) return [];
  const offers: ChatContractOffer[] = [];
  if (state.dispatch.phase === "punish") {
    for (const instanceId of state.dispatch.punishIds) {
      const row = findContract(instanceId);
      if (!row || row.status !== "open") continue;
      offers.push(offerFromInstance(row, "punish"));
    }
  }
  for (const instanceId of state.dispatch.taskIds) {
    const row = findContract(instanceId);
    if (!row || row.status !== "open") continue;
    offers.push(offerFromInstance(row, "task"));
  }
  return offers;
}

export function contractToneLabelRu(tone: ChatContractTone): string {
  switch (tone) {
    case "punish":
      return "Кара";
    case "task":
      return "Задание";
    default: {
      const _exhaustive: never = tone;
      return _exhaustive;
    }
  }
}

export function acceptHintRu(offer: ChatContractOffer): string {
  switch (offer.lane) {
    case "session":
      return "Принять — соберёт сессию Conductor.";
    case "live":
      return "Принять — таймер на день, без сессии.";
    case "task":
      return "Принять — сделай сейчас, вне сессии.";
    default: {
      const _exhaustive: never = offer.lane;
      return _exhaustive;
    }
  }
}

export function listChatChips(
  _state: ControlState,
  _sessionLive: boolean,
): ChatChip[] {
  return [];
}

export function dispatchPhaseLabelRu(phase: DispatchPhase): string {
  switch (phase) {
    case "idle":
      return "спокойно";
    case "morning":
      return "утренний пак";
    case "session_offer":
      return "оффер сессии";
    case "punish":
      return "кара";
    default: {
      const _exhaustive: never = phase;
      return _exhaustive;
    }
  }
}

export function openSessionOffer(
  mistressId: MistressId,
  now = new Date(),
): ControlState {
  return saveDispatch(mistressId, {
    ...loadControlState(mistressId).dispatch,
    phase: "session_offer",
    lastOfferDate: contractsTodayKey(now),
  });
}

export function submitCheckIn(mistressId: MistressId): ControlState {
  const next: ControlState = {
    ...loadControlState(mistressId),
    checkIn: null,
  };
  saveControlState(mistressId, next);
  notifyControlChanged();
  recordCheckInForSoul(mistressId);
  return next;
}

export function refuseSessionOffer(mistressId: MistressId): {
  state: ControlState;
  specs: PunishSpec[];
  contracts: ContractInstance[];
} {
  const state = loadControlState(mistressId);
  const gate = readLiveWearGate();
  const specs = punishSpecsForLive({
    moodScore: state.moodScore,
    cageOn: gate.wearKind === "cage",
    plugOn: gate.wearKind === "plug",
    denialOn: gate.denialOn,
  });
  ensureDailyContractBoard();
  const contracts: ContractInstance[] = [];
  for (const spec of specs) {
    const row = assignProgramContract(spec.defId, spec.params);
    if (row) contracts.push(row);
  }
  const next = saveDispatch(mistressId, {
    ...loadControlState(mistressId).dispatch,
    phase: "punish",
    punishIds: contracts.map((c) => c.instanceId),
  });
  recordSessionRefusedForSoul(mistressId);
  return { state: next, specs, contracts };
}

export function assignIdleTaskPack(mistressId: MistressId): {
  state: ControlState;
  contracts: ContractInstance[];
} {
  const state = loadControlState(mistressId);
  ensureDailyContractBoard();
  const contracts: ContractInstance[] = [];
  for (const spec of idleTaskSpecs(state.moodScore).slice(0, 2)) {
    const row = assignProgramContract(spec.defId, spec.params);
    if (row) contracts.push(row);
  }
  const next = saveDispatch(mistressId, {
    ...loadControlState(mistressId).dispatch,
    taskIds: [
      ...state.dispatch.taskIds.filter((id) =>
        contracts.every((c) => c.instanceId !== id),
      ),
      ...contracts.map((c) => c.instanceId),
    ].slice(0, 6),
  });
  return { state: next, contracts };
}

export function dropTaskOffer(
  mistressId: MistressId,
  instanceId: string,
): ControlState {
  const state = loadControlState(mistressId);
  return saveDispatch(mistressId, {
    ...state.dispatch,
    taskIds: state.dispatch.taskIds.filter((id) => id !== instanceId),
  });
}

export function setDispatchPhase(
  mistressId: MistressId,
  phase: DispatchPhase,
): ControlState {
  const state = loadControlState(mistressId);
  return saveDispatch(mistressId, {
    ...state.dispatch,
    phase,
    punishIds: phase === "punish" ? state.dispatch.punishIds : [],
    morningIds: phase === "morning" ? state.dispatch.morningIds : state.dispatch.morningIds,
  });
}

export function listMorningContracts(state: ControlState): ContractInstance[] {
  return state.dispatch.morningIds
    .map((id) => findContract(id))
    .filter((row): row is ContractInstance => row != null && row.status === "open");
}

export type MorningMark = "done" | "skip";

export function reportMorningPack(
  mistressId: MistressId,
  marks: Record<string, MorningMark>,
): ControlState {
  let state = loadControlState(mistressId);
  let lockedSkip = 0;
  let lockedDone = 0;
  let rewarded = 0;
  let markedDone = 0;
  let markedSkip = 0;
  for (const instanceId of state.dispatch.morningIds) {
    const row = findContract(instanceId);
    if (!row || row.status !== "open") continue;
    const mark = marks[instanceId] ?? "skip";
    const locked = row.defId === "body_smooth_shave";
    if (mark === "done") {
      const result = reportContract(instanceId, "done");
      rewarded += result?.rewarded ?? 0;
      lockedDone += 1;
      markedDone += 1;
      if (row.defId === "body_smooth_shave") {
        state = {
          ...loadControlState(mistressId),
          lastShavedAtMs: Date.now(),
        };
        saveControlState(mistressId, state);
      }
    } else {
      reportContract(instanceId, "failed");
      markedSkip += 1;
      if (locked) lockedSkip += 1;
    }
  }
  recordMorningPackForSoul({
    mistressId,
    done: markedDone,
    skipped: markedSkip,
  });
  if (rewarded > 0) {
    saveWallet(creditCinders(loadWallet(), rewarded));
  }
  let delta = 0;
  if (lockedSkip > 0) delta = -2;
  else if (lockedDone > 0 && Object.values(marks).every((m) => m === "done")) {
    delta = 1;
  } else if (Object.values(marks).some((m) => m === "skip")) {
    delta = -1;
  } else {
    delta = 1;
  }
  const mood = applyMoodDelta(state.moodScore, delta);
  const harsh = mood.mood === "cruel" || mood.mood === "chaotic";
  const next: ControlState = {
    ...loadControlState(mistressId),
    moodScore: mood.score,
    moodAtMs: Date.now(),
    dispatch: {
      ...loadControlState(mistressId).dispatch,
      phase: harsh ? "punish" : "idle",
      morningIds: [],
      punishIds: harsh ? loadControlState(mistressId).dispatch.punishIds : [],
    },
  };
  if (harsh) {
    saveControlState(mistressId, next);
    notifyControlChanged();
    const refused = refuseSessionOffer(mistressId);
    return refused.state;
  }
  saveControlState(mistressId, next);
  notifyControlChanged();
  return next;
}
