export const MAX_SPRITE_ANIM_FRAMES = 12;
export const DEFAULT_SPRITE_FRAME_MS = 120;
export const MIN_SPRITE_FRAME_MS = 40;
export const MAX_SPRITE_FRAME_MS = 2000;

export function newSpriteFrameId(): string {
  return `frm_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function clampSpriteFrameDuration(raw: unknown): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_SPRITE_FRAME_MS;
  return Math.max(
    MIN_SPRITE_FRAME_MS,
    Math.min(MAX_SPRITE_FRAME_MS, Math.round(n)),
  );
}

export type SpriteFrameRange = { start: number; end: number };

export function normalizeSpriteFrameRange(
  length: number,
  startRaw: number,
  endRaw: number,
): SpriteFrameRange {
  const last = Math.max(0, Math.floor(length) - 1);
  const start = Math.max(0, Math.min(last, Math.floor(startRaw) || 0));
  const end = Math.max(start, Math.min(last, Math.floor(endRaw) || 0));
  return { start, end };
}

/** Returns the next preview index, or -1 when a non-looping range is done. */
export function nextSpritePreviewIndex(
  length: number,
  current: number,
  startRaw: number,
  endRaw: number,
  loop: boolean,
): number {
  if (length <= 0) return -1;
  const { start, end } = normalizeSpriteFrameRange(length, startRaw, endRaw);
  if (current < start || current > end) return start;
  if (current < end) return current + 1;
  return loop ? start : -1;
}

/** Looping index into a duration list. Empty list → 0. */
export function spriteFrameIndexAt(
  durationsMs: readonly number[],
  elapsedMs: number,
): number {
  if (durationsMs.length <= 1) return 0;
  let total = 0;
  for (const d of durationsMs) total += Math.max(1, d);
  if (total <= 0) return 0;
  let t = ((elapsedMs % total) + total) % total;
  for (let i = 0; i < durationsMs.length; i++) {
    t -= Math.max(1, durationsMs[i]!);
    if (t < 0) return i;
  }
  return durationsMs.length - 1;
}
