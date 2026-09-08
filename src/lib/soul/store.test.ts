import { beforeEach, describe, expect, it } from "vitest";
import {
  installLocalStorageMock,
  resetLocalStorage,
} from "../../test/localStorageMock";
import type { CharacterBible } from "../character";
import { loadSoulState, saveSoulState, SOUL_STORAGE_KEY, clearSoulDiary, clearSoulTopics } from "./store";
import { emptyMistressState } from "./types";

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
});

describe("soul store", () => {
  it("round-trips per mistress and keeps slots isolated", () => {
    const hu = emptyMistressState(bible.nameRu, bible.tone);
    hu.messages.push({
      id: "1",
      role: "user",
      text: "привет",
      atMs: 1,
    });
    saveSoulState("hu_tao", hu);
    const furina = emptyMistressState("Фурина", ["dramatic"]);
    furina.character.primaryEmotion = "Theatrical";
    saveSoulState("furina", furina);

    expect(loadSoulState("hu_tao", bible).messages[0]?.text).toBe("привет");
    expect(loadSoulState("furina", bible).character.primaryEmotion).toBe(
      "Theatrical",
    );
    expect(localStorage.getItem(SOUL_STORAGE_KEY)).toContain("hu_tao");
  });

  it("returns a fresh bible-based state when storage is empty", () => {
    const loaded = loadSoulState("sparkle", bible);
    expect(loaded.messages).toEqual([]);
    expect(loaded.memoryMd).toContain("Core identity");
  });

  it("regenerates markdown projections from structured memory", () => {
    const hu = emptyMistressState(bible.nameRu, bible.tone);
    hu.character.primaryEmotion = "Amused";
    hu.user.knownAttributes = "Likes night tea";
    hu.memoryMd = "STALE CHARACTER MARKDOWN";
    hu.userMd = "STALE USER MARKDOWN";
    saveSoulState("hu_tao", hu);
    const loaded = loadSoulState("hu_tao", bible);
    expect(loaded.memoryMd).toContain("Amused");
    expect(loaded.userMd).toContain("Likes night tea");
    expect(loaded.memoryMd).not.toContain("STALE");
    expect(loaded.userMd).not.toContain("STALE");
  });

  it("round-trips open loops and recent events", () => {
    const hu = emptyMistressState(bible.nameRu, bible.tone);
    hu.openLoops.push({
      id: "loop-1",
      summary: "Отказался от сессии",
      source: "session_refused",
      atMs: 10,
      importance: 2,
    });
    hu.recentEvents.push({
      id: "ev-1",
      kind: "session_refused",
      atMs: 10,
      mistressId: "hu_tao",
      summary: "Отказался от предложенной сессии",
      importance: 2,
    });
    saveSoulState("hu_tao", hu);
    const loaded = loadSoulState("hu_tao", bible);
    expect(loaded.openLoops).toHaveLength(1);
    expect(loaded.recentEvents[0]?.kind).toBe("session_refused");
  });

  it("does not let a stale chat save drop a newer conductor event", () => {
    const withEvent = emptyMistressState("Искорка", ["chaotic"]);
    withEvent.recentEvents.push({
      id: "ev-2",
      kind: "session_completed",
      atMs: 50,
      mistressId: "sparkle",
      summary: "Сессия завершена",
      importance: 3,
    });
    withEvent.user.knownAttributes = "Already known.";
    withEvent.user.sharedMilestones = ["Сессия завершена"];
    saveSoulState("sparkle", withEvent);

    const stale = emptyMistressState("Искорка", ["chaotic"]);
    stale.user.knownAttributes = "Already known.";
    stale.messages.push({
      id: "m2",
      role: "user",
      text: "привет",
      atMs: 80,
    });
    saveSoulState("sparkle", stale);

    const sparkleBible: CharacterBible = { ...bible, id: "sparkle", nameRu: "Искорка" };
    const loaded = loadSoulState("sparkle", sparkleBible);
    expect(loaded.messages[0]?.text).toBe("привет");
    expect(loaded.recentEvents[0]?.kind).toBe("session_completed");
    expect(loaded.user.sharedMilestones).toContain("Сессия завершена");
  });

  it("round-trips intent, initiative, and loop expiry", () => {
    const hu = emptyMistressState(bible.nameRu, bible.tone);
    hu.openLoops.push({
      id: "loop-1",
      summary: "Отказался от сессии",
      source: "session_refused",
      atMs: 10,
      importance: 2,
      expiresAtMs: 99,
    });
    hu.intent = {
      goal: "Спросить про отказ",
      tone: "annoyed",
      priority: 3,
      source: "session",
      candidateId: "loop:loop-1",
      expiresAtMs: 80,
    };
    hu.initiative = { lastAtMs: 40, consumedIds: ["loop:loop-1"] };
    saveSoulState("hu_tao", hu);
    const loaded = loadSoulState("hu_tao", bible);
    expect(loaded.openLoops[0]?.expiresAtMs).toBe(99);
    expect(loaded.intent?.goal).toBe("Спросить про отказ");
    expect(loaded.initiative.consumedIds).toEqual(["loop:loop-1"]);
  });

  it("keeps incoming intent when a stale chat save must preserve conductor events", () => {
    const withEvent = emptyMistressState("Искорка", ["chaotic"]);
    withEvent.recentEvents.push({
      id: "ev-2",
      kind: "session_completed",
      atMs: 50,
      mistressId: "sparkle",
      summary: "Сессия завершена",
      importance: 3,
    });
    withEvent.user.sharedMilestones = ["Сессия завершена"];
    saveSoulState("sparkle", withEvent);

    const stale = emptyMistressState("Искорка", ["chaotic"]);
    stale.messages.push({
      id: "m2",
      role: "user",
      text: "ну что",
      atMs: 80,
    });
    stale.intent = {
      goal: "Прокомментировать сессию",
      tone: "pleased",
      priority: 3,
      source: "session",
      candidateId: "event:ev-2",
    };
    stale.initiative = { lastAtMs: 80, consumedIds: ["event:ev-2"] };
    saveSoulState("sparkle", stale);

    const sparkleBible: CharacterBible = { ...bible, id: "sparkle", nameRu: "Искорка" };
    const loaded = loadSoulState("sparkle", sparkleBible);
    expect(loaded.recentEvents[0]?.kind).toBe("session_completed");
    expect(loaded.initiative.consumedIds).toContain("event:ev-2");
    expect(loaded.intent?.candidateId).toBe("event:ev-2");
  });

  it("clears diary text without dropping the thread", () => {
    const state = emptyMistressState(bible.nameRu, bible.tone);
    state.messages.push({
      id: "1",
      role: "user",
      text: "привет",
      atMs: 1,
    });
    state.diaryMd = "2026-09-04\nОн зашёл ночью.";
    state.topics.push({ filename: "night.md", body: "ночь" });
    const diaryGone = clearSoulDiary(state);
    expect(diaryGone.diaryMd).toBe("");
    expect(diaryGone.messages).toHaveLength(1);
    expect(diaryGone.topics).toHaveLength(1);
    const topicsGone = clearSoulTopics(diaryGone);
    expect(topicsGone.topics).toEqual([]);
    expect(topicsGone.messages).toHaveLength(1);
  });
});
