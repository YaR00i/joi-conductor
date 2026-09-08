import { beforeEach, describe, expect, it } from "vitest";
import {
  installLocalStorageMock,
  resetLocalStorage,
} from "../test/localStorageMock";
import {
  appendDiaryEntry,
  clearDiaryEntries,
  deleteDiaryEntry,
  loadDiaryEntries,
  type DiaryEntry,
} from "./sessionDiary";

installLocalStorageMock();

beforeEach(() => {
  resetLocalStorage();
});

function stubEntry(id: string): DiaryEntry {
  return {
    id,
    createdAt: `2026-09-0${id === "a" ? "1" : "2"}T12:00:00.000Z`,
    ended: "complete",
    elapsedSec: 120,
    durationSec: 120,
    edgesDone: 1,
    edgesTarget: 3,
    ruinsDone: 0,
    ruinsTarget: 0,
    finishId: "hand",
    finishNameRu: "Рука",
    cumplayId: "none",
    cumplayNameRu: "Ничего",
    ateCum: "none",
    mistressNameRu: "Ху Тао",
    mood: "calm",
    moodLabelRu: "Спокойная",
    moodScore: 0,
    mode: "stroke",
    modeNameRu: "Дрочка",
  };
}

describe("session diary wipe", () => {
  it("deletes one entry and can clear the book", () => {
    appendDiaryEntry(stubEntry("a"));
    appendDiaryEntry(stubEntry("b"));
    expect(loadDiaryEntries().map((e) => e.id)).toEqual(["b", "a"]);
    expect(deleteDiaryEntry("a").map((e) => e.id)).toEqual(["b"]);
    expect(clearDiaryEntries()).toEqual([]);
    expect(loadDiaryEntries()).toEqual([]);
  });
});
