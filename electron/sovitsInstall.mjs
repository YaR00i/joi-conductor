/**
 * In-app GPT-SoVITS installer: clone + venv + CUDA torch + pretrained zip.
 * Layout: <userData>/gpt-sovits/{repo,venv}
 */
import { app } from "electron";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import {
  applyHfProgressEvent,
  emptyHfProgressState,
  formatHfProgressDetail,
  parseHfProgressLine,
  stripAnsi,
} from "./hfProgress.mjs";
import {
  TORCH_CUDA_INDEX_URLS,
  TORCH_CUDA_PROBE_CODE,
  describeTorchWheel,
  ensureQwenPythonEnv,
  venvPythonPath,
  withPythonArgs,
} from "./qwenEnv.mjs";
import { findHostPython } from "./qwenInstall.mjs";
import {
  SOVITS_FFMPEG_REPO,
  SOVITS_G2PW_ZIP,
  SOVITS_GITHUB_REPO,
  SOVITS_GITHUB_ZIP,
  SOVITS_NLTK_ZIP,
  SOVITS_OPENJTALK_TGZ,
  SOVITS_PRETRAINED_REPO,
  SOVITS_PRETRAINED_ZIP,
  extraReqPath,
  ffmpegLooksReady,
  isSovitsRepo,
  pretrainedLooksReady,
  requirementsPath,
  sovitsRepoDir,
  sovitsUserDataRoot,
  sovitsVenvDir,
} from "./sovitsPaths.mjs";

function userData() {
  return app.getPath("userData");
}

export function getManagedSovitsRoot() {
  return sovitsUserDataRoot(userData());
}

export function getManagedSovitsRepo() {
  return sovitsRepoDir(userData());
}

export function getManagedSovitsVenv() {
  return sovitsVenvDir(userData());
}

export function getManagedSovitsPython() {
  const py = venvPythonPath(getManagedSovitsVenv());
  return existsSync(py) ? py : "";
}

function pythonArgs(python, extra) {
  return withPythonArgs(python, extra);
}

/**
 * @param {string} cmd
 * @param {string[]} args
 * @param {(line: string) => void} [onLine]
 * @param {{ cwd?: string }} [opts]
 */
export function spawnCapture(cmd, args, onLine, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: opts.cwd || undefined,
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
      reject(new Error(`Не удалось запустить ${cmd}: ${err.message}`));
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

function statusDetail(st) {
  if (st.ready) {
    if (st.torchCuda) return "репо + venv + pretrained · CUDA";
    if (st.torchCpu) return "репо + venv + pretrained · torch CPU";
    return "репо + venv + pretrained";
  }
  if (!st.repo) return "не установлен — нажми «скачать»";
  if (!st.venv) return "репо есть, нет Python-среды";
  if (!st.pretrained) return "репо есть, нет pretrained — снова «скачать»";
  return "не готов";
}

export function getSovitsInstallStatus() {
  const root = getManagedSovitsRoot();
  const repo = getManagedSovitsRepo();
  const venvDir = getManagedSovitsVenv();
  const python = getManagedSovitsPython() || findHostPython();
  const torch = describeTorchWheel(venvDir);
  const repoOk = isSovitsRepo(repo);
  const pretrained = pretrainedLooksReady(repo);
  const ffmpeg = ffmpegLooksReady(repo);
  const venv = existsSync(venvPythonPath(venvDir));
  const ready = repoOk && venv && pretrained;
  const st = {
    root,
    repo: repoOk ? repo : "",
    python: venv ? venvPythonPath(venvDir) : python,
    venv,
    pretrained,
    ffmpeg,
    torchCuda: torch.cuda,
    torchCpu: torch.cpu,
    torchWheel: torch.wheel,
    ready,
    detail: "",
  };
  st.detail = statusDetail(st);
  return st;
}

const HF_FETCH_PY = `
import json, sys, time, zipfile, os, tarfile, shutil
from huggingface_hub import hf_hub_download
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

repo_id = sys.argv[1]
filename = sys.argv[2]
local_dir = sys.argv[3]
extract_to = sys.argv[4] if len(sys.argv) > 4 else ""
kind = sys.argv[5] if len(sys.argv) > 5 else "zip"
path = hf_hub_download(repo_id=repo_id, filename=filename, local_dir=local_dir, tqdm_class=JoiTqdm)
if extract_to:
    os.makedirs(extract_to, exist_ok=True)
    if kind == "zip":
        with zipfile.ZipFile(path) as z:
            z.extractall(extract_to)
    elif kind == "tar":
        with tarfile.open(path, "r:*") as t:
            t.extractall(extract_to)
print("OK")
`;

const GITHUB_ZIP_PY = `
import os, sys, urllib.request, zipfile, tempfile, shutil
url = sys.argv[1]
dest = sys.argv[2]
os.makedirs(dest, exist_ok=True)
tmp = tempfile.mkdtemp(prefix="gsv-")
zip_path = os.path.join(tmp, "src.zip")
print("скачиваю архив репозитория…", flush=True)
urllib.request.urlretrieve(url, zip_path)
with zipfile.ZipFile(zip_path) as z:
    z.extractall(tmp)
found = None
for root, dirs, files in os.walk(tmp):
    if "api_v2.py" in files:
        found = root
        break
if not found:
    raise SystemExit("в архиве нет api_v2.py")
if os.path.abspath(found) != os.path.abspath(dest):
    for name in os.listdir(found):
        src = os.path.join(found, name)
        dst = os.path.join(dest, name)
        if os.path.exists(dst):
            if os.path.isdir(dst):
                shutil.rmtree(dst)
            else:
                os.remove(dst)
        shutil.move(src, dst)
shutil.rmtree(tmp, ignore_errors=True)
print("OK")
`;

let installLock = false;

/**
 * @param {(p: {
 *   phase: string,
 *   pct: number,
 *   line?: string,
 *   filesDone?: number,
 *   filesTotal?: number,
 *   detail?: string,
 * }) => void} [onProgress]
 */
export async function installSovitsRuntime(onProgress) {
  if (installLock) {
    throw new Error("Уже ставится GPT-SoVITS — подожди");
  }
  installLock = true;
  try {
    const root = getManagedSovitsRoot();
    const repo = getManagedSovitsRepo();
    const venvDir = getManagedSovitsVenv();
    mkdirSync(root, { recursive: true });

    const env = await ensureQwenPythonEnv({
      venvDir,
      hostPython: findHostPython(),
      overridePython: process.env.GPT_SOVITS_PYTHON || "",
      run: (cmd, args, onLine) => spawnCapture(cmd, args, onLine),
      onProgress,
      downloadPackages: ["huggingface_hub", "tqdm"],
      runtimePackages: [],
      requiredImports: ["huggingface_hub"],
      tryVllm: false,
      ensureCudaTorch: false,
    });
    const python = env.python;

    await ensureRepo(python, repo, onProgress);
    await fetchPretrained(python, repo, onProgress);
    await fetchFfmpeg(python, repo, onProgress);
    await installTorchCuda(python, onProgress);
    await pipRequirements(python, repo, onProgress);
    await ensureCudaAfterRequirements(python, onProgress);
    await fetchNltkAndJtalk(python, repo, onProgress);

    const st = getSovitsInstallStatus();
    if (!st.ready) {
      throw new Error(
        st.detail ||
          "Установка не дошла до готовности (репо + venv + pretrained).",
      );
    }
    onProgress?.({
      phase: "Готово",
      pct: 100,
      line: repo,
      detail: st.detail,
    });
    return st;
  } finally {
    installLock = false;
  }
}

export function uninstallSovitsRuntime() {
  if (installLock) {
    throw new Error("Сейчас ставится GPT-SoVITS — подожди");
  }
  const root = getManagedSovitsRoot();
  if (existsSync(root)) {
    rmSync(root, { recursive: true, force: true });
  }
  return getSovitsInstallStatus();
}

async function ensureRepo(python, repo, onProgress) {
  if (isSovitsRepo(repo)) return;
  if (existsSync(repo)) {
    rmSync(repo, { recursive: true, force: true });
  }
  onProgress?.({
    phase: "Клонирую GPT-SoVITS",
    pct: 18,
    detail: SOVITS_GITHUB_REPO,
  });
  try {
    await spawnCapture(
      "git",
      ["clone", "--depth", "1", "--single-branch", SOVITS_GITHUB_REPO, repo],
      (line) =>
        onProgress?.({
          phase: "Клонирую GPT-SoVITS",
          pct: 20,
          line,
          detail: line,
        }),
    );
  } catch (gitErr) {
    const msg = gitErr instanceof Error ? gitErr.message : String(gitErr);
    onProgress?.({
      phase: "Git нет — качаю zip с GitHub",
      pct: 20,
      detail: msg.slice(0, 160),
    });
    mkdirSync(repo, { recursive: true });
    const launch = pythonArgs(python, ["-c", GITHUB_ZIP_PY, SOVITS_GITHUB_ZIP, repo]);
    await spawnCapture(launch.cmd, launch.args, (line) =>
      onProgress?.({
        phase: "Качаю архив GPT-SoVITS",
        pct: 22,
        line,
        detail: line,
      }),
    );
  }
  if (!isSovitsRepo(repo)) {
    throw new Error(
      `Не появился api_v2.py в ${repo}. Нужен git или доступ к GitHub.`,
    );
  }
}

async function runHfFetch(python, args, phase, pctFrom, pctTo, onProgress) {
  const launch = pythonArgs(python, ["-c", HF_FETCH_PY, ...args]);
  let st = emptyHfProgressState();
  let lastEmit = 0;
  const span = Math.max(1, pctTo - pctFrom);
  const mapPct = (pct) =>
    Math.round(pctFrom + (Math.max(0, Math.min(100, pct)) * span) / 100);
  const emit = (force, extraLine) => {
    const now = Date.now();
    if (!force && now - lastEmit < 200) return;
    lastEmit = now;
    const detail = formatHfProgressDetail(st, args[0]);
    onProgress?.({
      phase,
      pct: mapPct(Math.max(1, st.pct)),
      line: extraLine || detail,
      filesDone: st.filesTotal ? st.filesDone : undefined,
      filesTotal: st.filesTotal || undefined,
      detail,
    });
  };
  onProgress?.({ phase, pct: pctFrom, detail: args[1] });
  await spawnCapture(launch.cmd, launch.args, (line) => {
    if (line === "OK") return;
    const ev = parseHfProgressLine(line);
    if (ev) {
      st = applyHfProgressEvent(st, ev);
      emit(Boolean(ev.kind === "files"), line);
      return;
    }
    onProgress?.({ phase, pct: mapPct(Math.max(1, st.pct)), line, detail: line });
  });
  onProgress?.({ phase, pct: pctTo, detail: "ok" });
}

async function fetchPretrained(python, repo, onProgress) {
  if (pretrainedLooksReady(repo)) return;
  const cache = path.join(getManagedSovitsRoot(), "hf-cache");
  mkdirSync(cache, { recursive: true });
  await runHfFetch(
    python,
    [
      SOVITS_PRETRAINED_REPO,
      SOVITS_PRETRAINED_ZIP,
      cache,
      path.join(repo, "GPT_SoVITS"),
      "zip",
    ],
    "Скачиваю pretrained SoVITS",
    28,
    48,
    onProgress,
  );
  const g2pwDest = path.join(repo, "GPT_SoVITS", "text");
  if (!existsSync(path.join(g2pwDest, "G2PWModel"))) {
    try {
      await runHfFetch(
        python,
        [SOVITS_PRETRAINED_REPO, SOVITS_G2PW_ZIP, cache, g2pwDest, "zip"],
        "Скачиваю G2PWModel",
        48,
        52,
        onProgress,
      );
    } catch {
      // English-only clone can run without G2PW.
    }
  }
  if (!pretrainedLooksReady(repo)) {
    throw new Error(
      "pretrained_models не распаковались. Проверь доступ к Hugging Face.",
    );
  }
}

async function fetchFfmpeg(python, repo, onProgress) {
  if (ffmpegLooksReady(repo)) return;
  if (process.platform !== "win32") return;
  onProgress?.({
    phase: "Качаю ffmpeg.exe в корень SoVITS",
    pct: 53,
    detail: SOVITS_FFMPEG_REPO,
  });
  const cache = path.join(getManagedSovitsRoot(), "hf-cache");
  try {
    await runHfFetch(
      python,
      [SOVITS_FFMPEG_REPO, "ffmpeg.exe", cache, "", "none"],
      "Качаю ffmpeg.exe",
      53,
      54,
      onProgress,
    );
    await runHfFetch(
      python,
      [SOVITS_FFMPEG_REPO, "ffprobe.exe", cache, "", "none"],
      "Качаю ffprobe.exe",
      54,
      55,
      onProgress,
    );
    const copied = await copyCachedBins(python, cache, repo);
    if (!copied) {
      onProgress?.({
        phase: "ffmpeg не скопировался — SoVITS может взять системный",
        pct: 55,
        detail: cache,
      });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    onProgress?.({
      phase: "ffmpeg с HF не скачался — нужен системный ffmpeg в PATH",
      pct: 55,
      detail: msg.slice(0, 180),
    });
  }
}

async function copyCachedBins(python, cache, repo) {
  const code = `
import os, shutil, sys
cache, repo = sys.argv[1], sys.argv[2]
ok = 0
for name in ("ffmpeg.exe", "ffprobe.exe"):
    src = os.path.join(cache, name)
    if os.path.isfile(src):
        shutil.copy2(src, os.path.join(repo, name))
        ok += 1
print(ok)
`;
  const launch = pythonArgs(python, ["-c", code, cache, repo]);
  let n = "0";
  await spawnCapture(launch.cmd, launch.args, (line) => {
    if (/^\d+$/.test(line)) n = line;
  });
  return Number(n) > 0;
}

async function installTorchCuda(python, onProgress) {
  const probe = pythonArgs(python, ["-c", TORCH_CUDA_PROBE_CODE]);
  const hasCuda = async () => {
    try {
      await spawnCapture(probe.cmd, probe.args);
      return true;
    } catch {
      return false;
    }
  };
  if (await hasCuda()) return;
  for (const indexUrl of TORCH_CUDA_INDEX_URLS) {
    onProgress?.({
      phase: "Ставлю PyTorch + torchcodec с CUDA",
      pct: 56,
      detail: indexUrl,
    });
    try {
      const uninstall = pythonArgs(python, [
        "-m",
        "pip",
        "uninstall",
        "-y",
        "torch",
        "torchvision",
        "torchaudio",
        "torchcodec",
      ]);
      try {
        await spawnCapture(uninstall.cmd, uninstall.args);
      } catch {
        // nothing to uninstall
      }
      const install = pythonArgs(python, [
        "-m",
        "pip",
        "install",
        "--upgrade",
        "--disable-pip-version-check",
        "torch",
        "torchcodec",
        "--index-url",
        indexUrl,
      ]);
      await spawnCapture(install.cmd, install.args, (line) => {
        onProgress?.({
          phase: "Ставлю PyTorch + torchcodec с CUDA",
          pct: 58,
          line,
          detail: line,
        });
      });
      if (await hasCuda()) return;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      onProgress?.({
        phase: "wheel CUDA не встал, пробую следующий индекс",
        pct: 58,
        detail: msg.slice(0, 180),
      });
    }
  }
}

async function pipRequirements(python, repo, onProgress) {
  const extra = extraReqPath(repo);
  const req = requirementsPath(repo);
  if (existsSync(extra)) {
    onProgress?.({
      phase: "Ставлю extra-req.txt (без зависимостей)",
      pct: 62,
      detail: extra,
    });
    const launch = pythonArgs(python, [
      "-m",
      "pip",
      "install",
      "--disable-pip-version-check",
      "-r",
      extra,
      "--no-deps",
    ]);
    await spawnCapture(
      launch.cmd,
      launch.args,
      (line) =>
        onProgress?.({
          phase: "Ставлю extra-req.txt",
          pct: 64,
          line,
          detail: line,
        }),
      { cwd: repo },
    );
  }
  if (!existsSync(req)) {
    throw new Error(`Нет ${req} — клон GPT-SoVITS битый`);
  }
  onProgress?.({
    phase: "Ставлю requirements.txt SoVITS (долго)",
    pct: 68,
    detail: req,
  });
  const launch = pythonArgs(python, [
    "-m",
    "pip",
    "install",
    "--disable-pip-version-check",
    "-r",
    req,
  ]);
  await spawnCapture(
    launch.cmd,
    launch.args,
    (line) =>
      onProgress?.({
        phase: "Ставлю requirements.txt SoVITS",
        pct: 78,
        line,
        detail: line,
      }),
    { cwd: repo },
  );
}

async function ensureCudaAfterRequirements(python, onProgress) {
  const probe = pythonArgs(python, ["-c", TORCH_CUDA_PROBE_CODE]);
  try {
    await spawnCapture(probe.cmd, probe.args);
    return;
  } catch {
    // requirements often pull CPU torch on Windows
  }
  onProgress?.({
    phase: "requirements сбил CUDA — возвращаю cu128 torch",
    pct: 86,
    detail: TORCH_CUDA_INDEX_URLS[0],
  });
  await installTorchCuda(python, onProgress);
}

async function fetchNltkAndJtalk(python, repo, onProgress) {
  const cache = path.join(getManagedSovitsRoot(), "hf-cache");
  try {
    const prefixCode = pythonArgs(python, ["-c", "import sys; print(sys.prefix)"]);
    let prefix = "";
    await spawnCapture(prefixCode.cmd, prefixCode.args, (line) => {
      if (line && !prefix) prefix = line;
    });
    if (prefix) {
      await runHfFetch(
        python,
        [SOVITS_PRETRAINED_REPO, SOVITS_NLTK_ZIP, cache, prefix, "zip"],
        "Скачиваю NLTK data",
        90,
        93,
        onProgress,
      );
    }
  } catch {
    // SenseVoice / English path can still start
  }
  try {
    const loc = pythonArgs(python, [
      "-c",
      "import os, pyopenjtalk; print(os.path.dirname(pyopenjtalk.__file__))",
    ]);
    let jtalkDir = "";
    await spawnCapture(loc.cmd, loc.args, (line) => {
      if (line && !jtalkDir) jtalkDir = line;
    });
    if (jtalkDir) {
      await runHfFetch(
        python,
        [
          SOVITS_PRETRAINED_REPO,
          SOVITS_OPENJTALK_TGZ,
          cache,
          jtalkDir,
          "tar",
        ],
        "Скачиваю OpenJTalk dict",
        93,
        96,
        onProgress,
      );
    }
  } catch {
    // JP frontend optional for EN clone
  }
  void repo;
}
