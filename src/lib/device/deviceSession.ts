/**
 * Pure helpers: when the session should stop / restore the physical vibe device.
 */

export type DeviceSessionStopReason =
  | "session_pause"
  | "session_end"
  | "block_end"
  | "leave_vibe_block";

export type DeviceSessionEventType =
  | "vibe_level"
  | "session_pause"
  | "session_end"
  | "session_resume"
  | "block_start"
  | "block_end"
  | "session_start";

/** Events that must cut vibration immediately. */
export function shouldStopDeviceOnEvent(
  type: DeviceSessionEventType,
): type is
  | "session_pause"
  | "session_end"
  | "block_end" {
  switch (type) {
    case "session_pause":
    case "session_end":
    case "block_end":
      return true;
    case "vibe_level":
    case "session_resume":
    case "block_start":
    case "session_start":
      return false;
    default: {
      const _exhaustive: never = type;
      return _exhaustive;
    }
  }
}

/**
 * Leaving a vibe-driven block (or starting a non-vibe block) → stop motors.
 * Pause already stops; resume restores if still on a vibe block.
 */
export function shouldStopOnBlockStart(drive: "beat" | "vibe" | undefined): boolean {
  return drive !== "vibe";
}

/** After pause, restore intensity only if we still have an active vibe level. */
export function shouldRestoreDeviceOnResume(opts: {
  status: "idle" | "running" | "paused" | "ended";
  vibeLevel: number | null | undefined;
}): boolean {
  if (opts.status !== "running") return false;
  if (opts.vibeLevel == null) return false;
  return opts.vibeLevel > 0;
}

export function stopReasonForEvent(
  type: DeviceSessionEventType,
): DeviceSessionStopReason | null {
  switch (type) {
    case "session_pause":
      return "session_pause";
    case "session_end":
      return "session_end";
    case "block_end":
      return "block_end";
    case "vibe_level":
    case "session_resume":
    case "block_start":
    case "session_start":
      return null;
    default: {
      const _exhaustive: never = type;
      return _exhaustive;
    }
  }
}
