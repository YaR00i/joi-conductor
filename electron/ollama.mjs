import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  killPortListeners,
  killProcessTree,
} from "../scripts/process-utils.mjs";

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

export async function getOllamaStatus(preferredModel = "") {
  const binaryPath = findOllamaBinary();
  const probe = await probeOllamaRunning();
  const managedByApp = Boolean(
    ownedByApp || (managedServe && !managedServe.killed),
  );

  let ready = false;
  let modelReady = false;
  let detail = "";

  if (!binaryPath && !probe.running) {
    detail = "Ollama не найден. Установи с ollama.com";
  } else if (!probe.running) {
    detail = managedByApp
      ? "Запускается…"
      : "Ollama установлен, сервер не запущен";
  } else {
    ready = true;
    if (preferredModel) {
      const want = preferredModel.split(":")[0] ?? preferredModel;
      modelReady = probe.models.some((name) => {
        const base = name.split(":")[0] ?? name;
        return (
          name === preferredModel ||
          name.startsWith(`${preferredModel}:`) ||
          base === want
        );
      });
      detail = modelReady
        ? `Готов · модель ${preferredModel}`
        : `Сервер онлайн, модели «${preferredModel}» нет — скачай`;
    } else {
      detail =
        probe.models.length > 0
          ? `Готов · ${probe.models.length} моделей`
          : "Сервер онлайн, моделей пока нет";
      modelReady = probe.models.length > 0;
    }
  }

  return {
    installed: Boolean(binaryPath) || probe.running,
    running: probe.running,
    ready: ready && (preferredModel ? modelReady : true),
    modelReady,
    models: probe.models,
    managedByApp,
    binaryPath,
    detail,
    baseUrl: `http://${OLLAMA_HOST}:${OLLAMA_PORT}`,
  };
}

export async function startOllamaServe() {
  const already = await probeOllamaRunning();
  if (already.running) {
    ownedByApp = true; // adopt so app quit cleans up
    return getOllamaStatus();
  }

  const binary = findOllamaBinary();
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
  return probe.models;
}

/**
 * Pull model via CLI. onProgress(line) optional.
 * @param {string} model
 * @param {(line: string) => void} [onProgress]
 */
export async function pullOllamaModel(model, onProgress) {
  const binary = findOllamaBinary();
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
        if (line.trim()) onProgress?.(line.trim());
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
