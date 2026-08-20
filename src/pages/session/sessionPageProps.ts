import type {
  VibeHudDeviceInfo,
  VibeHudState,
} from "../../components/VibeHud";
import type {
  ContractProgressFlash,
  ContractQuestRestyle,
} from "../../components/QuestStack";
import type { AvatarSnapshot } from "../../lib/avatar/debugAvatar";
import type { MediaItem } from "../../lib/media";
import type { PlaylistPreloadStatus } from "../../lib/mediaPreload";
import type { Preflight } from "../../lib/preflight";
import type { SunnaPrepStep } from "../../lib/preflight";
import type { IdolBuzzHoldMode } from "../../lib/idolHits";
import type { VoiceActivity } from "../../lib/voice/localLlmVoice";
import type {
  BeatPatternDef,
  Block,
  Emotion,
  FunctionDef,
  SessionMode,
  SessionState,
} from "../../lib/types";

export type SessionWarmupPreview = {
  functionName: string;
  patternName: string;
  bpm: number;
  mode: SessionMode;
};

export type SessionSpeechItem = {
  /** Stable id for queue / enter animation */
  id: number;
  text: string;
  emotion: Emotion;
  gesture?: string;
  durationMs?: number;
  source?: "llm" | "template";
  /** Caption is typing out */
  typewriter?: boolean;
  /** Waiting for EN→RU caption */
  translating?: boolean;
  /** Leaving with fade-out before remove */
  fadingOut?: boolean;
};

export type SessionMediaBundle = {
  mediaItems: MediaItem[];
  mediaDeckKey?: string;
  mediaStartIndex?: number;
  slideSec: number;
  currentMedia: MediaItem | null;
  mediaFavorited: boolean;
  favoriteBusy: boolean;
  playlistPreload: PlaylistPreloadStatus;
  onCurrentMediaChange: (item: MediaItem | null) => void;
  onSlideLeave?: (info: {
    item: MediaItem;
    dwellMs: number;
    reason: "auto" | "manual";
  }) => void;
  onDeckProgress?: (info: {
    index: number;
    deckLength: number;
    unviewedRemaining: number;
    unviewedRatio: number;
    itemId: string | null;
  }) => void;
  onToggleFavorite: () => void;
};

export type SessionVoiceAudioBundle = {
  speechQueue: SessionSpeechItem[];
  voiceMode: "template" | "llm";
  voiceActivity: VoiceActivity;
  voiceModel: string;
  ttsEnabled: boolean;
  onTtsEnabled: (v: boolean) => void;
  ttsVolume: number;
  onTtsVolume: (v: number) => void;
  videoVolume: number;
  onVideoVolume: (v: number) => void;
  sfxVolume: number;
  onSfxVolume: (v: number) => void;
  muted: boolean;
  onMuted: (v: boolean) => void;
};

export type SessionControlsBundle = {
  onStart: () => void;
  onReady: () => void;
  onPause: () => void;
  onResume: () => void;
  onAbort: () => void;
  onConfirmEdge: () => void;
  onConfirmRuin: () => void;
  onConfirmFinaleEdge: () => void;
  onFinaleSpinDone: () => void;
  onFinaleComplete: () => void;
  onChoiceSpinDone: () => void;
  onSkip: () => void;
  onDropUpcoming?: (queueIndex: number) => void;
  onMoveUpcoming?: (queueIndex: number, dir: -1 | 1) => void;
  onInsertRestAfter?: (queueIndex: number) => void;
  onForceFinale: () => void;
  onAnswerPrompt: (optionId: string) => void;
  onReportDare: (success: boolean) => void;
  onReportBreath: (success: boolean) => void;
  onAnswerPromise: (success: boolean) => void;
  onAnswerCumplay: (optionId: string) => void;
  onBribeMistress: () => void;
  onUnauthorizedEdge: () => void;
  onUnauthorizedRuin: () => void;
  onUnauthorizedCum: () => void;
};

export type SessionTideIdolBundle = {
  onTideHit: () => void;
  onTideFail: () => void;
  onAnswerTideMiss: (missed: number) => void;
  onAnswerTideComplete: (allDone: boolean) => void;
  onIdolFail: () => void;
  onAnswerIdolMiss: (missed: number) => void;
  onAnswerIdolComplete: (allDone: boolean) => void;
  onArmIdolBuzz: () => void;
  onFailIdolBuzz: () => void;
  onSetIdolBuzzHoldMode: (mode: IdolBuzzHoldMode) => void;
  onSunnaPrepStep: (step: SunnaPrepStep) => void;
  sunnaBuzzHoldMode: IdolBuzzHoldMode;
  onSunnaBuzzHoldMode: (mode: IdolBuzzHoldMode) => void;
};

export type SessionQuestContractBundle = {
  onAcceptQuest: () => void;
  onDeclineQuest: () => void;
  onReportQuest: (success: boolean) => void;
  questMediaLoading?: boolean;
  questCacheReady?: boolean;
  contractEatRestyle?: {
    promptLabelRu: string;
    okButtonLabelRu: string;
  } | null;
  contractProgressFlash?: ContractProgressFlash | null;
  contractQuestRestyle?: ContractQuestRestyle | null;
};

export type SessionMetaBundle = {
  cindersBalance: number;
  sessionActiveBuffs?: { begBonus: number; cumBoost: number };
  cinderGain?: { key: number; amount: number; source: "quest" | "session" } | null;
  punishNotice?: string | null;
  onExport: () => void;
};

export type SessionPageProps = {
  state: SessionState | null;
  currentBlock: Block | undefined;
  currentFn: FunctionDef | undefined;
  currentPat: BeatPatternDef | undefined;
  pulse: number;
  lastAccent: number;
  vibeHud: VibeHudState | null;
  vibeHudDevice?: VibeHudDeviceInfo | null;
  avatarSnap: AvatarSnapshot | null;
  preflight: Preflight;
  warmupPreview: SessionWarmupPreview;
  media: SessionMediaBundle;
  voiceAudio: SessionVoiceAudioBundle;
  controls: SessionControlsBundle;
  tideIdol: SessionTideIdolBundle;
  questContract: SessionQuestContractBundle;
  meta: SessionMetaBundle;
};
