/**
 * Isolated Qwen Python environment: app venv + pip packages.
 * Download needs huggingface_hub; serve needs vllm in the same interpreter.
 */
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import path from "node:path";

export const QWEN_DOWNLOAD_PACKAGES = ["huggingface_hub", "tqdm"];
/** Local serve on Windows (and Linux fallback). vLLM is optional extra. */
export const QWEN_TTS_PACKAGES = ["qwen-tts", "soundfile"];
export const QWEN_RUNTIME_PACKAGES = QWEN_TTS_PACKAGES;
export const QWEN_VLLM_PACKAGE = "vllm";
/** CUDA-graph wrapper: stock qwen-tts on Windows is ~0.2× realtime. */
export const FASTER_QWEN_TTS_PACKAGE = "faster-qwen3-tts";

/** RTX 50xx (Blackwell sm_120) needs CUDA 12.8+. Plain pip torch is CPU-only on Windows. */
export const TORCH_CUDA_INDEX_URLS = [
  "https://download.pytorch.org/whl/cu128",
  "https://download.pytorch.org/whl/cu130",
];

export const TORCH_CUDA_PROBE_CODE =
  "import torch,sys; sys.exit(0 if torch.cuda.is_available() else 1)";

export function isCpuTorchVersion(version) {
  const v = String(version || "").toLowerCase();
  return v.includes("+cpu") || v.endsWith("cpu");
}

export function isPyLauncher(python) {
  const base = path.basename(python || "").toLowerCase();
  return base === "py" || base === "py.exe" || python === "py";
}

export function withPythonArgs(python, extra) {
  if (isPyLauncher(python)) return { cmd: python, args: ["-3", ...extra] };
  return { cmd: python, args: extra };
}

export function importNameForPackage(pkg) {
  return pkg.replace(/-/g, "_");
}

export function venvPythonPath(venvDir, platform = process.platform) {
  return platform === "win32"
    ? path.join(venvDir, "Scripts", "python.exe")
    : path.join(venvDir, "bin", "python");
}

export function venvScriptsDir(venvDir, platform = process.platform) {
  return platform === "win32"
    ? path.join(venvDir, "Scripts")
    : path.join(venvDir, "bin");
}

export function venvHasPackage(venvDir, pkg, platform = process.platform) {
  const names = [pkg, importNameForPackage(pkg)];
  const roots = [];
  if (platform === "win32") {
    roots.push(path.join(venvDir, "Lib", "site-packages"));
  } else if (existsSync(path.join(venvDir, "lib"))) {
    for (const d of readdirSync(path.join(venvDir, "lib"))) {
      if (d.startsWith("python")) {
        roots.push(path.join(venvDir, "lib", d, "site-packages"));
      }
    }
  }
  for (const root of roots) {
    for (const n of names) {
      if (existsSync(path.join(root, n))) return true;
    }
  }
  const bin = venvScriptsDir(venvDir, platform);
  const exe =
    platform === "win32"
      ? `${importNameForPackage(pkg)}.exe`
      : importNameForPackage(pkg);
  return existsSync(path.join(bin, exe));
}

export function describeTorchWheel(venvDir, platform = process.platform) {
  const roots = [];
  if (platform === "win32") {
    roots.push(path.join(venvDir, "Lib", "site-packages"));
  } else if (existsSync(path.join(venvDir, "lib"))) {
    for (const d of readdirSync(path.join(venvDir, "lib"))) {
      if (d.startsWith("python")) {
        roots.push(path.join(venvDir, "lib", d, "site-packages"));
      }
    }
  }
  for (const root of roots) {
    if (!existsSync(root)) continue;
    for (const name of readdirSync(root)) {
      if (!/^torch-.+\.dist-info$/i.test(name)) continue;
      return {
        wheel: name,
        cpu: isCpuTorchVersion(name),
        cuda: /\+cu\d+/i.test(name),
      };
    }
  }
  return { wheel: "", cpu: false, cuda: false };
}

export function describeQwenEnv(venvDir, python, platform = process.platform) {
  const torch = describeTorchWheel(venvDir, platform);
  return {
    venv: existsSync(venvPythonPath(venvDir, platform)),
    hub: venvHasPackage(venvDir, "huggingface_hub", platform),
    qwenTts: venvHasPackage(venvDir, "qwen_tts", platform),
    vllm: venvHasPackage(venvDir, "vllm", platform),
    fasterQwenTts: venvHasPackage(venvDir, "faster_qwen3_tts", platform),
    torchCuda: torch.cuda,
    torchCpu: torch.cpu,
    torchWheel: torch.wheel,
    python,
  };
}

/**
 * @param {{
 *   venvDir: string,
 *   hostPython: string,
 *   overridePython?: string,
 *   run: (cmd: string, args: string[], onLine?: (line: string) => void) => Promise<void>,
 *   onProgress?: (p: {
 *     phase: string,
 *     pct: number,
 *     line?: string,
 *     detail?: string,
 *   }) => void,
 *   downloadPackages?: string[],
 *   runtimePackages?: string[],
 *   requiredImports?: string[],
 *   tryVllm?: boolean,
 *   ensureCudaTorch?: boolean,
 *   platform?: NodeJS.Platform,
 * }} opts
 */
export async function ensureQwenPythonEnv(opts) {
  const downloadPackages = opts.downloadPackages ?? QWEN_DOWNLOAD_PACKAGES;
  const onProgress = opts.onProgress;
  const platform = opts.platform ?? process.platform;
  const override = String(opts.overridePython || "").trim();
  const useOverride =
    Boolean(override) && (existsSync(override) || isPyLauncher(override));
  /** @type {string[]} */
  const runtimeNotes = [];
  const runtimePackages = [...(opts.runtimePackages ?? QWEN_RUNTIME_PACKAGES)];
  const tryVllm = opts.tryVllm ?? platform !== "win32";
  if (tryVllm && !runtimePackages.includes("vllm")) {
    runtimePackages.push("vllm");
  }

  /** @type {string} */
  let python;
  if (useOverride) {
    python = override;
  } else {
    mkdirSync(opts.venvDir, { recursive: true });
    const venvPy = venvPythonPath(opts.venvDir);
    if (!existsSync(venvPy)) {
      onProgress?.({
        phase: "Создаю Python-среду",
        pct: 4,
        detail: opts.venvDir,
      });
      const launch = withPythonArgs(opts.hostPython, ["-m", "venv", opts.venvDir]);
      try {
        await opts.run(launch.cmd, launch.args);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(
          `Не удалось создать venv (${opts.hostPython}): ${msg.slice(0, 240)}. Нужен Python 3.10–3.12 — приложение качает свой при старте, либо поставь python.org / Miniconda.`,
        );
      }
      if (!existsSync(venvPy)) {
        throw new Error(`venv создался, но нет интерпретатора: ${venvPy}`);
      }
    }
    python = venvPy;
  }

  async function canImport(mod) {
    const launch = withPythonArgs(python, ["-c", `import ${mod}`]);
    try {
      await opts.run(launch.cmd, launch.args);
      return true;
    } catch {
      return false;
    }
  }

  async function pipInstall(packages, pctFrom, pctTo, phase) {
    const launch = withPythonArgs(python, [
      "-m",
      "pip",
      "install",
      "--upgrade",
      "--disable-pip-version-check",
      ...packages,
    ]);
    onProgress?.({
      phase,
      pct: pctFrom,
      detail: packages.join(" "),
    });
    let n = 0;
    await opts.run(launch.cmd, launch.args, (line) => {
      n += 1;
      const span = Math.max(1, pctTo - pctFrom);
      const pct = Math.min(
        pctTo - 1,
        pctFrom + Math.floor(span * (1 - 1 / (1 + n / 8))),
      );
      onProgress?.({ phase, pct, line, detail: line });
    });
    onProgress?.({ phase, pct: pctTo, detail: "ok" });
  }

  onProgress?.({
    phase: "Проверяю пакеты среды",
    pct: 8,
    detail: python,
  });

  const missingDownload = [];
  for (const pkg of downloadPackages) {
    if (!(await canImport(importNameForPackage(pkg)))) missingDownload.push(pkg);
  }
  if (missingDownload.length) {
    try {
      await pipInstall(missingDownload, 10, 22, "Ставлю huggingface_hub");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(
        `Не удалось поставить ${missingDownload.join(", ")} в ${python}: ${msg.slice(-280)}`,
      );
    }
  }

  const rtCount = Math.max(1, runtimePackages.length);
  let rtPct = 24;
  const step = Math.floor(28 / rtCount);
  for (const pkg of runtimePackages) {
    if (await canImport(importNameForPackage(pkg))) {
      rtPct += step;
      continue;
    }
    const from = rtPct;
    const to = Math.min(52, rtPct + step);
    try {
      await pipInstall([pkg], from, to, `Ставлю ${pkg}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      runtimeNotes.push(
        `${pkg}: ${msg.replace(/\s+/g, " ").trim().slice(-160)}`,
      );
    }
    rtPct = to;
  }

  const requiredImports = opts.requiredImports ?? ["huggingface_hub"];
  for (const mod of requiredImports) {
    if (!(await canImport(mod))) {
      throw new Error(`После pip в среде всё ещё нет ${mod}`);
    }
  }

  const ensureCudaTorch = opts.ensureCudaTorch !== false;
  let cuda = false;
  if (ensureCudaTorch) {
    const probe = withPythonArgs(python, ["-c", TORCH_CUDA_PROBE_CODE]);
    const hasCuda = async () => {
      try {
        await opts.run(probe.cmd, probe.args);
        return true;
      } catch {
        return false;
      }
    };
    cuda = await hasCuda();
    if (!cuda) {
      for (const indexUrl of TORCH_CUDA_INDEX_URLS) {
        onProgress?.({
          phase: "Ставлю PyTorch с CUDA (иначе TTS на CPU и жрёт RAM)",
          pct: 48,
          detail: indexUrl,
        });
        try {
          const uninstall = withPythonArgs(python, [
            "-m",
            "pip",
            "uninstall",
            "-y",
            "torch",
            "torchvision",
            "torchaudio",
          ]);
          try {
            await opts.run(uninstall.cmd, uninstall.args);
          } catch {
            // CPU wheel may already be gone
          }
          const install = withPythonArgs(python, [
            "-m",
            "pip",
            "install",
            "--upgrade",
            "--disable-pip-version-check",
            "torch",
            "--index-url",
            indexUrl,
          ]);
          await opts.run(install.cmd, install.args, (line) => {
            onProgress?.({
              phase: "Ставлю PyTorch с CUDA (иначе TTS на CPU и жрёт RAM)",
              pct: 50,
              line,
              detail: line,
            });
          });
          cuda = await hasCuda();
          if (cuda) break;
          runtimeNotes.push(`torch CUDA не поднялся после ${indexUrl}`);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          runtimeNotes.push(
            `torch ${indexUrl}: ${msg.replace(/\s+/g, " ").trim().slice(-160)}`,
          );
        }
      }
    }
    if (!cuda) {
      runtimeNotes.push(
        "torch CPU: видеопамять не используется, синтез медленный. Нужен wheel cu128+ (RTX 50xx).",
      );
    } else if (!(await canImport("faster_qwen3_tts"))) {
      onProgress?.({
        phase: "Ставлю faster-qwen3-tts (CUDA graphs, иначе ~12 с на фразу)",
        pct: 52,
        detail: FASTER_QWEN_TTS_PACKAGE,
      });
      try {
        await pipInstall(
          [FASTER_QWEN_TTS_PACKAGE],
          52,
          54,
          "Ставлю faster-qwen3-tts (CUDA graphs)",
        );
        cuda = await hasCuda();
        if (!cuda) {
          runtimeNotes.push(
            "faster-qwen3-tts сбил CUDA torch — возвращаю cu128",
          );
          for (const indexUrl of TORCH_CUDA_INDEX_URLS) {
            const install = withPythonArgs(python, [
              "-m",
              "pip",
              "install",
              "--upgrade",
              "--disable-pip-version-check",
              "torch",
              "--index-url",
              indexUrl,
            ]);
            try {
              await opts.run(install.cmd, install.args);
              cuda = await hasCuda();
              if (cuda) break;
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              runtimeNotes.push(msg.replace(/\s+/g, " ").trim().slice(-120));
            }
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        runtimeNotes.push(
          `faster-qwen3-tts: ${msg.replace(/\s+/g, " ").trim().slice(-160)}`,
        );
      }
    }
  }

  const vllm = await canImport("vllm");
  const qwenTts = await canImport("qwen_tts");
  onProgress?.({
    phase: qwenTts || vllm
      ? cuda
        ? "Среда готова · CUDA"
        : ensureCudaTorch
          ? "Среда: qwen-tts есть, но torch без CUDA"
          : "Среда готова"
      : "Среда: веса качать можно, TTS-пакет не встал",
    pct: 55,
    detail: runtimeNotes[0] || python,
  });

  return {
    python,
    runtimeNotes,
    hub: requiredImports.includes("huggingface_hub")
      ? true
      : await canImport("huggingface_hub"),
    vllm,
    qwenTts,
    cuda,
  };
}
