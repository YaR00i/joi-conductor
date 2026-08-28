import { describe, expect, it } from "vitest";
import {
  BUILTIN_SUNNY_EVENING_LOOK,
  BUILTIN_TOY_LOOK,
  isBuiltinLookPreset,
  listLookPresets,
  normalizeLookPreset,
} from "./lookPresets";
import { resolveMapAtmosphere } from "../tile/mapUtils";

describe("look presets / atmosphere", () => {
  it("fills sparkle and tiltShift when omitted", () => {
    const atm = resolveMapAtmosphere({ fog: 0.02 });
    expect(atm.fog).toBeCloseTo(0.02);
    expect(atm.sparkle).toBe(0);
    expect(atm.tiltShift).toBe(0);
  });

  it("keeps the toy diorama look as a builtin", () => {
    expect(isBuiltinLookPreset(BUILTIN_TOY_LOOK.id)).toBe(true);
    expect(BUILTIN_TOY_LOOK.atmosphere.sparkle).toBeGreaterThan(0.3);
    expect(BUILTIN_TOY_LOOK.atmosphere.tiltShift).toBeGreaterThan(0.3);
    expect(BUILTIN_TOY_LOOK.atmosphere.fog).toBeLessThan(0.1);
  });

  it("lists sunny evening then toy before pack looks", () => {
    const listed = listLookPresets({
      look_zzz: {
        ...BUILTIN_SUNNY_EVENING_LOOK,
        id: "look_zzz",
        nameRu: "яяя",
      },
    });
    expect(listed[0]?.id).toBe(BUILTIN_SUNNY_EVENING_LOOK.id);
    expect(listed[1]?.id).toBe(BUILTIN_TOY_LOOK.id);
  });

  it("normalizes a sparse look onto resolved atmosphere", () => {
    const p = normalizeLookPreset({
      id: "look_test_sparse",
      nameRu: "тест",
      atmosphere: { fog: 0.01, sparkle: 0.4 },
    });
    expect(p).not.toBeNull();
    expect(p!.atmosphere.fog).toBeCloseTo(0.01);
    expect(p!.atmosphere.sparkle).toBeCloseTo(0.4);
    expect(p!.atmosphere.tiltShift).toBe(0);
    expect(p!.atmosphere.fireflies).toBe(0);
  });
});
