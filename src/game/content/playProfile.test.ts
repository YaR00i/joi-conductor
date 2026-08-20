import { describe, expect, it } from "vitest";
import { createEmptyMap } from "../tile/mapUtils";
import {
  autoAttackValidationMessage,
  isMapPlayProfile,
  normalizeMapPlayProfile,
  playProfileValidationMessage,
  resolveMapAutoAttack,
  resolveMapPlayProfile,
  stageUsesTimedClear,
} from "./playProfile";

describe("map playProfile", () => {
  it("defaults omitted and empty values to arena", () => {
    const map = createEmptyMap("yard", 8, 8, "tiles", 16);
    expect(resolveMapPlayProfile(map)).toBe("arena");
    expect(resolveMapPlayProfile({ playProfile: undefined })).toBe("arena");
    expect(resolveMapPlayProfile({ playProfile: "" })).toBe("arena");
  });

  it("keeps authored explore and arena", () => {
    expect(resolveMapPlayProfile({ playProfile: "explore" })).toBe("explore");
    expect(resolveMapPlayProfile({ playProfile: "arena" })).toBe("arena");
  });

  it("defaults explore to manual attack and arena to auto attack", () => {
    expect(resolveMapAutoAttack({ playProfile: "explore" })).toBe(false);
    expect(resolveMapAutoAttack({ playProfile: "arena" })).toBe(true);
    expect(resolveMapAutoAttack({})).toBe(true);
  });

  it("keeps an authored auto-attack override", () => {
    expect(
      resolveMapAutoAttack({ playProfile: "explore", autoAttack: true }),
    ).toBe(true);
    expect(
      resolveMapAutoAttack({ playProfile: "arena", autoAttack: false }),
    ).toBe(false);
  });

  it("clears arena on the timer and leaves explore open-ended", () => {
    expect(stageUsesTimedClear("arena")).toBe(true);
    expect(stageUsesTimedClear("explore")).toBe(false);
  });

  it("rejects unknown strings at validate time", () => {
    expect(isMapPlayProfile("village")).toBe(false);
    expect(playProfileValidationMessage("village")).toMatch(/village/);
    expect(playProfileValidationMessage("arena")).toBeNull();
    expect(playProfileValidationMessage(undefined)).toBeNull();
    expect(normalizeMapPlayProfile("explore")).toBe("explore");
    expect(normalizeMapPlayProfile("nope")).toBeUndefined();
    expect(autoAttackValidationMessage(true)).toBeNull();
    expect(autoAttackValidationMessage(undefined)).toBeNull();
    expect(autoAttackValidationMessage("yes")).toMatch(/boolean/);
  });
});
