import { useEffect, useId, useMemo, useRef, useState, type TransitionEvent } from "react";
import type { RouletteOption } from "../lib/planRoulette";
import {
  ROULETTE_SPIN_EASE,
  ROULETTE_SPIN_MS,
  startRouletteSpinSound,
  stopRouletteSpinSound,
} from "../lib/rouletteSound";

type Slice = RouletteOption & {
  startDeg: number;
  spanDeg: number;
};

function buildSlices(options: RouletteOption[]): Slice[] {
  const weights = options.map((o) => Math.max(0.01, o.weight ?? 1));
  const sum = weights.reduce((a, b) => a + b, 0);
  const minSpan = options.length > 1 ? 6 : 360;
  const adjusted = options.map((o, i) => ({
    ...o,
    weight: Math.max(weights[i]! / sum, minSpan / 360),
  }));
  const adjSum = adjusted.reduce((a, o) => a + o.weight!, 0);
  let cursor = -90;
  return adjusted.map((o) => {
    const spanDeg = (o.weight! / adjSum) * 360;
    const slice: Slice = {
      ...o,
      startDeg: cursor,
      spanDeg,
    };
    cursor += spanDeg;
    return slice;
  });
}

function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = (deg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function slicePath(
  cx: number,
  cy: number,
  rOuter: number,
  rInner: number,
  startDeg: number,
  spanDeg: number,
): string {
  const endDeg = startDeg + spanDeg;
  const large = spanDeg > 180 ? 1 : 0;
  const o0 = polar(cx, cy, rOuter, startDeg);
  const o1 = polar(cx, cy, rOuter, endDeg);
  const i1 = polar(cx, cy, rInner, endDeg);
  const i0 = polar(cx, cy, rInner, startDeg);
  if (spanDeg >= 359.9) {
    return [
      `M ${cx} ${cy - rOuter}`,
      `A ${rOuter} ${rOuter} 0 1 1 ${cx - 0.01} ${cy - rOuter}`,
      `L ${cx - 0.01} ${cy - rInner}`,
      `A ${rInner} ${rInner} 0 1 0 ${cx} ${cy - rInner}`,
      "Z",
    ].join(" ");
  }
  return [
    `M ${o0.x} ${o0.y}`,
    `A ${rOuter} ${rOuter} 0 ${large} 1 ${o1.x} ${o1.y}`,
    `L ${i1.x} ${i1.y}`,
    `A ${rInner} ${rInner} 0 ${large} 0 ${i0.x} ${i0.y}`,
    "Z",
  ].join(" ");
}

function lighten(hex: string, amount: number): string {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return hex;
  const ch = (i: number) =>
    Math.min(255, Math.round(parseInt(m[i]!, 16) + 255 * amount))
      .toString(16)
      .padStart(2, "0");
  return `#${ch(1)}${ch(2)}${ch(3)}`;
}

/**
 * Arc path for curved slice labels (textPath).
 * Always clockwise — feet toward the hub on every slice (no screen-upright flip).
 */
function labelArcPath(
  cx: number,
  cy: number,
  r: number,
  startDeg: number,
  spanDeg: number,
): string {
  const pad = Math.min(5, Math.max(1.5, spanDeg * 0.1));
  const a0 = startDeg + pad;
  const a1 = startDeg + spanDeg - pad;
  const p0 = polar(cx, cy, r, a0);
  const p1 = polar(cx, cy, r, a1);
  const delta = Math.abs(a1 - a0);
  const large = delta > 180 ? 1 : 0;
  // sweep=1 → clockwise; with SVG textPath this keeps the baseline
  // on the hub side for the whole wheel.
  return `M ${p0.x} ${p0.y} A ${r} ${r} 0 ${large} 1 ${p1.x} ${p1.y}`;
}

function fitArcLabel(
  label: string,
  r: number,
  spanDeg: number,
  fontSize: number,
): string {
  const usableDeg = Math.max(4, spanDeg * 0.78);
  const arcLen = (r * usableDeg * Math.PI) / 180;
  const charW = fontSize * 0.56;
  const maxChars = Math.max(4, Math.floor(arcLen / charW));
  if (label.length <= maxChars) return label;
  return `${label.slice(0, Math.max(3, maxChars - 1))}…`;
}

const MIN_LABEL_SPAN_DEG = 16;

interface ParamRouletteProps {
  titleRu: string;
  options: RouletteOption[];
  targetId: string | null;
  spinning: boolean;
  onSpinDone: () => void;
  stepIndex: number;
  stepTotal: number;
  landedLabel?: string | null;
  /** Contract seal: single-option fate messaging */
  sealedPhraseRu?: string | null;
}

/**
 * Weighted param wheel — pointer at top, lands on predetermined targetId.
 */
export function ParamRoulette({
  titleRu,
  options,
  targetId,
  spinning,
  onSpinDone,
  stepIndex,
  stepTotal,
  landedLabel = null,
  sealedPhraseRu = null,
}: ParamRouletteProps) {
  const svgId = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const sealed = Boolean(sealedPhraseRu) && options.length <= 1;
  const slices = useMemo(() => buildSlices(options), [options]);
  const slicesRef = useRef(slices);
  slicesRef.current = slices;
  const [rotation, setRotation] = useState(0);
  const [animating, setAnimating] = useState(false);
  const doneRef = useRef(false);
  const rotationRef = useRef(0);
  rotationRef.current = rotation;
  const onSpinDoneRef = useRef(onSpinDone);
  onSpinDoneRef.current = onSpinDone;

  useEffect(() => {
    if (!spinning || !targetId) return;
    doneRef.current = false;

    const slice =
      slicesRef.current.find((s) => s.id === targetId) ?? slicesRef.current[0];
    if (!slice) {
      onSpinDoneRef.current();
      return;
    }
    const center = slice.startDeg + slice.spanDeg / 2;
    const land = ((-90 - center) % 360 + 360) % 360;
    const turns = 4 + Math.floor(Math.random() * 3);
    const durationMs = ROULETTE_SPIN_MS;
    const fromDeg = ((rotationRef.current % 360) + 360) % 360;
    const toDeg = turns * 360 + land;
    setAnimating(false);
    setRotation(fromDeg);
    startRouletteSpinSound({
      durationMs,
      fromDeg,
      toDeg,
      pegDeg: 360 / 16,
      ease: ROULETTE_SPIN_EASE,
    });
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setAnimating(true);
        setRotation(toDeg);
      });
    });

    const failsafe = window.setTimeout(() => {
      if (doneRef.current) return;
      doneRef.current = true;
      setAnimating(false);
      onSpinDoneRef.current();
    }, durationMs + 1100);
    return () => {
      window.clearTimeout(failsafe);
      stopRouletteSpinSound();
    };
  }, [spinning, targetId]);

  useEffect(() => {
    if (!spinning) {
      doneRef.current = false;
    }
  }, [spinning]);

  const handleTransitionEnd = (e: TransitionEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    if (e.propertyName !== "transform") return;
    if (!spinning || doneRef.current) return;
    doneRef.current = true;
    setAnimating(false);
    onSpinDoneRef.current();
  };

  const cx = 200;
  const cy = 200;
  const rOuter = 172;
  const rInner = 48;
  const rLabel = rOuter - 28;
  const rimR = 188;
  const labelFontSize = 13;
  const ticks = useMemo(
    () => Array.from({ length: 48 }, (_, i) => -90 + (i * 360) / 48),
    [],
  );
  const pegs = useMemo(
    () => Array.from({ length: 16 }, (_, i) => -90 + (i * 360) / 16),
    [],
  );

  return (
    <div
      className={[
        "param-roulette",
        spinning ? "is-spinning" : "",
        !spinning && landedLabel ? "is-landed" : "",
        sealed ? "is-sealed" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="param-roulette__meta">
        <span className="param-roulette__step">
          Шаг {stepIndex + 1} из {stepTotal}
        </span>
        <h2 className="param-roulette__title">{titleRu}</h2>
        {sealed && sealedPhraseRu ? (
          <p className="param-roulette__seal" role="status">
            {sealedPhraseRu}
          </p>
        ) : null}
      </div>

      <div className="param-roulette__arena">
        <div className="param-roulette__aura" aria-hidden />
        <div className="param-roulette__petals" aria-hidden>
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
        </div>
        <div className="param-roulette__ring" aria-hidden />
        <div className="param-roulette__ring param-roulette__ring--inner" aria-hidden />

        <div className="param-roulette__stage">
          <div className="param-roulette__pointer" aria-hidden>
            <span className="param-roulette__pointer-gem" />
          </div>

          <div
            className={[
              "param-roulette__wheel",
              animating ? "is-animating" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            style={{ transform: `rotate(${rotation}deg)` }}
            onTransitionEnd={handleTransitionEnd}
          >
            <svg
              className="param-roulette__svg"
              viewBox="0 0 400 400"
              role="img"
              aria-label={titleRu}
            >
              <defs>
                <radialGradient id={`${svgId}-rim`} cx="50%" cy="40%" r="60%">
                  <stop offset="0%" stopColor="var(--bg2)" />
                  <stop offset="55%" stopColor="var(--bg1)" />
                  <stop offset="100%" stopColor="var(--bg0)" />
                </radialGradient>
                <linearGradient id={`${svgId}-metal`} x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="var(--soft)" />
                  <stop offset="45%" stopColor="var(--accent)" />
                  <stop
                    offset="100%"
                    stopColor="color-mix(in srgb, var(--accent) 55%, #000)"
                  />
                </linearGradient>
                <radialGradient id={`${svgId}-hub`} cx="40%" cy="35%" r="65%">
                  <stop offset="0%" stopColor="var(--bg2)" />
                  <stop offset="70%" stopColor="var(--bg1)" />
                  <stop offset="100%" stopColor="var(--bg0)" />
                </radialGradient>
                <filter id={`${svgId}-soft`} x="-15%" y="-15%" width="130%" height="130%">
                  <feDropShadow
                    dx="0"
                    dy="2"
                    stdDeviation="1.5"
                    floodColor="#000"
                    floodOpacity="0.5"
                  />
                </filter>
                {slices.map((s) => (
                  <path
                    key={`arc-${s.id}`}
                    id={`${svgId}-arc-${s.id}`}
                    d={labelArcPath(cx, cy, rLabel, s.startDeg, s.spanDeg)}
                    fill="none"
                  />
                ))}
              </defs>

              {/* Outer rim disc */}
              <circle cx={cx} cy={cy} r={rimR} fill={`url(#${svgId}-rim)`} />
              <circle
                cx={cx}
                cy={cy}
                r={rimR - 1}
                fill="none"
                stroke={`url(#${svgId}-metal)`}
                strokeWidth="5"
              />
              <circle
                cx={cx}
                cy={cy}
                r={rimR - 9}
                fill="none"
                stroke="color-mix(in srgb, var(--accent) 18%, transparent)"
                strokeWidth="2"
              />

              {/* Tick marks on rim */}
              {ticks.map((deg, i) => {
                const major = i % 4 === 0;
                const a = polar(cx, cy, rimR - 12, deg);
                const b = polar(cx, cy, rimR - (major ? 22 : 17), deg);
                return (
                  <line
                    key={`tick-${i}`}
                    x1={a.x}
                    y1={a.y}
                    x2={b.x}
                    y2={b.y}
                    stroke={
                      major
                        ? "color-mix(in srgb, var(--soft) 70%, transparent)"
                        : "color-mix(in srgb, var(--soft) 28%, transparent)"
                    }
                    strokeWidth={major ? 2 : 1}
                    strokeLinecap="round"
                  />
                );
              })}

              {/* Pegs */}
              {pegs.map((deg, i) => {
                const p = polar(cx, cy, rOuter + 6, deg);
                return (
                  <circle
                    key={`peg-${i}`}
                    cx={p.x}
                    cy={p.y}
                    r="3.2"
                    fill="var(--soft)"
                    stroke="color-mix(in srgb, var(--accent) 55%, #000)"
                    strokeWidth="1"
                  />
                );
              })}

              {/* Slices */}
              {slices.map((s) => {
                const base = s.color ?? "#444";
                const locked = s.unlocked === false;
                const hit = !spinning && targetId === s.id;
                return (
                  <g
                    key={s.id}
                    filter={`url(#${svgId}-soft)`}
                    opacity={locked ? 0.38 : 1}
                  >
                    <path
                      d={slicePath(cx, cy, rOuter, rInner, s.startDeg, s.spanDeg)}
                      fill={base}
                    />
                    <path
                      d={slicePath(
                        cx,
                        cy,
                        rOuter,
                        rOuter - 18,
                        s.startDeg,
                        s.spanDeg,
                      )}
                      fill={lighten(base, 0.18)}
                      opacity="0.55"
                    />
                    <path
                      d={slicePath(cx, cy, rOuter, rInner, s.startDeg, s.spanDeg)}
                      fill="none"
                      stroke={hit ? "var(--soft)" : "rgba(8,6,10,0.55)"}
                      strokeWidth={hit ? 3.2 : 1.8}
                    />
                  </g>
                );
              })}

              {/* Curved labels — skip crumbs that would read as «…» */}
              {slices.map((s) => {
                if (s.spanDeg < MIN_LABEL_SPAN_DEG) return null;
                const label = fitArcLabel(
                  s.labelRu,
                  rLabel,
                  s.spanDeg,
                  labelFontSize,
                );
                return (
                  <text
                    key={`${s.id}-t`}
                    fill="var(--text)"
                    fontSize={labelFontSize}
                    fontWeight="700"
                    style={{
                      paintOrder: "stroke",
                      stroke: "rgba(0,0,0,0.7)",
                      strokeWidth: 2.8,
                    }}
                  >
                    <textPath
                      href={`#${svgId}-arc-${s.id}`}
                      startOffset="50%"
                      textAnchor="middle"
                    >
                      {label}
                    </textPath>
                  </text>
                );
              })}

              {/* Hub disc only — label sits fixed above the wheel */}
              <circle cx={cx} cy={cy} r={rInner + 4} fill={`url(#${svgId}-hub)`} />
              <circle
                cx={cx}
                cy={cy}
                r={rInner + 4}
                fill="none"
                stroke={`url(#${svgId}-metal)`}
                strokeWidth="3"
              />
              <circle
                cx={cx}
                cy={cy}
                r={rInner - 6}
                fill="none"
                stroke="color-mix(in srgb, var(--accent) 35%, transparent)"
                strokeWidth="1.5"
              />
            </svg>
          </div>

          <div className="param-roulette__hub" aria-hidden>
            <span className="param-roulette__hub-axis" />
          </div>
        </div>
      </div>

      <div className="param-roulette__foot">
        <div
          className={[
            "param-roulette__result",
            spinning ? "param-roulette__result--spin" : "",
            !spinning && landedLabel ? "param-roulette__result--land" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          aria-live="polite"
        >
          {spinning ? (
            <span className="param-roulette__result-spin">
              <span className="param-roulette__dots" aria-hidden>
                <i />
                <i />
                <i />
              </span>
              Крутит…
            </span>
          ) : landedLabel ? (
            <>
              Выпало: <strong>{landedLabel}</strong>
            </>
          ) : (
            <span className="param-roulette__result-spin">&nbsp;</span>
          )}
        </div>

        {slices.length > 1 ? (
          <ul className="param-roulette__legend" aria-label="Варианты на колесе">
            {slices.map((s) => {
              const hit = !spinning && targetId === s.id;
              return (
                <li
                  key={s.id}
                  className={
                    hit
                      ? "param-roulette__legend-item is-hit"
                      : "param-roulette__legend-item"
                  }
                >
                  <i
                    aria-hidden
                    style={{ background: s.color ?? "#666" }}
                  />
                  {s.labelRu}
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="param-roulette__legend" aria-hidden />
        )}
      </div>
    </div>
  );
}
