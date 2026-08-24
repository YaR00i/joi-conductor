import { describe, expect, it } from "vitest";
import { PLAYER_BODY_R } from "../combat/radii";
import { regionCenter, listPhysicalVoxelCollisionAabbs } from "../tile/mapUtils";
import { createExploreSim } from "./exploreSim";
import { loadExploreWorldFromDisk } from "./explorePackDisk";
import {
  createEmberAgentSession,
  runEmberAgentCommand,
} from "./emberAgent";
import {
  MCP_TOOLS,
  callMcpTool,
  dispatchJsonRpc,
  handleMcpRequest,
  takeMcpFrames,
} from "./emberAgentMcp";

function loadSandbox() {
  return loadExploreWorldFromDisk({ mapId: "agent_sandbox" });
}

function simOpts(world: ReturnType<typeof loadSandbox>) {
  return {
    map: world.map,
    tileset: world.tileset,
    speed: world.stage?.moveSpeed,
    voxelModels: world.voxelModels,
    voxelScenes: world.voxelScenes,
    body: world.body,
    items: world.items,
    itemIcons: world.itemIcons,
    shops: world.shops,
    scenes: world.scenes,
    scripts: world.scripts,
    loadWorld: (mapId: string) => {
      try {
        const next = loadExploreWorldFromDisk({ mapId });
        return {
          map: next.map,
          tileset: next.tileset,
          voxelModels: next.voxelModels,
          voxelScenes: next.voxelScenes,
          body: next.body,
          speed: next.stage?.moveSpeed,
          items: next.items,
          itemIcons: next.itemIcons,
          shops: next.shops,
          scenes: next.scenes,
          scripts: next.scripts,
        };
      } catch {
        return null;
      }
    },
  };
}

describe("exploreSim agent_sandbox", () => {
  it("spawns on start and dumps JSON state", () => {
    const world = loadSandbox();
    const sim = createExploreSim(simOpts(world));
    const dump = sim.dump();
    expect(dump.mapId).toBe("agent_sandbox");
    expect(dump.profile).toBe("explore");
    expect(dump.tile.tx).toBeGreaterThanOrEqual(10);
    expect(dump.tile.tx).toBeLessThan(14);
    expect(dump.tile.ty).toBeGreaterThanOrEqual(20);
    expect(dump.tile.ty).toBeLessThan(22);
    expect(dump.occupyingId).toBeNull();
    expect(dump.nearby[0]?.id).toBe("start");
  });

  it("respects player_start elevation and ignores a stacked ground teleporter", () => {
    const world = loadSandbox();
    const start = world.map.regions.find((region) => region.id === "start")!;
    const elevatedMap = {
      ...world.map,
      regions: [
        ...world.map.regions.map((region) =>
          region.id === start.id ? { ...region, elev: 3 } : region,
        ),
        {
          id: "under_start",
          kind: "teleport" as const,
          x: start.x,
          y: start.y,
          w: start.w,
          h: start.h,
          elev: 0,
          targetX: 1,
          targetY: 1,
        },
      ],
    };
    const sim = createExploreSim({ ...simOpts(world), map: elevatedMap });
    expect(sim.dump()).toMatchObject({ elev: 3, occupyingId: null });
  });

  it("walks to teleport_a and arrives at teleport_b with voxel collision loaded", () => {
    const world = loadSandbox();
    const sim = createExploreSim(simOpts(world));
    const padA = world.map.regions.find((r) => r.id === "teleport_a");
    const padB = world.map.regions.find((r) => r.id === "teleport_b");
    expect(padA && padB).toBeTruthy();
    const a = regionCenter(world.map, padA!);
    const b = regionCenter(world.map, padB!);

    let dump = sim.dump();
    for (let i = 0; i < 180 && dump.lastWarp?.fromId !== "teleport_a"; i++) {
      dump = sim.walkToward(a.x, a.y, 1 / 30);
    }

    expect(dump.lastWarp?.fromId).toBe("teleport_a");
    expect(dump.occupyingId).toBe("teleport_b");
    expect(dump.x).toBeCloseTo(b.x, 5);
    expect(dump.y).toBeCloseTo(b.y, 5);
    expect(dump.tile.tx).toBe(19);
    expect(dump.tile.ty).toBe(12);
  });

  it("blocks walking through the NW planter voxel prop", () => {
    const world = loadSandbox();
    expect(world.voxelModels.vox_vil_planter).toBeTruthy();
    const boxes = listPhysicalVoxelCollisionAabbs(
      world.map,
      world.voxelModels,
      world.voxelScenes,
    );
    expect(boxes.length).toBeGreaterThan(0);
    const planter = world.map.voxelProps?.find((p) => p.id === "sbx_planter_nw");
    expect(planter).toBeTruthy();
    const ts = world.map.tileSize;
    const cx = planter!.x * ts + ts / 2;
    const cy = planter!.y * ts + ts / 2;
    const hit = boxes.find(
      (box) => cx >= box.minX && cx <= box.maxX && cy >= box.minZ && cy <= box.maxZ,
    );
    expect(hit).toBeTruthy();

    const sim = createExploreSim(simOpts(world));
    const ghost = createExploreSim({
      map: world.map,
      tileset: world.tileset,
      speed: world.stage?.moveSpeed,
      body: world.body,
    });
    let ghostDump = ghost.dump();
    for (let i = 0; i < 180; i++) {
      ghostDump = ghost.walkToward(cx, cy, 1 / 30);
    }
    const ghostDist = Math.hypot(ghostDump.x - cx, ghostDump.y - cy);

    let dump = sim.dump();
    for (let i = 0; i < 180; i++) {
      dump = sim.walkToward(cx, cy, 1 / 30);
    }
    const dist = Math.hypot(dump.x - cx, dump.y - cy);
    const inside =
      dump.x >= hit!.minX + PLAYER_BODY_R &&
      dump.x <= hit!.maxX - PLAYER_BODY_R &&
      dump.y >= hit!.minZ + PLAYER_BODY_R &&
      dump.y <= hit!.maxZ - PLAYER_BODY_R;
    expect(inside).toBe(false);
    expect(dist).toBeGreaterThan(ghostDist);
    expect(dist).toBeGreaterThan(PLAYER_BODY_R);
  });

  it("interact on the notice trigger reports the script without Phaser", () => {
    const world = loadSandbox();
    const notice = world.map.regions.find((r) => r.id === "notice");
    expect(notice?.kind).toBe("trigger");
    const dest = regionCenter(world.map, notice!);
    const sim = createExploreSim(simOpts(world));
    let dump = sim.dump();
    for (let i = 0; i < 120; i++) {
      dump = sim.walkToward(dest.x, dest.y, 1 / 30);
    }
    dump = sim.interact();
    expect(dump.lastInteract?.ok).toBe(true);
    expect(dump.lastInteract?.kind).toBe("trigger");
    expect(dump.lastInteract?.regionId).toBe("notice");
    expect(dump.lastInteract?.scriptId).toBe("sandbox_notice");
    expect(dump.lastInteract?.wouldFire).toEqual({
      action: "run_script",
      scriptId: "sandbox_notice",
    });
    expect(dump.lastInteract?.reason).toBe("fired");
  });

  it("interact facing the quest sign fires the bound notice trigger", () => {
    const world = loadSandbox();
    const sign = world.map.voxelProps?.find((p) => p.id === "sbx_quest_sign");
    expect(sign?.interactivity?.kind).toBe("quest_marker");
    const ts = world.map.tileSize;
    const dest = {
      x: sign!.x * ts + ts / 2,
      y: (sign!.y + 1) * ts + ts / 2,
    };
    const sim = createExploreSim(simOpts(world));
    let dump = sim.dump();
    for (let i = 0; i < 180; i++) {
      dump = sim.walkToward(dest.x, dest.y, 1 / 30);
    }
    dump = sim.walkToward(sign!.x * ts + ts / 2, sign!.y * ts + ts / 2, 1 / 30);
    dump = sim.interact();
    expect(dump.lastInteract?.ok).toBe(true);
    expect(dump.lastInteract?.kind).toBe("interactivity");
    expect(dump.lastInteract?.interactivityKind).toBe("quest_marker");
    expect(dump.lastInteract?.objectId).toBe("sbx_quest_sign");
    expect(dump.lastInteract?.regionId).toBe("notice");
    expect(dump.lastInteract?.wouldFire).toEqual({
      action: "run_script",
      scriptId: "sandbox_notice",
    });
  });

  it("interact facing the door placeholder fires the cabin trigger", () => {
    const world = loadSandbox();
    const door = world.map.voxelProps?.find((p) => p.id === "sbx_cabin_door");
    expect(door?.interactivity?.kind).toBe("door");
    const ts = world.map.tileSize;
    const dest = {
      x: door!.x * ts + ts / 2,
      y: (door!.y + 1) * ts + ts / 2,
    };
    const sim = createExploreSim(simOpts(world));
    let dump = sim.dump();
    for (let i = 0; i < 120; i++) {
      dump = sim.walkToward(dest.x, dest.y, 1 / 30);
    }
    dump = sim.walkToward(door!.x * ts + ts / 2, door!.y * ts + ts / 2, 1 / 30);
    dump = sim.interact();
    expect(dump.lastInteract?.ok).toBe(true);
    expect(dump.lastInteract?.kind).toBe("interactivity");
    expect(dump.lastInteract?.interactivityKind).toBe("door");
    expect(dump.lastInteract?.objectId).toBe("sbx_cabin_door");
    expect(dump.lastInteract?.wouldFire).toEqual({
      action: "change_map",
      targetMapId: "agent_sandbox_interior",
      targetRegionId: "start",
    });
    expect(dump.mapId).toBe("agent_sandbox_interior");
    expect(dump.lastMapChange).toMatchObject({
      fromMapId: "agent_sandbox",
      fromId: "cabin_enter",
      toMapId: "agent_sandbox_interior",
      faded: true,
    });
    expect(dump.tile.tx).toBeGreaterThanOrEqual(5);
    expect(dump.tile.tx).toBeLessThan(7);
    expect(dump.tile.ty).toBeGreaterThanOrEqual(4);
    expect(dump.tile.ty).toBeLessThan(6);
  });

  it("walks to the chest, loots catalog ids, then finds it empty", () => {
    const world = loadSandbox();
    const chest = world.map.regions.find((r) => r.id === "chest");
    expect(chest?.kind).toBe("chest");
    expect(chest?.lootIds).toEqual(["coin", "herb", "funeral_polearm"]);
    const dest = regionCenter(world.map, chest!);
    const sim = createExploreSim(simOpts(world));
    let dump = sim.dump();
    for (let i = 0; i < 180; i++) {
      dump = sim.walkToward(dest.x, dest.y, 1 / 30);
    }
    dump = sim.interact();
    expect(dump.lastInteract?.ok).toBe(true);
    expect(dump.lastInteract?.kind).toBe("chest");
    expect(dump.lastInteract?.regionId).toBe("chest");
    expect(dump.lastInteract?.wouldFire).toEqual({
      action: "open_chest",
      closedModelId: "vox_ms8vsb53",
      sceneId: null,
      loot: ["coin", "herb", "funeral_polearm"],
      lootNames: ["Монета", "Погребальная трава", "Пика похоронного бюро"],
      empty: false,
      opened: true,
      alreadyOpen: false,
      repeatable: false,
    });
    expect(dump.inventory).toEqual({
      coin: 1,
      herb: 1,
      funeral_polearm: 1,
    });
    expect(dump.openedChests).toEqual(["agent_sandbox:chest"]);
    const snap = sim.snapshot();
    const restored = createExploreSim(simOpts(world));
    restored.restore(snap);
    dump = restored.interact();
    expect(dump.lastInteract?.wouldFire).toMatchObject({
      action: "open_chest",
      loot: [],
      empty: true,
      alreadyOpen: true,
      opened: true,
    });
    dump = sim.interact();
    expect(dump.lastInteract?.wouldFire).toMatchObject({
      action: "open_chest",
      loot: [],
      empty: true,
      alreadyOpen: true,
      opened: true,
    });
  });

  it("walking into cabin_enter changes map without interact", () => {
    const world = loadSandbox();
    const enter = world.map.regions.find((r) => r.id === "cabin_enter");
    expect(enter?.targetMapId).toBe("agent_sandbox_interior");
    const dest = regionCenter(world.map, enter!);
    const sim = createExploreSim(simOpts(world));
    let dump = sim.dump();
    for (let i = 0; i < 240 && dump.mapId === "agent_sandbox"; i++) {
      dump = sim.walkToward(dest.x, dest.y, 1 / 30);
    }
    expect(dump.mapId).toBe("agent_sandbox_interior");
    expect(dump.lastMapChange?.fromId).toBe("cabin_enter");
    expect(dump.tile.tx).toBeGreaterThanOrEqual(5);
    expect(dump.tile.tx).toBeLessThan(7);
  });
});

describe("ember-agent commands", () => {
  it("walk-toward teleport_a warps to teleport_b", () => {
    const session = createEmberAgentSession({ mapId: "agent_sandbox" });
    const result = runEmberAgentCommand(session, {
      cmd: "walk-toward",
      to: "teleport_a",
    });
    expect(result.ok).toBe(true);
    expect(result.reached).toBe(true);
    expect(result.lastWarp?.fromId).toBe("teleport_a");
    expect(result.occupyingId).toBe("teleport_b");
    expect(result.tile.tx).toBe(19);
    expect(result.tile.ty).toBe(12);
  });

  it("step uses map axes and interact hits notice", () => {
    const session = createEmberAgentSession({ mapId: "agent_sandbox" });
    const walked = runEmberAgentCommand(session, {
      cmd: "walk-toward",
      to: "notice",
    });
    expect(walked.ok).toBe(true);
    const interacted = runEmberAgentCommand(session, { cmd: "interact" });
    expect(interacted.lastInteract?.regionId).toBe("notice");
    expect(interacted.lastInteract?.wouldFire?.action).toBe("run_script");
  });

  it("walk-toward chest then interact loots once", () => {
    const session = createEmberAgentSession({ mapId: "agent_sandbox" });
    const walked = runEmberAgentCommand(session, {
      cmd: "walk-toward",
      to: "chest",
    });
    expect(walked.ok).toBe(true);
    const first = runEmberAgentCommand(session, { cmd: "interact" });
    expect(first.lastInteract?.regionId).toBe("chest");
    expect(first.lastInteract?.wouldFire).toEqual({
      action: "open_chest",
      closedModelId: "vox_ms8vsb53",
      sceneId: null,
      loot: ["coin", "herb", "funeral_polearm"],
      lootNames: ["Монета", "Погребальная трава", "Пика похоронного бюро"],
      empty: false,
      opened: true,
      alreadyOpen: false,
      repeatable: false,
    });
    expect(first.inventory).toEqual({
      coin: 1,
      herb: 1,
      funeral_polearm: 1,
    });
    const second = runEmberAgentCommand(session, { cmd: "interact" });
    expect(second.lastInteract?.wouldFire).toMatchObject({
      action: "open_chest",
      loot: [],
      empty: true,
      alreadyOpen: true,
    });
  });

  it("walk-toward the cabin door then interact reports door wouldFire", () => {
    const session = createEmberAgentSession({ mapId: "agent_sandbox" });
    const walked = runEmberAgentCommand(session, {
      cmd: "walk-toward",
      tx: 14,
      ty: 20,
    });
    expect(walked.ok).toBe(true);
    runEmberAgentCommand(session, { cmd: "step", dir: "north" });
    const interacted = runEmberAgentCommand(session, { cmd: "interact" });
    expect(interacted.lastInteract?.objectId).toBe("sbx_cabin_door");
    expect(interacted.lastInteract?.interactivityKind).toBe("door");
    expect(interacted.lastInteract?.wouldFire).toEqual({
      action: "change_map",
      targetMapId: "agent_sandbox_interior",
      targetRegionId: "start",
    });
    expect(interacted.mapId).toBe("agent_sandbox_interior");
    expect(interacted.tile.tx).toBeGreaterThanOrEqual(5);
    expect(interacted.tile.tx).toBeLessThan(7);
  });

  it("walk-toward the kiosk then interact/buy/sell against coin", () => {
    const session = createEmberAgentSession({ mapId: "agent_sandbox" });
    session.sim.restore({
      ...session.sim.snapshot(),
      inventory: { coin: 20, herb: 1 },
    });
    const walked = runEmberAgentCommand(session, {
      cmd: "walk-toward",
      tx: 8,
      ty: 21,
    });
    expect(walked.ok).toBe(true);
    runEmberAgentCommand(session, { cmd: "step", dir: "north" });
    const interacted = runEmberAgentCommand(session, { cmd: "interact" });
    expect(interacted.lastInteract?.objectId).toBe("sbx_shop_kiosk");
    expect(interacted.lastInteract?.interactivityKind).toBe("shop");
    expect(interacted.lastInteract?.wouldFire).toMatchObject({
      action: "shop",
      shopId: "village_kiosk",
    });
    const bought = runEmberAgentCommand(session, {
      cmd: "buy",
      itemId: "herb",
    });
    expect(bought.lastInteract?.note).toBe("buy");
    expect(bought.inventory).toMatchObject({ coin: 17, herb: 2 });
    session.sim.restore({
      ...session.sim.snapshot(),
      inventory: { coin: 2, herb: 2 },
    });
    const poor = runEmberAgentCommand(session, {
      cmd: "buy",
      itemId: "herb",
    });
    expect(poor.lastInteract?.note).toBe("broke");
    expect(poor.inventory).toMatchObject({ coin: 2, herb: 2 });
    const sold = runEmberAgentCommand(session, {
      cmd: "sell",
      itemId: "herb",
    });
    expect(sold.lastInteract?.note).toBe("sell");
    expect(sold.inventory.herb).toBe(1);
    expect(sold.inventory.coin).toBe(3);
  });

  it("equip JRPG gear, arena weapons into arena_weapon, and use hpRestore items", () => {
    const session = createEmberAgentSession({ mapId: "agent_sandbox" });
    session.sim.restore({
      ...session.sim.snapshot(),
      inventory: {
        funeral_polearm: 1,
        meat_bun: 1,
        spirit_bolt: 1,
      },
    });
    expect(session.sim.dump().equipment).toEqual({
      weapon: null,
      arena_weapon: null,
      head: null,
      body: null,
      accessory: null,
    });
    const armed = runEmberAgentCommand(session, {
      cmd: "equip",
      itemId: "funeral_polearm",
    });
    expect(armed.equipment.weapon).toBe("funeral_polearm");
    expect(armed.inventory.funeral_polearm).toBeUndefined();
    const arena = runEmberAgentCommand(session, {
      cmd: "equip",
      itemId: "spirit_bolt",
    });
    expect(arena.equipment.weapon).toBe("funeral_polearm");
    expect(arena.equipment.arena_weapon).toBe("spirit_bolt");
    expect(arena.inventory.spirit_bolt).toBeUndefined();
    const used = runEmberAgentCommand(session, {
      cmd: "use",
      itemId: "meat_bun",
    });
    expect(used.inventory.meat_bun).toBeUndefined();
    expect(used.equipment.weapon).toBe("funeral_polearm");
  });

  it("walk-toward cabin_enter switches the sim map", () => {
    const session = createEmberAgentSession({ mapId: "agent_sandbox" });
    const walked = runEmberAgentCommand(session, {
      cmd: "walk-toward",
      to: "cabin_enter",
    });
    expect(walked.ok).toBe(true);
    expect(walked.reached).toBe(true);
    expect(walked.mapId).toBe("agent_sandbox_interior");
    expect(walked.lastMapChange?.toMapId).toBe("agent_sandbox_interior");
  });

  it("interact on the interior exit returns to agent_sandbox", () => {
    const session = createEmberAgentSession({ mapId: "agent_sandbox" });
    runEmberAgentCommand(session, { cmd: "walk-toward", to: "cabin_enter" });
    expect(session.mapId).toBe("agent_sandbox_interior");
    const toExit = runEmberAgentCommand(session, {
      cmd: "walk-toward",
      to: "exit",
    });
    expect(toExit.mapId).toBe("agent_sandbox");
    expect(toExit.lastMapChange?.fromMapId).toBe("agent_sandbox_interior");
    expect(toExit.occupyingId).toBe("cabin_enter");
  });
});

describe("ember-agent MCP handlers", () => {
  it("lists tools and walks teleport_a without Cursor", () => {
    expect(MCP_TOOLS.map((t) => t.name)).toEqual([
      "get_state",
      "step",
      "walk_toward",
      "interact",
      "buy",
      "sell",
      "save",
      "load",
      "reset_save",
    ]);
    const session = createEmberAgentSession({ mapId: "agent_sandbox" });
    const listed = handleMcpRequest(session, "tools/list", {});
    expect(listed).toMatchObject({ tools: MCP_TOOLS });
    const walked = callMcpTool(session, "walk_toward", { to: "teleport_a" }) as {
      lastWarp: { fromId: string } | null;
      occupyingId: string | null;
    };
    expect(walked.lastWarp?.fromId).toBe("teleport_a");
    expect(walked.occupyingId).toBe("teleport_b");
    const state = callMcpTool(session, "get_state", {}) as {
      mapId: string;
      tile: { tx: number; ty: number };
      inventory: Record<string, number>;
      wallet: number;
    };
    expect(state.mapId).toBe("agent_sandbox");
    expect(state.tile.tx).toBe(19);
    expect(state.inventory).toEqual(expect.any(Object));
    expect(typeof state.wallet).toBe("number");
  });

  it("talk NPC plays a short dialogue into lastDialogue", () => {
    const world = loadSandbox();
    const npc = world.map.voxelProps?.find((p) => p.id === "sbx_talk_npc");
    expect(npc?.interactivity?.scriptId).toBe("sandbox_guard_talk");
    const ts = world.map.tileSize;
    const sim = createExploreSim(simOpts(world));
    let dump = sim.dump();
    const dest = {
      x: npc!.x * ts + ts / 2,
      y: (npc!.y + 1) * ts + ts / 2,
    };
    for (let i = 0; i < 180; i++) dump = sim.walkToward(dest.x, dest.y, 1 / 30);
    dump = sim.walkToward(npc!.x * ts + ts / 2, npc!.y * ts + ts / 2, 1 / 30);
    dump = sim.interact();
    expect(dump.lastInteract?.wouldFire).toEqual({
      action: "talk",
      scriptId: "sandbox_guard_talk",
    });
    expect(dump.lastDialogue?.id).toBe("sandbox_guard_talk");
    expect(dump.lastDialogue?.use).toBe("talk");
    expect(dump.lastDialogue?.lines.length).toBeGreaterThanOrEqual(2);
  });

  it("branch talk picks the first option headless", () => {
    const world = loadSandbox();
    const npc = world.map.voxelProps?.find((p) => p.id === "sbx_branch_npc");
    const ts = world.map.tileSize;
    const sim = createExploreSim(simOpts(world));
    let dump = sim.dump();
    const dest = {
      x: npc!.x * ts + ts / 2,
      y: (npc!.y + 1) * ts + ts / 2,
    };
    for (let i = 0; i < 180; i++) dump = sim.walkToward(dest.x, dest.y, 1 / 30);
    dump = sim.walkToward(npc!.x * ts + ts / 2, npc!.y * ts + ts / 2, 1 / 30);
    dump = sim.interact();
    expect(dump.lastDialogue?.id).toBe("sandbox_branch");
    expect(dump.lastDialogue?.picked).toBe("agent");
    expect(dump.lastDialogue?.choices).toHaveLength(2);
  });

  it("chain_demo trigger runs talk + give_item + flag", () => {
    const world = loadSandbox();
    const zone = world.map.regions.find((r) => r.id === "chain_demo");
    expect(zone).toBeTruthy();
    const dest = regionCenter(world.map, zone!);
    const sim = createExploreSim(simOpts(world));
    let dump = sim.dump();
    for (let i = 0; i < 180; i++) dump = sim.walkToward(dest.x, dest.y, 1 / 30);
    dump = sim.interact();
    expect(dump.lastInteract?.scriptId).toBe("sandbox_chain");
    expect(dump.lastDialogue?.id).toBe("sandbox_notice_talk");
    expect(dump.inventory.coin).toBe(1);
    expect(dump.flags.sandbox_chain_done).toBe(true);
  });

  it("quest markers expose available / active / done icons", () => {
    const world = loadSandbox();
    const sim = createExploreSim(simOpts(world));
    const dump = sim.dump();
    const byId = Object.fromEntries(
      dump.questMarkers.map((m) => [m.objectId, m]),
    );
    expect(byId.sbx_quest_sign).toMatchObject({
      status: "available",
      iconId: "quest_available",
    });
    expect(byId.sbx_quest_active).toMatchObject({
      status: "active",
      iconId: "quest_active",
    });
    expect(byId.sbx_quest_done).toMatchObject({
      status: "done",
      iconId: "quest_done",
    });
  });

  it("parses Cursor NDJSON initialize (not Content-Length)", () => {
    const init = {
      jsonrpc: "2.0",
      id: 0,
      method: "initialize",
      params: { protocolVersion: "2025-03-26", capabilities: {} },
    };
    const { frames, rest } = takeMcpFrames(`${JSON.stringify(init)}\n`);
    expect(rest).toBe("");
    expect(frames).toHaveLength(1);
    const session = createEmberAgentSession({ mapId: "agent_sandbox" });
    const reply = dispatchJsonRpc(
      session,
      JSON.parse(frames[0]!) as {
        method?: string;
        params?: unknown;
        id?: number;
      },
    ) as { result?: { protocolVersion?: string } };
    expect(reply?.result?.protocolVersion).toBe("2025-03-26");
  });
});
