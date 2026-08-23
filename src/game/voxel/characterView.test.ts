import { describe, expect, it } from "vitest";
import {
  characterCardViewFromYaw,
  characterCardViewSticky,
  lookYawToward,
} from "./characterView";

describe("character card views (Octopath)", () => {
  it("shows the face when the camera looks toward +Z (character faces +Z)", () => {
    const look = lookYawToward({ x: 0, z: 8 }, { x: 0, z: 0 });
    expect(look).toBeCloseTo(Math.PI, 5);
    expect(characterCardViewFromYaw(look, 0)).toBe("front");
  });

  it("shows the back of the head when looking from -Z", () => {
    const look = lookYawToward({ x: 0, z: -8 }, { x: 0, z: 0 });
    expect(look).toBeCloseTo(0, 5);
    expect(characterCardViewFromYaw(look, 0)).toBe("back");
  });

  it("shows left/right profiles from ±X", () => {
    expect(
      characterCardViewFromYaw(lookYawToward({ x: 8, z: 0 }, { x: 0, z: 0 }), 0),
    ).toBe("side_l");
    expect(
      characterCardViewFromYaw(lookYawToward({ x: -8, z: 0 }, { x: 0, z: 0 }), 0),
    ).toBe("side_r");
  });

  it("holds the current frame until well past the 45° seam", () => {
    const state = { view: "front" as const };
    const frontLook = Math.PI;
    const stillFront = frontLook - 0.25;
    expect(characterCardViewFromYaw(stillFront, 0)).toBe("front");
    expect(characterCardViewSticky(stillFront, state, 0, 0.28)).toBe("front");
    const sideLook = Math.PI / 2;
    expect(characterCardViewFromYaw(sideLook, 0)).toBe("side_r");
    expect(characterCardViewSticky(sideLook, state, 0, 0.28)).toBe("side_r");
    expect(state.view).toBe("side_r");
  });
});
