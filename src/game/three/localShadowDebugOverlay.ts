import * as THREE from "three";
import { pointLightShadowReach } from "./dynamicShadowPolicy";

export type LocalShadowDebugStatus =
  | "dynamic"
  | "baked"
  | "cached"
  | "warming"
  | "no-shadow";

export type LocalShadowDebugOverlay = {
  setVisible: (visible: boolean) => void;
  rebuild: (
    lights: readonly THREE.PointLight[],
    dynamicLights: readonly THREE.PointLight[],
    enterScale: number,
  ) => void;
  update: (dynamicLights: readonly THREE.PointLight[]) => void;
  dispose: () => void;
};

type DebugMarker = {
  light: THREE.PointLight;
  root: THREE.Group;
  pointMaterial: THREE.MeshBasicMaterial;
  reachMaterial: THREE.MeshBasicMaterial;
  labelMaterial: THREE.SpriteMaterial;
  labelCanvas: HTMLCanvasElement;
  labelTexture: THREE.CanvasTexture;
  sourceId: string;
  status: LocalShadowDebugStatus | null;
};

const STATUS_COLOR: Record<LocalShadowDebugStatus, THREE.ColorRepresentation> = {
  dynamic: 0x4cff72,
  baked: 0x4aa8ff,
  cached: 0xffa640,
  warming: 0xffdc62,
  "no-shadow": 0x8b929c,
};

const STATUS_LABEL: Record<LocalShadowDebugStatus, string> = {
  dynamic: "DYNAMIC",
  baked: "BAKED",
  cached: "CACHED",
  warming: "WARMING",
  "no-shadow": "NO SHADOW",
};

export function localShadowDebugStatus(
  light: THREE.PointLight,
  dynamicLights: ReadonlySet<THREE.PointLight>,
): LocalShadowDebugStatus {
  const granted = light.userData.emberShadowGranted === true;
  if (granted && dynamicLights.has(light)) return "dynamic";
  if (granted) {
    return light.userData.emberStaticShadowCached === true
      ? "baked"
      : "warming";
  }
  return "no-shadow";
}

export function localShadowDebugSourceId(
  light: THREE.PointLight,
  fallbackIndex: number,
): string {
  const lamp = light.userData.emberLamp as { sourceId?: string } | undefined;
  return (
    lamp?.sourceId ??
    (light.userData.emberEmissiveSourceId as string | undefined) ??
    `local-${fallbackIndex + 1}`
  );
}

function drawLabel(marker: DebugMarker, status: LocalShadowDebugStatus): void {
  const canvas = marker.labelCanvas;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const color = new THREE.Color(STATUS_COLOR[status]).getStyle();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "rgba(4, 8, 14, 0.86)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = color;
  ctx.lineWidth = 5;
  ctx.strokeRect(3, 3, canvas.width - 6, canvas.height - 6);
  ctx.fillStyle = color;
  ctx.font = "bold 25px monospace";
  ctx.textBaseline = "middle";
  ctx.fillText(
    `${STATUS_LABEL[status]} · ${marker.sourceId}`.slice(0, 42),
    14,
    canvas.height / 2,
  );
  marker.labelTexture.needsUpdate = true;
}

export function createLocalShadowDebugOverlay(
  scene: THREE.Scene,
): LocalShadowDebugOverlay {
  const root = new THREE.Group();
  root.name = "localShadowDebug";
  root.userData.emberSkipWaterReflect = true;
  root.visible = false;
  scene.add(root);

  let visible = false;
  let lights: readonly THREE.PointLight[] = [];
  let dynamicLights: readonly THREE.PointLight[] = [];
  let enterScale = 0.8;
  let markers: DebugMarker[] = [];

  const clearMarkers = () => {
    for (const marker of markers) {
      root.remove(marker.root);
      marker.root.traverse((object) => {
        if (object instanceof THREE.Mesh) object.geometry.dispose();
      });
      marker.pointMaterial.dispose();
      marker.reachMaterial.dispose();
      marker.labelTexture.dispose();
      marker.labelMaterial.dispose();
    }
    markers = [];
  };

  const update = (nextDynamicLights: readonly THREE.PointLight[]) => {
    dynamicLights = nextDynamicLights;
    if (!visible) return;
    const dynamicSet = new Set(dynamicLights);
    for (const marker of markers) {
      marker.light.getWorldPosition(marker.root.position);
      const status = localShadowDebugStatus(marker.light, dynamicSet);
      if (status === marker.status) continue;
      marker.status = status;
      marker.pointMaterial.color.set(STATUS_COLOR[status]);
      marker.reachMaterial.color.set(STATUS_COLOR[status]);
      drawLabel(marker, status);
    }
  };

  const buildMarkers = () => {
    clearMarkers();
    if (!visible) return;
    markers = lights.map((light, index) => {
      const markerRoot = new THREE.Group();
      markerRoot.renderOrder = 10_000;
      light.getWorldPosition(markerRoot.position);

      const pointMaterial = new THREE.MeshBasicMaterial({
        color: STATUS_COLOR.baked,
        wireframe: true,
        depthTest: false,
        depthWrite: false,
        transparent: true,
        opacity: 1,
      });
      const point = new THREE.Mesh(
        new THREE.OctahedronGeometry(4, 0),
        pointMaterial,
      );
      point.renderOrder = 10_000;
      markerRoot.add(point);

      const reach = Math.max(2, pointLightShadowReach(light) * enterScale);
      const reachMaterial = new THREE.MeshBasicMaterial({
        color: STATUS_COLOR.baked,
        wireframe: true,
        depthTest: false,
        depthWrite: false,
        transparent: true,
        opacity: 0.16,
      });
      const reachSphere = new THREE.Mesh(
        new THREE.SphereGeometry(reach, 16, 10),
        reachMaterial,
      );
      reachSphere.renderOrder = 9_999;
      markerRoot.add(reachSphere);

      const labelCanvas = document.createElement("canvas");
      labelCanvas.width = 512;
      labelCanvas.height = 64;
      const labelTexture = new THREE.CanvasTexture(labelCanvas);
      labelTexture.generateMipmaps = false;
      labelTexture.minFilter = THREE.LinearFilter;
      const labelMaterial = new THREE.SpriteMaterial({
        map: labelTexture,
        depthTest: false,
        depthWrite: false,
        transparent: true,
        fog: false,
      });
      const label = new THREE.Sprite(labelMaterial);
      label.position.set(0, 8, 0);
      label.scale.set(56, 7, 1);
      label.renderOrder = 10_001;
      markerRoot.add(label);

      const marker: DebugMarker = {
        light,
        root: markerRoot,
        pointMaterial,
        reachMaterial,
        labelMaterial,
        labelCanvas,
        labelTexture,
        sourceId: localShadowDebugSourceId(light, index),
        status: null,
      };
      root.add(markerRoot);
      return marker;
    });
    update(dynamicLights);
  };

  return {
    setVisible(nextVisible) {
      if (visible === nextVisible) return;
      visible = nextVisible;
      root.visible = visible;
      if (visible) buildMarkers();
    },
    rebuild(nextLights, nextDynamicLights, nextEnterScale) {
      lights = nextLights;
      dynamicLights = nextDynamicLights;
      enterScale = Math.max(0.05, nextEnterScale);
      if (visible) buildMarkers();
    },
    update,
    dispose() {
      clearMarkers();
      scene.remove(root);
    },
  };
}
