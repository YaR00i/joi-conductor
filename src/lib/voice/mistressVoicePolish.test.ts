import { describe, expect, it } from "vitest";
import furinaBibleData from "../../../data/character/furina.json";
import huTaoBibleData from "../../../data/character/hu-tao.json";
import sparkleBibleData from "../../../data/character/sparkle.json";
import sparklePromptsData from "../../../data/character/sparkle-prompts.json";
import sunnaBibleData from "../../../data/character/sunna.json";
import sunnaPromptsData from "../../../data/character/sunna-prompts.json";
import {
  formatFallbackLine,
  type CharacterBible,
} from "../character";
import type { MistressPromptsPack } from "../mistressPrompts";
import { buildLlmUserMessage } from "./localLlmVoice";
import type { SessionEvent } from "../types";

const huTao = huTaoBibleData as CharacterBible;
const furina = furinaBibleData as CharacterBible;
const sunna = sunnaBibleData as CharacterBible;
const sparkle = sparkleBibleData as CharacterBible;

const edgeRequest: SessionEvent = {
  type: "edge_request",
  blockId: "b1",
};

function allSpeakEn(pack: MistressPromptsPack): string[] {
  return Object.values(pack)
    .flatMap((pool) => (Array.isArray(pool) ? pool : []))
    .map((p) => String(p.speakEn ?? ""));
}

describe("formatFallbackLine", () => {
  it("interpolates cost/reward placeholders", () => {
    expect(
      formatFallbackLine("Fine. {cost} cinders. +{reward}.", {
        cost: 12,
        reward: 3,
      }),
    ).toBe("Fine. 12 cinders. +3.");
  });
});

describe("buildLlmUserMessage", () => {
  it("names the mistress and injects llmVoiceGuide", () => {
    const msg = buildLlmUserMessage(huTao, edgeRequest);
    expect(msg).toContain("Ху Тао");
    expect(msg).toContain("hu-tao");
    expect(msg).toContain("Voice guide:");
    expect(huTao.llmVoiceGuide).toBeTruthy();
    expect(msg).toContain(huTao.llmVoiceGuide!.slice(0, 40));
  });

  it("keeps voice guides distinct across mistresses", () => {
    const guides = [huTao, furina, sunna, sparkle].map((b) => {
      expect(b.llmVoiceGuide?.length).toBeGreaterThan(40);
      return b.llmVoiceGuide!;
    });
    expect(new Set(guides).size).toBe(4);
    expect(huTao.llmVoiceGuide).toMatch(/bunny|gamer|ember/i);
    expect(furina.llmVoiceGuide).toMatch(/judge|verdict|Fontaine|defendant/i);
    expect(sunna.llmVoiceGuide).toMatch(/idol|clitty|rehearsal/i);
    expect(sparkle.llmVoiceGuide).toMatch(/Iskra|phantom|glitch|Mask/i);
  });

  it("asks for JSON speech and forbids cross-mistress borrowing", () => {
    const msg = buildLlmUserMessage(furina, edgeRequest);
    expect(msg).toContain('"text"');
    expect(msg).toMatch(/do not borrow/i);
    expect(msg).toContain("edge_request");
  });
});

describe("mistress prompt speakEn polish", () => {
  it("Sunna speakEn avoids Furina courtroom leftovers", () => {
    const speaks = allSpeakEn(sunnaPromptsData as MistressPromptsPack);
    const courtOnly = speaks.filter(
      (s) =>
        /verdict|defendant|gallery|Fontaine|contempt of court/i.test(s) &&
        !/idol|rehearsal|fans|encore|clitty|mic|chorus/i.test(s),
    );
    expect(courtOnly).toEqual([]);
    expect(speaks.some((s) => /idol|clitty|encore|fans/i.test(s))).toBe(true);
  });

  it("Sparkle speakEn avoids Furina courtroom leftovers and Furina confess leak", () => {
    const pack = sparklePromptsData as MistressPromptsPack;
    const speaks = allSpeakEn(pack);
    const courtOnly = speaks.filter(
      (s) =>
        /verdict|defendant|gallery|Fontaine|blue-haired judge/i.test(s) &&
        !/mask|glitch|phantom|Iskra|Sparkle|spiral|circus/i.test(s),
    );
    expect(courtOnly).toEqual([]);
    const furinaConfess = (pack.confess ?? []).find(
      (p) => p.id === "spk_c_furina",
    );
    expect(furinaConfess?.speakEn).toMatch(/Sparkle|masked/i);
    expect(furinaConfess?.speakEn).not.toMatch(/Furina|blue-haired judge/i);
    expect(
      furinaConfess?.options.find((o) => o.id === "like")?.preferKey,
    ).toBe("sparkle");
  });
});

describe("bible fallback voice lines", () => {
  it("provides bribe/quest fallbacks for each mistress", () => {
    for (const bible of [huTao, furina, sunna, sparkle]) {
      expect(bible.fallbackLines.bribe?.length).toBeGreaterThan(0);
      expect(bible.fallbackLines.quest_completed?.length).toBeGreaterThan(0);
      expect(bible.fallbackLines.quest_failed?.length).toBeGreaterThan(0);
      expect(bible.fallbackLines.promise_ask?.length).toBeGreaterThan(0);
      expect(bible.fallbackLines.bribe![0]).toContain("{cost}");
      expect(bible.fallbackLines.quest_completed![0]).toContain("{reward}");
    }
  });
});
