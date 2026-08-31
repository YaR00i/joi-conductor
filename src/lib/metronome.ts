let audioCtx: AudioContext | null = null;
let muted = false;
let volume = 0.35;

export function setMetronomeMuted(next: boolean) {
  muted = next;
}

export function setMetronomeVolume(next: number) {
  volume = Math.max(0, Math.min(1, next));
}

export function isMetronomeMuted() {
  return muted;
}

export function getMetronomeVolume() {
  return volume;
}

/** Shared AudioContext (beats + vibe hum). */
export function getMetronomeContext(): AudioContext {
  return getCtx();
}

/** Call from a user gesture so AudioContext unlocks. */
export async function primeMetronome(): Promise<void> {
  const ctx = getCtx();
  if (ctx.state === "suspended") {
    await ctx.resume();
  }
}

function getCtx(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext();
  }
  return audioCtx;
}

/** accent: 0=silent, 1=soft, 2=strong. Optional whenCtx schedules on the audio clock. */
export function playBeatTick(accent: number, whenCtx?: number) {
  scheduleBeatTick(accent, whenCtx);
}

/**
 * Schedule a metronome tick on AudioContext time.
 * Returns a cancel fn (no-op if already started / silent).
 */
export function scheduleBeatTick(
  accent: number,
  whenCtx?: number,
): () => void {
  if (muted || accent <= 0) return () => {};
  try {
    const ctx = getCtx();
    if (ctx.state === "suspended") void ctx.resume();

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.value = accent >= 2 ? 880 : 520;
    const startAt =
      whenCtx == null ? ctx.currentTime : Math.max(ctx.currentTime, whenCtx);
    const peak = volume * (accent >= 2 ? 0.22 : 0.12);
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(peak, startAt + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.06);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(startAt);
    osc.stop(startAt + 0.07);
    let cancelled = false;
    return () => {
      if (cancelled) return;
      cancelled = true;
      try {
        osc.stop();
        osc.disconnect();
        gain.disconnect();
      } catch {
        /* already stopped */
      }
    };
  } catch {
    return () => {};
  }
}
