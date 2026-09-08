import { spawn } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  killPortListeners,
  killProcessTree,
} from "../scripts/process-utils.mjs";
import {
  ollamaNameFromManifestRel,
  parseOllamaListOutput,
  uniqueOllamaNames,
} from "./ollamaManifest.mjs";
import { findAppOllamaBinary, installOllamaRuntime } from "./ollamaInstall.mjs";

const execFileAsync = promisify(execFile);

const OLLAMA_HOST = "127.0.0.1";
const OLLAMA_PORT = 11434;

/** @type {import('node:child_process').ChildProcess | null} */
let managedServe = null;
/** App started this Ollama serve → kill on quit. */
let ownedByApp = false;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export function findOllamaBinary() {
  const localAppData = process.env.LOCALAPPDATA || "";
  const programFiles = process.env.PROGRAMFILES || "C:\\Program Files";
  const userProfile = process.env.USERPROFILE || "";

  const candidates = [
    path.join(localAppData, "Programs", "Ollama", "ollama.exe"),
    path.join(programFiles, "Ollama", "ollama.exe"),
    path.join(userProfile, "AppData", "Local", "Programs", "Ollama", "ollama.exe"),
    "C:\\Program Files\\Ollama\\ollama.exe",
  ];

  for (const c of candidates) {
    if (c && existsSync(c)) return c;
  }

  const bundled = findAppOllamaBinary();
  if (bundled) return bundled;

  // PATH lookup (Windows `where`)
  try {
    // sync-ish via which in PATH env
    const pathEnv = process.env.PATH || "";
    for (const dir of pathEnv.split(path.delimiter)) {
      const exe = path.join(dir, process.platform === "win32" ? "ollama.exe" : "ollama");
      if (existsSync(exe)) return exe;
    }
  } catch {
    // ignore
  }
  return null;
}

function httpJson(pathname, timeoutMs = 2500) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: OLLAMA_HOST,
        port: OLLAMA_PORT,
        path: pathname,
        method: "GET",
        timeout: timeoutMs,
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf8");
          if ((res.statusCode ?? 500) >= 400) {
            reject(new Error(`HTTP ${res.statusCode}: ${raw.slice(0, 120)}`));
            return;
          }
          try {
            resolve(JSON.parse(raw));
          } catch {
            reject(new Error("Bad JSON from Ollama"));
          }
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

export async function probeOllamaRunning() {
  try {
    const data = await httpJson("/api/tags");
    const models = Array.isArray(data?.models)
      ? data.models
          .map((m) => (typeof m?.name === "string" ? m.name : null))
          .filter(Boolean)
      : [];
    return { running: true, models };
  } catch {
    return { running: false, models: [] };
  }
}

function ollamaModelsRoot() {
  const envDir = String(process.env.OLLAMA_MODELS || "").trim();
  if (envDir) return envDir;
  const home = process.env.USERPROFILE || process.env.HOME || "";
  return path.join(home, ".ollama", "models");
}

/** Names of pulled models from the local manifest tree (serve not required). */
export function listOllamaModelsFromDisk() {
  const manifests = path.join(ollamaModelsRoot(), "manifests");
  if (!existsSync(manifests)) return [];
  /** @type {string[]} */
  const acc = [];
  const walk = (dir) => {
    let names;
    try {
      names = readdirSync(dir);
    } catch {
      return;
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
      if (st.isDirectory()) walk(full);
      else if (st.isFile()) {
        const model = ollamaNameFromManifestRel(path.relative(manifests, full));
        if (model) acc.push(model);
      }
    }
  };
  walk(manifests);
  return uniqueOllamaNames(acc);
}

async function listOllamaModelsViaCli() {
  const binary = findOllamaBinary();
  if (!binary) return [];
  try {
    const { stdout } = await execFileAsync(binary, ["list"], {
      timeout: 8000,
      windowsHide: true,
    });
    return parseOllamaListOutput(stdout);
  } catch {
    return [];
  }
}

/** HTTP tags when serve is up, otherwise disk (and CLI as last resort). */
async function collectLocalOllamaModels(probeModels = []) {
  const merged = uniqueOllamaNames([
    ...probeModels,
    ...listOllamaModelsFromDisk(),
  ]);
  if (merged.length > 0) return merged;
  return listOllamaModelsViaCli();
}

function modelMatchesPreferred(name, preferredModel) {
  const want = preferredModel.split(":")[0] ?? preferredModel;
  const base = name.split(":")[0] ?? name;
  return (
    name === preferredModel ||
    name.startsWith(`${preferredModel}:`) ||
    base === want
  );
}

export async function getOllamaStatus(preferredModel = "") {
  const binaryPath = findOllamaBinary();
  const probe = await probeOllamaRunning();
  const models = await collectLocalOllamaModels(probe.models);
  const managedByApp = Boolean(
    ownedByApp || (managedServe && !managedServe.killed),
  );

  let ready = false;
  let modelReady = false;
  let detail = "";

  if (!binaryPath && !probe.running) {
    detail = "Ollama не на диске — скачается при старте или загрузке модели";
  } else if (!probe.running) {
    const n = models.length;
    const hasPref =
      Boolean(preferredModel) &&
      models.some((name) => modelMatchesPreferred(name, preferredModel));
    modelReady = preferredModel ? hasPref : n > 0;
    detail = managedByApp
      ? "Запускается…"
      : n > 0
        ? hasPref
          ? `Модель «${preferredModel}» на диске · сервер выключен`
          : `На диске ${n} моделей · сервер выключен`
        : "Ollama установлен, сервер не запущен";
  } else {
    ready = true;
    if (preferredModel) {
      modelReady = models.some((name) =>
        modelMatchesPreferred(name, preferredModel),
      );
      detail = modelReady
        ? `Готов · модель ${preferredModel}`
        : `Сервер онлайн, модели «${preferredModel}» нет — скачай`;
    } else {
      detail =
        models.length > 0
          ? `Готов · ${models.length} моделей`
          : "Сервер онлайн, моделей пока нет";
      modelReady = models.length > 0;
    }
  }

  return {
    installed: Boolean(binaryPath) || probe.running || models.length > 0,
    running: probe.running,
    ready: ready && (preferredModel ? modelReady : true),
    modelReady,
    models,
    managedByApp,
    binaryPath,
    detail,
    baseUrl: `http://${OLLAMA_HOST}:${OLLAMA_PORT}`,
  };
}

/**
 * @param {(p: { phase: string, pct: number, detail?: string }) => void} [onProgress]
 */
export async function ensureOllamaRuntime(onProgress) {
  const existing = findOllamaBinary();
  if (existing) return existing;
  return installOllamaRuntime(onProgress);
}

export async function startOllamaServe(onProgress) {
  const already = await probeOllamaRunning();
  if (already.running) {
    ownedByApp = true; // adopt so app quit cleans up
    return getOllamaStatus();
  }

  const binary = await ensureOllamaRuntime(onProgress);
  if (!binary) {
    throw new Error("Ollama не найден на диске");
  }

  if (managedServe && !managedServe.killed) {
    // wait a bit for previous spawn
    for (let i = 0; i < 20; i++) {
      await sleep(400);
      const p = await probeOllamaRunning();
      if (p.running) return getOllamaStatus();
    }
  }

  managedServe = spawn(binary, ["serve"], {
    cwd: path.dirname(binary),
    env: { ...process.env, OLLAMA_HOST: `${OLLAMA_HOST}:${OLLAMA_PORT}` },
    detached: false,
    stdio: "ignore",
    windowsHide: true,
  });
  ownedByApp = true;

  managedServe.on("exit", () => {
    managedServe = null;
  });
  managedServe.on("error", () => {
    managedServe = null;
    ownedByApp = false;
  });

  for (let i = 0; i < 40; i++) {
    await sleep(400);
    const p = await probeOllamaRunning();
    if (p.running) return getOllamaStatus();
  }

  throw new Error("Ollama не ответил за ~16с после запуска");
}

export function stopManagedOllama() {
  let stopped = false;
  if (managedServe && !managedServe.killed) {
    stopped = killProcessTree(managedServe) || stopped;
    managedServe = null;
  }
  // Also clear port if we owned the serve (orphaned children / app host)
  if (ownedByApp) {
    if (killPortListeners(OLLAMA_PORT) > 0) stopped = true;
  }
  ownedByApp = false;
  return stopped;
}

/** On app quit: tear down Ollama serve used with this app. */
export function stopOllamaOnQuit() {
  stopManagedOllama();
  // Always clear local Ollama port — app session owns the stack.
  killPortListeners(OLLAMA_PORT);
  ownedByApp = false;
  return true;
}

export async function listOllamaModels() {
  const probe = await probeOllamaRunning();
  return collectLocalOllamaModels(probe.models);
}

/**
 * Pull model via CLI. onProgress optional: string line or { line, phase, pct }.
 * @param {string} model
 * @param {(payload: string | { line: string, phase?: string, pct?: number }) => void} [onProgress]
 */
export async function pullOllamaModel(model, onProgress) {
  const emit = (payload) => {
    if (!onProgress) return;
    onProgress(payload);
  };
  const binary = await ensureOllamaRuntime((p) => {
    emit({
      line: p.detail ? `${p.phase} · ${p.detail}` : p.phase,
      phase: p.phase,
      pct: p.pct,
    });
  });
  if (!binary) throw new Error("Ollama не найден");

  // Ensure serve is up
  const probe = await probeOllamaRunning();
  if (!probe.running) {
    await startOllamaServe();
  }

  return new Promise((resolve, reject) => {
    const child = spawn(binary, ["pull", model], {
      cwd: path.dirname(binary),
      env: { ...process.env },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    const push = (buf) => {
      const text = buf.toString("utf8");
      for (const line of text.split(/\r?\n/)) {
        if (line.trim()) emit(line.trim());
      }
    };

    child.stdout?.on("data", push);
    child.stderr?.on("data", push);
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ollama pull завершился с кодом ${code}`));
    });
  });
}

/**
 * Remove a pulled model (`ollama rm`).
 * @param {string} model
 */
export async function deleteOllamaModel(model) {
  const binary = await ensureOllamaRuntime();
  if (!binary) throw new Error("Ollama не найден");
  const name = String(model || "").trim();
  if (!name) throw new Error("Укажи имя модели");

  const probe = await probeOllamaRunning();
  if (!probe.running) {
    await startOllamaServe();
  }

  return new Promise((resolve, reject) => {
    const child = spawn(binary, ["rm", name], {
      cwd: path.dirname(binary),
      env: { ...process.env },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let err = "";
    child.stderr?.on("data", (buf) => {
      err += buf.toString("utf8");
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else
        reject(
          new Error(
            err.trim().slice(-240) || `ollama rm завершился с кодом ${code}`,
          ),
        );
    });
  });
}

/** Best-effort version string */
export async function ollamaVersion() {
  const binary = findOllamaBinary();
  if (!binary) return null;
  try {
    const { stdout } = await execFileAsync(binary, ["-v"], { timeout: 4000 });
    return stdout.trim() || null;
  } catch {
    return null;
  }
}
