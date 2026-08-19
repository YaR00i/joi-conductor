/**
 * Optional machine EN→RU for on-screen captions (Google → MyMemory).
 * Default UI shows English; call only when captionGoogleRu is on.
 */
export async function translateCaptionGoogleRu(
  english: string,
  opts: {
    signal?: AbortSignal;
    timeoutMs?: number;
  } = {},
): Promise<string> {
  const text = english.trim();
  if (!text) return "";
  if (cyrillicRatio(text) >= 0.45) return text;

  const controller = new AbortController();
  const timeout = window.setTimeout(
    () => controller.abort(),
    opts.timeoutMs ?? 10_000,
  );
  const onOuterAbort = () => controller.abort();
  opts.signal?.addEventListener("abort", onOuterAbort, { once: true });

  try {
    let out = "";
    try {
      out = await translateGoogle(text, controller.signal);
    } catch {
      out = "";
    }
    if (!isGoodRu(text, out)) {
      try {
        out = await translateMyMemory(text, controller.signal);
      } catch {
        /* keep empty */
      }
    }
    return isGoodRu(text, out) ? polishNicknames(out) : text;
  } finally {
    window.clearTimeout(timeout);
    opts.signal?.removeEventListener("abort", onOuterAbort);
  }
}

async function translateGoogle(
  text: string,
  signal: AbortSignal,
): Promise<string> {
  const parts = splitForMt(text, 420);
  const bits: string[] = [];
  for (const part of parts) {
    const url =
      "https://translate.googleapis.com/translate_a/single" +
      `?client=gtx&sl=en&tl=ru&dt=t&q=${encodeURIComponent(part)}`;
    const res = await fetch(url, { signal });
    if (!res.ok) throw new Error(`google MT HTTP ${res.status}`);
    const data: unknown = await res.json();
    bits.push(parseGooglePayload(data));
  }
  return bits.join(" ").replace(/\s+/g, " ").trim();
}

function parseGooglePayload(data: unknown): string {
  if (!Array.isArray(data) || !Array.isArray(data[0])) return "";
  const chunks = data[0] as unknown[];
  const out: string[] = [];
  for (const row of chunks) {
    if (Array.isArray(row) && typeof row[0] === "string") out.push(row[0]);
  }
  return out.join("").trim();
}

async function translateMyMemory(
  text: string,
  signal: AbortSignal,
): Promise<string> {
  const parts = splitForMt(text, 450);
  const bits: string[] = [];
  for (const part of parts) {
    const url =
      "https://api.mymemory.translated.net/get" +
      `?q=${encodeURIComponent(part)}&langpair=en|ru&de=joi-conductor@local`;
    const res = await fetch(url, { signal });
    if (!res.ok) throw new Error(`mymemory HTTP ${res.status}`);
    const data: unknown = await res.json();
    const translated =
      data &&
      typeof data === "object" &&
      (data as { responseData?: { translatedText?: unknown } }).responseData
        ?.translatedText;
    if (typeof translated !== "string" || !translated.trim()) {
      throw new Error("mymemory empty");
    }
    if (/MYMEMORY WARNING/i.test(translated)) throw new Error("mymemory quota");
    bits.push(translated.trim());
  }
  return bits.join(" ").replace(/\s+/g, " ").trim();
}

function splitForMt(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text];
  const sentences = text.match(/[^.!?…]+[.!?…]+|[^.!?…]+$/g) ?? [text];
  const out: string[] = [];
  let buf = "";
  for (const s of sentences) {
    const piece = s.trim();
    if (!piece) continue;
    if ((buf + " " + piece).trim().length <= maxLen) {
      buf = (buf + " " + piece).trim();
    } else {
      if (buf) out.push(buf);
      if (piece.length <= maxLen) buf = piece;
      else {
        for (let i = 0; i < piece.length; i += maxLen) {
          out.push(piece.slice(i, i + maxLen));
        }
        buf = "";
      }
    }
  }
  if (buf) out.push(buf);
  return out.length ? out : [text];
}

function polishNicknames(ru: string): string {
  return ru
    .replace(/\bbunny\b/gi, "зайка")
    .replace(/\bsilly\b/gi, "глупыш")
    .replace(/\bpoor thing\b/gi, "бедняжка")
    .replace(/\bgood boy\b/gi, "хороший мальчик")
    .replace(/\bsweetie\b/gi, "милашка")
    .replace(/\bpathetic\b/gi, "жалкий")
    .replace(/\bглупый\b/gi, "глупыш")
    .replace(/\bкролик\b/gi, "зайка")
    .replace(/\s+/g, " ")
    .trim();
}

function isGoodRu(source: string, out: string): boolean {
  if (!out) return false;
  if (out.toLowerCase() === source.toLowerCase()) return false;
  if (cyrillicRatio(out) < 0.4) return false;
  const srcWords = Math.max(1, source.trim().split(/\s+/).length);
  const outWords = out.trim().split(/\s+/).length;
  if (srcWords >= 4 && outWords < Math.ceil(srcWords * 0.45)) return false;
  return true;
}

function cyrillicRatio(s: string): number {
  const letters = s.replace(/[^\p{L}]/gu, "");
  if (!letters.length) return 0;
  const cy = (letters.match(/\p{Script=Cyrillic}/gu) ?? []).length;
  return cy / letters.length;
}
