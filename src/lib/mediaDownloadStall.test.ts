import { describe, expect, it, vi } from "vitest";
import {
  createStallTimer,
  MEDIA_IMAGE_STALL_MS,
  MEDIA_VIDEO_STALL_MS,
  mediaDownloadStallMs,
} from "./mediaDownloadStall";

describe("mediaDownloadStallMs", () => {
  it("gives videos a longer stall than photos, not a wall-clock cap", () => {
    expect(mediaDownloadStallMs("image")).toBe(MEDIA_IMAGE_STALL_MS);
    expect(mediaDownloadStallMs("video")).toBe(MEDIA_VIDEO_STALL_MS);
    expect(mediaDownloadStallMs("gif")).toBe(MEDIA_VIDEO_STALL_MS);
    expect(MEDIA_VIDEO_STALL_MS).toBeGreaterThan(MEDIA_IMAGE_STALL_MS);
  });
});

describe("createStallTimer", () => {
  it("fires only after a quiet stretch, and ping postpones it", () => {
    vi.useFakeTimers();
    const onStall = vi.fn();
    const stall = createStallTimer({ stallMs: 1_000, onStall });
    vi.advanceTimersByTime(900);
    stall.ping();
    vi.advanceTimersByTime(900);
    expect(onStall).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(onStall).toHaveBeenCalledTimes(1);
    stall.clear();
    vi.useRealTimers();
  });
});
