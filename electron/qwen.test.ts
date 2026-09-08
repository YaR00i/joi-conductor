import { describe, expect, it } from "vitest";
import { qwenSynthesisMetrics, wavDurationSeconds } from "./qwen.mjs";

function pcmWav(seconds: number, sampleRate = 24_000): Buffer {
  const dataBytes = Math.round(seconds * sampleRate * 2);
  const out = Buffer.alloc(44 + dataBytes);
  out.write("RIFF", 0, "ascii");
  out.writeUInt32LE(36 + dataBytes, 4);
  out.write("WAVE", 8, "ascii");
  out.write("fmt ", 12, "ascii");
  out.writeUInt32LE(16, 16);
  out.writeUInt16LE(1, 20);
  out.writeUInt16LE(1, 22);
  out.writeUInt32LE(sampleRate, 24);
  out.writeUInt32LE(sampleRate * 2, 28);
  out.writeUInt16LE(2, 32);
  out.writeUInt16LE(16, 34);
  out.write("data", 36, "ascii");
  out.writeUInt32LE(dataBytes, 40);
  return out;
}

describe("Qwen synthesis metrics", () => {
  it("reads PCM duration and bundled server timing headers", () => {
    const wav = pcmWav(2);
    expect(wavDurationSeconds(wav)).toBe(2);
    expect(
      qwenSynthesisMetrics(
        {
          "x-joi-generation-ms": "800",
          "x-joi-audio-seconds": "2.000",
          "x-joi-realtime-x": "2.500",
          "x-joi-backend": "qwen_tts",
          "x-joi-device": "cuda",
        },
        950,
        wav,
      ),
    ).toEqual({
      generationMs: 800,
      audioSeconds: 2,
      realtimeX: 2.5,
      backend: "qwen_tts",
      device: "cuda",
    });
  });

  it("falls back to request wall time and WAV metadata", () => {
    const metrics = qwenSynthesisMetrics({}, 1000, pcmWav(2));
    expect(metrics.generationMs).toBe(1000);
    expect(metrics.audioSeconds).toBe(2);
    expect(metrics.realtimeX).toBe(2);
  });
});
