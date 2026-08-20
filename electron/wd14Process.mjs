/**
 * Manage the WD14 tagger Python server (scripts/wd14_server.py) as a child
 * process of the Electron app. Mirrors sovitsProcess.mjs.
 *
 * The renderer prefers this Python server and falls back to in-browser ONNX
 * inference (onnxruntime-web) when it is offline, so this module is strictly
 * optional — if python / the model are missing, getWd14ProcessStatus simply
 * reports offline and the renderer degrades gracefully.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import http from "node:http";
import https from "node:https";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  killPortListeners,
  killProcessTree,
} from "../scripts/process-utils.mjs";
import {
  ensureWd14Runtime,
  findAppWd14Python,
  wd14AppModelDir,
  wd14ModelsReady,
} from "./wd14Install.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 7878;

/** @type {import('node:child_process').ChildProcess | null} */
let managedChild = null;
let ownedByApp = false;
let starting = false;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function userHome() {
  return process.env.USERPROFILE || process.env.HOME || "";
}

/** Resolve the project-relative wd14_server.py script path. */
export function findWd14Script() {
  const candidates = [
    path.resolve(__dirname, "..", "scripts", "wd14_server.py"),
    path.resolve(process.cwd(), "scripts", "wd14_server.py"),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return null;
}

/**
 * Locate a Python interpreter. Priority: explicit override → WD14_PYTHON env →
 * a `wd14` conda env → system `python`/`py -3`.
 */
export function findWd14Python(overridePython = "") {
  const home = userHome();
  const appPy = findAppWd14Python();
  const candidates = [
    overridePython,
    process.env.WD14_PYTHON || "",
    appPy || "",
    path.join(home, "miniconda3", "envs", "wd14", "python.exe"),
    path.join(home, "anaconda3", "envs", "wd14", "python.exe"),
    path.join(home, "miniconda3", "envs", "wd14", "bin", "python"),
    path.join(home, "anaconda3", "envs", "wd14", "bin", "python"),
  ];
  for (const c of candidates) {
    if (c && existsSync(c)) return c;
  }
  return process.env.WD14_PYTHON || "python";
}

/** Resolve the model dir (default: scripts/wd14-models). */
export function findWd14ModelDir(override = "") {
  const candidates = [
    override,
    process.env.WD14_MODEL_DIR || "",
    wd14AppModelDir(),
    path.resolve(__dirname, "..", "scripts", "wd14-models"),
    path.resolve(process.cwd(), "scripts", "wd14-models"),
  ];
  for (const c of candidates) {
    if (c && wd14ModelsReady(c)) return c;
  }
  try {
    return wd14AppModelDir();
  } catch {
    return path.resolve(process.cwd(), "scripts", "wd14-models");
  }
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

/** HTTP probe — hits /models (cheap, mirrors the OpenAI-compat shape). */
function httpGetJson(url, { timeoutMs = 1500 } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === "https:" ? https : http;
    const req = lib.request(
      {
        hostname: u.hostname,
        port: u.port || (u.protocol === "https:" ? 443 : 80),
        path: `${u.pathname}${u.search}`,
        method: "GET",
        timeout: timeoutMs,
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const body = Buffer.concat(chunks).toString("utf8");
          resolve({ status: res.statusCode ?? 200, body });
        });
      },
    );
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("timeout"));
    });
    req.on("error", reject);
    req.end();
  });
}

export async function pingWd14(baseUrl) {
  const { base } = parseBaseUrl(baseUrl);
  try {
    const { status, body } = await httpGetJson(`${base}/models`);
    let online = false;
    try {
      const parsed = JSON.parse(body);
      online = parsed.online === true || parsed.online === undefined;
    } catch {
      online = status < 500;
    }
    return { online, baseUrl: base, detail: online ? "онлайн" : `HTTP ${status}` };
  } catch (err) {
    return {
      online: false,
      baseUrl: base,
      detail: err instanceof Error ? err.message : "offline",
    };
  }
}

/**
 * @param {{ baseUrl?: string, pythonPath?: string, modelDir?: string }} [opts]
 */
export async function getWd14ProcessStatus(opts = {}) {
  const { base } = parseBaseUrl(opts.baseUrl);
  const scriptPath = findWd14Script();
  const pythonPath = findWd14Python(opts.pythonPath || "");
  const modelDir = findWd14ModelDir(opts.modelDir || "");
  const ping = await pingWd14(base);
  const managedByApp = Boolean(
    ownedByApp || (managedChild && !managedChild.killed),
  );

  let detail = ping.detail;
  if (starting) detail = "Запускается (загрузка ONNX-модели)…";
  else if (ping.online && managedByApp)
    detail = "онлайн · управляется приложением";
  else if (ping.online) detail = "онлайн · внешний процесс";
  else if (!scriptPath) detail = "wd14_server.py не найден в scripts/";
  else if (!wd14ModelsReady(modelDir))
    detail = "модель не на диске — скачается при «Запустить сервер»";
  else detail = "офлайн";

  return {
    online: ping.online,
    starting,
    managedByApp,
    scriptPath,
    pythonPath,
    modelDir,
    baseUrl: base,
    detail,
  };
}

/**
 * @param {{ baseUrl?: string, pythonPath?: string, modelDir?: string }} [opts]
 * @param {(p: { phase: string, pct: number, detail?: string }) => void} [onProgress]
 */
export async function startWd14Process(opts = {}, onProgress) {
  const { host, port, base } = parseBaseUrl(opts.baseUrl);
  const ping = await pingWd14(base);
  if (ping.online) {
    ownedByApp = true;
    return getWd14ProcessStatus(opts);
  }

  if (managedChild && !managedChild.killed) {
    for (let i = 0; i < 40; i++) {
      await sleep(1000);
      const p = await pingWd14(base);
      if (p.online) {
        starting = false;
        return getWd14ProcessStatus(opts);
      }
    }
  }

  starting = true;
  try {
    await ensureWd14Runtime(onProgress);
  } catch (err) {
    starting = false;
    throw err;
  }

  const scriptPath = findWd14Script();
  const python = findWd14Python(opts.pythonPath || "");
  const modelDir = findWd14ModelDir(opts.modelDir || "");
  if (!scriptPath) {
    starting = false;
    throw new Error("Не найден scripts/wd14_server.py.");
  }
  if (!wd14ModelsReady(modelDir)) {
    starting = false;
    throw new Error(
      `Модель WD14 не найдена: ${modelDir}. Нажми «Запустить сервер» ещё раз — качается сама.`,
    );
  }

  starting = true;
  managedChild = spawn(
    python,
    [
      scriptPath,
      "--host",
      host,
      "--port",
      String(port),
      "--model-dir",
      modelDir,
    ],
    {
      cwd: path.dirname(scriptPath),
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

  // ONNX model load on CPU takes ~10–20s; on GPU a bit more.
  for (let i = 0; i < 60; i++) {
    await sleep(1000);
    const p = await pingWd14(base);
    if (p.online) {
      starting = false;
      return getWd14ProcessStatus(opts);
    }
    if (!managedChild || managedChild.killed) {
      starting = false;
      ownedByApp = false;
      throw new Error("Процесс WD14 завершился до готовности API");
    }
  }

  starting = false;
  throw new Error("WD14 не ответил за ~60с (проверь python env и модель)");
}

/**
 * @param {{ baseUrl?: string, forcePort?: boolean }} [opts]
 */
export async function stopWd14Process(opts = {}) {
  const { port } = parseBaseUrl(opts.baseUrl);
  let stopped = false;
  if (managedChild && !managedChild.killed) {
    killProcessTree(managedChild);
    managedChild = null;
    stopped = true;
  }
  if (opts.forcePort) {
    try {
      killPortListeners(port);
      stopped = true;
    } catch {
      /* ignore */
    }
  }
  ownedByApp = false;
  starting = false;
  return stopped;
}

/** Called on app quit — always force-kill the port listener. */
export function stopWd14OnQuit() {
  try {
    killPortListeners(DEFAULT_PORT);
  } catch {
    /* ignore */
  }
  ownedByApp = false;
  starting = false;
}
