import { describe, expect, it } from "vitest";
import type {
  EmberLightPreset,
  EmberMap,
  EmberPack,
  EmberPixelSprite,
  EmberTilesetTile,
  EmberVoxelModel,
} from "../../content/types";
import { serializePixelSprite } from "../../content/pixelSprite";
import {
  createEmptyMap,
  ensureMapLayers,
  setElevTileId,
} from "../../tile/mapUtils";
import {
  emberWorldObjectComponent,
  emberWorldObjectRefEquals,
  emberWorldObjectRefKey,
} from "./EmberWorldObject";
import {
  applyEmberInspectorFieldEdit,
  applyEmberLightAssetInspectorFieldEdit,
  applyEmberSpriteAssetInspectorFieldEdit,
  applyEmberTileAssetInspectorFieldEdit,
  applyEmberVoxelAssetInspectorFieldEdit,
  clearEmberWorldObjectComponentOverrides,
  getEmberLightAssetWorldObject,
  getEmberRegionDraftWorldObject,
  getEmberSpriteAssetWorldObject,
  getEmberTileAssetWorldObject,
  getEmberWorldObject,
  getEmberVoxelAssetWorldObject,
  listEmberWorldObjects,
  mapWithoutHiddenWorldObjects,
  patchEmberWorldObjectLocalTransform,
  patchEmberWorldObjectTransform,
  removeEmberWorldObject,
  removeEmberWorldObjects,
  setEmberVoxelAssetComponentPresence,
  setEmberSpriteAssetComponentPresence,
  setEmberTileAssetComponentPresence,
  setEmberWorldObjectComponentPresence,
  translateEmberWorldObjects,
} from "./emberWorldObjectAdapter";
import {
  getEmberInspectorComponentSchema,
  listAllEmberInspectorSchemas,
  listEmberInspectorSchemas,
} from "./EmberInspectorSchema";

function worldMap(): EmberMap {
  const map = ensureMapLayers(createEmptyMap("world", 8, 8, "test", 16));
  map.voxelProps = [
    {
      id: "crate-1",
      modelId: "crate",
      x: 2,
      y: 3,
      elev: 2,
      rot: 1,
      directLightScale: 0.5,
      collider: { enabled: true, walkableTop: true },
    },
  ];
  map.sprites = [{ id: "sign-1", spriteId: "sign", x: 4, y: 3 }];
  map.lights = [{ id: "lamp-1", x: 5, y: 4, lampRange: 6 }];
  map.regions = [
    { id: "exit-1", kind: "teleport", x: 1, y: 1, w: 2, h: 3 },
  ];
  setElevTileId(map, 6, 6, 3, 7);
  return map;
}

describe("EmberWorldObject references", () => {
  it("uses type-safe stable keys, including tile elevation", () => {
    expect(emberWorldObjectRefKey({ kind: "voxel", id: "same" })).toBe(
      "voxel:same",
    );
    expect(emberWorldObjectRefKey({ kind: "sprite", id: "same" })).toBe(
      "sprite:same",
    );
    expect(
      emberWorldObjectRefEquals(
        { kind: "tile", tx: 2, ty: 4, elev: 3 },
        { kind: "tile", tx: 2, ty: 4, elev: 3 },
      ),
    ).toBe(true);
  });
});

describe("EmberWorldObject adapter", () => {
  it("normalizes voxel transform and renderer/collider components", () => {
    const object = getEmberWorldObject(worldMap(), {
      kind: "voxel",
      id: "crate-1",
    });
    expect(object).not.toBeNull();
    expect(object?.transform).toMatchObject({
      position: { x: 2, y: 3, z: 2 },
      resolvedZ: 2,
      rotationQuarterTurns: 1,
    });
    expect(emberWorldObjectComponent(object!, "voxel-renderer")).toMatchObject({
      modelId: "crate",
      directLightScale: 0.5,
    });
    expect(emberWorldObjectComponent(object!, "collider")).toMatchObject({
      inheritedFrom: "instance",
      modifier: { enabled: true, walkableTop: true },
      fieldSources: { enabled: "instance", walkableTop: "instance" },
    });
    expect(emberWorldObjectComponent(object!, "voxel-light")).not.toBeNull();
  });

  it("adds and removes optional components on instances and library assets", () => {
    const map = worldMap();
    const withoutCollider = setEmberWorldObjectComponentPresence(
      map,
      { kind: "voxel", id: "crate-1" },
      "collider",
      false,
    );
    const instanceObject = getEmberWorldObject(withoutCollider, {
      kind: "voxel",
      id: "crate-1",
    });
    expect(emberWorldObjectComponent(instanceObject!, "collider")).toBeNull();
    expect(withoutCollider.voxelProps?.[0]?.collider?.enabled).toBe(false);

    const model: EmberVoxelModel = {
      id: "library-crate",
      sizeBlocks: { x: 1, y: 1, z: 1 },
      palette: ["", "#fff"],
      voxels: [1],
    };
    const assetWithoutLight = setEmberVoxelAssetComponentPresence(
      model,
      "voxel-light",
      false,
    );
    const assetObject = getEmberVoxelAssetWorldObject(assetWithoutLight);
    expect(emberWorldObjectComponent(assetObject, "voxel-light")).toBeNull();
    expect(emberWorldObjectComponent(assetObject, "voxel-renderer")).not.toBeNull();

    const edited = applyEmberVoxelAssetInspectorFieldEdit(model, {
      componentType: "collider",
      fieldId: "isTrigger",
      value: true,
    });
    expect(edited.componentStates?.collider).toBe(true);
    expect(edited.collider).toMatchObject({
      enabled: true,
      isTrigger: true,
      blocksMovement: false,
    });
  });

  it("projects and edits sprite, tile, light, and zone library assets", () => {
    const sprite: EmberPixelSprite = {
      id: "banner",
      nameRu: "Знамя",
      width: 4,
      topHeight: 4,
      wallHeights: [],
      pixels: Array(16).fill("#fff"),
      color: "#fff",
    };
    expect(
      emberWorldObjectComponent(
        getEmberSpriteAssetWorldObject(sprite),
        "collider",
      ),
    ).toBeNull();
    const solidSprite = setEmberSpriteAssetComponentPresence(
      sprite,
      "collider",
      true,
    );
    const triggerSprite = applyEmberSpriteAssetInspectorFieldEdit(
      solidSprite,
      { componentType: "collider", fieldId: "isTrigger", value: true },
    );
    expect(triggerSprite).toMatchObject({
      componentStates: { collider: true },
      solid: true,
      collider: { enabled: true, isTrigger: true, blocksMovement: false },
    });
    expect(serializePixelSprite(triggerSprite).collider).toMatchObject({
      isTrigger: true,
    });

    const tile: EmberTilesetTile = {
      id: 8,
      name: "Арка",
      color: "#654",
    };
    const solidTile = setEmberTileAssetComponentPresence(
      tile,
      "collider",
      true,
    );
    const offsetTile = applyEmberTileAssetInspectorFieldEdit(solidTile, {
      componentType: "collider",
      fieldId: "offsetVoxels",
      value: 3.4,
    });
    expect(
      emberWorldObjectComponent(
        getEmberTileAssetWorldObject(offsetTile),
        "collider",
      )?.modifier,
    ).toMatchObject({ enabled: true, offsetVoxels: 3 });

    const preset: EmberLightPreset = {
      id: "amber",
      nameRu: "Янтарный",
      lampColor: "#ffaa44",
      lampFaceColor: "#ff8833",
      lampRange: 4,
      lampDiscCore: 1,
      lampDiscMid: 2,
      lampHeight: 1,
      lampShowCore: true,
      lampStrength0: 0.6,
      lampStrengthFalloff: 0.4,
      lampTorchFlicker: true,
    };
    const brighter = applyEmberLightAssetInspectorFieldEdit(preset, {
      componentType: "light",
      fieldId: "lampStrength0",
      value: 3,
    });
    expect(
      emberWorldObjectComponent(
        getEmberLightAssetWorldObject(brighter),
        "light",
      )?.source.lampStrength0,
    ).toBe(1);

    const draft = {
      id: "draft-trigger",
      kind: "trigger" as const,
      x: 1,
      y: 1,
      w: 2,
      h: 2,
    };
    const regionObject = getEmberRegionDraftWorldObject(worldMap(), draft);
    expect(emberWorldObjectComponent(regionObject!, "volume")).not.toBeNull();
    expect(emberWorldObjectComponent(regionObject!, "trigger")).not.toBeNull();
  });

  it("resolves sprite and tile Collider overrides over their assets", () => {
    const map = worldMap();
    const spriteAsset: EmberPixelSprite = {
      id: "sign",
      width: 4,
      topHeight: 4,
      wallHeights: [],
      pixels: Array(16).fill("#fff"),
      color: "#fff",
      solid: false,
    };
    const pack = { sprites: { sign: spriteAsset } } as unknown as EmberPack;
    const withSpriteCollider = setEmberWorldObjectComponentPresence(
      map,
      { kind: "sprite", id: "sign-1" },
      "collider",
      true,
    );
    const editedSprite = applyEmberInspectorFieldEdit(
      withSpriteCollider,
      { kind: "sprite", id: "sign-1" },
      { componentType: "collider", fieldId: "isTrigger", value: true },
    );
    const spriteObject = getEmberWorldObject(
      editedSprite,
      { kind: "sprite", id: "sign-1" },
      { pack },
    );
    expect(emberWorldObjectComponent(spriteObject!, "collider")).toMatchObject({
      presenceSource: "instance",
      modifier: { enabled: true, isTrigger: true, blocksMovement: false },
      fieldSources: { isTrigger: "instance" },
    });
    const resetSprite = clearEmberWorldObjectComponentOverrides(
      editedSprite,
      { kind: "sprite", id: "sign-1" },
      "collider",
    );
    expect(resetSprite.sprites?.[0]).not.toHaveProperty("collider");
    expect(resetSprite.sprites?.[0]).not.toHaveProperty("componentStates");

    const tileset = {
      id: "test",
      tileSize: 16,
      columns: 1,
      tileCount: 1,
      tiles: [{ id: 7, name: "stone", color: "#555", solid: true }],
    };
    const withoutTileCollider = setEmberWorldObjectComponentPresence(
      map,
      { kind: "tile", tx: 6, ty: 6, elev: 3 },
      "collider",
      false,
    );
    const tileObject = getEmberWorldObject(
      withoutTileCollider,
      { kind: "tile", tx: 6, ty: 6, elev: 3 },
      { tileset },
    );
    expect(emberWorldObjectComponent(tileObject!, "collider")).toBeNull();
    expect(tileObject?.removedComponents).toEqual(["collider"]);
    expect(withoutTileCollider.tileModifiers?.[0]).toMatchObject({
      x: 6,
      y: 6,
      elev: 3,
      componentStates: { collider: false },
    });
  });

  it("lists non-tile scene objects for the future Outliner", () => {
    const objects = listEmberWorldObjects(worldMap());
    expect(objects.map((object) => object.key)).toEqual([
      "voxel:crate-1",
      "sprite:sign-1",
      "light:lamp-1",
      "region:exit-1",
    ]);
  });

  it("creates an editor-only hidden-object projection without changing the map", () => {
    const map = worldMap();
    const preview = mapWithoutHiddenWorldObjects(
      map,
      new Set(["voxel:crate-1", "light:lamp-1", "region:exit-1"]),
    );
    expect(preview.voxelProps).toEqual([]);
    expect(preview.lights).toEqual([]);
    expect(preview.regions).toEqual([]);
    expect(preview.sprites).toHaveLength(1);
    expect(map.voxelProps).toHaveLength(1);
    expect(map.lights).toHaveLength(1);
    expect(map.regions).toHaveLength(1);
  });

  it("splits overloaded legacy regions into editor components", () => {
    const object = getEmberWorldObject(worldMap(), {
      kind: "region",
      id: "exit-1",
    });
    expect(emberWorldObjectComponent(object!, "volume")).not.toBeNull();
    expect(emberWorldObjectComponent(object!, "trigger")).not.toBeNull();
    expect(emberWorldObjectComponent(object!, "teleport")).toMatchObject({
      type: "teleport",
    });
  });

  it("has a deterministic inspector schema for every normalized component", () => {
    const schemas = listAllEmberInspectorSchemas();
    expect(new Set(schemas.map((schema) => schema.type)).size).toBe(
      schemas.length,
    );
    for (const schema of schemas) {
      expect(new Set(schema.fields.map((field) => field.id)).size).toBe(
        schema.fields.length,
      );
    }

    for (const object of listEmberWorldObjects(worldMap())) {
      const objectSchemas = listEmberInspectorSchemas(object);
      expect(objectSchemas[0]?.type).toBe("transform");
      for (const component of object.components) {
        expect(getEmberInspectorComponentSchema(component.type)).not.toBeNull();
      }
    }
  });

  it("creates a virtual block object without expanding map storage", () => {
    const object = getEmberWorldObject(worldMap(), {
      kind: "tile",
      tx: 6,
      ty: 6,
      elev: 3,
    });
    expect(object).toMatchObject({
      key: "tile:6:6:3",
      kind: "tile",
      transform: { position: { x: 6, y: 6, z: 3 }, resolvedZ: 3 },
      source: {
        kind: "tile",
        value: { tx: 6, ty: 6, elev: 3, tileId: 7 },
      },
    });
    expect(emberWorldObjectComponent(object!, "block")).toMatchObject({
      tileId: 7,
      elevation: 3,
    });
  });

  it("patches transforms immutably across stored object categories", () => {
    const map = worldMap();
    const voxel = patchEmberWorldObjectTransform(
      map,
      { kind: "voxel", id: "crate-1" },
      { x: 7, z: null, rotationQuarterTurns: 5 },
    );
    expect(voxel.voxelProps?.[0]).toMatchObject({ x: 7, y: 3, rot: 1 });
    expect(voxel.voxelProps?.[0]).not.toHaveProperty("elev");
    expect(map.voxelProps?.[0]).toMatchObject({ x: 2, elev: 2 });

    const sprite = patchEmberWorldObjectTransform(
      map,
      { kind: "sprite", id: "sign-1" },
      { y: 7 },
    );
    expect(sprite.sprites?.[0]).toMatchObject({ x: 4, y: 7 });

    const light = patchEmberWorldObjectTransform(
      map,
      { kind: "light", id: "lamp-1" },
      { x: 0, y: 2 },
    );
    expect(light.lights?.[0]).toMatchObject({ x: 0, y: 2, lampRange: 6 });

    const region = patchEmberWorldObjectTransform(
      map,
      { kind: "region", id: "exit-1" },
      { x: 3, y: 2 },
    );
    expect(region.regions[0]).toMatchObject({ x: 3, y: 2, w: 2, h: 3 });
  });

  it("converts a direct child's Local Transform through its stable Parent", () => {
    const map = worldMap();
    map.sceneHierarchy = {
      version: 1,
      groups: [
        {
          id: "props",
          name: "Props",
          objectKeys: ["voxel:crate-1"],
          pivot: { x: 4, y: 4, z: 1 },
          rotationQuarterTurns: 0,
        },
      ],
    };

    const moved = patchEmberWorldObjectLocalTransform(
      map,
      { kind: "voxel", id: "crate-1" },
      { x: -1, z: 3, rotationQuarterTurns: 2 },
    );

    expect(moved.voxelProps?.[0]).toMatchObject({
      x: 3,
      y: 3,
      elev: 4,
      rot: 2,
    });
    expect(moved.sceneHierarchy?.groups[0]).toMatchObject({
      pivot: { x: 4, y: 4, z: 1 },
      localTransforms: {
        "voxel:crate-1": {
          position: { x: -1, y: -1, z: 3 },
          rotationQuarterTurns: 2,
        },
      },
    });

    const rotatedParent = worldMap();
    rotatedParent.sceneHierarchy = {
      version: 1,
      groups: [
        {
          id: "rotated",
          name: "Rotated Parent",
          objectKeys: ["voxel:crate-1"],
          pivot: { x: 4, y: 4, z: 0 },
          rotationQuarterTurns: 1,
        },
      ],
    };
    const rotatedLocal = patchEmberWorldObjectLocalTransform(
      rotatedParent,
      { kind: "voxel", id: "crate-1" },
      { x: 0 },
    );
    expect(rotatedLocal.voxelProps?.[0]).toMatchObject({ x: 2, y: 4 });
    expect(
      rotatedLocal.sceneHierarchy?.groups[0].localTransforms?.["voxel:crate-1"],
    ).toMatchObject({ position: { x: 0, y: 2 } });
  });

  it("applies inspector Transform and Collider edits through one command API", () => {
    const map = worldMap();
    const moved = applyEmberInspectorFieldEdit(
      map,
      { kind: "voxel", id: "crate-1" },
      { componentType: "transform", fieldId: "x", value: 99 },
    );
    const lifted = applyEmberInspectorFieldEdit(
      moved,
      { kind: "voxel", id: "crate-1" },
      { componentType: "transform", fieldId: "z", value: 4.6 },
    );
    const rotated = applyEmberInspectorFieldEdit(
      lifted,
      { kind: "voxel", id: "crate-1" },
      {
        componentType: "transform",
        fieldId: "rotationQuarterTurns",
        value: 270,
      },
    );
    const trigger = applyEmberInspectorFieldEdit(
      rotated,
      { kind: "voxel", id: "crate-1" },
      { componentType: "collider", fieldId: "isTrigger", value: true },
    );

    expect(trigger.voxelProps?.[0]).toMatchObject({
      x: 7,
      elev: 5,
      rot: 3,
      collider: {
        enabled: true,
        isTrigger: true,
        blocksMovement: false,
        walkableTop: true,
      },
    });
    expect(map.voxelProps?.[0]).toMatchObject({ x: 2, elev: 2, rot: 1 });
  });

  it("resets an individual schema override back to its inherited value", () => {
    const map = worldMap();
    const next = applyEmberInspectorFieldEdit(
      map,
      { kind: "voxel", id: "crate-1" },
      { componentType: "collider", fieldId: "enabled", value: null },
    );
    expect(next.voxelProps?.[0].collider).toEqual({ walkableTop: true });
    expect(map.voxelProps?.[0].collider).toEqual({
      enabled: true,
      walkableTop: true,
    });
  });

  it("persists schema edits for lights and gameplay volumes", () => {
    const map = worldMap();
    const light = applyEmberInspectorFieldEdit(
      map,
      { kind: "light", id: "lamp-1" },
      { componentType: "light", fieldId: "lampRange", value: 30 },
    );
    expect(light.lights?.[0]).toMatchObject({ lampRange: 16 });

    const resized = applyEmberInspectorFieldEdit(
      light,
      { kind: "region", id: "exit-1" },
      { componentType: "volume", fieldId: "width", value: 99 },
    );
    const scripted = applyEmberInspectorFieldEdit(
      resized,
      { kind: "region", id: "exit-1" },
      { componentType: "trigger", fieldId: "scriptId", value: " exit_hook " },
    );
    const targeted = applyEmberInspectorFieldEdit(
      scripted,
      { kind: "region", id: "exit-1" },
      {
        componentType: "teleport",
        fieldId: "targetRegionId",
        value: " dungeon-2 ",
      },
    );
    expect(targeted.regions[0]).toMatchObject({
      w: 7,
      h: 3,
      scriptId: "exit_hook",
      targetRegionId: "dungeon-2",
    });
    expect(map.regions[0]).not.toHaveProperty("scriptId");
  });

  it("removes any stored scene object through one API", () => {
    const map = worldMap();
    expect(
      removeEmberWorldObject(map, { kind: "voxel", id: "crate-1" })
        .voxelProps,
    ).toEqual([]);
    expect(
      removeEmberWorldObject(map, { kind: "sprite", id: "sign-1" }).sprites,
    ).toEqual([]);
    expect(
      removeEmberWorldObject(map, { kind: "light", id: "lamp-1" }).lights,
    ).toBeUndefined();
    expect(
      removeEmberWorldObject(map, { kind: "region", id: "exit-1" }).regions,
    ).toEqual([]);

    const withoutTile = removeEmberWorldObject(map, {
      kind: "tile",
      tx: 6,
      ty: 6,
      elev: 3,
    });
    expect(
      getEmberWorldObject(withoutTile, {
        kind: "tile",
        tx: 6,
        ty: 6,
        elev: 3,
      })?.source,
    ).toMatchObject({ kind: "tile", value: { tileId: 0 } });
  });

  it("moves and removes a mixed selection atomically", () => {
    const map = worldMap();
    const refs = [
      { kind: "voxel", id: "crate-1" },
      { kind: "region", id: "exit-1" },
    ] as const;
    const moved = translateEmberWorldObjects(map, refs, -5, 9);
    expect(moved.voxelProps?.[0]).toMatchObject({ x: 0, y: 7 });
    expect(moved.regions[0]).toMatchObject({ x: 0, y: 5 });
    expect(map.voxelProps?.[0]).toMatchObject({ x: 2, y: 3 });

    const removed = removeEmberWorldObjects(moved, refs);
    expect(removed.voxelProps).toEqual([]);
    expect(removed.regions).toEqual([]);
    expect(removed.sprites).toHaveLength(1);
    expect(removed.lights).toHaveLength(1);
  });
});
