import { useEffect, useMemo, useRef, useState } from "react";
import { AvatarStub } from "../components/AvatarStub";
import { BeatBar } from "../components/BeatBar";
import { FinaleRoulette } from "../components/FinaleRoulette";
import { ChoiceRoulette } from "../components/ChoiceRoulette";
import { GripHud } from "../components/GripHud";
import { InstructionPanel } from "../components/InstructionPanel";
import { MoveAnnounce } from "../components/MoveAnnounce";
import { MediaCachePanel } from "../components/MediaCachePanel";
import { SessionQueuePanel } from "../components/SessionQueuePanel";
import { SessionBlockLab } from "../components/session/SessionBlockLab";
import {
  MediaStage,
  unlockMediaStageAudio,
  type MediaLoadStatus,
} from "../components/MediaStage";
import { MistressImg } from "../components/MistressImg";
import { PatternBanner } from "../components/PatternBanner";
import { QuestActiveHud } from "../components/QuestActiveHud";
import { QuestStack } from "../components/QuestStack";
import { SessionCindersBribeButton } from "../components/session/SessionCindersBribeButton";
import { SessionCumplayDock } from "../components/session/SessionCumplayDock";
import { SessionShopStrip } from "../components/session/SessionShopStrip";
import { SessionToolbar } from "../components/session/SessionToolbar";
import { SessionUnauthorizedFab } from "../components/session/SessionUnauthorizedFab";
import { SessionFxOverlay } from "../components/SessionFxOverlay";
import { TideHitLevelMeter } from "../components/TideHitMeter";
import { TideHitVerifyToggle } from "../components/TideHitVerifyToggle";
import { TypewriterText } from "../components/TypewriterText";
import { VibeHud } from "../components/VibeHud";
import { getFunction, getToy } from "../lib/catalog";
import { BREATH_MODE_META } from "../lib/breathHold";
import { buildInstructionCard } from "../lib/instructions";
import { gripFromIntensity } from "../lib/grip";
import { MODE_LABELS } from "../lib/labels";
import { isMercyFadeEffect, promptKindLabelRu } from "../lib/mistressPrompts";
import {
  SUNNA_PREP_STEPS,
  sunnaPrepComplete,
} from "../lib/preflight";
import { statusRu } from "../lib/sessionRuntime";
import { isQuestBlockId } from "../lib/quests";
import {
  idolBuzzArmLabelRu,
  idolBuzzArmSubRu,
  idolBuzzFailLabelRu,
  idolBuzzFailSubRu,
  idolChorusCompleteNoLabelRu,
  idolChorusCompleteNoSubRu,
  idolChorusCompleteYesLabelRu,
  idolChorusCompleteYesSubRu,
  idolChorusCounterLabelRu,
  idolChorusFailButtonLabelRu,
  idolChorusFailButtonSubRu,
  idolChorusMissAskLabelRu,
  idolChorusMissCap,
  idolChorusProgressHintRu,
  isIdolChorusFunction,
} from "../lib/idolHits";
import {
  tideCompleteNoLabelRu,
  tideCompleteNoSubRu,
  tideCompleteYesLabelRu,
  tideCompleteYesSubRu,
  tideFailButtonLabelRu,
  tideFailButtonSubRu,
  tideHitCounterLabelRu,
  tideHitProgressHintRu,
  tideMissAskLabelRu,
  tideMissCap,
} from "../lib/tideHits";
import {
  loadTideHitVerifySettings,
  saveTideHitVerifySettings,
  type TideHitVerifySettings,
} from "../lib/tideHitVerify";
import {
  startTideHitMic,
  tideHitMicStatusRu,
  type TideHitMicHandle,
  type TideHitMicStatus,
} from "../lib/tideHitMic";
import { BEAT_BLOCK_GAP_MS } from "../lib/beatTiming";
import { getActiveMistress } from "../lib/mistress";
import { getActiveSaveSlot } from "../lib/saveSlots";
import { getActiveMoodLines } from "../lib/voice/moodLines";
import {
  playUiClick,
  playUiConfirm,
  playUiDeny,
  primeUiAudio,
} from "../lib/uiSound";
import type { ActiveMistressPrompt } from "../lib/types";
import type {
  SessionPageProps,
  SessionSpeechItem,
} from "./session/sessionPageProps";

export type { SessionPageProps } from "./session/sessionPageProps";
export type SessionSpeech = SessionSpeechItem;

/** Soft answers fade over this window, then vanish. */
const MERCY_FADE_MS = 9_000;

function useMercyFade(promptKey: string | null): {
  opacity: number;
  gone: boolean;
} {
  const [opacity, setOpacity] = useState(1);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    if (!promptKey) {
      setOpacity(1);
      setGone(false);
      return;
    }
    setOpacity(1);
    setGone(false);
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / MERCY_FADE_MS);
      setOpacity(1 - t);
      if (t >= 1) {
        setGone(true);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [promptKey]);

  return { opacity, gone };
}

function MistressPromptOptions({
  prompt,
  onAnswer,
  cindersBalance,
  onBribe,
}: {
  prompt: ActiveMistressPrompt;
  onAnswer: (optionId: string) => void;
  cindersBalance: number;
  onBribe: () => void;
}) {
  const { opacity, gone } = useMercyFade(prompt.id);
  // Equip / loyalty / mood offer need time — never fade their buttons
  const noMercyFade =
    prompt.kind === "equip" ||
    prompt.kind === "loyalty" ||
    prompt.kind === "mood_offer";
  return (
    <div className="confirm-dock__prompt-opts">
      {prompt.options.map((opt) => {
        const soft = !noMercyFade && isMercyFadeEffect(opt.effect);
        if (soft && gone) return null;
        return (
          <button
            key={opt.id}
            type="button"
            className={`confirm-dock__btn confirm-dock__btn--prompt confirm-dock__btn--${opt.effect}${
              soft ? " is-mercy-fade" : ""
            }`}
            style={soft ? { opacity: Math.max(0, opacity) } : undefined}
            disabled={soft && opacity < 0.12}
            onClick={() => onAnswer(opt.id)}
          >
            {opt.labelRu}
          </button>
        );
      })}
      <SessionCindersBribeButton
        cindersBalance={cindersBalance}
        onBribe={onBribe}
      />
    </div>
  );
}

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function mediaKindLabelRu(kind: MediaLoadStatus["kind"]): string {
  switch (kind) {
    case "video":
      return "видео";
    case "gif":
      return "gif";
    case "image":
      return "фото";
    case null:
      return "";
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

export function SessionPage({
  state,
  planQueue,
  currentBlock,
  currentFn,
  currentPat,
  pulse,
  lastAccent,
  lastBeat = null,
  vibeHud,
  vibeHudDevice = null,
  avatarSnap,
  preflight,
  warmupPreview,
  media,
  voiceAudio,
  controls,
  tideIdol,
  questContract,
  meta,
}: SessionPageProps) {
  const {
    mediaItems,
    mediaDeckKey = "main",
    mediaStartIndex = 0,
    slideSec,
    currentMedia,
    mediaFavorited,
    favoriteBusy,
    favoriteError,
    playlistPreload,
    onCurrentMediaChange,
    onSlideLeave,
    onDeckProgress,
    onToggleFavorite,
  } = media;

  const {
    speechQueue,
    voiceMode,
    voiceActivity,
    voiceModel,
    ttsEnabled,
    onTtsEnabled,
    ttsVolume,
    onTtsVolume,
    videoVolume,
    onVideoVolume,
    sfxVolume,
    onSfxVolume,
    muted,
    onMuted,
  } = voiceAudio;

  const {
    onStart,
    onReady,
    onPause,
    onResume,
    onAbort,
    onConfirmEdge,
    onConfirmRuin,
    onConfirmFinaleEdge,
    onFinaleSpinDone,
    onFinaleComplete,
    onChoiceSpinDone,
    onSkip,
    onDropUpcoming,
    onMoveUpcoming,
    onInsertRestAfter,
    onStartLabBlock,
    onAppendLabBlock,
    onForceLabQuest,
    onForceFinale,
    onAnswerPrompt,
    onReportDare,
    onReportBreath,
    onAnswerPromise,
    onAnswerCumplay,
    onBribeMistress,
    onUnauthorizedEdge,
    onUnauthorizedRuin,
    onUnauthorizedCum,
  } = controls;

  const {
    onTideHit,
    onTideFail,
    onAnswerTideMiss,
    onAnswerTideComplete,
    onIdolFail,
    onAnswerIdolMiss,
    onAnswerIdolComplete,
    onArmIdolBuzz,
    onFailIdolBuzz,
    onSetIdolBuzzHoldMode,
    onSunnaPrepStep,
    sunnaBuzzHoldMode,
    onSunnaBuzzHoldMode,
  } = tideIdol;

  const {
    onAcceptQuest,
    onDeclineQuest,
    onReportQuest,
    questMediaLoading = false,
    questCacheReady = false,
    contractEatRestyle = null,
    contractProgressFlash = null,
    contractQuestRestyle = null,
  } = questContract;

  const {
    cindersBalance,
    sessionActiveBuffs = { begBonus: 0, cumBoost: 0 },
    cinderGain = null,
    punishNotice = null,
    onExport,
  } = meta;

  const status = state?.status ?? "idle";
  const inPreflight = preflight != null;
  const busy = status === "running" || status === "paused";
  const showShopStrip = busy || inPreflight || Boolean(cinderGain);
  const promptPhase = state?.promptPhase ?? null;
  const activePrompt = state?.activePrompt ?? null;
  const activeTask = state?.activeTask ?? null;
  const promptAwait = promptPhase === "await" && activePrompt;
  const choiceRoulette = state?.choiceRoulette ?? null;
  const choiceSpinning = promptPhase === "choice_spinning" && choiceRoulette;
  const taskActive =
    (promptPhase === "task_running" || promptPhase === "task_report") &&
    activeTask;
  const promisePending = promptPhase === "promise_pending";
  const tideMissPending = promptPhase === "tide_miss_pending";
  const tideCompletePending = promptPhase === "tide_complete_pending";
  const idolMissPending = promptPhase === "idol_miss_pending";
  const idolCompletePending = promptPhase === "idol_complete_pending";
  const [tideMissInput, setTideMissInput] = useState("0");
  const [idolMissInput, setIdolMissInput] = useState("0");
  const cumplayRitual = state?.cumplayRitual ?? null;
  const cumplayActive =
    promptPhase === "cumplay_ritual" &&
    cumplayRitual != null &&
    !cumplayRitual.done;
  const cumplayStep = cumplayActive
    ? cumplayRitual.steps[cumplayRitual.stepIndex] ?? null
    : null;
  const sessionCumplayActive =
    cumplayActive &&
    (cumplayRitual?.context === "mid" ||
      cumplayRitual?.context === "unauthorized" ||
      cumplayRitual?.context === "precum");
  const finaleCumplayActive =
    cumplayActive && cumplayRitual?.context === "finale";

  const activeQuest = state?.activeQuest ?? null;
  const questLive =
    Boolean(activeQuest) &&
    busy &&
    !inPreflight &&
    isQuestBlockId(currentBlock?.id);

  const sessionCumplayTag = (() => {
    const ctx = cumplayRitual?.context;
    if (ctx === "unauthorized") return "Без команды";
    if (ctx === "precum") return "Precum";
    if (ctx === "mid") return "Руин";
    return "Cumplay";
  })();

  const [taskLeftSec, setTaskLeftSec] = useState(0);
  const [mediaLoad, setMediaLoad] = useState<MediaLoadStatus>({
    kind: null,
    percent: null,
    phase: "idle",
  });
  const [mediaAutoplay, setMediaAutoplay] = useState(() => {
    try {
      const raw = localStorage.getItem("joi-media-autoplay");
      if (raw === null) return true;
      return raw === "1" || raw === "true";
    } catch {
      return true;
    }
  });
  const [contentAutoplay, setContentAutoplay] = useState(() => {
    try {
      const raw = localStorage.getItem("joi-content-autoplay");
      if (raw === null) return false;
      return raw === "1" || raw === "true";
    } catch {
      return false;
    }
  });

  function setMediaAutoplayPersist(next: boolean) {
    setMediaAutoplay(next);
    try {
      localStorage.setItem("joi-media-autoplay", next ? "1" : "0");
    } catch {
      /* ignore */
    }
    if (next) unlockMediaStageAudio();
  }

  function setContentAutoplayPersist(next: boolean) {
    setContentAutoplay(next);
    try {
      localStorage.setItem("joi-content-autoplay", next ? "1" : "0");
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    if (!activeTask || promptPhase !== "task_running") {
      setTaskLeftSec(0);
      return;
    }
    const tick = () => {
      const left = Math.max(
        0,
        Math.ceil((activeTask.endsAtPerf - performance.now()) / 1000),
      );
      setTaskLeftSec(left);
    };
    tick();
    const id = window.setInterval(tick, 200);
    return () => window.clearInterval(id);
  }, [activeTask, promptPhase]);

  const promptGate =
    Boolean(promptAwait) ||
    Boolean(taskActive) ||
    promisePending ||
    cumplayActive ||
    tideMissPending ||
    tideCompletePending ||
    idolMissPending ||
    idolCompletePending;

  const mood = state?.mood;
  const moodLabel =
    mood != null ? (getActiveMoodLines().moods[mood]?.labelRu ?? mood) : null;
  const equippedLabels = (state?.equippedToyIds ?? [])
    .map((id) => getToy(id)?.nameRu ?? id)
    .filter(Boolean);
  const bpm = currentBlock?.bpm ?? warmupPreview.bpm;
  const grip = gripFromIntensity(currentFn?.intensity ?? 3);
  const isVibeDrive =
    currentBlock?.drive === "vibe" || currentFn?.drive === "vibe";
  const isFinale =
    currentBlock?.goal === "finale" &&
    (status === "running" || status === "paused") &&
    Boolean(state?.finalePhase);
  const finalePhase = state?.finalePhase ?? null;
  const highwaySilent =
    !currentBlock ||
    currentBlock.goal === "rest" ||
    currentBlock.goal === "finale" ||
    !currentPat ||
    inPreflight ||
    Boolean(promptGate) ||
    (currentBlock.goal === "breath" &&
      (state?.breathPhase !== "holding" ||
        currentBlock.breathMode === "still" ||
        currentBlock.breathMode === "hold_edge")) ||
    currentBlock.drive === "vibe";

  const patternLabel =
    currentPat?.steps?.join("-") ?? currentPat?.nameRu ?? "—";
  const timeLabel = formatTime(state?.blockElapsedSec ?? 0);
  const nextBlock = state?.queue[(state?.index ?? 0) + 1];
  const nextLabel = nextBlock
    ? `далее · ${getFunction(nextBlock.functionId)?.nameRu ?? nextBlock.functionId}`
    : null;
  const beatHandoffDelayMs =
    busy && !highwaySilent && (state?.index ?? 0) > 0 ? BEAT_BLOCK_GAP_MS : 0;
  const beatOriginPerf = state?.beatOriginPerf ?? null;
  const beatUntilAtMs = state?.beatUntilAtMs ?? null;

  const canConfirmEdge =
    status === "running" &&
    !inPreflight &&
    !promptGate &&
    (currentBlock?.goal === "edge" ||
      (currentBlock?.goal === "breath" &&
        state?.breathPhase === "holding" &&
        currentBlock.breathMode === "edge_race"));
  const holdArmed = Boolean(state?.holdArmed);
  const canConfirmHold =
    status === "running" &&
    !inPreflight &&
    !promptGate &&
    currentBlock?.goal === "hold" &&
    (!holdArmed ||
      (state?.blockElapsedSec ?? 0) >= (currentBlock?.durationSec ?? 0));
  const holdLeftSec =
    currentBlock?.goal === "hold" && currentBlock && holdArmed
      ? Math.max(0, currentBlock.durationSec - (state?.blockElapsedSec ?? 0))
      : null;
  const [holdGraceLeft, setHoldGraceLeft] = useState<number | null>(null);
  useEffect(() => {
    if (holdArmed || currentBlock?.goal !== "hold") {
      setHoldGraceLeft(null);
      return;
    }
    const until = state?.holdGraceUntilPerf;
    if (until == null) {
      setHoldGraceLeft(null);
      return;
    }
    const tick = () => {
      setHoldGraceLeft(Math.max(0, Math.ceil((until - performance.now()) / 1000)));
    };
    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [holdArmed, currentBlock?.goal, state?.holdGraceUntilPerf]);
  const canConfirmRuin =
    status === "running" &&
    !inPreflight &&
    !promptGate &&
    currentBlock?.goal === "ruin_attempt";

  const begCredits = state?.begCredits ?? 0;
  const begsUsed = state?.begsUsed ?? 0;
  const instruction = useMemo(() => {
    // Don't preview the first queue block (often "rest") before the session runs
    if (status !== "running" && status !== "paused") return null;
    if (inPreflight) return null;
    if (!currentFn || !currentPat || !currentBlock) return null;
    return buildInstructionCard(currentFn, currentPat, currentBlock.goal, {
      blockElapsedSec: state?.blockElapsedSec,
      blockDurationSec: currentBlock.durationSec,
      modifiers: currentBlock.modifiers,
      holdArmed: state?.holdArmed,
      mode: state?.params.mode,
    });
  }, [
    status,
    inPreflight,
    currentFn,
    currentPat,
    currentBlock,
    state?.blockElapsedSec,
    state?.holdArmed,
    state?.params.mode,
  ]);

  const sessionLive =
    (status === "running" || status === "paused") && !inPreflight;

  const restLeft =
    sessionLive && currentBlock?.goal === "rest" && currentBlock
      ? Math.max(0, currentBlock.durationSec - (state?.blockElapsedSec ?? 0))
      : null;
  const breathPrepLeft =
    sessionLive &&
    currentBlock?.goal === "breath" &&
    state?.breathPhase === "prep"
      ? Math.max(
          0,
          (currentBlock.breathPrepSec ?? 4) -
            (state?.blockElapsedSec ?? 0),
        )
      : null;
  const breathHolding =
    sessionLive &&
    currentBlock?.goal === "breath" &&
    state?.breathPhase === "holding";
  const breathMode = currentBlock?.breathMode ?? "still";
  const breathLeft =
    breathHolding && currentBlock
      ? Math.max(
          0,
          currentBlock.durationSec - (state?.blockElapsedSec ?? 0),
        )
      : null;
  const breathTarget = currentBlock?.breathTargetCount ?? 0;

  const tideTarget = state?.tideTarget ?? 0;
  const tideHits = state?.tideHits ?? 0;
  const tideMissMax = tideMissCap(tideTarget, tideHits);
  const showTideHitDock =
    status === "running" &&
    !inPreflight &&
    !promptGate &&
    !questLive &&
    tideTarget > 0 &&
    currentBlock?.goal === "stroke" &&
    !canConfirmEdge &&
    !canConfirmHold &&
    !canConfirmRuin &&
    !breathHolding;

  const [tideVerify, setTideVerify] = useState<TideHitVerifySettings>(() =>
    loadTideHitVerifySettings(),
  );
  const [tideMicDb, setTideMicDb] = useState(-80);
  const [tideMicStatus, setTideMicStatus] = useState<TideHitMicStatus>("idle");
  const [tideMicDetail, setTideMicDetail] = useState<string | undefined>();
  const [tideMicFlash, setTideMicFlash] = useState(false);
  const tideMicRef = useRef<TideHitMicHandle | null>(null);
  const onTideHitRef = useRef(onTideHit);
  onTideHitRef.current = onTideHit;
  const tideMicEnabled = showTideHitDock && tideVerify.mode === "mic";

  useEffect(() => {
    if (!tideMicEnabled) {
      if (tideMicRef.current) {
        tideMicRef.current.stop();
        tideMicRef.current = null;
        setTideMicStatus("idle");
        setTideMicDetail(undefined);
        setTideMicDb(-80);
      }
      return;
    }
    const handle = startTideHitMic({
      thresholdDb: tideVerify.thresholdDb,
      onHit: () => {
        setTideMicFlash(true);
        window.setTimeout(() => setTideMicFlash(false), 180);
        onTideHitRef.current();
      },
      onLevel: setTideMicDb,
      onStatus: (status, detail) => {
        setTideMicStatus(status);
        setTideMicDetail(detail);
      },
    });
    tideMicRef.current = handle;
    return () => {
      handle.stop();
      if (tideMicRef.current === handle) tideMicRef.current = null;
    };
  }, [tideMicEnabled]);

  useEffect(() => {
    tideMicRef.current?.setThresholdDb(tideVerify.thresholdDb);
  }, [tideVerify.thresholdDb]);

  const idolTarget = state?.idolTarget ?? 0;
  const idolHits = state?.idolHits ?? 0;
  const idolMissMax = idolChorusMissCap(idolTarget, idolHits);
  const showIdolChorusDock =
    status === "running" &&
    !inPreflight &&
    !promptGate &&
    !questLive &&
    idolTarget > 0 &&
    isIdolChorusFunction(currentFn?.id) &&
    !canConfirmEdge &&
    !canConfirmHold &&
    !canConfirmRuin &&
    !breathHolding;

  const idolBuzzPhase = state?.idolBuzzPhase ?? null;
  const idolBuzzTarget = state?.idolBuzzTargetSec ?? 0;
  const idolBuzzElapsed = state?.idolBuzzElapsedSec ?? 0;
  const idolBuzzMode = state?.idolBuzzHoldMode ?? sunnaBuzzHoldMode;
  const showIdolBuzzDock =
    status === "running" &&
    !inPreflight &&
    !promptGate &&
    !questLive &&
    (idolBuzzPhase === "arm" || idolBuzzPhase === "holding") &&
    !canConfirmEdge &&
    !canConfirmHold &&
    !canConfirmRuin &&
    !breathHolding &&
    !showIdolChorusDock;

  const sunnaPrepDone =
    preflight?.kind === "sunna_prep" ? preflight.done : [];
  const sunnaPrepReady =
    preflight?.kind === "sunna_prep" && sunnaPrepComplete(sunnaPrepDone);

  useEffect(() => {
    if (tideMissPending) {
      setTideMissInput("0");
    }
  }, [tideMissPending, state?.index]);

  useEffect(() => {
    if (idolMissPending) {
      setIdolMissInput("0");
    }
  }, [idolMissPending, state?.index]);

  const sandboxSlot = getActiveSaveSlot() === "sandbox";

  return (
    <div className={`session${questLive ? " session--quest" : ""}`}>
      <div className="session__stage">
        <SessionFxOverlay
          active={sessionLive || sandboxSlot}
          previewUser={sandboxSlot}
          mood={mood ?? "sweet"}
        />
        <MediaStage
          key={mediaDeckKey}
          items={mediaItems}
          slideSec={slideSec}
          initialIndex={
            mediaDeckKey.startsWith("main") ? mediaStartIndex : 0
          }
          videoVolume={videoVolume}
          running={
            preflight?.kind === "warmup" ||
            preflight?.kind === "sunna_prep" ||
            status === "idle" ||
            status === "ended" ||
            (status === "running" && !inPreflight)
          }
          autoplay={mediaAutoplay}
          slideAutoplay={contentAutoplay}
          onCurrentChange={onCurrentMediaChange}
          onLoadStatusChange={setMediaLoad}
          onSlideLeave={onSlideLeave}
          onDeckProgress={onDeckProgress}
        />

        <InstructionPanel
          card={
            preflight?.kind === "sunna_prep"
              ? {
                  goalRu: "Prep · Idol Soft",
                  titleRu: "Перед репетицией",
                  summaryRu:
                    "Клетка → яички → вибраторы. Руки только на игрушках — ствол не гладить. Без чеклиста «Готов» не откроется.",
                  stepsRu: SUNNA_PREP_STEPS.map((s) =>
                    sunnaPrepDone.includes(s.id)
                      ? `✓ ${s.labelRu}`
                      : s.labelRu,
                  ),
                  patternTitleRu: "Режим удержания buzz",
                  patternBodyRu:
                    sunnaBuzzHoldMode === "clipped"
                      ? "Hands-free: игрушка закреплена на клетке, руки прочь."
                      : "Руки на игрушке: держишь wand / вибропулю у клетки / клитора.",
                }
              : preflight?.kind === "warmup"
                ? {
                    goalRu: "Разогрев",
                    titleRu: "Боевая готовность",
                    summaryRu:
                      "Смотри контент, приведи себя в тонус. Битов пока нет — когда будешь готов, жми большую кнопку «Готов» над ритм-полосой.",
                    stepsRu: [
                      "Смазка и игрушки под рукой",
                      "Удобная поза, ничего не мешает",
                      "Можно слегка разогреться — без эджа и без финала",
                      `Режим: ${MODE_LABELS[warmupPreview.mode].nameRu}`,
                      `Дальше будет: ${warmupPreview.functionName} · ${warmupPreview.patternName} · ${warmupPreview.bpm} BPM`,
                    ],
                    patternTitleRu: "Пока без бита",
                    patternBodyRu:
                      "Метроном и шарики стартуют только после «Готов».",
                  }
                : instruction
          }
        />

        {!instruction &&
        preflight?.kind !== "warmup" &&
        preflight?.kind !== "sunna_prep" ? (
          <div className="session__hud-top session__hud-top--compact">
            <p className="session__how">Нажми Play, чтобы начать.</p>
          </div>
        ) : null}

        {speechQueue.length > 0 ? (
          <div
            className={`session__speech-stack${promptGate ? " is-lifted" : ""}`}
            aria-live="polite"
          >
            {speechQueue.map((line, index) => {
              const isLatest = index === speechQueue.length - 1;
              return (
                <div
                  key={line.id}
                  className={[
                    "session__speech",
                    line.source === "llm"
                      ? "session__speech--llm"
                      : "session__speech--template",
                    line.translating ? "session__speech--thinking" : "",
                    isLatest ? "is-latest" : "is-older",
                    line.fadingOut ? "is-fading" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <div className="session__speech-face" aria-hidden>
                    <MistressImg
                      className="session__speech-face-img"
                      src={
                        getActiveMistress().assets.moodPortrait[mood ?? "sweet"]
                          .src
                      }
                      alt=""
                    />
                  </div>
                  <div className="session__speech-copy">
                    <span className="session__speech-tag">
                      {line.translating
                        ? `${getActiveMistress().displayNameRu} · Google…`
                        : line.source === "llm"
                          ? `${getActiveMistress().displayNameRu} · LLM`
                          : voiceMode === "llm"
                            ? `${getActiveMistress().displayNameRu} · шаблон`
                            : getActiveMistress().displayNameRu}
                    </span>
                    <span className="session__speech-body">
                      {line.translating && !line.text ? (
                        <span className="session__speech-pending" aria-hidden>
                          ···
                        </span>
                      ) : isLatest && line.typewriter && line.text ? (
                        <TypewriterText text={line.text} charMs={26} />
                      ) : (
                        line.text
                      )}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}

        <div className="session__hud-right">
          <div className="session__hud-right__row">
            <SessionQueuePanel
              queue={state?.queue ?? []}
              index={state?.index ?? 0}
              editable={
                busy && !inPreflight && getActiveSaveSlot() === "sandbox"
              }
              onDropUpcoming={onDropUpcoming}
              onMoveUpcoming={onMoveUpcoming}
              onInsertRestAfter={onInsertRestAfter}
            />
            {getActiveSaveSlot() === "sandbox" && onStartLabBlock ? (
              <SessionBlockLab
                state={state}
                currentBlock={currentBlock}
                currentPat={currentPat}
                inPreflight={inPreflight}
                promptGate={promptGate || Boolean(choiceSpinning)}
                lastBeat={lastBeat}
                planQueue={planQueue}
                onStartLabBlock={onStartLabBlock}
                onAppendLabBlock={onAppendLabBlock}
                onForceLabQuest={onForceLabQuest}
                onPause={onPause}
                onResume={onResume}
                onSkip={onSkip}
                onAbort={onAbort}
              />
            ) : null}
            {mediaLoad.kind ? (
              <div
                className={`session__media-chip session__media-chip--${mediaLoad.kind}${
                  mediaLoad.phase === "loading"
                    ? " is-loading"
                    : mediaLoad.phase === "error"
                      ? " is-error"
                      : ""
                }`}
                title={
                  mediaLoad.phase === "loading"
                    ? "Загрузка медиа"
                    : mediaLoad.phase === "error"
                      ? "Ошибка загрузки"
                      : "Тип текущего кадра"
                }
              >
                <span className="session__media-chip__kind">
                  {mediaKindLabelRu(mediaLoad.kind)}
                </span>
                {mediaLoad.phase === "loading" ? (
                  <span className="session__media-chip__pct">
                    {mediaLoad.percent != null
                      ? `${mediaLoad.percent}%`
                      : "…"}
                  </span>
                ) : null}
              </div>
            ) : null}
            <MediaCachePanel playlistPreload={playlistPreload} />
            {moodLabel && busy ? (
              <div
                className={`session__mood-chip session__mood-chip--${mood}`}
                title={`Настроение · score ${state?.moodScore ?? 0}`}
              >
                {moodLabel}
              </div>
            ) : null}
            <div
              className={`session__voice-chip session__voice-chip--${voiceMode === "llm" ? voiceActivity.phase : "template"}${
                voiceMode === "llm" && voiceActivity.phase === "thinking"
                  ? " session__voice-chip--gen"
                  : ""
              }`}
              title={
                voiceMode === "llm"
                  ? voiceActivity.detail
                    ? `${voiceModel} · ${voiceActivity.detail}`
                    : voiceModel
                  : "Mood templates"
              }
              aria-live="polite"
            >
              {voiceMode !== "llm"
                ? "templates"
                : voiceActivity.phase === "thinking"
                  ? `генерирую · ${voiceModel}`
                  : voiceActivity.phase === "llm"
                    ? "llm"
                    : voiceActivity.phase === "fallback"
                      ? "llm → template"
                      : voiceActivity.phase === "error"
                        ? "llm err"
                        : "llm"}
            </div>
          </div>

          {equippedLabels.length > 0 && busy ? (
            <div
              className="session__loadout-chip"
              title="Сейчас на тебе — следующие ходы учитывают это"
            >
              <span className="session__loadout-chip__tag">На тебе</span>
              {equippedLabels.join(" · ")}
            </div>
          ) : null}

          {busy && !inPreflight ? (
            <div
              className="session__loadout-chip"
              title="Очки умоляний о разрешении кончить"
            >
              <span className="session__loadout-chip__tag">Beg</span>
              {begCredits} ост. · {begsUsed} исп.
            </div>
          ) : null}

          <AvatarStub snap={avatarSnap} />

          {busy ? (
            <QuestStack
              offer={state?.questOffer}
              pending={state?.pendingQuest}
              active={state?.activeQuest}
              onAccept={onAcceptQuest}
              onDecline={onDeclineQuest}
              onDone={() => onReportQuest(true)}
              onFail={() => onReportQuest(false)}
              rewardFlash={
                cinderGain?.source === "quest" ? cinderGain : null
              }
              contractFlash={contractProgressFlash}
              contractQuestRestyle={contractQuestRestyle}
              mediaLoading={questMediaLoading}
              cacheReady={questCacheReady}
            />
          ) : null}
        </div>

        {preflight?.kind === "countdown" ? (
          <div className="countdown" aria-live="assertive">
            <div className="countdown__num">{preflight.n}</div>
            <div className="countdown__hint">Сейчас разогрев на контенте</div>
          </div>
        ) : null}

        {questLive && activeQuest ? (
          <QuestActiveHud
            quest={activeQuest}
            pulse={pulse}
            mediaLoading={questMediaLoading}
            onTargetReached={() => onReportQuest(true)}
          />
        ) : null}

        {restLeft != null && !questLive ? (
          <div className="rest-overlay" aria-live="polite">
            <div className="rest-overlay__label">Отдых</div>
            <div className="rest-overlay__time">{restLeft}</div>
            <div className="rest-overlay__sub">
              {getActiveMistress().id === "sunna"
                ? "секунды · гладь яички · клитор не трогай"
                : "секунды · руки прочь"}
            </div>
          </div>
        ) : null}

        {state?.timerTease ? (
          <div className="rest-overlay" aria-live="assertive">
            <div className="rest-overlay__label">
              {getActiveMistress().displayNameRu} ставит таймер на паузу…
            </div>
          </div>
        ) : null}

        {breathPrepLeft != null && !promptGate ? (
          <div className="rest-overlay rest-overlay--hold" aria-live="assertive">
            <div className="rest-overlay__label">Набери воздух</div>
            <div className="rest-overlay__time">{breathPrepLeft}</div>
          </div>
        ) : null}

        {breathHolding && breathLeft != null && !promptGate ? (
          <div className="rest-overlay rest-overlay--hold" aria-live="polite">
            <div className="rest-overlay__label">
              {BREATH_MODE_META[breathMode].nameRu}
            </div>
            <div className="rest-overlay__time">
              {breathMode === "stroke_beats"
                ? `${state?.breathProgress ?? 0}/${breathTarget}`
                : breathMode === "stroke_count"
                  ? breathTarget
                  : breathLeft}
            </div>
            <div className="rest-overlay__sub">
              {BREATH_MODE_META[breathMode].hintRu}
            </div>
          </div>
        ) : null}

        {holdLeftSec != null &&
        holdLeftSec > 0 &&
        sessionLive &&
        !promptGate ? (
          <div className="rest-overlay rest-overlay--hold" aria-live="polite">
            <div className="rest-overlay__label">Удерживай грань</div>
            <div className="rest-overlay__time">{holdLeftSec}</div>
            <div className="rest-overlay__sub">не кончай · потом подтверди</div>
          </div>
        ) : null}

        {currentBlock?.goal === "hold" &&
        sessionLive &&
        !holdArmed &&
        !promptGate ? (
          <div className="rest-overlay rest-overlay--hold" aria-live="polite">
            <div className="rest-overlay__label">Дойди до грани</div>
            {holdGraceLeft != null ? (
              <div className="rest-overlay__time">{holdGraceLeft}</div>
            ) : null}
            <div className="rest-overlay__sub">
              {holdGraceLeft != null && holdGraceLeft > 0
                ? "секунды на выход к эджу · потом «Держу грань ✓»"
                : "жми «Держу грань ✓», когда на грани — таймер удержания"}
            </div>
          </div>
        ) : null}

        <div className="session__fab">
          {((status === "idle" || status === "ended") && !inPreflight) ? (
            <button
              type="button"
              className="fab fab--play"
              title="Старт"
              onClick={() => {
                void primeUiAudio();
                playUiConfirm();
                unlockMediaStageAudio();
                onStart();
              }}
            >
              <span className="fab__glyph fab__glyph--play">▶</span>
              <span className="fab__tag">
                <span className="fab__letter">P</span>
                <span className="fab__rest">lay</span>
              </span>
            </button>
          ) : null}

          {currentMedia &&
          (currentMedia.source === "gelbooru" ||
            currentMedia.source === "favorites") ? (
            <button
              type="button"
              className={[
                "fab",
                "fab--heart",
                mediaFavorited ? "is-loved" : "",
                favoriteBusy ? "is-busy" : "",
                favoriteError ? "is-error" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              title={
                favoriteError
                  ? favoriteError
                  : mediaFavorited
                    ? "Убрать из избранного"
                    : "В избранное (скачать локально)"
              }
              disabled={favoriteBusy}
              onClick={onToggleFavorite}
            >
              <span className="fab__glyph fab__glyph--heart" aria-hidden>
                <svg viewBox="0 0 24 24" className="fab-heart-svg">
                  <path
                    className="fab-heart-svg__path"
                    d="M12 21s-6.7-4.35-9.33-8.1C.8 10.1 1.1 6.7 3.7 5.05 6.05 3.55 8.85 4.3 12 7.05c3.15-2.75 5.95-3.5 8.3-2 2.6 1.65 2.9 5.05 1.03 7.85C18.7 16.65 12 21 12 21z"
                  />
                </svg>
              </span>
              <span className="fab__tag">
                <span className="fab__letter">L</span>
                <span className="fab__rest">ike</span>
              </span>
            </button>
          ) : null}

          {status === "running" &&
          !inPreflight &&
          finalePhase === "revealed" &&
          state?.finaleOutcome ? (
            <button
              type="button"
              className={`fab fab--finale-done fab--finale-${state.finaleOutcome}`}
              title={
                promisePending || finaleCumplayActive
                  ? "Сначала выполни cumplay / обещание"
                  : "Завершить сессию"
              }
              disabled={
                promisePending ||
                finaleCumplayActive ||
                Boolean(
                  cumplayRitual &&
                    cumplayRitual.context === "finale" &&
                    !cumplayRitual.done &&
                    state.finaleOutcome !== "deny",
                )
              }
              onClick={onFinaleComplete}
            >
              <span className="fab__glyph">✓</span>
              <span className="fab__tag">
                <span className="fab__letter">З</span>
                <span className="fab__rest">авершить</span>
              </span>
            </button>
          ) : null}
          {status === "running" &&
          !inPreflight &&
          finalePhase !== "revealed" ? (
            <button
              type="button"
              className="fab fab--play"
              title="Пауза"
              onClick={() => {
                void primeUiAudio();
                playUiClick();
                onPause();
              }}
            >
              <span className="fab__glyph">❚❚</span>
              <span className="fab__tag">
                <span className="fab__letter">P</span>
                <span className="fab__rest">ause</span>
              </span>
            </button>
          ) : null}
          {status === "paused" && finalePhase !== "revealed" ? (
            <button
              type="button"
              className="fab fab--play"
              title="Продолжить"
              onClick={() => {
                void primeUiAudio();
                playUiConfirm();
                onResume();
              }}
            >
              <span className="fab__glyph fab__glyph--play">▶</span>
              <span className="fab__tag">
                <span className="fab__letter">P</span>
                <span className="fab__rest">lay</span>
              </span>
            </button>
          ) : null}

          {sessionLive ? (
            <SessionUnauthorizedFab
              disabled={status !== "running" || inPreflight || promptGate}
              bpm={bpm}
              statusLabel={statusRu(status)}
              onUnauthorizedEdge={onUnauthorizedEdge}
              onUnauthorizedRuin={onUnauthorizedRuin}
              onUnauthorizedCum={onUnauthorizedCum}
            />
          ) : null}

          {showShopStrip ? (
            <SessionShopStrip
              cindersBalance={cindersBalance}
              begBonus={sessionActiveBuffs.begBonus}
              cumBoost={sessionActiveBuffs.cumBoost}
              cinderGain={cinderGain}
            />
          ) : null}
        </div>

        {sessionLive ? (
          <GripHud grip={grip} bpm={isVibeDrive ? 0 : bpm} />
        ) : null}

        <VibeHud
          state={vibeHud}
          device={vibeHudDevice}
          active={
            (status === "running" || status === "paused") &&
            !inPreflight &&
            isVibeDrive &&
            currentBlock?.goal !== "rest" &&
            currentBlock?.goal !== "finale"
          }
        />

        <PatternBanner
          patternId={isVibeDrive ? undefined : currentPat?.id}
          lastAccent={lastAccent}
          active={status === "running" && !inPreflight && !highwaySilent}
        />

        {isFinale && finalePhase ? (
          <div className="finale-overlay">
            <FinaleRoulette
              key={currentBlock?.id ?? "finale"}
              pCum={state?.params.pCum ?? 0.35}
              pRuin={state?.params.pRuin ?? 0.35}
              phase={finalePhase}
              outcome={state?.finaleOutcome ?? null}
              mood={state?.mood ?? "sweet"}
              onSpinDone={onFinaleSpinDone}
              onComplete={onFinaleComplete}
              completeDisabled={
                promisePending ||
                finaleCumplayActive ||
                Boolean(
                  cumplayRitual &&
                    cumplayRitual.context === "finale" &&
                    !cumplayRitual.done &&
                    state?.finaleOutcome !== "deny",
                )
              }
            />
            {finaleCumplayActive && cumplayStep ? (
              <SessionCumplayDock
                variant="finale"
                tagLabel="Cumplay"
                stepIndex={cumplayRitual!.stepIndex}
                stepCount={cumplayRitual!.steps.length}
                step={cumplayStep}
                contractEatRestyle={contractEatRestyle}
                cindersBalance={cindersBalance}
                onAnswerCumplay={onAnswerCumplay}
                onBribeMistress={onBribeMistress}
              />
            ) : null}
            {promisePending ? (
              <div
                className="confirm-dock confirm-dock--prompt confirm-dock--promise-over"
                role="group"
                aria-label="Обещание"
              >
                <div className="confirm-dock__prompt">
                  <span className="confirm-dock__prompt-tag">Обещание</span>
                  <span className="confirm-dock__prompt-q">
                    {activePrompt?.labelRu ?? "Съешь свою кончу для меня?"}
                  </span>
                </div>
                <div className="confirm-dock__prompt-opts">
                  <button
                    type="button"
                    className="confirm-dock__btn confirm-dock__btn--prompt confirm-dock__btn--promise_done"
                    onClick={() => onAnswerPromise(true)}
                  >
                    Съел
                  </button>
                  <button
                    type="button"
                    className="confirm-dock__btn confirm-dock__btn--prompt confirm-dock__btn--promise_fail"
                    onClick={() => onAnswerPromise(false)}
                  >
                    Не смог
                  </button>
                  <SessionCindersBribeButton
                    cindersBalance={cindersBalance}
                    onBribe={onBribeMistress}
                  />
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {choiceSpinning && choiceRoulette ? (
          <ChoiceRoulette
            key={`choice-${choiceRoulette.targetId}-${choiceRoulette.action}`}
            roulette={choiceRoulette}
            onSpinDone={onChoiceSpinDone}
          />
        ) : null}

        <div className="session__bottom">
          {promptAwait && activePrompt ? (
            <div className="confirm-dock confirm-dock--prompt" role="group" aria-label={`Ответ ${getActiveMistress().displayNameRu}`}>
              <div className="confirm-dock__prompt">
                <span className="confirm-dock__prompt-tag">
                  {promptKindLabelRu(activePrompt.kind)}
                </span>
                <span className="confirm-dock__prompt-q">{activePrompt.labelRu}</span>
              </div>
              <MistressPromptOptions
                prompt={activePrompt}
                onAnswer={onAnswerPrompt}
                cindersBalance={cindersBalance}
                onBribe={onBribeMistress}
              />
            </div>
          ) : null}

          {taskActive && activeTask ? (
            <div
              className="confirm-dock confirm-dock--prompt confirm-dock--dare"
              role="group"
              aria-label={`Задание ${getActiveMistress().displayNameRu}`}
            >
              <div className="confirm-dock__prompt">
                <span className="confirm-dock__prompt-tag">Задание</span>
                <span className="confirm-dock__prompt-q">
                  {activeTask.instructionRu}
                  {activeTask.taskCount
                    ? ` · ${activeTask.taskCount}×`
                    : ""}
                </span>
              </div>
              {promptPhase === "task_running" ? (
                <>
                  <div className="dare-timer" aria-live="polite">
                    {taskLeftSec}
                    <span>сек</span>
                  </div>
                  <div className="confirm-dock__prompt-opts">
                    <button
                      type="button"
                      className="confirm-dock__btn confirm-dock__btn--prompt confirm-dock__btn--dare_fail"
                      onClick={() => onReportDare(false)}
                    >
                      Сдаюсь
                    </button>
                    <SessionCindersBribeButton
                      cindersBalance={cindersBalance}
                      onBribe={onBribeMistress}
                    />
                  </div>
                </>
              ) : (
                <div className="confirm-dock__prompt-opts">
                  <button
                    type="button"
                    className="confirm-dock__btn confirm-dock__btn--prompt confirm-dock__btn--dare_done"
                    onClick={() => onReportDare(true)}
                  >
                    Успел
                  </button>
                  <button
                    type="button"
                    className="confirm-dock__btn confirm-dock__btn--prompt confirm-dock__btn--dare_fail"
                    onClick={() => onReportDare(false)}
                  >
                    Провалил
                  </button>
                  <SessionCindersBribeButton
                    cindersBalance={cindersBalance}
                    onBribe={onBribeMistress}
                  />
                </div>
              )}
            </div>
          ) : null}

          {sessionCumplayActive && cumplayStep ? (
            <SessionCumplayDock
              variant="session"
              tagLabel={sessionCumplayTag}
              stepIndex={cumplayRitual!.stepIndex}
              stepCount={cumplayRitual!.steps.length}
              step={cumplayStep}
              contractEatRestyle={contractEatRestyle}
              cindersBalance={cindersBalance}
              onAnswerCumplay={onAnswerCumplay}
              onBribeMistress={onBribeMistress}
            />
          ) : null}

          {promisePending && !(isFinale && finalePhase) ? (
            <div
              className="confirm-dock confirm-dock--prompt"
              role="group"
              aria-label="Обещание"
            >
              <div className="confirm-dock__prompt">
                <span className="confirm-dock__prompt-tag">Обещание</span>
                <span className="confirm-dock__prompt-q">
                  {activePrompt?.labelRu ?? "Съешь свою кончу для меня?"}
                </span>
              </div>
              <div className="confirm-dock__prompt-opts">
                <button
                  type="button"
                  className="confirm-dock__btn confirm-dock__btn--prompt confirm-dock__btn--promise_done"
                  onClick={() => onAnswerPromise(true)}
                >
                  Съел
                </button>
                <button
                  type="button"
                  className="confirm-dock__btn confirm-dock__btn--prompt confirm-dock__btn--promise_fail"
                  onClick={() => onAnswerPromise(false)}
                >
                  Не смог
                </button>
                <SessionCindersBribeButton
                  cindersBalance={cindersBalance}
                  onBribe={onBribeMistress}
                />
              </div>
            </div>
          ) : null}

          {isFinale && finalePhase === "await_edge" ? (
            <div className="confirm-dock">
              <button
                type="button"
                className="confirm-dock__btn confirm-dock__btn--finale"
                onClick={() => {
                  void primeUiAudio();
                  playUiConfirm();
                  onConfirmFinaleEdge();
                }}
              >
                ГОТОВ КОНЧИТЬ
                <span>10 сек до грани — потом колесо</span>
              </button>
            </div>
          ) : null}

          {tideCompletePending ? (
            <div
              className="confirm-dock confirm-dock--prompt confirm-dock--tide-complete"
              role="group"
              aria-label="Все удары Tide"
            >
              <div className="confirm-dock__prompt">
                <span className="confirm-dock__prompt-tag">Проверка</span>
                <span className="confirm-dock__prompt-q">
                  {activePrompt?.labelRu ??
                    `Все удары — до последнего? Или только норму (${tideTarget})?`}
                </span>
              </div>
              <div className="confirm-dock__prompt-opts">
                <button
                  type="button"
                  className="confirm-dock__btn confirm-dock__btn--tide-complete-yes"
                  onClick={() => {
                    void primeUiAudio();
                    playUiConfirm();
                    onAnswerTideComplete(true);
                  }}
                >
                  {tideCompleteYesLabelRu()}
                  <span>{tideCompleteYesSubRu()}</span>
                </button>
                <button
                  type="button"
                  className="confirm-dock__btn confirm-dock__btn--tide-complete-no"
                  onClick={() => {
                    void primeUiAudio();
                    playUiDeny();
                    onAnswerTideComplete(false);
                  }}
                >
                  {tideCompleteNoLabelRu()}
                  <span>{tideCompleteNoSubRu()}</span>
                </button>
                <SessionCindersBribeButton
                  cindersBalance={cindersBalance}
                  onBribe={onBribeMistress}
                />
              </div>
            </div>
          ) : null}

          {tideMissPending ? (
            <div
              className="confirm-dock confirm-dock--prompt confirm-dock--tide-miss"
              role="group"
              aria-label="Пропущенные удары Tide"
            >
              <div className="confirm-dock__prompt">
                <span className="confirm-dock__prompt-tag">Признание</span>
                <span className="confirm-dock__prompt-q">
                  {activePrompt?.labelRu ?? tideMissAskLabelRu()}
                </span>
              </div>
              <div className="confirm-dock__tide-miss">
                <label className="confirm-dock__tide-miss-field">
                  <span>Пропустил</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={tideMissMax}
                    step={1}
                    value={tideMissInput}
                    onChange={(e) => setTideMissInput(e.target.value)}
                  />
                  <span className="confirm-dock__tide-miss-cap">
                    / {tideMissMax}
                  </span>
                </label>
                <button
                  type="button"
                  className="confirm-dock__btn confirm-dock__btn--tide-miss"
                  onClick={() => {
                    void primeUiAudio();
                    playUiConfirm();
                    const n = Number.parseInt(tideMissInput, 10);
                    const missed = Number.isFinite(n)
                      ? Math.max(0, Math.min(tideMissMax, n))
                      : 0;
                    onAnswerTideMiss(missed);
                  }}
                >
                  Признаться
                  <span>Госпожа услышит</span>
                </button>
                <SessionCindersBribeButton
                  cindersBalance={cindersBalance}
                  onBribe={onBribeMistress}
                />
              </div>
            </div>
          ) : null}

          {showTideHitDock ? (
            <div
              className="confirm-dock confirm-dock--tide"
              role="group"
              aria-label="Счётчик ударов Tide"
            >
              <div className="confirm-dock__tide-progress" aria-live="polite">
                <span className="confirm-dock__tide-count">
                  {tideHitCounterLabelRu(tideHits, tideTarget)}
                </span>
                <span className="confirm-dock__tide-hint">
                  {tideHitProgressHintRu(
                    currentBlock?.functionId,
                    tideVerify.mode,
                  )}
                </span>
                {tideVerify.mode === "mic" ? (
                  <>
                    <TideHitLevelMeter
                      db={tideMicDb}
                      thresholdDb={tideVerify.thresholdDb}
                      flash={tideMicFlash}
                    />
                    <span className="confirm-dock__tide-hint">
                      {tideHitMicStatusRu(tideMicStatus, tideMicDetail)}
                    </span>
                  </>
                ) : null}
              </div>
              <TideHitVerifyToggle
                compact
                mode={tideVerify.mode}
                onChange={(mode) => {
                  void primeUiAudio();
                  playUiClick();
                  setTideVerify(
                    saveTideHitVerifySettings({ ...tideVerify, mode }),
                  );
                }}
              />
              <button
                type="button"
                className="confirm-dock__btn confirm-dock__btn--tide-fail"
                onClick={() => {
                  void primeUiAudio();
                  playUiDeny();
                  onTideFail();
                }}
              >
                {tideFailButtonLabelRu()}
                <span>{tideFailButtonSubRu(currentBlock?.functionId)}</span>
              </button>
            </div>
          ) : null}

          {idolCompletePending ? (
            <div
              className="confirm-dock confirm-dock--prompt confirm-dock--tide-complete"
              role="group"
              aria-label="Все глотки Chorus"
            >
              <div className="confirm-dock__prompt">
                <span className="confirm-dock__prompt-tag">Проверка</span>
                <span className="confirm-dock__prompt-q">
                  {activePrompt?.labelRu ??
                    `Все глотки — до последнего? Или только норму (${idolTarget})?`}
                </span>
              </div>
              <div className="confirm-dock__prompt-opts">
                <button
                  type="button"
                  className="confirm-dock__btn confirm-dock__btn--tide-complete-yes"
                  onClick={() => {
                    void primeUiAudio();
                    playUiConfirm();
                    onAnswerIdolComplete(true);
                  }}
                >
                  {idolChorusCompleteYesLabelRu()}
                  <span>{idolChorusCompleteYesSubRu()}</span>
                </button>
                <button
                  type="button"
                  className="confirm-dock__btn confirm-dock__btn--tide-complete-no"
                  onClick={() => {
                    void primeUiAudio();
                    playUiDeny();
                    onAnswerIdolComplete(false);
                  }}
                >
                  {idolChorusCompleteNoLabelRu()}
                  <span>{idolChorusCompleteNoSubRu()}</span>
                </button>
                <SessionCindersBribeButton
                  cindersBalance={cindersBalance}
                  onBribe={onBribeMistress}
                />
              </div>
            </div>
          ) : null}

          {idolMissPending ? (
            <div
              className="confirm-dock confirm-dock--prompt confirm-dock--tide-miss"
              role="group"
              aria-label="Пропущенные глотки Chorus"
            >
              <div className="confirm-dock__prompt">
                <span className="confirm-dock__prompt-tag">Признание</span>
                <span className="confirm-dock__prompt-q">
                  {activePrompt?.labelRu ?? idolChorusMissAskLabelRu()}
                </span>
              </div>
              <div className="confirm-dock__tide-miss">
                <label className="confirm-dock__tide-miss-field">
                  <span>Пропустил</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={idolMissMax}
                    step={1}
                    value={idolMissInput}
                    onChange={(e) => setIdolMissInput(e.target.value)}
                  />
                  <span className="confirm-dock__tide-miss-cap">
                    / {idolMissMax}
                  </span>
                </label>
                <button
                  type="button"
                  className="confirm-dock__btn confirm-dock__btn--tide-miss"
                  onClick={() => {
                    void primeUiAudio();
                    playUiConfirm();
                    const n = Number.parseInt(idolMissInput, 10);
                    const missed = Number.isFinite(n)
                      ? Math.max(0, Math.min(idolMissMax, n))
                      : 0;
                    onAnswerIdolMiss(missed);
                  }}
                >
                  Признаться
                  <span>Госпожа услышит</span>
                </button>
                <SessionCindersBribeButton
                  cindersBalance={cindersBalance}
                  onBribe={onBribeMistress}
                />
              </div>
            </div>
          ) : null}

          {showIdolChorusDock ? (
            <div
              className="confirm-dock confirm-dock--tide"
              role="group"
              aria-label="Счётчик Chorus"
            >
              <div className="confirm-dock__tide-progress" aria-live="polite">
                <span className="confirm-dock__tide-count">
                  {idolChorusCounterLabelRu(idolHits, idolTarget)}
                </span>
                <span className="confirm-dock__tide-hint">
                  {idolChorusProgressHintRu()}
                </span>
              </div>
              <button
                type="button"
                className="confirm-dock__btn confirm-dock__btn--tide-fail"
                onClick={() => {
                  void primeUiAudio();
                  playUiDeny();
                  onIdolFail();
                }}
              >
                {idolChorusFailButtonLabelRu()}
                <span>{idolChorusFailButtonSubRu()}</span>
              </button>
            </div>
          ) : null}

          {showIdolBuzzDock ? (
            <div
              className="confirm-dock confirm-dock--tide"
              role="group"
              aria-label="Buzz hold"
            >
              <div className="confirm-dock__tide-progress" aria-live="polite">
                <span className="confirm-dock__tide-count">
                  {idolBuzzPhase === "holding"
                    ? `${idolBuzzElapsed} / ${idolBuzzTarget}с`
                    : `${idolBuzzTarget}с`}
                </span>
                <span className="confirm-dock__tide-hint">
                  {idolBuzzArmSubRu(idolBuzzMode)}
                </span>
              </div>
              {idolBuzzPhase === "arm" ? (
                <>
                  <div className="confirm-dock__prompt-opts">
                    <button
                      type="button"
                      className={`confirm-dock__btn${
                        idolBuzzMode === "hands_on" ? " is-active" : ""
                      }`}
                      onClick={() => {
                        void primeUiAudio();
                        playUiClick();
                        onSetIdolBuzzHoldMode("hands_on");
                      }}
                    >
                      Руки на игрушке
                      <span>держи wand / пулю у клитора</span>
                    </button>
                    <button
                      type="button"
                      className={`confirm-dock__btn${
                        idolBuzzMode === "clipped" ? " is-active" : ""
                      }`}
                      onClick={() => {
                        void primeUiAudio();
                        playUiClick();
                        onSetIdolBuzzHoldMode("clipped");
                      }}
                    >
                      Hands-free
                      <span>закреплено · руки прочь</span>
                    </button>
                  </div>
                  <button
                    type="button"
                    className="confirm-dock__btn confirm-dock__btn--ready"
                    onClick={() => {
                      void primeUiAudio();
                      playUiConfirm();
                      onArmIdolBuzz();
                    }}
                  >
                    {idolBuzzArmLabelRu()}
                    <span>{idolBuzzArmSubRu(idolBuzzMode)}</span>
                  </button>
                </>
              ) : null}
              {idolBuzzPhase === "holding" ? (
                <button
                  type="button"
                  className="confirm-dock__btn confirm-dock__btn--tide-fail"
                  onClick={() => {
                    void primeUiAudio();
                    playUiDeny();
                    onFailIdolBuzz();
                  }}
                >
                  {idolBuzzFailLabelRu()}
                  <span>{idolBuzzFailSubRu()}</span>
                </button>
              ) : null}
            </div>
          ) : null}

          {preflight?.kind === "sunna_prep" ? (
            <div
              className="confirm-dock confirm-dock--prompt"
              role="group"
              aria-label="Sunna prep"
            >
              <div className="confirm-dock__prompt-opts">
                {SUNNA_PREP_STEPS.map((step) => {
                  const done = sunnaPrepDone.includes(step.id);
                  return (
                    <button
                      key={step.id}
                      type="button"
                      className="confirm-dock__btn confirm-dock__btn--ready"
                      disabled={done}
                      onClick={() => {
                        void primeUiAudio();
                        playUiConfirm();
                        onSunnaPrepStep(step.id);
                      }}
                    >
                      {done ? `✓ ${step.labelRu}` : step.labelRu}
                      <span>{step.subRu}</span>
                    </button>
                  );
                })}
              </div>
              <div className="confirm-dock__prompt-opts">
                <button
                  type="button"
                  className={`confirm-dock__btn${
                    sunnaBuzzHoldMode === "hands_on" ? " is-active" : ""
                  }`}
                  onClick={() => {
                    void primeUiAudio();
                    playUiClick();
                    onSunnaBuzzHoldMode("hands_on");
                  }}
                >
                  Buzz: руки на игрушке
                  <span>wand / пуля у клетки</span>
                </button>
                <button
                  type="button"
                  className={`confirm-dock__btn${
                    sunnaBuzzHoldMode === "clipped" ? " is-active" : ""
                  }`}
                  onClick={() => {
                    void primeUiAudio();
                    playUiClick();
                    onSunnaBuzzHoldMode("clipped");
                  }}
                >
                  Buzz: hands-free
                  <span>закреплено на клетке</span>
                </button>
              </div>
              {!sunnaPrepReady ? (
                <p className="confirm-dock__tide-hint">
                  Отметь все три шага — потом разогрев и «Готов».
                </p>
              ) : null}
            </div>
          ) : null}

          {(canConfirmEdge ||
            canConfirmHold ||
            canConfirmRuin ||
            breathHolding ||
            preflight?.kind === "warmup") && (
            <div className="confirm-dock">
              {preflight?.kind === "warmup" ? (
                <button
                  type="button"
                  className="confirm-dock__btn confirm-dock__btn--ready"
                  onClick={() => {
                    void primeUiAudio();
                    playUiConfirm();
                    unlockMediaStageAudio();
                    onReady();
                  }}
                >
                  Готов
                  <span>старт битов и ходов</span>
                </button>
              ) : null}
              {canConfirmEdge ? (
                <button
                  type="button"
                  className="confirm-dock__btn confirm-dock__btn--edge"
                  onClick={() => {
                    void primeUiAudio();
                    playUiConfirm();
                    onConfirmEdge();
                  }}
                >
                  Эдж ✓
                  <span>по команде</span>
                </button>
              ) : null}
              {breathHolding &&
              (breathMode === "stroke_count" ||
                breathMode === "stroke_timer") ? (
                <button
                  type="button"
                  className="confirm-dock__btn confirm-dock__btn--ready"
                  onClick={() => onReportBreath(true)}
                >
                  Готово
                  <span>задержка выполнена</span>
                </button>
              ) : null}
              {breathHolding ? (
                <button
                  type="button"
                  className="confirm-dock__btn confirm-dock__btn--ruin"
                  onClick={() => onReportBreath(false)}
                >
                  Сдаюсь
                  <span>не хватило воздуха</span>
                </button>
              ) : null}
              {canConfirmHold ? (
                <button
                  type="button"
                  className="confirm-dock__btn confirm-dock__btn--edge"
                  onClick={() => {
                    void primeUiAudio();
                    playUiConfirm();
                    onConfirmEdge();
                  }}
                >
                  {holdArmed ? "Удержал ✓" : "Держу грань ✓"}
                  <span>
                    {holdArmed
                      ? "грань без срыва"
                      : holdGraceLeft != null && holdGraceLeft > 0
                        ? `ещё ~${holdGraceLeft}с на выход к эджу`
                        : "нажми на грани — стартует удержание"}
                  </span>
                </button>
              ) : null}
              {canConfirmRuin ? (
                <button
                  type="button"
                  className="confirm-dock__btn confirm-dock__btn--ruin"
                  onClick={() => {
                    void primeUiAudio();
                    playUiDeny();
                    onConfirmRuin();
                  }}
                >
                  Руин ✓
                  <span>по команде</span>
                </button>
              ) : null}
            </div>
          )}

          {busy &&
          !inPreflight &&
          currentBlock &&
          currentBlock.goal !== "finale" &&
          instruction?.titleRu ? (
            <MoveAnnounce
              moveKey={currentBlock.id}
              text={instruction.titleRu}
            />
          ) : null}

          <BeatBar
            blockKey={currentBlock?.id ?? "idle"}
            pattern={currentPat ?? null}
            bpm={bpm}
            active={busy && !inPreflight}
            paused={status === "paused"}
            silent={highwaySilent}
            beatOriginPerf={beatOriginPerf}
            beatUntilAtMs={beatUntilAtMs}
            handoffDelayMs={beatHandoffDelayMs}
            hitSeq={pulse}
            patternLabel={patternLabel}
            timeLabel={timeLabel}
            nextLabel={nextLabel}
          />

          <SessionToolbar
            state={state}
            status={status}
            busy={busy}
            inPreflight={inPreflight}
            promptGate={promptGate}
            mediaAutoplay={mediaAutoplay}
            onMediaAutoplay={setMediaAutoplayPersist}
            contentAutoplay={contentAutoplay}
            onContentAutoplay={setContentAutoplayPersist}
            muted={muted}
            onMuted={onMuted}
            ttsEnabled={ttsEnabled}
            onTtsEnabled={onTtsEnabled}
            sfxVolume={sfxVolume}
            onSfxVolume={onSfxVolume}
            ttsVolume={ttsVolume}
            onTtsVolume={onTtsVolume}
            videoVolume={videoVolume}
            onVideoVolume={onVideoVolume}
            punishNotice={punishNotice}
            onSkip={onSkip}
            onForceFinale={onForceFinale}
            onAbort={onAbort}
            onExport={onExport}
          />
        </div>
      </div>
    </div>
  );
}
