/** Core types for JOI Conductor Phase 1. See docs/V1_SPEC.md */

export type SessionMode =
  | "stroke"
  | "anal"
  | "chastity"
  | "onahole"
  | "cbt"
  | "oral"
  /** Furina Tide: hip-pressure against a surface, no hand-stroke */
  | "prone"
  /** Sunna Idol: caged ball plapping with a dildo (Tide-style hit counter) */
  | "plapping";

/** How a block is driven: metronome beats vs vibe intensity timeline */
export type BlockDrive = "beat" | "vibe";

export type VibeLevel = 0 | 1 | 2 | 3 | 4 | 5;

export type FunctionCategory =
  | "stroke"
  | "vibe"
  | "nipple"
  | "cbt"
  | "anal"
  | "combo"
  | "oral";

export type BodyFocus =
  | "shaft"
  | "head"
  | "balls"
  | "nipples"
  | "ass"
  | "mixed";

export type Hands = "none" | "one" | "two";

export type Intensity = 1 | 2 | 3 | 4 | 5;

export interface AvatarHint {
  gesture: string;
  energy: 1 | 2 | 3;
}

export interface FunctionDef {
  id: string;
  name: string;
  nameRu: string;
  descriptionRu: string;
  category: FunctionCategory;
  modes: SessionMode[];
  intensity: Intensity;
  hands: Hands;
  bodyFocus: BodyFocus[];
  requiresToys: string[];
  incompatibleWith: string[];
  cuesRu: string[];
  avatarHint?: AvatarHint;
  /** beat = metronome; vibe = time + intensity (no stroke rhythm) */
  drive?: BlockDrive;
  enabled: boolean;
}

export type PatternKind = "meter" | "special";

export interface BeatPatternDef {
  id: string;
  name: string;
  nameRu: string;
  descriptionRu: string;
  kind: PatternKind;
  steps?: number[];
  params?: Record<string, number | string | boolean>;
  cuesRu: string[];
  enabled: boolean;
}

export interface FinishDef {
  id: string;
  nameRu: string;
  descriptionRu: string;
  tags: string[];
  enabled: boolean;
}

export interface CumplayDef {
  id: string;
  nameRu: string;
  descriptionRu: string;
  ladderRank: number | null;
  enabled: boolean;
  tags?: string[];
}

export interface ToyDef {
  id: string;
  nameRu: string;
  descriptionRu: string;
  owned: boolean;
  tags: string[];
  /** active = manipulate; worn = stays in/on during block */
  role?: "active" | "worn" | "assist";
  vibe?: boolean;
  size?: "s" | "m" | "l";
  /** Abstract ids this toy fulfills (e.g. dildo_small → "dildo") */
  satisfies?: string[];
}

export interface ToyComboDef {
  id: string;
  nameRu: string;
  descriptionRu: string;
  toys: string[];
  functionId: string;
}

export interface SessionParams {
  durationSec: number;
  mode: SessionMode;
  edgesTarget: number;
  ruinsTarget: number;
  pCum: number;
  pRuin: number;
  finishId: string;
  cumplayId: string;
  bpmMin: number;
  bpmMax: number;
  blockSecMin: number;
  blockSecMax: number;
  allowedFunctionIds: string[];
  allowedPatternIds: string[];
  allowedToyIds?: string[];
}

export type BlockGoal =
  | "stroke"
  | "edge"
  | "hold"
  | "ruin_attempt"
  | "rest"
  | "finale"
  | "countdown"
  | "ladder"
  | "breath";

/** Breath-hold challenge style (requires shop feature unlock). */
export type BreathMode =
  | "stroke_timer"
  | "stroke_count"
  | "stroke_beats"
  | "edge_race"
  | "hold_edge"
  | "still";

/** Hu Tao side-quest ids (self-report timed challenges). */
export type QuestId =
  | "ball_taps"
  | "edge_rush"
  | "stroke_count"
  | "hands_off"
  | "fetish_focus"
  | "slow_edge"
  | "bpm_sync";

/** How the live quest is exercised / visualized. */
export type QuestExerciseKind =
  | "count"
  | "sync"
  | "edge"
  | "hold"
  | "rest"
  | "cbt"
  | "media";

export type QuestOffer = {
  id: string;
  questId: QuestId;
  nameRu: string;
  ruleRu: string;
  durationSec: number;
  reward: number;
  goal: BlockGoal;
  functionId: string;
  patternId: string;
  bpm: number;
  holdSec?: number;
  exerciseKind: QuestExerciseKind;
  /** Temporary Gelbooru/library tag query while the quest block runs. */
  mediaTags?: string;
  /** Short label for HUD (e.g. fetish name). */
  mediaLabelRu?: string;
  /** Target beat/motion count for count/sync quests. */
  targetBeats?: number;
};

/** Accepted offer waiting for splice, or live bonus-block quest. */
export type ActiveQuest = QuestOffer & {
  endsAtPerf?: number;
};

export interface VibeSegment {
  durationSec: number;
  level: VibeLevel;
  labelRu: string;
}

export interface VibeProfileDef {
  id: string;
  nameRu: string;
  descriptionRu: string;
  segments: VibeSegment[];
}

export interface BlockModifier {
  toyId: string;
  role: string;
  intensity?: number;
}

export interface Block {
  id: string;
  durationSec: number;
  functionId: string;
  patternId: string;
  bpm: number;
  mode: SessionMode;
  modifiers: BlockModifier[];
  goal: BlockGoal;
  holdSec?: number;
  /** Seconds to reach edge before arming hold (button stays available). */
  holdGraceSec?: number;
  /** Breath-hold challenge mode (when goal === "breath"). */
  breathMode?: BreathMode;
  /** Countdown seconds to inhale before breath hold starts. */
  breathPrepSec?: number;
  /** Target stroke/beat count for breath count/beats modes. */
  breathTargetCount?: number;
  /** Default beat; vibe = intensity timeline instead of metronome */
  drive?: BlockDrive;
  vibeProfileId?: string;
}

export type SessionStatus = "idle" | "running" | "paused" | "ended";

/** Hu Tao session mood (see moodEngine / moodLines). */
export type SessionMood =
  | "sweet"
  | "cruel"
  | "calm"
  | "chaotic"
  | "horny"
  | "bored";

export interface SessionState {
  status: SessionStatus;
  params: SessionParams;
  queue: Block[];
  index: number;
  elapsedSec: number;
  blockElapsedSec: number;
  /**
   * `performance.now()` when the current block was entered (or hold/breath
   * phase reset). `blockElapsedSec` is derived from this, not a +1 tick.
   */
  blockEnteredAtPerf?: number | null;
  edgesDone: number;
  /** Confirmed hold endurance (goal === hold), separate from edges. */
  holdsDone?: number;
  ruinsDone: number;
  finaleOutcome?: "cum" | "ruin" | "deny";
  /** Finale roulette gate: wait for edge → spin → reveal */
  finalePhase?: "await_edge" | "spinning" | "revealed" | null;
  seed?: number;
  /**
   * Shared `performance.now()` origin for beat highway + metronome.
   * First audible/visual hit is at beatOriginPerf + BEAT_LEAD_IN_MS.
   */
  beatOriginPerf?: number | null;
  /**
   * Last allowed hit time on the beat timeline (ms from beatOriginPerf).
   * Null = run until confirm/stop (edge/hold). Caps highway look-ahead past block end.
   */
  beatUntilAtMs?: number | null;
  /**
   * Sandbox lab: one practice block, not a real session.
   * End is silent — no diary, debrief, achievements, or contract settle.
   */
  labPractice?: boolean;
  /** Discrete mood from moodScore (−3…+3). */
  mood: SessionMood;
  /** Obedience thermometer; maps to mood via moodEngine.moodFromScore. */
  moodScore: number;
  /**
   * `performance.now()` when edge_request / ruin_request was emitted.
   * Used for silent obedience timing (no visible timer).
   */
  confirmRequestAtPerf?: number | null;
  /**
   * Hold turns: false/undefined = waiting for «Держу грань» to arm the timer;
   * true = timer running toward «Удержал ✓».
   */
  holdArmed?: boolean;
  /**
   * BPM at the start of an edge / pre-hold chase — used to ramp tempo
   * until confirm («Эдж ✓» / «Держу грань ✓»).
   */
  edgeRampOriginBpm?: number | null;
  /**
   * Soft deadline (performance.now) to reach the edge before arming hold.
   * Button stays available; UI shows remaining grace seconds.
   */
  holdGraceUntilPerf?: number | null;
  /** Breath-hold phase: inhale countdown → holding. */
  breathPhase?: "prep" | "holding" | null;
  /** Beats/strokes counted during breath_beats / stroke_count. */
  breathProgress?: number;
  /**
   * Counted CBT/plapping hits this block (Tide): metronome accents (honor)
   * or mic peaks (mic verify). 0 / cleared when not on a Tide-hit stroke block.
   */
  tideHits?: number;
  /** Soft target hits for the current Tide block; 0 = dock hidden. */
  tideTarget?: number;
  /** Player pressed «НЕ ВЫДЕРЖАЛ» this block — skip end-of-block complete ask. */
  tideConfessed?: boolean;
  /** End-of-block «все удары?» already answered — allow advance. */
  tideCompleteResolved?: boolean;
  /**
   * Sunna Chorus: auto-counted oral accents this block.
   * 0 / cleared when not on an oral chorus block.
   */
  idolHits?: number;
  /** Soft throat-rep target; 0 = dock hidden. */
  idolTarget?: number;
  /** Pressed «НЕ ВЫДЕРЖАЛ» on Chorus this block. */
  idolConfessed?: boolean;
  /** End-of-block «все глотки?» answered. */
  idolCompleteResolved?: boolean;
  /**
   * Sunna Buzz hold: arm → holding → done on vibe-on-cage blocks.
   */
  idolBuzzPhase?: "arm" | "holding" | "done" | null;
  idolBuzzTargetSec?: number;
  idolBuzzElapsedSec?: number;
  /** hands_on = hold wand; clipped = toy fixed on cage, hands free. */
  idolBuzzHoldMode?: "hands_on" | "clipped";
  /**
   * Hu Tao freezes a non-rest timer to tease / extend.
   * Wall-clock deadlines (dare/grace) are shifted while active.
   */
  timerTease?: {
    pauseLeftSec: number;
    extendSec: number;
    startedAtPerf: number;
  } | null;
  /** Mistress Q&A / dare / cumplay / Tide / Idol miss gate. */
  promptPhase?:
    | "await"
    | "task_running"
    | "task_report"
    | "promise_pending"
    | "cumplay_ritual"
    | "choice_spinning"
    | "tide_miss_pending"
    | "tide_complete_pending"
    | "idol_miss_pending"
    | "idol_complete_pending"
    | null;
  activePrompt?: ActiveMistressPrompt | null;
  /** Mid-session choice roulette (after «Да» on a choice prompt). */
  choiceRoulette?: ActiveChoiceRoulette | null;
  /** Active timed dare (while promptPhase is task_*). */
  activeTask?: ActiveDareTask | null;
  /** Post-finale cumplay ritual (cum/ruin). */
  cumplayRitual?: ActiveCumplayRitual | null;
  /** Completed countable blocks since last prompt. */
  blocksSincePrompt?: number;
  /** Trigger prompt when blocksSincePrompt >= this (2–4). */
  nextPromptAfter?: number;
  /** Block index to enter after answering the prompt. */
  pendingEnterIndex?: number | null;
  /**
   * Session fetish prefs from confess answers.
   * Positive = likes; negative = dislikes (harsh mood biases bad wagers here).
   */
  fetishPrefs?: Record<string, number>;
  /** Accepted cum-eat promise — asked after finale if cum/ruin. */
  promiseCumEat?: boolean;
  /** Hours to lock after session if cage dare accepted (applied on session_end). */
  pendingCageHours?: number | null;
  /**
   * Toys currently on/in the body. Queue blocks only use these —
   * not the full owned inventory.
   */
  equippedToyIds?: string[];
  /** Countable blocks since last precum gate (cooldown). */
  blocksSincePrecum?: number;
  /** Permission-to-cum beg budget (spent on beg prompts / finale gate). */
  begCredits?: number;
  begsUsed?: number;
  /** Finale permission beg already resolved this session. */
  finaleBegDone?: boolean;
  /** Post-session no-touch hours (applied on session_end). */
  pendingDenialHours?: number | null;
  /** Extra edges required during post-session denial quest. */
  pendingDenialEdges?: number | null;
  /** Hu Tao quest card offer (accept / decline). */
  questOffer?: QuestOffer | null;
  /** Accepted quest waiting for current block to end before splice. */
  pendingQuest?: ActiveQuest | null;
  /** Live bonus-block quest (self-report Done / Fail). */
  activeQuest?: ActiveQuest | null;
  /** Countable blocks since last quest offer. */
  blocksSinceQuest?: number;
  /** Offer when blocksSinceQuest >= this (3–5). */
  nextQuestAfter?: number;
}

export type DareTaskType =
  | "timed_report"
  | "cage_hijack"
  | "cum_eat_promise"
  | "edge_ad"
  | "dice_chaos"
  | "breath_challenge";

export type ActiveDareTask = {
  promptId: string;
  taskType: DareTaskType;
  taskSec: number;
  taskCount?: number;
  instructionRu: string;
  /** performance.now() when the countdown ends */
  endsAtPerf: number;
};

/** Single step inside an active cumplay / precum ritual. */
export type CumplayStep = {
  id: string;
  kind: "command" | "question" | "close";
  speakEn: string;
  labelRu: string;
  options: {
    id: string;
    labelRu: string;
    effect: "cumplay_ok" | "cumplay_fail" | "cumplay_soft" | "mute";
  }[];
};

/** Cumplay / precum / unauthorized mess ritual progress. */
export type ActiveCumplayRitual = {
  cumplayId: string;
  finishId: string;
  outcome: "cum" | "ruin";
  /**
   * finale — gates Завершить;
   * mid — authorized mid-session ruin, then continue;
   * unauthorized — FAB ruin/cum without order, then punishment rest;
   * precum — drip play after edge/heavy, then continue.
   */
  context: "finale" | "mid" | "unauthorized" | "precum";
  /** Rest seconds to inject after unauthorized ritual */
  pendingRestSec?: number;
  stepIndex: number;
  steps: CumplayStep[];
  done: boolean;
};

/** Snapshot of a mistress question shown in the session dock. */
export type ActiveMistressPrompt = {
  id: string;
  kind:
    | "feeling"
    | "wager"
    | "confess"
    | "loyalty"
    | "obey"
    | "dare"
    | "equip"
    | "mood_offer"
    | "permission"
    | "finale_bias"
    | "choice";
  speakEn: string;
  labelRu: string;
  tags?: string;
  /** Fetish / tag keys for weighting + learning from wager answers */
  preferKeys?: string[];
  loyaltySec?: number;
  /** Loyalty yes-branch outcome (default rest). */
  loyaltyAction?: "rest" | "hold" | "tip";
  /** Choice offer action (extend / hold / edge hell…). */
  choiceAction?:
    | "extend_sec"
    | "ruin_now"
    | "hold_sec"
    | "edge_hell"
    | "extra_edges"
    | "rest_sec"
    | "tip_sec"
    | "breath_hold";
  taskType?: DareTaskType;
  taskSec?: number;
  taskCount?: number;
  instructionRu?: string;
  cageHours?: number;
  cageHoursMin?: number;
  cageHoursMax?: number;
  /** Equip prompt — concrete toy id from catalog */
  toyId?: string;
  options: {
    id: string;
    labelRu: string;
    effect:
      | "feeling_good"
      | "feeling_bad"
      | "wager_yes"
      | "wager_no"
      | "mute"
      | "confess_like"
      | "confess_dislike"
      | "loyalty_yes"
      | "loyalty_no"
      | "obey_ok"
      | "obey_fail"
      | "dare_accept"
      | "dare_refuse"
      | "dare_done"
      | "dare_fail"
      | "promise_done"
      | "promise_fail"
      | "equip_yes"
      | "equip_no"
      | "mood_harsher"
      | "mood_softer"
      | "mood_horny"
      | "mood_refuse"
      | "beg_please"
      | "beg_skip"
      | "beg_deny_want"
      | "finale_want_cum"
      | "finale_want_deny"
      | "finale_want_ruin"
      | "choice_yes"
      | "choice_no";
    preferKey?: string;
  }[];
};

/** Predetermined mid-session choice wheel (like finale roulette). */
export type ActiveChoiceRoulette = {
  titleRu: string;
  action:
    | "extend_sec"
    | "ruin_now"
    | "hold_sec"
    | "edge_hell"
    | "extra_edges"
    | "rest_sec"
    | "tip_sec"
    | "breath_hold";
  options: {
    id: string;
    labelRu: string;
    value: number;
    weight?: number;
    color?: string;
  }[];
  targetId: string;
  phase: "spinning" | "revealed";
  /** Mistress decree (no «хочешь?») — edge-tax / hardness spin. */
  forced?: boolean;
};

export type Emotion =
  | "neutral"
  | "tease"
  | "strict"
  | "amused"
  | "intense"
  | "soft";

export type FinaleOutcome = "cum" | "ruin" | "deny";

export type SessionEvent =
  | { type: "session_start"; params: SessionParams; seed?: number }
  | { type: "session_pause" }
  | { type: "session_resume" }
  | {
      type: "session_end";
      reason: "complete" | "abort";
      /** Cinders granted on a clean complete (0 on abort). */
      cindersEarned?: number;
      /**
       * Skip diary, debrief, achievements, and contract settle.
       * Used for HMR/remount abort that keeps a checkpoint, and for lab practice.
       */
      silent?: boolean;
    }
  | {
      type: "block_start";
      block: Block;
      function: FunctionDef;
      pattern: BeatPatternDef;
      index: number;
      total: number;
    }
  | { type: "block_end"; blockId: string }
  | {
      type: "block_skip";
      blockId: string;
      reason: "missing_function" | "missing_pattern";
      detail: string;
    }
  | {
      type: "breath_prep";
      blockId: string;
      n: number;
    }
  | {
      type: "breath_hold_start";
      blockId: string;
      mode: BreathMode;
    }
  | {
      type: "breath_done";
      blockId: string;
      success: boolean;
    }
  | {
      /** Auto / counted hit on CBT/plapping stroke block. */
      type: "tide_hit";
      blockId: string;
      functionId: string;
      hits: number;
      target: number;
    }
  | {
      /** Summary when leaving a Tide-hit block. */
      type: "tide_hits";
      blockId: string;
      functionId: string;
      hits: number;
      target: number;
      met: boolean;
    }
  | {
      /** Confessed missed CBT/plapping hits after «НЕ ВЫДЕРЖАЛ». */
      type: "tide_miss";
      blockId: string;
      functionId: string;
      missed: number;
      hits: number;
      target: number;
      speakEn: string;
    }
  | {
      /** End-of-block honor: all accents vs quota only. */
      type: "tide_complete";
      blockId: string;
      functionId: string;
      allDone: boolean;
      hits: number;
      target: number;
      speakEn: string;
    }
  | {
      type: "idol_hit";
      blockId: string;
      functionId: string;
      hits: number;
      target: number;
    }
  | {
      type: "idol_hits";
      blockId: string;
      functionId: string;
      hits: number;
      target: number;
      met: boolean;
    }
  | {
      type: "idol_miss";
      blockId: string;
      functionId: string;
      missed: number;
      hits: number;
      target: number;
      speakEn: string;
    }
  | {
      type: "idol_complete";
      blockId: string;
      functionId: string;
      allDone: boolean;
      hits: number;
      target: number;
      speakEn: string;
    }
  | {
      type: "idol_buzz";
      phase: "arm" | "holding" | "success" | "fail";
      targetSec?: number;
      elapsedSec?: number;
      holdMode?: "hands_on" | "clipped";
      speakEn?: string;
    }
  | {
      type: "timer_tease";
      phase: "freeze" | "extend";
      addSec?: number;
    }
  | {
      type: "beat";
      blockId: string;
      stepIndex: number;
      accent: number;
      bpm: number;
      atMs: number;
    }
  | {
      type: "vibe_level";
      blockId: string;
      level: VibeLevel;
      labelRu: string;
      segmentIndex: number;
      segmentDurationSec: number;
      profileId: string;
      atMs: number;
    }
  | { type: "edge_request"; blockId: string }
  | { type: "edge_done"; total: number }
  | { type: "hold_request"; blockId: string }
  | { type: "hold_done"; total: number }
  | { type: "ruin_request"; blockId: string }
  | { type: "ruin_done"; total: number }
  | {
      type: "countdown_tick";
      blockId: string;
      n: number;
    }
  | {
      type: "dice_chaos";
      roll: number;
      outcome: string;
      labelRu: string;
      speakEn: string;
    }
  | {
      /** Mistress mid-session edge quota tax (roulette). */
      type: "mistress_edges_tax";
      phase: "spin" | "applied";
      add?: number;
      speakEn: string;
    }
  | {
      type: "unauthorized";
      kind: "edge" | "ruin" | "cum";
      /** Human-readable punishment summary */
      punishmentRu: string;
    }
  | { type: "finale_edge_request"; blockId: string }
  /** Spoken when user presses «ГОТОВ КОНЧИТЬ» (timer itself is silent). */
  | { type: "finale_edge_go" }
  | { type: "finale_roll"; outcome: FinaleOutcome }
  | { type: "finish"; finishId: string }
  | { type: "cumplay"; cumplayId: string }
  | {
      /** Warm Gelbooru cumplay deck (character × cum tag pairs). */
      type: "cumplay_prefetch";
      reason: "ruin_order" | "cum_order" | "finale" | "ritual";
    }
  | {
      type: "mood_shift";
      mood: SessionMood;
      previous: SessionMood;
      score: number;
    }
  | { type: "user_skip" }
  | { type: "user_force_finale" }
  | { type: "user_like" }
  | { type: "user_ready" }
  | { type: "mistress_prompt"; prompt: ActiveMistressPrompt }
  | {
      type: "mistress_answer";
      promptId: string;
      optionId: string;
      effect: ActiveMistressPrompt["options"][number]["effect"];
      labelRu: string;
    }
  | {
      type: "mistress_bribe";
      kind: "prompt" | "dare" | "promise" | "cumplay";
      cost: number;
      promptId?: string;
    }
  | { type: "mistress_wager_media"; tags: string; promptId: string }
  | { type: "mistress_media_fail" }
  | {
      type: "mistress_dare_start";
      promptId: string;
      taskSec: number;
      instructionRu: string;
    }
  | {
      type: "mistress_cage_hijack";
      hours: number;
      mode: SessionMode;
    }
  | { type: "mistress_promise_ask"; kind: "cum_eat" }
  | {
      type: "mistress_equip";
      toyId: string;
      nameRu: string;
      equippedToyIds: string[];
    }
  | {
      type: "mistress_cumplay_step";
      stepId: string;
      speakEn: string;
      labelRu: string;
      index: number;
      total: number;
    }
  | {
      type: "mistress_cumplay_done";
      cumplayId: string;
      outcome: "cum" | "ruin";
    }
  | {
      type: "speech";
      text: string;
      emotion: Emotion;
      gesture?: string;
      durationMs?: number;
      /** llm = LocalLlmVoice; template = bible lines / fallback */
      source?: "llm" | "template";
    }
  | {
      type: "counters";
      edgesDone: number;
      ruinsDone: number;
      elapsedSec: number;
    }
  | {
      type: "quest_offer";
      offer: QuestOffer;
    }
  | { type: "quest_accepted"; questId: string; offerId: string }
  | { type: "quest_declined"; questId: string; offerId: string }
  | {
      type: "quest_completed";
      questId: string;
      offerId: string;
      reward: number;
    }
  | { type: "quest_failed"; questId: string; offerId: string }
  /** Quest block entered — App may swap media to a tagged cache. */
  | { type: "quest_started"; quest: ActiveQuest };

export type SessionEventType = SessionEvent["type"];

export interface VoiceLayer {
  onEvent(event: SessionEvent): SessionEvent[];
}

export interface AvatarAdapter {
  onEvent(event: SessionEvent): void;
}

export const DEFAULT_PARAMS: SessionParams = {
  durationSec: 600,
  mode: "stroke",
  edgesTarget: 5,
  ruinsTarget: 0,
  pCum: 0.55,
  pRuin: 0.25,
  finishId: "hand",
  cumplayId: "none",
  bpmMin: 60,
  bpmMax: 120,
  blockSecMin: 25,
  blockSecMax: 45,
  allowedFunctionIds: [],
  allowedPatternIds: [],
};
