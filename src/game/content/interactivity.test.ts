import { describe, expect, it } from "vitest";
import {
  compactInteractivity,
  findInteractivePropAt,
  isEmberInteractivityKind,
  isQuestMarkerKind,
  parseInteractivity,
  wouldFireForInteractivity,
  wouldFireForTriggerRegion,
} from "./interactivity";
import type { EmberMap } from "./types";

function mapWith(partial: Partial<EmberMap>): EmberMap {
  return {
    id: "test",
    tileSize: 16,
    width: 8,
    height: 8,
    tilesetId: "test",
    layers: [],
    regions: [],
    ...partial,
  };
}

describe("interactivity modifier", () => {
  it("parses the exhaustive kind union and rejects unknown kinds", () => {
    expect(isEmberInteractivityKind("door")).toBe(true);
    expect(isEmberInteractivityKind("talk")).toBe(true);
    expect(isEmberInteractivityKind("quest_marker")).toBe(true);
    expect(isEmberInteractivityKind("shop")).toBe(true);
    expect(isEmberInteractivityKind("custom")).toBe(true);
    expect(isEmberInteractivityKind("chest")).toBe(false);
    expect(parseInteractivity({ kind: "door", triggerId: " cabin " })).toEqual({
      kind: "door",
      triggerId: "cabin",
    });
    expect(parseInteractivity({ kind: "nope" })).toBeNull();
    expect(
      compactInteractivity({
        kind: "shop",
        shopId: " village_kiosk ",
      }),
    ).toEqual({ kind: "shop", shopId: "village_kiosk" });
    expect(isQuestMarkerKind("quest_marker")).toBe(true);
    expect(isQuestMarkerKind("door")).toBe(false);
    expect(
      parseInteractivity({
        kind: "quest_marker",
        questStatus: "active",
        iconId: "quest_active",
      }),
    ).toEqual({
      kind: "quest_marker",
      questStatus: "active",
      iconId: "quest_active",
    });
  });

  it("resolves wouldFire per kind and bound trigger", () => {
    const map = mapWith({
      regions: [
        {
          id: "enter",
          kind: "trigger",
          x: 1,
          y: 1,
          w: 1,
          h: 1,
          scriptId: "enter_house",
        },
        {
          id: "warp_out",
          kind: "trigger",
          x: 2,
          y: 1,
          w: 1,
          h: 1,
          targetMapId: "other_map",
          targetRegionId: "start",
        },
      ],
    });
    expect(
      wouldFireForInteractivity(map, { kind: "shop", scriptId: "ignored" }),
    ).toEqual({
      action: "shop",
      shopId: null,
      nameRu: null,
      wallet: 0,
      listings: [],
    });
    expect(
      wouldFireForInteractivity(map, { kind: "shop", shopId: "village_kiosk" }),
    ).toMatchObject({ action: "shop", shopId: "village_kiosk" });
    expect(
      wouldFireForInteractivity(map, {
        kind: "talk",
        scriptId: "npc_hi",
      }),
    ).toEqual({ action: "talk", scriptId: "npc_hi" });
    expect(
      wouldFireForInteractivity(map, {
        kind: "door",
        triggerId: "enter",
      }),
    ).toEqual({ action: "run_script", scriptId: "enter_house" });
    expect(
      wouldFireForInteractivity(map, {
        kind: "quest_marker",
        triggerId: "warp_out",
        iconId: "quest",
      }),
    ).toEqual({
      action: "change_map",
      targetMapId: "other_map",
      targetRegionId: "start",
    });
    expect(wouldFireForInteractivity(map, { kind: "custom" })).toEqual({
      action: "run_script",
      scriptId: null,
    });
    expect(
      wouldFireForTriggerRegion({
        id: "enter",
        kind: "trigger",
        x: 0,
        y: 0,
        w: 1,
        h: 1,
        scriptId: "enter_house",
      }),
    ).toEqual({ action: "run_script", scriptId: "enter_house" });
  });

  it("hits a placed voxel by tile footprint", () => {
    const map = mapWith({
      voxelProps: [
        {
          id: "sign-1",
          modelId: "vox_vil_sign",
          x: 3,
          y: 4,
          interactivity: { kind: "quest_marker", triggerId: "notice" },
        },
      ],
    });
    expect(findInteractivePropAt(map, 3 * 16 + 4, 4 * 16 + 4)?.id).toBe(
      "sign-1",
    );
    expect(findInteractivePropAt(map, 2 * 16 + 4, 4 * 16 + 4)).toBeNull();
  });
});
