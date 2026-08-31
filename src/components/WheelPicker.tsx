import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { playWheelTick, primeUiAudio } from "../lib/uiSound";

export type WheelItem<T extends string | number = string | number> = {
  value: T;
  label: string;
  disabled?: boolean;
};

type WheelPickerProps<T extends string | number> = {
  value: T;
  onChange: (value: T) => void;
  items: WheelItem<T>[];
  label?: string;
  hint?: string;
  /** Minimum slot width in px; grows to fit the longest label. */
  itemWidth?: number;
  className?: string;
  /** Contract seal: freeze drum, show overlay phrase, no spin. */
  locked?: boolean;
  lockOverlayRu?: string;
};

function clampIndex(i: number, len: number): number {
  if (len <= 0) return 0;
  return Math.min(len - 1, Math.max(0, i));
}

function nearestEnabledIndex<T extends string | number>(
  items: WheelItem<T>[],
  from: number,
): number {
  if (items.length === 0) return 0;
  const start = clampIndex(from, items.length);
  if (!items[start]?.disabled) return start;
  for (let d = 1; d < items.length; d++) {
    const lo = start - d;
    const hi = start + d;
    if (lo >= 0 && !items[lo]?.disabled) return lo;
    if (hi < items.length && !items[hi]?.disabled) return hi;
  }
  return start;
}

let measureCtx: CanvasRenderingContext2D | null = null;
const TAP_SLOP_PX = 10;

function measureSlotWidth(labels: string[], minWidth: number): number {
  if (typeof document === "undefined") return minWidth;
  if (!measureCtx) {
    const canvas = document.createElement("canvas");
    measureCtx = canvas.getContext("2d");
  }
  if (!measureCtx) return minWidth;
  const rootPx =
    Number.parseFloat(getComputedStyle(document.documentElement).fontSize) ||
    16;
  // Match active item: ~0.98rem bold
  const px = Math.round(rootPx * 0.98);
  measureCtx.font = `800 ${px}px system-ui, "Segoe UI", sans-serif`;
  let max = 0;
  for (const label of labels) {
    max = Math.max(max, measureCtx.measureText(label).width);
  }
  // Horizontal padding inside the active frame.
  return Math.max(minWidth, Math.ceil(max + 32));
}

export function WheelPicker<T extends string | number>({
  value,
  onChange,
  items,
  label,
  hint,
  itemWidth: minItemWidth = 44,
  className = "",
  locked = false,
  lockOverlayRu,
}: WheelPickerProps<T>) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const syncingRef = useRef(false);
  const valueRef = useRef(value);
  const dragRef = useRef({
    active: false,
    moved: false,
    startX: 0,
    startScroll: 0,
  });
  const tapIndexRef = useRef<number | null>(null);
  const scrollEndRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTickIndexRef = useRef<number | null>(null);
  const suppressScrollCommitUntilRef = useRef(0);
  const [edgePad, setEdgePad] = useState(0);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);

  const visibleItems = useMemo(() => {
    if (!locked || items.length === 0) return items;
    const current = items.find((it) => it.value === value);
    return current ? [current] : [items[0]!];
  }, [items, locked, value]);

  const itemWidth = useMemo(
    () => measureSlotWidth(
      visibleItems.map((it) => it.label),
      minItemWidth,
    ),
    [visibleItems, minItemWidth],
  );

  const selectedIndex = useMemo(() => {
    const i = visibleItems.findIndex((it) => it.value === value);
    return i >= 0 ? i : 0;
  }, [visibleItems, value]);

  const displayIndex =
    previewIndex != null
      ? clampIndex(previewIndex, visibleItems.length)
      : selectedIndex;
  const displayItem = visibleItems[displayIndex];

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  const getEdgePadPx = useCallback(() => {
    const track = trackRef.current;
    const pad = track?.querySelector(".wheel-picker__pad");
    return pad instanceof HTMLElement ? pad.offsetWidth : 0;
  }, []);

  const updateEdgePad = useCallback(() => {
    const width = viewportRef.current?.clientWidth ?? 0;
    setEdgePad(Math.max(0, width / 2 - itemWidth / 2));
  }, [itemWidth]);

  useLayoutEffect(() => {
    updateEdgePad();
    const el = viewportRef.current;
    if (!el) return;
    const observer = new ResizeObserver(updateEdgePad);
    observer.observe(el);
    return () => observer.disconnect();
  }, [updateEdgePad]);

  const readIndexFromScroll = useCallback(() => {
    const track = trackRef.current;
    const viewport = viewportRef.current;
    if (!track || !viewport || visibleItems.length === 0) return 0;
    const pad = getEdgePadPx();
    const centerX = track.scrollLeft + viewport.clientWidth / 2;
    const index = Math.round((centerX - pad - itemWidth / 2) / itemWidth);
    return clampIndex(index, visibleItems.length);
  }, [getEdgePadPx, itemWidth, visibleItems.length]);

  const scrollToIndex = useCallback(
    (index: number, behavior: ScrollBehavior = "auto") => {
      const track = trackRef.current;
      if (!track) return;
      const clamped = clampIndex(index, visibleItems.length);
      syncingRef.current = true;
      track.scrollTo({ left: clamped * itemWidth, behavior });
      window.requestAnimationFrame(() => {
        syncingRef.current = false;
      });
    },
    [itemWidth, visibleItems.length],
  );

  useEffect(() => {
    if (edgePad <= 0 || dragRef.current.active) return;
    scrollToIndex(selectedIndex);
  }, [selectedIndex, edgePad, scrollToIndex, itemWidth]);

  const commitIndex = useCallback(
    (rawIndex: number) => {
      if (locked || visibleItems.length === 0) return;
      const index = nearestEnabledIndex(visibleItems, rawIndex);
      const item = visibleItems[index];
      if (!item) return;
      setPreviewIndex(null);
      scrollToIndex(index);
      if (item.value !== valueRef.current) {
        valueRef.current = item.value;
        playWheelTick(1.05);
        queueMicrotask(() => onChange(item.value));
      }
    },
    [locked, visibleItems, onChange, scrollToIndex],
  );

  const handleScroll = useCallback(() => {
    if (syncingRef.current) return;
    if (performance.now() < suppressScrollCommitUntilRef.current) return;
    const next = readIndexFromScroll();
    setPreviewIndex(next);
    if (
      lastTickIndexRef.current !== next &&
      (dragRef.current.active || dragRef.current.moved)
    ) {
      lastTickIndexRef.current = next;
      playWheelTick(0.75);
    }
    if (dragRef.current.active) return;
    if (scrollEndRef.current) clearTimeout(scrollEndRef.current);
    scrollEndRef.current = setTimeout(() => {
      scrollEndRef.current = null;
      if (performance.now() < suppressScrollCommitUntilRef.current) return;
      if (dragRef.current.active) return;
      commitIndex(readIndexFromScroll());
    }, 120);
  }, [commitIndex, readIndexFromScroll]);

  useEffect(() => {
    return () => {
      if (scrollEndRef.current) clearTimeout(scrollEndRef.current);
    };
  }, []);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const onScrollEnd = () => {
      if (syncingRef.current || dragRef.current.active) return;
      if (performance.now() < suppressScrollCommitUntilRef.current) return;
      commitIndex(readIndexFromScroll());
    };
    track.addEventListener("scrollend", onScrollEnd);
    return () => track.removeEventListener("scrollend", onScrollEnd);
  }, [commitIndex, readIndexFromScroll]);

  function indexFromClientX(clientX: number): number | null {
    const track = trackRef.current;
    if (!track) return null;
    const hit = document.elementFromPoint(clientX, track.getBoundingClientRect().top + track.clientHeight / 2);
    const itemEl = hit instanceof Element ? hit.closest(".wheel-picker__item") : null;
    if (!(itemEl instanceof HTMLElement)) return null;
    const index = Number(itemEl.dataset.index);
    return Number.isNaN(index) ? null : index;
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (locked || event.button !== 0) return;
    const track = trackRef.current;
    if (!track) return;
    // Stop the option from taking focus — focus scrolls the drum and
    // the first click looks like it did nothing.
    event.preventDefault();
    void primeUiAudio();

    const itemBtn = (event.target as HTMLElement).closest(
      ".wheel-picker__item",
    );
    tapIndexRef.current = itemBtn
      ? Number((itemBtn as HTMLElement).dataset.index)
      : indexFromClientX(event.clientX);

    dragRef.current = {
      active: true,
      moved: false,
      startX: event.clientX,
      startScroll: track.scrollLeft,
    };
    lastTickIndexRef.current = readIndexFromScroll();
    track.classList.add("wheel-picker__track--dragging");
    track.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!dragRef.current.active) return;
    const track = trackRef.current;
    if (!track) return;
    const delta = event.clientX - dragRef.current.startX;
    if (!dragRef.current.moved && Math.abs(delta) <= TAP_SLOP_PX) return;
    dragRef.current.moved = true;
    track.scrollLeft = dragRef.current.startScroll - delta;
    setPreviewIndex(readIndexFromScroll());
  }

  function finishPointer(event: ReactPointerEvent<HTMLDivElement>) {
    const track = trackRef.current;
    if (!track || !dragRef.current.active) return;

    const wasMoved = dragRef.current.moved;
    const tapped =
      tapIndexRef.current ?? indexFromClientX(event.clientX);

    dragRef.current.active = false;
    dragRef.current.moved = false;
    tapIndexRef.current = null;
    track.classList.remove("wheel-picker__track--dragging");
    try {
      track.releasePointerCapture(event.pointerId);
    } catch {
      // ignore
    }

    if (!wasMoved && tapped != null && !Number.isNaN(tapped)) {
      if (scrollEndRef.current) {
        clearTimeout(scrollEndRef.current);
        scrollEndRef.current = null;
      }
      suppressScrollCommitUntilRef.current = performance.now() + 280;
      commitIndex(tapped);
      return;
    }
    if (wasMoved) commitIndex(readIndexFromScroll());
  }

  if (visibleItems.length === 0) return null;

  return (
    <div
      className={`wheel-picker ${locked ? "is-sealed" : ""} ${className}`.trim()}
      style={{ ["--wheel-item-w" as string]: `${itemWidth}px` }}
      aria-disabled={locked || undefined}
    >
      {label ? <div className="wheel-picker__label">{label}</div> : null}
      <div ref={viewportRef} className="wheel-picker__viewport">
        <div className="wheel-picker__frame" aria-hidden />
        <div
          ref={trackRef}
          className="wheel-picker__track"
          onScroll={locked ? undefined : handleScroll}
          onPointerDown={handlePointerDown}
          onPointerMove={locked ? undefined : handlePointerMove}
          onPointerUp={locked ? undefined : finishPointer}
          onPointerCancel={locked ? undefined : finishPointer}
          role="listbox"
          aria-label={label}
          aria-valuetext={displayItem?.label}
          aria-readonly={locked || undefined}
        >
          <div
            className="wheel-picker__pad"
            style={{ width: edgePad }}
            aria-hidden
          />
          {visibleItems.map((item, index) => {
            const selected = index === displayIndex;
            return (
              <button
                key={`${String(item.value)}-${index}`}
                type="button"
                role="option"
                data-index={index}
                aria-selected={selected}
                aria-disabled={locked || item.disabled || undefined}
                disabled={locked || item.disabled}
                tabIndex={-1}
                className={[
                  "wheel-picker__item",
                  selected ? "wheel-picker__item--active" : "",
                  item.disabled || locked ? "is-disabled" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                {item.label}
              </button>
            );
          })}
          <div
            className="wheel-picker__pad"
            style={{ width: edgePad }}
            aria-hidden
          />
        </div>
        {locked && lockOverlayRu ? (
          <div className="wheel-picker__seal" aria-hidden>
            <span>{lockOverlayRu}</span>
          </div>
        ) : null}
      </div>
      {hint ? (
        <p className="wheel-picker__hint">
          {locked ? lockOverlayRu || hint : hint}
        </p>
      ) : locked && lockOverlayRu ? (
        <p className="wheel-picker__hint">{lockOverlayRu}</p>
      ) : null}
    </div>
  );
}

/** Build a numeric range as wheel items (inclusive). */
export function rangeWheelItems(
  min: number,
  max: number,
  step = 1,
  format: (n: number) => string = String,
): WheelItem<number>[] {
  const items: WheelItem<number>[] = [];
  const start = Math.min(min, max);
  const end = Math.max(min, max);
  const s = step > 0 ? step : 1;
  for (let n = start; n <= end + 1e-9; n = Math.round((n + s) * 1000) / 1000) {
    items.push({ value: n, label: format(n) });
  }
  return items;
}

/** Snap value onto nearest item in a stepped range. */
export function snapToRange(
  value: number,
  min: number,
  max: number,
  step: number,
): number {
  const clamped = Math.min(max, Math.max(min, value));
  if (step <= 0) return clamped;
  const steps = Math.round((clamped - min) / step);
  return Math.min(max, Math.max(min, min + steps * step));
}
