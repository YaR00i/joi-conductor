import { describe, expect, it } from "vitest";
import {
  isQwenBaseModel,
  pickQwenServeBackend,
  qwenDeviceMatches,
  qwenLanguageName,
  qwenMaxNewTokens,
  resolveQwenServeDevice,
} from "./qwenLaunch.mjs";

describe("qwenLanguageName", () => {
  it("maps session codes to qwen-tts language strings", () => {
    expect(qwenLanguageName("en")).toBe("English");
    expect(qwenLanguageName("ru")).toBe("Russian");
    expect(qwenLanguageName("zh")).toBe("Chinese");
    expect(qwenLanguageName("ja")).toBe("Japanese");
    expect(qwenLanguageName("ko")).toBe("Korean");
    expect(qwenLanguageName("auto")).toBe("Auto");
    expect(qwenLanguageName("")).toBe("English");
  });
});

describe("pickQwenServeBackend", () => {
  it("prefers vLLM when present, else qwen-tts", () => {
    expect(pickQwenServeBackend({ hasVllm: true, hasQwenTts: true })).toBe(
      "vllm",
    );
    expect(pickQwenServeBackend({ hasVllm: false, hasQwenTts: true })).toBe(
      "qwen-tts",
    );
    expect(pickQwenServeBackend({ hasVllm: false, hasQwenTts: false })).toBe(
      "none",
    );
  });

  it("never uses vLLM for the RAM engine", () => {
    expect(
      pickQwenServeBackend({
        hasVllm: true,
        hasQwenTts: true,
        device: "cpu",
      }),
    ).toBe("qwen-tts");
  });
});

describe("resolveQwenServeDevice", () => {
  it("maps qwen-cpu / ram onto cpu", () => {
    expect(resolveQwenServeDevice("cpu")).toBe("cpu");
    expect(resolveQwenServeDevice("qwen-cpu")).toBe("cpu");
    expect(resolveQwenServeDevice("ram")).toBe("cpu");
    expect(resolveQwenServeDevice("cuda")).toBe("cuda");
    expect(resolveQwenServeDevice("")).toBe("cuda");
  });
});

describe("qwenDeviceMatches", () => {
  it("restarts when CUDA server is asked to move to RAM", () => {
    expect(qwenDeviceMatches("cuda", "cpu")).toBe(false);
    expect(qwenDeviceMatches("cpu", "cpu")).toBe(true);
    expect(qwenDeviceMatches("cuda", "cuda")).toBe(true);
    expect(qwenDeviceMatches("", "cuda")).toBe(true);
    expect(qwenDeviceMatches("", "cpu")).toBe(false);
  });
});

describe("qwenMaxNewTokens", () => {
  it("caps short lines so generate cannot wander", () => {
    expect(qwenMaxNewTokens("Hi")).toBe(40);
    expect(qwenMaxNewTokens("Yeah, this is good, thanks!")).toBe(78);
    expect(qwenMaxNewTokens("x".repeat(400))).toBe(192);
  });
});

describe("isQwenBaseModel", () => {
  it("detects Base ids and skips CustomVoice", () => {
    expect(isQwenBaseModel("Qwen/Qwen3-TTS-12Hz-0.6B-Base")).toBe(true);
    expect(isQwenBaseModel("C:\\\\weights\\\\0.6B-Base")).toBe(true);
    expect(isQwenBaseModel("Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice")).toBe(
      false,
    );
    expect(isQwenBaseModel("")).toBe(false);
  });
});
