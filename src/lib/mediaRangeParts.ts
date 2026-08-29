export const MEDIA_RANGE_MIN_BYTES = 8 * 1024 * 1024;
export const MEDIA_RANGE_PART_COUNT = 4;
/** First slice of a player stream — enough for moov + a few seconds. */
export const MEDIA_STREAM_HEAD_BYTES = 2 * 1024 * 1024;
export const MEDIA_STREAM_TAIL_PARTS = 3;
/** Don't split tiny Range probes (Chrome `bytes=0-1`). */
export const MEDIA_PARALLEL_STREAM_MIN_BYTES = 4 * 1024 * 1024;

export type ByteRange = {
  start: number;
  end: number;
};

export type HttpByteRange = {
  start: number;
  end: number | null;
};

/** Inclusive byte ranges covering `[0, size)`. */
export function mediaRangeParts(
  size: number,
  partCount = MEDIA_RANGE_PART_COUNT,
): ByteRange[] {
  if (!Number.isFinite(size) || size < 1) return [];
  const n = Math.min(
    Math.max(1, Math.floor(partCount)),
    Math.floor(size),
  );
  const parts: ByteRange[] = [];
  const chunk = Math.floor(size / n);
  for (let i = 0; i < n; i += 1) {
    const start = i * chunk;
    const end = i === n - 1 ? size - 1 : start + chunk - 1;
    parts.push({ start, end });
  }
  return parts;
}

/** Map `mediaRangeParts` onto `[from, to]`. */
export function mediaByteSegments(
  from: number,
  to: number,
  partCount: number,
): ByteRange[] {
  if (to < from) return [];
  return mediaRangeParts(to - from + 1, partCount).map((part) => ({
    start: part.start + from,
    end: part.end + from,
  }));
}

export function parseContentRangeTotal(header: string | null): number | null {
  if (!header) return null;
  const match = /\/(\d+)\s*$/.exec(header.trim());
  if (!match) return null;
  const total = Number(match[1]);
  return Number.isFinite(total) && total > 0 ? total : null;
}

export function parseHttpRange(
  header: string | null | undefined,
): HttpByteRange | null {
  if (header == null || !header.trim()) {
    return { start: 0, end: null };
  }
  const match = /^bytes=(\d+)-(\d+)?\s*$/i.exec(header.trim());
  if (!match) return null;
  const start = Number(match[1]);
  const end = match[2] != null ? Number(match[2]) : null;
  if (!Number.isFinite(start) || start < 0) return null;
  if (end != null && (!Number.isFinite(end) || end < start)) return null;
  return { start, end };
}

export function shouldUseRangedDownload(size: number): boolean {
  return Number.isFinite(size) && size >= MEDIA_RANGE_MIN_BYTES;
}

export function shouldParallelStreamRange(span: number): boolean {
  return Number.isFinite(span) && span >= MEDIA_PARALLEL_STREAM_MIN_BYTES;
}

/**
 * Head slice for the player, then equal tail parts for the rest of `[from, to]`.
 * The first fetch is started by the proxy; tails run in parallel with it.
 */
export function mediaStreamHeadEnd(
  from: number,
  to: number,
  headBytes = MEDIA_STREAM_HEAD_BYTES,
): number {
  if (to < from) return from;
  return Math.min(to, from + Math.max(1, headBytes) - 1);
}
