import type { EmberBridgeHandler, EmberGameApi } from "../bridge/events";
import type { EmberExploreSaveState } from "../content/emberSave";
import type { EmberEquipSlot } from "../content/emberEquipment";
import type { EmberPack } from "../content/types";
import {
  EmberThreeWorld,
  type EmberThreeWorldOpts,
} from "./EmberThreeWorld";

export type CreateEmberThreeGameOpts = {
  parent: HTMLElement;
  pack: EmberPack;
  stageId: string;
  onBridge: EmberBridgeHandler;
  shortMode?: boolean;
  width?: number;
  height?: number;
  terrainStreaming?: EmberThreeWorldOpts["terrainStreaming"];
  exploreSave?: EmberExploreSaveState | null;
};

/** Phase 0 Three.js play runtime (replaces Phaser bake path). */
export function createEmberThreeGame(
  opts: CreateEmberThreeGameOpts,
): EmberGameApi {
  const world = new EmberThreeWorld(opts);
  return {
    ready: world.ready,
    lockLook: () => world.lockLook(),
    pause: () => world.pause(),
    resume: () => world.resume(),
    applyLoot: (itemId: string) => world.applyLoot(itemId),
    buyShopItem: (itemId: string) => world.buyShopItem(itemId),
    sellShopItem: (itemId: string) => world.sellShopItem(itemId),
    closeShop: () => world.closeShop(),
    toggleInventory: () => world.toggleInventory(),
    closeInventory: () => world.closeInventory(),
    equipItem: (itemId: string) => world.equipItem(itemId),
    unequipSlot: (slot: EmberEquipSlot) => world.unequipSlot(slot),
    useItem: (itemId: string) => world.useItem(itemId),
    advanceDialogue: () => world.advanceDialogue(),
    captureExploreSave: () => world.captureExploreSave(),
    applyExploreSave: (save) => world.applyExploreSave(save),
    applyCameraSettings: (camera) => world.applyCameraSettings(camera),
    destroy: () => world.destroy(),
  };
}
