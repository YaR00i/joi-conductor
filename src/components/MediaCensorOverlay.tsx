import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import {
  blurPx,
  containRect,
  loadMediaCensorLive,
  MEDIA_CENSOR_BLUR_OUT_MS,
  mosaicCellPx,
  penisRevealHoles,
  pickMediaCensorLoadTaunt,
  subscribeMediaCensor,
  type MediaCensorBox,
  type MediaCensorLive,
  type MediaCensorStyle,
} from "../lib/mediaCensor";
import { penisHoleEllipse } from "../lib/mediaCensorPenisAxis";
import { resolveCensorBoxes, subscribeCensorDetectRuntime } from "../lib/mediaCensorDetect";
import { useMediaCensorDetect } from "./useMediaCensorDetect";

type MediaEl = HTMLImageElement | HTMLVideoElement;

const VEIL_FADE_MS = MEDIA_CENSOR_BLUR_OUT_MS;
const VEIL_UNMOUNT_MS = VEIL_FADE_MS + 80;

function sourceSize(el: MediaEl): { w: number; h: number } {
  if (el instanceof HTMLVideoElement) {
    return { w: el.videoWidth, h: el.videoHeight };
  }
  return {
    w: el.naturalWidth,
    h: el.naturalHeight,
  };
}

function boxToPx(
  box: MediaCensorBox,
  dest: { x: number; y: number; w: number; h: number },
): { x: number; y: number; w: number; h: number } {
  return {
    x: dest.x + box.x * dest.w,
    y: dest.y + box.y * dest.h,
    w: box.w * dest.w,
    h: box.h * dest.h,
  };
}

function drawMosaic(
  ctx: CanvasRenderingContext2D,
  source: MediaEl,
  src: { x: number; y: number; w: number; h: number },
  dst: { x: number; y: number; w: number; h: number },
  cell: number,
  scratch: HTMLCanvasElement,
) {
  const tw = Math.max(1, Math.round(dst.w / cell));
  const th = Math.max(1, Math.round(dst.h / cell));
  scratch.width = tw;
  scratch.height = th;
  const tctx = scratch.getContext("2d");
  if (!tctx) return;
  tctx.imageSmoothingEnabled = false;
  tctx.drawImage(source, src.x, src.y, src.w, src.h, 0, 0, tw, th);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(scratch, 0, 0, tw, th, dst.x, dst.y, dst.w, dst.h);
  ctx.imageSmoothingEnabled = true;
}

function drawBlur(
  ctx: CanvasRenderingContext2D,
  source: MediaEl,
  dest: { x: number; y: number; w: number; h: number },
  clip: { x: number; y: number; w: number; h: number },
  px: number,
) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(clip.x, clip.y, clip.w, clip.h);
  ctx.clip();
  ctx.filter = `blur(${px}px)`;
  ctx.drawImage(source, dest.x, dest.y, dest.w, dest.h);
  ctx.filter = "none";
  ctx.restore();
}

function drawBars(
  ctx: CanvasRenderingContext2D,
  clip: { x: number; y: number; w: number; h: number },
  style: MediaCensorStyle,
) {
  ctx.fillStyle = "#0b0b0c";
  ctx.fillRect(clip.x, clip.y, clip.w, clip.h);
  if (style !== "sticker") return;
  const stripe = Math.max(6, Math.round(clip.h / 8));
  ctx.fillStyle = "rgba(232, 90, 140, 0.55)";
  for (let y = clip.y; y < clip.y + clip.h; y += stripe * 2) {
    ctx.fillRect(clip.x, y, clip.w, stripe);
  }
  const fontPx = Math.max(11, Math.min(28, clip.h * 0.28, clip.w * 0.18));
  ctx.fillStyle = "#f7e6ee";
  ctx.font = `700 ${fontPx}px ui-sans-serif, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("ЦЕНЗУРА", clip.x + clip.w / 2, clip.y + clip.h / 2);
}

function beginCanvas(
  canvas: HTMLCanvasElement,
): { ctx: CanvasRenderingContext2D; viewW: number; viewH: number } | null {
  const viewW = canvas.clientWidth;
  const viewH = canvas.clientHeight;
  if (viewW < 2 || viewH < 2) return null;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const pw = Math.round(viewW * dpr);
  const ph = Math.round(viewH * dpr);
  if (canvas.width !== pw || canvas.height !== ph) {
    canvas.width = pw;
    canvas.height = ph;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, viewW, viewH };
}

function paint(
  canvas: HTMLCanvasElement,
  source: MediaEl,
  live: MediaCensorLive,
  scratch: HTMLCanvasElement,
  detected: MediaCensorBox[] | null,
): boolean {
  const view = beginCanvas(canvas);
  if (!view) return false;
  const { ctx, viewW, viewH } = view;
  ctx.clearRect(0, 0, viewW, viewH);

  const media = sourceSize(source);
  if (media.w < 2 || media.h < 2) return false;
  const dest = containRect(media.w, media.h, viewW, viewH);
  const boxes = resolveCensorBoxes(live.settings, detected);
  if (boxes.length === 0) return true;

  try {
    for (const box of boxes) {
      const clip = boxToPx(box, dest);
      if (clip.w < 2 || clip.h < 2) continue;
      const src = {
        x: box.x * media.w,
        y: box.y * media.h,
        w: box.w * media.w,
        h: box.h * media.h,
      };
      switch (live.settings.style) {
        case "mosaic":
          drawMosaic(
            ctx,
            source,
            src,
            clip,
            mosaicCellPx(live.settings.strength, clip.h),
            scratch,
          );
          break;
        case "blur":
          drawBlur(
            ctx,
            source,
            dest,
            clip,
            blurPx(live.settings.strength, clip.h),
          );
          break;
        case "bars":
        case "sticker":
          drawBars(ctx, clip, live.settings.style);
          break;
        default: {
          const _exhaustive: never = live.settings.style;
          return _exhaustive;
        }
      }
    }
    const holes = penisRevealHoles(live.settings, detected);
    if (holes.length > 0) {
      ctx.save();
      ctx.globalCompositeOperation = "destination-out";
      ctx.fillStyle = "#000";
      for (let i = 0; i < holes.length; i += 1) {
        const hole = holes[i]!;
        const clip = boxToPx(hole, dest);
        if (clip.w < 2 || clip.h < 2) continue;
        const axis = hole.axisRad ?? null;
        const oval = penisHoleEllipse(clip.w, clip.h, axis);
        ctx.beginPath();
        ctx.ellipse(
          clip.x + clip.w / 2,
          clip.y + clip.h / 2,
          Math.max(1, oval.rx),
          Math.max(1, oval.ry),
          oval.rotation,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
      ctx.restore();
    }
    return true;
  } catch {
    return false;
  }
}

export function MediaCensorOverlay({
  sourceRef,
  itemId,
  pendingId,
  playSrc,
  animated,
  veilHost,
}: {
  sourceRef: RefObject<MediaEl | null>;
  itemId: string | null;
  /** Incoming slide — veil/taunt start on click, not when the bitmap swaps. */
  pendingId: string | null;
  playSrc: string;
  animated: boolean;
  veilHost: HTMLElement | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const scratchRef = useRef<HTMLCanvasElement | null>(null);
  const liveRef = useRef(loadMediaCensorLive());
  const [live, setLive] = useState(liveRef.current);
  const [cssFallback, setCssFallback] = useState(false);
  const [detectNote, setDetectNote] = useState<string | null>(null);
  const [detectHit, setDetectHit] = useState(false);
  const [detectErr, setDetectErr] = useState(false);
  const [veilOn, setVeilOn] = useState(true);
  const [veilHeld, setVeilHeld] = useState(true);
  const veilOnRef = useRef(true);
  const itemIdRef = useRef(itemId);
  const pendingIdRef = useRef(pendingId);
  itemIdRef.current = itemId;
  pendingIdRef.current = pendingId;
  const detected = useMediaCensorDetect(
    sourceRef,
    live,
    itemId,
    playSrc,
    animated,
  );
  const detectedRef = useRef(detected);
  detectedRef.current = detected;
  const paintNowRef = useRef<() => void>(() => {});

  function showVeil() {
    veilOnRef.current = true;
    setVeilOn(true);
    setVeilHeld(true);
  }

  function hideVeil() {
    if (!veilOnRef.current) return;
    // Still on the previous bitmap — keep the line until the new slide is up.
    if ((pendingIdRef.current ?? "") !== (itemIdRef.current ?? "")) return;
    veilOnRef.current = false;
    setVeilOn(false);
  }

  useEffect(() => subscribeMediaCensor(() => {
    const next = loadMediaCensorLive();
    liveRef.current = next;
    setLive(next);
  }), []);

  useEffect(() => {
    liveRef.current = live;
  }, [live]);

  useEffect(() => {
    if (!live.active || !playSrc) {
      veilOnRef.current = false;
      setVeilOn(false);
      return;
    }
    showVeil();
  }, [pendingId, itemId, playSrc, live.active]);

  useEffect(() => {
    if (veilOn || !veilHeld) return;
    const reduced =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const t = window.setTimeout(
      () => setVeilHeld(false),
      reduced ? 0 : VEIL_UNMOUNT_MS,
    );
    return () => window.clearTimeout(t);
  }, [veilOn, veilHeld]);

  useEffect(() => {
    if (!live.active || !playSrc) return;
    const settings = live.settings;
    const waitDetect =
      !animated &&
      settings.detect &&
      !settings.bandsFallback;
    if (!waitDetect) return;
    const timeout = window.setTimeout(() => hideVeil(), 8000);
    return () => {
      window.clearTimeout(timeout);
    };
  }, [
    live.active,
    live.settings.detect,
    live.settings.bandsFallback,
    live.settings.coverage,
    itemId,
    pendingId,
    playSrc,
    animated,
  ]);

  useEffect(() => {
    if (detected == null) return;
    const s = live.settings;
    if (s.detect && !s.bandsFallback && !animated) {
      hideVeil();
    }
  }, [
    detected,
    live.settings.detect,
    live.settings.bandsFallback,
    live.settings.coverage,
    animated,
  ]);

  useEffect(() => {
    if (!live.active || !live.settings.detect || animated) {
      setDetectNote(null);
      setDetectHit(false);
      setDetectErr(false);
      return;
    }
    return subscribeCensorDetectRuntime((state) => {
      setDetectNote(state.detail);
      setDetectHit(state.ok && state.boxCount > 0);
      setDetectErr(!state.ok);
    });
  }, [live.active, live.settings.detect, animated]);

  useLayoutEffect(() => {
    if (!live.active || !playSrc) {
      setCssFallback(false);
      return;
    }
    const canvas = canvasRef.current;
    if (!animated && !canvas) {
      setCssFallback(false);
      return;
    }
    if (!scratchRef.current) scratchRef.current = document.createElement("canvas");
    const scratch = scratchRef.current;
    let stopped = false;
    let bound: MediaEl | null = null;
    if (animated) setCssFallback(false);
    if (canvas) {
      const view = beginCanvas(canvas);
      if (view) view.ctx.clearRect(0, 0, view.viewW, view.viewH);
    }

    const onReady = () => {
      paintOnce();
    };
    const bindSource = () => {
      const el = sourceRef.current;
      if (el === bound) return;
      bound?.removeEventListener("loadeddata", onReady);
      bound?.removeEventListener("load", onReady);
      bound = el;
      bound?.addEventListener("loadeddata", onReady);
      bound?.addEventListener("load", onReady);
    };

    const paintOnce = () => {
      if (stopped) return;
      bindSource();
      if (animated) {
        const source = sourceRef.current;
        if (source && sourceSize(source).w >= 2) hideVeil();
        return;
      }
      if (!canvas || !canvas.isConnected) return;
      const source = sourceRef.current;
      if (!source) return;
      const ok = paint(
        canvas,
        source,
        liveRef.current,
        scratch,
        detectedRef.current,
      );
      setCssFallback(!ok);
      if (ok) {
        const s = liveRef.current.settings;
        if (!s.detect || s.bandsFallback || s.coverage === "full") {
          hideVeil();
        }
      }
    };
    paintNowRef.current = paintOnce;
    bindSource();
    const ro = canvas ? new ResizeObserver(() => paintOnce()) : null;
    if (canvas) ro?.observe(canvas);
    paintOnce();

    return () => {
      stopped = true;
      paintNowRef.current = () => {};
      ro?.disconnect();
      bound?.removeEventListener("loadeddata", onReady);
      bound?.removeEventListener("load", onReady);
    };
  }, [live.active, live.settings, itemId, playSrc, sourceRef, animated]);

  useEffect(() => {
    paintNowRef.current();
  }, [detected]);

  if (!live.active || !playSrc) return null;

  const waitingForSlide = (pendingId ?? "") !== (itemId ?? "");
  const veilKeep = veilHeld || waitingForSlide;
  const taunt = pickMediaCensorLoadTaunt(pendingId ?? itemId ?? playSrc);
  const veil = veilKeep ? (
    <div
      className={"media-censor-veil" + (waitingForSlide || veilOn ? "" : " is-out")}
      aria-hidden
    >
      {live.settings.loadTaunt ? (
        <p
          key={pendingId ?? itemId ?? playSrc}
          className="media-censor-veil__line"
        >
          {taunt}
        </p>
      ) : null}
    </div>
  ) : null;

  return (
    <>
      <div
        className={
          "media-censor-fx" + (animated ? " media-censor-fx--motion" : "")
        }
        aria-hidden
      />
      {animated ? null : (
        <canvas
          ref={canvasRef}
          className="media-censor"
          aria-hidden
        />
      )}
      {cssFallback ? (
        <div className="media-censor media-censor--css" aria-hidden />
      ) : null}
      {veilHost && veil ? createPortal(veil, veilHost) : veil}
      {live.settings.detect && detectNote && !veilKeep && !animated ? (
        <div
          className={
            "media-censor-note" +
            (detectErr ? " is-err" : detectHit ? " is-hit" : "")
          }
        >
          {detectNote}
        </div>
      ) : null}
    </>
  );
}
