import { useEffect, useRef, useState, type ReactNode } from "react";
import { displayRemoteMediaUrl } from "../../lib/media";
import { joidbPlayUrl } from "../../lib/joidb/client";
import { mapJoidbHlsUrl } from "../../lib/joidb/hls";
import { loadHlsApi } from "../../lib/joidb/loadHls";
import { cueAtTime, instructionCues, type JoidbVttCue } from "../../lib/joidb/parseVtt";
import type { JoidbVideo } from "../../lib/joidb/parseCatalog";
import "./joidb.css";

type Props = {
  video: JoidbVideo;
  cues: JoidbVttCue[];
  paused?: boolean;
  /** `stage` — только видео (страница watch). `page` — бар «Назад». */
  chrome?: "page" | "stage";
  onClose: () => void;
  onEnded?: () => void;
  onCue?: (cue: JoidbVttCue | null) => void;
  hud?: ReactNode;
};

type WebkitEl = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};

type WebkitVideo = HTMLVideoElement & {
  webkitExitFullscreen?: () => void;
};

function isStageFullscreen(stage: HTMLElement | null): boolean {
  if (!stage) return false;
  const active = document.fullscreenElement;
  return active === stage || stage.contains(active);
}

async function toggleStageFullscreen(stage: HTMLElement): Promise<void> {
  try {
    if (isStageFullscreen(stage)) {
      if (document.fullscreenElement) await document.exitFullscreen();
      return;
    }
    const webkit = stage as WebkitEl;
    if (stage.requestFullscreen) {
      await stage.requestFullscreen();
      return;
    }
    webkit.webkitRequestFullscreen?.();
  } catch {
    /* blocked or already left */
  }
}

function FullscreenIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden>
      {expanded ? (
        <path
          d="M6.2 3.2H3.4v2.8M9.8 3.2h2.8v2.8M6.2 12.8H3.4V10M9.8 12.8h2.8V10"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : (
        <path
          d="M3.4 6.2V3.4h2.8M9.8 3.4h2.8v2.8M3.4 9.8v2.8h2.8M12.6 9.8v2.8H9.8"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}

export function JoidbPlayer({
  video,
  cues,
  paused = false,
  chrome = "page",
  onClose,
  onEnded,
  onCue,
  hud,
}: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const hlsRef = useRef<{ destroy: () => void } | null>(null);
  const lastCueId = useRef<string | null>(null);
  const cuesRef = useRef(cues);
  cuesRef.current = cues;
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    const src = joidbPlayUrl(video.id);
    const ac = new AbortController();
    void loadHlsApi(ac.signal)
      .then((Hls) => {
        if (ac.signal.aborted || !videoRef.current) return;
        if (Hls.isSupported()) {
          const hls = new Hls({
            xhrSetup(xhr, url) {
              const mapped = mapJoidbHlsUrl(url);
              if (mapped !== url) xhr.open("GET", mapped);
            },
          });
          hls.loadSource(src);
          hls.attachMedia(videoRef.current);
          hlsRef.current = hls;
          return;
        }
        if (videoRef.current.canPlayType("application/vnd.apple.mpegurl")) {
          videoRef.current.src = src;
        }
      })
      .catch((err) => {
        if (err instanceof Error && err.name === "AbortError") return;
        if (el.canPlayType("application/vnd.apple.mpegurl")) el.src = src;
      });
    return () => {
      ac.abort();
      hlsRef.current?.destroy();
      hlsRef.current = null;
      el.removeAttribute("src");
      el.load();
    };
  }, [video.id]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (paused) el.pause();
    else void el.play().catch(() => undefined);
  }, [paused, video.id]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    const onTime = () => {
      const cue = cueAtTime(instructionCues(cuesRef.current), el.currentTime);
      const id = cue?.id ?? null;
      if (id === lastCueId.current) return;
      lastCueId.current = id;
      onCue?.(cue);
    };
    const onEnd = () => onEnded?.();
    el.addEventListener("timeupdate", onTime);
    el.addEventListener("ended", onEnd);
    return () => {
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("ended", onEnd);
    };
  }, [onCue, onEnded]);

  useEffect(() => {
    if (chrome !== "page") return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (document.fullscreenElement) return;
      e.preventDefault();
      onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [chrome, onClose]);

  useEffect(() => {
    const videoNode = videoRef.current;
    const stageNode = stageRef.current;
    if (!videoNode || !stageNode) return;
    const videoEl: HTMLVideoElement = videoNode;
    const stageEl: HTMLDivElement = stageNode;

    function sync() {
      setFullscreen(isStageFullscreen(stageEl));
      if (document.fullscreenElement === videoEl) {
        void document.exitFullscreen().then(() => {
          if (stageEl.isConnected) return stageEl.requestFullscreen();
        }).catch(() => undefined);
      }
    }

    function onWebkitBegin() {
      const webkitVideo = videoEl as WebkitVideo;
      webkitVideo.webkitExitFullscreen?.();
      void toggleStageFullscreen(stageEl);
    }

    sync();
    document.addEventListener("fullscreenchange", sync);
    videoEl.addEventListener("webkitbeginfullscreen", onWebkitBegin);
    return () => {
      document.removeEventListener("fullscreenchange", sync);
      videoEl.removeEventListener("webkitbeginfullscreen", onWebkitBegin);
      if (document.fullscreenElement === stageEl) {
        void document.exitFullscreen();
      }
    };
  }, [video.id]);

  return (
    <div className={chrome === "stage" ? "joidb-player is-stage" : "joidb-player"}>
      <div
        ref={stageRef}
        className={
          "joidb-player__stage" + (fullscreen ? " is-fullscreen" : "")
        }
      >
        <video
          ref={videoRef}
          className="joidb-player__video"
          poster={
            video.thumbnail ? displayRemoteMediaUrl(video.thumbnail) : undefined
          }
          controls
          controlsList="nofullscreen"
          playsInline
        />
        <button
          type="button"
          className={
            "joidb-player__fs doujin-reader__icon" + (fullscreen ? " is-on" : "")
          }
          title={fullscreen ? "Окно" : "Полный экран"}
          aria-label={fullscreen ? "Окно" : "Полный экран"}
          aria-pressed={fullscreen}
          onClick={() => {
            const stage = stageRef.current;
            if (stage) void toggleStageFullscreen(stage);
          }}
        >
          <FullscreenIcon expanded={fullscreen} />
        </button>
        {hud}
      </div>
      {chrome === "page" ? (
        <div className="joidb-player__bar">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Назад
          </button>
          <div className="joidb-player__meta">
            <strong>{video.title}</strong>
            {video.duration ? (
              <span className="muted">{video.duration}</span>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
