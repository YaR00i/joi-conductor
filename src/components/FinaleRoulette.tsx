import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type TransitionEvent,
} from "react";
import {
  FINALE_EDGE_TIMER_SEC,
  FINALE_ROULETTE_SPIN_EASE,
  FINALE_ROULETTE_SPIN_MS,
  startRouletteSpinSound,
  stopRouletteSpinSound,
} from "../lib/rouletteSound";
import type { FinaleOutcome, SessionMood } from "../lib/types";

export type FinaleRoulettePhase = "await_edge" | "spinning" | "revealed";

interface FinaleRouletteProps {
  pCum: number;
  pRuin: number;
  phase: FinaleRoulettePhase;
  outcome: FinaleOutcome | null;
  /** Kept for callers / future tease lines. */
  mood?: SessionMood;
  /** Fired when the edge timer hits 0 — reveal the predetermined outcome. */
  onSpinDone: () => void;
  onComplete: () => void;
  completeDisabled?: boolean;
}

interface Slice {
  id: FinaleOutcome;
  label: string;
  weight: number;
  color: string;
  startDeg: number;
  spanDeg: number;
}

const OUTCOME_META: Record<
  FinaleOutcome,
  { label: string; color: string; mood: string; doneHint: string }
> = {
  cum: {
    label: "КОНЧИТЬ",
    color: "#2fbf6a",
    mood: "Полный оргазм — по инструкции финиша",
    doneHint: "Когда закончишь — нажми «Завершить»",
  },
  ruin: {
    label: "РУИН",
    color: "#e6b422",
    mood: "Руинить — без дожима",
    doneHint: "Когда руин сделан — нажми «Завершить»",
  },
  deny: {
    label: "ОТКАЗ",
    color: "#e04545",
    mood: "Отказ — руки прочь",
    doneHint: "Сессию можно закрыть",
  },
};

function buildSlices(pCum: number, pRuin: number): Slice[] {
  const cum = Math.max(0, Math.min(1, pCum));
  const ruin = Math.max(0, Math.min(1 - cum, pRuin));
  const deny = Math.max(0, 1 - cum - ruin);

  const raw: {
    id: FinaleOutcome;
    label: string;
    weight: number;
    color: string;
  }[] = [
    { id: "cum", label: "КОНЧИТЬ", weight: cum, color: OUTCOME_META.cum.color },
    { id: "ruin", label: "РУИН", weight: ruin, color: OUTCOME_META.ruin.color },
    { id: "deny", label: "ОТКАЗ", weight: deny, color: OUTCOME_META.deny.color },
  ];
  const filtered = raw.filter((s) => s.weight > 0.0005);

  const minSpan = filtered.length > 1 ? 8 : 360;
  const adjusted = filtered.map((s) => ({
    ...s,
    weight: Math.max(s.weight, minSpan / 360),
  }));
  const sum = adjusted.reduce((a, s) => a + s.weight, 0);

  let cursor = -90;
  return adjusted.map((s) => {
    const spanDeg = (s.weight / sum) * 360;
    const slice: Slice = {
      id: s.id,
      label: s.label,
      weight: s.weight / sum,
      color: s.color,
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
  r: number,
  startDeg: number,
  spanDeg: number,
): string {
  const endDeg = startDeg + spanDeg;
  const large = spanDeg > 180 ? 1 : 0;
  const a = polar(cx, cy, r, startDeg);
  const b = polar(cx, cy, r, endDeg);
  if (spanDeg >= 359.9) {
    return `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx - 0.01} ${cy - r} Z`;
  }
  return `M ${cx} ${cy} L ${a.x} ${a.y} A ${r} ${r} 0 ${large} 1 ${b.x} ${b.y} Z`;
}

/**
 * Finale wheel: press «ГОТОВ КОНЧИТЬ» → 10s edge climb → spin in the last
 * seconds → reveal on zero.
 */
export function FinaleRoulette({
  pCum,
  pRuin,
  phase,
  outcome,
  onSpinDone,
  onComplete,
  completeDisabled = false,
}: FinaleRouletteProps) {
  const slices = useMemo(() => buildSlices(pCum, pRuin), [pCum, pRuin]);
  const slicesRef = useRef(slices);
  slicesRef.current = slices;
  const [rotation, setRotation] = useState(0);
  const rotationRef = useRef(0);
  rotationRef.current = rotation;
  const [spinning, setSpinning] = useState(false);
  const [edgeLeft, setEdgeLeft] = useState<number | null>(null);
  const [edgeProgress, setEdgeProgress] = useState(0);
  const [landed, setLanded] = useState(false);
  const [flash, setFlash] = useState(false);
  const doneRef = useRef(false);
  const spinStartedRef = useRef(false);
  const onSpinDoneRef = useRef(onSpinDone);
  onSpinDoneRef.current = onSpinDone;

  const pDeny = Math.max(0, 1 - Math.min(1, pCum) - Math.min(1, pRuin));
  const revealed = phase === "revealed";
  const meta = outcome ? OUTCOME_META[outcome] : null;
  const easeCss = `cubic-bezier(${FINALE_ROULETTE_SPIN_EASE.join(", ")})`;
  const totalMs = FINALE_EDGE_TIMER_SEC * 1000;
  const spinStartMs = Math.max(0, totalMs - FINALE_ROULETTE_SPIN_MS);

  const startWheelSpin = () => {
    if (spinStartedRef.current || !outcome) return;
    spinStartedRef.current = true;

    const slice =
      slicesRef.current.find((s) => s.id === outcome) ?? slicesRef.current[0];
    if (!slice) return;

    const center = slice.startDeg + slice.spanDeg / 2;
    const land = ((-90 - center) % 360 + 360) % 360;
    const turns = 14 + Math.floor(Math.random() * 5);
    const durationMs = FINALE_ROULETTE_SPIN_MS;
    const fromDeg = ((rotationRef.current % 360) + 360) % 360;
    const toDeg = turns * 360 + land;

    setLanded(false);
    setSpinning(false);
    setRotation(fromDeg);
    startRouletteSpinSound({
      durationMs,
      fromDeg,
      toDeg,
      pegDeg: 360 / 18,
      ease: FINALE_ROULETTE_SPIN_EASE,
    });
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setSpinning(true);
        setRotation(toDeg);
      });
    });
  };

  useEffect(() => {
    if (phase !== "spinning" || !outcome) return;
    doneRef.current = false;
    spinStartedRef.current = false;
    setLanded(false);
    setFlash(false);
    setEdgeLeft(FINALE_EDGE_TIMER_SEC);
    setEdgeProgress(0);

    const startedAt = performance.now();

    const tick = window.setInterval(() => {
      const elapsed = performance.now() - startedAt;
      const leftMs = Math.max(0, totalMs - elapsed);
      const leftSec = Math.max(0, Math.ceil(leftMs / 1000));
      setEdgeLeft(leftSec);
      setEdgeProgress(Math.min(1, elapsed / totalMs));

      if (!spinStartedRef.current && elapsed >= spinStartMs) {
        setFlash(true);
        window.setTimeout(() => setFlash(false), 180);
        startWheelSpin();
      }

      if (elapsed >= totalMs) {
        window.clearInterval(tick);
        setEdgeLeft(0);
        setEdgeProgress(1);
        setSpinning(false);
        setLanded(true);
        setFlash(true);
        if (!doneRef.current) {
          doneRef.current = true;
          window.setTimeout(() => onSpinDoneRef.current(), 420);
        }
      }
    }, 50);

    return () => {
      window.clearInterval(tick);
      stopRouletteSpinSound();
    };
    // startWheelSpin closes over outcome/slices — phase+outcome gate the effect
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, outcome, totalMs, spinStartMs]);

  useEffect(() => {
    if (phase === "await_edge") {
      doneRef.current = false;
      spinStartedRef.current = false;
      setSpinning(false);
      setEdgeLeft(null);
      setEdgeProgress(0);
      setLanded(false);
      setFlash(false);
    }
  }, [phase]);

  const handleTransitionEnd = (e: TransitionEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    if (e.propertyName !== "transform") return;
    if (phase !== "spinning") return;
    setSpinning(false);
    setLanded(true);
  };

  const cx = 160;
  const cy = 160;
  const r = 148;

  const statusLine =
    phase === "await_edge"
      ? null
      : phase === "spinning" && spinning
        ? "Последние секунды — колесо решает, как кончить…"
        : phase === "spinning" && edgeLeft != null && edgeLeft > 0
          ? "Иди до грани. Не кончай раньше колеса."
          : phase === "spinning" && edgeLeft === 0
            ? "Ноль. Смотри — кто победил."
            : null;

  const timerUrgent =
    edgeLeft != null && edgeLeft > 0 && edgeLeft <= 3;

  return (
    <div
      className={[
        "finale-roulette",
        revealed ? "is-revealed" : "",
        phase === "spinning" ? "is-timing" : "",
        spinning ? "is-smearing" : "",
        landed && phase === "spinning" ? "is-landed" : "",
        flash ? "is-flash" : "",
        timerUrgent ? "is-urgent" : "",
        outcome ? `mood-${outcome}` : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="finale-roulette__body" aria-hidden={revealed}>
        <div className="finale-roulette__eyebrow">
          {phase === "spinning"
            ? "Финал · дойди до грани"
            : "Финал · рулетка шансов"}
        </div>

        {phase === "spinning" && edgeLeft != null ? (
          <div
            className={`finale-roulette__edge-timer${
              timerUrgent ? " is-urgent" : ""
            }${spinning ? " is-spinning-soon" : ""}`}
            role="timer"
            aria-live="polite"
            aria-label={`До грани ${edgeLeft} секунд`}
          >
            <div
              className="finale-roulette__edge-ring"
              style={
                {
                  ["--edge-p" as string]: String(edgeProgress),
                } as CSSProperties
              }
              aria-hidden
            />
            <strong key={edgeLeft}>{edgeLeft}</strong>
            <span>
              {spinning || (edgeLeft > 0 && edgeLeft <= 3)
                ? "колесо крутит исход"
                : "сек · иди до грани"}
            </span>
          </div>
        ) : (
          <div className="finale-roulette__odds">
            <span className="is-cum">Кончить {Math.round(pCum * 100)}%</span>
            <span className="is-ruin">
              Руин {Math.round(Math.min(1, pRuin) * 100)}%
            </span>
            <span className="is-deny">Отказ {Math.round(pDeny * 100)}%</span>
          </div>
        )}

        <div className="finale-roulette__stage">
          <div className="finale-roulette__pointer" aria-hidden>
            <span className="finale-roulette__pointer-pin" />
          </div>
          <div
            className={`finale-roulette__wheel ${spinning ? "is-spinning" : ""} ${
              landed ? "is-locked" : ""
            }`}
            style={{
              transform: `rotate(${rotation}deg)`,
              transitionDuration: spinning
                ? `${FINALE_ROULETTE_SPIN_MS}ms`
                : undefined,
              transitionTimingFunction: spinning ? easeCss : undefined,
              animationDuration: spinning
                ? `${FINALE_ROULETTE_SPIN_MS}ms`
                : undefined,
              animationTimingFunction: spinning ? easeCss : undefined,
            }}
            onTransitionEnd={handleTransitionEnd}
          >
            <svg viewBox="0 0 320 320" className="finale-roulette__svg">
              <defs>
                <radialGradient id="finale-hub-grad" cx="50%" cy="40%" r="65%">
                  <stop offset="0%" stopColor="#2a3142" />
                  <stop offset="100%" stopColor="#0c0f16" />
                </radialGradient>
                <radialGradient
                  id="finale-disc-shine"
                  cx="35%"
                  cy="30%"
                  r="70%"
                >
                  <stop offset="0%" stopColor="rgba(255,255,255,0.22)" />
                  <stop offset="45%" stopColor="rgba(255,255,255,0)" />
                </radialGradient>
                <linearGradient
                  id="finale-rim-grad"
                  x1="0%"
                  y1="0%"
                  x2="100%"
                  y2="100%"
                >
                  <stop offset="0%" stopColor="#ffb078" />
                  <stop offset="45%" stopColor="#ff6a3a" />
                  <stop offset="100%" stopColor="#8a3018" />
                </linearGradient>
              </defs>
              {slices.map((s) => {
                const mid = s.startDeg + s.spanDeg / 2;
                const labelPos = polar(cx, cy, r * 0.6, mid);
                return (
                  <g key={s.id}>
                    <path
                      d={slicePath(cx, cy, r, s.startDeg, s.spanDeg)}
                      fill={s.color}
                      stroke="rgba(8,10,18,0.65)"
                      strokeWidth={2.5}
                    />
                    {s.spanDeg >= 28 ? (
                      <text
                        x={labelPos.x}
                        y={labelPos.y}
                        fill="#fff"
                        fontSize={s.spanDeg > 50 ? 13 : 11}
                        fontWeight={800}
                        letterSpacing="0.04em"
                        textAnchor="middle"
                        dominantBaseline="middle"
                        transform={`rotate(${mid + 90}, ${labelPos.x}, ${labelPos.y})`}
                      >
                        {s.label}
                      </text>
                    ) : null}
                  </g>
                );
              })}
              {Array.from({ length: 24 }, (_, i) => {
                const deg = -90 + i * 15;
                const a = polar(cx, cy, r - 2, deg);
                const b = polar(cx, cy, r - (i % 2 === 0 ? 12 : 7), deg);
                return (
                  <line
                    key={`tick-${i}`}
                    x1={a.x}
                    y1={a.y}
                    x2={b.x}
                    y2={b.y}
                    stroke="rgba(255,230,200,0.35)"
                    strokeWidth={i % 2 === 0 ? 2 : 1.2}
                  />
                );
              })}
              <circle
                cx={cx}
                cy={cy}
                r={r}
                fill="none"
                stroke="url(#finale-rim-grad)"
                strokeWidth={7}
              />
              <circle
                cx={cx}
                cy={cy}
                r={r - 5}
                fill="none"
                stroke="rgba(0,0,0,0.35)"
                strokeWidth={2}
              />
              <circle cx={cx} cy={cy} r={r} fill="url(#finale-disc-shine)" />
              <circle
                cx={cx}
                cy={cy}
                r={40}
                fill="url(#finale-hub-grad)"
                stroke="#ff8a4a"
                strokeWidth={3}
              />
              <circle
                cx={cx}
                cy={cy}
                r={18}
                fill="#1a1f2b"
                stroke="rgba(255,180,120,0.55)"
                strokeWidth={2}
              />
              <circle cx={cx} cy={cy} r={5} fill="#ffb078" />
            </svg>
          </div>
          <div className="finale-roulette__streak" aria-hidden />
          <div className="finale-roulette__ring" aria-hidden />
        </div>

        {statusLine ? (
          <p className="finale-roulette__status" key={statusLine}>
            {statusLine}
          </p>
        ) : null}
      </div>

      {meta && phase === "revealed" ? (
        <div
          key={`result-${outcome}`}
          className={`finale-result-banner is-${outcome}`}
          role="status"
          aria-live="polite"
        >
          <strong>{meta.label}</strong>
          <span>{meta.mood}</span>
          <button
            type="button"
            className={`finale-result-banner__done is-${outcome}`}
            onClick={onComplete}
            disabled={completeDisabled}
          >
            Завершить
            <span>
              {completeDisabled
                ? "Сначала выполни cumplay / обещание"
                : meta.doneHint}
            </span>
          </button>
        </div>
      ) : null}
    </div>
  );
}
