import { useEffect, useRef, useState, type RefObject } from "react";
import type { MediaCensorBox, MediaCensorLive } from "../lib/mediaCensor";
import {
  censorDetectRuntimeFromRun,
  formatCensorDetectLogLine,
  notifyCensorDetectRuntime,
} from "../lib/mediaCensorDetect";
import { detectCensorBoxesFromElement } from "../lib/mediaCensorYolox";

type MediaEl = HTMLImageElement | HTMLVideoElement;

const SOURCE_WAIT_MS = 32;
const SOURCE_WAIT_DEADLINE_MS = 8000;

function sourceReady(el: MediaEl): boolean {
  if (el instanceof HTMLVideoElement) {
    return el.videoWidth >= 8 && el.videoHeight >= 8;
  }
  return el.naturalWidth >= 8 && el.naturalHeight >= 8;
}

function publishRuntime(
  runtime: ReturnType<typeof censorDetectRuntimeFromRun>,
) {
  runtime.logLine = formatCensorDetectLogLine(runtime);
  console.info("[цензор]", runtime.logLine);
  notifyCensorDetectRuntime(runtime);
}

/**
 * One neural pass per still slide. Video/gif skip the net (full-frame blur).
 * YOLOX-real only if the YOLOv8 pass is empty (photos).
 */
export function useMediaCensorDetect(
  sourceRef: RefObject<MediaEl | null>,
  live: MediaCensorLive,
  itemId: string | null,
  playSrc: string,
  motion = false,
): MediaCensorBox[] | null {
  const [detected, setDetected] = useState<MediaCensorBox[] | null>(null);
  const liveRef = useRef(live);
  liveRef.current = live;

  useEffect(() => {
    const settings = live.settings;
    const want =
      live.active &&
      settings.detect &&
      Boolean(playSrc) &&
      !motion;
    if (!want) {
      setDetected(null);
      return;
    }

    let stopped = false;
    let waitTimer = 0;
    setDetected(null);

    const waitSource = async (): Promise<MediaEl | null> => {
      const deadline = Date.now() + SOURCE_WAIT_DEADLINE_MS;
      while (!stopped && Date.now() < deadline) {
        const el = sourceRef.current;
        if (el && sourceReady(el)) return el;
        await new Promise<void>((resolve) => {
          waitTimer = window.setTimeout(resolve, SOURCE_WAIT_MS);
        });
      }
      const el = sourceRef.current;
      return el && sourceReady(el) ? el : null;
    };

    const runOnce = async () => {
      const source = await waitSource();
      if (stopped || !source) return;
      try {
        const result = await detectCensorBoxesFromElement(
          source,
          liveRef.current.settings.parts,
        );
        if (stopped) return;
        publishRuntime(censorDetectRuntimeFromRun(result));
        setDetected(result.boxes.length > 0 ? result.boxes : []);
      } catch (err) {
        const detail =
          err instanceof Error ? err.message : "нейросеть не стартанула";
        if (!stopped) {
          publishRuntime({ ok: false, detail, boxCount: 0 });
          setDetected(null);
        }
      }
    };

    void runOnce();

    return () => {
      stopped = true;
      window.clearTimeout(waitTimer);
    };
  }, [
    live.active,
    live.settings.detect,
    live.settings.coverage,
    live.settings.parts,
    itemId,
    playSrc,
    sourceRef,
    motion,
  ]);

  return detected;
}
