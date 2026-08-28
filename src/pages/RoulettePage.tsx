import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MistressImg } from "../components/MistressImg";
import { MistressPicker } from "../components/MistressPicker";
import { ParamRoulette } from "../components/ParamRoulette";
import { RouletteDailyBrief } from "../components/RouletteDailyBrief";
import {
  RouletteHubPanels,
  type RouletteHubTab,
} from "../components/RouletteHubPanels";
import { TypewriterText } from "../components/TypewriterText";
import type { ContentUnlockLists } from "../lib/contentUnlocks";
import type { GelbooruListOption } from "../lib/gelbooruLists";
import {
  getActiveMistress,
  mistressUnlockSnapshotFrom,
  subscribeActiveMistress,
  type MistressPack,
} from "../lib/mistress";
import { loadAchievements } from "../lib/achievements";
import { buildCumplayTierStep } from "../lib/cumplayTiers";
import {
  buildFetishTierStep,
  type FetishTier,
} from "../lib/fetishTiers";
import type { ContractInstance } from "../lib/contracts/dailyBoard";
import {
  applySealToRouletteStep,
  applySealToRouletteSteps,
  applySessionSeedToParams,
  SESSION_SEAL_ACTIVE_TAG_RU,
  SESSION_SEAL_CANCEL_CTA_RU,
  sealedFatePhraseForSeed,
  sessionSeedLockLabelsRu,
  sessionSeedLocksRouletteStep,
  sessionSeedVerifyLabelRu,
  type ActiveSessionSeed,
} from "../lib/contracts/sessionSeed";
import {
  applyRoulettePicks,
  buildPlanRouletteSteps,
  pickWeightedOption,
  type PlanRouletteResult,
  type RouletteOption,
  type RouletteStepDef,
  type RouletteStepId,
} from "../lib/planRoulette";
import {
  pickRouletteAvatarClickLine,
  pickRouletteBuildingLine,
  pickRouletteConfirmStartLine,
  pickRouletteEmptyStepsLine,
  pickRouletteErrorLine,
  pickRouletteIdleLine,
  pickRouletteIdleWaitLine,
  pickRouletteLandLine,
  pickRouletteReadyLine,
  pickRouletteRestartLine,
  pickRouletteSpinLine,
  type RouletteLine,
} from "../lib/huTaoRouletteLines";
import { buildMoodFetishTagStep } from "../lib/tagRoulette";
import {
  buildToyPickStep,
  buildToysCountStep,
  isToyPickStepId,
} from "../lib/toyRoulette";
import { buildVerdictPack } from "../lib/planVerdict";
import {
  loadFavoriteTasteProfile,
  type FavoriteTasteProfile,
} from "../lib/favoriteTagTaste";
import { MODE_LABELS } from "../lib/labels";
import type { MediaSettings } from "../lib/media";
import type { PlaylistPreloadStatus } from "../lib/mediaPreload";
import {
  loadRouletteSettings,
  type RouletteSettings,
} from "../lib/rouletteSettings";
import {
  playUiClick,
  playUiConfirm,
  playUiDeny,
  playUiTab,
  primeUiAudio,
} from "../lib/uiSound";
import { emptyWallet, type WalletState } from "../lib/wallet";
import { getActiveMoodLines } from "../lib/voice/moodLines";
import type {
  SessionMode,
  SessionMood,
  SessionParams,
  ToyDef,
} from "../lib/types";

type Phase = "idle" | "spinning" | "landed" | "building" | "ready" | "error";

const SESSION_MODES: SessionMode[] = [
  "stroke",
  "anal",
  "chastity",
  "onahole",
  "cbt",
  "oral",
  "prone",
  "plapping",
];

function resolveRouletteMode(
  picks: Partial<Record<RouletteStepId, RouletteOption>>,
  fallback: SessionMode,
): SessionMode {
  const id = picks.mode?.id;
  return SESSION_MODES.includes(id as SessionMode)
    ? (id as SessionMode)
    : fallback;
}

function resolveRouletteMood(
  picks: Partial<Record<RouletteStepId, RouletteOption>>,
  fallback: SessionMood = "sweet",
): SessionMood {
  const id = picks.mood?.id;
  if (
    id === "sweet" ||
    id === "cruel" ||
    id === "calm" ||
    id === "chaotic" ||
    id === "horny" ||
    id === "bored"
  ) {
    return id;
  }
  return fallback;
}

interface RoulettePageProps {
  baseParams: SessionParams;
  busy?: boolean;
  unlocks?: ContentUnlockLists;
  onMistressDecide: (result: PlanRouletteResult) => Promise<void>;
  onStartWithoutRoulette: () => void;
  seed: number;
  activePresetId: string | null;
  sessionLive?: boolean;
  onMistressSwitched?: (pack: MistressPack) => void;
  media: MediaSettings;
  mediaCount: number;
  favoritesCount: number;
  mediaLoading: boolean;
  mediaError: string | null;
  mediaSaveStatus: string | null;
  playlistPreload: PlaylistPreloadStatus;
  toys: ToyDef[];
  onParams: (next: SessionParams) => void;
  onSeed: (seed: number) => void;
  onReroll: () => void;
  onApplyPreset: (presetId: string) => void;
  onMedia: (next: MediaSettings) => void;
  onLoadGelbooru: () => void;
  onLoadMediaList?: () => void;
  onAssembleMediaList?: () => void;
  mediaLists?: ReadonlyArray<GelbooruListOption>;
  onPickLocal: (files: FileList) => void;
  onSaveMedia: () => void;
  /** WD14 auto-tagger: backend status for the local-source panel. */
  wd14Status?: { backend: string; online: boolean; detail: string } | null;
  /** Live tag progress while auto-tagging runs. */
  tagProgress?: { done: number; total: number } | null;
  onStartWd14?: () => void | Promise<unknown>;
  onRefreshWd14?: () => void;
  onToyOwned: (toyId: string, owned: boolean) => void;
  /** Active contract seed — locks plan fields after roulette / without spin */
  contractSeed?: ActiveSessionSeed | null;
  onClearContractSeed?: () => void;
  wallet?: WalletState;
  contractsRevision?: number;
  onStartSessionSeed?: (contract: ContractInstance) => void;
  onStartMediaDrill?: (contract: ContractInstance) => void;
  onOpenContracts?: () => void;
  onOpenSession?: () => void;
  onOpenShop?: () => void;
  onOpenFavorites?: () => void;
}

const IDLE_WAIT_MIN = 16_000;
const IDLE_WAIT_MAX = 26_000;

const HUB_TABS: { id: RouletteHubTab; label: string }[] = [
  { id: "plan", label: "План" },
  { id: "media", label: "Медиа" },
  { id: "toys", label: "Игрушки" },
  { id: "tasks", label: "Задания" },
];

export function RoulettePage({
  baseParams,
  busy = false,
  unlocks = { ...emptyWallet().unlocks, pendingShopTags: [] },
  onMistressDecide,
  onStartWithoutRoulette,
  seed,
  activePresetId,
  sessionLive = false,
  onMistressSwitched,
  media,
  mediaCount,
  favoritesCount,
  mediaLoading,
  mediaError,
  mediaSaveStatus,
  playlistPreload,
  toys,
  onParams,
  onSeed,
  onReroll,
  onApplyPreset,
  onMedia,
  onLoadGelbooru,
  onLoadMediaList,
  onAssembleMediaList,
  mediaLists,
  onPickLocal,
  onSaveMedia,
  wd14Status,
  tagProgress,
  onStartWd14,
  onRefreshWd14,
  onToyOwned,
  contractSeed = null,
  onClearContractSeed,
  wallet,
  contractsRevision = 0,
  onStartSessionSeed,
  onStartMediaDrill,
  onOpenContracts,
  onOpenSession,
  onOpenShop,
  onOpenFavorites,
}: RoulettePageProps) {
  const [hubTab, setHubTab] = useState<RouletteHubTab>("plan");
  const [settings, setSettings] = useState<RouletteSettings>(() =>
    loadRouletteSettings(),
  );
  const [steps, setSteps] = useState<RouletteStepDef[]>(() =>
    buildPlanRouletteSteps(
      loadRouletteSettings(),
      unlocks,
      baseParams.finishId,
    ),
  );
  const [phase, setPhase] = useState<Phase>("idle");
  const [stepIndex, setStepIndex] = useState(0);
  const [picks, setPicks] = useState<
    Partial<Record<RouletteStepId, RouletteOption>>
  >({});
  const [targetId, setTargetId] = useState<string | null>(null);
  const [result, setResult] = useState<PlanRouletteResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [line, setLine] = useState<RouletteLine>(() => pickRouletteIdleLine());
  const [commentKey, setCommentKey] = useState(0);
  const idleTimerRef = useRef<number | null>(null);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const tasteRef = useRef<FavoriteTasteProfile | null>(null);
  const stepsRef = useRef(steps);
  stepsRef.current = steps;
  const picksRef = useRef(picks);
  picksRef.current = picks;

  useEffect(() => {
    let cancelled = false;
    void loadFavoriteTasteProfile().then((profile) => {
      if (!cancelled) tasteRef.current = profile;
    });
    return () => {
      cancelled = true;
    };
  }, [favoritesCount]);

  const say = useCallback((next: RouletteLine) => {
    setLine(next);
    setCommentKey((k) => k + 1);
  }, []);

  const clearIdleTimer = useCallback(() => {
    if (idleTimerRef.current != null) {
      window.clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
  }, []);

  const scheduleIdleWait = useCallback(() => {
    clearIdleTimer();
    const wait =
      IDLE_WAIT_MIN +
      Math.floor(Math.random() * (IDLE_WAIT_MAX - IDLE_WAIT_MIN));
    idleTimerRef.current = window.setTimeout(() => {
      if (phaseRef.current !== "idle") return;
      say(pickRouletteIdleWaitLine());
      scheduleIdleWait();
    }, wait);
  }, [clearIdleTimer, say]);

  useEffect(() => {
    if (phase === "idle") {
      scheduleIdleWait();
    } else {
      clearIdleTimer();
    }
    return clearIdleTimer;
  }, [phase, scheduleIdleWait, clearIdleTimer]);

  const step = steps[stepIndex] ?? null;
  const progressDone =
    phase === "ready" || phase === "building"
      ? steps.length
      : phase === "idle"
        ? 0
        : stepIndex + (phase === "landed" ? 1 : 0);

  const history = steps
    .slice(0, progressDone)
    .map((s) => {
      const p = picks[s.id];
      return p ? { id: s.id, title: s.titleRu, label: p.labelRu } : null;
    })
    .filter(Boolean) as { id: RouletteStepId; title: string; label: string }[];

  const startSequence = useCallback(
    (kind: "start" | "restart" = "start") => {
      if (busy) return;
      void primeUiAudio();
      if (kind === "restart") playUiClick(1.1);
      else playUiConfirm();
      const freshSettings = loadRouletteSettings();
      setSettings(freshSettings);
      setError(null);
      setResult(null);

      void (async () => {
        try {
          tasteRef.current = await loadFavoriteTasteProfile();
        } catch {
          // keep previous taste / empty
        }
        if (busy) return;
        let fresh = buildPlanRouletteSteps(
          freshSettings,
          unlocks,
          baseParams.finishId,
        );
        if (fresh.length === 0) {
          setError(
            "Все шаги рулетки выключены — включи хотя бы один в Настройках",
          );
          say(pickRouletteEmptyStepsLine());
          return;
        }

        // No mood wheel → bake tag/toys pools with default sweet band.
        if (!fresh.some((s) => s.id === "mood")) {
          const taste =
            tasteRef.current ?? {
              liked: [],
              disliked: [],
              prefsSeed: {},
              sampleSize: 0,
            };
          const tagStep = buildMoodFetishTagStep(
            "sweet",
            taste,
            unlocks,
            freshSettings,
          ) as RouletteStepDef;
          const toysCountStep = buildToysCountStep("sweet", {
            mode: baseParams.mode,
            toys,
          }) as RouletteStepDef;
          fresh = fresh.map((s) => {
            if (s.id === "tags") return tagStep;
            if (s.id === "toys_count") return toysCountStep;
            return s;
          });
        }

        const mistressId = getActiveMistress().id;
        fresh = applySealToRouletteSteps(fresh, contractSeed, mistressId);

        setSteps(fresh);
        setPhase("spinning");
        setStepIndex(0);
        setPicks({});
        const first = fresh[0];
        if (!first) return;
        const picked = pickWeightedOption(first.options);
        setTargetId(picked.id);
        setPicks({ [first.id]: picked });
        const sealedFirst =
          contractSeed &&
          sessionSeedLocksRouletteStep(contractSeed, first.id);
        const sealedLine: RouletteLine | null = sealedFirst
          ? {
              text: sealedFatePhraseForSeed(contractSeed, mistressId),
              emoji: "smug",
            }
          : null;
        say(
          kind === "restart"
            ? pickRouletteRestartLine()
            : (sealedLine ?? pickRouletteSpinLine(first.id)),
        );
        if (kind === "restart") {
          window.setTimeout(() => {
            if (phaseRef.current === "spinning") {
              say(sealedLine ?? pickRouletteSpinLine(first.id));
            }
          }, 900);
        }
      })();
    },
    [
      baseParams.finishId,
      baseParams.mode,
      busy,
      contractSeed,
      say,
      toys,
      unlocks,
    ],
  );

  const advanceAfterLand = useCallback(() => {
    let curSteps = stepsRef.current;
    const cur = curSteps[stepIndex];
    if (!cur) return;
    const landed = picksRef.current[cur.id];

    // After mood: bake 12-tag pool + toys-count range from mood band.
    if (cur.id === "mood" && landed) {
      const mood = landed.id as SessionMood;
      const taste =
        tasteRef.current ?? {
          liked: [],
          disliked: [],
          prefsSeed: {},
          sampleSize: 0,
        };
      const tagStep = buildMoodFetishTagStep(
        mood,
        taste,
        unlocks,
        settings,
      ) as RouletteStepDef;
      const modeForToys = resolveRouletteMode(
        picksRef.current,
        baseParams.mode,
      );
      const toysCountStep = buildToysCountStep(mood, {
        mode: modeForToys,
        toys,
      }) as RouletteStepDef;
      curSteps = applySealToRouletteSteps(
        curSteps.map((s) => {
          if (s.id === "tags") return tagStep;
          if (s.id === "toys_count") return toysCountStep;
          return s;
        }),
        contractSeed,
        getActiveMistress().id,
      );
      setSteps(curSteps);
    }

    // After mode: retarget toy-count pool to functions usable in that mode.
    if (cur.id === "mode" && landed) {
      const mood = resolveRouletteMood(picksRef.current, "sweet");
      const mode = resolveRouletteMode(picksRef.current, baseParams.mode);
      const toysCountStep = buildToysCountStep(mood, {
        mode,
        toys,
      }) as RouletteStepDef;
      curSteps = applySealToRouletteSteps(
        curSteps.map((s) =>
          s.id === "toys_count" ? toysCountStep : s,
        ),
        contractSeed,
        getActiveMistress().id,
      );
      setSteps(curSteps);
    }

    // After toys_count: insert N toy-pick wheels.
    if (cur.id === "toys_count" && landed) {
      const n = Math.max(
        0,
        Math.min(3, Number(landed.payload?.toysCount ?? 0)),
      );
      const mode = resolveRouletteMode(picksRef.current, baseParams.mode);
      const withoutToyPicks = curSteps.filter((s) => !isToyPickStepId(s.id));
      const insertAt = withoutToyPicks.findIndex((s) => s.id === "toys_count");
      const baseIdx = insertAt >= 0 ? insertAt : withoutToyPicks.length - 1;
      const toySteps: RouletteStepDef[] = [];
      const exclude: string[] = [];
      for (let slot = 1; slot <= n; slot++) {
        const step = buildToyPickStep(
          slot as 1 | 2 | 3,
          toys,
          exclude,
          baseParams.allowedToyIds,
          mode,
        ) as RouletteStepDef;
        toySteps.push(step);
        // Don't pre-exclude — each wheel excludes prior lands at spin time.
      }
      curSteps = [
        ...withoutToyPicks.slice(0, baseIdx + 1),
        ...toySteps,
        ...withoutToyPicks.slice(baseIdx + 1),
      ];
      setSteps(curSteps);
    }

    // Rebuild next toy wheel excluding already landed toys.
    if (isToyPickStepId(cur.id) && landed) {
      const slotNum = cur.id === "toys_1" ? 1 : cur.id === "toys_2" ? 2 : 3;
      const mode = resolveRouletteMode(picksRef.current, baseParams.mode);
      const pickedIds: string[] = [];
      for (const id of ["toys_1", "toys_2", "toys_3"] as const) {
        const p = picksRef.current[id];
        const tid = p?.payload?.toyId;
        if (typeof tid === "string") pickedIds.push(tid);
      }
      if (typeof landed.payload?.toyId === "string") {
        if (!pickedIds.includes(landed.payload.toyId)) {
          pickedIds.push(landed.payload.toyId);
        }
      }
      // Refresh remaining unspun toy steps' options
      curSteps = curSteps.map((s) => {
        if (!isToyPickStepId(s.id)) return s;
        const sn = s.id === "toys_1" ? 1 : s.id === "toys_2" ? 2 : 3;
        if (sn <= slotNum) return s;
        const prior = pickedIds.slice();
        return buildToyPickStep(
          sn as 1 | 2 | 3,
          toys,
          prior,
          baseParams.allowedToyIds,
          mode,
        ) as RouletteStepDef;
      });
      setSteps(curSteps);
    }

    const nextTier = landed?.payload?.nextTier as FetishTier | undefined;
    if (nextTier) {
      const tierStep = buildFetishTierStep(
        nextTier,
        settings,
        unlocks,
      ) as RouletteStepDef;
      const already = curSteps.some((s) => s.id === tierStep.id);
      let nextIndex = stepIndex + 1;
      if (!already) {
        curSteps = [
          ...curSteps.slice(0, stepIndex + 1),
          tierStep,
          ...curSteps.slice(stepIndex + 1),
        ];
        setSteps(curSteps);
      } else {
        nextIndex = curSteps.findIndex((s) => s.id === tierStep.id);
        if (nextIndex < 0) nextIndex = stepIndex + 1;
      }

      const picked = pickWeightedOption(tierStep.options);
      setStepIndex(nextIndex);
      setPicks((prev) => ({ ...prev, [tierStep.id]: picked }));
      setTargetId(picked.id);
      setPhase("spinning");
      say(pickRouletteSpinLine(tierStep.id));
      return;
    }

    // After finish: rebuild cumplay wheels for that destination.
    if (cur.id === "finish" && landed) {
      const finishId = landed.id;
      const normalStep = buildCumplayTierStep(
        "normal",
        settings,
        finishId,
      ) as RouletteStepDef;
      curSteps = curSteps
        .filter((s) => s.id !== "cumplay_heavy")
        .map((s) => (s.id === "cumplay" ? normalStep : s));
      setSteps(curSteps);
      setPicks((prev) => {
        const next = { ...prev };
        delete next.cumplay;
        delete next.cumplay_heavy;
        picksRef.current = next;
        return next;
      });
    }

    if (landed?.payload?.nextCumplayTier === "heavy") {
      const finishId = picksRef.current.finish?.id;
      const tierStep = buildCumplayTierStep(
        "heavy",
        settings,
        finishId,
      ) as RouletteStepDef;
      let nextIndex = stepIndex + 1;
      if (!curSteps.some((s) => s.id === tierStep.id)) {
        curSteps = [
          ...curSteps.slice(0, stepIndex + 1),
          tierStep,
          ...curSteps.slice(stepIndex + 1),
        ];
        setSteps(curSteps);
      } else {
        nextIndex = curSteps.findIndex((s) => s.id === tierStep.id);
        if (nextIndex < 0) nextIndex = stepIndex + 1;
      }

      const picked = pickWeightedOption(tierStep.options);
      setStepIndex(nextIndex);
      setPicks((prev) => ({ ...prev, [tierStep.id]: picked }));
      setTargetId(picked.id);
      setPhase("spinning");
      say(pickRouletteSpinLine(tierStep.id));
      return;
    }

    const nextIndex = stepIndex + 1;
    if (nextIndex >= curSteps.length) {
      const draft = applyRoulettePicks(
        picksRef.current,
        baseParams,
        Math.random,
        toys,
      );
      if (contractSeed) {
        draft.params = applySessionSeedToParams(draft.params, contractSeed);
      }
      setResult(draft);
      setPhase("ready");
      setTargetId(null);
      say(pickRouletteReadyLine());
      return;
    }

    const next = curSteps[nextIndex]!;
    // For toy picks, rebuild options excluding already chosen toys.
    let nextStep = next;
    if (isToyPickStepId(next.id)) {
      const exclude: string[] = [];
      for (const id of ["toys_1", "toys_2", "toys_3"] as const) {
        const p = picksRef.current[id];
        const tid = p?.payload?.toyId;
        if (typeof tid === "string") exclude.push(tid);
      }
      const sn = next.id === "toys_1" ? 1 : next.id === "toys_2" ? 2 : 3;
      const mode = resolveRouletteMode(picksRef.current, baseParams.mode);
      nextStep = buildToyPickStep(
        sn as 1 | 2 | 3,
        toys,
        exclude,
        baseParams.allowedToyIds,
        mode,
      ) as RouletteStepDef;
      curSteps = curSteps.map((s) => (s.id === next.id ? nextStep : s));
      setSteps(curSteps);
    }

    nextStep = applySealToRouletteStep(
      nextStep,
      contractSeed,
      getActiveMistress().id,
    );
    if (nextStep !== next) {
      curSteps = curSteps.map((s) => (s.id === next.id ? nextStep : s));
      setSteps(curSteps);
    }

    const picked = pickWeightedOption(nextStep.options);
    setStepIndex(nextIndex);
    setPicks((prev) => ({ ...prev, [nextStep.id]: picked }));
    setTargetId(picked.id);
    setPhase("spinning");
    if (
      contractSeed &&
      sessionSeedLocksRouletteStep(contractSeed, nextStep.id)
    ) {
      say({
        text: sealedFatePhraseForSeed(contractSeed, getActiveMistress().id),
        emoji: "smug",
      });
    } else {
      say(pickRouletteSpinLine(nextStep.id));
    }
  }, [baseParams, contractSeed, say, settings, stepIndex, toys, unlocks]);

  const onSpinDone = useCallback(() => {
    setPhase("landed");
    const cur = steps[stepIndex];
    const opt = cur ? picks[cur.id] : null;
    if (cur && opt) {
      say(
        pickRouletteLandLine(cur.id, opt.id, opt.labelRu, undefined, {
          disliked: opt.payload?.disliked === true,
        }),
      );
    }
  }, [picks, say, stepIndex, steps]);

  useEffect(() => {
    if (phase !== "idle") return;
    setSettings(loadRouletteSettings());
  }, [phase]);

  useEffect(() => {
    if (phase !== "idle") return;
    setSteps(
      buildPlanRouletteSteps(settings, unlocks, baseParams.finishId),
    );
  }, [settings, unlocks, phase, baseParams.finishId]);

  useEffect(() => {
    if (phase !== "landed") return;
    const t = window.setTimeout(() => {
      advanceAfterLand();
    }, 1750);
    return () => window.clearTimeout(t);
  }, [phase, advanceAfterLand]);

  async function confirmAndStart() {
    if (!result || busy) return;
    void primeUiAudio();
    playUiConfirm();
    setPhase("building");
    setError(null);
    say(pickRouletteConfirmStartLine());
    window.setTimeout(() => {
      if (phaseRef.current === "building") {
        say(pickRouletteBuildingLine());
      }
    }, 850);
    try {
      await onMistressDecide(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось собрать сессию");
      setPhase("ready");
      say(pickRouletteErrorLine());
    }
  }

  const moodLabel =
    result != null
      ? (getActiveMoodLines().moods[result.mood]?.labelRu ?? result.mood)
      : null;

  const verdictPack = useMemo(
    () => (result ? buildVerdictPack(result) : null),
    [result],
  );

  const summaryHero =
    result != null
      ? [
          {
            k: "Длительность",
            v: `${Math.round(result.params.durationSec / 60)} мин`,
          },
          {
            k: "Режим",
            v: MODE_LABELS[result.params.mode]?.nameRu ?? result.params.mode,
          },
          {
            k: "Эджи",
            v: String(result.params.edgesTarget),
          },
          {
            k: "Темп",
            v: `${result.params.bpmMin}–${result.params.bpmMax}`,
          },
        ]
      : [];

  const summaryExtras = [
    ...history.filter(
      (h) =>
        !["mood", "mode", "duration", "edges", "bpm", "finaleOdds"].includes(
          h.id,
        ),
    ),
    {
      id: "finaleOdds" as const,
      title: "Финал",
      label: "ГОТОВ КОНЧИТЬ · 10 сек · колесо",
    },
  ];

  const [mistress, setMistress] = useState(() => getActiveMistress());
  useEffect(() => subscribeActiveMistress(setMistress), []);

  const moodAccent =
    result?.mood ??
    (picks.mood?.id as SessionMood | undefined) ??
    null;

  const avatarSrc = moodAccent
    ? mistress.assets.moodAvatar[moodAccent]
    : mistress.assets.avatarFull;
  const speakMoodLabel = moodAccent
    ? mistress.assets.moodPortrait[moodAccent].labelRu
    : null;

  return (
    <div className="page page--roulette">
      <div className="roulette-stage" data-mood={moodAccent ?? "idle"}>
        <header className="roulette-stage__header">
          <div>
            <p className="roulette-stage__eyebrow">
              {mistress.displayNameRu} · {mistress.taglineRu}
            </p>
            <h1>Рулетка</h1>
            <p className="roulette-stage__sub">
              Сегодняшняя точка входа: контракты, задания и старт с её крутки
              или без.
            </p>
          </div>
          {phase !== "idle" && phase !== "ready" && phase !== "error" ? (
            <div className="roulette-stage__progress" aria-live="polite">
              <span className="roulette-stage__progress-n">
                {Math.min(progressDone, steps.length)}
              </span>
              <span className="roulette-stage__progress-sep">/</span>
              <span>{steps.length}</span>
              <span className="roulette-stage__progress-label">шагов</span>
            </div>
          ) : null}
        </header>

        {/* Slim seed strip while spinning — full brief sits above the hub when idle */}
        {contractSeed && phase !== "idle" ? (
          <div className="roulette-contract-seed is-sealed" role="status">
            <div className="roulette-contract-seed__text">
              <span className="roulette-contract-seed__tag">
                {SESSION_SEAL_ACTIVE_TAG_RU}
              </span>
              <strong>{contractSeed.titleRu}</strong>
              <span>
                {" · "}
                {sessionSeedLockLabelsRu(contractSeed).join(" · ") ||
                  "параметры"}
                {" · "}
                {sessionSeedVerifyLabelRu(contractSeed)}
              </span>
              <span className="roulette-contract-seed__hint">
                {" "}
                — {sealedFatePhraseForSeed(contractSeed, mistress.id)}
              </span>
            </div>
            {onClearContractSeed ? (
              <button
                type="button"
                className="btn-ghost roulette-contract-seed__clear"
                onClick={() => {
                  void primeUiAudio();
                  playUiClick();
                  onClearContractSeed();
                }}
              >
                {SESSION_SEAL_CANCEL_CTA_RU}
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="roulette-layout">
          <aside
            className={`roulette-rail${phase !== "idle" ? " is-live" : ""}`}
            aria-label="Ход рулетки"
            data-phase={phase}
          >
            <header className="roulette-rail__head">
              <p className="roulette-rail__label">Ход</p>
              <span className="roulette-rail__count" aria-live="polite">
                {Math.min(progressDone, steps.length)}
                <em>/</em>
                {steps.length}
              </span>
            </header>
            <ol className="roulette-rail__list">
              {steps.map((s, i) => {
                const done =
                  i < progressDone ||
                  ((phase === "ready" || phase === "building") && !!result);
                const active =
                  (phase === "spinning" || phase === "landed") &&
                  i === stepIndex;
                const pick = picks[s.id];
                // Never reveal the active pick while the wheel is still spinning.
                const revealed =
                  !!pick &&
                  (done ||
                    (phase === "landed" && active) ||
                    phase === "ready" ||
                    phase === "building");
                const spinningHere = active && phase === "spinning";
                return (
                  <li
                    key={s.id}
                    className={[
                      "roulette-rail__item",
                      done ? "is-done" : "",
                      active ? "is-active" : "",
                      revealed ? "is-revealed" : "",
                      spinningHere ? "is-spinning" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    style={{ ["--rail-i" as string]: i }}
                  >
                    <span className="roulette-rail__dot" aria-hidden />
                    <div className="roulette-rail__text">
                      <span className="roulette-rail__title">{s.titleRu}</span>
                      {revealed ? (
                        <span className="roulette-rail__val">{pick.labelRu}</span>
                      ) : spinningHere ? (
                        <span className="roulette-rail__val is-spin">
                          крутит…
                        </span>
                      ) : (
                        <span className="roulette-rail__val is-wait">—</span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          </aside>

          <div className="roulette-main">
            {phase === "idle" ? (
              <div className="roulette-idle-card">
                <div className="roulette-idle-card__glow" aria-hidden />
                <div className="roulette-idle-card__copy">
                  <p className="roulette-idle-card__kicker">Её правила</p>
                  <h2 className="roulette-idle-card__title">
                    Отдай выбор {mistress.displayNameDativeRu}
                  </h2>
                  <p className="roulette-idle-card__lead">
                    Одна кнопка — mood, режим, темп и фетиши. Пулы колёс
                    подкручиваются в Настройках.
                  </p>
                </div>
                <div className="roulette-idle-card__actions">
                  <button
                    type="button"
                    className="btn-primary btn-lg roulette-idle-card__cta"
                    disabled={busy}
                    onClick={() => startSequence("start")}
                  >
                    Пусть {mistress.displayNameRu} решает
                  </button>
                  <button
                    type="button"
                    className="btn-ghost"
                    disabled={busy}
                    onClick={() => {
                      void primeUiAudio();
                      playUiDeny();
                      onStartWithoutRoulette();
                    }}
                    title="Старт с текущим планом без колёс"
                  >
                    Начать без рулетки
                  </button>
                </div>
              </div>
            ) : null}

            {phase === "idle" && wallet ? (
              <RouletteDailyBrief
                wallet={wallet}
                contractSeed={contractSeed}
                onClearContractSeed={onClearContractSeed}
                onStartSessionSeed={onStartSessionSeed}
                onStartMediaDrill={onStartMediaDrill}
                onOpenContracts={onOpenContracts}
                onOpenShop={onOpenShop}
                onOpenFavorites={onOpenFavorites}
                favoritesCount={favoritesCount}
                revision={contractsRevision}
                mediaLoading={mediaLoading}
              />
            ) : null}

            {phase === "idle" ? (
              <section className="roulette-hub" aria-label="Игровой хаб">
                <div
                  className="roulette-hub__tabs"
                  role="tablist"
                  aria-label="Разделы хаба"
                >
                  {HUB_TABS.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      role="tab"
                      aria-selected={hubTab === t.id}
                      className={`roulette-hub__tab${hubTab === t.id ? " is-active" : ""}`}
                      onClick={() => {
                        if (hubTab === t.id) {
                          playUiClick(0.6);
                          return;
                        }
                        void primeUiAudio();
                        playUiTab();
                        setHubTab(t.id);
                      }}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
                <div
                  className="roulette-hub__body"
                  role="tabpanel"
                  data-tab={hubTab}
                >
                  <RouletteHubPanels
                    tab={hubTab}
                    params={baseParams}
                    seed={seed}
                    unlocks={unlocks}
                    activePresetId={activePresetId}
                    media={media}
                    mediaCount={mediaCount}
                    favoritesCount={favoritesCount}
                    mediaLoading={mediaLoading}
                    mediaError={mediaError}
                    mediaSaveStatus={mediaSaveStatus}
                    playlistPreload={playlistPreload}
                    toys={toys}
                    onParams={onParams}
                    onSeed={onSeed}
                    onReroll={onReroll}
                    onApplyPreset={onApplyPreset}
                    onMedia={onMedia}
                    onLoadGelbooru={onLoadGelbooru}
                    onLoadMediaList={onLoadMediaList}
                    onAssembleMediaList={onAssembleMediaList}
                    mediaLists={mediaLists}
                    onPickLocal={onPickLocal}
                    onSaveMedia={onSaveMedia}
                    wd14Status={wd14Status}
                    tagProgress={tagProgress}
                    onStartWd14={onStartWd14}
                    onRefreshWd14={onRefreshWd14}
                    onToyOwned={onToyOwned}
                    contractSeed={contractSeed}
                    contractsRevision={contractsRevision}
                    onStartSessionSeed={onStartSessionSeed}
                    onStartMediaDrill={onStartMediaDrill}
                    onOpenContracts={onOpenContracts}
                    onOpenSession={onOpenSession}
                  />
                </div>
              </section>
            ) : null}

            {(phase === "spinning" || phase === "landed") && step ? (
              <ParamRoulette
                key={`${step.id}-${targetId}`}
                titleRu={step.titleRu}
                options={step.options}
                targetId={targetId}
                spinning={phase === "spinning"}
                onSpinDone={onSpinDone}
                stepIndex={stepIndex}
                stepTotal={steps.length}
                landedLabel={
                  phase === "landed" && picks[step.id]
                    ? picks[step.id]!.labelRu
                    : null
                }
                sealedPhraseRu={
                  contractSeed &&
                  sessionSeedLocksRouletteStep(contractSeed, step.id)
                    ? sealedFatePhraseForSeed(contractSeed, mistress.id)
                    : null
                }
              />
            ) : null}

            {phase === "ready" && result ? (
              <div className="roulette-summary" key={result.tags}>
                <div className="roulette-summary__glow" aria-hidden />
                <div className="roulette-summary__head">
                  <div className="roulette-summary__titles">
                    <p className="roulette-summary__eyebrow">Расклад готов</p>
                    <h2>{mistress.displayNameRu} решила</h2>
                  </div>
                  {moodLabel ? (
                    <span
                      className={`roulette-summary__mood is-${result.mood}`}
                    >
                      {moodLabel}
                    </span>
                  ) : null}
                </div>

                <div className="roulette-summary__hero" aria-label="Главное">
                  {summaryHero.map((stat, i) => (
                    <div
                      key={stat.k}
                      className="roulette-summary__stat"
                      style={{ ["--cell-i" as string]: i }}
                    >
                      <span className="roulette-summary__stat-k">{stat.k}</span>
                      <span className="roulette-summary__stat-v">{stat.v}</span>
                    </div>
                  ))}
                </div>

                <div className="roulette-summary__mid">
                  {verdictPack ? (
                    <section className="roulette-summary__verdict">
                      <p className="roulette-summary__section-k">Её приговор</p>
                      <div className="roulette-summary__verdict-face">
                        <div className="roulette-summary__verdict-portrait">
                          <img
                            className="roulette-summary__verdict-portrait-img"
                            src={verdictPack.portraitSrc}
                            alt={verdictPack.faceLabel}
                            draggable={false}
                          />
                        </div>
                        <div className="roulette-summary__verdict-face-text">
                          <span className="roulette-summary__verdict-react">
                            {verdictPack.faceLabel}
                          </span>
                          <p className="roulette-summary__verdict-text">
                            {verdictPack.line.text}
                          </p>
                        </div>
                      </div>
                      <div className="roulette-summary__verdict-orders">
                        <p className="roulette-summary__section-k">
                          Первые приказы
                        </p>
                        <ol>
                          {verdictPack.orders.map((order, i) => (
                            <li key={i}>{order}</li>
                          ))}
                        </ol>
                      </div>
                      <div
                        className="roulette-summary__verdict-meters"
                        aria-label="Накал расклада"
                      >
                        {verdictPack.meters.map((m) => (
                          <div
                            key={m.id}
                            className={`roulette-summary__meter is-${m.id}`}
                          >
                            <div className="roulette-summary__meter-top">
                              <span>{m.label}</span>
                              <em>{m.value}/5</em>
                            </div>
                            <div
                              className="roulette-summary__meter-track"
                              aria-hidden
                            >
                              {Array.from({ length: 5 }, (_, i) => (
                                <i
                                  key={i}
                                  className={
                                    i < m.value ? "is-on" : undefined
                                  }
                                />
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>
                  ) : null}

                  {summaryExtras.length > 0 ? (
                    <section className="roulette-summary__awaits">
                      <p className="roulette-summary__section-k">В раскладе</p>
                      <ul className="roulette-summary__chips">
                        {summaryExtras.map((h, i) => (
                          <li
                            key={h.id}
                            className="roulette-summary__chip"
                            style={{ ["--cell-i" as string]: i + 4 }}
                            title={h.title}
                          >
                            <span>{h.title}</span>
                            <strong>{h.label}</strong>
                          </li>
                        ))}
                      </ul>
                    </section>
                  ) : null}
                </div>

                <div
                  className="roulette-summary__cell roulette-summary__cell--wide roulette-summary__tags-wrap"
                  style={{
                    ["--cell-i" as string]: summaryExtras.length + 6,
                  }}
                >
                  <span className="roulette-summary__k">Теги booru</span>
                  <code className="roulette-summary__tags">{result.tags}</code>
                </div>

                <div className="roulette-summary__actions">
                  <button
                    type="button"
                    className="roulette-summary__cta"
                    disabled={busy}
                    onClick={() => void confirmAndStart()}
                  >
                    <span className="roulette-summary__cta-main">
                      Подчинись раскладу
                    </span>
                    <span className="roulette-summary__cta-sub">
                      Соберу сессию и запущу
                    </span>
                  </button>
                  <button
                    type="button"
                    className="btn-ghost roulette-summary__reroll"
                    disabled={busy}
                    onClick={() => startSequence("restart")}
                  >
                    Крутить заново
                  </button>
                </div>
              </div>
            ) : null}

            {phase === "building" ? (
              <div className="roulette-building">
                <div className="roulette-building__spinner" aria-hidden />
                <p>Собираю блоки и тяну контент с booru…</p>
              </div>
            ) : null}

            {error ? <p className="form-error">{error}</p> : null}
          </div>

          <aside
            className="roulette-avatar"
            aria-label={mistress.displayNameRu}
          >
            <button
              type="button"
              className="roulette-avatar__hit"
              onClick={() => {
                say(pickRouletteAvatarClickLine());
                if (phase === "idle") scheduleIdleWait();
              }}
              aria-label={`Поговорить с ${mistress.displayNameRu}`}
            >
              <div
                className={[
                  "roulette-avatar__frame",
                  phase === "spinning" ? "is-spinning" : "",
                  phase === "landed" ? "is-landed" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <div className="roulette-avatar__glow" aria-hidden />
                <MistressImg
                  key={avatarSrc}
                  className="roulette-avatar__img"
                  src={avatarSrc}
                  alt={mistress.displayNameRu}
                  draggable={false}
                />
              </div>
            </button>

            <div
              className={[
                "roulette-speak",
                phase === "spinning" ? "is-spinning" : "",
                phase === "landed" ? "is-landed" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              aria-live="polite"
            >
              <div className="roulette-speak__body">
                <span className="roulette-speak__name">
                  {mistress.displayNameRu}
                  {speakMoodLabel ? (
                    <span className="roulette-speak__mood">
                      {speakMoodLabel}
                    </span>
                  ) : null}
                </span>
                <p className="roulette-speak__line" key={commentKey}>
                  <TypewriterText text={line.text} charMs={22} />
                </p>
              </div>
            </div>

            <MistressPicker
              locked={sessionLive || busy}
              unlocks={mistressUnlockSnapshotFrom({
                functionIds: unlocks.functionIds ?? [],
                modeIds: unlocks.modeIds,
                characterIds: unlocks.characterIds,
                tagPacks: unlocks.tagPacks ?? [],
                featureIds: unlocks.featureIds ?? [],
                chastitySessionsCompleted:
                  loadAchievements().counters.chastitySessionsCompleted ?? 0,
              })}
              onSwitched={onMistressSwitched}
            />
          </aside>
        </div>
      </div>
    </div>
  );
}
