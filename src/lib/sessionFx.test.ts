import { beforeEach, describe, expect, it } from "vitest";
import {
  installLocalStorageMock,
  resetLocalStorage,
} from "../test/localStorageMock";
import {
  buildSessionFxSpiralPath,
  DEFAULT_SESSION_FX,
  parseSessionFxSettings,
  pickSessionFxCaption,
  sessionFxAnyOn,
  sessionFxFromPack,
  sessionFxPopupPlace,
  sessionFxResolve,
  sessionFxThemeLabelRu,
  SESSION_FX_CAPTIONS,
  SESSION_FX_SPIRAL_D,
  SESSION_FX_THEMES,
} from "./sessionFx";

installLocalStorageMock();

beforeEach(() => {
  resetLocalStorage();
});

describe("sessionFx", () => {
  it("defaults pulse off and the rest on", () => {
    const s = parseSessionFxSettings({});
    expect(s.enabled).toBe(true);
    expect(s.pulse).toBe(false);
    expect(s.hypno).toBe(true);
    expect(s.captions).toBe(true);
    expect(s.theme).toBe("sparkle");
  });

  it("clamps intensity and rejects unknown theme", () => {
    expect(parseSessionFxSettings({ intensity: 99, theme: "nope" }).intensity).toBe(
      5,
    );
    expect(parseSessionFxSettings({ intensity: 0, theme: "bbc" }).theme).toBe(
      "bbc",
    );
    expect(parseSessionFxSettings({ intensity: 0 }).intensity).toBe(1);
  });

  it("labels every theme in Russian", () => {
    for (const theme of SESSION_FX_THEMES) {
      expect(sessionFxThemeLabelRu(theme).length).toBeGreaterThan(2);
      expect(SESSION_FX_CAPTIONS[theme].length).toBeGreaterThanOrEqual(8);
    }
  });

  it("picks a stable caption for the same salt", () => {
    const s = parseSessionFxSettings({ theme: "goon" });
    const a = pickSessionFxCaption(s, 7);
    const b = pickSessionFxCaption(s, 7);
    const c = pickSessionFxCaption(s, 8);
    expect(a).toBe(b);
    expect(c).not.toBe(a);
    expect(a.length).toBeGreaterThan(2);
  });

  it("mix pulls from more than one theme", () => {
    const s = parseSessionFxSettings({ theme: "sparkle", mixCaptions: true });
    const mixed = new Set(
      Array.from({ length: 40 }, (_, i) => pickSessionFxCaption(s, i)),
    );
    expect(mixed.size).toBeGreaterThan(8);
  });

  it("uses custom caption lists and restores factory on empty", () => {
    const s = parseSessionFxSettings({
      theme: "goon",
      captionsByTheme: { goon: ["  мой слоган  ", "мой слоган", "ещё раз"] },
    });
    expect(s.captionsByTheme.goon).toEqual(["мой слоган", "ещё раз"]);
    expect(pickSessionFxCaption(s, 0)).toBe("мой слоган");
    const empty = parseSessionFxSettings({
      theme: "goon",
      captionsByTheme: { goon: ["", "   "] },
    });
    expect(empty.captionsByTheme.goon).toEqual([...SESSION_FX_CAPTIONS.goon]);
  });

  it("Sparkle uses user settings, others use pack.fx", () => {
    const user = { ...DEFAULT_SESSION_FX, hypno: false, theme: "bbc" as const };
    const packOff = {
      avatarCensor: false,
      spiralOverlay: false,
      floatingCaptions: false,
      glitchHud: false,
    };
    const packOn = {
      avatarCensor: true,
      spiralOverlay: true,
      floatingCaptions: true,
      glitchHud: true,
    };
    expect(sessionFxResolve("sparkle", packOn, user).theme).toBe("bbc");
    expect(sessionFxResolve("sparkle", packOn, user).hypno).toBe(false);
    expect(sessionFxAnyOn(sessionFxResolve("hu_tao", packOff, user))).toBe(false);
    expect(sessionFxResolve("hu_tao", packOff, user, true).theme).toBe("bbc");
    expect(sessionFxFromPack(packOn).hypno).toBe(true);
  });

  it("builds a winding spiral path, not a burst of rays", () => {
    const d = buildSessionFxSpiralPath();
    expect(d.startsWith("M")).toBe(true);
    expect(d.endsWith("Z")).toBe(true);
    expect(d.length).toBeGreaterThan(400);
    expect(SESSION_FX_SPIRAL_D).toBe(d);
  });

  it("scatters popups instead of walking a diagonal", () => {
    const pts = Array.from({ length: 48 }, (_, i) => sessionFxPopupPlace(1000 + i));
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(50);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(45);

    const mean = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
    const mx = mean(xs);
    const my = mean(ys);
    let num = 0;
    let dx2 = 0;
    let dy2 = 0;
    for (let i = 0; i < pts.length; i += 1) {
      const dx = xs[i]! - mx;
      const dy = ys[i]! - my;
      num += dx * dy;
      dx2 += dx * dx;
      dy2 += dy * dy;
    }
    const corr = num / Math.sqrt(dx2 * dy2);
    expect(Math.abs(corr)).toBeLessThan(0.35);

    const slopes = new Set<string>();
    for (let i = 1; i < pts.length; i += 1) {
      const dx = pts[i]!.x - pts[i - 1]!.x;
      const dy = pts[i]!.y - pts[i - 1]!.y;
      if (dx === 0) continue;
      slopes.add((dy / dx).toFixed(1));
    }
    expect(slopes.size).toBeGreaterThan(10);
  });
});
