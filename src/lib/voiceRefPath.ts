import type { MistressId } from "./mistress/types";

/** Canonical on-disk folder names under `voice-refs/`. */
export function voiceRefSlug(id: MistressId): string {
  switch (id) {
    case "hu_tao":
      return "hu-tao";
    case "furina":
      return "furina";
    case "sunna":
      return "sunna";
    case "sparkle":
      return "sparkle";
    default: {
      const _exhaustive: never = id;
      return _exhaustive;
    }
  }
}

/** Qwen Base clone clip (~3 s). */
export function voiceRefRelPath(id: MistressId): string {
  return `voice-refs/${voiceRefSlug(id)}/ref.wav`;
}

/** GPT-SoVITS zero-shot ref (4–10 s). */
export function sovitsRefRelPath(id: MistressId): string {
  return `voice-refs/${voiceRefSlug(id)}/sovits-ref.wav`;
}

export const VOICE_REF_SAMPLE_RATE = 40_000;

/** Qwen Base ICL / xvec: a short spoken line is enough. */
export const QWEN_REF_MAX_SECONDS = 3;

/** SoVITS degrades below ~4 s and on clips longer than ~10 s. */
export const SOVITS_REF_MIN_SECONDS = 4;
export const SOVITS_REF_MAX_SECONDS = 10;

/** Default clip cap (SoVITS). Prefer engine-specific constants at the call site. */
export const VOICE_REF_MAX_SECONDS = SOVITS_REF_MAX_SECONDS;

const QWEN_REF_FILE = /\/ref\.wav$/i;
const SOVITS_REF_FILE = /\/sovits-ref\.wav$/i;

export function isQwenRefRel(rel: string): boolean {
  const n = rel.replace(/\\/g, "/");
  return QWEN_REF_FILE.test(n) && !SOVITS_REF_FILE.test(n);
}

export function isSovitsRefRel(rel: string): boolean {
  return SOVITS_REF_FILE.test(rel.replace(/\\/g, "/"));
}

export function maxSecondsForVoiceRef(destRel: string): number {
  return isSovitsRefRel(destRel) ? SOVITS_REF_MAX_SECONDS : QWEN_REF_MAX_SECONDS;
}

/** Legacy shared `…/ref.wav` → dedicated SoVITS file next to it. */
export function sovitsRefFromLegacyQwenPath(rel: string): string {
  const n = rel.replace(/\\/g, "/");
  if (QWEN_REF_FILE.test(n) && !SOVITS_REF_FILE.test(n)) {
    return n.replace(/\/ref\.wav$/i, "/sovits-ref.wav");
  }
  return n;
}
