import { describe, expect, it } from "vitest";
import {
  MEDIA_QUEUE_MAX,
  MEDIA_QUEUE_MIN,
  snapMediaQueueSize,
} from "./mediaQueue";

describe("mediaQueue", () => {
  it("snaps auto-queue length onto 80–140", () => {
    expect(snapMediaQueueSize(10)).toBe(MEDIA_QUEUE_MIN);
    expect(snapMediaQueueSize(40)).toBe(MEDIA_QUEUE_MIN);
    expect(snapMediaQueueSize(85)).toBe(80);
    expect(snapMediaQueueSize(94)).toBe(90);
    expect(snapMediaQueueSize(140)).toBe(MEDIA_QUEUE_MAX);
    expect(snapMediaQueueSize(400)).toBe(MEDIA_QUEUE_MAX);
    expect(snapMediaQueueSize(Number.NaN)).toBe(MEDIA_QUEUE_MIN);
  });
});
