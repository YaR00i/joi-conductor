/** Local calendar helpers for contracts. Never add 86_400_000 to hop days. */

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function contractsTodayKey(now = new Date()): string {
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

export function parseContractDayKey(
  dayKey: string,
): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey);
  if (!m) return null;
  const y = Number(m[1]);
  const month = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isInteger(y) || !Number.isInteger(month) || !Number.isInteger(d)) {
    return null;
  }
  if (month < 1 || month > 12 || d < 1 || d > 31) return null;
  return { y, m: month, d };
}

export function endOfLocalDayMs(dayKey: string): number {
  const parsed = parseContractDayKey(dayKey);
  if (!parsed) {
    const [y, m, d] = dayKey.split("-").map(Number);
    return new Date(y!, (m ?? 1) - 1, d ?? 1, 23, 59, 59, 999).getTime();
  }
  return new Date(parsed.y, parsed.m - 1, parsed.d, 23, 59, 59, 999).getTime();
}

/** Shift a YYYY-MM-DD key by whole local calendar days (DST-safe). */
export function addLocalDays(dayKey: string, delta: number): string {
  const parsed = parseContractDayKey(dayKey);
  const y = parsed?.y ?? 1970;
  const m = parsed?.m ?? 1;
  const d = parsed?.d ?? 1;
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + Math.trunc(delta));
  return contractsTodayKey(dt);
}

/**
 * Whole local calendar days from `fromKey` to `toKey`.
 * Uses UTC date-parts so a DST 23h/25h civil day still counts as 1.
 */
export function localCalendarDayDiff(fromKey: string, toKey: string): number {
  const a = parseContractDayKey(fromKey);
  const b = parseContractDayKey(toKey);
  if (!a || !b) return 0;
  const utcA = Date.UTC(a.y, a.m - 1, a.d);
  const utcB = Date.UTC(b.y, b.m - 1, b.d);
  return Math.round((utcB - utcA) / 86_400_000);
}

export function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function contractRng(seed: string): () => number {
  return mulberry32(hashSeed(seed));
}
