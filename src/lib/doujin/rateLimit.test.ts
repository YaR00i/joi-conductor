import { describe, expect, it } from "vitest";
import {
  NHENTAI_MIN_GAP_MS,
  NHENTAI_WINDOW_MS,
  isNhentaiRateLimitError,
  isNhentaiTransientStatus,
  nextNhentaiSlotWait,
  nhentaiTransientMessage,
  parseRetryAfterMs,
} from "./rateLimit";

describe("nextNhentaiSlotWait", () => {
  it("blocks a burst even when the minute is otherwise empty", () => {
    expect(nextNhentaiSlotWait([1_000], 1_200)).toBe(NHENTAI_MIN_GAP_MS - 200);
    expect(nextNhentaiSlotWait([], 5_000)).toBe(0);
  });

  it("waits out a full window after the cap", () => {
    const start = 10_000;
    const times = Array.from({ length: 8 }, (_, i) => start + i);
    const wait = nextNhentaiSlotWait(times, start + 50);
    expect(wait).toBeGreaterThanOrEqual(NHENTAI_WINDOW_MS - 50);
  });
});

describe("parseRetryAfterMs", () => {
  it("reads seconds and falls back on empty", () => {
    expect(parseRetryAfterMs("30", 0)).toBe(30_000);
    expect(parseRetryAfterMs("120000", 0)).toBe(120_000);
    expect(parseRetryAfterMs(null, 0)).toBe(75_000);
    expect(parseRetryAfterMs(null, 2)).toBe(115_000);
  });
});

describe("isNhentaiRateLimitError", () => {
  it("matches the client 429 message", () => {
    expect(
      isNhentaiRateLimitError(new Error("nhentai 429 — лимит запросов")),
    ).toBe(true);
    expect(isNhentaiRateLimitError(new Error("HTTP 500"))).toBe(false);
  });
});

describe("nhentai transient HTTP", () => {
  it("retries gateway errors without dumping Cloudflare JSON", () => {
    expect(isNhentaiTransientStatus(429)).toBe(true);
    expect(isNhentaiTransientStatus(502)).toBe(true);
    expect(isNhentaiTransientStatus(500)).toBe(false);
    expect(nhentaiTransientMessage(502)).toContain("Cloudflare");
    expect(nhentaiTransientMessage(502)).not.toContain("developers.cloudflare");
  });
});
