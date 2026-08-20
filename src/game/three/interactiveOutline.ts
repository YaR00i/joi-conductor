/**
 * Runtime / preview edge outline for interactive model-bound props (chests…).
 * Idle color when far; pulses idle→interact color when the player can use it.
 */
import * as THREE from "three";
import type { EmberModelOutline } from "../content/types";

const DEFAULT_COLOR = "#ffcc66";
const DEFAULT_INTERACT = "#7dffb0";
const DEFAULT_PULSE_SEC = 1.15;

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
 * Build edge lines from the target's actual rendered meshes. Lines are attached
 * to their source meshes, so voxel-scene joints and chest lid animation carry
 * the outline automatically instead of falling back to one large AABB.
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
    depthTest: true,
    depthWrite: false,
    toneMapped: false,
  });
  const root = new THREE.Group();
  root.name = "interactiveOutline";
  parent.add(root);

  let canInteract = false;
  const attachments: Array<{
    host: THREE.Mesh;
    lines: THREE.LineSegments;
  }> = [];

  const clearAttachments = () => {
    for (const entry of attachments.splice(0)) {
      entry.host.remove(entry.lines);
      entry.lines.geometry.dispose();
    }
  };

  const slightlyInflate = (geo: THREE.BufferGeometry) => {
    geo.computeBoundingBox();
    const box = geo.boundingBox;
    const pos = geo.getAttribute("position");
    if (!box || !(pos instanceof THREE.BufferAttribute)) return;
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxSide = Math.max(0.001, size.x, size.y, size.z);
    const scale = 1 + Math.min(0.025, 0.18 / maxSide);
    for (let i = 0; i < pos.count; i++) {
      pos.setXYZ(
        i,
        center.x + (pos.getX(i) - center.x) * scale,
        center.y + (pos.getY(i) - center.y) * scale,
        center.z + (pos.getZ(i) - center.z) * scale,
      );
    }
    pos.needsUpdate = true;
    geo.computeBoundingSphere();
  };

  const refreshBounds = () => {
    clearAttachments();
    const hosts: THREE.Mesh[] = [];
    target.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      if (obj.userData.emberInteractiveOutline === true) return;
      if (!obj.geometry.getAttribute("position")) return;
      hosts.push(obj);
    });
    for (const host of hosts) {
      const geo = new THREE.EdgesGeometry(host.geometry, 18);
      const position = geo.getAttribute("position");
      if (!position || position.count === 0) {
        geo.dispose();
        continue;
      }
      slightlyInflate(geo);
      const lines = new THREE.LineSegments(geo, mat);
      lines.name = "interactiveVoxelEdges";
      lines.userData.emberInteractiveOutline = true;
      lines.renderOrder = 40;
      lines.frustumCulled = true;
      host.add(lines);
      attachments.push({ host, lines });
    }
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
      clearAttachments();
      parent.remove(root);
      mat.dispose();
    },
    refreshBounds,
  };
}
