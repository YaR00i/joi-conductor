import { describe, expect, it } from "vitest";
import {
  MEDIA_RANGE_MIN_BYTES,
  MEDIA_STREAM_HEAD_BYTES,
  mediaByteSegments,
  mediaRangeParts,
  mediaStreamHeadEnd,
  parseContentRangeTotal,
  parseHttpRange,
  shouldParallelStreamRange,
  shouldUseRangedDownload,
} from "./mediaRangeParts";

describe("mediaRangeParts", () => {
  it("covers the whole file without gaps or overlap", () => {
    const size = 10_000_000;
    const parts = mediaRangeParts(size, 4);
    expect(parts).toHaveLength(4);
    expect(parts[0]?.start).toBe(0);
    expect(parts.at(-1)?.end).toBe(size - 1);
    let next = 0;
    for (const part of parts) {
      expect(part.start).toBe(next);
      expect(part.end).toBeGreaterThanOrEqual(part.start);
      next = part.end + 1;
    }
    expect(next).toBe(size);
  });

  it("does not split a one-byte file", () => {
    expect(mediaRangeParts(1, 4)).toEqual([{ start: 0, end: 0 }]);
  });
});

describe("parseContentRangeTotal", () => {
  it("reads the size from a 206 Content-Range", () => {
    expect(parseContentRangeTotal("bytes 0-0/12345")).toBe(12345);
    expect(parseContentRangeTotal("bytes 0-1023/8192")).toBe(8192);
    expect(parseContentRangeTotal("bytes 0-0/*")).toBeNull();
    expect(parseContentRangeTotal(null)).toBeNull();
  });
});

describe("parseHttpRange", () => {
  it("treats a missing header as the whole file", () => {
    expect(parseHttpRange(null)).toEqual({ start: 0, end: null });
    expect(parseHttpRange("bytes=0-")).toEqual({ start: 0, end: null });
    expect(parseHttpRange("bytes=100-500")).toEqual({ start: 100, end: 500 });
  });

  it("rejects suffix and multi-range headers", () => {
    expect(parseHttpRange("bytes=-500")).toBeNull();
    expect(parseHttpRange("bytes=0-1,2-3")).toBeNull();
  });
});

describe("media stream slices", () => {
  it("keeps a 2MB head so the player can start while the tail fans out", () => {
    const to = 80 * 1024 * 1024 - 1;
    const headEnd = mediaStreamHeadEnd(0, to);
    expect(headEnd).toBe(MEDIA_STREAM_HEAD_BYTES - 1);
    const tail = mediaByteSegments(headEnd + 1, to, 3);
    expect(tail).toHaveLength(3);
    expect(tail[0]?.start).toBe(MEDIA_STREAM_HEAD_BYTES);
    expect(tail.at(-1)?.end).toBe(to);
  });

  it("does not parallelize Chrome's tiny probe ranges", () => {
    expect(shouldParallelStreamRange(2)).toBe(false);
    expect(shouldParallelStreamRange(4 * 1024 * 1024)).toBe(true);
  });
});

describe("shouldUseRangedDownload", () => {
  it("skips small files", () => {
    expect(shouldUseRangedDownload(MEDIA_RANGE_MIN_BYTES - 1)).toBe(false);
    expect(shouldUseRangedDownload(MEDIA_RANGE_MIN_BYTES)).toBe(true);
  });
});
