import { beforeEach, describe, expect, it } from "vitest";
import {
  installLocalStorageMock,
  resetLocalStorage,
} from "../../test/localStorageMock";
import type { CharacterBible } from "../character";
import { loadSoulState, saveSoulState, SOUL_STORAGE_KEY } from "./store";
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
});
