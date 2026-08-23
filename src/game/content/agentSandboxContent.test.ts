import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  resolveMapAutoAttack,
  resolveMapPlayProfile,
} from "./playProfile";
import type { EmberMap, EmberSpawnTable, EmberStage } from "./types";
import { resolvePlayProfileBudget } from "../three/renderBudget";
import { ensureMapLayers } from "../tile/mapUtils";

const emberRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../content/ember",
);

function readJson<T>(rel: string): T {
  return JSON.parse(readFileSync(path.join(emberRoot, rel), "utf8")) as T;
}

describe("agent_sandbox content", () => {
  const map = ensureMapLayers(readJson<EmberMap>("maps/agent_sandbox.json"));
  const stage = readJson<EmberStage>("stages/agent_sandbox.json");
  const spawn = readJson<EmberSpawnTable>("spawns/agent_sandbox.json");

  it("is a compact explore map with no combat regions", () => {
    expect(map.id).toBe("agent_sandbox");
    expect(map.playProfile).toBe("explore");
    expect(resolveMapPlayProfile(map)).toBe("explore");
    expect(resolveMapAutoAttack(map)).toBe(false);
    expect(resolvePlayProfileBudget("explore").allowHorde).toBe(false);
    expect(map.width).toBe(24);
    expect(map.height).toBe(24);
    expect(map.tilesetId).toBe("village_16");
    expect(map.regions.some((r) => r.kind === "player_start")).toBe(true);
    expect(map.regions.filter((r) => r.kind === "spawn")).toEqual([]);
    const notice = map.regions.find((r) => r.id === "notice");
    expect(notice?.kind).toBe("trigger");
    expect(notice).toMatchObject({
      x: 16,
      y: 20,
      w: 2,
      h: 2,
      scriptId: "sandbox_notice",
      boundObjectId: "sbx_quest_sign",
    });
    const cabinEnter = map.regions.find((r) => r.id === "cabin_enter");
    expect(cabinEnter).toMatchObject({
      kind: "trigger",
      x: 17,
      y: 3,
      w: 2,
      h: 2,
      scriptId: "sandbox_cabin_enter",
      targetMapId: "agent_sandbox_interior",
      targetRegionId: "start",
      boundObjectId: "sbx_cabin_door",
    });
    expect(map.voxelProps?.find((p) => p.id === "sbx_quest_sign")).toMatchObject({
      modelId: "vox_vil_sign",
      x: 16,
      y: 18,
      interactivity: {
        kind: "quest_marker",
        triggerId: "notice",
        iconId: "quest",
        questStatus: "available",
      },
    });
    expect(map.voxelProps?.find((p) => p.id === "sbx_talk_npc")).toMatchObject({
      x: 4,
      y: 20,
      interactivity: { kind: "talk", scriptId: "sandbox_guard_talk" },
    });
    expect(map.voxelProps?.find((p) => p.id === "sbx_branch_npc")).toMatchObject({
      interactivity: { kind: "talk", scriptId: "sandbox_branch" },
    });
    expect(map.voxelProps?.find((p) => p.id === "sbx_quest_active")?.interactivity).toMatchObject({
      kind: "quest_marker",
      questStatus: "active",
    });
    expect(map.voxelProps?.find((p) => p.id === "sbx_quest_done")?.interactivity).toMatchObject({
      kind: "quest_marker",
      questStatus: "done",
    });
    expect(map.regions.find((r) => r.id === "chain_demo")).toMatchObject({
      kind: "trigger",
      scriptId: "sandbox_chain",
    });
    expect(map.voxelProps?.find((p) => p.id === "sbx_cabin_door")).toMatchObject({
      modelId: "vox_vil_mailbox",
      x: 14,
      y: 19,
      interactivity: { kind: "door", triggerId: "cabin_enter" },
    });
    expect(map.voxelProps?.find((p) => p.id === "sbx_shop_kiosk")).toMatchObject({
      modelId: "vox_vil_counter",
      x: 8,
      y: 20,
      interactivity: { kind: "shop", shopId: "village_kiosk" },
    });
    expect(map.regions.filter((r) => r.kind === "npc_idle")).toEqual([]);
    expect(map.regions.filter((r) => r.kind === "npc_wander")).toEqual([]);
  });

  it("pairs teleports A↔B and keeps the spawn table empty", () => {
    const padA = map.regions.find((r) => r.id === "teleport_a");
    const padB = map.regions.find((r) => r.id === "teleport_b");
    expect(padA?.kind).toBe("teleport");
    expect(padB?.kind).toBe("teleport");
    expect(padA?.targetRegionId).toBe("teleport_b");
    expect(padB?.targetRegionId).toBe("teleport_a");
    expect(padA).toMatchObject({ x: 4, y: 12, w: 1, h: 1 });
    expect(padB).toMatchObject({ x: 19, y: 12, w: 1, h: 1 });
    expect(spawn.id).toBe("agent_sandbox");
    expect(spawn.entries).toEqual([]);
    expect(stage.id).toBe("agent_sandbox");
    expect(stage.mapId).toBe("agent_sandbox");
    expect(stage.spawnTableId).toBe("agent_sandbox");
  });

  it("pairs the cabin door with a tiny interior map", () => {
    const interior = ensureMapLayers(
      readJson<EmberMap>("maps/agent_sandbox_interior.json"),
    );
    expect(interior.id).toBe("agent_sandbox_interior");
    expect(interior.playProfile).toBe("explore");
    expect(interior.regions.find((r) => r.id === "start")?.kind).toBe(
      "player_start",
    );
    expect(interior.regions.find((r) => r.id === "exit")).toMatchObject({
      kind: "trigger",
      targetMapId: "agent_sandbox",
      targetRegionId: "cabin_enter",
    });
  });

  it("places a once-chest stash with stub loot ids", () => {
    const chest = map.regions.find((r) => r.id === "chest");
    expect(chest).toMatchObject({
      kind: "chest",
      x: 10,
      y: 16,
      w: 1,
      h: 1,
      lootIds: ["coin", "herb", "funeral_polearm"],
      closedModelId: "vox_ms8vsb53",
    });
    expect(chest?.repeatable).toBeUndefined();
  });
});
