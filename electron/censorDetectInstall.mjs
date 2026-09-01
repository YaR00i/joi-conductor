/**
 * Anime YOLO (deepghs MIT) + Hotscreen YOLOX-real (MIT) + onnxruntime-web WASM.
 * Downloaded into userData; not vendored. Do not ship Ultralytics YOLO11 (AGPL).
 */
import { createHash } from "node:crypto";
import { app } from "electron";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  unlinkSync,
} from "node:fs";
import path from "node:path";
import { downloadFile } from "./installDownload.mjs";

export const CENSOR_DETECT_ONNX_URL =
  "https://huggingface.co/Perfectfox256/hotscreen-detection-models/resolve/main/yolox-07-2025/hs-yx-real-320-fp32.onnx?download=true";
export const CENSOR_DETECT_LICENSE_URL =
  "https://huggingface.co/Perfectfox256/hotscreen-detection-models/resolve/main/yolox-07-2025/LICENSE";
export const CENSOR_DETECT_ONNX_SHA256 =
  "aaa1e90537c312467eb1d3de0c615beed8d02ec7f632f506f12838d6a80ed538";
export const CENSOR_DETECT_ONNX_BYTES = 20_198_519;
export const CENSOR_DETECT_ONNX_NAME = "hs-yx-real-320-fp32.onnx";
export const CENSOR_DETECT_STALL_MS = 90_000;

export const CENSOR_DETECT_ANIME_ONNX_URL =
  "https://huggingface.co/deepghs/anime_censor_detection/resolve/main/censor_detect_v1.0_n/model.onnx?download=true";
export const CENSOR_DETECT_ANIME_ONNX_SHA256 =
  "029de0a116f6c3c73bde62d2a8354c78664795579858f3c8e28fc1b4633a891c";
export const CENSOR_DETECT_ANIME_ONNX_BYTES = 12_104_146;
export const CENSOR_DETECT_ANIME_ONNX_NAME = "censor_detect_v1.0_n.onnx";

export const CENSOR_DETECT_BOORU_ONNX_URL =
  "https://huggingface.co/deepghs/booru_yolo/resolve/main/yolov8n_as01/model.onnx?download=true";
export const CENSOR_DETECT_BOORU_ONNX_SHA256 =
  "b4e89a4091462c4e0da177091aaa62b6d6fd5c61a651097c51563d9dff1017a1";
export const CENSOR_DETECT_BOORU_ONNX_BYTES = 12_110_833;
export const CENSOR_DETECT_BOORU_ONNX_NAME = "yolov8n_as01.onnx";

export const CENSOR_DETECT_HAND_ONNX_URL =
  "https://huggingface.co/deepghs/anime_hand_detection/resolve/main/hand_detect_v1.0_n/model.onnx?download=true";
export const CENSOR_DETECT_HAND_ONNX_SHA256 =
  "b2ebc532c852ae0f09c109f3779573d6f43f67645344484d4a187f91ff4da14e";
export const CENSOR_DETECT_HAND_ONNX_BYTES = 12_102_558;
export const CENSOR_DETECT_HAND_ONNX_NAME = "hand_detect_v1.0_n.onnx";

export const CENSOR_DETECT_PP_ONNX_URL =
  "https://huggingface.co/deepghs/booru_yolo/resolve/main/yolov8s_pp12/model.onnx?download=true";
export const CENSOR_DETECT_PP_ONNX_SHA256 =
  "440def6d972d82cf1ea9abc42845d51c0911a3c26b718a01b741f9ceb65162f2";
export const CENSOR_DETECT_PP_ONNX_BYTES = 44_584_088;
export const CENSOR_DETECT_PP_ONNX_NAME = "yolov8s_pp12.onnx";

export const CENSOR_DETECT_ORT_VERSION = "1.21.0";
export const CENSOR_DETECT_ORT_FILES = [
  "ort.min.js",
  "ort-wasm-simd-threaded.wasm",
  "ort-wasm-simd-threaded.mjs",
  "ort-wasm-simd-threaded.jsep.wasm",
  "ort-wasm-simd-threaded.jsep.mjs",
];

const HF_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

function censorDetectRoot() {
  return path.join(app.getPath("userData"), "censor-detect");
}

export function censorDetectOrtDir() {
  return path.join(censorDetectRoot(), "ort");
}

function onnxPath() {
  return path.join(censorDetectRoot(), CENSOR_DETECT_ONNX_NAME);
}

function animePath() {
  return path.join(censorDetectRoot(), CENSOR_DETECT_ANIME_ONNX_NAME);
}

function booruPath() {
  return path.join(censorDetectRoot(), CENSOR_DETECT_BOORU_ONNX_NAME);
}

function handPath() {
  return path.join(censorDetectRoot(), CENSOR_DETECT_HAND_ONNX_NAME);
}

function ppPath() {
  return path.join(censorDetectRoot(), CENSOR_DETECT_PP_ONNX_NAME);
}

function licensePath() {
  return path.join(censorDetectRoot(), "LICENSE");
}

function sha256File(filePath) {
  const hash = createHash("sha256");
  hash.update(readFileSync(filePath));
  return hash.digest("hex");
}

function fileLooksReady(filePath, minBytes) {
  return existsSync(filePath) && statSync(filePath).size >= minBytes;
}

function ortFileMinBytes(name) {
  return name.endsWith(".wasm") ? 100_000 : 500;
}

export function getCensorDetectStatus() {
  const realFile = onnxPath();
  const animeFile = animePath();
  const booruFile = booruPath();
  const handFile = handPath();
  const ppFile = ppPath();
  const onnxReady =
    existsSync(realFile) && statSync(realFile).size === CENSOR_DETECT_ONNX_BYTES;
  const animeReady =
    existsSync(animeFile) &&
    statSync(animeFile).size === CENSOR_DETECT_ANIME_ONNX_BYTES;
  const booruReady =
    existsSync(booruFile) &&
    statSync(booruFile).size === CENSOR_DETECT_BOORU_ONNX_BYTES;
  const handReady =
    existsSync(handFile) &&
    statSync(handFile).size === CENSOR_DETECT_HAND_ONNX_BYTES;
  const ppReady =
    existsSync(ppFile) && statSync(ppFile).size === CENSOR_DETECT_PP_ONNX_BYTES;
  const ortDir = censorDetectOrtDir();
  const engineReady = CENSOR_DETECT_ORT_FILES.every((name) =>
    fileLooksReady(path.join(ortDir, name), ortFileMinBytes(name)),
  );
  return {
    ready: animeReady && booruReady && engineReady,
    onnxReady,
    animeReady,
    booruReady,
    handReady,
    ppReady,
    engineReady,
    bytes: existsSync(booruFile) ? statSync(booruFile).size : 0,
    path: booruFile,
  };
}

async function downloadWithRetry(url, dest, onProgress) {
  let lastErr = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      if (existsSync(dest)) {
        try {
          unlinkSync(dest);
        } catch {
          /* replace */
        }
      }
      await downloadFile(url, dest, onProgress, CENSOR_DETECT_STALL_MS, {
        family: 4,
        userAgent: HF_UA,
      });
      return;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

async function installAnime(onProgress) {
  const dest = animePath();
  if (getCensorDetectStatus().animeReady) return;
  onProgress?.({ phase: "Скачиваю аниме…", pct: 2 });
  await downloadWithRetry(CENSOR_DETECT_ANIME_ONNX_URL, dest, (pct) =>
    onProgress?.({
      phase: "Скачиваю аниме…",
      pct: Math.min(16, Math.max(2, Math.round(pct * 0.14))),
    }),
  );
  const hex = sha256File(dest);
  if (hex !== CENSOR_DETECT_ANIME_ONNX_SHA256) {
    try {
      unlinkSync(dest);
    } catch {
      /* ignore */
    }
    throw new Error("Модель аниме повреждена (не сошёлся sha256)");
  }
}

async function installBooru(onProgress) {
  const dest = booruPath();
  if (getCensorDetectStatus().booruReady) return;
  onProgress?.({ phase: "Скачиваю тело…", pct: 16 });
  await downloadWithRetry(CENSOR_DETECT_BOORU_ONNX_URL, dest, (pct) =>
    onProgress?.({
      phase: "Скачиваю тело…",
      pct: Math.min(28, Math.max(16, 16 + Math.round(pct * 0.12))),
    }),
  );
  const hex = sha256File(dest);
  if (hex !== CENSOR_DETECT_BOORU_ONNX_SHA256) {
    try {
      unlinkSync(dest);
    } catch {
      /* ignore */
    }
    throw new Error("Модель тела повреждена (не сошёлся sha256)");
  }
}

async function installHand(onProgress) {
  const dest = handPath();
  if (getCensorDetectStatus().handReady) return;
  onProgress?.({ phase: "Скачиваю руки…", pct: 28 });
  await downloadWithRetry(CENSOR_DETECT_HAND_ONNX_URL, dest, (pct) =>
    onProgress?.({
      phase: "Скачиваю руки…",
      pct: Math.min(40, Math.max(28, 28 + Math.round(pct * 0.12))),
    }),
  );
  const hex = sha256File(dest);
  if (hex !== CENSOR_DETECT_HAND_ONNX_SHA256) {
    try {
      unlinkSync(dest);
    } catch {
      /* ignore */
    }
    throw new Error("Модель рук повреждена (не сошёлся sha256)");
  }
}

async function installPp(onProgress) {
  const dest = ppPath();
  if (getCensorDetectStatus().ppReady) return;
  onProgress?.({ phase: "Скачиваю позы…", pct: 40 });
  await downloadWithRetry(CENSOR_DETECT_PP_ONNX_URL, dest, (pct) =>
    onProgress?.({
      phase: "Скачиваю позы…",
      pct: Math.min(62, Math.max(40, 40 + Math.round(pct * 0.22))),
    }),
  );
  const hex = sha256File(dest);
  if (hex !== CENSOR_DETECT_PP_ONNX_SHA256) {
    try {
      unlinkSync(dest);
    } catch {
      /* ignore */
    }
    throw new Error("Модель поз повреждена (не сошёлся sha256)");
  }
}

async function installOnnx(onProgress) {
  const dest = onnxPath();
  if (getCensorDetectStatus().onnxReady) return;
  onProgress?.({ phase: "Скачиваю YOLOX…", pct: 62 });
  await downloadWithRetry(CENSOR_DETECT_ONNX_URL, dest, (pct) =>
    onProgress?.({
      phase: "Скачиваю YOLOX…",
      pct: Math.min(72, Math.max(62, 62 + Math.round(pct * 0.1))),
    }),
  );
  const hex = sha256File(dest);
  if (hex !== CENSOR_DETECT_ONNX_SHA256) {
    try {
      unlinkSync(dest);
    } catch {
      /* ignore */
    }
    throw new Error("Модель YOLOX повреждена (не сошёлся sha256)");
  }
}

async function installOrt(onProgress) {
  const dir = censorDetectOrtDir();
  mkdirSync(dir, { recursive: true });
  const missing = CENSOR_DETECT_ORT_FILES.filter(
    (name) => !fileLooksReady(path.join(dir, name), ortFileMinBytes(name)),
  );
  if (missing.length === 0) return;
  const base = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${CENSOR_DETECT_ORT_VERSION}/dist/`;
  for (let i = 0; i < missing.length; i += 1) {
    const name = missing[i];
    const dest = path.join(dir, name);
    const start = 74 + Math.round((i / missing.length) * 20);
    onProgress?.({ phase: "Скачиваю движок…", pct: start });
    await downloadWithRetry(`${base}${name}`, dest, (pct) =>
      onProgress?.({
        phase: "Скачиваю движок…",
        pct: Math.min(96, start + Math.round(pct * (20 / missing.length) * 0.01 * 100) / 100),
      }),
    );
  }
}

/**
 * @param {(p: { phase: string, pct: number }) => void} [onProgress]
 */
export async function installCensorDetect(onProgress) {
  mkdirSync(censorDetectRoot(), { recursive: true });
  await installAnime(onProgress);
  await installBooru(onProgress);
  try {
    await installHand(onProgress);
  } catch {
    /* hands are extra zones; body models still run */
  }
  try {
    await installPp(onProgress);
  } catch {
    /* pose/acts model is extra; body models still run */
  }
  try {
    await installOnnx(onProgress);
  } catch {
    /* real YOLOX is optional; anime is enough for JOI media */
  }
  await installOrt(onProgress);
  if (!existsSync(licensePath())) {
    try {
      await downloadFile(
        CENSOR_DETECT_LICENSE_URL,
        licensePath(),
        undefined,
        CENSOR_DETECT_STALL_MS,
        { family: 4, userAgent: HF_UA },
      );
    } catch {
      /* license is documentation, not required to run */
    }
  }
  const status = getCensorDetectStatus();
  if (!status.ready) {
    throw new Error("Движок нейросети не скачался");
  }
  onProgress?.({ phase: "Готово", pct: 100 });
  return status;
}

export function readCensorDetectModel() {
  const status = getCensorDetectStatus();
  if (!status.onnxReady) {
    throw new Error("Модель YOLOX не скачана");
  }
  const buf = readFileSync(onnxPath());
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

export function readCensorDetectAnimeModel() {
  const status = getCensorDetectStatus();
  if (!status.animeReady) {
    throw new Error("Модель аниме не скачана");
  }
  const buf = readFileSync(animePath());
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

export function readCensorDetectBooruModel() {
  const status = getCensorDetectStatus();
  if (!status.booruReady) {
    throw new Error("Модель тела не скачана");
  }
  const buf = readFileSync(booruPath());
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

export function readCensorDetectHandModel() {
  const status = getCensorDetectStatus();
  if (!status.handReady) {
    throw new Error("Модель рук не скачана");
  }
  const buf = readFileSync(handPath());
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

export function readCensorDetectPpModel() {
  const status = getCensorDetectStatus();
  if (!status.ppReady) {
    throw new Error("Модель поз не скачана");
  }
  const buf = readFileSync(ppPath());
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}
