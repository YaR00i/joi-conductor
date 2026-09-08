import { describe, expect, it } from "vitest";
import type { CharacterBible } from "../character";
import {
  fallbackSoulSpeech,
  isRepeatSpeech,
  sanitizeSoulSpeech,
  speechRepeatScore,
  validateSoulSpeech,
} from "./speechQuality";

const bible: CharacterBible = {
  id: "hu_tao",
  nameRu: "Ху Тао",
  locale: "ru",
  tone: ["playful"],
  taboo: ["break character"],
  diminutives: ["silly"],
  emojiAllowed: false,
  systemPrompt: "You are Hu Tao.",
  fallbackLines: {
    chat: ["Хе-хе. Скажи ещё раз."],
  },
};

describe("soul speech quality", () => {
  it("strips think, fences, prefixes, and leaves Russian speech", () => {
    expect(
      sanitizeSoulSpeech(
        "<think>plan</think>\n```json\nnope\n```\nAssistant: Привет, глупыш. Как дела?",
      ),
    ).toBe("Привет, глупыш. Как дела?");
    expect(sanitizeSoulSpeech("Ну что, чай будем? /think")).toContain("чай");
  });

  it("rejects only-think, json-only, prompt echo, and accepts speech", () => {
    expect(validateSoulSpeech("<think>secret</think>").ok).toBe(false);
    expect(validateSoulSpeech("<think>secret</think>").reason).toBe("think_only");
    expect(validateSoulSpeech('{"actions":[{"op":"set_wear","kind":"cage","hours":2}]}').ok).toBe(
      false,
    );
    expect(validateSoulSpeech('{"text":"hi"}').reason).toBe("json_only");
    expect(validateSoulSpeech("[IDENTITY]\nYou are Hu Tao").ok).toBe(false);
    expect(validateSoulSpeech("Привет. Я на месте, глупыш.").ok).toBe(true);
    expect(validateSoulSpeech("Привет. Я на месте, глупыш.").text).toContain("глупыш");
  });

  it("detects near-duplicate replies and shared prefixes", () => {
    const line = "Хе-хе. Опять ты. Садись, чай сам себя не выпьет.";
    expect(speechRepeatScore(line, line)).toBe(1);
    expect(isRepeatSpeech(line, [line])).toBe(true);
    expect(
      isRepeatSpeech("Ну заходи, раз пришёл. Чай ещё тёплый.", [line]),
    ).toBe(false);
    expect(
      isRepeatSpeech("Хочешь, чтобы я тебя немного поторментила?", [
        "Хочешь, чтобы я тебя немного развлекла?",
      ]),
    ).toBe(true);
    const prefix = "Слушай меня внимательно сейчас. ";
    expect(
      isRepeatSpeech(`${prefix}четвёртый раз.`, [
        `${prefix}раз.`,
        `${prefix}два.`,
        `${prefix}три.`,
      ]),
    ).toBe(true);
  });

  it("rejects a sentence repeated inside one generated reply", () => {
    const repeated = Array.from(
      { length: 5 },
      () => "Хорошо, тогда сейчас — эджи. Надеюсь, ты готов.",
    ).join(" ");
    expect(isRepeatSpeech(repeated, [])).toBe(true);
    expect(validateSoulSpeech(repeated)).toMatchObject({
      ok: false,
      reason: "repeat",
    });
    expect(
      validateSoulSpeech(
        "Хорошо, тогда сейчас попьём чай. Хорошо, тогда сейчас попьём чай.",
      ),
    ).toMatchObject({ ok: false, reason: "repeat" });
  });

  it("rejects a reply that does not match the user's language", () => {
    expect(
      validateSoulSpeech("Привет, живой.", { expectedLanguage: "en" }),
    ).toMatchObject({ ok: false, reason: "wrong_language" });
    expect(
      validateSoulSpeech("起来，懒虫。", { expectedLanguage: "ru" }),
    ).toMatchObject({ ok: false, reason: "wrong_language" });
  });

  it("rejects speech that repeats a hard-boundary subject", () => {
    expect(
      validateSoulSpeech("Тогда иди в клетку.", {
        expectedLanguage: "ru",
        forbiddenSubjects: ["cage"],
      }),
    ).toMatchObject({ ok: false, reason: "hard_boundary" });
    expect(
      validateSoulSpeech("Нет, эту границу мы не переходим.", {
        expectedLanguage: "ru",
        forbiddenSubjects: ["cage"],
      }),
    ).toMatchObject({ ok: true });
  });

  it("picks a character fallback line", () => {
    expect(fallbackSoulSpeech(bible)).toBe("Хе-хе. Скажи ещё раз.");
  });
});
