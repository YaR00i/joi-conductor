import { useEffect, useRef, useState, type MouseEvent } from "react";
import {
  fetchGifDurationSec,
  planMediaHold,
  reshuffleMediaCycle,
  type MediaItem,
  type MediaKind,
} from "../lib/media";
import {
  ensureMediaCached,
  getFilePreloadPhase,
  markMediaPlaybackError,
  peekCachedPlayUrl,
  preloadAround,
  preloadEntirePlaylist,
  retryMediaItem,
  syncPreloadCacheToPlaylist,
} from "../lib/mediaPreload";

export type MediaLoadStatus = {
  kind: MediaKind | null;
  /** 0–100 when known; null while waiting without Content-Length */
  percent: number | null;
  phase: "idle" | "loading" | "ready" | "error";
};

/** After a user gesture (Ready / click), unmuted autoplay is allowed. */
let mediaAudioUnlocked = false;

/** Call from a click handler (e.g. «Готов») so later slides can autoplay with sound. */
export function unlockMediaStageAudio(): void {
  mediaAudioUnlocked = true;
}

type VideoCue = "none" | "play" | "unmute";

function clampDeckIndex(index: number | undefined, length: number): number {
  if (length <= 0) return 0;
  if (index == null || !Number.isFinite(index)) return 0;
  return Math.min(Math.max(0, Math.floor(index)), length - 1);
}

interface MediaStageProps {
  items: MediaItem[];
  slideSec: number;
  running: boolean;
  /** Auto-press play/unmute cue when it appears (default true). */
  autoplay?: boolean;
  /** Auto-advance slides (photos/gifs/videos). Off = stay on current. */
  slideAutoplay?: boolean;
  /** Start cursor after remount / full deck replace (e.g. resume after quest). */
  initialIndex?: number;
  /** Video element volume 0..1 */
  videoVolume?: number;
  onCurrentChange?: (item: MediaItem | null) => void;
  onLoadStatusChange?: (status: MediaLoadStatus) => void;
  /**
   * Fired when leaving a slide (auto or manual).
   * Use dwellMs to detect quick skips for dislike / bad-wager signals.
   */
  onSlideLeave?: (info: {
    item: MediaItem;
    dwellMs: number;
    reason: "auto" | "manual";
  }) => void;
  /** Cursor / remaining slides — used to top up the main Gelbooru cache. */
  onDeckProgress?: (info: {
    index: number;
    deckLength: number;
    /** Slides still ahead including current */
    unviewedRemaining: number;
    /** unviewedRemaining / deckLength (0 when empty) */
    unviewedRatio: number;
    itemId: string | null;
    /** True when the deck reshuffled after a full cycle. */
    cycled?: boolean;
  }) => void;
}

export function MediaStage({
  items,
  slideSec,
  running,
  autoplay = true,
  slideAutoplay = true,
  initialIndex = 0,
  videoVolume = 1,
  onCurrentChange,
  onLoadStatusChange,
  onSlideLeave,
  onDeckProgress,
}: MediaStageProps) {
  /** Shuffled play order for the current cycle (no repeats until exhausted). */
  const [deck, setDeck] = useState<MediaItem[]>(() => items.slice());
  const [index, setIndex] = useState(() =>
    clampDeckIndex(initialIndex, items.length),
  );
  const initialIndexRef = useRef(initialIndex);
  initialIndexRef.current = initialIndex;
  const [fade, setFade] = useState(true);
  const [failed, setFailed] = useState(false);
  const [videoLoop, setVideoLoop] = useState(true);
  const [playSrc, setPlaySrc] = useState("");
  const [videoCue, setVideoCue] = useState<VideoCue>("none");

  const holdTimerRef = useRef(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const loadGenRef = useRef(0);
  const holdGenRef = useRef(0);
  /** User explicitly paused via click — don't auto-resume until they click again. */
  const userPausedRef = useRef(false);
  /** ids we already auto-retried once for error phase (avoid retry loops). */
  const autoRetriedIdsRef = useRef<Set<string>>(new Set());
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const deckRef = useRef(deck);
  deckRef.current = deck;
  const onCurrentChangeRef = useRef(onCurrentChange);
  onCurrentChangeRef.current = onCurrentChange;
  const onLoadStatusRef = useRef(onLoadStatusChange);
  onLoadStatusRef.current = onLoadStatusChange;
  const runningRef = useRef(running);
  runningRef.current = running;
  const autoplayRef = useRef(autoplay);
  autoplayRef.current = autoplay;
  const slideAutoplayRef = useRef(slideAutoplay);
  slideAutoplayRef.current = slideAutoplay;
  const videoCueRef = useRef(videoCue);
  videoCueRef.current = videoCue;
  const autoPressGenRef = useRef(0);

  const onSlideLeaveRef = useRef(onSlideLeave);
  onSlideLeaveRef.current = onSlideLeave;
  const onDeckProgressRef = useRef(onDeckProgress);
  onDeckProgressRef.current = onDeckProgress;
  const videoVolumeRef = useRef(videoVolume);
  videoVolumeRef.current = Math.min(1, Math.max(0, videoVolume));
  const slideShownAtRef = useRef(performance.now());
  const indexRef = useRef(index);
  indexRef.current = index;
  const prevItemsRef = useRef<MediaItem[]>(items);

  function applyVideoVolume(video: HTMLVideoElement | null = videoRef.current) {
    if (!video) return;
    video.volume = videoVolumeRef.current;
  }

  const current =
    deck.length > 0 ? deck[Math.min(index, deck.length - 1)]! : null;

  function clearHoldTimer() {
    window.clearTimeout(holdTimerRef.current);
    holdTimerRef.current = 0;
  }

  function reportLoad(status: MediaLoadStatus) {
    onLoadStatusRef.current?.(status);
  }

  function emitSlideLeave(reason: "auto" | "manual") {
    const list = deckRef.current;
    const at = Math.min(Math.max(0, indexRef.current), Math.max(0, list.length - 1));
    const item = list[at];
    if (!item) return;
    const dwellMs = Math.max(0, performance.now() - slideShownAtRef.current);
    onSlideLeaveRef.current?.({ item, dwellMs, reason });
  }

  function advance(delta: number, reason: "auto" | "manual" = "manual") {
    const list = deckRef.current;
    if (list.length === 0) return;
    if (delta !== 0) emitSlideLeave(reason);
    clearHoldTimer();
    setFade(false);
    window.setTimeout(() => {
      if (delta > 0) {
        setIndex((cur) => {
          const at = Math.min(Math.max(0, cur), list.length - 1);
          const next = at + delta;
          if (next < list.length) return next;
          // Cycle exhausted → new shuffle, don't start with the slide just shown
          const avoidId = list[at]?.id ?? null;
          const nextDeck = reshuffleMediaCycle(itemsRef.current, avoidId);
          deckRef.current = nextDeck;
          setDeck(nextDeck);
          preloadEntirePlaylist(nextDeck);
          const deckLength = nextDeck.length;
          onDeckProgressRef.current?.({
            index: 0,
            deckLength,
            unviewedRemaining: deckLength,
            unviewedRatio: deckLength === 0 ? 0 : 1,
            itemId: nextDeck[0]?.id ?? null,
            cycled: true,
          });
          return 0;
        });
      } else {
        setIndex((cur) => (cur + delta + list.length) % list.length);
      }
      slideShownAtRef.current = performance.now();
      setFade(true);
    }, 160);
  }

  const advanceRef = useRef(advance);
  advanceRef.current = advance;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.tagName === "SELECT" ||
          t.isContentEditable)
      ) {
        return;
      }
      if (deckRef.current.length < 2) return;
      e.preventDefault();
      advanceRef.current(e.key === "ArrowRight" ? 1 : -1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const prev = prevItemsRef.current;
    prevItemsRef.current = items;

    const prevIds = new Set(prev.map((i) => i.id));
    const nextIds = new Set(items.map((i) => i.id));
    const added = items.filter((i) => !prevIds.has(i.id));
    const lostAny = prev.some((i) => !nextIds.has(i.id));

    // Mid-session top-up: only new ids appended — keep cursor.
    if (prev.length > 0 && !lostAny && added.length > 0) {
      setDeck((d) => {
        const have = new Set(d.map((x) => x.id));
        const extra = added.filter((a) => !have.has(a.id));
        if (extra.length === 0) return d;
        const next = [...d, ...extra];
        deckRef.current = next;
        return next;
      });
      setFailed(false);
      preloadEntirePlaylist(items);
      return;
    }

    // Full replace (session start, overlay swap, library reload).
    const nextDeck = items.slice();
    deckRef.current = nextDeck;
    setDeck(nextDeck);
    setIndex(clampDeckIndex(initialIndexRef.current, nextDeck.length));
    setFailed(false);
    if (nextDeck.length > 0) {
      preloadEntirePlaylist(nextDeck);
    } else {
      syncPreloadCacheToPlaylist(nextDeck);
    }
  }, [items]);

  useEffect(() => {
    setFailed(false);
    setFade(true);
    setVideoCue("none");
    userPausedRef.current = false;
    slideShownAtRef.current = performance.now();
  }, [index, current?.id]);

  useEffect(() => {
    onCurrentChangeRef.current?.(current);
  }, [current]);

  useEffect(() => {
    const deckLength = deck.length;
    const unviewedRemaining =
      deckLength === 0 ? 0 : Math.max(0, deckLength - index);
    onDeckProgressRef.current?.({
      index,
      deckLength,
      unviewedRemaining,
      unviewedRatio: deckLength === 0 ? 0 : unviewedRemaining / deckLength,
      itemId: current?.id ?? null,
    });
  }, [index, deck.length, current?.id]);

  useEffect(() => {
    applyVideoVolume(videoRef.current);
  }, [videoVolume]);

  /**
   * Always try to start playback on slide change.
   * Unmuted if audio already unlocked; otherwise muted autoplay.
   * With autoplay on, never leave a sticky cue — play first, sound if allowed.
   */
  async function ensureVideoAutoplay(video: HTMLVideoElement): Promise<void> {
    applyVideoVolume(video);
    await waitVideoCanPlay(video);

    if (mediaAudioUnlocked) {
      video.muted = false;
      try {
        await video.play();
        setVideoCue("none");
        return;
      } catch {
        /* fall through to muted */
      }
    }

    video.muted = true;
    try {
      await video.play();
      if (mediaAudioUnlocked) {
        video.muted = false;
        setVideoCue("none");
        return;
      }
      if (autoplayRef.current) {
        // Keep muted so playback isn't killed by autoplay policy; hide cue
        setVideoCue("none");
      } else {
        setVideoCue("unmute");
      }
    } catch {
      setVideoCue("play");
    }
  }

  function onVideoClick(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    void pressPlayCue({ fromUser: true });
  }

  /** Same as clicking the cue — used by user click and autoplay. */
  async function pressPlayCue(opts?: { fromUser?: boolean }): Promise<void> {
    const video = videoRef.current;
    if (!video || current?.kind !== "video") return;

    if (opts?.fromUser) {
      mediaAudioUnlocked = true;
    }

    if (video.paused) {
      if (mediaAudioUnlocked || opts?.fromUser) {
        video.muted = false;
        applyVideoVolume(video);
        try {
          await video.play();
          userPausedRef.current = false;
          setVideoCue("none");
          return;
        } catch {
          /* fall through to muted autoplay */
        }
      }
      await ensureVideoAutoplay(video);
      // Autoplay path: if still paused, one more muted force-play
      if (autoplayRef.current && video.paused) {
        video.muted = true;
        try {
          await video.play();
          setVideoCue("none");
        } catch {
          setVideoCue("play");
        }
      }
      return;
    }

    if (video.muted || videoCueRef.current === "unmute") {
      video.muted = false;
      applyVideoVolume(video);
      if (opts?.fromUser) mediaAudioUnlocked = true;
      setVideoCue("none");
      return;
    }

    // Only user click pauses while playing with sound
    if (opts?.fromUser) {
      video.pause();
      userPausedRef.current = true;
      setVideoCue("play");
    }
  }

  // Auto-press cue when it appears (autoplay on)
  useEffect(() => {
    if (!autoplay || !running || videoCue === "none") return;
    if (userPausedRef.current) return;

    const gen = ++autoPressGenRef.current;
    const timers: number[] = [];

    const attempt = () => {
      if (autoPressGenRef.current !== gen) return;
      if (!autoplayRef.current || userPausedRef.current) return;
      const video = videoRef.current;
      if (!video) return;
      if (!video.paused && videoCueRef.current === "none") return;
      void pressPlayCue({ fromUser: false });
    };

    timers.push(window.setTimeout(attempt, 30));
    timers.push(window.setTimeout(attempt, 120));
    timers.push(window.setTimeout(attempt, 350));
    timers.push(window.setTimeout(attempt, 800));
    timers.push(window.setTimeout(attempt, 1600));

    return () => {
      for (const t of timers) window.clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoplay, running, videoCue, current?.id, playSrc]);

  // On every new video slide with autoplay — force start without waiting for cue
  useEffect(() => {
    if (!autoplay || !running) return;
    if (current?.kind !== "video" || !playSrc) return;
    if (userPausedRef.current) return;
    const gen = ++autoPressGenRef.current;
    const timers = [40, 200, 500, 1200].map((ms) =>
      window.setTimeout(() => {
        if (autoPressGenRef.current !== gen) return;
        if (!autoplayRef.current || userPausedRef.current) return;
        void pressPlayCue({ fromUser: false });
      }, ms),
    );
    return () => {
      for (const t of timers) window.clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoplay, running, current?.id, playSrc]);

  // Load current (from cache if warm) + preload neighbors
  useEffect(() => {
    const gen = ++loadGenRef.current;
    setPlaySrc("");

    if (!current) {
      reportLoad({ kind: null, percent: null, phase: "idle" });
      return;
    }

    const hit = peekCachedPlayUrl(current.id);
    if (hit) {
      setPlaySrc(hit);
      reportLoad({ kind: current.kind, percent: 100, phase: "ready" });
      preloadAround(deckRef.current, index, 3, 1);
      return;
    }

    reportLoad({
      kind: current.kind,
      percent: null,
      phase: "loading",
    });

    // If this item previously failed to cache, kick a single auto-retry before
    // falling back to ensureMediaCached (which would otherwise resolve to the
    // cached error immediately). Guarded so we only try once per item per mount.
    const phase = getFilePreloadPhase(current.id);
    if (
      phase === "error" &&
      !autoRetriedIdsRef.current.has(current.id)
    ) {
      autoRetriedIdsRef.current.add(current.id);
      void retryMediaItem(current.id);
    } else if (phase !== "error") {
      autoRetriedIdsRef.current.delete(current.id);
    }

    let cancelled = false;
    void ensureMediaCached(current, (p) => {
      if (cancelled || loadGenRef.current !== gen) return;
      reportLoad({
        kind: current.kind,
        percent: p.percent,
        phase: p.phase === "error" ? "error" : p.phase,
      });
    })
      .then((url) => {
        if (cancelled || loadGenRef.current !== gen) return;
        setPlaySrc(url);
        reportLoad({ kind: current.kind, percent: 100, phase: "ready" });
        preloadAround(deckRef.current, index, 3, 1);
      })
      .catch(() => {
        if (cancelled || loadGenRef.current !== gen) return;
        reportLoad({ kind: current.kind, percent: null, phase: "error" });
        setFailed(true);
      });

    preloadAround(deckRef.current, index, 3, 1);

    return () => {
      cancelled = true;
    };
  }, [current?.id, current?.kind, index]);

  // Video buffer progress (extra signal while decoding)
  useEffect(() => {
    if (!current || current.kind !== "video" || !playSrc) return;
    const video = videoRef.current;
    if (!video) return;

    const update = () => {
      if (!video.duration || !Number.isFinite(video.duration)) return;
      let end = 0;
      try {
        if (video.buffered.length > 0) {
          end = video.buffered.end(video.buffered.length - 1);
        }
      } catch {
        /* ignore */
      }
      const pct = Math.min(100, Math.round((end / video.duration) * 100));
      const ready =
        video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA || pct >= 99;
      if (ready) {
        reportLoad({ kind: "video", percent: 100, phase: "ready" });
      } else {
        reportLoad({ kind: "video", percent: pct, phase: "loading" });
      }
    };

    const onReady = () => {
      reportLoad({ kind: "video", percent: 100, phase: "ready" });
    };

    video.addEventListener("progress", update);
    video.addEventListener("loadedmetadata", update);
    video.addEventListener("loadeddata", update);
    video.addEventListener("canplay", update);
    video.addEventListener("canplaythrough", onReady);
    update();

    return () => {
      video.removeEventListener("progress", update);
      video.removeEventListener("loadedmetadata", update);
      video.removeEventListener("loadeddata", update);
      video.removeEventListener("canplay", update);
      video.removeEventListener("canplaythrough", onReady);
    };
  }, [current?.id, current?.kind, playSrc]);

  // Hold / loop scheduling once media is playable
  useEffect(() => {
    clearHoldTimer();
    const gen = ++holdGenRef.current;
    let cancelled = false;
    const videoEl = videoRef.current;

    const finishSlide = () => {
      if (cancelled || holdGenRef.current !== gen) return;
      if (!slideAutoplayRef.current) return;
      if (itemsRef.current.length < 2) return;
      advance(1, "auto");
    };

    const handleEnded = () => {
      clearHoldTimer();
      finishSlide();
    };

    if (!running || !current || !playSrc) {
      videoEl?.pause();
      if (current?.kind === "video") setVideoCue("play");
      return () => {
        cancelled = true;
        clearHoldTimer();
      };
    }

    void (async () => {
      let durationSec: number | null = null;

      if (current.kind === "video") {
        const video = await waitForVideoEl(
          () => videoRef.current,
          () => cancelled || holdGenRef.current !== gen,
        );
        if (!video || cancelled || holdGenRef.current !== gen) return;
        durationSec = await waitVideoDuration(video);
        if (cancelled || holdGenRef.current !== gen) return;
      } else if (current.kind === "gif") {
        durationSec = await fetchGifDurationSec(playSrc);
        if (cancelled || holdGenRef.current !== gen) return;
      }

      const plan = planMediaHold(durationSec, slideSec);
      if (cancelled || holdGenRef.current !== gen) return;

      const canAdvance = slideAutoplayRef.current;
      // Stay on slide: force loop so video doesn't freeze on last frame
      const loop = canAdvance ? plan.loop : true;
      setVideoLoop(loop);

      const video = videoRef.current;
      if (current.kind === "video" && video) {
        video.loop = loop;
        applyVideoVolume(video);
        if (video.currentTime > 0.05) video.currentTime = 0;

        if (!userPausedRef.current) {
          await ensureVideoAutoplay(video);
        } else {
          setVideoCue("play");
        }
        if (cancelled || holdGenRef.current !== gen) return;

        if (!canAdvance) return;

        if (!plan.loop) {
          video.addEventListener("ended", handleEnded);
          holdTimerRef.current = window.setTimeout(
            finishSlide,
            plan.holdMs + 800,
          );
          return;
        }
      }

      if (!canAdvance) return;
      holdTimerRef.current = window.setTimeout(finishSlide, plan.holdMs);
    })();

    return () => {
      cancelled = true;
      clearHoldTimer();
      videoRef.current?.removeEventListener("ended", handleEnded);
      videoRef.current?.pause();
    };
  }, [running, current?.id, current?.kind, playSrc, slideSec, index, slideAutoplay]);

  // Resume after tab focus; retry autoplay when buffer becomes ready
  useEffect(() => {
    if (!current || current.kind !== "video" || !playSrc) return;
    const video = videoRef.current;
    if (!video) return;

    const retryIfNeeded = () => {
      if (!runningRef.current || userPausedRef.current) return;
      if (!video.paused) return;
      void ensureVideoAutoplay(video);
    };

    const onVis = () => {
      if (document.visibilityState !== "visible") return;
      retryIfNeeded();
    };

    video.addEventListener("canplay", retryIfNeeded);
    video.addEventListener("loadeddata", retryIfNeeded);
    document.addEventListener("visibilitychange", onVis);

    return () => {
      video.removeEventListener("canplay", retryIfNeeded);
      video.removeEventListener("loadeddata", retryIfNeeded);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [current?.id, current?.kind, playSrc]);

  function onMediaError() {
    if (current?.source === "gelbooru") {
      markMediaPlaybackError(
        current.id,
        current.kind === "video"
          ? "файл скачан, но Chromium не смог декодировать видео (кодек/контейнер)"
          : "файл скачан, но Chromium не смог его декодировать",
      );
    }
    setFailed(true);
    reportLoad({
      kind: current?.kind ?? null,
      percent: null,
      phase: "error",
    });
    window.setTimeout(() => {
      if (deckRef.current.length > 1) advance(1, "auto");
    }, 400);
  }

  const cueLabel =
    videoCue === "unmute"
      ? "Нажми для звука"
      : "Нажми, чтобы играть со звуком";

  return (
    <div className="media-stage">
      {current ? (
        <div className={`media-stage__frame ${fade ? "is-in" : "is-out"}`}>
          <div className="media-stage__viewport">
            {current.kind === "video" ? (
              playSrc ? (
                <video
                  key={current.id}
                  ref={videoRef}
                  className="media-stage__media media-stage__media--video"
                  src={playSrc}
                  autoPlay
                  muted
                  loop={videoLoop}
                  playsInline
                  preload="auto"
                  controls={false}
                  onClick={onVideoClick}
                  onError={onMediaError}
                />
              ) : (
                <div className="media-stage__loading" aria-hidden>
                  Загрузка…
                </div>
              )
            ) : playSrc ? (
              <img
                key={current.id}
                className="media-stage__media"
                src={playSrc}
                alt=""
                draggable={false}
                referrerPolicy="no-referrer"
                decoding="async"
                onError={onMediaError}
              />
            ) : (
              <div className="media-stage__loading" aria-hidden>
                Загрузка…
              </div>
            )}
          </div>
          {current.kind === "video" && playSrc && videoCue !== "none" ? (
            <button
              type="button"
              className="media-stage__play-cue"
              aria-label={cueLabel}
              onClick={onVideoClick}
            >
              <span className="media-stage__play-cue__icon" aria-hidden>
                ▶
              </span>
              <span className="media-stage__play-cue__text">{cueLabel}</span>
            </button>
          ) : null}
          {failed ? (
            <div className="media-stage__fail">
              Файл не загрузился — листаю дальше…
            </div>
          ) : null}
        </div>
      ) : (
        <div className="media-stage__empty">
          <p>Нет медиа</p>
          <p className="media-stage__hint">
            На экране «Сегодня» укажи теги Gelbooru, избранное или локальную
            папку.
          </p>
        </div>
      )}

      <button
        type="button"
        className="media-stage__arrow media-stage__arrow--prev"
        aria-label="Предыдущее (←)"
        title="Предыдущее (←)"
        onClick={() => advance(-1)}
        disabled={deck.length < 2}
      >
        ‹
      </button>
      <button
        type="button"
        className="media-stage__arrow media-stage__arrow--next"
        aria-label="Следующее (→)"
        title="Следующее (→)"
        onClick={() => advance(1)}
        disabled={deck.length < 2}
      >
        ›
      </button>

      {deck.length > 0 ? (
        <div className="media-stage__count">
          {Math.min(index, deck.length - 1) + 1} / {deck.length}
        </div>
      ) : null}
    </div>
  );
}

function waitForVideoEl(
  getEl: () => HTMLVideoElement | null,
  isStale: () => boolean,
): Promise<HTMLVideoElement | null> {
  const hit = getEl();
  if (hit) return Promise.resolve(hit);
  return new Promise((resolve) => {
    let frames = 0;
    const tick = () => {
      if (isStale()) {
        resolve(null);
        return;
      }
      const el = getEl();
      if (el) {
        resolve(el);
        return;
      }
      frames += 1;
      if (frames > 30) {
        resolve(null);
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

function waitVideoCanPlay(video: HTMLVideoElement): Promise<void> {
  if (video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      video.removeEventListener("canplay", done);
      video.removeEventListener("loadeddata", done);
      resolve();
    };
    video.addEventListener("canplay", done);
    video.addEventListener("loadeddata", done);
    window.setTimeout(done, 3500);
  });
}

function waitVideoDuration(video: HTMLVideoElement): Promise<number | null> {
  if (Number.isFinite(video.duration) && video.duration > 0) {
    return Promise.resolve(video.duration);
  }
  return new Promise((resolve) => {
    const done = () => {
      video.removeEventListener("loadedmetadata", done);
      video.removeEventListener("error", onErr);
      resolve(
        Number.isFinite(video.duration) && video.duration > 0
          ? video.duration
          : null,
      );
    };
    const onErr = () => {
      video.removeEventListener("loadedmetadata", done);
      video.removeEventListener("error", onErr);
      resolve(null);
    };
    video.addEventListener("loadedmetadata", done);
    video.addEventListener("error", onErr);
    if (video.readyState >= 1) done();
  });
}
