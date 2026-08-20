import { describe, expect, it } from "vitest";
import {
  audioBufferToVoiceRefWav,
  encodePcm16Wav,
  mixToMono,
  resampleLinear,
} from "./voiceRefWav";

describe("voiceRefWav", () => {
  it("mixes stereo to mono", () => {
    const left = new Float32Array([0, 1]);
    const right = new Float32Array([0, -1]);
    expect(Array.from(mixToMono([left, right]))).toEqual([0, 0]);
  });

  it("resamples linearly", () => {
    const src = new Float32Array([0, 1]);
    const out = resampleLinear(src, 2, 4);
    expect(out.length).toBe(4);
    expect(out[0]).toBeCloseTo(0);
    expect(out[out.length - 1]).toBeCloseTo(1);
  });

  it("writes a RIFF/PCM wav header", () => {
    const wav = encodePcm16Wav(new Float32Array([0, 0.5, -0.5]), 40000);
    const ascii = String.fromCharCode(...wav.subarray(0, 12));
    expect(ascii.startsWith("RIFF")).toBe(true);
    expect(ascii.includes("WAVE")).toBe(true);
    expect(wav.length).toBe(44 + 6);
  });

  it("converts a duck-typed buffer to 40 kHz mono wav", () => {
    const data = new Float32Array(16000).map((_, i) =>
      Math.sin((i / 16000) * Math.PI * 2),
    );
    const { wav, seconds } = audioBufferToVoiceRefWav({
      sampleRate: 16000,
      numberOfChannels: 1,
      getChannelData: () => data,
    });
    expect(seconds).toBeCloseTo(1, 1);
    expect(String.fromCharCode(...wav.subarray(0, 4))).toBe("RIFF");
  });
});
