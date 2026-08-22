import type { Emotion } from "../types";

const EMOTIONS: Emotion[] = [
  "neutral",
  "tease",
  "strict",
  "amused",
  "intense",
  "soft",
];

export type ParsedSpeech = {
  text: string;
  emotion: Emotion;
  gesture?: string;
};

/** Pull OpenAI-compat message content (string or multimodal parts). */
export function extractChatContent(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const choices = (data as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) return null;
  const message = (choices[0] as { message?: { content?: unknown } })?.message;
  const content = message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const parts = content
      .map((part) => {
        if (typeof part === "string") return part;
        if (!part || typeof part !== "object") return "";
        const rec = part as { type?: unknown; text?: unknown };
        const type = typeof rec.type === "string" ? rec.type : "";
        if (/^(thinking|reasoning|reason)$/i.test(type)) return "";
        if (typeof rec.text === "string") return rec.text;
        return "";
      })
      .filter(Boolean);
    return parts.length > 0 ? parts.join("\n") : null;
  }
  return null;
}

function stripFences(raw: string): string {
  return raw
    .replace(/^\s*```(?:json|JSON)?\s*/u, "")
    .replace(/\s*```\s*$/u, "")
    .trim();
}

function normalizeQuotes(raw: string): string {
  return raw
    .replace(/[\u201C\u201D\u00AB\u00BB]/gu, '"')
    .replace(/[\u2018\u2019]/gu, "'");
}

/** Balanced `{ ... }` starting at `start` index. */
function extractJsonObjectAt(raw: string, start: number): string | null {
  if (raw[start] !== "{") return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < raw.length; i++) {
    const ch = raw[i]!;
    if (inString) {
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === "\\") {
        escape = true;
        continue;
      }
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return raw.slice(start, i + 1);
    }
  }
  return null;
}

function emotionFrom(value: unknown): Emotion {
  return typeof value === "string" && EMOTIONS.includes(value as Emotion)
    ? (value as Emotion)
    : "tease";
}

function gestureFrom(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function speechFromParsed(parsed: {
  text?: unknown;
  emotion?: unknown;
  gesture?: unknown;
  response?: unknown;
  message?: unknown;
}): ParsedSpeech | null {
  const textCandidate =
    typeof parsed.text === "string"
      ? parsed.text
      : typeof parsed.response === "string"
        ? parsed.response
        : typeof parsed.message === "string"
          ? parsed.message
          : null;
  if (!textCandidate?.trim()) return null;
  // Reject if "text" is itself a JSON blob
  const cleaned = textCandidate.trim();
  if (/^\s*\{/.test(cleaned) && /"emotion"\s*:/.test(cleaned)) {
    const nested = parseLlmContent(cleaned);
    if (nested) return nested;
  }
  return {
    text: cleaned.slice(0, 320),
    emotion: emotionFrom(parsed.emotion),
    gesture: gestureFrom(parsed.gesture),
  };
}

/** Regex fallback when JSON.parse fails (unescaped quotes/newlines in model output). */
function extractFieldsLoose(raw: string): ParsedSpeech | null {
  const textMatch =
    raw.match(/"text"\s*:\s*"((?:\\.|[^"\\])*)"/u) ??
    raw.match(/"text"\s*:\s*'((?:\\.|[^'\\])*)'/u) ??
    raw.match(/"text"\s*:\s*"([\s\S]*?)"\s*,\s*"(?:emotion|gesture)"/u);

  const textRaw = textMatch?.[1];
  if (!textRaw) return null;

  const text = textRaw
    .replace(/\\n/g, "\n")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return null;

  const emotionMatch = raw.match(/"emotion"\s*:\s*"([^"]+)"/u);
  const gestureMatch = raw.match(/"gesture"\s*:\s*"([^"]+)"/u);

  return {
    text: text.slice(0, 320),
    emotion: emotionFrom(emotionMatch?.[1]),
    gesture: gestureFrom(gestureMatch?.[1]),
  };
}

function looksLikeSpeechJson(raw: string): boolean {
  return /"text"\s*:/u.test(raw) && raw.includes("{");
}

/**
 * Try every `{` — models often echo example JSON then the real object.
 * Prefer the last valid object that has a speech `text` field.
 */
function parseAllJsonObjects(raw: string): ParsedSpeech | null {
  let best: ParsedSpeech | null = null;
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] !== "{") continue;
    const slice = extractJsonObjectAt(raw, i);
    if (!slice) continue;
    try {
      const parsed = JSON.parse(slice) as {
        text?: unknown;
        emotion?: unknown;
        gesture?: unknown;
        response?: unknown;
        message?: unknown;
      };
      const speech = speechFromParsed(parsed);
      if (speech) best = speech;
    } catch {
      // skip invalid slice
    }
  }
  return best;
}

/**
 * Parse LLM reply into speech. Never surface raw JSON as the spoken line.
 */
export function parseLlmContent(raw: string): ParsedSpeech | null {
  const trimmed = stripFences(normalizeQuotes(raw.trim()));
  if (!trimmed) return null;

  // Whole string is one JSON object
  try {
    const parsed = JSON.parse(trimmed) as {
      text?: unknown;
      emotion?: unknown;
      gesture?: unknown;
      response?: unknown;
      message?: unknown;
    };
    const speech = speechFromParsed(parsed);
    if (speech) return speech;
  } catch {
    // continue
  }

  const fromObjects = parseAllJsonObjects(trimmed);
  if (fromObjects) return fromObjects;

  const loose = extractFieldsLoose(trimmed);
  if (loose) return loose;

  // Do not show raw JSON blobs as dialogue
  if (looksLikeSpeechJson(trimmed)) {
    return extractFieldsLoose(raw);
  }

  // Plain prose reply
  if (trimmed.length > 0 && !trimmed.startsWith("{")) {
    return {
      text: trimmed.slice(0, 320),
      emotion: "tease",
      gesture: "smirk",
    };
  }

  return null;
}
