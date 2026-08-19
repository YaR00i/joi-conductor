import {
  getMetronomeContext,
  getMetronomeVolume,
  isMetronomeMuted,
} from "./metronome";

/** Matches `.param-roulette__wheel.is-animating` / finale spin CSS. */
export const ROULETTE_SPIN_EASE = [0.12, 0.78, 0.05, 1] as const;
export const ROULETTE_SPIN_MS = 3400;
/** Seconds to climb to the edge after «ГОТОВ КОНЧИТЬ». */
export const FINALE_EDGE_TIMER_SEC = 10;
/** Wheel spins during the last stretch of the edge timer. */
export const FINALE_ROULETTE_SPIN_MS = 2800;
/**
 * Fast for most of the spin, hard smooth brake into the land.
 * Matches `.finale-roulette__wheel.is-spinning`.
 */
export const FINALE_ROULETTE_SPIN_EASE = [0.05, 0.92, 0.12, 1] as const;
export const ROULETTE_PEG_COUNT = 16;

let landTimer = 0;
let spinGen = 0;
/** Bus for the active spin — disconnect to mute pending scheduled ticks. */
let spinBus: GainNode | null = null;

function killSpinBus() {
  if (!spinBus) return;
  try {
    const ctx = spinBus.context;
    const now = ctx.currentTime;
    spinBus.gain.cancelScheduledValues(now);
    spinBus.gain.setValueAtTime(0.0001, now);
    spinBus.disconnect();
  } catch {
    // ignore
  }
  spinBus = null;
}

function clearSpinDrivers() {
  if (landTimer) {
    window.clearTimeout(landTimer);
    landTimer = 0;
  }
  killSpinBus();
}

function bez1d(t: number, c1: number, c2: number): number {
  const u = 1 - t;
  return 3 * u * u * t * c1 + 3 * u * t * t * c2 + t * t * t;
}

function bez1dDeriv(t: number, c1: number, c2: number): number {
  const u = 1 - t;
  return 3 * u * u * c1 + 6 * u * t * (c2 - c1) + 3 * t * t * (1 - c2);
}

export function cssCubicBezierProgress(
  u: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  if (u <= 0) return 0;
  if (u >= 1) return 1;
  let t = u;
  for (let i = 0; i < 8; i++) {
    const x = bez1d(t, x1, x2);
    const dx = bez1dDeriv(t, x1, x2);
    if (Math.abs(dx) < 1e-6) break;
    t = Math.min(1, Math.max(0, t - (x - u) / dx));
  }
  let lo = 0;
  let hi = 1;
  t = u;
  for (let i = 0; i < 14; i++) {
    const x = bez1d(t, x1, x2);
    if (Math.abs(x - u) < 1e-7) break;
    if (x < u) lo = t;
    else hi = t;
    t = (lo + hi) / 2;
  }
  return bez1d(t, y1, y2);
}

function cssCubicBezierInvert(
  p: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  if (p <= 0) return 0;
  if (p >= 1) return 1;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2;
    if (cssCubicBezierProgress(mid, x1, y1, x2, y2) < p) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

function cssCubicBezierVelocity(
  u: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  const eps = 0.003;
  const a = cssCubicBezierProgress(Math.max(0, u - eps), x1, y1, x2, y2);
  const b = cssCubicBezierProgress(Math.min(1, u + eps), x1, y1, x2, y2);
  return (b - a) / (2 * eps);
}

/** Sharp peg-vs-pointer tick into `dest`. */
function playPegTickAt(
  ctx: AudioContext,
  dest: AudioNode,
  when: number,
  intensity = 1,
): void {
  const i = Math.min(1.25, Math.max(0.35, intensity));
  const vol = getMetronomeVolume() * 0.75 * i;
  if (vol <= 0.0001) return;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 1700 + 1000 * i;
  filter.Q.value = 8;
  osc.type = "triangle";
  osc.frequency.setValueAtTime(1300 + 700 * i, when);
  osc.frequency.exponentialRampToValueAtTime(260, when + 0.02);
  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, vol * 0.34), when + 0.001);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.024);
  osc.connect(filter);
  filter.connect(gain);
  gain.connect(dest);
  osc.start(when);
  osc.stop(when + 0.03);

  const bufLen = Math.max(1, Math.floor(ctx.sampleRate * 0.012));
  const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let n = 0; n < bufLen; n++) {
    const env = 1 - n / bufLen;
    data[n] = (Math.random() * 2 - 1) * env * env;
  }
  const noise = ctx.createBufferSource();
  noise.buffer = buf;
  const nFilter = ctx.createBiquadFilter();
  nFilter.type = "highpass";
  nFilter.frequency.value = 1400;
  const nGain = ctx.createGain();
  nGain.gain.setValueAtTime(vol * 0.28, when);
  nGain.gain.exponentialRampToValueAtTime(0.0001, when + 0.014);
  noise.connect(nFilter);
  nFilter.connect(nGain);
  nGain.connect(dest);
  noise.start(when);
  noise.stop(when + 0.016);
}

export function playRouletteLand() {
  if (isMetronomeMuted()) return;
  try {
    const ctx = getMetronomeContext();
    if (ctx.state === "suspended") void ctx.resume();
    const now = ctx.currentTime;
    const dest = ctx.destination;
    playPegTickAt(ctx, dest, now, 1.15);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const vol = getMetronomeVolume() * 0.5;
    osc.type = "sine";
    osc.frequency.setValueAtTime(180, now + 0.02);
    osc.frequency.exponentialRampToValueAtTime(70, now + 0.12);
    gain.gain.setValueAtTime(0.0001, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(vol * 0.22, now + 0.028);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);
    osc.connect(gain);
    gain.connect(dest);
    osc.start(now + 0.02);
    osc.stop(now + 0.15);
  } catch {
    // ignore
  }
}

export type RouletteSpinSoundOpts = {
  durationMs?: number;
  fromDeg: number;
  toDeg: number;
  pegDeg?: number;
  ease?: readonly [number, number, number, number];
};

/**
 * One tick per rim peg crossing the top pointer, timed like the CSS ease-out.
 */
export function startRouletteSpinSound(
  optsOrDuration: RouletteSpinSoundOpts | number = {
    fromDeg: 0,
    toDeg: 5 * 360,
    durationMs: ROULETTE_SPIN_MS,
  },
): void {
  clearSpinDrivers();
  const gen = ++spinGen;
  if (isMetronomeMuted()) return;

  const opts: RouletteSpinSoundOpts =
    typeof optsOrDuration === "number"
      ? { durationMs: optsOrDuration, fromDeg: 0, toDeg: 5 * 360 }
      : optsOrDuration;

  const durationMs = opts.durationMs ?? ROULETTE_SPIN_MS;
  const fromDeg = opts.fromDeg;
  const toDeg = opts.toDeg;
  const totalDeg = toDeg - fromDeg;
  if (totalDeg < 20) return;

  const pegDeg = opts.pegDeg ?? 360 / ROULETTE_PEG_COUNT;
  const [x1, y1, x2, y2] = opts.ease ?? ROULETTE_SPIN_EASE;

  let ctx: AudioContext;
  try {
    ctx = getMetronomeContext();
  } catch {
    return;
  }

  const schedule = () => {
    if (gen !== spinGen) return;

    killSpinBus();
    const bus = ctx.createGain();
    bus.gain.value = 1;
    bus.connect(ctx.destination);
    spinBus = bus;

    const t0 = ctx.currentTime + 0.015;
    const durSec = durationMs / 1000;

    playPegTickAt(ctx, bus, t0, 0.9);

    const firstN = Math.floor(fromDeg / pegDeg) + 1;
    const lastN = Math.floor(toDeg / pegDeg);
    const refVel = Math.max(
      0.001,
      cssCubicBezierVelocity(0.06, x1, y1, x2, y2) * (totalDeg / durationMs),
    );

    let scheduled = 0;
    for (let n = firstN; n <= lastN; n++) {
      const absDeg = n * pegDeg;
      const spinProgress = (absDeg - fromDeg) / totalDeg;
      if (spinProgress <= 0.002 || spinProgress > 1) continue;

      const u = cssCubicBezierInvert(spinProgress, x1, y1, x2, y2);
      const when = t0 + u * durSec;
      const vel =
        cssCubicBezierVelocity(u, x1, y1, x2, y2) * (totalDeg / durationMs);
      const intensity = Math.min(1.2, Math.max(0.4, vel / refVel));
      playPegTickAt(ctx, bus, when, intensity);
      scheduled += 1;
    }

    // Safety: always have a rhythmic ease-out train if peg math is thin
    if (scheduled < 12) {
      let t = 0.035;
      let gap = 0.038;
      while (t < durSec - 0.1) {
        const u = Math.min(1, t / durSec);
        const intensity = Math.min(1.15, Math.max(0.45, 1.1 - u * 0.7));
        playPegTickAt(ctx, bus, t0 + t, intensity);
        gap = 0.038 + u * u * 0.2;
        t += gap;
      }
    }

    landTimer = window.setTimeout(() => {
      if (gen !== spinGen) return;
      playRouletteLand();
      landTimer = 0;
    }, durationMs + 40);
  };

  if (ctx.state === "suspended") {
    void ctx.resume().then(schedule).catch(() => undefined);
  } else {
    schedule();
  }
}

export function stopRouletteSpinSound(): void {
  spinGen += 1;
  clearSpinDrivers();
}
