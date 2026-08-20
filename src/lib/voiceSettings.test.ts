import { describe, expect, it } from "vitest";
import { FURINA_PACK, HU_TAO_PACK } from "./mistress/packs";
import {
  DEFAULT_VOICE_SETTINGS,
  isQwenTtsProvider,
  migrateSplitCloneFields,
  qwenServeDevice,
  seedMistressClonePrompt,
  setMistressClonePrompt,
  setMistressQwenPrompt,
  withMistressVoice,
} from "./voiceSettings";

describe("mistress clone prompt persistence", () => {
  it("keeps a custom Qwen clip transcript across withMistressVoice", () => {
    const custom = "Yeah, this is good, thanks!";
    const saved = setMistressQwenPrompt(
      DEFAULT_VOICE_SETTINGS,
      HU_TAO_PACK.id,
      { qwenPromptText: custom },
    );

    const applied = withMistressVoice(saved, HU_TAO_PACK);

    expect(applied.qwenPromptText).toBe(custom);
    expect(applied.mistressTuning.hu_tao?.qwenPromptText).toBe(custom);
    expect(applied.qwenRefPath).toBe(HU_TAO_PACK.voice.qwenRefPath);
    expect(applied.sovitsRefPath).toBe(HU_TAO_PACK.voice.sovitsRefPath);
  });

  it("keeps a custom SoVITS transcript without touching Qwen", () => {
    const qwen = setMistressQwenPrompt(DEFAULT_VOICE_SETTINGS, HU_TAO_PACK.id, {
      qwenPromptText: "Yeah, this is good, thanks!",
    });
    const saved = setMistressClonePrompt(qwen, HU_TAO_PACK.id, {
      sovitsPromptText: "Longer Hu Tao cutscene line for SoVITS.",
    });

    const applied = withMistressVoice(saved, HU_TAO_PACK);

    expect(applied.qwenPromptText).toBe("Yeah, this is good, thanks!");
    expect(applied.sovitsPromptText).toBe(
      "Longer Hu Tao cutscene line for SoVITS.",
    );
  });

  it("uses pack defaults for another mistress without a saved transcript", () => {
    const saved = setMistressQwenPrompt(
      DEFAULT_VOICE_SETTINGS,
      HU_TAO_PACK.id,
      { qwenPromptText: "Yeah, this is good, thanks!" },
    );

    const furina = withMistressVoice(saved, FURINA_PACK);

    expect(furina.qwenPromptText).toBe(FURINA_PACK.voice.qwenPromptText);
    expect(furina.qwenRefPath).toBe(FURINA_PACK.voice.qwenRefPath);
    expect(furina.sovitsRefPath).toBe(FURINA_PACK.voice.sovitsRefPath);
    expect(furina.mistressTuning.hu_tao?.qwenPromptText).toBe(
      "Yeah, this is good, thanks!",
    );
  });

  it("seeds a legacy top-level Qwen transcript onto the active mistress once", () => {
    const legacy = {
      ...DEFAULT_VOICE_SETTINGS,
      qwenPromptText: "Yeah, this is good, thanks!",
      mistressTuning: {},
    };

    const seeded = seedMistressClonePrompt(legacy, HU_TAO_PACK);
    const applied = withMistressVoice(seeded, HU_TAO_PACK);

    expect(applied.qwenPromptText).toBe("Yeah, this is good, thanks!");
    expect(applied.mistressTuning.hu_tao?.qwenPromptText).toBe(
      "Yeah, this is good, thanks!",
    );

    const again = seedMistressClonePrompt(applied, HU_TAO_PACK);
    expect(again).toBe(applied);
  });
});

describe("migrateSplitCloneFields", () => {
  it("moves a shared ref.wav onto Qwen and opens sovits-ref.wav", () => {
    const next = migrateSplitCloneFields({
      sovitsRefPath: "voice-refs/hu-tao/ref.wav",
      sovitsPromptText: "Yeah, this is good, thanks!",
    });
    expect(next.qwenRefPath).toBe("voice-refs/hu-tao/ref.wav");
    expect(next.qwenPromptText).toBe("Yeah, this is good, thanks!");
    expect(next.sovitsRefPath).toBe("voice-refs/hu-tao/sovits-ref.wav");
    expect(next.sovitsPromptText).toBe("");
  });

  it("keeps already-split fields", () => {
    const next = migrateSplitCloneFields({
      sovitsRefPath: "voice-refs/hu-tao/sovits-ref.wav",
      sovitsPromptText: "Long SoVITS line",
      qwenRefPath: "voice-refs/hu-tao/ref.wav",
      qwenPromptText: "Short Qwen line",
    });
    expect(next.sovitsRefPath).toBe("voice-refs/hu-tao/sovits-ref.wav");
    expect(next.sovitsPromptText).toBe("Long SoVITS line");
    expect(next.qwenRefPath).toBe("voice-refs/hu-tao/ref.wav");
    expect(next.qwenPromptText).toBe("Short Qwen line");
  });
});

describe("qwen RAM engine", () => {
  it("treats qwen-cpu as a Qwen provider on RAM", () => {
    expect(isQwenTtsProvider("qwen")).toBe(true);
    expect(isQwenTtsProvider("qwen-cpu")).toBe(true);
    expect(isQwenTtsProvider("sovits")).toBe(false);
    expect(qwenServeDevice("qwen-cpu")).toBe("cpu");
    expect(qwenServeDevice("qwen")).toBe("cuda");
  });
});
