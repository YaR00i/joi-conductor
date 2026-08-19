/**
 * Live session integration for accepted contracts (ruin→eat, edge quota, hands-off).
 * Pure helpers — App / SessionPage wire events; storage stays on ActiveSessionSeed.
 */

import type {
  ActiveSessionSeed,
  SessionSeedProgress,
  SessionSeedStepDef,
} from "./sessionSeed";
import { CEI_PROGRESS_STEPS } from "./sessionSeed";

/** Cumplay ritual step ids that count as the CEI eat beat. */
export const CONTRACT_EAT_STEP_IDS = new Set([
  "force_eat",
  "force_eat_confirm",
  "tempt_eat_halfway",
  "tempt_eat_soft",
  "tempt_eat_ruin",
  "unauth_cum_clean",
]);

/** Cumplay ritual step ids that count as the CEI open beat. */
export const CONTRACT_OPEN_STEP_IDS = new Set([
  "open_ruin",
  "open_cum",
  "mid_open",
  "finish_ruin",
  "unauth_ruin_open",
  "unauth_cum_open",
]);

/** Cumplay ritual step ids that count as the CEI thanks / close beat. */
export const CONTRACT_THANKS_STEP_IDS = new Set(["close", "mid_continue"]);

/** Main cumplay ids that already imply eating (no separate tempt step). */
export const CONTRACT_EAT_DONE_CUMPLAY_IDS = new Set([
  "swallow",
  "on_food_eat",
  "on_drink",
  "lick_fingers",
  "chew",
  "snowball_solo",
  "lick_toy",
  "feet_lick",
]);

/** Rest blocks injected for edge_hands_off use this id prefix. */
export const CONTRACT_HANDS_OFF_BLOCK_PREFIX = "contract-hands-off-";

export const CONTRACT_PROGRESS_FLASH_MS = 8_000;

export type ContractEatRestyle = {
  promptLabelRu: string;
  okButtonLabelRu: string;
};

export type ContractProgressFlashModel = {
  titleRu: string;
  ruleRu: string;
  metaRu: string;
  reward: number;
};

export type EdgeLiveNote = {
  next: ActiveSessionSeed;
  flash: ContractProgressFlashModel;
  /** Single-step edge quota just hit — settle done. */
  settleDone: boolean;
  /** Quota hit and hands-off rest should be injected. */
  injectHandsOff: boolean;
  handsOffSec: number;
};

export type CeiLiveNote = {
  next: ActiveSessionSeed;
  flash: ContractProgressFlashModel | null;
  settleDone: boolean;
  settleFailed: boolean;
  failReasonRu?: string;
};

export type UnauthorizedContractHit =
  | {
      action: "fail";
      next: ActiveSessionSeed;
      noticeRu: string;
      failFlashRu: string;
    }
  | {
      action: "tax";
      noticeRu: string;
    }
  | { action: "ignore" };

export function isContractEatStepId(stepId: string): boolean {
  return CONTRACT_EAT_STEP_IDS.has(stepId);
}

export function isContractOpenStepId(stepId: string): boolean {
  return CONTRACT_OPEN_STEP_IDS.has(stepId);
}

export function isContractThanksStepId(stepId: string): boolean {
  return CONTRACT_THANKS_STEP_IDS.has(stepId);
}

export function seedIsRuinEatLive(
  seed: ActiveSessionSeed | null | undefined,
): seed is ActiveSessionSeed {
  return Boolean(
    seed &&
      seed.progress &&
      (seed.verify.kind === "ate_release" ||
        seed.verify.kind === "ruin_and_eat"),
  );
}

export function seedIsCeiChainLive(
  seed: ActiveSessionSeed | null | undefined,
): seed is ActiveSessionSeed {
  if (!seedIsRuinEatLive(seed) || !seed.progress) return false;
  const active = seed.progress.steps[seed.progress.currentStep];
  return Boolean(
    active &&
      (active.id === "cei_open" ||
        active.id === "cei_eat" ||
        active.id === "cei_thanks" ||
        active.id === "ruin_finale"),
  );
}

/** Edge-quota live trackers (edges_min + progress). */
export function seedIsEdgeQuotaLive(
  seed: ActiveSessionSeed | null | undefined,
): seed is ActiveSessionSeed {
  return Boolean(
    seed &&
      seed.verify.kind === "edges_min" &&
      seed.progress &&
      (seed.progress.status === "pending" ||
        seed.progress.status === "awaiting"),
  );
}

export function seedIsHandsOffLive(
  seed: ActiveSessionSeed | null | undefined,
): seed is ActiveSessionSeed {
  return Boolean(
    seedIsEdgeQuotaLive(seed) &&
      seed.defId === "edge_hands_off" &&
      seed.progress &&
      seed.progress.steps.some((s) => s.id === "hands_off"),
  );
}

export function seedIsCbtQuestLive(
  seed: ActiveSessionSeed | null | undefined,
): seed is ActiveSessionSeed {
  return Boolean(
    seed &&
      seed.verify.kind === "quest_id" &&
      seed.linkedQuestId &&
      seedLiveProgressOpen(seed),
  );
}

export function seedLiveProgressOpen(
  seed: ActiveSessionSeed | null | undefined,
): seed is ActiveSessionSeed {
  if (!seed?.progress) return false;
  return (
    seed.progress.status === "pending" || seed.progress.status === "awaiting"
  );
}

function withProgress(
  seed: ActiveSessionSeed,
  progress: SessionSeedProgress,
): ActiveSessionSeed {
  return { ...seed, progress };
}

function activeCeiStepId(
  seed: ActiveSessionSeed,
): string | null {
  const progress = seed.progress;
  if (!progress) return null;
  return progress.steps[progress.currentStep]?.id ?? null;
}

/**
 * Ruin / cum ritual began — arm the active step (status awaiting).
 * For ruin_and_eat: complete ruin_finale when ritual is finale ruin.
 * Returns null if this seed does not track live eat progress.
 */
export function armSeedOnReleaseRitual(
  seed: ActiveSessionSeed,
  opts?: {
    ritualContext?: "finale" | "mid" | "unauthorized" | "precum";
    outcome?: "cum" | "ruin";
  },
): ActiveSessionSeed | null {
  if (!seedIsRuinEatLive(seed) || !seed.progress) return null;
  if (seed.progress.status === "done" || seed.progress.status === "failed") {
    return null;
  }

  // Unauthorized rituals must not progress sealed CEI / ruin-eat chains.
  if (opts?.ritualContext === "unauthorized") return null;
  if (opts?.ritualContext === "precum") return null;

  let next = seed;
  const activeId = activeCeiStepId(next);

  // Composite: mark finale-ruin step when the finale ruin ritual starts.
  if (
    next.verify.kind === "ruin_and_eat" &&
    activeId === "ruin_finale" &&
    opts?.ritualContext === "finale" &&
    opts.outcome === "ruin"
  ) {
    const advanced = completeSeedLiveStep(next, "ruin_finale");
    if (advanced) next = advanced;
  } else if (
    next.verify.kind === "ruin_and_eat" &&
    activeId === "ruin_finale" &&
    opts?.ritualContext === "mid" &&
    next.progress
  ) {
    // Mid-ruin: practice the eat chain; finale step stays for session_end.
    const ceiIndex = next.progress.steps.findIndex((s) => s.id === "cei_open");
    if (ceiIndex >= 0) {
      next = withProgress(next, {
        ...next.progress,
        currentStep: ceiIndex,
        status: "awaiting",
      });
      return next;
    }
  }

  if (!next.progress) return null;
  if (next.progress.status === "done" || next.progress.status === "failed") {
    return next;
  }
  if (next.progress.status === "awaiting") return next;
  return withProgress(next, {
    ...next.progress,
    status: "awaiting",
  });
}

/**
 * Mark the current live step complete. Multi-step: advances currentStep;
 * only marks done when all steps finished.
 */
export function completeSeedLiveStep(
  seed: ActiveSessionSeed,
  stepId: string,
): ActiveSessionSeed | null {
  if (!seedLiveProgressOpen(seed) || !seed.progress) return null;
  const progress = seed.progress;
  const active = progress.steps[progress.currentStep];
  if (!active) return null;
  // Multi-step: require matching active id. Single-step: allow any stepId.
  if (stepId && active.id !== stepId && progress.steps.length > 1) {
    return null;
  }

  const completedStepIds = progress.completedStepIds.includes(active.id)
    ? progress.completedStepIds
    : [...progress.completedStepIds, active.id];

  const nextIndex = progress.currentStep + 1;
  if (nextIndex >= progress.steps.length) {
    return withProgress(seed, {
      ...progress,
      completedStepIds,
      currentStep: progress.steps.length - 1,
      status: "done",
    });
  }

  return withProgress(seed, {
    ...progress,
    completedStepIds,
    currentStep: nextIndex,
    status: "awaiting",
  });
}

export function failSeedLiveStep(
  seed: ActiveSessionSeed,
): ActiveSessionSeed | null {
  if (!seedLiveProgressOpen(seed) || !seed.progress) return null;
  return withProgress(seed, {
    ...seed.progress,
    status: "failed",
  });
}

/** Whether answering this cumplay option fulfills the ruin-eat obligation (eat beat). */
export function cumplayAnswerFulfillsRuinEat(opts: {
  stepId: string;
  optionEffect: string;
  cumplayId?: string;
}): boolean {
  if (opts.optionEffect !== "cumplay_ok") return false;
  if (isContractEatStepId(opts.stepId)) return true;
  // Inherent eat cumplay (no separate tempt step) uses main_* step ids.
  if (
    opts.cumplayId &&
    CONTRACT_EAT_DONE_CUMPLAY_IDS.has(opts.cumplayId) &&
    opts.stepId.startsWith("main_")
  ) {
    return true;
  }
  return false;
}

function ritualMatchesActiveCeiStep(
  activeStepId: string,
  opts: {
    stepId: string;
    optionEffect: string;
    cumplayId?: string;
  },
): "advance" | "fail" | "noop" {
  const ok = opts.optionEffect === "cumplay_ok";
  const fail =
    opts.optionEffect === "cumplay_fail" || opts.optionEffect === "mute";

  switch (activeStepId) {
    case "ruin_finale":
      return "noop";
    case "cei_open": {
      if (!isContractOpenStepId(opts.stepId)) return "noop";
      if (ok) return "advance";
      if (fail) return "fail";
      return "noop";
    }
    case "cei_eat": {
      if (
        cumplayAnswerFulfillsRuinEat({
          stepId: opts.stepId,
          optionEffect: opts.optionEffect,
          cumplayId: opts.cumplayId,
        })
      ) {
        return "advance";
      }
      if (isContractEatStepId(opts.stepId) && fail) return "fail";
      if (
        opts.cumplayId &&
        CONTRACT_EAT_DONE_CUMPLAY_IDS.has(opts.cumplayId) &&
        opts.stepId.startsWith("main_") &&
        fail
      ) {
        return "fail";
      }
      return "noop";
    }
    case "cei_thanks": {
      if (!isContractThanksStepId(opts.stepId)) return "noop";
      if (ok) return "advance";
      if (fail) return "fail";
      return "noop";
    }
    default:
      return "noop";
  }
}

/**
 * Apply a cumplay dock answer to a multi-step CEI / ruin+eat seed.
 * Completes only the active matching step; settles when all steps done
 * (ate_release) or when chain done during finale ruin (ruin_and_eat).
 */
export function noteCumplayAnswerOnCeiSeed(
  seed: ActiveSessionSeed,
  opts: {
    stepId: string;
    optionEffect: string;
    cumplayId?: string;
    ritualContext?: "finale" | "mid" | "unauthorized" | "precum";
    reward: number;
  },
): CeiLiveNote | null {
  if (!seedIsRuinEatLive(seed) || !seedLiveProgressOpen(seed)) return null;
  if (opts.ritualContext === "unauthorized" || opts.ritualContext === "precum") {
    return null;
  }

  const activeId = activeCeiStepId(seed);
  if (!activeId) return null;

  const match = ritualMatchesActiveCeiStep(activeId, opts);
  if (match === "noop") return null;

  if (match === "fail") {
    const failed = failSeedLiveStep(seed);
    if (!failed) return null;
    return {
      next: failed,
      flash: null,
      settleDone: false,
      settleFailed: true,
      failReasonRu: "Не выполнил шаг печати CEI",
    };
  }

  const advanced = completeSeedLiveStep(seed, activeId);
  if (!advanced?.progress) return null;

  const flash = buildContractProgressFlash(advanced, opts.reward);
  const chainDone = advanced.progress.status === "done";

  if (!chainDone) {
    return {
      next: advanced,
      flash,
      settleDone: false,
      settleFailed: false,
    };
  }

  // ate_release: settle as soon as open→eat→thanks finishes.
  if (seed.verify.kind === "ate_release") {
    return {
      next: advanced,
      flash,
      settleDone: true,
      settleFailed: false,
    };
  }

  // ruin_and_eat: only mid-settle during finale ruin ritual.
  if (
    seed.verify.kind === "ruin_and_eat" &&
    opts.ritualContext === "finale"
  ) {
    return {
      next: advanced,
      flash,
      settleDone: true,
      settleFailed: false,
    };
  }

  // Mid-ruin eat finished early — keep seed until session_end evaluate.
  return {
    next: advanced,
    flash,
    settleDone: false,
    settleFailed: false,
  };
}

/** Mistress-flavored restyle for the active CEI step prompt / ok button. */
export function ruinEatRestyleRu(
  seed: ActiveSessionSeed,
): ContractEatRestyle {
  const stepId = activeCeiStepId(seed);
  switch (stepId) {
    case "cei_open":
      return {
        promptLabelRu: "Контракт: покажи — не вытирай",
        okButtonLabelRu: "Показал по печати",
      };
    case "cei_eat":
      return {
        promptLabelRu: "Контракт: съешь — как обещал",
        okButtonLabelRu: "Съел по печати",
      };
    case "cei_thanks":
      return {
        promptLabelRu: "Контракт: поблагодари хозяйку",
        okButtonLabelRu: "Спасибо по печати",
      };
    case "ruin_finale":
      return {
        promptLabelRu: "Контракт: только руин",
        okButtonLabelRu: "Руин по печати",
      };
    default:
      return {
        promptLabelRu: "Контракт: съешь — как обещал",
        okButtonLabelRu: "Съел по печати",
      };
  }
}

/** Right-rail flash (~8s), distinct from temporary quests. */
export function buildContractProgressFlash(
  seed: ActiveSessionSeed,
  reward: number,
): ContractProgressFlashModel {
  const progress = seed.progress;
  const total = progress?.steps.length ?? 1;
  const done = progress?.completedStepIds.length ?? 0;
  const cur = Math.min(
    total,
    Math.max(1, (progress?.currentStep ?? 0) + 1),
  );
  const step = progress?.steps[progress.currentStep];
  const fraction =
    progress?.status === "done"
      ? `${total}/${total}`
      : done > 0
        ? `${Math.min(total, done + 1)}/${total}`
        : `${cur}/${total}`;
  return {
    titleRu: seed.titleRu,
    ruleRu: step?.labelRu
      ? `${fraction}: ${step.labelRu}`
      : `${fraction}: съешь по контракту`,
    metaRu: "Печать · прогресс",
    reward: Math.max(0, Math.floor(reward)),
  };
}

export function buildEdgeQuotaFlash(
  seed: ActiveSessionSeed,
  edgesDone: number,
  reward: number,
): ContractProgressFlashModel {
  const n = seed.verify.kind === "edges_min" ? seed.verify.n : 0;
  const cur = Math.max(0, Math.min(edgesDone, n));
  const hit = n > 0 && cur >= n;
  return {
    titleRu: seed.titleRu,
    ruleRu: `${cur}/${n} эджей`,
    metaRu: hit ? "Печать · квота" : "Печать · прогресс",
    reward: Math.max(0, Math.floor(reward)),
  };
}

export function buildHandsOffFlash(
  seed: ActiveSessionSeed,
  minutes: number,
  reward: number,
): ContractProgressFlashModel {
  const m = Math.max(1, Math.round(minutes));
  return {
    titleRu: seed.titleRu,
    ruleRu: `Hands-off ${m} мин — руки прочь`,
    metaRu: "Печать · пауза",
    reward: Math.max(0, Math.floor(reward)),
  };
}

export function buildMediaBridgeFlash(
  seed: ActiveSessionSeed,
  reward: number,
): ContractProgressFlashModel {
  const tag = seed.mediaBridgeTag?.trim() || "кэш";
  const trigger = seed.mediaBridgeTriggerRu?.trim();
  return {
    titleRu: seed.titleRu,
    ruleRu: trigger
      ? `Дрель в сессии: тег «${tag}» · триггер «${trigger}»`
      : `Дрель в сессии: тег «${tag}»`,
    metaRu: "Печать · медиа",
    reward: Math.max(0, Math.floor(reward)),
  };
}

export function buildCbtQuestFlash(
  seed: ActiveSessionSeed,
  reward: number,
): ContractProgressFlashModel {
  return {
    titleRu: seed.titleRu,
    ruleRu: "Шаг 1/1: квест «Ударь по яйцам»",
    metaRu: "Печать · CBT",
    reward: Math.max(0, Math.floor(reward)),
  };
}

/**
 * Apply an edge_done tally to a live edge-quota seed.
 * Flashes on every edge_done; settles or arms hands-off when quota hits.
 */
export function noteEdgeDoneOnSeed(
  seed: ActiveSessionSeed,
  edgesDone: number,
  reward: number,
): EdgeLiveNote | null {
  if (!seedIsEdgeQuotaLive(seed) || !seed.progress) return null;
  if (seed.verify.kind !== "edges_min") return null;

  const n = seed.verify.n;
  const progress = seed.progress;
  const active = progress.steps[progress.currentStep];
  // Already past edges step (hands-off awaiting) — ignore further edges.
  if (active?.id === "hands_off") return null;

  let next = seed;
  if (progress.status === "pending") {
    next = withProgress(seed, { ...progress, status: "awaiting" });
  }

  const flash = buildEdgeQuotaFlash(next, edgesDone, reward);
  if (edgesDone < n) {
    return {
      next,
      flash,
      settleDone: false,
      injectHandsOff: false,
      handsOffSec: 0,
    };
  }

  // Quota met.
  const afterEdges = completeSeedLiveStep(next, "edges_quota");
  if (!afterEdges?.progress) return null;

  if (afterEdges.progress.status === "done") {
    return {
      next: afterEdges,
      flash: buildEdgeQuotaFlash(afterEdges, edgesDone, reward),
      settleDone: true,
      injectHandsOff: false,
      handsOffSec: 0,
    };
  }

  // Advanced into hands-off step.
  const handsOffSec =
    typeof afterEdges.handsOffSec === "number" && afterEdges.handsOffSec > 0
      ? afterEdges.handsOffSec
      : 10 * 60;
  const minutes = handsOffSec / 60;
  return {
    next: afterEdges,
    flash: buildHandsOffFlash(afterEdges, minutes, reward),
    settleDone: false,
    injectHandsOff: true,
    handsOffSec,
  };
}

/** True when hands-off rest block id belongs to this contract injection. */
export function isContractHandsOffBlockId(blockId: string): boolean {
  return blockId.startsWith(CONTRACT_HANDS_OFF_BLOCK_PREFIX);
}

/**
 * Complete the hands-off rest step (block_end of injected rest).
 */
export function completeHandsOffRestStep(
  seed: ActiveSessionSeed,
): ActiveSessionSeed | null {
  if (!seedLiveProgressOpen(seed) || !seed.progress) return null;
  const active = seed.progress.steps[seed.progress.currentStep];
  if (active?.id !== "hands_off") return null;
  return completeSeedLiveStep(seed, "hands_off");
}

/**
 * Fail hands-off when unauthorized touch happens during the rest window.
 */
export function failHandsOffOnUnauthorized(
  seed: ActiveSessionSeed,
): ActiveSessionSeed | null {
  if (!seedIsHandsOffLive(seed) || !seed.progress) return null;
  const active = seed.progress.steps[seed.progress.currentStep];
  if (active?.id !== "hands_off") return null;
  if (seed.progress.status !== "awaiting") return null;
  return failSeedLiveStep(seed);
}

/**
 * Unauthorized FAB ↔ sealed obligations.
 * Hands-off rest failure is handled first by the caller via failHandsOffOnUnauthorized.
 * Edge-quota counting already ignores unauthorized edges — do not double-fail those.
 */
export function noteUnauthorizedOnSeed(
  seed: ActiveSessionSeed,
  kind: "edge" | "ruin" | "cum",
): UnauthorizedContractHit {
  // Hands-off rest window — exclusive path (caller should have handled).
  if (seedIsHandsOffLive(seed)) {
    const active = seed.progress?.steps[seed.progress.currentStep];
    if (active?.id === "hands_off" && seed.progress?.status === "awaiting") {
      return { action: "ignore" };
    }
  }

  // Deny seal: ruin/cum breaks the deny; edge is a tax notice only.
  if (seed.defId === "session_deny_tomorrow") {
    if (kind === "edge") {
      return {
        action: "tax",
        noticeRu: "Печать deny: лишний эдж — налог. Cum/руин сломают контракт.",
      };
    }
    const failed = failSeedLiveStep(
      seed.progress
        ? seed
        : {
            ...seed,
            progress: {
              steps: [{ id: "deny_seal", labelRu: "Deny" }],
              currentStep: 0,
              completedStepIds: [],
              status: "awaiting",
            },
          },
    );
    const next =
      failed ??
      ({
        ...seed,
        progress: {
          steps: [{ id: "deny_seal", labelRu: "Deny" }],
          currentStep: 0,
          completedStepIds: [],
          status: "failed" as const,
        },
      } satisfies ActiveSessionSeed);
    return {
      action: "fail",
      next,
      noticeRu: "Печать deny сломана несанкционированным срывом.",
      failFlashRu: "Контракт провален: deny нарушен",
    };
  }

  // Ruin+eat / CEI awaiting: unauthorized ruin/cum fails the seal.
  if (
    seedIsRuinEatLive(seed) &&
    seedLiveProgressOpen(seed) &&
    (kind === "ruin" || kind === "cum")
  ) {
    const failed = failSeedLiveStep(seed);
    if (!failed) return { action: "ignore" };
    return {
      action: "fail",
      next: failed,
      noticeRu: "Печать CEI/руин: срыв без приказа — провал.",
      failFlashRu:
        seed.verify.kind === "ruin_and_eat"
          ? "Контракт провален: руин без приказа"
          : "Контракт провален: срыв CEI",
    };
  }

  // CEI / ruin-eat still pending (not armed): tax on unauthorized release.
  if (
    seedIsRuinEatLive(seed) &&
    seed.progress?.status === "pending" &&
    (kind === "ruin" || kind === "cum")
  ) {
    return {
      action: "tax",
      noticeRu: "Печать ждёт ритуал — этот срыв не засчитывается в контракт.",
    };
  }

  // Edge quota (not hands-off rest): edges already untaxed for counting — soft tax.
  if (seedIsEdgeQuotaLive(seed) && kind === "edge") {
    const active = seed.progress?.steps[seed.progress.currentStep];
    if (active?.id !== "hands_off") {
      return {
        action: "tax",
        noticeRu: "Печать эджей: несанкционированный эдж не в квоту.",
      };
    }
  }

  return { action: "ignore" };
}

/**
 * Quest completed matching CBT contract — settle contract (contract pays).
 * Caller must suppress quest cinders when this returns settleDone.
 */
export function noteQuestCompletedOnSeed(
  seed: ActiveSessionSeed,
  questId: string,
  reward: number,
): CeiLiveNote | null {
  if (!seedIsCbtQuestLive(seed) || !seed.progress) return null;
  if (seed.verify.kind !== "quest_id") return null;
  if (!(seed.verify.questIds as readonly string[]).includes(questId)) {
    return null;
  }
  if (seed.linkedQuestId && seed.linkedQuestId !== questId) return null;

  const done = completeSeedLiveStep(seed, seed.progress.steps[0]!.id);
  if (!done?.progress) return null;
  return {
    next: done,
    flash: buildCbtQuestFlash(done, reward),
    settleDone: done.progress.status === "done",
    settleFailed: false,
  };
}

/**
 * True when the live cumplay dock should use contract restyle colors/labels.
 */
export function shouldRestyleCumplayEat(opts: {
  seed: ActiveSessionSeed | null | undefined;
  stepId: string | null | undefined;
}): boolean {
  if (!opts.seed || !opts.stepId) return false;
  if (!seedLiveProgressOpen(opts.seed)) return false;
  if (
    opts.seed.verify.kind !== "ate_release" &&
    opts.seed.verify.kind !== "ruin_and_eat"
  ) {
    return false;
  }
  const activeId = activeCeiStepId(opts.seed);
  if (activeId === "cei_open") return isContractOpenStepId(opts.stepId);
  if (activeId === "cei_eat") {
    return (
      isContractEatStepId(opts.stepId) || opts.stepId.startsWith("main_")
    );
  }
  if (activeId === "cei_thanks") return isContractThanksStepId(opts.stepId);
  return isContractEatStepId(opts.stepId);
}

/** Quest Done button restyle when CBT contract is linked. */
export function cbtQuestDoneRestyleRu(
  seed: ActiveSessionSeed | null | undefined,
): { doneLabelRu: string; tagRu: string } | null {
  if (!seedIsCbtQuestLive(seed)) return null;
  return {
    doneLabelRu: "Сделал по печати",
    tagRu: "Контракт · CBT",
  };
}

/** Hours until board deadline, clamped for denialQuest. */
export function denialHoursUntilDeadline(
  deadlineMs: number,
  nowMs = Date.now(),
): number {
  const hours = (deadlineMs - nowMs) / 3_600_000;
  return Math.max(0.25, Math.min(48, hours));
}

/** Exported for tests / builders that want a fresh CEI step list copy. */
export function cloneCeiProgressSteps(): SessionSeedStepDef[] {
  return CEI_PROGRESS_STEPS.map((s) => ({ ...s }));
}
