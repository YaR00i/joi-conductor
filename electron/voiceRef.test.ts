import { mkdtempSync, mkdirSync, rmSync, existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  normalizeVoiceRefRel,
  resolveVoiceRefShowPath,
  statVoiceRef,
  writeVoiceRefWav,
} from "./voiceRef.mjs";

describe("voiceRef paths", () => {
  it("only allows canonical voice-refs/<slug>/{ref,sovits-ref}.wav", () => {
    expect(normalizeVoiceRefRel("voice-refs/hu-tao/ref.wav")).toBe(
      "voice-refs/hu-tao/ref.wav",
    );
    expect(normalizeVoiceRefRel("voice-refs\\HU-TAO\\ref.wav")).toBe(
      "voice-refs/hu-tao/ref.wav",
    );
    expect(normalizeVoiceRefRel("voice-refs/hu-tao/sovits-ref.wav")).toBe(
      "voice-refs/hu-tao/sovits-ref.wav",
    );
    expect(normalizeVoiceRefRel("voice-refs\\HU-TAO\\sovits-ref.wav")).toBe(
      "voice-refs/hu-tao/sovits-ref.wav",
    );
    expect(normalizeVoiceRefRel("voice-refs/hu-tao/../furina/ref.wav")).toBe(
      null,
    );
    expect(normalizeVoiceRefRel("C:\\\\tmp\\\\ref.wav")).toBe(null);
    expect(normalizeVoiceRefRel("voice-refs/hu-tao/other.wav")).toBe(null);
  });

  it("resolves relative show paths under the project root", () => {
    const root = "C:\\\\proj";
    const abs = resolveVoiceRefShowPath(root, "voice-refs/hu-tao/ref.wav");
    expect(abs?.replace(/\\/g, "/")).toMatch(/voice-refs\/hu-tao\/ref\.wav$/);
    expect(resolveVoiceRefShowPath(root, "../secret")).toBe(null);
  });

  it("writes a wav only to the canonical dest", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "joi-vref-"));
    try {
      mkdirSync(path.join(dir, "voice-refs", "hu-tao"), { recursive: true });
      const wav = Buffer.alloc(64, 0);
      wav.write("RIFF", 0);
      wav.write("WAVE", 8);
      const b64 = wav.toString("base64");
      const bad = writeVoiceRefWav(dir, "voice-refs/nope/ref.wav", b64);
      expect(bad.ok).toBe(false);
      const ok = writeVoiceRefWav(dir, "voice-refs/hu-tao/ref.wav", b64);
      expect(ok.ok).toBe(true);
      expect(existsSync(path.join(dir, "voice-refs", "hu-tao", "ref.wav"))).toBe(
        true,
      );
      const okSovits = writeVoiceRefWav(
        dir,
        "voice-refs/hu-tao/sovits-ref.wav",
        b64,
      );
      expect(okSovits.ok).toBe(true);
      expect(
        existsSync(path.join(dir, "voice-refs", "hu-tao", "sovits-ref.wav")),
      ).toBe(true);
      expect(statVoiceRef(dir, "voice-refs/hu-tao/ref.wav").exists).toBe(true);
      expect(statVoiceRef(dir, "voice-refs/hu-tao/sovits-ref.wav").exists).toBe(
        true,
      );
      expect(statVoiceRef(dir, "voice-refs/furina/ref.wav").exists).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
