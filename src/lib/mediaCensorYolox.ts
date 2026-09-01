/**
 * Anime YOLO: booru body + nipple/pussy nano + hands + pose/acts on one
 * stretch-640 tensor, plus YOLOX-real for photos. Inference via
 * onnxruntime-web WASM in userData, not a CDN hop in the window.
 */
import {
  CENSOR_DETECT_ANIME_NUM_CLASSES,
  CENSOR_DETECT_ANIME_ONNX_URL,
  CENSOR_DETECT_BOORU_INPUT,
  CENSOR_DETECT_BOORU_NUM_CLASSES,
  CENSOR_DETECT_BOORU_ONNX_URL,
  CENSOR_DETECT_HAND_NUM_CLASSES,
  CENSOR_DETECT_HAND_ONNX_URL,
  CENSOR_DETECT_INPUT,
  CENSOR_DETECT_ONNX_URL,
  CENSOR_DETECT_PP_NUM_CLASSES,
  CENSOR_DETECT_PP_ONNX_URL,
  animeClassToPart,
  booruClassToPart,
  censorDetectAnimeModelMatches,
  censorDetectBooruModelMatches,
  censorDetectHandModelMatches,
  censorDetectModelMatches,
  censorDetectPpModelMatches,
  decodeYoloV8Output,
  decodeYoloxOutput,
  emptyCensorDetectRun,
  handClassToPart,
  hitsFromDetections,
  mapDetectionsToSrc,
  nmsDetections,
  ppClassToPart,
  rgbaToYoloV8Input,
  rgbaToYoloxInput,
  sha256Hex,
  srcDetectionsToNormBoxes,
  type CensorDetectRun,
  type CensorDetectSource,
  type YoloxDetection,
} from "./mediaCensorDetect";
import type { MediaCensorBox, MediaCensorPart, MediaCensorPartFlags } from "./mediaCensor";
import { penisHoleOrientationRad } from "./mediaCensorPenisAxis";

const ORT_CDN =
  "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.21.0/dist/";
const ORT_LOCAL = "joi-censor://detect/";

type OrtTensor = {
  data: Float32Array;
  dims: number[];
};

type OrtSession = {
  run: (feeds: Record<string, unknown>) => Promise<Record<string, OrtTensor>>;
};

type OrtApi = {
  env: { wasm: { wasmPaths: string; numThreads?: number; proxy?: boolean } };
  InferenceSession: {
    create: (
      src: Uint8Array | ArrayBuffer,
      opts?: { executionProviders?: string[] },
    ) => Promise<OrtSession>;
  };
  Tensor: new (
    type: string,
    data: Float32Array,
    dims: number[],
  ) => unknown;
};

declare global {
  interface Window {
    ort?: OrtApi;
  }
}

let animeBytes: Uint8Array | null = null;
let booruBytes: Uint8Array | null = null;
let handBytes: Uint8Array | null = null;
let ppBytes: Uint8Array | null = null;
let realBytes: Uint8Array | null = null;
let animeSession: OrtSession | null = null;
let booruSession: OrtSession | null = null;
let handSession: OrtSession | null = null;
let ppSession: OrtSession | null = null;
let realSession: OrtSession | null = null;
let ortApi: OrtApi | null = null;
let workCanvas: HTMLCanvasElement | null = null;
let penisAxisCanvas: HTMLCanvasElement | null = null;
let animeLoadPromise: Promise<OrtSession> | null = null;
let booruLoadPromise: Promise<OrtSession> | null = null;
let handLoadPromise: Promise<OrtSession | null> | null = null;
let ppLoadPromise: Promise<OrtSession | null> | null = null;
let realLoadPromise: Promise<OrtSession | null> | null = null;

function sourceSize(
  el: HTMLImageElement | HTMLVideoElement,
): { w: number; h: number } {
  if (el instanceof HTMLVideoElement) {
    return { w: el.videoWidth, h: el.videoHeight };
  }
  return { w: el.naturalWidth, h: el.naturalHeight };
}

function ortBase(): string {
  return window.joiDesktop?.media?.censorDetectStatus ? ORT_LOCAL : ORT_CDN;
}

function wasmThreadCount(): number {
  if (typeof crossOriginIsolated !== "undefined" && crossOriginIsolated) {
    const cores =
      typeof navigator !== "undefined" ? navigator.hardwareConcurrency || 2 : 2;
    return Math.min(4, Math.max(1, cores));
  }
  return 1;
}

async function loadOrt(): Promise<OrtApi> {
  if (ortApi) return ortApi;
  const base = ortBase();
  if (typeof window !== "undefined" && window.ort) {
    ortApi = window.ort;
    ortApi.env.wasm.wasmPaths = base;
    ortApi.env.wasm.numThreads = wasmThreadCount();
    ortApi.env.wasm.proxy = false;
    return ortApi;
  }
  await new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      "script[data-joi-ort]",
    );
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener(
        "error",
        () => reject(new Error("onnxruntime не загрузился")),
        { once: true },
      );
      return;
    }
    const script = document.createElement("script");
    script.src = `${base}ort.min.js`;
    script.async = true;
    script.dataset.joiOrt = "1";
    script.onload = () => resolve();
    script.onerror = () =>
      reject(new Error("onnxruntime не загрузился (нет файла движка)"));
    document.head.appendChild(script);
  });
  if (!window.ort) throw new Error("onnxruntime не загрузился");
  ortApi = window.ort;
  ortApi.env.wasm.wasmPaths = base;
  ortApi.env.wasm.numThreads = wasmThreadCount();
  ortApi.env.wasm.proxy = false;
  return ortApi;
}

async function fetchOnnx(
  url: string,
  matches: (bytes: Uint8Array, sha: string) => boolean,
  label: string,
  timeoutMs = 0,
): Promise<Uint8Array> {
  const ctrl = timeoutMs > 0 ? new AbortController() : null;
  const timer =
    ctrl && timeoutMs > 0
      ? window.setTimeout(() => ctrl.abort(), timeoutMs)
      : 0;
  try {
    const res = await fetch(url, ctrl ? { signal: ctrl.signal } : undefined);
    if (!res.ok) {
      throw new Error(`Hugging Face HTTP ${res.status}`);
    }
    const buf = new Uint8Array(await res.arrayBuffer());
    const hex = await sha256Hex(buf);
    if (!matches(buf, hex)) {
      throw new Error(`${label} повреждена (не сошёлся sha256)`);
    }
    return buf;
  } finally {
    if (timer) window.clearTimeout(timer);
  }
}

async function bytesFromIpc(
  raw: ArrayBuffer | Uint8Array,
  matches: (bytes: Uint8Array, sha: string) => boolean,
  label: string,
): Promise<Uint8Array> {
  const bytes = raw instanceof Uint8Array ? raw : new Uint8Array(raw);
  const hex = await sha256Hex(bytes);
  if (!matches(bytes, hex)) {
    throw new Error(`${label} повреждена (не сошёлся sha256)`);
  }
  return bytes;
}

export async function ensureAnimeDetectModel(
  onProgress?: (p: { phase: string; pct: number }) => void,
): Promise<Uint8Array> {
  if (animeBytes) return animeBytes;
  const api = window.joiDesktop?.media;
  if (
    api?.censorDetectStatus &&
    api.censorDetectInstall &&
    api.censorDetectAnimeModel
  ) {
    let status = await api.censorDetectStatus();
    if (!status.animeReady) {
      onProgress?.({ phase: "Скачиваю аниме…", pct: 1 });
      status = await api.censorDetectInstall();
    }
    if (!status.animeReady) {
      throw new Error("Модель аниме не скачана");
    }
    onProgress?.({ phase: "Читаю аниме", pct: 90 });
    const raw = await api.censorDetectAnimeModel();
    animeBytes = await bytesFromIpc(
      raw,
      censorDetectAnimeModelMatches,
      "Модель аниме",
    );
    onProgress?.({ phase: "Готово", pct: 100 });
    return animeBytes;
  }
  onProgress?.({ phase: "Скачиваю аниме…", pct: 8 });
  animeBytes = await fetchOnnx(
    CENSOR_DETECT_ANIME_ONNX_URL,
    censorDetectAnimeModelMatches,
    "Модель аниме",
  );
  onProgress?.({ phase: "Готово", pct: 100 });
  return animeBytes;
}

export async function ensureBooruDetectModel(
  onProgress?: (p: { phase: string; pct: number }) => void,
): Promise<Uint8Array> {
  if (booruBytes) return booruBytes;
  const api = window.joiDesktop?.media;
  if (
    api?.censorDetectStatus &&
    api.censorDetectInstall &&
    api.censorDetectBooruModel
  ) {
    let status = await api.censorDetectStatus();
    if (!status.booruReady) {
      onProgress?.({ phase: "Скачиваю тело…", pct: 1 });
      status = await api.censorDetectInstall();
    }
    if (!status.booruReady) {
      throw new Error("Модель тела не скачана");
    }
    onProgress?.({ phase: "Читаю тело", pct: 90 });
    const raw = await api.censorDetectBooruModel();
    booruBytes = await bytesFromIpc(
      raw,
      censorDetectBooruModelMatches,
      "Модель тела",
    );
    onProgress?.({ phase: "Готово", pct: 100 });
    return booruBytes;
  }
  onProgress?.({ phase: "Скачиваю тело…", pct: 8 });
  booruBytes = await fetchOnnx(
    CENSOR_DETECT_BOORU_ONNX_URL,
    censorDetectBooruModelMatches,
    "Модель тела",
  );
  onProgress?.({ phase: "Готово", pct: 100 });
  return booruBytes;
}

export async function ensureHandDetectModel(
  onProgress?: (p: { phase: string; pct: number }) => void,
): Promise<Uint8Array | null> {
  if (handBytes) return handBytes;
  const api = window.joiDesktop?.media;
  try {
    if (
      api?.censorDetectStatus &&
      api.censorDetectInstall &&
      api.censorDetectHandModel
    ) {
      let status = await api.censorDetectStatus();
      if (!status.handReady) {
        onProgress?.({ phase: "Скачиваю руки…", pct: 1 });
        try {
          status = await api.censorDetectInstall();
        } catch {
          return null;
        }
      }
      if (!status.handReady) return null;
      onProgress?.({ phase: "Читаю руки", pct: 90 });
      const raw = await api.censorDetectHandModel();
      handBytes = await bytesFromIpc(
        raw,
        censorDetectHandModelMatches,
        "Модель рук",
      );
      onProgress?.({ phase: "Готово", pct: 100 });
      return handBytes;
    }
    onProgress?.({ phase: "Скачиваю руки…", pct: 8 });
    handBytes = await fetchOnnx(
      CENSOR_DETECT_HAND_ONNX_URL,
      censorDetectHandModelMatches,
      "Модель рук",
      180_000,
    );
    onProgress?.({ phase: "Готово", pct: 100 });
    return handBytes;
  } catch {
    return null;
  }
}

export async function ensurePpDetectModel(
  onProgress?: (p: { phase: string; pct: number }) => void,
): Promise<Uint8Array | null> {
  if (ppBytes) return ppBytes;
  const api = window.joiDesktop?.media;
  try {
    if (
      api?.censorDetectStatus &&
      api.censorDetectInstall &&
      api.censorDetectPpModel
    ) {
      let status = await api.censorDetectStatus();
      if (!status.ppReady) {
        onProgress?.({ phase: "Скачиваю позы…", pct: 1 });
        try {
          status = await api.censorDetectInstall();
        } catch {
          return null;
        }
      }
      if (!status.ppReady) return null;
      onProgress?.({ phase: "Читаю позы", pct: 90 });
      const raw = await api.censorDetectPpModel();
      ppBytes = await bytesFromIpc(
        raw,
        censorDetectPpModelMatches,
        "Модель поз",
      );
      onProgress?.({ phase: "Готово", pct: 100 });
      return ppBytes;
    }
    onProgress?.({ phase: "Скачиваю позы…", pct: 8 });
    ppBytes = await fetchOnnx(
      CENSOR_DETECT_PP_ONNX_URL,
      censorDetectPpModelMatches,
      "Модель поз",
      180_000,
    );
    onProgress?.({ phase: "Готово", pct: 100 });
    return ppBytes;
  } catch {
    return null;
  }
}

export async function ensureCensorDetectModel(
  onProgress?: (p: { phase: string; pct: number }) => void,
): Promise<Uint8Array> {
  return ensureAnimeDetectModel(onProgress);
}

async function ensureRealDetectModel(): Promise<Uint8Array | null> {
  if (realBytes) return realBytes;
  const api = window.joiDesktop?.media;
  try {
    if (api?.censorDetectStatus && api.censorDetectModel) {
      const status = await api.censorDetectStatus();
      if (!status.onnxReady) return null;
      const raw = await api.censorDetectModel();
      realBytes = await bytesFromIpc(
        raw,
        censorDetectModelMatches,
        "Модель YOLOX",
      );
      return realBytes;
    }
    realBytes = await fetchOnnx(
      CENSOR_DETECT_ONNX_URL,
      censorDetectModelMatches,
      "Модель YOLOX",
    );
    return realBytes;
  } catch {
    return null;
  }
}

/** Download weights + engine, then create the WASM sessions. */
export async function warmupCensorDetect(
  onProgress?: (p: { phase: string; pct: number }) => void,
): Promise<void> {
  await ensureBooruDetectModel(onProgress);
  await ensureAnimeDetectModel();
  onProgress?.({ phase: "Запускаю тело…", pct: 88 });
  await Promise.all([ensureBooruSession(), ensureAnimeSession()]);
  onProgress?.({ phase: "Докачиваю руки и позы…", pct: 92 });
  await Promise.all([ensureHandSession(), ensurePpSession()]);
  void ensureRealSession();
  onProgress?.({ phase: "Готово", pct: 100 });
}

export async function getCensorDetectReady(): Promise<boolean> {
  if (booruBytes && animeBytes) return true;
  const api = window.joiDesktop?.media;
  if (api?.censorDetectStatus) {
    try {
      return Boolean((await api.censorDetectStatus()).ready);
    } catch {
      return false;
    }
  }
  return false;
}

async function ensureAnimeSession(): Promise<OrtSession> {
  if (animeSession) return animeSession;
  if (animeLoadPromise) return animeLoadPromise;
  animeLoadPromise = (async () => {
    const [ort, bytes] = await Promise.all([
      loadOrt(),
      ensureAnimeDetectModel(),
    ]);
    animeSession = await ort.InferenceSession.create(bytes, {
      executionProviders: ["wasm"],
    });
    return animeSession;
  })();
  try {
    return await animeLoadPromise;
  } catch (err) {
    animeLoadPromise = null;
    animeSession = null;
    throw err;
  }
}

async function ensureBooruSession(): Promise<OrtSession> {
  if (booruSession) return booruSession;
  if (booruLoadPromise) return booruLoadPromise;
  booruLoadPromise = (async () => {
    const [ort, bytes] = await Promise.all([
      loadOrt(),
      ensureBooruDetectModel(),
    ]);
    booruSession = await ort.InferenceSession.create(bytes, {
      executionProviders: ["wasm"],
    });
    return booruSession;
  })();
  try {
    return await booruLoadPromise;
  } catch (err) {
    booruLoadPromise = null;
    booruSession = null;
    throw err;
  }
}

async function ensureHandSession(): Promise<OrtSession | null> {
  if (handSession) return handSession;
  if (handLoadPromise) return handLoadPromise;
  handLoadPromise = (async () => {
    const [ort, bytes] = await Promise.all([
      loadOrt(),
      ensureHandDetectModel(),
    ]);
    if (!bytes) return null;
    handSession = await ort.InferenceSession.create(bytes, {
      executionProviders: ["wasm"],
    });
    return handSession;
  })();
  try {
    return await handLoadPromise;
  } catch {
    handLoadPromise = null;
    handSession = null;
    return null;
  }
}

async function ensurePpSession(): Promise<OrtSession | null> {
  if (ppSession) return ppSession;
  if (ppLoadPromise) return ppLoadPromise;
  ppLoadPromise = (async () => {
    const [ort, bytes] = await Promise.all([loadOrt(), ensurePpDetectModel()]);
    if (!bytes) return null;
    ppSession = await ort.InferenceSession.create(bytes, {
      executionProviders: ["wasm"],
    });
    return ppSession;
  })();
  try {
    return await ppLoadPromise;
  } catch {
    ppLoadPromise = null;
    ppSession = null;
    return null;
  }
}

async function ensureRealSession(): Promise<OrtSession | null> {
  if (realSession) return realSession;
  if (realLoadPromise) return realLoadPromise;
  realLoadPromise = (async () => {
    const bytes = await ensureRealDetectModel();
    if (!bytes) return null;
    const ort = await loadOrt();
    realSession = await ort.InferenceSession.create(bytes, {
      executionProviders: ["wasm"],
    });
    return realSession;
  })();
  try {
    return await realLoadPromise;
  } catch {
    realLoadPromise = null;
    realSession = null;
    return null;
  }
}

function workCanvasEl(): HTMLCanvasElement {
  if (!workCanvas) workCanvas = document.createElement("canvas");
  return workCanvas;
}

const PENIS_AXIS_SAMPLE_MAX = 96;

function penisAxisCanvasEl(): HTMLCanvasElement {
  if (!penisAxisCanvas) penisAxisCanvas = document.createElement("canvas");
  return penisAxisCanvas;
}

function samplePenisAxisRad(
  el: HTMLImageElement | HTMLVideoElement,
  media: { w: number; h: number },
  box: MediaCensorBox,
): number | null {
  const sx = box.x * media.w;
  const sy = box.y * media.h;
  const sw = box.w * media.w;
  const sh = box.h * media.h;
  if (sw < 8 || sh < 8) return null;
  const scale = PENIS_AXIS_SAMPLE_MAX / Math.max(sw, sh);
  const tw = Math.max(8, Math.round(sw * scale));
  const th = Math.max(8, Math.round(sh * scale));
  const canvas = penisAxisCanvasEl();
  canvas.width = tw;
  canvas.height = th;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  try {
    ctx.drawImage(el, sx, sy, sw, sh, 0, 0, tw, th);
    const image = ctx.getImageData(0, 0, tw, th);
    return penisHoleOrientationRad(image.data, tw, th);
  } catch {
    return null;
  }
}

function attachPenisHoleAxes(
  el: HTMLImageElement | HTMLVideoElement,
  media: { w: number; h: number },
  boxes: MediaCensorBox[],
): MediaCensorBox[] {
  return boxes.map((box) => {
    if (box.part !== "penis") return box;
    const axisRad = samplePenisAxisRad(el, media, box);
    return axisRad == null ? box : { ...box, axisRad };
  });
}

function firstOrtTensor(
  out: Record<string, OrtTensor>,
  names: string[],
): OrtTensor | undefined {
  for (const name of names) {
    if (out[name]?.data && out[name]?.dims) return out[name];
  }
  return Object.values(out)[0];
}

async function stretchYoloV8Tensor(
  el: HTMLImageElement | HTMLVideoElement,
  media: { w: number; h: number },
): Promise<{ tensor: unknown; size: number } | null> {
  const ort = await loadOrt();
  const size = CENSOR_DETECT_BOORU_INPUT;
  const canvas = workCanvasEl();
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(el, 0, 0, media.w, media.h, 0, 0, size, size);
  const image = ctx.getImageData(0, 0, size, size);
  const input = rgbaToYoloV8Input(image.data, size, size);
  const tensor = new ort.Tensor("float32", input, [1, 3, size, size]);
  return { tensor, size };
}

type YoloV8Kind = "anime" | "booru" | "pp" | "hand";

function yoloV8DecodeOpts(kind: YoloV8Kind): {
  numClasses: number;
  mapClass: (classId: number) => MediaCensorPart | null;
  source: CensorDetectSource;
} {
  switch (kind) {
    case "anime":
      return {
        numClasses: CENSOR_DETECT_ANIME_NUM_CLASSES,
        mapClass: animeClassToPart,
        source: "anime",
      };
    case "booru":
      return {
        numClasses: CENSOR_DETECT_BOORU_NUM_CLASSES,
        mapClass: booruClassToPart,
        source: "booru",
      };
    case "pp":
      return {
        numClasses: CENSOR_DETECT_PP_NUM_CLASSES,
        mapClass: ppClassToPart,
        source: "pp",
      };
    case "hand":
      return {
        numClasses: CENSOR_DETECT_HAND_NUM_CLASSES,
        mapClass: handClassToPart,
        source: "hand",
      };
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

async function runYoloV8Session(
  sess: OrtSession,
  tensor: unknown,
  media: { w: number; h: number },
  size: number,
  parts: MediaCensorPartFlags,
  stats: { maxScore: number },
  kind: YoloV8Kind,
): Promise<YoloxDetection[]> {
  const out = await sess.run({ images: tensor });
  const first = firstOrtTensor(out, ["output0", "output"]);
  if (!first?.data || !first.dims) return [];
  const opts = yoloV8DecodeOpts(kind);
  const dets = decodeYoloV8Output(first.data, first.dims, {
    parts,
    stats,
    numClasses: opts.numClasses,
    mapClass: opts.mapClass,
    source: opts.source,
  });
  return mapDetectionsToSrc(dets, media.w, media.h, size, "stretch");
}

async function runReal(
  el: HTMLImageElement | HTMLVideoElement,
  media: { w: number; h: number },
  parts: MediaCensorPartFlags,
  stats: { maxScore: number },
): Promise<YoloxDetection[]> {
  const sess = await ensureRealSession();
  if (!sess) return [];
  const ort = await loadOrt();
  const canvas = workCanvasEl();
  canvas.width = CENSOR_DETECT_INPUT;
  canvas.height = CENSOR_DETECT_INPUT;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return [];
  ctx.fillStyle = "rgb(114, 114, 114)";
  ctx.fillRect(0, 0, CENSOR_DETECT_INPUT, CENSOR_DETECT_INPUT);
  const r = Math.min(CENSOR_DETECT_INPUT / media.w, CENSOR_DETECT_INPUT / media.h);
  ctx.drawImage(el, 0, 0, media.w, media.h, 0, 0, media.w * r, media.h * r);
  const image = ctx.getImageData(0, 0, CENSOR_DETECT_INPUT, CENSOR_DETECT_INPUT);
  const input = rgbaToYoloxInput(
    image.data,
    CENSOR_DETECT_INPUT,
    CENSOR_DETECT_INPUT,
  );
  const tensor = new ort.Tensor("float32", input, [
    1,
    3,
    CENSOR_DETECT_INPUT,
    CENSOR_DETECT_INPUT,
  ]);
  const out = await sess.run({ images: tensor });
  const first = firstOrtTensor(out, ["output", "output0"]);
  if (!first?.data || !first.dims) return [];
  const dets = decodeYoloxOutput(first.data, first.dims, { parts, stats });
  return mapDetectionsToSrc(
    dets,
    media.w,
    media.h,
    CENSOR_DETECT_INPUT,
    "letterbox",
  );
}

export async function detectCensorBoxesFromElement(
  el: HTMLImageElement | HTMLVideoElement,
  parts: MediaCensorPartFlags,
): Promise<CensorDetectRun> {
  const started = performance.now();
  const media = sourceSize(el);
  if (media.w < 8 || media.h < 8) {
    return emptyCensorDetectRun(performance.now() - started, ["booru"]);
  }
  const stats = { maxScore: 0 };
  const sources: CensorDetectSource[] = [];
  const feed = await stretchYoloV8Tensor(el, media);
  let yolo: YoloxDetection[] = [];
  if (feed) {
    const [booruSess, animeSess, ppSess, handSess] = await Promise.all([
      ensureBooruSession(),
      ensureAnimeSession(),
      ensurePpSession(),
      ensureHandSession(),
    ]);
    const jobs: Array<{
      source: CensorDetectSource;
      run: Promise<YoloxDetection[]>;
    }> = [];
    if (booruSess) {
      jobs.push({
        source: "booru",
        run: runYoloV8Session(
          booruSess,
          feed.tensor,
          media,
          feed.size,
          parts,
          stats,
          "booru",
        ),
      });
    }
    if (animeSess) {
      jobs.push({
        source: "anime",
        run: runYoloV8Session(
          animeSess,
          feed.tensor,
          media,
          feed.size,
          parts,
          stats,
          "anime",
        ),
      });
    }
    if (ppSess) {
      jobs.push({
        source: "pp",
        run: runYoloV8Session(
          ppSess,
          feed.tensor,
          media,
          feed.size,
          parts,
          stats,
          "pp",
        ),
      });
    }
    if (handSess) {
      jobs.push({
        source: "hand",
        run: runYoloV8Session(
          handSess,
          feed.tensor,
          media,
          feed.size,
          parts,
          stats,
          "hand",
        ),
      });
    }
    const settled = await Promise.allSettled(jobs.map((job) => job.run));
    for (let i = 0; i < settled.length; i += 1) {
      const result = settled[i];
      const source = jobs[i]?.source;
      if (!source || !result || result.status !== "fulfilled") continue;
      sources.push(source);
      yolo = yolo.concat(result.value);
    }
  }
  let real: YoloxDetection[] = [];
  if (yolo.length === 0 && stats.maxScore < 0.2) {
    real = await runReal(el, media, parts, stats);
    if (real.length > 0 || realSession) sources.push("real");
  }
  const merged = nmsDetections([...yolo, ...real], undefined, "area");
  const boxes = attachPenisHoleAxes(
    el,
    media,
    srcDetectionsToNormBoxes(merged, media.w, media.h, {
      minSize: 0.015,
    }),
  );
  return {
    boxes,
    ms: performance.now() - started,
    hits: hitsFromDetections(merged),
    maxScore: stats.maxScore,
    sources,
  };
}

export function resetCensorDetectSession(): void {
  animeSession = null;
  booruSession = null;
  handSession = null;
  ppSession = null;
  realSession = null;
  animeLoadPromise = null;
  booruLoadPromise = null;
  handLoadPromise = null;
  ppLoadPromise = null;
  realLoadPromise = null;
  animeBytes = null;
  booruBytes = null;
  handBytes = null;
  ppBytes = null;
  realBytes = null;
}
