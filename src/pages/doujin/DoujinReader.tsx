import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import { proxiedImageUrl } from "../../lib/doujin/cdn";
import { getPageBlob } from "../../lib/doujin/pageCache";
import { displayTitle } from "../../lib/doujin/normalize";
import { neighborPageUrls } from "../../lib/doujin/prefetch";
import type { DoujinGallery, DoujinPlaylistNav } from "../../lib/doujin/types";
import { DoujinReaderScrubber } from "./DoujinReaderScrubber";
import {
  fittedMediaSize,
  fitMediaScale,
  MEDIA_ZOOM_MAX,
  MEDIA_ZOOM_MIN,
  mediaArrowPanStep,
  mediaZoomLabel,
  nudgeOverflowScroll,
  stepMediaZoom,
} from "../../lib/mediaFitZoom";

type Props = {
  gallery: DoujinGallery;
  saved: boolean;
  initialPage?: number;
  busy?: boolean;
  playlist?: DoujinPlaylistNav | null;
  backLabel?: string;
  onBack: () => void;
  onToggleSave: () => void;
  onPage: (index: number) => void;
  onPlaylistBound?: (dir: -1 | 1) => void;
  runHud?: ReactNode;
};

export function DoujinReader({
  gallery,
  saved,
  initialPage = 0,
  busy = false,
  playlist = null,
  backLabel = "К описанию",
  onBack,
  onToggleSave,
  onPage,
  onPlaylistBound,
  runHud = null,
}: Props) {
  const last = Math.max(0, gallery.pages.length - 1);
  const [index, setIndex] = useState(() =>
    Math.min(last, Math.max(0, initialPage)),
  );
  const [chrome, setChrome] = useState(true);
  const [zoom, setZoom] = useState(MEDIA_ZOOM_MIN);
  const [fit, setFit] = useState(1);
  const [natural, setNatural] = useState({ w: 0, h: 0 });
  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const canPrev = index > 0 || Boolean(playlist?.hasPrev);
  const canNext = index < last || Boolean(playlist?.hasNext);
  const prevWork = index <= 0 && Boolean(playlist?.hasPrev);
  const nextWork = index >= last && Boolean(playlist?.hasNext);

  const go = useCallback(
    (delta: number) => {
      const next = index + delta;
      if (next < 0) {
        if (playlist?.hasPrev) onPlaylistBound?.(-1);
        return;
      }
      if (next > last) {
        if (playlist?.hasNext) onPlaylistBound?.(1);
        return;
      }
      setIndex(next);
    },
    [index, last, onPlaylistBound, playlist?.hasNext, playlist?.hasPrev],
  );

  const bumpZoom = useCallback((dir: -1 | 1) => {
    setZoom((z) => stepMediaZoom(z, dir));
  }, []);

  const panZoomed = useCallback(
    (dx: number, dy: number, smooth: boolean): boolean => {
      if (zoom <= MEDIA_ZOOM_MIN) return false;
      const stage = stageRef.current;
      if (!stage) return false;
      const next = nudgeOverflowScroll(stage, dx, dy);
      if (!next) return false;
      stage.scrollTo({
        left: next.left,
        top: next.top,
        behavior: smooth ? "smooth" : "auto",
      });
      return true;
    },
    [zoom],
  );

  const measureFit = useCallback(() => {
    const stage = stageRef.current;
    const img = imgRef.current;
    if (!stage || !img?.naturalWidth || !img.naturalHeight) return;
    const next = fitMediaScale(
      stage.clientWidth,
      stage.clientHeight,
      img.naturalWidth,
      img.naturalHeight,
    );
    if (next <= 0) return;
    setFit(next);
    setNatural({ w: img.naturalWidth, h: img.naturalHeight });
  }, []);

  useEffect(() => {
    setIndex(Math.min(last, Math.max(0, initialPage)));
  }, [gallery.id, initialPage, last]);

  useEffect(() => {
    setZoom(MEDIA_ZOOM_MIN);
  }, [gallery.id]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const ro = new ResizeObserver(() => measureFit());
    ro.observe(stage);
    return () => ro.disconnect();
  }, [measureFit]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const typing =
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement;
      if (e.key === "Escape") {
        e.preventDefault();
        if (!chrome) {
          setChrome(true);
          return;
        }
        onBack();
        return;
      }
      if (typing) return;
      if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        bumpZoom(1);
        return;
      }
      if (e.key === "-" || e.key === "_") {
        e.preventDefault();
        bumpZoom(-1);
        return;
      }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const stage = stageRef.current;
        const step = mediaArrowPanStep(stage?.clientHeight ?? 0);
        panZoomed(0, e.key === "ArrowDown" ? step : -step, !e.repeat);
        return;
      }
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        const stage = stageRef.current;
        const step = mediaArrowPanStep(stage?.clientWidth ?? 0);
        if (panZoomed(e.key === "ArrowRight" ? step : -step, 0, !e.repeat)) {
          e.preventDefault();
          return;
        }
      }
      if (e.key === "ArrowRight" || e.key === " " || e.key === "PageDown") {
        e.preventDefault();
        go(1);
        return;
      }
      if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        go(-1);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [bumpZoom, chrome, go, onBack, panZoomed]);

  useEffect(() => {
    onPage(index);
  }, [index, onPage]);

  const page = gallery.pages[index];
  const [blobSrc, setBlobSrc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let url: string | null = null;
    setBlobSrc(null);
    void getPageBlob(gallery.id, index)
      .then((blob) => {
        if (cancelled || !blob) return;
        const created = URL.createObjectURL(blob);
        if (cancelled) {
          URL.revokeObjectURL(created);
          return;
        }
        url = created;
        setBlobSrc(created);
      })
      .catch(() => {
        /* proxy fallback */
      });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [gallery.id, index]);

  const src = blobSrc || (page ? proxiedImageUrl(page.url) : "");
  const total = gallery.pages.length || gallery.numPages || 1;

  useEffect(() => {
    setNatural({ w: 0, h: 0 });
    const stage = stageRef.current;
    if (!stage) return;
    stage.scrollTo(0, 0);
  }, [src]);

  useEffect(() => {
    const urls = neighborPageUrls(gallery.pages, index, 3).map((url) =>
      proxiedImageUrl(url),
    );
    const imgs = urls.map((url) => {
      const img = new Image();
      img.src = url;
      return img;
    });
    return () => {
      for (const img of imgs) {
        img.src = "";
      }
    };
  }, [gallery.pages, index]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    function onWheel(e: WheelEvent) {
      if (!e.ctrlKey) return;
      e.preventDefault();
      bumpZoom(e.deltaY < 0 ? 1 : -1);
    }
    root.addEventListener("wheel", onWheel, { passive: false });
    return () => root.removeEventListener("wheel", onWheel);
  }, [bumpZoom]);

  const title = displayTitle(gallery.title) || `#${gallery.id}`;
  const pct = total > 0 ? ((index + 1) / total) * 100 : 0;
  const zoomLabel = mediaZoomLabel(zoom);
  const fitted = fittedMediaSize(natural.w, natural.h, fit, zoom);
  const imgW = fitted?.w;
  const imgH = fitted?.h;

  function onStageClick(e: MouseEvent<HTMLDivElement>) {
    const el = e.target;
    if (!(el instanceof Element)) return;
    if (el.closest(".doujin-reader__edge")) return;
    setChrome((on) => !on);
  }

  function jump(raw: string) {
    const n = Number(raw);
    if (!Number.isFinite(n)) return;
    setIndex(Math.min(last, Math.max(0, Math.round(n) - 1)));
  }

  return (
    <div
      ref={rootRef}
      className={
        "doujin-reader" +
        (chrome ? " is-chrome" : "") +
        (runHud ? " is-run" : "") +
        (zoom > 1 ? " is-zoom" : "")
      }
    >
      <div
        className="doujin-reader__progress"
        style={{ width: `${pct}%` }}
      />
      <header className="doujin-reader__top">
        <button
          type="button"
          className="doujin-reader__icon"
          title={backLabel}
          aria-label={backLabel}
          onClick={onBack}
        >
          <BackIcon />
        </button>
        <div className="doujin-reader__title" title={title}>
          {title}
        </div>
        {playlist ? (
          <div className="doujin-reader__playlist">
            {playlist.name} · {playlist.index + 1}/{playlist.total}
          </div>
        ) : null}
        <label className="doujin-reader__page">
          <input
            type="number"
            min={1}
            max={total}
            value={index + 1}
            onChange={(e) => {
              if (e.target.value === "") return;
              jump(e.target.value);
            }}
            aria-label="Номер страницы"
          />
          <span>/ {total}</span>
        </label>
        <div className="doujin-reader__tools">
          <button
            type="button"
            className="doujin-reader__icon"
            title={`Уменьшить (${zoomLabel})`}
            aria-label="Уменьшить"
            disabled={zoom <= MEDIA_ZOOM_MIN}
            onClick={() => bumpZoom(-1)}
          >
            <ZoomOutIcon />
          </button>
          <button
            type="button"
            className="doujin-reader__icon"
            title={`Увеличить (${zoomLabel})`}
            aria-label="Увеличить"
            disabled={zoom >= MEDIA_ZOOM_MAX}
            onClick={() => bumpZoom(1)}
          >
            <ZoomInIcon />
          </button>
          <button
            type="button"
            className="doujin-reader__icon"
            title="Убрать интерфейс"
            aria-label="Убрать интерфейс"
            aria-pressed={!chrome}
            onClick={() => setChrome(false)}
          >
            <HideChromeIcon />
          </button>
          <button
            type="button"
            className={"doujin-reader__icon doujin-reader__fav" + (saved ? " is-on" : "")}
            title={saved ? "В избранном" : "В избранное"}
            aria-label={saved ? "Убрать из избранного" : "В избранное"}
            disabled={busy}
            onClick={onToggleSave}
          >
            <HeartIcon filled={saved} />
          </button>
        </div>
      </header>

      <div
        ref={stageRef}
        className="doujin-reader__stage"
        onClick={onStageClick}
      >
        {src ? (
          <img
            ref={imgRef}
            className="doujin-reader__img"
            src={src}
            alt=""
            draggable={false}
            onLoad={measureFit}
            style={
              imgW && imgH
                ? { width: imgW, height: imgH, maxWidth: "none", maxHeight: "none" }
                : undefined
            }
          />
        ) : (
          <p className="muted">Нет страниц</p>
        )}
        <button
          type="button"
          className="doujin-reader__edge doujin-reader__edge--prev"
          aria-label={prevWork ? "Предыдущая работа" : "Предыдущая страница"}
          disabled={!canPrev}
          onClick={() => go(-1)}
        >
          {prevWork ? <SkipIcon dir="prev" /> : <ChevronIcon dir="prev" />}
        </button>
        <button
          type="button"
          className="doujin-reader__edge doujin-reader__edge--next"
          aria-label={nextWork ? "Следующая работа" : "Следующая страница"}
          disabled={!canNext}
          onClick={() => go(1)}
        >
          {nextWork ? <SkipIcon dir="next" /> : <ChevronIcon dir="next" />}
        </button>
      </div>

      <footer className="doujin-reader__bottom">
        <button
          type="button"
          className="doujin-reader__icon"
          disabled={!canPrev}
          title={prevWork ? "Предыдущая работа" : "Назад"}
          aria-label={prevWork ? "Предыдущая работа" : "Назад"}
          onClick={() => go(-1)}
        >
          {prevWork ? <SkipIcon dir="prev" /> : <ChevronIcon dir="prev" />}
        </button>
        <DoujinReaderScrubber
          pages={gallery.pages}
          index={index}
          onJump={setIndex}
        />
        <button
          type="button"
          className="doujin-reader__icon"
          disabled={!canNext}
          title={nextWork ? "Следующая работа" : "Дальше"}
          aria-label={nextWork ? "Следующая работа" : "Дальше"}
          onClick={() => go(1)}
        >
          {nextWork ? <SkipIcon dir="next" /> : <ChevronIcon dir="next" />}
        </button>
      </footer>
      {runHud}
    </div>
  );
}

function BackIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden>
      <path
        d="M10.2 3.2 5.4 8l4.8 4.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChevronIcon({ dir }: { dir: "prev" | "next" }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden>
      <path
        d={dir === "prev" ? "M10.2 3.2 5.4 8l4.8 4.8" : "M5.8 3.2 10.6 8 5.8 12.8"}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.65"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SkipIcon({ dir }: { dir: "prev" | "next" }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden>
      {dir === "prev" ? (
        <path
          d="M11.4 3.2 6.6 8l4.8 4.8M5.2 3.4v9.2"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.55"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : (
        <path
          d="M4.6 3.2 9.4 8 4.6 12.8M10.8 3.4v9.2"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.55"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
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

function HideChromeIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden>
      <rect
        x="2.4"
        y="3.1"
        width="11.2"
        height="9.8"
        rx="1.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <path
        d="M5.1 9 8 6.4 10.9 9"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.45"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden>
      <path
        d="M8 13.55S2.7 10.1 2.7 6.55A2.85 2.85 0 0 1 8 4.2a2.85 2.85 0 0 1 5.3 2.35C13.3 10.1 8 13.55 8 13.55z"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth={filled ? 0 : 1.35}
        strokeLinejoin="round"
      />
    </svg>
  );
}
