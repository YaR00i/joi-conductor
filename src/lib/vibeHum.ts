import {
  getMetronomeContext,
  getMetronomeVolume,
  isMetronomeMuted,
} from "./metronome";

/**
 * Continuous low buzz for vibe blocks. Intensity (0–5) drives pitch + amplitude.
 * Shares metronome mute / volume.
 */

let osc: OscillatorNode | null = null;
let lfo: OscillatorNode | null = null;
let lfoDepth: GainNode | null = null;
let master: GainNode | null = null;
let filter: BiquadFilterNode | null = null;
let heldLevel = 0;
let running = false;
let fadeTimer = 0;

function levelToParams(level: number): {
  freq: number;
  amp: number;
  pulseHz: number;
  pulseDepth: number;
  cutoff: number;
} {
  const lvl = Math.max(0, Math.min(5, level));
  return {
    freq: 42 + lvl * 22,
    amp: getMetronomeVolume() * (0.03 + lvl * 0.04),
    pulseHz: 7 + lvl * 5,
    pulseDepth: 4 + lvl * 3.5,
    cutoff: 160 + lvl * 60,
  };
}

function ensureGraph(): boolean {
  try {
    const ctx = getMetronomeContext();
    if (ctx.state === "suspended") void ctx.resume();

    if (running && osc && master && lfo && lfoDepth && filter) return true;

    hardStop(false);

    master = ctx.createGain();
    master.gain.value = 0.0001;
    master.connect(ctx.destination);

    filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 220;
    filter.Q.value = 0.8;
    filter.connect(master);

    osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = 60;
    osc.connect(filter);

    lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 10;

    lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 8;
    lfo.connect(lfoDepth);
    lfoDepth.connect(osc.frequency);

    osc.start();
    lfo.start();
    running = true;
    return true;
  } catch {
    return false;
  }
}

function hardStop(clearHeld: boolean): void {
  window.clearTimeout(fadeTimer);
  try {
    osc?.stop();
    lfo?.stop();
  } catch {
    // already stopped
  }
  try {
    osc?.disconnect();
    lfo?.disconnect();
    lfoDepth?.disconnect();
    filter?.disconnect();
    master?.disconnect();
  } catch {
    // ignore
  }
  osc = null;
  lfo = null;
  lfoDepth = null;
  filter = null;
  master = null;
  running = false;
  if (clearHeld) heldLevel = 0;
}

/** Set vibe intensity. 0 = silent. */
export function setVibeHumLevel(level: number): void {
  const lvl = Math.max(0, Math.min(5, Math.round(level)));
  heldLevel = lvl;

  if (isMetronomeMuted() || lvl <= 0) {
    fadeOutAndStop(false);
    return;
  }

  if (!ensureGraph() || !osc || !master || !lfo || !lfoDepth || !filter) return;

  const ctx = getMetronomeContext();
  const t = ctx.currentTime;
  const { freq, amp, pulseHz, pulseDepth, cutoff } = levelToParams(lvl);

  osc.frequency.cancelScheduledValues(t);
  osc.frequency.setValueAtTime(osc.frequency.value || freq, t);
  osc.frequency.linearRampToValueAtTime(freq, t + 0.12);

  filter.frequency.cancelScheduledValues(t);
  filter.frequency.setValueAtTime(filter.frequency.value, t);
  filter.frequency.linearRampToValueAtTime(cutoff, t + 0.12);

  lfo.frequency.setValueAtTime(pulseHz, t);
  lfoDepth.gain.setValueAtTime(pulseDepth, t);

  master.gain.cancelScheduledValues(t);
  const cur = Math.max(0.0001, master.gain.value);
  master.gain.setValueAtTime(cur, t);
  master.gain.linearRampToValueAtTime(Math.max(0.0001, amp), t + 0.1);
}

/** Silence but remember level (session pause). */
export function pauseVibeHum(): void {
  fadeOutAndStop(false);
}

/** Restore last level after pause. */
export function resumeVibeHum(): void {
  if (heldLevel > 0) setVibeHumLevel(heldLevel);
}

/** Full stop (block/session end). */
export function stopVibeHum(): void {
  fadeOutAndStop(true);
}

/** Call when mute toggles so an active vibe buzz reacts immediately. */
export function syncVibeHumMute(): void {
  if (isMetronomeMuted()) {
    fadeOutAndStop(false);
  } else if (heldLevel > 0) {
    setVibeHumLevel(heldLevel);
  }
}

/** Call when metronome volume changes mid-vibe. */
export function syncVibeHumVolume(): void {
  if (!running || heldLevel <= 0 || isMetronomeMuted() || !master) return;
  const ctx = getMetronomeContext();
  const t = ctx.currentTime;
  const { amp } = levelToParams(heldLevel);
  master.gain.cancelScheduledValues(t);
  master.gain.linearRampToValueAtTime(Math.max(0.0001, amp), t + 0.05);
}

function fadeOutAndStop(clearHeld: boolean): void {
  if (!running || !master) {
    hardStop(clearHeld);
    return;
  }
  try {
    const ctx = getMetronomeContext();
    const t = ctx.currentTime;
    master.gain.cancelScheduledValues(t);
    master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), t);
    master.gain.linearRampToValueAtTime(0.0001, t + 0.08);
    window.clearTimeout(fadeTimer);
    fadeTimer = window.setTimeout(() => hardStop(clearHeld), 100);
  } catch {
    hardStop(clearHeld);
  }
}
