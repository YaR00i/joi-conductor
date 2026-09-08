import { describe, expect, it } from "vitest";
import {
  DEFAULT_RUNNER_SETTINGS,
  filterArcadeTasks,
  filterTasksForRunner,
} from "./runnerSettings";
import type { PuzzleTask } from "./puzzleTasks";

const edge: PuzzleTask = {
  id: "edge",
  titleRu: "Эдж",
  instructionRu: "-",
  kind: "edge",
  durationSec: 30,
  rewardBonus: 1,
  failPenalty: 1,
};
const vibeTask: PuzzleTask = { ...edge, id: "vibe", kind: "vibe", vibeLevel: 3 };
const edgeWithVibe: PuzzleTask = { ...edge, id: "edgeV", vibeLevel: 2 };
const perTouchVibe: PuzzleTask = {
  ...edge,
  id: "pt",
  kind: "per_touch",
  perTouchAction: { kind: "vibe", level: 2, sec: 10 },
};

const all = [edge, vibeTask, edgeWithVibe, perTouchVibe];

describe("filterTasksForRunner", () => {
  it("keeps everything while at least one vibration channel is on", () => {
    expect(filterTasksForRunner(all, DEFAULT_RUNNER_SETTINGS)).toHaveLength(4);
    expect(
      filterTasksForRunner(all, { lovenseVibe: false, manualVibe: true, wager: 0 }),
    ).toHaveLength(4);
    expect(
      filterTasksForRunner(all, { lovenseVibe: true, manualVibe: false, wager: 0 }),
    ).toHaveLength(4);
  });

  it("drops every vibration task when both channels are off", () => {
    const filtered = filterTasksForRunner(all, {
      lovenseVibe: false,
      manualVibe: false,
      wager: 0,
    });
    expect(filtered.map((t) => t.id)).toEqual(["edge"]);
  });
});

describe("filterArcadeTasks", () => {
  it("drops per-touch and ghost kinds even when vibe is on", () => {
    const ghost: PuzzleTask = { ...edge, id: "ghost", kind: "ghost_hint" };
    const filtered = filterArcadeTasks([...all, ghost], DEFAULT_RUNNER_SETTINGS);
    expect(filtered.map((t) => t.id).sort()).toEqual(["edge", "edgeV", "vibe"]);
  });
});
