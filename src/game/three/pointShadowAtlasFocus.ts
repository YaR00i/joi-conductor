/**
 * Ground-plane focus for point-shadow atlas slots and explore bake grants.
 *
 * Play uses the actor. The editor uses player_start (or Explore·Q tile),
 * not the orbit look-at — otherwise K=8 follows the camera and play at
 * spawn shows a different eight umbras. See docs/EMBER_AI_HANDOFF.md §9.1.
 */
import * as THREE from "three";
import type { EmberMap } from "../content/types";

export function pointShadowAtlasFocusFromTile(
  tx: number,
  ty: number,
  tileSize: number,
  out: THREE.Vector3,
): THREE.Vector3 {
  const ts = Math.max(1, tileSize);
  return out.set((tx + 0.5) * ts, 0, (ty + 0.5) * ts);
}

export function pointShadowAtlasSpawnTile(
  map: Pick<EmberMap, "regions">,
): { x: number; y: number } | null {
  const start =
    map.regions.find((region) => region.kind === "player_start") ??
    map.regions.find((region) => region.kind === "spawn") ??
    null;
  return start ? { x: start.x, y: start.y } : null;
}

/**
 * Play-comparable atlas focus: spawn tile, else map center.
 * Y is unused (slots score ground XZ).
 */
export function pointShadowAtlasFocusFromMap(
  map: Pick<EmberMap, "regions" | "tileSize" | "width" | "height">,
  out: THREE.Vector3,
): THREE.Vector3 {
  const spawn = pointShadowAtlasSpawnTile(map);
  if (spawn) {
    return pointShadowAtlasFocusFromTile(
      spawn.x,
      spawn.y,
      map.tileSize,
      out,
    );
  }
  const ts = Math.max(1, map.tileSize);
  return out.set((map.width * ts) / 2, 0, (map.height * ts) / 2);
}
