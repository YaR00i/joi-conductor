import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  FASTER_QWEN_TTS_PACKAGE,
  QWEN_DOWNLOAD_PACKAGES,
  QWEN_RUNTIME_PACKAGES,
  TORCH_CUDA_INDEX_URLS,
  TORCH_CUDA_PROBE_CODE,
  describeQwenEnv,
  ensureQwenPythonEnv,
  importNameForPackage,
  isCpuTorchVersion,
  isPyLauncher,
  venvHasPackage,
  venvPythonPath,
  withPythonArgs,
} from "./qwenEnv.mjs";
import { qwenHealthDetail } from "./qwen.mjs";

describe("qwenEnv paths", () => {
  it("maps Windows venv python and launcher args", () => {
    expect(venvPythonPath("C:\\\\env", "win32").replace(/\\/g, "/")).toMatch(
      /Scripts\/python\.exe$/,
    );
    expect(venvPythonPath("/tmp/env", "linux").replace(/\\/g, "/")).toBe(
      "/tmp/env/bin/python",
    );
    expect(isPyLauncher("py")).toBe(true);
    expect(withPythonArgs("py", ["-m", "venv", "x"]).args).toEqual([
      "-3",
      "-m",
      "venv",
      "x",
    ]);
    expect(withPythonArgs("C:\\\\Python312\\\\python.exe", ["-c", "1"]).args).toEqual(
      ["-c", "1"],
    );
    expect(importNameForPackage("huggingface_hub")).toBe("huggingface_hub");
    expect(importNameForPackage("qwen-tts")).toBe("qwen_tts");
  });

  it("detects site-packages markers", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "qwen-env-"));
    try {
      const venv = path.join(root, "venv");
      mkdirSync(path.join(venv, "Lib", "site-packages", "huggingface_hub"), {
        recursive: true,
      });
      mkdirSync(path.join(venv, "Scripts"), { recursive: true });
      writeFileSync(path.join(venv, "Scripts", "vllm.exe"), "");
      expect(venvHasPackage(venv, "huggingface_hub", "win32")).toBe(true);
      expect(venvHasPackage(venv, "vllm", "win32")).toBe(true);
      expect(venvHasPackage(venv, "tqdm", "win32")).toBe(false);
      mkdirSync(path.join(venv, "Lib", "site-packages", "torch-2.13.0+cpu.dist-info"), {
        recursive: true,
      });
      const st = describeQwenEnv(venv, "py", "win32");
      expect(st.hub).toBe(true);
      expect(st.vllm).toBe(true);
      expect(st.torchCpu).toBe(true);
      expect(st.torchCuda).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("ensureQwenPythonEnv", () => {
  it("creates venv, installs qwen-tts, and keeps going if vllm pip fails", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "qwen-ensure-"));
    const venvDir = path.join(root, "venv");
    const venvPy = venvPythonPath(venvDir);
    const calls = [];
    const imported = new Set();
    try {
      const env = await ensureQwenPythonEnv({
        venvDir,
        hostPython: "py",
        tryVllm: true,
        ensureCudaTorch: false,
        run: async (cmd, args) => {
          calls.push({ cmd, args: [...args] });
          if (args.includes("venv")) {
            mkdirSync(path.dirname(venvPy), { recursive: true });
            writeFileSync(venvPy, "");
            return;
          }
          const codeIdx = args.indexOf("-c");
          if (codeIdx >= 0) {
            const code = String(args[codeIdx + 1] || "");
            const mod = code.replace(/^import\s+/, "").trim();
            if (imported.has(mod)) return;
            throw new Error(`No module named ${mod}`);
          }
          if (args.includes("pip") && args.includes("vllm")) {
            throw new Error("No matching distribution found for vllm");
          }
          if (args.includes("pip")) {
            for (const pkg of args) {
              if (pkg.startsWith("-")) continue;
              if (pkg === "pip" || pkg === "install" || pkg === "upgrade") continue;
              imported.add(importNameForPackage(pkg));
            }
          }
        },
      });
      expect(env.hub).toBe(true);
      expect(env.qwenTts).toBe(true);
      expect(env.vllm).toBe(false);
      expect(env.python).toBe(venvPy);
      expect(env.runtimeNotes.some((n) => n.startsWith("vllm:"))).toBe(true);
      expect(calls.some((c) => c.args.includes("venv"))).toBe(true);
      expect(
        calls.some(
          (c) => c.args.includes("pip") && c.args.includes("qwen-tts"),
        ),
      ).toBe(true);
      expect(QWEN_DOWNLOAD_PACKAGES).toEqual(["huggingface_hub", "tqdm"]);
      expect(QWEN_RUNTIME_PACKAGES).toEqual(["qwen-tts", "soundfile"]);
      expect(FASTER_QWEN_TTS_PACKAGE).toBe("faster-qwen3-tts");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("installs qwen-tts on Windows and skips vllm", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "qwen-win-"));
    const venvDir = path.join(root, "venv");
    const venvPy = venvPythonPath(venvDir);
    const calls = [];
    const imported = new Set();
    try {
      const env = await ensureQwenPythonEnv({
        venvDir,
        hostPython: "py",
        platform: "win32",
        ensureCudaTorch: false,
        run: async (_cmd, args) => {
          calls.push([...args]);
          if (args.includes("venv")) {
            mkdirSync(path.dirname(venvPy), { recursive: true });
            writeFileSync(venvPy, "");
            return;
          }
          const codeIdx = args.indexOf("-c");
          if (codeIdx >= 0) {
            const code = String(args[codeIdx + 1] || "");
            const mod = code.replace(/^import\s+/, "").trim();
            if (imported.has(mod)) return;
            throw new Error(`No module named ${mod}`);
          }
          if (args.includes("pip")) {
            for (const pkg of args) {
              if (pkg.startsWith("-")) continue;
              if (pkg === "pip" || pkg === "install" || pkg === "upgrade") continue;
              imported.add(importNameForPackage(pkg));
            }
          }
        },
      });
      expect(env.hub).toBe(true);
      expect(env.qwenTts).toBe(true);
      expect(env.vllm).toBe(false);
      expect(calls.some((a) => a.includes("vllm"))).toBe(false);
      expect(calls.some((a) => a.includes("qwen-tts"))).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("uses override python and skips venv create", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "qwen-ov-"));
    const override = path.join(root, "custom-python.exe");
    writeFileSync(override, "");
    const calls = [];
    try {
      await ensureQwenPythonEnv({
        venvDir: path.join(root, "venv"),
        hostPython: "py",
        overridePython: override,
        downloadPackages: ["huggingface_hub"],
        runtimePackages: [],
        ensureCudaTorch: false,
        run: async (cmd, args) => {
          calls.push({ cmd, args: [...args] });
          const codeIdx = args.indexOf("-c");
          if (codeIdx >= 0) return;
        },
      });
      expect(calls.some((c) => c.args.includes("venv"))).toBe(false);
      expect(calls[0]?.cmd).toBe(override);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("replaces CPU torch with a CUDA wheel", async () => {
    expect(isCpuTorchVersion("2.13.0+cpu")).toBe(true);
    expect(isCpuTorchVersion("2.13.0+cu128")).toBe(false);
    expect(TORCH_CUDA_INDEX_URLS[0]).toContain("cu128");

    const root = mkdtempSync(path.join(os.tmpdir(), "qwen-cuda-"));
    const venvDir = path.join(root, "venv");
    const venvPy = venvPythonPath(venvDir);
    const calls = [];
    const imported = new Set(["huggingface_hub", "tqdm", "qwen_tts", "soundfile"]);
    let cudaReady = false;
    try {
      const env = await ensureQwenPythonEnv({
        venvDir,
        hostPython: "py",
        platform: "win32",
        downloadPackages: [],
        runtimePackages: [],
        requiredImports: [],
        ensureCudaTorch: true,
        run: async (_cmd, args) => {
          calls.push([...args]);
          if (args.includes("venv")) {
            mkdirSync(path.dirname(venvPy), { recursive: true });
            writeFileSync(venvPy, "");
            return;
          }
          const codeIdx = args.indexOf("-c");
          if (codeIdx >= 0) {
            const code = String(args[codeIdx + 1] || "");
            if (code === TORCH_CUDA_PROBE_CODE) {
              if (cudaReady) return;
              throw new Error("CUDA unavailable");
            }
            const mod = code.replace(/^import\s+/, "").trim();
            if (mod === "faster_qwen3_tts" && !imported.has("faster_qwen3_tts")) {
              throw new Error("No module named faster_qwen3_tts");
            }
            return;
          }
          if (args.includes("pip") && args.includes("uninstall")) return;
          if (args.includes("pip") && args.includes(FASTER_QWEN_TTS_PACKAGE)) {
            imported.add("faster_qwen3_tts");
            return;
          }
          if (args.includes("pip") && args.includes("torch")) {
            expect(args).toContain("--index-url");
            expect(args).toContain(TORCH_CUDA_INDEX_URLS[0]);
            cudaReady = true;
          }
        },
      });
      expect(env.cuda).toBe(true);
      expect(
        calls.some((a) => a.includes("torch") && a.includes("--index-url")),
      ).toBe(true);
      expect(calls.some((a) => a.includes(FASTER_QWEN_TTS_PACKAGE))).toBe(true);
      expect(imported.size).toBeGreaterThan(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("qwenHealthDetail", () => {
  it("marks CUDA graphs when faster backend is up", () => {
    expect(
      qwenHealthDetail({
        device: "cuda",
        gpu: "NVIDIA GeForce RTX 5070",
        torch: "2.11.0+cu128",
        backend: "faster",
      }),
    ).toBe("онлайн · GPU · NVIDIA GeForce RTX 5070 · CUDA graphs");
    expect(
      qwenHealthDetail({
        device: "cuda",
        gpu: "NVIDIA GeForce RTX 5070",
        torch: "2.11.0+cu128",
        backend: "qwen_tts",
      }),
    ).toBe("онлайн · GPU · NVIDIA GeForce RTX 5070");
  });
});
