import Phaser from "phaser";
import type { EmberBridgeHandler, EmberGameApi } from "../bridge/events";
import type { EmberPack } from "../content/types";
import { createEmberThreeGame } from "../three/createEmberThreeGame";
import { ArenaScene } from "./ArenaScene";

export type CreateEmberGameOpts = {
  parent: HTMLElement;
  pack: EmberPack;
  stageId: string;
  onBridge: EmberBridgeHandler;
  shortMode?: boolean;
  width?: number;
  height?: number;
  /** Force legacy Phaser bake runtime (default: Three.js P0). */
  usePhaser?: boolean;
};

/** Play entry — Three.js voxel world. Phaser kept as fallback. */
export function createEmberGame(opts: CreateEmberGameOpts): EmberGameApi {
  if (!opts.usePhaser) {
    return createEmberThreeGame(opts);
  }
  return createEmberPhaserGame(opts);
}

/** Legacy Canvas-bake Phaser arena (kept for rollback). */
export function createEmberPhaserGame(opts: CreateEmberGameOpts): EmberGameApi {
  const width = opts.width ?? (opts.parent.clientWidth || 960);
  const height = opts.height ?? (opts.parent.clientHeight || 640);

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: opts.parent,
    width,
    height,
    backgroundColor: "#0e0a08",
    physics: {
      default: "arcade",
      arcade: { debug: false },
    },
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    scene: [],
    render: {
      pixelArt: true,
      antialias: false,
    },
  });

  game.scene.add("ArenaScene", ArenaScene, true, {
    pack: opts.pack,
    stageId: opts.stageId,
    onBridge: opts.onBridge,
    shortMode: opts.shortMode,
  });

  const scene = () => game.scene.getScene("ArenaScene") as ArenaScene | null;

  return {
    ready: Promise.resolve(),
    lockLook: () => undefined,
    pause: () => scene()?.pauseLogic(),
    resume: () => scene()?.resumeLogic(),
    applyLoot: (itemId: string) => scene()?.applyLoot(itemId),
    buyShopItem: () => undefined,
    sellShopItem: () => undefined,
    closeShop: () => undefined,
    toggleInventory: () => undefined,
    closeInventory: () => undefined,
    equipItem: () => undefined,
    unequipSlot: () => undefined,
    useItem: () => undefined,
    advanceDialogue: () => undefined,
    captureExploreSave: () => null,
    applyExploreSave: () => false,
    applyCameraSettings: () => undefined,
    destroy: () => {
      game.destroy(true);
    },
  };
}
