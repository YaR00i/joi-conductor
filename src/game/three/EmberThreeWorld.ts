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
import {
  buildVoxelSceneMesh,
  type VoxelSceneMesh,
} from "../voxel/voxelSceneMesh";
import {
  createColorBillboard,
  createPixelBillboard,
  disposeYawBillboard,
  hexColorOr,
  updateYawBillboards,
} from "./billboards";
import { getEmberEnvMap } from "./envMap";
import { createMapAtmosphere, type MapAtmosphereHandle } from "./mapAtmosphere";
import { createPostFx, type EmberPostFx } from "./postFx";
import {
  lanternShadowShare,
  resolveEmberRenderBudget,
  type EmberRenderBudget,
} from "./renderBudget";
import {
  addThreeFillLights,
  addThreeLanternLights,
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
  collectEmissiveMaterials,
  tagEmissiveMaterial,
  tickEmissiveLights,
  tickEmissiveMaterials,
} from "./emissiveAnimTick";
import { tickTorchFlicker } from "./torchFlickerTick";
import {
  collectPlanarReflectMaterials,
  estimatePlanarFloorY,
} from "./planarReflectMaterial";
import { buildVoxelMesh, disposeVoxelMesh } from "./voxelMesh";
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

export type EmberThreeWorldOpts = {
  parent: HTMLElement;
  pack: EmberPack;
  stageId: string;
  onBridge: EmberBridgeHandler;
  shortMode?: boolean;
  width?: number;
  height?: number;
};

const STRIP_COLORS = ["#e8a878", "#e09070", "#d07090", "#c050a0"];

type WeaponSlot = { def: EmberWeaponDef; level: number; cooldown: number };

const CHEST_INTERACT_R = 14;

type Actor = {
  mesh: THREE.Object3D;
  lx: number;
  ly: number;
  elev: number;
  radius: number;
  kind: "player" | "enemy" | "bullet" | "ebullet" | "gem" | "chest" | "orbit";
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
  private mapGroup: THREE.Group | null = null;
  private entityRoot = new THREE.Group();
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
  private player!: Actor;
  private playerElev = 0;
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
  private finished = false;
  private followDist = 120;
  private readonly followTarget = new THREE.Vector3();
  private readonly lightRoot = new THREE.Group();
  private atmosphere!: MapAtmosphereHandle;
  private uidSeq = 1;

  private readonly onKeyDown = (ev: KeyboardEvent) => {
    if (ev.code === "Space") ev.preventDefault();
    this.setKey(ev.code, true);
  };
  private readonly onKeyUp = (ev: KeyboardEvent) => this.setKey(ev.code, false);
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
    this.renderer.shadowMap.needsUpdate = true;
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
    const tileset = opts.pack.tilesets[this.map.tilesetId];
    if (!tileset) throw new Error(`tileset ${this.map.tilesetId}`);
    this.tileset = tileset;

    this.maxHp = stage.playerHp;
    this.hp = stage.playerHp;
    this.duration = this.shortMode
      ? Math.min(90, stage.durationSec)
      : stage.durationSec;
    this.xpToLevel = stage.baseXpToLevel;

    const width = opts.width ?? (opts.parent.clientWidth || 960);
    const height = opts.height ?? (opts.parent.clientHeight || 640);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0e0a08);
    this.scene.environment = getEmberEnvMap();
    this.camera = new THREE.PerspectiveCamera(40, width / height, 1, 5000);
    this.renderer = new THREE.WebGLRenderer({
      antialias: false,
      powerPreference: "high-performance",
    });
    this.renderBudget = resolveEmberRenderBudget(
      this.renderer.capabilities,
      "play",
    );
    this.renderer.setSize(width, height);
    // Cap DPR — bloom + shadows already dominate GPU cost.
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
    this.renderer.shadowMap.enabled = true;
    // Hard cartoon umbras (not soft PCF bleed).
    this.renderer.shadowMap.type = THREE.BasicShadowMap;
    this.renderer.domElement.style.display = "block";
    this.renderer.domElement.style.width = "100%";
    this.renderer.domElement.style.height = "100%";
    this.renderer.domElement.style.imageRendering = "pixelated";
    this.renderer.domElement.tabIndex = 0;
    opts.parent.innerHTML = "";
    opts.parent.appendChild(this.renderer.domElement);
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
    // Locked isometric pitch — only horizontal (azimuth) orbit.
    const isoPolar = 0.95;
    this.controls.minPolarAngle = isoPolar;
    this.controls.maxPolarAngle = isoPolar;
    this.controls.minDistance = 64;
    this.controls.maxDistance = 220;
    this.lightRoot.name = "lights";
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
    this.scene.add(this.entityRoot);

    this.buildMapAndLights();
    this.placeMapProps();
    this.refreshWaterMats();
    this.spawnPlayerAndGear();
    this.placeChests();
    this.refreshEmissiveMats();
    // Snap follow target to player immediately.
    const focus = logicToThree(
      this.player.lx,
      this.player.ly,
      this.player.elev,
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
    this.onResize = this.onResize.bind(this);
    window.addEventListener("resize", this.onResize);
    this.renderer.domElement.addEventListener("pointerdown", () => {
      this.renderer.domElement.focus();
    });
    this.renderer.domElement.focus();

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
    const built = buildVoxelMesh(this.map, this.tileset);
    this.mapGroup = built.group;
    this.scene.add(built.group);

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
    addThreeFillLights(this.lightRoot, lightCfg, built.center, {
      keyLight: true,
      shadows: true,
      shadowMapSize: this.renderBudget.directionalShadowMapSize,
      mapWidth: this.map.width * this.map.tileSize,
      mapDepth: this.map.height * this.map.tileSize,
    });
    const lampShadowBudget = lanternShadowShare(this.renderBudget);
    this.lanternLights = addThreeLanternLights(this.lightRoot, {
      map: this.map,
      light: lightCfg,
      center: built.center,
      tileset: this.tileset,
      sprites: this.pack.sprites,
      maxLamps: Math.ceil(this.renderBudget.maxPointLights / 2),
      maxShadows: lampShadowBudget,
      // Match editor: cube shadows occlude lamps through walls.
      shadows: true,
      shadowMapSize: this.renderBudget.pointShadowMapSize,
    });
    this.emissiveLights = addThreeEmissiveLocalLights(
      this.lightRoot,
      this.map,
      this.tileset,
      this.pack.sprites,
      {
        maxLights: Math.max(
          0,
          this.renderBudget.maxPointLights - this.lanternLights.length,
        ),
        maxShadows: Math.max(
          0,
          this.renderBudget.maxPointShadows -
            this.lanternLights.filter((light) => light.castShadow).length,
        ),
        shadowMapSize: this.renderBudget.pointShadowMapSize,
        voxelModels: this.pack.voxelModels,
        voxelScenes: this.pack.voxelScenes,
      },
    );

    // Fixed isometric framing around player (retargeted after spawn).
    this.followDist = THREE.MathUtils.clamp(this.map.tileSize * 7.5, 96, 160);
    const isoPolar = 0.95;
    const yaw = Math.PI * 0.25;
    const spherical = new THREE.Spherical(this.followDist, isoPolar, yaw);
    this.controls.target.copy(built.center);
    this.camera.position.setFromSpherical(spherical).add(this.controls.target);
    this.controls.update();
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

  /** Static map sprites + sculpted voxel props (non-actors). */
  private placeMapProps(): void {
    for (const p of this.map.sprites ?? []) {
      const def = this.pack.sprites[p.spriteId];
      if (!def) continue;
      const elev = tileSurfaceElev(this.map, p.x, p.y);
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
      this.entityRoot.add(mesh);
    }
    for (const p of this.map.voxelProps ?? []) {
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
      this.entityRoot.add(built.group);
    }
  }

  private addActor(a: Actor): void {
    this.actors.push(a);
    this.entityRoot.add(a.mesh);
  }

  private removeActor(a: Actor): void {
    a.dead = true;
    a.outline?.dispose();
    a.outline = null;
    this.entityRoot.remove(a.mesh);
    this.disposeObject(a.mesh);
    this.actors = this.actors.filter((x) => x !== a);
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
    const yLift =
      a.kind === "player"
        ? 5
        : a.kind === "chest" && a.mesh.userData.voxelChest
          ? 0
          : 4;
    const p = logicToThree(a.lx, a.ly, a.elev, yLift, this.map.tileSize);
    a.mesh.position.set(p.x, p.y, p.z);
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
  }

  private tick(): void {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.tick);
    if (this.contextLost) return;
    const dt = Math.min(0.05, this.clock.getDelta());
    this.nowMs += dt * 1000;

    if (!this.pausedLogic && !this.awaitingLoot && !this.finished) {
      this.elapsed += dt;
      this.handleMove(dt);
      this.tickTeleport(dt);
      this.tickTriggerRegions(dt);
      this.tickWeapons(dt);
      this.tickBullets(dt);
      this.tickOrbitals();
      this.tickSpawns(dt);
      this.tickEnemies(dt);
      this.tickChestPickup();
      this.tickGems();
      this.tickTileSemantics();
      this.tickFilth();
      if (this.elapsed >= this.duration) this.finish("clear");
    } else {
      this.tickOrbitals();
    }
    // Keep lid anim running even while loot UI is up (rare) / between frames.
    this.tickChestOpens(dt);

    // Follow player: translate target + camera together so orbit radius stays put.
    const focus = logicToThree(
      this.player.lx,
      this.player.ly,
      this.player.elev,
      6,
      this.map.tileSize,
    );
    this.followTarget.set(focus.x, focus.y, focus.z);

    if (this.keys.q || this.keys.e) {
      const sign = this.keys.q ? -1 : 1;
      const offset = this.camera.position.clone().sub(this.controls.target);
      offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), sign * dt * 1.4);
      this.camera.position.copy(this.controls.target).add(offset);
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
    updateYawBillboards(this.entityRoot, this.camera);
    this.atmosphere.tick(dt, this.nowMs / 1000, this.camera);
    this.tickEmissiveAnims(dt);
    this.tickTorchFlickerAnims();
    if (this.waterMats.length) tickWaterMaterials(this.waterMats, this.nowMs / 1000);
    this.tickInteractiveOutlines();

    this.hudAcc += dt * 1000;
    if (this.hudAcc > 100) {
      this.hudAcc = 0;
      this.emitHud();
    }

    if (this.waterReflect) {
      this.camera.updateMatrixWorld(true);
      this.waterReflect.render(this.renderer, this.scene, this.camera);
    }
    this.post.render();
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
    // Fractional tile coords → soft distance falloff while walking.
    const playerTiles = [
      { x: this.player.lx / ts, y: this.player.ly / ts },
    ];
    const enemyTiles: Array<{ x: number; y: number }> = [];
    for (const a of this.actors) {
      if (a.kind !== "enemy" || a.dead) continue;
      enemyTiles.push({ x: a.lx / ts, y: a.ly / ts });
    }
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
    if (this.emissiveLights.length) tickEmissiveLights(this.emissiveLights, ctx);
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
    if (this.jumpQueued && this.jumpCd <= 0) {
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
        this.playerElev = jumped.elev;
        this.player.elev = jumped.elev;
        this.syncActor(this.player);
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
    this.playerElev = pos.elev;
    this.player.elev = pos.elev;
    this.syncActor(this.player);
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
      this.playerElev = dest.elev;
      this.player.elev = dest.elev;
      this.syncActor(this.player);
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
      this.onBridge({ type: "pending_event", eventId: event.id });
      return;
    }
  }

  private tickWeapons(dt: number): void {
    this.orbitAngle += dt * 2.8;
    for (const slot of this.weapons) {
      if (
        slot.def.kind === "passive" ||
        slot.def.kind === "instant_heal" ||
        slot.def.kind === "orbit"
      ) {
        continue;
      }
      slot.cooldown -= dt * 1000;
      if (slot.cooldown > 0) continue;
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
            this.playerElev,
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
    const mesh = createColorBillboard(
      enemyShot ? "#60ffb0" : "#ffc040",
      enemyShot ? 5 : 7,
    );
    const a: Actor = {
      mesh,
      lx,
      ly,
      elev,
      radius: 3,
      kind: enemyShot ? "ebullet" : "bullet",
      vx,
      vy,
      dmg,
      life: Math.max(0.4, life),
      ...extra,
    };
    this.addActor(a);
    this.syncActor(a);
  }

  private tickBullets(dt: number): void {
    for (const b of [...this.actors]) {
      if (b.kind !== "bullet" && b.kind !== "ebullet") continue;
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
        for (const e of this.actors) {
          if (e.kind !== "enemy" || e.dead) continue;
          if (Math.hypot(e.lx - b.lx, e.ly - b.ly) > e.radius + b.radius) {
            continue;
          }
          this.applyDamageToEnemy(e, b.dmg ?? 0);
          this.removeActor(b);
          break;
        }
      } else if (
        elevNearlyEqual(b.elev, this.playerElev) &&
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
        const mesh = createColorBillboard("#ff8840", 8);
        const actor: Actor = {
          mesh,
          lx: this.player.lx,
          ly: this.player.ly,
          elev: this.playerElev,
          radius: 5,
          kind: "orbit",
        };
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
      o.actor.elev = this.playerElev;
      this.syncActor(o.actor);
      for (const e of this.actors) {
        if (e.kind !== "enemy" || e.dead) continue;
        const uid = e.uid ?? (e.uid = this.uidSeq++);
        if ((o.hitCd.get(uid) ?? 0) > this.nowMs) continue;
        if (Math.hypot(e.lx - o.actor.lx, e.ly - o.actor.ly) > e.radius + 5) {
          continue;
        }
        o.hitCd.set(uid, this.nowMs + 280);
        this.applyDamageToEnemy(e, o.dmg);
      }
    }
  }

  private tickSpawns(dt: number): void {
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
    if (this.actors.filter((a) => a.kind === "enemy" && !a.dead).length > 180) {
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
    const mesh =
      linked && spriteHasVisual(linked)
        ? createPixelBillboard(linked, color, Math.max(8, def.radius))
        : createColorBillboard(color, Math.max(8, def.radius), def.boss ? "#ffdd88" : undefined);
    const { tx, ty } = worldToTile(this.map, p.x, p.y);
    const elev = tileSurfaceElev(this.map, tx, ty);
    const a: Actor = {
      mesh,
      lx: p.x,
      ly: p.y,
      elev,
      radius,
      kind: "enemy",
      hp: def.hp,
      maxHp: def.hp,
      def,
      touchCd: 0,
      uid: this.uidSeq++,
    };
    this.addActor(a);
    this.syncActor(a);
  }

  private tickEnemies(dt: number): void {
    for (const e of [...this.actors]) {
      if (e.kind !== "enemy" || e.dead || !e.def) continue;
      const def = e.def;
      const dist = Math.hypot(e.lx - this.player.lx, e.ly - this.player.ly);
      const angle = Math.atan2(this.player.ly - e.ly, this.player.lx - e.lx);
      const sameElev = elevNearlyEqual(e.elev, this.playerElev);
      e.touchCd = (e.touchCd ?? 0) - dt;

      if (def.ranged && sameElev && dist < (def.range ?? 140) && dist > 40) {
        if ((e.touchCd ?? 0) <= 0) {
          e.touchCd = 1.6;
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
      } else {
        const pos = moveWithVoxels(
          this.map,
          this.tileset,
          e.lx,
          e.ly,
          e.lx + Math.cos(angle) * def.speed * dt,
          e.ly + Math.sin(angle) * def.speed * dt,
          e.radius,
          e.elev,
          this.pack.sprites,
          this.pack.voxelModels,
          this.pack.voxelScenes,
        );
        e.lx = pos.x;
        e.ly = pos.y;
        e.elev = pos.elev;
        this.syncActor(e);
      }

      if (
        !def.ranged &&
        elevNearlyEqual(e.elev, this.playerElev) &&
        dist < e.radius + PLAYER_HURT_R &&
        (e.touchCd ?? 0) <= 0
      ) {
        e.touchCd = 0.55;
        this.damagePlayer(def.damage, def.stripDamage, def);
      }
    }
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
    for (const g of [...this.actors]) {
      if (g.kind !== "gem" || g.dead) continue;
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
    let best: Actor | null = null;
    let bestD = Infinity;
    for (const e of this.actors) {
      if (e.kind !== "enemy" || e.dead) continue;
      const d = Math.hypot(e.lx - this.player.lx, e.ly - this.player.ly);
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }

  private damageEnemiesInRadius(
    x: number,
    y: number,
    r: number,
    dmg: number,
  ): void {
    for (const e of this.actors) {
      if (e.kind !== "enemy" || e.dead) continue;
      if (Math.hypot(e.lx - x, e.ly - y) <= r) this.applyDamageToEnemy(e, dmg);
    }
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
    const mesh = createColorBillboard("#60e0ff", 6);
    const gem: Actor = {
      mesh,
      lx,
      ly,
      elev,
      radius: 4,
      kind: "gem",
      xp: def.xp * this.stage.xpGemValue,
    };
    this.addActor(gem);
    this.syncActor(gem);
  }

  private damagePlayer(
    dmg: number,
    strip: number,
    src?: Pick<EmberEnemyDef, "filthOnHit" | "filthDurationMs">,
  ): void {
    if (this.finished || this.awaitingLoot) return;
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
      paused: this.pausedLogic || this.awaitingLoot,
    });
  }

  pause(): void {
    this.pausedLogic = true;
  }

  resume(): void {
    this.pausedLogic = false;
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
    cancelAnimationFrame(this.raf);
    window.removeEventListener("resize", this.onResize);
    window.removeEventListener("keydown", this.onKeyDown, true);
    window.removeEventListener("keyup", this.onKeyUp, true);
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
    this.post.dispose();
    this.atmosphere.dispose();
    this.waterReflect?.dispose();
    this.waterReflect = null;
    if (this.mapGroup) {
      this.scene.remove(this.mapGroup);
      disposeVoxelMesh(this.mapGroup);
      this.mapGroup = null;
    }
    for (const a of [...this.actors]) this.removeActor(a);
    this.clearLightRoot();
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
    while (this.lightRoot.children.length) {
      const c = this.lightRoot.children[0]!;
      this.lightRoot.remove(c);
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
    this.lanternLights = [];
    this.emissiveLights = [];
  }
}
