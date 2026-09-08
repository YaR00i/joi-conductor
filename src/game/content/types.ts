/** Ember Anomaly content pack types (Phase 1). */

export type MistressIdRef = "hu_tao" | "furina" | "sunna" | "sparkle";

export type EmberRarity = "common" | "rare" | "epic";

export type EmberMapPlayProfile = "arena" | "explore";

/** Named play/editor camera framings. Omit `camera` on a map = iso JRPG defaults. */
export const EMBER_CAMERA_PRESET_IDS = [
  "iso",
  "close",
  "high",
  "wide",
] as const;
export type EmberCameraPresetId = (typeof EMBER_CAMERA_PRESET_IDS)[number];

/**
 * Authored perspective follow camera (play + Explore·Q).
 * Vertical FOV is Three.js `PerspectiveCamera.fov` in degrees.
 */
export type EmberMapCamera = {
  /** Builtin `iso|close|high|wide` or saved pack preset `cam_*`. */
  presetId?: string;
  /** Vertical field of view in degrees. Default 40. */
  fov?: number;
  /** Orbit radius in world units. Omit = `tileSize * 7.5` clamped. */
  followDistance?: number;
  /** Spherical polar from +Y, radians. Default 0.95 (iso). */
  polarAngle?: number;
  /** Spherical yaw, radians. Default π/4 (south-east). */
  yaw?: number;
  /** Extra look-at height in world units. Default 6. */
  lookHeight?: number;
  near?: number;
  far?: number;
  /** When true, mouse only yaws (current play). Default true. */
  pitchLock?: boolean;
  polarMin?: number;
  polarMax?: number;
  /** Multiplier on play mouse yaw/pitch. Default 1. */
  mouseSensitivity?: number;
};

export type MapRegionKind =
  | "player_start"
  | "spawn"
  | "chest"
  | "trigger"
  | "camera_bound"
  | "teleport"
  | "npc_idle"
  | "npc_wander";

/**
 * Edge outline for tools that bind a voxel model/scene (chest now;
 * teleport/trigger props later). Idle color when far; pulses to
 * `interactColor` when the player can use the object.
 */
export type EmberModelOutline = {
  enabled?: boolean;
  /** Idle outline `#RRGGBB`. */
  color?: string;
  /** Outline tint while interactable `#RRGGBB`. */
  interactColor?: string;
  /** Pulse period in seconds while interactable (default ~1.15). */
  pulseSec?: number;
};

/**
 * Gameplay interactivity hanging on a placed voxel/sprite — not a new zone kind.
 * Constructor: object modifier + optional bound trigger volume.
 */
export const EMBER_INTERACTIVITY_KINDS = [
  "door",
  "talk",
  "quest_marker",
  "shop",
  "custom",
] as const;

export type EmberInteractivityKind = (typeof EMBER_INTERACTIVITY_KINDS)[number];

export const EMBER_QUEST_MARKER_STATUSES = [
  "available",
  "active",
  "done",
] as const;

export type EmberQuestMarkerStatus =
  (typeof EMBER_QUEST_MARKER_STATUSES)[number];

export type EmberInteractivityModifier = {
  kind: EmberInteractivityKind;
  /** Bound trigger region id — interact fires that volume. */
  triggerId?: string;
  /**
   * Dialogue scene id, action-list script id, or leftover hook.
   * talk / custom / shop intro / trigger `scriptId` resolve through pack.scenes
   * then pack.scripts.
   */
  scriptId?: string;
  /** quest_marker: item-icon id (`quest_available` / `quest` alias). */
  iconId?: string;
  /** quest_marker: canonical Godot quest definition; action stays in scriptId. */
  questId?: string;
  /** shop: id from pack.shops (`shops/catalog.json`). */
  shopId?: string;
  /** quest_marker: authored pin state. Runtime may override via flags. */
  questStatus?: EmberQuestMarkerStatus;
};

export type EmberMapRegion = {
  id: string;
  kind: MapRegionKind;
  x: number;
  y: number;
  w: number;
  h: number;
  /**
   * Story the volume sits on (same axis as blocks). Omit = glue to the
   * column surface, which is the roof when a ceiling tile exists above.
   */
  elev?: number;
  group?: string;
  /** teleport: warp destination in tile coords (or use targetRegionId). */
  targetX?: number;
  targetY?: number;
  targetElevation?: number;
  /** teleport / map-change: warp to center of this region id. */
  targetRegionId?: string;
  /**
   * Action list (`pack.scripts`) or dialogue (`pack.scenes`) id.
   * Empty string = unset. Play and exploreSim execute it.
   */
  scriptId?: string;
  /** Free-form note / TODO for authors (trigger stubs, teleport reminders). */
  note?: string;
  /**
   * Trigger: destination map for a map change. Play and headless exploreSim
   * load that map from the same pack and spawn at targetRegionId, else
   * targetX/Y, else player_start.
   */
  targetMapId?: string;
  /**
   * Reverse bind: placed object / modifier that fires this trigger.
   * The object side (`interactivity.triggerId`) is the authoring source.
   */
  boundObjectId?: string;
  /**
   * Chest: voxel model while closed (`pack.voxelModels` id).
   * Falls back to placeholder billboard when unset.
   * Prefer `sceneId` when the chest is a multi-object hinged scene.
   */
  closedModelId?: string;
  /** Chest: voxel model after open / loot (optional; ignored when scene+clip plays). */
  openModelId?: string;
  /**
   * Chest: voxel editor scene (`pack.voxelScenes` id) with objects/joints/clips.
   * When set, preview and play assemble the full scene instead of a lone model.
   */
  sceneId?: string;
  /**
   * Clip inside `sceneId` played on open (normalized 0→1 over durationSec).
   * If unset with a scene, snap to end pose on open.
   */
  openClipId?: string;
  /**
   * Chest visual: yaw in 90° steps (0..3), same as voxel props.
   * Does not rotate the loot/trigger zone footprint.
   */
  modelRot?: number;
  /**
   * Chest visual: floor elevation for the mesh.
   * Omit = tile surface under the model.
   */
  modelElev?: number;
  /**
   * Chest visual: MeshToon direct-lamp scale (0.05..1.5).
   * Same meaning as `EmberVoxelPlacement.directLightScale`.
   */
  modelDirectLightScale?: number;
  /**
   * Chest visual: offset from region center, in tiles (can be fractional).
   * Loot zone (`x,y,w,h`) stays put.
   */
  modelOffsetX?: number;
  modelOffsetY?: number;
  /** Chest visual: uniform scale (default 1). */
  modelScale?: number;
  /**
   * Shared interactive outline for model-bound tools (chest, later others).
   * Authoring lives on the region; runtime draws edges around the mesh.
   */
  modelOutline?: EmberModelOutline;
  /**
   * Chest / stash: item catalog ids (`pack.items`). Unknown ids stay
   * allowed as stubs. Example: `["coin", "herb"]`. Empty / omitted = empty.
   */
  lootIds?: string[];
  /**
   * Chest: grant loot again on later interacts. Omit / false = once.
   * Visual stays opened after the first open either way.
   */
  repeatable?: boolean;
  /**
   * Chest runtime: already opened this session. Not an authoring default;
   * play and exploreSim persist it so a once-chest does not refill.
   */
  opened?: boolean;
  /**
   * Explore NPC: pixel sprite from `pack.sprites`.
   * Used by `npc_idle` / `npc_wander` regions.
   */
  spriteId?: string;
  /**
   * Explore NPC wander AABB. Missing means patrol this region's own footprint.
   */
  wanderRegionId?: string;
};

/** Max walkable floor elevation (editor + runtime clamp). */
export const MAX_ELEVATION = 3;
/** Min floor elevation — water beds / sunken basins (Z-1). */
export const MIN_ELEVATION = -1;

/** Inclusive list of paint elevations from MIN to MAX. */
export function elevationSteps(): number[] {
  const out: number[] = [];
  for (let e = MIN_ELEVATION; e <= MAX_ELEVATION; e++) out.push(e);
  return out;
}

export function clampElevation(elev: number): number {
  if (!Number.isFinite(elev)) return 0;
  return Math.max(MIN_ELEVATION, Math.min(MAX_ELEVATION, Math.round(elev)));
}

export type EmberTileLayer = {
  name: string;
  type: "tile";
  data: number[];
};

/** Global scene color grade (tone / brightness / saturation). Neutral = no change. */
export type EmberMapGrade = {
  /** Warm ↔ cool, -1..1 (0 = neutral). */
  tone?: number;
  /** Brightness multiplier, 0.25..3 (1 = neutral). */
  brightness?: number;
  /** Saturation multiplier, 0..2 (1 = neutral). */
  saturation?: number;
};

/**
 * Map-wide atmosphere / weather (Three play + editor preview).
 * All intensities 0 = off.
 */
export type EmberMapAtmosphere = {
  /**
   * Exponential fog amount 0..1. Linear through origin: 0.001–0.05 is light
   * aerial haze; 1 matches the previous FogExp2 max density.
   */
  fog?: number;
  /** Fog tint `#RRGGBB`. */
  fogColor?: string;
  /** Rain intensity 0..1. */
  rain?: number;
  /** Rain slant / wind 0..1. */
  wind?: number;
  /** Soft drifting cloud shadows 0..1. */
  cloudShadows?: number;
  /** Cloud drift speed 0..2. */
  cloudSpeed?: number;
  /** Floating dust / ash motes 0..1. */
  dust?: number;
  /** Night fireflies (looks best with deep ambient) 0..1. */
  fireflies?: number;
  /** Sun glitter motes 0..1 (toy / diorama sparkle). */
  sparkle?: number;
  /** Screen vignette 0..1. */
  vignette?: number;
  /**
   * Miniature tilt-shift blur 0..1 — screen-Y diorama falloff, no depth buffer.
   */
  tiltShift?: number;
  /**
   * Warm air haze 0..1 — densifies fog slightly and warms dust/motes
   * (golden-hour feel without crushing visibility).
   */
  haze?: number;
  /**
   * Horizon sun glare disc 0..1 (additive glow in the key-light direction).
   */
  sunGlare?: number;
};

/** Per-map night ambient + default lantern look (optional; defaults in mapUtils). */
export type EmberMapLight = {
  /** Night tint `#RRGGBB` (Three: fill tint; Canvas: overlay color). */
  ambientColor?: string;
  /** Night depth 0..1 (0 = day fill, 1 = deep night). */
  ambientAlpha?: number;
  /**
   * Three.js base fill multiplier 0..3 (default 1.15).
   * Scales ambient + hemisphere so the scene is never crushed black.
   */
  fillIntensity?: number;
  /** Lantern tint on floors `#RRGGBB`. */
  lampColor?: string;
  /** Lantern tint on wall/cliff faces `#RRGGBB`. */
  lampFaceColor?: string;
  /** Outer lamp reach in tiles (1..16) — rim disc edge. */
  lampRange?: number;
  /** Bright core disc radius in tiles (1..lampRange). */
  lampDiscCore?: number;
  /** Mid disc radius in tiles (lampDiscCore..lampRange). */
  lampDiscMid?: number;
  /**
   * Point-light height above the floor in tile units (0.2..3).
   * 1 ≈ one block tall; default ~1.15.
   */
  lampHeight?: number;
  /** Show the bright core sphere at the lamp position (Three). */
  lampShowCore?: boolean;
  /** Strength on the lamp tile (0..1). */
  lampStrength0?: number;
  /** Neighbor falloff scale (typical ~0.45). */
  lampStrengthFalloff?: number;
  /**
   * Three.js point-lamp power multiplier 0..4 (default 1.25).
   * Canvas bake ignores this and uses wash alphas below.
   */
  lampPower?: number;
  /** Floor tint alpha = base + strength * scale. */
  floorGlowBase?: number;
  floorGlowScale?: number;
  /** Face tint alpha = base + strength * scale. */
  faceGlowBase?: number;
  faceGlowScale?: number;
  /**
   * Global lamp bloom strength 0..2 (UnrealBloomPass).
   * One fullscreen blur — not per-tile. 0 disables.
   */
  bloomStrength?: number;
  /** Bloom luminance threshold 0..1 (lower = more glow). */
  bloomThreshold?: number;
  /** Bloom blur radius 0..2. */
  bloomRadius?: number;
  /**
   * Key-light (sun) azimuth in degrees 0..360.
   * 0 = +X (east), 90 = +Z.
   */
  sunAzimuth?: number;
  /** Key-light elevation in degrees 5..85 (low = long shadows). */
  sunElevation?: number;
  /** Key-light tint `#RRGGBB`. */
  sunColor?: string;
  /** Key-light intensity multiplier 0..3 (default 1). */
  sunIntensity?: number;
  /**
   * Global torch flicker amount for lantern PointLights 0..1 (0 = off).
   * Breathes hard disc radii (range), not intensity — independent of emissive pixel anim.
   */
  torchFlicker?: number;
  /** Torch flicker tempo 0.25..3 (default 1). */
  torchFlickerSpeed?: number;
  /**
   * Quantize direct light + shadow samples to voxel centers (blocky falloff).
   */
  voxelSnapLight?: boolean;
  /**
   * Default: lanterns join global torch flicker (true when unset).
   * Per-source `lampTorchFlicker` can override.
   */
  lampTorchFlicker?: boolean;
  /**
   * Cap visible PointLights (lanterns first, then emissive fill).
   * Omit = renderer/profile budget. Clamped to hardware.
   */
  maxPointLights?: number;
  /**
   * Cap PointLight cube-shadows. 0 = fill light only, no cubes.
   * Omit = renderer/profile budget. Clamped to hardware.
   */
  maxPointShadows?: number;
  /**
   * How many nearby PointLight cubes may include moving actors.
   * 0 disables actor shadows; default 1; maximum is the map light-object count.
   */
  dynamicPointShadows?: number;
  /**
   * Enter dynamic mode inside this fraction of the authored light radius.
   * Default 0.8.
   */
  dynamicShadowEnterScale?: number;
  /**
   * Leave dynamic mode beyond this fraction of the authored light radius.
   * Kept >= enter scale to prevent rapid switching. Default 1.
   */
  dynamicShadowExitScale?: number;
  /** Post-light color grade for the whole scene. */
  grade?: EmberMapGrade;
  /** Weather / atmosphere (fog, rain, clouds…). */
  atmosphere?: EmberMapAtmosphere;
};

/**
 * Per-cell lantern instance / override.
 * Placed at a tile; can override glow tile/sprite defaults or stand alone.
 */
export type EmberLightSource = {
  id: string;
  x: number;
  y: number;
  /** When false, this entry is ignored (and suppresses implicit glow at cell if set). */
  enabled?: boolean;
  lampColor?: string;
  lampFaceColor?: string;
  lampRange?: number;
  lampDiscCore?: number;
  lampDiscMid?: number;
  lampHeight?: number;
  lampShowCore?: boolean;
  lampStrength0?: number;
  lampStrengthFalloff?: number;
  /**
   * Join global torch flicker. When unset, uses map `lampTorchFlicker` default.
   */
  lampTorchFlicker?: boolean;
};

/** @deprecated Legacy square canvas presets — migrated via normalizePixelSprite. */
export type EmberSpriteSize = 8 | 16 | 24 | 32;

export type EmberSpriteRole = "decor" | "enemy" | "player" | "prop" | "npc";

/**
 * Self-glow on painted pixels (not lantern flood).
 * - always — constant
 * - pulse — smooth sine
 * - flicker — per-block: dark wait in [min, max] sec, then a shaped burst
 * - trigger — brightens when {@link EmberEmissiveTriggerWhen} condition holds
 */
export type EmberEmissiveAnim = "always" | "pulse" | "flicker" | "trigger";

/**
 * Who / what arms a `trigger` emissive anim.
 * - player — герой в радиусе
 * - enemy — любой враг в радиусе
 * - either — герой или враг
 * - event — активен выбранный EmberEvent
 */
export type EmberEmissiveTriggerWhen =
  | "player"
  | "enemy"
  | "either"
  | "event";

/** Shared Unity-like physics layers used by every world object. */
export type EmberPhysicsLayer =
  | "world"
  | "actor"
  | "projectile"
  | "interaction"
  | "trigger";

/**
 * Shared authored Transform scale.
 * X/Y are the map plane, Z is vertical elevation (Three.js Y internally).
 */
export type EmberTransformScale = {
  x: number;
  y: number;
  z: number;
};

/**
 * Common collider component for tiles, sprites and voxel objects.
 * Values are in voxels so authoring stays identical across object kinds.
 */
export type EmberColliderModifier = {
  /** Disabled colliders are visual-only. */
  enabled?: boolean;
  /** Trigger colliders report overlap but never block movement. */
  isTrigger?: boolean;
  layer?: EmberPhysicsLayer;
  mask?: EmberPhysicsLayer[];
  /** Explicit movement override; defaults to !isTrigger. */
  blocksMovement?: boolean;
  /** Whether actors may stand/auto-step on the upper face. */
  walkableTop?: boolean;
  /** Optional box height override in voxels. */
  heightVoxels?: number;
  /** Vertical offset from the object's authored base in voxels. */
  offsetVoxels?: number;
};

/** Shared kinematic body component. Values are in voxels. */
export type EmberBodyModifier = {
  radiusVoxels?: number;
  heightVoxels?: number;
  stepHeightVoxels?: number;
  skinVoxels?: number;
  layer?: EmberPhysicsLayer;
  mask?: EmberPhysicsLayer[];
};

/**
 * Free-size pixel art for decor / characters / monsters.
 * Unified buffer: top band, then wall strips top→bottom.
 */
export type EmberPixelSprite = {
  id: string;
  nameRu?: string;
  /** Author tags for library search (`village`, `street`). Inferred prefixes stay search-only. */
  tags?: string[];
  /**
   * Visual pivot correction in Ember voxels. X/Y move along the map plane,
   * Z moves vertically. It does not move the collider or authored map cell.
   */
  worldOffsetVoxels?: { x: number; y: number; z: number };
  /** Explicit optional components on this reusable library asset. */
  componentStates?: Partial<Record<"collider", boolean>>;
  /** Width of all bands (px), 4…64. */
  width: number;
  /**
   * Image / top-face height (px), 4…64.
   * Sprites saved from the pixel editor are one canvas: `topHeight = H`,
   * `wallHeights = []`. Legacy assets may still split top + wall strips.
   */
  topHeight: number;
  /**
   * Wall strip heights top→bottom (px each, 1…64).
   * Empty = top only (flush on floor / full-canvas billboard).
   */
  wallHeights: number[];
  /**
   * Unified row-major buffer; "" = transparent.
   * length === width * (topHeight + sum(wallHeights)).
   */
  pixels: string[];
  /**
   * Optional emissive channel (same length as `pixels`).
   * Hex color per glowing pixel; "" = not emissive.
   */
  emissivePixels?: string[];
  /**
   * Optional shine / wet / metal channel (same length as `pixels`).
   * Hex luminance drives reflectivity; "" = matte.
   */
  shinePixels?: string[];
  /** How emissive pixels animate in play / preview. */
  emissiveAnim?: EmberEmissiveAnim;
  /** Peak emissive intensity 0..1 (default ~0.75). */
  emissiveStrength?: number;
  /**
   * Soft bloom / aura tint (`#rrggbb`). Ink stays on `emissivePixels`;
   * unset = bloom follows ink color.
   */
  emissiveBloomColor?: string;
  /**
   * When true, dense emissive ink casts a weak local PointLight (~0.5–1 tile).
   * Optional — off by default so existing art stays visual-only.
   */
  emissiveCastsLight?: boolean;
  /** Soft-light reach in tiles (default ~0.85, max = MAP_LIGHT_RANGE_MAX). */
  emissiveLightRange?: number;
  /** When true (and casts light), the weak PointLight casts cube shadows. */
  emissiveLightShadows?: boolean;
  /**
   * Pulse period in seconds (full sine cycle).
   * Also used as legacy flicker tempo when min/max unset.
   */
  emissiveAnimPeriod?: number;
  /** Flicker: dark-wait lower bound between flashes (seconds). */
  emissiveAnimPeriodMin?: number;
  /** Flicker: dark-wait upper bound between flashes (seconds). */
  emissiveAnimPeriodMax?: number;
  /** Trigger mode: radius in tiles (default 3). */
  emissiveTriggerRadius?: number;
  /** Trigger mode: condition (default player). */
  emissiveTriggerWhen?: EmberEmissiveTriggerWhen;
  /** When `emissiveTriggerWhen === "event"` — EmberEvent id. */
  emissiveTriggerEventId?: string;
  color: string;
  roles?: EmberSpriteRole[];
  /**
   * When true, map placements block player/enemies (AABB ≈ drawn stack).
   */
  solid?: boolean;
  /** Unified collider; `solid` remains a legacy fallback. */
  collider?: EmberColliderModifier;
  /** Candle / lamp — contributes to map lantern flood like tile.glow. */
  glow?: boolean;
  /** How this sprite receives light (when lit billboards are used). */
  material?: EmberMaterialKind;
  /**
   * Extra Octopath faces. `pixels` is always front.
   * Missing faces fall back to front in play; the plane is not yawed.
   */
  views?: Partial<Record<EmberSpriteCardExtraView, EmberSpriteCardFace>>;
  /**
   * Optional color stack for the front canvas. Play samples `pixels`
   * (the composite). Glow/shine stay separate material channels.
   */
  artLayers?: EmberSpriteArtLayer[];
  /**
   * Optional cel timeline. `pixels` / `views` / `artLayers` are always frame 0
   * so a static billboard still works. Omit when there is only one cel.
   */
  frames?: EmberSpriteAnimFrame[];
  /** @deprecated legacy square size — normalized on load. */
  size?: EmberSpriteSize;
  /** @deprecated legacy single wall face — normalized on load. */
  wallPixels?: string[];
};

/** Sprite stamped on a map tile (decor / props). */
export type EmberSpritePlacement = {
  id: string;
  spriteId: string;
  /** Per-instance add/remove override for the asset Collider component. */
  componentStates?: Partial<Record<"collider", boolean>>;
  /** Per-instance collider fields merged over the sprite asset. */
  collider?: EmberColliderModifier;
  x: number;
  y: number;
  /** Authored floor Z; omitted follows the terrain surface (legacy maps). */
  elev?: number;
  /** Per-instance Transform scale; omitted means 1×1×1. */
  scale?: EmberTransformScale;
  /**
   * Explore NPC instance. Asset `roles` may also include `"npc"`;
   * this field forces a placed sprite into the NPC layer.
   */
  role?: "npc";
  /** Instance gameplay interactivity (door / talk / quest marker / shop stub). */
  interactivity?: EmberInteractivityModifier;
};

/** Per-cell component overrides for one authored tile block. */
export type EmberTileInstanceModifier = {
  x: number;
  y: number;
  elev: number;
  componentStates?: Partial<Record<"collider", boolean>>;
  /** Per-instance collider fields merged over the tileset asset. */
  collider?: EmberColliderModifier;
};

/**
 * Extra PointLight on a voxel model (windows, twin lanterns, etc.).
 * Omitted fields inherit the model's emissiveLight* defaults.
 */
export type EmberVoxelEmissiveLamp = {
  id: string;
  nameRu?: string;
  /** Cell indices; omitted → this lamp uses the nearest emissive cluster. */
  origin?: { x: number; y: number; z: number };
  /** Extra shift in voxel units from origin / cluster centroid. */
  offset?: { x: number; y: number; z: number };
  range?: number;
  strength?: number;
  shadows?: boolean;
  softRings?: boolean;
  softShadows?: boolean;
  torchFlicker?: boolean;
  lanternFlicker?: boolean;
};

/**
 * Sculpted voxel prop. Size is in whole map blocks; art density is independent
 * from the gameplay footprint. Omitted `voxelsPerBlock` is legacy 16.
 * Axis: X/Z ground, Y up.
 */
export type EmberVoxelModel = {
  id: string;
  nameRu?: string;
  /** Author tags for library search (`village`, `street`). Inferred prefixes stay search-only. */
  tags?: string[];
  /** Explicit optional-component presence for the shared library asset. */
  componentStates?: Partial<Record<"collider" | "voxel-light", boolean>>;
  sizeBlocks: { x: number; y: number; z: number };
  /** Art cells along one block edge. Legacy files omit it and resolve to 16. */
  voxelsPerBlock?: 16 | 32;
  /**
   * Optional height in art voxels (overrides sizeBlocks.y * voxelsPerBlock).
   * Must be ≥1; X/Z stay in whole blocks.
   */
  heightVoxels?: number;
  /** Index 0 = air. */
  palette: string[];
  /** Packed x + z*sx + y*sx*sz palette indices. */
  voxels: number[];
  /**
   * Optional per-voxel emission 0..255 (same length/layout as `voxels`).
   * 0 = none; higher = brighter glow on that cell.
   */
  emissive?: number[];
  /**
   * Optional per-voxel shininess / metal 0..255 (same layout as `voxels`).
   * 0 = matte; high = wet / metal with env reflections in Three.
   */
  shine?: number[];
  /**
   * Optional per-voxel transparency 0..255 (same layout as `voxels`).
   * 0 = opaque; high = see-through; also skips shadow cast / face occlusion
   * so PointLights pass through more as the value rises.
   */
  transparency?: number[];
  /**
   * Optional per-voxel light transmittance 0..255 (same layout as `voxels`).
   * 0 = blocks light (hard umbra); higher = dimmer, softer host-lamp shadow
   * (grey penumbra that widens with distance); 255 = still looks solid, but
   * casts no sun / PointLight shadows.
   */
  transmittance?: number[];
  /**
   * Base surface kind for lamp catch / specular defaults
   * (shine voxels still override locally).
   */
  material?: EmberMaterialKind;
  /** Default direct-light response inherited by every placement. */
  directLightScale?: number;
  /**
   * Opt-in: emissive voxels spawn a real PointLight (Three play + map preview).
   * Same idea as tile/sprite `emissiveCastsLight`.
   */
  emissiveCastsLight?: boolean;
  /** Soft local light reach in tiles (default ~0.85, max = MAP_LIGHT_RANGE_MAX). */
  emissiveLightRange?: number;
  /** PointLight cube shadows (budgeted globally). */
  emissiveLightShadows?: boolean;
  /**
   * Soften cartoon lamp discs, especially the outer cutoff
   * (where the light pool ends).
   */
  emissiveLightSoftRings?: boolean;
  /**
   * Distance-scaled penumbra on this lamp's shadows (просвет-style),
   * even when transmittance leak is 0.
   */
  emissiveLightSoftShadows?: boolean;
  /**
   * Light pivot in voxel-grid coords (cell indices).
   * Omitted → weighted centroid of emissive cells.
   */
  emissiveLightOrigin?: { x: number; y: number; z: number };
  /**
   * Extra shift in voxel units from origin/auto centroid (can be fractional).
   * Applied after `emissiveLightOrigin` / auto center.
   */
  emissiveLightOffset?: { x: number; y: number; z: number };
  /**
   * Extra PointLights beyond the primary (legacy origin/offset) lamp.
   * Empty / omitted → one light from the model-level fields.
   */
  emissiveLights?: EmberVoxelEmissiveLamp[];
  /** 0..1 glow strength for the PointLight (default ~0.75). */
  emissiveStrength?: number;
  /**
   * Join torch-style disc breathe (radius grows/shrinks like map lanterns).
   * Combines with `emissiveLanternFlicker`.
   */
  emissiveTorchFlicker?: boolean;
  /**
   * Broken-bulb cutouts: mostly on, brief millisecond blackouts.
   * Combines with `emissiveTorchFlicker`.
   */
  emissiveLanternFlicker?: boolean;
  /**
   * When true with an interior PointLight, frame voxels do not cast shadows
   * (avoids sealing light inside a closed cage). Open lanterns omit this.
   */
  emissiveSuppressHostShadow?: boolean;
  /**
   * Collision / walkability for map voxel props and zone-placed voxel models.
   * `true` or omitted = solid (block / stand / auto-step like table & stairs).
   * `false` = non-physical (walk-through), e.g. interactable chests.
   */
  physical?: boolean;
  /** Unified collider; `physical` remains a legacy fallback. */
  collider?: EmberColliderModifier;
};

/** Voxel model stamped on the map (anchor = SW ground tile). */
export type EmberVoxelPlacement = {
  id: string;
  modelId: string;
  /** Per-instance add/remove overrides for optional asset components. */
  componentStates?: Partial<Record<"collider" | "voxel-light", boolean>>;
  x: number;
  y: number;
  elev?: number;
  /** Per-instance Transform scale; omitted means 1×1×1. */
  scale?: EmberTransformScale;
  /** Per-instance collider overrides merged over the model collider. */
  collider?: EmberColliderModifier;
  /**
   * Yaw in 90° steps: 0 / 1 / 2 / 3 → 0° / 90° / 180° / 270°.
   * Rotation is around the footprint center.
   */
  rot?: number;
  /**
   * Scale for MeshToon direct lamp light (0.05..1.5).
   * Lower = less “light catch” under lanterns. Default ~0.42 when omitted.
   */
  directLightScale?: number;
  /** Override model: spawn PointLight from emissive voxels. */
  emissiveCastsLight?: boolean;
  /** Override model light reach in tiles. */
  emissiveLightRange?: number;
  /** Override model: PointLight casts shadows. */
  emissiveLightShadows?: boolean;
  /** Override model: PointLight strength 0..MAX. */
  emissiveStrength?: number;
  /** Override model: torch-style disc breathe. */
  emissiveTorchFlicker?: boolean;
  /** Override model: broken-bulb intensity cutouts. */
  emissiveLanternFlicker?: boolean;
  /**
   * Override model: frame/pole do not cast shadows
   * (avoids sealing / hard rim umbras from an interior light).
   */
  emissiveSuppressHostShadow?: boolean;
  /** Instance gameplay interactivity (door / talk / quest marker / shop stub). */
  interactivity?: EmberInteractivityModifier;
};

export type EmberVoxelsFile = {
  models: EmberVoxelModel[];
  /** Voxel editor scenes (multi-object). Omitted in older packs. */
  scenes?: EmberVoxelScene[];
};

/**
 * Optional MagicaVoxel mesh beside the prefab (`voxels/models/<id>.vox`).
 * Shape + palette live there; collider/light stay on `model`.
 */
export type EmberVoxelMeshRef = {
  kind: "vox";
  file: string;
};

/**
 * One Unity-like voxel prefab on disk (`voxels/models/<id>.json`).
 * `model` holds mesh + component defaults; `scene` is the editor workspace
 * when the prefab has children / joints / clips.
 */
export type EmberVoxelAssetFile = {
  id: string;
  nameRu?: string;
  tags?: string[];
  mesh?: EmberVoxelMeshRef;
  model: EmberVoxelModel;
  scene?: EmberVoxelScene;
};

/**
 * Object inside a voxel editor scene (Blender-like Object → Mesh).
 * Transform is in voxel units relative to the scene origin.
 */
export type EmberVoxelSceneObject = {
  id: string;
  nameRu?: string;
  modelId: string;
  offset: { x: number; y: number; z: number };
  /** Yaw in 90° steps 0..3. */
  rot?: number;
  visible?: boolean;
};

export type EmberVoxelJointAxis = "x" | "y" | "z";

export type EmberVoxelSceneJoint = {
  id: string;
  nameRu?: string;
  parentObjectId: string;
  childObjectId: string;
  /** Pivot on parent in that object's local voxel coords. */
  parentPivot: { x: number; y: number; z: number };
  /** Pivot on child in that object's local voxel coords. */
  childPivot: { x: number; y: number; z: number };
  axis: EmberVoxelJointAxis;
};

export type EmberVoxelAnimKey = {
  /** Normalized time 0..1. */
  t: number;
  angleDeg: number;
};

export type EmberVoxelAnimTrack = {
  jointId: string;
  keys: EmberVoxelAnimKey[];
};

export type EmberVoxelAnimClip = {
  id: string;
  nameRu?: string;
  durationSec: number;
  tracks: EmberVoxelAnimTrack[];
};

export const EMBER_VOXEL_CHARACTER_TEMPLATES = [
  "chibi_32",
  "chibi_25d",
] as const;
export type EmberVoxelCharacterTemplate =
  (typeof EMBER_VOXEL_CHARACTER_TEMPLATES)[number];

/** Visual language on top of a chibi skeleton. Default / omitted = block chibi. */
export const EMBER_CHARACTER_ART_STYLES = ["chibi", "slasher"] as const;
export type EmberCharacterArtStyle =
  (typeof EMBER_CHARACTER_ART_STYLES)[number];

export const EMBER_CHIBI32_SLOTS = [
  "pelvis",
  "torso",
  "head",
  "arm_l",
  "arm_r",
  "leg_l",
  "leg_r",
  "hair",
  "twin_l",
  "twin_r",
  "ears",
] as const;
export type EmberChibi32Slot = (typeof EMBER_CHIBI32_SLOTS)[number];

export const EMBER_CHIBI32_SOCKETS = ["hand_r", "hat", "pet"] as const;
export type EmberChibi32Socket = (typeof EMBER_CHIBI32_SOCKETS)[number];

export const EMBER_CHARACTER_CLIP_ROLES = ["idle", "walk", "attack"] as const;
export type EmberCharacterClipRole = (typeof EMBER_CHARACTER_CLIP_ROLES)[number];

export const EMBER_CHARACTER_FACING = ["volume", "card4"] as const;
export type EmberCharacterFacing = (typeof EMBER_CHARACTER_FACING)[number];

export const EMBER_CHARACTER_CARD_VIEWS = [
  "front",
  "back",
  "side_l",
  "side_r",
] as const;
export type EmberCharacterCardView =
  (typeof EMBER_CHARACTER_CARD_VIEWS)[number];

export const EMBER_SPRITE_CARD_EXTRA_VIEWS = [
  "back",
  "side_l",
  "side_r",
] as const;
export type EmberSpriteCardExtraView =
  (typeof EMBER_SPRITE_CARD_EXTRA_VIEWS)[number];

/** One paintable color stack entry. Composited into `pixels` for play. */
export type EmberSpriteArtLayer = {
  id: string;
  nameRu?: string;
  /** Default true. */
  visible?: boolean;
  /** 0..1, default 1. */
  opacity?: number;
  /** Photoshop-like color compositing. Default `normal`. */
  blendMode?: EmberSpriteArtLayerBlendMode;
  /** Prevent pixel edits while still allowing layer properties to change. */
  locked?: boolean;
  /** Preserve the current per-pixel alpha while painting. */
  alphaLocked?: boolean;
  /** Same W×H as the sprite canvas. */
  pixels: string[];
};

export type EmberSpriteArtLayerBlendMode =
  | "normal"
  | "multiply"
  | "screen"
  | "add";

/** Extra drawing for one sprite card face. Same W×H as `pixels`. */
export type EmberSpriteCardFace = {
  pixels: string[];
  emissivePixels?: string[];
  shinePixels?: string[];
  artLayers?: EmberSpriteArtLayer[];
};

/**
 * One playback cel. `pixels` is the front composite; extra faces live on `views`.
 * Not a voxel `EmberVoxelAnimClip` (no joints / tracks).
 */
export type EmberSpriteAnimFrame = {
  id: string;
  /** Hold time in ms. Default 120. */
  durationMs?: number;
  pixels: string[];
  emissivePixels?: string[];
  shinePixels?: string[];
  artLayers?: EmberSpriteArtLayer[];
  views?: Partial<Record<EmberSpriteCardExtraView, EmberSpriteCardFace>>;
};

/**
 * Character profile on a voxel scene. Visual mesh can be taller than
 * the gameplay capsule (hair / ears stay outside collision).
 */
export type EmberVoxelCharacterDef = {
  templateId: EmberVoxelCharacterTemplate;
  /**
   * Paint language for the starter mesh. Same slots / capsule as the template.
   * Omit = classic block chibi. `slasher` = Dungeon Slasher roguelike
   * (docs/EMBER_CHARACTER_STYLE.md).
   */
  style?: EmberCharacterArtStyle;
  /** Capsule height in voxels, typically to the shoulders. */
  bodyHeightVoxels: number;
  bodyRadiusVoxels: number;
  /**
   * `volume` — one 3D mesh, yaw in world.
   * `card4` — Octopath swap: 4 drawings + billboard in play.
   */
  facing?: EmberCharacterFacing;
  /** Slot name → scene object id (the front / volume set). */
  slots: Partial<Record<EmberChibi32Slot, string>>;
  /**
   * Per-view **model** ids for `card4`. Omitted slots keep the object's model.
   * Drawings are authored on the same +Z sprite plane as the front.
   */
  views?: Partial<
    Record<
      EmberCharacterCardView,
      Partial<Record<EmberChibi32Slot, string>>
    >
  >;
  sockets?: Partial<Record<EmberChibi32Socket, string>>;
  clips?: Partial<Record<EmberCharacterClipRole, string>>;
};

/**
 * Voxel editor scene: several objects sharing one sculpt viewport
 * (dropdown «Сцена»). Not the narrative `EmberScene`.
 */
export type EmberVoxelScene = {
  id: string;
  nameRu?: string;
  objects: EmberVoxelSceneObject[];
  joints?: EmberVoxelSceneJoint[];
  animations?: EmberVoxelAnimClip[];
  /** Character editor profile. Omitted on ordinary props / chests. */
  role?: "character";
  character?: EmberVoxelCharacterDef;
};

/** Shared lamp look (no position) — clipboard + pack presets. */
export type EmberLampParams = {
  lampColor: string;
  lampFaceColor: string;
  lampRange: number;
  lampDiscCore: number;
  lampDiscMid: number;
  lampHeight: number;
  lampShowCore: boolean;
  lampStrength0: number;
  lampStrengthFalloff: number;
  /** Join global torch flicker (default true). */
  lampTorchFlicker: boolean;
};

/** Named reusable lamp look stored in the pack (`lights/registry.json`). */
export type EmberLightPreset = EmberLampParams & {
  id: string;
  nameRu: string;
};

export type EmberLightsFile = {
  presets: EmberLightPreset[];
};

/**
 * Named reusable map look: night fill, sun, bloom, grade, atmosphere.
 * Stored in the pack (`looks/registry.json`). Lamp instances stay separate.
 */
export type EmberLookPreset = {
  id: string;
  nameRu: string;
  ambientColor: string;
  ambientAlpha: number;
  fillIntensity: number;
  sunAzimuth: number;
  sunElevation: number;
  sunColor: string;
  sunIntensity: number;
  bloomStrength: number;
  bloomThreshold: number;
  bloomRadius: number;
  grade: Required<EmberMapGrade>;
  atmosphere: Required<EmberMapAtmosphere>;
};

export type EmberLooksFile = {
  presets: EmberLookPreset[];
};

/**
 * User-saved camera rig. Stored in `cameras/registry.json`.
 * Omit `mapId` = pack-global; set = only listed on that map.
 */
export type EmberUserCameraPreset = EmberMapCamera & {
  id: string;
  nameRu: string;
  mapId?: string;
};

export type EmberCamerasFile = {
  presets: EmberUserCameraPreset[];
};

export type EmberSceneLocalTransform = {
  position: { x: number; y: number; z: number };
  rotationQuarterTurns: number;
};

export type EmberSceneGroup = {
  id: string;
  name: string;
  /** Optional parent group. A scene object itself can belong to only one group. */
  parentGroupId?: string;
  /** Stable unified world-object keys, for example `voxel:crate-1`. */
  objectKeys: string[];
  /** World-space pivot used by group transforms and editor gizmos. */
  pivot: { x: number; y: number; z: number };
  /** World-space group rotation. Child local transforms are relative to it. */
  rotationQuarterTurns?: number;
  /** Direct object keys and `group:<id>` keys relative to this Parent. */
  localTransforms?: Record<string, EmberSceneLocalTransform>;
};

export type EmberSceneHierarchy = {
  version: 1;
  groups: EmberSceneGroup[];
};

/** Axis-aligned building interior used by play roof/wall cutaway. Not a zone. */
export type EmberInteriorVolume = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
};

export type EmberMap = {
  id: string;
  nameRu?: string;
  tileSize: number;
  width: number;
  height: number;
  tilesetId: string;
  /**
   * Play systems for this map. Omit = `"arena"` (horde, F4, few lamps).
   * `"explore"` is village/JRPG: no waves, street cubes, window fill, few NPCs.
   */
  playProfile?: EmberMapPlayProfile;
  /**
   * Automatically trigger projectile/nova weapons when their cooldown expires.
   * Omit = enabled for arena and disabled for explore; LMB remains manual attack.
   */
  autoAttack?: boolean;
  /** Version 2 uses independent block volumes and body/head clearance. */
  worldPhysicsVersion?: 2;
  /**
   * Unit contract for the `height` layer. Missing on legacy maps whose
   * values were wall stories; all newly saved maps use literal voxels.
   */
  terrainHeightUnit?: "voxels";
  layers: EmberTileLayer[];
  regions: EmberMapRegion[];
  /**
   * Play / Explore·Q perspective rig. Omit = iso JRPG (FOV 40, polar 0.95).
   * Not the `camera_bound` region.
   */
  camera?: EmberMapCamera;
  /** Global ambient + default lamp look for this map. */
  light?: EmberMapLight;
  /** Optional per-cell lantern overrides / free-standing lights. */
  lights?: EmberLightSource[];
  /** Free-size pixel sprites placed on tiles. */
  sprites?: EmberSpritePlacement[];
  /** Sparse per-block overrides; absent cells inherit their tileset asset. */
  tileModifiers?: EmberTileInstanceModifier[];
  /**
   * Authored building interiors for play cutaway (hide roof + camera-facing walls).
   * If omitted, play infers rooms from roof tiles on `ground_z2+`.
   * Not a zone/region — do not use the zone editor for these.
   */
  interiorVolumes?: EmberInteriorVolume[];
  /** Sculpted voxel props placed on tiles. */
    voxelProps?: EmberVoxelPlacement[];
    /** Persistent editor/runtime scene graph. Missing means a flat legacy map. */
    sceneHierarchy?: EmberSceneHierarchy;
  };

/** Ramp climbs toward this direction (low → high). */
export type RampDir = "n" | "e" | "s" | "w";

/** Named pixel-art variant for a tileset tile (tile editor presets). */
export type EmberTilePreset = {
  id: string;
  name: string;
  pixels: string[];
  color: string;
  /** Which face this variant belongs to. Omitted / unknown → top (legacy). */
  face?: "top" | "wall";
};

/** Surface material — procedural look + lantern light response. */
export type EmberMaterialKind =
  | "stone"
  | "wood"
  | "path"
  | "grass"
  | "metal"
  | "cloth";

/** Movement modifier for walkable semantic tiles. */
export type EmberTileSlow =
  | boolean
  | {
      /** Movement multiplier while standing on the tile; default = 0.7. */
      multiplier?: number;
    };

/** Tile stain semantics. `kind: "filth"` maps to the existing filth slow status. */
export type EmberTileStain =
  | boolean
  | {
      kind?: "filth";
      /** Status duration when stepped on; default = 2500ms. */
      durationMs?: number;
    };

/** Repeating damage while the player stands on the tile. */
export type EmberTileHazard =
  | boolean
  | {
      damage?: number;
      stripDamage?: number;
      /** Minimum delay between hits from this tile; default = 800ms. */
      intervalMs?: number;
    };

/** Authoring metadata for future tile-based teleport runtime. */
export type EmberTilePortal =
  | boolean
  | {
      targetMapId?: string;
      targetRegionId?: string;
      targetX?: number;
      targetY?: number;
      cooldownMs?: number;
    };

/** Authoring metadata for future tile-based script/event triggers. */
export type EmberTileTrigger =
  | boolean
  | {
      eventId?: string;
      scriptId?: string;
      once?: boolean;
      note?: string;
    };

export type EmberTilesetTile = {
  id: number;
  name: string;
  color: string;
  /** Explicit optional components on this reusable library asset. */
  componentStates?: Partial<Record<"collider", boolean>>;
  solid?: boolean;
  /** Unified collider; `solid` remains a legacy wall/obstacle fallback. */
  collider?: EmberColliderModifier;
  /** Per-tile movement slow; omitted / false = normal speed. */
  slow?: EmberTileSlow;
  /** Surface stain semantics; currently `filth` feeds the existing filth status. */
  stain?: EmberTileStain;
  /** Repeating contact damage; omitted / false = harmless. */
  hazard?: EmberTileHazard;
  /** Portal authoring data; runtime teleport is still region-based. */
  portal?: EmberTilePortal;
  /** Trigger authoring data; runtime scripts/events are still region-based. */
  trigger?: EmberTileTrigger;
  /** Candle / flame light — paints glow on self + neighbors. */
  glow?: boolean;
  /**
   * Surface kind: procedural art + how lantern light is received
   * (stone dull / metal shiny / cloth absorbs, …).
   */
  material?: EmberMaterialKind;
  /**
   * Opt-in alpha blending for tile faces in Three runtime + preview.
   * `opacity < 1` also implies transparency.
   */
  transparent?: boolean;
  /** Surface opacity 0..1; omitted = fully opaque. */
  opacity?: number;
  /**
   * Water only: reflection snap density (same idea as voxel light/shadow snap —
   * no smooth interpolation across the surface).
   * `1` = one step per voxel/pixel; `8` = finer subdivisions. Allowed: 1|2|4|8.
   */
  waterReflectMult?: 1 | 2 | 4 | 8;
  /**
   * Water only: still-water glint stripes axis.
   * `x` = vertical bands (vary by world X); `z` = horizontal bands (vary by world Z).
   */
  waterStripeAxis?: "x" | "z";
  /**
   * Water only: overall glint / sparkle brightness multiplier.
   * `1` = default; `0` = off; up to `2` = hot. Clamped 0…2.
   */
  waterGlintBright?: number;
  /**
   * Water only: planar-reflection ripple strength in texels (0 = flat, 1 = default, up to 3).
   */
  waterWarpStrength?: number;
  /**
   * Water only: planar-reflection ripple speed multiplier (0 = frozen, 1 = default, up to 3).
   */
  waterWarpSpeed?: number;
  /** Walkable slope: cell at elev E, climbs toward dir onto E+1. */
  ramp?: RampDir;
  /** Walkable stairs: same rules as ramp, distinct art. */
  stair?: RampDir;
  /** Default wall height when painted as wall (1 = one story). */
  defaultHeight?: number;
  /**
   * Optional pixel art (row-major), length = tileset.tileSize².
   * Hex colors; empty / transparent use "".
   */
  pixels?: string[];
  /**
   * Optional wall/cliff face pixel art (row-major), length = tileSize².
   * Stretched onto extruded / elevation side faces.
   */
  wallPixels?: string[];
  /** Emissive top-face pixels (same length as `pixels`). */
  emissivePixels?: string[];
  /** Emissive wall-face pixels (same length as `wallPixels`). */
  emissiveWallPixels?: string[];
  /**
   * When false, emissive ink is kept but not rendered / lit in play & preview.
   * Omit / true = glowing pixels active.
   */
  emissiveEnabled?: boolean;
  /**
   * Shine / wet / metal top-face pixels (same length as `pixels`).
   * Hex luminance → reflectivity; "" = matte.
   */
  shinePixels?: string[];
  /** Shine wall-face pixels (same length as `wallPixels`). */
  shineWallPixels?: string[];
  emissiveAnim?: EmberEmissiveAnim;
  emissiveStrength?: number;
  /**
   * Soft bloom / aura tint (`#rrggbb`). Ink stays on emissive pixels;
   * unset = bloom follows ink color.
   */
  emissiveBloomColor?: string;
  /**
   * When true, dense emissive ink casts a weak local PointLight (~0.5–1 tile).
   */
  emissiveCastsLight?: boolean;
  /** Soft-light reach in tiles (default ~0.85, max = MAP_LIGHT_RANGE_MAX). */
  emissiveLightRange?: number;
  /** When true (and casts light), the weak PointLight casts cube shadows. */
  emissiveLightShadows?: boolean;
  /** Pulse period in seconds (full sine cycle). */
  emissiveAnimPeriod?: number;
  /** Flicker: dark-wait lower bound between flashes (seconds). */
  emissiveAnimPeriodMin?: number;
  /** Flicker: dark-wait upper bound between flashes (seconds). */
  emissiveAnimPeriodMax?: number;
  emissiveTriggerRadius?: number;
  emissiveTriggerWhen?: EmberEmissiveTriggerWhen;
  emissiveTriggerEventId?: string;
  /** Saved pixel variants; active art remains in `pixels`. */
  presets?: EmberTilePreset[];
};

export type EmberTileset = {
  id: string;
  tileSize: number;
  columns: number;
  tileCount: number;
  procedural?: boolean;
  imagePath?: string;
  tiles: EmberTilesetTile[];
};

export type WeaponKind =
  | "orbit"
  | "projectile"
  | "nova"
  | "passive"
  | "instant_heal";

export type EmberWeaponDef = {
  id: string;
  nameRu: string;
  rarity: EmberRarity;
  kind: WeaponKind;
  damage: number;
  cooldownMs: number;
  count: number;
  speed: number;
  range: number;
  heal?: number;
  passive?: {
    filthResist?: number;
    moveSpeedMul?: number;
  };
  levelBonus?: Record<string, number>;
};

export type EmberEnemyDef = {
  id: string;
  nameRu: string;
  hp: number;
  speed: number;
  damage: number;
  stripDamage: number;
  xp: number;
  color: string;
  radius: number;
  filthOnHit?: boolean;
  filthDurationMs?: number;
  ranged?: boolean;
  range?: number;
  projectileSpeed?: number;
  boss?: boolean;
  /** Pixel sprite from pack.sprites (fallback: circle). */
  spriteId?: string;
};

export type EmberStage = {
  id: string;
  nameRu: string;
  playerMistressId: MistressIdRef;
  mapId: string;
  spawnTableId: string;
  weaponPoolId: string;
  chestPoolId: string;
  starterWeaponId: string;
  durationSec: number;
  bossAtSec: number;
  playerHp: number;
  moveSpeed: number;
  /** Unified player body used by map, voxel and sprite collision. */
  playerBody?: EmberBodyModifier;
  cindersClear: number;
  cindersFail: number;
  onClearEventId?: string;
  /** Event to fire when the player dies / stage fails. */
  onFailEventId?: string;
  xpGemValue: number;
  baseXpToLevel: number;
};

export type EmberSpawnEntry = {
  atSec: number;
  untilSec: number;
  enemyId: string;
  count: number;
  intervalSec: number;
  regionGroup: string;
  once?: boolean;
};

export type EmberSpawnTable = {
  id: string;
  entries: EmberSpawnEntry[];
};

export type EmberPoolEntry = {
  itemId: string;
  weight: number;
  rarity: EmberRarity;
};

export type EmberPool = {
  id: string;
  entries: EmberPoolEntry[];
};

export type PortraitSide = "left" | "right";

/**
 * Character sprite on the visual-novel stage.
 * `x`/`y` are percent of the stage (sprite anchored at bottom-center).
 */
export type SceneActor = {
  id: string;
  /** Portrait registry key (mistress id). */
  speaker: string;
  portraitKey: string;
  /** Horizontal center, 0–100. */
  x: number;
  /**
   * Vertical anchor from top in % of stage height (higher = lower on screen).
   * Values > 100 sink the feet below the frame edge.
   */
  y: number;
  /** Visual scale, 1 = default. */
  scale?: number;
  /** Rotation in degrees. */
  rotate?: number;
  flipX?: boolean;
  /** Paint order (higher on top). */
  z?: number;
  /**
   * When true, editor drag only moves X (Y stays fixed).
   * Use with floor Y for “slide along the bottom”.
   */
  lockY?: boolean;
  /**
   * Preferred floor line for «К низу» (same units as `y`).
   * Can be > 100 to park partly under the stage.
   */
  floorY?: number;
};

export type SceneStep =
  | {
      id: string;
      type: "dialogue";
      speaker: string;
      portraitKey: string;
      /** @deprecated Prefer `actors` — kept for older scenes. */
      portraitSide?: PortraitSide;
      /** Display name in the text box (falls back to speaker). */
      nameRu?: string;
      textRu: string;
      /** Background art id from the arts library. */
      bgArtId?: string;
      /** Characters on stage; if omitted, derived from speaker/portraitSide. */
      actors?: SceneActor[];
      next?: string;
    }
  | {
      id: string;
      type: "splash";
      artId: string;
      captionRu?: string;
      next?: string;
    }
  | {
      id: string;
      type: "choice";
      promptRu: string;
      bgArtId?: string;
      actors?: SceneActor[];
      options: Array<{
        id: string;
        labelRu: string;
        next: string;
        setFlags?: Record<string, boolean | string | number>;
      }>;
    }
  | {
      id: string;
      type: "set_flag";
      flag: string;
      value: boolean | string | number;
      next?: string;
    }
  | {
      id: string;
      type: "grant_cinders";
      amount: number;
      next?: string;
    }
  | {
      id: string;
      type: "end";
      nextEventId?: string;
    };

/** Canvas positions for the scene step graph editor (ignored at runtime). */
export type SceneEditorLayout = Record<string, { x: number; y: number }>;

export const EMBER_DIALOGUE_USES = [
  "cutscene",
  "talk",
  "shop_intro",
] as const;

export type EmberDialogueUse = (typeof EMBER_DIALOGUE_USES)[number];

export type EmberScene = {
  id: string;
  nameRu: string;
  startStepId: string;
  /**
   * How UI/runtime presents this graph. Omit = `cutscene`.
   * `talk` / `shop_intro` stay light (HSR overlay, no VN box).
   */
  use?: EmberDialogueUse;
  /** Fallback background when a step has no bgArtId. */
  defaultBgArtId?: string;
  steps: SceneStep[];
  /** Block positions on the step graph canvas. */
  editorLayout?: SceneEditorLayout;
};

export const EMBER_SCRIPT_STEP_KINDS = [
  "talk",
  "change_map",
  "open_shop",
  "give_item",
  "set_flag",
  "wait",
  "run_script",
] as const;

export type EmberScriptStepKind = (typeof EMBER_SCRIPT_STEP_KINDS)[number];

export type EmberFlagValue = boolean | string | number;

export type EmberScriptStep =
  | { type: "talk"; dialogueId: string }
  | {
      type: "change_map";
      targetMapId: string;
      targetRegionId?: string;
    }
  | { type: "open_shop"; shopId: string }
  | { type: "give_item"; itemId: string; count?: number }
  | { type: "set_flag"; flag: string; value: EmberFlagValue }
  | { type: "wait"; sec: number }
  | { type: "run_script"; scriptId: string };

export type EmberActionScript = {
  id: string;
  nameRu: string;
  steps: EmberScriptStep[];
};

export type EmberEventTrigger =
  | "on_stage_clear"
  | "on_stage_fail"
  | "on_region_enter"
  | "manual";

export type EmberEvent = {
  id: string;
  nameRu: string;
  trigger: EmberEventTrigger;
  /** Stage for clear/fail triggers. */
  stageId?: string;
  /** Map containing the trigger region. */
  mapId?: string;
  /** Region id (kind `trigger`) for on_region_enter. */
  regionId?: string;
  sceneId: string;
};

export type EmberArtKind =
  | "splash"
  | "cg"
  | "portrait"
  | "pixel"
  | "animation"
  | "other";

export type EmberArt = {
  id: string;
  path: string;
  mistressId?: MistressIdRef;
  nsfw?: boolean;
  captionRu?: string;
  /** Library category for the asset browser. */
  kind?: EmberArtKind;
  tags?: string[];
  notesRu?: string;
};

export type EmberPortraitRegistry = {
  mistressId: MistressIdRef;
  expressions: Record<string, { labelRu: string; path: string }>;
};

/** Explore/JRPG + arena loot table (not the arena auto-attack `EmberWeaponDef`). */
export const EMBER_ITEM_KINDS = [
  "weapon_arena",
  "weapon_jrpg",
  "armor",
  "accessory",
  "consumable",
  "material",
  "key",
] as const;

export type EmberItemKind = (typeof EMBER_ITEM_KINDS)[number];

export const EMBER_ITEM_SLOTS = [
  "none",
  "weapon",
  "head",
  "body",
  "accessory",
] as const;

export type EmberItemSlot = (typeof EMBER_ITEM_SLOTS)[number];

/** Catalog rarity — wider than arena pool `EmberRarity`. */
export const EMBER_ITEM_RARITIES = [
  "common",
  "uncommon",
  "rare",
  "epic",
] as const;

export type EmberItemRarity = (typeof EMBER_ITEM_RARITIES)[number];

export const EMBER_ITEM_USE_IN = ["arena", "explore", "both"] as const;

export type EmberItemUseIn = (typeof EMBER_ITEM_USE_IN)[number];

/** Shared 16×16 (or 32×32) pixel icon. Compact `rows`+`palette` or flat `pixels`. */
export type EmberItemIcon = {
  id: string;
  nameRu?: string;
  size: number;
  palette?: Record<string, string>;
  rows?: string[];
  /** Row-major hex colors; "" = transparent. length === size*size after normalize. */
  pixels: string[];
};

export type EmberItemDef = {
  id: string;
  name?: string;
  nameRu: string;
  kind: EmberItemKind;
  slot: EmberItemSlot;
  rarity: EmberItemRarity;
  stackMax: number;
  /** Arena auto-weapons vs JRPG/explore kit — do not collapse into one blob. */
  useIn: EmberItemUseIn;
  atk?: number;
  def?: number;
  hpRestore?: number;
  tags?: string[];
  iconId?: string;
  /** Per-item pixel override (same length as icon size²). */
  iconPixels?: string[];
  notesRu?: string;
  /** Price a shop pays when buying this item from the player. */
  sellPrice?: number;
  /** If true, shops refuse to buy this item (typical for keys). */
  unsellable?: boolean;
};

export type EmberItemsFile = {
  icons?: EmberItemIcon[];
  items?: EmberItemDef[];
};

export type EmberShopListing = {
  itemId: string;
  buyPrice: number;
  sellPrice?: number;
  /** Omit = unlimited. Session remaining is tracked separately. */
  stock?: number;
};

export type EmberShopDef = {
  id: string;
  nameRu: string;
  listings: EmberShopListing[];
};

export type EmberShopsFile = {
  shops?: EmberShopDef[];
};

export type EmberPackMeta = {
  id: string;
  version: number;
  nameRu: string;
  defaultStageId: string;
  mistressDefaults?: Partial<
    Record<MistressIdRef, { stageId: string }>
  >;
};

export type EmberSpritesFile = {
  paletteFavorites?: string[];
  sprites: EmberPixelSprite[];
};

export type EmberPack = {
  meta: EmberPackMeta;
  maps: Record<string, EmberMap>;
  tilesets: Record<string, EmberTileset>;
  stages: Record<string, EmberStage>;
  spawns: Record<string, EmberSpawnTable>;
  pools: Record<string, EmberPool>;
  weapons: Record<string, EmberWeaponDef>;
  /** Village / JRPG / arena item catalog (`content/ember/items/catalog.json`). */
  items: Record<string, EmberItemDef>;
  /** Shared pixel icons for catalog items. */
  itemIcons: Record<string, EmberItemIcon>;
  /** Explore shops (`content/ember/shops/catalog.json`). */
  shops: Record<string, EmberShopDef>;
  enemies: Record<string, EmberEnemyDef>;
  scenes: Record<string, EmberScene>;
  /** Ordered action lists (`content/ember/scripts/*.json`). */
  scripts: Record<string, EmberActionScript>;
  events: Record<string, EmberEvent>;
  arts: Record<string, EmberArt>;
  portraits: Record<string, EmberPortraitRegistry>;
  sprites: Record<string, EmberPixelSprite>;
  /** Sculpted voxel block models (size in map blocks, 16³ voxels each). */
  voxelModels: Record<string, EmberVoxelModel>;
  /**
   * Voxel editor scenes (multi-object workspaces).
   * Auto-filled from lone models when missing.
   */
  voxelScenes: Record<string, EmberVoxelScene>;
  /**
   * Runtime-only: voxel model id → prefab path (`voxels/models/<id>.json`).
   * Not serialized into pack.json.
   */
  voxelLibraryFiles?: Record<string, string>;
  /** Named lamp looks for the map library / light editor. */
  lightPresets: Record<string, EmberLightPreset>;
  /** Named atmosphere + fill looks for map settings. */
  lookPresets: Record<string, EmberLookPreset>;
  /** Named play/editor camera rigs (`cameras/registry.json`). */
  cameraPresets: Record<string, EmberUserCameraPreset>;
  /** User-added palette swatches (shared across tile/sprite editors). */
  paletteFavorites?: string[];
};

export type ValidationIssue = {
  level: "error" | "warn";
  path: string;
  message: string;
};
