export const NHENTAI_WINDOW_MS = 60_000;
/** Hard cap inside the rolling minute — search allows ~20, favorites 429 earlier. */
export const NHENTAI_MAX_REQ = 8;
/** No burst: 15 back-to-back pages is what tripped 429. */
export const NHENTAI_MIN_GAP_MS = 3_500;

const timestamps: number[] = [];

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, Math.max(0, ms));
  });
}

/** How long to wait before the next request, given timestamps of recent ones. */
export function nextNhentaiSlotWait(
  times: readonly number[],
  now: number,
  opts?: { maxReq?: number; minGapMs?: number; windowMs?: number },
): number {
  const windowMs = opts?.windowMs ?? NHENTAI_WINDOW_MS;
  const maxReq = opts?.maxReq ?? NHENTAI_MAX_REQ;
  const minGapMs = opts?.minGapMs ?? NHENTAI_MIN_GAP_MS;
  const fresh = times.filter((t) => now - t < windowMs);
  let wait = 0;
  const last = times.length > 0 ? times[times.length - 1]! : null;
  if (last != null) wait = Math.max(wait, minGapMs - (now - last));
  if (fresh.length >= maxReq) {
    const oldest = fresh[0]!;
    wait = Math.max(wait, windowMs - (now - oldest) + 25);
  }
  return Math.max(0, wait);
}

/** Retry-After is seconds; some stacks send milliseconds. */
export function parseRetryAfterMs(
  header: string | null | undefined,
  attempt: number,
): number {
  const raw = (header ?? "").trim();
  const n = Number(raw);
  if (raw !== "" && Number.isFinite(n) && n >= 0) {
    const ms = n > 0 && n < 1_000 ? n * 1000 : n;
    return Math.min(180_000, Math.max(15_000, ms));
  }
  return Math.min(180_000, 75_000 + Math.max(0, attempt) * 20_000);
}

export function isNhentaiRateLimitError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes("429");
}

export function isNhentaiTransientStatus(status: number): boolean {
  return status === 429 || status === 502 || status === 503 || status === 504;
}

export function nhentaiTransientMessage(status: number): string {
  switch (status) {
    case 429:
      return "nhentai 429 — лимит запросов. Подожди минуту и повтори.";
    case 502:
      return "nhentai 502 — шлюз Cloudflare. Подожди и продолжи синхронизацию.";
    case 503:
      return "nhentai 503 — сайт перегружен. Подожди и продолжи синхронизацию.";
    case 504:
      return "nhentai 504 — сайт не ответил вовремя. Подожди и продолжи синхронизацию.";
    default:
      return `nhentai HTTP ${status}`;
  }
}

/** ~8 requests / 60s with a 3.5s floor between calls. */
export async function awaitNhentaiSlot(): Promise<void> {
  for (;;) {
    const now = Date.now();
    while (timestamps.length > 0 && now - timestamps[0]! >= NHENTAI_WINDOW_MS) {
      timestamps.shift();
    }
    const wait = nextNhentaiSlotWait(timestamps, now);
    if (wait <= 0) {
      timestamps.push(Date.now());
      return;
    }
    await sleep(wait);
  }
}
