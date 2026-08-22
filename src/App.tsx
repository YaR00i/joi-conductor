import {
  Component,
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ErrorInfo,
  type ReactNode,
} from "react";
import { EveningRouteOverlay } from "./components/EveningRouteOverlay";
import { SectionBriefingOverlay } from "./components/SectionBriefingOverlay";
import { SideNav, type NavId } from "./components/SideNav";
import { TitleBar } from "./components/TitleBar";
import type { VibeHudDeviceInfo, VibeHudState } from "./components/VibeHud";
import { DebugAvatar, type AvatarSnapshot } from "./lib/avatar/debugAvatar";
import {
  fallbackModeForMistress,
  getActiveMistress,
  initActiveMistress,
  isModeAllowedForMistress,
  setActiveMistress,
  subscribeActiveMistress,
  type MistressPack,
} from "./lib/mistress";
import { getActiveMoodLines } from "./lib/voice/moodLines";
import {
  functions,
  patterns,
  sanitizeSessionParams,
  toys as catalogToys,
} from "./lib/catalog";
import { buildQueue } from "./lib/conductor";
import {
  applyProposalToParams,
  CONTROL_CHANGED_EVENT,
  loadControlState,
  saveControlMood,
} from "./lib/soul/control";
import { moodFromScore, scoreFromMood } from "./lib/moodEngine";
import { setCageLock } from "./lib/cageTimer";
import { notifyCageLockChanged } from "./components/CageLockPill";
import { notifyDenialQuestChanged } from "./components/DenialQuestPill";
import { setDenialQuest } from "./lib/denialQuest";
import { SessionEventBus } from "./lib/eventBus";
import {
  clearSessionCheckpoint,
  formatCheckpointAge,
  loadSessionCheckpoint,
  saveSessionCheckpoint,
  type SessionCheckpoint,
} from "./lib/sessionCheckpoint";
import {
  markEveningRouteCompleted,
  markEveningRouteDismissed,
  shouldShowEveningRoute,
} from "./lib/eveningRoute";
import {
  isBriefableNav,
  markSectionBriefingCompleted,
  markSectionBriefingDismissed,
  shouldShowSectionBriefing,
  type BriefableNavId,
} from "./lib/sectionBriefings";
import {
  fetchGelbooruFlexible,
  filterMediaByKinds,
  filterMediaByTagsStrict,
  namespaceMediaItems,
  loadMediaPlaylist,
  loadMediaSettings,
  mediaFromFilesWithBlobs,
  revokeLocalMedia,
  saveMediaLibrary,
  saveMediaSettings,
  shuffleMediaItems,
  type MediaItem,
  type MediaSettings,
} from "./lib/media";
import {
  getWd14Status,
  startWd14Server,
  tagMediaItems,
  type TagProgress,
  type Wd14Status,
} from "./lib/wd14Tagger";
import {
  preloadEntirePlaylist,
  releaseMediaPreloadIds,
  retainMediaPreloadIds,
  subscribePlaylistPreload,
  warmSessionMedia,
  type PlaylistPreloadStatus,
} from "./lib/mediaPreload";
import {
  captureDiarySouvenirDataUrl,
  captureSouvenirFromStageDom,
} from "./lib/diarySouvenirCapture";
import { fetchCumplayMediaCache } from "./lib/cumplayMediaCache";
import {
  buildSkipTagWagers,
  buildTasteWagers,
  loadFavoriteTasteProfile,
} from "./lib/favoriteTagTaste";
import {
  appendSessionSkipWagers,
  clearSessionSkipWagers,
  setTasteWagerPrompts,
} from "./lib/mistressPrompts";
import {
  addFavoriteFromItem,
  countFavorites,
  EMPTY_FAVORITES_INDEX,
  getFavoritesIndex,
  loadFavoritesAsMedia,
  mediaMatchesFavorite,
  removeFavoriteForItem,
  revokeFavoriteMedia,
  type FavoritesIndex,
} from "./lib/mediaFavorites";
import {
  isMetronomeMuted,
  primeMetronome,
  setMetronomeMuted,
  setMetronomeVolume,
} from "./lib/metronome";
import { syncVibeHumMute, syncVibeHumVolume } from "./lib/vibeHum";
import {
  connectDevice,
  setDeviceVibeLevel,
  stopDevice,
  subscribeDeviceStatus,
} from "./lib/device/deviceClient";
import { loadDeviceSettings } from "./lib/device/deviceSettings";
import {
  shouldRestoreDeviceOnResume,
  shouldStopDeviceOnEvent,
  shouldStopOnBlockStart,
} from "./lib/device/deviceSession";
import type { Preflight } from "./lib/preflight";
import {
  SUNNA_PREP_STEPS,
  sunnaPrepComplete,
  type SunnaPrepStep,
} from "./lib/preflight";
import type { IdolBuzzHoldMode } from "./lib/idolHits";
import { applyPreset } from "./lib/presets";
import {
  buildSessionExport,
  downloadSessionJson,
} from "./lib/sessionExport";
import { SessionRuntime } from "./lib/sessionRuntime";
import {
  loadToyOwnedOverrides,
  resolveToys,
  saveToyOwnedOverrides,
  setToyOwned,
} from "./lib/toyInventory";
import { isToyAllowedInSession } from "./lib/toyRoulette";
import { equipToy, initialEquippedFromAllowed } from "./lib/toyLoadout";
import {
  DEFAULT_PARAMS,
  type Emotion,
  type SessionEvent,
  type SessionMood,
  type SessionParams,
  type SessionState,
  type ToyDef,
  type VibeLevel,
} from "./lib/types";
import { getVibeProfile } from "./lib/vibeProfiles";
import { LocalLlmVoice, type VoiceActivity } from "./lib/voice/localLlmVoice";
import { ensureSovitsAutoStart } from "./lib/voice/sovitsAutoStart";
import { ensureQwenAutoStart } from "./lib/voice/qwenAutoStart";
import { SpeechTts } from "./lib/voice/speechTts";
import { TemplateVoice } from "./lib/voice/templateVoice";
import { translateCaptionGoogleRu } from "./lib/voice/translateToRu";
import {
  loadVoiceSettings,
  saveVoiceSettings,
  seedMistressClonePrompt,
  setMistressVoiceTuning,
  withMistressVoice,
  type VoiceSettings,
} from "./lib/voiceSettings";
import {
  ensureAchievementsMigrated,
  loadAchievements,
  syncMistressUnlockAchievements,
} from "./lib/achievements";
import { computeSessionEndProgress } from "./lib/sessionEndProgress";
import { AchievementsPage } from "./pages/AchievementsPage";
import { FavoritesPage } from "./pages/FavoritesPage";
import { ContractMediaDrillHud } from "./components/ContractMediaDrillHud";
import { ContractsPage } from "./pages/ContractsPage";
import { DiaryPage } from "./pages/DiaryPage";
import { ChatPage } from "./pages/ChatPage";
import { chatCheckInOverdue } from "./components/CheckInPill";
import { StatsPage } from "./pages/StatsPage";
import { RoulettePage } from "./pages/RoulettePage";
import { SessionPage, type SessionSpeech } from "./pages/SessionPage";
import { ShopPage } from "./pages/ShopPage";
import { SettingsPage } from "./pages/SettingsPage";
import { MinigamesPage } from "./pages/MinigamesPage";
import { SessionDebriefSheet } from "./components/SessionDebriefSheet";
import { AbortDebriefSheet } from "./components/AbortDebriefSheet";
import {
  buildAbortDebrief,
  buildSessionDebrief,
  type AbortDebrief,
  type SessionDebrief,
  type SessionDebriefContract,
} from "./lib/sessionDebrief";
import {
  countOpenContracts,
  ensureDailyContractBoard,
  findContract,
  reportContract,
  type ContractInstance,
} from "./lib/contracts/dailyBoard";
import {
  buildMediaDrillSessionBridgeFlash,
  loadActiveMediaDrill,
  mediaDrillAllowsSessionBridge,
  mediaDrillSessionTagHint,
  setMediaDrillStatus,
  startMediaDrillFromContract,
} from "./lib/contracts/mediaDrill";
import { planAcceptSessionSeed } from "./lib/contracts/acceptSessionSeedPlan";
import {
  planSessionSeedEndSettle,
  sessionSeedEndDebrief,
  sessionSeedEndDoneFlashRu,
  sessionSeedEndFailedFlashRu,
} from "./lib/contracts/sessionSeedEndSettle";
import {
  evaluateWearTimerTick,
  wearTimerDoneFlashRu,
  wearTimerFailFlashRu,
} from "./lib/contracts/wearTimerContractTick";
import {
  applySessionSeedToParams,
  clearActiveSessionSeed,
  clearActiveSessionSeedWithSideEffects,
  loadActiveSessionSeed,
  pruneStaleSessionSeedDetailed,
  saveActiveSessionSeed,
  startSessionSeedFromContract,
  updateActiveSessionSeed,
  type ActiveSessionSeed,
} from "./lib/contracts/sessionSeed";
import {
  cumplayMediaDeckKey,
  cumplayResumeDeckKey,
  isMainMediaDeckKey,
  nextMainMediaDeckKey,
  questMediaDeckKey,
  questResumeDeckKey,
  resolveMainResumeIndex,
  shouldTopUpMainMediaDeck,
  type MainDeckResumeCursor,
} from "./lib/mediaDeckOrchestration";
import {
  armSeedOnReleaseRitual,
  buildCbtQuestFlash,
  buildContractProgressFlash,
  cbtQuestDoneRestyleRu,
  completeHandsOffRestStep,
  CONTRACT_HANDS_OFF_BLOCK_PREFIX,
  CONTRACT_PROGRESS_FLASH_MS,
  denialHoursUntilDeadline,
  failHandsOffOnUnauthorized,
  isContractEatStepId,
  isContractHandsOffBlockId,
  isContractOpenStepId,
  noteCumplayAnswerOnCeiSeed,
  noteEdgeDoneOnSeed,
  noteQuestCompletedOnSeed,
  noteUnauthorizedOnSeed,
  ruinEatRestyleRu,
  seedIsCbtQuestLive,
  seedIsRuinEatLive,
  seedLiveProgressOpen,
  shouldRestyleCumplayEat,
} from "./lib/contracts/sessionContractLive";
import type { ContractProgressFlash } from "./components/QuestStack";
import type { PlanRouletteResult } from "./lib/planRoulette";
import { extractDiaryPlanReplay } from "./lib/diaryPlanReplay";
import {
  appendDiaryEntry,
  buildDiaryEntry,
  loadDiaryEntries,
  type DiaryEntry,
  type DiarySessionMeta,
} from "./lib/sessionDiary";
import {
  formatSanitizeMessage,
  sanitizeMediaTagsForUnlocks,
  sanitizeModeForUnlocks,
  sanitizeMoodForUnlocks,
  type TagSanitizeResult,
} from "./lib/contentUnlocks";
import {
  applyMediaTypeQuery,
  kindsForMediaType,
} from "./lib/mediaTypeFilter";
import {
  hasMoreShopOffersFromFavorites,
  loadMoreShopOffersFromFavorites,
  mergeShopOffers,
  searchPurchasableFavoriteOffers,
  syncShopOffersFromFavorites,
} from "./lib/shopOffersFromFavorites";
import {
  consumeBegBonus,
  consumeCumBoost,
  contentUnlocksFromWallet,
  creditCinders,
  CUM_BOOST_DELTA,
  debitCinders,
  loadWallet,
  mistressUnlockSnapshotFromWallet,
  PROMPT_BRIBE_COST,
  purchaseShopItem,
  saveWallet,
  spendCinders,
  tagPackTags,
  type WalletState,
} from "./lib/wallet";

const LazyEmberPlayPage = lazy(() =>
  import("./pages/EmberPlayPage").then((module) => ({
    default: module.EmberPlayPage,
  })),
);
const LazyEmberEditorPage = lazy(() =>
  import("./pages/EmberEditorPage").then((module) => ({
    default: module.EmberEditorPage,
  })),
);

function EmberRouteFallback() {
  return (
    <div className="page page--ember" aria-busy="true" aria-live="polite">
      <div className="empty-state">Загрузка Ember…</div>
    </div>
  );
}

class EmberLazyBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Ember chunk failed to load", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="page page--ember">
        <div className="empty-state">
          <strong>Не удалось загрузить раздел Ember</strong>
          <span>{this.state.error.message}</span>
          <button type="button" onClick={() => window.location.reload()}>
            Повторить после перезапуска
          </button>
        </div>
      </div>
    );
  }
}

initActiveMistress(mistressUnlockSnapshotFromWallet());

const NAV_COLLAPSED_KEY = "joi-conductor-nav-collapsed";

function resolveMediaTypeId(
  settings: MediaSettings,
): MediaSettings["mediaTypeId"] {
  return settings.mediaTypeId ?? "all";
}

function filterPlaylistByMediaType(
  items: MediaItem[],
  typeId: MediaSettings["mediaTypeId"],
  fallback = false,
): MediaItem[] {
  const filtered = filterMediaByKinds(items, kindsForMediaType(typeId));
  if (filtered.length > 0) return filtered;
  return fallback ? items : filtered;
}

export function App() {
  const [nav, setNav] = useState<NavId>("roulette");
  const [fullscreen, setFullscreen] = useState(false);
  const [eveningRouteOpen, setEveningRouteOpen] = useState(() =>
    shouldShowEveningRoute(),
  );
  const [activeSectionBriefing, setActiveSectionBriefing] =
    useState<BriefableNavId | null>(null);
  const skippedSectionBriefingsRef = useRef<Set<BriefableNavId>>(new Set());
  const [navCollapsed, setNavCollapsed] = useState(() => {
    try {
      return localStorage.getItem(NAV_COLLAPSED_KEY) === "1";
    } catch {
      return false;
    }
  });

  function toggleFullscreen() {
    const desktop = window.joiDesktop;
    if (desktop?.toggleFullScreen) {
      void desktop.toggleFullScreen().then((on) => {
        setFullscreen(Boolean(on) || Boolean(document.fullscreenElement));
      });
      return;
    }
    if (!document.fullscreenElement) {
      void document.documentElement.requestFullscreen?.();
    } else {
      void document.exitFullscreen?.();
    }
  }

  useEffect(() => {
    const desktop = window.joiDesktop;
    let nativeFs = false;

    const syncUi = (native?: boolean) => {
      if (typeof native === "boolean") nativeFs = native;
      setFullscreen(nativeFs || Boolean(document.fullscreenElement));
    };

    void desktop?.isFullScreen?.().then((v) => syncUi(Boolean(v)));
    const offNative = desktop?.onFullScreen?.((v) => syncUi(v));

    function onDomFs() {
      syncUi();
    }
    document.addEventListener("fullscreenchange", onDomFs);

    // Browser / non-Electron only — Electron F11 is handled in main process.
    function onKey(e: KeyboardEvent) {
      if (e.key !== "F11") return;
      if (desktop?.toggleFullScreen) return;
      e.preventDefault();
      toggleFullscreen();
    }
    window.addEventListener("keydown", onKey, true);

    return () => {
      offNative?.();
      document.removeEventListener("fullscreenchange", onDomFs);
      window.removeEventListener("keydown", onKey, true);
    };
  }, []);
  const [params, setParams] = useState<SessionParams>(DEFAULT_PARAMS);
  const [seed, setSeed] = useState(() => Date.now() % 1_000_000);
  const [toyOverrides, setToyOverrides] = useState(loadToyOwnedOverrides);
  const effectiveToys = useMemo(
    () => resolveToys(catalogToys, toyOverrides),
    [toyOverrides],
  );

  const [queue, setQueue] = useState(() =>
    buildQueue(
      DEFAULT_PARAMS,
      { functions, patterns, toys: resolveToys(catalogToys) },
      Date.now() % 1_000_000,
      { unlocks: loadWallet().unlocks },
    ),
  );
  const [state, setState] = useState<SessionState | null>(null);
  const [speechQueue, setSpeechQueue] = useState<SessionSpeech[]>([]);
  const speechIdRef = useRef(0);
  const speechTimersRef = useRef<
    Map<number, { handle: number; due: number }>
  >(new Map());
  const translateAbortRef = useRef<AbortController | null>(null);
  const presentLineRef = useRef<
    (
      english: string,
      meta: {
        emotion: Emotion;
        gesture?: string;
        durationMs?: number;
        source?: "llm" | "template";
      },
    ) => void
  >(() => {});
  const [voiceActivity, setVoiceActivity] = useState<VoiceActivity>({
    phase: "idle",
  });
  const [pulse, setPulse] = useState(0);
  const [lastAccent, setLastAccent] = useState(2);
  const [vibeHud, setVibeHud] = useState<VibeHudState | null>(null);
  const [vibeHudDevice, setVibeHudDevice] = useState<VibeHudDeviceInfo | null>(
    null,
  );
  const vibeHudRef = useRef<VibeHudState | null>(null);
  vibeHudRef.current = vibeHud;
  const [muted, setMuted] = useState(() => isMetronomeMuted());

  const [mediaSettings, setMediaSettings] = useState<MediaSettings>(() => {
    const settings = loadMediaSettings();
    setMetronomeVolume(settings.sfxVolume);
    return settings;
  });
  const [mediaItems, setMediaItems] = useState<MediaItem[]>(() => {
    const settings = loadMediaSettings();
    if (settings.source !== "gelbooru") return [];
    return loadMediaPlaylist();
  });
  const [mediaLoading, setMediaLoading] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [mediaSaveStatus, setMediaSaveStatus] = useState<string | null>(null);
  const mediaSaveTimerRef = useRef(0);
  const [wd14Status, setWd14Status] = useState<Wd14Status | null>(null);
  const [tagProgress, setTagProgress] = useState<TagProgress | null>(null);
  const localFilesRef = useRef<File[]>([]);

  const refreshWd14Status = useCallback(async () => {
    const st = await getWd14Status(mediaSettings.wd14Url);
    setWd14Status(st);
    return st;
  }, [mediaSettings.wd14Url]);

  const startWd14FromUI = useCallback(async () => {
    const st = await startWd14Server({ baseUrl: mediaSettings.wd14Url });
    setWd14Status(st);
    return st;
  }, [mediaSettings.wd14Url]);
  const [playlistPreload, setPlaylistPreload] =
    useState<PlaylistPreloadStatus>(() => ({
      active: false,
      total: 0,
      ready: 0,
      failed: 0,
      done: 0,
      percent: 0,
    }));

  useEffect(() => subscribePlaylistPreload(setPlaylistPreload), []);

  useEffect(() => {
    return subscribeDeviceStatus((st) => {
      setVibeHudDevice({
        connected: st.state === "connected",
        backend: st.backend,
        intensity: st.intensity,
        detailRu: st.detailRu,
      });
    });
  }, []);

  useEffect(() => {
    const settings = loadDeviceSettings();
    if (!settings.autoConnect) return;
    void connectDevice({
      backend: settings.backend,
      lovenseBaseUrl: settings.lovenseBaseUrl,
      buttplugUrl: settings.buttplugUrl,
    });
  }, []);

  const [currentMedia, setCurrentMedia] = useState<MediaItem | null>(null);
  const currentMediaRef = useRef<MediaItem | null>(null);
  currentMediaRef.current = currentMedia;
  /** Shuffled copy for this session — library order on Today stays intact. */
  const [sessionPlaylist, setSessionPlaylist] = useState<MediaItem[] | null>(
    null,
  );
  const sessionPlaylistRef = useRef(sessionPlaylist);
  sessionPlaylistRef.current = sessionPlaylist;
  /** Temporary Gelbooru set from a mistress wager — does not overwrite saved playlist. */
  const [sessionMediaOverlay, setSessionMediaOverlay] = useState<
    MediaItem[] | null
  >(null);
  const sessionMediaOverlayRef = useRef(sessionMediaOverlay);
  sessionMediaOverlayRef.current = sessionMediaOverlay;
  /** Temporary tagged cache while a Hu Tao quest block is live. */
  const [questMediaOverlay, setQuestMediaOverlay] = useState<MediaItem[] | null>(
    null,
  );
  const questMediaOverlayRef = useRef(questMediaOverlay);
  questMediaOverlayRef.current = questMediaOverlay;
  const [questMediaLoading, setQuestMediaLoading] = useState(false);
  const [questCacheReady, setQuestCacheReady] = useState(false);
  const questMediaGenRef = useRef(0);
  /** Prefetch started on accept — applied when quest block starts. */
  const questPrefetchRef = useRef<{
    offerId: string;
    items: MediaItem[] | null;
  } | null>(null);
  /** When set, prefetch completion should swap the stage to this offer. */
  const questAwaitApplyRef = useRef<string | null>(null);
  /** Temporary cumplay deck (character × cum tags) while ritual is live. */
  const [cumplayMediaOverlay, setCumplayMediaOverlay] = useState<
    MediaItem[] | null
  >(null);
  const cumplayMediaOverlayRef = useRef(cumplayMediaOverlay);
  cumplayMediaOverlayRef.current = cumplayMediaOverlay;
  const cumplayMediaGenRef = useRef(0);
  const cumplayPrefetchRef = useRef<MediaItem[] | null>(null);
  const cumplayAwaitApplyRef = useRef(false);
  const cumplayFetchInFlightRef = useRef(false);
  /** Forces MediaStage remount when switching main ↔ quest ↔ wager decks. */
  const [mediaDeckKey, setMediaDeckKey] = useState("main");
  const mediaDeckKeyRef = useRef(mediaDeckKey);
  mediaDeckKeyRef.current = mediaDeckKey;
  const mediaTopUpInFlightRef = useRef(false);
  const mediaTopUpCooldownUntilRef = useRef(0);
  /** Live cursor on the main session deck (updated while key is main). */
  const mainDeckCursorRef = useRef<{ index: number; itemId: string | null }>({
    index: 0,
    itemId: null,
  });
  /** Snapshot taken when leaving main for a quest / temporary overlay. */
  const savedMainResumeRef = useRef<{ index: number; itemId: string | null }>({
    index: 0,
    itemId: null,
  });
  const [mainStartIndex, setMainStartIndex] = useState(0);
  /** Live Gelbooru query tags for the session (updates on wager cache swap). */
  const sessionMediaTagsRef = useRef(mediaSettings.tags);
  /** Remount epoch so resume after quest always remounts MediaStage. */
  const mainDeckEpochRef = useRef(0);
  const [favoriteIndex, setFavoriteIndex] = useState<FavoritesIndex>(
    () => EMPTY_FAVORITES_INDEX,
  );
  const [favoritesCount, setFavoritesCount] = useState(0);
  const [favoriteBusy, setFavoriteBusy] = useState(false);
  const mediaItemsRef = useRef(mediaItems);
  mediaItemsRef.current = mediaItems;
  const mediaSettingsRef = useRef(mediaSettings);
  mediaSettingsRef.current = mediaSettings;

  const [preflight, setPreflight] = useState<Preflight>(null);
  const [activePresetId, setActivePresetId] = useState<string | null>("medium");
  const [avatarSnap, setAvatarSnap] = useState<AvatarSnapshot | null>(null);
  const [voiceSettings, setVoiceSettings] = useState(() => {
    const loaded = loadVoiceSettings();
    const pack = getActiveMistress();
    // Migrate legacy global knobs onto the active mistress once.
    const seeded =
      loaded.mistressTuning[pack.id]?.ttsRate != null ||
      loaded.mistressTuning[pack.id]?.ttsVolume != null
        ? loaded
        : setMistressVoiceTuning(loaded, pack.id, {
            ttsRate: loaded.ttsRate,
            ttsPitch: loaded.ttsPitch,
            ttsVolume: loaded.ttsVolume,
          });
    return withMistressVoice(seedMistressClonePrompt(seeded, pack), pack);
  });
  const voiceSettingsRef = useRef(voiceSettings);
  voiceSettingsRef.current = voiceSettings;
  const [voiceStatus, setVoiceStatus] = useState<string | null>(null);
  /** Crash / reload resume offer. */
  const [pendingCheckpoint, setPendingCheckpoint] =
    useState<SessionCheckpoint | null>(() => loadSessionCheckpoint());
  /** Flash after unauthorized edge/ruin/cum (quota punishment). */
  const [punishNotice, setPunishNotice] = useState<string | null>(null);
  const punishNoticeTimerRef = useRef(0);
  const [wallet, setWallet] = useState<WalletState>(() => loadWallet());
  const walletRef = useRef(wallet);
  walletRef.current = wallet;
  const [cinderGain, setCinderGain] = useState<{
    key: number;
    amount: number;
    source: "quest" | "session";
  } | null>(null);
  const cinderGainKeyRef = useRef(0);
  /** Quest угольки credited mid-session — clawed back if session aborts. */
  const sessionQuestCindersRef = useRef(0);
  const pulseCinders = (amount: number, source: "quest" | "session") => {
    if (amount <= 0) return;
    cinderGainKeyRef.current += 1;
    setCinderGain({
      key: cinderGainKeyRef.current,
      amount,
      source,
    });
  };

  useEffect(() => {
    if (!cinderGain) return;
    const t = window.setTimeout(() => setCinderGain(null), 1600);
    return () => window.clearTimeout(t);
  }, [cinderGain]);
  const [unlockNotice, setUnlockNotice] = useState<string | null>(null);
  const [shopFavoritesHasMore, setShopFavoritesHasMore] = useState(false);

  async function refreshShopOffers() {
    try {
      const { state: next, changed } = await syncShopOffersFromFavorites(
        walletRef.current,
      );
      const state = changed ? next : walletRef.current;
      if (changed) setWallet(next);
      setShopFavoritesHasMore(await hasMoreShopOffersFromFavorites(state));
    } catch (err) {
      console.error("[shop] favorites offers sync failed", err);
    }
  }

  async function loadMoreFavoriteShopOffers(): Promise<{
    loaded: number;
    hasMore: boolean;
  }> {
    try {
      const { state: next, loaded } = await loadMoreShopOffersFromFavorites(
        walletRef.current,
      );
      if (loaded > 0) setWallet(next);
      const hasMore = await hasMoreShopOffersFromFavorites(
        loaded > 0 ? next : walletRef.current,
      );
      setShopFavoritesHasMore(hasMore);
      return { loaded, hasMore };
    } catch (err) {
      console.error("[shop] load more offers failed", err);
      return { loaded: 0, hasMore: shopFavoritesHasMore };
    }
  }

  async function searchFavoriteShopOffers(query: string): Promise<number> {
    try {
      const hits = await searchPurchasableFavoriteOffers(
        walletRef.current,
        query,
      );
      if (hits.length === 0) return 0;
      const next = mergeShopOffers(walletRef.current, hits);
      if (next !== walletRef.current) setWallet(next);
      return hits.length;
    } catch (err) {
      console.error("[shop] search offers failed", err);
      return 0;
    }
  }

  useEffect(() => {
    void refreshShopOffers();
  }, []);

  useEffect(() => {
    if (nav === "shop") void refreshShopOffers();
  }, [nav]);

  const eventLogRef = useRef<SessionEvent[]>([]);
  const pendingStartRef = useRef<{
    params: SessionParams;
    queue: ReturnType<typeof buildQueue>;
    seed: number;
    mood?: SessionMood;
    moodScore?: number;
    fetishPrefs?: Record<string, number>;
    begBonus?: number;
  } | null>(null);
  /** Consumable shop buffs applied at the start of the current session. */
  const [sessionActiveBuffs, setSessionActiveBuffs] = useState<{
    begBonus: number;
    cumBoost: number;
  }>({ begBonus: 0, cumBoost: 0 });
  const diaryMetaRef = useRef<DiarySessionMeta | null>(null);
  const diaryStartedAtRef = useRef<string | null>(null);
  const [diaryRevision, setDiaryRevision] = useState(0);
  const [achievementsRevision, setAchievementsRevision] = useState(0);
  const achievementsRef = useRef(
    ensureAchievementsMigrated(
      loadAchievements(),
      mistressUnlockSnapshotFromWallet(),
    ),
  );
  const [diaryCount, setDiaryCount] = useState(
    () => loadDiaryEntries().length,
  );
  const [contractsOpenCount, setContractsOpenCount] = useState(() =>
    countOpenContracts(ensureDailyContractBoard()),
  );
  const [chatWaiting, setChatWaiting] = useState(() => chatCheckInOverdue());
  const [contractsRevision, setContractsRevision] = useState(0);
  const [mediaDrillRevision, setMediaDrillRevision] = useState(0);
  const [sessionSeedRevision, setSessionSeedRevision] = useState(0);
  const [activeSessionSeed, setActiveSessionSeed] =
    useState<ActiveSessionSeed | null>(() =>
      pruneStaleSessionSeedDetailed((id) => findContract(id)).seed,
    );
  const [contractSessionFlash, setContractSessionFlash] = useState<
    string | null
  >(null);
  const [contractProgressFlash, setContractProgressFlash] =
    useState<ContractProgressFlash | null>(null);
  const contractProgressFlashTimerRef = useRef(0);
  /** Soft media-drill reminder already shown this session. */
  const mediaDrillBridgeFlashedRef = useRef(false);
  /** CBT contract already forced a ball_taps offer this session. */
  const cbtQuestForcedRef = useRef(false);
  const [sessionDebrief, setSessionDebrief] = useState<SessionDebrief | null>(
    null,
  );
  const [abortDebrief, setAbortDebrief] = useState<AbortDebrief | null>(null);
  const [contractsHighlightTitle, setContractsHighlightTitle] = useState<
    string | null
  >(null);

  async function refreshTasteFromFavorites(): Promise<Record<string, number>> {
    try {
      const profile = await loadFavoriteTasteProfile();
      const unlockedTags = walletRef.current.unlocks.unlockedTags ?? [];
      const { good, bad } = buildTasteWagers(profile, { unlockedTags });
      setTasteWagerPrompts(good, bad);
      return profile.prefsSeed;
    } catch {
      setTasteWagerPrompts([], []);
      return {};
    }
  }

  function onSessionSlideLeave(info: {
    item: MediaItem;
    dwellMs: number;
    reason: "auto" | "manual";
  }) {
    // Only manual quick skips count as "didn't like / scrolled past"
    if (info.reason !== "manual") return;
    if (info.dwellMs > 3200) return;
    const tags = (info.item.tags ?? "")
      .split(/\s+/)
      .map((t) => t.trim())
      .filter(Boolean);
    if (tags.length === 0) return;
    const liked = Object.entries(
      runtimeRef.current?.getState()?.fetishPrefs ?? {},
    )
      .filter(([, v]) => v > 0)
      .map(([k]) => k);
    const unlockedTags = walletRef.current.unlocks.unlockedTags ?? [];
    const defs = buildSkipTagWagers(tags, {
      likedTags: liked,
      unlockedTags,
      max: 4,
    });
    appendSessionSkipWagers(defs);
  }

  function isOnMainMediaDeck(): boolean {
    return isMainMediaDeckKey(mediaDeckKeyRef.current);
  }

  /** When under ~25% left, few slides remain, or a cycle wraps — fetch more. */
  function noteMainDeckProgress(info: {
    index: number;
    itemId: string | null;
  }) {
    if (!isOnMainMediaDeck()) return;
    mainDeckCursorRef.current = {
      index: info.index,
      itemId: info.itemId,
    };
  }

  function snapshotMainDeckForQuest() {
    if (!isOnMainMediaDeck()) return;
    const live = currentMediaRef.current;
    savedMainResumeRef.current = {
      index: mainDeckCursorRef.current.index,
      itemId: live?.id ?? mainDeckCursorRef.current.itemId,
    };
  }

  function resumeMainMediaDeck() {
    const restore = sessionPlaylistRef.current ?? mediaItemsRef.current;
    const resumeAt = resolveMainResumeIndex(
      restore,
      savedMainResumeRef.current as MainDeckResumeCursor,
    );
    mainDeckEpochRef.current += 1;
    setMainStartIndex(resumeAt);
    mainDeckCursorRef.current = {
      index: resumeAt,
      itemId: restore[resumeAt]?.id ?? null,
    };
    setMediaDeckKey(nextMainMediaDeckKey(mainDeckEpochRef.current, resumeAt));
    if (restore.length > 0) {
      retainMediaPreloadIds(restore.map((i) => i.id));
      warmSessionMedia(restore, { preserveExisting: true });
      // Drop sticky pins from overlays once main is warm again.
      releaseMediaPreloadIds();
      retainMediaPreloadIds(restore.map((i) => i.id));
    }
  }

  async function maybeTopUpMainMediaCache(info: {
    index: number;
    deckLength: number;
    unviewedRemaining: number;
    unviewedRatio: number;
    itemId: string | null;
    cycled?: boolean;
  }) {
    noteMainDeckProgress(info);
    if (!shouldTopUpMainMediaDeck(info)) return;
    if (!isOnMainMediaDeck()) return;
    if (questMediaOverlayRef.current || cumplayMediaOverlayRef.current) return;
    const settings = mediaSettingsRef.current;
    if (settings.source !== "gelbooru" && settings.source !== "favorites") return;
    if (!sessionPlaylistRef.current) return;
    const status = runtimeRef.current?.getState()?.status;
    if (status !== "running" && status !== "paused") return;
    if (mediaTopUpInFlightRef.current) return;
    if (performance.now() < mediaTopUpCooldownUntilRef.current) return;

    mediaTopUpInFlightRef.current = true;
    try {
      if (settings.source === "favorites") {
        const current = sessionPlaylistRef.current ?? [];
        const typeId = resolveMediaTypeId(settings);
        const freshRaw = await loadFavoritesAsMedia({
          offset: current.length,
          limit: 80,
        });
        const fresh = filterPlaylistByMediaType(freshRaw, typeId);
        if (fresh.length === 0) {
          mediaTopUpCooldownUntilRef.current = performance.now() + 60_000;
          return;
        }
        const nextSession = [...current, ...fresh];
        sessionPlaylistRef.current = nextSession;
        setSessionPlaylist(nextSession);
        mediaItemsRef.current = nextSession;
        setMediaItems(nextSession);
        warmSessionMedia(nextSession);
        return;
      }

      const batch = Math.max(16, Math.min(40, settings.limit || 24));
      const typeId = resolveMediaTypeId(settings);
      const queryTags = applyMediaTypeQuery(
        sessionMediaTagsRef.current || settings.tags,
        typeId,
      );
      const flex = await fetchGelbooruFlexible(queryTags, batch, {
        userId: settings.gelbooruUserId,
        apiKey: settings.gelbooruApiKey,
      });
      const have = new Set<string>();
      for (const item of mediaItemsRef.current) have.add(item.id);
      for (const item of sessionPlaylistRef.current ?? []) have.add(item.id);
      const fresh = shuffleMediaItems(
        filterPlaylistByMediaType(
          flex.items.filter((item) => !have.has(item.id)),
          typeId,
        ),
      );
      if (fresh.length === 0) {
        mediaTopUpCooldownUntilRef.current = performance.now() + 45_000;
        return;
      }

      const nextLibrary = [...mediaItemsRef.current, ...fresh];
      mediaItemsRef.current = nextLibrary;
      setMediaItems(nextLibrary);
      saveMediaLibrary(settings, nextLibrary);

      const nextSession = [...(sessionPlaylistRef.current ?? []), ...fresh];
      sessionPlaylistRef.current = nextSession;
      setSessionPlaylist(nextSession);
      warmSessionMedia(nextSession);
    } catch {
      mediaTopUpCooldownUntilRef.current = performance.now() + 20_000;
    } finally {
      mediaTopUpInFlightRef.current = false;
    }
  }

  async function captureDiaryResultImage(): Promise<void> {
    if (diaryMetaRef.current?.resultImageUrl?.startsWith("data:image/")) {
      return;
    }
    const dataUrl = await captureDiarySouvenirDataUrl(currentMediaRef.current);
    if (!dataUrl) return;
    diaryMetaRef.current = {
      ...(diaryMetaRef.current ?? {}),
      resultImageUrl: dataUrl,
    };
  }

  const busRef = useRef(new SessionEventBus());
  const runtimeRef = useRef<SessionRuntime | null>(null);
  const avatarRef = useRef(new DebugAvatar());
  const llmVoiceRef = useRef<LocalLlmVoice | null>(null);
  const ttsRef = useRef(new SpeechTts());
  const moodRef = useRef(getActiveMoodLines().defaultMood);
  const toysRef = useRef<ToyDef[]>(effectiveToys);
  toysRef.current = effectiveToys;
  const templateVoiceRef = useRef<TemplateVoice | null>(null);

  useEffect(() => {
    runtimeRef.current?.setCatalog({
      functions,
      patterns,
      toys: effectiveToys,
    });
    runtimeRef.current?.setUnlocks(wallet.unlocks);
  }, [effectiveToys, wallet.unlocks]);

  useEffect(() => {
    const sync = () => setChatWaiting(chatCheckInOverdue());
    sync();
    const id = window.setInterval(sync, 15_000);
    window.addEventListener(CONTROL_CHANGED_EVENT, sync);
    return () => {
      window.clearInterval(id);
      window.removeEventListener(CONTROL_CHANGED_EVENT, sync);
    };
  }, []);

  const fnById = useMemo(
    () => new Map(functions.map((f) => [f.id, f] as const)),
    [],
  );
  const patById = useMemo(
    () => new Map(patterns.map((p) => [p.id, p] as const)),
    [],
  );

  useEffect(() => {
    initActiveMistress(mistressUnlockSnapshotFromWallet());
    const templates = new TemplateVoice({
      bible: getActiveMistress().bible,
      getMood: () => moodRef.current,
    });
    templateVoiceRef.current = templates;
    const llm = new LocalLlmVoice({
      endpoint: voiceSettings.endpoint,
      model: voiceSettings.model,
      timeoutMs: voiceSettings.timeoutMs,
      enabled: voiceSettings.mode === "llm",
      bible: getActiveMistress().bible,
      fallback: templates,
      emit: (event) => busRef.current.emit(event),
      onActivity: (activity) => {
        setVoiceActivity(activity);
        if (activity.phase === "thinking") {
          translateAbortRef.current?.abort();
          translateAbortRef.current = null;
          for (const t of speechTimersRef.current.values()) {
            window.clearTimeout(t.handle);
          }
          speechTimersRef.current.clear();
          setSpeechQueue([]);
          ttsRef.current.stop();
        }
      },
    });
    llmVoiceRef.current = llm;

    const unsubMistress = subscribeActiveMistress((pack) => {
      templates.setBible(pack.bible);
      llm.configure({ bible: pack.bible });
      moodRef.current = pack.moodLines.defaultMood;
      setVoiceSettings((s) => withMistressVoice(s, pack));
      setContractsRevision((n) => n + 1);
      setContractsOpenCount(
        countOpenContracts(ensureDailyContractBoard()),
      );
    });

    const runtime = new SessionRuntime(busRef.current, llm);
    runtime.setCatalog({
      functions,
      patterns,
      toys: toysRef.current,
    });
    runtimeRef.current = runtime;
    const unsubState = runtime.subscribe((next) => {
      moodRef.current = next.mood;
      setState(next);
    });
    const unsubAvatar = avatarRef.current.subscribe(setAvatarSnap);

    const SPEECH_FADE_MS = 1300;
    /** Superseded lines start fading after this linger */
    const OLDER_LINGER_MS = 1800;
    /** Hard cap so a stuck latest line cannot linger forever */
    const LATEST_MAX_MS = 7000;

    const clearSpeechTimer = (id: number) => {
      const prev = speechTimersRef.current.get(id);
      if (prev) window.clearTimeout(prev.handle);
      speechTimersRef.current.delete(id);
    };

    const removeSpeech = (id: number) => {
      clearSpeechTimer(id);
      setSpeechQueue((q) => q.filter((line) => line.id !== id));
    };

    const beginFadeSpeech = (id: number) => {
      let shouldAnimate = false;
      setSpeechQueue((q) => {
        const line = q.find((l) => l.id === id);
        if (!line || line.fadingOut) return q;
        shouldAnimate = true;
        return q.map((l) => (l.id === id ? { ...l, fadingOut: true } : l));
      });
      if (!shouldAnimate) {
        clearSpeechTimer(id);
        return;
      }
      clearSpeechTimer(id);
      const handle = window.setTimeout(() => removeSpeech(id), SPEECH_FADE_MS);
      speechTimersRef.current.set(id, {
        handle,
        due: performance.now() + SPEECH_FADE_MS,
      });
    };

    /** Arm fade deadline; only pulls earlier, never postpones. */
    const armFade = (id: number, delayMs: number) => {
      const due = performance.now() + delayMs;
      const prev = speechTimersRef.current.get(id);
      if (prev && prev.due <= due) return;
      if (prev) window.clearTimeout(prev.handle);
      const handle = window.setTimeout(() => beginFadeSpeech(id), delayMs);
      speechTimersRef.current.set(id, { handle, due });
    };

    const presentLine = (
      english: string,
      meta: {
        emotion: Emotion;
        gesture?: string;
        durationMs?: number;
        source?: "llm" | "template";
      },
    ) => {
      translateAbortRef.current?.abort();
      const ac = new AbortController();
      translateAbortRef.current = ac;

      const id = ++speechIdRef.current;
      const wantRu = voiceSettingsRef.current.captionGoogleRu === true;
      const ttsDone = ttsRef.current.speakUntilDone(english, meta.emotion);

      const upsertLine = (patch: Omit<SessionSpeech, "id">) => {
        let superseded: number[] = [];
        let droppedIds: number[] = [];
        setSpeechQueue((q) => {
          const next = q.filter((line) => line.id !== id);
          next.push({ id, ...patch });
          const sliced = next.slice(-3);
          droppedIds = next
            .filter((line) => !sliced.some((l) => l.id === line.id))
            .map((line) => line.id);
          superseded = sliced
            .filter((line) => line.id !== id && !line.fadingOut)
            .map((line) => line.id);
          return sliced;
        });
        for (const droppedId of droppedIds) {
          clearSpeechTimer(droppedId);
        }
        for (const olderId of superseded) {
          armFade(olderId, OLDER_LINGER_MS);
        }
        if (!patch.fadingOut) {
          armFade(id, LATEST_MAX_MS);
        }
      };

      const showCaption = (caption: string) => {
        const typeMs = caption.length * 26;
        const shownAt = performance.now();
        upsertLine({
          text: caption,
          emotion: meta.emotion,
          gesture: meta.gesture,
          durationMs: 120_000,
          source: meta.source,
          translating: false,
          typewriter: true,
        });

        void (async () => {
          await ttsDone;
          if (ac.signal.aborted) {
            // Superseded by a newer line — older linger already armed.
            return;
          }
          const typedRemain = Math.max(
            0,
            typeMs - (performance.now() - shownAt),
          );
          const holdAfterMs = Math.max(900, typedRemain);
          armFade(id, holdAfterMs);
        })();
      };

      if (!wantRu) {
        showCaption(english);
        return;
      }

      upsertLine({
        text: "",
        emotion: meta.emotion,
        gesture: meta.gesture,
        durationMs: 120_000,
        source: meta.source,
        translating: true,
        typewriter: true,
      });

      void (async () => {
        let caption = english;
        try {
          caption = await translateCaptionGoogleRu(english, {
            signal: ac.signal,
            timeoutMs: 10_000,
          });
        } catch {
          if (ac.signal.aborted) return;
          caption = english;
        }
        if (ac.signal.aborted) return;
        showCaption(caption);
      })();
    };
    presentLineRef.current = presentLine;

    const clearQuestMediaDeck = () => {
      questMediaGenRef.current += 1;
      questPrefetchRef.current = null;
      questAwaitApplyRef.current = null;
      setQuestMediaOverlay(null);
      setQuestMediaLoading(false);
      setQuestCacheReady(false);
      if (cumplayMediaOverlayRef.current) {
        setMediaDeckKey(cumplayResumeDeckKey());
        warmSessionMedia(cumplayMediaOverlayRef.current);
        return;
      }
      resumeMainMediaDeck();
    };

    const clearCumplayMediaDeck = () => {
      cumplayMediaGenRef.current += 1;
      cumplayPrefetchRef.current = null;
      cumplayAwaitApplyRef.current = false;
      cumplayFetchInFlightRef.current = false;
      setCumplayMediaOverlay(null);
      if (questMediaOverlayRef.current) {
        setMediaDeckKey(
          questResumeDeckKey(questMediaOverlayRef.current[0]?.id),
        );
        warmSessionMedia(questMediaOverlayRef.current);
        return;
      }
      resumeMainMediaDeck();
    };

    const applyCumplayDeck = (items: MediaItem[]) => {
      if (items.length === 0) return;
      snapshotMainDeckForQuest();
      const mainIds = (sessionPlaylistRef.current ?? []).map((i) => i.id);
      retainMediaPreloadIds(mainIds);
      setCumplayMediaOverlay(items);
      setMediaDeckKey(cumplayMediaDeckKey());
      warmSessionMedia(items, { preserveExisting: true });
      cumplayAwaitApplyRef.current = false;
    };

    const prefetchCumplayMedia = () => {
      if (cumplayMediaOverlayRef.current) return;
      if (cumplayPrefetchRef.current && cumplayPrefetchRef.current.length > 0) {
        return;
      }
      if (cumplayFetchInFlightRef.current) return;
      const gen = ++cumplayMediaGenRef.current;
      cumplayPrefetchRef.current = null;
      cumplayFetchInFlightRef.current = true;
      const settings = mediaSettingsRef.current;
      void (async () => {
        try {
          const deck = await fetchCumplayMediaCache({
            userId: settings.gelbooruUserId,
            apiKey: settings.gelbooruApiKey,
            mediaQueryTags:
              sessionMediaTagsRef.current || settings.tags,
            isStale: () => gen !== cumplayMediaGenRef.current,
            maxQueries: 8,
            maxItems: 16,
          });
          if (gen !== cumplayMediaGenRef.current) return;
          cumplayPrefetchRef.current = deck;
          cumplayFetchInFlightRef.current = false;
          if (deck.length > 0) {
            const mainIds = (sessionPlaylistRef.current ?? []).map(
              (i) => i.id,
            );
            retainMediaPreloadIds(mainIds);
            warmSessionMedia(deck, { preserveExisting: true });
          }
          if (cumplayAwaitApplyRef.current && deck.length > 0) {
            applyCumplayDeck(deck);
          }
        } catch {
          if (gen !== cumplayMediaGenRef.current) return;
          cumplayPrefetchRef.current = [];
          cumplayFetchInFlightRef.current = false;
        }
      })();
    };

    const applyQuestDeck = (offerId: string, items: MediaItem[]) => {
      snapshotMainDeckForQuest();
      const mainIds = (sessionPlaylistRef.current ?? []).map((i) => i.id);
      retainMediaPreloadIds(mainIds);
      setQuestMediaOverlay(items);
      setMediaDeckKey(questMediaDeckKey(offerId));
      warmSessionMedia(items, { preserveExisting: true });
      setQuestMediaLoading(false);
      questAwaitApplyRef.current = null;
    };

    /** Background Gelbooru pull after accept — does not swap the main stage yet. */
    const prefetchQuestMedia = (quest: {
      id: string;
      mediaTags?: string;
    }) => {
      const tags = quest.mediaTags?.trim();
      if (!tags) {
        questPrefetchRef.current = null;
        setQuestMediaLoading(false);
        return;
      }
      const gen = ++questMediaGenRef.current;
      const offerId = quest.id;
      questPrefetchRef.current = { offerId, items: null };
      setQuestMediaLoading(true);
      setQuestCacheReady(false);
      const settings = mediaSettingsRef.current;
      void (async () => {
        try {
          let exclusive: MediaItem[] = [];
          try {
            const flex = await fetchGelbooruFlexible(tags, 12, {
              userId: settings.gelbooruUserId,
              apiKey: settings.gelbooruApiKey,
            });
            exclusive = flex.items;
          } catch {
            exclusive = [];
          }
          if (exclusive.length === 0) {
            exclusive = filterMediaByTagsStrict(
              [
                ...(sessionPlaylistRef.current ?? []),
                ...mediaItemsRef.current,
              ],
              tags,
            );
          }
          if (gen !== questMediaGenRef.current) return;
          if (exclusive.length === 0) {
            questPrefetchRef.current = { offerId, items: [] };
            setQuestMediaLoading(false);
            setQuestCacheReady(false);
            if (questAwaitApplyRef.current === offerId) {
              questAwaitApplyRef.current = null;
              setQuestMediaOverlay(null);
            }
            return;
          }
          const deck = namespaceMediaItems(
            shuffleMediaItems(exclusive).slice(0, 12),
            questMediaDeckKey(offerId),
          );
          questPrefetchRef.current = { offerId, items: deck };
          const mainIds = (sessionPlaylistRef.current ?? []).map((i) => i.id);
          retainMediaPreloadIds(mainIds);
          warmSessionMedia(deck, { preserveExisting: true });
          setQuestCacheReady(true);
          if (questAwaitApplyRef.current === offerId) {
            applyQuestDeck(offerId, deck);
          } else {
            setQuestMediaLoading(false);
          }
        } catch {
          if (gen !== questMediaGenRef.current) return;
          questPrefetchRef.current = { offerId, items: [] };
          setQuestMediaLoading(false);
          setQuestCacheReady(false);
          if (questAwaitApplyRef.current === offerId) {
            questAwaitApplyRef.current = null;
            setQuestMediaOverlay(null);
          }
        }
      })();
    };

    const unsubBus = busRef.current.subscribe((event: SessionEvent) => {
      avatarRef.current.onEvent(event);
      const log = eventLogRef.current;
      log.push(event);
      if (log.length > 800) log.splice(0, log.length - 800);

      if (event.type === "speech") {
        presentLine(event.text, {
          emotion: event.emotion,
          gesture: event.gesture,
          durationMs: event.durationMs ?? 2800,
          source: event.source,
        });
      }
      if (event.type === "session_pause" || event.type === "session_end") {
        translateAbortRef.current?.abort();
        translateAbortRef.current = null;
        ttsRef.current.stop();
        for (const t of speechTimersRef.current.values()) {
          window.clearTimeout(t.handle);
        }
        speechTimersRef.current.clear();
        setSpeechQueue([]);
        if (shouldStopDeviceOnEvent(event.type)) {
          void stopDevice();
        }
      }
      if (event.type === "session_resume") {
        const lvl = vibeHudRef.current?.level;
        if (
          shouldRestoreDeviceOnResume({
            status: "running",
            vibeLevel: lvl ?? null,
          })
        ) {
          void setDeviceVibeLevel(lvl!);
        }
      }
      // Do not stop TTS on block_end — the next speech barge-ins;
      // stopping here was cancelling confirm/skip lines mid-flight.
      if (event.type === "beat") {
        setPulse((n) => n + 1);
        setLastAccent(event.accent);
      }
      if (event.type === "vibe_level") {
        const profile = getVibeProfile(event.profileId);
        setVibeHud({
          level: event.level as VibeLevel,
          labelRu: event.labelRu,
          profileNameRu: profile?.nameRu ?? event.profileId,
          segmentDurationSec: event.segmentDurationSec,
          segmentIndex: event.segmentIndex,
        });
        void setDeviceVibeLevel(event.level);
      }
      if (event.type === "session_start") {
        eventLogRef.current = [event];
        diaryStartedAtRef.current = new Date().toISOString();
        sessionQuestCindersRef.current = 0;
        mediaDrillBridgeFlashedRef.current = false;
        cbtQuestForcedRef.current = false;
        if (diaryMetaRef.current) {
          diaryMetaRef.current = {
            ...diaryMetaRef.current,
            resultImageUrl: undefined,
          };
        }
        setLastAccent(2);
        setVibeHud(null);
        setSessionMediaOverlay(null);
        setQuestMediaOverlay(null);
        setQuestMediaLoading(false);
        setQuestCacheReady(false);
        questMediaGenRef.current += 1;
        questPrefetchRef.current = null;
        questAwaitApplyRef.current = null;
        setCumplayMediaOverlay(null);
        cumplayMediaGenRef.current += 1;
        cumplayPrefetchRef.current = null;
        cumplayAwaitApplyRef.current = false;
        cumplayFetchInFlightRef.current = false;
        mainDeckCursorRef.current = { index: 0, itemId: null };
        savedMainResumeRef.current = { index: 0, itemId: null };
        sessionMediaTagsRef.current = mediaSettingsRef.current.tags;
        mainDeckEpochRef.current = 0;
        setMainStartIndex(0);
        setMediaDeckKey("main");

        // Soft media-drill bridge: flash + tag hint (no wager rewrite).
        const drill = loadActiveMediaDrill();
        if (mediaDrillAllowsSessionBridge(drill)) {
          mediaDrillBridgeFlashedRef.current = true;
          const open = findContract(drill.instanceId);
          const flash = buildMediaDrillSessionBridgeFlash(
            drill,
            open?.reward ?? 0,
          );
          const key = Date.now();
          setContractProgressFlash({ key, ...flash });
          window.clearTimeout(contractProgressFlashTimerRef.current);
          contractProgressFlashTimerRef.current = window.setTimeout(() => {
            setContractProgressFlash(null);
          }, CONTRACT_PROGRESS_FLASH_MS);
          sessionMediaTagsRef.current = mediaDrillSessionTagHint(drill);
        }

        // CBT seal: force ball_taps offer (contract pays — quest reward 0).
        const cbtSeed = loadActiveSessionSeed();
        if (
          seedIsCbtQuestLive(cbtSeed) &&
          cbtSeed.linkedQuestId &&
          !cbtQuestForcedRef.current
        ) {
          const open = findContract(cbtSeed.instanceId);
          const forced = runtimeRef.current?.forceQuestOffer(
            cbtSeed.linkedQuestId,
            {
              rewardOverride: 0,
              contractRuleRu: `Печать «${cbtSeed.titleRu}»: ударь по яйцам. Награда — контракт (+${open?.reward ?? 0}◆), не квест.`,
            },
          );
          if (forced) {
            cbtQuestForcedRef.current = true;
            const key = Date.now();
            setContractProgressFlash({
              key,
              ...buildCbtQuestFlash(cbtSeed, open?.reward ?? 0),
            });
            window.clearTimeout(contractProgressFlashTimerRef.current);
            contractProgressFlashTimerRef.current = window.setTimeout(() => {
              setContractProgressFlash(null);
            }, CONTRACT_PROGRESS_FLASH_MS);
          }
        }
      }
      // Finale wheel land — freeze the on-screen slide for the diary frame.
      if (event.type === "finish") {
        const still = captureSouvenirFromStageDom();
        if (still) {
          diaryMetaRef.current = {
            ...(diaryMetaRef.current ?? {}),
            resultImageUrl: still,
          };
        } else {
          void captureDiaryResultImage();
        }
      }
      if (event.type === "session_end") {
        // Snapshot the on-screen frame before tearing down the media stage.
        if (!diaryMetaRef.current?.resultImageUrl?.startsWith("data:image/")) {
          const still = captureSouvenirFromStageDom();
          if (still) {
            diaryMetaRef.current = {
              ...(diaryMetaRef.current ?? {}),
              resultImageUrl: still,
            };
          }
        }
        const diaryStartedAt = diaryStartedAtRef.current;
        const diaryMetaSnap = diaryMetaRef.current
          ? { ...diaryMetaRef.current }
          : null;
        const mediaForSouvenir = currentMediaRef.current;

        setSessionMediaOverlay(null);
        setQuestMediaOverlay(null);
        setQuestMediaLoading(false);
        questMediaGenRef.current += 1;
        setCumplayMediaOverlay(null);
        cumplayMediaGenRef.current += 1;
        cumplayPrefetchRef.current = null;
        cumplayAwaitApplyRef.current = false;
        cumplayFetchInFlightRef.current = false;
        setMediaDeckKey("main");
        setSessionPlaylist(null);
        setSessionActiveBuffs({ begBonus: 0, cumBoost: 0 });
        const st = runtimeRef.current?.getState();
        const progress = computeSessionEndProgress({
          reason: event.reason,
          state: st,
          events: eventLogRef.current,
          cindersEarned: event.cindersEarned ?? 0,
          mistressId: getActiveMistress().id,
          achievements: achievementsRef.current,
          wallet: walletRef.current,
          sessionQuestCinders: sessionQuestCindersRef.current,
          silent: event.silent === true,
        });
        if (!event.silent) {
          sessionQuestCindersRef.current = 0;
        }

        if (progress.recordDiary && st) {
          void (async () => {
            let meta = diaryMetaSnap;
            if (
              progress.chaseDiarySouvenir &&
              !meta?.resultImageUrl?.startsWith("data:image/")
            ) {
              const dataUrl = await captureDiarySouvenirDataUrl(mediaForSouvenir);
              if (dataUrl) {
                meta = { ...(meta ?? {}), resultImageUrl: dataUrl };
              }
            }
            const entry = buildDiaryEntry({
              state: st,
              events: eventLogRef.current,
              ended: event.reason,
              meta,
              startedAt: diaryStartedAt,
            });
            const next = appendDiaryEntry(entry);
            setDiaryCount(next.length);
            setDiaryRevision((n) => n + 1);
            diaryMetaRef.current = null;
            diaryStartedAtRef.current = null;
          })();
        } else {
          diaryMetaRef.current = null;
          diaryStartedAtRef.current = null;
        }

        if (progress.syncAchievements) {
          achievementsRef.current = progress.achievements;
          setAchievementsRevision((n) => n + 1);
          if (progress.walletChanged) {
            saveWallet(progress.wallet);
            walletRef.current = progress.wallet;
            setWallet(progress.wallet);
          }
          const cage =
            progress.achievements.counters.chastitySessionsCompleted ?? 0;
          initActiveMistress(
            mistressUnlockSnapshotFromWallet(progress.wallet, cage),
          );
        }

        if (progress.pendingCageHours != null) {
          setCageLock(progress.pendingCageHours);
          notifyCageLockChanged();
        }
        if (progress.pendingDenialHours != null) {
          setDenialQuest(
            progress.pendingDenialHours,
            progress.pendingDenialEdges,
          );
          notifyDenialQuestChanged();
        }

        if (progress.clawQuestCinders > 0) {
          setWallet((w) => debitCinders(w, progress.clawQuestCinders));
        } else if (progress.creditCinders > 0) {
          setWallet((w) => creditCinders(w, progress.creditCinders));
          pulseCinders(progress.creditCinders, "session");
        }

        const showDebrief = progress.showDebrief;
        const showAbortDebrief = progress.showAbortDebrief;
        const contractSettle = settleSessionSeedAfterEnd(
          event.reason,
          st
            ? {
                edgesDone: st.edgesDone,
                ruinsDone: st.ruinsDone,
                finaleOutcome: st.finaleOutcome,
                params: st.params,
              }
            : null,
          { announce: !showDebrief && !showAbortDebrief },
        );
        if (showDebrief && st) {
          const mistress = getActiveMistress();
          const mood = st.mood;
          const portrait =
            mistress.assets.moodPortrait[mood]?.src ??
            mistress.assets.avatarFull;
          const moodLabelRu =
            mistress.assets.moodPortrait[mood]?.labelRu ?? mood;
          const contractReward = contractSettle?.rewarded ?? 0;
          setAbortDebrief(null);
          setSessionDebrief(
            buildSessionDebrief({
              mistressNameRu: mistress.displayNameRu,
              portraitSrc: portrait,
              mood,
              moodLabelRu,
              finaleOutcome: st.finaleOutcome,
              cindersEarned: progress.creditCinders + contractReward,
              levelUps: progress.levelUps,
              elapsedSec: st.elapsedSec,
              edgesDone: st.edgesDone,
              likesCount: favoritesCount,
              contract: contractSettle,
            }),
          );
        } else if (showAbortDebrief && st) {
          const mistress = getActiveMistress();
          const mood = st.mood;
          const portrait =
            mistress.assets.moodPortrait[mood]?.src ??
            mistress.assets.avatarFull;
          const moodLabelRu =
            mistress.assets.moodPortrait[mood]?.labelRu ?? mood;
          setSessionDebrief(null);
          setAbortDebrief(
            buildAbortDebrief({
              mistressNameRu: mistress.displayNameRu,
              portraitSrc: portrait,
              mood,
              moodLabelRu,
              diaryRecorded: progress.recordDiary,
              elapsedSec: st.elapsedSec,
              edgesDone: st.edgesDone,
              ruinsDone: st.ruinsDone,
              clawQuestCinders: progress.clawQuestCinders,
              contractFailedTitleRu:
                contractSettle?.status === "failed"
                  ? contractSettle.titleRu
                  : undefined,
            }),
          );
        }
        void refreshShopOffers();
      }
      if (event.type === "quest_accepted") {
        const pending = runtimeRef.current?.getState()?.pendingQuest;
        if (pending) prefetchQuestMedia(pending);
      }
      if (event.type === "quest_declined") {
        questMediaGenRef.current += 1;
        questPrefetchRef.current = null;
        questAwaitApplyRef.current = null;
        setQuestMediaLoading(false);
        setQuestCacheReady(false);
      }
      if (event.type === "quest_completed") {
        // CBT seal: contract pays — suppress quest cinders to avoid double reward.
        const cbtSeed = loadActiveSessionSeed();
        const cbtNote =
          cbtSeed != null
            ? noteQuestCompletedOnSeed(
                cbtSeed,
                event.questId,
                findContract(cbtSeed.instanceId)?.reward ?? 0,
              )
            : null;
        if (cbtNote?.settleDone) {
          settleLiveContractProgress(cbtNote.next, "done");
          clearQuestMediaDeck();
        } else {
          const reward = Math.max(0, Math.floor(event.reward));
          sessionQuestCindersRef.current += reward;
          if (reward > 0) {
            setWallet((w) => creditCinders(w, reward));
            pulseCinders(reward, "quest");
          }
          clearQuestMediaDeck();
        }
      }
      if (event.type === "quest_failed") {
        clearQuestMediaDeck();
      }
      if (event.type === "quest_started") {
        const tags = event.quest.mediaTags?.trim();
        const offerId = event.quest.id;
        if (!tags) {
          clearQuestMediaDeck();
          return;
        }
        questAwaitApplyRef.current = offerId;
        const pref = questPrefetchRef.current;
        if (pref?.offerId === offerId && pref.items && pref.items.length > 0) {
          applyQuestDeck(offerId, pref.items);
          return;
        }
        if (pref?.offerId === offerId && pref.items === null) {
          // Prefetch still running — apply on completion.
          setQuestMediaLoading(true);
          return;
        }
        // Missed accept prefetch (or empty) — pull now.
        prefetchQuestMedia(event.quest);
      }
      if (event.type === "cumplay_prefetch") {
        prefetchCumplayMedia();
      }
      if (event.type === "mistress_cumplay_step") {
        if (!cumplayMediaOverlayRef.current) {
          cumplayAwaitApplyRef.current = true;
          const pref = cumplayPrefetchRef.current;
          if (pref && pref.length > 0) {
            applyCumplayDeck(pref);
          }
        }
        // Live ruin→eat / CEI chain: arm on release ritual, flash 1/3…
        const seed = loadActiveSessionSeed();
        if (seedIsRuinEatLive(seed) && seedLiveProgressOpen(seed)) {
          const ritual = runtimeRef.current?.getState()?.cumplayRitual;
          const releaseRitual =
            ritual != null &&
            (ritual.outcome === "ruin" || ritual.outcome === "cum") &&
            ritual.context !== "precum" &&
            ritual.context !== "unauthorized";
          if (releaseRitual) {
            const armed = armSeedOnReleaseRitual(seed, {
              ritualContext: ritual.context,
              outcome: ritual.outcome,
            });
            if (armed && armed !== seed) {
              saveActiveSessionSeed(armed);
              setActiveSessionSeed(armed);
            }
            const live = armed ?? seed;
            if (
              event.index === 0 ||
              isContractEatStepId(event.stepId) ||
              isContractOpenStepId(event.stepId)
            ) {
              const open = findContract(live.instanceId);
              const model = buildContractProgressFlash(
                live,
                open?.reward ?? 0,
              );
              const key = Date.now();
              setContractProgressFlash({ key, ...model });
              window.clearTimeout(contractProgressFlashTimerRef.current);
              contractProgressFlashTimerRef.current = window.setTimeout(() => {
                setContractProgressFlash(null);
              }, CONTRACT_PROGRESS_FLASH_MS);
            }
          }
        }
      }
      if (event.type === "mistress_cumplay_done") {
        clearCumplayMediaDeck();
      }
      if (event.type === "mistress_wager_media") {
        const tags = event.tags;
        const settings = mediaSettingsRef.current;
        void (async () => {
          try {
            const { items } = await fetchGelbooruFlexible(tags, 40, {
              userId: settings.gelbooruUserId,
              apiKey: settings.gelbooruApiKey,
            });
            if (items.length === 0) {
              runtimeRef.current?.emitExternal({ type: "mistress_media_fail" });
              return;
            }
            // Promote wager deck to the session main cache (new tags stick).
            snapshotMainDeckForQuest();
            const shuffled = shuffleMediaItems(items);
            sessionMediaTagsRef.current = tags.trim() || settings.tags;
            sessionPlaylistRef.current = shuffled;
            setSessionPlaylist(shuffled);
            setSessionMediaOverlay(null);
            mainDeckEpochRef.current += 1;
            setMainStartIndex(0);
            mainDeckCursorRef.current = {
              index: 0,
              itemId: shuffled[0]?.id ?? null,
            };
            setMediaDeckKey(`main:wager:${event.promptId}`);
            warmSessionMedia(shuffled);
            // Cumplay should match the live session tags, not the old library query.
            cumplayMediaGenRef.current += 1;
            cumplayPrefetchRef.current = null;
            cumplayFetchInFlightRef.current = false;
          } catch {
            runtimeRef.current?.emitExternal({ type: "mistress_media_fail" });
          }
        })();
      }
      if (event.type === "block_start") {
        setLastAccent(2);
        if (event.block.drive !== "vibe") setVibeHud(null);
        if (shouldStopOnBlockStart(event.block.drive)) {
          void stopDevice();
        }
      }
      if (event.type === "block_end" || event.type === "session_end") {
        setVibeHud(null);
        if (shouldStopDeviceOnEvent("block_end") || event.type === "session_end") {
          void stopDevice();
        }
      }
      if (event.type === "edge_done") {
        const seed = loadActiveSessionSeed();
        const open = seed ? findContract(seed.instanceId) : null;
        const noted = seed
          ? noteEdgeDoneOnSeed(seed, event.total, open?.reward ?? 0)
          : null;
        if (noted) {
          saveActiveSessionSeed(noted.next);
          setActiveSessionSeed(noted.next);
          const key = Date.now();
          setContractProgressFlash({ key, ...noted.flash });
          window.clearTimeout(contractProgressFlashTimerRef.current);
          contractProgressFlashTimerRef.current = window.setTimeout(() => {
            setContractProgressFlash(null);
          }, CONTRACT_PROGRESS_FLASH_MS);
          if (noted.injectHandsOff) {
            const blockId = `${CONTRACT_HANDS_OFF_BLOCK_PREFIX}${Date.now()}`;
            runtimeRef.current?.injectContractRest(noted.handsOffSec, blockId);
          }
          if (noted.settleDone) {
            settleLiveContractProgress(noted.next, "done");
          }
        }
      }
      if (event.type === "block_end" && isContractHandsOffBlockId(event.blockId)) {
        const seed = loadActiveSessionSeed();
        const done = seed ? completeHandsOffRestStep(seed) : null;
        if (done?.progress?.status === "done") {
          settleLiveContractProgress(done, "done");
        } else if (done) {
          saveActiveSessionSeed(done);
          setActiveSessionSeed(done);
        }
      }
      if (event.type === "unauthorized") {
        const seed = loadActiveSessionSeed();
        // Hands-off rest: exclusive fail path (do not also tax/fail below).
        const handsOffFail = seed ? failHandsOffOnUnauthorized(seed) : null;
        if (handsOffFail) {
          window.clearTimeout(punishNoticeTimerRef.current);
          setPunishNotice(
            event.punishmentRu ||
              "Hands-off нарушен — контракт провален.",
          );
          punishNoticeTimerRef.current = window.setTimeout(
            () => setPunishNotice(null),
            5500,
          );
          settleLiveContractProgress(handsOffFail, "failed");
        } else if (seed) {
          const hit = noteUnauthorizedOnSeed(seed, event.kind);
          switch (hit.action) {
            case "fail": {
              window.clearTimeout(punishNoticeTimerRef.current);
              setPunishNotice(hit.noticeRu);
              punishNoticeTimerRef.current = window.setTimeout(
                () => setPunishNotice(null),
                5500,
              );
              settleLiveContractProgress(hit.next, "failed");
              setContractSessionFlash(hit.failFlashRu);
              window.setTimeout(() => setContractSessionFlash(null), 4200);
              break;
            }
            case "tax": {
              window.clearTimeout(punishNoticeTimerRef.current);
              setPunishNotice(
                `${event.punishmentRu || "Нарушение."} ${hit.noticeRu}`,
              );
              punishNoticeTimerRef.current = window.setTimeout(
                () => setPunishNotice(null),
                5500,
              );
              break;
            }
            case "ignore": {
              window.clearTimeout(punishNoticeTimerRef.current);
              setPunishNotice(
                event.punishmentRu ||
                  "Нарушение: цель эджей увеличена, эдж не засчитан.",
              );
              punishNoticeTimerRef.current = window.setTimeout(
                () => setPunishNotice(null),
                5500,
              );
              break;
            }
            default: {
              const _exhaustive: never = hit;
              void _exhaustive;
            }
          }
        } else {
          window.clearTimeout(punishNoticeTimerRef.current);
          setPunishNotice(
            event.punishmentRu ||
              "Нарушение: цель эджей увеличена, эдж не засчитан.",
          );
          punishNoticeTimerRef.current = window.setTimeout(
            () => setPunishNotice(null),
            5500,
          );
        }
      }
      if (event.type === "session_end") {
        setPendingCheckpoint(null);
        setPunishNotice(null);
      }
    });
    return () => {
      unsubState();
      unsubBus();
      unsubAvatar();
      unsubMistress();
      translateAbortRef.current?.abort();
      translateAbortRef.current = null;
      for (const t of speechTimersRef.current.values()) {
        window.clearTimeout(t.handle);
      }
      speechTimersRef.current.clear();
      window.clearTimeout(mediaSaveTimerRef.current);
      ttsRef.current.stop();
      // Preserve checkpoint across HMR / remount so a live session can resume.
      runtime.abort({ keepCheckpoint: true });
      setPendingCheckpoint(loadSessionCheckpoint());
    };
    // Mount once — voice settings applied via configure()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Autosave running/paused sessions for crash resume.
  useEffect(() => {
    const live =
      state?.status === "running" || state?.status === "paused";
    if (!live) return;
    const write = () => {
      const cp = runtimeRef.current?.exportCheckpoint();
      if (cp) {
        saveSessionCheckpoint(cp);
        setPendingCheckpoint(null);
      }
    };
    write();
    const id = window.setInterval(write, 12_000);
    const onUnload = () => write();
    window.addEventListener("beforeunload", onUnload);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("beforeunload", onUnload);
    };
  }, [state?.status, state?.index, state?.edgesDone, state?.params.edgesTarget]);

  useEffect(() => {
    saveMediaSettings(mediaSettings);
  }, [mediaSettings]);

  useEffect(() => {
    void refreshFavoriteMeta();
  }, []);

  useEffect(() => {
    if (mediaSettings.source === "favorites") {
      void loadFavoritesPlaylist();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mediaSettings.source, mediaSettings.mediaTypeId]);

  // Poll WD14 backend status only while the local media source is active.
  useEffect(() => {
    if (mediaSettings.source !== "local") return;
    void refreshWd14Status();
    const poll = window.setInterval(() => {
      void refreshWd14Status();
    }, 8000);
    return () => window.clearInterval(poll);
  }, [mediaSettings.source, refreshWd14Status]);

  /**
   * Perform-deadline timer (durationLimitMin on a contract): when the live
   * countdown elapses, surface a soft flash nudging the user to come back and
   * report. Does NOT auto-close the seal — reporting stays manual (debrief /
   * honor), as the contract may have been completed offline.
   */
  useEffect(() => {
    if (!activeSessionSeed?.performDeadlineMs) return;
    const fireAt = activeSessionSeed.performDeadlineMs;
    const now = Date.now();
    const delay = fireAt - now;
    if (delay <= 0) return; // already elapsed; ContractsPage shows «просрочено»
    const id = window.setTimeout(() => {
      setContractSessionFlash(
        "⏱ Время на контракт истекло — вернись и доложи результат.",
      );
      window.setTimeout(() => setContractSessionFlash(null), 6000);
    }, delay);
    return () => window.clearTimeout(id);
  }, [activeSessionSeed?.performDeadlineMs, activeSessionSeed?.instanceId]);

  /** Wear-timer seals (cage / plug): auto done when window ends; fail on early «Снял». */
  useEffect(() => {
    const tick = () => {
      const seed = loadActiveSessionSeed();
      const open = seed ? findContract(seed.instanceId) : null;
      const verdict = evaluateWearTimerTick(seed, open);
      switch (verdict.action) {
        case "none":
          return;
        case "fail_early": {
          const result = reportContract(seed!.instanceId, "failed");
          clearActiveSessionSeed();
          refreshSessionSeedState();
          setContractsRevision((n) => n + 1);
          setContractsOpenCount(countOpenContracts(ensureDailyContractBoard()));
          setContractSessionFlash(wearTimerFailFlashRu(verdict.noun));
          window.setTimeout(() => setContractSessionFlash(null), 4200);
          void result;
          return;
        }
        case "done": {
          const result = reportContract(seed!.instanceId, "done");
          clearActiveSessionSeed();
          refreshSessionSeedState();
          setContractsRevision((n) => n + 1);
          setContractsOpenCount(countOpenContracts(ensureDailyContractBoard()));
          const rewarded = result?.rewarded ?? 0;
          if (rewarded > 0) {
            setWallet((w) => creditCinders(w, rewarded));
            pulseCinders(rewarded, "session");
          }
          setContractSessionFlash(
            wearTimerDoneFlashRu(verdict.nounCap, rewarded),
          );
          window.setTimeout(() => setContractSessionFlash(null), 4200);
          return;
        }
        default: {
          const _exhaustive: never = verdict;
          void _exhaustive;
        }
      }
    };

    tick();
    const id = window.setInterval(tick, 4000);
    const onCage = () => tick();
    window.addEventListener("joi-cage-lock-changed", onCage);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("joi-cage-lock-changed", onCage);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionSeedRevision, activeSessionSeed?.instanceId]);

  async function refreshFavoriteMeta(): Promise<void> {
    try {
      const [index, n] = await Promise.all([
        getFavoritesIndex(),
        countFavorites(),
      ]);
      setFavoriteIndex(index);
      setFavoritesCount(n);
      void refreshTasteFromFavorites();
    } catch {
      // IndexedDB unavailable — favorites disabled quietly
    }
  }

  async function loadFavoritesPlaylist(): Promise<void> {
    setMediaLoading(true);
    setMediaError(null);
    try {
      revokeLocalMedia(mediaItemsRef.current);
      revokeFavoriteMedia(mediaItemsRef.current);
      // Keep only the first window in memory; the session deck appends another
      // page when it approaches the end.
      const typeId = resolveMediaTypeId(mediaSettingsRef.current);
      const raw = await loadFavoritesAsMedia({ offset: 0, limit: 80 });
      const items = filterPlaylistByMediaType(raw, typeId);
      setMediaItems(items);
      setMediaSettings((m) => ({ ...m, source: "favorites" }));
      if (items.length === 0) {
        setMediaError("Избранное пусто — лайкай booru ♥ на сессии");
      }
      preloadEntirePlaylist(items);
      await refreshFavoriteMeta();
    } catch (err) {
      setMediaError(
        err instanceof Error ? err.message : "Не удалось открыть избранное",
      );
    } finally {
      setMediaLoading(false);
    }
  }

  async function toggleFavorite(): Promise<void> {
    const item = currentMedia;
    if (!item || favoriteBusy) return;
    if (item.source !== "gelbooru" && item.source !== "favorites") return;

    setFavoriteBusy(true);
    try {
      const loved = mediaMatchesFavorite(item, favoriteIndex);
      if (loved) {
        await removeFavoriteForItem(item);
        if (mediaSettings.source === "favorites") {
          revokeFavoriteMedia(
            mediaItemsRef.current.filter((m) => m.id === item.id),
          );
          setMediaItems((prev) => prev.filter((m) => m.id !== item.id));
        }
      } else {
        await addFavoriteFromItem(item);
        runtimeRef.current?.emitExternal({ type: "user_like" });
      }
      await refreshFavoriteMeta();
      void refreshShopOffers();
    } catch (err) {
      setMediaError(
        err instanceof Error ? err.message : "Не удалось обновить избранное",
      );
    } finally {
      setFavoriteBusy(false);
    }
  }

  function handleSaveMedia() {
    const result = saveMediaLibrary(mediaSettings, mediaItems);
    window.clearTimeout(mediaSaveTimerRef.current);
    if (mediaSettings.source === "gelbooru") {
      setMediaSaveStatus(
        result.playlistCount > 0
          ? `Сохранено · настройки + ${result.playlistCount} в плейлисте`
          : "Сохранено · настройки (плейлист пуст — сначала «Подтянуть»)",
      );
    } else if (mediaSettings.source === "favorites") {
      setMediaSaveStatus(
        `Сохранено · источник избранное (${favoritesCount} шт. в IndexedDB)`,
      );
    } else {
      setMediaSaveStatus(
        "Сохранено · настройки (локальные файлы нужно выбрать снова после перезапуска)",
      );
    }
    mediaSaveTimerRef.current = window.setTimeout(
      () => setMediaSaveStatus(null),
      4500,
    );
  }

  useEffect(() => {
    saveVoiceSettings(voiceSettings);
    llmVoiceRef.current?.configure({
      endpoint: voiceSettings.endpoint,
      model: voiceSettings.model,
      timeoutMs: voiceSettings.timeoutMs,
      enabled: voiceSettings.mode === "llm",
    });
    ttsRef.current.configure({
      enabled: voiceSettings.ttsEnabled,
      provider: voiceSettings.ttsProvider,
      rate: voiceSettings.ttsRate,
      volume: voiceSettings.ttsVolume,
      pitch: voiceSettings.ttsPitch,
      edgeVoice: voiceSettings.ttsEdgeVoice,
      voiceURI: voiceSettings.ttsVoiceURI,
      sovitsUrl: voiceSettings.sovitsUrl,
      sovitsRefPath: voiceSettings.sovitsRefPath,
      sovitsPromptText: voiceSettings.sovitsPromptText,
      sovitsPromptLang: voiceSettings.sovitsPromptLang,
      sovitsTextLang: voiceSettings.sovitsTextLang,
      qwenRefPath: voiceSettings.qwenRefPath,
      qwenPromptText: voiceSettings.qwenPromptText,
      qwenUrl: voiceSettings.qwenUrl,
      qwenModel: voiceSettings.qwenModel,
      qwenVoice: voiceSettings.qwenVoice,
      qwenApiKey: voiceSettings.qwenApiKey,
    });
    if (!voiceSettings.ttsEnabled) ttsRef.current.stop();
  }, [voiceSettings]);

  // GPT-SoVITS / Qwen vLLM auto-start on app boot (not only when Settings is opened).
  useEffect(() => {
    void ensureSovitsAutoStart({
      ttsEnabled: voiceSettings.ttsEnabled,
      autoStartSovits: voiceSettings.autoStartSovits,
      ttsProvider: voiceSettings.ttsProvider,
      sovitsUrl: voiceSettings.sovitsUrl,
    }).catch(() => {
      /* TitleBar / Settings show status; boot must not throw */
    });
    void ensureQwenAutoStart({
      ttsEnabled: voiceSettings.ttsEnabled,
      autoStartQwen: voiceSettings.autoStartQwen,
      ttsProvider: voiceSettings.ttsProvider,
      qwenUrl: voiceSettings.qwenUrl,
      qwenModel: voiceSettings.qwenModel,
    }).catch(() => {
      /* Settings show status; boot must not throw */
    });
  }, [
    voiceSettings.ttsEnabled,
    voiceSettings.autoStartSovits,
    voiceSettings.autoStartQwen,
    voiceSettings.ttsProvider,
    voiceSettings.sovitsUrl,
    voiceSettings.qwenUrl,
    voiceSettings.qwenModel,
  ]);

  useEffect(() => {
    saveToyOwnedOverrides(toyOverrides);
  }, [toyOverrides]);

  function applyUnlockSanitize(
    nextParams: SessionParams,
    tags: string,
  ): {
    params: SessionParams;
    tags: string;
    notice: string | null;
    result: TagSanitizeResult;
  } {
    const unlocks = contentUnlocksFromWallet(walletRef.current);
    const skipTagSanitize = mediaSettingsRef.current.source === "local";
    const tagResult = skipTagSanitize
      ? { tags, replaced: [] as TagSanitizeResult["replaced"] }
      : sanitizeMediaTagsForUnlocks(tags, unlocks);
    const modeFix = sanitizeModeForUnlocks(nextParams.mode, unlocks);
    const result: TagSanitizeResult = {
      ...tagResult,
      modeFixed: modeFix.fixed
        ? { from: nextParams.mode, to: modeFix.mode }
        : undefined,
    };
    const params: SessionParams = {
      ...nextParams,
      mode: modeFix.mode,
    };
    return {
      params,
      tags: tagResult.tags,
      notice: formatSanitizeMessage(result),
      result,
    };
  }

  function applyCumBoostToParams(
    nextParams: SessionParams,
    stacks: number,
  ): SessionParams {
    if (stacks <= 0) return nextParams;
    const pCum = Math.min(
      0.95,
      nextParams.pCum + stacks * CUM_BOOST_DELTA,
    );
    return { ...nextParams, pCum };
  }

  function rebuild(next: SessionParams, nextSeed = seed, toysList = effectiveToys) {
    if (state?.status === "running" || state?.status === "paused") return;
    const withSeed = applySessionSeedToParams(
      next,
      loadActiveSessionSeed(),
    );
    const modeFix = sanitizeModeForUnlocks(
      withSeed.mode,
      walletRef.current.unlocks,
    );
    const sanitizedParams = sanitizeSessionParams({
      ...withSeed,
      mode: modeFix.mode,
    });
    if (modeFix.fixed) {
      setUnlockNotice(
        formatSanitizeMessage({
          tags: mediaSettingsRef.current.tags,
          replaced: [],
          modeFixed: { from: withSeed.mode, to: modeFix.mode },
        }),
      );
    }
    setParams(sanitizedParams);
    setSeed(nextSeed);
    try {
      setQueue(
        buildQueue(
          sanitizedParams,
          { functions, patterns, toys: toysList },
          nextSeed,
          {
            unlocks: walletRef.current.unlocks,
            equippedToyIds: initialEquippedFromAllowed(
              toysList,
              sanitizedParams.allowedToyIds,
            ),
          },
        ),
      );
    } catch (err) {
      setMediaError(err instanceof Error ? err.message : "Ошибка очереди");
    }
  }

  function applyPresetId(id: string) {
    if (state?.status === "running" || state?.status === "paused") return;
    setActivePresetId(id);
    rebuild(applyPreset(id, DEFAULT_PARAMS));
  }

  function handleToyOwned(toyId: string, owned: boolean) {
    const nextOverrides = setToyOwned(toyOverrides, toyId, owned);
    setToyOverrides(nextOverrides);
    const nextToys = resolveToys(catalogToys, nextOverrides);
    rebuild(params, seed, nextToys);
  }

  async function testVoice() {
    setVoiceStatus("Проверяю…");
    try {
      const res = await fetch(voiceSettings.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: voiceSettings.model,
          max_tokens: 40,
          messages: [
            { role: "system", content: "Ответь одним коротким словом: ок" },
            { role: "user", content: "ping" },
          ],
        }),
      });
      if (!res.ok) {
        setVoiceStatus(`Ошибка HTTP ${res.status}`);
        return;
      }
      setVoiceStatus("LLM отвечает ✓");
    } catch (err) {
      setVoiceStatus(
        err instanceof Error
          ? `Нет связи: ${err.message}`
          : "Нет связи с LLM",
      );
    }
  }

  async function loadGelbooru(opts?: { tags?: string; limit?: number }) {
    setMediaLoading(true);
    setMediaError(null);
    try {
      revokeLocalMedia(mediaItems);
      revokeFavoriteMedia(mediaItems);
      const base = mediaSettingsRef.current;
      const tagInput = opts?.tags ?? base.tags;
      const limit = opts?.limit ?? base.limit;
      const sanitized = applyUnlockSanitize(params, tagInput);
      if (sanitized.notice) setUnlockNotice(sanitized.notice);
      if (
        sanitized.tags !== base.tags ||
        limit !== base.limit ||
        base.source !== "gelbooru"
      ) {
        const patched: MediaSettings = {
          ...base,
          tags: sanitized.tags,
          limit,
          source: "gelbooru",
        };
        setMediaSettings(patched);
        saveMediaSettings(patched);
      }
      if (sanitized.params.mode !== params.mode) {
        rebuild(sanitized.params);
      }
      const typeId = resolveMediaTypeId(base);
      const query = applyMediaTypeQuery(sanitized.tags, typeId);
      const flex = await fetchGelbooruFlexible(query, limit, {
        userId: mediaSettingsRef.current.gelbooruUserId,
        apiKey: mediaSettingsRef.current.gelbooruApiKey,
      });
      const items = filterPlaylistByMediaType(flex.items, typeId);
      if (items.length === 0) {
        setMediaError("Пусто — попробуй другие теги или другой тип контента");
      }
      setMediaItems(items);
      const saved: MediaSettings = {
        ...mediaSettingsRef.current,
        source: "gelbooru",
        limit,
        mediaTypeId: typeId,
        tags: sanitized.tags,
      };
      setMediaSettings(saved);
      saveMediaLibrary(saved, items);
      // Background-download the whole queue (progress on Today / Session)
      preloadEntirePlaylist(items);
    } catch (err) {
      setMediaError(err instanceof Error ? err.message : "Ошибка загрузки");
    } finally {
      setMediaLoading(false);
    }
  }

  function handleMistressSwitched(pack: MistressPack) {
    setMediaSettings((m) => {
      const next = {
        ...m,
        tags: pack.media.primaryDefaultTags,
        source: "gelbooru" as const,
      };
      saveMediaSettings(next);
      return next;
    });
    setParams((p) => {
      if (isModeAllowedForMistress(p.mode, pack.id)) return p;
      const fallback = fallbackModeForMistress(pack.id);
      const next = {
        ...p,
        mode: fallback as typeof p.mode,
      };
      rebuild(next);
      return next;
    });
  }

  async function startMediaDrill(contract: ContractInstance) {
    const drill = startMediaDrillFromContract(contract);
    setMediaDrillRevision((n) => n + 1);
    setContractsRevision((n) => n + 1);
    setNav("session");
    const tagQuery = `${drill.tag} rating:explicit`.trim();
    await loadGelbooru({ tags: tagQuery, limit: drill.limit });
    setMediaDrillStatus("browsing");
    setMediaDrillRevision((n) => n + 1);
  }

  function startSessionSeed(
    contract: ContractInstance,
    opts?: { navigate?: boolean },
  ) {
    const started = startSessionSeedFromContract(contract);
    if (!started) return;

    const plan = planAcceptSessionSeed(contract, started, {
      denialHoursUntilDeadline,
    });
    let seed = plan.seed;

    if (plan.denialHours != null) {
      const quest = setDenialQuest(plan.denialHours, 0);
      seed = updateActiveSessionSeed({
        ...seed,
        linkedDenialUntilMs: quest.untilMs,
      });
      notifyDenialQuestChanged();
    }

    if (plan.wear) {
      const lock = setCageLock(plan.wear.hours, { kind: plan.wear.kind });
      seed = updateActiveSessionSeed({
        ...seed,
        linkedCageUntilMs: lock.untilMs,
      });
      notifyCageLockChanged();
    }

    setActiveSessionSeed(seed);
    setSessionSeedRevision((n) => n + 1);
    setContractsRevision((n) => n + 1);
    rebuild(applySessionSeedToParams(params, seed));
    setActivePresetId(null);
    if (opts?.navigate !== false) {
      setNav(plan.nav);
    }
    setContractSessionFlash(plan.flashRu);
    window.setTimeout(() => setContractSessionFlash(null), 4200);
  }

  /** Diary → Roulette: seed plan params (+ tags) without starting a session. */
  function repeatDiaryPlan(entry: DiaryEntry) {
    if (state?.status === "running" || state?.status === "paused") return;
    const plan = extractDiaryPlanReplay(entry, params);
    if (!plan) return;

    const tagSource = plan.mediaTags ?? mediaSettingsRef.current.tags;
    const sanitized = applyUnlockSanitize(plan.params, tagSource);
    if (sanitized.notice) setUnlockNotice(sanitized.notice);

    setActivePresetId(null);
    rebuild(sanitized.params, plan.seed ?? seed);

    if (sanitized.tags !== mediaSettingsRef.current.tags) {
      const nextMedia: MediaSettings = {
        ...mediaSettingsRef.current,
        tags: sanitized.tags,
      };
      setMediaSettings(nextMedia);
      saveMediaSettings(nextMedia);
    }

    setNav("roulette");
  }

  function refreshSessionSeedState() {
    const pruned = pruneStaleSessionSeedDetailed((id) => findContract(id));
    if (pruned.clearedDenial) notifyDenialQuestChanged();
    if (pruned.clearedCage) notifyCageLockChanged();
    setActiveSessionSeed(pruned.seed);
    setSessionSeedRevision((n) => n + 1);
  }

  /**
   * Mid-session settle for live goals (ruin→eat). Clears seed + pays once.
   * Returns true if the contract was closed (done or failed).
   */
  function settleLiveContractProgress(
    nextSeed: ActiveSessionSeed,
    outcome: "done" | "failed",
  ): boolean {
    const open = findContract(nextSeed.instanceId);
    if (!open || open.status !== "open") {
      clearActiveSessionSeed();
      refreshSessionSeedState();
      return false;
    }
    saveActiveSessionSeed(nextSeed);
    setActiveSessionSeed(nextSeed);
    const result = reportContract(nextSeed.instanceId, outcome);
    clearActiveSessionSeed();
    refreshSessionSeedState();
    setContractsRevision((n) => n + 1);
    setContractsOpenCount(countOpenContracts(ensureDailyContractBoard()));
    const rewarded = result?.rewarded ?? 0;
    if (outcome === "done" && rewarded > 0) {
      setWallet((w) => creditCinders(w, rewarded));
      pulseCinders(rewarded, "session");
    }
    setContractSessionFlash(
      outcome === "done"
        ? rewarded > 0
          ? `Контракт выполнен · +${rewarded} угольков`
          : "Контракт выполнен"
        : nextSeed.verify.kind === "ate_release"
          ? "Контракт провален: CEI-цепочка не закрыта"
          : nextSeed.verify.kind === "ruin_and_eat"
            ? "Контракт провален: руин+съесть"
            : nextSeed.verify.kind === "quest_id"
              ? "Контракт провален: CBT-квест"
              : nextSeed.defId === "edge_hands_off"
                ? "Контракт провален: hands-off нарушен"
                : nextSeed.defId === "session_deny_tomorrow"
                  ? "Контракт провален: deny нарушен"
                  : "Контракт провален",
    );
    window.setTimeout(() => setContractSessionFlash(null), 4200);
    setContractProgressFlash(null);
    window.clearTimeout(contractProgressFlashTimerRef.current);
    return true;
  }

  function settleSessionSeedAfterEnd(
    reason: "complete" | "abort",
    st: {
      edgesDone: number;
      ruinsDone: number;
      finaleOutcome?: "cum" | "ruin" | "deny";
      params: SessionParams;
    } | null,
    opts?: { announce?: boolean },
  ): SessionDebriefContract | null {
    const announce = opts?.announce !== false;
    const seed = loadActiveSessionSeed();
    if (!seed) return null;
    const open = findContract(seed.instanceId);
    if (!open || open.status !== "open") {
      clearActiveSessionSeed();
      refreshSessionSeedState();
      return null;
    }
    const plan = planSessionSeedEndSettle(seed, st, reason);
    switch (plan.kind) {
      case "none":
        return null;
      case "done": {
        const result = reportContract(seed.instanceId, "done");
        clearActiveSessionSeed();
        refreshSessionSeedState();
        setContractsRevision((n) => n + 1);
        setContractsOpenCount(
          countOpenContracts(ensureDailyContractBoard()),
        );
        const rewarded = result?.rewarded ?? 0;
        if (rewarded > 0) {
          setWallet((w) => creditCinders(w, rewarded));
          pulseCinders(rewarded, "session");
        }
        if (announce) {
          setContractSessionFlash(sessionSeedEndDoneFlashRu(rewarded));
          window.setTimeout(() => setContractSessionFlash(null), 4200);
        }
        return sessionSeedEndDebrief(plan, rewarded);
      }
      case "failed": {
        const result = reportContract(seed.instanceId, "failed");
        clearActiveSessionSeed();
        refreshSessionSeedState();
        setContractsRevision((n) => n + 1);
        setContractsOpenCount(
          countOpenContracts(ensureDailyContractBoard()),
        );
        if (announce) {
          setContractSessionFlash(
            sessionSeedEndFailedFlashRu(plan.reasonRu),
          );
          window.setTimeout(() => setContractSessionFlash(null), 4200);
        }
        void result;
        return sessionSeedEndDebrief(plan, 0);
      }
      default: {
        const _exhaustive: never = plan;
        return _exhaustive;
      }
    }
  }

  function pickLocal(files: FileList) {
    revokeLocalMedia(mediaItems);
    revokeFavoriteMedia(mediaItems);
    const { items, files: keptFiles } = mediaFromFilesWithBlobs(files);
    localFilesRef.current = keptFiles;
    setMediaItems(items);
    setMediaSettings((m) => ({ ...m, source: "local" }));
    setMediaError(items.length ? null : "Файлы не найдены");
    preloadEntirePlaylist(items);
    // Auto-tag locally-imported images via WD14 (Python preferred).
    if (items.length > 0 && mediaSettings.autoTagOnImport) {
      void runAutoTagging(items, keptFiles);
    }
  }

  async function runAutoTagging(items: MediaItem[], files: File[]) {
    const status = await getWd14Status(mediaSettings.wd14Url);
    setWd14Status(status);
    if (status.backend === "none" || !status.online) {
      // Backend unavailable — keep filename tags; UI will show a hint.
      return;
    }
    setTagProgress({ done: 0, total: items.length });
    try {
      const next = await tagMediaItems(items, files, {
        baseUrl: mediaSettings.wd14Url,
        generalThreshold: mediaSettings.wd14Threshold,
        onProgress: (p) => setTagProgress(p),
      });
      setMediaItems(next);
      // Re-preload tagged subset for quest prefetches.
      preloadEntirePlaylist(next);
    } finally {
      setTagProgress(null);
    }
  }

  async function startSession(overrideParams?: SessionParams) {
    await primeMetronome();
    setSessionMediaOverlay(null);

    if (overrideParams) setParams(overrideParams);
    const seeded = applySessionSeedToParams(
      overrideParams ?? params,
      loadActiveSessionSeed(),
    );
    const sanitized = applyUnlockSanitize(
      seeded,
      mediaSettingsRef.current.tags,
    );
    if (sanitized.notice) setUnlockNotice(sanitized.notice);
    let sessionParams = sanitized.params;
    if (sanitized.tags !== mediaSettingsRef.current.tags) {
      const patched = {
        ...mediaSettingsRef.current,
        tags: sanitized.tags,
      };
      setMediaSettings(patched);
      saveMediaSettings(patched);
      if (patched.source === "gelbooru") {
        try {
          const flex = await fetchGelbooruFlexible(
            applyMediaTypeQuery(sanitized.tags, patched.mediaTypeId ?? "all"),
            patched.limit,
            {
              userId: patched.gelbooruUserId,
              apiKey: patched.gelbooruApiKey,
            },
          );
          if (flex.items.length > 0) {
            const items = filterPlaylistByMediaType(
              flex.items,
              patched.mediaTypeId ?? "all",
            );
            if (items.length > 0) {
              setMediaItems(items);
              saveMediaLibrary(patched, items);
              mediaItemsRef.current = items;
            }
          }
        } catch {
          // keep existing playlist
        }
      }
    }

    const afterBeg = consumeBegBonus(walletRef.current);
    const afterCum = consumeCumBoost(afterBeg.state);
    setWallet(afterCum.state);
    setSessionActiveBuffs({
      begBonus: afterBeg.bonus,
      cumBoost: afterCum.stacks,
    });
    sessionParams = applyCumBoostToParams(sessionParams, afterCum.stacks);
    setParams(sessionParams);

    const moodFix = sanitizeMoodForUnlocks(
      moodFromScore(loadControlState(getActiveMistress().id).moodScore),
      afterCum.state.unlocks,
    );
    const startMood = moodFix.mood;
    const startMoodScore = scoreFromMood(startMood);

    const playlist = shuffleMediaItems(mediaItemsRef.current);
    setSessionPlaylist(playlist);
    sessionMediaTagsRef.current = mediaSettingsRef.current.tags;
    warmSessionMedia(playlist);
    const fetishPrefs = await refreshTasteFromFavorites();
    const q = buildQueue(
      sessionParams,
      { functions, patterns, toys: toysRef.current },
      seed,
      {
        mood: startMood,
        unlocks: afterCum.state.unlocks,
        equippedToyIds: initialEquippedFromAllowed(
          toysRef.current,
          sessionParams.allowedToyIds,
        ),
      },
    );
    setQueue(q);
    setNav("session");
    pendingStartRef.current = {
      params: sessionParams,
      queue: q,
      seed,
      mood: startMood,
      moodScore: startMoodScore,
      fetishPrefs,
      begBonus: afterBeg.bonus,
    };
    const startTags = mediaSettingsRef.current.tags.trim() || undefined;
    diaryMetaRef.current = {
      tagsLabelRu: startTags,
      mediaTags: startTags,
    };

    for (const n of [3, 2, 1]) {
      setPreflight({ kind: "countdown", n });
      await new Promise((r) => setTimeout(r, 900));
    }
    if (getActiveMistress().id === "sunna") {
      setPreflight({ kind: "sunna_prep", done: [] });
      presentLineRef.current(
        "Lock that clitty first. Cage, balls, vibes — then we rehearse.",
        { emotion: "tease", durationMs: 3800 },
      );
    } else {
      setPreflight({ kind: "warmup" });
      presentLineRef.current(
        "Warm-up. Watch the content — when you're ready, hit Ready.",
        { emotion: "tease", durationMs: 3500 },
      );
    }
  }

  async function mistressDecide(result: PlanRouletteResult) {
    if (state?.status === "running" || state?.status === "paused") {
      throw new Error("Сначала заверши текущую сессию");
    }

    const seededParams = applySessionSeedToParams(
      result.params,
      loadActiveSessionSeed(),
    );
    const sanitized = applyUnlockSanitize(seededParams, result.tags);
    const moodFix = sanitizeMoodForUnlocks(
      result.mood,
      walletRef.current.unlocks,
    );
    saveControlMood(getActiveMistress().id, result.moodScore);
    if (sanitized.notice || moodFix.fixed) {
      setUnlockNotice(
        formatSanitizeMessage({
          ...sanitized.result,
          moodFixed: moodFix.fixed
            ? { from: result.mood, to: moodFix.mood }
            : sanitized.result.moodFixed,
        }),
      );
    }

    setActivePresetId(null);
    setSeed(result.seed);

    const nextMedia: MediaSettings = {
      ...mediaSettingsRef.current,
      tags: sanitized.tags,
      source: "gelbooru",
      mediaTypeId: result.mediaTypeId,
    };
    setMediaSettings(nextMedia);
    saveMediaSettings(nextMedia);

    setMediaLoading(true);
    setMediaError(null);
    try {
      revokeLocalMedia(mediaItemsRef.current);
      revokeFavoriteMedia(mediaItemsRef.current);
      const { items, usedTags, attempted } = await fetchGelbooruFlexible(
        sanitized.tags,
        nextMedia.limit,
        {
          userId: nextMedia.gelbooruUserId,
          apiKey: nextMedia.gelbooruApiKey,
        },
      );
      const filtered = filterMediaByKinds(items, result.mediaKinds ?? []);
      const playlistItems =
        filtered.length > 0
          ? filtered
          : items;
      if (playlistItems.length === 0) {
        throw new Error(
          `Booru пуст (пробовал ${attempted.length} запросов, от «${sanitized.tags}» до упрощённых). Проверь API key или крути заново`,
        );
      }
      const mediaWithTags: MediaSettings = {
        ...nextMedia,
        tags: usedTags,
        mediaTypeId: result.mediaTypeId,
      };
      setMediaSettings(mediaWithTags);
      saveMediaSettings(mediaWithTags);
      setMediaItems(playlistItems);
      saveMediaLibrary(mediaWithTags, playlistItems);

      const afterBeg = consumeBegBonus(walletRef.current);
      const afterCum = consumeCumBoost(afterBeg.state);
      setWallet(afterCum.state);
      setSessionActiveBuffs({
        begBonus: afterBeg.bonus,
        cumBoost: afterCum.stacks,
      });
      let sessionParams = applyCumBoostToParams(
        sanitized.params,
        afterCum.stacks,
      );
      sessionParams = sanitizeSessionParams(sessionParams);
      setParams(sessionParams);

      const q = buildQueue(
        sessionParams,
        { functions, patterns, toys: toysRef.current },
        result.seed,
        {
          mood: moodFix.mood,
          unlocks: afterCum.state.unlocks,
          equippedToyIds: initialEquippedFromAllowed(
            toysRef.current,
            sessionParams.allowedToyIds,
          ),
        },
      );
      setQueue(q);

      await primeMetronome();
      setSessionMediaOverlay(null);
      const playlist = shuffleMediaItems(playlistItems);
      setSessionPlaylist(playlist);
      sessionMediaTagsRef.current = mediaWithTags.tags;
      warmSessionMedia(playlist);
      const fetishPrefs = await refreshTasteFromFavorites();
      setNav("session");
      pendingStartRef.current = {
        params: sessionParams,
        queue: q,
        seed: result.seed,
        mood: moodFix.mood,
        moodScore: result.moodScore,
        fetishPrefs,
        begBonus: afterBeg.bonus,
      };
      const bpmPick = result.summary.find((s) => s.stepId === "bpm");
      const toyPicks = result.summary.filter(
        (s) =>
          s.stepId === "toys_count" ||
          s.stepId === "toys_1" ||
          s.stepId === "toys_2" ||
          s.stepId === "toys_3",
      );
      const toyNames = toyPicks
        .filter((s) => s.stepId !== "toys_count")
        .map((s) => s.labelRu);
      const toysCountLabel = toyPicks.find(
        (s) => s.stepId === "toys_count",
      )?.labelRu;
      const toysLabelRu =
        toyNames.length > 0
          ? toyNames.join(" · ")
          : toysCountLabel || undefined;
      diaryMetaRef.current = {
        tagsLabelRu: result.tagsLabelRu || usedTags || undefined,
        mediaTags: usedTags || sanitized.tags || undefined,
        bpmLabelRu: bpmPick?.labelRu,
        toysLabelRu,
      };

      for (const n of [3, 2, 1]) {
        setPreflight({ kind: "countdown", n });
        await new Promise((r) => setTimeout(r, 900));
      }
      if (getActiveMistress().id === "sunna") {
        setPreflight({ kind: "sunna_prep", done: [] });
        presentLineRef.current(
          "I already decided everything. Cage on, balls soft, vibes ready — then we play.",
          { emotion: "tease", durationMs: 4000 },
        );
      } else {
        setPreflight({ kind: "warmup" });
        presentLineRef.current(
          "I already decided everything. Warm up — then Ready when you can take it.",
          { emotion: "tease", durationMs: 4000 },
        );
      }
    } finally {
      setMediaLoading(false);
    }
  }

  const [sunnaBuzzHoldMode, setSunnaBuzzHoldMode] =
    useState<IdolBuzzHoldMode>("hands_on");

  function advanceSunnaPrep(step: SunnaPrepStep) {
    setPreflight((prev) => {
      if (!prev || prev.kind !== "sunna_prep") return prev;
      if (prev.done.includes(step)) return prev;
      const meta = SUNNA_PREP_STEPS.find((s) => s.id === step);
      if (meta) {
        presentLineRef.current(meta.speakEn, {
          emotion: "tease",
          durationMs: 3200,
        });
      }
      const done = [...prev.done, step];
      if (sunnaPrepComplete(done)) {
        window.setTimeout(() => {
          presentLineRef.current(
            "Good. Locked clitty, soft balls, toys ready. Warm up — then Ready.",
            { emotion: "tease", durationMs: 3200 },
          );
        }, 400);
        return { kind: "warmup" };
      }
      return { kind: "sunna_prep", done };
    });
  }

  async function confirmReady() {
    const pending = pendingStartRef.current;
    if (!pending) return;
    await primeMetronome();
    setPreflight(null);
    pendingStartRef.current = null;
    clearSessionSkipWagers();
    moodRef.current = pending.mood ?? getActiveMoodLines().defaultMood;
    runtimeRef.current?.setUnlocks(walletRef.current.unlocks);
    const sunna = getActiveMistress().id === "sunna";
    let equipped = initialEquippedFromAllowed(
      toysRef.current,
      pending.params.allowedToyIds,
    );
    if (sunna) {
      equipped = equipToy(equipped, "chastity_cage");
      const allow = pending.params.allowedToyIds;
      const dildo = toysRef.current.find(
        (t) =>
          t.owned &&
          (t.id.startsWith("dildo_") ||
            (t.satisfies?.includes("dildo") ?? false)) &&
          isToyAllowedInSession(t.id, allow),
      );
      if (dildo) equipped = equipToy(equipped, dildo.id);
      if (pending.params.mode === "chastity") {
        const external = toysRef.current.find(
          (t) =>
            t.owned &&
            (t.id === "wand" ||
              t.id === "vibe_bullet" ||
              (t.satisfies?.includes("wand") ?? false)) &&
            isToyAllowedInSession(t.id, allow),
        );
        if (external) equipped = equipToy(equipped, external.id);
      }
    }
    runtimeRef.current?.start(pending.params, pending.queue, pending.seed, {
      moodScore: pending.moodScore,
      fetishPrefs: pending.fetishPrefs,
      begBonus: pending.begBonus,
      equippedToyIds: equipped,
      idolBuzzHoldMode: sunna ? sunnaBuzzHoldMode : undefined,
    });
  }

  function abortAll() {
    setPreflight(null);
    pendingStartRef.current = null;
    clearSessionSkipWagers();
    setSessionMediaOverlay(null);
    setSessionPlaylist(null);
    setSessionActiveBuffs({ begBonus: 0, cumBoost: 0 });
    translateAbortRef.current?.abort();
    translateAbortRef.current = null;
    ttsRef.current.stop();
    runtimeRef.current?.abort();
    clearSessionCheckpoint();
    setPendingCheckpoint(null);
    setPunishNotice(null);
  }

  function resumeFromCheckpoint() {
    const cp = pendingCheckpoint ?? loadSessionCheckpoint();
    if (!cp || !runtimeRef.current) return;
    if (cp.mistressId !== getActiveMistress().id) {
      setActiveMistress(
        cp.mistressId,
        mistressUnlockSnapshotFromWallet(walletRef.current),
      );
    }
    const ok = runtimeRef.current.restoreCheckpoint(cp);
    if (!ok) {
      clearSessionCheckpoint();
      setPendingCheckpoint(null);
      return;
    }
    setPendingCheckpoint(null);
    setNav("session");
    void primeMetronome().then(() => runtimeRef.current?.resume());
  }

  function discardCheckpoint() {
    clearSessionCheckpoint();
    setPendingCheckpoint(null);
  }

  const activeQueue = state?.queue ?? queue;
  const activeIndex = state?.index ?? 0;
  const currentBlock = activeQueue[activeIndex];
  const currentFn = currentBlock
    ? fnById.get(currentBlock.functionId)
    : undefined;
  const currentPat = currentBlock
    ? patById.get(currentBlock.patternId)
    : undefined;

  function exportSession() {
    downloadSessionJson(
      buildSessionExport({
        params: state?.params ?? params,
        queue: activeQueue,
        state,
        seed: state?.seed ?? seed,
        events: eventLogRef.current,
        presetId: activePresetId,
        voice: voiceSettings,
      }),
    );
  }

  const sessionLive =
    state?.status === "running" ||
    state?.status === "paused" ||
    preflight != null;

  useEffect(() => {
    if (
      eveningRouteOpen ||
      sessionLive ||
      sessionDebrief ||
      abortDebrief
    ) {
      setActiveSectionBriefing(null);
      return;
    }
    if (
      !isBriefableNav(nav) ||
      skippedSectionBriefingsRef.current.has(nav) ||
      !shouldShowSectionBriefing(nav)
    ) {
      setActiveSectionBriefing(null);
      return;
    }
    setActiveSectionBriefing(nav);
  }, [nav, eveningRouteOpen, sessionLive, sessionDebrief, abortDebrief]);

  const previewBlock = queue[0];
  const previewFn = previewBlock
    ? fnById.get(previewBlock.functionId)
    : undefined;
  const previewPat = previewBlock
    ? patById.get(previewBlock.patternId)
    : undefined;

  return (
    <div
      className={[
        "app-frame",
        nav === "session" ? "app-frame--session" : "",
        fullscreen ? "app-frame--fullscreen" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {!fullscreen ? (
        <TitleBar
          llmActive={voiceSettings.mode === "llm"}
          llmModel={voiceSettings.model}
          ttsEnabled={voiceSettings.ttsEnabled}
          ttsProvider={voiceSettings.ttsProvider}
          sovitsUrl={voiceSettings.sovitsUrl}
          qwenUrl={voiceSettings.qwenUrl}
        />
      ) : null}
      <div
        className={[
          "shell",
          nav === "session" ? "shell--session" : "",
          navCollapsed ? "shell--nav-collapsed" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <SideNav
          active={nav}
          onChange={setNav}
          sessionLive={sessionLive}
          collapsed={navCollapsed}
          favoritesCount={favoritesCount}
          cindersBalance={wallet.balance}
          diaryCount={diaryCount}
          contractsOpenCount={contractsOpenCount}
          chatWaiting={chatWaiting}
          fullscreen={fullscreen}
          onToggleFullscreen={toggleFullscreen}
          onToggleCollapsed={() => {
            setNavCollapsed((c) => {
              const next = !c;
              try {
                localStorage.setItem(NAV_COLLAPSED_KEY, next ? "1" : "0");
              } catch {
                // ignore
              }
              return next;
            });
          }}
        />
        <div className="shell__main">
          {contractSessionFlash ? (
            <div className="contract-session-flash" role="status">
              {contractSessionFlash}
            </div>
          ) : null}
          {pendingCheckpoint && !sessionLive ? (
            <div className="session-resume-banner" role="status">
              <div className="session-resume-banner__text">
                <strong>Сессия сохранена</strong>
                <span>
                  {formatCheckpointAge(pendingCheckpoint.savedAtMs)} · эдж{" "}
                  {pendingCheckpoint.edgesDone}/
                  {pendingCheckpoint.edgesTarget} ·{" "}
                  {Math.round(pendingCheckpoint.elapsedSec / 60)} мин
                </span>
              </div>
              <div className="session-resume-banner__actions">
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => resumeFromCheckpoint()}
                >
                  Продолжить
                </button>
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => discardCheckpoint()}
                >
                  Отменить
                </button>
              </div>
            </div>
          ) : null}
          {nav === "settings" ? (
            <SettingsPage
              queue={queue}
              media={mediaSettings}
              unlockNotice={unlockNotice}
              onDismissUnlockNotice={() => setUnlockNotice(null)}
              unlocks={contentUnlocksFromWallet(wallet)}
              voice={voiceSettings}
              voiceStatus={voiceStatus}
              onMedia={setMediaSettings}
              onExport={exportSession}
              onVoice={(v: VoiceSettings) => {
                setVoiceSettings(v);
                setVoiceStatus(null);
              }}
              onTestVoice={() => void testVoice()}
              onSaveMedia={handleSaveMedia}
              mediaSaveStatus={mediaSaveStatus}
              tts={ttsRef.current}
              sessionLive={sessionLive}
              onOpenEveningRoute={() => {
                setNav("roulette");
                setEveningRouteOpen(true);
              }}
              onResetSectionBriefings={() => {
                skippedSectionBriefingsRef.current.clear();
                if (isBriefableNav(nav) && shouldShowSectionBriefing(nav)) {
                  setActiveSectionBriefing(nav);
                }
              }}
            />
          ) : nav === "roulette" ? (
            <RoulettePage
              baseParams={params}
              busy={mediaLoading || sessionLive}
              unlocks={contentUnlocksFromWallet(wallet)}
              onMistressDecide={mistressDecide}
              onStartWithoutRoulette={() => void startSession()}
              seed={seed}
              activePresetId={activePresetId}
              media={mediaSettings}
              mediaCount={mediaItems.length}
              favoritesCount={favoritesCount}
              mediaLoading={mediaLoading}
              mediaError={mediaError}
              mediaSaveStatus={mediaSaveStatus}
              playlistPreload={playlistPreload}
              toys={effectiveToys}
              sessionLive={sessionLive}
              onMistressSwitched={handleMistressSwitched}
              onParams={(p) => {
                setActivePresetId(null);
                rebuild(p);
              }}
              onSeed={(s) => rebuild(params, s)}
              onReroll={() => rebuild(params, Date.now() % 1_000_000)}
              onApplyPreset={applyPresetId}
              onMedia={setMediaSettings}
              onLoadGelbooru={() => void loadGelbooru()}
              onPickLocal={pickLocal}
              onSaveMedia={handleSaveMedia}
              wd14Status={wd14Status}
              tagProgress={tagProgress}
              onStartWd14={startWd14FromUI}
              onRefreshWd14={() => void refreshWd14Status()}
              onToyOwned={handleToyOwned}
              contractSeed={activeSessionSeed}
              onClearContractSeed={() => {
                const side = clearActiveSessionSeedWithSideEffects();
                if (side.clearedDenial) notifyDenialQuestChanged();
                if (side.clearedCage) notifyCageLockChanged();
                refreshSessionSeedState();
                setContractsRevision((n) => n + 1);
              }}
              wallet={wallet}
              contractsRevision={contractsRevision}
              onStartSessionSeed={startSessionSeed}
              onStartMediaDrill={(c) => void startMediaDrill(c)}
              onOpenContracts={() => setNav("contracts")}
              onOpenSession={() => setNav("session")}
              onOpenShop={() => setNav("shop")}
              onOpenFavorites={() => setNav("favorites")}
            />
          ) : nav === "ember" ? (
            <EmberLazyBoundary>
              <Suspense fallback={<EmberRouteFallback />}>
                <LazyEmberPlayPage
                  onReward={(n) => {
                    if (n <= 0) return;
                    setWallet((w) => creditCinders(w, n));
                  }}
                  onOpenEditor={() => setNav("ember_editor")}
                />
              </Suspense>
            </EmberLazyBoundary>
          ) : nav === "ember_editor" ? (
            <EmberLazyBoundary>
              <Suspense fallback={<EmberRouteFallback />}>
                <LazyEmberEditorPage
                  onBackToPlay={() => setNav("ember")}
                  onGrantCinders={(n) => {
                    if (n <= 0) return;
                    setWallet((w) => creditCinders(w, n));
                  }}
                />
              </Suspense>
            </EmberLazyBoundary>
          ) : nav === "diary" ? (
            <DiaryPage
              revision={diaryRevision}
              onRepeatPlan={repeatDiaryPlan}
            />
          ) : nav === "stats" || nav === "contract_journal" ? (
            <StatsPage
              revision={diaryRevision}
              journalRevision={contractsRevision}
              onNavigate={setNav}
            />
          ) : nav === "achievements" ? (
            <AchievementsPage
              revision={achievementsRevision}
              onNavigate={setNav}
            />
          ) : nav === "favorites" ? (
            <FavoritesPage
              onNavigate={setNav}
              unlocks={contentUnlocksFromWallet(wallet)}
              onFavoritesChanged={() => {
                void refreshFavoriteMeta();
                void refreshShopOffers();
                if (mediaSettings.source === "favorites") {
                  void loadFavoritesPlaylist();
                }
              }}
            />
          ) : nav === "contracts" ? (
            <ContractsPage
              wallet={wallet}
              revision={contractsRevision}
              drillRevision={mediaDrillRevision}
              seedRevision={sessionSeedRevision}
              mediaLoading={mediaLoading}
              sessionLive={sessionLive}
              highlightTitleRu={contractsHighlightTitle}
              onOpenCountChange={setContractsOpenCount}
              onStartMediaDrill={(c) => void startMediaDrill(c)}
              onStartSessionSeed={startSessionSeed}
              onSessionSeedCleared={() => {
                refreshSessionSeedState();
                setContractsRevision((n) => n + 1);
              }}
              onMistressSwitched={handleMistressSwitched}
              onReward={(n) => {
                if (n <= 0) return;
                setWallet((w) => creditCinders(w, n));
              }}
              onSpend={(amount) => {
                const next = spendCinders(walletRef.current, amount);
                if (!next) return false;
                setWallet(next);
                return true;
              }}
            />
          ) : nav === "shop" ? (
            <ShopPage
              wallet={wallet}
              favoritesHasMore={shopFavoritesHasMore}
              favoritesCount={favoritesCount}
              onNavigate={setNav}
              onLoadMoreFavorites={loadMoreFavoriteShopOffers}
              onSearchFavorites={searchFavoriteShopOffers}
              onPurchase={(itemId) => {
                const result = purchaseShopItem(walletRef.current, itemId);
                if (!result.ok) {
                  setMediaError(result.reason);
                  return false;
                }
                let nextWallet = result.state;
                const unlockSnap =
                  mistressUnlockSnapshotFromWallet(nextWallet);
                initActiveMistress(unlockSnap);
                const harem = syncMistressUnlockAchievements(
                  achievementsRef.current,
                  unlockSnap,
                );
                achievementsRef.current = harem.state;
                if (harem.cindersReward > 0) {
                  nextWallet = creditCinders(
                    nextWallet,
                    harem.cindersReward,
                  );
                  setAchievementsRevision((n) => n + 1);
                }
                setWallet(nextWallet);
                runtimeRef.current?.setUnlocks(nextWallet.unlocks);
                void hasMoreShopOffersFromFavorites(nextWallet).then(
                  setShopFavoritesHasMore,
                );
                if (
                  state?.status !== "running" &&
                  state?.status !== "paused"
                ) {
                  rebuild(params, seed);
                }
                return true;
              }}
              onApplyTagPack={(packId) => {
                const tags = tagPackTags(packId);
                if (!tags) return;
                const next = {
                  ...mediaSettingsRef.current,
                  tags: [mediaSettingsRef.current.tags, tags]
                    .map((t) => t.trim())
                    .filter(Boolean)
                    .join(" "),
                };
                setMediaSettings(next);
                saveMediaSettings(next);
                setNav("roulette");
              }}
            />
          ) : nav === "chat" ? (
            <ChatPage
              tts={ttsRef.current}
              sessionLive={sessionLive}
              ttsVolume={voiceSettings.ttsVolume}
              onTtsVolume={(v) =>
                setVoiceSettings((s) =>
                  setMistressVoiceTuning(s, getActiveMistress().id, {
                    ttsVolume: v,
                  }),
                )
              }
              onStartHerSession={(proposal) => {
                const next = applyProposalToParams(
                  params,
                  proposal.kind,
                  proposal.durationSec,
                  proposal.edgesTarget,
                  proposal.finalePolicy,
                  proposal.mode,
                );
                void startSession(next);
              }}
              onStartAssembledSession={(result) => {
                void mistressDecide(result);
              }}
              onAcceptContract={(contract) => {
                startSessionSeed(contract, { navigate: false });
              }}
              onPatchQueue={(edit) => {
                if (!sessionLive) return false;
                const st = state;
                const rt = runtimeRef.current;
                if (!st || !rt) return false;
                if (edit === "drop_next") {
                  rt.dropUpcomingBlock(st.index + 1);
                  return true;
                }
                rt.insertRestAfter(st.index);
                return true;
              }}
            />
          ) : nav === "minigames" ? (
            <MinigamesPage
              onReward={(n) => {
                if (n <= 0) return;
                setWallet((w) => creditCinders(w, n));
              }}
              onSpend={(n) => {
                if (n <= 0) return;
                setWallet((w) => (w.balance >= n ? debitCinders(w, n) : w));
              }}
              walletBalance={wallet.balance}
            />
          ) : (
            <SessionPage
              state={state}
              currentBlock={currentBlock}
              currentFn={currentFn}
              currentPat={currentPat}
              pulse={pulse}
              lastAccent={lastAccent}
              vibeHud={vibeHud}
              vibeHudDevice={vibeHudDevice}
              avatarSnap={avatarSnap}
              preflight={preflight}
              warmupPreview={{
                functionName: previewFn?.nameRu ?? "—",
                patternName: previewPat?.nameRu ?? "—",
                bpm: previewBlock?.bpm ?? params.bpmMin,
                mode: params.mode,
              }}
              media={{
                mediaItems:
                  cumplayMediaOverlay ??
                  questMediaOverlay ??
                  sessionMediaOverlay ??
                  sessionPlaylist ??
                  mediaItems,
                mediaDeckKey: mediaDeckKey,
                mediaStartIndex: mediaDeckKey.startsWith("main")
                  ? mainStartIndex
                  : 0,
                slideSec: mediaSettings.slideSec,
                currentMedia: currentMedia,
                mediaFavorited: currentMedia
                  ? mediaMatchesFavorite(currentMedia, favoriteIndex)
                  : false,
                favoriteBusy: favoriteBusy,
                playlistPreload: playlistPreload,
                onCurrentMediaChange: setCurrentMedia,
                onSlideLeave: onSessionSlideLeave,
                onDeckProgress: (info) => {
                  noteMainDeckProgress(info);
                  void maybeTopUpMainMediaCache(info);
                },
                onToggleFavorite: () => void toggleFavorite(),
              }}
              voiceAudio={{
                speechQueue: speechQueue,
                voiceMode: voiceSettings.mode,
                voiceActivity: voiceActivity,
                voiceModel: voiceSettings.model,
                ttsEnabled: voiceSettings.ttsEnabled,
                onTtsEnabled: (v) =>
                  setVoiceSettings((s) => ({ ...s, ttsEnabled: v })),
                ttsVolume: voiceSettings.ttsVolume,
                onTtsVolume: (v) =>
                  setVoiceSettings((s) =>
                    setMistressVoiceTuning(s, getActiveMistress().id, {
                      ttsVolume: v,
                    }),
                  ),
                videoVolume: mediaSettings.videoVolume ?? 1,
                onVideoVolume: (v) => {
                  const next = {
                    ...mediaSettingsRef.current,
                    videoVolume: Math.min(1, Math.max(0, v)),
                  };
                  setMediaSettings(next);
                  saveMediaSettings(next);
                },
                sfxVolume: mediaSettings.sfxVolume ?? 0.35,
                onSfxVolume: (v) => {
                  const clamped = Math.min(1, Math.max(0, v));
                  setMetronomeVolume(clamped);
                  syncVibeHumVolume();
                  const next = {
                    ...mediaSettingsRef.current,
                    sfxVolume: clamped,
                  };
                  setMediaSettings(next);
                  saveMediaSettings(next);
                },
                muted: muted,
                onMuted: (v) => {
                  setMuted(v);
                  setMetronomeMuted(v);
                  syncVibeHumMute();
                },
              }}
              controls={{
                onStart: () => void startSession(),
                onReady: () => void confirmReady(),
                onPause: () => runtimeRef.current?.pause(),
                onResume: () =>
                  void primeMetronome().then(() =>
                    runtimeRef.current?.resume(),
                  ),
                onAbort: abortAll,
                onConfirmEdge: () => runtimeRef.current?.confirmEdge(),
                onConfirmRuin: () => runtimeRef.current?.confirmRuin(),
                onConfirmFinaleEdge: () =>
                  runtimeRef.current?.confirmFinaleEdge(),
                onFinaleSpinDone: () =>
                  runtimeRef.current?.completeFinaleReveal(),
                onFinaleComplete: () =>
                  runtimeRef.current?.completeFinaleSession(),
                onChoiceSpinDone: () =>
                  runtimeRef.current?.completeChoiceReveal(),
                onSkip: () => runtimeRef.current?.skipBlock(),
                onDropUpcoming: (i) =>
                  runtimeRef.current?.dropUpcomingBlock(i),
                onMoveUpcoming: (i, dir) =>
                  runtimeRef.current?.moveUpcomingBlock(i, dir),
                onInsertRestAfter: (i) =>
                  runtimeRef.current?.insertRestAfter(i),
                onForceFinale: () => runtimeRef.current?.forceFinale(),
                onAnswerPrompt: (optionId) =>
                  runtimeRef.current?.answerPrompt(optionId),
                onReportDare: (success) =>
                  runtimeRef.current?.reportDare(success),
                onReportBreath: (success) =>
                  runtimeRef.current?.reportBreath(success),
                onAnswerPromise: (success) => {
                  runtimeRef.current?.answerPromise(success);
                  const seed = loadActiveSessionSeed();
                  // Promise dock maps to the eat beat of a multi-step CEI chain.
                  if (
                    !seedIsRuinEatLive(seed) ||
                    seed.progress?.status !== "awaiting"
                  ) {
                    return;
                  }
                  const active =
                    seed.progress.steps[seed.progress.currentStep]?.id;
                  if (active !== "cei_eat") return;
                  const noted = noteCumplayAnswerOnCeiSeed(seed, {
                    stepId: "tempt_eat_ruin",
                    optionEffect: success ? "cumplay_ok" : "cumplay_fail",
                    reward: findContract(seed.instanceId)?.reward ?? 0,
                  });
                  if (!noted) return;
                  if (noted.settleFailed) {
                    settleLiveContractProgress(noted.next, "failed");
                    return;
                  }
                  saveActiveSessionSeed(noted.next);
                  setActiveSessionSeed(noted.next);
                  if (noted.flash) {
                    const key = Date.now();
                    setContractProgressFlash({ key, ...noted.flash });
                    window.clearTimeout(contractProgressFlashTimerRef.current);
                    contractProgressFlashTimerRef.current = window.setTimeout(
                      () => setContractProgressFlash(null),
                      CONTRACT_PROGRESS_FLASH_MS,
                    );
                  }
                  if (noted.settleDone) {
                    settleLiveContractProgress(noted.next, "done");
                  }
                },
                onAnswerCumplay: (optionId) => {
                  const st = runtimeRef.current?.getState();
                  const ritual = st?.cumplayRitual;
                  const step =
                    ritual && !ritual.done
                      ? ritual.steps[ritual.stepIndex]
                      : null;
                  const option = step?.options.find((o) => o.id === optionId);
                  runtimeRef.current?.answerCumplayStep(optionId);
                  if (!step || !option) return;
                  const seed = loadActiveSessionSeed();
                  if (!seedIsRuinEatLive(seed) || !seedLiveProgressOpen(seed)) {
                    return;
                  }
                  const noted = noteCumplayAnswerOnCeiSeed(seed, {
                    stepId: step.id,
                    optionEffect: option.effect,
                    cumplayId: ritual?.cumplayId,
                    ritualContext: ritual?.context,
                    reward: findContract(seed.instanceId)?.reward ?? 0,
                  });
                  if (!noted) return;
                  if (noted.settleFailed) {
                    settleLiveContractProgress(noted.next, "failed");
                    return;
                  }
                  saveActiveSessionSeed(noted.next);
                  setActiveSessionSeed(noted.next);
                  if (noted.flash) {
                    const key = Date.now();
                    setContractProgressFlash({ key, ...noted.flash });
                    window.clearTimeout(contractProgressFlashTimerRef.current);
                    contractProgressFlashTimerRef.current = window.setTimeout(
                      () => setContractProgressFlash(null),
                      CONTRACT_PROGRESS_FLASH_MS,
                    );
                  }
                  if (noted.settleDone) {
                    settleLiveContractProgress(noted.next, "done");
                  }
                },
                onBribeMistress: () => {
                  const spent = spendCinders(
                    walletRef.current,
                    PROMPT_BRIBE_COST,
                  );
                  if (!spent) return;
                  const ok =
                    runtimeRef.current?.bribeMistressGate() ?? false;
                  if (!ok) {
                    // Refund if gate already closed
                    setWallet(creditCinders(spent, PROMPT_BRIBE_COST));
                    return;
                  }
                  setWallet(spent);
                },
                onUnauthorizedEdge: () =>
                  runtimeRef.current?.reportUnauthorized("edge"),
                onUnauthorizedRuin: () =>
                  runtimeRef.current?.reportUnauthorized("ruin"),
                onUnauthorizedCum: () =>
                  runtimeRef.current?.reportUnauthorized("cum"),
              }}
              tideIdol={{
                onTideHit: () => runtimeRef.current?.reportTideHit(),
                onTideFail: () => runtimeRef.current?.reportTideFail(),
                onAnswerTideMiss: (missed) =>
                  runtimeRef.current?.answerTideMiss(missed),
                onAnswerTideComplete: (allDone) =>
                  runtimeRef.current?.answerTideComplete(allDone),
                onIdolFail: () => runtimeRef.current?.reportIdolFail(),
                onAnswerIdolMiss: (missed) =>
                  runtimeRef.current?.answerIdolMiss(missed),
                onAnswerIdolComplete: (allDone) =>
                  runtimeRef.current?.answerIdolComplete(allDone),
                onArmIdolBuzz: () => runtimeRef.current?.armIdolBuzz(),
                onFailIdolBuzz: () => runtimeRef.current?.failIdolBuzz(),
                onSetIdolBuzzHoldMode: (mode) =>
                  runtimeRef.current?.setIdolBuzzHoldMode(mode),
                onSunnaPrepStep: advanceSunnaPrep,
                sunnaBuzzHoldMode: sunnaBuzzHoldMode,
                onSunnaBuzzHoldMode: setSunnaBuzzHoldMode,
              }}
              questContract={{
                onAcceptQuest: () => runtimeRef.current?.acceptQuest(),
                onDeclineQuest: () => runtimeRef.current?.declineQuest(),
                onReportQuest: (success) =>
                  runtimeRef.current?.reportQuest(success),
                questMediaLoading: questMediaLoading,
                questCacheReady: questCacheReady,
                contractEatRestyle: (() => {
                  const seed = activeSessionSeed;
                  const ritual = state?.cumplayRitual;
                  const step =
                    ritual && !ritual.done
                      ? ritual.steps[ritual.stepIndex]
                      : null;
                  if (
                    !shouldRestyleCumplayEat({
                      seed,
                      stepId: step?.id,
                    })
                  ) {
                    return null;
                  }
                  return ruinEatRestyleRu(seed!);
                })(),
                contractProgressFlash: contractProgressFlash,
                contractQuestRestyle: cbtQuestDoneRestyleRu(activeSessionSeed),
              }}
              meta={{
                cindersBalance: wallet.balance,
                sessionActiveBuffs: sessionActiveBuffs,
                cinderGain: cinderGain,
                punishNotice: punishNotice,
                onExport: exportSession,
              }}
            />
          )}
          <ContractMediaDrillHud
            sessionLive={sessionLive}
            mediaLoading={mediaLoading}
            playlistPreload={playlistPreload}
            revision={mediaDrillRevision}
            onBoardChange={(result) => {
              setContractsOpenCount(
                countOpenContracts(ensureDailyContractBoard()),
              );
              setContractsRevision((n) => n + 1);
              if (result.rewarded > 0) {
                setWallet((w) => creditCinders(w, result.rewarded));
              }
            }}
            onDrillCleared={() => {
              setMediaDrillRevision((n) => n + 1);
              setContractsRevision((n) => n + 1);
              setContractsOpenCount(
                countOpenContracts(ensureDailyContractBoard()),
              );
            }}
          />
          {sessionDebrief ? (
            <SessionDebriefSheet
              debrief={sessionDebrief}
              onDismiss={() => setSessionDebrief(null)}
              onNavigate={(id) => {
                const highlight =
                  id === "contracts"
                    ? sessionDebrief.contract?.titleRu
                    : undefined;
                setSessionDebrief(null);
                if (highlight) setContractsHighlightTitle(highlight);
                else if (id === "contracts") setContractsHighlightTitle(null);
                setNav(id);
              }}
            />
          ) : null}
          {abortDebrief ? (
            <AbortDebriefSheet
              debrief={abortDebrief}
              onDismiss={() => setAbortDebrief(null)}
              onNavigate={(id) => {
                const highlight =
                  id === "contracts"
                    ? abortDebrief.contractFailedTitleRu
                    : undefined;
                setAbortDebrief(null);
                if (highlight) setContractsHighlightTitle(highlight);
                else if (id === "contracts") setContractsHighlightTitle(null);
                setNav(id);
              }}
            />
          ) : null}
          {eveningRouteOpen && !sessionLive && !sessionDebrief && !abortDebrief ? (
            <EveningRouteOverlay
              unlocks={mistressUnlockSnapshotFromWallet(wallet)}
              sessionLive={sessionLive}
              onMistressSwitched={handleMistressSwitched}
              onNavigate={setNav}
              onComplete={() => {
                markEveningRouteCompleted();
                markSectionBriefingCompleted("roulette");
                skippedSectionBriefingsRef.current.add("roulette");
                setEveningRouteOpen(false);
              }}
              onLater={() => {
                // Avoid stacking roulette section tip over a deferred evening route.
                skippedSectionBriefingsRef.current.add("roulette");
                setEveningRouteOpen(false);
              }}
              onNeverAgain={() => {
                markEveningRouteDismissed();
                markSectionBriefingDismissed("roulette");
                skippedSectionBriefingsRef.current.add("roulette");
                setEveningRouteOpen(false);
              }}
            />
          ) : null}
          {activeSectionBriefing &&
          !eveningRouteOpen &&
          !sessionLive &&
          !sessionDebrief &&
          !abortDebrief ? (
            <SectionBriefingOverlay
              sectionId={activeSectionBriefing}
              onNavigate={setNav}
              onComplete={() => {
                markSectionBriefingCompleted(activeSectionBriefing);
                skippedSectionBriefingsRef.current.add(activeSectionBriefing);
                setActiveSectionBriefing(null);
              }}
              onLater={() => {
                skippedSectionBriefingsRef.current.add(activeSectionBriefing);
                setActiveSectionBriefing(null);
              }}
              onNeverAgain={() => {
                markSectionBriefingDismissed(activeSectionBriefing);
                skippedSectionBriefingsRef.current.add(activeSectionBriefing);
                setActiveSectionBriefing(null);
              }}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
