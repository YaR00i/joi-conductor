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
  spriteHasVisual,
} from "../content/pixelSprite";
import type {
  EmberEnemyDef,
  EmberMap,
  EmberPack,
  EmberStage,
  EmberTileset,
  EmberWeaponDef,
} from "../content/types";
import {
  resolveMapAutoAttack,
  resolveMapPlayProfile,
  stageUsesTimedClear,
} from "../content/playProfile";
import {
  emissivePlacementSeed,
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
  resolveMapLight,
  resolveTeleportTarget,
  tileSurfaceElev,
  worldToTile,
} from "../tile/mapUtils";
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
  createColorBillboard,
  createPixelBillboard,
  disposeYawBillboard,
  hexColorOr,
  updateYawBillboards,
} from "./billboards";
import {
  PLAY_LOOK_LOCK_UI_SELECTOR,
  PLAY_POINTER_LOCK_RELOCK_MS,
  isPlayMenuToggleKey,
  isPlayPointerLockTarget,
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
} from "./playPointer";
import { emberWorldLoadProgress } from "./emberLoadProgress";
import { getEmberEnvMap } from "./envMap";
import { createMapAtmosphere, type MapAtmosphereHandle } from "./mapAtmosphere";
import { createPostFx, type EmberPostFx } from "./postFx";
import {
  applyMapLightBudget,
  lanternVisibleShare,
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
import { setEmberVoxelLightSnap } from "./voxelLightSnap";
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
  createEmberFrameProfiler,
  type EmberFrameProfiler,
  type EmberProfilerExtras,
} from "./emberFrameProfiler";
import {
  EMBER_DYNAMIC_ACTOR_LAYER,
  beginPointShadowBake,
  configureCachedSunShadow,
  mapWideDirectionalHalf,
  directionalShadowLightDistance,
  fitDirectionalShadowToFocus,
  invalidatePointLightShadows,
  pickDynamicPointShadowLightsFrom,
  pointLightRequestsShadow,
  setObjectRenderLayer,
} from "./dynamicShadowPolicy";
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
  enemySimLod,
  noteMovementCadence,
  runsOnStaggeredTick,
} from "./enemyAiLod";
import {
  addCrowdSeparation,
  resolveCrowdSteering,
  type CrowdSeparationAccumulator,
} from "./enemyCrowdAvoidance";

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
};

const STRIP_COLORS = ["#e8a878", "#e09070", "#d07090", "#c050a0"];

type WeaponSlot = { def: EmberWeaponDef; level: number; cooldown: number };

const CHEST_INTERACT_R = 14;
const ENEMY_AI_STEP = 1 / 30;
const ENEMY_AI_MAX_STEPS = 3;

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
  private readonly localShadowDebug: LocalShadowDebugOverlay;
  private readonly playProfileBudget: EmberPlayProfileBudget;
  private readonly autoAttackEnabled: boolean;
  private readonly lookOffset = new THREE.Vector3();
  private readonly lookAxis = new THREE.Vector3(0, 1, 0);
  private mapGroup: THREE.Group | null = null;
  private terrainChunks: ChunkedVoxelTerrain | null = null;
  private readonly terrainStreaming: Required<
    NonNullable<EmberThreeWorldOpts["terrainStreaming"]>
  >;
  private terrainFocusChunkKey = "";
  private terrainLoadKeySig = "";
  private terrainRetainKeySig = "";
  private readonly terrainDatasetKey: string;
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
  /** Weak PointLights from dense emissive ink. */
  private emissiveLights: THREE.PointLight[] = [];
  /** Lantern PointLights for global torch flicker. */
  private lanternLights: THREE.PointLight[] = [];
  /** Moving/yawing runtime casters invalidate cached shadow depth this frame. */
  private dynamicShadowDirty = true;
  /** Terrain/props/lights changed; cached point-light cube maps need one bake. */
  private staticShadowDirty = true;
  private sunShadowDirty = true;
  private terrainSettled = false;
  private staticPropsSettled = false;
  private shadowWarmupComplete = false;
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
  private readonly map: EmberMap;
  private readonly tileset: EmberTileset;
  private readonly shortMode: boolean;

  private actors: Actor[] = [];
  private readonly enemies: Actor[] = [];
  private readonly npcs: Actor[] = [];
  private readonly npcPlacementIds = new Set<string>();
  private npcAiAccumulator = 0;
  private readonly projectiles: Actor[] = [];
  private readonly gems: Actor[] = [];
  private readonly enemySpatial: RuntimeActorSpatialIndex<Actor>;
  private enemySpatialDirty = true;
  private enemyAiAccumulator = 0;
  private enemyAiStepsLastFrame = 0;
  private enemyAiTick = 0;
  private enemyPhysicsMovesLastFrame = 0;
  private enemyContactSkipsLastFrame = 0;
  private enemyAvoidanceActorsLastFrame = 0;
  private enemyAvoidanceNeighborsLastFrame = 0;
  private enemyCadenceLastFrame = { full: 0, half: 0, third: 0, quarter: 0 };
  private readonly crowdSeparation: CrowdSeparationAccumulator = {
    x: 0,
    y: 0,
    weight: 0,
  };
  private readonly crowdSteering = { x: 0, y: 0 };
  private readonly emissiveEnemyTiles: Array<{ x: number; y: number }> = [];
  private stressEnemyTarget = 0;
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
  private triggerCd = 0;
  private spawnAcc: number[] = [];
  private onceFired = new Set<number>();
  private chestTaken = new Set<string>();
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
  private pausedLogic = false;
  private lookWarpSkip = 0;
  private finished = false;
  private followDist = 120;
  private readonly followTarget = new THREE.Vector3();
  private keyLight: THREE.DirectionalLight | null = null;
  private readonly sunDir = new THREE.Vector3(0, 1, 0);
  private localShadowActorsMoved = false;
  private localShadowSkip = 0;
  private localPointShadowLimit = 0;
  private readonly localShadowMapBank = new LocalPointShadowMapBank();
  private dynamicLocalLights: THREE.PointLight[] = [];
  private localShadowCandidates: THREE.PointLight[] = [];
  private readonly localShadowActorFocuses: THREE.Vector3[] = [];
  private readonly lightRoot = new THREE.Group();
  private readonly fillLightRoot = new THREE.Group();
  private readonly localLightRoot = new THREE.Group();
  private atmosphere!: MapAtmosphereHandle;
  private uidSeq = 1;

  private readonly onKeyDown = (ev: KeyboardEvent) => {
    if (ev.code === "F4" && !ev.repeat && import.meta.env.DEV) {
      ev.preventDefault();
      this.spawnCrowdStress(ev.shiftKey ? 180 : 120);
      return;
    }
    if (isPlayMenuToggleKey(ev)) {
      ev.preventDefault();
      ev.stopPropagation();
      if (ev.repeat) return;
      this.openPauseMenu(PLAY_POINTER_LOCK_RELOCK_MS);
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
    const yaw = playCameraYawFromMovement(ev.movementX);
    if (yaw === 0) return;
    this.lookOffset.copy(this.camera.position).sub(this.controls.target);
    this.lookOffset.applyAxisAngle(this.lookAxis, yaw);
    this.camera.position.copy(this.controls.target).add(this.lookOffset);
    const locked = this.hasLookLock();
    warpPlayCursorIfNeeded(true, locked);
    this.lookWarpSkip = playLookWarpSkipCount(locked);
  };
  private readonly onPointerLockChange = () => {
    this.syncPointerLock();
  };
  private readonly onWindowBlur = () => {
    this.syncPointerLock();
  };
  private readonly onWindowFocus = () => {
    this.syncPointerLock();
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
    this.autoAttackEnabled = resolveMapAutoAttack(this.map);
    this.enemySpatial = new RuntimeActorSpatialIndex(
      Math.max(24, this.map.tileSize * 2),
    );
    const tileset = opts.pack.tilesets[this.map.tilesetId];
    if (!tileset) throw new Error(`tileset ${this.map.tilesetId}`);
    this.tileset = tileset;
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
    this.camera = new THREE.PerspectiveCamera(40, width / height, 1, 5000);
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
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.1;
    this.controls.enablePan = false;
    this.controls.enableRotate = false;
    this.controls.enableZoom = true;
    // Locked isometric pitch — mouse look only yaws around the player.
    const isoPolar = 0.95;
    this.controls.minPolarAngle = isoPolar;
    this.controls.maxPolarAngle = isoPolar;
    this.controls.minDistance = 64;
    this.controls.maxDistance = 220;
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
      6,
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
    this.post.setGrade(lightCfg.grade, lightCfg.atmosphere.vignette);
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
    this.followDist = THREE.MathUtils.clamp(this.map.tileSize * 7.5, 96, 160);
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
    const isoPolar = 0.95;
    const yaw = Math.PI * 0.25;
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
    this.localShadowMapBank.setDynamicLimit(lightCfg.dynamicPointShadows);
    const explore = !this.playProfileBudget.allowHorde;
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
      maxShadows: lightCaps.maxPointLights,
      shadows: true,
      shadowMapSize: this.renderBudget.pointShadowMapSize,
      shadowFocus: explore ? this.player.mesh.position : undefined,
    });
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
        maxShadows: this.playProfileBudget.emissiveShadows
          ? lightCaps.maxPointLights
          : 0,
        shadowMapSize: this.renderBudget.pointShadowMapSize,
        voxelModels: this.pack.voxelModels,
        voxelScenes: this.pack.voxelScenes,
      },
    );
    this.localShadowCandidates = [
      ...this.lanternLights,
      ...this.emissiveLights,
    ].filter(pointLightRequestsShadow);
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
    const pos = regionCenter(this.map, start);
    const tile = worldToTile(this.map, pos.x, pos.y);
    this.playerElev = tileSurfaceElev(this.map, tile.tx, tile.ty);
    this.playerFeetElev = this.playerElev;
    this.playerFallVelocity = 0;
    this.playerGrounded = true;
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
    for (const r of findRegions(this.map, "chest")) {
      const pose = resolveChestModelPose(this.map, r);
      const mesh = this.makeChestMesh(r, false);
      const a: Actor = {
        mesh,
        lx: pose.x,
        ly: pose.y,
        elev: pose.elev,
        radius: 6,
        kind: "chest",
        regionId: r.id,
      };
      this.addActor(a);
      this.syncActor(a);
      a.outline = createInteractiveOutline(
        mesh,
        r.modelOutline,
        this.entityRoot,
      );
      a.outline?.refreshBounds();
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
      mesh.position.set(
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
    for (const p of this.map.voxelProps ?? []) {
      if (!contains(p.x, p.y)) continue;
      const model = this.pack.voxelModels[p.modelId];
      if (!model) continue;
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
      root.add(built.group);
    }
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
      this.emitLoadProgress();
    };
    if (this.staticPropQueue.length === 0) {
      if (removed) finish();
      else {
        this.staticPropsSettled = true;
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
   * Sun/moon and most lamp cubes contain authored geometry and stay cached
   * while the camera and actors move. Local PointLights still add light
   * inside the baked umbra. The nearest in-range lamp also captures the
   * player/enemy layer.
   */
  private invalidateStaticShadows(): void {
    this.staticShadowDirty = true;
    this.sunShadowDirty = true;
    this.dynamicShadowDirty = true;
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

  private bakeStaticPointShadows(): boolean {
    if (
      (!this.staticShadowDirty && !this.sunShadowDirty) ||
      !this.terrainSettled ||
      !this.staticPropsSettled
    ) {
      return false;
    }

    const sun = this.keyLight;
    const dirtyLights =
      this.localPointShadowLimit > 0
        ? this.localShadowMapBank.dirtyLights()
        : [];
    const batchSize = this.shadowWarmupComplete
      ? 1
      : Math.max(1, this.localPointShadowLimit);
    const batch = dirtyLights.slice(0, batchSize);
    const includeSun = this.sunShadowDirty && sun?.castShadow === true;
    this.localShadowMapBank.prepareStaticBatch(batch);
    const allowed = new Set<THREE.Light>(batch);
    if (includeSun && sun) allowed.add(sun);
    const frozen = this.freezeShadowsExcept((light) => allowed.has(light));
    const pointBake = beginPointShadowBake(batch);
    if (sun?.castShadow) {
      sun.shadow.autoUpdate = false;
      sun.shadow.needsUpdate = includeSun;
    }
    let rendered = false;
    try {
      if (pointBake.count > 0 || includeSun) {
        this.renderOffscreenShadowPass(false);
        rendered = true;
      }
    } finally {
      pointBake.restore();
      this.localShadowMapBank.captureStaticBatch(batch);
      this.restoreFrozenShadows(frozen);
      if (sun) sun.shadow.needsUpdate = false;
    }
    this.sunShadowDirty = false;
    this.staticShadowDirty =
      this.localPointShadowLimit > 0 &&
      this.localShadowMapBank.dirtyLights().length > 0;
    this.localShadowMapBank.applyAssignments(
      this.localShadowCandidates,
      this.dynamicLocalLights,
    );
    this.localShadowDebug.update(this.dynamicLocalLights);
    if (!this.staticShadowDirty) this.completeShadowWarmup();
    else this.emitLoadProgress();
    if (rendered) this.dynamicShadowDirty = true;
    return rendered;
  }

  private completeShadowWarmup(): void {
    if (this.shadowWarmupComplete) return;
    if (!this.disposed) {
      this.lastLoadRatio = -1;
      this.onBridge({
        type: "load_progress",
        ratio: 0.96,
        labelRu: "Кадр…",
      });
      this.bakeDynamicLocalPointShadows(true);
      this.primePlayPresent();
    }
    this.shadowWarmupComplete = true;
    this.emitLoadProgress();
    this.shadowReadyResolve();
  }

  private primePlayPresent(): void {
    this.camera.updateMatrixWorld(true);
    this.renderer.compile(this.scene, this.camera);
    if (this.waterReflect) {
      this.waterReflect.render(this.renderer, this.scene, this.camera);
    }
    this.post.render();
  }

  private emitLoadProgress(): void {
    if (this.disposed) return;
    const bank = this.localShadowMapBank.stats();
    const progress = emberWorldLoadProgress({
      terrainSettled: this.terrainSettled,
      staticPropsSettled: this.staticPropsSettled,
      lightsReady: this.localLightsSpawned,
      shadowCached: bank.cached,
      shadowTotal: Math.max(this.localPointShadowLimit, bank.cached + bank.dirty),
      warmupComplete: this.shadowWarmupComplete,
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
    const selected = pickDynamicPointShadowLightsFrom(
      this.localShadowCandidates,
      this.player.mesh.position,
      {
        maxLights: Math.min(
          lightCfg.dynamicPointShadows,
          this.localPointShadowLimit,
        ),
        previous: this.dynamicLocalLights,
        enterScale: lightCfg.dynamicShadowEnterScale,
        exitScale: lightCfg.dynamicShadowExitScale,
        actorFocuses: this.localShadowActorFocuses,
        camera: this.camera,
      },
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
      const allowed = new Set<THREE.Light>(selected);
      const frozen = this.freezeShadowsExcept((light) => allowed.has(light));
      const bake = beginPointShadowBake(selected);
      try {
        if (bake.count > 0) this.renderOffscreenShadowPass(true);
      } finally {
        bake.restore();
        this.restoreFrozenShadows(frozen);
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
    else this.dynamicShadowDirty = true;
  }

  private tickInteractiveOutlines(): void {
    const t = this.nowMs / 1000;
    for (const a of this.actors) {
      if (!a.outline || a.kind !== "chest" || a.dead) continue;
      if (a.regionId && this.chestTaken.has(a.regionId)) {
        a.outline.setCanInteract(false);
        a.outline.tick(t);
        continue;
      }
      const dist = Math.hypot(a.lx - this.player.lx, a.ly - this.player.ly);
      a.outline.setCanInteract(dist <= CHEST_INTERACT_R);
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
    if (
      !a.enemyBillboard &&
      !a.effectBillboard &&
      a.mesh.position.distanceToSquared(p) > 1e-10
    ) {
      this.localShadowActorsMoved = true;
    }
    a.mesh.position.set(p.x, p.y, p.z);
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

  private tick(): void {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.tick);
    if (this.contextLost) return;
    this.profiler.beginFrame();
    const dt = Math.min(0.05, this.clock.getDelta());
    this.nowMs += dt * 1000;

    if (
      this.shadowWarmupComplete &&
      !this.pausedLogic &&
      !this.awaitingLoot &&
      !this.finished
    ) {
      this.elapsed += dt;
      this.handleMove(dt);
      this.tickPlayerVertical(dt);
      this.tickTeleport(dt);
      this.tickTriggerRegions(dt);
      this.tickWeapons(dt);
      this.tickBullets(dt);
      this.tickOrbitals();
      this.tickSpawns(dt);
      this.tickEnemyAi(dt);
      this.tickNpcs(dt);
      this.tickChestPickup();
      this.tickGems();
      this.tickTileSemantics();
      this.tickFilth();
      if (this.duration > 0 && this.elapsed >= this.duration) {
        this.finish("clear");
      }
    } else {
      this.tickOrbitals();
    }
    // Keep lid anim running even while loot UI is up (rare) / between frames.
    this.tickChestOpens(dt);
    this.updateTerrainStreaming();

    // Follow player: translate target + camera together so orbit radius stays put.
    const focus = logicToThree(
      this.player.lx,
      this.player.ly,
      this.playerFeetElev,
      6,
      this.map.tileSize,
    );
    this.followTarget.set(focus.x, focus.y, focus.z);

    if (this.keys.q || this.keys.e) {
      const sign = this.keys.q ? -1 : 1;
      this.lookOffset.copy(this.camera.position).sub(this.controls.target);
      this.lookOffset.applyAxisAngle(this.lookAxis, sign * dt * 1.4);
      this.camera.position.copy(this.controls.target).add(this.lookOffset);
    }

    const prevX = this.controls.target.x;
    const prevY = this.controls.target.y;
    const prevZ = this.controls.target.z;
    const followAlpha = 1 - Math.pow(0.0002, dt);
    this.controls.target.lerp(this.followTarget, followAlpha);
    this.camera.position.x += this.controls.target.x - prevX;
    this.camera.position.y += this.controls.target.y - prevY;
    this.camera.position.z += this.controls.target.z - prevZ;
    this.controls.update();

    // Sprites stay upright: yaw toward camera only (no pitch tip).
    this.enemyBillboards.sync(this.camera);
    this.effectBillboards.sync(this.camera);
    updateYawBillboards(this.entityRoot, this.camera);
    this.atmosphere.tick(dt, this.nowMs / 1000, this.camera);
    this.tickEmissiveAnims(dt);
    this.tickTorchFlickerAnims();
    if (this.waterMats.length) tickWaterMaterials(this.waterMats, this.nowMs / 1000);
    this.tickInteractiveOutlines();

    // Cached sun bake + lamp cubes. Radius flicker only changes light cutoff.
    const staticJustBaked = this.bakeStaticPointShadows();
    if (this.shadowWarmupComplete) {
      this.bakeDynamicLocalPointShadows(staticJustBaked);
    }

    // Most lamps stay on the cached layer-0 cube. The nearest in-range lamp
    // also captures layer-1 player/enemy silhouettes for this frame.
    if (this.dynamicShadowDirty || this.chestOpens.length > 0) {
      this.renderer.shadowMap.needsUpdate = true;
      this.dynamicShadowDirty = false;
    }

    this.hudAcc += dt * 1000;
    if (this.hudAcc > 100) {
      this.hudAcc = 0;
      this.emitHud();
    }

    this.profiler.beginGpu();
    if (this.waterReflect) {
      this.camera.updateMatrixWorld(true);
      this.waterReflect.render(this.renderer, this.scene, this.camera);
    }
    this.post.render();
    this.profiler.endGpu();
    this.profiler.endFrame(
      this.profiler.isVisible() ? this.profilerExtras() : undefined,
    );
  }

  private profilerExtras(): EmberProfilerExtras {
    const terrain = this.terrainChunks?.getStreamingStats();
    const shadowBank = this.localShadowMapBank.stats();
    const enemyBatchStats = this.enemyBillboards.stats();
    const effectBatchStats = this.effectBillboards.stats();
    const transientPoolStats = this.transientActors.stats();
    let activeLights = 0;
    let shadowLights = 0;
    let pointShadowLights = 0;
    this.lightRoot.traverse((object) => {
      const light = object as THREE.Light;
      if (!light.isLight || !light.visible) return;
      activeLights += 1;
      if (light.castShadow) {
        shadowLights += 1;
        if (light instanceof THREE.PointLight) pointShadowLights += 1;
      }
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
        staticPointShadows: Math.max(
          0,
          pointShadowLights - this.dynamicLocalLights.length,
        ),
        dynamicPointShadows: this.dynamicLocalLights.length,
        dynamicIds,
        cachedPointShadows: shadowBank.cached,
        dirtyPointShadows: shadowBank.dirty,
        activePointShadowSlots: shadowBank.active,
        pooledDynamicShadows: shadowBank.pooledDynamic,
      },
      actors: {
        enemies: this.enemies.length,
        npcs: this.npcs.length,
        batches: enemyBatchStats.batches,
        bullets: this.projectiles.length,
        effects: this.gems.length + this.orbitals.length,
        logicHz: Math.round(1 / ENEMY_AI_STEP),
        logicSteps: this.enemyAiStepsLastFrame,
        spatialBuckets: this.enemySpatial.stats().buckets,
        effectBatches: effectBatchStats.batches,
        effectInstances: effectBatchStats.instances,
        pooledTransient: transientPoolStats.available,
        createdTransient: transientPoolStats.created,
        stressTarget: this.stressEnemyTarget || undefined,
        physicsMoves: this.enemyPhysicsMovesLastFrame,
        contactSkips: this.enemyContactSkipsLastFrame,
        cadenceFull: this.enemyCadenceLastFrame.full,
        cadenceHalf: this.enemyCadenceLastFrame.half,
        cadenceThird: this.enemyCadenceLastFrame.third,
        cadenceQuarter: this.enemyCadenceLastFrame.quarter,
        avoidanceActors: this.enemyAvoidanceActorsLastFrame,
        avoidanceNeighbors: this.enemyAvoidanceNeighborsLastFrame,
      },
    };
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
    const enemyTiles = this.collectNearbyEnemyTiles(18);
    const light = resolveMapLight(this.map);
    const ctx = {
      timeSec: this.nowMs / 1000,
      dt,
      playerTiles,
      enemyTiles,
      activeEventIds: this.activeEmissiveEvents,
      torchFlickerAmount: light.torchFlicker,
      torchFlickerSpeed: light.torchFlickerSpeed,
    };
    if (this.emissiveMats.length) tickEmissiveMaterials(this.emissiveMats, ctx);
    if (this.emissiveLights.length) {
      tickEmissiveLights(this.emissiveLights, ctx);
    }
  }

  private collectNearbyEnemyTiles(maxTiles: number): Array<{ x: number; y: number }> {
    const out = this.emissiveEnemyTiles;
    const ts = this.map.tileSize;
    const maxDist = maxTiles * ts;
    const maxDistSq = maxDist * maxDist;
    const px = this.player.lx;
    const py = this.player.ly;
    let n = 0;
    for (const a of this.enemies) {
      if (a.dead) continue;
      const dx = a.lx - px;
      const dy = a.ly - py;
      if (dx * dx + dy * dy > maxDistSq) continue;
      let tile = out[n];
      if (!tile) {
        tile = { x: 0, y: 0 };
        out[n] = tile;
      }
      tile.x = a.lx / ts;
      tile.y = a.ly / ts;
      n += 1;
    }
    out.length = n;
    return out;
  }

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
    if (this.teleportCd > 0) return;
    for (const r of findRegions(this.map, "teleport")) {
      if (!pointInRegion(this.map, r, this.player.lx, this.player.ly)) continue;
      const dest = resolveTeleportTarget(this.map, r);
      if (!dest) continue;
      this.player.lx = dest.x;
      this.player.ly = dest.y;
      this.resetPlayerVertical(dest.elev);
      this.teleportCd = 0.5;
      return;
    }
  }

  private tickTriggerRegions(dt: number): void {
    this.triggerCd = Math.max(0, this.triggerCd - dt);
    if (this.triggerCd > 0) return;
    for (const r of findRegions(this.map, "trigger")) {
      if (!pointInRegion(this.map, r, this.player.lx, this.player.ly)) continue;
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
    if (this.enemies.length >= 180) {
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
    const { tx, ty } = worldToTile(this.map, p.x, p.y);
    const elev = tileSurfaceElev(this.map, tx, ty);
    const uid = this.uidSeq++;
    const a: Actor = {
      mesh,
      enemyBillboard,
      lx: p.x,
      ly: p.y,
      elev,
      radius,
      kind: "enemy",
      hp: def.hp,
      maxHp: def.hp,
      def,
      touchCd: 0,
      uid,
      aiPhase: uid,
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
    const { tx, ty } = worldToTile(this.map, spawn.x, spawn.y);
    const elev = tileSurfaceElev(this.map, tx, ty);
    const angle = Math.random() * Math.PI * 2;
    const a: Actor = {
      mesh,
      enemyBillboard,
      lx: spawn.x,
      ly: spawn.y,
      elev,
      radius: Math.max(4, this.map.tileSize * 0.3),
      kind: "npc",
      uid: this.uidSeq++,
      npcWander: spawn.wander,
      npcDirX: Math.cos(angle),
      npcDirY: Math.sin(angle),
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
    this.stressEnemyTarget = Math.max(
      this.stressEnemyTarget,
      Math.min(180, Math.round(target)),
    );
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
      textRu: `Stress: ${this.enemies.length}/${this.stressEnemyTarget} врагов · неуязвимость`,
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
      this.enemyContactSkipsLastFrame = 0;
      this.enemyAvoidanceActorsLastFrame = 0;
      this.enemyAvoidanceNeighborsLastFrame = 0;
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
    for (const e of this.enemies) {
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
          const angle = Math.atan2(this.player.ly - e.ly, this.player.lx - e.lx);
          const sp = def.projectileSpeed ?? 120;
          this.spawnBullet(
            e.lx,
            e.ly,
            Math.cos(angle) * sp,
            Math.sin(angle) * sp,
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
        const angle = Math.atan2(this.player.ly - e.ly, this.player.lx - e.lx);
        const pursuitX = Math.cos(angle);
        const pursuitY = Math.sin(angle);
        if (lod.crowdSteer) {
          this.resolveEnemyCrowdSteering(e, pursuitX, pursuitY, lod.maxNeighbors);
        } else {
          this.crowdSteering.x = pursuitX;
          this.crowdSteering.y = pursuitY;
        }
        const nextX = e.lx + this.crowdSteering.x * def.speed * moveDt;
        const nextY = e.ly + this.crowdSteering.y * def.speed * moveDt;
        if (lod.collideWorld) {
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
          );
          e.lx = pos.x;
          e.ly = pos.y;
          e.elev = pos.elev;
        } else {
          e.lx = clampCoordToMap(nextX, e.radius, this.map.width, tileSize);
          e.ly = clampCoordToMap(nextY, e.radius, this.map.height, tileSize);
        }
        this.enemyPhysicsMovesLastFrame += 1;
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

  private tickChestPickup(): void {
    for (const a of [...this.actors]) {
      if (a.kind !== "chest" || a.dead || !a.regionId) continue;
      if (this.chestTaken.has(a.regionId)) continue;
      if (
        Math.hypot(a.lx - this.player.lx, a.ly - this.player.ly) >
        CHEST_INTERACT_R
      ) {
        continue;
      }
      this.chestTaken.add(a.regionId);
      a.outline?.dispose();
      a.outline = null;
      const region = this.map.regions.find((r) => r.id === a.regionId);
      if (!region) {
        this.removeActor(a);
        this.openChest();
        return;
      }

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
          lootOpened: false,
        });
        return;
      }

      if (scene && sceneMesh) {
        sceneMesh.setPlayhead(1, clipId);
        a.dead = true;
        this.openChest();
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
      this.openChest();
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
      this.xp += g.xp ?? 1;
      this.removeActor(g);
      while (this.xp >= this.xpToLevel) {
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
    enemy.hp = (enemy.hp ?? 1) - dmg;
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
    if (this.finished || this.awaitingLoot) return;
    if (this.stressEnemyTarget > 0 && import.meta.env.DEV) return;
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
        !this.shadowWarmupComplete ||
        this.pausedLogic ||
        this.awaitingLoot,
    });
  }

  pause(): void {
    this.pausedLogic = true;
    this.syncPointerLock();
  }

  private openPauseMenu(relockWaitMs: number): void {
    if (
      !this.shadowWarmupComplete ||
      this.pausedLogic ||
      this.awaitingLoot ||
      this.finished
    ) {
      return;
    }
    this.pause();
    this.onBridge({ type: "pause_menu", relockWaitMs });
  }

  resume(): void {
    this.pausedLogic = false;
    this.requestLookLock();
  }

  private lookState(): {
    paused: boolean;
    finished: boolean;
    awaitingLoot: boolean;
  } {
    return {
      paused: this.pausedLogic,
      finished: this.finished,
      awaitingLoot: this.awaitingLoot,
    };
  }

  private wantsLookLock(): boolean {
    return playLookWantsPointerLock(this.lookState());
  }

  lockLook(): void {
    this.requestLookLock();
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
    document.removeEventListener("pointerdown", this.onPointerDown, true);
    document.removeEventListener("pointermove", this.onPointerMove);
    document.removeEventListener("pointerlockchange", this.onPointerLockChange);
    this.parent.classList.remove("is-looking");
    this.parent.parentElement?.classList.remove("is-looking");
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
