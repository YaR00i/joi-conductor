import { describe, expect, it } from "vitest";
import {
  dialogueUseOf,
  parseActionScript,
  playDialogueHeadless,
  resolveQuestMarkerIconId,
  resolveScriptRef,
  runActionScriptSync,
} from "./emberScript";
import type { EmberActionScript, EmberScene } from "./types";

const talkScene: EmberScene = {
  id: "hi",
  nameRu: "Привет",
  use: "talk",
  startStepId: "a",
  steps: [
    {
      id: "a",
      type: "dialogue",
      speaker: "npc",
      portraitKey: "neutral",
      textRu: "Эй.",
      next: "b",
    },
    {
      id: "b",
      type: "dialogue",
      speaker: "npc",
      portraitKey: "neutral",
      textRu: "Не стой на дороге.",
      next: "end",
    },
    { id: "end", type: "end" },
  ],
};

const branchScene: EmberScene = {
  id: "branch",
  nameRu: "Ветка",
  use: "talk",
  startStepId: "ask",
  steps: [
    {
      id: "ask",
      type: "choice",
      promptRu: "Как дела?",
      options: [
        { id: "ok", labelRu: "Нормально.", next: "ok_r" },
        { id: "bad", labelRu: "Плохо.", next: "bad_r" },
      ],
    },
    {
      id: "ok_r",
      type: "dialogue",
      speaker: "npc",
      portraitKey: "neutral",
      textRu: "Тогда иди.",
      next: "end",
    },
    {
      id: "bad_r",
      type: "dialogue",
      speaker: "npc",
      portraitKey: "neutral",
      textRu: "Держись.",
      next: "end",
    },
    { id: "end", type: "end" },
  ],
};

describe("emberScript", () => {
  it("parses an action list and defaults missing scene use to cutscene", () => {
    const script = parseActionScript({
      id: "chain",
      nameRu: "Цепочка",
      steps: [
        { type: "talk", dialogueId: "hi" },
        { type: "give_item", itemId: "coin", count: 2 },
        { type: "set_flag", flag: "done", value: true },
        { type: "wait", sec: 0.2 },
      ],
    });
    expect(script?.steps).toHaveLength(4);
    expect(dialogueUseOf({ id: "x", nameRu: "x", startStepId: "a", steps: [] })).toBe(
      "cutscene",
    );
    expect(dialogueUseOf(talkScene)).toBe("talk");
  });

  it("resolves scriptId to a script first, then a dialogue graph", () => {
    const script: EmberActionScript = {
      id: "chain",
      nameRu: "Цепочка",
      steps: [{ type: "talk", dialogueId: "hi" }],
    };
    expect(
      resolveScriptRef({ chain: script }, { hi: talkScene }, "chain")?.kind,
    ).toBe("script");
    expect(
      resolveScriptRef({}, { hi: talkScene }, "hi")?.kind,
    ).toBe("dialogue");
    expect(resolveScriptRef({}, {}, "missing")).toBeNull();
  });

  it("plays talk and picks the first branch headless", () => {
    expect(playDialogueHeadless(talkScene).lines).toEqual([
      "Эй.",
      "Не стой на дороге.",
    ]);
    const branch = playDialogueHeadless(branchScene);
    expect(branch.choices).toHaveLength(2);
    expect(branch.picked).toBe("ok");
    expect(branch.lines).toEqual(["Тогда иди."]);
  });

  it("runs give_item / set_flag / nested talk", () => {
    const script: EmberActionScript = {
      id: "chain",
      nameRu: "Цепочка",
      steps: [
        { type: "talk", dialogueId: "hi" },
        { type: "give_item", itemId: "coin", count: 2 },
        { type: "set_flag", flag: "sandbox_chain_done", value: true },
      ],
    };
    const result = runActionScriptSync(script, {
      scenes: { hi: talkScene },
      items: {
        coin: {
          id: "coin",
          nameRu: "Монета",
          kind: "material",
          slot: "none",
          rarity: "common",
          stackMax: 99,
          useIn: "both",
        },
      },
    });
    expect(result.dialogues[0]?.lines).toEqual([
      "Эй.",
      "Не стой на дороге.",
    ]);
    expect(result.inventory.coin).toBe(2);
    expect(result.flags.sandbox_chain_done).toBe(true);
  });

  it("picks quest icons by status and keeps the quest alias", () => {
    const icons = {
      quest_available: {
        id: "quest_available",
        size: 16,
        pixels: Array.from({ length: 256 }, () => ""),
      },
      quest_active: {
        id: "quest_active",
        size: 16,
        pixels: Array.from({ length: 256 }, () => ""),
      },
      quest_done: {
        id: "quest_done",
        size: 16,
        pixels: Array.from({ length: 256 }, () => ""),
      },
    };
    expect(
      resolveQuestMarkerIconId({ kind: "quest_marker", iconId: "quest" }, icons),
    ).toBe("quest_available");
    expect(
      resolveQuestMarkerIconId(
        { kind: "quest_marker", questStatus: "active" },
        icons,
      ),
    ).toBe("quest_active");
    expect(
      resolveQuestMarkerIconId(
        { kind: "quest_marker", questStatus: "done", scriptId: "q" },
        icons,
        { q: "done" },
      ),
    ).toBe("quest_done");
  });
});
