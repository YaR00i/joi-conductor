import { describe, expect, it } from "vitest";
import type { CharacterBible } from "../character";
import { applyEmotionalDecay, applySoulRouterPatch, parseSoulRouterOutput } from "./router";
import { buildControlExtractPrompt, buildRouterPrompt } from "./prompts";
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

function stateWithUser(text: string) {
  const next = state();
  next.messages.push({ id: "u1", role: "user", text, atMs: 1 });
  return next;
}

describe("soul router", () => {
  it("writes a classifier prompt, not a character", () => {
    const prompt = buildRouterPrompt(bible, state(), true);
    expect(prompt).toContain("You are a state update classifier.");
    expect(prompt).toContain("Do not roleplay.");
    expect(prompt).toContain("no_significant_change");
    expect(prompt).toContain("Return a delta, not a copy");
    expect(prompt).toContain("explicit durable fact");
    expect(prompt).toContain("explicit hard boundary");
    expect(prompt).not.toMatch(/You are Hu Tao/i);
    const extract = buildControlExtractPrompt(
      bible,
      "надень клетку",
      "Надень клетку на три часа.",
    );
    expect(extract).toContain("Extract only what she actually said.");
    expect(extract).toContain("Do not rewrite the speech.");
    expect(extract).toContain('"op":"set_wear"');
    expect(extract).toContain('"op":"propose_session"');
    expect(extract).toContain("use slow_tease");
    expect(extract).toContain("Never replace op with kind");
  });

  it("honors no_significant_change", () => {
    const parsed = parseSoulRouterOutput(
      '```json\n{"no_significant_change": true}\n```',
      state(),
    );
    expect(parsed).toEqual({ kind: "no_change", diaryEntry: "" });
    const next = applySoulRouterPatch(
      { ...state(), pendingSinceRouter: 4 },
      parsed!,
    );
    expect(next.pendingSinceRouter).toBe(0);
    expect(next.character.primaryEmotion).toBe(state().character.primaryEmotion);
  });

  it("keeps a concrete delta when no_significant_change contradicts it", () => {
    const parsed = parseSoulRouterOutput(
      JSON.stringify({
        no_significant_change: true,
        user_memory: { preferences_and_habits: ["пьёт чай вечером"] },
      }),
      state(),
    );
    expect(parsed?.kind).toBe("patch");
    if (parsed?.kind !== "patch") return;
    expect(parsed.user.preferencesHabits).toContain("пьёт чай вечером");
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

  it("keeps conductor milestones when the router returns a new list", () => {
    const previous = {
      ...state(),
      user: {
        ...state().user,
        sharedMilestones: ["Сессия завершена · Руина"],
      },
    };
    const parsed = parseSoulRouterOutput(
      JSON.stringify({
        no_significant_change: false,
        user_memory: {
          shared_milestones: ["first chat"],
        },
      }),
      previous,
    );
    expect(parsed?.kind).toBe("patch");
    if (parsed?.kind !== "patch") return;
    expect(parsed.user.sharedMilestones).toContain("Сессия завершена · Руина");
    expect(parsed.user.sharedMilestones).toContain("first chat");
  });

  it("keeps everyday habits and strips play lines from preferencesHabits", () => {
    const parsed = parseSoulRouterOutput(
      JSON.stringify({
        no_significant_change: false,
        user_memory: {
          preferences_and_habits: [
            "любит кофе",
            "likes edging",
            "never offer cage",
            "draws at night",
          ],
        },
        stance_updates: [
          {
            subject: "edges",
            kind: "liked",
            evidence: "he said he likes edging",
            explicit: true,
          },
        ],
      }),
      stateWithUser("Я люблю edging"),
    );
    expect(parsed?.kind).toBe("patch");
    if (parsed?.kind !== "patch") return;
    expect(parsed.user.preferencesHabits).toContain("любит кофе");
    expect(parsed.user.preferencesHabits).toContain("draws at night");
    expect(parsed.user.preferencesHabits.join(" ")).not.toMatch(/edging|cage/i);
    expect(
      parsed.user.stances.some(
        (row) => row.kind === "liked" && row.subject === "edges",
      ),
    ).toBe(true);
  });

  it("does not copy a hard boundary into habits", () => {
    const parsed = parseSoulRouterOutput(
      JSON.stringify({
        no_significant_change: false,
        user_memory: {
          preferences_and_habits: ["никогда не предлагай клетку", "coffee in the morning"],
        },
        stance_updates: [
          {
            subject: "cage",
            kind: "hard_boundary",
            evidence: "never offer cage",
            explicit: true,
          },
        ],
      }),
      stateWithUser("Клетка — моя жёсткая граница"),
    );
    expect(parsed?.kind).toBe("patch");
    if (parsed?.kind !== "patch") return;
    expect(parsed.user.preferencesHabits).toEqual(["coffee in the morning"]);
    expect(
      parsed.user.stances.some(
        (row) => row.kind === "hard_boundary" && row.subject === "cage",
      ),
    ).toBe(true);
  });

  it("treats an empty object as no change", () => {
    const previous = state();
    const parsed = parseSoulRouterOutput("{}", previous);
    expect(parsed).toEqual({ kind: "no_change", diaryEntry: "" });
    const next = applySoulRouterPatch(previous, parsed!);
    expect(next.character).toEqual(previous.character);
    expect(next.user).toEqual(previous.user);
    expect(next.memoryMd).toBe(previous.memoryMd);
  });

  it("applies JSON even when the model wraps it in prose", () => {
    const parsed = parseSoulRouterOutput(
      'Sure, here you go:\n{"no_significant_change": true}\nHope this helps.',
      state(),
    );
    expect(parsed).toEqual({ kind: "no_change", diaryEntry: "" });
    const next = applySoulRouterPatch(state(), parsed!);
    expect(next.memoryMd).not.toContain("Hope this helps");
    expect(next.userMd).not.toContain("Sure");
  });

  it("rejects invented stance kinds and hard boundaries without explicit evidence", () => {
    const parsed = parseSoulRouterOutput(
      JSON.stringify({
        no_significant_change: false,
        stance_updates: [
          { subject: "edges", kind: "worships", explicit: true },
          { subject: "cage", kind: "hard_boundary", explicit: false },
        ],
      }),
      stateWithUser("Эджи и клетка"),
    );
    expect(parsed?.kind).toBe("patch");
    if (parsed?.kind !== "patch") return;
    expect(parsed.user.stances).toEqual([]);
  });

  it("rejects stance subjects that are not supported by recent user text", () => {
    const previous = stateWithUser("Привет.");
    const parsed = parseSoulRouterOutput(
      JSON.stringify({
        stance_updates: [
          {
            subject: "edges",
            kind: "liked",
            evidence: "copied example",
            explicit: true,
          },
        ],
      }),
      previous,
    );
    expect(parsed?.kind).toBe("no_change");
    expect(parsed?.rejected).toEqual([
      "stance:edges:no matching user subject",
    ]);
  });

  it("requires a topic action for an explicitly important remembered episode", () => {
    const previous = stateWithUser(
      "Запомни нашу первую встречу, это для меня важно.",
    );
    expect(
      parseSoulRouterOutput(
        JSON.stringify({ diary_entry: "Я запомню эту встречу." }),
        previous,
      ),
    ).toBeNull();
  });
});
