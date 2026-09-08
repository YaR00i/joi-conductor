import { beforeEach, describe, expect, it } from "vitest";
import {
  installLocalStorageMock,
  resetLocalStorage,
} from "../../test/localStorageMock";
import {
  assignProgramContract,
  ensureDailyContractBoard,
  reportContract,
} from "../contracts/dailyBoard";
import { setActiveMistress } from "../mistress/activeMistress";
import type { CharacterBible } from "../character";
import { loadSoulState } from "./store";
import { ensureSoulWorldEventBridge } from "./worldEventBridge";

installLocalStorageMock();

const bible: CharacterBible = {
  id: "hu_tao",
  nameRu: "Ху Тао",
  locale: "ru",
  tone: ["playful"],
  taboo: ["break character"],
  diminutives: ["silly"],
  emojiAllowed: false,
  systemPrompt: "You are Hu Tao.",
  fallbackLines: {},
};

beforeEach(() => {
  resetLocalStorage();
  setActiveMistress("hu_tao");
  ensureSoulWorldEventBridge();
});

describe("soul world event bridge", () => {
  it("writes a session-lane contract completion into Soul memory", () => {
    ensureDailyContractBoard();
    const row = assignProgramContract("edge_hands_off");
    expect(row).toBeTruthy();
    reportContract(row!.instanceId, "done");
    const soul = loadSoulState("hu_tao", bible);
    expect(soul.recentEvents.some((ev) => ev.kind === "contract_completed")).toBe(
      true,
    );
    expect(
      soul.user.sharedMilestones.some((line) => /Контракт выполнен/.test(line)),
    ).toBe(true);
    expect(soul.openLoops.some((loop) => loop.subjectId === row!.instanceId)).toBe(
      false,
    );
  });

  it("does not turn a finished habit into a milestone", () => {
    ensureDailyContractBoard();
    const row = assignProgramContract("body_daily_exercise");
    expect(row).toBeTruthy();
    reportContract(row!.instanceId, "done");
    const soul = loadSoulState("hu_tao", bible);
    expect(soul.recentEvents.some((ev) => ev.subjectId === row!.instanceId)).toBe(
      false,
    );
    expect(
      soul.user.sharedMilestones.some((line) => line.includes(row!.titleRu)),
    ).toBe(false);
  });
});
