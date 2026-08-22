function stripOuterFences(raw: string): string {
  return raw
    .replace(/^\s*```(?:json|JSON)?\s*/u, "")
    .replace(/\s*```\s*$/u, "")
    .trim();
}

function sliceBalancedObject(source: string, start: number): string | null {
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < source.length; i++) {
    const ch = source[i]!;
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
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  return null;
}

/** Pull the first balanced `{ ... }` from model output (fences allowed). */
export function extractFirstJsonObject(raw: string): string | null {
  const stripped = stripOuterFences(raw);
  const start = stripped.indexOf("{");
  if (start < 0) return null;
  return sliceBalancedObject(stripped, start);
}

/** Complete `{ ... }` slices in order (does not strip markdown fences). */
export function scanJsonObjects(
  raw: string,
): Array<{ start: number; blob: string }> {
  const out: Array<{ start: number; blob: string }> = [];
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] !== "{") continue;
    const blob = sliceBalancedObject(raw, i);
    if (blob) out.push({ start: i, blob });
  }
  return out;
}

/** Last complete `{ ... }` in the reply (speech may precede a trailing actions object). */
export function extractLastJsonObject(raw: string): string | null {
  const scanned = scanJsonObjects(stripOuterFences(raw));
  return scanned.length ? scanned[scanned.length - 1]!.blob : null;
}

export function parseJsonObject(raw: string): Record<string, unknown> | null {
  const blob = extractFirstJsonObject(raw);
  if (!blob) return null;
  try {
    const parsed: unknown = JSON.parse(blob);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return null;
  }
  return null;
}
