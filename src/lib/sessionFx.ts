/**
 * Sparkle session overlays (HotScreen-style hypno / captions / artifacts).
 * User toggles in Настройки → Геймплей → Эффекты. Other mistresses stay on pack.fx.
 */

import type { MistressId, MistressSessionFx } from "./mistress/types";

export const SESSION_FX_STORAGE_KEY = "joi-session-fx-v1";
export const SESSION_FX_CHANGED_EVENT = "joi-session-fx-changed";

export const SESSION_FX_THEMES = [
  "sparkle",
  "goon",
  "beta",
  "sissy",
  "bbc",
] as const;
export type SessionFxTheme = (typeof SESSION_FX_THEMES)[number];

export const SESSION_FX_BAR_LOOKS = ["shuusei", "ribbon"] as const;
export type SessionFxBarLook = (typeof SESSION_FX_BAR_LOOKS)[number];

export type SessionFxCaptionBook = Record<SessionFxTheme, string[]>;

export type SessionFxSettings = {
  enabled: boolean;
  /** 1 = faint, 5 = loud. */
  intensity: number;
  theme: SessionFxTheme;
  /** Draw mantras from every theme, not only `theme`. */
  mixCaptions: boolean;
  /** User-editable mantra pools. Empty theme falls back to factory. */
  captionsByTheme: SessionFxCaptionBook;
  hypno: boolean;
  artifacts: boolean;
  captions: boolean;
  popups: boolean;
  glitch: boolean;
  /** Bright flashes. Off by default — can nauseate. */
  pulse: boolean;
  avatarBar: boolean;
  /** Look of the avatar plaque: Japanese 修正 stamp or mistress ribbon. */
  barLook: SessionFxBarLook;
};

export const SESSION_FX_CAPTION_MAX_LEN = 48;
export const SESSION_FX_CAPTION_MAX_LINES = 80;

export const SESSION_FX_CAPTIONS: Record<SessionFxTheme, readonly string[]> = {
  sparkle: [
    "безумие",
    "только анал",
    "в клетке",
    "фантом",
    "искра",
    "маска",
    "цирк",
    "не думай",
    "глубже",
    "хаос",
    "смотри",
    "две маски",
  ],
  goon: [
    "пустой",
    "смотри",
    "не думай",
    "ещё",
    "мозг выкл",
    "порно — воздух",
    "глаза сюда",
    "не останавливайся",
    "капля",
    "goon",
  ],
  beta: [
    "не ты",
    "смотри как надо",
    "спасибо ей",
    "ты не выбран",
    "лучше сиди",
    "бета",
    "руки при себе",
    "восхищайся",
    "жалкий",
    "место сзади",
  ],
  sissy: [
    "хорошая девочка",
    "клитор",
    "трусики",
    "сисси",
    "дырочка",
    "на колени",
    "не мальчик",
    "послушная",
    "крась губы",
    "шепчи",
  ],
  bbc: [
    "не для тебя",
    "смотри как делают",
    "blacked",
    "ты слишком мал",
    "она занята",
    "поклоняйся",
    "спасибо им",
    "место сбоку",
    "меньше",
    "цвет не твой",
  ],
};

export function cloneSessionFxCaptions(): SessionFxCaptionBook {
  const book = {} as SessionFxCaptionBook;
  for (const theme of SESSION_FX_THEMES) {
    book[theme] = [...SESSION_FX_CAPTIONS[theme]];
  }
  return book;
}

export const DEFAULT_SESSION_FX: SessionFxSettings = {
  enabled: true,
  intensity: 3,
  theme: "sparkle",
  mixCaptions: false,
  captionsByTheme: cloneSessionFxCaptions(),
  hypno: true,
  artifacts: true,
  captions: true,
  popups: true,
  glitch: true,
  pulse: false,
  avatarBar: true,
  barLook: "shuusei",
};

export function sessionFxThemeLabelRu(theme: SessionFxTheme): string {
  switch (theme) {
    case "sparkle":
      return "Безумие";
    case "goon":
      return "Goon";
    case "beta":
      return "Бета";
    case "sissy":
      return "Сисси";
    case "bbc":
      return "BBC";
    default: {
      const _exhaustive: never = theme;
      return _exhaustive;
    }
  }
}

export function sessionFxThemeSubRu(theme: SessionFxTheme): string {
  switch (theme) {
    case "sparkle":
      return "две маски · хаос";
    case "goon":
      return "пустой взгляд";
    case "beta":
      return "не выбран";
    case "sissy":
      return "девочка";
    case "bbc":
      return "не для тебя";
    default: {
      const _exhaustive: never = theme;
      return _exhaustive;
    }
  }
}

export function sessionFxBarLookLabelRu(look: SessionFxBarLook): string {
  switch (look) {
    case "shuusei":
      return "修正";
    case "ribbon":
      return "Лента";
    default: {
      const _exhaustive: never = look;
      return _exhaustive;
    }
  }
}

export function sessionFxBarLookSubRu(look: SessionFxBarLook): string {
  switch (look) {
    case "shuusei":
      return "штамп";
    case "ribbon":
      return "госпожа";
    default: {
      const _exhaustive: never = look;
      return _exhaustive;
    }
  }
}

export function sessionFxBarLookClass(look: SessionFxBarLook): string {
  switch (look) {
    case "shuusei":
      return "session-fx__censor--shuusei";
    case "ribbon":
      return "session-fx__censor--ribbon";
    default: {
      const _exhaustive: never = look;
      return _exhaustive;
    }
  }
}

export function sessionFxBarLookStamp(look: SessionFxBarLook): string | null {
  switch (look) {
    case "shuusei":
      return "修正";
    case "ribbon":
      return null;
    default: {
      const _exhaustive: never = look;
      return _exhaustive;
    }
  }
}

function clampInt(n: unknown, min: number, max: number, fallback: number): number {
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.min(max, Math.max(min, Math.round(v)));
}

function isTheme(v: unknown): v is SessionFxTheme {
  return typeof v === "string" && (SESSION_FX_THEMES as readonly string[]).includes(v);
}

function isBarLook(v: unknown): v is SessionFxBarLook {
  return (
    typeof v === "string" &&
    (SESSION_FX_BAR_LOOKS as readonly string[]).includes(v)
  );
}

export function parseSessionFxCaptionLines(
  raw: unknown,
  fallback: readonly string[],
): string[] {
  const src = Array.isArray(raw)
    ? raw.filter((line): line is string => typeof line === "string")
    : typeof raw === "string"
      ? raw.split(/\r?\n/)
      : [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const line of src) {
    const t = line.trim().slice(0, SESSION_FX_CAPTION_MAX_LEN);
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= SESSION_FX_CAPTION_MAX_LINES) break;
  }
  return out.length > 0 ? out : [...fallback];
}

export function formatSessionFxCaptionLines(lines: readonly string[]): string {
  return lines.join("\n");
}

export function parseSessionFxCaptionBook(raw: unknown): SessionFxCaptionBook {
  const rec =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const book = {} as SessionFxCaptionBook;
  for (const theme of SESSION_FX_THEMES) {
    book[theme] = parseSessionFxCaptionLines(
      rec[theme],
      SESSION_FX_CAPTIONS[theme],
    );
  }
  return book;
}

export function parseSessionFxSettings(raw: unknown): SessionFxSettings {
  const rec =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    enabled: rec.enabled !== false,
    intensity: clampInt(rec.intensity, 1, 5, DEFAULT_SESSION_FX.intensity),
    theme: isTheme(rec.theme) ? rec.theme : DEFAULT_SESSION_FX.theme,
    mixCaptions: rec.mixCaptions === true,
    captionsByTheme: parseSessionFxCaptionBook(rec.captionsByTheme),
    hypno: rec.hypno !== false,
    artifacts: rec.artifacts !== false,
    captions: rec.captions !== false,
    popups: rec.popups !== false,
    glitch: rec.glitch !== false,
    pulse: rec.pulse === true,
    avatarBar: rec.avatarBar !== false,
    barLook: isBarLook(rec.barLook) ? rec.barLook : DEFAULT_SESSION_FX.barLook,
  };
}

export function loadSessionFxSettings(): SessionFxSettings {
  try {
    const raw = globalThis.localStorage?.getItem(SESSION_FX_STORAGE_KEY);
    if (!raw) return parseSessionFxSettings({});
    return parseSessionFxSettings(JSON.parse(raw) as unknown);
  } catch {
    return parseSessionFxSettings({});
  }
}

export function notifySessionFxChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(SESSION_FX_CHANGED_EVENT));
}

export function saveSessionFxSettings(settings: SessionFxSettings): SessionFxSettings {
  const next = parseSessionFxSettings(settings);
  try {
    globalThis.localStorage?.setItem(SESSION_FX_STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* quota */
  }
  notifySessionFxChanged();
  return next;
}

export function patchSessionFxSettings(
  patch: Partial<SessionFxSettings>,
): SessionFxSettings {
  return saveSessionFxSettings({ ...loadSessionFxSettings(), ...patch });
}

export function subscribeSessionFx(onChange: () => void): () => void {
  window.addEventListener(SESSION_FX_CHANGED_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(SESSION_FX_CHANGED_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function sessionFxFromPack(fx: MistressSessionFx): SessionFxSettings {
  return {
    ...DEFAULT_SESSION_FX,
    captionsByTheme: cloneSessionFxCaptions(),
    enabled:
      fx.avatarCensor || fx.spiralOverlay || fx.floatingCaptions || fx.glitchHud,
    hypno: fx.spiralOverlay,
    captions: fx.floatingCaptions,
    popups: fx.floatingCaptions,
    glitch: fx.glitchHud,
    artifacts: fx.glitchHud || fx.spiralOverlay,
    avatarBar: fx.avatarCensor,
    pulse: false,
  };
}

export function sessionFxResolve(
  mistressId: MistressId,
  packFx: MistressSessionFx,
  user: SessionFxSettings,
  previewUser = false,
): SessionFxSettings {
  if (previewUser || mistressId === "sparkle") return user;
  return sessionFxFromPack(packFx);
}

export function sessionFxAnyOn(s: SessionFxSettings): boolean {
  if (!s.enabled) return false;
  return (
    s.hypno ||
    s.artifacts ||
    s.captions ||
    s.popups ||
    s.glitch ||
    s.pulse ||
    s.avatarBar
  );
}

export function sessionFxOpacity(intensity: number): number {
  return 0.1 + clampInt(intensity, 1, 5, 3) * 0.07;
}

export function sessionFxCaptionMs(intensity: number): number {
  return 7800 - clampInt(intensity, 1, 5, 3) * 900;
}

export function sessionFxPopupMs(intensity: number): number {
  return 3200 - clampInt(intensity, 1, 5, 3) * 320;
}

function mix32(n: number): number {
  let t = (n + 0x9e3779b9) >>> 0;
  t = Math.imul(t ^ (t >>> 16), 0x85ebca6b);
  t = Math.imul(t ^ (t >>> 13), 0xc2b2ae35);
  return (t ^ (t >>> 16)) >>> 0;
}

export type SessionFxPopupPlace = {
  x: number;
  y: number;
  rot: number;
};

function popupPlaceFrom(seed: number): SessionFxPopupPlace {
  const hx = mix32(seed);
  const hy = mix32(seed ^ 0xc2b2ae35);
  return {
    x: 4 + (hx % 86),
    y: 6 + (hy % 78),
    rot: ((hx % 21) - 10) * 1.35,
  };
}

/** Scatter mantras around the frame; x/y are independent, not a diagonal walk. */
export function sessionFxPopupPlace(
  seed: number,
  avoid: readonly { x: number; y: number }[] = [],
): SessionFxPopupPlace {
  const s = seed >>> 0;
  for (let i = 0; i < 10; i += 1) {
    const p = popupPlaceFrom(s + i * 0x9e3779b9);
    if (
      avoid.every((a) => {
        const dx = p.x - a.x;
        const dy = p.y - a.y;
        return dx * dx + dy * dy >= 22 * 22;
      })
    ) {
      return p;
    }
  }
  return popupPlaceFrom(s);
}

function poolFor(
  s: Pick<SessionFxSettings, "theme" | "mixCaptions" | "captionsByTheme">,
): readonly string[] {
  const linesFor = (theme: SessionFxTheme): readonly string[] => {
    const custom = s.captionsByTheme[theme];
    return custom.length > 0 ? custom : SESSION_FX_CAPTIONS[theme];
  };
  if (!s.mixCaptions) return linesFor(s.theme);
  return SESSION_FX_THEMES.flatMap((id) => [...linesFor(id)]);
}

export function pickSessionFxCaption(
  s: Pick<SessionFxSettings, "theme" | "mixCaptions" | "captionsByTheme">,
  salt: number,
): string {
  const pool = poolFor(s);
  const n = pool.length;
  if (n <= 0) return "";
  const idx = ((salt % n) + n) % n;
  return pool[idx] ?? pool[0]!;
}

/** Archimedean hypno arm (not sunburst rays). viewBox 0 0 400 400. */
export function buildSessionFxSpiralPath(
  cx = 200,
  cy = 200,
  growth = 4.6,
  turns = 8,
  steps = 360,
  /** Angular width of the ribbon. π is a half-disk arm; smaller is thinner. */
  arm = Math.PI * 0.48,
): string {
  const maxT = turns * Math.PI * 2;
  const outer: string[] = [];
  const inner: string[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = (i / steps) * maxT + 0.12;
    const r1 = growth * t;
    const r2 = growth * (t + arm);
    outer.push(
      `${(cx + r1 * Math.cos(t)).toFixed(2)} ${(cy + r1 * Math.sin(t)).toFixed(2)}`,
    );
    inner.push(
      `${(cx + r2 * Math.cos(t)).toFixed(2)} ${(cy + r2 * Math.sin(t)).toFixed(2)}`,
    );
  }
  return `M${outer.join("L")}L${inner.reverse().join("L")}Z`;
}

export const SESSION_FX_SPIRAL_D = buildSessionFxSpiralPath();
export const SESSION_FX_SPIRAL_VIEWBOX = "0 0 400 400";
