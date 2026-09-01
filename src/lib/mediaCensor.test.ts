import { beforeEach, describe, expect, it } from "vitest";
import {
  installLocalStorageMock,
  resetLocalStorage,
} from "../test/localStorageMock";
import {
  applyMistressCensor,
  clearMediaCensorLock,
  clearMistressCensor,
  containRect,
  DEFAULT_MEDIA_CENSOR,
  growCensorBox,
  growPenisRevealBox,
  keepCensorDetection,
  loadMediaCensorLive,
  mediaCensorActive,
  mosaicCellPx,
  mediaCensorMotionFull,
  mediaCensorPartHintRu,
  MEDIA_CENSOR_LOAD_TAUNTS,
  MEDIA_CENSOR_PARTS,
  PENIS_HOLE_GLANS_MAJOR,
  parseMediaCensorSettings,
  clampMediaCensorPenisHole,
  formatMediaCensorPenisHole,
  penisHoleGrow,
  penisRevealHoles,
  pickMediaCensorLoadTaunt,
  planCensorBoxes,
  setMediaCensorEnabled,
} from "./mediaCensor";

installLocalStorageMock();

beforeEach(() => {
  resetLocalStorage();
});

describe("mediaCensor", () => {
  it("defaults to off mosaic bands", () => {
    expect(parseMediaCensorSettings(null)).toEqual(DEFAULT_MEDIA_CENSOR);
    expect(loadMediaCensorLive().active).toBe(false);
  });

  it("clamps strength and ignores unknown style", () => {
    const s = parseMediaCensorSettings({
      enabled: true,
      style: "sparkle",
      coverage: "bands",
      strength: 99,
      parts: { face: true, breasts: false },
    });
    expect(s.style).toBe("mosaic");
    expect(s.strength).toBe(5);
    expect(s.parts.face).toBe(true);
    expect(s.parts.breasts).toBe(false);
    expect(s.parts.genitals).toBe(true);
    expect(s.parts.penis).toBe(false);
    expect(s.parts.belly).toBe(false);
    expect(s.parts.hands).toBe(false);
    expect(s.detect).toBe(false);
    expect(s.bandsFallback).toBe(true);
    expect(s.loadTaunt).toBe(true);
    expect(s.penisHole).toBe(2);
  });

  it("has a Russian hint for every zone chip", () => {
    for (const part of MEDIA_CENSOR_PARTS) {
      expect(mediaCensorPartHintRu(part).length).toBeGreaterThan(8);
    }
  });

  it("keeps detect off unless explicitly true", () => {
    expect(parseMediaCensorSettings({ detect: true }).detect).toBe(true);
    expect(parseMediaCensorSettings({ detect: "yes" }).detect).toBe(false);
    expect(parseMediaCensorSettings({ bandsFallback: false }).bandsFallback).toBe(
      false,
    );
    expect(parseMediaCensorSettings({ loadTaunt: false }).loadTaunt).toBe(false);
  });

  it("user toggle does not fight a mistress lock", () => {
    applyMistressCensor({ style: "bars" });
    const blocked = setMediaCensorEnabled(false);
    expect(blocked.lock.locked).toBe(true);
    expect(blocked.active).toBe(true);
    expect(blocked.settings.style).toBe("bars");

    const unlocked = clearMediaCensorLock();
    expect(unlocked.lock.locked).toBe(false);
    expect(unlocked.active).toBe(false);
  });

  it("mistress uncover turns the overlay off", () => {
    setMediaCensorEnabled(true);
    applyMistressCensor({});
    const after = clearMistressCensor();
    expect(after.lock.locked).toBe(false);
    expect(after.settings.enabled).toBe(false);
    expect(after.active).toBe(false);
  });

  it("keeps the user preference after the lock drops", () => {
    setMediaCensorEnabled(true);
    applyMistressCensor({ style: "blur", strength: 2 });
    expect(mediaCensorActive()).toBe(true);
    const after = clearMediaCensorLock();
    expect(after.settings.enabled).toBe(true);
    expect(after.settings.style).toBe("blur");
    expect(after.active).toBe(true);
  });

  it("plans full-frame as a single box and bands from enabled parts", () => {
    const full = planCensorBoxes({
      ...DEFAULT_MEDIA_CENSOR,
      coverage: "full",
    });
    expect(full).toHaveLength(1);
    expect(full[0]?.part).toBe("frame");
    expect(full[0]?.w).toBe(1);

    const none = planCensorBoxes({
      ...DEFAULT_MEDIA_CENSOR,
      coverage: "bands",
      parts: {
        ...DEFAULT_MEDIA_CENSOR.parts,
        breasts: false,
        genitals: false,
        penis: false,
        ass: false,
        face: false,
      },
    });
    expect(none).toEqual([]);

    const face = planCensorBoxes({
      ...DEFAULT_MEDIA_CENSOR,
      coverage: "bands",
      strength: 5,
      parts: {
        ...DEFAULT_MEDIA_CENSOR.parts,
        breasts: false,
        genitals: false,
        penis: true,
        ass: false,
        face: true,
      },
    });
    expect(face).toHaveLength(1);
    expect(face[0]?.part).toBe("face");
    expect(face[0]!.w).toBeGreaterThan(0.4);

    const withPenis = planCensorBoxes({
      ...DEFAULT_MEDIA_CENSOR,
      coverage: "bands",
      parts: { ...DEFAULT_MEDIA_CENSOR.parts, penis: true },
    });
    expect(withPenis.some((b) => b.part === "penis")).toBe(false);
    expect(withPenis.some((b) => b.part === "genitals")).toBe(true);

    const belly = planCensorBoxes({
      ...DEFAULT_MEDIA_CENSOR,
      coverage: "bands",
      parts: { ...DEFAULT_MEDIA_CENSOR.parts, belly: true },
    });
    expect(belly.some((b) => b.part === "belly")).toBe(true);
  });

  it("keeps penis detections for holes when the zone is off", () => {
    expect(
      keepCensorDetection("penis", { ...DEFAULT_MEDIA_CENSOR.parts, penis: false }),
    ).toBe(true);
    expect(
      keepCensorDetection("genitals", {
        ...DEFAULT_MEDIA_CENSOR.parts,
        genitals: false,
      }),
    ).toBe(false);

    const detected = [
      { x: 0.4, y: 0.5, w: 0.1, h: 0.2, part: "penis" as const },
      { x: 0.3, y: 0.6, w: 0.2, h: 0.2, part: "genitals" as const },
    ];
    const holes = penisRevealHoles(DEFAULT_MEDIA_CENSOR, detected);
    expect(holes).toHaveLength(1);
    expect(holes[0]?.part).toBe("penis");
    expect(holes[0]!.w).toBeGreaterThan(0.1);
    const withAxis = penisRevealHoles(DEFAULT_MEDIA_CENSOR, [
      { x: 0.4, y: 0.5, w: 0.1, h: 0.2, part: "penis", axisRad: 0.4 },
    ]);
    expect(withAxis[0]?.axisRad).toBeCloseTo(0.4);
    const tight = penisRevealHoles(
      { ...DEFAULT_MEDIA_CENSOR, penisHole: 1 },
      detected,
    );
    const wide = penisRevealHoles(
      { ...DEFAULT_MEDIA_CENSOR, penisHole: 5 },
      detected,
    );
    expect(tight[0]!.w).toBeCloseTo(0.1);
    expect(tight[0]!.h).toBeGreaterThan(0.2);
    expect(wide[0]!.w).toBeGreaterThan(tight[0]!.w);
    expect(penisHoleGrow(1)).toBe(0);
    expect(penisHoleGrow(5)).toBeGreaterThan(penisHoleGrow(2));
    expect(clampMediaCensorPenisHole(1.14)).toBeCloseTo(1.1);
    expect(clampMediaCensorPenisHole(1.16)).toBeCloseTo(1.2);
    expect(formatMediaCensorPenisHole(2)).toBe("2.0");
    expect(parseMediaCensorSettings({ penisHole: 1.3 }).penisHole).toBeCloseTo(
      1.3,
    );
    expect(penisHoleGrow(1.5)).toBeCloseTo(0.02);
    expect(penisHoleGrow(2)).toBeCloseTo(0.04);
    expect(penisHoleGrow(5)).toBeCloseTo(0.22);
    expect(
      penisRevealHoles(
        {
          ...DEFAULT_MEDIA_CENSOR,
          parts: { ...DEFAULT_MEDIA_CENSOR.parts, penis: true },
        },
        detected,
      ),
    ).toEqual([]);
  });

  it("grows a hole box from its own size and stays in 0–1", () => {
    const grown = growCensorBox(
      { x: 0.4, y: 0.4, w: 0.2, h: 0.2, part: "penis" },
      0.25,
    );
    expect(grown.x).toBeCloseTo(0.35);
    expect(grown.w).toBeCloseTo(0.3);
    const edge = growCensorBox(
      { x: 0, y: 0.9, w: 0.2, h: 0.2, part: "penis" },
      0.5,
    );
    expect(edge.x).toBe(0);
    expect(edge.y + edge.h).toBeLessThanOrEqual(1);
  });

  it("pads a tall penis hole on both axes so the glans is not clipped", () => {
    const src = { x: 0.46, y: 0.3, w: 0.08, h: 0.4, part: "penis" as const };
    const hole = growPenisRevealBox(src, 0);
    expect(hole.w).toBeCloseTo(src.w);
    expect(hole.h).toBeCloseTo(src.h + 2 * src.h * PENIS_HOLE_GLANS_MAJOR);
  });

  it("maps object-fit contain into a letterboxed dest rect", () => {
    const tall = containRect(100, 200, 200, 200);
    expect(tall.w).toBeCloseTo(100);
    expect(tall.h).toBeCloseTo(200);
    expect(tall.x).toBeCloseTo(50);
    expect(tall.y).toBeCloseTo(0);

    const wide = containRect(400, 100, 200, 200);
    expect(wide.w).toBeCloseTo(200);
    expect(wide.h).toBeCloseTo(50);
    expect(wide.y).toBeCloseTo(75);
  });

  it("grows mosaic cells with strength but stays inside the box", () => {
    expect(mosaicCellPx(1, 200)).toBeLessThan(mosaicCellPx(5, 200));
    expect(mosaicCellPx(5, 12)).toBeLessThanOrEqual(12);
  });

  it("treats video and gif as full-frame motion censor", () => {
    expect(mediaCensorMotionFull("video")).toBe(true);
    expect(mediaCensorMotionFull("gif")).toBe(true);
    expect(mediaCensorMotionFull("image")).toBe(false);
  });

  it("picks a stable load taunt for the same seed", () => {
    const a = pickMediaCensorLoadTaunt("item-7");
    const b = pickMediaCensorLoadTaunt("item-7");
    const c = pickMediaCensorLoadTaunt("item-7", 1);
    expect(a).toBe(b);
    expect(a.length).toBeGreaterThan(8);
    expect(c).not.toBe(a);
    expect(MEDIA_CENSOR_LOAD_TAUNTS.length).toBeGreaterThanOrEqual(24);
  });
});
