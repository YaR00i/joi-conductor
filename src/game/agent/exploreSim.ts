/**
 * Headless explore loop: move + teleport + interact + JSON dump, no Three/WebGL/DOM.
 * Intents are map-axis (east/south), not camera-relative WASD.
 */
import { PLAYER_BODY_R } from "../combat/radii";
import {
  isInteractableRegionKind,
  pickInteractHit,
  wouldFireForInteractivity,
  wouldFireForTriggerRegion,
  type InteractiveProp,
  type InteractivityWouldFire,
} from "../content/interactivity";
import {
  applyChestOpen,
  stampOpenedChests,
  wouldFireForChest,
} from "../content/chestLoot";
import {
  listQuestMarkerStates,
  resolveScriptRef,
  runScriptRefSync,
  type DialoguePlaythrough,
} from "../content/emberScript";
import {
  MAP_CHANGE_COOLDOWN,
  mapChangeRegionAt,
  mapChangeRequestFromRegion,
  mapChangeRequestFromWouldFire,
  resolveMapChangeArrival,
  type MapChangeArrival,
} from "../content/mapChange";
import { resolveMapPlayProfile } from "../content/playProfile";
import type {
  EmberActionScript,
  EmberBodyModifier,
  EmberFlagValue,
  EmberInteractivityKind,
  EmberItemDef,
  EmberItemIcon,
  EmberScene,
  EmberShopDef,
  EmberMap,
  EmberMapRegion,
  EmberTileset,
} from "../content/types";
import { compactInventory, grantItemCounts } from "../content/emberItem";
import {
  exploreSaveWorldPos,
  type EmberExploreSaveState,
} from "../content/emberSave";
import {
  compactEquipment,
  emptyEquipment,
  equipItem as applyEquipItem,
  type EmberEquipment,
  type EmberEquipSlot,
  unequipSlot as applyUnequipSlot,
  useInventoryItem as applyUseItem,
} from "../content/emberEquipment";
import {
  buyShopItem,
  seedShopRemaining,
  sellShopItem,
  walletCount,
  wouldFireForShop,
} from "../content/emberShop";
import { moveWithVoxels } from "../three/voxelCollision";
import {
  ensureMapLayers,
  findRegions,
  pointInRegion,
  regionCenter,
  regionVolumeElev,
  resolveTeleportTarget,
  stepTeleport,
  tileSurfaceElev,
  worldToTile,
  type EmberVoxelModelLib,
  type EmberVoxelSceneLib,
} from "../tile/mapUtils";

export const EXPLORE_TELEPORT_COOLDOWN = 0.45;

export type ExploreSimWorld = {
  map: EmberMap;
  tileset: EmberTileset;
  voxelModels?: EmberVoxelModelLib;
  voxelScenes?: EmberVoxelSceneLib;
  body?: EmberBodyModifier;
  speed?: number;
  items?: Record<string, EmberItemDef>;
  itemIcons?: Record<string, EmberItemIcon>;
  shops?: Record<string, EmberShopDef>;
  scenes?: Record<string, EmberScene>;
  scripts?: Record<string, EmberActionScript>;
};

export type ExploreMapChangeDump = {
  fromMapId: string;
  fromId: string;
  toMapId: string;
  regionId: string | null;
  /** Visual fade is play-only; headless records the intent as a noop. */
  faded: true;
};

export type ExploreIntent = {
  mx: number;
  my: number;
};

export type ExploreWarpDump = {
  fromId: string;
  x: number;
  y: number;
};

export type ExploreInteractWouldFire =
  | InteractivityWouldFire
  | {
      action: "warp";
      targetRegionId: string | null;
      targetX: number | null;
      targetY: number | null;
      x: number | null;
      y: number | null;
      elev: number | null;
    };

export type ExploreInteractDump = {
  ok: boolean;
  via: "occupying" | "facing" | null;
  regionId: string | null;
  objectId: string | null;
  kind: "trigger" | "chest" | "teleport" | "interactivity" | null;
  interactivityKind: EmberInteractivityKind | null;
  scriptId: string | null;
  targetRegionId: string | null;
  targetMapId: string | null;
  note: string | null;
  wouldFire: ExploreInteractWouldFire | null;
  reason: "fired" | "nothing_in_range";
};

export type ExploreDump = {
  mapId: string;
  profile: string;
  x: number;
  y: number;
  elev: number;
  tile: { tx: number; ty: number };
  occupyingId: string | null;
  lastWarp: ExploreWarpDump | null;
  lastMapChange: ExploreMapChangeDump | null;
  nearby: Array<{ id: string; kind: string; dist: number }>;
  facing: { mx: number; my: number };
  lastInteract: ExploreInteractDump | null;
  openedChests: string[];
  inventory: Record<string, number>;
  wallet: number;
  equipment: EmberEquipment;
  shopStock: Record<string, Record<string, number>>;
  flags: Record<string, EmberFlagValue>;
  lastDialogue: DialoguePlaythrough | null;
  questMarkers: Array<{
    objectId: string;
    status: string;
    iconId: string;
  }>;
};

export type ExploreSnapshot = {
  x: number;
  y: number;
  elev: number;
  occupyingId: string | null;
  lastWarp: ExploreWarpDump | null;
  lastMapChange?: ExploreMapChangeDump | null;
  teleportCd: number;
  mapChangeCd?: number;
  mapChangeOccupyId?: string | null;
  facingMx: number;
  facingMy: number;
  lastInteract: ExploreInteractDump | null;
  openedChests?: string[];
  inventory?: Record<string, number>;
  equipment?: EmberEquipment;
  shopStock?: Record<string, Record<string, number>>;
  flags?: Record<string, EmberFlagValue>;
  lastDialogue?: DialoguePlaythrough | null;
};

export type ExploreSim = {
  dump(): ExploreDump;
  snapshot(): ExploreSnapshot;
  restore(snap: ExploreSnapshot): void;
  applySave(save: EmberExploreSaveState): boolean;
  step(intent: ExploreIntent, dt?: number): ExploreDump;
  walkToward(worldX: number, worldY: number, dt?: number): ExploreDump;
  interact(): ExploreDump;
  buyItem(itemId: string, shopId?: string): ExploreDump;
  sellItem(itemId: string, shopId?: string): ExploreDump;
  equipItem(itemId: string): ExploreDump;
  unequipSlot(slot: EmberEquipSlot): ExploreDump;
  useItem(itemId: string): ExploreDump;
};

function interactableKind(
  kind: EmberMapRegion["kind"],
): "trigger" | "chest" | "teleport" | null {
  if (!isInteractableRegionKind(kind)) return null;
  return kind;
}

function boundRegionForProp(
  map: EmberMap,
  prop: InteractiveProp,
): EmberMapRegion | null {
  const id = prop.interactivity.triggerId?.trim();
  if (!id) return null;
  return map.regions.find((region) => region.id === id) ?? null;
}

function wouldFireForRegion(
  map: EmberMap,
  region: EmberMapRegion,
): ExploreInteractWouldFire | null {
  const kind = interactableKind(region.kind);
  switch (kind) {
    case "trigger":
      return wouldFireForTriggerRegion(region);
    case "chest":
      return wouldFireForChest(region, {
        loot: [],
        lootNames: [],
        empty: true,
        opened: region.opened === true,
        alreadyOpen: region.opened === true,
        repeatable: region.repeatable === true,
      });
    case "teleport": {
      const dest = resolveTeleportTarget(map, region);
      return {
        action: "warp",
        targetRegionId: region.targetRegionId ?? null,
        targetX: region.targetX ?? null,
        targetY: region.targetY ?? null,
        x: dest?.x ?? null,
        y: dest?.y ?? null,
        elev: dest?.elev ?? null,
      };
    }
    case null:
      return null;
    default: {
      const _never: never = kind;
      return _never;
    }
  }
}

function scriptIdFromWouldFire(
  wouldFire: ExploreInteractWouldFire | null,
): string | null {
  if (!wouldFire) return null;
  switch (wouldFire.action) {
    case "run_script":
    case "talk":
      return wouldFire.scriptId;
    case "shop":
    case "change_map":
    case "open_chest":
    case "warp":
      return null;
    default: {
      const _never: never = wouldFire;
      return _never;
    }
  }
}

function toRegionInteractDump(
  map: EmberMap,
  region: EmberMapRegion,
  via: "occupying" | "facing",
): ExploreInteractDump {
  const kind = interactableKind(region.kind);
  const wouldFire = wouldFireForRegion(map, region);
  return {
    ok: true,
    via,
    regionId: region.id,
    objectId: null,
    kind,
    interactivityKind: null,
    scriptId: scriptIdFromWouldFire(wouldFire) ??
      (region.scriptId?.trim() ? region.scriptId : null),
    targetRegionId: region.targetRegionId ?? null,
    targetMapId: region.targetMapId?.trim() ? region.targetMapId : null,
    note: region.note ?? null,
    wouldFire,
    reason: "fired",
  };
}

function toPropInteractDump(
  map: EmberMap,
  prop: InteractiveProp,
  via: "occupying" | "facing",
): ExploreInteractDump {
  const wouldFire = wouldFireForInteractivity(map, prop.interactivity);
  return {
    ok: true,
    via,
    regionId: prop.interactivity.triggerId?.trim()
      ? prop.interactivity.triggerId
      : null,
    objectId: prop.id,
    kind: "interactivity",
    interactivityKind: prop.interactivity.kind,
    scriptId: scriptIdFromWouldFire(wouldFire),
    targetRegionId:
      wouldFire?.action === "change_map" || wouldFire?.action === "warp"
        ? wouldFire.targetRegionId
        : null,
    targetMapId:
      wouldFire?.action === "change_map" ? wouldFire.targetMapId : null,
    note: null,
    wouldFire,
    reason: "fired",
  };
}

function emptyInteract(): ExploreInteractDump {
  return {
    ok: false,
    via: null,
    regionId: null,
    objectId: null,
    kind: null,
    interactivityKind: null,
    scriptId: null,
    targetRegionId: null,
    targetMapId: null,
    note: null,
    wouldFire: null,
    reason: "nothing_in_range",
  };
}

export function createExploreSim(opts: {
  map: EmberMap;
  tileset: EmberTileset;
  speed?: number;
  radius?: number;
  voxelModels?: EmberVoxelModelLib;
  voxelScenes?: EmberVoxelSceneLib;
  body?: EmberBodyModifier;
  items?: Record<string, EmberItemDef>;
  itemIcons?: Record<string, EmberItemIcon>;
  shops?: Record<string, EmberShopDef>;
  scenes?: Record<string, EmberScene>;
  scripts?: Record<string, EmberActionScript>;
  loadWorld?: (mapId: string) => ExploreSimWorld | null;
}): ExploreSim {
  let map = ensureMapLayers(opts.map);
  let tileset = opts.tileset;
  let speed = opts.speed ?? 110;
  const radius = opts.radius ?? PLAYER_BODY_R;
  let voxelModels = opts.voxelModels;
  let voxelScenes = opts.voxelScenes;
  let body = opts.body;
  const start =
    findRegions(map, "player_start")[0] ?? findRegions(map, "spawn")[0];
  if (!start) {
    throw new Error(`exploreSim: no player_start on map ${map.id}`);
  }
  const spawn = regionCenter(map, start);

  let x = spawn.x;
  let y = spawn.y;
  let elev = regionVolumeElev(map, start);
  let occupyingId: string | null =
    findRegions(map, "teleport").find((region) =>
      pointInRegion(map, region, x, y, elev),
    )?.id ?? null;
  let teleportCd = 0;
  let mapChangeCd = 0;
  let mapChangeOccupyId: string | null =
    mapChangeRegionAt(map, x, y, elev)?.id ?? null;
  let lastWarp: ExploreWarpDump | null = null;
  let lastMapChange: ExploreMapChangeDump | null = null;
  let facingMx = 0;
  let facingMy = -1;
  let lastInteract: ExploreInteractDump | null = null;
  const openedChests = new Set<string>();
  let inventory: Record<string, number> = {};
  let equipment: EmberEquipment = emptyEquipment();
  const shopStock: Record<string, Record<string, number>> = {};
  let flags: Record<string, EmberFlagValue> = {};
  let lastDialogue: DialoguePlaythrough | null = null;
  const catalog = () => opts.items;
  const shops = () => opts.shops ?? {};

  const remainingFor = (shopId: string) => {
    const shop = shops()[shopId];
    if (!shop) return {};
    if (!shopStock[shopId]) shopStock[shopId] = seedShopRemaining(shop);
    return shopStock[shopId];
  };

  const resolveShopId = (explicit?: string): string | null => {
    const fromArg = explicit?.trim();
    if (fromArg) return fromArg;
    const fire = lastInteract?.wouldFire;
    if (fire?.action === "shop") return fire.shopId;
    return null;
  };

  const enrichShopWouldFire = (
    shopId: string | null,
  ): ExploreInteractWouldFire | null => {
    if (!shopId) {
      return wouldFireForShop(undefined, null, inventory, {}, catalog());
    }
    return wouldFireForShop(
      shops()[shopId],
      shopId,
      inventory,
      remainingFor(shopId),
      catalog(),
    );
  };

  const dump = (): ExploreDump => {
    const tile = worldToTile(map, x, y);
    const nearby = map.regions
      .map((region) => {
        const c = regionCenter(map, region);
        return {
          id: region.id,
          kind: region.kind,
          dist: Math.hypot(c.x - x, c.y - y),
        };
      })
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 8);
    return {
      mapId: map.id,
      profile: resolveMapPlayProfile(map),
      x,
      y,
      elev,
      tile,
      occupyingId,
      lastWarp,
      lastMapChange,
      nearby,
      facing: { mx: facingMx, my: facingMy },
      lastInteract,
      openedChests: [...openedChests],
      inventory: { ...inventory },
      wallet: walletCount(inventory),
      equipment: compactEquipment(equipment),
      shopStock: Object.fromEntries(
        Object.entries(shopStock).map(([id, stock]) => [id, { ...stock }]),
      ),
      flags: { ...flags },
      lastDialogue,
      questMarkers: listQuestMarkerStates(
        map,
        opts.itemIcons,
        flags,
      ).map((marker) => ({
        objectId: marker.objectId,
        status: marker.status,
        iconId: marker.iconId,
      })),
    };
  };

  const snapshot = (): ExploreSnapshot => ({
    x,
    y,
    elev,
    occupyingId,
    lastWarp,
    lastMapChange,
    teleportCd,
    mapChangeCd,
    mapChangeOccupyId,
    facingMx,
    facingMy,
    lastInteract,
    openedChests: [...openedChests],
    inventory: { ...inventory },
    equipment: compactEquipment(equipment),
    shopStock: Object.fromEntries(
      Object.entries(shopStock).map(([id, stock]) => [id, { ...stock }]),
    ),
    flags: { ...flags },
    lastDialogue,
  });

  const restore = (snap: ExploreSnapshot): void => {
    x = snap.x;
    y = snap.y;
    elev = snap.elev;
    occupyingId = snap.occupyingId;
    lastWarp = snap.lastWarp;
    lastMapChange = snap.lastMapChange ?? null;
    teleportCd = snap.teleportCd;
    mapChangeCd = snap.mapChangeCd ?? 0;
    mapChangeOccupyId = snap.mapChangeOccupyId ?? null;
    facingMx = snap.facingMx;
    facingMy = snap.facingMy;
    lastInteract = snap.lastInteract;
    openedChests.clear();
    for (const key of snap.openedChests ?? []) openedChests.add(key);
    inventory = compactInventory(snap.inventory) ?? {};
    equipment = compactEquipment(snap.equipment);
    for (const key of Object.keys(shopStock)) delete shopStock[key];
    for (const [id, stock] of Object.entries(snap.shopStock ?? {})) {
      shopStock[id] = { ...stock };
    }
    flags = { ...(snap.flags ?? {}) };
    lastDialogue = snap.lastDialogue ?? null;
    stampOpenedChests(map, openedChests);
  };

  const applyProgressFields = (save: EmberExploreSaveState): void => {
    openedChests.clear();
    for (const key of save.openedChests) openedChests.add(key);
    inventory = compactInventory(save.inventory) ?? {};
    equipment = compactEquipment(save.equipment);
    for (const key of Object.keys(shopStock)) delete shopStock[key];
    for (const [id, stock] of Object.entries(save.shopStock)) {
      shopStock[id] = { ...stock };
    }
    flags = { ...save.flags };
    lastInteract = null;
    lastWarp = null;
    lastMapChange = null;
    lastDialogue = null;
  };

  const applySave = (save: EmberExploreSaveState): boolean => {
    const destWorld =
      save.mapId === map.id
        ? {
            map,
            tileset,
            voxelModels,
            voxelScenes,
            body,
            speed,
            items: opts.items,
            shops: opts.shops,
          }
        : loadDestWorld(save.mapId);
    if (!destWorld) return false;
    applyProgressFields(save);
    if (save.mapId !== map.id) {
      map = ensureMapLayers(destWorld.map);
      tileset = destWorld.tileset;
      voxelModels = destWorld.voxelModels;
      voxelScenes = destWorld.voxelScenes;
      body = destWorld.body;
      if (destWorld.speed != null) speed = destWorld.speed;
    }
    stampOpenedChests(map, openedChests);
    const pos = exploreSaveWorldPos(save, map.tileSize);
    x = pos.x;
    y = pos.y;
    elev = save.elev ?? tileSurfaceElev(map, pos.tx, pos.ty);
    occupyingId =
      findRegions(map, "teleport").find((region) =>
        pointInRegion(map, region, x, y, elev),
      )?.id ??
      findRegions(map, "trigger").find((region) =>
        pointInRegion(map, region, x, y, elev),
      )?.id ??
      null;
    mapChangeOccupyId = mapChangeRegionAt(map, x, y, elev)?.id ?? null;
    mapChangeCd = MAP_CHANGE_COOLDOWN;
    teleportCd = MAP_CHANGE_COOLDOWN;
    return true;
  };

  const loadDestWorld = (mapId: string): ExploreSimWorld | null => {
    if (mapId === map.id) {
      return { map, tileset, voxelModels, voxelScenes, body, speed, items: opts.items, shops: opts.shops };
    }
    return opts.loadWorld?.(mapId) ?? null;
  };

  const executeHook = (id: string | null): void => {
    const ref = resolveScriptRef(opts.scripts, opts.scenes, id);
    if (!ref) return;
    const result = runScriptRefSync(
      ref,
      {
        scripts: opts.scripts,
        scenes: opts.scenes,
        items: opts.items,
      },
      { flags, inventory },
    );
    flags = result.flags;
    inventory = result.inventory;
    lastDialogue = result.dialogues.at(-1) ?? lastDialogue;
    if (result.changeMap) {
      tryChangeMap(
        {
          targetMapId: result.changeMap.targetMapId,
          targetRegionId: result.changeMap.targetRegionId,
        },
        lastInteract?.regionId ?? lastInteract?.objectId ?? "script",
      );
    }
  };

  const applyArrival = (
    fromMapId: string,
    fromId: string,
    world: ExploreSimWorld,
    arrival: MapChangeArrival,
  ): void => {
    map = ensureMapLayers(world.map);
    tileset = world.tileset;
    voxelModels = world.voxelModels;
    voxelScenes = world.voxelScenes;
    body = world.body;
    if (world.speed != null) speed = world.speed;
    stampOpenedChests(map, openedChests);
    x = arrival.x;
    y = arrival.y;
    elev = arrival.elev;
    occupyingId = arrival.occupyId;
    mapChangeOccupyId = mapChangeRegionAt(map, x, y, elev)?.id ?? null;
    mapChangeCd = MAP_CHANGE_COOLDOWN;
    teleportCd = MAP_CHANGE_COOLDOWN;
    lastWarp = null;
    lastMapChange = {
      fromMapId,
      fromId,
      toMapId: arrival.mapId,
      regionId: arrival.regionId,
      faded: true,
    };
  };

  const tryChangeMap = (
    request: ReturnType<typeof mapChangeRequestFromRegion>,
    fromId: string,
  ): boolean => {
    if (!request) return false;
    const destWorld = loadDestWorld(request.targetMapId);
    if (!destWorld) return false;
    const arrival = resolveMapChangeArrival(
      { [destWorld.map.id]: destWorld.map },
      request,
    );
    if (!arrival) return false;
    applyArrival(map.id, fromId, destWorld, arrival);
    return true;
  };

  const stepMapChangeEnter = (dt: number): void => {
    mapChangeCd = Math.max(0, mapChangeCd - dt);
    if (mapChangeOccupyId) {
      const held = map.regions.find(
        (region) =>
          region.id === mapChangeOccupyId && region.kind === "trigger",
      );
      if (!held || !pointInRegion(map, held, x, y, elev)) {
        mapChangeOccupyId = null;
      }
    }
    if (mapChangeCd > 0 || mapChangeOccupyId) return;
    const region = mapChangeRegionAt(map, x, y, elev);
    if (!region) return;
    const request = mapChangeRequestFromRegion(region);
    tryChangeMap(request, region.id);
  };

  const step = (intent: ExploreIntent, dt = 1 / 30): ExploreDump => {
    let ix = intent.mx;
    let iy = intent.my;
    const len = Math.hypot(ix, iy);
    if (len > 1e-6) {
      ix /= len;
      iy /= len;
      facingMx = ix;
      facingMy = iy;
      const pos = moveWithVoxels(
        map,
        tileset,
        x,
        y,
        x + ix * speed * dt,
        y + iy * speed * dt,
        radius,
        elev,
        undefined,
        voxelModels,
        voxelScenes,
        body,
      );
      x = pos.x;
      y = pos.y;
      elev = pos.elev;
    }
    teleportCd = Math.max(0, teleportCd - dt);
    const stepped = stepTeleport(map, x, y, occupyingId, teleportCd <= 0, elev);
    occupyingId = stepped.occupyingId;
    const dest = stepped.warp;
    if (dest) {
      x = dest.x;
      y = dest.y;
      elev = dest.elev;
      teleportCd = EXPLORE_TELEPORT_COOLDOWN;
      lastWarp = { fromId: dest.fromId, x: dest.x, y: dest.y };
    }
    stepMapChangeEnter(dt);
    return dump();
  };

  const walkToward = (worldX: number, worldY: number, dt = 1 / 30) =>
    step({ mx: worldX - x, my: worldY - y }, dt);

  const interact = (): ExploreDump => {
    const hit = pickInteractHit(map, x, y, facingMx, facingMy, voxelModels, elev);
    if (!hit) {
      lastInteract = emptyInteract();
      return dump();
    }
    switch (hit.kind) {
      case "region":
        lastInteract = toRegionInteractDump(map, hit.region, hit.via);
        if (hit.region.kind === "chest") {
          const result = applyChestOpen(
            map.id,
            hit.region,
            openedChests,
            catalog(),
          );
          if (result.loot.length) {
            inventory = grantItemCounts(inventory, result.loot, catalog());
          }
          lastInteract = {
            ...lastInteract,
            wouldFire: wouldFireForChest(hit.region, result),
          };
        }
        break;
      case "prop":
        lastInteract = toPropInteractDump(map, hit.prop, hit.via);
        if (hit.prop.interactivity.kind === "shop") {
          const shopId =
            hit.prop.interactivity.shopId?.trim() ||
            (lastInteract.wouldFire?.action === "shop"
              ? lastInteract.wouldFire.shopId
              : null);
          lastInteract = {
            ...lastInteract,
            wouldFire: enrichShopWouldFire(shopId),
          };
        }
        break;
      default: {
        const _never: never = hit;
        lastInteract = _never;
        return dump();
      }
    }
    const wouldFire = lastInteract.wouldFire;
    if (wouldFire?.action === "talk" || wouldFire?.action === "run_script") {
      executeHook(wouldFire.scriptId);
    } else if (
      hit.kind === "prop" &&
      hit.prop.interactivity.kind === "shop"
    ) {
      executeHook(hit.prop.interactivity.scriptId ?? null);
    }
    if (wouldFire?.action === "change_map") {
      const source =
        hit.kind === "region"
          ? hit.region
          : boundRegionForProp(map, hit.prop);
      tryChangeMap(
        mapChangeRequestFromWouldFire(wouldFire, source),
        lastInteract.regionId ?? lastInteract.objectId ?? "interact",
      );
    }
    return dump();
  };

  const buyItem = (itemId: string, shopId?: string): ExploreDump => {
    const id = resolveShopId(shopId);
    const result = buyShopItem(
      id ? shops()[id] : undefined,
      itemId,
      inventory,
      id ? remainingFor(id) : {},
      catalog(),
    );
    inventory = result.inventory;
    if (id && result.ok) shopStock[id] = result.remaining;
    lastInteract = {
      ok: result.ok,
      via: lastInteract?.via ?? null,
      regionId: lastInteract?.regionId ?? null,
      objectId: lastInteract?.objectId ?? null,
      kind: lastInteract?.kind ?? "interactivity",
      interactivityKind: lastInteract?.interactivityKind ?? "shop",
      scriptId: null,
      targetRegionId: null,
      targetMapId: null,
      note: result.ok ? "buy" : result.reason,
      wouldFire: enrichShopWouldFire(id),
      reason: result.ok ? "fired" : "nothing_in_range",
    };
    return dump();
  };

  const sellItem = (itemId: string, shopId?: string): ExploreDump => {
    const id = resolveShopId(shopId);
    const result = sellShopItem(
      id ? shops()[id] : undefined,
      itemId,
      inventory,
      id ? remainingFor(id) : {},
      catalog(),
    );
    inventory = result.inventory;
    if (id) shopStock[id] = result.remaining;
    lastInteract = {
      ok: result.ok,
      via: lastInteract?.via ?? null,
      regionId: lastInteract?.regionId ?? null,
      objectId: lastInteract?.objectId ?? null,
      kind: lastInteract?.kind ?? "interactivity",
      interactivityKind: lastInteract?.interactivityKind ?? "shop",
      scriptId: null,
      targetRegionId: null,
      targetMapId: null,
      note: result.ok ? "sell" : result.reason,
      wouldFire: enrichShopWouldFire(id),
      reason: result.ok ? "fired" : "nothing_in_range",
    };
    return dump();
  };

  const equipItem = (itemId: string): ExploreDump => {
    const result = applyEquipItem(inventory, equipment, itemId, catalog());
    inventory = result.inventory;
    equipment = result.equipment;
    return dump();
  };

  const unequipSlot = (slot: EmberEquipSlot): ExploreDump => {
    const result = applyUnequipSlot(inventory, equipment, slot, catalog());
    inventory = result.inventory;
    equipment = result.equipment;
    return dump();
  };

  const useItem = (itemId: string): ExploreDump => {
    const result = applyUseItem(inventory, equipment, itemId, catalog());
    inventory = result.inventory;
    equipment = result.equipment;
    return dump();
  };

  return {
    dump,
    snapshot,
    restore,
    applySave,
    step,
    walkToward,
    interact,
    buyItem,
    sellItem,
    equipItem,
    unequipSlot,
    useItem,
  };
}
