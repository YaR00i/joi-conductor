/**
 * Three.js Ember play runtime: voxel map, orbit camera, point lights, bloom,
 * and a ported survivors loop (move / combat / loot / timer).
 */
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { EmberBridgeHandler } from "../bridge/events";
import {
  enemyBodyRadius,
  PLAYER_BODY_R,
  PLAYER_HURT_R,
} from "../combat/radii";
import { rollLootOptions } from "../content/pools";
import {
  normalizePixelSprite,
  resolveSpriteWorldOffsetVoxels,
  spriteHasVisual,
} from "../content/pixelSprite";
import type {
  EmberEnemyDef,
  EmberFlagValue,
  EmberMap,
  EmberMapRegion,
  EmberPack,
  EmberScriptStep,
  EmberStage,
  EmberTileset,
  EmberVoxelPlacement,
  EmberWeaponDef,
} from "../content/types";
import { compactInventory, grantItemCounts } from "../content/emberItem";
import {
  captureExploreSave,
  exploreSaveWorldPos,
  type EmberExploreAutosaveReason,
  type EmberExploreSaveState,
} from "../content/emberSave";
import {
  incomingPlayerDamage,
  outgoingPlayerDamage,
  playerCombatStats,
  type EmberCombatStats,
} from "../content/emberCombatStats";
import {
  compactEquipment,
  emptyEquipment,
  equipFailRu,
  equipItem as applyEquipItem,
  isEmberEquipSlot,
  listInventoryViews,
  type EmberEquipSlot,
  type EmberEquipment,
  unequipSlot as applyUnequipSlot,
  useInventoryItem,
} from "../content/emberEquipment";
import {
  dialogueUseOf,
  resolveScriptRef,
} from "../content/emberScript";
import {
  buyShopItem,
  seedShopRemaining,
  sellableFromInventory,
  sellShopItem,
  SHOP_WALLET_ITEM_ID,
  wouldFireForShop,
} from "../content/emberShop";
import {
  applyChestOpen,
  chestIsOpened,
  chestKey,
  chestToastText,
  stampOpenedChests,
  wouldFireForChest,
} from "../content/chestLoot";
import {
  boundTriggerFor,
  pickInteractHit,
  wouldFireForInteractivity,
  wouldFireForTriggerRegion,
  type InteractivityWouldFire,
} from "../content/interactivity";
import {
  MAP_CHANGE_COOLDOWN,
  mapChangeRegionAt,
  mapChangeRequestFromRegion,
  mapChangeRequestFromWouldFire,
  resolveMapChangeArrival,
  type MapChangeArrival,
  type MapChangeRequest,
} from "../content/mapChange";
import {
  beginMapFade,
  createMapFadeState,
  mapFadeBusy,
  stepMapFade,
  type MapFadeState,
} from "../content/mapFade";
import {
  resolveMapAutoAttack,
  resolveMapPlayProfile,
  stageUsesTimedClear,
} from "../content/playProfile";
import {
  resolveMapCamera,
  resolvePackMapCamera,
  type ResolvedEmberCamera,
} from "../content/emberCamera";
import type { EmberMapCamera } from "../content/types";
import {
  emissivePlacementSeed,
  emissiveSmoothstep,
  hasEmissiveInk,
  resolveEmissiveGlowStrength,
} from "../tile/emissivePaint";
import {
  elevNearlyEqual,
  ensureMapLayers,
  findRegions,
  groundTileAt,
  pointInRegion,
  randomWalkablePointInRegion,
  regionCenter,
  regionVolumeElev,
  resolveMapLight,
  stepTeleport,
  tileSurfaceElev,
  worldToTile,
} from "../tile/mapUtils";
import {
  buildCutawayHideSet,
  occupiedInteriorAt,
  playCutawayCacheKey,
} from "../tile/buildingInterior";
import { blockStoryHeight } from "../tile/extruded";
import { resolveChestModelPose } from "../voxel/chestPlacement";
import {
  buildVoxelModelMesh,
  disposeVoxelModelMesh,
} from "../voxel/voxelMesher";
import { applyVoxelPlacementTransform } from "../voxel/voxelPlacement";
import { VOXELS_PER_BLOCK } from "../voxel/constants";
import { voxelGridSize } from "../voxel/voxelModel";
import { advanceWorldFall } from "../world/worldPhysics";
import {
  buildVoxelSceneMesh,
  type VoxelSceneMesh,
} from "../voxel/voxelSceneMesh";
import {
  applySpritePlacementScale,
  applySpriteWorldPosition,
  createColorBillboard,
  createPixelBillboard,
  disposeYawBillboard,
  hexColorOr,
  updateYawBillboards,
} from "./billboards";
import { addQuestMarkerOverlays } from "./questMarkerOverlay";
import {
  accumulatePlayLookMovement,
  PLAY_CAMERA_YAW_SENSITIVITY,
  PLAY_LOOK_LOCK_UI_SELECTOR,
  PLAY_POINTER_LOCK_RELOCK_MS,
  isPlayMenuToggleKey,
  isPlayPointerLockTarget,
  playCameraPitchFromMovement,
  playCameraYawFromMovement,
  playCanvasCursor,
  playLookActive,
  playLookWantsPointerLock,
  playPointerDownShouldLock,
  requestPlayPointerLock,
  releasePlayCursorClip,
  syncPlayCursorClip,
  playLookTakeMove,
  playLookWarpSkipCount,
  warpPlayCursorIfNeeded,
  playBackgroundShouldPause,
} from "./playPointer";
import { emberWorldLoadProgress } from "./emberLoadProgress";
import { getEmberEnvMap } from "./envMap";
import { createMapAtmosphere, type MapAtmosphereHandle } from "./mapAtmosphere";
import { createPostFx, type EmberPostFx } from "./postFx";
import {
  applyMapLightBudget,
  lanternVisibleShare,
  playPointShadowCap,
  remainingEmissiveShadowSlots,
  resolveEmberRenderBudget,
  resolvePlayProfileBudget,
  type EmberPlayProfileBudget,
  type EmberRenderBudget,
} from "./renderBudget";
import {
  isTriggeredPlayerWeapon,
  shouldTriggerPlayerWeapon,
  type PlayerAttackTrigger,
} from "./playerAttackPolicy";
import {
  addThreeFillLights,
  addThreeLanternLights,
  sunDirectionFromAngles,
} from "./threeLighting";
import { addThreeEmissiveLocalLights } from "./emissiveLocalLights";
import { setEmberVoxelLightSnap, setEmberPointShadowAtlas } from "./voxelLightSnap";
import {
  hitsSolidVoxels,
  jumpLedgeVoxels,
  logicToThree,
  moveWithVoxels,
} from "./voxelCollision";
import {
  captureEmissiveLightRuntimeStates,
  collectEmissiveMaterials,
  restoreEmissiveLightRuntimeStates,
  tagEmissiveMaterial,
  tickEmissiveLights,
  tickEmissiveMaterials,
} from "./emissiveAnimTick";
import { tickTorchFlicker } from "./torchFlickerTick";
import {
  collectPlanarReflectMaterials,
  estimatePlanarFloorY,
} from "./planarReflectMaterial";
import {
  createChunkedVoxelTerrain,
  DEFAULT_TERRAIN_CHUNK_SIZE,
  terrainChunkDescriptors,
  terrainChunkKeySignature,
  terrainChunkWindow,
  type ChunkedVoxelTerrain,
  type TerrainChunkDescriptor,
  type TerrainStreamingStats,
} from "./voxelTerrainChunks";
import {
  applyInteriorCutawayTagged,
  collectCutawayTagged,
  tagCutawayObject,
  withCutawayCastersVisible,
} from "./interiorCutaway";
import { createEditorVoxelInstanceBatch } from "./editorVoxelInstancing";
import {
  closeInventoryOverlayFlags,
  closeShopOverlayFlags,
  playEscOverlayAction,
  playLookBlocked,
  playMovementFrozen,
  restorePlayOverlayFocus,
  type PlayOverlayFlags,
} from "./playOverlayState";
import {
  collectWaterMaterials,
  ensureWaterShoreAttributes,
  maxWaterReflectMult,
  tickWaterMaterials,
} from "./waterMaterial";
import {
  createWaterPlanarReflection,
  estimateWaterPlaneY,
  waterReflectionResolution,
  type WaterPlanarReflection,
} from "./waterPlanarReflection";
import {
  createInteractiveOutline,
  type InteractiveOutlineHandle,
} from "./interactiveOutline";
import {
  createLocalShadowDebugOverlay,
  type LocalShadowDebugOverlay,
} from "./localShadowDebugOverlay";
import { LocalPointShadowMapBank } from "./localPointShadowMapBank";
import {
  POINT_SHADOW_SHADER_SLOTS,
  layoutPointShadowAtlas,
} from "./pointShadowAtlas";
import {
  pointShadowDynamicCacheId,
} from "./pointShadowAtlasGpu";
import {
  bakePointShadowCacheTile,
  presentPointShadowAtlas as presentBoundPointShadowAtlas,
} from "./pointShadowAtlasPass";
import {
  createEmberFrameProfiler,
  type EmberFrameProfiler,
  type EmberProfilerExtras,
} from "./emberFrameProfiler";
import {
  DYNAMIC_LOCAL_SHADOW_MAX_LIGHTS,
  EMBER_DYNAMIC_ACTOR_LAYER,
  configureCachedSunShadow,
  dynamicLocalShadowLimitForCrowd,
  mapWideDirectionalHalf,
  directionalShadowLightDistance,
  fitDirectionalShadowToFocus,
  grantedPointShadowLights,
  invalidatePointLightShadows,
  pickDynamicPointShadowLightsFrom,
  pointLightActorRecookBlocked,
  setObjectRenderLayer,
} from "./dynamicShadowPolicy";
import {
  advanceRuntimeReflectionClock,
  runtimeReflectionIntervalMs,
  shouldRenderRuntimeReflection,
} from "./runtimeReflectionPolicy";
import {
  normalizeRuntimeStressTarget,
  runtimeAllowsEnemyDamage,
  runtimeAllowsStageSpawns,
  runtimeEnemySpawnLimit,
  runtimeStressTargetForShortcut,
  runtimeXpAfterPickup,
} from "./runtimeStressPolicy";
import {
  RuntimeBillboardBatches,
  type RuntimeBillboardInstance,
} from "./runtimeBillboardInstancing";
import { RuntimeActorSpatialIndex } from "./runtimeActorSpatialIndex";
import { RuntimeObjectPool } from "./runtimeObjectPool";
import {
  collectExploreNpcSpawns,
  stepExploreNpcWander,
  type ExploreNpcSpawn,
  type ExploreNpcWanderBounds,
} from "./exploreNpcs";
import {
  clampCoordToMap,
  enemyExactCollisionBudget,
  enemySimLod,
  noteMovementCadence,
  runsOnStaggeredTick,
} from "./enemyAiLod";
import {
  addCrowdSeparation,
  resolveCrowdSteering,
  type CrowdSeparationAccumulator,
} from "./enemyCrowdAvoidance";
import {
  buildEnemyCrowdOpenField,
  enemyCrowdMoveTouchesConnector,
  enemyCrowdOpenFieldAllowsDirectPath,
  enemyCrowdOpenFieldAllowsMove,
  enemyCrowdTryConnectorMove,
  type EnemyCrowdOpenField,
} from "./enemyCrowdOpenField";
import {
  ENEMY_FLOW_GUIDED,
  createEnemyCrowdFlowField,
  enemyCrowdFlowDirection,
  updateEnemyCrowdFlowField,
  type EnemyCrowdFlowField,
} from "./enemyCrowdFlowField";

export type EmberThreeWorldOpts = {
  parent: HTMLElement;
  pack: EmberPack;
  stageId: string;
  onBridge: EmberBridgeHandler;
  shortMode?: boolean;
  width?: number;
  height?: number;
  terrainStreaming?: {
    enabled?: boolean;
    chunkSize?: number;
    loadRadiusChunks?: number;
    unloadRadiusChunks?: number;
  };
  exploreSave?: EmberExploreSaveState | null;
};

const STRIP_COLORS = ["#e8a878", "#e09070", "#d07090", "#c050a0"];

type WeaponSlot = { def: EmberWeaponDef; level: number; cooldown: number };

const CHEST_INTERACT_R = 14;
const ENEMY_AI_STEP = 1 / 30;
const ENEMY_AI_MAX_STEPS = 3;

function countSetBits(value: number): number {
  let bits = value >>> 0;
  let count = 0;
  while (bits !== 0) {
    bits &= bits - 1;
    count += 1;
  }
  return count;
}

type FrozenShadow = {
  shadow: THREE.LightShadow<THREE.Camera>;
  autoUpdate: boolean;
  needsUpdate: boolean;
};

function samePointLights(
  a: readonly THREE.PointLight[],
  b: readonly THREE.PointLight[],
): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function createUnshadowedEffectBillboard(
  color: string,
  size: number,
): THREE.Mesh {
  const mesh = createColorBillboard(color, size);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.customDepthMaterial?.dispose();
  mesh.customDistanceMaterial?.dispose();
  mesh.customDepthMaterial = undefined;
  mesh.customDistanceMaterial = undefined;
  return mesh;
}

type Actor = {
  mesh: THREE.Object3D;
  enemyBillboard?: RuntimeBillboardInstance;
  effectBillboard?: RuntimeBillboardInstance;
  lx: number;
  ly: number;
  elev: number;
  radius: number;
  kind: "player" | "enemy" | "npc" | "bullet" | "ebullet" | "gem" | "chest" | "orbit";
  hp?: number;
  maxHp?: number;
  def?: EmberEnemyDef;
  touchCd?: number;
  vx?: number;
  vy?: number;
  dmg?: number;
  life?: number;
  xp?: number;
  regionId?: string;
  filth?: boolean;
  filthMs?: number;
  strip?: number;
  uid?: number;
  dead?: boolean;
  outline?: InteractiveOutlineHandle | null;
  actorIndex?: number;
  enemyIndex?: number;
  projectileIndex?: number;
  gemIndex?: number;
  simPrevX?: number;
  simPrevY?: number;
  simPrevElev?: number;
  simBlendElapsed?: number;
  simBlendDuration?: number;
  moveAccum?: number;
  aiPhase?: number;
  npcWander?: ExploreNpcWanderBounds;
  npcDirX?: number;
  npcDirY?: number;
  /** Cached visual-only sprite pivot in Three world units. */
  spriteOffsetX?: number;
  spriteOffsetY?: number;
  spriteOffsetZ?: number;
};

type Orbital = {
  actor: Actor;
  index: number;
  count: number;
  range: number;
  dmg: number;
  hitCd: Map<number, number>;
};

export class EmberThreeWorld {
  private readonly parent: HTMLElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly controls: OrbitControls;
  private readonly clock = new THREE.Clock();
  private readonly post: EmberPostFx;
  private readonly renderBudget: EmberRenderBudget;
  private readonly profiler: EmberFrameProfiler;
  private readonly profilerWork = {
    worldMs: 0,
    weaponsMs: 0,
    bulletsMs: 0,
    orbitalsMs: 0,
    spawnsMs: 0,
    aiMs: 0,
    terrainMs: 0,
    cameraMs: 0,
    billboardsMs: 0,
    environmentMs: 0,
    shadowsMs: 0,
    hudMs: 0,
    reflectionMs: 0,
    mainRenderMs: 0,
    profilerMs: 0,
  };
  private profilerRenderableCache = {
    updatedAt: -Infinity,
    terrain: 0,
    props: 0,
    overlays: 0,
    instances: 0,
  };
  private readonly localShadowDebug: LocalShadowDebugOverlay;
  private readonly playProfileBudget: EmberPlayProfileBudget;
  private readonly autoAttackEnabled: boolean;
  private readonly lookOffset = new THREE.Vector3();
  private readonly lookAxis = new THREE.Vector3(0, 1, 0);
  private mapGroup: THREE.Group | null = null;
  private lastCutawayKey = "";
  private cutawayTagged: THREE.Object3D[] = [];
  private terrainChunks: ChunkedVoxelTerrain | null = null;
  private readonly terrainStreaming: Required<
    NonNullable<EmberThreeWorldOpts["terrainStreaming"]>
  >;
  private terrainFocusChunkKey = "";
  private terrainLoadKeySig = "";
  private terrainRetainKeySig = "";
  private terrainDatasetKey: string;
  private entityRoot = new THREE.Group();
  private readonly enemyBillboards = new RuntimeBillboardBatches(
    this.entityRoot,
    192,
  );
  private readonly effectBillboards = new RuntimeBillboardBatches(
    this.entityRoot,
    512,
  );
  private readonly transientActors = new RuntimeObjectPool<Actor>(() => ({
    mesh: new THREE.Object3D(),
    lx: 0,
    ly: 0,
    elev: 0,
    radius: 1,
    kind: "bullet",
  }));
  private readonly staticPropRoot = new THREE.Group();
  private readonly staticPropChunks = new Map<string, THREE.Group>();
  private readonly loadedStaticPropChunkKeys = new Set<string>();
  private staticPropQueue: TerrainChunkDescriptor[] = [];
  private staticPropFrame = 0;
  /** Cached animated emissive materials (no per-frame scene traverse). */
  private emissiveMats: THREE.Material[] = [];
  /** Shared animated water materials from the static map mesh. */
  private waterMats: THREE.Material[] = [];
  /** Pixel planar reflection pass for water (scene mirror, not specular smear). */
  private waterReflect: WaterPlanarReflection | null = null;
  /** Cadence clock may trail wall time slightly to avoid divisor aliasing. */
  private lastWaterReflectionMs = -Infinity;
  /** Actual presentation time used only for profiler age. */
  private waterReflectionPresentedAtMs = -Infinity;
  private waterReflectionUpdatedThisFrame = false;
  private readonly lastWaterReflectionCameraPosition = new THREE.Vector3();
  private readonly lastWaterReflectionCameraQuaternion = new THREE.Quaternion();
  private hasWaterReflectionCameraPose = false;
  /** Weak PointLights from dense emissive ink. */
  private emissiveLights: THREE.PointLight[] = [];
  /** Lantern PointLights for global torch flicker. */
  private lanternLights: THREE.PointLight[] = [];
  /** Terrain/props/lights changed; cached point-light cube maps need one bake. */
  private staticShadowDirty = true;
  private sunShadowDirty = true;
  private terrainSettled = false;
  private staticPropsSettled = false;
  private shadowWarmupComplete = false;
  private shaderCompiling = false;
  private localLightsSpawned = false;
  private lastLoadRatio = -1;
  private lastLoadLabel = "";
  private shadowReadyResolve!: () => void;
  readonly ready = new Promise<void>((resolve) => {
    this.shadowReadyResolve = resolve;
  });
  private staticShadowBakeTarget: THREE.WebGLRenderTarget | null = null;
  private readonly staticShadowBakeCamera = new THREE.PerspectiveCamera(
    40,
    1,
    1,
    2,
  );
  private raf = 0;
  private disposed = false;
  private contextLost = false;
  private readonly onBridge: EmberBridgeHandler;
  private readonly pack: EmberPack;
  private readonly stage: EmberStage;
  private map: EmberMap;
  private tileset: EmberTileset;
  private readonly shortMode: boolean;

  private actors: Actor[] = [];
  private readonly enemies: Actor[] = [];
  private readonly npcs: Actor[] = [];
  private readonly npcPlacementIds = new Set<string>();
  private npcAiAccumulator = 0;
  private readonly projectiles: Actor[] = [];
  private readonly gems: Actor[] = [];
  private readonly enemySpatial: RuntimeActorSpatialIndex<Actor>;
  private enemyCrowdOpenField: EnemyCrowdOpenField;
  private enemyCrowdFlow: EnemyCrowdFlowField;
  private enemySpatialDirty = true;
  private enemyAiAccumulator = 0;
  private enemyAiStepsLastFrame = 0;
  private bulletExactCollisionChecksLastFrame = 0;
  private bulletOpenFieldMovesLastFrame = 0;
  private enemyAiTick = 0;
  private enemyPhysicsMovesLastFrame = 0;
  private enemyOpenFieldMovesLastFrame = 0;
  private enemyKinematicMovesLastFrame = 0;
  private enemyDeferredCollisionMovesLastFrame = 0;
  private enemyHeightTransitionMovesLastFrame = 0;
  private enemyHeightTransitionDeferredLastFrame = 0;
  private enemyContactSkipsLastFrame = 0;
  private enemyAvoidanceActorsLastFrame = 0;
  private enemyAvoidanceNeighborsLastFrame = 0;
  private enemyFlowGuidedLastFrame = 0;
  private enemyFlowMissesLastFrame = 0;
  private enemyFlowRebuildsLastFrame = 0;
  private enemyFlowRouteMaskLastFrame = 0;
  private enemyCadenceLastFrame = { full: 0, half: 0, third: 0, quarter: 0 };
  private readonly crowdSeparation: CrowdSeparationAccumulator = {
    x: 0,
    y: 0,
    weight: 0,
  };
  private readonly crowdSteering = { x: 0, y: 0 };
  private readonly crowdFlowDirection = {
    x: 0,
    y: 0,
    heightTransition: false,
    routeGroup: -1,
  };
  private readonly crowdConnectorMove = { x: 0, y: 0, elev: 0 };
  private stressEnemyTarget = 0;
  private stressNoXp = false;
  private player!: Actor;
  /** Discrete support story used by horizontal Minecraft-style collision. */
  private playerElev = 0;
  /** Continuous feet height used by rendering, camera and combat. */
  private playerFeetElev = 0;
  private playerFallVelocity = 0;
  private playerGrounded = true;
  private weapons: WeaponSlot[] = [];
  private orbitals: Orbital[] = [];
  private orbitAngle = 0;

  private keys = {
    w: false,
    a: false,
    s: false,
    d: false,
    space: false,
    q: false,
    e: false,
  };
  private jumpQueued = false;
  private jumpCd = 0;
  private lastFacingX = 0;
  private lastFacingY = 1;
  private lastAim = Math.PI / 2;

  private hp = 0;
  private maxHp = 0;
  private xp = 0;
  private xpToLevel = 10;
  private level = 1;
  private elapsed = 0;
  private duration = 90;
  private killed = 0;
  private stripMeter = 0;
  private stripTier = 0;
  private filthUntil = 0;
  private filthResist = 0;
  private tileHazardNextAt = 0;
  private moveMul = 1;
  private nowMs = 0;
  private hudAcc = 0;
  private teleportCd = 0;
  /** Pad id the player is standing on after a warp (or a no-op stub). */
  private teleportOccupyId: string | null = null;
  private mapChangeCd = 0;
  private mapChangeOccupyId: string | null = null;
  private mapFade: MapFadeState = createMapFadeState();
  private pendingMapFade: {
    arrival: MapChangeArrival;
    tileset: EmberTileset;
  } | null = null;
  private mapFadeEl: HTMLDivElement | null = null;
  private mapFadeDoorEl: HTMLDivElement | null = null;
  private scriptHeldForMapFade = false;
  private triggerCd = 0;
  private spawnAcc: number[] = [];
  private onceFired = new Set<number>();
  private openedChestKeys = new Set<string>();
  /** Opening hinged chests: play clip then open loot UI. */
  private chestOpens: {
    actor: Actor;
    sceneMesh: VoxelSceneMesh;
    clipId: string | null;
    durationSec: number;
    t: number;
    lootOpened: boolean;
  }[] = [];
  /** EmberEvent ids that have fired this run (for emissive trigger_event). */
  private activeEmissiveEvents = new Set<string>();
  private awaitingLoot = false;
  private shopOpen = false;
  private inventoryOpen = false;
  private dialogueOpen = false;
  private scriptQueue: EmberScriptStep[] = [];
  private pendingShopId: string | null = null;
  private flags: Record<string, EmberFlagValue> = {};
  private shopId: string | null = null;
  private shopStock: Record<string, Record<string, number>> = {};
  private inventory: Record<string, number> = {};
  private equipment: EmberEquipment = emptyEquipment();
  private applyingSave = false;
  private exploreSpawnFromSave: EmberExploreSaveState | null = null;
  private pausedLogic = false;
  private lookWarpSkip = 0;
  private pendingLookMovementX = 0;
  private pendingLookMovementY = 0;
  private lookWarpPending = false;
  private finished = false;
  private followDist = 120;
  private cameraRig: ResolvedEmberCamera = resolveMapCamera({});
  private readonly followTarget = new THREE.Vector3();
  private keyLight: THREE.DirectionalLight | null = null;
  private readonly sunDir = new THREE.Vector3(0, 1, 0);
  private localShadowActorsMoved = false;
  private localShadowSkip = 0;
  private localPointShadowLimit = 0;
  private readonly localShadowMapBank = new LocalPointShadowMapBank();
  private atlasSlotIds: (string | null)[] = [];
  private atlasBlitDirty = true;
  private dynamicLocalLights: THREE.PointLight[] = [];
  private localShadowCandidates: THREE.PointLight[] = [];
  private readonly localShadowActorFocuses: THREE.Vector3[] = [];
  private readonly lightRoot = new THREE.Group();
  private readonly fillLightRoot = new THREE.Group();
  private readonly localLightRoot = new THREE.Group();
  private atmosphere!: MapAtmosphereHandle;
  private uidSeq = 1;

  private readonly onKeyDown = (ev: KeyboardEvent) => {
    const stressTarget = import.meta.env.DEV
      ? runtimeStressTargetForShortcut(ev.code, ev.shiftKey)
      : null;
    if (stressTarget != null && !ev.repeat) {
      ev.preventDefault();
      this.stressNoXp = true;
      this.xp = 0;
      this.spawnCrowdStress(stressTarget);
      return;
    }
    if (isPlayMenuToggleKey(ev)) {
      ev.preventDefault();
      ev.stopPropagation();
      if (ev.repeat) return;
      const action = playEscOverlayAction({
        shopOpen: this.shopOpen,
        inventoryOpen: this.inventoryOpen,
        dialogueOpen: this.dialogueOpen,
      });
      switch (action) {
        case "close_shop":
          this.closeShop();
          return;
        case "close_inventory":
          this.closeInventory();
          return;
        case "ignore":
          return;
        case "pause":
          this.openPauseMenu(PLAY_POINTER_LOCK_RELOCK_MS);
          return;
        default: {
          const _never: never = action;
          void _never;
        }
      }
      return;
    }
    if (ev.code === "KeyF" && !ev.repeat) {
      ev.preventDefault();
      this.tryInteract();
      return;
    }
    if (ev.code === "KeyI" && !ev.repeat) {
      ev.preventDefault();
      this.toggleInventory();
      return;
    }
    if (ev.code === "Space") ev.preventDefault();
    this.setKey(ev.code, true);
  };
  private readonly onKeyUp = (ev: KeyboardEvent) => {
    this.setKey(ev.code, false);
  };
  private readonly onPointerDown = (ev: PointerEvent) => {
    if (ev.button !== 0) return;
    if (this.hasLookLock()) return;
    const target = ev.target;
    const shell = this.lookLockTarget();
    const inside = target instanceof Node && shell.contains(target);
    const el =
      target instanceof Element
        ? target
        : target instanceof Node
          ? target.parentElement
          : null;
    const ui = el != null && el.closest(PLAY_LOOK_LOCK_UI_SELECTOR) != null;
    if (!playPointerDownShouldLock(inside, ui)) return;
    this.renderer.domElement.focus();
    this.requestLookLock();
  };
  private readonly onPointerMove = (ev: PointerEvent) => {
    if (!playLookActive(this.lookState())) return;
    const taken = playLookTakeMove(this.lookWarpSkip);
    this.lookWarpSkip = taken.skipRemaining;
    if (!taken.apply) return;
    const locked = this.hasLookLock();
    this.pendingLookMovementX = accumulatePlayLookMovement(
      this.pendingLookMovementX,
      ev.movementX,
    );
    this.pendingLookMovementY = accumulatePlayLookMovement(
      this.pendingLookMovementY,
      ev.movementY,
    );
    if (!locked) this.lookWarpPending = true;
  };
  private readonly onPointerLockChange = () => {
    this.pendingLookMovementX = 0;
    this.pendingLookMovementY = 0;
    this.lookWarpPending = false;
    this.lookWarpSkip = 0;
    this.syncPointerLock();
  };
  private readonly onWindowBlur = () => {
    this.syncPointerLock();
    this.pauseIfBackgrounded();
  };
  private readonly onWindowFocus = () => {
    this.syncPointerLock();
  };
  private readonly onVisibilityChange = () => {
    if (document.hidden) this.pauseIfBackgrounded();
  };
  private readonly onContextLost = (ev: Event) => {
    ev.preventDefault();
    if (this.disposed || this.contextLost) return;
    this.contextLost = true;
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.onBridge({
      type: "toast",
      textRu: "Видеоконтекст потерян — Ember приостановлен и ждёт восстановления",
    });
  };
  private readonly onContextRestored = () => {
    if (this.disposed) return;
    this.contextLost = false;
    this.clock.getDelta();
    this.localShadowMapBank.resetGpuResources();
    this.dynamicLocalLights = [];
    this.atlasBlitDirty = true;
    this.atlasSlotIds = this.atlasSlotIds.map(() => null);
    this.invalidateStaticShadows();
    this.onResize();
    this.scene.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh || obj instanceof THREE.Sprite)) return;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const mat of mats) mat.needsUpdate = true;
    });
    this.onBridge({
      type: "toast",
      textRu: "Видеоконтекст восстановлен",
    });
    if (!this.raf) this.raf = requestAnimationFrame(this.tick);
  };

  constructor(opts: EmberThreeWorldOpts) {
    this.parent = opts.parent;
    this.pack = opts.pack;
    this.onBridge = opts.onBridge;
    this.shortMode = Boolean(opts.shortMode);

    const stage = opts.pack.stages[opts.stageId];
    if (!stage) throw new Error(`stage ${opts.stageId}`);
    this.stage = stage;
    const mapRaw = opts.pack.maps[stage.mapId];
    if (!mapRaw) throw new Error(`map ${stage.mapId}`);
    this.map = ensureMapLayers(mapRaw);
    if (resolveMapPlayProfile(this.map) === "explore") {
      this.inventory = { [SHOP_WALLET_ITEM_ID]: 20 };
      const incoming = opts.exploreSave ?? null;
      const dest = incoming ? this.pack.maps[incoming.mapId] : undefined;
      if (
        incoming &&
        dest &&
        resolveMapPlayProfile(dest) === "explore"
      ) {
        this.map = ensureMapLayers(dest);
        this.applyExploreProgressFields(incoming);
        this.exploreSpawnFromSave = incoming;
      }
    }
    this.autoAttackEnabled = resolveMapAutoAttack(this.map);
    this.cameraRig = resolvePackMapCamera(this.map, this.pack);
    this.enemySpatial = new RuntimeActorSpatialIndex(
      Math.max(24, this.map.tileSize * 2),
    );
    const tileset = opts.pack.tilesets[this.map.tilesetId];
    if (!tileset) throw new Error(`tileset ${this.map.tilesetId}`);
    this.tileset = tileset;
    this.enemyCrowdOpenField = buildEnemyCrowdOpenField(
      this.map,
      this.tileset,
      this.pack.sprites,
      this.pack.voxelModels,
      this.pack.voxelScenes,
    );
    this.enemyCrowdFlow = createEnemyCrowdFlowField(
      this.enemyCrowdOpenField,
    );
    this.terrainStreaming = {
      enabled:
        opts.terrainStreaming?.enabled ??
        resolveMapPlayProfile(this.map) !== "explore",
      chunkSize: Math.max(
        4,
        Math.round(
          opts.terrainStreaming?.chunkSize ?? DEFAULT_TERRAIN_CHUNK_SIZE,
        ),
      ),
      loadRadiusChunks: Math.max(
        1,
        Math.round(opts.terrainStreaming?.loadRadiusChunks ?? 2),
      ),
      unloadRadiusChunks: Math.max(
        2,
        Math.round(opts.terrainStreaming?.unloadRadiusChunks ?? 3),
      ),
    };
    this.terrainStreaming.unloadRadiusChunks = Math.max(
      this.terrainStreaming.loadRadiusChunks + 1,
      this.terrainStreaming.unloadRadiusChunks,
    );
    this.terrainDatasetKey = `runtime:${stage.mapId}:${this.map.tilesetId}`;

    this.maxHp = stage.playerHp;
    this.hp = stage.playerHp;
    if (this.exploreSpawnFromSave) {
      this.applyExploreHp(this.exploreSpawnFromSave);
    }
    this.duration = stageUsesTimedClear(resolveMapPlayProfile(this.map))
      ? this.shortMode
        ? Math.min(90, stage.durationSec)
        : stage.durationSec
      : 0;
    this.xpToLevel = stage.baseXpToLevel;

    const width = opts.width ?? (opts.parent.clientWidth || 960);
    const height = opts.height ?? (opts.parent.clientHeight || 640);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0e0a08);
    this.scene.environment = getEmberEnvMap();
    this.localShadowDebug = createLocalShadowDebugOverlay(this.scene);
    this.camera = new THREE.PerspectiveCamera(
      this.cameraRig.fov,
      width / height,
      this.cameraRig.near,
      this.cameraRig.far,
    );
    this.camera.layers.enable(EMBER_DYNAMIC_ACTOR_LAYER);
    this.renderer = new THREE.WebGLRenderer({
      antialias: false,
      powerPreference: "high-performance",
    });
    this.playProfileBudget = resolvePlayProfileBudget(
      resolveMapPlayProfile(this.map),
    );
    this.renderBudget = resolveEmberRenderBudget(
      this.renderer.capabilities,
      "play",
      resolveMapPlayProfile(this.map),
    );
    this.localShadowMapBank.enableAtlas(
      layoutPointShadowAtlas(
        POINT_SHADOW_SHADER_SLOTS,
        this.renderBudget.pointShadowMapSize,
        this.renderer.capabilities.maxTextureSize,
      ),
    );
    this.atlasSlotIds = Array.from(
      { length: POINT_SHADOW_SHADER_SLOTS },
      () => null,
    );
    this.renderer.setSize(width, height);
    // Cap DPR — bloom + shadows already dominate GPU cost.
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
    this.renderer.shadowMap.enabled = true;
    // Hard cartoon umbras (not soft PCF bleed).
    this.renderer.shadowMap.type = THREE.BasicShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.domElement.style.display = "block";
    this.renderer.domElement.style.width = "100%";
    this.renderer.domElement.style.height = "100%";
    this.renderer.domElement.style.imageRendering = "pixelated";
    this.renderer.domElement.tabIndex = 0;
    opts.parent.innerHTML = "";
    opts.parent.appendChild(this.renderer.domElement);
    this.mountMapFadeOverlay();
    this.profiler = createEmberFrameProfiler(
      this.renderer,
      "GAME",
      (visible) => this.localShadowDebug.setVisible(visible),
    );
    this.localShadowDebug.setVisible(this.profiler.isVisible());
    this.renderer.domElement.addEventListener(
      "webglcontextlost",
      this.onContextLost,
      false,
    );
    this.renderer.domElement.addEventListener(
      "webglcontextrestored",
      this.onContextRestored,
      false,
    );

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    // Follow lerp already smooths translation. Damping here fights mouse yaw
    // and hitch-sized dt, which reads as a jerky village camera.
    this.controls.enableDamping = false;
    this.controls.enablePan = false;
    this.controls.enableRotate = false;
    this.controls.enableZoom = true;
    const rig = this.cameraRig;
    if (rig.pitchLock) {
      this.controls.minPolarAngle = rig.polarAngle;
      this.controls.maxPolarAngle = rig.polarAngle;
    } else {
      this.controls.minPolarAngle = rig.polarMin;
      this.controls.maxPolarAngle = rig.polarMax;
    }
    this.controls.minDistance = Math.max(48, rig.followDistance * 0.45);
    this.controls.maxDistance = Math.max(rig.followDistance * 1.85, 220);
    this.lightRoot.name = "lights";
    this.fillLightRoot.name = "fillLights";
    this.localLightRoot.name = "localLights";
    this.lightRoot.add(this.fillLightRoot, this.localLightRoot);
    this.scene.add(this.lightRoot);
    this.atmosphere = createMapAtmosphere(this.scene);

    this.post = createPostFx(
      this.renderer,
      this.scene,
      this.camera,
      width,
      height,
    );

    this.entityRoot.name = "entities";
    this.staticPropRoot.name = "staticPropChunks";
    this.entityRoot.add(this.staticPropRoot);
    this.scene.add(this.entityRoot);

    this.buildMapAndLights();
    this.refreshWaterMats();
    this.spawnPlayerAndGear();
    this.spawnExploreNpcs();
    this.updateTerrainStreaming(true);
    this.placeChests();
    this.refreshEmissiveMats();
    this.invalidateStaticShadows();
    // Snap follow target to player immediately.
    const focus = logicToThree(
      this.player.lx,
      this.player.ly,
      this.playerFeetElev,
      this.cameraRig.lookHeight,
      this.map.tileSize,
    );
    const delta = new THREE.Vector3(
      focus.x - this.controls.target.x,
      focus.y - this.controls.target.y,
      focus.z - this.controls.target.z,
    );
    this.controls.target.add(delta);
    this.camera.position.add(delta);
    this.controls.update();

    window.addEventListener("keydown", this.onKeyDown, true);
    window.addEventListener("keyup", this.onKeyUp, true);
    window.addEventListener("blur", this.onWindowBlur);
    window.addEventListener("focus", this.onWindowFocus);
    document.addEventListener("visibilitychange", this.onVisibilityChange);
    this.onResize = this.onResize.bind(this);
    window.addEventListener("resize", this.onResize);
    document.addEventListener("pointerdown", this.onPointerDown, true);
    document.addEventListener("pointermove", this.onPointerMove);
    document.addEventListener("pointerlockchange", this.onPointerLockChange);
    this.renderer.domElement.focus();
    this.syncPointerLock();

    this.tick = this.tick.bind(this);
    this.raf = requestAnimationFrame(this.tick);
    this.emitHud();
  }

  private refreshEmissiveMats(): void {
    this.emissiveMats = [];
    if (this.mapGroup) {
      this.emissiveMats.push(...collectEmissiveMaterials(this.mapGroup));
    }
    this.emissiveMats.push(...collectEmissiveMaterials(this.entityRoot));
  }

  private refreshWaterMats(): void {
    if (this.mapGroup) ensureWaterShoreAttributes(this.mapGroup);
    this.waterMats = this.mapGroup ? collectWaterMaterials(this.mapGroup) : [];
    const planarMats = [
      ...(this.mapGroup ? collectPlanarReflectMaterials(this.mapGroup) : []),
      ...collectPlanarReflectMaterials(this.entityRoot),
    ];
    const allReflect = [...this.waterMats, ...planarMats];
    if (allReflect.length === 0) {
      this.waterReflect?.dispose();
      this.waterReflect = null;
      return;
    }
    if (!this.waterReflect) {
      this.waterReflect = createWaterPlanarReflection();
    }
    const planeY =
      estimateWaterPlaneY(this.mapGroup) ??
      estimatePlanarFloorY(this.mapGroup) ??
      estimatePlanarFloorY(this.entityRoot);
    if (planeY != null) this.waterReflect.setPlaneY(planeY);
    // Match camera / post FX logical size (not drawing-buffer * DPR).
    const w = this.parent.clientWidth || 960;
    const h = this.parent.clientHeight || 640;
    const res = waterReflectionResolution(
      w,
      h,
      maxWaterReflectMult(this.waterMats),
    );
    this.waterReflect.setResolution(res.width, res.height);
    this.waterReflect.bindMaterials(allReflect);
  }

  private buildMapAndLights(): void {
    this.terrainChunks = createChunkedVoxelTerrain(this.map, this.tileset, {
      chunkSize: this.terrainStreaming.chunkSize,
      deferInitial: true,
    });
    this.mapGroup = this.terrainChunks.group;
    this.scene.add(this.mapGroup);
    const mapCenter = this.terrainChunks.center;

    const lightCfg = resolveMapLight(this.map);
    setEmberVoxelLightSnap(
      lightCfg.voxelSnapLight,
      this.map.tileSize / VOXELS_PER_BLOCK,
    );
    this.post.setBloom({
      strength: lightCfg.bloomStrength,
      threshold: lightCfg.bloomThreshold,
      radius: lightCfg.bloomRadius,
    });
    this.post.setGrade(
      lightCfg.grade,
      lightCfg.atmosphere.vignette,
      lightCfg.atmosphere.tiltShift,
    );
    this.atmosphere.apply(
      lightCfg.atmosphere,
      this.map.width * this.map.tileSize,
      this.map.height * this.map.tileSize,
      {
        azimuth: lightCfg.sunAzimuth,
        elevation: lightCfg.sunElevation,
        color: lightCfg.sunColor,
        night: lightCfg.ambientAlpha,
      },
    );

    this.clearLightRoot();
    // Fixed isometric framing around player (retargeted after spawn).
    this.cameraRig = resolvePackMapCamera(this.map, this.pack);
    this.applyCameraLens();
    this.followDist = this.cameraRig.followDistance;
    sunDirectionFromAngles(
      lightCfg.sunAzimuth,
      lightCfg.sunElevation,
      this.sunDir,
    );
    const mapSpan = Math.max(
      this.map.width * this.map.tileSize,
      this.map.height * this.map.tileSize,
    );
    const sunHalf = mapWideDirectionalHalf(mapSpan);
    this.keyLight = addThreeFillLights(this.fillLightRoot, lightCfg, mapCenter, {
      keyLight: true,
      shadows: true,
      shadowMapSize: this.renderBudget.directionalShadowMapSize,
      mapWidth: this.map.width * this.map.tileSize,
      mapDepth: this.map.height * this.map.tileSize,
    });
    if (this.keyLight?.castShadow) {
      configureCachedSunShadow(
        this.keyLight,
        this.renderBudget.directionalShadowMapSize,
      );
      fitDirectionalShadowToFocus(this.keyLight, mapCenter, this.sunDir, {
        halfExtent: sunHalf,
        lightDistance: directionalShadowLightDistance(sunHalf),
        mapSize: this.renderBudget.directionalShadowMapSize,
        voxelSize: this.map.tileSize / VOXELS_PER_BLOCK,
        snapMin: 0,
      });
    }
    const isoPolar = this.cameraRig.polarAngle;
    const yaw = this.cameraRig.yaw;
    const spherical = new THREE.Spherical(this.followDist, isoPolar, yaw);
    this.controls.target.copy(mapCenter);
    this.camera.position.setFromSpherical(spherical).add(this.controls.target);
    this.controls.update();
  }

  private updateTerrainStreaming(force = false): void {
    const terrain = this.terrainChunks;
    if (!terrain || !this.player) return;
    const { tx, ty } = worldToTile(this.map, this.player.lx, this.player.ly);
    const chunkX = Math.floor(tx / this.terrainStreaming.chunkSize);
    const chunkY = Math.floor(ty / this.terrainStreaming.chunkSize);
    const focusKey = `${chunkX}:${chunkY}`;
    if (!this.terrainStreaming.enabled) {
      if (!force && this.terrainFocusChunkKey !== "") return;
    } else if (!force && focusKey === this.terrainFocusChunkKey) {
      return;
    }
    const descriptors = terrainChunkDescriptors(
      this.map.width,
      this.map.height,
      this.terrainStreaming.chunkSize,
    );
    const visualWindow = this.terrainStreaming.enabled
      ? terrainChunkWindow(
          descriptors,
          tx,
          ty,
          this.terrainStreaming.loadRadiusChunks,
          this.terrainStreaming.unloadRadiusChunks,
          this.terrainStreaming.chunkSize,
        )
      : {
          load: descriptors,
          retainKeys: new Set(descriptors.map((descriptor) => descriptor.key)),
        };
    const loadSig = terrainChunkKeySignature(
      visualWindow.load.map((descriptor) => descriptor.key),
    );
    const retainSig = terrainChunkKeySignature(visualWindow.retainKeys);
    const loadChanged = loadSig !== this.terrainLoadKeySig;
    const retainChanged = retainSig !== this.terrainRetainKeySig;
    this.terrainFocusChunkKey = focusKey;
    this.terrainLoadKeySig = loadSig;
    this.terrainRetainKeySig = retainSig;
    if (!force && !loadChanged && !retainChanged) return;

    if (force || retainChanged) {
      this.rebuildLocalLights(
        descriptors.filter((descriptor) =>
          visualWindow.retainKeys.has(descriptor.key),
        ),
      );
    }
    if (force || loadChanged || retainChanged) {
      this.syncStaticPropChunks(visualWindow.load, visualWindow.retainKeys);
    }

    const onApplied = (complete: boolean) => {
      if (this.disposed) return;
      this.syncTerrainStreamingStats();
      this.invalidateStaticShadows();
      if (!complete) return;
      this.terrainSettled = true;
      this.refreshEmissiveMats();
      this.refreshWaterMats();
      this.refreshCutawayTagged();
      this.emitLoadProgress();
    };
    if (!force && !loadChanged) {
      this.syncTerrainStreamingStats();
      return;
    }
    this.terrainSettled = false;
    if (!this.terrainStreaming.enabled) {
      terrain.scheduleUpdate(this.map, this.tileset, onApplied);
    } else {
      terrain.streamAround(
        this.map,
        this.tileset,
        tx,
        ty,
        {
          loadRadiusChunks: this.terrainStreaming.loadRadiusChunks,
          unloadRadiusChunks: this.terrainStreaming.unloadRadiusChunks,
          datasetKey: this.terrainDatasetKey,
        },
        onApplied,
      );
    }
    this.syncTerrainStreamingStats();
  }

  private rebuildLocalLights(
    retainedDescriptors: readonly TerrainChunkDescriptor[],
  ): void {
    const emissiveRuntime = captureEmissiveLightRuntimeStates(
      this.emissiveLights,
    );
    this.localShadowMapBank.replaceLights([]);
    this.clearLightGroup(this.localLightRoot);
    this.dynamicLocalLights = [];
    this.localShadowCandidates = [];
    this.localPointShadowLimit = 0;
    this.lanternLights = [];
    this.emissiveLights = [];
    if (retainedDescriptors.length === 0) {
      this.localShadowDebug.rebuild([], [], 1);
      this.localLightsSpawned = true;
      this.emitLoadProgress();
      return;
    }
    const sourceBounds = retainedDescriptors.reduce(
      (bounds, descriptor) => ({
        x0: Math.min(bounds.x0, descriptor.x0),
        y0: Math.min(bounds.y0, descriptor.y0),
        x1: Math.max(bounds.x1, descriptor.x1),
        y1: Math.max(bounds.y1, descriptor.y1),
      }),
      { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity },
    );
    const lightCfg = resolveMapLight(this.map);
    const lightCaps = applyMapLightBudget(this.renderBudget, lightCfg);
    const explore = !this.playProfileBudget.allowHorde;
    const pointShadowCap = playPointShadowCap(
      lightCaps,
      this.playProfileBudget,
    );
    const dynamicShadowCap = Math.min(
      lightCfg.dynamicPointShadows,
      DYNAMIC_LOCAL_SHADOW_MAX_LIGHTS,
    );
    this.localShadowMapBank.setDynamicLimit(dynamicShadowCap);
    const maxLamps = lanternVisibleShare(lightCaps, {
      authoredLights: lightCfg.maxPointLights != null,
      explore,
    });
    this.lanternLights = addThreeLanternLights(this.localLightRoot, {
      map: this.map,
      light: lightCfg,
      center: this.terrainChunks?.center ?? new THREE.Vector3(),
      tileset: this.tileset,
      sprites: this.pack.sprites,
      sourceBounds,
      maxLamps,
      maxShadows: pointShadowCap,
      shadows: true,
      shadowMapSize: this.renderBudget.pointShadowMapSize,
      shadowFocus: explore ? this.player.mesh.position : undefined,
    });
    const lanternGranted = grantedPointShadowLights(this.lanternLights).length;
    this.emissiveLights = addThreeEmissiveLocalLights(
      this.localLightRoot,
      this.map,
      this.tileset,
      this.pack.sprites,
      {
        sourceBounds,
        maxLights: Math.max(
          0,
          lightCaps.maxPointLights - this.lanternLights.length,
        ),
        maxShadows: remainingEmissiveShadowSlots(pointShadowCap, lanternGranted),
        lampFlickerShadowsOnly: !this.playProfileBudget.emissiveShadows,
        shadowMapSize: this.renderBudget.pointShadowMapSize,
        voxelModels: this.pack.voxelModels,
        voxelScenes: this.pack.voxelScenes,
      },
    );
    this.localShadowCandidates = grantedPointShadowLights([
      ...this.lanternLights,
      ...this.emissiveLights,
    ]);
    this.localPointShadowLimit = this.localShadowCandidates.length;
    this.localShadowMapBank.replaceLights(this.localShadowCandidates);
    this.localShadowDebug.rebuild(
      [...this.lanternLights, ...this.emissiveLights],
      this.dynamicLocalLights,
      lightCfg.dynamicShadowEnterScale,
    );
    // Existing sources must not restart their fade/flicker state when only the
    // streamed terrain window changed around the player.
    restoreEmissiveLightRuntimeStates(this.emissiveLights, emissiveRuntime);
    const canvas = this.renderer.domElement;
    canvas.dataset.staticPropLoadedChunks = String(
      this.loadedStaticPropChunkKeys.size,
    );
    canvas.dataset.localLanternLights = String(this.lanternLights.length);
    canvas.dataset.localEmissiveLights = String(this.emissiveLights.length);
    canvas.dataset.playPointShadowCap = String(pointShadowCap);
    canvas.dataset.localShadowCubes = String(
      this.localShadowCandidates.length,
    );
    this.localLightsSpawned = true;
    this.invalidateStaticShadows();
    this.emitLoadProgress();
  }

  /** Lightweight counters for the in-game diagnostics overlay/devtools. */
  getTerrainStreamingStats(): TerrainStreamingStats | null {
    return this.terrainChunks?.getStreamingStats() ?? null;
  }

  private syncTerrainStreamingStats(): void {
    const stats = this.getTerrainStreamingStats();
    if (!stats) return;
    const canvas = this.renderer.domElement;
    canvas.dataset.terrainLoadedChunks = String(stats.loadedChunks);
    canvas.dataset.terrainDesiredChunks = String(stats.desiredChunks);
    canvas.dataset.terrainPendingChunks = String(stats.pendingChunks);
    canvas.dataset.terrainTotalChunks = String(stats.totalChunks);
  }

  private spawnPlayerAndGear(): void {
    const start =
      findRegions(this.map, "player_start")[0] ??
      ({
        id: "fallback",
        kind: "player_start" as const,
        x: 2,
        y: 2,
        w: 1,
        h: 1,
      });
    const saved = this.exploreSpawnFromSave;
    const pos = saved
      ? exploreSaveWorldPos(saved, this.map.tileSize)
      : regionCenter(this.map, start);
    this.playerElev =
      saved?.elev ?? regionVolumeElev(this.map, start);
    this.playerFeetElev = this.playerElev;
    this.playerFallVelocity = 0;
    this.playerGrounded = true;
    this.teleportOccupyId = findRegions(this.map, "teleport").find((r) =>
      pointInRegion(this.map, r, pos.x, pos.y, this.playerElev),
    )?.id ?? null;
    this.mapChangeOccupyId = findRegions(this.map, "trigger").find((r) =>
      pointInRegion(this.map, r, pos.x, pos.y, this.playerElev),
    )?.id ?? null;
    if (this.exploreSpawnFromSave) {
      this.mapChangeCd = MAP_CHANGE_COOLDOWN;
      this.teleportCd = MAP_CHANGE_COOLDOWN;
    }
    const mesh = createColorBillboard(STRIP_COLORS[0]!, 10, "#1a1010");
    this.player = {
      mesh,
      lx: pos.x,
      ly: pos.y,
      elev: this.playerElev,
      radius: PLAYER_BODY_R,
      kind: "player",
    };
    this.addActor(this.player);
    this.syncActor(this.player);

    const starter = this.pack.weapons[this.stage.starterWeaponId];
    if (starter) this.weapons.push({ def: starter, level: 1, cooldown: 0 });
    const bolt = this.pack.weapons.spirit_bolt;
    if (bolt && starter?.id !== bolt.id) {
      this.weapons.push({ def: bolt, level: 1, cooldown: 0 });
    }
    this.rebuildOrbitals();
    this.ensureArenaStarterLoadout();
  }

  private makeChestMesh(
    region: EmberMap["regions"][number],
    open: boolean,
  ): THREE.Object3D {
    const pose = resolveChestModelPose(this.map, region);
    const scenes = this.pack.voxelScenes ?? {};
    const scene = region.sceneId ? scenes[region.sceneId] : undefined;

    if (scene) {
      const playhead = open ? 1 : 0;
      const clipId = region.openClipId ?? scene.animations?.[0]?.id ?? null;
      const built = buildVoxelSceneMesh(scene, this.pack.voxelModels ?? {}, {
        tileSize: this.map.tileSize,
        directLightScale: pose.directLightScale,
        playhead,
        clipId,
      });
      if (built) {
        built.root.userData.voxelChest = true;
        built.root.userData.voxelSceneMesh = built;
        built.root.userData.chestSceneId = scene.id;
        built.root.userData.chestClipId = clipId;
        built.root.rotation.y = pose.rot * (Math.PI / 2);
        built.root.scale.setScalar(pose.scale);
        return built.root;
      }
    }

    const modelId = open
      ? region.openModelId || region.closedModelId
      : region.closedModelId;
    const model = modelId ? this.pack.voxelModels?.[modelId] : undefined;
    if (!model) {
      const mesh = createColorBillboard(
        open ? "#a08030" : "#c8a040",
        9,
        "#3a2810",
      );
      mesh.userData.voxelChest = false;
      mesh.rotation.y = pose.rot * (Math.PI / 2);
      mesh.scale.setScalar(pose.scale);
      return mesh;
    }
    const built = buildVoxelModelMesh(model, this.map.tileSize, {
      directLightScale: pose.directLightScale,
      suppressCastShadow: model.emissiveSuppressHostShadow === true,
    });
    const { sx, sz } = voxelGridSize(model);
    const vw = this.map.tileSize / VOXELS_PER_BLOCK;
    const inner = new THREE.Group();
    while (built.group.children.length) {
      inner.add(built.group.children[0]!);
    }
    inner.position.set(-sx * vw * 0.5, 0, -sz * vw * 0.5);
    built.group.add(inner);
    built.group.userData.voxelChest = true;
    built.group.rotation.y = pose.rot * (Math.PI / 2);
    built.group.scale.setScalar(pose.scale);
    return built.group;
  }

  private placeChests(): void {
    stampOpenedChests(this.map, this.openedChestKeys);
    for (const r of findRegions(this.map, "chest")) {
      const key = chestKey(this.map.id, r.id);
      const opened = r.opened === true || this.openedChestKeys.has(key);
      if (opened) this.openedChestKeys.add(key);
      const pose = resolveChestModelPose(this.map, r);
      const mesh = this.makeChestMesh(r, opened);
      const a: Actor = {
        mesh,
        lx: pose.x,
        ly: pose.y,
        elev: pose.elev,
        radius: 6,
        kind: "chest",
        regionId: r.id,
        dead: opened,
      };
      this.addActor(a);
      this.syncActor(a);
      a.outline = createInteractiveOutline(
        mesh,
        r.modelOutline,
        this.entityRoot,
      );
      a.outline?.refreshBounds();
      if (opened) a.outline?.setCanInteract(false);
    }
  }

  /** Build one independently disposable chunk of non-actor map visuals. */
  private buildStaticPropChunk(
    descriptor: TerrainChunkDescriptor,
  ): THREE.Group {
    const root = new THREE.Group();
    root.name = `staticPropChunk:${descriptor.key}`;
    const contains = (x: number, y: number) =>
      x >= descriptor.x0 &&
      y >= descriptor.y0 &&
      x < descriptor.x1 &&
      y < descriptor.y1;

    for (const p of this.map.sprites ?? []) {
      if (!contains(p.x, p.y)) continue;
      if (this.npcPlacementIds.has(p.id)) continue;
      const def = this.pack.sprites[p.spriteId];
      if (!def) continue;
      const elev = p.elev ?? tileSurfaceElev(this.map, p.x, p.y);
      const mesh = createPixelBillboard(
        def,
        hexColorOr(def.color, "#c8a878"),
        this.map.tileSize * 0.95,
      );
      applySpriteWorldPosition(
        mesh,
        def,
        this.map.tileSize,
        (p.x + 0.5) * this.map.tileSize,
        elev * blockStoryHeight(this.map.tileSize) +
          this.map.tileSize * 0.45,
        (p.y + 0.5) * this.map.tileSize,
      );
      applySpritePlacementScale(mesh, p.scale);
      const n = normalizePixelSprite(def);
      if (n.emissivePixels && hasEmissiveInk(n.emissivePixels)) {
        tagEmissiveMaterial(mesh.material as THREE.MeshBasicMaterial, {
          anim: n.emissiveAnim,
          seed: emissivePlacementSeed(p.spriteId, p.x, p.y),
          baseIntensity: resolveEmissiveGlowStrength(n.emissiveStrength),
          kind: "basic",
          periodSec: n.emissiveAnimPeriod,
          periodMinSec: n.emissiveAnimPeriodMin,
          periodMaxSec: n.emissiveAnimPeriodMax,
          triggerWhen: n.emissiveTriggerWhen,
          triggerRadius: n.emissiveTriggerRadius,
          triggerEventId: n.emissiveTriggerEventId,
          tx: p.x,
          ty: p.y,
        });
      }
      root.add(mesh);
    }
    const placeVoxelProp = (p: EmberVoxelPlacement) => {
      const model = this.pack.voxelModels[p.modelId];
      if (!model) return;
      const elev = p.elev ?? tileSurfaceElev(this.map, p.x, p.y);
      const suppressHostShadow =
        p.emissiveSuppressHostShadow !== undefined
          ? p.emissiveSuppressHostShadow
          : model.emissiveSuppressHostShadow === true;
      const built = buildVoxelModelMesh(model, this.map.tileSize, {
        directLightScale: p.directLightScale ?? model.directLightScale,
        suppressCastShadow: suppressHostShadow,
      });
      applyVoxelPlacementTransform(
        built.group,
        p,
        model,
        this.map.tileSize,
        elev,
      );
      tagCutawayObject(built.group, p.x, p.y, elev, "prop");
      root.add(built.group);
    };
    const instanceGroups = new Map<string, EmberVoxelPlacement[]>();
    for (const p of this.map.voxelProps ?? []) {
      if (!contains(p.x, p.y)) continue;
      if (!this.pack.voxelModels[p.modelId]) continue;
      if (occupiedInteriorAt(this.map, p.x, p.y)) {
        placeVoxelProp(p);
        continue;
      }
      const list = instanceGroups.get(p.modelId);
      if (list) list.push(p);
      else instanceGroups.set(p.modelId, [p]);
    }
    for (const list of instanceGroups.values()) {
      const first = list[0];
      const model = first ? this.pack.voxelModels[first.modelId] : undefined;
      if (!first || !model || list.length < 2) {
        for (const p of list) placeVoxelProp(p);
        continue;
      }
      const suppressHostShadow =
        first.emissiveSuppressHostShadow !== undefined
          ? first.emissiveSuppressHostShadow
          : model.emissiveSuppressHostShadow === true;
      const batch = createEditorVoxelInstanceBatch(
        model,
        this.map.tileSize,
        list.map((p) => ({
          placement: p,
          elev: p.elev ?? tileSurfaceElev(this.map, p.x, p.y),
        })),
        {
          directLightScale: first.directLightScale ?? model.directLightScale,
          suppressCastShadow: suppressHostShadow,
        },
      );
      if (!batch) {
        for (const p of list) placeVoxelProp(p);
        continue;
      }
      root.add(batch.root);
    }
    addQuestMarkerOverlays(root, this.map, this.pack.voxelModels, contains, {
      itemIcons: this.pack.itemIcons,
      flags: this.flags,
    });
    return root;
  }

  private syncStaticPropChunks(
    load: readonly TerrainChunkDescriptor[],
    retainKeys: ReadonlySet<string>,
  ): void {
    this.staticPropsSettled = false;
    if (this.staticPropFrame) cancelAnimationFrame(this.staticPropFrame);
    this.staticPropFrame = 0;
    this.staticPropQueue = [];
    let removed = false;
    for (const key of [...this.loadedStaticPropChunkKeys]) {
      if (retainKeys.has(key)) continue;
      const group = this.staticPropChunks.get(key);
      if (group) {
        this.staticPropRoot.remove(group);
        this.disposeObject(group);
        this.staticPropChunks.delete(key);
      }
      this.loadedStaticPropChunkKeys.delete(key);
      removed = true;
    }

    this.staticPropQueue = load.filter(
      (descriptor) => !this.loadedStaticPropChunkKeys.has(descriptor.key),
    );
    this.renderer.domElement.dataset.staticPropPendingChunks = String(
      this.staticPropQueue.length,
    );
    const finish = () => {
      this.staticPropsSettled = true;
      this.refreshEmissiveMats();
      this.refreshWaterMats();
      this.renderer.domElement.dataset.staticPropLoadedChunks = String(
        this.loadedStaticPropChunkKeys.size,
      );
      this.renderer.domElement.dataset.staticPropPendingChunks = String(
        this.staticPropQueue.length,
      );
      this.invalidateStaticShadows();
      this.refreshCutawayTagged();
      this.emitLoadProgress();
    };
    if (this.staticPropQueue.length === 0) {
      if (removed) finish();
      else {
        this.staticPropsSettled = true;
        this.refreshCutawayTagged();
        this.emitLoadProgress();
      }
      return;
    }
    const pump = () => {
      this.staticPropFrame = 0;
      if (this.disposed) return;
      const descriptor = this.staticPropQueue.shift();
      if (!descriptor) {
        finish();
        return;
      }
      const group = this.buildStaticPropChunk(descriptor);
      this.loadedStaticPropChunkKeys.add(descriptor.key);
      if (group.children.length > 0) {
        this.staticPropRoot.add(group);
        this.staticPropChunks.set(descriptor.key, group);
      }
      this.renderer.domElement.dataset.staticPropPendingChunks = String(
        this.staticPropQueue.length,
      );
      if (this.staticPropQueue.length > 0) {
        this.staticPropFrame = requestAnimationFrame(pump);
      } else {
        finish();
      }
    };
    this.staticPropFrame = requestAnimationFrame(pump);
  }

  private addActor(a: Actor): void {
    if (a.kind !== "chest" && !a.enemyBillboard && !a.effectBillboard) {
      setObjectRenderLayer(a.mesh, EMBER_DYNAMIC_ACTOR_LAYER);
    }
    // Short-lived effects do not need real shadow-map silhouettes. Keeping
    // only player/enemy actors as dynamic casters avoids bullet/gem storms
    // multiplying the directional shadow pass before they are instanced.
    if (
      a.kind === "bullet" ||
      a.kind === "ebullet" ||
      a.kind === "gem" ||
      a.kind === "orbit"
    ) {
      a.mesh.traverse((object) => {
        if (object instanceof THREE.Mesh) object.castShadow = false;
      });
    }
    a.actorIndex = this.actors.length;
    this.actors.push(a);
    if (a.kind === "enemy") {
      a.enemyIndex = this.enemies.length;
      a.simPrevX = a.lx;
      a.simPrevY = a.ly;
      a.simPrevElev = a.elev;
      a.simBlendElapsed = 0;
      a.simBlendDuration = 0;
      a.moveAccum = 0;
      this.enemies.push(a);
      this.enemySpatialDirty = true;
    } else if (a.kind === "npc") {
      a.simPrevX = a.lx;
      a.simPrevY = a.ly;
      a.simPrevElev = a.elev;
      a.simBlendElapsed = 0;
      a.simBlendDuration = 0;
      a.moveAccum = 0;
      this.npcs.push(a);
    } else if (a.kind === "bullet" || a.kind === "ebullet") {
      a.projectileIndex = this.projectiles.length;
      this.projectiles.push(a);
    } else if (a.kind === "gem") {
      a.gemIndex = this.gems.length;
      this.gems.push(a);
    }
    if (!a.enemyBillboard && !a.effectBillboard) this.entityRoot.add(a.mesh);
  }

  private acquireTransientActor(
    kind: "bullet" | "ebullet" | "gem" | "orbit",
    lx: number,
    ly: number,
    elev: number,
    radius: number,
    extra?: Partial<Actor>,
  ): Actor {
    const actor = this.transientActors.acquire();
    actor.enemyBillboard = undefined;
    actor.effectBillboard = undefined;
    actor.lx = lx;
    actor.ly = ly;
    actor.elev = elev;
    actor.radius = radius;
    actor.kind = kind;
    actor.hp = undefined;
    actor.maxHp = undefined;
    actor.def = undefined;
    actor.touchCd = undefined;
    actor.vx = undefined;
    actor.vy = undefined;
    actor.dmg = undefined;
    actor.life = undefined;
    actor.xp = undefined;
    actor.regionId = undefined;
    actor.filth = undefined;
    actor.filthMs = undefined;
    actor.strip = undefined;
    actor.uid = undefined;
    actor.dead = false;
    actor.outline = null;
    actor.actorIndex = undefined;
    actor.enemyIndex = undefined;
    actor.projectileIndex = undefined;
    actor.gemIndex = undefined;
    actor.simPrevX = undefined;
    actor.simPrevY = undefined;
    actor.simPrevElev = undefined;
    actor.simBlendElapsed = undefined;
    actor.simBlendDuration = undefined;
    actor.moveAccum = undefined;
    actor.aiPhase = undefined;
    actor.mesh.name = `transientProxy:${kind}`;
    actor.mesh.position.set(0, 0, 0);
    actor.mesh.rotation.set(0, 0, 0);
    actor.mesh.scale.set(1, 1, 1);
    if (extra) Object.assign(actor, extra);
    // Pool ownership cannot be replaced by optional gameplay metadata.
    actor.kind = kind;
    return actor;
  }

  private attachEffectBillboard(
    actor: Actor,
    key: string,
    color: string,
    size: number,
  ): void {
    actor.effectBillboard = this.effectBillboards.add(
      key,
      actor.mesh,
      () => createUnshadowedEffectBillboard(color, size),
    );
  }

  /**
   * Sun/moon and atlas lamp umbras contain authored geometry and stay cached
   * while the camera and actors move. Local PointLights still add light
   * inside the baked umbra. The nearest in-range lamp also recooks one
   * atlas slot with the player/enemy layer.
   */
  private invalidateStaticShadows(): void {
    this.staticShadowDirty = true;
    this.sunShadowDirty = true;
    this.localShadowMapBank.markAllDirty();
    invalidatePointLightShadows(this.lightRoot);
  }

  private freezeShadowsExcept(
    allow: (light: THREE.Light) => boolean,
  ): FrozenShadow[] {
    const states: FrozenShadow[] = [];
    this.lightRoot.traverse((object) => {
      if (!(object instanceof THREE.Light) || !object.castShadow) return;
      if (allow(object)) return;
      const withShadow = object as THREE.Light & {
        shadow?: THREE.LightShadow<THREE.Camera>;
      };
      const shadow = withShadow.shadow;
      if (!shadow) return;
      states.push({
        shadow,
        autoUpdate: shadow.autoUpdate,
        needsUpdate: shadow.needsUpdate,
      });
      shadow.autoUpdate = false;
      shadow.needsUpdate = false;
    });
    return states;
  }

  private restoreFrozenShadows(states: readonly FrozenShadow[]): void {
    for (const state of states) {
      state.shadow.autoUpdate = state.autoUpdate;
      state.shadow.needsUpdate = state.needsUpdate;
    }
  }

  private renderOffscreenShadowPass(includeActors: boolean): void {
    const bakeCamera = this.staticShadowBakeCamera;
    bakeCamera.layers.set(0);
    if (includeActors) bakeCamera.layers.enable(EMBER_DYNAMIC_ACTOR_LAYER);
    bakeCamera.position.set(1_000_000, 1_000_000, 1_000_000);
    bakeCamera.lookAt(1_000_001, 1_000_000, 1_000_000);
    bakeCamera.updateProjectionMatrix();
    bakeCamera.updateMatrixWorld(true);
    this.staticShadowBakeTarget ??= new THREE.WebGLRenderTarget(1, 1, {
      depthBuffer: false,
      stencilBuffer: false,
    });
    const previousTarget = this.renderer.getRenderTarget();
    try {
      this.renderer.setRenderTarget(this.staticShadowBakeTarget);
      this.renderer.shadowMap.needsUpdate = true;
      this.renderer.render(this.scene, bakeCamera);
    } finally {
      this.renderer.setRenderTarget(previousTarget);
    }
  }

  private pointShadowCacheId(light: THREE.PointLight): string {
    return this.localShadowMapBank.cacheIdFor(light);
  }

  private atlasBlitSlotIds(
    slotIds: readonly (string | null)[],
  ): (string | null)[] {
    const gpu = this.localShadowMapBank.atlas();
    const dynamic = new Set(
      this.dynamicLocalLights.map((light) => this.pointShadowCacheId(light)),
    );
    return slotIds.map((id) => {
      if (!id || !gpu) return id;
      const dyn = pointShadowDynamicCacheId(id);
      if (dynamic.has(id) && gpu.hasCacheTile(dyn)) return dyn;
      return id;
    });
  }

  private presentPointShadowAtlas(): void {
    const presented = presentBoundPointShadowAtlas({
      gpu: this.localShadowMapBank.atlas(),
      lights: this.localShadowCandidates,
      focus: this.player?.mesh.position ?? null,
      slotIds: this.atlasSlotIds,
      blitDirty: this.atlasBlitDirty,
      renderer: this.renderer,
      blitSlotIds: (slotIds) => this.atlasBlitSlotIds(slotIds),
    });
    this.atlasSlotIds = presented.slotIds;
    this.atlasBlitDirty = presented.blitDirty;
  }

  private bakeStaticPointShadows(): boolean {
    if (
      (!this.staticShadowDirty && !this.sunShadowDirty) ||
      !this.terrainSettled ||
      !this.staticPropsSettled
    ) {
      return false;
    }

    const sun = this.keyLight;
    const gpu = this.localShadowMapBank.atlas();
    const dirtyLights =
      this.localPointShadowLimit > 0
        ? this.localShadowMapBank.dirtyLights()
        : [];
    const batchSize = 1;
    const batch = dirtyLights.slice(0, batchSize);
    const includeSun = this.sunShadowDirty && sun?.castShadow === true;

    let rendered = false;
    let warmupNow = false;
    withCutawayCastersVisible(this.cutawayTagged, () => {
      this.localShadowMapBank.prepareStaticBatch(batch);
      if (includeSun && sun) {
        const frozen = this.freezeShadowsExcept((light) => light === sun);
        sun.shadow.autoUpdate = false;
        sun.shadow.needsUpdate = true;
        try {
          this.renderOffscreenShadowPass(false);
          rendered = true;
        } finally {
          this.restoreFrozenShadows(frozen);
          sun.shadow.needsUpdate = false;
        }
      }
      if (gpu) {
        for (const light of batch) {
          const tile = gpu.ensureCacheTile(this.pointShadowCacheId(light));
          try {
            bakePointShadowCacheTile({
              renderer: this.renderer,
              scene: this.scene,
              light,
              target: tile,
              faceSize: gpu.layout.faceSize,
              includeActors: false,
            });
          } catch (err) {
            console.warn("[ember] point-shadow bake failed", err);
          }
          rendered = true;
        }
      }
      this.localShadowMapBank.captureStaticBatch(batch);
      this.atlasBlitDirty = true;
      this.sunShadowDirty = false;
      this.staticShadowDirty =
        this.localPointShadowLimit > 0 &&
        this.localShadowMapBank.dirtyLights().length > 0;
      this.localShadowMapBank.applyAssignments(
        this.localShadowCandidates,
        this.dynamicLocalLights,
      );
      this.localShadowDebug.update(this.dynamicLocalLights);
      warmupNow = !this.staticShadowDirty;
    });
    if (warmupNow) this.completeShadowWarmup();
    else this.emitLoadProgress();
    return rendered;
  }

  private completeShadowWarmup(): void {
    if (this.shadowWarmupComplete) return;
    if (!this.disposed) {
      this.shaderCompiling = true;
      this.lastLoadRatio = -1;
      this.emitLoadProgress();
      this.bakeDynamicLocalPointShadows(true);
      this.primePlayPresent();
      this.shaderCompiling = false;
    }
    this.shadowWarmupComplete = true;
    this.emitLoadProgress();
    this.shadowReadyResolve();
  }

  private waterReflectionCameraMoved(): boolean {
    if (!this.hasWaterReflectionCameraPose) return true;
    if (
      this.camera.position.distanceToSquared(
        this.lastWaterReflectionCameraPosition,
      ) > 1e-8
    ) {
      return true;
    }
    return (
      1 -
        Math.abs(
          this.camera.quaternion.dot(
            this.lastWaterReflectionCameraQuaternion,
          ),
        ) >
      1e-10
    );
  }

  private noteWaterReflectionCameraPose(): void {
    this.lastWaterReflectionCameraPosition.copy(this.camera.position);
    this.lastWaterReflectionCameraQuaternion.copy(this.camera.quaternion);
    this.hasWaterReflectionCameraPose = true;
  }

  private primePlayPresent(): void {
    this.camera.updateMatrixWorld(true);
    this.renderer.compile(this.scene, this.camera);
    this.presentPointShadowAtlas();
    if (this.waterReflect) {
      this.waterReflect.render(this.renderer, this.scene, this.camera);
      this.lastWaterReflectionMs = this.nowMs;
      this.waterReflectionPresentedAtMs = this.nowMs;
      this.waterReflectionUpdatedThisFrame = true;
      this.noteWaterReflectionCameraPose();
    }
    this.post.render();
  }

  private emitLoadProgress(): void {
    if (this.disposed) return;
    const bank = this.localShadowMapBank.stats();
    const terrain = this.terrainChunks?.getStreamingStats();
    const terrainFrac = this.terrainSettled
      ? 1
      : terrain && terrain.totalChunks > 0
        ? Math.min(
            0.98,
            Math.max(0, terrain.totalChunks - terrain.pendingChunks) /
              terrain.totalChunks,
          )
        : 0;
    const progress = emberWorldLoadProgress({
      terrainSettled: this.terrainSettled,
      staticPropsSettled: this.staticPropsSettled,
      lightsReady: this.localLightsSpawned,
      shadowCached: bank.cached,
      shadowTotal: Math.max(this.localPointShadowLimit, bank.cached + bank.dirty),
      warmupComplete: this.shadowWarmupComplete,
      compiling: this.shaderCompiling,
      terrainFrac,
    });
    if (
      !this.shadowWarmupComplete &&
      progress.labelRu === this.lastLoadLabel &&
      Math.abs(progress.ratio - this.lastLoadRatio) < 0.01
    ) {
      return;
    }
    this.lastLoadRatio = progress.ratio;
    this.lastLoadLabel = progress.labelRu;
    this.onBridge({
      type: "load_progress",
      ratio: progress.ratio,
      labelRu: progress.labelRu,
    });
  }

  private bakeDynamicLocalPointShadows(staticJustBaked: boolean): void {
    const lightCfg = resolveMapLight(this.map);
    this.localShadowActorFocuses.length = 0;
    for (const enemy of this.enemies) {
      if (!enemy.dead) this.localShadowActorFocuses.push(enemy.mesh.position);
    }
    for (const npc of this.npcs) {
      if (!npc.dead) this.localShadowActorFocuses.push(npc.mesh.position);
    }
    const picked = pickDynamicPointShadowLightsFrom(
      this.localShadowCandidates,
      this.player.mesh.position,
      {
        maxLights: dynamicLocalShadowLimitForCrowd(
          Math.min(
            lightCfg.dynamicPointShadows,
            this.localPointShadowLimit,
            DYNAMIC_LOCAL_SHADOW_MAX_LIGHTS,
          ),
          this.enemies.length,
        ),
        previous: this.dynamicLocalLights,
        enterScale: lightCfg.dynamicShadowEnterScale,
        exitScale: lightCfg.dynamicShadowExitScale,
        actorFocuses: this.localShadowActorFocuses,
        camera: this.camera,
      },
    );
    const selected = picked.filter(
      (light) =>
        !pointLightActorRecookBlocked(
          light,
          this.player.mesh.position,
          this.player.radius,
          this.localShadowActorFocuses,
        ),
    );
    const selectionChanged = !samePointLights(
      selected,
      this.dynamicLocalLights,
    );
    const assignment = this.localShadowMapBank.applyAssignments(
      this.localShadowCandidates,
      selected,
    );

    const actorsMoved =
      this.localShadowActorsMoved || this.chestOpens.length > 0;
    this.localShadowSkip += 1;
    const lampDue =
      selectionChanged ||
      assignment.enteredDynamic.length > 0 ||
      staticJustBaked ||
      (actorsMoved && (this.localShadowSkip & 1) === 0);
    if (selected.length > 0 && lampDue) {
      const gpu = this.localShadowMapBank.atlas();
      if (gpu) {
        withCutawayCastersVisible(this.cutawayTagged, () => {
          for (const light of selected) {
            const tile = gpu.ensureCacheTile(
              pointShadowDynamicCacheId(this.pointShadowCacheId(light)),
            );
            try {
              bakePointShadowCacheTile({
                renderer: this.renderer,
                scene: this.scene,
                light,
                target: tile,
                faceSize: gpu.layout.faceSize,
                includeActors: true,
              });
            } catch (err) {
              console.warn("[ember] point-shadow recook failed", err);
            }
          }
        });
        this.atlasBlitDirty = true;
      }
    }

    this.dynamicLocalLights = selected;
    this.localShadowDebug.update(selected);
    this.localShadowActorsMoved = false;
  }

  private removeActor(a: Actor): void {
    a.dead = true;
    a.outline?.dispose();
    a.outline = null;
    const pooledTransient =
      a.kind === "bullet" ||
      a.kind === "ebullet" ||
      a.kind === "gem" ||
      a.kind === "orbit";
    if (a.enemyBillboard) {
      this.enemyBillboards.remove(a.enemyBillboard);
      a.enemyBillboard = undefined;
    } else if (a.effectBillboard) {
      this.effectBillboards.remove(a.effectBillboard);
      a.effectBillboard = undefined;
    } else {
      this.entityRoot.remove(a.mesh);
      this.disposeObject(a.mesh);
    }
    if (a.kind === "enemy" && a.enemyIndex != null) {
      const index = a.enemyIndex;
      const last = this.enemies.pop();
      if (last && last !== a) {
        this.enemies[index] = last;
        last.enemyIndex = index;
      }
      a.enemyIndex = undefined;
      this.enemySpatialDirty = true;
    }
    if (
      (a.kind === "bullet" || a.kind === "ebullet") &&
      a.projectileIndex != null
    ) {
      const index = a.projectileIndex;
      const last = this.projectiles.pop();
      if (last && last !== a) {
        this.projectiles[index] = last;
        last.projectileIndex = index;
      }
      a.projectileIndex = undefined;
    }
    if (a.kind === "gem" && a.gemIndex != null) {
      const index = a.gemIndex;
      const last = this.gems.pop();
      if (last && last !== a) {
        this.gems[index] = last;
        last.gemIndex = index;
      }
      a.gemIndex = undefined;
    }
    if (a.kind === "npc") {
      const index = this.npcs.indexOf(a);
      if (index >= 0) this.npcs.splice(index, 1);
    }
    if (a.actorIndex != null) {
      const index = a.actorIndex;
      const last = this.actors.pop();
      if (last && last !== a) {
        this.actors[index] = last;
        last.actorIndex = index;
      }
      a.actorIndex = undefined;
    }
    if (pooledTransient) this.transientActors.release(a);
  }

  private tickInteractiveOutlines(): void {
    const t = this.nowMs / 1000;
    for (const a of this.actors) {
      if (!a.outline || a.kind !== "chest" || a.dead) continue;
      if (a.regionId && this.openedChestKeys.has(chestKey(this.map.id, a.regionId))) {
        a.outline.setCanInteract(false);
        a.outline.tick(t);
        continue;
      }
      const dist = Math.hypot(a.lx - this.player.lx, a.ly - this.player.ly);
      const region = a.regionId
        ? this.map.regions.find((item) => item.id === a.regionId)
        : undefined;
      const interactionElev = region
        ? regionVolumeElev(this.map, region)
        : a.elev;
      a.outline.setCanInteract(
        dist <= CHEST_INTERACT_R &&
          elevNearlyEqual(interactionElev, this.playerElev),
      );
      a.outline.tick(t);
    }
  }

  private syncActor(a: Actor): void {
    this.syncActorAt(
      a,
      a.lx,
      a.ly,
      a.kind === "player" ? this.playerFeetElev : a.elev,
    );
  }

  private syncActorAt(a: Actor, lx: number, ly: number, feetElev: number): void {
    const yLift =
      a.kind === "player"
        ? 5
        : a.kind === "chest" && a.mesh.userData.voxelChest
          ? 0
          : 4;
    const p = logicToThree(lx, ly, feetElev, yLift, this.map.tileSize);
    const targetX = p.x + (a.spriteOffsetX ?? 0);
    const targetY = p.y + (a.spriteOffsetY ?? 0);
    const targetZ = p.z + (a.spriteOffsetZ ?? 0);
    const moved =
      Math.abs(a.mesh.position.x - targetX) > 1e-5 ||
      Math.abs(a.mesh.position.y - targetY) > 1e-5 ||
      Math.abs(a.mesh.position.z - targetZ) > 1e-5;
    if (!moved) return;
    if (!a.enemyBillboard && !a.effectBillboard) {
      this.localShadowActorsMoved = true;
    }
    a.mesh.position.set(targetX, targetY, targetZ);
    this.enemyBillboards.markDirty(a.enemyBillboard);
    this.effectBillboards.markDirty(a.effectBillboard);
  }

  private setPlayerSupportElev(elev: number): void {
    this.playerElev = elev;
    this.player.elev = elev;
    if (elev >= this.playerFeetElev - 1e-4) {
      this.playerFeetElev = elev;
      this.playerFallVelocity = 0;
      this.playerGrounded = true;
    } else {
      this.playerGrounded = false;
    }
  }

  private resetPlayerVertical(elev: number): void {
    this.playerElev = elev;
    this.player.elev = elev;
    this.playerFeetElev = elev;
    this.playerFallVelocity = 0;
    this.playerGrounded = true;
    this.syncActor(this.player);
  }

  private tickPlayerVertical(dt: number): void {
    const next = advanceWorldFall(
      {
        feetElev: this.playerFeetElev,
        velocity: this.playerFallVelocity,
        grounded: this.playerGrounded,
      },
      this.playerElev,
      dt,
    );
    this.playerFeetElev = next.feetElev;
    this.playerFallVelocity = next.velocity;
    this.playerGrounded = next.grounded;
    this.syncActor(this.player);
  }

  private setKey(code: string, down: boolean): void {
    switch (code) {
      case "KeyW":
        this.keys.w = down;
        break;
      case "KeyA":
        this.keys.a = down;
        break;
      case "KeyS":
        this.keys.s = down;
        break;
      case "KeyD":
        this.keys.d = down;
        break;
      case "Space":
        if (down && !this.keys.space) this.jumpQueued = true;
        this.keys.space = down;
        break;
      case "KeyQ":
        this.keys.q = down;
        break;
      case "KeyE":
        this.keys.e = down;
        break;
      default:
        break;
    }
  }

  private onResize(): void {
    if (this.disposed) return;
    const w = this.parent.clientWidth || 960;
    const h = this.parent.clientHeight || 640;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    this.post.setSize(w, h);
    if (this.waterReflect) {
      const res = waterReflectionResolution(
        w,
        h,
        maxWaterReflectMult(this.waterMats),
      );
      this.waterReflect.setResolution(res.width, res.height);
    }
    this.syncPointerLock();
  }

  private overlayFlags(): PlayOverlayFlags {
    return {
      pausedLogic: this.pausedLogic,
      shopOpen: this.shopOpen,
      inventoryOpen: this.inventoryOpen,
      dialogueOpen: this.dialogueOpen,
      awaitingLoot: this.awaitingLoot,
      finished: this.finished,
      fadeBusy: mapFadeBusy(this.mapFade),
    };
  }

  private refreshCutawayTagged(): void {
    this.cutawayTagged = [];
    if (this.mapGroup) {
      this.cutawayTagged.push(...collectCutawayTagged(this.mapGroup));
    }
    this.cutawayTagged.push(...collectCutawayTagged(this.staticPropRoot));
    this.lastCutawayKey = "";
  }

  private applyPlayInteriorCutaway(): void {
    if (!this.mapGroup) return;
    const { tx, ty } = worldToTile(this.map, this.player.lx, this.player.ly);
    const yaw = Math.atan2(
      this.camera.position.x - this.controls.target.x,
      this.camera.position.z - this.controls.target.z,
    );
    const key = playCutawayCacheKey(this.map, tx, ty, yaw);
    if (key === this.lastCutawayKey) return;
    this.lastCutawayKey = key;
    const hide = buildCutawayHideSet(this.map, this.tileset, tx, ty, yaw);
    applyInteriorCutawayTagged(this.cutawayTagged, hide);
  }

  /** Apply all raw pointer deltas once per render frame. */
  private consumePendingLookInput(): void {
    const movementX = this.pendingLookMovementX;
    const movementY = this.pendingLookMovementY;
    this.pendingLookMovementX = 0;
    this.pendingLookMovementY = 0;
    const sens =
      PLAY_CAMERA_YAW_SENSITIVITY * this.cameraRig.mouseSensitivity;
    const yaw = playCameraYawFromMovement(movementX, sens);
    const pitch = this.cameraRig.pitchLock
      ? 0
      : playCameraPitchFromMovement(movementY, sens);
    if (yaw === 0 && pitch === 0) {
      if (!this.lookWarpPending) return;
      this.lookWarpPending = false;
      const locked = this.hasLookLock();
      const warped = warpPlayCursorIfNeeded(true, locked);
      this.lookWarpSkip = playLookWarpSkipCount(locked, warped);
      return;
    }
    this.lookOffset.copy(this.camera.position).sub(this.controls.target);
    if (yaw !== 0) {
      this.lookOffset.applyAxisAngle(this.lookAxis, yaw);
    }
    if (pitch !== 0) {
      const right = new THREE.Vector3()
        .crossVectors(this.lookOffset, this.lookAxis)
        .normalize();
      if (right.lengthSq() > 1e-6) {
        this.lookOffset.applyAxisAngle(right, pitch);
      }
      const sph = new THREE.Spherical().setFromVector3(this.lookOffset);
      sph.phi = THREE.MathUtils.clamp(
        sph.phi,
        this.cameraRig.polarMin,
        this.cameraRig.polarMax,
      );
      sph.radius = this.followDist;
      this.lookOffset.setFromSpherical(sph);
    }
    this.camera.position.copy(this.controls.target).add(this.lookOffset);
    if (!this.lookWarpPending) return;
    this.lookWarpPending = false;
    const locked = this.hasLookLock();
    const warped = warpPlayCursorIfNeeded(true, locked);
    this.lookWarpSkip = playLookWarpSkipCount(locked, warped);
  }

  private tick(): void {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.tick);
    if (this.contextLost) return;
    this.profiler.beginFrame();
    const profileWork = this.profiler.isVisible();
    if (profileWork) {
      for (const key of Object.keys(this.profilerWork) as Array<
        keyof typeof this.profilerWork
      >) {
        this.profilerWork[key] = 0;
      }
    }
    const dt = Math.min(0.05, this.clock.getDelta());
    this.nowMs += dt * 1000;
    let workStartedAt = profileWork ? performance.now() : 0;
    this.tickMapFade(dt);

    if (
      this.shadowWarmupComplete &&
      !playMovementFrozen(this.overlayFlags())
    ) {
      this.elapsed += dt;
      this.handleMove(dt);
      this.tickPlayerVertical(dt);
      this.tickTeleport(dt);
      this.tickMapChangeEnter(dt);
      this.tickTriggerRegions(dt);
      if (profileWork) {
        this.profilerWork.worldMs += performance.now() - workStartedAt;
        workStartedAt = performance.now();
      }
      this.tickWeapons(dt);
      if (profileWork) {
        this.profilerWork.weaponsMs = performance.now() - workStartedAt;
        workStartedAt = performance.now();
      }
      this.tickBullets(dt);
      if (profileWork) {
        this.profilerWork.bulletsMs = performance.now() - workStartedAt;
        workStartedAt = performance.now();
      }
      this.tickOrbitals();
      if (profileWork) {
        this.profilerWork.orbitalsMs = performance.now() - workStartedAt;
        workStartedAt = performance.now();
      }
      this.tickSpawns(dt);
      if (profileWork) {
        this.profilerWork.spawnsMs = performance.now() - workStartedAt;
        workStartedAt = performance.now();
      }
      this.tickEnemyAi(dt);
      this.tickNpcs(dt);
      if (profileWork) {
        this.profilerWork.aiMs += performance.now() - workStartedAt;
        workStartedAt = performance.now();
      }
      this.tickChestPickup();
      this.tickGems();
      this.tickTileSemantics();
      this.tickFilth();
      if (this.duration > 0 && this.elapsed >= this.duration) {
        this.finish("clear");
      }
    } else {
      if (profileWork) {
        this.profilerWork.worldMs += performance.now() - workStartedAt;
        workStartedAt = performance.now();
      }
      this.tickOrbitals();
      if (profileWork) {
        this.profilerWork.orbitalsMs = performance.now() - workStartedAt;
        workStartedAt = performance.now();
      }
    }
    // Keep lid anim running even while loot UI is up (rare) / between frames.
    this.tickChestOpens(dt);
    if (profileWork) {
      this.profilerWork.worldMs += performance.now() - workStartedAt;
      workStartedAt = performance.now();
    }
    this.updateTerrainStreaming();
    if (profileWork) {
      this.profilerWork.terrainMs = performance.now() - workStartedAt;
      workStartedAt = performance.now();
    }

    // Follow player: translate target + camera together so orbit radius stays put.
    const focus = logicToThree(
      this.player.lx,
      this.player.ly,
      this.playerFeetElev,
      this.cameraRig.lookHeight,
      this.map.tileSize,
    );
    this.followTarget.set(focus.x, focus.y, focus.z);

    this.consumePendingLookInput();

    if (this.keys.q || this.keys.e) {
      const sign = this.keys.q ? -1 : 1;
      this.lookOffset.copy(this.camera.position).sub(this.controls.target);
      this.lookOffset.applyAxisAngle(this.lookAxis, sign * dt * 1.4);
      this.camera.position.copy(this.controls.target).add(this.lookOffset);
    }

    const prevX = this.controls.target.x;
    const prevY = this.controls.target.y;
    const prevZ = this.controls.target.z;
    const followDt = Math.min(dt, 1 / 30);
    const followAlpha = 1 - Math.pow(0.0002, followDt);
    this.controls.target.lerp(this.followTarget, followAlpha);
    this.camera.position.x += this.controls.target.x - prevX;
    this.camera.position.y += this.controls.target.y - prevY;
    this.camera.position.z += this.controls.target.z - prevZ;
    this.controls.update();
    this.applyPlayInteriorCutaway();
    if (profileWork) {
      this.profilerWork.cameraMs = performance.now() - workStartedAt;
    }

    // Sprites stay upright: yaw toward camera only (no pitch tip).
    const billboardsStartedAt = profileWork ? performance.now() : 0;
    this.enemyBillboards.sync(this.camera);
    this.effectBillboards.sync(this.camera);
    updateYawBillboards(this.entityRoot, this.camera);
    if (profileWork) {
      this.profilerWork.billboardsMs =
        performance.now() - billboardsStartedAt;
    }
    const environmentStartedAt = profileWork ? performance.now() : 0;
    this.atmosphere.tick(dt, this.nowMs / 1000, this.camera);
    this.tickEmissiveAnims(dt);
    this.tickTorchFlickerAnims();
    if (this.waterMats.length) tickWaterMaterials(this.waterMats, this.nowMs / 1000);
    this.tickInteractiveOutlines();
    if (profileWork) {
      this.profilerWork.environmentMs =
        performance.now() - environmentStartedAt;
    }

    // Cached sun bake + lamp cubes. Radius flicker only changes light cutoff.
    const shadowsStartedAt = profileWork ? performance.now() : 0;
    const warming = !this.shadowWarmupComplete;
    const staticJustBaked = this.bakeStaticPointShadows();
    if (!warming && this.shadowWarmupComplete) {
      this.bakeDynamicLocalPointShadows(staticJustBaked);
    }
    if (profileWork) {
      this.profilerWork.shadowsMs = performance.now() - shadowsStartedAt;
    }
    if (warming) {
      this.profiler.beginGpu();
      this.profiler.endGpu();
      this.profiler.endFrame(
        profileWork ? this.profilerExtras() : undefined,
      );
      return;
    }

    // Dynamic lamp cubes are rendered explicitly above. Only an authored
    // opening chest still asks Three.js for the legacy full shadow refresh.
    if (this.chestOpens.length > 0) {
      this.renderer.shadowMap.needsUpdate = true;
    }

    const hudStartedAt = profileWork ? performance.now() : 0;
    this.hudAcc += dt * 1000;
    if (this.hudAcc > 100) {
      this.hudAcc = 0;
      this.emitHud();
    }
    if (profileWork) {
      this.profilerWork.hudMs = performance.now() - hudStartedAt;
    }

    this.profiler.beginGpu();
    this.waterReflectionUpdatedThisFrame = false;
    const reflectionCameraMoved = this.waterReflectionCameraMoved();
    const reflectionIntervalMs = runtimeReflectionIntervalMs(
      this.enemies.length,
      reflectionCameraMoved,
    );
    if (
      this.waterReflect &&
      shouldRenderRuntimeReflection(
        this.nowMs,
        this.lastWaterReflectionMs,
        this.enemies.length,
        reflectionCameraMoved,
      )
    ) {
      this.camera.updateMatrixWorld(true);
      const reflectionStartedAt = profileWork ? performance.now() : 0;
      this.waterReflect.render(this.renderer, this.scene, this.camera);
      if (profileWork) {
        this.profilerWork.reflectionMs =
          performance.now() - reflectionStartedAt;
      }
      this.lastWaterReflectionMs = advanceRuntimeReflectionClock(
        this.nowMs,
        this.lastWaterReflectionMs,
        reflectionIntervalMs,
      );
      this.waterReflectionPresentedAtMs = this.nowMs;
      this.waterReflectionUpdatedThisFrame = true;
      this.noteWaterReflectionCameraPose();
    }
    const mainRenderStartedAt = profileWork ? performance.now() : 0;
    this.presentPointShadowAtlas();
    this.post.render();
    if (profileWork) {
      this.profilerWork.mainRenderMs =
        performance.now() - mainRenderStartedAt;
    }
    this.profiler.endGpu();
    let profilerExtras: EmberProfilerExtras | undefined;
    if (profileWork) {
      const profilerStartedAt = performance.now();
      profilerExtras = this.profilerExtras();
      this.profilerWork.profilerMs = performance.now() - profilerStartedAt;
    }
    this.profiler.endFrame(profilerExtras);
  }

  private profilerExtras(): EmberProfilerExtras {
    const terrain = this.terrainChunks?.getStreamingStats();
    const shadowBank = this.localShadowMapBank.stats();
    const enemyBatchStats = this.enemyBillboards.stats();
    const effectBatchStats = this.effectBillboards.stats();
    const transientPoolStats = this.transientActors.stats();
    let activeLights = 0;
    let shadowLights = 0;
    this.lightRoot.traverse((object) => {
      const light = object as THREE.Light;
      if (!light.isLight || !light.visible) return;
      activeLights += 1;
      if (light.castShadow) shadowLights += 1;
    });
    const dynamicIds = this.dynamicLocalLights
      .map((light, index) => {
        const lamp = light.userData.emberLamp as
          | { sourceId?: string }
          | undefined;
        return (
          lamp?.sourceId ??
          (light.userData.emberEmissiveSourceId as string | undefined) ??
          `local-${index + 1}`
        );
      })
      .join(", ");
    return {
      chunks: terrain
        ? {
            loaded: terrain.loadedChunks,
            desired: terrain.desiredChunks,
            pending: terrain.pendingChunks,
            total: terrain.totalChunks,
          }
        : undefined,
      workers: terrain
        ? { active: terrain.workerCount, jobs: terrain.workerJobs }
        : undefined,
      lights: {
        active: activeLights,
        shadows: shadowLights,
        dynamicPointShadows: this.dynamicLocalLights.length,
        dynamicIds,
        cachedPointShadows: shadowBank.cached,
        dirtyPointShadows: shadowBank.dirty,
        atlasSlots: POINT_SHADOW_SHADER_SLOTS,
        atlasOccupied: this.atlasSlotIds.filter(Boolean).length,
        atlasCached: shadowBank.atlasTiles,
      },
      actors: {
        enemies: this.enemies.length,
        npcs: this.npcs.length,
        batches: enemyBatchStats.batches,
        bullets: this.projectiles.length,
        bulletCollisionExact: this.bulletExactCollisionChecksLastFrame,
        bulletCollisionOpen: this.bulletOpenFieldMovesLastFrame,
        effects: this.gems.length + this.orbitals.length,
        logicHz: Math.round(1 / ENEMY_AI_STEP),
        logicSteps: this.enemyAiStepsLastFrame,
        spatialBuckets: this.enemySpatial.stats().buckets,
        effectBatches: effectBatchStats.batches,
        effectInstances: effectBatchStats.instances,
        pooledTransient: transientPoolStats.available,
        createdTransient: transientPoolStats.created,
        stressTarget: this.stressEnemyTarget || undefined,
        stressNoXp: this.stressNoXp || undefined,
        physicsMoves: this.enemyPhysicsMovesLastFrame,
        openFieldMoves: this.enemyOpenFieldMovesLastFrame,
        kinematicMoves: this.enemyKinematicMovesLastFrame,
        deferredCollisionMoves: this.enemyDeferredCollisionMovesLastFrame,
        heightTransitionMoves: this.enemyHeightTransitionMovesLastFrame,
        heightTransitionDeferred:
          this.enemyHeightTransitionDeferredLastFrame,
        contactSkips: this.enemyContactSkipsLastFrame,
        cadenceFull: this.enemyCadenceLastFrame.full,
        cadenceHalf: this.enemyCadenceLastFrame.half,
        cadenceThird: this.enemyCadenceLastFrame.third,
        cadenceQuarter: this.enemyCadenceLastFrame.quarter,
        avoidanceActors: this.enemyAvoidanceActorsLastFrame,
        avoidanceNeighbors: this.enemyAvoidanceNeighborsLastFrame,
        flowGuided: this.enemyFlowGuidedLastFrame,
        flowMisses: this.enemyFlowMissesLastFrame,
        flowReachableCells: this.enemyCrowdFlow.reachableCells,
        flowRebuilds: this.enemyFlowRebuildsLastFrame,
        flowRoutesUsed: countSetBits(this.enemyFlowRouteMaskLastFrame),
        flowRoutesAvailable: this.enemyCrowdFlow.connectorGroupCount,
        flowBakedCells: this.enemyCrowdOpenField.open.length,
        flowBakedTransitions: this.enemyCrowdOpenField.transitionCount,
        flowTargets: this.enemyCrowdFlow.targetCount,
        flowComponents: this.enemyCrowdFlow.componentCount,
        flowFallbackDistanceCells:
          this.enemyCrowdFlow.targetFallbackDistanceCells,
      },
      renderables: this.profilerRenderableCounts(),
      reflection: this.waterReflect
        ? {
            updated: this.waterReflectionUpdatedThisFrame,
            ageMs: Math.max(
              0,
              this.nowMs - this.waterReflectionPresentedAtMs,
            ),
          }
        : undefined,
      work: this.profilerWork,
      look: { locked: this.hasLookLock() },
    };
  }

  private profilerRenderableCounts(): {
    terrain: number;
    props: number;
    overlays: number;
    instances: number;
  } {
    if (this.nowMs - this.profilerRenderableCache.updatedAt < 500) {
      return this.profilerRenderableCache;
    }
    let terrain = 0;
    let props = 0;
    let instances = 0;
    this.mapGroup?.traverse((object) => {
      if ((object as THREE.Mesh).isMesh) terrain += 1;
    });
    this.staticPropRoot.traverse((object) => {
      if (object instanceof THREE.InstancedMesh) {
        instances += 1;
        return;
      }
      if ((object as THREE.Mesh).isMesh) props += 1;
    });
    this.profilerRenderableCache = {
      updatedAt: this.nowMs,
      terrain,
      props,
      overlays: this.cutawayTagged.length,
      instances,
    };
    return this.profilerRenderableCache;
  }

  private tickTorchFlickerAnims(): void {
    if (!this.lanternLights.length) return;
    const light = resolveMapLight(this.map);
    tickTorchFlicker(this.lanternLights, {
      timeSec: this.nowMs / 1000,
      amount: light.torchFlicker,
      speed: light.torchFlickerSpeed,
    });
  }

  private tickEmissiveAnims(dt: number): void {
    if (!this.emissiveMats.length && !this.emissiveLights.length) return;
    const ts = this.map.tileSize;
    const playerTiles = [
      { x: this.player.lx / ts, y: this.player.ly / ts },
    ];
    const light = resolveMapLight(this.map);
    const ctx = {
      timeSec: this.nowMs / 1000,
      dt,
      playerTiles,
      enemyProximityAmount: this.emissiveEnemyProximityAmount,
      activeEventIds: this.activeEmissiveEvents,
      torchFlickerAmount: light.torchFlicker,
      torchFlickerSpeed: light.torchFlickerSpeed,
    };
    if (this.emissiveMats.length) tickEmissiveMaterials(this.emissiveMats, ctx);
    if (this.emissiveLights.length) {
      tickEmissiveLights(this.emissiveLights, ctx);
    }
  }

  private readonly emissiveEnemyProximityAmount = (
    tx: number,
    ty: number,
    radius: number,
  ): number => {
    const ts = this.map.tileSize;
    const cx = tx + 0.5;
    const cy = ty + 0.5;
    const radiusSq = radius * radius;
    let best = 0;
    this.enemySpatial.visitRadius(
      cx * ts,
      cy * ts,
      radius * ts,
      (enemy) => {
        if (enemy.dead) return false;
        const dx = enemy.lx / ts - cx;
        const dy = enemy.ly / ts - cy;
        const distanceSq = dx * dx + dy * dy;
        if (distanceSq >= radiusSq) return false;
        const linear = 1 - Math.sqrt(distanceSq) / radius;
        const soft = emissiveSmoothstep(linear);
        best = Math.max(best, soft * soft);
        return best >= 1 - 1e-8;
      },
    );
    return best;
  };

  private currentGroundTile() {
    const { tx, ty } = worldToTile(this.map, this.player.lx, this.player.ly);
    return groundTileAt(this.map, this.tileset, tx, ty);
  }

  private handleMove(dt: number): void {
    // Camera-relative WASD on XZ
    let ix = 0;
    let iz = 0;
    if (this.keys.a) ix -= 1;
    if (this.keys.d) ix += 1;
    if (this.keys.w) iz -= 1;
    if (this.keys.s) iz += 1;
    let vx = 0;
    let vy = 0;
    if (ix !== 0 || iz !== 0) {
      const len = Math.hypot(ix, iz) || 1;
      ix /= len;
      iz /= len;
      const yaw = this.controls.getAzimuthalAngle();
      // Forward is -Z in camera space projected to map Y
      vx = ix * Math.cos(yaw) + iz * Math.sin(yaw);
      vy = -ix * Math.sin(yaw) + iz * Math.cos(yaw);
      this.lastFacingX = vx;
      this.lastFacingY = vy;
      this.lastAim = Math.atan2(vy, vx);
    }

    this.jumpCd = Math.max(0, this.jumpCd - dt);
    if (this.jumpQueued && this.jumpCd <= 0 && this.playerGrounded) {
      this.jumpQueued = false;
      const jumped = jumpLedgeVoxels(
        this.map,
        this.tileset,
        this.player.lx,
        this.player.ly,
        this.playerElev,
        this.lastFacingX,
        this.lastFacingY,
        PLAYER_BODY_R,
        this.pack.sprites,
        this.pack.voxelModels,
        this.pack.voxelScenes,
        this.stage.playerBody,
      );
      if (jumped) {
        this.player.lx = jumped.x;
        this.player.ly = jumped.y;
        this.setPlayerSupportElev(jumped.elev);
        this.jumpCd = 0.35;
        return;
      }
    }
    this.jumpQueued = false;

    const tile = this.currentGroundTile();
    const tileSlow =
      typeof tile?.slow === "object"
        ? (tile.slow.multiplier ?? 0.7)
        : tile?.slow
          ? 0.7
          : 1;
    const filthSlow = this.nowMs < this.filthUntil ? 0.7 : 1;
    const speed = this.stage.moveSpeed * this.moveMul * filthSlow * tileSlow;
    const pos = moveWithVoxels(
      this.map,
      this.tileset,
      this.player.lx,
      this.player.ly,
      this.player.lx + vx * speed * dt,
      this.player.ly + vy * speed * dt,
      PLAYER_BODY_R,
      this.playerElev,
      this.pack.sprites,
      this.pack.voxelModels,
      this.pack.voxelScenes,
      this.stage.playerBody,
    );
    this.player.lx = pos.x;
    this.player.ly = pos.y;
    this.setPlayerSupportElev(pos.elev);
  }

  private tickTeleport(dt: number): void {
    this.teleportCd = Math.max(0, this.teleportCd - dt);
    const stepped = stepTeleport(
      this.map,
      this.player.lx,
      this.player.ly,
      this.teleportOccupyId,
      this.teleportCd <= 0,
      this.playerElev,
    );
    this.teleportOccupyId = stepped.occupyingId;
    const dest = stepped.warp;
    if (!dest) return;
    this.player.lx = dest.x;
    this.player.ly = dest.y;
    this.resetPlayerVertical(dest.elev);
    this.teleportCd = 0.45;
  }

  private tickMapChangeEnter(dt: number): void {
    this.mapChangeCd = Math.max(0, this.mapChangeCd - dt);
    if (this.mapChangeOccupyId) {
      const held = this.map.regions.find(
        (region) =>
          region.id === this.mapChangeOccupyId && region.kind === "trigger",
      );
      if (
        !held ||
        !pointInRegion(this.map, held, this.player.lx, this.player.ly, this.playerElev)
      ) {
        this.mapChangeOccupyId = null;
      }
    }
    if (this.mapChangeCd > 0 || this.mapChangeOccupyId) return;
    if (playMovementFrozen(this.overlayFlags())) {
      return;
    }
    const region = mapChangeRegionAt(
      this.map,
      this.player.lx,
      this.player.ly,
      this.playerElev,
    );
    if (!region) return;
    const request = mapChangeRequestFromRegion(region);
    this.applyPlayMapChange(request, region.id);
  }

  private tryInteract(): void {
    if (
      !this.shadowWarmupComplete ||
      playMovementFrozen(this.overlayFlags())
    ) {
      return;
    }
    const hit = pickInteractHit(
      this.map,
      this.player.lx,
      this.player.ly,
      this.lastFacingX,
      this.lastFacingY,
      this.pack.voxelModels,
      this.playerElev,
    );
    if (!hit) return;
    switch (hit.kind) {
      case "region": {
        if (hit.region.kind === "chest") {
          this.interactPlayChest(hit.region);
          break;
        }
        if (hit.region.kind !== "trigger") return;
        const wouldFire = wouldFireForTriggerRegion(hit.region);
        this.fireInteractAction(wouldFire, hit.region, hit.region.id);
        break;
      }
      case "prop": {
        const wouldFire = wouldFireForInteractivity(
          this.map,
          hit.prop.interactivity,
        );
        const bound = boundTriggerFor(this.map, hit.prop.interactivity);
        this.fireInteractAction(
          wouldFire,
          bound,
          bound?.id ?? hit.prop.id,
          hit.prop.interactivity.scriptId,
        );
        break;
      }
      default: {
        const _never: never = hit;
        void _never;
      }
    }
  }

  private fireInteractAction(
    wouldFire: InteractivityWouldFire,
    source: EmberMap["regions"][number] | null,
    fromId: string,
    hookId?: string | null,
  ): void {
    switch (wouldFire.action) {
      case "change_map":
        this.applyPlayMapChange(
          mapChangeRequestFromWouldFire(wouldFire, source),
          fromId,
        );
        break;
      case "shop":
        this.startHook(hookId ?? null, wouldFire.shopId);
        break;
      case "talk":
        this.startHook(wouldFire.scriptId, null);
        break;
      case "run_script":
        this.startHook(wouldFire.scriptId, null);
        break;
      case "open_chest":
        this.onBridge({
          type: "toast",
          textRu: chestToastText({
            loot: wouldFire.loot,
            lootNames: wouldFire.lootNames,
            empty: wouldFire.empty,
            opened: wouldFire.opened,
            alreadyOpen: wouldFire.alreadyOpen,
            repeatable: wouldFire.repeatable,
          }),
        });
        break;
      case "warp":
        break;
      default: {
        const _never: never = wouldFire;
        void _never;
      }
    }
  }

  private applyPlayMapChange(
    request: MapChangeRequest | null,
    _fromId: string,
  ): boolean {
    if (!request) return false;
    if (mapFadeBusy(this.mapFade)) return false;
    const arrival = resolveMapChangeArrival(this.pack.maps, request);
    if (!arrival) {
      this.onBridge({
        type: "toast",
        textRu: `Карта «${request.targetMapId}» не найдена`,
      });
      return false;
    }
    const tileset = this.pack.tilesets[arrival.map.tilesetId];
    if (!tileset) {
      this.onBridge({
        type: "toast",
        textRu: `Тайлсет «${arrival.map.tilesetId}» не найден`,
      });
      return false;
    }
    this.beginPlayMapFade(arrival, tileset);
    return true;
  }

  private beginPlayMapFade(
    arrival: MapChangeArrival,
    tileset: EmberTileset,
  ): void {
    if (mapFadeBusy(this.mapFade)) return;
    this.pendingMapFade = { arrival, tileset };
    this.mapFade = beginMapFade(this.mapFade);
    this.syncMapFadeOverlay();
  }

  private mountMapFadeOverlay(): void {
    const shell = this.parent.parentElement;
    const host =
      shell instanceof HTMLElement &&
      shell.classList.contains("ember-play-shell")
        ? shell
        : this.parent;
    const el = document.createElement("div");
    el.className = "ember-map-fade";
    el.setAttribute("aria-hidden", "true");
    el.hidden = true;
    const door = document.createElement("div");
    door.className = "ember-map-fade__door";
    el.appendChild(door);
    host.appendChild(el);
    this.mapFadeEl = el;
    this.mapFadeDoorEl = door;
  }

  private tickMapFade(dt: number): void {
    if (!mapFadeBusy(this.mapFade) && !this.pendingMapFade) return;
    const wasBusy = mapFadeBusy(this.mapFade);
    const { state, swap } = stepMapFade(this.mapFade, dt * 1000);
    this.mapFade = state;
    if (swap && this.pendingMapFade) {
      const pending = this.pendingMapFade;
      this.pendingMapFade = null;
      this.reloadPlayMap(pending.arrival, pending.tileset);
    }
    this.syncMapFadeOverlay();
    if (
      wasBusy &&
      !mapFadeBusy(this.mapFade) &&
      this.scriptHeldForMapFade
    ) {
      this.scriptHeldForMapFade = false;
      this.advanceScriptQueue();
    }
  }

  private syncMapFadeOverlay(): void {
    const el = this.mapFadeEl;
    if (!el) return;
    const busy = mapFadeBusy(this.mapFade) || this.mapFade.opacity > 0;
    el.hidden = !busy;
    el.style.opacity = busy ? String(this.mapFade.opacity) : "0";
    if (this.mapFadeDoorEl) {
      this.mapFadeDoorEl.style.opacity = String(this.mapFade.door);
    }
  }

  private reloadPlayMap(
    arrival: MapChangeArrival,
    tileset: EmberTileset,
  ): void {
    const yaw = this.controls.getAzimuthalAngle();
    const polar = this.controls.getPolarAngle();
    const dist = this.controls.getDistance();

    for (const actor of [...this.actors]) {
      if (actor === this.player || actor.kind === "orbit") continue;
      this.removeActor(actor);
    }
    this.chestOpens = [];
    this.npcPlacementIds.clear();
    this.onceFired.clear();
    this.spawnAcc = [];

    if (this.staticPropFrame) cancelAnimationFrame(this.staticPropFrame);
    this.staticPropFrame = 0;
    this.staticPropQueue = [];
    for (const group of this.staticPropChunks.values()) {
      this.staticPropRoot.remove(group);
      this.disposeObject(group);
    }
    this.staticPropChunks.clear();
    this.loadedStaticPropChunkKeys.clear();

    if (this.mapGroup) {
      this.scene.remove(this.mapGroup);
      this.terrainChunks?.dispose();
      this.terrainChunks = null;
      this.mapGroup = null;
    }

    this.map = ensureMapLayers(arrival.map);
    this.cameraRig = resolvePackMapCamera(this.map, this.pack);
    this.tileset = tileset;
    this.enemyCrowdOpenField = buildEnemyCrowdOpenField(
      this.map,
      this.tileset,
      this.pack.sprites,
      this.pack.voxelModels,
      this.pack.voxelScenes,
    );
    this.enemyCrowdFlow = createEnemyCrowdFlowField(
      this.enemyCrowdOpenField,
    );
    this.terrainDatasetKey = `runtime:${this.map.id}:${this.tileset.id}`;
    this.terrainFocusChunkKey = "";
    this.terrainLoadKeySig = "";
    this.terrainRetainKeySig = "";
    this.lastCutawayKey = "";
    this.cutawayTagged = [];
    this.terrainStreaming.enabled =
      resolveMapPlayProfile(this.map) !== "explore";
    this.terrainSettled = false;
    this.staticPropsSettled = false;
    this.localLightsSpawned = false;

    this.buildMapAndLights();
    this.refreshWaterMats();
    this.player.lx = arrival.x;
    this.player.ly = arrival.y;
    this.resetPlayerVertical(arrival.elev);
    this.teleportOccupyId = findRegions(this.map, "teleport").find((region) =>
      pointInRegion(this.map, region, arrival.x, arrival.y, arrival.elev),
    )?.id ?? arrival.occupyId;
    this.mapChangeOccupyId = arrival.occupyId;
    this.mapChangeCd = MAP_CHANGE_COOLDOWN;
    this.teleportCd = MAP_CHANGE_COOLDOWN;
    this.spawnExploreNpcs();
    this.updateTerrainStreaming(true);
    this.placeChests();
    this.refreshEmissiveMats();
    this.invalidateStaticShadows();

    const focus = logicToThree(
      this.player.lx,
      this.player.ly,
      this.playerFeetElev,
      this.cameraRig.lookHeight,
      this.map.tileSize,
    );
    this.followTarget.copy(focus);
    this.controls.target.copy(focus);
    const spherical = new THREE.Spherical(
      Number.isFinite(dist) && dist > 1 ? dist : this.followDist,
      polar,
      yaw,
    );
    this.camera.position.setFromSpherical(spherical).add(this.controls.target);
    this.lookOffset.copy(this.camera.position).sub(this.controls.target);
    this.controls.update();
  }

  private tickTriggerRegions(dt: number): void {
    this.triggerCd = Math.max(0, this.triggerCd - dt);
    if (this.triggerCd > 0 || mapFadeBusy(this.mapFade)) return;
    for (const r of findRegions(this.map, "trigger")) {
      if (!pointInRegion(this.map, r, this.player.lx, this.player.ly, this.playerElev)) continue;
      const event = Object.values(this.pack.events).find(
        (ev) =>
          ev.trigger === "on_region_enter" &&
          ev.regionId === r.id &&
          (!ev.mapId || ev.mapId === this.map.id),
      );
      if (!event) continue;
      this.triggerCd = 1.2;
      this.activeEmissiveEvents.add(event.id);
      this.finished = true;
      this.syncPointerLock();
      this.onBridge({ type: "pending_event", eventId: event.id });
      return;
    }
  }

  private tickWeapons(dt: number): void {
    this.orbitAngle += dt * 2.8;
    for (const slot of this.weapons) {
      if (!isTriggeredPlayerWeapon(slot.def.kind)) continue;
      slot.cooldown -= dt * 1000;
    }
    this.triggerReadyPlayerWeapons("auto");
  }

  private triggerReadyPlayerWeapons(trigger: PlayerAttackTrigger): void {
    for (const slot of this.weapons) {
      if (!isTriggeredPlayerWeapon(slot.def.kind)) continue;
      if (
        !shouldTriggerPlayerWeapon(
          trigger,
          this.autoAttackEnabled,
          slot.cooldown,
        )
      ) {
        continue;
      }
      slot.cooldown = Math.max(200, slot.def.cooldownMs - (slot.level - 1) * 40);
      this.fireWeapon(slot);
    }
  }

  private fireWeapon(slot: WeaponSlot): void {
    const dmg =
      slot.def.damage + (slot.level - 1) * (slot.def.levelBonus?.damage ?? 0);
    const count = Math.max(
      1,
      Math.floor(
        slot.def.count + (slot.level - 1) * (slot.def.levelBonus?.count ?? 0),
      ),
    );
    const range =
      slot.def.range + (slot.level - 1) * (slot.def.levelBonus?.range ?? 0);
    const speed = Math.max(80, slot.def.speed || 200);
    switch (slot.def.kind) {
      case "projectile": {
        const target = this.nearestEnemy();
        const base = target
          ? Math.atan2(target.ly - this.player.ly, target.lx - this.player.lx)
          : this.lastAim;
        const spread = count > 1 ? 0.22 : 0;
        for (let i = 0; i < count; i++) {
          const angle = base + (i - (count - 1) / 2) * spread;
          this.spawnBullet(
            this.player.lx,
            this.player.ly,
            Math.cos(angle) * speed,
            Math.sin(angle) * speed,
            dmg,
            Math.max(0.6, range / speed),
            this.playerFeetElev,
            false,
          );
        }
        break;
      }
      case "nova":
        this.damageEnemiesInRadius(this.player.lx, this.player.ly, range, dmg);
        break;
      case "orbit":
      case "passive":
      case "instant_heal":
        break;
      default: {
        const _n: never = slot.def.kind;
        void _n;
      }
    }
  }

  private spawnBullet(
    lx: number,
    ly: number,
    vx: number,
    vy: number,
    dmg: number,
    life: number,
    elev: number,
    enemyShot: boolean,
    extra?: Partial<Actor>,
  ): void {
    const kind = enemyShot ? "ebullet" : "bullet";
    const a = this.acquireTransientActor(
      kind,
      lx,
      ly,
      elev,
      3,
      {
        vx,
        vy,
        dmg,
        life: Math.max(0.4, life),
        ...extra,
      },
    );
    this.attachEffectBillboard(
      a,
      enemyShot ? "enemy-bullet" : "player-bullet",
      enemyShot ? "#60ffb0" : "#ffc040",
      enemyShot ? 5 : 7,
    );
    this.addActor(a);
    this.syncActor(a);
  }

  private tickBullets(dt: number): void {
    this.bulletExactCollisionChecksLastFrame = 0;
    this.bulletOpenFieldMovesLastFrame = 0;
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const b = this.projectiles[i]!;
      if (b.dead) continue;
      b.life = (b.life ?? 0) - dt;
      if ((b.life ?? 0) <= 0) {
        this.removeActor(b);
        continue;
      }
      const nx = b.lx + (b.vx ?? 0) * dt;
      const ny = b.ly + (b.vy ?? 0) * dt;
      if (
        enemyCrowdOpenFieldAllowsMove(
          this.enemyCrowdOpenField,
          b.lx,
          b.ly,
          nx,
          ny,
          b.radius,
          b.elev,
        )
      ) {
        this.bulletOpenFieldMovesLastFrame += 1;
      } else {
        this.bulletExactCollisionChecksLastFrame += 1;
        if (
          hitsSolidVoxels(
            this.map,
            this.tileset,
            nx,
            ny,
            b.radius,
            b.elev,
            this.pack.sprites,
          )
        ) {
          this.removeActor(b);
          continue;
        }
      }
      b.lx = nx;
      b.ly = ny;
      this.syncActor(b);

      if (b.kind === "bullet") {
        this.enemySpatial.visitRadius(b.lx, b.ly, b.radius, (e) => {
          if (e.dead) return false;
          const dx = e.lx - b.lx;
          const dy = e.ly - b.ly;
          const hitRadius = e.radius + b.radius;
          if (dx * dx + dy * dy > hitRadius * hitRadius) return false;
          this.applyDamageToEnemy(e, b.dmg ?? 0);
          this.removeActor(b);
          return true;
        });
      } else if (
        elevNearlyEqual(b.elev, this.playerFeetElev) &&
        Math.hypot(b.lx - this.player.lx, b.ly - this.player.ly) <=
          PLAYER_HURT_R + b.radius
      ) {
        this.damagePlayer(b.dmg ?? 5, b.strip ?? 0, {
          filthOnHit: Boolean(b.filth),
          filthDurationMs: b.filthMs ?? 2500,
        });
        this.removeActor(b);
      }
    }
  }

  private rebuildOrbitals(): void {
    for (const o of this.orbitals) this.removeActor(o.actor);
    this.orbitals = [];
    if (!this.autoAttackEnabled) return;
    for (const slot of this.weapons) {
      if (slot.def.kind !== "orbit") continue;
      const count = Math.max(
        1,
        Math.floor(
          slot.def.count +
            (slot.level - 1) * (slot.def.levelBonus?.count ?? 0),
        ),
      );
      const range =
        slot.def.range + (slot.level - 1) * (slot.def.levelBonus?.range ?? 0);
      const dmg =
        slot.def.damage + (slot.level - 1) * (slot.def.levelBonus?.damage ?? 0);
      for (let i = 0; i < count; i++) {
        const actor = this.acquireTransientActor(
          "orbit",
          this.player.lx,
          this.player.ly,
          this.playerFeetElev,
          5,
        );
        this.attachEffectBillboard(actor, "orbit", "#ff8840", 8);
        this.addActor(actor);
        this.orbitals.push({
          actor,
          index: i,
          count,
          range,
          dmg,
          hitCd: new Map(),
        });
      }
    }
  }

  private tickOrbitals(): void {
    for (const o of this.orbitals) {
      if (o.actor.dead) continue;
      const a =
        this.orbitAngle + (Math.PI * 2 * o.index) / Math.max(1, o.count);
      o.actor.lx = this.player.lx + Math.cos(a) * o.range;
      o.actor.ly = this.player.ly + Math.sin(a) * o.range;
      o.actor.elev = this.playerFeetElev;
      this.syncActor(o.actor);
      this.enemySpatial.visitRadius(o.actor.lx, o.actor.ly, 5, (e) => {
        if (e.dead) return false;
        const uid = e.uid ?? (e.uid = this.uidSeq++);
        if ((o.hitCd.get(uid) ?? 0) > this.nowMs) return false;
        const dx = e.lx - o.actor.lx;
        const dy = e.ly - o.actor.ly;
        const hitRadius = e.radius + 5;
        if (dx * dx + dy * dy > hitRadius * hitRadius) return false;
        o.hitCd.set(uid, this.nowMs + 280);
        this.applyDamageToEnemy(e, o.dmg);
        return false;
      });
    }
  }

  private tickSpawns(dt: number): void {
    if (!this.playProfileBudget.allowHorde) return;
    if (!runtimeAllowsStageSpawns(this.stressEnemyTarget)) return;
    const table = this.pack.spawns[this.stage.spawnTableId];
    if (!table) return;
    const bossAt = this.shortMode
      ? Math.min(45, this.stage.bossAtSec)
      : this.stage.bossAtSec;
    const t = this.elapsed;
    table.entries.forEach((entry, idx) => {
      let at = entry.atSec;
      let until = entry.untilSec;
      if (entry.enemyId === "boss_tourist") {
        at = bossAt;
        until = bossAt + 1;
      } else if (this.shortMode) {
        at = entry.atSec * (90 / Math.max(1, this.stage.durationSec));
        until = entry.untilSec * (90 / Math.max(1, this.stage.durationSec));
      }
      if (t < at || t > until) return;
      if (entry.once) {
        if (this.onceFired.has(idx)) return;
        this.onceFired.add(idx);
        for (let i = 0; i < entry.count; i++) {
          this.spawnEnemy(entry.enemyId, entry.regionGroup);
        }
        return;
      }
      this.spawnAcc[idx] = (this.spawnAcc[idx] ?? 0) + dt;
      if ((this.spawnAcc[idx] ?? 0) >= entry.intervalSec) {
        this.spawnAcc[idx] = 0;
        for (let i = 0; i < entry.count; i++) {
          this.spawnEnemy(entry.enemyId, entry.regionGroup);
        }
      }
    });
  }

  private spawnEnemy(enemyId: string, group: string): void {
    const def = this.pack.enemies[enemyId];
    if (!def) return;
    if (
      this.enemies.length >= runtimeEnemySpawnLimit(this.stressEnemyTarget)
    ) {
      return;
    }
    let regions = findRegions(this.map, "spawn", group);
    if (!regions.length) regions = findRegions(this.map, "spawn");
    const region =
      regions[Math.floor(Math.random() * regions.length)] ??
      findRegions(this.map, "player_start")[0];
    if (!region) return;
    // Body / hurt / bullet use the same footprint (see tickEnemies touch).
    const radius = enemyBodyRadius(def.radius);
    let p = randomWalkablePointInRegion(
      this.map,
      this.tileset,
      region,
      radius,
      Math.random,
      this.pack.sprites,
    );
    if (!p) {
      for (const r of findRegions(this.map, "spawn")) {
        p = randomWalkablePointInRegion(
          this.map,
          this.tileset,
          r,
          radius,
          Math.random,
          this.pack.sprites,
        );
        if (p) break;
      }
    }
    if (!p) return;
    const linked = def.spriteId ? this.pack.sprites[def.spriteId] : undefined;
    const color = hexColorOr(def.color, "#e07050");
    const mesh = new THREE.Object3D();
    mesh.name = `enemyProxy:${def.id}`;
    const enemyBillboard = this.enemyBillboards.add(
      `enemy:${def.id}`,
      mesh,
      () =>
        linked && spriteHasVisual(linked)
          ? createPixelBillboard(linked, color, Math.max(8, def.radius))
          : createColorBillboard(
              color,
              Math.max(8, def.radius),
              def.boss ? "#ffdd88" : undefined,
            ),
    );
    const uid = this.uidSeq++;
    const spriteOffset = linked
      ? resolveSpriteWorldOffsetVoxels(linked)
      : { x: 0, y: 0, z: 0 };
    const spriteVoxelWorld = this.map.tileSize / VOXELS_PER_BLOCK;
    const a: Actor = {
      mesh,
      enemyBillboard,
      lx: p.x,
      ly: p.y,
      elev: p.elev,
      radius,
      kind: "enemy",
      hp: def.hp,
      maxHp: def.hp,
      def,
      touchCd: 0,
      uid,
      aiPhase: uid,
      spriteOffsetX: spriteOffset.x * spriteVoxelWorld,
      spriteOffsetY: spriteOffset.z * spriteVoxelWorld,
      spriteOffsetZ: spriteOffset.y * spriteVoxelWorld,
    };
    this.addActor(a);
    this.syncActor(a);
  }

  private spawnExploreNpcs(): void {
    this.npcPlacementIds.clear();
    if (!this.playProfileBudget.allowNpc) return;
    const spawns = collectExploreNpcSpawns(
      this.map,
      this.pack.sprites,
      this.playProfileBudget.maxNpcs,
    );
    for (const spawn of spawns) {
      if (spawn.placementId) this.npcPlacementIds.add(spawn.placementId);
      this.spawnNpc(spawn);
    }
  }

  private spawnNpc(spawn: ExploreNpcSpawn): void {
    const def = this.pack.sprites[spawn.spriteId];
    if (!def) return;
    const mesh = new THREE.Object3D();
    mesh.name = `npcProxy:${spawn.spriteId}`;
    const color = hexColorOr(def.color, "#c8a878");
    const size = Math.max(8, this.map.tileSize * 0.9);
    const enemyBillboard = this.enemyBillboards.add(
      `npc:${spawn.spriteId}`,
      mesh,
      () =>
        spriteHasVisual(def)
          ? createPixelBillboard(def, color, size)
          : createColorBillboard(color, size),
    );
    const angle = Math.random() * Math.PI * 2;
    const spriteOffset = resolveSpriteWorldOffsetVoxels(def);
    const spriteVoxelWorld = this.map.tileSize / VOXELS_PER_BLOCK;
    const a: Actor = {
      mesh,
      enemyBillboard,
      lx: spawn.x,
      ly: spawn.y,
      elev: spawn.elev,
      radius: Math.max(4, this.map.tileSize * 0.3),
      kind: "npc",
      uid: this.uidSeq++,
      npcWander: spawn.wander,
      npcDirX: Math.cos(angle),
      npcDirY: Math.sin(angle),
      spriteOffsetX: spriteOffset.x * spriteVoxelWorld,
      spriteOffsetY: spriteOffset.z * spriteVoxelWorld,
      spriteOffsetZ: spriteOffset.y * spriteVoxelWorld,
    };
    this.addActor(a);
    this.syncActor(a);
  }

  /** Development-only deterministic crowd load for repeatable profiling. */
  private spawnCrowdStress(target: number): void {
    if (!this.playProfileBudget.allowHorde) {
      this.onBridge({
        type: "toast",
        textRu: "Stress-орда только на арене",
      });
      return;
    }
    const ids = Object.values(this.pack.enemies)
      .filter((enemy) => !enemy.boss)
      .map((enemy) => enemy.id);
    if (ids.length === 0) return;
    this.stressEnemyTarget = normalizeRuntimeStressTarget(target);
    while (this.enemies.length > this.stressEnemyTarget) {
      const enemy = this.enemies[this.enemies.length - 1];
      if (!enemy) break;
      this.removeActor(enemy);
    }
    let attempts = 0;
    let consecutiveFailures = 0;
    while (
      this.enemies.length < this.stressEnemyTarget &&
      attempts < this.stressEnemyTarget * 4 &&
      consecutiveFailures < ids.length * 4
    ) {
      const before = this.enemies.length;
      this.spawnEnemy(ids[attempts % ids.length]!, "");
      attempts += 1;
      consecutiveFailures =
        this.enemies.length === before ? consecutiveFailures + 1 : 0;
    }
    this.enemySpatialDirty = true;
    this.onBridge({
      type: "toast",
      textRu: `Stress: ${this.enemies.length}/${this.stressEnemyTarget} врагов · неуязвимость · без XP`,
    });
  }

  private tickEnemyAi(dt: number): void {
    this.enemyAiAccumulator = Math.min(
      ENEMY_AI_STEP * ENEMY_AI_MAX_STEPS,
      this.enemyAiAccumulator + dt,
    );
    let steps = 0;
    if (this.enemyAiAccumulator >= ENEMY_AI_STEP) {
      this.enemyPhysicsMovesLastFrame = 0;
      this.enemyOpenFieldMovesLastFrame = 0;
      this.enemyKinematicMovesLastFrame = 0;
      this.enemyDeferredCollisionMovesLastFrame = 0;
      this.enemyHeightTransitionMovesLastFrame = 0;
      this.enemyHeightTransitionDeferredLastFrame = 0;
      this.enemyContactSkipsLastFrame = 0;
      this.enemyAvoidanceActorsLastFrame = 0;
      this.enemyAvoidanceNeighborsLastFrame = 0;
      this.enemyFlowGuidedLastFrame = 0;
      this.enemyFlowMissesLastFrame = 0;
      this.enemyFlowRebuildsLastFrame = 0;
      this.enemyFlowRouteMaskLastFrame = 0;
      this.enemyCadenceLastFrame.full = 0;
      this.enemyCadenceLastFrame.half = 0;
      this.enemyCadenceLastFrame.third = 0;
      this.enemyCadenceLastFrame.quarter = 0;
    }
    if (this.enemySpatialDirty) {
      this.enemySpatial.rebuild(this.enemies);
      this.enemySpatialDirty = false;
    }
    while (
      this.enemyAiAccumulator >= ENEMY_AI_STEP &&
      steps < ENEMY_AI_MAX_STEPS
    ) {
      this.tickEnemiesFixed(ENEMY_AI_STEP);
      this.enemyAiAccumulator -= ENEMY_AI_STEP;
      steps += 1;
    }
    if (steps > 0) this.enemySpatial.rebuild(this.enemies);
    this.enemyAiStepsLastFrame = steps;
    this.syncInterpolatedEnemies(dt);
  }

  private tickNpcs(dt: number): void {
    if (this.npcs.length === 0) return;
    this.npcAiAccumulator = Math.min(
      ENEMY_AI_STEP * ENEMY_AI_MAX_STEPS,
      this.npcAiAccumulator + dt,
    );
    let steps = 0;
    while (
      this.npcAiAccumulator >= ENEMY_AI_STEP &&
      steps < ENEMY_AI_MAX_STEPS
    ) {
      this.tickNpcsFixed(ENEMY_AI_STEP);
      this.npcAiAccumulator -= ENEMY_AI_STEP;
      steps += 1;
    }
    this.syncInterpolatedNpcs(dt);
  }

  private tickNpcsFixed(dt: number): void {
    const tileSize = this.map.tileSize;
    for (const npc of this.npcs) {
      if (npc.dead || !npc.npcWander) continue;
      npc.simPrevX = npc.lx;
      npc.simPrevY = npc.ly;
      npc.simPrevElev = npc.elev;
      npc.simBlendElapsed = 0;
      npc.simBlendDuration = dt;
      const stepped = stepExploreNpcWander(
        npc.lx,
        npc.ly,
        npc.npcDirX ?? 1,
        npc.npcDirY ?? 0,
        dt,
        npc.npcWander,
        this.map.width,
        this.map.height,
        tileSize,
        npc.radius,
      );
      const pos = moveWithVoxels(
        this.map,
        this.tileset,
        npc.lx,
        npc.ly,
        stepped.x,
        stepped.y,
        npc.radius,
        npc.elev,
        this.pack.sprites,
      );
      npc.lx = pos.x;
      npc.ly = pos.y;
      npc.elev = pos.elev;
      npc.npcDirX = stepped.dirX;
      npc.npcDirY = stepped.dirY;
      if (Math.abs(pos.x - stepped.x) > 0.4 || Math.abs(pos.y - stepped.y) > 0.4) {
        npc.npcDirX = -stepped.dirX;
        npc.npcDirY = -stepped.dirY;
      }
    }
  }

  private syncInterpolatedNpcs(renderDt: number): void {
    let anyMoving = false;
    for (const npc of this.npcs) {
      if (npc.dead || !npc.npcWander) {
        this.syncActor(npc);
        continue;
      }
      const prevX = npc.simPrevX ?? npc.lx;
      const prevY = npc.simPrevY ?? npc.ly;
      const prevElev = npc.simPrevElev ?? npc.elev;
      npc.simBlendElapsed = (npc.simBlendElapsed ?? 0) + renderDt;
      const duration = npc.simBlendDuration ?? 0;
      const alpha =
        duration <= 1e-6
          ? 1
          : Math.min(1, (npc.simBlendElapsed ?? duration) / duration);
      if (
        !anyMoving &&
        (alpha < 1 || prevX !== npc.lx || prevY !== npc.ly)
      ) {
        anyMoving = true;
      }
      this.syncActorAt(
        npc,
        prevX + (npc.lx - prevX) * alpha,
        prevY + (npc.ly - prevY) * alpha,
        prevElev + (npc.elev - prevElev) * alpha,
      );
    }
    if (anyMoving) this.localShadowActorsMoved = true;
  }

  private syncInterpolatedEnemies(renderDt: number): void {
    let anyMoving = false;
    for (const enemy of this.enemies) {
      if (enemy.dead) continue;
      const prevX = enemy.simPrevX ?? enemy.lx;
      const prevY = enemy.simPrevY ?? enemy.ly;
      const prevElev = enemy.simPrevElev ?? enemy.elev;
      enemy.simBlendElapsed = (enemy.simBlendElapsed ?? 0) + renderDt;
      const duration = enemy.simBlendDuration ?? 0;
      const alpha =
        duration <= 1e-6
          ? 1
          : Math.min(1, (enemy.simBlendElapsed ?? duration) / duration);
      if (
        !anyMoving &&
        (alpha < 1 || prevX !== enemy.lx || prevY !== enemy.ly)
      ) {
        anyMoving = true;
      }
      this.syncActorAt(
        enemy,
        prevX + (enemy.lx - prevX) * alpha,
        prevY + (enemy.ly - prevY) * alpha,
        prevElev + (enemy.elev - prevElev) * alpha,
      );
    }
    if (anyMoving) this.localShadowActorsMoved = true;
  }

  private tickEnemiesFixed(dt: number): void {
    const crowdSize = this.enemies.length;
    const tileSize = this.map.tileSize;
    const crowdFlowEnabled = crowdSize > 40;
    if (
      crowdFlowEnabled &&
      updateEnemyCrowdFlowField(
        this.enemyCrowdFlow,
        this.player.lx,
        this.player.ly,
        this.playerElev,
      )
    ) {
      this.enemyFlowRebuildsLastFrame += 1;
    }
    let exactCollisionBudget = enemyExactCollisionBudget(crowdSize);
    let heightTransitionBudget = Math.min(
      48,
      Math.max(16, Math.ceil(crowdSize / 16)),
    );
    const enemyCount = this.enemies.length;
    const iterationStart =
      crowdSize > 40 && enemyCount > 0 ? this.enemyAiTick % enemyCount : 0;
    for (let enemyOffset = 0; enemyOffset < enemyCount; enemyOffset++) {
      const e = this.enemies[(iterationStart + enemyOffset) % enemyCount]!;
      if (e.dead || !e.def) continue;
      const def = e.def;
      const dist = Math.hypot(e.lx - this.player.lx, e.ly - this.player.ly);
      const sameElev = elevNearlyEqual(e.elev, this.playerFeetElev);
      const touching =
        !def.ranged &&
        sameElev &&
        dist < e.radius + PLAYER_HURT_R;
      const lod = enemySimLod(dist, tileSize, crowdSize);
      noteMovementCadence(this.enemyCadenceLastFrame, lod.cadence);
      e.moveAccum = Math.min(0.15, (e.moveAccum ?? 0) + dt);
      e.touchCd = (e.touchCd ?? 0) - dt;

      if (def.ranged && sameElev && dist < (def.range ?? 140) && dist > 40) {
        e.moveAccum = Math.min(e.moveAccum, lod.cadence * dt);
        if ((e.touchCd ?? 0) <= 0) {
          e.touchCd = 1.6;
          const sp = def.projectileSpeed ?? 120;
          const invDist = dist > 1e-6 ? 1 / dist : 0;
          this.spawnBullet(
            e.lx,
            e.ly,
            (this.player.lx - e.lx) * invDist * sp,
            (this.player.ly - e.ly) * invDist * sp,
            def.damage,
            2.5,
            e.elev,
            true,
            {
              filth: Boolean(def.filthOnHit),
              filthMs: def.filthDurationMs ?? 2500,
              strip: def.stripDamage * 0.5,
            },
          );
        }
      } else if (touching) {
        // Contact attacks remain 30 Hz, but an actor already touching the
        // player does not need another expensive map collision query.
        e.moveAccum = Math.min(e.moveAccum, lod.cadence * dt);
        this.enemyContactSkipsLastFrame += 1;
      } else if (
        runsOnStaggeredTick(this.enemyAiTick, e.aiPhase ?? 0, lod.cadence)
      ) {
        const moveDt = Math.max(dt, e.moveAccum);
        e.moveAccum = 0;
        e.simPrevX = e.lx;
        e.simPrevY = e.ly;
        e.simPrevElev = e.elev;
        e.simBlendElapsed = 0;
        e.simBlendDuration = moveDt;
        const toPlayerX = this.player.lx - e.lx;
        const toPlayerY = this.player.ly - e.ly;
        const invDist = dist > 1e-6 ? 1 / dist : 0;
        let pursuitX = toPlayerX * invDist;
        let pursuitY = toPlayerY * invDist;
        let flowHeightTransition = false;
        const directPathOpen =
          crowdFlowEnabled &&
          sameElev &&
          enemyCrowdOpenFieldAllowsDirectPath(
            this.enemyCrowdOpenField,
            e.lx,
            e.ly,
            this.player.lx,
            this.player.ly,
            e.radius,
            e.elev,
          );
        if (crowdFlowEnabled && !directPathOpen) {
          const flowResult = enemyCrowdFlowDirection(
            this.enemyCrowdFlow,
            e.lx,
            e.ly,
            e.elev,
            this.crowdFlowDirection,
            e.uid ?? e.aiPhase ?? 0,
          );
          if (flowResult === ENEMY_FLOW_GUIDED) {
            pursuitX = this.crowdFlowDirection.x;
            pursuitY = this.crowdFlowDirection.y;
            flowHeightTransition =
              this.crowdFlowDirection.heightTransition === true;
            this.enemyFlowGuidedLastFrame += 1;
            const routeGroup = this.crowdFlowDirection.routeGroup;
            if (routeGroup >= 0 && routeGroup < 31) {
              this.enemyFlowRouteMaskLastFrame |= 1 << routeGroup;
            }
          } else if (flowResult === 0) {
            this.enemyFlowMissesLastFrame += 1;
          }
        }
        if (lod.crowdSteer && !flowHeightTransition) {
          this.resolveEnemyCrowdSteering(e, pursuitX, pursuitY, lod.maxNeighbors);
        } else {
          this.crowdSteering.x = pursuitX;
          this.crowdSteering.y = pursuitY;
        }
        const nextX = e.lx + this.crowdSteering.x * def.speed * moveDt;
        const nextY = e.ly + this.crowdSteering.y * def.speed * moveDt;
        if (lod.collideWorld) {
          if (
            enemyCrowdOpenFieldAllowsMove(
              this.enemyCrowdOpenField,
              e.lx,
              e.ly,
              nextX,
              nextY,
              e.radius,
              e.elev,
            )
          ) {
            e.lx = nextX;
            e.ly = nextY;
            this.enemyOpenFieldMovesLastFrame += 1;
          } else {
            const heightTransition = enemyCrowdMoveTouchesConnector(
              this.enemyCrowdOpenField,
              e.lx,
              e.ly,
              nextX,
              nextY,
              e.radius,
            );
            if (
              heightTransition &&
              enemyCrowdTryConnectorMove(
                this.enemyCrowdOpenField,
                e.lx,
                e.ly,
                nextX,
                nextY,
                e.radius,
                e.elev,
                this.crowdConnectorMove,
              )
            ) {
              e.lx = this.crowdConnectorMove.x;
              e.ly = this.crowdConnectorMove.y;
              e.elev = this.crowdConnectorMove.elev;
              this.enemyHeightTransitionMovesLastFrame += 1;
              continue;
            }
            const hasCollisionBudget = heightTransition
              ? heightTransitionBudget > 0
              : exactCollisionBudget > 0;
            if (!hasCollisionBudget) {
              e.moveAccum = Math.min(0.15, moveDt);
              this.enemyDeferredCollisionMovesLastFrame += 1;
              if (heightTransition) {
                this.enemyHeightTransitionDeferredLastFrame += 1;
              }
              continue;
            }
            if (heightTransition) heightTransitionBudget -= 1;
            else exactCollisionBudget -= 1;
            const pos = moveWithVoxels(
              this.map,
              this.tileset,
              e.lx,
              e.ly,
              nextX,
              nextY,
              e.radius,
              e.elev,
              this.pack.sprites,
              this.pack.voxelModels,
              this.pack.voxelScenes,
            );
            e.lx = pos.x;
            e.ly = pos.y;
            e.elev = pos.elev;
            this.enemyPhysicsMovesLastFrame += 1;
            if (heightTransition) {
              this.enemyHeightTransitionMovesLastFrame += 1;
            }
          }
        } else {
          e.lx = clampCoordToMap(nextX, e.radius, this.map.width, tileSize);
          e.ly = clampCoordToMap(nextY, e.radius, this.map.height, tileSize);
          this.enemyKinematicMovesLastFrame += 1;
        }
      }

      if (
        touching &&
        (e.touchCd ?? 0) <= 0
      ) {
        e.touchCd = 0.55;
        this.damagePlayer(def.damage, def.stripDamage, def);
      }
    }
    this.enemyAiTick += 1;
  }

  private resolveEnemyCrowdSteering(
    enemy: Actor,
    pursuitX: number,
    pursuitY: number,
    maxNeighbors: number,
  ): void {
    const separation = this.crowdSeparation;
    separation.x = 0;
    separation.y = 0;
    separation.weight = 0;
    let overlaps = 0;
    const neighborCap = Math.max(0, maxNeighbors);
    if (neighborCap <= 0) {
      this.crowdSteering.x = pursuitX;
      this.crowdSteering.y = pursuitY;
      return;
    }
    this.enemySpatial.visitRadius(
      enemy.lx,
      enemy.ly,
      enemy.radius + 2,
      (other) => {
        if (
          other === enemy ||
          other.dead ||
          !elevNearlyEqual(other.elev, enemy.elev)
        ) return false;
        if (addCrowdSeparation(separation, enemy, other)) overlaps += 1;
        return overlaps >= neighborCap;
      },
    );
    if (overlaps > 0) {
      this.enemyAvoidanceActorsLastFrame += 1;
      this.enemyAvoidanceNeighborsLastFrame += overlaps;
    }
    resolveCrowdSteering(
      this.crowdSteering,
      pursuitX,
      pursuitY,
      separation,
    );
  }

  private interactPlayChest(region: EmberMapRegion): void {
    const explore = resolveMapPlayProfile(this.map) === "explore";
    const alreadyOpen = chestIsOpened(
      this.map.id,
      region,
      this.openedChestKeys,
    );
    if (explore) {
      const result = applyChestOpen(
        this.map.id,
        region,
        this.openedChestKeys,
        this.pack.items,
      );
      if (result.loot.length) {
        this.inventory = grantItemCounts(
          this.inventory,
          result.loot,
          this.pack.items,
        );
      }
      this.fireInteractAction(
        wouldFireForChest(region, result),
        region,
        region.id,
      );
      if (!alreadyOpen) this.playChestOpenVisual(region, { arenaLoot: false });
      this.emitExploreAutosave("chest");
      return;
    }
    if (alreadyOpen) {
      this.onBridge({ type: "toast", textRu: "Сундук уже открыт" });
      return;
    }
    this.openedChestKeys.add(chestKey(this.map.id, region.id));
    region.opened = true;
    this.playChestOpenVisual(region, { arenaLoot: true });
  }

  private playChestOpenVisual(
    region: EmberMapRegion,
    opts: { arenaLoot: boolean },
  ): void {
    const actor = this.actors.find(
      (item) => item.kind === "chest" && item.regionId === region.id,
    );
    if (!actor || actor.dead) {
      if (opts.arenaLoot) this.openChest();
      return;
    }
    this.beginChestOpenVisual(actor, region, opts);
  }

  private beginChestOpenVisual(
    a: Actor,
    region: EmberMapRegion,
    opts: { arenaLoot: boolean },
  ): void {
    a.outline?.dispose();
    a.outline = null;
    const scene =
      region.sceneId && this.pack.voxelScenes?.[region.sceneId]
        ? this.pack.voxelScenes[region.sceneId]
        : undefined;
    const sceneMesh = a.mesh.userData.voxelSceneMesh as
      | VoxelSceneMesh
      | undefined;
    const clipId =
      region.openClipId ??
      scene?.animations?.[0]?.id ??
      (a.mesh.userData.chestClipId as string | null | undefined) ??
      null;
    const clip = clipId
      ? scene?.animations?.find((c) => c.id === clipId)
      : undefined;

    if (scene && sceneMesh && clip && clip.durationSec > 0) {
      a.dead = true;
      this.chestOpens.push({
        actor: a,
        sceneMesh,
        clipId,
        durationSec: Math.max(0.05, clip.durationSec),
        t: 0,
        lootOpened: !opts.arenaLoot,
      });
      return;
    }

    if (scene && sceneMesh) {
      sceneMesh.setPlayhead(1, clipId);
      a.dead = true;
      if (opts.arenaLoot) this.openChest();
      return;
    }

    if (region.openModelId || region.closedModelId || region.sceneId) {
      const next = this.makeChestMesh(region, true);
      this.entityRoot.remove(a.mesh);
      if (a.mesh.userData.voxelSceneMesh) {
        (a.mesh.userData.voxelSceneMesh as VoxelSceneMesh).dispose();
      } else if (a.mesh.userData.voxelChest) {
        disposeVoxelModelMesh(a.mesh);
      } else {
        this.disposeObject(a.mesh);
      }
      a.mesh = next;
      a.dead = true;
      this.entityRoot.add(a.mesh);
      this.syncActor(a);
    } else {
      this.removeActor(a);
    }
    if (opts.arenaLoot) this.openChest();
  }

  private tickChestPickup(): void {
    if (resolveMapPlayProfile(this.map) === "explore") return;
    for (const a of [...this.actors]) {
      if (a.kind !== "chest" || a.dead || !a.regionId) continue;
      if (this.openedChestKeys.has(chestKey(this.map.id, a.regionId))) continue;
      const region = this.map.regions.find((r) => r.id === a.regionId);
      const interactionElev = region
        ? regionVolumeElev(this.map, region)
        : a.elev;
      if (!elevNearlyEqual(interactionElev, this.playerElev)) continue;
      if (
        Math.hypot(a.lx - this.player.lx, a.ly - this.player.ly) >
        CHEST_INTERACT_R
      ) {
        continue;
      }
      this.openedChestKeys.add(chestKey(this.map.id, a.regionId));
      if (!region) {
        this.removeActor(a);
        this.openChest();
        return;
      }
      region.opened = true;
      this.beginChestOpenVisual(a, region, { arenaLoot: true });
      return;
    }
  }

  private tickChestOpens(dt: number): void {
    if (this.chestOpens.length === 0) return;
    const next: typeof this.chestOpens = [];
    for (const anim of this.chestOpens) {
      anim.t = Math.min(1, anim.t + dt / anim.durationSec);
      anim.sceneMesh.setPlayhead(anim.t, anim.clipId);
      if (anim.t >= 1) {
        if (!anim.lootOpened) {
          anim.lootOpened = true;
          this.openChest();
        }
        continue;
      }
      next.push(anim);
    }
    this.chestOpens = next;
  }

  private tickGems(): void {
    for (let i = this.gems.length - 1; i >= 0; i--) {
      const g = this.gems[i]!;
      if (g.dead) continue;
      if (Math.hypot(g.lx - this.player.lx, g.ly - this.player.ly) > 12) {
        continue;
      }
      this.xp = runtimeXpAfterPickup(
        this.xp,
        g.xp ?? 1,
        this.stressNoXp,
      );
      this.removeActor(g);
      while (!this.stressNoXp && this.xp >= this.xpToLevel) {
        this.xp -= this.xpToLevel;
        this.level += 1;
        this.xpToLevel = Math.floor(this.stage.baseXpToLevel + this.level * 4);
        this.openLevelUp();
      }
    }
  }

  private nearestEnemy(): Actor | null {
    return this.enemySpatial.nearest(
      this.player.lx,
      this.player.ly,
      (enemy) => !enemy.dead,
    );
  }

  private damageEnemiesInRadius(
    x: number,
    y: number,
    r: number,
    dmg: number,
  ): void {
    const radiusSq = r * r;
    this.enemySpatial.visitRadius(x, y, r, (e) => {
      if (e.dead) return false;
      const dx = e.lx - x;
      const dy = e.ly - y;
      if (dx * dx + dy * dy <= radiusSq) this.applyDamageToEnemy(e, dmg);
      return false;
    });
  }

  private applyDamageToEnemy(enemy: Actor, dmg: number): void {
    if (enemy.dead || enemy.kind !== "enemy") return;
    if (!runtimeAllowsEnemyDamage(this.stressEnemyTarget)) return;
    const profile = resolveMapPlayProfile(this.map);
    const dealt = outgoingPlayerDamage(profile, dmg, this.playerCombatStats());
    enemy.hp = (enemy.hp ?? 1) - dealt;
    if ((enemy.hp ?? 0) <= 0) this.killEnemy(enemy);
  }

  private killEnemy(enemy: Actor): void {
    const def = enemy.def;
    const lx = enemy.lx;
    const ly = enemy.ly;
    const elev = enemy.elev;
    this.removeActor(enemy);
    this.killed += 1;
    if (!def) return;
    const gem = this.acquireTransientActor("gem", lx, ly, elev, 4, {
      xp: def.xp * this.stage.xpGemValue,
    });
    this.attachEffectBillboard(gem, "xp-gem", "#60e0ff", 6);
    this.addActor(gem);
    this.syncActor(gem);
  }

  private damagePlayer(
    dmg: number,
    strip: number,
    src?: Pick<EmberEnemyDef, "filthOnHit" | "filthDurationMs">,
  ): void {
    if (this.finished || this.awaitingLoot || this.shopOpen || this.inventoryOpen) return;
    if (this.stressEnemyTarget > 0 && import.meta.env.DEV) return;
    dmg = incomingPlayerDamage(dmg, this.playerCombatStats());
    this.hp -= dmg;
    this.stripMeter += strip;
    while (this.stripMeter >= 25 && this.stripTier < 3) {
      this.stripMeter -= 25;
      this.stripTier += 1;
      this.refreshPlayerTint();
      this.onBridge({
        type: "toast",
        textRu: `Одежда: tier ${this.stripTier}`,
      });
    }
    if (src?.filthOnHit) {
      const resist = Math.min(0.85, this.filthResist);
      if (Math.random() > resist) {
        this.filthUntil =
          this.nowMs + (src.filthDurationMs ?? 2500) * (1 - resist * 0.5);
      }
    }
    if (this.hp <= 0) {
      this.hp = 0;
      this.finish("fail");
    }
  }

  private refreshPlayerTint(): void {
    const color = STRIP_COLORS[this.stripTier] ?? STRIP_COLORS[3]!;
    this.entityRoot.remove(this.player.mesh);
    this.disposeObject(this.player.mesh);
    this.player.mesh = createColorBillboard(color, 10, "#1a1010");
    setObjectRenderLayer(this.player.mesh, EMBER_DYNAMIC_ACTOR_LAYER);
    this.entityRoot.add(this.player.mesh);
    this.syncActor(this.player);
  }

  private tickFilth(): void {
    const mat = (this.player.mesh as THREE.Mesh).material;
    if (mat instanceof THREE.MeshBasicMaterial) {
      mat.opacity = this.nowMs < this.filthUntil ? 0.75 : 1;
    }
  }

  private tickTileSemantics(): void {
    const tile = this.currentGroundTile();
    const stain = tile?.stain;
    if (stain) {
      const durationMs =
        typeof stain === "object" ? (stain.durationMs ?? 2500) : 2500;
      this.filthUntil = Math.max(this.filthUntil, this.nowMs + durationMs);
    }

    const hazard = tile?.hazard;
    if (!hazard || this.nowMs < this.tileHazardNextAt) return;
    const damage = typeof hazard === "object" ? (hazard.damage ?? 6) : 6;
    const stripDamage =
      typeof hazard === "object" ? (hazard.stripDamage ?? 0) : 0;
    const intervalMs =
      typeof hazard === "object" ? (hazard.intervalMs ?? 800) : 800;
    this.tileHazardNextAt = this.nowMs + intervalMs;
    this.damagePlayer(damage, stripDamage);
  }

  private ownedWeaponIds(): Set<string> {
    return new Set(this.weapons.map((w) => w.def.id));
  }

  private openLevelUp(): void {
    if (this.finished) return;
    const pool = this.pack.pools[this.stage.weaponPoolId];
    if (!pool) return;
    this.awaitingLoot = true;
    this.syncPointerLock();
    const roll = rollLootOptions(this.pack, pool, 3, this.ownedWeaponIds());
    this.onBridge({
      type: "level_up",
      options: roll.options,
      targetId: roll.targetId,
    });
  }

  private openChest(): void {
    const pool = this.pack.pools[this.stage.chestPoolId];
    if (!pool) return;
    this.awaitingLoot = true;
    this.syncPointerLock();
    const roll = rollLootOptions(this.pack, pool, 3, this.ownedWeaponIds());
    this.onBridge({
      type: "chest",
      options: roll.options,
      targetId: roll.targetId,
    });
  }

  applyLoot(itemId: string): void {
    const def = this.pack.weapons[itemId];
    if (!def) {
      this.awaitingLoot = false;
      this.requestLookLock();
      return;
    }
    if (def.kind === "instant_heal") {
      this.hp = Math.min(this.maxHp, this.hp + (def.heal ?? 20));
      this.onBridge({ type: "toast", textRu: `+${def.heal ?? 20} HP` });
    } else {
      const existing = this.weapons.find((w) => w.def.id === itemId);
      if (existing) existing.level += 1;
      else if (
        this.weapons.filter((w) => w.def.kind !== "passive").length < 4 ||
        def.kind === "passive"
      ) {
        this.weapons.push({ def, level: 1, cooldown: 0 });
      } else {
        const idx = this.weapons.findIndex((w) => w.def.kind !== "passive");
        if (idx >= 0) this.weapons[idx] = { def, level: 1, cooldown: 0 };
      }
      this.recalcPassives();
      this.rebuildOrbitals();
    }
    this.awaitingLoot = false;
    this.requestLookLock();
  }

  private recalcPassives(): void {
    this.filthResist = 0;
    this.moveMul = 1;
    for (const w of this.weapons) {
      if (w.def.kind !== "passive" || !w.def.passive) continue;
      this.filthResist +=
        (w.def.passive.filthResist ?? 0) +
        (w.level - 1) * (w.def.levelBonus?.filthResist ?? 0);
      this.moveMul *= w.def.passive.moveSpeedMul ?? 1;
    }
  }

  private finish(outcome: "clear" | "fail"): void {
    if (this.finished) return;
    this.finished = true;
    const evId =
      outcome === "clear"
        ? this.stage.onClearEventId
        : this.stage.onFailEventId;
    if (evId) this.activeEmissiveEvents.add(evId);
    this.onBridge({
      type: "stage_result",
      outcome,
      cinders:
        outcome === "clear" ? this.stage.cindersClear : this.stage.cindersFail,
      elapsedSec: Math.floor(this.elapsed),
      killed: this.killed,
      level: this.level,
      onClearEventId:
        outcome === "clear" ? this.stage.onClearEventId : undefined,
      onFailEventId: outcome === "fail" ? this.stage.onFailEventId : undefined,
    });
    this.syncPointerLock();
  }

  private applyExploreProgressFields(save: EmberExploreSaveState): void {
    this.openedChestKeys = new Set(save.openedChests);
    this.inventory = compactInventory(save.inventory) ?? {};
    this.equipment = compactEquipment(save.equipment);
    this.shopStock = {};
    for (const [id, stock] of Object.entries(save.shopStock)) {
      this.shopStock[id] = { ...stock };
    }
    this.flags = { ...save.flags };
  }

  private applyExploreHp(save: EmberExploreSaveState): void {
    if (save.maxHp != null && Number.isFinite(save.maxHp) && save.maxHp > 0) {
      this.maxHp = save.maxHp;
    }
    if (save.hp != null && Number.isFinite(save.hp)) {
      this.hp = Math.max(0, Math.min(this.maxHp, save.hp));
    }
  }

  private emitExploreAutosave(reason: EmberExploreAutosaveReason): void {
    if (this.applyingSave || this.disposed) return;
    if (resolveMapPlayProfile(this.map) !== "explore") return;
    this.onBridge({ type: "explore_autosave", reason });
  }

  captureExploreSave(): EmberExploreSaveState | null {
    if (!this.player || resolveMapPlayProfile(this.map) !== "explore") {
      return null;
    }
    const tile = worldToTile(this.map, this.player.lx, this.player.ly);
    return captureExploreSave({
      packId: this.pack.meta.id,
      slot: 0,
      source: {
        mapId: this.map.id,
        x: this.player.lx,
        y: this.player.ly,
        elev: this.playerFeetElev,
        tile,
        inventory: this.inventory,
        equipment: this.equipment,
        openedChests: [...this.openedChestKeys],
        shopStock: this.shopStock,
        flags: this.flags,
      },
      hp: this.hp,
      maxHp: this.maxHp,
    });
  }

  applyExploreSave(save: EmberExploreSaveState): boolean {
    const dest = this.pack.maps[save.mapId];
    if (!dest) return false;
    const map = ensureMapLayers(dest);
    const tileset = this.pack.tilesets[map.tilesetId];
    if (!tileset) return false;
    this.applyingSave = true;
    this.applyExploreProgressFields(save);
    this.applyExploreHp(save);
    const pos = exploreSaveWorldPos(save, map.tileSize);
    const occupyTrigger = findRegions(map, "trigger").find((region) =>
      pointInRegion(map, region, pos.x, pos.y, save.elev),
    );
    const occupyPad = findRegions(map, "teleport").find((region) =>
      pointInRegion(map, region, pos.x, pos.y, save.elev),
    );
    this.reloadPlayMap(
      {
        map,
        mapId: map.id,
        x: pos.x,
        y: pos.y,
        elev: save.elev ?? tileSurfaceElev(map, pos.tx, pos.ty),
        regionId: occupyTrigger?.id ?? occupyPad?.id ?? null,
        occupyId: occupyTrigger?.id ?? occupyPad?.id ?? null,
      },
      tileset,
    );
    this.applyingSave = false;
    this.emitHud();
    return true;
  }

  private emitHud(): void {
    this.onBridge({
      type: "hud",
      hp: Math.max(0, this.hp),
      maxHp: this.maxHp,
      level: this.level,
      xp: this.xp,
      xpToLevel: this.xpToLevel,
      elapsedSec: Math.floor(this.elapsed),
      durationSec: this.duration,
      stripTier: this.stripTier,
      filthMs: Math.max(0, this.filthUntil - this.nowMs),
      killed: this.killed,
      paused:
        !this.shadowWarmupComplete || playLookBlocked(this.overlayFlags()),
    });
  }

  private shopFailRu(
    reason:
      | "unknown_shop"
      | "unknown_item"
      | "broke"
      | "out_of_stock"
      | "nothing_to_sell"
      | "unsellable",
  ): string {
    switch (reason) {
      case "broke":
        return "Не хватает монет";
      case "out_of_stock":
        return "Нет в наличии";
      case "unknown_item":
        return "Нет такого товара";
      case "unknown_shop":
        return "Магазин не найден";
      case "nothing_to_sell":
        return "Нечего продать";
      case "unsellable":
        return "Этот предмет нельзя продать";
      default: {
        const _never: never = reason;
        return _never;
      }
    }
  }

  private remainingForShop(shopId: string): Record<string, number> {
    const shop = this.pack.shops?.[shopId];
    if (!shop) return {};
    if (!this.shopStock[shopId]) {
      this.shopStock[shopId] = seedShopRemaining(shop);
    }
    return this.shopStock[shopId];
  }

  private emitShop(errorRu: string | null = null): void {
    const shopId = this.shopId;
    const shop = shopId ? this.pack.shops?.[shopId] : undefined;
    const remaining = shopId ? this.remainingForShop(shopId) : {};
    const fire = wouldFireForShop(
      shop,
      shopId,
      this.inventory,
      remaining,
      this.pack.items,
    );
    this.onBridge({
      type: "shop",
      shopId: fire.shopId ?? shopId ?? "",
      nameRu: fire.nameRu ?? shopId ?? "Магазин",
      wallet: fire.wallet,
      listings: fire.listings,
      sellable: shop
        ? sellableFromInventory(shop, this.inventory, this.pack.items)
        : [],
      errorRu,
    });
  }

  private openShop(shopId: string | null): void {
    const id = shopId?.trim() || null;
    if (!id || !this.pack.shops?.[id]) {
      this.onBridge({
        type: "toast",
        textRu: id ? `Магазин «${id}» не найден` : "У объекта нет shopId",
      });
      return;
    }
    this.closeInventory();
    this.shopId = id;
    this.shopOpen = true;
    this.remainingForShop(id);
    this.syncPointerLock();
    this.emitShop(null);
  }

  private startHook(id: string | null, afterShopId: string | null): void {
    const ref = resolveScriptRef(this.pack.scripts, this.pack.scenes, id);
    if (!ref) {
      if (afterShopId) {
        this.openShop(afterShopId);
        return;
      }
      if (id) {
        this.onBridge({
          type: "toast",
          textRu: `Скрипт «${id}» не найден`,
        });
      }
      return;
    }
    this.pendingShopId = afterShopId;
    this.scriptQueue = [];
    switch (ref.kind) {
      case "dialogue":
        this.openDialogue(ref.scene.id);
        break;
      case "script":
        this.scriptQueue = [...ref.script.steps];
        this.advanceScriptQueue();
        break;
      default: {
        const _never: never = ref;
        void _never;
      }
    }
  }

  private openDialogue(sceneId: string): void {
    const scene = this.pack.scenes[sceneId];
    if (!scene) {
      this.onBridge({
        type: "toast",
        textRu: `Диалог «${sceneId}» не найден`,
      });
      this.advanceScriptQueue();
      return;
    }
    this.dialogueOpen = true;
    this.pausedLogic = true;
    this.syncPointerLock();
    this.onBridge({
      type: "dialogue",
      sceneId,
      use: dialogueUseOf(scene),
    });
  }

  advanceDialogue(): void {
    this.dialogueOpen = false;
    if (this.scriptQueue.length) {
      this.advanceScriptQueue();
      return;
    }
    if (this.pendingShopId) {
      const shopId = this.pendingShopId;
      this.pendingShopId = null;
      this.openShop(shopId);
      return;
    }
    this.resume();
  }

  private advanceScriptQueue(): void {
    while (this.scriptQueue.length) {
      const step = this.scriptQueue.shift();
      if (!step) break;
      switch (step.type) {
        case "talk":
          this.openDialogue(step.dialogueId);
          return;
        case "change_map":
          this.applyPlayMapChange(
            {
              targetMapId: step.targetMapId,
              targetRegionId: step.targetRegionId ?? null,
            },
            "script",
          );
          if (mapFadeBusy(this.mapFade)) {
            this.scriptHeldForMapFade = true;
            return;
          }
          break;
        case "open_shop":
          this.openShop(step.shopId);
          return;
        case "give_item": {
          const loot = Array.from(
            { length: Math.max(1, step.count ?? 1) },
            () => step.itemId,
          );
          this.inventory = grantItemCounts(
            this.inventory,
            loot,
            this.pack.items,
          );
          break;
        }
        case "set_flag":
          this.flags[step.flag] = step.value;
          break;
        case "wait":
          break;
        case "run_script": {
          const nested = this.pack.scripts?.[step.scriptId];
          if (nested) this.scriptQueue.unshift(...nested.steps);
          break;
        }
        default: {
          const _never: never = step;
          void _never;
        }
      }
    }
    if (this.pendingShopId) {
      const shopId = this.pendingShopId;
      this.pendingShopId = null;
      this.openShop(shopId);
      return;
    }
    if (!this.shopOpen) this.resume();
  }

  closeShop(): void {
    if (!this.shopOpen) return;
    const next = closeShopOverlayFlags(this.overlayFlags());
    this.shopOpen = next.shopOpen;
    this.shopId = null;
    this.pausedLogic = next.pausedLogic;
    this.onBridge({ type: "shop_close" });
    restorePlayOverlayFocus(this.renderer.domElement);
    if (!playLookBlocked(this.overlayFlags())) this.requestLookLock();
    else this.syncPointerLock();
    this.emitHud();
  }

  private playerCombatStats(): EmberCombatStats {
    return playerCombatStats(
      resolveMapPlayProfile(this.map),
      this.equipment,
      this.pack.items,
    );
  }

  private ensureArenaStarterLoadout(): void {
    if (resolveMapPlayProfile(this.map) !== "arena") return;
    if (this.equipment.arena_weapon) return;
    const starterId = this.stage.starterWeaponId;
    const item = this.pack.items[starterId];
    if (!item || item.kind !== "weapon_arena") return;
    if ((this.inventory[starterId] ?? 0) < 1) {
      this.inventory = grantItemCounts(
        this.inventory,
        [starterId],
        this.pack.items,
      );
    }
    const result = applyEquipItem(
      this.inventory,
      this.equipment,
      starterId,
      this.pack.items,
    );
    if (!result.ok) return;
    this.inventory = result.inventory;
    this.equipment = result.equipment;
  }

  private emitInventory(errorRu: string | null = null): void {
    const equipment = compactEquipment(this.equipment);
    const explore = playerCombatStats("explore", equipment, this.pack.items);
    const arena = playerCombatStats("arena", equipment, this.pack.items);
    this.onBridge({
      type: "inventory",
      items: listInventoryViews(this.inventory, this.pack.items),
      equipment,
      atk: explore.atk,
      def: explore.def,
      arenaAtk: arena.atk,
      errorRu,
    });
  }

  toggleInventory(): void {
    if (this.shopOpen || this.dialogueOpen || this.awaitingLoot || this.finished) {
      return;
    }
    if (this.inventoryOpen) {
      this.closeInventory();
      return;
    }
    this.inventoryOpen = true;
    this.syncPointerLock();
    this.emitInventory(null);
  }

  closeInventory(): void {
    if (!this.inventoryOpen) return;
    const next = closeInventoryOverlayFlags(this.overlayFlags());
    this.inventoryOpen = next.inventoryOpen;
    this.pausedLogic = next.pausedLogic;
    this.onBridge({ type: "inventory_close" });
    restorePlayOverlayFocus(this.renderer.domElement);
    if (!playLookBlocked(this.overlayFlags())) this.requestLookLock();
    else this.syncPointerLock();
    this.emitHud();
  }

  equipItem(itemId: string): void {
    if (!this.inventoryOpen) return;
    const result = applyEquipItem(
      this.inventory,
      this.equipment,
      itemId,
      this.pack.items,
    );
    this.inventory = result.inventory;
    this.equipment = result.equipment;
    this.emitInventory(result.ok ? null : equipFailRu(result.reason));
  }

  unequipSlot(slot: EmberEquipSlot): void {
    if (!this.inventoryOpen) return;
    if (!isEmberEquipSlot(slot)) return;
    const result = applyUnequipSlot(
      this.inventory,
      this.equipment,
      slot,
      this.pack.items,
    );
    this.inventory = result.inventory;
    this.equipment = result.equipment;
    this.emitInventory(result.ok ? null : equipFailRu(result.reason));
  }

  useItem(itemId: string): void {
    if (!this.inventoryOpen) return;
    const result = useInventoryItem(
      this.inventory,
      this.equipment,
      itemId,
      this.pack.items,
    );
    this.inventory = result.inventory;
    this.equipment = result.equipment;
    if (result.ok && result.heal && result.heal > 0) {
      const before = this.hp;
      this.hp = Math.min(this.maxHp, this.hp + result.heal);
      const gained = Math.max(0, this.hp - before);
      this.onBridge({
        type: "toast",
        textRu: gained > 0 ? `+${gained} HP` : "HP уже полный",
      });
      this.emitHud();
    }
    this.emitInventory(result.ok ? null : equipFailRu(result.reason));
  }

  buyShopItem(itemId: string): void {
    if (!this.shopOpen) return;
    const id = this.shopId;
    const result = buyShopItem(
      id ? this.pack.shops?.[id] : undefined,
      itemId,
      this.inventory,
      id ? this.remainingForShop(id) : {},
      this.pack.items,
    );
    this.inventory = result.inventory;
    if (id && result.ok) this.shopStock[id] = result.remaining;
    this.emitShop(result.ok ? null : this.shopFailRu(result.reason));
    if (result.ok) this.emitExploreAutosave("shop");
  }

  sellShopItem(itemId: string): void {
    if (!this.shopOpen) return;
    const id = this.shopId;
    const result = sellShopItem(
      id ? this.pack.shops?.[id] : undefined,
      itemId,
      this.inventory,
      id ? this.remainingForShop(id) : {},
      this.pack.items,
    );
    this.inventory = result.inventory;
    if (id) this.shopStock[id] = result.remaining;
    this.emitShop(result.ok ? null : this.shopFailRu(result.reason));
    if (result.ok) this.emitExploreAutosave("shop");
  }

  pause(): void {
    this.pausedLogic = true;
    this.syncPointerLock();
  }

  private openPauseMenu(relockWaitMs: number): void {
    if (
      !this.shadowWarmupComplete ||
      playMovementFrozen(this.overlayFlags())
    ) {
      return;
    }
    this.pause();
    this.onBridge({ type: "pause_menu", relockWaitMs });
  }

  private pauseIfBackgrounded(): void {
    if (
      !playBackgroundShouldPause({
        warmupComplete: this.shadowWarmupComplete,
        movementFrozen: playMovementFrozen(this.overlayFlags()),
      })
    ) {
      return;
    }
    this.openPauseMenu(PLAY_POINTER_LOCK_RELOCK_MS);
  }

  resume(): void {
    this.pausedLogic = false;
    restorePlayOverlayFocus(this.renderer.domElement);
    this.requestLookLock();
  }

  private lookState(): {
    paused: boolean;
    finished: boolean;
    awaitingLoot: boolean;
  } {
    const blocked = playLookBlocked(this.overlayFlags());
    return {
      paused: blocked,
      finished: this.finished,
      awaitingLoot: blocked,
    };
  }

  private wantsLookLock(): boolean {
    return playLookWantsPointerLock(this.lookState());
  }

  lockLook(): void {
    this.requestLookLock();
  }

  applyCameraSettings(camera: EmberMapCamera | undefined): void {
    this.cameraRig = resolvePackMapCamera(
      { camera, tileSize: this.map.tileSize },
      this.pack,
      this.map.tileSize,
    );
    this.applyCameraLens();
    this.followDist = this.cameraRig.followDistance;
    const sph = new THREE.Spherical().setFromVector3(
      this.camera.position.clone().sub(this.controls.target),
    );
    sph.radius = this.followDist;
    if (this.cameraRig.pitchLock) {
      sph.phi = this.cameraRig.polarAngle;
    } else {
      sph.phi = THREE.MathUtils.clamp(
        sph.phi,
        this.cameraRig.polarMin,
        this.cameraRig.polarMax,
      );
    }
    this.camera.position.copy(this.controls.target).add(
      new THREE.Vector3().setFromSpherical(sph),
    );
    this.lookOffset.copy(this.camera.position).sub(this.controls.target);
    this.controls.update();
  }

  private applyCameraLens(): void {
    const rig = this.cameraRig;
    this.camera.fov = rig.fov;
    this.camera.near = rig.near;
    this.camera.far = rig.far;
    this.camera.updateProjectionMatrix();
    if (rig.pitchLock) {
      this.controls.minPolarAngle = rig.polarAngle;
      this.controls.maxPolarAngle = rig.polarAngle;
    } else {
      this.controls.minPolarAngle = rig.polarMin;
      this.controls.maxPolarAngle = rig.polarMax;
    }
    this.controls.minDistance = Math.max(48, rig.followDistance * 0.45);
    this.controls.maxDistance = Math.max(rig.followDistance * 1.85, 220);
  }

  private hasLookLock(): boolean {
    return isPlayPointerLockTarget(
      document.pointerLockElement,
      this.renderer.domElement,
      this.parent,
      this.parent.parentElement,
    );
  }

  private lookLockTarget(): HTMLElement {
    const shell = this.parent.parentElement;
    return shell instanceof HTMLElement ? shell : this.parent;
  }

  private syncPointerLock(): void {
    if (this.disposed) return;
    const canvas = this.renderer.domElement;
    const looking = playLookActive(this.lookState());
    if (!looking) {
      this.pendingLookMovementX = 0;
      this.pendingLookMovementY = 0;
      this.lookWarpPending = false;
      this.lookWarpSkip = 0;
    }
    canvas.style.cursor = playCanvasCursor(looking);
    this.parent.classList.toggle("is-looking", looking);
    this.parent.parentElement?.classList.toggle("is-looking", looking);
    syncPlayCursorClip(looking, this.lookLockTarget());
    if (!this.wantsLookLock() && document.pointerLockElement) {
      document.exitPointerLock();
    }
  }

  private requestLookLock(): void {
    if (this.disposed || !this.wantsLookLock()) {
      this.syncPointerLock();
      return;
    }
    this.syncPointerLock();
    if (this.hasLookLock()) return;
    requestPlayPointerLock(this.lookLockTarget());
  }

  private disposeObject(obj: THREE.Object3D): void {
    obj.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.Sprite) {
        const mesh = o as THREE.Mesh;
        if (mesh.userData.yawBillboard) {
          disposeYawBillboard(mesh);
          return;
        }
        const g = mesh.geometry;
        if (g) g.dispose();
        const mat = mesh.material;
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else if (mat) {
          // shared textures cached — do not dispose maps from billboard cache
          mat.dispose();
        }
      }
    });
  }

  destroy(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.completeShadowWarmup();
    cancelAnimationFrame(this.raf);
    window.removeEventListener("resize", this.onResize);
    window.removeEventListener("keydown", this.onKeyDown, true);
    window.removeEventListener("keyup", this.onKeyUp, true);
    window.removeEventListener("blur", this.onWindowBlur);
    window.removeEventListener("focus", this.onWindowFocus);
    document.removeEventListener("visibilitychange", this.onVisibilityChange);
    document.removeEventListener("pointerdown", this.onPointerDown, true);
    document.removeEventListener("pointermove", this.onPointerMove);
    document.removeEventListener("pointerlockchange", this.onPointerLockChange);
    this.parent.classList.remove("is-looking");
    this.parent.parentElement?.classList.remove("is-looking");
    this.mapFadeEl?.remove();
    this.mapFadeEl = null;
    this.mapFadeDoorEl = null;
    this.pendingMapFade = null;
    this.mapFade = createMapFadeState();
    this.scriptHeldForMapFade = false;
    releasePlayCursorClip();
    if (document.pointerLockElement) document.exitPointerLock();
    this.renderer.domElement.removeEventListener(
      "webglcontextlost",
      this.onContextLost,
      false,
    );
    this.renderer.domElement.removeEventListener(
      "webglcontextrestored",
      this.onContextRestored,
      false,
    );
    this.controls.dispose();
    this.profiler.dispose();
    this.post.dispose();
    this.atmosphere.dispose();
    this.waterReflect?.dispose();
    this.waterReflect = null;
    this.staticShadowBakeTarget?.dispose();
    this.staticShadowBakeTarget = null;
    if (this.staticPropFrame) cancelAnimationFrame(this.staticPropFrame);
    this.staticPropFrame = 0;
    this.staticPropQueue = [];
    for (const group of this.staticPropChunks.values()) {
      this.staticPropRoot.remove(group);
      this.disposeObject(group);
    }
    this.staticPropChunks.clear();
    this.loadedStaticPropChunkKeys.clear();
    if (this.mapGroup) {
      this.scene.remove(this.mapGroup);
      this.terrainChunks?.dispose();
      this.terrainChunks = null;
      this.mapGroup = null;
    }
    for (const a of [...this.actors]) this.removeActor(a);
    this.enemyBillboards.dispose();
    this.effectBillboards.dispose();
    this.transientActors.clear();
    setEmberPointShadowAtlas({ enabled: false });
    this.localShadowMapBank.dispose();
    this.clearLightRoot();
    this.localShadowDebug.dispose();
    this.renderer.dispose();
    try {
      this.renderer.forceContextLoss();
    } catch {
      /* ignore */
    }
    if (this.renderer.domElement.parentElement === this.parent) {
      this.parent.removeChild(this.renderer.domElement);
    }
  }

  private clearLightRoot(): void {
    this.clearLightGroup(this.fillLightRoot);
    this.clearLightGroup(this.localLightRoot);
    this.keyLight = null;
    this.dynamicLocalLights = [];
    this.lanternLights = [];
    this.emissiveLights = [];
  }

  private clearLightGroup(root: THREE.Group): void {
    while (root.children.length) {
      const c = root.children[0]!;
      root.remove(c);
      c.traverse((obj) => {
        const light = obj as THREE.Light;
        if (light.isLight && light.shadow?.map) {
          light.shadow.map.dispose();
          light.shadow.map = null as never;
        }
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          const m = obj.material;
          if (Array.isArray(m)) m.forEach((x) => x.dispose());
          else m.dispose();
        }
      });
    }
  }
}
