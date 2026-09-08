/**
 * Download official Windows CPython (NuGet) into userData so SoVITS / WD14 / Qwen
 * can create venvs without a system python.org install.
 */
import { app } from "electron";
import { existsSync, mkdirSync, promises as fs } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { downloadFile } from "./installDownload.mjs";
import {
  locatePortablePython,
  portablePythonNugetUrl,
  portablePythonNupkgFallbackUrl,
} from "./pythonRuntime.mjs";

export {
  locatePortablePython,
  portablePythonExeName,
  portablePythonNugetUrl,
  portablePythonNupkgFallbackUrl,
  PORTABLE_PYTHON_VERSION,
} from "./pythonRuntime.mjs";

export function pythonAppRoot() {
  return path.join(app.getPath("userData"), "python");
}

export function findAppPortablePython() {
  return locatePortablePython(pythonAppRoot());
}

export function getPortablePythonStatus() {
  const root = pythonAppRoot();
  const pythonPath = findAppPortablePython();
  return {
    ready: Boolean(pythonPath),
    pythonPath: pythonPath || "",
    root,
    supported: Boolean(portablePythonNugetUrl()),
  };
}

function expandZip(zipPath, outDir) {
  mkdirSync(outDir, { recursive: true });
  return new Promise((resolve, reject) => {
    const ps = spawn(
      "powershell.exe",
      [
        "-NoProfile",
        "-Command",
        `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${outDir.replace(/'/g, "''")}' -Force`,
      ],
      { windowsHide: true },
    );
    ps.on("error", reject);
    ps.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Распаковка Python zip код ${code}`));
    });
  });
}

function runPython(exe, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(exe, args, {
      cwd: path.dirname(exe),
      windowsHide: true,
      env: { ...process.env, PYTHONUTF8: "1" },
    });
    let err = "";
    child.stderr?.on("data", (buf) => {
      err += buf.toString("utf8");
    });
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("Python ensurepip завис"));
    }, timeoutMs);
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(err.trim() || `python exit ${code}`));
    });
  });
}

/** @type {Promise<string> | null} */
let installLock = null;

/**
 * @param {(p: { phase: string, pct: number, detail?: string }) => void} [onProgress]
 * @returns {Promise<string>}
 */
export async function installPortablePython(onProgress) {
  const existing = findAppPortablePython();
  if (existing) return existing;
  if (installLock) return installLock;

  installLock = (async () => {
    const url = portablePythonNugetUrl();
    if (!url) {
      throw new Error(
        "Встроенный Python качается только на Windows. Поставь Python 3.10–3.12 вручную.",
      );
    }
    const root = pythonAppRoot();
    mkdirSync(root, { recursive: true });
    const zipPath = path.join(root, "python-nuget.zip");
    onProgress?.({
      phase: "Скачиваю Python",
      pct: 4,
      detail: "официальный CPython 3.12 (~30 МБ)…",
    });
    const onPct = (pct) =>
      onProgress?.({
        phase: "Скачиваю Python",
        pct: Math.max(4, Math.round(pct * 0.7)),
        detail: `${pct}% архива`,
      });
    const dlOpts = { family: 4, userAgent: "joi-conductor/python-install" };
    try {
      await downloadFile(url, zipPath, onPct, 60_000, dlOpts);
    } catch (first) {
      const fallback = portablePythonNupkgFallbackUrl();
      if (!fallback) throw first;
      onProgress?.({
        phase: "Скачиваю Python",
        pct: 8,
        detail: "запасной CDN NuGet…",
      });
      await downloadFile(fallback, zipPath, onPct, 60_000, dlOpts);
    }
    onProgress?.({
      phase: "Распаковываю Python",
      pct: 78,
      detail: root,
    });
    await expandZip(zipPath, root);
    try {
      await fs.unlink(zipPath);
    } catch {
      /* ignore */
    }
    const exe = locatePortablePython(root);
    if (!exe) {
      throw new Error(`Архив Python распакован, но python.exe не найден в ${root}`);
    }
    onProgress?.({
      phase: "Ставлю pip",
      pct: 86,
      detail: exe,
    });
    try {
      await runPython(exe, ["-m", "ensurepip", "--upgrade"], 120_000);
    } catch {
      const getPip = path.join(root, "get-pip.py");
      await downloadFile(
        "https://bootstrap.pypa.io/get-pip.py",
        getPip,
        undefined,
        60_000,
        { family: 4, userAgent: "joi-conductor/python-install" },
      );
      await runPython(exe, [getPip], 180_000);
    }
    onProgress?.({
      phase: "Python готов",
      pct: 100,
      detail: exe,
    });
    return exe;
  })().finally(() => {
    installLock = null;
  });

  return installLock;
}
