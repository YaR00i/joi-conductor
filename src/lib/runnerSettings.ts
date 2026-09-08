/**
 * Runner feel settings (vibration channels), persisted per profile.
 *
 * Two independent channels:
 *  - lovenseVibe: the game may drive a connected Lovense/Buttplug device
 *    (mid-run stimulus pulses + device stimulation inside fire-gate tasks).
 *  - manualVibe: vibration tasks may be performed by hand — fire-gate tasks
 *    with a vibe component render as manual instructions instead.
 *
 * With both channels off the runner filters every vibration task out of the
 * fire-gate pool and stimulus events stay purely visual.
 */

import { taskRequiresVibe, type PuzzleTask } from "./puzzleTasks";
import { isWagerOption } from "./runnerWager";

export interface RunnerSettings {
  lovenseVibe: boolean;
  manualVibe: boolean;
  /** Pre-run wager in cinders (0 = no wager). */
  wager: number;
}

export const DEFAULT_RUNNER_SETTINGS: RunnerSettings = {
  lovenseVibe: true,
  manualVibe: true,
  wager: 0,
};

const STORAGE_KEY = "joi-runner-settings-v1";

export function loadRunnerSettings(): RunnerSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_RUNNER_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<RunnerSettings>;
    return {
      lovenseVibe:
        typeof parsed.lovenseVibe === "boolean"
          ? parsed.lovenseVibe
          : DEFAULT_RUNNER_SETTINGS.lovenseVibe,
      manualVibe:
        typeof parsed.manualVibe === "boolean"
          ? parsed.manualVibe
          : DEFAULT_RUNNER_SETTINGS.manualVibe,
      wager: isWagerOption(parsed.wager) ? parsed.wager : 0,
    };
  } catch {
    return { ...DEFAULT_RUNNER_SETTINGS };
  }
}

export function saveRunnerSettings(settings: RunnerSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    /* ignore quota */
  }
}

/** True when any vibration content may appear at all (either channel). */
export function vibeContentAllowed(settings: RunnerSettings): boolean {
  return settings.lovenseVibe || settings.manualVibe;
}

/** Filter for the fire-gate task pool respecting the vibration channels. */
export function filterTasksForRunner(
  tasks: PuzzleTask[],
  settings: RunnerSettings,
): PuzzleTask[] {
  if (vibeContentAllowed(settings)) return tasks;
  return tasks.filter((t) => !taskRequiresVibe(t));
}

/** Filter for arcade games (memory / farm / doodle): drop puzzle-only kinds too. */
export function filterArcadeTasks(
  tasks: PuzzleTask[],
  settings: RunnerSettings,
): PuzzleTask[] {
  return filterTasksForRunner(
    tasks.filter((t) => t.kind !== "per_touch" && t.kind !== "ghost_hint"),
    settings,
  );
}

/** How the shared task overlay should drive stimulus for this feel. */
export function stimVibeMode(
  settings: RunnerSettings,
): "device" | "manual" {
  return settings.lovenseVibe ? "device" : "manual";
}
