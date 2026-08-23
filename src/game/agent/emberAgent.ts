/**
 * Shared ember-agent command runner for CLI + MCP.
 * One in-memory session; CLI also snapshots it to a temp file.
 */
import { createExploreSim, type ExploreDump, type ExploreIntent, type ExploreSim, type ExploreSimWorld, type ExploreSnapshot } from "./exploreSim";
import {
  DEFAULT_AGENT_MAP_ID,
  loadExploreWorldFromDisk,
  type ExploreWorld,
} from "./explorePackDisk";
import { regionCenter, worldToTile } from "../tile/mapUtils";
import {
  captureExploreSave,
  copyExploreSave,
  DEFAULT_EMBER_PACK_ID,
  deleteExploreSave,
  EMBER_SAVE_DEFAULT_SLOT,
  parseExploreSaveSlot,
  readExploreSave,
  writeExploreSave,
  type EmberSaveBackend,
} from "../content/emberSave";

export { DEFAULT_AGENT_MAP_ID };

export type CardinalDir = "north" | "south" | "east" | "west";

export type EmberAgentSession = {
  mapId: string;
  packId: string;
  world: ExploreWorld;
  sim: ExploreSim;
  saveBackend?: EmberSaveBackend;
};

export type EmberAgentCommand =
  | { cmd: "state" }
  | { cmd: "dump" }
  | { cmd: "reset"; mapId?: string }
  | {
      cmd: "step";
      dir?: CardinalDir;
      dx?: number;
      dy?: number;
      dt?: number;
    }
  | {
      cmd: "walk-toward";
      to?: string;
      tx?: number;
      ty?: number;
      dt?: number;
      ticks?: number;
    }
  | { cmd: "interact" }
  | { cmd: "buy"; itemId: string; shopId?: string }
  | { cmd: "sell"; itemId: string; shopId?: string }
  | { cmd: "equip"; itemId: string }
  | { cmd: "use"; itemId: string }
  | { cmd: "save"; slot?: number }
  | { cmd: "load"; slot?: number }
  | { cmd: "reset-save"; slot?: number }
  | { cmd: "copy-save"; from: number; to: number };

export type EmberAgentResult = {
  ok: boolean;
  command: EmberAgentCommand["cmd"];
  mapId: string;
  reached?: boolean;
  ticks?: number;
  slot?: number;
  error?: string;
} & ExploreDump;

export type EmberAgentPersisted = {
  mapId: string;
  snapshot: ExploreSnapshot;
};

const DEFAULT_WALK_TICKS = 180;

export function intentFromCardinal(dir: CardinalDir): ExploreIntent {
  switch (dir) {
    case "north":
      return { mx: 0, my: -1 };
    case "south":
      return { mx: 0, my: 1 };
    case "east":
      return { mx: 1, my: 0 };
    case "west":
      return { mx: -1, my: 0 };
    default: {
      const _never: never = dir;
      return _never;
    }
  }
}

function worldToSim(world: ExploreWorld): ExploreSimWorld {
  return {
    map: world.map,
    tileset: world.tileset,
    voxelModels: world.voxelModels,
    voxelScenes: world.voxelScenes,
    body: world.body,
    speed: world.stage?.moveSpeed,
    items: world.items,
    itemIcons: world.itemIcons,
    shops: world.shops,
    scenes: world.scenes,
    scripts: world.scripts,
  };
}

function loadWorldById(
  contentRoot: string,
  mapId: string,
): ExploreSimWorld | null {
  try {
    return worldToSim(loadExploreWorldFromDisk({ mapId, contentRoot }));
  } catch {
    return null;
  }
}

export function createEmberAgentSession(opts?: {
  mapId?: string;
  packId?: string;
  contentRoot?: string;
  persisted?: EmberAgentPersisted;
  saveBackend?: EmberSaveBackend;
}): EmberAgentSession {
  const mapId = opts?.persisted?.mapId ?? opts?.mapId ?? DEFAULT_AGENT_MAP_ID;
  const world = loadExploreWorldFromDisk({
    mapId,
    contentRoot: opts?.contentRoot,
  });
  const sim = createExploreSim({
    map: world.map,
    tileset: world.tileset,
    speed: world.stage?.moveSpeed,
    body: world.body,
    voxelModels: world.voxelModels,
    voxelScenes: world.voxelScenes,
    items: world.items,
    itemIcons: world.itemIcons,
    shops: world.shops,
    scenes: world.scenes,
    scripts: world.scripts,
    loadWorld: (id) => loadWorldById(world.contentRoot, id),
  });
  if (opts?.persisted && opts.persisted.mapId === mapId) {
    sim.restore(opts.persisted.snapshot);
  }
  return {
    mapId,
    packId: opts?.packId ?? DEFAULT_EMBER_PACK_ID,
    world,
    sim,
    saveBackend: opts?.saveBackend,
  };
}

export function persistEmberAgentSession(
  session: EmberAgentSession,
): EmberAgentPersisted {
  return { mapId: session.mapId, snapshot: session.sim.snapshot() };
}

function tileCenter(
  session: EmberAgentSession,
  tx: number,
  ty: number,
): { x: number; y: number } {
  const ts = session.world.map.tileSize;
  return { x: tx * ts + ts / 2, y: ty * ts + ts / 2 };
}

function resolveWalkTarget(
  session: EmberAgentSession,
  cmd: Extract<EmberAgentCommand, { cmd: "walk-toward" }>,
): { x: number; y: number } {
  if (cmd.to) {
    const region = session.world.map.regions.find((r) => r.id === cmd.to);
    if (!region) {
      throw new Error(`unknown region id: ${cmd.to}`);
    }
    return regionCenter(session.world.map, region);
  }
  if (cmd.tx != null && cmd.ty != null) {
    return tileCenter(session, cmd.tx, cmd.ty);
  }
  throw new Error("walk-toward needs --to <regionId> or --tx/--ty");
}

function syncSessionMap(session: EmberAgentSession): void {
  const mapId = session.sim.dump().mapId;
  if (mapId === session.mapId) return;
  session.mapId = mapId;
  session.world = loadExploreWorldFromDisk({
    mapId,
    contentRoot: session.world.contentRoot,
  });
}

function withDump(
  session: EmberAgentSession,
  command: EmberAgentCommand["cmd"],
  extra?: Partial<EmberAgentResult>,
): EmberAgentResult {
  syncSessionMap(session);
  const dump = session.sim.dump();
  return {
    ok: true,
    command,
    ...dump,
    mapId: session.mapId,
    ...extra,
  };
}

function walkLoop(
  session: EmberAgentSession,
  target: { x: number; y: number },
  dt: number,
  ticks: number,
  toId: string | undefined,
): EmberAgentResult {
  const startMapId = session.sim.dump().mapId;
  const map = session.world.map;
  let dump = session.sim.dump();
  let i = 0;
  for (; i < ticks; i++) {
    if (dump.mapId !== startMapId) break;
    if (toId && dump.lastWarp?.fromId === toId) break;
    if (toId) {
      const region = map.regions.find((r) => r.id === toId);
      if (region) {
        const tile = worldToTile(map, dump.x, dump.y);
        if (
          tile.tx >= region.x &&
          tile.ty >= region.y &&
          tile.tx < region.x + region.w &&
          tile.ty < region.y + region.h &&
          region.kind !== "teleport"
        ) {
          break;
        }
      }
    } else {
      const tile = worldToTile(map, dump.x, dump.y);
      const want = worldToTile(map, target.x, target.y);
      if (tile.tx === want.tx && tile.ty === want.ty) break;
    }
    dump = session.sim.walkToward(target.x, target.y, dt);
    if (dump.mapId !== startMapId) break;
  }
  const changedMap = dump.mapId !== startMapId;
  const reached = changedMap
    ? true
    : toId
      ? dump.lastWarp?.fromId === toId ||
        dump.occupyingId === toId ||
        dump.nearby[0]?.id === toId
      : (() => {
          const tile = worldToTile(map, dump.x, dump.y);
          const want = worldToTile(map, target.x, target.y);
          return tile.tx === want.tx && tile.ty === want.ty;
        })();
  syncSessionMap(session);
  return {
    ok: true,
    command: "walk-toward",
    ...dump,
    mapId: session.mapId,
    reached,
    ticks: i,
  };
}

export function runEmberAgentCommand(
  session: EmberAgentSession,
  cmd: EmberAgentCommand,
): EmberAgentResult {
  switch (cmd.cmd) {
    case "state":
    case "dump":
      return withDump(session, cmd.cmd);
    case "reset": {
      const next = createEmberAgentSession({
        mapId: cmd.mapId ?? session.mapId,
        packId: session.packId,
        contentRoot: session.world.contentRoot,
        saveBackend: session.saveBackend,
      });
      session.mapId = next.mapId;
      session.world = next.world;
      session.sim = next.sim;
      return withDump(session, "reset");
    }
    case "step": {
      const dt = cmd.dt ?? 1 / 30;
      let intent: ExploreIntent = { mx: 0, my: 0 };
      if (cmd.dir) {
        intent = intentFromCardinal(cmd.dir);
      } else if (cmd.dx != null || cmd.dy != null) {
        intent = { mx: cmd.dx ?? 0, my: cmd.dy ?? 0 };
      } else {
        throw new Error("step needs --dir north|south|east|west or --dx/--dy");
      }
      session.sim.step(intent, dt);
      return withDump(session, "step");
    }
    case "walk-toward": {
      const target = resolveWalkTarget(session, cmd);
      return walkLoop(
        session,
        target,
        cmd.dt ?? 1 / 30,
        cmd.ticks ?? DEFAULT_WALK_TICKS,
        cmd.to,
      );
    }
    case "interact":
      session.sim.interact();
      return withDump(session, "interact");
    case "buy":
      session.sim.buyItem(cmd.itemId, cmd.shopId);
      return withDump(session, "buy");
    case "sell":
      session.sim.sellItem(cmd.itemId, cmd.shopId);
      return withDump(session, "sell");
    case "equip":
      session.sim.equipItem(cmd.itemId);
      return withDump(session, "equip");
    case "use":
      session.sim.useItem(cmd.itemId);
      return withDump(session, "use");
    case "save": {
      const backend = session.saveBackend;
      if (!backend) throw new Error("save needs a save backend");
      const slot = parseExploreSaveSlot(cmd.slot) ?? EMBER_SAVE_DEFAULT_SLOT;
      const save = captureExploreSave({
        packId: session.packId,
        slot,
        source: session.sim.dump(),
      });
      writeExploreSave(backend, save);
      return withDump(session, "save", { slot });
    }
    case "load": {
      const backend = session.saveBackend;
      if (!backend) throw new Error("load needs a save backend");
      const slot = parseExploreSaveSlot(cmd.slot) ?? EMBER_SAVE_DEFAULT_SLOT;
      const save = readExploreSave(backend, session.packId, slot);
      if (!save) {
        return withDump(session, "load", {
          ok: false,
          slot,
          error: `empty save slot ${slot}`,
        });
      }
      if (!session.sim.applySave(save)) {
        return withDump(session, "load", {
          ok: false,
          slot,
          error: `could not apply save map ${save.mapId}`,
        });
      }
      syncSessionMap(session);
      return withDump(session, "load", { slot });
    }
    case "reset-save": {
      const backend = session.saveBackend;
      if (!backend) throw new Error("reset-save needs a save backend");
      const slot = parseExploreSaveSlot(cmd.slot) ?? EMBER_SAVE_DEFAULT_SLOT;
      deleteExploreSave(backend, session.packId, slot);
      const next = createEmberAgentSession({
        mapId: session.mapId,
        packId: session.packId,
        contentRoot: session.world.contentRoot,
        saveBackend: session.saveBackend,
      });
      session.mapId = next.mapId;
      session.world = next.world;
      session.sim = next.sim;
      return withDump(session, "reset-save", { slot });
    }
    case "copy-save": {
      const backend = session.saveBackend;
      if (!backend) throw new Error("copy-save needs a save backend");
      const copied = copyExploreSave(
        backend,
        session.packId,
        cmd.from,
        cmd.to,
      );
      if (!copied) {
        return withDump(session, "copy-save", {
          ok: false,
          error: `empty save slot ${cmd.from}`,
        });
      }
      return withDump(session, "copy-save");
    }
    default: {
      const _never: never = cmd;
      return _never;
    }
  }
}
