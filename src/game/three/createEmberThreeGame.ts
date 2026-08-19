import type { EmberBridgeHandler, EmberGameApi } from "../bridge/events";
import type { EmberPack } from "../content/types";
import { EmberThreeWorld } from "./EmberThreeWorld";

export type CreateEmberThreeGameOpts = {
  parent: HTMLElement;
  pack: EmberPack;
  stageId: string;
  onBridge: EmberBridgeHandler;
  shortMode?: boolean;
  width?: number;
  height?: number;
};

/** Phase 0 Three.js play runtime (replaces Phaser bake path). */
export function createEmberThreeGame(
  opts: CreateEmberThreeGameOpts,
): EmberGameApi {
  const world = new EmberThreeWorld(opts);
  return {
    pause: () => world.pause(),
    resume: () => world.resume(),
    applyLoot: (itemId: string) => world.applyLoot(itemId),
    destroy: () => world.destroy(),
  };
}
