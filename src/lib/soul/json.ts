/** Pull the first balanced `{ ... }` from model output (fences allowed). */
export function extractFirstJsonObject(raw: string): string | null {
  const stripped = raw
    .replace(/^\s*```(?:json|JSON)?\s*/u, "")
    .replace(/\s*```\s*$/u, "")
    .trim();
  const start = stripped.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < stripped.length; i++) {
    const ch = stripped[i]!;
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
      if (depth === 0) return stripped.slice(start, i + 1);
    }
  }
  return null;
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
