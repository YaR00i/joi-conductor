/**
 * Three.js isometric map editor viewport.
 * Fixed pitch, yaw orbit (Alt/RMB), pan (MMB), zoom (wheel).
 * Sprites + voxel props rendered in the same scene as terrain.
 */
import * as THREE from "three";
import type {
  EmberMap,
  EmberPack,
  EmberTileset,
  EmberVoxelModel,
} from "../content/types";
import { clampElevation, MAX_ELEVATION, MIN_ELEVATION } from "../content/types";
import { elevTileIdAt } from "../tile/elevGroundLayers";
import { blockStoryHeight, elevFromWorldY, elevStoryWorldSpan } from "../tile/extruded";
import {
  DEFAULT_MAP_ATMOSPHERE,
  DEFAULT_MAP_GRADE,
  DEFAULT_MAP_LIGHT,
  ensureMapLayers,
  resolveMapLight,
  tileSurfaceElev,
  type MapViewMode,
  type ResolvedMapAtmosphere,
  type ResolvedMapLight,
} from "../tile/mapUtils";
import { VOXELS_PER_BLOCK } from "../voxel/constants";
import { resolveChestModelPose } from "../voxel/chestPlacement";
import {
  buildVoxelModelMesh,
  disposeVoxelModelMesh,
} from "../voxel/voxelMesher";
import { buildVoxelSceneMesh } from "../voxel/voxelSceneMesh";
import { voxelGridSize } from "../voxel/voxelModel";
import { applyVoxelPlacementTransform } from "../voxel/voxelPlacement";
import {
  createPixelBillboard,
  disposeYawBillboard,
  hexColorOr,
  updateYawBillboards,
} from "./billboards";
import {
  clearDebugOverlayRoot,
  createDebugOverlayRoot,
  rebuildEditorDebugOverlays,
  type EditorDebugOverlayFlags,
} from "./editorDebugOverlays";
import { getEmberEnvMap } from "./envMap";
import {
  createEditorTransformGizmo,
  type EditorTransformCommit,
  type EditorTransformGizmo,
  type EditorTransformTarget,
} from "./editorTransformGizmo";
import { createMapAtmosphere } from "./mapAtmosphere";
import { createPostFx, type EmberPostFx } from "./postFx";
import {
  lanternShadowShare,
  resolveEmberRenderBudget,
} from "./renderBudget";
import {
  addLampRangeRing,
  addObjectBoundaryOutline,
  addPlacePreviewOutline,
  addRegionBoundsOutline,
  addTileCellOutlines,
  clearOutlineRoot,
  createOutlineRoot,
  findPickRoot,
  findPropByPick,
  type EditorPick,
  type LampRangeMark,
  type OutlineTone,
  type PlacePreviewMark,
} from "./selectionOutline";

export type { PlacePreviewMark } from "./selectionOutline";
import {
  addThreeFillLights,
  addThreeLanternLights,
} from "./threeLighting";
import {
  addThreeEmissiveLocalLights,
  syncThreeEmissiveLocalLightPoses,
} from "./emissiveLocalLights";
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
import { setEmberVoxelLightSnap } from "./voxelLightSnap";
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
import {
  emissivePlacementSeed,
  hasEmissiveInk,
  resolveEmissiveGlowStrength,
} from "../tile/emissivePaint";
import { normalizePixelSprite } from "../content/pixelSprite";

export type { EditorPick } from "./selectionOutline";

function picksMatch(a: EditorPick | null, b: EditorPick | null): boolean {
  if (a === b) return true;
  if (!a || !b || a.kind !== b.kind) return false;
  if (a.kind === "tile" && b.kind === "tile") {
    return (
      a.tx === b.tx &&
      a.ty === b.ty &&
      (a.elev ?? null) === (b.elev ?? null)
    );
  }
  if (
    (a.kind === "sprite" || a.kind === "voxel") &&
    (b.kind === "sprite" || b.kind === "voxel")
  ) {
    return a.kind === b.kind && a.id === b.id;
  }
  return false;
}

export type EditorOverlayMarks = {
  /** Pointer hover (object or tile under cursor). */
  hover?: EditorPick | null;
  /** Persistent selection outline (click-selected object). */
  selected?: EditorPick | null;
  /** Active paint / fill drag cells. */
  selectTiles?: ReadonlyArray<{ tx: number; ty: number }> | null;
  /** Library drag-over / click-place preview tile. */
  libTile?: { tx: number; ty: number } | null;
  /** Minecraft-like brush place ghost (tx/ty + locked elev). */
  placePreview?: PlacePreviewMark | null;
  /**
   * Hook for a future axis gizmo on the selected cell / prop.
   * Currently unused by the viewport; MapEditorPanel may set it later.
   */
  elevGizmoTarget?: PlacePreviewMark | null;
  /** Selected map region cells. */
  regionTiles?: ReadonlyArray<{ tx: number; ty: number }> | null;
  /**
   * Large region / camera_bound: one AABB instead of per-cell flood.
   * Prefer this when `w * h` is big so the whole map isn't wireframed.
   */
  regionBounds?: { x: number; y: number; w: number; h: number } | null;
  /** Pulse region outline (hover preview of a teleport / zone). */
  pulseRegion?: boolean;
  /** Selected lamp range disc (tile дальность). */
  lampRange?: LampRangeMark | null;
};

/** Polar angle from +Y (0 = top-down). Locked isometric pitch. */
export const EDITOR_ISO_POLAR = 0.95;

const YAW_PRESET: Record<MapViewMode, number> = {
  top: Math.PI * 0.25, // SE quarter-view (not flat top)
  sideEast: 0,
  sideWest: Math.PI,
  sideNorth: -Math.PI / 2,
};

export type EditorThreeLayout = {
  viewMode: MapViewMode;
  cssW: number;
  cssH: number;
  scale: number;
};

export type EditorThreePreview = {
  setMap: (
    map: EmberMap,
    tileset: EmberTileset,
    pack: EmberPack | undefined,
    layout: EditorThreeLayout,
  ) => void;
  setViewPreset: (mode: MapViewMode) => void;
  orbitYaw: (deltaRad: number) => void;
  panScreen: (dxPx: number, dyPx: number) => void;
  zoomBy: (factor: number) => void;
  pickTile: (sx: number, sy: number) => { tx: number; ty: number } | null;
  /**
   * Minecraft-like place target on the locked work-plane elev, with face
   * adjacency when the ray hits terrain (top → same cell elev+1 capped to
   * lock; side → neighbor on lock plane).
   */
  pickPlaceTarget: (
    sx: number,
    sy: number,
    lockedElev: number,
  ) => PlacePreviewMark | null;
  /**
   * Minecraft break target: the block under the cursor (hit story), not the
   * locked place-plane / adjacent empty cell.
   */
  pickBreakTarget: (sx: number, sy: number) => PlacePreviewMark | null;
  /** Raycast props first, then terrain tile. */
  pickObject: (sx: number, sy: number) => EditorPick | null;
  /** 3D edge-glow overlays (hover / selection / lib / region). */
  setOverlayMarks: (marks: EditorOverlayMarks) => void;
  /** Collision / elevation / regions debug layers (toolbar toggles). */
  setDebugOverlays: (flags: EditorDebugOverlayFlags) => void;
  /**
   * Preview-only: hide fog/rain/clouds/dust/fireflies in the editor viewport.
   * Does not change saved map.light.atmosphere.
   */
  setAtmospherePreview: (visible: boolean) => void;
  /**
   * Preview-only: show authored night/fill/lamps/bloom/grade (true),
   * or a neutral day look without bloom/grade/lanterns (false).
   * Atmosphere stays under setAtmospherePreview.
   */
  setLookPreview: (visible: boolean) => void;
  /** Pan orbit target to a map tile (world center of cell). */
  focusTile: (tx: number, ty: number) => void;
  projectTile: (
    tx: number,
    ty: number,
    elev?: number,
  ) => { px: number; py: number; ts: number } | null;
  /** Overlay canvas that receives pointer events (above WebGL). */
  setTransformPointerDom: (el: HTMLElement | null) => void;
  /** Blender-like move/rotate gizmo for the current selection. */
  setTransformTarget: (target: EditorTransformTarget | null) => void;
  setTransformMode: (mode: "translate" | "rotate") => void;
  getTransformMode: () => "translate" | "rotate";
  isTransformBusy: () => boolean;
  onTransformCommit: (
    cb: ((commit: EditorTransformCommit) => void) | null,
  ) => void;
  onTransformDragging: (cb: ((dragging: boolean) => void) | null) => void;
  onTransformPreview: (
    cb: ((pos: { x: number; y: number; z: number } | null) => void) | null,
  ) => void;
  isTransformDragging: () => boolean;
  dispose: () => void;
  domElement: HTMLCanvasElement;
};

export type { EditorTransformCommit, EditorTransformTarget };

function clearLightRoot(root: THREE.Object3D): void {
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

/** Cheap fingerprint of pack assets referenced by map props / lamps. */
function packAssetsSignature(
  m: EmberMap,
  pack: EmberPack | undefined,
): string {
  if (!pack) return "";
  const modelIds = new Set<string>();
  for (const p of m.voxelProps ?? []) modelIds.add(p.modelId);
  for (const r of m.regions ?? []) {
    if (r.closedModelId) modelIds.add(r.closedModelId);
    if (r.kind === "chest" && r.sceneId) {
      const scene = pack.voxelScenes?.[r.sceneId];
      for (const o of scene?.objects ?? []) modelIds.add(o.modelId);
    }
  }
  const spriteIds = new Set<string>();
  for (const p of m.sprites ?? []) spriteIds.add(p.spriteId);

  const hashArr = (arr: number[] | undefined, len: number): number => {
    if (!arr?.length) return 0;
    let h = len;
    const step = Math.max(1, Math.floor(len / 48));
    for (let i = 0; i < len; i += step) {
      h = (Math.imul(h, 33) + (arr[i] ?? 0)) | 0;
    }
    return h;
  };

  const modelParts: string[] = [];
  for (const id of [...modelIds].sort()) {
    const model = pack.voxelModels?.[id];
    if (!model) {
      modelParts.push(`${id}:0`);
      continue;
    }
    const n = model.voxels?.length ?? 0;
    const h =
      hashArr(model.voxels, n) ^
      hashArr(model.emissive, n) ^
      hashArr(model.shine, n) ^
      hashArr(model.transparency, n);
    modelParts.push(
      `${id}:${n}:${h}:${model.directLightScale ?? ""}:${model.emissiveCastsLight ? 1 : 0}:${model.emissiveStrength ?? ""}:${model.emissiveLightRange ?? ""}:${model.physical === false ? 0 : 1}`,
    );
  }
  const spriteParts: string[] = [];
  for (const id of [...spriteIds].sort()) {
    const spr = pack.sprites?.[id];
    if (!spr) {
      spriteParts.push(`${id}:0`);
      continue;
    }
    spriteParts.push(
      `${id}:${spr.emissiveCastsLight ? 1 : 0}:${spr.emissiveStrength ?? ""}:${(spr.pixels?.length ?? 0) | 0}`,
    );
  }
  return `${modelParts.join("|")}#${spriteParts.join("|")}`;
}

function clearObjectRoot(root: THREE.Object3D): void {
  while (root.children.length) {
    const c = root.children[0]!;
    root.remove(c);
    if (c.userData.yawBillboard && c instanceof THREE.Mesh) {
      disposeYawBillboard(c);
    } else {
      disposeVoxelModelMesh(c);
    }
  }
}

export function createEditorThreePreview(
  parent: HTMLElement,
): EditorThreePreview {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0c0a10);
  scene.environment = getEmberEnvMap();

  const camera = new THREE.PerspectiveCamera(40, 1, 1, 8000);
  const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false });
  const renderBudget = resolveEmberRenderBudget(
    renderer.capabilities,
    "editor",
  );
  renderer.setPixelRatio(1);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.BasicShadowMap;
  renderer.domElement.style.display = "block";
  renderer.domElement.style.imageRendering = "pixelated";
  renderer.domElement.style.width = "100%";
  renderer.domElement.style.height = "100%";
  parent.innerHTML = "";
  parent.appendChild(renderer.domElement);

  const post: EmberPostFx = createPostFx(renderer, scene, camera, 64, 64);
  const atmosphere = createMapAtmosphere(scene);
  const transformGizmo: EditorTransformGizmo = createEditorTransformGizmo(
    camera,
    scene,
    () => requestRender(),
  );

  let mapGroup: THREE.Group | null = null;
  const lightRoot = new THREE.Group();
  const propRoot = new THREE.Group();
  const outlineRoot = createOutlineRoot();
  const debugRoot = createDebugOverlayRoot();
  scene.add(lightRoot);
  scene.add(propRoot);
  scene.add(outlineRoot);
  scene.add(debugRoot);

  let disposed = false;
  let contextLost = false;
  let map: EmberMap | null = null;
  let viewW = 64;
  let viewH = 64;
  let yaw = YAW_PRESET.top;
  let zoomDist = 140;
  let camReady = false;
  let lastViewMode: MapViewMode | null = null;
  let lastMapKey = "";
  const overlayMarks: {
    hover: EditorPick | null;
    selected: EditorPick | null;
    selectTiles: { tx: number; ty: number }[];
    libTile: { tx: number; ty: number } | null;
    placePreview: PlacePreviewMark | null;
    elevGizmoTarget: PlacePreviewMark | null;
    regionTiles: { tx: number; ty: number }[];
    regionBounds: { x: number; y: number; w: number; h: number } | null;
    pulseRegion: boolean;
    lampRange: LampRangeMark | null;
  } = {
    hover: null,
    selected: null,
    selectTiles: [],
    libTile: null,
    placePreview: null,
    elevGizmoTarget: null,
    regionTiles: [],
    regionBounds: null,
    pulseRegion: false,
    lampRange: null,
  };
  const target = new THREE.Vector3();
  const spherical = new THREE.Spherical();
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const workPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hit = new THREE.Vector3();
  const faceNormal = new THREE.Vector3();
  let raf = 0;
  let needsFrame = false;
  let atmosAnim = false;
  let emissiveAnim = false;
  let waterAnim = false;
  let modelOutlineAnim = false;
  /** Flat list — avoid traverse() every frame. */
  let emissiveMats: THREE.Material[] = [];
  let waterMats: THREE.Material[] = [];
  let waterReflect: WaterPlanarReflection | null = null;
  let modelOutlines: InteractiveOutlineHandle[] = [];
  let emissiveLights: THREE.PointLight[] = [];
  let lanternLights: THREE.PointLight[] = [];
  let emissiveAnimAcc = 0;
  let atmospherePreview = true;
  let lookPreview = true;
  let lastAtmosphere: ResolvedMapAtmosphere | null = null;
  let lastLightCfg: ResolvedMapLight | null = null;
  let lastLightCenter: THREE.Vector3 | null = null;
  let lastTileset: EmberTileset | null = null;
  let lastPack: EmberPack | undefined;
  let lastMapW = 64;
  let lastMapD = 64;
  let lastTerrainSig = "";
  let lastPropsStructSig = "";
  let lastPropsPoseSig = "";
  let lastLightSig = "";
  let lastPackAssetsSig = "";
  let lastAtmosSig = "";
  let lastOverlaySig = "";
  let outlinesNeedRebuild = false;

  const terrainSignature = (m: EmberMap, tilesetId: string) =>
    JSON.stringify({
      tilesetId,
      id: m.id,
      w: m.width,
      h: m.height,
      ts: m.tileSize,
      layers: m.layers,
    });

  const propsStructureSignature = (m: EmberMap) => {
    const vx = (m.voxelProps ?? [])
      .map(
        (p) =>
          `${p.id}:${p.modelId}:${p.directLightScale ?? ""}:${p.emissiveCastsLight ?? ""}:${p.emissiveLightRange ?? ""}:${p.emissiveSuppressHostShadow ?? ""}`,
      )
      .join("|");
    const sp = (m.sprites ?? [])
      .map((p) => `${p.id}:${p.spriteId}`)
      .join("|");
    const ch = (m.regions ?? [])
      .filter((r) => r.kind === "chest")
      .map(
        (r) =>
          `${r.id}:${r.closedModelId ?? ""}:${r.sceneId ?? ""}:${r.openClipId ?? ""}`,
      )
      .join("|");
    return `${vx}#${sp}#${ch}`;
  };

  const propsPoseSignature = (m: EmberMap) =>
    JSON.stringify({
      voxelProps: m.voxelProps,
      sprites: m.sprites,
      regions: m.regions,
    });

  const lightSignature = (m: EmberMap) =>
    JSON.stringify({ light: m.light, lights: m.lights });

  /** Move existing prop meshes when only pose changed (no remesh). */
  const syncPropPoses = (m: EmberMap, pack: EmberPack | undefined) => {
    const models = pack?.voxelModels ?? {};
    const byPick = new Map<string, THREE.Object3D>();
    for (const child of propRoot.children) {
      const pick = child.userData.editorPick as EditorPick | undefined;
      if (pick?.kind === "voxel" || pick?.kind === "sprite") {
        byPick.set(`${pick.kind}:${pick.id}`, child);
      } else if (child.name.startsWith("chest-preview:")) {
        byPick.set(child.name, child);
      }
    }
    for (const p of m.voxelProps ?? []) {
      const obj = byPick.get(`voxel:${p.id}`);
      const model = models[p.modelId];
      if (!(obj instanceof THREE.Group) || !model) continue;
      const elev = p.elev ?? tileSurfaceElev(m, p.x, p.y);
      applyVoxelPlacementTransform(obj, p, model, m.tileSize, elev);
    }
    for (const p of m.sprites ?? []) {
      const obj = byPick.get(`sprite:${p.id}`);
      if (!obj) continue;
      const elev = tileSurfaceElev(m, p.x, p.y);
      obj.position.set(
        (p.x + 0.5) * m.tileSize,
        elev * blockStoryHeight(m.tileSize) + m.tileSize * 0.45,
        (p.y + 0.5) * m.tileSize,
      );
    }
    for (const r of m.regions ?? []) {
      if (r.kind !== "chest") continue;
      const obj = byPick.get(`chest-preview:${r.id}`);
      if (!obj) continue;
      const pose = resolveChestModelPose(m, r);
      obj.position.set(
        pose.x,
        pose.elev * blockStoryHeight(m.tileSize),
        pose.y,
      );
      obj.rotation.y = pose.rot * (Math.PI / 2);
      obj.scale.setScalar(pose.scale);
    }
  };
  let lastFrameMs = performance.now();
  let animTime = 0;
  let debugFlags: EditorDebugOverlayFlags = {
    showCollision: true,
    showElevation: true,
    showRegions: true,
    showSemantics: true,
  };

  /** Neutral day fill — no night wash / bloom / grade / lamps. */
  const CLEAN_LOOK_LIGHT: ResolvedMapLight = {
    ...DEFAULT_MAP_LIGHT,
    ambientColor: "#f0e8dc",
    ambientAlpha: 0,
    fillIntensity: 1.35,
    bloomStrength: 0,
    bloomThreshold: 1,
    bloomRadius: 0,
    grade: { tone: 0, brightness: 1, saturation: 1 },
    atmosphere: { ...DEFAULT_MAP_ATMOSPHERE },
  };

  const applyAtmospherePreview = () => {
    if (!lastAtmosphere) return;
    const src = lastAtmosphere;
    const atm = atmospherePreview
      ? src
      : {
          ...DEFAULT_MAP_ATMOSPHERE,
          // Keep grade vignette separate — only weather/particles off.
          fog: 0,
          rain: 0,
          cloudShadows: 0,
          dust: 0,
          fireflies: 0,
          haze: 0,
          sunGlare: 0,
          fogColor: src.fogColor,
          wind: src.wind,
          cloudSpeed: src.cloudSpeed,
          vignette: src.vignette,
        };
    const sun = lastLightCfg
      ? {
          azimuth: lastLightCfg.sunAzimuth,
          elevation: lastLightCfg.sunElevation,
          color: lastLightCfg.sunColor,
          night: lastLightCfg.ambientAlpha,
        }
      : undefined;
    atmosphere.apply(atm, lastMapW, lastMapD, sun);
    // Skybox always wants a tick (cloud drift / star twinkle); particles too when preview on.
    atmosAnim = Boolean(lastLightCfg);
  };

  /** Editor light pass — smaller cube maps / fewer casters to avoid VRAM wipe. */
  const applyLookPreview = (): boolean => {
    if (!map || !lastLightCfg || !lastLightCenter || !lastTileset) return false;
    setEmberVoxelLightSnap(
      lastLightCfg.voxelSnapLight,
      map.tileSize / VOXELS_PER_BLOCK,
    );
    clearLightRoot(lightRoot);
    const vignette =
      atmospherePreview && lastAtmosphere ? lastAtmosphere.vignette : 0;
    if (lookPreview) {
      post.setBloom({
        strength: lastLightCfg.bloomStrength,
        threshold: lastLightCfg.bloomThreshold,
        radius: lastLightCfg.bloomRadius,
      });
      post.setGrade(lastLightCfg.grade, vignette);
      addThreeFillLights(lightRoot, lastLightCfg, lastLightCenter, {
        keyLight: true,
        shadows: true,
        shadowMapSize: renderBudget.directionalShadowMapSize,
        mapWidth: lastMapW,
        mapDepth: lastMapD,
      });
      lanternLights = addThreeLanternLights(lightRoot, {
        map,
        light: lastLightCfg,
        center: lastLightCenter,
        tileset: lastTileset,
        sprites: lastPack?.sprites,
        maxLamps: Math.ceil(renderBudget.maxPointLights / 2),
        maxShadows: lanternShadowShare(renderBudget),
        shadows: true,
        shadowMapSize: renderBudget.pointShadowMapSize,
      });
      emissiveLights = addThreeEmissiveLocalLights(
        lightRoot,
        map,
        lastTileset,
        lastPack?.sprites,
        {
          maxLights: Math.max(
            0,
            renderBudget.maxPointLights - lanternLights.length,
          ),
          voxelModels: lastPack?.voxelModels,
          voxelScenes: lastPack?.voxelScenes,
          maxShadows: Math.max(
            0,
            renderBudget.maxPointShadows -
              lanternLights.filter((light) => light.castShadow).length,
          ),
          shadowMapSize: renderBudget.pointShadowMapSize,
        },
      );
    } else {
      post.setBloom({ strength: 0, threshold: 1, radius: 0 });
      // Neutral grade; vignette still follows atmosphere toggle.
      post.setGrade({ ...DEFAULT_MAP_GRADE, brightness: 1 }, vignette);
      addThreeFillLights(lightRoot, CLEAN_LOOK_LIGHT, lastLightCenter, {
        keyLight: true,
        shadows: true,
        shadowMapSize: renderBudget.directionalShadowMapSize,
        mapWidth: lastMapW,
        mapDepth: lastMapD,
      });
      // No lanterns / bloom glow / emissive fill in clean look.
      lanternLights = [];
      emissiveLights = [];
    }
    emissiveAnim =
      emissiveMats.length > 0 ||
      emissiveLights.length > 0 ||
      (lanternLights.length > 0 &&
        (lastLightCfg?.torchFlicker ?? 0) > 0.01);
    renderer.shadowMap.needsUpdate = true;
    return true;
  };

  const rebuildDebug = () => {
    if (!map) {
      clearDebugOverlayRoot(debugRoot);
      return;
    }
    rebuildEditorDebugOverlays(debugRoot, map, debugFlags, lastTileset);
  };

  const applyCamera = () => {
    spherical.set(zoomDist, EDITOR_ISO_POLAR, yaw);
    camera.position.setFromSpherical(spherical).add(target);
    camera.lookAt(target);
    camera.updateMatrixWorld();
  };

  const rebuildOutlines = () => {
    clearOutlineRoot(outlineRoot);
    if (!map) return;

    const tileBatch = (
      cells: ReadonlyArray<{ tx: number; ty: number; elev?: number }>,
      tone: OutlineTone,
      opacityMul = 1,
    ) => {
      if (cells.length) {
        addTileCellOutlines(outlineRoot, map!, cells, tone, opacityMul);
      }
    };

    const regionPulse =
      overlayMarks.pulseRegion &&
      (overlayMarks.regionTiles.length > 0 || overlayMarks.regionBounds)
        ? 0.25 + 0.75 * (0.5 + 0.5 * Math.sin(animTime * 8))
        : 1;
    tileBatch(overlayMarks.regionTiles, "region", regionPulse);
    if (overlayMarks.regionBounds) {
      addRegionBoundsOutline(
        outlineRoot,
        map,
        overlayMarks.regionBounds,
        "region",
        regionPulse,
      );
    }
    tileBatch(overlayMarks.selectTiles, "select");
    if (overlayMarks.libTile) {
      tileBatch([overlayMarks.libTile], "lib");
    }
    if (overlayMarks.placePreview) {
      addPlacePreviewOutline(outlineRoot, map, overlayMarks.placePreview);
    }
    if (overlayMarks.lampRange) {
      addLampRangeRing(outlineRoot, map, overlayMarks.lampRange);
    }

    const drawPick = (pick: EditorPick | null, tone: OutlineTone) => {
      if (!pick) return;
      if (pick.kind === "sprite" || pick.kind === "voxel") {
        const obj = findPropByPick(propRoot, pick);
        if (obj) addObjectBoundaryOutline(outlineRoot, obj, tone);
        return;
      }
      const covered =
        (overlayMarks.libTile?.tx === pick.tx &&
          overlayMarks.libTile?.ty === pick.ty) ||
        overlayMarks.selectTiles.some(
          (c) => c.tx === pick.tx && c.ty === pick.ty,
        );
      if (!covered) {
        tileBatch([{ tx: pick.tx, ty: pick.ty, elev: pick.elev }], tone);
      }
    };

    drawPick(overlayMarks.selected, "select");
    // Hover on top so it reads over the persistent selection.
    if (
      !overlayMarks.selected ||
      !picksMatch(overlayMarks.hover, overlayMarks.selected)
    ) {
      drawPick(overlayMarks.hover, "hover");
    }
  };

  const renderOnce = () => {
    if (disposed) return;
    applyCamera();
    updateYawBillboards(propRoot, camera);
    // Billboard AABBs move with yaw — refresh object frames each paint.
    const hoverObj =
      overlayMarks.hover?.kind === "sprite" ||
      overlayMarks.hover?.kind === "voxel";
    const selObj =
      overlayMarks.selected?.kind === "sprite" ||
      overlayMarks.selected?.kind === "voxel";
    const pulsing =
      overlayMarks.pulseRegion &&
      (overlayMarks.regionTiles.length > 0 || Boolean(overlayMarks.regionBounds));
    if (hoverObj || selObj || pulsing || outlinesNeedRebuild) {
      rebuildOutlines();
      outlinesNeedRebuild = false;
    }
    // Planar water / metal floor mirror (lights dimmed via intensity).
    if (waterReflect) {
      waterReflect.render(renderer, scene, camera);
    }
    post.render();
  };

  const rebuildEmissiveMats = () => {
    emissiveMats = [];
    if (mapGroup) {
      emissiveMats.push(...collectEmissiveMaterials(mapGroup));
    }
    emissiveMats.push(...collectEmissiveMaterials(propRoot));
    emissiveAnim =
      emissiveMats.length > 0 ||
      emissiveLights.length > 0 ||
      (lanternLights.length > 0 &&
        (lastLightCfg?.torchFlicker ?? 0) > 0.01);
    emissiveAnimAcc = 0;
  };

  const rebuildWaterMats = () => {
    if (mapGroup) ensureWaterShoreAttributes(mapGroup);
    waterMats = mapGroup ? collectWaterMaterials(mapGroup) : [];
    const planarMats = [
      ...(mapGroup ? collectPlanarReflectMaterials(mapGroup) : []),
      ...collectPlanarReflectMaterials(propRoot),
    ];
    const allReflect = [...waterMats, ...planarMats];
    waterAnim = waterMats.length > 0;
    if (allReflect.length === 0) {
      waterReflect?.dispose();
      waterReflect = null;
      return;
    }
    if (!waterReflect) waterReflect = createWaterPlanarReflection();
    const planeY =
      estimateWaterPlaneY(mapGroup) ??
      estimatePlanarFloorY(mapGroup) ??
      estimatePlanarFloorY(propRoot);
    if (planeY != null) waterReflect.setPlaneY(planeY);
    const res = waterReflectionResolution(
      viewW,
      viewH,
      maxWaterReflectMult(waterMats),
    );
    waterReflect.setResolution(res.width, res.height);
    waterReflect.bindMaterials(allReflect);
  };

  const pumpFrame = (now: number) => {
    if (disposed || contextLost) {
      raf = 0;
      return;
    }
    const dt = Math.min(0.05, (now - lastFrameMs) / 1000);
    lastFrameMs = now;
    animTime += dt;
    if (atmosAnim) atmosphere.tick(dt, animTime, camera);
    let torchChanged = false;
    if (lanternLights.length && lastLightCfg) {
      torchChanged = tickTorchFlicker(lanternLights, {
        timeSec: animTime,
        amount: lastLightCfg.torchFlicker,
        speed: lastLightCfg.torchFlickerSpeed,
      });
    }
    if (emissiveAnim && (emissiveMats.length || emissiveLights.length)) {
      const ctx = {
        timeSec: animTime,
        dt,
        // Keep triggers extinguished in the editor (same as play start).
        previewArmTriggers: false,
        torchFlickerAmount: lastLightCfg?.torchFlicker ?? 0,
        torchFlickerSpeed: lastLightCfg?.torchFlickerSpeed ?? 1,
      };
      let emChanged = false;
      if (emissiveMats.length) {
        emChanged = tickEmissiveMaterials(emissiveMats, ctx) || emChanged;
      }
      if (emissiveLights.length) {
        emChanged = tickEmissiveLights(emissiveLights, ctx) || emChanged;
      }
      if (emChanged) torchChanged = true;
      emissiveAnimAcc += dt;
    } else if (
      lanternLights.length &&
      (lastLightCfg?.torchFlicker ?? 0) > 0.01
    ) {
      emissiveAnimAcc += dt;
    }
    const pulsing =
      overlayMarks.pulseRegion &&
      (overlayMarks.regionTiles.length > 0 || Boolean(overlayMarks.regionBounds));
    if (waterAnim) tickWaterMaterials(waterMats, animTime);
    if (modelOutlineAnim) {
      for (const o of modelOutlines) {
        o.setCanInteract(true);
        o.tick(animTime);
      }
    }
    // Cap continuous glow anim to ~24fps; interaction still paints immediately.
    const emissiveDue =
      (emissiveAnim && emissiveAnimAcc >= 1 / 24) || torchChanged;
    if (emissiveDue) emissiveAnimAcc = 0;
    if (
      needsFrame ||
      atmosAnim ||
      pulsing ||
      emissiveDue ||
      waterAnim ||
      modelOutlineAnim
    ) {
      needsFrame = false;
      renderOnce();
    }
    if (
      atmosAnim ||
      pulsing ||
      emissiveAnim ||
      waterAnim ||
      modelOutlineAnim ||
      needsFrame
    ) {
      raf = requestAnimationFrame(pumpFrame);
    } else {
      raf = 0;
    }
  };

  const requestRender = () => {
    if (contextLost) return;
    needsFrame = true;
    if (!raf) {
      lastFrameMs = performance.now();
      raf = requestAnimationFrame(pumpFrame);
    }
  };

  const onContextLost = (ev: Event) => {
    ev.preventDefault();
    if (disposed || contextLost) return;
    contextLost = true;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    console.warn("[Ember editor] WebGL context lost; rendering paused");
  };

  const onContextRestored = () => {
    if (disposed) return;
    contextLost = false;
    lastFrameMs = performance.now();
    renderer.shadowMap.needsUpdate = true;
    scene.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh || obj instanceof THREE.Sprite)) return;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const mat of mats) mat.needsUpdate = true;
    });
    console.info("[Ember editor] WebGL context restored");
    requestRender();
  };

  renderer.domElement.addEventListener(
    "webglcontextlost",
    onContextLost,
    false,
  );
  renderer.domElement.addEventListener(
    "webglcontextrestored",
    onContextRestored,
    false,
  );

  const tagPick = (obj: THREE.Object3D, pick: EditorPick) => {
    obj.userData.editorPick = pick;
    obj.traverse((c) => {
      c.userData.editorPick = pick;
    });
  };

  const rebuildProps = (
    m: EmberMap,
    pack: EmberPack | undefined,
  ) => {
    for (const o of modelOutlines) o.dispose();
    modelOutlines = [];
    modelOutlineAnim = false;
    clearObjectRoot(propRoot);
    const sprites = pack?.sprites ?? {};
    for (const p of m.sprites ?? []) {
      const def = sprites[p.spriteId];
      if (!def) continue;
      const elev = tileSurfaceElev(m, p.x, p.y);
      const bill = createPixelBillboard(
        def,
        hexColorOr(def.color, "#c8a878"),
        m.tileSize * 0.95,
      );
      bill.position.set(
        (p.x + 0.5) * m.tileSize,
        elev * blockStoryHeight(m.tileSize) + m.tileSize * 0.45,
        (p.y + 0.5) * m.tileSize,
      );
      const n = normalizePixelSprite(def);
      if (n.emissivePixels && hasEmissiveInk(n.emissivePixels)) {
        const mat = bill.material as THREE.MeshBasicMaterial;
        tagEmissiveMaterial(mat, {
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
      tagPick(bill, { kind: "sprite", id: p.id });
      propRoot.add(bill);
    }

    const models = pack?.voxelModels ?? {};
    for (const p of m.voxelProps ?? []) {
      const model: EmberVoxelModel | undefined = models[p.modelId];
      if (!model) continue;
      const elev = p.elev ?? tileSurfaceElev(m, p.x, p.y);
      const suppressHostShadow =
        p.emissiveSuppressHostShadow !== undefined
          ? p.emissiveSuppressHostShadow
          : model.emissiveSuppressHostShadow === true;
      const built = buildVoxelModelMesh(model, m.tileSize, {
        directLightScale: p.directLightScale ?? model.directLightScale,
        suppressCastShadow: suppressHostShadow,
      });
      applyVoxelPlacementTransform(
        built.group,
        p,
        model,
        m.tileSize,
        elev,
      );
      tagPick(built.group, { kind: "voxel", id: p.id });
      propRoot.add(built.group);
    }

    // Chest regions: scene (hinged) or closed lone model.
    for (const r of m.regions ?? []) {
      if (r.kind !== "chest") continue;
      const pose = resolveChestModelPose(m, r);
      const scenes = pack?.voxelScenes ?? {};
      const scene = r.sceneId ? scenes[r.sceneId] : undefined;
      if (scene) {
        const built = buildVoxelSceneMesh(scene, models, {
          tileSize: m.tileSize,
          directLightScale: pose.directLightScale,
          playhead: 0,
          clipId: r.openClipId ?? scene.animations?.[0]?.id ?? null,
        });
        if (!built) continue;
        built.root.position.set(
          pose.x,
          pose.elev * blockStoryHeight(m.tileSize),
          pose.y,
        );
        built.root.rotation.y = pose.rot * (Math.PI / 2);
        built.root.scale.setScalar(pose.scale);
        built.root.name = `chest-preview:${r.id}`;
        propRoot.add(built.root);
        const outline = createInteractiveOutline(
          built.root,
          r.modelOutline,
          propRoot,
        );
        if (outline) {
          outline.refreshBounds();
          modelOutlines.push(outline);
          modelOutlineAnim = true;
        }
        continue;
      }
      if (!r.closedModelId) continue;
      const model: EmberVoxelModel | undefined = models[r.closedModelId];
      if (!model) continue;
      const built = buildVoxelModelMesh(model, m.tileSize, {
        directLightScale: pose.directLightScale,
        suppressCastShadow: model.emissiveSuppressHostShadow === true,
      });
      const { sx, sz } = voxelGridSize(model);
      const vw = m.tileSize / VOXELS_PER_BLOCK;
      const inner = new THREE.Group();
      while (built.group.children.length) {
        inner.add(built.group.children[0]!);
      }
      inner.position.set(-sx * vw * 0.5, 0, -sz * vw * 0.5);
      built.group.add(inner);
      built.group.position.set(
        pose.x,
        pose.elev * blockStoryHeight(m.tileSize),
        pose.y,
      );
      built.group.rotation.y = pose.rot * (Math.PI / 2);
      built.group.scale.setScalar(pose.scale);
      // Not tagged as voxel prop — clicks still hit the chest region tile.
      built.group.name = `chest-preview:${r.id}`;
      propRoot.add(built.group);
      const outline = createInteractiveOutline(
        built.group,
        r.modelOutline,
        propRoot,
      );
      if (outline) {
        outline.refreshBounds();
        modelOutlines.push(outline);
        modelOutlineAnim = true;
      }
    }
  };

  const pickTileAt = (
    sx: number,
    sy: number,
  ): { tx: number; ty: number } | null => {
    if (!map) return null;
    ndc.x = (sx / viewW) * 2 - 1;
    ndc.y = -(sy / viewH) * 2 + 1;
    raycaster.setFromCamera(ndc, camera);
    if (mapGroup) {
      const hits = raycaster.intersectObject(mapGroup, true);
      if (hits[0]?.face) {
        faceNormal
          .copy(hits[0].face.normal)
          .transformDirection(hits[0].object.matrixWorld)
          .normalize();
        const p = hits[0].point
          .clone()
          .addScaledVector(faceNormal, -Math.max(0.2, map.tileSize * 0.12));
        const tx = Math.floor(p.x / map.tileSize);
        const ty = Math.floor(p.z / map.tileSize);
        if (tx >= 0 && ty >= 0 && tx < map.width && ty < map.height) {
          return { tx, ty };
        }
      }
    }
    groundPlane.constant = 0;
    if (raycaster.ray.intersectPlane(groundPlane, hit)) {
      const tx = Math.floor(hit.x / map.tileSize);
      const ty = Math.floor(hit.z / map.tileSize);
      if (tx >= 0 && ty >= 0 && tx < map.width && ty < map.height) {
        return { tx, ty };
      }
    }
    return null;
  };

  /**
   * Resolve a paint target like Minecraft:
   * 1) Prefer face adjacency when the ray hits terrain (top → above, side → neighbor).
   * 2) Always snap elev to the locked work plane (brush Z / Ctrl+wheel).
   * 3) Fall back to intersecting the locked horizontal plane (goes through water).
   */
  const pickPlaceTargetAt = (
    sx: number,
    sy: number,
    lockedElevRaw: number,
  ): PlacePreviewMark | null => {
    if (!map) return null;
    const lockedElev = clampElevation(lockedElevRaw);
    const ts = map.tileSize;
    const storyH = blockStoryHeight(ts);
    applyCamera();
    ndc.x = (sx / viewW) * 2 - 1;
    ndc.y = -(sy / viewH) * 2 + 1;
    raycaster.setFromCamera(ndc, camera);

    const inBounds = (tx: number, ty: number) =>
      tx >= 0 && ty >= 0 && tx < map!.width && ty < map!.height;

    if (mapGroup) {
      const hits = raycaster.intersectObject(mapGroup, true);
      const hitInfo = hits[0];
      if (hitInfo?.face) {
        faceNormal
          .copy(hitInfo.face.normal)
          .transformDirection(hitInfo.object.matrixWorld)
          .normalize();
        const p = hitInfo.point;
        let tx = Math.floor(p.x / ts);
        let ty = Math.floor(p.z / ts);
        // Side face → step into the adjacent cell (Minecraft attach).
        if (Math.abs(faceNormal.y) < 0.55) {
          if (Math.abs(faceNormal.x) >= Math.abs(faceNormal.z)) {
            tx += faceNormal.x > 0 ? 1 : -1;
          } else {
            ty += faceNormal.z > 0 ? 1 : -1;
          }
        } else if (faceNormal.y > 0.55) {
          // Top face: if lock matches this story, place on top (Minecraft +1).
          const hitStory = clampElevation(elevFromWorldY(p.y, storyH));
          if (lockedElev === hitStory) {
            const above = clampElevation(hitStory + 1);
            if (inBounds(tx, ty)) {
              return { tx, ty, elev: above };
            }
          }
        } else {
          // Bottom face → cell below in XY stays; elev still locked.
        }
        if (inBounds(tx, ty)) {
          return { tx, ty, elev: lockedElev };
        }
      }
    }

    // Locked height plane — top of the locked elev story (matches props/water).
    workPlane.constant = -(lockedElev * storyH);
    if (raycaster.ray.intersectPlane(workPlane, hit)) {
      const tx = Math.floor(hit.x / ts);
      const ty = Math.floor(hit.z / ts);
      if (inBounds(tx, ty)) {
        return { tx, ty, elev: lockedElev };
      }
    }

    // Last resort: ground plane at Y=0 mapped to locked elev.
    groundPlane.constant = 0;
    if (raycaster.ray.intersectPlane(groundPlane, hit)) {
      const tx = Math.floor(hit.x / ts);
      const ty = Math.floor(hit.z / ts);
      if (inBounds(tx, ty)) {
        return { tx, ty, elev: lockedElev };
      }
    }
    return null;
  };

  /**
   * Break/erase/select: pick the occupied story the ray actually hits.
   * Samples slightly inside the hit face and falls back along -normal so
   * shared tile edges don't resolve to the empty neighbor cell.
   */
  const pickBreakTargetAt = (
    sx: number,
    sy: number,
  ): PlacePreviewMark | null => {
    if (!map || !mapGroup) return null;
    const ts = map.tileSize;
    const storyH = blockStoryHeight(ts);
    applyCamera();
    ndc.x = (sx / viewW) * 2 - 1;
    ndc.y = -(sy / viewH) * 2 + 1;
    raycaster.setFromCamera(ndc, camera);

    const hits = raycaster.intersectObject(mapGroup, true);
    const hitInfo = hits[0];
    if (!hitInfo?.face) return null;

    faceNormal
      .copy(hitInfo.face.normal)
      .transformDirection(hitInfo.object.matrixWorld)
      .normalize();

    const eps = storyH * 0.08;
    // Thin floor caps sit just above y1 (~0.7 tall) — count them as that story.
    const capSlack = 1.15;

    const elevAtColumn = (
      tx: number,
      ty: number,
      y: number,
    ): number | null => {
      if (tx < 0 || ty < 0 || tx >= map!.width || ty >= map!.height) {
        return null;
      }
      let best: { elev: number; dist: number } | null = null;
      for (let e = MIN_ELEVATION; e <= MAX_ELEVATION; e++) {
        if (!elevTileIdAt(map!, tx, ty, e)) continue;
        const { y0, y1 } = elevStoryWorldSpan(e, storyH);
        if (y >= y0 - eps && y <= y1 + capSlack) {
          const mid = (y0 + y1) * 0.5;
          const dist = Math.abs(y - mid);
          if (!best || dist < best.dist) best = { elev: e, dist };
        }
      }
      if (best) return best.elev;
      // Nearest occupied story in this column (caps / scraps).
      let elev = clampElevation(elevFromWorldY(y, storyH));
      if (elevTileIdAt(map!, tx, ty, elev)) return elev;
      const below = clampElevation(elev - 1);
      if (below !== elev && elevTileIdAt(map!, tx, ty, below)) return below;
      const above = clampElevation(elev + 1);
      if (above !== elev && elevTileIdAt(map!, tx, ty, above)) return above;
      return null;
    };

    const tryPoint = (p: THREE.Vector3): PlacePreviewMark | null => {
      const tx = Math.floor(p.x / ts);
      const ty = Math.floor(p.z / ts);
      const elev = elevAtColumn(tx, ty, p.y);
      if (elev == null) return null;
      return { tx, ty, elev, mode: "erase" };
    };

    const raw = hitInfo.point;
    // Prefer a deep nudge into the solid — shallow nudges still land in the
    // empty neighbor when the hit sits exactly on a shared face.
    const step = Math.max(0.2, ts * 0.12);
    const samples: THREE.Vector3[] = [
      raw.clone().addScaledVector(faceNormal, -step),
      raw.clone().addScaledVector(faceNormal, -step * 2.5),
      raw.clone().addScaledVector(faceNormal, -ts * 0.45),
      raw.clone(),
    ];
    for (const p of samples) {
      const hit = tryPoint(p);
      if (hit) return hit;
    }

    // Last resort: search the 4-neighbor cells around the hit for a story
    // that contains the hit height (side-face grazing).
    const baseTx = Math.floor(raw.x / ts);
    const baseTy = Math.floor(raw.z / ts);
    const neigh: [number, number][] = [
      [baseTx, baseTy],
      [baseTx - 1, baseTy],
      [baseTx + 1, baseTy],
      [baseTx, baseTy - 1],
      [baseTx, baseTy + 1],
    ];
    let bestN: { mark: PlacePreviewMark; dist: number } | null = null;
    for (const [tx, ty] of neigh) {
      const elev = elevAtColumn(tx, ty, raw.y);
      if (elev == null) continue;
      const cx = (tx + 0.5) * ts;
      const cz = (ty + 0.5) * ts;
      const dist = (raw.x - cx) ** 2 + (raw.z - cz) ** 2;
      if (!bestN || dist < bestN.dist) {
        bestN = {
          mark: { tx, ty, elev, mode: "erase" },
          dist,
        };
      }
    }
    return bestN?.mark ?? null;
  };

  return {
    domElement: renderer.domElement,
    setMap(mapIn, tileset, pack, layout) {
      map = ensureMapLayers(mapIn);
      viewW = Math.max(64, Math.round(layout.cssW));
      viewH = Math.max(64, Math.round(layout.cssH));

      const terrainSig = terrainSignature(map, tileset.id);
      const propsStructSig = propsStructureSignature(map);
      const propsPoseSig = propsPoseSignature(map);
      const lightSig = lightSignature(map);
      const packAssetsSig = packAssetsSignature(map, pack);
      const atmosSig = JSON.stringify({
        light: map.light,
        preview: atmospherePreview,
        look: lookPreview,
        w: map.width * map.tileSize,
        d: map.height * map.tileSize,
      });

      const terrainDirty = terrainSig !== lastTerrainSig;
      const propsStructDirty = propsStructSig !== lastPropsStructSig;
      const propsPoseDirty = propsPoseSig !== lastPropsPoseSig;
      const lightDirty = lightSig !== lastLightSig;
      const packAssetsDirty = packAssetsSig !== lastPackAssetsSig;
      const atmosDirty = atmosSig !== lastAtmosSig;
      const hasPlacements =
        (map.voxelProps?.length ?? 0) > 0 ||
        (map.sprites?.length ?? 0) > 0 ||
        (map.regions ?? []).some((r) => r.kind === "chest");
      // Safety: empty prop root with placements (e.g. first pack hydrated late).
      const propsMissing =
        hasPlacements && propRoot.children.length === 0;

      if (terrainDirty) {
        if (mapGroup) {
          scene.remove(mapGroup);
          disposeVoxelMesh(mapGroup);
          mapGroup = null;
        }
        const built = buildVoxelMesh(map, tileset);
        mapGroup = built.group;
        scene.add(mapGroup);
        lastLightCenter = built.center.clone();

        const mapKey = `${map.id}:${map.width}x${map.height}:${map.tileSize}`;
        const viewChanged = lastViewMode !== layout.viewMode;
        const mapIdentityChanged = lastMapKey !== mapKey;
        if (!camReady || mapIdentityChanged) {
          target.copy(built.center);
          zoomDist = THREE.MathUtils.clamp(
            Math.max(map.width, map.height) * map.tileSize * 0.7,
            90,
            420,
          );
          yaw = YAW_PRESET[layout.viewMode] ?? YAW_PRESET.top;
          camReady = true;
        } else if (viewChanged) {
          yaw = YAW_PRESET[layout.viewMode] ?? yaw;
        }
        lastViewMode = layout.viewMode;
        lastMapKey = mapKey;
        lastTerrainSig = terrainSig;
      } else if (lastViewMode !== layout.viewMode) {
        yaw = YAW_PRESET[layout.viewMode] ?? yaw;
        lastViewMode = layout.viewMode;
      }

      lastTileset = tileset;
      lastPack = pack;
      lastMapW = map.width * map.tileSize;
      lastMapD = map.height * map.tileSize;
      const lightCfg = resolveMapLight(map);
      lastLightCfg = lightCfg;
      lastAtmosphere = lightCfg.atmosphere;

      if (propsStructDirty || packAssetsDirty || propsMissing) {
        rebuildProps(map, pack);
        lastPropsStructSig = propsStructSig;
        lastPropsPoseSig = propsPoseSig;
        lastPackAssetsSig = packAssetsSig;
      } else if (propsPoseDirty) {
        syncPropPoses(map, pack);
        // Keep emissive lamp centers glued to moved/rotated voxel props
        // without a full lightRoot rebuild.
        if (emissiveLights.length > 0 && lastTileset) {
          syncThreeEmissiveLocalLightPoses(
            emissiveLights,
            map,
            lastTileset,
            pack?.sprites,
            {
              voxelModels: pack?.voxelModels,
              voxelScenes: pack?.voxelScenes,
            },
          );
        }
        lastPropsPoseSig = propsPoseSig;
      } else {
        lastPackAssetsSig = packAssetsSig;
      }

      // Fill/lantern lights depend on terrain + lamp list + prop *structure*
      // / pack emissive hosts. Pose-only prop moves keep PointLights via sync above.
      if (
        terrainDirty ||
        propsStructDirty ||
        packAssetsDirty ||
        propsMissing ||
        lightDirty
      ) {
        if (applyLookPreview()) {
          lastLightSig = lightSig;
        }
      }

      if (atmosDirty) {
        applyAtmospherePreview();
        lastAtmosSig = atmosSig;
      }

      if (terrainDirty) {
        rebuildEmissiveMats();
        rebuildWaterMats();
      } else if (propsStructDirty || packAssetsDirty || propsMissing) {
        rebuildEmissiveMats();
      }

      outlinesNeedRebuild = true;
      if (terrainDirty) rebuildDebug();

      parent.style.top = "0";
      parent.style.left = "0";
      parent.style.width = `${viewW}px`;
      parent.style.height = `${viewH}px`;

      const maxSide = 1400;
      const scaleFit = Math.min(1, maxSide / Math.max(viewW, viewH));
      const bufW = Math.max(64, Math.round(viewW * scaleFit));
      const bufH = Math.max(64, Math.round(viewH * scaleFit));
      const sizeDirty =
        renderer.domElement.width !== bufW ||
        renderer.domElement.height !== bufH;
      if (sizeDirty) {
        camera.aspect = bufW / bufH;
        camera.updateProjectionMatrix();
        renderer.setSize(bufW, bufH, false);
        post.setSize(bufW, bufH);
        if (waterReflect) {
          const res = waterReflectionResolution(
            bufW,
            bufH,
            maxWaterReflectMult(waterMats),
          );
          waterReflect.setResolution(res.width, res.height);
        }
      }
      requestRender();
    },
    setViewPreset(mode) {
      yaw = YAW_PRESET[mode] ?? yaw;
      requestRender();
    },
    orbitYaw(deltaRad) {
      yaw += deltaRad;
      requestRender();
    },
    panScreen(dxPx, dyPx) {
      // Pan along camera right / forward-on-XZ.
      const right = new THREE.Vector3();
      const forward = new THREE.Vector3();
      camera.getWorldDirection(forward);
      forward.y = 0;
      if (forward.lengthSq() < 1e-6) forward.set(0, 0, 1);
      forward.normalize();
      right.crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
      const k = zoomDist * 0.0022;
      target.addScaledVector(right, -dxPx * k);
      target.addScaledVector(forward, dyPx * k);
      requestRender();
    },
    zoomBy(factor) {
      zoomDist = THREE.MathUtils.clamp(zoomDist * factor, 48, 700);
      requestRender();
    },
    pickTile(sx, sy) {
      return pickTileAt(sx, sy);
    },
    pickPlaceTarget(sx, sy, lockedElev) {
      return pickPlaceTargetAt(sx, sy, lockedElev);
    },
    pickBreakTarget(sx, sy) {
      return pickBreakTargetAt(sx, sy);
    },
    pickObject(sx, sy) {
      if (!map) return null;
      applyCamera();
      updateYawBillboards(propRoot, camera);
      ndc.x = (sx / viewW) * 2 - 1;
      ndc.y = -(sy / viewH) * 2 + 1;
      raycaster.setFromCamera(ndc, camera);
      const propHits = raycaster.intersectObject(propRoot, true);
      if (propHits[0]) {
        const pick = findPickRoot(propHits[0].object);
        if (pick) return pick;
      }
      // Prefer the occupied story the ray hits (middle blocks in a column).
      const story = pickBreakTargetAt(sx, sy);
      if (story) {
        return {
          kind: "tile" as const,
          tx: story.tx,
          ty: story.ty,
          elev: story.elev,
        };
      }
      // Empty ground only — never invent a story cube in a vacant neighbor.
      const tile = pickTileAt(sx, sy);
      if (!tile) return null;
      return { kind: "tile", tx: tile.tx, ty: tile.ty };
    },
    setOverlayMarks(marks) {
      if (marks.hover !== undefined) overlayMarks.hover = marks.hover;
      if (marks.selected !== undefined) overlayMarks.selected = marks.selected;
      if (marks.selectTiles !== undefined) {
        overlayMarks.selectTiles = marks.selectTiles
          ? marks.selectTiles.map((c) => ({ tx: c.tx, ty: c.ty }))
          : [];
      }
      if (marks.libTile !== undefined) overlayMarks.libTile = marks.libTile;
      if (marks.placePreview !== undefined) {
        overlayMarks.placePreview = marks.placePreview
          ? { ...marks.placePreview }
          : null;
      }
      if (marks.elevGizmoTarget !== undefined) {
        overlayMarks.elevGizmoTarget = marks.elevGizmoTarget
          ? { ...marks.elevGizmoTarget }
          : null;
      }
      if (marks.regionTiles !== undefined) {
        overlayMarks.regionTiles = marks.regionTiles
          ? marks.regionTiles.map((c) => ({ tx: c.tx, ty: c.ty }))
          : [];
      }
      if (marks.regionBounds !== undefined) {
        overlayMarks.regionBounds = marks.regionBounds
          ? { ...marks.regionBounds }
          : null;
      }
      if (marks.pulseRegion !== undefined) {
        overlayMarks.pulseRegion = Boolean(marks.pulseRegion);
      }
      if (marks.lampRange !== undefined) {
        overlayMarks.lampRange = marks.lampRange;
      }
      const overlaySig = JSON.stringify(overlayMarks);
      if (overlaySig === lastOverlaySig) {
        requestRender();
        return;
      }
      lastOverlaySig = overlaySig;
      outlinesNeedRebuild = true;
      requestRender();
    },
    setDebugOverlays(flags) {
      if (
        debugFlags.showCollision === flags.showCollision &&
        debugFlags.showElevation === flags.showElevation &&
        debugFlags.showRegions === flags.showRegions &&
        debugFlags.showSemantics === flags.showSemantics
      ) {
        return;
      }
      debugFlags = { ...flags };
      rebuildDebug();
      requestRender();
    },
    setAtmospherePreview(visible) {
      if (atmospherePreview === visible) return;
      atmospherePreview = visible;
      applyAtmospherePreview();
      // Vignette rides with atmosphere — refresh grade path.
      applyLookPreview();
      requestRender();
    },
    setLookPreview(visible) {
      // Idempotent: hover/selection sync must not rebuild PointLights
      // (they start extinguished and ease up — looks like the lamp blinks out).
      if (lookPreview === visible) return;
      lookPreview = visible;
      applyLookPreview();
      requestRender();
    },
    focusTile(tx, ty) {
      if (!map) return;
      if (tx < 0 || ty < 0 || tx >= map.width || ty >= map.height) return;
      const elev = tileSurfaceElev(map, tx, ty);
      target.set(
        (tx + 0.5) * map.tileSize,
        elev * blockStoryHeight(map.tileSize) + 1,
        (ty + 0.5) * map.tileSize,
      );
      requestRender();
    },
    projectTile(tx, ty, elev = 0) {
      if (!map) return null;
      if (tx < 0 || ty < 0 || tx >= map.width || ty >= map.height) return null;
      applyCamera();
      const world = new THREE.Vector3(
        (tx + 0.5) * map.tileSize,
        elev * blockStoryHeight(map.tileSize) + 1,
        (ty + 0.5) * map.tileSize,
      );
      const projected = world.project(camera);
      const px = ((projected.x + 1) / 2) * viewW;
      const py = ((-projected.y + 1) / 2) * viewH;
      const ts = Math.max(6, map.tileSize * (90 / zoomDist) * 8);
      return { px: px - ts / 2, py: py - ts / 2, ts };
    },
    setTransformPointerDom(el) {
      transformGizmo.setPointerDom(el);
    },
    setTransformTarget(target) {
      transformGizmo.setTarget(target);
    },
    setTransformMode(mode) {
      transformGizmo.setMode(mode);
    },
    getTransformMode() {
      return transformGizmo.getMode();
    },
    isTransformBusy() {
      return transformGizmo.isBusy();
    },
    isTransformDragging() {
      return transformGizmo.isDragging();
    },
    onTransformCommit(cb) {
      transformGizmo.onCommit(cb);
    },
    onTransformDragging(cb) {
      transformGizmo.onDraggingChanged(cb);
    },
    onTransformPreview(cb) {
      transformGizmo.onPreview(cb);
    },
    dispose() {
      disposed = true;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      transformGizmo.dispose();
      post.dispose();
      atmosphere.dispose();
      if (mapGroup) {
        scene.remove(mapGroup);
        disposeVoxelMesh(mapGroup);
      }
      clearLightRoot(lightRoot);
      for (const o of modelOutlines) o.dispose();
      modelOutlines = [];
      modelOutlineAnim = false;
      waterReflect?.dispose();
      waterReflect = null;
      clearObjectRoot(propRoot);
      clearOutlineRoot(outlineRoot);
      clearDebugOverlayRoot(debugRoot);
      renderer.domElement.removeEventListener(
        "webglcontextlost",
        onContextLost,
        false,
      );
      renderer.domElement.removeEventListener(
        "webglcontextrestored",
        onContextRestored,
        false,
      );
      renderer.dispose();
      try {
        renderer.forceContextLoss();
      } catch {
        /* ignore */
      }
      if (renderer.domElement.parentElement === parent) {
        parent.removeChild(renderer.domElement);
      }
    },
  };
}
