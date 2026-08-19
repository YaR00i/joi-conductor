/**
 * Runtime / preview edge outline for interactive model-bound props (chests…).
 * Idle color when far; pulses idle→interact color when the player can use it.
 */
import * as THREE from "three";
import type { EmberModelOutline } from "../content/types";

const DEFAULT_COLOR = "#ffcc66";
const DEFAULT_INTERACT = "#7dffb0";
const DEFAULT_PULSE_SEC = 1.15;
const _box = new THREE.Box3();
const _size = new THREE.Vector3();
const _center = new THREE.Vector3();

export type InteractiveOutlineHandle = {
  root: THREE.Group;
  setCanInteract: (on: boolean) => void;
  tick: (timeSec: number) => void;
  dispose: () => void;
  refreshBounds: () => void;
};

function parseHex(hex: string | undefined, fallback: string): THREE.Color {
  const c = new THREE.Color();
  try {
    c.set(hex && hex.trim() ? hex : fallback);
  } catch {
    c.set(fallback);
  }
  return c;
}

function pushBoxEdges(
  out: number[],
  minX: number,
  minY: number,
  minZ: number,
  maxX: number,
  maxY: number,
  maxZ: number,
): void {
  const corners: [number, number, number][] = [
    [minX, minY, minZ],
    [maxX, minY, minZ],
    [maxX, minY, maxZ],
    [minX, minY, maxZ],
    [minX, maxY, minZ],
    [maxX, maxY, minZ],
    [maxX, maxY, maxZ],
    [minX, maxY, maxZ],
  ];
  const edges: [number, number][] = [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 0],
    [4, 5],
    [5, 6],
    [6, 7],
    [7, 4],
    [0, 4],
    [1, 5],
    [2, 6],
    [3, 7],
  ];
  for (const [a, b] of edges) {
    const ca = corners[a]!;
    const cb = corners[b]!;
    out.push(ca[0], ca[1], ca[2], cb[0], cb[1], cb[2]);
  }
}

export function resolveModelOutline(
  outline: EmberModelOutline | undefined,
): Required<
  Pick<EmberModelOutline, "enabled" | "color" | "interactColor" | "pulseSec">
> {
  return {
    enabled: outline?.enabled === true,
    color: outline?.color?.trim() || DEFAULT_COLOR,
    interactColor: outline?.interactColor?.trim() || DEFAULT_INTERACT,
    pulseSec:
      typeof outline?.pulseSec === "number" &&
      Number.isFinite(outline.pulseSec) &&
      outline.pulseSec > 0.05
        ? outline.pulseSec
        : DEFAULT_PULSE_SEC,
  };
}

/**
 * Build a world-space edge outline around `target` (AABB).
 * Parent the returned root next to the target (same parent), not as a child,
 * so scale/rotation of the model does not squash the lines — we rebuild from
 * world bounds when `refreshBounds` is called.
 */
export function createInteractiveOutline(
  target: THREE.Object3D,
  outline: EmberModelOutline | undefined,
  parent: THREE.Object3D,
): InteractiveOutlineHandle | null {
  const cfg = resolveModelOutline(outline);
  if (!cfg.enabled) return null;

  const idle = parseHex(cfg.color, DEFAULT_COLOR);
  const interact = parseHex(cfg.interactColor, DEFAULT_INTERACT);
  const mat = new THREE.LineBasicMaterial({
    color: idle.clone(),
    transparent: true,
    opacity: 0.95,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  const geo = new THREE.BufferGeometry();
  const lines = new THREE.LineSegments(geo, mat);
  lines.renderOrder = 40;
  lines.frustumCulled = false;
  const root = new THREE.Group();
  root.name = "interactiveOutline";
  root.add(lines);
  parent.add(root);

  let canInteract = false;
  const inflate = 0.35;

  const refreshBounds = () => {
    _box.setFromObject(target);
    if (_box.isEmpty()) return;
    _box.getSize(_size);
    _box.getCenter(_center);
    if (_size.x < 0.01 && _size.y < 0.01 && _size.z < 0.01) return;
    const positions: number[] = [];
    pushBoxEdges(
      positions,
      _box.min.x - inflate,
      _box.min.y - inflate * 0.35,
      _box.min.z - inflate,
      _box.max.x + inflate,
      _box.max.y + inflate,
      _box.max.z + inflate,
    );
    geo.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    geo.computeBoundingSphere();
  };

  refreshBounds();

  return {
    root,
    setCanInteract: (on) => {
      canInteract = on;
      if (!on) {
        mat.color.copy(idle);
        mat.opacity = 0.92;
      }
    },
    tick: (timeSec) => {
      if (!canInteract) {
        mat.color.copy(idle);
        mat.opacity = 0.92;
        return;
      }
      // 0..1 pulse between idle and interact colors.
      const phase =
        0.5 + 0.5 * Math.sin((timeSec * Math.PI * 2) / cfg.pulseSec);
      mat.color.copy(idle).lerp(interact, phase);
      mat.opacity = 0.78 + phase * 0.22;
    },
    dispose: () => {
      parent.remove(root);
      geo.dispose();
      mat.dispose();
    },
    refreshBounds,
  };
}
