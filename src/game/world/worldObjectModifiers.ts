import type {
  EmberColliderModifier,
  EmberMap,
  EmberPixelSprite,
  EmberSpritePlacement,
  EmberTileInstanceModifier,
  EmberTilesetTile,
} from "../content/types";
import { resolveWorldCollider, type ResolvedWorldCollider } from "./worldPhysics";

export function spriteAssetColliderPresent(
  sprite: EmberPixelSprite | undefined,
): boolean {
  return (
    sprite?.componentStates?.collider ??
    Boolean(sprite?.collider || sprite?.solid)
  );
}

export function spriteInstanceColliderPresent(
  placement: EmberSpritePlacement,
  sprite: EmberPixelSprite | undefined,
): boolean {
  return (
    placement.componentStates?.collider ?? spriteAssetColliderPresent(sprite)
  );
}

export function resolveSpriteInstanceCollider(
  placement: EmberSpritePlacement,
  sprite: EmberPixelSprite | undefined,
): ResolvedWorldCollider {
  if (!spriteInstanceColliderPresent(placement, sprite)) {
    return resolveWorldCollider(undefined, { enabled: false }, false);
  }
  return resolveWorldCollider(
    sprite?.collider,
    placement.collider,
    sprite?.solid === true || spriteInstanceColliderPresent(placement, sprite),
  );
}

export function tileInstanceModifierAt(
  map: EmberMap,
  x: number,
  y: number,
  elev: number,
): EmberTileInstanceModifier | undefined {
  return map.tileModifiers?.find(
    (modifier) =>
      modifier.x === x && modifier.y === y && modifier.elev === elev,
  );
}

export function tileAssetColliderPresent(
  tile: EmberTilesetTile | undefined,
  defaultPresent = false,
): boolean {
  return (
    tile?.componentStates?.collider ??
    (Boolean(tile?.collider || tile?.solid) || defaultPresent)
  );
}

export function tileInstanceColliderPresent(
  modifier: EmberTileInstanceModifier | undefined,
  tile: EmberTilesetTile | undefined,
  defaultPresent = false,
): boolean {
  return (
    modifier?.componentStates?.collider ??
    tileAssetColliderPresent(tile, defaultPresent)
  );
}

export function resolveTileInstanceCollider(
  modifier: EmberTileInstanceModifier | undefined,
  tile: EmberTilesetTile | undefined,
  defaultPresent = false,
): ResolvedWorldCollider {
  if (!tileInstanceColliderPresent(modifier, tile, defaultPresent)) {
    return resolveWorldCollider(undefined, { enabled: false }, false);
  }
  return resolveWorldCollider(
    tile?.collider,
    modifier?.collider,
    tile?.solid === true ||
      tileInstanceColliderPresent(modifier, tile, defaultPresent),
  );
}

export function setColliderField(
  collider: EmberColliderModifier | undefined,
  field: keyof EmberColliderModifier,
  value: EmberColliderModifier[keyof EmberColliderModifier] | null,
): EmberColliderModifier | undefined {
  const next = { ...collider };
  if (value === null) delete next[field];
  else (next as Record<string, unknown>)[field] = value;
  return Object.keys(next).length > 0 ? next : undefined;
}
