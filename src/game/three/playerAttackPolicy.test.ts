import { describe, expect, it } from "vitest";
import {
  isTriggeredPlayerWeapon,
  shouldTriggerPlayerWeapon,
} from "./playerAttackPolicy";

describe("player attack policy", () => {
  it("only triggers projectile and nova weapons", () => {
    expect(isTriggeredPlayerWeapon("projectile")).toBe(true);
    expect(isTriggeredPlayerWeapon("nova")).toBe(true);
    expect(isTriggeredPlayerWeapon("orbit")).toBe(false);
    expect(isTriggeredPlayerWeapon("passive")).toBe(false);
    expect(isTriggeredPlayerWeapon("instant_heal")).toBe(false);
  });

  it("requires auto attack for cooldown-driven firing", () => {
    expect(shouldTriggerPlayerWeapon("auto", true, 0)).toBe(true);
    expect(shouldTriggerPlayerWeapon("auto", false, 0)).toBe(false);
    expect(shouldTriggerPlayerWeapon("auto", true, 1)).toBe(false);
  });

  it("allows a manual click whenever the cooldown is ready", () => {
    expect(shouldTriggerPlayerWeapon("manual", false, 0)).toBe(true);
    expect(shouldTriggerPlayerWeapon("manual", true, 0)).toBe(true);
    expect(shouldTriggerPlayerWeapon("manual", false, 1)).toBe(false);
  });
});
