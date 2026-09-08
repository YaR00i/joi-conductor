/**
 * Manage `vllm serve` for Qwen3-TTS as an Electron child process.
 * Mirrors sovitsProcess.mjs.
 */
import { spawn, execFile } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
  killPortListeners,
  killProcessTree,
} from "../scripts/process-utils.mjs";
import { getQwenStatus, pingQwen } from "./qwen.mjs";
import {
  findQwenPython,
  getQwenInstallStatus,
  QWEN_HF_REPOS,
} from "./qwenInstall.mjs";
import {
  pickQwenServeBackend,
  qwenDeviceMatches,
  resolveQwenServeDevice,
} from "./qwenLaunch.mjs";

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 8000;

/** @type {import('node:child_process').ChildProcess | null} */
let managedChild = null;
let ownedByApp = false;
let starting = false;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function parseBaseUrl(baseUrl) {
  try {
    const u = new URL(baseUrl || `http://${DEFAULT_HOST}:${DEFAULT_PORT}/v1`);
    return {
      host: u.hostname || DEFAULT_HOST,
      port: Number(u.port) || DEFAULT_PORT,
      base: `${u.protocol}//${u.hostname || DEFAULT_HOST}:${Number(u.port) || DEFAULT_PORT}${u.pathname.replace(/\/+$/, "") || "/v1"}`,
    };
  } catch {
    return {
      host: DEFAULT_HOST,
      port: DEFAULT_PORT,
      base: `http://${DEFAULT_HOST}:${DEFAULT_PORT}/v1`,
    };
  }
}

/**
 * @param {"custom_voice" | "base" | string} [flavor]
 */
function resolveServeModel(flavor) {
  const st = getQwenInstallStatus();
  const wantBase = flavor === "base";
  if (wantBase && st.base) return st.baseDir;
  if (!wantBase && st.customVoice) return st.customVoiceDir;
  return wantBase ? QWEN_HF_REPOS.base : QWEN_HF_REPOS.custom_voice;
}

/**
 * @param {string} python
 * @returns {{ cmd: string, args: string[] } | null}
 */
function vllmLaunch(python, model, host, port) {
  const dir = path.dirname(python);
  const candidates = [
    path.join(dir, "vllm.exe"),
    path.join(dir, "Scripts", "vllm.exe"),
    path.join(dir, "bin", "vllm"),
  ];
  for (const bin of candidates) {
    if (existsSync(bin)) {
      return {
        cmd: bin,
        args: ["serve", model, "--host", host, "--port", String(port)],
      };
    }
  }
  return {
    cmd: python,
    args: [
      "-m",
      "vllm.entrypoints.openai.api_server",
      "--model",
      model,
      "--host",
      host,
      "--port",
      String(port),
    ],
  };
}

function findQwenTtsScript() {
  const candidates = [
    path.resolve(__dirname, "..", "scripts", "qwen_tts_server.py"),
    path.resolve(process.cwd(), "scripts", "qwen_tts_server.py"),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return null;
}

function qwenTtsLaunch(python, model, host, port, device, refAudio, refText) {
  const script = findQwenTtsScript();
  if (!script) return null;
  const args = [
    script,
    "--host",
    host,
    "--port",
    String(port),
    "--model",
    model,
    "--device",
    device,
  ];
  if (refAudio && existsSync(refAudio)) {
    args.push("--ref-audio", refAudio);
    if (refText) args.push("--ref-text", refText);
  }
  return {
    cmd: python,
    args,
  };
}

/**
 * @param {string} python
 * @param {string} mod
 */
async function pythonCanImport(python, mod) {
  const isPy = path.basename(python).toLowerCase() === "py" || python === "py";
  const args = isPy ? ["-3", "-c", `import ${mod}`] : ["-c", `import ${mod}`];
  try {
    await execFileAsync(python, args, { timeout: 20000, windowsHide: true });
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {{
 *   baseUrl?: string,
 *   flavor?: string,
 *   model?: string,
 *   device?: string,
 * }} [opts]
 */
export async function getQwenProcessStatus(opts = {}) {
  const { base } = parseBaseUrl(opts.baseUrl);
  const python = findQwenPython();
  const modelPath = opts.model?.trim() || resolveServeModel(opts.flavor);
  const ping = starting ? { online: false, detail: "запуск" } : await pingQwen(base);
  const http = ping.online ? await getQwenStatus(base) : null;
  const managedByApp = Boolean(
    ownedByApp || (managedChild && !managedChild.killed),
  );
  const install = getQwenInstallStatus();
  const wantCpu = resolveQwenServeDevice(opts.device) === "cpu";

  let detail = http?.detail || ping.detail;
  if (starting)
    detail = wantCpu
      ? "Запускается Qwen TTS (загрузка весов в RAM)…"
      : "Запускается Qwen TTS (загрузка весов на GPU)…";
  else if (http?.online && http.device === "cpu")
    detail = http.detail;
  else if (http?.online && managedByApp)
    detail =
      http.detail ||
      (http.gpu
        ? `онлайн · GPU · ${http.gpu}`
        : "онлайн · управляется приложением");
  else if (http?.online) detail = http.detail || "онлайн · внешний процесс";
  else if (install.torchCpu)
    detail = "torch CPU — видеопамять не используется. Снова скачай Qwen во вкладке «ИИ ресурсы».";
  else if (!install.customVoice && !install.base && opts.flavor !== "hf")
    detail = "веса не скачаны — вкладка «ИИ ресурсы»";
  else detail = ping.detail || "офлайн";

  return {
    online: Boolean(http?.online),
    starting,
    managedByApp,
    python,
    modelPath,
    tokenizer: install.tokenizer,
    customVoice: install.customVoice,
    base: install.base,
    torchCuda: install.torchCuda,
    torchCpu: install.torchCpu,
    device: http?.device,
    gpu: http?.gpu,
    torch: http?.torch,
    backend: http?.backend,
    warmed: http?.warmed,
    baseUrl: base,
    detail,
  };
}

/**
 * @param {{
 *   baseUrl?: string,
 *   flavor?: string,
 *   model?: string,
 *   device?: string,
 *   refAudio?: string,
 *   refText?: string,
 * }} [opts]
 */
export async function startQwenProcess(opts = {}) {
  const { host, port, base } = parseBaseUrl(opts.baseUrl);
  const device = resolveQwenServeDevice(opts.device);
  const already = await pingQwen(base);
  if (already.online) {
    const http = await getQwenStatus(base);
    if (qwenDeviceMatches(http.device, device)) {
      ownedByApp = true;
      return getQwenProcessStatus(opts);
    }
    stopQwenProcess({ forcePort: true, baseUrl: opts.baseUrl });
    await sleep(1200);
  }

  if (managedChild && !managedChild.killed) {
    for (let i = 0; i < 90; i++) {
      await sleep(2000);
      const p = await getQwenStatus(base);
      if (p.online) {
        starting = false;
        return getQwenProcessStatus(opts);
      }
    }
  }

  const python = findQwenPython();
  if (!python) {
    throw new Error("Python для Qwen не найден. Укажи QWEN_PYTHON или поставь miniconda.");
  }
  const model = opts.model?.trim() || resolveServeModel(opts.flavor);
  const refRaw = String(opts.refAudio || "").trim();
  const refAudio = refRaw
    ? path.isAbsolute(refRaw)
      ? refRaw
      : path.resolve(__dirname, "..", refRaw)
    : "";
  const hasVllm = await pythonCanImport(python, "vllm");
  const hasQwenTts = await pythonCanImport(python, "qwen_tts");
  const backend = pickQwenServeBackend({ hasVllm, hasQwenTts, device });
  if (backend === "none") {
    throw new Error(
      "Нет пакета для сервера Qwen. Снова нажми «Скачать» у Qwen во вкладке «ИИ ресурсы» — ставится qwen-tts (на Linux ещё vLLM).",
    );
  }
  const launch =
    backend === "vllm"
      ? vllmLaunch(python, model, host, port)
      : qwenTtsLaunch(
          python,
          model,
          host,
          port,
          device,
          refAudio,
          String(opts.refText || ""),
        );
  if (!launch) {
    throw new Error("Не найден scripts/qwen_tts_server.py");
  }
  const usePyLauncher =
    path.basename(python).toLowerCase() === "py" && launch.cmd === python;
  const cmd = launch.cmd;
  const pyArgs = usePyLauncher ? ["-3", ...launch.args] : launch.args;

  starting = true;
  let errTail = "";
  managedChild = spawn(cmd, pyArgs, {
    env: {
      ...process.env,
      PYTHONUNBUFFERED: "1",
      PYTHONIOENCODING: "utf-8",
      PYTHONUTF8: "1",
      ...(device === "cpu" ? { CUDA_VISIBLE_DEVICES: "-1" } : {}),
    },
    detached: false,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  ownedByApp = true;
  const feedErr = (buf) => {
    errTail = (errTail + buf.toString("utf8")).slice(-1200);
  };
  managedChild.stderr?.on("data", feedErr);
  managedChild.stdout?.on("data", feedErr);

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
    await sleep(2000);
    const p = await getQwenStatus(base);
    if (p.online) {
      starting = false;
      return getQwenProcessStatus(opts);
    }
    if (!managedChild || managedChild.killed) {
      starting = false;
      ownedByApp = false;
      const tail = errTail.replace(/\s+/g, " ").trim().slice(-280);
      throw new Error(
        tail
          ? `Qwen TTS не поднялся: ${tail}`
          : "Процесс Qwen завершился сразу. Снова скачай Qwen во вкладке «ИИ ресурсы» (пакет qwen-tts).",
      );
    }
  }

  starting = false;
  throw new Error(
    device === "cpu"
      ? "Qwen TTS не ответил за ~3 мин (загрузка весов в RAM долгая)"
      : "Qwen TTS не ответил за ~3 мин (первичная загрузка весов на GPU долгая)",
  );
}

/**
 * @param {{ forcePort?: boolean, baseUrl?: string }} [opts]
 */
export function stopQwenProcess(opts = {}) {
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

export function stopQwenOnQuit() {
  stopQwenProcess({ forcePort: true });
  killPortListeners(DEFAULT_PORT);
  ownedByApp = false;
  return true;
}
