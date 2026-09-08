/**
 * Download Qwen3-TTS 12Hz weights into Electron userData.
 * Creates an app venv and pip-installs huggingface_hub (and vllm when wheels exist).
 */
import { app } from "electron";
import { existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import {
  applyHfProgressEvent,
  emptyHfProgressState,
  formatHfProgressDetail,
  parseHfProgressLine,
  stripAnsi,
} from "./hfProgress.mjs";
import {
  describeQwenEnv,
  ensureQwenPythonEnv,
  venvPythonPath,
  withPythonArgs,
} from "./qwenEnv.mjs";
import { findAppPortablePython } from "./pythonInstall.mjs";

export const QWEN_HF_REPOS = {
  tokenizer: "Qwen/Qwen3-TTS-Tokenizer-12Hz",
  custom_voice: "Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice",
  base: "Qwen/Qwen3-TTS-12Hz-0.6B-Base",
};

/** @typedef {"tokenizer" | "custom_voice" | "base"} QwenInstallTarget */

function qwenRoot() {
  return path.join(app.getPath("userData"), "qwen-tts");
}

function targetDir(target) {
  return path.join(qwenRoot(), target);
}

function qwenVenvDir() {
  return path.join(qwenRoot(), "venv");
}

function dirLooksInstalled(dir) {
  if (!existsSync(dir)) return false;
  try {
    const names = readdirSync(dir);
    return names.some(
      (n) =>
        n === "config.json" ||
        n === "model.safetensors.index.json" ||
        n.endsWith(".safetensors") ||
        n === "tokenizer.json" ||
        n === "preprocessor_config.json",
    );
  } catch {
    return false;
  }
}

export function getQwenInstallStatus() {
  const root = qwenRoot();
  const tokenizerDir = targetDir("tokenizer");
  const customDir = targetDir("custom_voice");
  const baseDir = targetDir("base");
  const python = findQwenPython();
  const env = describeQwenEnv(qwenVenvDir(), python);
  return {
    root,
    python,
    venv: env.venv,
    hub: env.hub,
    qwenTts: env.qwenTts,
    vllm: env.vllm,
    fasterQwenTts: env.fasterQwenTts,
    torchCuda: env.torchCuda,
    torchCpu: env.torchCpu,
    torchWheel: env.torchWheel,
    tokenizer: dirLooksInstalled(tokenizerDir),
    customVoice: dirLooksInstalled(customDir),
    base: dirLooksInstalled(baseDir),
    tokenizerDir,
    customVoiceDir: customDir,
    baseDir,
  };
}

function userHome() {
  return process.env.USERPROFILE || process.env.HOME || "";
}

export function findHostPython() {
  const portable = findAppPortablePython();
  if (portable) return portable;
  const home = userHome();
  const candidates = [
    process.env.QWEN_PYTHON || "",
    process.env.WD14_PYTHON || "",
    path.join(home, "miniconda3", "python.exe"),
    path.join(home, "anaconda3", "python.exe"),
    path.join(home, "miniconda3", "envs", "qwen", "python.exe"),
    path.join(home, "miniconda3", "bin", "python"),
    path.join(home, "anaconda3", "bin", "python"),
  ];
  for (const c of candidates) {
    if (c && existsSync(c)) return c;
  }
  return process.platform === "win32" ? "py" : "python";
}

export function findQwenPython() {
  const override = process.env.QWEN_PYTHON || "";
  if (override && existsSync(override)) return override;
  const venvPy = venvPythonPath(qwenVenvDir());
  if (existsSync(venvPy)) return venvPy;
  return findHostPython();
}

function pythonArgs(python, code) {
  return withPythonArgs(python, ["-c", code]);
}

export function spawnCapture(cmd, args, onLine) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      windowsHide: true,
      env: {
        ...process.env,
        PYTHONUNBUFFERED: "1",
        HF_HUB_DISABLE_PROGRESS_BARS: "0",
        TQDM_MININTERVAL: "0.2",
      },
    });
    let errTail = "";
    let buf = "";
    const feed = (chunk) => {
      const text = chunk.toString("utf8");
      errTail = (errTail + text).slice(-8000);
      buf += text;
      const parts = buf.split(/\r|\n/);
      buf = parts.pop() ?? "";
      for (const part of parts) {
        const trimmed = stripAnsi(part).trim();
        if (trimmed) onLine?.(trimmed);
      }
    };
    child.stdout?.on("data", feed);
    child.stderr?.on("data", feed);
    child.on("error", (err) => {
      reject(
        new Error(
          `Не удалось запустить ${cmd}: ${err.message}. Нужен Python + huggingface_hub.`,
        ),
      );
    });
    child.on("exit", (code) => {
      const last = stripAnsi(buf).trim();
      if (last) onLine?.(last);
      if (code === 0) resolve();
      else
        reject(
          new Error(
            stripAnsi(errTail).trim().slice(-400) ||
              `${cmd} завершился с кодом ${code}`,
          ),
        );
    });
  });
}

let installLock = null;

/**
 * @param {QwenInstallTarget} target
 * @param {(p: {
 *   phase: string,
 *   pct: number,
 *   line?: string,
 *   filesDone?: number,
 *   filesTotal?: number,
 *   detail?: string,
 * }) => void} [onProgress]
 */
export async function installQwenTtsModel(target, onProgress) {
  if (!QWEN_HF_REPOS[target]) {
    throw new Error(`Неизвестная цель Qwen: ${target}`);
  }
  if (installLock) {
    throw new Error("Уже качается другая модель Qwen — подожди");
  }
  installLock = target;
  try {
    const dest = targetDir(target);
    mkdirSync(dest, { recursive: true });
    const repo = QWEN_HF_REPOS[target];
    const env = await ensureQwenPythonEnv({
      venvDir: qwenVenvDir(),
      hostPython: findHostPython(),
      overridePython: process.env.QWEN_PYTHON || "",
      run: spawnCapture,
      onProgress,
    });

    onProgress?.({
      phase: `Скачиваю ${repo}`,
      pct: 56,
      line: dest,
      detail: env.vllm ? env.python : env.runtimeNotes[0] || env.python,
    });

    const destJson = JSON.stringify(dest);
    const repoJson = JSON.stringify(repo);
    const code = `
import json, sys, time
from huggingface_hub import snapshot_download
try:
    from tqdm.auto import tqdm as _Tqdm
except Exception:
    from tqdm import tqdm as _Tqdm

_last = [0.0]

class JoiTqdm(_Tqdm):
    def update(self, n=1):
        out = super().update(n)
        now = time.monotonic()
        done = self.total is not None and self.n >= self.total
        if not done and now - _last[0] < 0.2:
            return out
        _last[0] = now
        d = self.format_dict
        payload = {
            "desc": (self.desc or "").strip(),
            "n": int(self.n or 0),
            "total": int(self.total) if self.total else None,
            "unit": d.get("unit") or getattr(self, "unit", "") or "",
            "rate": d.get("rate"),
            "elapsed": d.get("elapsed"),
            "remaining": d.get("remaining"),
        }
        sys.stderr.write("JOI:" + json.dumps(payload, ensure_ascii=False) + "\\n")
        sys.stderr.flush()
        return out

kwargs = dict(repo_id=${repoJson}, local_dir=${destJson})
try:
    snapshot_download(tqdm_class=JoiTqdm, **kwargs)
except TypeError:
    snapshot_download(**kwargs)
print("OK")
`;
    const { cmd, args } = pythonArgs(env.python, code);
    const mapPct = (pct) => Math.round(56 + (Math.max(0, Math.min(100, pct)) * 44) / 100);
    let st = emptyHfProgressState();
    let lastEmit = 0;
    const emit = (force, extraLine) => {
      const now = Date.now();
      if (!force && now - lastEmit < 200) return;
      lastEmit = now;
      const detail = formatHfProgressDetail(st, repo);
      onProgress?.({
        phase: `Скачиваю ${repo}`,
        pct: mapPct(Math.max(1, st.pct)),
        line: extraLine || detail,
        filesDone: st.filesTotal ? st.filesDone : undefined,
        filesTotal: st.filesTotal || undefined,
        detail,
      });
    };
    try {
      await spawnCapture(cmd, args, (line) => {
        if (line === "OK") return;
        const ev = parseHfProgressLine(line);
        if (ev) {
          st = applyHfProgressEvent(st, ev);
          emit(Boolean(ev.kind === "files"), line);
          return;
        }
        onProgress?.({
          phase: `Скачиваю ${repo}`,
          pct: mapPct(Math.max(1, st.pct)),
          line,
          detail: line,
        });
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/huggingface_hub|ModuleNotFoundError|No module named/i.test(msg)) {
        throw new Error(
          "Среда не смогла импортировать huggingface_hub. Нужен Python 3.10–3.12, потом снова «Скачать» — pip ставится сам.",
        );
      }
      throw err;
    }

    if (!dirLooksInstalled(dest)) {
      throw new Error(
        `Скачалось, но в ${dest} нет весов. Проверь доступ к Hugging Face.`,
      );
    }
    onProgress?.({
      phase: "Готово",
      pct: 100,
      line: dest,
      detail: dest,
    });
    return getQwenInstallStatus();
  } finally {
    installLock = null;
  }
}

/**
 * @param {QwenInstallTarget} target
 */
export function uninstallQwenModel(target) {
  if (!QWEN_HF_REPOS[target]) {
    throw new Error(`Неизвестная цель Qwen: ${target}`);
  }
  if (installLock) {
    throw new Error("Сейчас качается модель — подожди");
  }
  const dir = targetDir(target);
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
  }
  return getQwenInstallStatus();
}
