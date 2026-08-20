import { describe, expect, it } from "vitest";
import {
  DEFAULT_QWEN_VOICE,
  QWEN_TTS_BASE_ID,
  QWEN_TTS_CUSTOM_VOICE_ID,
  inferQwenFlavor,
  migrateQwenModel,
  migrateQwenVoice,
  qwenModelForFlavor,
} from "./qwenTtsCatalog";

describe("qwenTtsCatalog", () => {
  it("maps flavors to official 12Hz 0.6B ids", () => {
    expect(qwenModelForFlavor("custom_voice")).toBe(QWEN_TTS_CUSTOM_VOICE_ID);
    expect(qwenModelForFlavor("base")).toBe(QWEN_TTS_BASE_ID);
  });

  it("migrates retired generic model + Omni voices", () => {
    expect(migrateQwenModel("Qwen/Qwen3-TTS-0.6B")).toBe(
      QWEN_TTS_CUSTOM_VOICE_ID,
    );
    expect(migrateQwenVoice("Cherry")).toBe(DEFAULT_QWEN_VOICE);
    expect(migrateQwenVoice("Dylan")).toBe("Dylan");
  });

  it("infers Base vs CustomVoice from model id", () => {
    expect(inferQwenFlavor(QWEN_TTS_BASE_ID)).toBe("base");
    expect(inferQwenFlavor(QWEN_TTS_CUSTOM_VOICE_ID)).toBe("custom_voice");
    expect(inferQwenFlavor("Qwen/Qwen3-TTS-0.6B")).toBe("custom_voice");
  });
});
