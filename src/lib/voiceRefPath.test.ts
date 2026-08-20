import { describe, expect, it } from "vitest";
import {
  isQwenRefRel,
  isSovitsRefRel,
  maxSecondsForVoiceRef,
  sovitsRefFromLegacyQwenPath,
  sovitsRefRelPath,
  voiceRefRelPath,
  voiceRefSlug,
} from "./voiceRefPath";

describe("voiceRefPath", () => {
  it("maps mistress ids to separate Qwen and SoVITS wavs", () => {
    expect(voiceRefSlug("hu_tao")).toBe("hu-tao");
    expect(voiceRefRelPath("hu_tao")).toBe("voice-refs/hu-tao/ref.wav");
    expect(sovitsRefRelPath("hu_tao")).toBe("voice-refs/hu-tao/sovits-ref.wav");
    expect(voiceRefRelPath("furina")).toBe("voice-refs/furina/ref.wav");
    expect(sovitsRefRelPath("sparkle")).toBe(
      "voice-refs/sparkle/sovits-ref.wav",
    );
  });

  it("caps Qwen clips at 3s and SoVITS at 10s", () => {
    expect(isQwenRefRel("voice-refs/hu-tao/ref.wav")).toBe(true);
    expect(isQwenRefRel("voice-refs/hu-tao/sovits-ref.wav")).toBe(false);
    expect(isSovitsRefRel("voice-refs/hu-tao/sovits-ref.wav")).toBe(true);
    expect(maxSecondsForVoiceRef("voice-refs/hu-tao/ref.wav")).toBe(3);
    expect(maxSecondsForVoiceRef("voice-refs/hu-tao/sovits-ref.wav")).toBe(10);
    expect(sovitsRefFromLegacyQwenPath("voice-refs/hu-tao/ref.wav")).toBe(
      "voice-refs/hu-tao/sovits-ref.wav",
    );
  });
});
