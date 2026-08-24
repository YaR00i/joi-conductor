import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  tagEmissiveMaterial,
  tickEmissiveMaterials,
} from "./emissiveAnimTick";

function triggerMaterial(when: "player" | "enemy" | "either") {
  const material = new THREE.MeshBasicMaterial();
  tagEmissiveMaterial(material, {
    anim: "trigger",
    seed: 1,
    baseIntensity: 1,
    kind: "basic",
    triggerWhen: when,
    triggerRadius: 3,
    tx: 0,
    ty: 0,
  });
  return material;
}

describe("runtime emissive trigger proximity", () => {
  it("does not query the enemy crowd for player-only triggers", () => {
    const material = triggerMaterial("player");
    let enemyQueries = 0;

    tickEmissiveMaterials([material], {
      timeSec: 1,
      dt: 1 / 60,
      playerTiles: [{ x: 0.5, y: 0.5 }],
      enemyProximityAmount: () => {
        enemyQueries += 1;
        return 1;
      },
    });

    expect(enemyQueries).toBe(0);
  });

  it("uses the spatial proximity provider for enemy triggers", () => {
    const material = triggerMaterial("enemy");
    let enemyQueries = 0;

    tickEmissiveMaterials([material], {
      timeSec: 1,
      dt: 1 / 60,
      playerTiles: [{ x: 100, y: 100 }],
      enemyProximityAmount: (tx, ty, radius) => {
        enemyQueries += 1;
        expect({ tx, ty, radius }).toEqual({ tx: 0, ty: 0, radius: 3 });
        return 0.75;
      },
    });

    expect(enemyQueries).toBe(1);
  });

  it("short-circuits either triggers when the player is at full strength", () => {
    const material = triggerMaterial("either");
    let enemyQueries = 0;

    tickEmissiveMaterials([material], {
      timeSec: 1,
      dt: 1 / 60,
      playerTiles: [{ x: 0.5, y: 0.5 }],
      enemyProximityAmount: () => {
        enemyQueries += 1;
        return 1;
      },
    });

    expect(enemyQueries).toBe(0);
  });
});
