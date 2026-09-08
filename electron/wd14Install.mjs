/**
 * App-managed WD14 env: venv + onnxruntime/fastapi + MoAT weights in userData.
 */
import { app } from "electron";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { downloadFile } from "./installDownload.mjs";
import { ensureQwenPythonEnv, venvPythonPath } from "./qwenEnv.mjs";
import { findHostPython, spawnCapture } from "./qwenInstall.mjs";
import {
  WD14_ONNX_URLS,
  WD14_TAGS_URLS,
  wd14ModelsReady,
} from "./wd14Runtime.mjs";

export { wd14ModelsReady } from "./wd14Runtime.mjs";

export const WD14_PACKAGES = [
  "fastapi",
  "uvicorn",
  "python-multipart",
  "onnxruntime",
  "numpy",
  "pillow",
];

/** Same browser UA as censorDetectInstall — HF /resolve returns 401 for custom agents. */
const HF_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

const HF_DL = { family: 4, userAgent: HF_UA };

async function downloadFirst(urls, dest, onProgress) {
  let last = null;
  for (const url of urls) {
    try {
      await downloadFile(url, dest, onProgress, undefined, HF_DL);
      return;
    } catch (err) {
      last = err;
    }
  }
  const why = last instanceof Error ? last.message : String(last || "нет адреса");
  throw new Error(`Не скачалась модель WD14: ${why}`);
}

export function wd14AppRoot() {
  return path.join(app.getPath("userData"), "wd14");
}

export function wd14AppVenvDir() {
  return path.join(wd14AppRoot(), "venv");
}

export function wd14AppModelDir() {
  return path.join(wd14AppRoot(), "models");
}

export function findAppWd14Python() {
  const py = venvPythonPath(wd14AppVenvDir());
  return existsSync(py) ? py : null;
}

/**
 * @param {(p: { phase: string, pct: number, detail?: string }) => void} [onProgress]
 */
export async function ensureWd14Runtime(onProgress) {
  mkdirSync(wd14AppModelDir(), { recursive: true });
  onProgress?.({
    phase: "Среда WD14",
    pct: 4,
    detail: "venv + pip",
  });
  await ensureQwenPythonEnv({
    venvDir: wd14AppVenvDir(),
    hostPython: findHostPython(),
    overridePython: process.env.WD14_PYTHON || "",
    downloadPackages: [],
    runtimePackages: WD14_PACKAGES,
    requiredImports: ["onnxruntime", "fastapi"],
    tryVllm: false,
    ensureCudaTorch: false,
    run: spawnCapture,
    onProgress: (p) =>
      onProgress?.({
        phase: p.phase,
        pct: Math.min(55, Math.round((p.pct || 1) * 0.55)),
        detail: p.detail || p.line,
      }),
  });

  const destOnnx = path.join(wd14AppModelDir(), "model.onnx");
  const destCsv = path.join(wd14AppModelDir(), "selected_tags.csv");
  if (!wd14ModelsReady(wd14AppModelDir())) {
    if (!existsSync(destOnnx)) {
      onProgress?.({
        phase: "Скачиваю WD14 onnx",
        pct: 58,
        detail: "~330 МБ",
      });
      await downloadFirst(WD14_ONNX_URLS, destOnnx, (pct) =>
        onProgress?.({
          phase: "Скачиваю WD14 onnx",
          pct: 58 + Math.round(pct * 0.32),
          detail: `${pct}%`,
        }),
      );
    }
    if (!existsSync(destCsv)) {
      onProgress?.({ phase: "Скачиваю теги WD14", pct: 92, detail: destCsv });
      await downloadFirst(WD14_TAGS_URLS, destCsv);
    }
  }
  if (!wd14ModelsReady(wd14AppModelDir())) {
    throw new Error("WD14: после скачивания нет model.onnx / selected_tags.csv");
  }
  onProgress?.({
    phase: "WD14 готов",
    pct: 100,
    detail: wd14AppModelDir(),
  });
  return {
    python: findAppWd14Python(),
    modelDir: wd14AppModelDir(),
  };
}
