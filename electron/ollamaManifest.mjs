/**
 * Parse local Ollama model names without talking to `ollama serve`.
 * Manifest layout: ~/.ollama/models/manifests/<host>/<namespace>/<model>/<tag>
 */

/** @param {string[]} names */
export function uniqueOllamaNames(names) {
  const seen = new Set();
  /** @type {string[]} */
  const out = [];
  for (const name of names) {
    if (typeof name !== "string" || !name || seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  return out;
}

/**
 * @param {string} rel path relative to the manifests directory
 * @returns {string | null}
 */
export function ollamaNameFromManifestRel(rel) {
  const parts = String(rel)
    .replace(/\\/g, "/")
    .split("/")
    .filter(Boolean);
  if (parts.length < 2) return null;
  const tag = parts[parts.length - 1];
  if (!tag || tag.startsWith(".")) return null;
  const host = parts[0];
  const rest = parts.slice(1, -1);
  if (rest.length === 0) return null;
  if (
    host === "registry.ollama.ai" &&
    rest[0] === "library" &&
    rest.length === 2
  ) {
    return `${rest[1]}:${tag}`;
  }
  if (host === "registry.ollama.ai") {
    return `${rest.join("/")}:${tag}`;
  }
  return `${[host, ...rest].join("/")}:${tag}`;
}

/** @param {string} stdout `ollama list` table */
export function parseOllamaListOutput(stdout) {
  /** @type {string[]} */
  const names = [];
  for (const line of String(stdout).split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || /^NAME\b/i.test(trimmed)) continue;
    const name = trimmed.split(/\s+/)[0];
    if (name) names.push(name);
  }
  return uniqueOllamaNames(names);
}
