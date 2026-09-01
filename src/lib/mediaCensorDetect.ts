/**
 * Neural censor decode: anime YOLO (deepghs MIT, stretch 640) plus
 * Hotscreen YOLOX-real (MIT, letterbox 320). Face / breasts / genitals /
 * penis / ass / belly / armpits / feet / hands. Extra YOLOv8: hands nano
 * and booru pp12 acts. Do not ship Ultralytics YOLO11 (AGPL).
 */
import {
  keepCensorDetection,
  padCensorBox,
  type MediaCensorBox,
  type MediaCensorPart,
  type MediaCensorPartFlags,
  type MediaCensorSettings,
  planCensorBoxes,
} from "./mediaCensor";

export const CENSOR_DETECT_ONNX_URL =
  "https://huggingface.co/Perfectfox256/hotscreen-detection-models/resolve/main/yolox-07-2025/hs-yx-real-320-fp32.onnx?download=true";
export const CENSOR_DETECT_LICENSE_URL =
  "https://huggingface.co/Perfectfox256/hotscreen-detection-models/resolve/main/yolox-07-2025/LICENSE";
export const CENSOR_DETECT_ONNX_SHA256 =
  "aaa1e90537c312467eb1d3de0c615beed8d02ec7f632f506f12838d6a80ed538";
export const CENSOR_DETECT_ONNX_BYTES = 20_198_519;
export const CENSOR_DETECT_INPUT = 320;
export const CENSOR_DETECT_NUM_CLASSES = 15;
export const CENSOR_DETECT_STRIDES = [8, 16, 32] as const;
export const CENSOR_DETECT_SCORE_MIN = 0.25;
export const CENSOR_DETECT_NMS_IOU = 0.45;

/** deepghs/anime_censor_detection v1.0 nano (MIT). 3 classes, stretch 640. */
export const CENSOR_DETECT_ANIME_ONNX_URL =
  "https://huggingface.co/deepghs/anime_censor_detection/resolve/main/censor_detect_v1.0_n/model.onnx?download=true";
export const CENSOR_DETECT_ANIME_ONNX_SHA256 =
  "029de0a116f6c3c73bde62d2a8354c78664795579858f3c8e28fc1b4633a891c";
export const CENSOR_DETECT_ANIME_ONNX_BYTES = 12_104_146;
export const CENSOR_DETECT_ANIME_INPUT = 640;
export const CENSOR_DETECT_ANIME_NUM_CLASSES = 3;
export const CENSOR_DETECT_ANIME_NMS_IOU = 0.7;
export const CENSOR_DETECT_ANIME_SCORE_MIN = 0.25;

/** deepghs/booru_yolo yolov8n_as01 — head / bust / ass. ONNX via ORT, not Ultralytics. */
export const CENSOR_DETECT_BOORU_ONNX_URL =
  "https://huggingface.co/deepghs/booru_yolo/resolve/main/yolov8n_as01/model.onnx?download=true";
export const CENSOR_DETECT_BOORU_ONNX_SHA256 =
  "b4e89a4091462c4e0da177091aaa62b6d6fd5c61a651097c51563d9dff1017a1";
export const CENSOR_DETECT_BOORU_ONNX_BYTES = 12_110_833;
export const CENSOR_DETECT_BOORU_INPUT = 640;
export const CENSOR_DETECT_BOORU_NUM_CLASSES = 26;
export const CENSOR_DETECT_BOORU_SCORE_MIN = 0.25;

/** deepghs/anime_hand_detection v1.0 nano (MIT). One class, stretch 640. */
export const CENSOR_DETECT_HAND_ONNX_URL =
  "https://huggingface.co/deepghs/anime_hand_detection/resolve/main/hand_detect_v1.0_n/model.onnx?download=true";
export const CENSOR_DETECT_HAND_ONNX_SHA256 =
  "b2ebc532c852ae0f09c109f3779573d6f43f67645344484d4a187f91ff4da14e";
export const CENSOR_DETECT_HAND_ONNX_BYTES = 12_102_558;
export const CENSOR_DETECT_HAND_NUM_CLASSES = 1;

/** deepghs/booru_yolo yolov8s_pp12 — NSFW acts. YOLOv8 ONNX, not YOLO11. */
export const CENSOR_DETECT_PP_ONNX_URL =
  "https://huggingface.co/deepghs/booru_yolo/resolve/main/yolov8s_pp12/model.onnx?download=true";
export const CENSOR_DETECT_PP_ONNX_SHA256 =
  "440def6d972d82cf1ea9abc42845d51c0911a3c26b718a01b741f9ceb65162f2";
export const CENSOR_DETECT_PP_ONNX_BYTES = 44_584_088;
export const CENSOR_DETECT_PP_NUM_CLASSES = 9;

export const ANIME_CENSOR_CLASSES = ["nipple_f", "penis", "pussy"] as const;
export type AnimeCensorClass = (typeof ANIME_CENSOR_CLASSES)[number];

export const BOORU_YOLO_CLASSES = [
  "head",
  "bust",
  "boob",
  "shld",
  "sideb",
  "belly",
  "nopan",
  "butt",
  "ass",
  "split",
  "sprd",
  "vsplt",
  "vsprd",
  "hip",
  "wing",
  "feral",
  "hdrago",
  "hpony",
  "hfox",
  "hrabb",
  "hcat",
  "hbear",
  "jacko",
  "jackx",
  "hhorse",
  "hbird",
] as const;
export type BooruYoloClass = (typeof BOORU_YOLO_CLASSES)[number];

export const CENSOR_PART_LABEL_RU: Record<MediaCensorPart, string> = {
  breasts: "грудь",
  genitals: "пах",
  penis: "член",
  ass: "попа",
  belly: "живот",
  armpits: "подмышки",
  feet: "стопы",
  hands: "руки",
  face: "лицо",
};

export const HAND_YOLO_CLASSES = ["hand"] as const;

export const PP_YOLO_CLASSES = [
  "pns",
  "spr",
  "ptr",
  "fng",
  "cun",
  "pzu",
  "hjb",
  "orl",
  "trb",
] as const;
export type PpYoloClass = (typeof PP_YOLO_CLASSES)[number];

/** Order = class id 0…14 (Hotscreen DetectionGD.classes_names). */
export const HOTSCREEN_YOLOX_CLASSES = [
  "FEMALE_FACE",
  "MALE_FACE",
  "FEMALE_GENITALIA_COVERED",
  "FEMALE_GENITALIA_EXPOSED",
  "BUTTOCKS_COVERED",
  "BUTTOCKS_EXPOSED",
  "FEMALE_BREAST_COVERED",
  "FEMALE_BREAST_EXPOSED",
  "MALE_BREAST_EXPOSED",
  "ARMPITS_EXPOSED",
  "BELLY_EXPOSED",
  "MALE_GENITALIA_EXPOSED",
  "ANUS_EXPOSED",
  "FEET_COVERED",
  "FEET_EXPOSED",
] as const;

export type HotscreenYoloxClass = (typeof HOTSCREEN_YOLOX_CLASSES)[number];

export type CensorDetectSource = "anime" | "booru" | "pp" | "hand" | "real";

export type YoloxDetection = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  score: number;
  classId: number;
  part: MediaCensorPart;
  source: CensorDetectSource;
};

export type CensorDetectHit = {
  part: MediaCensorPart;
  score: number;
  className: string;
  source: CensorDetectSource;
};

export type CensorDetectRun = {
  boxes: MediaCensorBox[];
  ms: number;
  hits: CensorDetectHit[];
  maxScore: number;
  sources: CensorDetectSource[];
};

const CLASS_TO_PART: Array<MediaCensorPart | null> = [
  "face",
  "face",
  "genitals",
  "genitals",
  "ass",
  "ass",
  "breasts",
  "breasts",
  "breasts",
  "armpits",
  "belly",
  "penis",
  "genitals",
  "feet",
  "feet",
];

export function hotscreenClassToPart(
  classId: number,
): MediaCensorPart | null {
  if (classId < 0 || classId >= CLASS_TO_PART.length) return null;
  return CLASS_TO_PART[classId] ?? null;
}

const ANIME_CLASS_TO_PART: Array<MediaCensorPart | null> = [
  "breasts",
  "penis",
  "genitals",
];

export function animeClassToPart(classId: number): MediaCensorPart | null {
  if (classId < 0 || classId >= ANIME_CLASS_TO_PART.length) return null;
  return ANIME_CLASS_TO_PART[classId] ?? null;
}

const BOORU_CLASS_TO_PART: Array<MediaCensorPart | null> = [
  "face",
  "breasts",
  "breasts",
  null,
  "breasts",
  "belly",
  "genitals",
  "ass",
  "ass",
  "genitals",
  "genitals",
  "genitals",
  "genitals",
  "ass",
  null,
  null,
  null,
  null,
  null,
  "face",
  "face",
  null,
  null,
  null,
  null,
  null,
];

export function booruClassToPart(classId: number): MediaCensorPart | null {
  if (classId < 0 || classId >= BOORU_CLASS_TO_PART.length) return null;
  return BOORU_CLASS_TO_PART[classId] ?? null;
}

/**
 * Pose/act boxes. `orl` is oral/mouth — never penis: that class punches
 * reveal holes, and oral sits on faces (fellatio would un-censor heads).
 */
const PP_CLASS_TO_PART: Array<MediaCensorPart | null> = [
  "penis",
  "genitals",
  "genitals",
  "genitals",
  "genitals",
  "breasts",
  "hands",
  "face",
  "genitals",
];

const HAND_CLASS_TO_PART: Array<MediaCensorPart | null> = ["hands"];

export function ppClassToPart(classId: number): MediaCensorPart | null {
  if (classId < 0 || classId >= PP_CLASS_TO_PART.length) return null;
  return PP_CLASS_TO_PART[classId] ?? null;
}

export function handClassToPart(classId: number): MediaCensorPart | null {
  if (classId < 0 || classId >= HAND_CLASS_TO_PART.length) return null;
  return HAND_CLASS_TO_PART[classId] ?? null;
}

export function letterboxRatio(
  srcW: number,
  srcH: number,
  input = CENSOR_DETECT_INPUT,
): number {
  if (srcW <= 0 || srcH <= 0) return 1;
  return Math.min(input / srcW, input / srcH);
}

export function yoloxAnchorCount(input = CENSOR_DETECT_INPUT): number {
  let n = 0;
  for (const stride of CENSOR_DETECT_STRIDES) {
    const cells = Math.floor(input / stride);
    n += cells * cells;
  }
  return n;
}

type YoloxGrids = {
  gx: Float32Array;
  gy: Float32Array;
  stride: Float32Array;
};

let gridsCache: YoloxGrids | null = null;

export function yoloxGrids(input = CENSOR_DETECT_INPUT): YoloxGrids {
  if (gridsCache && gridsCache.gx.length === yoloxAnchorCount(input)) {
    return gridsCache;
  }
  const n = yoloxAnchorCount(input);
  const gx = new Float32Array(n);
  const gy = new Float32Array(n);
  const stride = new Float32Array(n);
  let i = 0;
  for (const s of CENSOR_DETECT_STRIDES) {
    const cells = Math.floor(input / s);
    for (let y = 0; y < cells; y += 1) {
      for (let x = 0; x < cells; x += 1) {
        gx[i] = x;
        gy[i] = y;
        stride[i] = s;
        i += 1;
      }
    }
  }
  gridsCache = { gx, gy, stride };
  return gridsCache;
}

function overlapArea(
  a: YoloxDetection,
  b: YoloxDetection,
): number {
  const x1 = Math.max(a.x1, b.x1);
  const y1 = Math.max(a.y1, b.y1);
  const x2 = Math.min(a.x2, b.x2);
  const y2 = Math.min(a.y2, b.y2);
  return Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
}

function iouXyxy(
  a: YoloxDetection,
  b: YoloxDetection,
): number {
  const inter = overlapArea(a, b);
  const areaA = Math.max(0, a.x2 - a.x1) * Math.max(0, a.y2 - a.y1);
  const areaB = Math.max(0, b.x2 - b.x1) * Math.max(0, b.y2 - b.y1);
  const union = areaA + areaB - inter;
  return union <= 0 ? 0 : inter / union;
}

export function nmsDetections(
  dets: YoloxDetection[],
  iouThr = CENSOR_DETECT_NMS_IOU,
  prefer: "score" | "area" = "score",
): YoloxDetection[] {
  const areaOf = (d: YoloxDetection) =>
    Math.max(0, d.x2 - d.x1) * Math.max(0, d.y2 - d.y1);
  const sorted = dets.slice().sort((a, b) => {
    if (prefer === "area") {
      const diff = areaOf(b) - areaOf(a);
      if (diff !== 0) return diff;
    }
    return b.score - a.score;
  });
  const keep: YoloxDetection[] = [];
  for (const det of sorted) {
    let ok = true;
    for (const prev of keep) {
      if (prev.part !== det.part) continue;
      if (iouXyxy(prev, det) > iouThr) {
        ok = false;
        break;
      }
      if (prefer === "area") {
        const inner = areaOf(det);
        if (inner > 0 && overlapArea(prev, det) / inner > 0.5) {
          ok = false;
          break;
        }
      }
    }
    if (ok) keep.push(det);
  }
  return keep;
}

/**
 * YOLOX ONNX output [1, 2100, 21] = xywh raw + objectness + 15 classes.
 * xywh decode matches Megvii demo_postprocess (grid + exp * stride).
 */
export function decodeYoloxOutput(
  data: ArrayLike<number>,
  dims: readonly number[],
  opts?: {
    scoreMin?: number;
    parts?: MediaCensorPartFlags;
    input?: number;
    stats?: { maxScore: number };
  },
): YoloxDetection[] {
  const input = opts?.input ?? CENSOR_DETECT_INPUT;
  const scoreMin = opts?.scoreMin ?? CENSOR_DETECT_SCORE_MIN;
  const parts = opts?.parts;
  if (dims.length !== 3) return [];
  const anchors = dims[1] ?? 0;
  const last = dims[2] ?? 0;
  if (anchors <= 0 || last !== 4 + 1 + CENSOR_DETECT_NUM_CLASSES) return [];
  const grids = yoloxGrids(input);
  if (grids.gx.length !== anchors) return [];

  const out: YoloxDetection[] = [];
  for (let i = 0; i < anchors; i += 1) {
    const base = i * last;
    const obj = data[base + 4] ?? 0;
    if (obj < scoreMin) continue;
    let bestCls = -1;
    let bestClsScore = 0;
    for (let c = 0; c < CENSOR_DETECT_NUM_CLASSES; c += 1) {
      const s = data[base + 5 + c] ?? 0;
      if (s > bestClsScore) {
        bestClsScore = s;
        bestCls = c;
      }
    }
    const score = obj * bestClsScore;
    if (opts?.stats) {
      opts.stats.maxScore = Math.max(opts.stats.maxScore, score);
    }
    if (score < scoreMin || bestCls < 0) continue;
    const part = hotscreenClassToPart(bestCls);
    if (!part) continue;
    if (!keepCensorDetection(part, parts)) continue;
    const s = grids.stride[i] ?? 8;
    const cx = ((data[base] ?? 0) + (grids.gx[i] ?? 0)) * s;
    const cy = ((data[base + 1] ?? 0) + (grids.gy[i] ?? 0)) * s;
    const bw = Math.exp(data[base + 2] ?? 0) * s;
    const bh = Math.exp(data[base + 3] ?? 0) * s;
    out.push({
      x1: cx - bw / 2,
      y1: cy - bh / 2,
      x2: cx + bw / 2,
      y2: cy + bh / 2,
      score,
      classId: bestCls,
      part,
      source: "real",
    });
  }
  return nmsDetections(out);
}

/**
 * YOLOv8 ONNX [1, 4+nc, N] (imgutils) or [1, N, 4+nc]. Boxes are cxcywh
 * in input pixels. Stretch mapping, not YOLOX letterbox.
 */
export function decodeYoloV8Output(
  data: ArrayLike<number>,
  dims: readonly number[],
  opts?: {
    scoreMin?: number;
    parts?: MediaCensorPartFlags;
    numClasses?: number;
    nmsIou?: number;
    stats?: { maxScore: number };
    mapClass?: (classId: number) => MediaCensorPart | null;
    source?: CensorDetectSource;
  },
): YoloxDetection[] {
  const numClasses = opts?.numClasses ?? CENSOR_DETECT_ANIME_NUM_CLASSES;
  const scoreMin = opts?.scoreMin ?? CENSOR_DETECT_ANIME_SCORE_MIN;
  const parts = opts?.parts;
  const mapClass = opts?.mapClass ?? animeClassToPart;
  const source = opts?.source ?? "anime";
  const channels = 4 + numClasses;
  if (dims.length !== 3) return [];
  const d1 = dims[1] ?? 0;
  const d2 = dims[2] ?? 0;
  let layout: "cn" | "nc";
  let count: number;
  if (d1 === channels && d2 > 0) {
    layout = "cn";
    count = d2;
  } else if (d2 === channels && d1 > 0) {
    layout = "nc";
    count = d1;
  } else {
    return [];
  }

  const at = (ch: number, i: number): number => {
    if (layout === "cn") return data[ch * count + i] ?? 0;
    return data[i * channels + ch] ?? 0;
  };

  const out: YoloxDetection[] = [];
  for (let i = 0; i < count; i += 1) {
    let bestCls = -1;
    let bestScore = 0;
    for (let c = 0; c < numClasses; c += 1) {
      const s = at(4 + c, i);
      if (s > bestScore) {
        bestScore = s;
        bestCls = c;
      }
    }
    if (opts?.stats) {
      opts.stats.maxScore = Math.max(opts.stats.maxScore, bestScore);
    }
    if (bestScore < scoreMin || bestCls < 0) continue;
    const part = mapClass(bestCls);
    if (!part) continue;
    if (!keepCensorDetection(part, parts)) continue;
    const cx = at(0, i);
    const cy = at(1, i);
    const bw = at(2, i);
    const bh = at(3, i);
    out.push({
      x1: cx - bw / 2,
      y1: cy - bh / 2,
      x2: cx + bw / 2,
      y2: cy + bh / 2,
      score: bestScore,
      classId: bestCls,
      part,
      source,
    });
  }
  return nmsDetections(out, opts?.nmsIou ?? CENSOR_DETECT_ANIME_NMS_IOU);
}

export function mapDetectionsToSrc(
  dets: YoloxDetection[],
  srcW: number,
  srcH: number,
  input: number,
  fit: "letterbox" | "stretch",
): YoloxDetection[] {
  if (srcW <= 0 || srcH <= 0 || input <= 0) return [];
  if (fit === "stretch") {
    const sx = srcW / input;
    const sy = srcH / input;
    return dets.map((det) => ({
      ...det,
      x1: det.x1 * sx,
      y1: det.y1 * sy,
      x2: det.x2 * sx,
      y2: det.y2 * sy,
    }));
  }
  const r = letterboxRatio(srcW, srcH, input);
  if (r <= 0) return [];
  return dets.map((det) => ({
    ...det,
    x1: det.x1 / r,
    y1: det.y1 / r,
    x2: det.x2 / r,
    y2: det.y2 / r,
  }));
}

export function srcDetectionsToNormBoxes(
  dets: YoloxDetection[],
  srcW: number,
  srcH: number,
  opts?: {
    minSize?: number;
    extraPartPad?: Partial<Record<MediaCensorPart, number>>;
  },
): MediaCensorBox[] {
  if (srcW <= 0 || srcH <= 0) return [];
  const minSize = opts?.minSize ?? 0.02;
  const extra = opts?.extraPartPad;
  const boxes: MediaCensorBox[] = [];
  for (const det of dets) {
    let x = det.x1 / srcW;
    let y = det.y1 / srcH;
    let x2 = det.x2 / srcW;
    let y2 = det.y2 / srcH;
    const grow = extra?.[det.part] ?? 0;
    if (grow > 0) {
      x -= grow;
      y -= grow;
      x2 += grow;
      y2 += grow;
    }
    const nx = Math.max(0, Math.min(1, x));
    const ny = Math.max(0, Math.min(1, y));
    const nx2 = Math.max(0, Math.min(1, x2));
    const ny2 = Math.max(0, Math.min(1, y2));
    const w = nx2 - nx;
    const h = ny2 - ny;
    if (w < minSize || h < minSize) continue;
    boxes.push({ x: nx, y: ny, w, h, part: det.part });
  }
  return boxes;
}

export function detectionsToNormBoxes(
  dets: YoloxDetection[],
  srcW: number,
  srcH: number,
  input = CENSOR_DETECT_INPUT,
): MediaCensorBox[] {
  return srcDetectionsToNormBoxes(
    mapDetectionsToSrc(dets, srcW, srcH, input, "letterbox"),
    srcW,
    srcH,
  );
}

export function rgbaToYoloxInput(
  rgba: ArrayLike<number>,
  width: number,
  height: number,
): Float32Array {
  const hw = width * height;
  const out = new Float32Array(3 * hw);
  for (let i = 0; i < hw; i += 1) {
    const o = i * 4;
    out[i] = rgba[o] ?? 0;
    out[hw + i] = rgba[o + 1] ?? 0;
    out[2 * hw + i] = rgba[o + 2] ?? 0;
  }
  return out;
}

/** imgutils rgb_encode: RGB ÷ 255, CHW float32. */
export function rgbaToYoloV8Input(
  rgba: ArrayLike<number>,
  width: number,
  height: number,
): Float32Array {
  const hw = width * height;
  const out = new Float32Array(3 * hw);
  for (let i = 0; i < hw; i += 1) {
    const o = i * 4;
    out[i] = (rgba[o] ?? 0) / 255;
    out[hw + i] = (rgba[o + 1] ?? 0) / 255;
    out[2 * hw + i] = (rgba[o + 2] ?? 0) / 255;
  }
  return out;
}

export async function sha256Hex(bytes: BufferSource): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", bytes);
  const view = new Uint8Array(buf);
  let hex = "";
  for (let i = 0; i < view.length; i += 1) {
    hex += view[i]!.toString(16).padStart(2, "0");
  }
  return hex;
}

export function censorDetectModelMatches(bytes: Uint8Array, sha256: string): boolean {
  return bytes.byteLength === CENSOR_DETECT_ONNX_BYTES && sha256 === CENSOR_DETECT_ONNX_SHA256;
}

export function censorDetectAnimeModelMatches(
  bytes: Uint8Array,
  sha256: string,
): boolean {
  return (
    bytes.byteLength === CENSOR_DETECT_ANIME_ONNX_BYTES &&
    sha256 === CENSOR_DETECT_ANIME_ONNX_SHA256
  );
}

export function censorDetectBooruModelMatches(
  bytes: Uint8Array,
  sha256: string,
): boolean {
  return (
    bytes.byteLength === CENSOR_DETECT_BOORU_ONNX_BYTES &&
    sha256 === CENSOR_DETECT_BOORU_ONNX_SHA256
  );
}

export function censorDetectHandModelMatches(
  bytes: Uint8Array,
  sha256: string,
): boolean {
  return (
    bytes.byteLength === CENSOR_DETECT_HAND_ONNX_BYTES &&
    sha256 === CENSOR_DETECT_HAND_ONNX_SHA256
  );
}

export function censorDetectPpModelMatches(
  bytes: Uint8Array,
  sha256: string,
): boolean {
  return (
    bytes.byteLength === CENSOR_DETECT_PP_ONNX_BYTES &&
    sha256 === CENSOR_DETECT_PP_ONNX_SHA256
  );
}

export const MEDIA_CENSOR_DETECT_RUNTIME_EVENT = "joi-media-censor-detect-runtime";

export type MediaCensorDetectRuntime = {
  ok: boolean;
  detail: string;
  boxCount: number;
  ms?: number;
  maxScore?: number;
  hits?: string;
  sources?: string;
  logLine?: string;
};

export function detectionClassName(det: YoloxDetection): string {
  switch (det.source) {
    case "anime":
      return ANIME_CENSOR_CLASSES[det.classId] ?? `cls${det.classId}`;
    case "booru":
      return BOORU_YOLO_CLASSES[det.classId] ?? `cls${det.classId}`;
    case "pp":
      return PP_YOLO_CLASSES[det.classId] ?? `cls${det.classId}`;
    case "hand":
      return HAND_YOLO_CLASSES[det.classId] ?? `cls${det.classId}`;
    case "real":
      return HOTSCREEN_YOLOX_CLASSES[det.classId] ?? `cls${det.classId}`;
    default: {
      const _exhaustive: never = det.source;
      return _exhaustive;
    }
  }
}

export function hitsFromDetections(dets: YoloxDetection[]): CensorDetectHit[] {
  return dets
    .slice()
    .sort((a, b) => b.score - a.score)
    .map((det) => ({
      part: det.part,
      score: det.score,
      className: detectionClassName(det),
      source: det.source,
    }));
}

export function formatCensorDetectHits(hits: CensorDetectHit[]): string {
  if (hits.length === 0) return "";
  return hits
    .slice(0, 4)
    .map((h) => `${CENSOR_PART_LABEL_RU[h.part]} ${h.score.toFixed(2)}`)
    .join(" · ");
}

export function formatCensorDetectSources(sources: CensorDetectSource[]): string {
  const set = new Set(sources);
  const bits: string[] = [];
  if (set.has("booru")) bits.push("тело");
  if (set.has("anime")) bits.push("соски");
  if (set.has("pp")) bits.push("позы");
  if (set.has("hand")) bits.push("руки");
  if (set.has("real")) bits.push("реал");
  if (bits.length === 0) return "нейросеть";
  if (bits.length === 2 && set.has("booru") && set.has("anime")) return "аниме";
  if (
    bits.length === 4 &&
    set.has("booru") &&
    set.has("anime") &&
    set.has("pp") &&
    set.has("hand")
  ) {
    return "аниме";
  }
  return bits.join("+");
}

export function formatCensorDetectClock(now = new Date()): string {
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

export function formatCensorDetectLogLine(
  state: MediaCensorDetectRuntime,
  now = new Date(),
): string {
  const clock = formatCensorDetectClock(now);
  const tag = state.ok ? (state.boxCount > 0 ? "ловит" : "пусто") : "ошибка";
  return `${clock}  ${tag}  ${state.detail}`;
}

export function censorDetectRuntimeFromRun(
  run: CensorDetectRun,
): MediaCensorDetectRuntime {
  const hits = formatCensorDetectHits(run.hits);
  const sources = formatCensorDetectSources(
    run.sources.length > 0 ? run.sources : ["anime"],
  );
  const ms = `${Math.round(run.ms)}мс`;
  if (run.boxes.length > 0) {
    const detail = `${sources} · ${run.boxes.length} · ${hits} · ${ms}`;
    return {
      ok: true,
      detail,
      boxCount: run.boxes.length,
      ms: run.ms,
      maxScore: run.maxScore,
      hits,
      sources,
    };
  }
  const max =
    run.maxScore > 0 ? `макс ${run.maxScore.toFixed(2)}` : "макс 0";
  const detail = `пусто · ${sources} · ${max} · ${ms}`;
  return {
    ok: true,
    detail,
    boxCount: 0,
    ms: run.ms,
    maxScore: run.maxScore,
    hits: "",
    sources,
  };
}

export function emptyCensorDetectRun(
  ms: number,
  sources: CensorDetectSource[] = ["anime"],
): CensorDetectRun {
  return { boxes: [], ms, hits: [], maxScore: 0, sources };
}

export function notifyCensorDetectRuntime(state: MediaCensorDetectRuntime): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(MEDIA_CENSOR_DETECT_RUNTIME_EVENT, { detail: state }),
  );
}

export function subscribeCensorDetectRuntime(
  listener: (state: MediaCensorDetectRuntime) => void,
): () => void {
  if (typeof window === "undefined") return () => {};
  const onEvent = (e: Event) => {
    const detail = (e as CustomEvent<MediaCensorDetectRuntime>).detail;
    if (detail) listener(detail);
  };
  window.addEventListener(MEDIA_CENSOR_DETECT_RUNTIME_EVENT, onEvent);
  return () =>
    window.removeEventListener(MEDIA_CENSOR_DETECT_RUNTIME_EVENT, onEvent);
}

/**
 * Neural boxes for parts the detector found. Typical-frame bands fill the
 * rest only when `bandsFallback` is on.
 */
export function resolveCensorBoxes(
  settings: MediaCensorSettings,
  detected: MediaCensorBox[] | null,
): MediaCensorBox[] {
  if (settings.coverage === "full") return planCensorBoxes(settings);
  if (!settings.detect) return planCensorBoxes(settings);
  const pad = (settings.strength - 1) * 0.025;
  const neural =
    detected && detected.length > 0
      ? detected
          .filter((box) => box.part !== "penis" || settings.parts.penis)
          .map((box) => padCensorBox(box, pad))
      : [];
  if (!settings.bandsFallback) return neural;
  const bands = planCensorBoxes(settings);
  if (neural.length === 0) return bands;
  const covered = new Set(neural.map((box) => box.part));
  const out = neural.slice();
  for (const band of bands) {
    if (band.part === "frame" || covered.has(band.part)) continue;
    out.push(band);
  }
  return out;
}
