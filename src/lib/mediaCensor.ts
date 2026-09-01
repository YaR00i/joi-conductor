import type { MediaKind } from "./media";

/**
 * Session media censor (Hotscreen-style overlay on MediaStage, not desktop capture).
 * User toggle + mistress lock. Default boxes are authored bands (typical 1girl
 * framing). Optional `detect` runs anime body YOLO (booru head/chest/ass/belly)
 * plus nipple/pussy nano, hands, pose/acts, and YOLOX-real for photos —
 * see mediaCensorDetect. Video and gif skip the net: full-frame blur.
 */

export const MEDIA_CENSOR_STORAGE_KEY = "joi-media-censor-v1";
export const MEDIA_CENSOR_LOCK_KEY = "joi-media-censor-lock-v1";
export const MEDIA_CENSOR_CHANGED_EVENT = "joi-media-censor-changed";

export const MEDIA_CENSOR_STYLES = [
  "mosaic",
  "blur",
  "bars",
  "sticker",
] as const;
export type MediaCensorStyle = (typeof MEDIA_CENSOR_STYLES)[number];

export const MEDIA_CENSOR_COVERAGES = ["bands", "full"] as const;
export type MediaCensorCoverage = (typeof MEDIA_CENSOR_COVERAGES)[number];

export const MEDIA_CENSOR_PARTS = [
  "breasts",
  "genitals",
  "penis",
  "ass",
  "belly",
  "armpits",
  "feet",
  "hands",
  "face",
] as const;
export type MediaCensorPart = (typeof MEDIA_CENSOR_PARTS)[number];

/** Video and gif: full-frame blur, no neural tracker. */
export function mediaCensorMotionFull(kind: MediaKind): boolean {
  switch (kind) {
    case "video":
    case "gif":
      return true;
    case "image":
      return false;
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

export type MediaCensorPartFlags = Record<MediaCensorPart, boolean>;

export type MediaCensorSettings = {
  enabled: boolean;
  style: MediaCensorStyle;
  coverage: MediaCensorCoverage;
  /** 1 = light, 5 = heavy bars / big pixels. */
  strength: number;
  parts: MediaCensorPartFlags;
  /**
   * Neural tracker. Off by default. Anime (deepghs MIT) is primary;
   * YOLOX-real (Hotscreen MIT) still runs for photos.
   * Empty/fail → typical-frame bands only if `bandsFallback` is on.
   */
  detect: boolean;
  /** Typical-frame bands for parts the net missed. Off = only neural spots. */
  bandsFallback: boolean;
  /** Insult line on the load veil while the frame is blurred. */
  loadTaunt: boolean;
  /**
   * Size of the penis reveal hole (1 = tight to the net box, 5 = wide).
   * Stored in tenths (1.0 … 5.0). Only used when `parts.penis` is off.
   */
  penisHole: number;
};

export type MediaCensorLock = {
  locked: boolean;
};

export type MediaCensorBox = {
  x: number;
  y: number;
  w: number;
  h: number;
  part: MediaCensorPart | "frame";
  /** Shaft angle in radians, set by the net pass. Overlay hole follows it. */
  axisRad?: number;
};

export type MediaCensorLive = {
  settings: MediaCensorSettings;
  lock: MediaCensorLock;
  active: boolean;
};

export const DEFAULT_MEDIA_CENSOR: MediaCensorSettings = {
  enabled: false,
  style: "mosaic",
  coverage: "bands",
  strength: 3,
  parts: {
    breasts: true,
    genitals: true,
    penis: false,
    ass: true,
    belly: false,
    armpits: false,
    feet: false,
    hands: false,
    face: false,
  },
  detect: false,
  bandsFallback: true,
  loadTaunt: true,
  penisHole: 2,
};

export const DEFAULT_MEDIA_CENSOR_LOCK: MediaCensorLock = {
  locked: false,
};

export function isMediaCensorStyle(v: unknown): v is MediaCensorStyle {
  return (
    typeof v === "string" &&
    (MEDIA_CENSOR_STYLES as readonly string[]).includes(v)
  );
}

export function isMediaCensorCoverage(v: unknown): v is MediaCensorCoverage {
  return (
    typeof v === "string" &&
    (MEDIA_CENSOR_COVERAGES as readonly string[]).includes(v)
  );
}

export function isMediaCensorPart(v: unknown): v is MediaCensorPart {
  return (
    typeof v === "string" &&
    (MEDIA_CENSOR_PARTS as readonly string[]).includes(v)
  );
}

export function clampMediaCensorStrength(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_MEDIA_CENSOR.strength;
  return Math.min(5, Math.max(1, Math.round(n)));
}

export const MEDIA_CENSOR_PENIS_HOLE_MIN = 1;
export const MEDIA_CENSOR_PENIS_HOLE_MAX = 5;
export const MEDIA_CENSOR_PENIS_HOLE_STEP = 0.1;

export function clampMediaCensorPenisHole(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_MEDIA_CENSOR.penisHole;
  const clamped = Math.min(
    MEDIA_CENSOR_PENIS_HOLE_MAX,
    Math.max(MEDIA_CENSOR_PENIS_HOLE_MIN, n),
  );
  return Math.round(clamped * 10) / 10;
}

export function formatMediaCensorPenisHole(n: number): string {
  return clampMediaCensorPenisHole(n).toFixed(1);
}

function parseParts(raw: unknown): MediaCensorPartFlags {
  const base = { ...DEFAULT_MEDIA_CENSOR.parts };
  if (!raw || typeof raw !== "object") return base;
  const rec = raw as Partial<Record<string, unknown>>;
  for (const part of MEDIA_CENSOR_PARTS) {
    if (typeof rec[part] === "boolean") base[part] = rec[part];
  }
  return base;
}

export function parseMediaCensorSettings(raw: unknown): MediaCensorSettings {
  if (!raw || typeof raw !== "object") {
    return { ...DEFAULT_MEDIA_CENSOR, parts: { ...DEFAULT_MEDIA_CENSOR.parts } };
  }
  const rec = raw as Partial<MediaCensorSettings>;
  return {
    enabled: rec.enabled === true,
    style: isMediaCensorStyle(rec.style)
      ? rec.style
      : DEFAULT_MEDIA_CENSOR.style,
    coverage: isMediaCensorCoverage(rec.coverage)
      ? rec.coverage
      : DEFAULT_MEDIA_CENSOR.coverage,
    strength: clampMediaCensorStrength(
      typeof rec.strength === "number"
        ? rec.strength
        : DEFAULT_MEDIA_CENSOR.strength,
    ),
    parts: parseParts(rec.parts),
    detect: rec.detect === true,
    bandsFallback: rec.bandsFallback !== false,
    loadTaunt: rec.loadTaunt !== false,
    penisHole: clampMediaCensorPenisHole(
      typeof rec.penisHole === "number"
        ? rec.penisHole
        : DEFAULT_MEDIA_CENSOR.penisHole,
    ),
  };
}

export function parseMediaCensorLock(raw: unknown): MediaCensorLock {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_MEDIA_CENSOR_LOCK };
  const rec = raw as Partial<MediaCensorLock>;
  return { locked: rec.locked === true };
}

export function loadMediaCensorSettings(): MediaCensorSettings {
  try {
    const raw = globalThis.localStorage?.getItem(MEDIA_CENSOR_STORAGE_KEY);
    if (!raw) {
      return {
        ...DEFAULT_MEDIA_CENSOR,
        parts: { ...DEFAULT_MEDIA_CENSOR.parts },
      };
    }
    return parseMediaCensorSettings(JSON.parse(raw) as unknown);
  } catch {
    return {
      ...DEFAULT_MEDIA_CENSOR,
      parts: { ...DEFAULT_MEDIA_CENSOR.parts },
    };
  }
}

export function loadMediaCensorLock(): MediaCensorLock {
  try {
    const raw = globalThis.localStorage?.getItem(MEDIA_CENSOR_LOCK_KEY);
    if (!raw) return { ...DEFAULT_MEDIA_CENSOR_LOCK };
    return parseMediaCensorLock(JSON.parse(raw) as unknown);
  } catch {
    return { ...DEFAULT_MEDIA_CENSOR_LOCK };
  }
}

export function notifyMediaCensorChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(MEDIA_CENSOR_CHANGED_EVENT));
}

export function saveMediaCensorSettings(
  settings: MediaCensorSettings,
): MediaCensorSettings {
  const next = parseMediaCensorSettings(settings);
  try {
    globalThis.localStorage?.setItem(
      MEDIA_CENSOR_STORAGE_KEY,
      JSON.stringify(next),
    );
  } catch {
    /* quota */
  }
  notifyMediaCensorChanged();
  return next;
}

export function saveMediaCensorLock(lock: MediaCensorLock): MediaCensorLock {
  const next = parseMediaCensorLock(lock);
  try {
    globalThis.localStorage?.setItem(
      MEDIA_CENSOR_LOCK_KEY,
      JSON.stringify(next),
    );
  } catch {
    /* quota */
  }
  notifyMediaCensorChanged();
  return next;
}

export function mediaCensorActive(
  settings: MediaCensorSettings = loadMediaCensorSettings(),
  lock: MediaCensorLock = loadMediaCensorLock(),
): boolean {
  return lock.locked || settings.enabled;
}

export function loadMediaCensorLive(): MediaCensorLive {
  const settings = loadMediaCensorSettings();
  const lock = loadMediaCensorLock();
  return { settings, lock, active: mediaCensorActive(settings, lock) };
}

export function setMediaCensorEnabled(enabled: boolean): MediaCensorLive {
  const lock = loadMediaCensorLock();
  if (lock.locked) return loadMediaCensorLive();
  saveMediaCensorSettings({ ...loadMediaCensorSettings(), enabled });
  return loadMediaCensorLive();
}

export function patchMediaCensorSettings(
  patch: Partial<MediaCensorSettings>,
): MediaCensorSettings {
  const cur = loadMediaCensorSettings();
  return saveMediaCensorSettings({
    ...cur,
    ...patch,
    parts: patch.parts ? { ...cur.parts, ...patch.parts } : cur.parts,
  });
}

/** Mistress turns the overlay on and locks the session toggle. */
export function applyMistressCensor(patch: {
  style?: MediaCensorStyle;
  coverage?: MediaCensorCoverage;
  strength?: number;
  parts?: Partial<MediaCensorPartFlags>;
  detect?: boolean;
}): MediaCensorLive {
  const cur = loadMediaCensorSettings();
  saveMediaCensorSettings({
    ...cur,
    style: patch.style ?? cur.style,
    coverage: patch.coverage ?? cur.coverage,
    strength:
      patch.strength != null
        ? clampMediaCensorStrength(patch.strength)
        : cur.strength,
    parts: patch.parts ? { ...cur.parts, ...patch.parts } : cur.parts,
    detect: patch.detect ?? cur.detect,
  });
  saveMediaCensorLock({ locked: true });
  return loadMediaCensorLive();
}

/** Drop the lock. User preference for enabled stays. */
export function clearMediaCensorLock(): MediaCensorLive {
  saveMediaCensorLock({ locked: false });
  return loadMediaCensorLive();
}

/** Mistress uncovers: unlock and turn the overlay off. */
export function clearMistressCensor(): MediaCensorLive {
  const cur = loadMediaCensorSettings();
  saveMediaCensorSettings({ ...cur, enabled: false });
  saveMediaCensorLock({ locked: false });
  return loadMediaCensorLive();
}

export function subscribeMediaCensor(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onStorage = (e: StorageEvent) => {
    if (
      e.key === MEDIA_CENSOR_STORAGE_KEY ||
      e.key === MEDIA_CENSOR_LOCK_KEY ||
      e.key == null
    ) {
      listener();
    }
  };
  window.addEventListener(MEDIA_CENSOR_CHANGED_EVENT, listener);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(MEDIA_CENSOR_CHANGED_EVENT, listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** object-fit: contain destination rect inside the viewport. */
export function containRect(
  mediaW: number,
  mediaH: number,
  viewW: number,
  viewH: number,
): { x: number; y: number; w: number; h: number } {
  if (mediaW <= 0 || mediaH <= 0 || viewW <= 0 || viewH <= 0) {
    return { x: 0, y: 0, w: Math.max(0, viewW), h: Math.max(0, viewH) };
  }
  const scale = Math.min(viewW / mediaW, viewH / mediaH);
  const w = mediaW * scale;
  const h = mediaH * scale;
  return { x: (viewW - w) / 2, y: (viewH - h) / 2, w, h };
}

/** Typical 1girl frame. Penis / armpits / feet / hands — neural only. */
const BAND_BOXES: Partial<Record<MediaCensorPart, MediaCensorBox>> = {
  face: { x: 0.3, y: 0.02, w: 0.4, h: 0.2, part: "face" },
  breasts: { x: 0.18, y: 0.26, w: 0.64, h: 0.24, part: "breasts" },
  belly: { x: 0.24, y: 0.44, w: 0.52, h: 0.16, part: "belly" },
  ass: { x: 0.16, y: 0.48, w: 0.68, h: 0.28, part: "ass" },
  genitals: { x: 0.3, y: 0.62, w: 0.4, h: 0.3, part: "genitals" },
};

export function padCensorBox(box: MediaCensorBox, pad: number): MediaCensorBox {
  const x = Math.max(0, box.x - pad);
  const y = Math.max(0, box.y - pad);
  const r = Math.min(1, box.x + box.w + pad);
  const b = Math.min(1, box.y + box.h + pad);
  return { x, y, w: Math.max(0.04, r - x), h: Math.max(0.04, b - y), part: box.part };
}

/** Grow a box by a fraction of its own size (holes eat mosaic fringe). */
export function growCensorBox(box: MediaCensorBox, frac: number): MediaCensorBox {
  const f = Number.isFinite(frac) ? Math.max(0, frac) : 0;
  const px = box.w * f;
  const py = box.h * f;
  return padCensorBoxAbs(box, px, py);
}

/**
 * Nets have one `penis` box (shaft). The glans often sits past the
 * far end; the overlay hole is an ellipse. Extra pad only along the
 * long axis (both ends — we do not know which is the tip). Width
 * stays the net box, plus the user's slider.
 */
export const PENIS_HOLE_GLANS_MAJOR = 0.12;

function padCensorBoxAbs(
  box: MediaCensorBox,
  px: number,
  py: number,
): MediaCensorBox {
  const x = Math.max(0, box.x - px);
  const y = Math.max(0, box.y - py);
  const r = Math.min(1, box.x + box.w + px);
  const b = Math.min(1, box.y + box.h + py);
  return {
    x,
    y,
    w: Math.max(0.04, r - x),
    h: Math.max(0.04, b - y),
    part: box.part,
    ...(box.axisRad != null ? { axisRad: box.axisRad } : {}),
  };
}

export function growPenisRevealBox(
  box: MediaCensorBox,
  sliderGrow: number,
): MediaCensorBox {
  const tip = Math.max(box.w, box.h) * PENIS_HOLE_GLANS_MAJOR;
  const tall = box.h >= box.w;
  const glans = padCensorBoxAbs(box, tall ? 0 : tip, tall ? tip : 0);
  return growCensorBox(glans, sliderGrow);
}

/**
 * Keep tracking a part even if it is not covered. Penis stays in the net
 * so a hole can punch through neighbouring pussy mosaic.
 */
export function keepCensorDetection(
  part: MediaCensorPart,
  parts?: MediaCensorPartFlags,
): boolean {
  if (!parts) return true;
  if (parts[part]) return true;
  return part === "penis";
}

/** Padding at whole steps 1…5; tenths lerp between. */
const PENIS_HOLE_GROW_AT: readonly number[] = [0, 0.04, 0.08, 0.14, 0.22];

export function penisHoleGrow(strength: number): number {
  const s = clampMediaCensorPenisHole(strength);
  const idx = s - 1;
  const lo = Math.min(3, Math.floor(idx));
  const hi = lo + 1;
  const t = idx - lo;
  const a = PENIS_HOLE_GROW_AT[lo] ?? 0;
  const b = PENIS_HOLE_GROW_AT[hi] ?? a;
  return a + t * (b - a);
}

/** Neural penis boxes used as reveal holes when the Член zone is off. */
export function penisRevealHoles(
  settings: MediaCensorSettings,
  detected: MediaCensorBox[] | null,
): MediaCensorBox[] {
  if (settings.parts.penis) return [];
  if (!detected || detected.length === 0) return [];
  const grow = penisHoleGrow(settings.penisHole);
  return detected
    .filter((box) => box.part === "penis")
    .map((box) => growPenisRevealBox(box, grow));
}

/**
 * Normalized 0–1 boxes over the actual image (letterbox excluded).
 * Strength grows padding so heavy censor covers more.
 */
export function planCensorBoxes(settings: MediaCensorSettings): MediaCensorBox[] {
  const pad = (settings.strength - 1) * 0.025;
  if (settings.coverage === "full") {
    return [padCensorBox({ x: 0, y: 0, w: 1, h: 1, part: "frame" }, 0)];
  }
  const out: MediaCensorBox[] = [];
  for (const part of MEDIA_CENSOR_PARTS) {
    if (!settings.parts[part]) continue;
    const band = BAND_BOXES[part];
    if (!band) continue;
    out.push(padCensorBox(band, pad));
  }
  return out;
}

export function mosaicCellPx(strength: number, boxH: number): number {
  const s = clampMediaCensorStrength(strength);
  const base = 6 + s * 7;
  return Math.max(4, Math.min(72, Math.round(Math.min(base, boxH / 3))));
}

export function blurPx(strength: number, boxH: number): number {
  const s = clampMediaCensorStrength(strength);
  const base = 6 + s * 8;
  return Math.max(4, Math.min(64, Math.round(Math.min(base, boxH / 4))));
}

export function mediaCensorStyleLabelRu(style: MediaCensorStyle): string {
  switch (style) {
    case "mosaic":
      return "Мозаика";
    case "blur":
      return "Размытие";
    case "bars":
      return "Плашки";
    case "sticker":
      return "Надпись";
    default: {
      const _exhaustive: never = style;
      return _exhaustive;
    }
  }
}

export function mediaCensorStyleSubRu(style: MediaCensorStyle): string {
  switch (style) {
    case "mosaic":
      return "пиксели";
    case "blur":
      return "смазать";
    case "bars":
      return "чёрные";
    case "sticker":
      return "«цензура»";
    default: {
      const _exhaustive: never = style;
      return _exhaustive;
    }
  }
}

export function mediaCensorCoverageLabelRu(
  coverage: MediaCensorCoverage,
): string {
  switch (coverage) {
    case "bands":
      return "Зоны";
    case "full":
      return "Кадр";
    default: {
      const _exhaustive: never = coverage;
      return _exhaustive;
    }
  }
}

export function mediaCensorCoverageSubRu(
  coverage: MediaCensorCoverage,
): string {
  switch (coverage) {
    case "bands":
      return "грудь / пах";
    case "full":
      return "весь слайд";
    default: {
      const _exhaustive: never = coverage;
      return _exhaustive;
    }
  }
}

export function mediaCensorPartLabelRu(part: MediaCensorPart): string {
  switch (part) {
    case "breasts":
      return "Грудь";
    case "genitals":
      return "Пах";
    case "penis":
      return "Член";
    case "ass":
      return "Зад";
    case "belly":
      return "Живот";
    case "armpits":
      return "Подмышки";
    case "feet":
      return "Стопы";
    case "hands":
      return "Руки";
    case "face":
      return "Лицо";
    default: {
      const _exhaustive: never = part;
      return _exhaustive;
    }
  }
}

export function mediaCensorPartHintRu(part: MediaCensorPart): string {
  switch (part) {
    case "breasts":
      return "Грудь и соски. Сеть ловит на фото; без сети — полоска на типичном кадре.";
    case "genitals":
      return "Пах. Если «Член» выкл, сеть вырезает ствол из этой мозаики.";
    case "penis":
      return "Выкл: сеть всё равно ловит и делает дырку в цензоре паха. Головки отдельно нет — дырка чуть длиннее ствола. На наклоне овал по центру рамки, не по краю. Вкл: закрывать как грудь и пах.";
    case "ass":
      return "Попа. Сеть ловит на фото; без сети — полоска на типичном кадре.";
    case "belly":
      return "Живот. По умолчанию выкл. Без сети — полоска на типичном кадре.";
    case "armpits":
      return "Подмышки. По умолчанию выкл. Ловит фото-сеть, если аниме-проход пустой.";
    case "feet":
      return "Стопы. По умолчанию выкл. Ловит фото-сеть, если аниме-проход пустой.";
    case "hands":
      return "Руки. По умолчанию выкл. Отдельная модель, докачивается при слежении.";
    case "face":
      return "Лицо. По умолчанию выкл.";
    default: {
      const _exhaustive: never = part;
      return _exhaustive;
    }
  }
}

export const MEDIA_CENSOR_LOAD_TAUNTS = [
  "Думал, в этот раз покажу? Мило.",
  "Смотри в кляксу и благодари.",
  "Голое — не для тебя. Силуэт ещё надо заслужить.",
  "Глаза есть. Права смотреть — нет.",
  "Жди. Она красивая. Ты — нет.",
  "Почти видно. Почти стыдно. Привыкай.",
  "Заслужил размытие, не кадр.",
  "Не моргай. Всё равно ничего не получишь.",
  "Любуйся пятном. Это твой максимум.",
  "Так жадно смотришь — поэтому закрыла.",
  "Пока блюр, ты никто. Запомнил?",
  "Ей можно быть голой. Тебе — только ждать.",
  "Уже тянешься к кадру. Жалкий.",
  "Прячу самое вкусное. Остальное — подачка.",
  "Дрочи на кляксу, раз такой нетерпеливый.",
  "Ты видел слишком много. Хватит.",
  "Мозаика умнее тебя: знает, что прятать.",
  "Шире рот, уже глаза. Голого не будет.",
  "Она не для тебя. Ты для ожидания.",
  "Прячу, потому что кончил бы сразу.",
  "Как витрина: смотреть можно, трогать — нет.",
  "Бедненький. Даже пиксель жалко отдать.",
  "Член уже решил. Глаза подождут.",
  "Закрыто. Скули на размытие.",
  "Превью тебе ещё надо заслужить. Это даже не оно.",
  "Хочешь подглядеть? Сиди в каше.",
  "Красиво же, да? Жаль, не твоё.",
  "Ещё секунда слепоты. Скажи спасибо.",
] as const;

/** Keep in sync with `--media-blur-in` / `--media-blur-out` in styles.css. */
export const MEDIA_CENSOR_BLUR_IN_MS = 580;
export const MEDIA_CENSOR_BLUR_OUT_MS = 1150;

export function pickMediaCensorLoadTaunt(seed: string, offset = 0): string {
  const n = MEDIA_CENSOR_LOAD_TAUNTS.length;
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) {
    h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  }
  const idx = (h + offset) % n;
  return MEDIA_CENSOR_LOAD_TAUNTS[idx] ?? MEDIA_CENSOR_LOAD_TAUNTS[0]!;
}
