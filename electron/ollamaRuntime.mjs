/**
 * Resolve official Ollama CLI zip names and find ollama.exe after extract.
 */
import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

export const OLLAMA_RELEASE_BASE =
  "https://github.com/ollama/ollama/releases/latest/download";

/**
 * @param {NodeJS.Platform} [platform]
 * @param {string} [arch]
 * @returns {string | null}
 */
export function ollamaReleaseAsset(
  platform = process.platform,
  arch = process.arch,
) {
  if (platform === "win32") {
    return arch === "arm64"
      ? "ollama-windows-arm64.zip"
      : "ollama-windows-amd64.zip";
  }
  return null;
}

/**
 * @param {NodeJS.Platform} [platform]
 * @param {string} [arch]
 */
export function ollamaReleaseUrl(
  platform = process.platform,
  arch = process.arch,
) {
  const asset = ollamaReleaseAsset(platform, arch);
  return asset ? `${OLLAMA_RELEASE_BASE}/${asset}` : null;
}

export function ollamaExeName(platform = process.platform) {
  return platform === "win32" ? "ollama.exe" : "ollama";
}

/**
 * @param {string} root
 * @param {NodeJS.Platform} [platform]
 * @param {number} [maxDepth]
 * @returns {string | null}
 */
export function locateOllamaExe(root, platform = process.platform, maxDepth = 4) {
  if (!root || !existsSync(root)) return null;
  const want = ollamaExeName(platform);
  const walk = (dir, depth) => {
    if (depth < 0) return null;
    const direct = path.join(dir, want);
    if (existsSync(direct)) return direct;
    let names;
    try {
      names = readdirSync(dir);
    } catch {
      return null;
    }
    for (const name of names) {
      if (name.startsWith(".")) continue;
      const full = path.join(dir, name);
      let st;
      try {
        st = statSync(full);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        const found = walk(full, depth - 1);
        if (found) return found;
      }
    }
    return null;
  };
  return walk(root, maxDepth);
}
