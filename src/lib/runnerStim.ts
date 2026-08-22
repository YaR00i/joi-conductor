/**
 * Mid-run device stimulus pulses for the runner (red gates, fights, boss).
 *
 * Only drives the device when nothing else is using it: if the cached device
 * status shows a non-zero level/intensity (e.g. an active session is running
 * the toy), the pulse is skipped so the game never talks over a session.
 * A single module-level timer keeps at most one pulse in flight; cancel()
 * stops the device and is wired to outcome/unmount.
 */

import {
  getCachedDeviceStatus,
  setDeviceVibeLevel,
  stopDevice,
} from "./device/deviceClient";

export type RunnerStimEvent = "redGate" | "fightWin" | "bossWin" | "death";

/** level + duration per event (kept gentle: punishment, not a session). */
const STIM_PULSES: Record<RunnerStimEvent, { level: number; ms: number }> = {
  redGate: { level: 2, ms: 1200 },
  fightWin: { level: 3, ms: 1500 },
  bossWin: { level: 5, ms: 2500 },
  death: { level: 4, ms: 3000 },
};

let timer: number | null = null;
/** Set while our own pulse is running so we only stop what we started. */
let active = false;

function clearTimer(): void {
  if (timer != null) {
    window.clearTimeout(timer);
    timer = null;
  }
}

/** Fire a short stimulus pulse for a gameplay event (no-op when busy). */
export function runnerStimPulse(event: RunnerStimEvent): void {
  const { level, ms } = STIM_PULSES[event];
  // Back off when the toy is already driven by something else (session,
  // task overlay) — never talk over an existing stimulation.
  const st = getCachedDeviceStatus();
  if (st.intensity > 0 || st.level > 0) return;
  clearTimer();
  active = true;
  void setDeviceVibeLevel(level);
  timer = window.setTimeout(() => {
    timer = null;
    if (!active) return;
    active = false;
    void stopDevice();
  }, ms);
}

/** Stop any in-flight pulse (outcome, unmount, leaving the game). */
export function runnerStimCancel(): void {
  clearTimer();
  if (active) {
    active = false;
    void stopDevice();
  }
}

/**
 * Drop ownership of an in-flight pulse WITHOUT stopping the device — used
 * when a fire-gate task overlay opens and takes over stimulation itself
 * (its unmount cleanup will stop the device later).
 */
export function runnerStimYield(): void {
  clearTimer();
  active = false;
}
