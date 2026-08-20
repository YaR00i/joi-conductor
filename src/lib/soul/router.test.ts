import { describe, expect, it } from "vitest";
import type { CharacterBible } from "../character";
import { applyEmotionalDecay, applySoulRouterPatch, parseSoulRouterOutput } from "./router";
import { emptyMistressState } from "./types";

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

function state() {
  return emptyMistressState(bible.nameRu, bible.tone);
}

describe("soul router", () => {
  it("honors no_significant_change", () => {
    const parsed = parseSoulRouterOutput(
      '```json\n{"no_significant_change": true}\n```',
      state(),
    );
    expect(parsed).toEqual({ kind: "no_change" });
    const next = applySoulRouterPatch(
      { ...state(), pendingSinceRouter: 4 },
      parsed!,
    );
    expect(next.pendingSinceRouter).toBe(0);
    expect(next.character.primaryEmotion).toBe(state().character.primaryEmotion);
  });

  it("patches character and user memory from nested JSON", () => {
    const parsed = parseSoulRouterOutput(
      JSON.stringify({
        no_significant_change: false,
        character_memory: {
          core_identity: ["Director of Wangsheng"],
          internal_state: {
            primary_emotion: "Amused",
            intensity: "3/5",
            psychological_tension: "He keeps dodging the parlor joke.",
            emotional_decay_counter: 0,
          },
          cognitive_drive: {
            active_agenda: "Learn his name",
            immediate_focus: "The nickname he used",
          },
          cognitive_dissonance: "None",
        },
        user_memory: {
          identity: {
            role_in_story: "The boy who wandered in",
            known_attributes: "Speaks Russian, likes tea",
          },
          relationship_dynamic: {
            trust_level: "Warming",
            dynamic_description: "Curious, not yet devoted",
            unspoken_tension: "He has not said why he came",
          },
          preferences_and_habits: ["tea at night"],
          shared_milestones: ["first chat"],
        },
        topic_plan: {
          actions: [
            {
              action: "create",
              filename: "First Chat.md",
              reason: "Opening conversation",
            },
          ],
        },
      }),
      state(),
    );
    expect(parsed?.kind).toBe("patch");
    if (parsed?.kind !== "patch") return;
    expect(parsed.character.primaryEmotion).toBe("Amused");
    expect(parsed.user.trustLevel).toBe("Warming");
    expect(parsed.topicActions[0]?.filename).toBe("first_chat.md");
    const next = applySoulRouterPatch(state(), parsed);
    expect(next.memoryMd).toContain("Amused");
    expect(next.userMd).toContain("tea at night");
  });

  it("increments decay and softens intensity on the third unused emotion", () => {
    const base = state().character;
    const same = { ...base, primaryEmotion: "Curious", intensity: "3/5" };
    const once = applyEmotionalDecay(base, same);
    expect(once.emotionalDecayCounter).toBe(1);
    const twice = applyEmotionalDecay(once, same);
    const thrice = applyEmotionalDecay(twice, same);
    expect(thrice.emotionalDecayCounter).toBe(0);
    expect(thrice.intensity).toBe("2/5");
    const changed = applyEmotionalDecay(thrice, {
      ...same,
      primaryEmotion: "Amused",
    });
    expect(changed.emotionalDecayCounter).toBe(0);
  });
});
