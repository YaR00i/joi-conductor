import type { Object3D } from "three";
import type { CutawayHideSet, CutawayRole, EmberCutawayTag } from "../tile/buildingInterior";
import { cellCutawayKey, tileCutawayKey } from "../tile/buildingInterior";

function readTag(obj: Object3D): EmberCutawayTag | undefined {
  const tag = obj.userData.emberCutaway as EmberCutawayTag | undefined;
  if (!tag || typeof tag.tx !== "number" || typeof tag.ty !== "number") {
    return undefined;
  }
  return tag;
}

function shouldHide(tag: EmberCutawayTag, hide: CutawayHideSet): boolean {
  switch (tag.role) {
    case "roof":
      return hide.roofCells.has(cellCutawayKey(tag.tx, tag.ty, tag.elev));
    case "wall":
    case "prop":
      return hide.wallTiles.has(tileCutawayKey(tag.tx, tag.ty));
    case "floor":
      return false;
    default: {
      const _never: never = tag.role;
      return _never;
    }
  }
}

export function collectCutawayTagged(root: Object3D): Object3D[] {
  const tagged: Object3D[] = [];
  root.traverse((obj) => {
    if (readTag(obj)) tagged.push(obj);
  });
  return tagged;
}

export function applyInteriorCutawayTagged(
  tagged: readonly Object3D[],
  hide: CutawayHideSet,
): void {
  for (const obj of tagged) {
    const tag = readTag(obj);
    if (!tag) continue;
    obj.visible = !shouldHide(tag, hide);
  }
}

/** Show/hide tagged roof, wall, and prop meshes for the current occupancy. */
export function applyInteriorCutaway(
  root: Object3D,
  hide: CutawayHideSet,
): void {
  applyInteriorCutawayTagged(collectCutawayTagged(root), hide);
}

type CutawayVisibility = { object: Object3D; visible: boolean };

/**
 * Play hides roofs/walls for the camera, then bakes sun + lamp cubes in the
 * same tick. Hidden casters never write depth, so play umbras look like a
 * different light map than the editor (which never cutaways). Reveal for the
 * bake, then restore the occupancy hide for the color pass.
 */
export function withCutawayCastersVisible<T>(
  tagged: readonly Object3D[],
  fn: () => T,
): T {
  const prev: CutawayVisibility[] = [];
  for (const object of tagged) {
    prev.push({ object, visible: object.visible });
    object.visible = true;
  }
  try {
    return fn();
  } finally {
    for (const entry of prev) entry.object.visible = entry.visible;
  }
}

export function tagCutawayObject(
  obj: Object3D,
  tx: number,
  ty: number,
  elev: number,
  role: CutawayRole,
): void {
  obj.userData.emberCutaway = { tx, ty, elev, role } satisfies EmberCutawayTag;
}
