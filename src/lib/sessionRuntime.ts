import { BeatClock } from "./beatClock";
import {
  buildEdgeAdSequence,
  buildRemainingQueue,
  sessionHeatFromElapsed,
  rollFinale,
  type CatalogSlice,
} from "./conductor";
import { resolveSessionFinaleOdds } from "./planRoulette";
import {
  BREATH_FEATURE_ID,
  makeBreathBlock,
  moodBreathPrepSec,
  moodBreathTargetCount,
  moodBreathHoldSec,
  moodTimerTeaseChance,
  moodTimerTeaseExtendSec,
  moodTimerTeasePauseSec,
  pickBreathMode,
  TIMER_TEASE_COOLDOWN_MS,
} from "./breathHold";
import {
  calcSessionCompleteCinders,
  emptyWallet,
  isFeatureUnlocked,
  PROMPT_BRIBE_COST,
  type WalletUnlocks,
} from "./wallet";
import {
  applyBegDenyWantParams,
  applyBegPleaseParams,
  applyDenialBiasParams,
  applyFinaleBiasParams,
  applySoftMercyParams,
  denialQuestFromMood,
  rollDiceChaos,
} from "./sessionEvents";
import {
  moodScaleTaskSec,
  paramsAfterMoodOffer,
} from "./moodSessionBias";
import type { SessionEventBus } from "./eventBus";
import { getFunction, getPattern, getToy } from "./catalog";
import { patternCycleEndAtMs } from "./beatSchedule";
import {
  BEAT_BLOCK_GAP_MS,
  BEAT_LEAD_IN_MS,
} from "./beatTiming";
import {
  appendUpcomingBlocks,
  dropUpcomingBlock,
  insertBlockAfter,
  moveUpcomingBlock,
} from "./queueEdit";
import {
  applyMoodDelta,
  confirmObedienceDelta,
  DEFAULT_MOOD_SCORE,
  isHarshMood,
  moodFromScore,
  unauthorizedMoodDelta,
} from "./moodEngine";
import {
  activeMistressPrompts,
  applyPreferDelta,
  equipPool,
  moodDeltaForEffect,
  pickMistressPrompt,
  resolveCageHours,
  rollPromptKind,
  type FetishPrefs,
  type MistressPromptDef,
} from "./mistressPrompts";
import { mistressAllowsCumFinale } from "./mistress/playBias";
import {
  buildChoiceRoulette,
  buildEdgesTaxRoulette,
  choiceActionLabelRu,
  isChoiceAction,
  moodEdgesTaxChance,
  moodEdgesTaxMaxSpins,
  pickChoiceRouletteTarget,
  type ChoiceAction,
} from "./choiceOffers";
import {
  buildCumplayRitual,
  buildMidRuinRitual,
  buildPrecumRitual,
  buildUnauthorizedCumRitual,
  buildUnauthorizedRuinRitual,
  cumplayEffectMoodDelta,
  type CumplayStepEffect,
} from "./cumplayRitual";
import { listEnabledQuestDefs } from "./questPool";
import {
  buildForcedQuestOffer,
  buildQuestOffer,
  isQuestBlockId,
  makeQuestBlock,
  questUsesBeatCounter,
} from "./quests";
import {
  idolBuzzFailSpeakEn,
  idolBuzzSuccessSpeakEn,
  idolBuzzTargetSec,
  idolChorusCompleteAskLabelRu,
  idolChorusCompleteAskSpeakEn,
  idolChorusCompleteNoSpeakEn,
  idolChorusCompleteYesSpeakEn,
  idolChorusMissAskLabelRu,
  idolChorusMissAskSpeakEn,
  idolChorusMissCap,
  idolChorusMissConsequence,
  idolChorusSoftTarget,
  isIdolAutoAccent,
  isIdolBuzzFunction,
  isIdolChorusFunction,
  type IdolBuzzHoldMode,
} from "./idolHits";
import {
  isTideAutoAccent,
  isTideHitFunction,
  tideCompleteAskLabelRu,
  tideCompleteAskSpeakEn,
  tideCompleteNoSpeakEn,
  tideCompleteYesSpeakEn,
  tideMissAskLabelRu,
  tideMissAskSpeakEn,
  tideMissCap,
  tideMissConsequence,
  tideSoftTarget,
} from "./tideHits";
import {
  loadTideHitVerifySettings,
  shouldAutoCountTideOnAccent,
} from "./tideHitVerify";
import { getActiveMistress } from "./mistress";
import {
  isNoneToyAllowList,
  isToyAllowedInSession,
} from "./toyRoulette";
import { equipToy } from "./toyLoadout";
import {
  pauseVibeHum,
  resumeVibeHum,
  setVibeHumLevel,
  stopVibeHum,
} from "./vibeHum";
import type {
  ActiveChoiceRoulette,
  ActiveCumplayRitual,
  ActiveDareTask,
  ActiveMistressPrompt,
  Block,
  QuestId,
  SessionEvent,
  SessionParams,
  SessionState,
  SessionStatus,
  VoiceLayer,
} from "./types";
import { VibeClock } from "./vibeClock";
import { getVibeProfile } from "./vibeProfiles";
import {
  clearSessionCheckpoint,
  saveSessionCheckpoint,
  sanitizeStateForCheckpoint,
  type SessionCheckpoint,
  type SessionCheckpointMeta,
} from "./sessionCheckpoint";
import { isLabPracticeRun } from "./sessionBlockLab";

export type RuntimeListener = (state: SessionState) => void;

function isPromptGate(
  phase: SessionState["promptPhase"] | undefined,
): boolean {
  return (
    phase === "await" ||
    phase === "task_running" ||
    phase === "task_report" ||
    phase === "promise_pending" ||
    phase === "cumplay_ritual" ||
    phase === "choice_spinning" ||
    phase === "tide_miss_pending" ||
    phase === "tide_complete_pending" ||
    phase === "idol_miss_pending" ||
    phase === "idol_complete_pending"
  );
}

export class SessionRuntime {
  private bus: SessionEventBus;
  private voice: VoiceLayer;
  private clock: BeatClock;
  private vibeClock: VibeClock;
  private state: SessionState | null = null;
  private blockTimer: ReturnType<typeof setInterval> | null = null;
  private clockStartTimer: ReturnType<typeof setTimeout> | null = null;
  private softSkipTimer: ReturnType<typeof setTimeout> | null = null;
  private listeners = new Set<RuntimeListener>();
  private rng = Math.random;
  /** How many beat-driven blocks have started this session (for handoff gap). */
  private beatBlockCount = 0;
  private lastPromptId: string | null = null;
  /** Recent countable block goals (newest last) for contextual feeling prompts. */
  private recentGoals: string[] = [];
  private catalog: CatalogSlice | null = null;
  private lastCountdownN: number | null = null;
  private unlocks: WalletUnlocks = emptyWallet().unlocks;
  /** Last heat band (0.25 steps) already applied to the remaining queue. */
  private pressureHeatBand = 0;
  /** Wall clock of last timer_tease freeze (cooldown). */
  private lastTimerTeaseAtPerf = 0;
  /** Mistress edge-tax roulette spins this session. */
  private edgesTaxCount = 0;
  private lastEdgesTaxAtPerf = 0;
  /** performance.now() when pause() last ran — shift blockEnteredAtPerf on resume. */
  private pausedAtPerf = 0;

  constructor(bus: SessionEventBus, voice: VoiceLayer) {
    this.bus = bus;
    this.voice = voice;
    this.clock = new BeatClock((payload) => {
      const s = this.state;
      if (!s || s.status !== "running") return;
      const block = s.queue[s.index];
      if (!block) return;
      this.emit({
        type: "beat",
        blockId: block.id,
        stepIndex: payload.stepIndex,
        accent: payload.accent,
        bpm: payload.bpm,
        atMs: payload.atMs,
      });
      if (
        block.goal === "breath" &&
        s.breathPhase === "holding" &&
        block.breathMode === "stroke_beats" &&
        payload.accent >= 2
      ) {
        const breathProgress = (s.breathProgress ?? 0) + 1;
        this.state = { ...s, breathProgress };
        this.notify();
        if (breathProgress >= (block.breathTargetCount ?? 1)) {
          this.completeBreath(true);
        }
      } else if (
        block.goal === "stroke" &&
        !isQuestBlockId(block.id) &&
        isTideHitFunction(block.functionId) &&
        (s.tideTarget ?? 0) > 0 &&
        isTideAutoAccent(payload.accent) &&
        s.promptPhase !== "tide_miss_pending" &&
        shouldAutoCountTideOnAccent(loadTideHitVerifySettings().mode)
      ) {
        this.reportTideHit();
      } else if (
        block.goal === "stroke" &&
        !isQuestBlockId(block.id) &&
        isIdolChorusFunction(block.functionId) &&
        (s.idolTarget ?? 0) > 0 &&
        isIdolAutoAccent(payload.accent) &&
        s.promptPhase !== "idol_miss_pending" &&
        getActiveMistress().id === "sunna"
      ) {
        this.reportIdolHit();
      }
    });
    this.vibeClock = new VibeClock((payload) => {
      const s = this.state;
      if (!s || s.status !== "running") return;
      const block = s.queue[s.index];
      if (!block) return;
      setVibeHumLevel(payload.level);
      this.emit({
        type: "vibe_level",
        blockId: block.id,
        level: payload.level,
        labelRu: payload.labelRu,
        segmentIndex: payload.segmentIndex,
        segmentDurationSec: payload.segmentDurationSec,
        profileId: payload.profileId,
        atMs: payload.atMs,
      });
    });
  }

  subscribe(listener: RuntimeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Toys + functions for mid-session mode hijack (cage dare). */
  setCatalog(catalog: CatalogSlice): void {
    this.catalog = catalog;
  }

  setUnlocks(unlocks: WalletUnlocks): void {
    this.unlocks = unlocks;
  }

  getState(): SessionState | null {
    return this.state;
  }

  /** Snapshot for crash / reload resume. */
  exportCheckpoint(): SessionCheckpoint | null {
    if (!this.state) return null;
    if (this.state.labPractice) return null;
    if (this.state.status !== "running" && this.state.status !== "paused") {
      return null;
    }
    const state = sanitizeStateForCheckpoint(this.state);
    const meta: SessionCheckpointMeta = {
      pressureHeatBand: this.pressureHeatBand,
      edgesTaxCount: this.edgesTaxCount,
      recentGoals: [...this.recentGoals],
      lastPromptId: this.lastPromptId,
      beatBlockCount: this.beatBlockCount,
    };
    return {
      version: 1,
      savedAtMs: Date.now(),
      mistressId: getActiveMistress().id,
      elapsedSec: state.elapsedSec,
      edgesDone: state.edgesDone,
      edgesTarget: state.params.edgesTarget,
      state,
      meta,
    };
  }

  /**
   * Restore a checkpoint as paused. Call `resume()` to re-enter the current block.
   */
  restoreCheckpoint(cp: SessionCheckpoint): boolean {
    if (cp.version !== 1 || !cp.state) return false;
    this.stopTimers();
    this.clock.stop();
    this.vibeClock.stop();
    stopVibeHum();
    this.state = sanitizeStateForCheckpoint(cp.state);
    this.pressureHeatBand = cp.meta.pressureHeatBand ?? 0;
    this.edgesTaxCount = cp.meta.edgesTaxCount ?? 0;
    this.recentGoals = [...(cp.meta.recentGoals ?? [])];
    this.lastPromptId = cp.meta.lastPromptId ?? null;
    this.beatBlockCount = cp.meta.beatBlockCount ?? 0;
    this.lastTimerTeaseAtPerf = 0;
    this.lastEdgesTaxAtPerf = 0;
    this.blockTimer = setInterval(() => this.tickSecond(), 1000);
    this.notify();
    return true;
  }

  /** Emit a feedback event through the voice layer (like / ready / …). */
  emitExternal(event: SessionEvent): void {
    this.emit(event);
  }

  /**
   * Queue a hands-off rest immediately after the current block.
   * Call from edge_done before advanceBlock so the next enter is the rest.
   * `blockId` should use a stable prefix so App can detect block_end.
   */
  injectContractRest(durationSec: number, blockId: string): boolean {
    if (!this.state || this.state.status !== "running") return false;
    if (isPromptGate(this.state.promptPhase)) return false;
    const i = this.state.index;
    const rest = this.makeRestBlock(
      blockId,
      Math.max(5, Math.floor(durationSec)),
      this.state.params.mode,
    );
    const nextQueue = [
      ...this.state.queue.slice(0, i + 1),
      rest,
      ...this.state.queue.slice(i + 1),
    ];
    this.state = { ...this.state, queue: nextQueue };
    this.notify();
    return true;
  }

  start(
    params: SessionParams,
    queue: Block[],
    seed?: number,
    opts: {
      moodScore?: number;
      fetishPrefs?: FetishPrefs;
      begBonus?: number;
      equippedToyIds?: string[];
      idolBuzzHoldMode?: IdolBuzzHoldMode;
      /** Sandbox lab queue — finish without diary / debrief. */
      labPractice?: boolean;
    } = {},
  ): void {
    this.stopTimers();
    this.recentGoals = [];
    this.pressureHeatBand = 0;
    const moodScore =
      opts.moodScore != null ? opts.moodScore : DEFAULT_MOOD_SCORE;
    this.state = {
      status: "running",
      params,
      queue,
      index: 0,
      elapsedSec: 0,
      blockElapsedSec: 0,
      blockEnteredAtPerf: null,
      edgesDone: 0,
      holdsDone: 0,
      ruinsDone: 0,
      seed,
      beatOriginPerf: null,
      beatUntilAtMs: null,
      labPractice: opts.labPractice === true ? true : undefined,
      finaleOutcome: undefined,
      finalePhase: null,
      mood: moodFromScore(moodScore),
      moodScore,
      confirmRequestAtPerf: null,
      holdArmed: false,
      holdGraceUntilPerf: null,
      promptPhase: null,
      activePrompt: null,
      choiceRoulette: null,
      blocksSincePrompt: 0,
      nextPromptAfter: 2 + Math.floor(this.rng() * 3),
      pendingEnterIndex: null,
      fetishPrefs: { ...(opts.fetishPrefs ?? {}) },
      activeTask: null,
      promiseCumEat: false,
      pendingCageHours: null,
      equippedToyIds: [...(opts.equippedToyIds ?? [])],
      cumplayRitual: null,
      blocksSincePrecum: 99,
      begCredits: 2 + Math.max(0, opts.begBonus ?? 0),
      begsUsed: 0,
      finaleBegDone: false,
      pendingDenialHours: null,
      pendingDenialEdges: null,
      questOffer: null,
      pendingQuest: null,
      activeQuest: null,
      blocksSinceQuest: 0,
      nextQuestAfter: 3 + Math.floor(this.rng() * 3),
      breathPhase: null,
      breathProgress: 0,
      tideHits: 0,
      tideTarget: 0,
      idolHits: 0,
      idolTarget: 0,
      idolConfessed: false,
      idolCompleteResolved: false,
      idolBuzzPhase: null,
      idolBuzzTargetSec: 0,
      idolBuzzElapsedSec: 0,
      idolBuzzHoldMode: opts.idolBuzzHoldMode ?? "hands_on",
      timerTease: null,
    };
    this.lastPromptId = null;
    this.lastTimerTeaseAtPerf = 0;
    this.edgesTaxCount = 0;
    this.lastEdgesTaxAtPerf = 0;
    this.pausedAtPerf = 0;
    this.emit({ type: "session_start", params, seed });
    this.notify();
    this.beatBlockCount = 0;
    this.enterBlock(0);
    this.blockTimer = setInterval(() => this.tickSecond(), 1000);
  }

  /**
   * Force a catalog quest offer (CBT contract bridge, lab picker).
   * Reward 0 when a linked contract pays cinders instead.
   * `replaceOffer` swaps a visible offer; never interrupts an in-progress quest.
   */
  forceQuestOffer(
    questId: QuestId,
    opts?: {
      rewardOverride?: number;
      contractRuleRu?: string;
      replaceOffer?: boolean;
    },
  ): boolean {
    if (!this.state || this.state.status !== "running") return false;
    if (this.state.pendingQuest || this.state.activeQuest) return false;
    if (this.state.questOffer && !opts?.replaceOffer) return false;
    if (isPromptGate(this.state.promptPhase)) return false;
    const offer = buildForcedQuestOffer(this.rng, questId, {
      mood: this.state.mood,
      rewardOverride: opts?.rewardOverride,
      contractRuleRu: opts?.contractRuleRu,
    });
    this.state = {
      ...this.state,
      questOffer: offer,
      blocksSinceQuest: 0,
      nextQuestAfter: 3 + Math.floor(this.rng() * 3),
    };
    this.emit({ type: "quest_offer", offer });
    this.notify();
    return true;
  }

  /** Accept the current Hu Tao quest offer — splices after current block ends. */
  acceptQuest(): void {
    if (!this.state || this.state.status !== "running") return;
    const offer = this.state.questOffer;
    if (!offer || this.state.pendingQuest || this.state.activeQuest) return;
    this.state = {
      ...this.state,
      questOffer: null,
      pendingQuest: { ...offer },
      blocksSinceQuest: 0,
      nextQuestAfter: 3 + Math.floor(this.rng() * 3),
    };
    this.emit({
      type: "quest_accepted",
      questId: offer.questId,
      offerId: offer.id,
    });
    this.notify();
  }

  declineQuest(): void {
    if (!this.state) return;
    const offer = this.state.questOffer;
    if (!offer) return;
    this.state = {
      ...this.state,
      questOffer: null,
      blocksSinceQuest: 0,
      nextQuestAfter: 3 + Math.floor(this.rng() * 3),
    };
    this.emit({
      type: "quest_declined",
      questId: offer.questId,
      offerId: offer.id,
    });
    this.notify();
  }

  /** Self-report for the live bonus quest block. */
  reportQuest(success: boolean): void {
    if (!this.state?.activeQuest) return;
    if (isPromptGate(this.state.promptPhase)) return;
    this.finishActiveQuest(success);
  }

  /**
   * Buy out of the current mistress gate with cinders.
   * No mood penalty / no refuse punishment — App spends wallet first.
   */
  bribeMistressGate(): boolean {
    if (!this.state || this.state.status !== "running") return false;
    const phase = this.state.promptPhase;
    if (phase === "await") {
      this.resolveBribePrompt();
      return true;
    }
    if (phase === "task_running" || phase === "task_report") {
      this.resolveBribeDare();
      return true;
    }
    if (phase === "promise_pending") {
      this.resolveBribePromise();
      return true;
    }
    if (phase === "cumplay_ritual") {
      this.resolveBribeCumplay();
      return true;
    }
    if (phase === "tide_miss_pending") {
      this.resolveBribeTideMiss();
      return true;
    }
    if (phase === "tide_complete_pending") {
      this.resolveBribeTideComplete();
      return true;
    }
    if (phase === "idol_miss_pending") {
      this.resolveBribeIdolMiss();
      return true;
    }
    if (phase === "idol_complete_pending") {
      this.resolveBribeIdolComplete();
      return true;
    }
    return false;
  }

  private resolveBribePrompt(): void {
    if (!this.state || this.state.promptPhase !== "await") return;
    const prompt = this.state.activePrompt;
    const enterIndex =
      this.state.pendingEnterIndex ?? this.state.index + 1;
    if (prompt?.kind === "permission") {
      this.state = { ...this.state, finaleBegDone: true };
    }
    this.emit({
      type: "mistress_bribe",
      kind: "prompt",
      cost: PROMPT_BRIBE_COST,
      promptId: prompt?.id,
    });
    this.state = {
      ...this.state,
      promptPhase: null,
      activePrompt: null,
      activeTask: null,
      pendingEnterIndex: null,
      blocksSincePrompt: 0,
      nextPromptAfter: 2 + Math.floor(this.rng() * 3),
    };
    this.notify();
    this.enterBlock(enterIndex);
  }

  private resolveBribeDare(): void {
    if (!this.state) return;
    if (
      this.state.promptPhase !== "task_running" &&
      this.state.promptPhase !== "task_report"
    ) {
      return;
    }
    const enterIndex =
      this.state.pendingEnterIndex ?? this.state.index + 1;
    const promptId =
      this.state.activePrompt?.id ??
      this.state.activeTask?.promptId ??
      "dare";
    this.emit({
      type: "mistress_bribe",
      kind: "dare",
      cost: PROMPT_BRIBE_COST,
      promptId,
    });
    this.state = {
      ...this.state,
      promptPhase: null,
      activePrompt: null,
      activeTask: null,
      pendingEnterIndex: null,
      blocksSincePrompt: 0,
      nextPromptAfter: 2 + Math.floor(this.rng() * 3),
    };
    this.notify();
    this.enterBlock(enterIndex);
  }

  private resolveBribePromise(): void {
    if (!this.state || this.state.promptPhase !== "promise_pending") return;
    this.emit({
      type: "mistress_bribe",
      kind: "promise",
      cost: PROMPT_BRIBE_COST,
      promptId: "promise_cum_eat",
    });
    this.state = {
      ...this.state,
      promptPhase: null,
      activePrompt: null,
      promiseCumEat: false,
    };
    this.notify();
  }

  private resolveBribeTideMiss(): void {
    if (!this.state || this.state.promptPhase !== "tide_miss_pending") return;
    this.emit({
      type: "mistress_bribe",
      kind: "prompt",
      cost: PROMPT_BRIBE_COST,
      promptId: "tide_miss",
    });
    this.state = {
      ...this.state,
      promptPhase: null,
      activePrompt: null,
      tideConfessed: true,
    };
    this.notify();
    this.continueTideStrokeAfterMiss();
  }

  private resolveBribeTideComplete(): void {
    if (!this.state || this.state.promptPhase !== "tide_complete_pending") return;
    this.emit({
      type: "mistress_bribe",
      kind: "prompt",
      cost: PROMPT_BRIBE_COST,
      promptId: "tide_complete",
    });
    this.state = {
      ...this.state,
      promptPhase: null,
      activePrompt: null,
      tideCompleteResolved: true,
    };
    this.notify();
    this.advanceBlock();
  }

  private resolveBribeIdolMiss(): void {
    if (!this.state || this.state.promptPhase !== "idol_miss_pending") return;
    this.emit({
      type: "mistress_bribe",
      kind: "prompt",
      cost: PROMPT_BRIBE_COST,
      promptId: "idol_miss",
    });
    this.state = {
      ...this.state,
      promptPhase: null,
      activePrompt: null,
      idolConfessed: true,
    };
    this.notify();
    this.continueIdolStrokeAfterMiss();
  }

  private resolveBribeIdolComplete(): void {
    if (!this.state || this.state.promptPhase !== "idol_complete_pending") return;
    this.emit({
      type: "mistress_bribe",
      kind: "prompt",
      cost: PROMPT_BRIBE_COST,
      promptId: "idol_complete",
    });
    this.state = {
      ...this.state,
      promptPhase: null,
      activePrompt: null,
      idolCompleteResolved: true,
    };
    this.notify();
    this.advanceBlock();
  }

  private resolveBribeCumplay(): void {
    if (!this.state || this.state.promptPhase !== "cumplay_ritual") return;
    const ritual = this.state.cumplayRitual;
    if (!ritual || ritual.done) return;
    const step = ritual.steps[ritual.stepIndex];
    this.emit({
      type: "mistress_bribe",
      kind: "cumplay",
      cost: PROMPT_BRIBE_COST,
      promptId: step?.id ?? ritual.cumplayId,
    });
    // Soft advance one step without mood delta (same structural path as mute).
    this.answerCumplayStep("mute", { bribed: true });
  }

  pause(): void {
    if (!this.state || this.state.status !== "running") return;
    this.pausedAtPerf = performance.now();
    this.state = { ...this.state, status: "paused" };
    this.clock.pause();
    this.vibeClock.pause();
    pauseVibeHum();
    this.emit({ type: "session_pause" });
    this.notify();
  }

  resume(): void {
    if (!this.state || this.state.status !== "paused") return;
    if (this.pausedAtPerf > 0) {
      this.holdBlockElapsed(performance.now() - this.pausedAtPerf);
      this.pausedAtPerf = 0;
    }
    // Checkpoint restore clears beat origins — re-arm the current block.
    if (
      this.state.beatOriginPerf == null &&
      !isPromptGate(this.state.promptPhase) &&
      this.state.promptPhase !== "cumplay_ritual"
    ) {
      this.state = { ...this.state, status: "running" };
      this.emit({ type: "session_resume" });
      this.enterBlock(this.state.index);
      return;
    }
    this.state = { ...this.state, status: "running" };
    if (isPromptGate(this.state.promptPhase)) {
      this.emit({ type: "session_resume" });
      this.notify();
      return;
    }
    const block = this.state.queue[this.state.index];
    if (block && block.goal !== "rest" && block.goal !== "finale") {
      if (block.drive === "vibe") {
        this.vibeClock.resume();
        resumeVibeHum();
      } else {
        this.clock.resume();
        this.state = {
          ...this.state,
          beatOriginPerf: this.clock.getOriginPerf(),
        };
      }
    }
    this.emit({ type: "session_resume" });
    this.notify();
  }

  abort(opts?: { keepCheckpoint?: boolean; silent?: boolean }): void {
    if (!this.state || this.state.status === "ended") return;
    if (opts?.keepCheckpoint) {
      const cp = this.exportCheckpoint();
      if (cp) saveSessionCheckpoint(cp);
    }
    this.finishSession("abort", {
      clearCheckpoint: !opts?.keepCheckpoint,
      // Keep resume intact — do not write abort diary / claw quest cinders.
      silent:
        opts?.silent === true ||
        opts?.keepCheckpoint === true ||
        isLabPracticeRun(this.state),
    });
  }

  confirmEdge(): void {
    if (!this.state || this.state.status !== "running") return;
    if (isPromptGate(this.state.promptPhase)) return;
    const block = this.state.queue[this.state.index];
    if (
      block?.goal === "breath" &&
      this.state.breathPhase === "holding" &&
      block.breathMode === "edge_race"
    ) {
      this.completeBreath(true);
      return;
    }
    if (!block || (block.goal !== "edge" && block.goal !== "hold")) return;

    // Hold phase 1: arm the endurance timer — stop BPM, then countdown only.
    if (block.goal === "hold" && !this.state.holdArmed) {
      this.clock.stop();
      this.vibeClock.stop();
      stopVibeHum();
      const queue = this.state.queue.map((b, i) =>
        i === this.state!.index ? { ...b, bpm: 0 } : b,
      );
      this.state = {
        ...this.state,
        queue,
        holdArmed: true,
        blockElapsedSec: 0,
        blockEnteredAtPerf: performance.now(),
        confirmRequestAtPerf: performance.now(),
        holdGraceUntilPerf: null,
        beatOriginPerf: null,
        beatUntilAtMs: null,
        edgeRampOriginBpm: null,
      };
      this.notify();
      return;
    }

    // Hold phase 2: must endure full duration before final confirm
    if (
      block.goal === "hold" &&
      this.state.blockElapsedSec < block.durationSec
    ) {
      return;
    }

    if (this.state.activeQuest && isQuestBlockId(block.id)) {
      const edgesDone = this.state.edgesDone + 1;
      const holdsDone =
        (this.state.holdsDone ?? 0) + (block.goal === "hold" ? 1 : 0);
      this.state = {
        ...this.state,
        edgesDone,
        holdsDone,
        confirmRequestAtPerf: null,
        holdArmed: false,
        holdGraceUntilPerf: null,
      };
      if (block.goal === "hold") {
        this.emit({ type: "hold_done", total: holdsDone });
      } else {
        this.emit({ type: "edge_done", total: edgesDone });
      }
      this.finishActiveQuest(true);
      return;
    }

    const delta = confirmObedienceDelta(
      this.state.blockElapsedSec,
      block.durationSec,
    );
    this.applyMoodChange(delta);

    const edgesDone = this.state.edgesDone + 1;
    const holdsDone =
      (this.state.holdsDone ?? 0) + (block.goal === "hold" ? 1 : 0);
    this.state = {
      ...this.state,
      edgesDone,
      holdsDone,
      confirmRequestAtPerf: null,
      holdArmed: false,
      holdGraceUntilPerf: null,
    };

    // Late confirm: rest tax always; hollow +edges only when harsh
    if (delta <= -2) {
      const harsh =
        isHarshMood(this.state.mood) || this.state.mood === "bored";
      if (harsh) {
        this.state = {
          ...this.state,
          params: {
            ...this.state.params,
            edgesTarget: this.state.params.edgesTarget + 1,
          },
        };
      }
      this.insertRestAfterCurrent(25);
    }

    // Always emit — achievements/tallies depend on these (mood line is separate).
    if (block.goal === "hold") {
      this.emit({ type: "hold_done", total: holdsDone });
    } else {
      this.emit({ type: "edge_done", total: edgesDone });
    }
    this.emitCounters();
    this.notify();
    this.advanceBlock();
  }

  confirmRuin(): void {
    if (!this.state || this.state.status !== "running") return;
    if (isPromptGate(this.state.promptPhase)) return;
    const block = this.state.queue[this.state.index];
    if (!block || block.goal !== "ruin_attempt") return;

    const delta = confirmObedienceDelta(
      this.state.blockElapsedSec,
      block.durationSec,
    );
    this.applyMoodChange(delta);

    const ruinsDone = this.state.ruinsDone + 1;
    this.state = {
      ...this.state,
      ruinsDone,
      confirmRequestAtPerf: null,
    };

    if (delta <= -2) {
      const harsh =
        isHarshMood(this.state.mood) || this.state.mood === "bored";
      if (harsh) {
        this.state = {
          ...this.state,
          params: {
            ...this.state.params,
            edgesTarget: this.state.params.edgesTarget + 1,
          },
        };
      }
      this.insertRestAfterCurrent(25);
    }

    this.emit({ type: "ruin_done", total: ruinsDone });
    this.emitCounters();

    // Mid-session ruin → short cumplay gate, then continue (do not end session)
    this.clock.stop();
    this.vibeClock.stop();
    stopVibeHum();
    this.clearSoftSkipTimer();

    const plan = buildMidRuinRitual({
      mood: this.state.mood,
      cumplayId: this.state.params.cumplayId,
    });
    const ritual: ActiveCumplayRitual = {
      cumplayId: plan.cumplayId,
      finishId: plan.finishId,
      outcome: "ruin",
      context: "mid",
      stepIndex: 0,
      steps: plan.steps,
      done: false,
    };
    const first = plan.steps[0]!;
    this.state = {
      ...this.state,
      cumplayRitual: ritual,
      promptPhase: "cumplay_ritual",
      activePrompt: cumplayStepToPrompt(first, 0, plan.steps.length),
      beatOriginPerf: null,
      beatUntilAtMs: null,
    };
    this.emit({ type: "cumplay_prefetch", reason: "ritual" });
    this.emit({
      type: "mistress_cumplay_step",
      stepId: first.id,
      speakEn: first.speakEn,
      labelRu: first.labelRu,
      index: 0,
      total: plan.steps.length,
    });
    this.notify();
  }

  /**
   * Left-FAB reports: user edged / ruined / came WITHOUT being told to.
   * Edge → rest + extra edges.
   * Ruin / cum → shame ritual first, then punishment rest (+ denial on cum).
   */
  reportUnauthorized(kind: "edge" | "ruin" | "cum"): void {
    if (!this.state || this.state.status !== "running") return;
    if (isPromptGate(this.state.promptPhase)) return;

    this.applyMoodChange(unauthorizedMoodDelta(kind), { speakShift: false });

    const mode = this.state.params.mode;
    const punishId = `punish-${Date.now()}-${kind}`;
    const harshExtra =
      isHarshMood(this.state.mood) && (kind === "edge" || kind === "ruin")
        ? 1
        : 0;

    if (kind === "edge") {
      const rest = this.makeRestBlock(punishId, 30, mode);
      const params = {
        ...this.state.params,
        edgesTarget: this.state.params.edgesTarget + 1 + harshExtra,
      };
      this.state = { ...this.state, params };
      this.emit({
        type: "unauthorized",
        kind,
        punishmentRu: harshExtra
          ? "Hands off 30с + ещё эджи (настроение)"
          : "Hands off 30с + ещё один обязательный эдж",
      });
      this.injectPunishment([rest]);
      return;
    }

    this.clock.stop();
    this.vibeClock.stop();
    stopVibeHum();
    this.clearSoftSkipTimer();

    if (kind === "ruin") {
      const params = {
        ...this.state.params,
        edgesTarget: this.state.params.edgesTarget + 1 + harshExtra,
      };
      const plan = buildUnauthorizedRuinRitual({ mood: this.state.mood });
      const ritual: ActiveCumplayRitual = {
        cumplayId: plan.cumplayId,
        finishId: plan.finishId,
        outcome: "ruin",
        context: "unauthorized",
        pendingRestSec: 45,
        stepIndex: 0,
        steps: plan.steps,
        done: false,
      };
      const first = plan.steps[0]!;
      this.state = {
        ...this.state,
        params,
        cumplayRitual: ritual,
        promptPhase: "cumplay_ritual",
        activePrompt: cumplayStepToPrompt(first, 0, plan.steps.length),
        beatOriginPerf: null,
        beatUntilAtMs: null,
      };
      this.emit({
        type: "unauthorized",
        kind,
        punishmentRu: harshExtra
          ? "Стыд-ритуал → hands off 45с + ещё эджи; руин засчитается после ритуала"
          : "Стыд-ритуал → hands off 45с + ещё один эдж; руин засчитается после ритуала",
      });
      this.emit({ type: "cumplay_prefetch", reason: "ruin_order" });
      this.emit({
        type: "mistress_cumplay_step",
        stepId: first.id,
        speakEn: first.speakEn,
        labelRu: first.labelRu,
        index: 0,
        total: plan.steps.length,
      });
      this.notify();
      return;
    }

    // unauthorized cum → denial path after shame ritual
    const denial = denialQuestFromMood(this.state.mood);
    const params = {
      ...this.state.params,
      pCum: 0,
      pRuin: Math.min(this.state.params.pRuin, 0.2),
      edgesTarget: this.state.params.edgesTarget + 2,
      cumplayId: "none",
    };
    const plan = buildUnauthorizedCumRitual({ mood: this.state.mood });
    const ritual: ActiveCumplayRitual = {
      cumplayId: plan.cumplayId,
      finishId: plan.finishId,
      outcome: "cum",
      context: "unauthorized",
      pendingRestSec: 60,
      stepIndex: 0,
      steps: plan.steps,
      done: false,
    };
    const first = plan.steps[0]!;
    this.state = {
      ...this.state,
      params,
      finaleOutcome: undefined,
      cumplayRitual: ritual,
      promptPhase: "cumplay_ritual",
      activePrompt: cumplayStepToPrompt(first, 0, plan.steps.length),
      beatOriginPerf: null,
      beatUntilAtMs: null,
      pendingDenialHours: denial.hours,
      pendingDenialEdges: denial.edges,
    };
    this.emit({
      type: "unauthorized",
      kind: "cum",
      punishmentRu:
        "Стыд-ритуал → hands off 60с, denial, +2 эджа; после сессии no-touch quest",
    });
    this.emit({ type: "cumplay_prefetch", reason: "cum_order" });
    this.emit({
      type: "mistress_cumplay_step",
      stepId: first.id,
      speakEn: first.speakEn,
      labelRu: first.labelRu,
      index: 0,
      total: plan.steps.length,
    });
    this.notify();
  }

  skipBlock(): void {
    if (!this.state || this.state.status !== "running") return;

    if (isPromptGate(this.state.promptPhase)) {
      if (this.state.promptPhase === "await") {
        this.answerPrompt("mute");
      } else if (
        this.state.promptPhase === "task_running" ||
        this.state.promptPhase === "task_report"
      ) {
        this.reportDare(false);
      } else if (this.state.promptPhase === "promise_pending") {
        this.answerPromise(false);
      } else if (this.state.promptPhase === "cumplay_ritual") {
        this.answerCumplayStep("mute");
      } else if (this.state.promptPhase === "choice_spinning") {
        this.completeChoiceReveal();
      } else if (this.state.promptPhase === "tide_miss_pending") {
        const target = this.state.tideTarget ?? 0;
        const hits = this.state.tideHits ?? 0;
        this.answerTideMiss(tideMissCap(target, hits));
      } else if (this.state.promptPhase === "tide_complete_pending") {
        this.answerTideComplete(false);
      } else if (this.state.promptPhase === "idol_miss_pending") {
        const target = this.state.idolTarget ?? 0;
        const hits = this.state.idolHits ?? 0;
        this.answerIdolMiss(idolChorusMissCap(target, hits));
      } else if (this.state.promptPhase === "idol_complete_pending") {
        this.answerIdolComplete(false);
      }
      return;
    }

    if (this.state.activeQuest && isQuestBlockId(this.state.queue[this.state.index]?.id)) {
      this.finishActiveQuest(false);
      return;
    }

    const block = this.state.queue[this.state.index];

    if (
      block?.goal === "breath" &&
      (this.state.breathPhase === "prep" ||
        this.state.breathPhase === "holding")
    ) {
      if (this.state.breathPhase === "prep") {
        this.completeBreath(false);
      } else {
        this.reportBreath(false);
      }
      return;
    }

    if (block?.goal === "finale") {
      if (this.state.finalePhase === "await_edge") {
        this.confirmFinaleEdge();
      }
      return;
    }

    // Speak skip only when we won't immediately replace with another line
    const harshPunish =
      Boolean(block) &&
      block!.goal !== "rest" &&
      isHarshMood(this.state.mood) &&
      this.rng() < 0.4;

    if (!harshPunish) {
      this.emit({ type: "user_skip" });
    }

    if (harshPunish) {
      this.clearSoftSkipTimer();
      if (this.rng() < 0.5) {
        this.state = {
          ...this.state,
          params: {
            ...this.state.params,
            edgesTarget: this.state.params.edgesTarget + 1,
          },
        };
        this.notify();
        this.advanceBlock();
      } else {
        const rest = this.makeRestBlock(
          `skip-punish-${Date.now()}`,
          15,
          this.state.params.mode,
        );
        this.injectPunishment([rest]);
      }
      return;
    }

    if (this.softSkipTimer !== null) {
      this.clearSoftSkipTimer();
      this.advanceBlock();
      return;
    }

    if (!block) {
      this.advanceBlock();
      return;
    }

    if (block.drive === "vibe" || block.goal === "rest") {
      this.advanceBlock();
      return;
    }

    const pattern = getPattern(block.patternId);
    const origin = this.state.beatOriginPerf;
    if (!pattern || origin == null) {
      this.advanceBlock();
      return;
    }

    const now = performance.now();
    const elapsedFromOrigin = now - origin;
    const cycleEnd = patternCycleEndAtMs(
      pattern,
      block.bpm,
      BEAT_LEAD_IN_MS,
      elapsedFromOrigin,
    );
    const existing = this.state.beatUntilAtMs;
    const untilAtMs =
      existing == null ? cycleEnd : Math.min(existing, cycleEnd);

    this.state = { ...this.state, beatUntilAtMs: untilAtMs };
    this.clock.setUntilAtMs(untilAtMs);
    this.notify();

    const waitMs = Math.max(0, origin + untilAtMs - now) + 40;
    this.softSkipTimer = setTimeout(() => {
      this.softSkipTimer = null;
      if (!this.state || this.state.status !== "running") return;
      this.advanceBlock();
    }, waitMs);
  }

  dropUpcomingBlock(queueIndex: number): void {
    const state = this.state;
    if (!state || (state.status !== "running" && state.status !== "paused")) {
      return;
    }
    const next = dropUpcomingBlock(state.queue, queueIndex, state.index);
    if (!next) return;
    this.state = { ...state, queue: next };
    this.notify();
  }

  moveUpcomingBlock(queueIndex: number, dir: -1 | 1): void {
    const state = this.state;
    if (!state || (state.status !== "running" && state.status !== "paused")) {
      return;
    }
    const next = moveUpcomingBlock(state.queue, queueIndex, dir, state.index);
    if (!next) return;
    this.state = { ...state, queue: next };
    this.notify();
  }

  insertRestAfter(queueIndex: number): void {
    const state = this.state;
    if (!state || (state.status !== "running" && state.status !== "paused")) {
      return;
    }
    const rest = this.makeRestBlock(
      `edit-rest-${Date.now()}`,
      20,
      state.params.mode,
    );
    const next = insertBlockAfter(state.queue, queueIndex, state.index, rest);
    if (!next) return;
    this.state = { ...state, queue: next };
    this.notify();
  }

  appendUpcomingBlocks(blocks: Block[]): boolean {
    const state = this.state;
    if (!state || (state.status !== "running" && state.status !== "paused")) {
      return false;
    }
    const next = appendUpcomingBlocks(
      state.queue,
      state.index,
      blocks.slice(),
    );
    if (!next) return false;
    this.state = { ...state, queue: next };
    this.notify();
    return true;
  }

  confirmFinaleEdge(): void {
    if (!this.state || this.state.status !== "running") return;
    const block = this.state.queue[this.state.index];
    if (!block || block.goal !== "finale") return;
    if (
      this.state.finalePhase === "spinning" ||
      this.state.finalePhase === "revealed"
    ) {
      return;
    }
    // Odds already resolved on finale enter; only the land is secret until 0.
    const outcome = rollFinale(this.state.params, this.rng);
    this.state = {
      ...this.state,
      finaleOutcome: outcome,
      finalePhase: "spinning",
    };
    this.emit({ type: "finale_edge_go" });
    if (outcome === "cum" || outcome === "ruin") {
      this.emit({ type: "cumplay_prefetch", reason: "finale" });
    }
    this.notify();
  }

  completeFinaleReveal(): void {
    if (!this.state || this.state.status !== "running") return;
    if (this.state.finalePhase !== "spinning" || !this.state.finaleOutcome) {
      return;
    }
    this.runFinaleReveal();
  }

  forceFinale(): void {
    if (!this.state || this.state.status === "ended") return;
    if (isPromptGate(this.state.promptPhase)) {
      this.state = {
        ...this.state,
        promptPhase: null,
        activePrompt: null,
        activeTask: null,
        pendingEnterIndex: null,
      };
    }
    this.clearSoftSkipTimer();
    const finaleIndex = this.state.queue.findIndex((b) => b.goal === "finale");
    if (finaleIndex < 0) return;
    if (this.state.index === finaleIndex) {
      if (
        this.state.finalePhase === "revealed" ||
        this.state.finalePhase === "spinning"
      ) {
        return;
      }
      if (!this.state.finalePhase) {
        const odds = resolveSessionFinaleOdds(
          this.state.mood,
          this.rng,
          undefined,
          this.state.params.mode,
          {
            pCum: this.state.params.pCum,
            pRuin: this.state.params.pRuin,
          },
        );
        this.state = {
          ...this.state,
          params: {
            ...this.state.params,
            pCum: odds.pCum,
            pRuin: odds.pRuin,
          },
          finalePhase: "await_edge",
        };
        const cur = this.state.queue[finaleIndex];
        if (cur) this.emit({ type: "finale_edge_request", blockId: cur.id });
        this.notify();
      }
      return;
    }
    // Jumping to finale — one line from finale_edge_request is enough
    if (this.state.index < this.state.queue.length) {
      const cur = this.state.queue[this.state.index];
      if (cur) this.emit({ type: "block_end", blockId: cur.id });
    }
    this.clock.stop();
    this.vibeClock.stop();
    stopVibeHum();
    this.enterBlock(finaleIndex);
  }

  /**
   * Answer the active mistress prompt (await phase).
   * Timed dares transition to task_running instead of entering the next block.
   */
  answerPrompt(optionId: string): void {
    if (!this.state || this.state.promptPhase !== "await") return;
    const prompt = this.state.activePrompt;
    if (!prompt) return;

    const option =
      prompt.options.find((o) => o.id === optionId) ??
      prompt.options.find((o) => o.effect === "mute") ??
      prompt.options[prompt.options.length - 1];
    if (!option) return;

    const effect = option.effect;
    const isMoodOfferEffect =
      effect === "mood_harsher" ||
      effect === "mood_softer" ||
      effect === "mood_horny" ||
      effect === "mood_refuse";
    let moodDelta = moodDeltaForEffect(effect);
    if (effect === "mood_horny") {
      // Nudge discrete mood toward horny (score 1)
      moodDelta = 1 - this.state.moodScore;
    }
    this.applyMoodChange(moodDelta, {
      speakShift: isMoodOfferEffect && effect !== "mood_refuse",
    });

    // Closing the pre-finale permission gate (any answer including mute)
    if (prompt.kind === "permission") {
      this.state = { ...this.state, finaleBegDone: true };
    }
    let prefs = this.state.fetishPrefs ?? {};
    if (effect === "confess_like") {
      prefs = applyPreferDelta(prefs, option.preferKey, 2);
    } else if (effect === "confess_dislike") {
      prefs = applyPreferDelta(prefs, option.preferKey, -2);
    } else if (effect === "wager_yes" || effect === "wager_no") {
      const delta = effect === "wager_yes" ? 1.5 : -1.5;
      for (const key of prompt.preferKeys ?? []) {
        prefs = applyPreferDelta(prefs, key, delta);
      }
    }

    let enterIndex =
      this.state.pendingEnterIndex ?? this.state.index + 1;

    const insertRest = (sec: number, tag: string) => {
      if (!this.state) return;
      const rest = this.makeRestBlock(
        `${tag}-${Date.now()}`,
        sec,
        this.state.params.mode,
      );
      const q = this.state.queue;
      this.state = {
        ...this.state,
        queue: [...q.slice(0, enterIndex), rest, ...q.slice(enterIndex)],
      };
    };

    const insertHold = (
      sec: number,
      tag: string,
      graceSec = Math.max(28, Math.round(sec * 1.25)),
    ) => {
      if (!this.state) return;
      const hold = this.makeHoldBlock(
        `${tag}-${Date.now()}`,
        sec,
        this.state.params.mode,
        graceSec,
      );
      const q = this.state.queue;
      this.state = {
        ...this.state,
        queue: [...q.slice(0, enterIndex), hold, ...q.slice(enterIndex)],
      };
    };

    const insertTipStroke = (sec: number, tag: string) => {
      if (!this.state) return;
      const tip = this.makeTipStrokeBlock(
        `${tag}-${Date.now()}`,
        sec,
        this.state.params.mode,
      );
      const q = this.state.queue;
      this.state = {
        ...this.state,
        queue: [...q.slice(0, enterIndex), tip, ...q.slice(enterIndex)],
      };
    };

    if (
      effect === "wager_no" &&
      isHarshMood(this.state.mood) &&
      this.rng() < 0.35
    ) {
      insertRest(15, "prompt-no");
    }

    if (effect === "loyalty_yes") {
      const sec = Math.max(10, prompt.loyaltySec ?? 20);
      const action = prompt.loyaltyAction ?? "rest";
      if (action === "hold") {
        insertHold(sec, "loyalty-hold", Math.max(40, sec + 25));
      } else if (action === "tip") {
        insertTipStroke(sec, "loyalty-tip");
      } else {
        insertRest(sec, "loyalty");
      }
    }

    if (effect === "loyalty_no" && isHarshMood(this.state.mood)) {
      insertRest(12, "loyalty-fail");
    }

    if (effect === "obey_fail") {
      insertRest(18, "obey-fail");
    }

    if (effect === "dare_refuse") {
      if (isHarshMood(this.state.mood)) insertRest(15, "dare-refuse");
    }

    this.emit({
      type: "mistress_answer",
      promptId: prompt.id,
      optionId: option.id,
      effect,
      labelRu: option.labelRu,
    });

    if (effect === "wager_yes" && prompt.tags?.trim()) {
      this.emit({
        type: "mistress_wager_media",
        tags: prompt.tags.trim(),
        promptId: prompt.id,
      });
    }

    // Timed dare → countdown + report (do not enter next block yet)
    if (effect === "dare_accept" && prompt.taskType === "timed_report") {
      const taskSec = Math.max(
        5,
        moodScaleTaskSec(prompt.taskSec ?? 10, this.state.mood),
      );
      const instructionRu =
        prompt.instructionRu ??
        prompt.labelRu ??
        "Выполни задание до конца таймера";
      const task: ActiveDareTask = {
        promptId: prompt.id,
        taskType: "timed_report",
        taskSec,
        taskCount: prompt.taskCount,
        instructionRu,
        endsAtPerf: performance.now() + taskSec * 1000,
      };
      this.state = {
        ...this.state,
        fetishPrefs: prefs,
        activeTask: task,
        promptPhase: "task_running",
        pendingEnterIndex: enterIndex,
      };
      this.emit({
        type: "mistress_dare_start",
        promptId: prompt.id,
        taskSec,
        instructionRu,
      });
      this.notify();
      return;
    }

    // Cage hijack: switch mode + rebuild remaining queue
    let promiseCumEat = this.state.promiseCumEat ?? false;
    let pendingCageHours = this.state.pendingCageHours ?? null;
    let equippedToyIds = this.state.equippedToyIds ?? [];

    if (effect === "dare_accept" && prompt.taskType === "cage_hijack") {
      const allow = this.state.params.allowedToyIds;
      if (isToyAllowedInSession("chastity_cage", allow)) {
        const hours = resolveCageHours(prompt, this.state.mood, this.rng);
        pendingCageHours = hours;
        equippedToyIds = equipToy(equippedToyIds, "chastity_cage");
        enterIndex = this.rebuildTailForLoadout(enterIndex, equippedToyIds, {
          forceMode: "chastity",
          announceCageHours: hours,
        });
      }
    }

    if (effect === "dare_accept" && prompt.taskType === "cum_eat_promise") {
      promiseCumEat = true;
    }

    // Edge-ad dare: splice multi-edge sequence at enterIndex
    if (effect === "dare_accept" && prompt.taskType === "edge_ad") {
      enterIndex = this.spliceEdgeAdAt(enterIndex, equippedToyIds);
    }

    if (
      effect === "dare_accept" &&
      prompt.taskType === "breath_challenge" &&
      isFeatureUnlocked(BREATH_FEATURE_ID, this.unlocks)
    ) {
      const breathMode = pickBreathMode(this.state.mood, this.rng);
      const holdSec = Math.max(
        6,
        prompt.taskSec ?? moodBreathHoldSec(this.state.mood, this.rng),
      );
      const breath = makeBreathBlock({
        id: `dare-breath-${Date.now()}`,
        mode: this.state.params.mode,
        breathMode,
        holdSec,
        prepSec: moodBreathPrepSec(this.state.mood),
        targetCount:
          breathMode === "stroke_count" || breathMode === "stroke_beats"
            ? (prompt.taskCount ??
              moodBreathTargetCount(breathMode, this.state.mood, this.rng))
            : undefined,
      });
      const q = this.state.queue;
      this.state = {
        ...this.state,
        queue: [...q.slice(0, enterIndex), breath, ...q.slice(enterIndex)],
      };
    }

    // Dice chaos: roll and apply random session mutation
    if (effect === "dare_accept" && prompt.taskType === "dice_chaos") {
      enterIndex = this.applyDiceChaos(enterIndex, equippedToyIds);
    }

    // Permission beg
    if (
      effect === "beg_please" ||
      effect === "beg_skip" ||
      effect === "beg_deny_want"
    ) {
      const credits = Math.max(0, (this.state.begCredits ?? 0) - 1);
      const used = (this.state.begsUsed ?? 0) + 1;
      let nextParams = this.state.params;
      let denialH = this.state.pendingDenialHours ?? null;
      let denialE = this.state.pendingDenialEdges ?? null;
      if (effect === "beg_please") {
        nextParams = applyBegPleaseParams(nextParams);
      } else if (effect === "beg_deny_want") {
        nextParams = applyBegDenyWantParams(nextParams);
        const d = denialQuestFromMood(this.state.mood);
        denialH = d.hours;
        denialE = d.edges;
      }
      this.state = {
        ...this.state,
        params: nextParams,
        begCredits: credits,
        begsUsed: used,
        pendingDenialHours: denialH,
        pendingDenialEdges: denialE,
        finaleBegDone: true,
      };
    }

    // Finale bias questions
    if (
      effect === "finale_want_cum" ||
      effect === "finale_want_deny" ||
      effect === "finale_want_ruin"
    ) {
      let biasEffect = effect;
      // Sparkle orgasm gate: cum only via anal / chastity session mode
      if (
        biasEffect === "finale_want_cum" &&
        !mistressAllowsCumFinale(this.state.params.mode)
      ) {
        biasEffect = "finale_want_deny";
      }
      const nextParams = applyFinaleBiasParams(this.state.params, biasEffect);
      let denialH = this.state.pendingDenialHours ?? null;
      let denialE = this.state.pendingDenialEdges ?? null;
      if (biasEffect === "finale_want_deny") {
        const d = denialQuestFromMood(this.state.mood);
        denialH = d.hours;
        denialE = d.edges;
      }
      this.state = {
        ...this.state,
        params: nextParams,
        pendingDenialHours: denialH,
        pendingDenialEdges: denialE,
      };
    }

    // Mood offer accept → retune params + rebuild remaining session
    if (
      effect === "mood_harsher" ||
      effect === "mood_softer" ||
      effect === "mood_horny"
    ) {
      const nextParams = paramsAfterMoodOffer(this.state.params, effect);
      this.state = { ...this.state, params: nextParams };
      enterIndex = this.rebuildTailForLoadout(enterIndex, equippedToyIds);
      if (effect === "mood_harsher" && this.rng() < 0.55) {
        enterIndex = this.spliceEdgeAdAt(enterIndex, equippedToyIds);
      }
    }

    // Equip toy → loadout update + rebuild remaining blocks around it
    if (effect === "equip_yes" && prompt.toyId) {
      const allow = this.state.params.allowedToyIds;
      if (isToyAllowedInSession(prompt.toyId, allow)) {
        equippedToyIds = equipToy(equippedToyIds, prompt.toyId);
        const forceMode =
          prompt.toyId === "chastity_cage" ? "chastity" : undefined;
        enterIndex = this.rebuildTailForLoadout(enterIndex, equippedToyIds, {
          forceMode,
        });
        const toy = getToy(prompt.toyId);
        this.emit({
          type: "mistress_equip",
          toyId: prompt.toyId,
          nameRu: toy?.nameRu ?? prompt.toyId,
          equippedToyIds,
        });
      }
    }

    if (effect === "equip_no" && isHarshMood(this.state.mood)) {
      insertRest(12, "equip-no");
    }

    // Mid-session choice offer («хочешь…?»)
    if (effect === "choice_yes" && prompt.kind === "choice") {
      const action = prompt.choiceAction;
      if (action && isChoiceAction(action)) {
        const wheel = buildChoiceRoulette(action, this.state.mood);
        if (wheel && wheel.length > 0) {
          const landed = pickChoiceRouletteTarget(wheel, this.rng);
          const roulette: ActiveChoiceRoulette = {
            titleRu: choiceActionLabelRu(action),
            action,
            options: wheel.map((o) => ({
              id: o.id,
              labelRu: o.labelRu,
              value: o.value,
              weight: o.weight,
              color: o.color,
            })),
            targetId: landed.id,
            phase: "spinning",
          };
          this.state = {
            ...this.state,
            fetishPrefs: prefs,
            promiseCumEat,
            pendingCageHours,
            equippedToyIds,
            promptPhase: "choice_spinning",
            activePrompt: prompt,
            activeTask: null,
            choiceRoulette: roulette,
            pendingEnterIndex: enterIndex,
          };
          this.notify();
          return;
        }
        // No roulette (e.g. ruin_now) — apply immediately
        enterIndex = this.applyChoiceAction(
          action,
          0,
          enterIndex,
          equippedToyIds,
        );
      }
    }

    if (
      effect === "choice_no" &&
      isHarshMood(this.state.mood) &&
      this.rng() < 0.28
    ) {
      insertRest(10, "choice-no");
    }

    this.state = {
      ...this.state,
      fetishPrefs: prefs,
      promiseCumEat,
      pendingCageHours,
      equippedToyIds,
      promptPhase: null,
      activePrompt: null,
      activeTask: null,
      choiceRoulette: null,
      pendingEnterIndex: null,
      blocksSincePrompt: 0,
      nextPromptAfter: 2 + Math.floor(this.rng() * 3),
    };
    this.notify();
    this.enterBlock(enterIndex);
  }

  /** After choice roulette lands — apply outcome and continue. */
  completeChoiceReveal(): void {
    if (!this.state || this.state.promptPhase !== "choice_spinning") return;
    const roulette = this.state.choiceRoulette;
    if (!roulette || roulette.phase !== "spinning") return;

    const landed =
      roulette.options.find((o) => o.id === roulette.targetId) ??
      roulette.options[0];
    const value = landed?.value ?? 0;
    let enterIndex =
      this.state.pendingEnterIndex ?? this.state.index + 1;
    const equippedToyIds = this.state.equippedToyIds ?? [];

    this.state = {
      ...this.state,
      choiceRoulette: { ...roulette, phase: "revealed" },
    };
    this.notify();

    enterIndex = this.applyChoiceAction(
      roulette.action,
      value,
      enterIndex,
      equippedToyIds,
    );

    if (roulette.forced && roulette.action === "extra_edges") {
      this.emit({
        type: "mistress_edges_tax",
        phase: "applied",
        add: value,
        speakEn:
          value <= 1
            ? "Plus one edge. Your quota just grew — don't pout."
            : `Plus ${value} edges. Session just got longer. Keep up.`,
      });
    }

    this.state = {
      ...this.state,
      promptPhase: null,
      activePrompt: null,
      activeTask: null,
      choiceRoulette: null,
      pendingEnterIndex: null,
      blocksSincePrompt: 0,
      nextPromptAfter: 2 + Math.floor(this.rng() * 3),
    };
    this.notify();
    this.enterBlock(enterIndex);
  }

  private applyChoiceAction(
    action: ChoiceAction,
    value: number,
    enterIndex: number,
    equippedToyIds: string[],
  ): number {
    if (!this.state) return enterIndex;

    switch (action) {
      case "extend_sec": {
        const add = Math.max(60, value || 300);
        const extraEdges = Math.max(1, Math.round(add / 180));
        this.state = {
          ...this.state,
          params: {
            ...this.state.params,
            durationSec: this.state.params.durationSec + add,
            edgesTarget: this.state.params.edgesTarget + extraEdges,
          },
        };
        return this.rebuildTailForLoadout(enterIndex, equippedToyIds);
      }
      case "ruin_now": {
        const ruin = this.makeRuinAttemptBlock(
          `choice-ruin-${Date.now()}`,
          this.state.params.mode,
        );
        const q = this.state.queue;
        this.state = {
          ...this.state,
          params: {
            ...this.state.params,
            ruinsTarget: Math.max(
              this.state.params.ruinsTarget,
              this.state.ruinsDone + 1,
            ),
          },
          queue: [...q.slice(0, enterIndex), ruin, ...q.slice(enterIndex)],
        };
        return enterIndex;
      }
      case "hold_sec": {
        const sec = Math.max(12, value || 20);
        const hold = this.makeHoldBlock(
          `choice-hold-${Date.now()}`,
          sec,
          this.state.params.mode,
          Math.max(28, Math.round(sec * 1.25)),
        );
        const q = this.state.queue;
        this.state = {
          ...this.state,
          queue: [...q.slice(0, enterIndex), hold, ...q.slice(enterIndex)],
        };
        return enterIndex;
      }
      case "edge_hell": {
        const edges = Math.max(3, Math.min(10, value || 4));
        return this.spliceEdgeAdAt(enterIndex, equippedToyIds, edges);
      }
      case "extra_edges": {
        const n = Math.max(1, value || 1);
        const harsh =
          isHarshMood(this.state.mood) || this.state.mood === "bored";
        const addSec = Math.round(n * (harsh ? 55 : 40));
        this.state = {
          ...this.state,
          params: {
            ...this.state.params,
            edgesTarget: this.state.params.edgesTarget + n,
            durationSec: this.state.params.durationSec + addSec,
          },
        };
        return this.rebuildTailForLoadout(enterIndex, equippedToyIds);
      }
      case "rest_sec": {
        const sec = Math.max(10, value || 20);
        const rest = this.makeRestBlock(
          `choice-rest-${Date.now()}`,
          sec,
          this.state.params.mode,
        );
        const q = this.state.queue;
        this.state = {
          ...this.state,
          queue: [...q.slice(0, enterIndex), rest, ...q.slice(enterIndex)],
        };
        return enterIndex;
      }
      case "tip_sec": {
        const sec = Math.max(10, value || 15);
        const tip = this.makeTipStrokeBlock(
          `choice-tip-${Date.now()}`,
          sec,
          this.state.params.mode,
        );
        const q = this.state.queue;
        this.state = {
          ...this.state,
          queue: [...q.slice(0, enterIndex), tip, ...q.slice(enterIndex)],
        };
        return enterIndex;
      }
      case "breath_hold": {
        const breathMode = pickBreathMode(this.state.mood, this.rng);
        const sec = Math.max(6, value || moodBreathHoldSec(this.state.mood, this.rng));
        const breath = makeBreathBlock({
          id: `choice-breath-${Date.now()}`,
          mode: this.state.params.mode,
          breathMode,
          holdSec: sec,
          prepSec: moodBreathPrepSec(this.state.mood),
          targetCount:
            breathMode === "stroke_count" || breathMode === "stroke_beats"
              ? moodBreathTargetCount(breathMode, this.state.mood, this.rng)
              : undefined,
        });
        const q = this.state.queue;
        this.state = {
          ...this.state,
          queue: [...q.slice(0, enterIndex), breath, ...q.slice(enterIndex)],
        };
        return enterIndex;
      }
      default: {
        const _exhaustive: never = action;
        return _exhaustive;
      }
    }
  }

  /** Self-report after timed dare (Успел / Провалил / early surrender). */
  reportDare(success: boolean): void {
    if (!this.state) return;
    if (
      this.state.promptPhase !== "task_running" &&
      this.state.promptPhase !== "task_report"
    ) {
      return;
    }
    const prompt = this.state.activePrompt;
    const enterIndex =
      this.state.pendingEnterIndex ?? this.state.index + 1;
    const effect = success ? "dare_done" : "dare_fail";
    this.applyMoodChange(moodDeltaForEffect(effect), { speakShift: false });

    this.emit({
      type: "mistress_answer",
      promptId: prompt?.id ?? this.state.activeTask?.promptId ?? "dare",
      optionId: success ? "done" : "fail",
      effect,
      labelRu: success ? "Успел" : "Провалил",
    });

    if (!success) {
      const rest = this.makeRestBlock(
        `dare-fail-${Date.now()}`,
        20,
        this.state.params.mode,
      );
      const q = this.state.queue;
      this.state = {
        ...this.state,
        queue: [...q.slice(0, enterIndex), rest, ...q.slice(enterIndex)],
      };
    }

    this.state = {
      ...this.state,
      promptPhase: null,
      activePrompt: null,
      activeTask: null,
      pendingEnterIndex: null,
      blocksSincePrompt: 0,
      nextPromptAfter: 2 + Math.floor(this.rng() * 3),
    };
    this.notify();
    this.enterBlock(enterIndex);
  }

  reportBreath(success: boolean): void {
    if (!this.state || this.state.status !== "running") return;
    const block = this.state.queue[this.state.index];
    if (block?.goal !== "breath" || this.state.breathPhase !== "holding") {
      return;
    }
    this.completeBreath(success);
  }

  /** Counted +1 on CBT/plapping stroke blocks (Tide). Honor: metronome. Mic: loud peak. */
  reportTideHit(): void {
    if (!this.state || this.state.status !== "running") return;
    if (isPromptGate(this.state.promptPhase)) return;
    const block = this.state.queue[this.state.index];
    if (!block || block.goal !== "stroke") return;
    if (isQuestBlockId(block.id)) return;
    if (!isTideHitFunction(block.functionId)) return;
    const target = this.state.tideTarget ?? 0;
    if (target <= 0) return;
    const cap = Math.max(target * 3, target);
    const hits = Math.min(cap, (this.state.tideHits ?? 0) + 1);
    this.state = { ...this.state, tideHits: hits };
    this.emit({
      type: "tide_hit",
      blockId: block.id,
      functionId: block.functionId,
      hits,
      target,
    });
    this.notify();
  }

  /** End-of-block gate: all accents vs soft quota. */
  private openTideCompleteAsk(): void {
    if (!this.state) return;
    const block = this.state.queue[this.state.index];
    if (!block || !isTideHitFunction(block.functionId)) return;

    this.clearSoftSkipTimer();
    this.clock.stop();
    this.vibeClock.stop();
    stopVibeHum();

    const hits = this.state.tideHits ?? 0;
    const target = this.state.tideTarget ?? 0;
    const active: ActiveMistressPrompt = {
      id: "tide_complete_ask",
      kind: "confess",
      speakEn: tideCompleteAskSpeakEn(target, hits),
      labelRu: tideCompleteAskLabelRu(target, hits),
      options: [],
    };
    this.state = {
      ...this.state,
      promptPhase: "tide_complete_pending",
      activePrompt: active,
      beatOriginPerf: null,
      beatUntilAtMs: null,
      confirmRequestAtPerf: null,
    };
    this.emit({ type: "mistress_prompt", prompt: active });
    this.notify();
  }

  /** Confess failure on CBT/plapping — mistress asks how many hits were missed. */
  reportTideFail(): void {
    if (!this.state || this.state.status !== "running") return;
    if (isPromptGate(this.state.promptPhase)) return;
    const block = this.state.queue[this.state.index];
    if (!block || block.goal !== "stroke") return;
    if (isQuestBlockId(block.id)) return;
    if (!isTideHitFunction(block.functionId)) return;
    const target = this.state.tideTarget ?? 0;
    if (target <= 0) return;

    this.clearSoftSkipTimer();
    this.clock.stop();
    this.vibeClock.stop();
    stopVibeHum();

    const active: ActiveMistressPrompt = {
      id: "tide_miss_ask",
      kind: "confess",
      speakEn: tideMissAskSpeakEn(),
      labelRu: tideMissAskLabelRu(),
      options: [],
    };
    this.state = {
      ...this.state,
      promptPhase: "tide_miss_pending",
      activePrompt: active,
      tideConfessed: true,
      beatOriginPerf: null,
      beatUntilAtMs: null,
      confirmRequestAtPerf: null,
    };
    this.emit({ type: "mistress_prompt", prompt: active });
    this.notify();
  }

  /** Answer «сколько пропустил» after НЕ ВЫДЕРЖАЛ. */
  answerTideMiss(missedRaw: number): void {
    if (!this.state || this.state.promptPhase !== "tide_miss_pending") return;
    const block = this.state.queue[this.state.index];
    if (!block || !isTideHitFunction(block.functionId)) {
      this.state = {
        ...this.state,
        promptPhase: null,
        activePrompt: null,
      };
      this.notify();
      return;
    }

    const target = this.state.tideTarget ?? 0;
    const hits = this.state.tideHits ?? 0;
    const cap = tideMissCap(target, hits);
    const missed = Math.max(0, Math.min(cap, Math.floor(missedRaw)));
    const adjHits = Math.max(0, hits - missed);
    const consequence = tideMissConsequence(missed);

    this.emit({
      type: "tide_miss",
      blockId: block.id,
      functionId: block.functionId,
      missed,
      hits: adjHits,
      target,
      speakEn: consequence.speakEn,
    });

    this.state = {
      ...this.state,
      tideHits: adjHits,
      tideConfessed: true,
      promptPhase: null,
      activePrompt: null,
      params:
        consequence.extraEdges > 0
          ? {
              ...this.state.params,
              edgesTarget:
                this.state.params.edgesTarget + consequence.extraEdges,
              durationSec:
                this.state.params.durationSec +
                consequence.extraEdges * 40,
            }
          : this.state.params,
    };
    this.applyMoodChange(consequence.moodDelta, { speakShift: true });
    this.emitCounters();
    if (consequence.extraEdges > 0) {
      this.rebuildTailForLoadout(
        this.state.index + 1,
        this.state.equippedToyIds ?? [],
      );
    }

    if (consequence.replaceWithRestSec > 0) {
      this.emit({
        type: "tide_hits",
        blockId: block.id,
        functionId: block.functionId,
        hits: adjHits,
        target,
        met: false,
      });
      const rest = this.makeRestBlock(
        `tide-miss-${Date.now()}`,
        consequence.replaceWithRestSec,
        this.state.params.mode,
      );
      this.injectPunishment([rest]);
      return;
    }

    if (consequence.restAfterSec > 0) {
      this.insertRestAfterCurrent(consequence.restAfterSec);
    }
    this.notify();
    this.continueTideStrokeAfterMiss();
  }

  /**
   * End-of-block honor: all accents vs soft quota only.
   * Yes → mood +1; No → no bonus (quota assumed via auto-count).
   */
  answerTideComplete(allDone: boolean): void {
    if (!this.state || this.state.promptPhase !== "tide_complete_pending") return;
    const block = this.state.queue[this.state.index];
    if (!block || !isTideHitFunction(block.functionId)) {
      this.state = {
        ...this.state,
        promptPhase: null,
        activePrompt: null,
        tideCompleteResolved: true,
      };
      this.notify();
      this.advanceBlock();
      return;
    }

    const hits = this.state.tideHits ?? 0;
    const target = this.state.tideTarget ?? 0;
    const speakEn = allDone
      ? tideCompleteYesSpeakEn()
      : tideCompleteNoSpeakEn();

    this.emit({
      type: "tide_complete",
      blockId: block.id,
      functionId: block.functionId,
      allDone,
      hits,
      target,
      speakEn,
    });

    this.state = {
      ...this.state,
      promptPhase: null,
      activePrompt: null,
      tideCompleteResolved: true,
      /** No = not full obedience; treat like soft confess for end reward. */
      tideConfessed: allDone ? this.state.tideConfessed : true,
    };

    if (allDone) {
      this.applyMoodChange(1, { speakShift: false });
    }

    this.notify();
    this.advanceBlock();
  }

  reportIdolHit(): void {
    if (!this.state || this.state.status !== "running") return;
    if (isPromptGate(this.state.promptPhase)) return;
    if (getActiveMistress().id !== "sunna") return;
    const block = this.state.queue[this.state.index];
    if (!block || block.goal !== "stroke") return;
    if (isQuestBlockId(block.id)) return;
    if (!isIdolChorusFunction(block.functionId)) return;
    const target = this.state.idolTarget ?? 0;
    if (target <= 0) return;
    const cap = Math.max(target * 3, target);
    const hits = Math.min(cap, (this.state.idolHits ?? 0) + 1);
    this.state = { ...this.state, idolHits: hits };
    this.emit({
      type: "idol_hit",
      blockId: block.id,
      functionId: block.functionId,
      hits,
      target,
    });
    this.notify();
  }

  private openIdolCompleteAsk(): void {
    if (!this.state) return;
    const block = this.state.queue[this.state.index];
    if (!block || !isIdolChorusFunction(block.functionId)) return;
    this.clearSoftSkipTimer();
    this.clock.stop();
    this.vibeClock.stop();
    stopVibeHum();
    const hits = this.state.idolHits ?? 0;
    const target = this.state.idolTarget ?? 0;
    const active: ActiveMistressPrompt = {
      id: "idol_complete_ask",
      kind: "confess",
      speakEn: idolChorusCompleteAskSpeakEn(target, hits),
      labelRu: idolChorusCompleteAskLabelRu(target, hits),
      options: [],
    };
    this.state = {
      ...this.state,
      promptPhase: "idol_complete_pending",
      activePrompt: active,
      beatOriginPerf: null,
      beatUntilAtMs: null,
      confirmRequestAtPerf: null,
    };
    this.emit({ type: "mistress_prompt", prompt: active });
    this.notify();
  }

  reportIdolFail(): void {
    if (!this.state || this.state.status !== "running") return;
    if (isPromptGate(this.state.promptPhase)) return;
    if (getActiveMistress().id !== "sunna") return;
    const block = this.state.queue[this.state.index];
    if (!block || block.goal !== "stroke") return;
    if (isQuestBlockId(block.id)) return;
    if (!isIdolChorusFunction(block.functionId)) return;
    const target = this.state.idolTarget ?? 0;
    if (target <= 0) return;
    this.clearSoftSkipTimer();
    this.clock.stop();
    this.vibeClock.stop();
    stopVibeHum();
    const active: ActiveMistressPrompt = {
      id: "idol_miss_ask",
      kind: "confess",
      speakEn: idolChorusMissAskSpeakEn(),
      labelRu: idolChorusMissAskLabelRu(),
      options: [],
    };
    this.state = {
      ...this.state,
      promptPhase: "idol_miss_pending",
      activePrompt: active,
      idolConfessed: true,
      beatOriginPerf: null,
      beatUntilAtMs: null,
      confirmRequestAtPerf: null,
    };
    this.emit({ type: "mistress_prompt", prompt: active });
    this.notify();
  }

  answerIdolMiss(missedRaw: number): void {
    if (!this.state || this.state.promptPhase !== "idol_miss_pending") return;
    const block = this.state.queue[this.state.index];
    if (!block || !isIdolChorusFunction(block.functionId)) {
      this.state = {
        ...this.state,
        promptPhase: null,
        activePrompt: null,
      };
      this.notify();
      return;
    }
    const target = this.state.idolTarget ?? 0;
    const hits = this.state.idolHits ?? 0;
    const cap = idolChorusMissCap(target, hits);
    const missed = Math.max(0, Math.min(cap, Math.floor(missedRaw)));
    const adjHits = Math.max(0, hits - missed);
    const consequence = idolChorusMissConsequence(missed);
    this.emit({
      type: "idol_miss",
      blockId: block.id,
      functionId: block.functionId,
      missed,
      hits: adjHits,
      target,
      speakEn: consequence.speakEn,
    });
    this.state = {
      ...this.state,
      idolHits: adjHits,
      idolConfessed: true,
      promptPhase: null,
      activePrompt: null,
      params:
        consequence.extraEdges > 0
          ? {
              ...this.state.params,
              edgesTarget:
                this.state.params.edgesTarget + consequence.extraEdges,
              durationSec:
                this.state.params.durationSec +
                consequence.extraEdges * 40,
            }
          : this.state.params,
    };
    this.applyMoodChange(consequence.moodDelta, { speakShift: true });
    this.emitCounters();
    if (consequence.extraEdges > 0) {
      this.rebuildTailForLoadout(
        this.state.index + 1,
        this.state.equippedToyIds ?? [],
      );
    }
    if (consequence.replaceWithRestSec > 0) {
      this.emit({
        type: "idol_hits",
        blockId: block.id,
        functionId: block.functionId,
        hits: adjHits,
        target,
        met: false,
      });
      const rest = this.makeRestBlock(
        `idol-miss-${Date.now()}`,
        consequence.replaceWithRestSec,
        this.state.params.mode,
      );
      this.injectPunishment([rest]);
      return;
    }
    if (consequence.restAfterSec > 0) {
      this.insertRestAfterCurrent(consequence.restAfterSec);
    }
    this.notify();
    this.continueIdolStrokeAfterMiss();
  }

  answerIdolComplete(allDone: boolean): void {
    if (!this.state || this.state.promptPhase !== "idol_complete_pending") return;
    const block = this.state.queue[this.state.index];
    if (!block || !isIdolChorusFunction(block.functionId)) {
      this.state = {
        ...this.state,
        promptPhase: null,
        activePrompt: null,
        idolCompleteResolved: true,
      };
      this.notify();
      this.advanceBlock();
      return;
    }
    const hits = this.state.idolHits ?? 0;
    const target = this.state.idolTarget ?? 0;
    const speakEn = allDone
      ? idolChorusCompleteYesSpeakEn()
      : idolChorusCompleteNoSpeakEn();
    this.emit({
      type: "idol_complete",
      blockId: block.id,
      functionId: block.functionId,
      allDone,
      hits,
      target,
      speakEn,
    });
    this.state = {
      ...this.state,
      promptPhase: null,
      activePrompt: null,
      idolCompleteResolved: true,
      idolConfessed: allDone ? this.state.idolConfessed : true,
    };
    if (allDone) {
      this.applyMoodChange(1, { speakShift: false });
    }
    this.notify();
    this.advanceBlock();
  }

  setIdolBuzzHoldMode(mode: IdolBuzzHoldMode): void {
    if (!this.state || this.state.status !== "running") return;
    this.state = { ...this.state, idolBuzzHoldMode: mode };
    this.notify();
  }

  armIdolBuzz(): void {
    if (!this.state || this.state.status !== "running") return;
    if (this.state.idolBuzzPhase !== "arm") return;
    const target =
      this.state.idolBuzzTargetSec ||
      idolBuzzTargetSec(this.state.moodScore, this.rng);
    this.state = {
      ...this.state,
      idolBuzzPhase: "holding",
      idolBuzzTargetSec: target,
      idolBuzzElapsedSec: 0,
    };
    this.emit({
      type: "idol_buzz",
      phase: "holding",
      targetSec: target,
      elapsedSec: 0,
      holdMode: this.state.idolBuzzHoldMode ?? "hands_on",
    });
    this.notify();
  }

  failIdolBuzz(): void {
    if (!this.state || this.state.status !== "running") return;
    const phase = this.state.idolBuzzPhase;
    if (phase !== "arm" && phase !== "holding") return;
    this.state = {
      ...this.state,
      idolBuzzPhase: "done",
      params: {
        ...this.state.params,
        edgesTarget: this.state.params.edgesTarget + 2,
        durationSec: this.state.params.durationSec + 80,
      },
    };
    this.applyMoodChange(-2, { speakShift: false });
    this.emit({
      type: "idol_buzz",
      phase: "fail",
      targetSec: this.state.idolBuzzTargetSec,
      elapsedSec: this.state.idolBuzzElapsedSec,
      holdMode: this.state.idolBuzzHoldMode,
      speakEn: idolBuzzFailSpeakEn(),
    });
    this.rebuildTailForLoadout(
      this.state.index + 1,
      this.state.equippedToyIds ?? [],
    );
    this.insertRestAfterCurrent(30);
    this.emitCounters();
    this.notify();
  }

  private completeIdolBuzzSuccess(): void {
    if (!this.state || this.state.idolBuzzPhase !== "holding") return;
    this.state = { ...this.state, idolBuzzPhase: "done" };
    this.applyMoodChange(1, { speakShift: false });
    this.emit({
      type: "idol_buzz",
      phase: "success",
      targetSec: this.state.idolBuzzTargetSec,
      elapsedSec: this.state.idolBuzzElapsedSec,
      holdMode: this.state.idolBuzzHoldMode,
      speakEn: idolBuzzSuccessSpeakEn(),
    });
    this.notify();
  }

  private continueIdolStrokeAfterMiss(): void {
    if (!this.state || this.state.status !== "running") return;
    const block = this.state.queue[this.state.index];
    if (!block || block.goal !== "stroke") {
      this.advanceBlock();
      return;
    }
    const pattern = getPattern(block.patternId);
    if (!pattern) {
      this.emit({
        type: "block_skip",
        blockId: block.id,
        reason: "missing_pattern",
        detail: block.patternId,
      });
      this.advanceBlock();
      return;
    }
    const remainingSec = Math.max(
      0,
      block.durationSec - (this.state.blockElapsedSec ?? 0),
    );
    if (remainingSec <= 0) {
      this.advanceBlock();
      return;
    }
    this.clock.stop();
    this.vibeClock.stop();
    this.clearClockStartTimer();
    stopVibeHum();
    if (block.drive === "vibe") {
      this.state = {
        ...this.state,
        beatOriginPerf: null,
        beatUntilAtMs: null,
      };
      const profile =
        (block.vibeProfileId
          ? getVibeProfile(block.vibeProfileId)
          : undefined) ?? getVibeProfile("vibe_soft_waves");
      if (profile) this.vibeClock.start(profile, remainingSec);
      this.notify();
      return;
    }
    const originPerf = performance.now();
    const untilAtMs = remainingSec * 1000;
    this.state = {
      ...this.state,
      beatOriginPerf: originPerf,
      beatUntilAtMs: untilAtMs,
    };
    this.clock.start(
      pattern,
      block.bpm,
      BEAT_LEAD_IN_MS,
      originPerf,
      untilAtMs,
    );
    this.notify();
  }

  /** Answer post-finale cum-eat promise. */
  answerPromise(success: boolean): void {
    if (!this.state || this.state.promptPhase !== "promise_pending") return;
    const effect = success ? "promise_done" : "promise_fail";
    this.applyMoodChange(moodDeltaForEffect(effect), { speakShift: false });
    this.emit({
      type: "mistress_answer",
      promptId: "promise_cum_eat",
      optionId: success ? "done" : "fail",
      effect,
      labelRu: success ? "Съел" : "Не смог",
    });
    this.state = {
      ...this.state,
      promptPhase: null,
      activePrompt: null,
      promiseCumEat: false,
    };
    this.notify();
  }

  /**
   * Rebuild queue from enterIndex using the current (or new) loadout.
   * Past blocks stay; remaining plan becomes coherent with equipped toys.
   */
  private rebuildTailForLoadout(
    enterIndex: number,
    equippedToyIds: string[],
    opts: {
      forceMode?: SessionParams["mode"];
      announceCageHours?: number;
    } = {},
  ): number {
    if (!this.state) return enterIndex;
    const catalog = this.catalog;
    const q = this.state.queue;
    const prefix = q.slice(0, enterIndex);
    const usedSec = prefix.reduce((s, b) => s + b.durationSec, 0);
    const remaining = Math.max(60, this.state.params.durationSec - usedSec);
    const mode = opts.forceMode ?? this.state.params.mode;
    const nextParams: SessionParams = {
      ...this.state.params,
      mode,
      durationSec: remaining,
    };

    if (!catalog) {
      this.state = {
        ...this.state,
        params: { ...this.state.params, mode },
        equippedToyIds,
      };
      if (opts.announceCageHours != null) {
        this.emit({
          type: "mistress_cage_hijack",
          hours: opts.announceCageHours,
          mode: "chastity",
        });
      }
      return enterIndex;
    }

    const prevFn =
      prefix.length > 0 ? prefix[prefix.length - 1]!.functionId : null;

    let remapped: Block[];
    try {
      const tail = buildRemainingQueue(
        nextParams,
        catalog,
        remaining,
        (this.state.seed ?? Date.now()) + enterIndex + equippedToyIds.length,
        {
          equippedToyIds,
          previousFunctionId: prevFn,
          mood: this.state.mood,
          unlocks: this.unlocks,
          sessionHeat: sessionHeatFromElapsed(
            this.state.elapsedSec,
            this.state.params.durationSec,
          ),
          edgesAlreadyDone: this.state.edgesDone,
          ruinsAlreadyDone: this.state.ruinsDone,
        },
      );
      remapped = tail.map((b, i) => ({
        ...b,
        id: `load-${enterIndex}-${i}-${b.id}`,
      }));
    } catch {
      this.state = {
        ...this.state,
        params: { ...this.state.params, mode },
        equippedToyIds,
      };
      if (opts.announceCageHours != null) {
        this.emit({
          type: "mistress_cage_hijack",
          hours: opts.announceCageHours,
          mode: "chastity",
        });
      }
      return enterIndex;
    }

    this.state = {
      ...this.state,
      params: { ...this.state.params, mode },
      equippedToyIds,
      queue: [...prefix, ...remapped],
    };
    if (opts.announceCageHours != null) {
      this.emit({
        type: "mistress_cage_hijack",
        hours: opts.announceCageHours,
        mode: "chastity",
      });
    }
    return enterIndex;
  }

  /** Splice a mood-scaled edge-ad sequence at enterIndex. */
  private spliceEdgeAdAt(
    enterIndex: number,
    equippedToyIds: string[],
    forceEdges?: number,
  ): number {
    if (!this.state || !this.catalog) return enterIndex;
    const prevFn =
      enterIndex > 0
        ? this.state.queue[enterIndex - 1]?.functionId
        : this.state.queue[this.state.index]?.functionId;
    const seq = buildEdgeAdSequence(this.state.params, this.catalog, {
      mood: this.state.mood,
      equippedToyIds,
      previousFunctionId: prevFn ?? null,
      seed: (this.state.seed ?? Date.now()) + enterIndex + 17,
      idPrefix: `ead-${Date.now()}`,
      unlocks: this.unlocks,
      forceEdges,
    });
    if (seq.length === 0) return enterIndex;
    const edgeCount = seq.filter((b) => b.goal === "edge").length;
    const q = this.state.queue;
    this.state = {
      ...this.state,
      params: {
        ...this.state.params,
        edgesTarget: this.state.params.edgesTarget + edgeCount,
      },
      queue: [...q.slice(0, enterIndex), ...seq, ...q.slice(enterIndex)],
    };
    return enterIndex;
  }

  private applyDiceChaos(
    enterIndex: number,
    equippedToyIds: string[],
  ): number {
    if (!this.state) return enterIndex;
    const result = rollDiceChaos(this.rng);
    this.emit({
      type: "dice_chaos",
      roll: result.roll,
      outcome: result.outcome,
      labelRu: result.labelRu,
      speakEn: result.speakEn,
    });

    switch (result.outcome) {
      case "edge_ad":
        return this.spliceEdgeAdAt(enterIndex, equippedToyIds);
      case "long_rest": {
        const rest = this.makeRestBlock(
          `dice-rest-${Date.now()}`,
          40,
          this.state.params.mode,
        );
        const q = this.state.queue;
        this.state = {
          ...this.state,
          queue: [...q.slice(0, enterIndex), rest, ...q.slice(enterIndex)],
        };
        return enterIndex;
      }
      case "extra_edges": {
        const add = 2;
        const harsh =
          isHarshMood(this.state.mood) || this.state.mood === "bored";
        this.state = {
          ...this.state,
          params: {
            ...this.state.params,
            edgesTarget: this.state.params.edgesTarget + add,
            durationSec:
              this.state.params.durationSec + add * (harsh ? 50 : 35),
          },
        };
        // Rebuild so the new quota actually appears as edge blocks
        return this.rebuildTailForLoadout(enterIndex, equippedToyIds);
      }
      case "harsher_rebuild": {
        this.applyMoodChange(-2);
        this.state = {
          ...this.state,
          params: paramsAfterMoodOffer(this.state.params, "mood_harsher"),
        };
        return this.rebuildTailForLoadout(enterIndex, equippedToyIds);
      }
      case "denial_bias": {
        const d = denialQuestFromMood(this.state.mood);
        this.state = {
          ...this.state,
          params: applyDenialBiasParams(this.state.params),
          pendingDenialHours: d.hours,
          pendingDenialEdges: d.edges,
        };
        return enterIndex;
      }
      case "soft_mercy":
        this.applyMoodChange(1, { speakShift: false });
        this.state = {
          ...this.state,
          params: applySoftMercyParams(this.state.params),
        };
        return enterIndex;
      default: {
        const _exhaustive: never = result.outcome;
        return _exhaustive;
      }
    }
  }

  private openMistressPrompt(enterIndex: number): void {
    if (!this.state) return;
    const prefs = this.state.fetishPrefs ?? {};
    const equippedToyIds = this.state.equippedToyIds ?? [];
    const allow = this.state.params.allowedToyIds;
    const toysBanned = isNoneToyAllowList(allow);
    const ownedIds = new Set(
      toysBanned
        ? []
        : (this.catalog?.toys ?? [])
            .filter((t) => t.owned)
            .filter((t) => isToyAllowedInSession(t.id, allow))
            .map((t) => t.id),
    );
    const canEquip =
      !toysBanned &&
      equipPool(equippedToyIds).some(
        (p) => p.toyId != null && ownedIds.has(p.toyId),
      );
    const next = this.state.queue[enterIndex];
    const remaining = this.state.queue.length - enterIndex;
    const nearFinale =
      next?.goal === "finale" || remaining <= 4;
    let kind = rollPromptKind(this.rng, prefs, {
      canEquip,
      mood: this.state.mood,
      begCredits: this.state.begCredits ?? 0,
      nearFinale,
    });
    if (kind === "equip" && !canEquip) {
      kind = "feeling";
    }
    if (kind === "permission" && (this.state.begCredits ?? 0) <= 0) {
      kind = "feeling";
    }

    // Sometimes (not always) pull a feeling check that matches the last actions
    const preferContextualFeeling = this.rng() < 0.58;
    if (preferContextualFeeling && this.recentGoals.length > 0) {
      const recent = this.recentGoals.slice(-4);
      const hasContextual = (activeMistressPrompts().feeling ?? []).some(
        (p) => (p.afterGoals ?? []).some((g) => recent.includes(g)),
      );
      if (hasContextual && this.rng() < 0.62) {
        kind = "feeling";
      }
    }

    let def = pickMistressPrompt(kind, this.rng, {
      mood: this.state.mood,
      prefs,
      excludeId: this.lastPromptId,
      equippedToyIds,
      canEquip,
      recentGoals: this.recentGoals,
      preferContextualFeeling:
        preferContextualFeeling && kind === "feeling",
    });
    const breathUnlocked = isFeatureUnlocked(BREATH_FEATURE_ID, this.unlocks);
    if (
      (!breathUnlocked && def.taskType === "breath_challenge") ||
      (!breathUnlocked && def.choiceAction === "breath_hold")
    ) {
      def = pickMistressPrompt("feeling", this.rng, {
        mood: this.state.mood,
        prefs,
        excludeId: this.lastPromptId,
        equippedToyIds,
        recentGoals: this.recentGoals,
        preferContextualFeeling,
      });
    }
    // Skip equip cards for toys not owned / not allowed this session
    if (
      def.kind === "equip" &&
      def.toyId &&
      !ownedIds.has(def.toyId)
    ) {
      const fallback = pickMistressPrompt("feeling", this.rng, {
        mood: this.state.mood,
        prefs,
        excludeId: this.lastPromptId,
        equippedToyIds,
        recentGoals: this.recentGoals,
        preferContextualFeeling,
      });
      this.lastPromptId = fallback.id;
      this.openPromptDef(fallback, enterIndex);
      return;
    }
    // Session said no toys / cage not on allow-list — don't offer cage hijack
    if (
      def.kind === "dare" &&
      def.taskType === "cage_hijack" &&
      !isToyAllowedInSession("chastity_cage", allow)
    ) {
      const fallback = pickMistressPrompt("feeling", this.rng, {
        mood: this.state.mood,
        prefs,
        excludeId: this.lastPromptId,
        equippedToyIds,
        recentGoals: this.recentGoals,
        preferContextualFeeling,
      });
      this.lastPromptId = fallback.id;
      this.openPromptDef(fallback, enterIndex);
      return;
    }
    this.lastPromptId = def.id;
    this.openPromptDef(def, enterIndex);
  }

  private openPromptDef(def: MistressPromptDef, enterIndex: number): void {
    if (!this.state) return;
    const active = toActivePrompt(def);

    this.clearSoftSkipTimer();
    this.clock.stop();
    this.vibeClock.stop();
    stopVibeHum();

    this.state = {
      ...this.state,
      promptPhase: "await",
      activePrompt: active,
      activeTask: null,
      pendingEnterIndex: enterIndex,
      beatOriginPerf: null,
      beatUntilAtMs: null,
      confirmRequestAtPerf: null,
    };
    this.emit({ type: "mistress_prompt", prompt: active });
    this.notify();
  }

  private applyMoodChange(
    delta: number,
    opts: { speakShift?: boolean } = {},
  ): boolean {
    if (!this.state || delta === 0) return false;
    const speakShift = opts.speakShift !== false;
    const previous = this.state.mood;
    const { score, mood, changed } = applyMoodDelta(
      this.state.moodScore,
      delta,
    );
    this.state = { ...this.state, moodScore: score, mood };
    if (changed && speakShift) {
      this.emit({
        type: "mood_shift",
        mood,
        previous,
        score,
      });
    }
    return changed;
  }

  /** Insert a rest block immediately after the current index (before advance). */
  private insertRestAfterCurrent(durationSec: number): void {
    if (!this.state) return;
    const i = this.state.index;
    const rest = this.makeRestBlock(
      `late-${Date.now()}`,
      durationSec,
      this.state.params.mode,
    );
    const nextQueue = [
      ...this.state.queue.slice(0, i + 1),
      rest,
      ...this.state.queue.slice(i + 1),
    ];
    this.state = { ...this.state, queue: nextQueue };
  }

  /**
   * Re-arm metronome for the remaining Tide stroke block after miss report.
   * Preserves tideHits / tideConfessed / blockElapsedSec.
   */
  private continueTideStrokeAfterMiss(): void {
    if (!this.state || this.state.status !== "running") return;
    const block = this.state.queue[this.state.index];
    if (!block || block.goal !== "stroke") {
      this.advanceBlock();
      return;
    }
    const pattern = getPattern(block.patternId);
    if (!pattern) {
      this.emit({
        type: "block_skip",
        blockId: block.id,
        reason: "missing_pattern",
        detail: block.patternId,
      });
      this.advanceBlock();
      return;
    }

    const remainingSec = Math.max(
      0,
      block.durationSec - (this.state.blockElapsedSec ?? 0),
    );
    if (remainingSec <= 0) {
      this.advanceBlock();
      return;
    }

    this.clock.stop();
    this.vibeClock.stop();
    this.clearClockStartTimer();
    stopVibeHum();

    if (block.drive === "vibe") {
      this.state = {
        ...this.state,
        beatOriginPerf: null,
        beatUntilAtMs: null,
      };
      const profile =
        (block.vibeProfileId
          ? getVibeProfile(block.vibeProfileId)
          : undefined) ?? getVibeProfile("vibe_soft_waves");
      if (profile) this.vibeClock.start(profile, remainingSec);
      this.notify();
      return;
    }

    const originPerf = performance.now();
    const untilAtMs = remainingSec * 1000;
    this.state = {
      ...this.state,
      beatOriginPerf: originPerf,
      beatUntilAtMs: untilAtMs,
    };
    this.clock.start(
      pattern,
      block.bpm,
      BEAT_LEAD_IN_MS,
      originPerf,
      untilAtMs,
    );
    this.notify();
  }

  private splicePendingQuest(): void {
    if (!this.state?.pendingQuest) return;
    const offer = this.state.pendingQuest;
    const bonus = makeQuestBlock(offer, this.state.params.mode);
    const i = this.state.index;
    const nextQueue = [
      ...this.state.queue.slice(0, i + 1),
      bonus,
      ...this.state.queue.slice(i + 1),
    ];
    this.state = {
      ...this.state,
      queue: nextQueue,
      pendingQuest: null,
      activeQuest: { ...offer },
    };
  }

  private maybeOfferQuest(): void {
    if (!this.state || this.state.status !== "running") return;
    if (this.state.questOffer || this.state.pendingQuest || this.state.activeQuest) {
      return;
    }
    if (isPromptGate(this.state.promptPhase)) return;
    const since = this.state.blocksSinceQuest ?? 0;
    const need = this.state.nextQuestAfter ?? 4;
    if (since < need) return;

    const pool = listEnabledQuestDefs();
    if (pool.length === 0) return;

    const prefs = this.state.fetishPrefs ?? {};
    const fetishKey =
      Object.entries(prefs)
        .filter(([, v]) => v > 0)
        .sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

    const offer = buildQuestOffer(this.rng, {
      mood: this.state.mood,
      fetishKey,
      pool,
    });
    if (!offer) return;
    this.state = {
      ...this.state,
      questOffer: offer,
      blocksSinceQuest: 0,
      nextQuestAfter: 3 + Math.floor(this.rng() * 3),
    };
    this.emit({ type: "quest_offer", offer });
  }

  private finishActiveQuest(success: boolean): void {
    if (!this.state?.activeQuest) return;
    const q = this.state.activeQuest;
    this.state = {
      ...this.state,
      activeQuest: null,
      confirmRequestAtPerf: null,
    };
    if (success) {
      this.emit({
        type: "quest_completed",
        questId: q.questId,
        offerId: q.id,
        reward: q.reward,
      });
      this.applyMoodChange(1, { speakShift: false });
    } else {
      this.emit({
        type: "quest_failed",
        questId: q.questId,
        offerId: q.id,
      });
      this.applyMoodChange(-1, { speakShift: false });
      this.insertRestAfterCurrent(18);
    }
    this.notify();
    this.advanceBlock();
  }

  private blockElapsedNow(now = performance.now()): number {
    if (!this.state) return 0;
    const t0 = this.state.blockEnteredAtPerf;
    if (t0 == null) return this.state.blockElapsedSec;
    return Math.max(0, Math.floor((now - t0) / 1000));
  }

  /** Keep blockElapsed frozen while wall-clock still advances (pause / prompt / tease). */
  private holdBlockElapsed(ms: number): void {
    if (!this.state || this.state.blockEnteredAtPerf == null) return;
    this.state = {
      ...this.state,
      blockEnteredAtPerf: this.state.blockEnteredAtPerf + ms,
    };
  }

  private skipUnstartableBlock(
    index: number,
    block: Block,
    reason: "missing_function" | "missing_pattern",
    detail: string,
  ): void {
    if (!this.state) return;
    this.emit({
      type: "block_skip",
      blockId: block.id,
      reason,
      detail,
    });
    this.clock.stop();
    this.vibeClock.stop();
    stopVibeHum();
    this.state = { ...this.state, index };
    const next = index + 1;
    if (next >= this.state.queue.length) {
      this.finishSession("complete");
      return;
    }
    this.enterBlock(next);
  }

  private tickSecond(): void {
    if (!this.state || this.state.status !== "running") return;

    if (this.state.timerTease) {
      this.holdBlockElapsed(1000);
      const tease = this.state.timerTease;
      const pauseLeftSec = tease.pauseLeftSec - 1;
      const activeTask = this.state.activeTask
        ? {
            ...this.state.activeTask,
            endsAtPerf: this.state.activeTask.endsAtPerf + 1000,
          }
        : null;
      const holdGraceUntilPerf =
        this.state.holdGraceUntilPerf == null
          ? null
          : this.state.holdGraceUntilPerf + 1000;
      this.state = {
        ...this.state,
        elapsedSec: this.state.elapsedSec + 1,
        activeTask,
        holdGraceUntilPerf,
        timerTease: { ...tease, pauseLeftSec },
      };
      if (pauseLeftSec <= 0) {
        const extendMs = tease.extendSec * 1000;
        const queue = this.state.queue.map((block, index) =>
          index === this.state!.index
            ? { ...block, durationSec: block.durationSec + tease.extendSec }
            : block,
        );
        this.state = {
          ...this.state,
          queue,
          activeTask: this.state.activeTask
            ? {
                ...this.state.activeTask,
                endsAtPerf: this.state.activeTask.endsAtPerf + extendMs,
              }
            : null,
          holdGraceUntilPerf:
            this.state.holdGraceUntilPerf == null
              ? null
              : this.state.holdGraceUntilPerf + extendMs,
          timerTease: null,
        };
        this.emit({
          type: "timer_tease",
          phase: "extend",
          addSec: tease.extendSec,
        });
      }
      this.emitCounters();
      this.notify();
      return;
    }

    const current = this.state.queue[this.state.index];
    const taskRunning =
      this.state.promptPhase === "task_running" &&
      this.state.activeTask != null;
    // Only tease hold / breath / dare timers — never ordinary stroke clocks
    // (that felt like random “timer stopped” spam).
    const visibleHoldGrace =
      current?.goal === "hold" &&
      !this.state.holdArmed &&
      this.state.holdGraceUntilPerf != null;
    const teaseEligible =
      current != null &&
      current.goal !== "rest" &&
      current.goal !== "finale" &&
      current.goal !== "edge" &&
      current.goal !== "ruin_attempt" &&
      current.goal !== "stroke" &&
      current.goal !== "ladder" &&
      current.goal !== "countdown" &&
      (taskRunning ||
        Boolean(this.state.holdArmed) ||
        visibleHoldGrace ||
        (current.goal === "breath" &&
          this.state.breathPhase === "holding"));
    const teaseCooled =
      this.lastTimerTeaseAtPerf <= 0 ||
      performance.now() - this.lastTimerTeaseAtPerf >= TIMER_TEASE_COOLDOWN_MS;
    if (
      teaseEligible &&
      teaseCooled &&
      this.rng() < moodTimerTeaseChance(this.state.mood)
    ) {
      this.lastTimerTeaseAtPerf = performance.now();
      this.state = {
        ...this.state,
        timerTease: {
          pauseLeftSec: moodTimerTeasePauseSec(this.state.mood, this.rng),
          extendSec: moodTimerTeaseExtendSec(this.state.mood, this.rng),
          startedAtPerf: performance.now(),
        },
      };
      this.emit({ type: "timer_tease", phase: "freeze" });
      this.notify();
      return;
    }

    // Prompt / dare gate: soft session clock, freeze block progress
    if (isPromptGate(this.state.promptPhase)) {
      this.holdBlockElapsed(1000);
      const elapsedSec = this.state.elapsedSec + 1;
      if (
        this.state.promptPhase === "task_running" &&
        this.state.activeTask &&
        performance.now() >= this.state.activeTask.endsAtPerf
      ) {
        this.state = {
          ...this.state,
          elapsedSec,
          promptPhase: "task_report",
        };
      } else {
        this.state = { ...this.state, elapsedSec };
      }
      this.emitCounters();
      this.notify();
      return;
    }

    if (current?.goal === "breath" && this.state.breathPhase === "prep") {
      const elapsedSec = this.state.elapsedSec + 1;
      const blockElapsedSec = this.blockElapsedNow();
      const prepSec = current.breathPrepSec ?? 4;
      if (blockElapsedSec >= prepSec) {
        this.state = {
          ...this.state,
          elapsedSec,
          blockElapsedSec: 0,
          blockEnteredAtPerf: performance.now(),
          breathPhase: "holding",
        };
        this.emit({
          type: "breath_hold_start",
          blockId: current.id,
          mode: current.breathMode ?? "still",
        });
        this.startBreathHoldClocks(current);
      } else {
        this.state = { ...this.state, elapsedSec, blockElapsedSec };
        this.emit({
          type: "breath_prep",
          blockId: current.id,
          n: prepSec - blockElapsedSec,
        });
      }
      this.emitCounters();
      this.notify();
      return;
    }

    if (current?.goal === "breath" && this.state.breathPhase === "holding") {
      const elapsedSec = this.state.elapsedSec + 1;
      const blockElapsedSec = this.blockElapsedNow();
      this.state = { ...this.state, elapsedSec, blockElapsedSec };
      this.emitCounters();
      if (blockElapsedSec >= current.durationSec) {
        const success =
          current.breathMode === "stroke_timer" ||
          current.breathMode === "still" ||
          current.breathMode === "hold_edge";
        this.completeBreath(success);
        return;
      }
      this.notify();
      return;
    }

    const elapsedSec = this.state.elapsedSec + 1;
    const blockElapsedSec = this.blockElapsedNow();
    let nextState: SessionState = {
      ...this.state,
      elapsedSec,
      blockElapsedSec,
    };
    if (nextState.idolBuzzPhase === "holding") {
      const buzzElapsed = (nextState.idolBuzzElapsedSec ?? 0) + 1;
      const buzzTarget = nextState.idolBuzzTargetSec ?? 0;
      nextState = { ...nextState, idolBuzzElapsedSec: buzzElapsed };
      this.state = nextState;
      if (buzzTarget > 0 && buzzElapsed >= buzzTarget) {
        this.completeIdolBuzzSuccess();
        this.maybeRampChaseBpm();
        this.emitCounters();
        const blockEarly = this.state.queue[this.state.index];
        if (blockEarly && blockElapsedSec >= blockEarly.durationSec) {
          this.advanceBlock();
          return;
        }
        this.notify();
        return;
      }
    } else {
      this.state = nextState;
    }
    this.maybeRampChaseBpm();
    this.emitCounters();

    const block = this.state.queue[this.state.index];

    // Countdown voice ticks in the last 10 seconds
    if (block?.goal === "countdown") {
      const left = block.durationSec - blockElapsedSec;
      if (left >= 1 && left <= 10 && this.lastCountdownN !== left) {
        this.lastCountdownN = left;
        this.emit({
          type: "countdown_tick",
          blockId: block.id,
          n: left,
        });
      }
    }

    if (block && blockElapsedSec >= block.durationSec) {
      if (this.state.activeQuest && isQuestBlockId(block.id)) {
        // Wait for self-report Done / Fail (edge/hold already wait via goal).
        this.notify();
        return;
      }
      if (block.goal === "edge" || block.goal === "hold") {
        this.notify();
        return;
      }
      if (block.goal === "finale") {
        this.notify();
        return;
      }
      this.lastCountdownN = null;
      this.advanceBlock();
      return;
    }
    this.notify();
  }

  /**
   * As wall-clock session heat rises, nudge remaining blocks toward higher
   * average BPM so long sessions feel progressively harder.
   */
  private applySessionPressureToTail(): void {
    if (!this.state) return;
    const heat = sessionHeatFromElapsed(
      this.state.elapsedSec,
      this.state.params.durationSec,
    );
    const band = Math.floor(heat / 0.25);
    if (band <= this.pressureHeatBand || band < 1) return;
    const prevBand = this.pressureHeatBand;
    this.pressureHeatBand = band;

    const bump = Math.round(5 + 6 * (band - prevBand));
    const cap = Math.round(this.state.params.bpmMax * (1 + 0.18 * heat));
    const from = this.state.index + 1;
    const queue = this.state.queue.map((b, i) => {
      if (i < from) return b;
      if (b.bpm <= 0 || b.goal === "rest" || b.drive === "vibe") return b;
      return { ...b, bpm: Math.min(cap, b.bpm + bump) };
    });
    const harsh =
      isHarshMood(this.state.mood) || this.state.mood === "bored";
    // Soft moods: BPM pressure only — no hollow edgesTarget inflation
    let edgesBonus = 0;
    if (harsh) {
      edgesBonus =
        band >= 2 && prevBand < 2 ? 1 : band >= 4 && prevBand < 4 ? 1 : 0;
      if (band >= 3 && prevBand < 3) edgesBonus += 1;
    }
    this.state = {
      ...this.state,
      queue,
      params: {
        ...this.state.params,
        bpmMin: Math.min(
          this.state.params.bpmMax,
          this.state.params.bpmMin + Math.round(2 * (band - prevBand)),
        ),
        edgesTarget: this.state.params.edgesTarget + edgesBonus,
        durationSec:
          this.state.params.durationSec +
          (edgesBonus > 0 ? edgesBonus * 50 : 0),
      },
    };
    if (edgesBonus > 0) {
      this.rebuildTailForLoadout(
        this.state.index + 1,
        this.state.equippedToyIds ?? [],
      );
    }
  }

  /**
   * While chasing an edge (open-ended edge, or hold before «Держу грань»),
   * raise BPM — faster near the soft timer end; keep climbing if overdue.
   */
  private maybeRampChaseBpm(): void {
    if (!this.state || this.state.status !== "running") return;
    if (this.state.timerTease) return;
    const block = this.state.queue[this.state.index];
    if (!block || block.drive === "vibe") return;
    const chasing =
      block.goal === "edge" ||
      (block.goal === "hold" && !this.state.holdArmed);
    if (!chasing) return;

    const origin =
      this.state.edgeRampOriginBpm ??
      (block.bpm > 0 ? block.bpm : this.state.params.bpmMin);
    if (origin <= 0) return;

    const hardCap = Math.min(
      Math.round(this.state.params.bpmMax * 1.28),
      Math.max(origin + 12, this.state.params.bpmMax + 18),
    );
    const elapsed = this.state.blockElapsedSec;
    let t = 0;
    if (block.durationSec > 0) {
      const linear = Math.min(1, elapsed / block.durationSec);
      // Ease-in: tempo jumps harder as the soft timer runs out.
      t = linear * linear;
      if (elapsed > block.durationSec) {
        const over = elapsed - block.durationSec;
        t = Math.min(1, 0.82 + over / 70);
      }
    } else {
      t = Math.min(1, elapsed / 80);
    }

    const next = Math.round(origin + (hardCap - origin) * t);
    if (next <= block.bpm && next <= this.clock.getBaseBpm()) return;

    this.clock.setBaseBpm(next);
    const queue = this.state.queue.map((b, i) =>
      i === this.state!.index ? { ...b, bpm: next } : b,
    );
    this.state = {
      ...this.state,
      queue,
      edgeRampOriginBpm: origin,
      beatOriginPerf: this.clock.getOriginPerf(),
    };
  }

  private enterBlock(index: number): void {
    if (!this.state) return;
    if (index >= this.state.queue.length) {
      this.finishSession("complete");
      return;
    }
    const block = this.state.queue[index]!;

    // Permission-to-cum gate before finale roulette
    if (
      block.goal === "finale" &&
      !this.state.finaleBegDone &&
      (this.state.begCredits ?? 0) > 0
    ) {
      const prefs = this.state.fetishPrefs ?? {};
      const def = pickMistressPrompt("permission", this.rng, {
        mood: this.state.mood,
        prefs,
        excludeId: this.lastPromptId,
        equippedToyIds: this.state.equippedToyIds ?? [],
      });
      this.lastPromptId = def.id;
      this.openPromptDef(def, index);
      return;
    }

    const fn = getFunction(block.functionId);
    const pattern = getPattern(block.patternId);
    if (!fn) {
      this.skipUnstartableBlock(index, block, "missing_function", block.functionId);
      return;
    }
    if (!pattern) {
      this.skipUnstartableBlock(index, block, "missing_pattern", block.patternId);
      return;
    }

    this.lastCountdownN = null;
    const tideActive =
      block.goal === "stroke" &&
      !isQuestBlockId(block.id) &&
      isTideHitFunction(block.functionId);
    const tideTarget = tideActive
      ? tideSoftTarget(block.functionId, block.durationSec, block.bpm)
      : 0;
    const idolChorusActive =
      getActiveMistress().id === "sunna" &&
      block.goal === "stroke" &&
      !isQuestBlockId(block.id) &&
      isIdolChorusFunction(block.functionId);
    const idolTarget = idolChorusActive
      ? idolChorusSoftTarget(block.functionId, block.durationSec, block.bpm)
      : 0;
    const idolBuzzActive =
      getActiveMistress().id === "sunna" &&
      !isQuestBlockId(block.id) &&
      isIdolBuzzFunction(block.functionId);
    const buzzTarget = idolBuzzActive
      ? idolBuzzTargetSec(this.state.moodScore, this.rng)
      : 0;
    this.state = {
      ...this.state,
      index,
      blockElapsedSec: 0,
      blockEnteredAtPerf: performance.now(),
      status: "running",
      breathPhase: null,
      breathProgress: 0,
      tideHits: 0,
      tideTarget,
      tideConfessed: false,
      tideCompleteResolved: false,
      idolHits: 0,
      idolTarget,
      idolConfessed: false,
      idolCompleteResolved: false,
      idolBuzzPhase: idolBuzzActive ? "arm" : null,
      idolBuzzTargetSec: buzzTarget,
      idolBuzzElapsedSec: 0,
      timerTease: null,
      confirmRequestAtPerf: null,
      holdArmed: false,
      holdGraceUntilPerf:
        block.goal === "hold"
          ? performance.now() + (block.holdGraceSec ?? 28) * 1000
          : null,
      edgeRampOriginBpm: null,
    };
    if (idolBuzzActive) {
      this.emit({
        type: "idol_buzz",
        phase: "arm",
        targetSec: buzzTarget,
        holdMode: this.state.idolBuzzHoldMode ?? "hands_on",
      });
    }

    this.emit({
      type: "block_start",
      block,
      function: fn,
      pattern,
      index,
      total: this.state.queue.length,
    });

    if (block.goal === "breath") {
      const prepSec = block.breathPrepSec ?? 4;
      this.clock.stop();
      this.vibeClock.stop();
      this.clearClockStartTimer();
      this.clearSoftSkipTimer();
      stopVibeHum();
      this.state = {
        ...this.state,
        breathPhase: "prep",
        breathProgress: 0,
        beatOriginPerf: null,
        beatUntilAtMs: null,
      };
      this.emit({ type: "breath_prep", blockId: block.id, n: prepSec });
      this.notify();
      return;
    }

    if (isQuestBlockId(block.id) && this.state.activeQuest) {
      const liveQuest = {
        ...this.state.activeQuest,
        endsAtPerf: performance.now() + block.durationSec * 1000,
      };
      this.state = {
        ...this.state,
        activeQuest: liveQuest,
      };
      this.emit({
        type: "quest_started",
        quest: liveQuest,
      });
    }

    if (block.goal === "edge") {
      this.state = {
        ...this.state,
        confirmRequestAtPerf: performance.now(),
        edgeRampOriginBpm: block.bpm > 0 ? block.bpm : null,
      };
      this.emit({ type: "edge_request", blockId: block.id });
    }
    if (block.goal === "hold") {
      this.state = {
        ...this.state,
        confirmRequestAtPerf: performance.now(),
        holdArmed: false,
        holdGraceUntilPerf:
          performance.now() + (block.holdGraceSec ?? 28) * 1000,
        edgeRampOriginBpm: block.bpm > 0 ? block.bpm : null,
      };
      this.emit({ type: "hold_request", blockId: block.id });
    }
    if (block.goal === "ruin_attempt") {
      this.state = {
        ...this.state,
        confirmRequestAtPerf: performance.now(),
      };
      this.emit({ type: "ruin_request", blockId: block.id });
      this.emit({ type: "cumplay_prefetch", reason: "ruin_order" });
    }
    if (block.goal === "finale") {
      const odds = resolveSessionFinaleOdds(
        this.state.mood,
        this.rng,
        undefined,
        this.state.params.mode,
        {
          pCum: this.state.params.pCum,
          pRuin: this.state.params.pRuin,
        },
      );
      this.state = {
        ...this.state,
        beatOriginPerf: null,
        beatUntilAtMs: null,
        params: {
          ...this.state.params,
          pCum: odds.pCum,
          pRuin: odds.pRuin,
        },
        finaleOutcome: undefined,
        finalePhase: "await_edge",
        finaleBegDone: true,
      };
      this.emit({ type: "finale_edge_request", blockId: block.id });
      this.notify();
      return;
    }

    this.clock.stop();
    this.vibeClock.stop();
    this.clearClockStartTimer();
    stopVibeHum();

    if (block.goal === "rest") {
      this.state = {
        ...this.state,
        beatOriginPerf: null,
        beatUntilAtMs: null,
      };
      this.notify();
      return;
    }

    if (block.drive === "vibe") {
      this.state = {
        ...this.state,
        beatOriginPerf: null,
        beatUntilAtMs: null,
      };
      const profile =
        (block.vibeProfileId
          ? getVibeProfile(block.vibeProfileId)
          : undefined) ?? getVibeProfile("vibe_soft_waves");
      if (profile) this.vibeClock.start(profile, block.durationSec);
    } else {
      // Quest bonus blocks skip the highway handoff gap so the full duration
      // is available for audible beats (count/sync targets stay reachable).
      const questBlock = isQuestBlockId(block.id);
      const countingQuest =
        questBlock &&
        questUsesBeatCounter(this.state.activeQuest?.exerciseKind);
      const gap =
        this.beatBlockCount === 0 || questBlock ? 0 : BEAT_BLOCK_GAP_MS;
      this.beatBlockCount += 1;
      const originPerf = performance.now() + gap;
      const openEnded =
        block.goal === "edge" ||
        block.goal === "hold" ||
        countingQuest;
      // Counting quests: keep metronome until Done/Fail / auto-complete,
      // not only until durationSec (lead-in would otherwise eat the target).
      const untilAtMs = openEnded
        ? null
        : Math.max(0, block.durationSec * 1000 - gap);
      this.state = {
        ...this.state,
        beatOriginPerf: originPerf,
        beatUntilAtMs: untilAtMs,
      };
      this.clock.start(
        pattern,
        block.bpm,
        BEAT_LEAD_IN_MS,
        originPerf,
        untilAtMs,
      );
    }
    this.notify();
  }

  private startBreathHoldClocks(block: Block): void {
    if (!this.state || block.goal !== "breath") return;
    const mode = block.breathMode ?? "still";
    if (mode === "still" || mode === "hold_edge") {
      this.state = {
        ...this.state,
        beatOriginPerf: null,
        beatUntilAtMs: null,
      };
      return;
    }
    const pattern = getPattern(block.patternId);
    if (!pattern) return;
    const originPerf = performance.now();
    this.state = {
      ...this.state,
      beatOriginPerf: originPerf,
      beatUntilAtMs: null,
    };
    this.clock.start(
      pattern,
      block.bpm,
      BEAT_LEAD_IN_MS,
      originPerf,
      null,
    );
  }

  private completeBreath(success: boolean): void {
    if (!this.state) return;
    const block = this.state.queue[this.state.index];
    if (block?.goal !== "breath") return;
    this.clock.stop();
    this.vibeClock.stop();
    stopVibeHum();
    this.emit({ type: "breath_done", blockId: block.id, success });
    this.applyMoodChange(success ? 1 : -1, { speakShift: false });
    if (!success) this.insertRestAfterCurrent(15);
    this.state = {
      ...this.state,
      breathPhase: null,
      breathProgress: 0,
      timerTease: null,
      beatOriginPerf: null,
      beatUntilAtMs: null,
    };
    this.notify();
    this.advanceBlock();
  }

  private advanceBlock(): void {
    if (!this.state) return;
    const cur = this.state.queue[this.state.index];
    if (
      cur?.goal === "finale" &&
      (this.state.finalePhase === "await_edge" ||
        this.state.finalePhase === "spinning" ||
        this.state.finalePhase === "revealed")
    ) {
      return;
    }
    if (isPromptGate(this.state.promptPhase)) return;

    this.clearSoftSkipTimer();
    if (cur) {
      const leavingTide =
        cur.goal === "stroke" &&
        !isQuestBlockId(cur.id) &&
        isTideHitFunction(cur.functionId) &&
        (this.state.tideTarget ?? 0) > 0;
      if (leavingTide) {
        const confessed = Boolean(this.state.tideConfessed);
        const completeResolved = Boolean(this.state.tideCompleteResolved);
        // Honor check before leaving — unless mid-block fail or already answered.
        if (!confessed && !completeResolved) {
          this.openTideCompleteAsk();
          return;
        }
        const hits = this.state.tideHits ?? 0;
        const target = this.state.tideTarget ?? 0;
        const met =
          hits >= target &&
          target > 0 &&
          completeResolved &&
          !confessed;
        this.emit({
          type: "tide_hits",
          blockId: cur.id,
          functionId: cur.functionId,
          hits,
          target,
          met,
        });
      }
      const leavingIdol =
        getActiveMistress().id === "sunna" &&
        cur.goal === "stroke" &&
        !isQuestBlockId(cur.id) &&
        isIdolChorusFunction(cur.functionId) &&
        (this.state.idolTarget ?? 0) > 0;
      if (leavingIdol) {
        const confessed = Boolean(this.state.idolConfessed);
        const completeResolved = Boolean(this.state.idolCompleteResolved);
        if (!confessed && !completeResolved) {
          this.openIdolCompleteAsk();
          return;
        }
        const hits = this.state.idolHits ?? 0;
        const target = this.state.idolTarget ?? 0;
        const met =
          hits >= target &&
          target > 0 &&
          completeResolved &&
          !confessed;
        this.emit({
          type: "idol_hits",
          blockId: cur.id,
          functionId: cur.functionId,
          hits,
          target,
          met,
        });
      }
      this.emit({ type: "block_end", blockId: cur.id });
    }
    this.clock.stop();
    this.vibeClock.stop();
    stopVibeHum();

    if (this.state.activeQuest && isQuestBlockId(cur?.id)) {
      // Safety: leaving quest block without report counts as fail.
      const q = this.state.activeQuest;
      this.state = { ...this.state, activeQuest: null };
      this.emit({
        type: "quest_failed",
        questId: q.questId,
        offerId: q.id,
      });
      this.applyMoodChange(-1, { speakShift: false });
    }

    this.splicePendingQuest();
    this.applySessionPressureToTail();

    const nextIndex = this.state.index + 1;
    const next = this.state.queue[nextIndex];

    const countable =
      Boolean(cur) &&
      cur!.goal !== "rest" &&
      cur!.goal !== "finale" &&
      !isQuestBlockId(cur?.id);
    if (countable) {
      this.recentGoals = [...this.recentGoals, cur!.goal].slice(-8);
      this.state = {
        ...this.state,
        blocksSincePrompt: (this.state.blocksSincePrompt ?? 0) + 1,
        blocksSincePrecum: (this.state.blocksSincePrecum ?? 0) + 1,
        blocksSinceQuest: (this.state.blocksSinceQuest ?? 0) + 1,
      };
      this.maybeOfferQuest();
    }

    const due =
      countable &&
      (this.state.blocksSincePrompt ?? 0) >=
        (this.state.nextPromptAfter ?? 3);

    // Don't open a Q&A dock on top of edge/hold/ruin confirm UI — wait for a
    // calmer block to finish so the rhythm isn't broken mid-confirm.
    const deferPromptAfterConfirm =
      cur?.goal === "edge" ||
      cur?.goal === "hold" ||
      cur?.goal === "breath" ||
      cur?.goal === "ruin_attempt" ||
      cur?.goal === "countdown";

    if (
      due &&
      !deferPromptAfterConfirm &&
      next &&
      next.goal !== "finale" &&
      !isQuestBlockId(next.id)
    ) {
      // Harsh moods often skip the polite «хочешь?» and tax edges directly.
      if (this.maybeOpenMistressEdgesTax(nextIndex, { fromPromptDue: true })) {
        return;
      }
      this.openMistressPrompt(nextIndex);
      return;
    }

    if (
      countable &&
      !deferPromptAfterConfirm &&
      next &&
      next.goal !== "finale" &&
      !isQuestBlockId(next.id) &&
      this.maybeOpenMistressEdgesTax(nextIndex, { opportunistic: true })
    ) {
      return;
    }

    if (
      next &&
      next.goal !== "finale" &&
      !isQuestBlockId(next.id) &&
      this.shouldOfferPrecum(cur)
    ) {
      this.openPrecumRitual(nextIndex);
      return;
    }

    this.enterBlock(nextIndex);
  }

  /**
   * Mistress decree roulette: «Сколько эджей я тебе добавлю».
   * Chance and max spins scale with mood hardness.
   */
  private maybeOpenMistressEdgesTax(
    enterIndex: number,
    opts?: { fromPromptDue?: boolean; opportunistic?: boolean },
  ): boolean {
    if (!this.state || this.state.status !== "running") return false;
    if (this.state.promptPhase) return false;
    const mood = this.state.mood;
    if (this.edgesTaxCount >= moodEdgesTaxMaxSpins(mood)) return false;
    if (
      this.lastEdgesTaxAtPerf > 0 &&
      performance.now() - this.lastEdgesTaxAtPerf < 150_000
    ) {
      return false;
    }
    if (this.state.elapsedSec < this.state.params.durationSec * 0.18) {
      return false;
    }
    // Don't tax when the session is almost over.
    if (this.state.elapsedSec > this.state.params.durationSec * 0.88) {
      return false;
    }

    let chance = moodEdgesTaxChance(mood);
    if (opts?.fromPromptDue) {
      chance = Math.min(0.72, chance * (isHarshMood(mood) ? 1.55 : 1.15));
    } else if (opts?.opportunistic) {
      chance *= isHarshMood(mood) || mood === "horny" ? 0.4 : 0.22;
    }
    if (this.rng() >= chance) return false;

    this.openMistressEdgesTax(enterIndex);
    return true;
  }

  private openMistressEdgesTax(enterIndex: number): void {
    if (!this.state) return;
    const wheel = buildEdgesTaxRoulette(this.state.mood);
    if (wheel.length === 0) return;
    const landed = pickChoiceRouletteTarget(wheel, this.rng);
    this.edgesTaxCount += 1;
    this.lastEdgesTaxAtPerf = performance.now();
    const roulette: ActiveChoiceRoulette = {
      titleRu: "Сколько эджей я тебе добавлю",
      action: "extra_edges",
      options: wheel.map((o) => ({
        id: o.id,
        labelRu: o.labelRu,
        value: o.value,
        weight: o.weight,
        color: o.color,
      })),
      targetId: landed.id,
      phase: "spinning",
      forced: true,
    };
    this.state = {
      ...this.state,
      promptPhase: "choice_spinning",
      activePrompt: null,
      activeTask: null,
      choiceRoulette: roulette,
      pendingEnterIndex: enterIndex,
    };
    this.emit({
      type: "mistress_edges_tax",
      phase: "spin",
      speakEn:
        "Edge tax. Spin the wheel — how many edges do I add to your quota?",
    });
    this.notify();
  }

  /** Heavy teasing segment — good spot for precum drip play. */
  private isHeavySegment(block: Block): boolean {
    if (
      block.goal === "rest" ||
      block.goal === "finale" ||
      block.goal === "edge" ||
      block.goal === "hold" ||
      block.goal === "ruin_attempt" ||
      block.goal === "countdown"
    ) {
      return false;
    }
    const fn = getFunction(block.functionId);
    if (!fn) return false;
    if (block.goal === "ladder") return true;
    if (fn.intensity >= 4) return true;
    if (block.bpm >= 95) return true;
    if (block.drive === "vibe" && fn.intensity >= 3) return true;
    return false;
  }

  private shouldOfferPrecum(cur: Block | undefined): boolean {
    if (!this.state || !cur) return false;
    if ((this.state.blocksSincePrecum ?? 99) < 2) return false;

    let chance = 0;
    if (cur.goal === "edge" || cur.goal === "hold") {
      chance = isHarshMood(this.state.mood) ? 0.52 : 0.38;
    } else if (this.isHeavySegment(cur)) {
      chance = isHarshMood(this.state.mood) ? 0.34 : 0.22;
    } else {
      return false;
    }
    return this.rng() < chance;
  }

  private openPrecumRitual(enterIndex: number): void {
    if (!this.state) return;
    const plan = buildPrecumRitual({
      mood: this.state.mood,
      rng: this.rng,
    });
    const ritual: ActiveCumplayRitual = {
      cumplayId: plan.cumplayId,
      finishId: plan.finishId,
      outcome: "ruin",
      context: "precum",
      stepIndex: 0,
      steps: plan.steps,
      done: false,
    };
    const first = plan.steps[0]!;
    this.state = {
      ...this.state,
      blocksSincePrecum: 0,
      pendingEnterIndex: enterIndex,
      cumplayRitual: ritual,
      promptPhase: "cumplay_ritual",
      activePrompt: cumplayStepToPrompt(first, 0, plan.steps.length),
      beatOriginPerf: null,
      beatUntilAtMs: null,
    };
    this.emit({
      type: "mistress_cumplay_step",
      stepId: first.id,
      speakEn: first.speakEn,
      labelRu: first.labelRu,
      index: 0,
      total: plan.steps.length,
    });
    this.notify();
  }

  private injectPunishment(blocks: Block[]): void {
    if (!this.state || blocks.length === 0) return;
    this.clearSoftSkipTimer();
    const i = this.state.index;
    const cur = this.state.queue[i];
    if (cur) this.emit({ type: "block_end", blockId: cur.id });
    this.clock.stop();
    this.vibeClock.stop();
    stopVibeHum();
    const nextQueue = [
      ...this.state.queue.slice(0, i),
      ...blocks,
      ...this.state.queue.slice(i + 1),
    ];
    this.state = { ...this.state, queue: nextQueue };
    this.emitCounters();
    this.enterBlock(i);
  }

  private makeRestBlock(
    id: string,
    durationSec: number,
    mode: SessionParams["mode"],
  ): Block {
    return {
      id,
      durationSec,
      functionId: "rest_hands_off",
      patternId: "meter_straight",
      bpm: 40,
      mode,
      modifiers: [],
      goal: "rest",
      drive: "beat",
    };
  }

  /** Edge-hold endurance turn — confirm arms timer, then «Удержал». */
  private makeHoldBlock(
    id: string,
    durationSec: number,
    mode: SessionParams["mode"],
    graceSec = 28,
  ): Block {
    const hold = Math.max(8, durationSec);
    return {
      id,
      durationSec: hold,
      functionId: "stroke_shaft_only",
      patternId: "special_half",
      bpm: 48,
      mode,
      modifiers: [],
      goal: "hold",
      drive: "beat",
      holdSec: hold,
      holdGraceSec: Math.max(20, graceSec),
    };
  }

  /** Authorized mid-session ruin attempt. */
  private makeRuinAttemptBlock(
    id: string,
    mode: SessionParams["mode"],
  ): Block {
    return {
      id,
      durationSec: 42,
      functionId: "stroke_shaft_only",
      patternId: "special_half",
      bpm: 52,
      mode,
      modifiers: [],
      goal: "ruin_attempt",
      drive: "beat",
    };
  }

  /** Tip-only stroke turn for loyalty_tip_only. */
  private makeTipStrokeBlock(
    id: string,
    durationSec: number,
    mode: SessionParams["mode"],
  ): Block {
    return {
      id,
      durationSec: Math.max(8, durationSec),
      functionId: "stroke_shaft_only",
      patternId: "meter_straight",
      bpm: 55,
      mode,
      modifiers: [],
      goal: "stroke",
      drive: "beat",
    };
  }

  /** Answer a post-finale cumplay ritual step. */
  answerCumplayStep(
    optionId: string,
    opts: { bribed?: boolean } = {},
  ): void {
    if (!this.state || this.state.promptPhase !== "cumplay_ritual") return;
    const ritual = this.state.cumplayRitual;
    if (!ritual || ritual.done) return;
    const step = ritual.steps[ritual.stepIndex];
    if (!step) return;

    const option =
      step.options.find((o) => o.id === optionId) ??
      step.options.find((o) => o.effect === "mute") ??
      step.options[step.options.length - 1];
    if (!option) return;

    const effect = option.effect as CumplayStepEffect;
    if (!opts.bribed) {
      this.applyMoodChange(cumplayEffectMoodDelta(effect), {
        speakShift: false,
      });
      // CEI tempt success: small good-boy reward on top of ok delta
      if (
        effect === "cumplay_ok" &&
        (step.id === "tempt_eat_halfway" ||
          step.id === "tempt_eat_soft" ||
          step.id === "tempt_eat_ruin")
      ) {
        this.applyMoodChange(1, { speakShift: false });
      }
    }

    this.emit({
      type: "mistress_answer",
      promptId: `cumplay-step-${step.id}`,
      optionId: option.id,
      effect:
        effect === "cumplay_ok"
          ? "feeling_good"
          : effect === "cumplay_fail"
            ? "feeling_bad"
            : effect === "cumplay_soft"
              ? "confess_dislike"
              : "mute",
      labelRu: option.labelRu,
    });

    const nextIndex = ritual.stepIndex + 1;
    if (nextIndex >= ritual.steps.length) {
      const doneRitual: ActiveCumplayRitual = {
        ...ritual,
        stepIndex: nextIndex,
        done: true,
      };
      const pendingRestSec = ritual.pendingRestSec;
      const pendingEnter = this.state.pendingEnterIndex;
      this.state = {
        ...this.state,
        cumplayRitual:
          ritual.context === "finale" ? doneRitual : null,
        promptPhase: null,
        activePrompt: null,
        promiseCumEat:
          ritual.context === "finale" ? false : this.state.promiseCumEat,
        pendingEnterIndex:
          ritual.context === "precum" ? pendingEnter : this.state.pendingEnterIndex,
      };
      this.emit({
        type: "mistress_cumplay_done",
        cumplayId: ritual.cumplayId,
        outcome: ritual.outcome,
      });
      this.notify();

      if (ritual.context === "mid") {
        this.advanceBlock();
        return;
      }
      if (ritual.context === "precum") {
        const enter = pendingEnter ?? this.state.index + 1;
        this.state = { ...this.state, pendingEnterIndex: null };
        this.enterBlock(enter);
        return;
      }
      if (ritual.context === "unauthorized") {
        // Full shame/cumplay ritual earns the ruin toward quota; edge tax already applied.
        if (ritual.outcome === "ruin") {
          const ruinsDone = this.state.ruinsDone + 1;
          this.state = { ...this.state, ruinsDone };
          this.emit({ type: "ruin_done", total: ruinsDone });
          this.emitCounters();
        }
        const sec = Math.max(20, pendingRestSec ?? 45);
        const rest = this.makeRestBlock(
          `punish-${Date.now()}-unauth`,
          sec,
          this.state.params.mode,
        );
        this.injectPunishment([rest]);
        return;
      }
      return;
    }

    const next = ritual.steps[nextIndex]!;
    const nextRitual: ActiveCumplayRitual = {
      ...ritual,
      stepIndex: nextIndex,
    };
    this.state = {
      ...this.state,
      cumplayRitual: nextRitual,
      promptPhase: "cumplay_ritual",
      activePrompt: cumplayStepToPrompt(next, nextIndex, ritual.steps.length),
    };
    this.emit({
      type: "mistress_cumplay_step",
      stepId: next.id,
      speakEn: next.speakEn,
      labelRu: next.labelRu,
      index: nextIndex,
      total: ritual.steps.length,
    });
    this.notify();
  }

  private runFinaleReveal(): void {
    if (!this.state || !this.state.finaleOutcome) return;
    const outcome = this.state.finaleOutcome;
    this.state = { ...this.state, finalePhase: "revealed", finaleOutcome: outcome };
    this.emit({ type: "finale_roll", outcome });

    if (outcome === "deny") {
      const d = denialQuestFromMood(this.state.mood);
      this.state = {
        ...this.state,
        promiseCumEat: false,
        cumplayRitual: null,
        pendingDenialHours:
          this.state.pendingDenialHours ?? d.hours,
        pendingDenialEdges:
          this.state.pendingDenialEdges ?? d.edges,
      };
      this.notify();
      this.clearSoftSkipTimer();
      return;
    }

    this.emit({ type: "finish", finishId: this.state.params.finishId });
    this.emit({ type: "cumplay", cumplayId: this.state.params.cumplayId });

    const plan = buildCumplayRitual({
      outcome,
      finishId: this.state.params.finishId,
      cumplayId: this.state.params.cumplayId,
      mood: this.state.mood,
      promiseCumEat: Boolean(this.state.promiseCumEat),
      context: "finale",
    });

    if (!plan || plan.steps.length === 0) {
      this.state = {
        ...this.state,
        promiseCumEat: false,
        cumplayRitual: {
          cumplayId: this.state.params.cumplayId,
          finishId: this.state.params.finishId,
          outcome,
          context: "finale",
          stepIndex: 0,
          steps: [],
          done: true,
        },
      };
      this.notify();
      this.clearSoftSkipTimer();
      return;
    }

    const ritual: ActiveCumplayRitual = {
      cumplayId: plan.cumplayId,
      finishId: plan.finishId,
      outcome: plan.outcome,
      context: "finale",
      stepIndex: 0,
      steps: plan.steps,
      done: false,
    };
    const first = plan.steps[0]!;
    this.state = {
      ...this.state,
      cumplayRitual: ritual,
      promptPhase: "cumplay_ritual",
      activePrompt: cumplayStepToPrompt(first, 0, plan.steps.length),
    };
    this.emit({ type: "cumplay_prefetch", reason: "ritual" });
    this.emit({
      type: "mistress_cumplay_step",
      stepId: first.id,
      speakEn: first.speakEn,
      labelRu: first.labelRu,
      index: 0,
      total: plan.steps.length,
    });
    this.notify();
    this.clearSoftSkipTimer();
  }

  completeFinaleSession(): void {
    if (!this.state || this.state.status === "ended") return;
    if (this.state.finalePhase !== "revealed") return;
    if (this.state.promptPhase === "promise_pending") return;
    if (this.state.promptPhase === "cumplay_ritual") return;
    if (
      this.state.cumplayRitual &&
      this.state.cumplayRitual.context === "finale" &&
      !this.state.cumplayRitual.done &&
      this.state.finaleOutcome !== "deny"
    ) {
      return;
    }
    this.clearSoftSkipTimer();
    this.finishSession("complete");
  }

  private finishSession(
    reason: "complete" | "abort",
    opts?: { clearCheckpoint?: boolean; silent?: boolean },
  ): void {
    this.stopTimers();
    this.clock.stop();
    this.vibeClock.stop();
    stopVibeHum();
    if (opts?.clearCheckpoint !== false) {
      clearSessionCheckpoint();
    }
    if (!this.state) return;
    const silent =
      opts?.silent === true || isLabPracticeRun(this.state);
    const cindersEarned =
      reason === "complete" && !silent
        ? calcSessionCompleteCinders({
            elapsedSec: this.state.elapsedSec,
            edgesDone: this.state.edgesDone,
            outcome: this.state.finaleOutcome,
          })
        : 0;
    this.state = {
      ...this.state,
      status: "ended",
      finalePhase: null,
      confirmRequestAtPerf: null,
      promptPhase: null,
      activePrompt: null,
      activeTask: null,
      cumplayRitual: null,
      pendingEnterIndex: null,
      breathPhase: null,
      breathProgress: 0,
      timerTease: null,
    };
    this.emit({
      type: "session_end",
      reason,
      cindersEarned,
      silent: silent ? true : undefined,
    });
    this.notify();
  }

  private stopTimers(): void {
    if (this.blockTimer !== null) {
      clearInterval(this.blockTimer);
      this.blockTimer = null;
    }
    this.clearClockStartTimer();
    this.clearSoftSkipTimer();
  }

  private clearClockStartTimer(): void {
    if (this.clockStartTimer !== null) {
      clearTimeout(this.clockStartTimer);
      this.clockStartTimer = null;
    }
  }

  private clearSoftSkipTimer(): void {
    if (this.softSkipTimer !== null) {
      clearTimeout(this.softSkipTimer);
      this.softSkipTimer = null;
    }
  }

  private emitCounters(): void {
    if (!this.state) return;
    this.emit({
      type: "counters",
      edgesDone: this.state.edgesDone,
      ruinsDone: this.state.ruinsDone,
      elapsedSec: this.state.elapsedSec,
    });
  }

  private emit(event: SessionEvent): void {
    this.bus.emit(event);
    const extras = this.voice.onEvent(event);
    for (const extra of extras) {
      this.bus.emit(extra);
    }
  }

  private notify(): void {
    if (!this.state) return;
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }
}

export function statusRu(status: SessionStatus): string {
  switch (status) {
    case "idle":
      return "Ожидание";
    case "running":
      return "Идёт";
    case "paused":
      return "Пауза";
    case "ended":
      return "Завершена";
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

function cumplayStepToPrompt(
  step: ActiveCumplayRitual["steps"][number],
  index: number,
  total: number,
): ActiveMistressPrompt {
  return {
    id: `cumplay-step-${step.id}`,
    kind: "dare",
    speakEn: step.speakEn,
    labelRu: `${index + 1}/${total} · ${step.labelRu}`,
    options: step.options.map((o) => ({
      id: o.id,
      labelRu: o.labelRu,
      effect:
        o.effect === "cumplay_ok"
          ? "feeling_good"
          : o.effect === "cumplay_fail"
            ? "feeling_bad"
            : o.effect === "cumplay_soft"
              ? "confess_dislike"
              : "mute",
    })),
  };
}

function toActivePrompt(def: MistressPromptDef): ActiveMistressPrompt {
  return {
    id: def.id,
    kind: def.kind,
    speakEn: def.speakEn,
    labelRu: def.labelRu,
    tags: def.tags,
    preferKeys: def.preferKeys,
    loyaltySec: def.loyaltySec,
    loyaltyAction: def.loyaltyAction,
    choiceAction: def.choiceAction,
    taskType: def.taskType,
    taskSec: def.taskSec,
    taskCount: def.taskCount,
    instructionRu: def.instructionRu,
    cageHours: def.cageHours,
    cageHoursMin: def.cageHoursMin,
    cageHoursMax: def.cageHoursMax,
    toyId: def.toyId,
    options: def.options.map((o) => ({
      id: o.id,
      labelRu: o.labelRu,
      effect: o.effect,
      preferKey: o.preferKey,
    })),
  };
}
