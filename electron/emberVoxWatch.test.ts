import { describe, expect, it } from "vitest";
import {
  emberWatchBasename,
  emberWatchEventMatches,
} from "./emberVoxWatch.mjs";

describe("ember vox file watch", () => {
  it("matches MagicaVoxel basename ignoring path slashes", () => {
    expect(emberWatchBasename("voxels/models/vox_vil_lamp.vox")).toBe(
      "vox_vil_lamp.vox",
    );
    expect(
      emberWatchEventMatches(
        "voxels/models/vox_vil_lamp.vox",
        "vox_vil_lamp.vox",
      ),
    ).toBe(true);
    expect(
      emberWatchEventMatches(
        "voxels/models/vox_vil_lamp.vox",
        "vox_vil_lamp.vox.tmp",
      ),
    ).toBe(false);
    expect(
      emberWatchEventMatches("voxels/models/vox_vil_lamp.vox", "other.vox"),
    ).toBe(false);
  });
});
