import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { proxiedImageUrl } from "../../lib/doujin/cdn";
import type { DoujinReadingListItem } from "../../lib/doujin/types";
import "./doujin.css";

const FAN_CAP = 4;
const CYCLE_CAP = 8;
/** Matches `doujin-deck-cycle` back pose (~22%), where the layer is behind the stack. */
const BACK_MIN = 0.21;
const BACK_MAX = 0.34;

export function listDeckPreviewUrls(
  items: DoujinReadingListItem[],
  coverOverrides?: Record<number, string>,
): string[] {
  const urls: string[] = [];
  const seenUrl = new Set<string>();
  const seenId = new Set<number>();

  for (const item of items) {
    if (seenId.has(item.galleryId)) continue;
    const src = proxiedImageUrl(
      coverOverrides?.[item.galleryId] || item.coverUrl,
    );
    if (!src || seenUrl.has(src)) continue;
    seenId.add(item.galleryId);
    seenUrl.add(src);
    urls.push(src);
    if (urls.length >= CYCLE_CAP) break;
  }
  return urls;
}

export function advanceDeckSlot(
  slots: string[],
  queue: string[],
  index: number,
): { slots: string[]; queue: string[] } {
  if (queue.length === 0 || index < 0 || index >= slots.length) {
    return { slots, queue };
  }
  const incoming = queue[0];
  const outgoing = slots[index];
  if (incoming == null || outgoing == null) return { slots, queue };
  const nextSlots = slots.slice();
  nextSlots[index] = incoming;
  return { slots: nextSlots, queue: queue.slice(1).concat(outgoing) };
}

function cycleProgress(el: Element): number | null {
  for (const anim of el.getAnimations()) {
    if (!(anim instanceof CSSAnimation)) continue;
    if (anim.animationName !== "doujin-deck-cycle") continue;
    if (anim.playState !== "running") return null;
    return anim.effect?.getComputedTiming().progress ?? null;
  }
  return null;
}

type Props = {
  urls: string[];
  stagger?: string;
  className?: string;
};

export function DoujinListDeck({ urls, stagger = "0s", className }: Props) {
  const poolKey = urls.slice(0, CYCLE_CAP).join("\n");
  const pool = useMemo(
    () => (poolKey === "" ? [] : poolKey.split("\n")),
    [poolKey],
  );
  const [slots, setSlots] = useState(() => pool.slice(0, FAN_CAP));
  const queueRef = useRef(pool.slice(FAN_CAP));
  const pendingRef = useRef(new Set<number>());
  const layersRef = useRef<Array<HTMLSpanElement | null>>([]);

  useEffect(() => {
    const next = pool.slice(0, FAN_CAP);
    queueRef.current = pool.slice(next.length);
    pendingRef.current.clear();
    setSlots(next);
    for (const src of pool) {
      const img = new Image();
      img.src = src;
    }
  }, [pool]);

  useEffect(() => {
    if (queueRef.current.length === 0) return;
    let raf = 0;
    const tick = () => {
      const layers = layersRef.current;
      for (let i = 0; i < layers.length; i += 1) {
        const el = layers[i];
        if (!el) continue;
        const progress = cycleProgress(el);
        if (progress == null) {
          pendingRef.current.delete(i);
          continue;
        }
        const inBack = progress >= BACK_MIN && progress < BACK_MAX;
        if (!inBack) {
          pendingRef.current.delete(i);
          continue;
        }
        if (pendingRef.current.has(i)) continue;
        pendingRef.current.add(i);
        setSlots((prev) => {
          const next = advanceDeckSlot(prev, queueRef.current, i);
          queueRef.current = next.queue;
          return next.slots;
        });
      }
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [pool]);

  const n = Math.max(slots.length, 1);

  return (
    <div
      className={
        "doujin-lists__deck" + (className ? ` ${className}` : "")
      }
      data-count={slots.length}
      style={
        {
          "--n": n,
          "--stagger": stagger,
        } as CSSProperties
      }
      aria-hidden
    >
      {slots.length === 0 ? (
        <span
          className="doujin-lists__deck-layer"
          style={{ "--i": 0 } as CSSProperties}
        >
          <span className="doujin-lists__cover-ph" />
        </span>
      ) : (
        slots.map((src, i) => (
          <span
            key={i}
            ref={(node) => {
              layersRef.current[i] = node;
            }}
            className="doujin-lists__deck-layer"
            style={{ "--i": i } as CSSProperties}
          >
            <img src={src} alt="" />
          </span>
        ))
      )}
    </div>
  );
}
