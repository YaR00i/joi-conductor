/**
 * App-managed CPython on Windows (NuGet full layout, includes venv).
 * Not the embeddable zip — that one cannot `python -m venv`.
 */
import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

export const PORTABLE_PYTHON_VERSION = "3.12.10";

export function portablePythonExeName(platform = process.platform) {
  return platform === "win32" ? "python.exe" : "python";
}

/**
 * @param {NodeJS.Platform} [platform]
 * @param {string} [arch]
 * @returns {string | null}
 */
export function portablePythonNugetUrl(
  platform = process.platform,
  arch = process.arch,
) {
  if (platform !== "win32") return null;
  const pkg = arch === "arm64" ? "pythonarm64" : "python";
  return `https://www.nuget.org/api/v2/package/${pkg}/${PORTABLE_PYTHON_VERSION}`;
}

/**
 * Direct nupkg on the NuGet CDN — used if nuget.org v2 redirect fails.
 * @param {NodeJS.Platform} [platform]
 * @param {string} [arch]
 * @returns {string | null}
 */
export function portablePythonNupkgFallbackUrl(
  platform = process.platform,
  arch = process.arch,
) {
  if (platform !== "win32") return null;
  const pkg = arch === "arm64" ? "pythonarm64" : "python";
  return `https://globalcdn.nuget.org/packages/${pkg}.${PORTABLE_PYTHON_VERSION}.nupkg`;
}

/**
 * @param {string} root
 * @param {NodeJS.Platform} [platform]
 * @param {number} [maxDepth]
 * @returns {string | null}
 */
export function locatePortablePython(
  root,
  platform = process.platform,
  maxDepth = 4,
) {
  if (!root || !existsSync(root)) return null;
  const want = portablePythonExeName(platform);
  const tools = path.join(root, "tools", want);
  if (existsSync(tools)) return tools;
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
