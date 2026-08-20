/**
 * Manage GPT-SoVITS api_v2.py as a child process of the Electron app.
 */
import { app } from "electron";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  killPortListeners,
  killProcessTree,
} from "../scripts/process-utils.mjs";
import { venvPythonPath } from "./qwenEnv.mjs";
import { pingSovits } from "./sovits.mjs";
import {
  pretrainedLooksReady,
  sovitsRepoDir,
  sovitsVenvDir,
} from "./sovitsPaths.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 9880;

/** @type {import('node:child_process').ChildProcess | null} */
let managedChild = null;
/** True if this app session started SoVITS and should kill it on quit. */
let ownedByApp = false;
let starting = false;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function userHome() {
  return process.env.USERPROFILE || process.env.HOME || "";
}

function userDataDir() {
  try {
    return app.getPath("userData");
  } catch {
    return "";
  }
}

/**
 * @param {string} [overrideRoot]
 */
export function findSovitsRoot(overrideRoot = "") {
  const home = userHome();
  const ud = userDataDir();
  const candidates = [
    overrideRoot,
    process.env.GPT_SOVITS_ROOT || "",
    ud ? sovitsRepoDir(ud) : "",
    path.join(home, "Projects", "GPT-SoVITS"),
    path.join(home, "Developer", "GPT-SoVITS"),
    path.resolve(__dirname, "..", "..", "GPT-SoVITS"),
    path.resolve(process.cwd(), "..", "GPT-SoVITS"),
  ];

  for (const c of candidates) {
    if (!c) continue;
    if (existsSync(path.join(c, "api_v2.py"))) return c;
  }
  return null;
}

/**
 * @param {string} [overridePython]
 */
export function findSovitsPython(overridePython = "") {
  const home = userHome();
  const ud = userDataDir();
  const managedVenv = ud ? venvPythonPath(sovitsVenvDir(ud)) : "";
  const candidates = [
    overridePython,
    process.env.GPT_SOVITS_PYTHON || "",
    managedVenv,
    path.join(home, "miniconda3", "envs", "GPTSoVits", "python.exe"),
    path.join(home, "anaconda3", "envs", "GPTSoVits", "python.exe"),
    path.join(home, "miniconda3", "envs", "GPTSoVits", "bin", "python"),
    path.join(home, "anaconda3", "envs", "GPTSoVits", "bin", "python"),
  ];
  for (const c of candidates) {
    if (c && existsSync(c)) return c;
  }
  return null;
}

function parseBaseUrl(baseUrl) {
  try {
    const u = new URL(baseUrl || `http://${DEFAULT_HOST}:${DEFAULT_PORT}`);
    return {
      host: u.hostname || DEFAULT_HOST,
      port: Number(u.port) || DEFAULT_PORT,
      base: u.origin,
    };
  } catch {
    return {
      host: DEFAULT_HOST,
      port: DEFAULT_PORT,
      base: `http://${DEFAULT_HOST}:${DEFAULT_PORT}`,
    };
  }
}

/**
 * @param {{
 *   baseUrl?: string,
 *   installPath?: string,
 *   pythonPath?: string,
 * }} [opts]
 */
export async function getSovitsProcessStatus(opts = {}) {
  const { base } = parseBaseUrl(opts.baseUrl);
  const installPath = findSovitsRoot(opts.installPath || "");
  const pythonPath = findSovitsPython(opts.pythonPath || "");
  const ping = await pingSovits(base);
  const managedByApp = Boolean(
    ownedByApp || (managedChild && !managedChild.killed),
  );

  let detail = ping.detail;
  if (starting) detail = "Запускается (загрузка моделей на GPU)…";
  else if (ping.online && managedByApp)
    detail = "онлайн · управляется приложением";
  else if (ping.online) detail = "онлайн · внешний процесс";
  else if (!installPath)
    detail = "GPT-SoVITS не найден — вкладка «ИИ ресурсы» → скачать";
  else if (!pythonPath)
    detail = "Нет Python для SoVITS — вкладка «ИИ ресурсы» → скачать";
  else if (installPath && !pretrainedLooksReady(installPath))
    detail = "репо есть, нет pretrained — снова «скачать» у GPT-SoVITS";
  else detail = "офлайн";

  return {
    online: ping.online,
    starting,
    managedByApp,
    installPath,
    pythonPath,
    baseUrl: base,
    detail,
  };
}

/**
 * @param {{
 *   baseUrl?: string,
 *   installPath?: string,
 *   pythonPath?: string,
 * }} [opts]
 */
export async function startSovitsProcess(opts = {}) {
  const { host, port, base } = parseBaseUrl(opts.baseUrl);
  const ping = await pingSovits(base);
  if (ping.online) {
    ownedByApp = true; // adopt external/manual process for quit cleanup
    return getSovitsProcessStatus(opts);
  }

  if (managedChild && !managedChild.killed) {
    for (let i = 0; i < 60; i++) {
      await sleep(1000);
      const p = await pingSovits(base);
      if (p.online) {
        starting = false;
        return getSovitsProcessStatus(opts);
      }
    }
  }

  const rootDir = findSovitsRoot(opts.installPath || "");
  const python = findSovitsPython(opts.pythonPath || "");
  if (!rootDir) {
    throw new Error(
      "Не найден GPT-SoVITS (api_v2.py). Скачай стек во вкладке «ИИ ресурсы».",
    );
  }
  if (!python) {
    throw new Error(
      "Не найден Python для SoVITS. Скачай стек во вкладке «ИИ ресурсы».",
    );
  }

  starting = true;
  managedChild = spawn(
    python,
    ["api_v2.py", "-a", host, "-p", String(port)],
    {
      cwd: rootDir,
      env: {
        ...process.env,
        PYTHONIOENCODING: "utf-8",
        PYTHONUTF8: "1",
      },
      detached: false,
      stdio: "ignore",
      windowsHide: true,
    },
  );
  ownedByApp = true;

  managedChild.on("exit", () => {
    managedChild = null;
    starting = false;
  });
  managedChild.on("error", () => {
    managedChild = null;
    starting = false;
    ownedByApp = false;
  });

  for (let i = 0; i < 90; i++) {
    await sleep(1000);
    const p = await pingSovits(base);
    if (p.online) {
      starting = false;
      return getSovitsProcessStatus(opts);
    }
    if (!managedChild || managedChild.killed) {
      starting = false;
      ownedByApp = false;
      throw new Error("Процесс SoVITS завершился до готовности API");
    }
  }

  starting = false;
  throw new Error("SoVITS не ответил за ~90с (проверь GPU / api_v2)");
}

/**
 * @param {{ forcePort?: boolean, baseUrl?: string }} [opts]
 */
export function stopSovitsProcess(opts = {}) {
  const { port } = parseBaseUrl(opts.baseUrl);
  let stopped = false;

  if (managedChild && !managedChild.killed) {
    stopped = killProcessTree(managedChild) || stopped;
    managedChild = null;
  }

  if (ownedByApp || opts.forcePort) {
    if (killPortListeners(port) > 0) stopped = true;
  }

  ownedByApp = false;
  starting = false;
  return stopped;
}

export function stopSovitsOnQuit() {
  stopSovitsProcess({ forcePort: true });
  killPortListeners(DEFAULT_PORT);
  ownedByApp = false;
  return true;
}
