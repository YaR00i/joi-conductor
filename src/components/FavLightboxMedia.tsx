import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type MutableRefObject,
  type PointerEvent,
  type ReactNode,
  type Ref,
} from "react";
import {
  lightboxLoadBarWidth,
  lightboxLoadLabel,
} from "../lib/lightboxLoadBar";
import {
  fittedMediaSize,
  fitMediaScale,
  MEDIA_SIDE_CHROME_MIN_INSET,
  MEDIA_ZOOM_MAX,
  MEDIA_ZOOM_MIN,
  clampMediaPan,
  mediaFitGutter,
  mediaNavReserve,
  mediaPaintOverflows,
  mediaPaintPosition,
  mediaSideChromeOverlayInset,
  mediaSideChromeOverlays,
  mediaZoomLabel,
  panAfterZoom,
  stepMediaZoom,
} from "../lib/mediaFitZoom";
import { masonryPreviewSrc, type MediaItem } from "../lib/media";
import {
  ensureMediaCached,
  forgetCachedMedia,
  markMediaPlaybackError,
  type PreloadProgress,
} from "../lib/mediaPreload";

type Props = {
  item: MediaItem;
  videoRef?: Ref<HTMLVideoElement>;
  children?: ReactNode;
};

const OPEN_TIMEOUT_MS = 12_000;

const DECODE_FAIL =
  "файл скачан, но Chromium не смог его открыть (кодек или битый файл)";

function bindRef(ref: Ref<HTMLVideoElement> | undefined, node: HTMLVideoElement | null) {
  if (!ref) return;
  if (typeof ref === "function") {
    ref(node);
    return;
  }
  (ref as MutableRefObject<HTMLVideoElement | null>).current = node;
}

function errorMessage(err: unknown): string {
  return err instanceof Error && err.message.trim()
    ? err.message
    : "Не удалось скачать";
}

function boardColumnGap(board: HTMLElement | null): number {
  if (!board) return 0;
  return parseFloat(getComputedStyle(board).columnGap || "0") || 0;
}

const NAV_CLEAR_GAP = 8;

function lightboxNavReserve(viewer: HTMLElement): { left: number; right: number } {
  const root = viewer.closest(".fav-lightbox");
  const prev = root?.querySelector(".fav-lightbox__nav--prev");
  const next = root?.querySelector(".fav-lightbox__nav--next");
  const box = viewer.getBoundingClientRect();
  return mediaNavReserve(
    box.left,
    box.right,
    prev?.getBoundingClientRect().right ?? null,
    next?.getBoundingClientRect().left ?? null,
    NAV_CLEAR_GAP,
  );
}

export function FavLightboxMedia({ item, videoRef, children }: Props) {
  const [playSrc, setPlaySrc] = useState<string | null>(null);
  const [progress, setProgress] = useState<PreloadProgress>({
    percent: null,
    phase: "loading",
  });
  const [opened, setOpened] = useState(false);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const [retryTick, setRetryTick] = useState(0);
  const [zoom, setZoom] = useState(MEDIA_ZOOM_MIN);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [panning, setPanning] = useState(false);
  const [fit, setFit] = useState(0);
  const [natural, setNatural] = useState({ w: 0, h: 0 });
  const [sideOverlay, setSideOverlay] = useState(false);
  const [overlayInset, setOverlayInset] = useState({
    left: MEDIA_SIDE_CHROME_MIN_INSET,
    right: MEDIA_SIDE_CHROME_MIN_INSET,
  });
  const viewerRef = useRef<HTMLDivElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const zoomBarRef = useRef<HTMLDivElement>(null);
  const slotRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    x: number;
    y: number;
    panX: number;
    panY: number;
  } | null>(null);
  const zoomCursorRef = useRef<{ x: number; y: number } | null>(null);
  const prevZoomRef = useRef(MEDIA_ZOOM_MIN);
  const still = item.kind !== "video";

  useEffect(() => {
    let cancelled = false;
    setPlaySrc(null);
    setOpened(false);
    setErrorDetail(null);
    setZoom(MEDIA_ZOOM_MIN);
    setPan({ x: 0, y: 0 });
    setPanning(false);
    setFit(0);
    setNatural({ w: 0, h: 0 });
    setSideOverlay(false);
    setOverlayInset({
      left: MEDIA_SIDE_CHROME_MIN_INSET,
      right: MEDIA_SIDE_CHROME_MIN_INSET,
    });
    prevZoomRef.current = MEDIA_ZOOM_MIN;
    zoomCursorRef.current = null;
    dragRef.current = null;
    setProgress({ percent: null, phase: "loading" });
    void ensureMediaCached(item, (next) => {
      if (!cancelled) setProgress(next);
    })
      .then((url) => {
        if (cancelled) return;
        setPlaySrc(url);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setPlaySrc(null);
        setProgress({ percent: null, phase: "error" });
        setErrorDetail(errorMessage(err));
      });
    return () => {
      cancelled = true;
    };
  }, [item.id, item.kind, item.url, retryTick]);

  useEffect(() => {
    if (!playSrc || errorDetail || opened) return;
    const timer = window.setTimeout(() => {
      setErrorDetail(DECODE_FAIL);
      setProgress({ percent: null, phase: "error" });
      markMediaPlaybackError(item.id, DECODE_FAIL);
    }, OPEN_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [playSrc, errorDetail, opened, item.id]);

  const measureFit = useCallback(() => {
    const viewer = viewerRef.current;
    const img = imgRef.current;
    const video = localVideoRef.current;
    const nw = img?.naturalWidth || video?.videoWidth || 0;
    const nh = img?.naturalHeight || video?.videoHeight || 0;
    if (!viewer || nw <= 0 || nh <= 0) return;
    const rail = railRef.current?.offsetWidth ?? 0;
    const zoomW = still ? (zoomBarRef.current?.offsetWidth ?? 0) : 0;
    const gapSize = boardColumnGap(boardRef.current);
    const gaps = (rail > 0 ? 1 : 0) + (zoomW > 0 ? 1 : 0);
    const fullFit = fitMediaScale(
      viewer.clientWidth,
      viewer.clientHeight,
      nw,
      nh,
    );
    if (fullFit <= 0) return;
    const fitted = fittedMediaSize(nw, nh, fullFit, MEDIA_ZOOM_MIN);
    const nav = lightboxNavReserve(viewer);
    const gutter = mediaFitGutter(viewer.clientWidth, fitted?.w ?? 0);
    const overlay = mediaSideChromeOverlays(
      viewer.clientWidth,
      fitted?.w ?? 0,
      Math.max(rail, zoomW) + gapSize + Math.max(nav.left, nav.right),
    );
    const nextInset = {
      left: mediaSideChromeOverlayInset(
        gutter,
        nav.left,
        MEDIA_SIDE_CHROME_MIN_INSET,
      ),
      right: mediaSideChromeOverlayInset(
        gutter,
        nav.right,
        MEDIA_SIDE_CHROME_MIN_INSET,
      ),
    };
    const next = overlay
      ? fullFit
      : fitMediaScale(
          Math.max(0, viewer.clientWidth - rail - zoomW - gaps * gapSize),
          viewer.clientHeight,
          nw,
          nh,
        );
    if (next <= 0) return;
    setSideOverlay((prev) => (prev === overlay ? prev : overlay));
    setOverlayInset((prev) =>
      prev.left === nextInset.left && prev.right === nextInset.right
        ? prev
        : nextInset,
    );
    setFit((prev) => (Math.abs(prev - next) < 1e-4 ? prev : next));
    setNatural((prev) =>
      prev.w === nw && prev.h === nh ? prev : { w: nw, h: nh },
    );
  }, [still]);

  useLayoutEffect(() => {
    measureFit();
  }, [measureFit, playSrc, opened]);

  const box = fittedMediaSize(natural.w, natural.h, fit, MEDIA_ZOOM_MIN);
  const paint = still
    ? fittedMediaSize(natural.w, natural.h, fit, zoom)
    : box;
  const boxW = box?.w ?? 0;
  const boxH = box?.h ?? 0;

  useLayoutEffect(() => {
    if (boxW <= 0 || boxH <= 0) return;
    const prev = prevZoomRef.current;
    const cursor = zoomCursorRef.current;
    zoomCursorRef.current = null;
    prevZoomRef.current = zoom;
    setPan((p) => {
      const next =
        prev === zoom
          ? clampMediaPan(p, boxW, boxH, zoom)
          : panAfterZoom(
              p,
              prev,
              zoom,
              boxW,
              boxH,
              cursor?.x ?? boxW / 2,
              cursor?.y ?? boxH / 2,
            );
      return next.x === p.x && next.y === p.y ? p : next;
    });
  }, [boxW, boxH, zoom]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    const ro = new ResizeObserver(() => measureFit());
    ro.observe(viewer);
    return () => ro.disconnect();
  }, [measureFit, playSrc]);

  const bumpZoom = useCallback(
    (dir: -1 | 1, cursor?: { x: number; y: number }) => {
      if (cursor) zoomCursorRef.current = cursor;
      setZoom((z) => stepMediaZoom(z, dir));
    },
    [],
  );

  useEffect(() => {
    if (!still || errorDetail) return;
    function onKey(e: KeyboardEvent) {
      const typing =
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement;
      if (typing) return;
      if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        bumpZoom(1);
        return;
      }
      if (e.key === "-" || e.key === "_") {
        e.preventDefault();
        bumpZoom(-1);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [still, errorDetail, bumpZoom]);

  useEffect(() => {
    const node = slotRef.current;
    if (!node || !still || errorDetail || boxW <= 0) return;
    const host: HTMLDivElement = node;
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      e.stopPropagation();
      const rect = host.getBoundingClientRect();
      bumpZoom(e.deltaY < 0 ? 1 : -1, {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
    }
    host.addEventListener("wheel", onWheel, { passive: false });
    return () => host.removeEventListener("wheel", onWheel);
  }, [still, errorDetail, playSrc, boxW, boxH, bumpZoom]);

  function failOpen(detail = DECODE_FAIL) {
    setOpened(false);
    setErrorDetail(detail);
    setProgress({ percent: null, phase: "error" });
    markMediaPlaybackError(item.id, detail);
  }

  function retry() {
    forgetCachedMedia(item.id);
    setRetryTick((n) => n + 1);
  }

  function onVideoNode(node: HTMLVideoElement | null) {
    localVideoRef.current = node;
    bindRef(videoRef, node);
  }

  function endPan(e: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    dragRef.current = null;
    setPanning(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  }

  const phase = errorDetail
    ? "error"
    : !playSrc
      ? "loading"
      : opened
        ? "ready"
        : "opening";
  const poster =
    item.previewUrl || item.sampleUrl || still
      ? masonryPreviewSrc(item)
      : null;
  const showPoster = Boolean(poster) && phase !== "ready";
  const showWait = !poster && phase !== "ready";
  const fill =
    phase === "opening" ? 100 : lightboxLoadBarWidth(progress.percent);
  const label =
    phase === "ready"
      ? null
      : lightboxLoadLabel(
          item.kind,
          progress.percent,
          phase === "error" ? "error" : phase === "opening" ? "opening" : "loading",
          errorDetail,
        );
  const overflows = mediaPaintOverflows(box, paint);
  const pos = box && paint ? mediaPaintPosition(box, paint, pan) : null;
  const slotClass =
    "fav-lightbox__slot" +
    (box ? " is-sized" : "") +
    (overflows ? " is-zoom" : "") +
    (panning ? " is-panning" : "");

  return (
    <>
      <div ref={viewerRef} className="fav-lightbox__viewer">
        <div
          ref={boardRef}
          className={
            "fav-lightbox__board" + (sideOverlay ? " is-overlay" : "")
          }
          style={
            sideOverlay
              ? ({
                  "--lightbox-rail-inset": `${overlayInset.left}px`,
                  "--lightbox-zoom-inset": `${overlayInset.right}px`,
                } as CSSProperties)
              : undefined
          }
        >
          <div
            className="fav-lightbox__frame"
            style={
              sideOverlay && box
                ? { width: box.w, height: box.h }
                : undefined
            }
          >
            {children ? (
              <div
                ref={railRef}
                className="fav-lightbox__rail"
                onClick={(e) => e.stopPropagation()}
              >
                {children}
              </div>
            ) : null}
            <div
            ref={slotRef}
            className={slotClass}
            style={box ? { width: box.w, height: box.h } : undefined}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => {
              if (e.button !== 0 || zoom <= 1 || !box) return;
              e.preventDefault();
              e.stopPropagation();
              dragRef.current = {
                pointerId: e.pointerId,
                x: e.clientX,
                y: e.clientY,
                panX: pan.x,
                panY: pan.y,
              };
              e.currentTarget.setPointerCapture(e.pointerId);
              setPanning(true);
            }}
            onPointerMove={(e) => {
              const drag = dragRef.current;
              if (!drag || drag.pointerId !== e.pointerId || !box) return;
              e.preventDefault();
              setPan(
                clampMediaPan(
                  {
                    x: drag.panX + (e.clientX - drag.x),
                    y: drag.panY + (e.clientY - drag.y),
                  },
                  box.w,
                  box.h,
                  zoom,
                ),
              );
            }}
            onPointerUp={endPan}
            onPointerCancel={endPan}
          >
            {showWait ? <div className="fav-lightbox__wait" aria-hidden /> : null}
            {showPoster ? (
              <img
                className="fav-lightbox__media fav-lightbox__media--poster"
                src={poster!}
                alt=""
                draggable={false}
              />
            ) : null}
            {playSrc && !still && phase !== "error" ? (
              <video
                key={`${item.id}-${retryTick}`}
                ref={onVideoNode}
                className={
                  "fav-lightbox__media" + (opened ? "" : " is-pending")
                }
                src={playSrc}
                controls={opened}
                controlsList="nofullscreen nodownload"
                autoPlay
                loop
                playsInline
                preload="auto"
                onCanPlay={() => setOpened(true)}
                onLoadedData={() => {
                  setOpened(true);
                  measureFit();
                }}
                onLoadedMetadata={() => measureFit()}
                onError={() => failOpen()}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
                style={
                  box
                    ? { width: "100%", height: "100%" }
                    : undefined
                }
              />
            ) : null}
            {playSrc && still && phase !== "error" ? (
              <img
                key={`${item.id}-${retryTick}`}
                ref={imgRef}
                className={
                  "fav-lightbox__media" + (opened ? "" : " is-pending")
                }
                src={playSrc}
                alt={item.tags ?? ""}
                draggable={false}
                onLoad={() => {
                  setOpened(true);
                  measureFit();
                }}
                onError={() => failOpen()}
                style={
                  paint && pos
                    ? {
                        width: paint.w,
                        height: paint.h,
                        maxWidth: "none",
                        maxHeight: "none",
                        position: "absolute",
                        left: pos.left,
                        top: pos.top,
                      }
                    : undefined
                }
              />
            ) : null}
            {phase === "error" ? (
              <div className="fav-lightbox__fail">
                <strong>Не открылось</strong>
                <p>{lightboxLoadLabel(item.kind, null, "error", errorDetail)}</p>
                <button type="button" onClick={retry}>
                  Повторить
                </button>
              </div>
            ) : null}
            </div>
            {still && phase !== "error" ? (
              <div
                ref={zoomBarRef}
                className="fav-lightbox__zoom"
                onClick={(e) => e.stopPropagation()}
              >
            <button
              type="button"
              className="fav-lightbox__tool"
              title={`Увеличить (${mediaZoomLabel(zoom)})`}
              aria-label="Увеличить"
              disabled={zoom >= MEDIA_ZOOM_MAX || !paint}
              onClick={() => bumpZoom(1)}
            >
              <ZoomInIcon />
            </button>
            <span className="fav-lightbox__zoom-label">
              {mediaZoomLabel(zoom)}
            </span>
            <button
              type="button"
              className="fav-lightbox__tool"
              title={`Уменьшить (${mediaZoomLabel(zoom)})`}
              aria-label="Уменьшить"
              disabled={zoom <= MEDIA_ZOOM_MIN || !paint}
              onClick={() => bumpZoom(-1)}
            >
              <ZoomOutIcon />
            </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
      {phase !== "ready" ? (
        <div
          className={
            "fav-lightbox-loadbar" + (phase === "error" ? " is-error" : "")
          }
          role="status"
          aria-live="polite"
        >
          {label ? (
            <span className="fav-lightbox-loadbar__label">{label}</span>
          ) : null}
          <div className="fav-lightbox-loadbar__track">
            <div
              className={
                "fav-lightbox-loadbar__fill" +
                (phase === "loading" && progress.percent == null
                  ? " is-wait"
                  : "")
              }
              style={{ width: `${fill}%` }}
            />
          </div>
        </div>
      ) : null}
    </>
  );
}

function ZoomOutIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden>
      <circle
        cx="7"
        cy="7"
        r="4.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.45"
      />
      <path
        d="m10.2 10.2 3 3M5.1 7h3.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.45"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ZoomInIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden>
      <circle
        cx="7"
        cy="7"
        r="4.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.45"
      />
      <path
        d="m10.2 10.2 3 3M5.1 7h3.8M7 5.1v3.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.45"
        strokeLinecap="round"
      />
    </svg>
  );
}
