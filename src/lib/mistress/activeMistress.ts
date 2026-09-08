import {
  getMistressPack,
  isSelectableMistressId,
  HU_TAO_PACK,
} from "./packs";
import type { MistressId, MistressPack } from "./types";
import { MISTRESS_STORAGE_KEY } from "./types";
import {
  isMistressIdUnlocked,
  type MistressUnlockSnapshot,
} from "./mistressUnlocks";

type Listener = (pack: MistressPack) => void;

let active: MistressPack = HU_TAO_PACK;
const listeners = new Set<Listener>();

function readStoredId(): MistressId {
  try {
    const raw = localStorage.getItem(MISTRESS_STORAGE_KEY);
    if (raw && isSelectableMistressId(raw)) return raw;
  } catch {
    // ignore
  }
  return "hu_tao";
}

function setSurfaceVars(
  root: HTMLElement,
  surfaces: MistressPack["theme"]["surfaces"],
): void {
  root.style.setProperty("--ember-panel", surfaces.emberPanel);
  root.style.setProperty("--ember-panel-soft", surfaces.emberPanelSoft);
  root.style.setProperty("--ember-panel-owned", surfaces.emberPanelOwned);
  root.style.setProperty("--roulette-ember", surfaces.rouletteEmber);
  root.style.setProperty("--roulette-ember-line", surfaces.rouletteEmberLine);
  root.style.setProperty("--roulette-glow-a", surfaces.rouletteGlowA);
  root.style.setProperty("--roulette-glow-b", surfaces.rouletteGlowB);
  root.style.setProperty("--roulette-stage-bg", surfaces.rouletteStageBg);
  root.style.setProperty("--roulette-hub-bg", surfaces.rouletteHubBg);
  root.style.setProperty("--roulette-hub-tab-bg", surfaces.rouletteHubTabBg);
  root.style.setProperty(
    "--roulette-hub-tab-active-bg",
    surfaces.rouletteHubTabActiveBg,
  );
  root.style.setProperty("--roulette-cta-bg", surfaces.rouletteCtaBg);
  root.style.setProperty("--roulette-cta-border", surfaces.rouletteCtaBorder);
  root.style.setProperty("--roulette-cta-shadow", surfaces.rouletteCtaShadow);
  root.style.setProperty("--roulette-idle-card-bg", surfaces.rouletteIdleCardBg);
  root.style.setProperty("--roulette-panel-border", surfaces.roulettePanelBorder);
  root.style.setProperty("--roulette-eyebrow", surfaces.rouletteEyebrow);
  root.style.setProperty("--roulette-warm-muted", surfaces.rouletteWarmMuted);
  root.style.setProperty("--roulette-rail-dot-active", surfaces.railDotActive);
  root.style.setProperty("--roulette-rail-dot-done", surfaces.railDotDone);
  root.style.setProperty("--roulette-wheel-active-bg", surfaces.wheelActiveBg);
  root.style.setProperty("--hub-preset-active-bg", surfaces.hubPresetActiveBg);
  root.style.setProperty("--avatar-frame-border", surfaces.avatarFrameBorder);
  root.style.setProperty("--avatar-frame-glow", surfaces.avatarFrameGlow);
}

/** CSS custom properties for a pack (inline `style` on a subtree). */
export function mistressThemeCssVars(
  pack: MistressPack,
): Record<string, string> {
  const t = pack.theme;
  return {
    "--accent": t.accent,
    "--accent2": t.accent2,
    "--soft": t.soft,
    "--bg0": t.bg0,
    "--bg1": t.bg1,
    "--bg2": t.bg2,
    "--bg3": t.bg3,
    "--line": t.line,
    "--muted": t.muted,
    "--glow-warm": t.glowWarm,
    "--glow-cool": t.glowCool,
    "--scroll-thumb": t.scrollThumb,
    "--scroll-thumb-hover": t.scrollThumbHover,
    "--diary-page": t.bg2,
    "--diary-page-2": t.bg1,
    "--diary-cover": t.bg3,
    "--diary-rule": t.line,
    "--diary-ink-dim": t.muted,
  };
}

export function applyMistressTheme(pack: MistressPack): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.dataset.mistress = pack.id;
  const t = pack.theme;
  root.style.setProperty("--accent", t.accent);
  root.style.setProperty("--accent2", t.accent2);
  root.style.setProperty("--soft", t.soft);
  root.style.setProperty("--bg0", t.bg0);
  root.style.setProperty("--bg1", t.bg1);
  root.style.setProperty("--bg2", t.bg2);
  root.style.setProperty("--bg3", t.bg3);
  root.style.setProperty("--line", t.line);
  root.style.setProperty("--muted", t.muted);
  root.style.setProperty("--glow-warm", t.glowWarm);
  root.style.setProperty("--glow-cool", t.glowCool);
  root.style.setProperty("--scroll-thumb", t.scrollThumb);
  root.style.setProperty("--scroll-thumb-hover", t.scrollThumbHover);
  setSurfaceVars(root, t.surfaces);
}

function packWithUnlockFlag(
  pack: MistressPack,
  unlocks?: MistressUnlockSnapshot | null,
): MistressPack {
  if (!unlocks) return pack;
  return {
    ...pack,
    unlocked: isMistressIdUnlocked(pack.id, unlocks),
  };
}

/** Call once on app boot (pass wallet unlocks when available). */
export function initActiveMistress(
  unlocks?: MistressUnlockSnapshot | null,
): MistressPack {
  const stored = getMistressPack(readStoredId()) ?? HU_TAO_PACK;
  const candidate = packWithUnlockFlag(stored, unlocks);
  const pack =
    unlocks && !candidate.unlocked
      ? HU_TAO_PACK
      : candidate;
  active = packWithUnlockFlag(pack, unlocks);
  applyMistressTheme(active);
  return active;
}

export function getActiveMistress(): MistressPack {
  return active;
}

/** Short name for HUD / task cards (Sparkle pack is "Искорка / Искра"). */
export function activeMistressNameRu(): string {
  const raw = active.displayNameRu.trim();
  const short = raw.split(" / ")[0]?.trim();
  return short || "Госпожа";
}

export function setActiveMistress(
  id: MistressId,
  unlocks?: MistressUnlockSnapshot | null,
): MistressPack | null {
  const base = getMistressPack(id);
  if (!base) return null;
  const pack = packWithUnlockFlag(base, unlocks);
  if (!pack.unlocked) return null;
  active = pack;
  try {
    localStorage.setItem(MISTRESS_STORAGE_KEY, pack.id);
  } catch {
    // ignore
  }
  applyMistressTheme(pack);
  for (const fn of listeners) fn(pack);
  return pack;
}

export function subscribeActiveMistress(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
