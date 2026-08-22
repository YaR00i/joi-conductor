import { beforeEach, describe, expect, it } from "vitest";
import {
  installLocalStorageMock,
  resetLocalStorage,
} from "../test/localStorageMock";
import { setActiveMistress } from "./mistress/activeMistress";
import { assignProgramContract, ensureDailyContractBoard } from "./contracts/dailyBoard";
import { scaleByMood } from "./moodScale";
import {
  cbtPunishSpec,
  cagePunishSpec,
  plugPunishSpec,
  punishSpecsForLive,
  idleTaskSpecs,
} from "./progressN";
import { contractPlayLane } from "./contracts/sessionSeed";
import { DEFAULT_MOOD_SCORE } from "./moodEngine";

installLocalStorageMock();

beforeEach(() => {
  resetLocalStorage();
  setActiveMistress("hu_tao");
});

describe("assignProgramContract", () => {
  it("puts a contract with fixed hours on the board", () => {
    ensureDailyContractBoard(new Date(2026, 7, 21, 12));
    const row = assignProgramContract(
      "chastity_locked_hours",
      { hours: 10 },
      "Клетка 10 ч",
    );
    expect(row).not.toBeNull();
    expect(row?.params.hours).toBe(10);
    expect(row?.titleRu).toBe("Клетка 10 ч");
    expect(row?.bodyRu).toContain("10");
  });
});

describe("punish specs", () => {
  it("skips cage when already worn", () => {
    expect(cagePunishSpec(DEFAULT_MOOD_SCORE, true)).toBeNull();
  });

  it("floats cage hours with cruel mood", () => {
    const spec = cagePunishSpec(-2, false);
    expect(spec?.defId).toBe("chastity_locked_hours");
    expect(Number(spec?.params.hours)).toBeGreaterThanOrEqual(4);
  });

  it("scales cbt taps", () => {
    const sweet = cbtPunishSpec(2);
    const cruel = cbtPunishSpec(-2);
    expect(Number(cruel.params.taps)).toBeGreaterThan(Number(sweet.params.taps));
  });

  it("skips plug when already worn", () => {
    expect(plugPunishSpec(0, true)).toBeNull();
  });

  it("scaleByMood matches punish delta", () => {
    expect(scaleByMood(8, -2, 4, 12)).toBe(10);
  });

  it("mixes live, out-of-session task, and session punish", () => {
    const specs = punishSpecsForLive({
      moodScore: 0,
      cageOn: false,
      plugOn: false,
      denialOn: false,
    });
    const lanes = specs.map((s) => contractPlayLane(s.defId));
    expect(lanes).toContain("live");
    expect(lanes).toContain("task");
    expect(lanes).toContain("session");
  });

  it("idle tasks stay out of session", () => {
    for (const spec of idleTaskSpecs(0)) {
      expect(contractPlayLane(spec.defId)).toBe("task");
    }
  });
});
