import { describe, expect, it } from "vitest";
import {
  wantsQwenAutoStart,
  wantsSovitsAutoStart,
} from "./ttsEngineAutoStart";

describe("ttsEngineAutoStart", () => {
  it("starts SoVITS on sovits and auto when enabled", () => {
    expect(
      wantsSovitsAutoStart({
        ttsEnabled: true,
        autoStartSovits: true,
        ttsProvider: "sovits",
      }),
    ).toBe(true);
    expect(
      wantsSovitsAutoStart({
        ttsEnabled: true,
        autoStartSovits: true,
        ttsProvider: "auto",
      }),
    ).toBe(true);
    expect(
      wantsSovitsAutoStart({
        ttsEnabled: true,
        autoStartSovits: true,
        ttsProvider: "qwen",
      }),
    ).toBe(false);
  });

  it("starts Qwen only when Qwen is the selected engine", () => {
    expect(
      wantsQwenAutoStart({
        ttsEnabled: true,
        autoStartQwen: true,
        ttsProvider: "qwen",
      }),
    ).toBe(true);
    expect(
      wantsQwenAutoStart({
        ttsEnabled: true,
        autoStartQwen: true,
        ttsProvider: "qwen-cpu",
      }),
    ).toBe(true);
    expect(
      wantsQwenAutoStart({
        ttsEnabled: true,
        autoStartQwen: true,
        ttsProvider: "auto",
      }),
    ).toBe(false);
    expect(
      wantsQwenAutoStart({
        ttsEnabled: true,
        autoStartQwen: true,
        ttsProvider: "piper",
      }),
    ).toBe(false);
  });
});
