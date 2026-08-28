import { describe, expect, it } from "vitest";
import { parseEmberVoxelEditorDeepLink } from "./emberEditorDeepLink";

describe("Ember voxel editor deep link", () => {
  it("opens a safe model directly in emissive material mode", () => {
    expect(
      parseEmberVoxelEditorDeepLink(
        "?emberEditor=voxel&modelId=vox_fan_lantern_paper&workspace=material&tool=emit",
      ),
    ).toEqual({
      modelId: "vox_fan_lantern_paper",
      workspace: "material",
      tool: "emit",
    });
  });

  it("opens a safe model directly with the transparency brush", () => {
    expect(
      parseEmberVoxelEditorDeepLink(
        "?emberEditor=voxel&modelId=vox_fan_window&workspace=material&tool=transparency",
      ),
    ).toEqual({
      modelId: "vox_fan_window",
      workspace: "material",
      tool: "transparency",
    });
  });

  it("ignores unrelated or unsafe links", () => {
    expect(parseEmberVoxelEditorDeepLink("?emberEditor=map")).toBeNull();
    expect(
      parseEmberVoxelEditorDeepLink(
        "?emberEditor=voxel&modelId=../vox_fan_lantern_paper",
      ),
    ).toBeNull();
    expect(
      parseEmberVoxelEditorDeepLink(
        "?emberEditor=voxel&modelId=vox_fan_window&workspace=material&tool=erase",
      ),
    ).toBeNull();
  });
});
