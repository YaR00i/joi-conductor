/**
 * Explore stash / chest zone: catalog loot ids, once vs repeatable, session opened.
 * Unknown ids stay allowed as stubs. Shared by exploreSim and play.
 */
import type { EmberItemDef, EmberMap, EmberMapRegion } from "./types";
import type { InteractivityWouldFire } from "./interactivity";
import { resolveLootLabels } from "./emberItem";

export type ChestOpenResult = {
  loot: string[];
  lootNames: string[];
  empty: boolean;
  opened: boolean;
  alreadyOpen: boolean;
  repeatable: boolean;
};

export type ChestWouldFire = Extract<
  InteractivityWouldFire,
  { action: "open_chest" }
>;

export function chestKey(mapId: string, regionId: string): string {
  return `${mapId}:${regionId}`;
}

function uniqueNonEmpty(parts: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of parts) {
    const id = part.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/** Stub item ids from a region field or a comma-separated editor string. */
export function parseLootIds(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return uniqueNonEmpty(
      raw.filter((item): item is string => typeof item === "string"),
    );
  }
  if (typeof raw === "string") {
    return uniqueNonEmpty(raw.split(/[,;\s]+/));
  }
  return [];
}

export function formatLootIds(ids: string[] | undefined): string {
  return parseLootIds(ids).join(", ");
}

export function compactLootIds(
  ids: string[] | undefined,
): string[] | undefined {
  const next = parseLootIds(ids);
  return next.length > 0 ? next : undefined;
}

export function isChestRepeatable(region: EmberMapRegion): boolean {
  return region.repeatable === true;
}

export function chestIsOpened(
  mapId: string,
  region: EmberMapRegion,
  openedKeys: ReadonlySet<string>,
): boolean {
  return region.opened === true || openedKeys.has(chestKey(mapId, region.id));
}

export function stampOpenedChests(
  map: EmberMap,
  openedKeys: ReadonlySet<string>,
): void {
  for (const region of map.regions) {
    if (region.kind !== "chest") continue;
    if (chestIsOpened(map.id, region, openedKeys)) {
      region.opened = true;
    }
  }
}

/** Grant loot and persist `opened` on the region + session set. */
export function applyChestOpen(
  mapId: string,
  region: EmberMapRegion,
  openedKeys: Set<string>,
  catalog?: Record<string, EmberItemDef>,
): ChestOpenResult {
  const repeatable = isChestRepeatable(region);
  const alreadyOpen = chestIsOpened(mapId, region, openedKeys);
  const lootIds = parseLootIds(region.lootIds);
  const lootNames = resolveLootLabels(lootIds, catalog);
  const key = chestKey(mapId, region.id);
  region.opened = true;
  openedKeys.add(key);
  if (alreadyOpen && !repeatable) {
    return {
      loot: [],
      lootNames: [],
      empty: true,
      opened: true,
      alreadyOpen: true,
      repeatable,
    };
  }
  return {
    loot: lootIds,
    lootNames,
    empty: lootIds.length === 0,
    opened: true,
    alreadyOpen,
    repeatable,
  };
}

export function wouldFireForChest(
  region: EmberMapRegion,
  result: ChestOpenResult,
): ChestWouldFire {
  return {
    action: "open_chest",
    closedModelId: region.closedModelId ?? null,
    sceneId: region.sceneId ?? null,
    loot: result.loot,
    lootNames: result.lootNames,
    empty: result.empty,
    opened: result.opened,
    alreadyOpen: result.alreadyOpen,
    repeatable: result.repeatable,
  };
}

export function chestToastText(result: ChestOpenResult): string {
  if (result.alreadyOpen && !result.repeatable) return "Сундук уже открыт";
  if (result.empty) return "Сундук пуст";
  const labels = result.lootNames.length ? result.lootNames : result.loot;
  return `Лут: ${labels.join(", ")}`;
}
