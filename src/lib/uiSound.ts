import {
  getMetronomeContext,
  getMetronomeVolume,
  isMetronomeMuted,
} from "./metronome";

/** Resume shared AudioContext from a user gesture. */
export async function primeUiAudio(): Promise<void> {
  try {
    const ctx = getMetronomeContext();
    if (ctx.state === "suspended") await ctx.resume();
  } catch {
    // ignore
  }
}

function readyCtx(): AudioContext | null {
  if (isMetronomeMuted()) return null;
  try {
    const ctx = getMetronomeContext();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function noiseBurst(
  ctx: AudioContext,
  now: number,
  durSec: number,
  vol: number,
  hpHz: number,
): void {
  const bufLen = Math.max(1, Math.floor(ctx.sampleRate * durSec));
  const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufLen; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / bufLen);
  }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const filter = ctx.createBiquadFilter();
  filter.type = "highpass";
  filter.frequency.value = hpHz;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(Math.max(0.0001, vol), now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + durSec);
  src.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  src.start(now);
  src.stop(now + durSec + 0.01);
}

function tone(
  ctx: AudioContext,
  now: number,
  opts: {
    freq: number;
    endFreq?: number;
    type?: OscillatorType;
    dur: number;
    peak: number;
    attack?: number;
  },
): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = opts.type ?? "sine";
  osc.frequency.setValueAtTime(opts.freq, now);
  if (opts.endFreq != null) {
    osc.frequency.exponentialRampToValueAtTime(
      Math.max(20, opts.endFreq),
      now + opts.dur,
    );
  }
  const attack = opts.attack ?? 0.004;
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(
    Math.max(0.0001, opts.peak),
    now + attack,
  );
  gain.gain.exponentialRampToValueAtTime(0.0001, now + opts.dur);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + opts.dur + 0.02);
}

/** Soft UI button tap. */
export function playUiClick(intensity = 1): void {
  const ctx = readyCtx();
  if (!ctx) return;
  const now = ctx.currentTime;
  const vol = getMetronomeVolume() * 0.38 * intensity;
  tone(ctx, now, {
    freq: 920,
    endFreq: 540,
    type: "triangle",
    dur: 0.045,
    peak: vol * 0.22,
  });
  noiseBurst(ctx, now, 0.018, vol * 0.12, 1400);
}

/** Side-nav / section change. */
export function playUiNav(): void {
  const ctx = readyCtx();
  if (!ctx) return;
  const now = ctx.currentTime;
  const vol = getMetronomeVolume() * 0.4;
  tone(ctx, now, {
    freq: 480,
    endFreq: 720,
    type: "sine",
    dur: 0.09,
    peak: vol * 0.2,
  });
  tone(ctx, now + 0.04, {
    freq: 720,
    endFreq: 960,
    type: "sine",
    dur: 0.1,
    peak: vol * 0.14,
  });
}

/** Hub tab switch. */
export function playUiTab(): void {
  const ctx = readyCtx();
  if (!ctx) return;
  const now = ctx.currentTime;
  const vol = getMetronomeVolume() * 0.36;
  tone(ctx, now, {
    freq: 660,
    type: "triangle",
    dur: 0.05,
    peak: vol * 0.18,
  });
  noiseBurst(ctx, now, 0.02, vol * 0.1, 1200);
}

/** Primary confirm / start CTA. */
export function playUiConfirm(): void {
  const ctx = readyCtx();
  if (!ctx) return;
  const now = ctx.currentTime;
  const vol = getMetronomeVolume() * 0.48;
  tone(ctx, now, {
    freq: 520,
    type: "sine",
    dur: 0.12,
    peak: vol * 0.22,
  });
  tone(ctx, now + 0.07, {
    freq: 780,
    type: "sine",
    dur: 0.16,
    peak: vol * 0.18,
  });
  tone(ctx, now + 0.14, {
    freq: 1040,
    type: "sine",
    dur: 0.2,
    peak: vol * 0.12,
  });
}

/** Decline / cancel. */
export function playUiDeny(): void {
  const ctx = readyCtx();
  if (!ctx) return;
  const now = ctx.currentTime;
  const vol = getMetronomeVolume() * 0.36;
  tone(ctx, now, {
    freq: 420,
    endFreq: 260,
    type: "triangle",
    dur: 0.12,
    peak: vol * 0.2,
  });
}

/** Checkbox / toggle. */
export function playUiToggle(on: boolean): void {
  const ctx = readyCtx();
  if (!ctx) return;
  const now = ctx.currentTime;
  const vol = getMetronomeVolume() * 0.34;
  tone(ctx, now, {
    freq: on ? 700 : 380,
    endFreq: on ? 980 : 260,
    type: "square",
    dur: 0.04,
    peak: vol * 0.1,
  });
}

/**
 * Revolver-style chamber tick for wheel pickers / drums.
 * Short metallic ratchet — not a full spin.
 */
export function playWheelTick(intensity = 1): void {
  const ctx = readyCtx();
  if (!ctx) return;
  const now = ctx.currentTime;
  const vol = getMetronomeVolume() * 0.42 * intensity;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 1100 + Math.random() * 500;
  filter.Q.value = 6;
  osc.type = "square";
  osc.frequency.setValueAtTime(900 + Math.random() * 280, now);
  osc.frequency.exponentialRampToValueAtTime(280, now + 0.035);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, vol * 0.16), now + 0.002);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.04);
  osc.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.045);

  noiseBurst(ctx, now, 0.022, vol * 0.18, 700);
}

/** Soft open / panel whoosh. */
export function playUiOpen(): void {
  const ctx = readyCtx();
  if (!ctx) return;
  const now = ctx.currentTime;
  const vol = getMetronomeVolume() * 0.3;
  noiseBurst(ctx, now, 0.08, vol * 0.14, 400);
  tone(ctx, now, {
    freq: 240,
    endFreq: 480,
    type: "sine",
    dur: 0.12,
    peak: vol * 0.1,
  });
}
