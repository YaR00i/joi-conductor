/**
 * Blender-style corner axis gizmo for the voxel sculpt viewport.
 * Shows world X/Y/Z; click a tip to snap the orbit camera along that axis.
 */
import * as THREE from "three";

export type ViewAxisId = "+x" | "-x" | "+y" | "-y" | "+z" | "-z";

const AXIS_COLOR: Record<"x" | "y" | "z", number> = {
  x: 0xe05050,
  y: 0x50c060,
  z: 0x5090e0,
};

const AXIS_COLOR_NEG: Record<"x" | "y" | "z", number> = {
  x: 0x803030,
  y: 0x306038,
  z: 0x304870,
};

/** Map a tip click → spherical yaw/pitch for the sculpt orbit camera. */
export function viewAxisToSpherical(
  axis: ViewAxisId,
  currentYaw: number,
): { yaw: number; pitch: number } {
  const side = Math.PI / 2;
  switch (axis) {
    case "+x":
      return { yaw: Math.PI / 2, pitch: side };
    case "-x":
      return { yaw: -Math.PI / 2, pitch: side };
    case "+y":
      // Keep yaw so top/bottom views stay oriented.
      return { yaw: currentYaw, pitch: 0.12 };
    case "-y":
      return { yaw: currentYaw, pitch: Math.PI - 0.12 };
    case "+z":
      return { yaw: 0, pitch: side };
    case "-z":
      return { yaw: Math.PI, pitch: side };
    default: {
      const _n: never = axis;
      return _n;
    }
  }
}

function makeLabelSprite(text: string, color: string): THREE.Sprite {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext("2d")!;
  ctx.clearRect(0, 0, 64, 64);
  ctx.font = "bold 36px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineWidth = 6;
  ctx.strokeStyle = "rgba(0,0,0,0.65)";
  ctx.strokeText(text, 32, 34);
  ctx.fillStyle = color;
  ctx.fillText(text, 32, 34);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  const spr = new THREE.Sprite(mat);
  spr.scale.set(0.38, 0.38, 0.38);
  spr.renderOrder = 20;
  return spr;
}

function tipMesh(
  axis: ViewAxisId,
  color: number,
  radius: number,
): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 16, 12),
    new THREE.MeshBasicMaterial({
      color,
      depthTest: true,
      toneMapped: false,
    }),
  );
  mesh.userData.viewAxis = axis;
  mesh.renderOrder = 10;
  return mesh;
}

export type VoxelAxisGizmo = {
  syncFromCamera: (mainCam: THREE.Camera) => void;
  render: () => void;
  dispose: () => void;
  domElement: HTMLCanvasElement;
};

/**
 * Mount a small transparent axis widget into `host`.
 * `onPick` fires when the user clicks a tip sphere.
 */
export function createVoxelAxisGizmo(
  host: HTMLElement,
  onPick: (axis: ViewAxisId) => void,
): VoxelAxisGizmo {
  const size = 104;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 40);
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: "low-power",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.setSize(size, size, false);
  const el = renderer.domElement;
  el.style.width = "100%";
  el.style.height = "100%";
  el.style.display = "block";
  el.style.cursor = "default";
  host.innerHTML = "";
  host.appendChild(el);

  const root = new THREE.Group();
  scene.add(root);

  const axisLen = 0.92;
  const addAxis = (
    dir: THREE.Vector3,
    posId: ViewAxisId,
    negId: ViewAxisId,
    letter: "X" | "Y" | "Z",
    key: "x" | "y" | "z",
  ) => {
    const pos = dir.clone().multiplyScalar(axisLen);
    const neg = dir.clone().multiplyScalar(-axisLen);
    const positions = [neg.x, neg.y, neg.z, pos.x, pos.y, pos.z];
    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    const line = new THREE.Line(
      geo,
      new THREE.LineBasicMaterial({
        color: AXIS_COLOR[key],
        toneMapped: false,
      }),
    );
    root.add(line);

    const tipPos = tipMesh(posId, AXIS_COLOR[key], 0.13);
    tipPos.position.copy(pos);
    root.add(tipPos);

    const tipNeg = tipMesh(negId, AXIS_COLOR_NEG[key], 0.09);
    tipNeg.position.copy(neg);
    root.add(tipNeg);

    const hex =
      key === "x" ? "#ff8080" : key === "y" ? "#80f090" : "#80b0ff";
    const label = makeLabelSprite(letter, hex);
    label.position.copy(pos).multiplyScalar(1.22);
    root.add(label);
  };

  addAxis(new THREE.Vector3(1, 0, 0), "+x", "-x", "X", "x");
  addAxis(new THREE.Vector3(0, 1, 0), "+y", "-y", "Y", "y");
  addAxis(new THREE.Vector3(0, 0, 1), "+z", "-z", "Z", "z");

  // Center nub.
  root.add(
    new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 12, 10),
      new THREE.MeshBasicMaterial({
        color: 0xd0c8b8,
        toneMapped: false,
      }),
    ),
  );

  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();

  const pickAxis = (clientX: number, clientY: number): ViewAxisId | null => {
    const rect = el.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return null;
    ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObjects(root.children, true);
    for (const h of hits) {
      let o: THREE.Object3D | null = h.object;
      while (o) {
        const id = o.userData.viewAxis as ViewAxisId | undefined;
        if (id) return id;
        o = o.parent;
      }
    }
    return null;
  };

  const onPointerMove = (e: PointerEvent) => {
    const hit = pickAxis(e.clientX, e.clientY);
    el.style.cursor = hit ? "pointer" : "default";
  };

  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    const hit = pickAxis(e.clientX, e.clientY);
    if (!hit) return;
    e.preventDefault();
    e.stopPropagation();
    onPick(hit);
  };

  el.addEventListener("pointermove", onPointerMove);
  el.addEventListener("pointerdown", onPointerDown);

  const syncFromCamera = (mainCam: THREE.Camera) => {
    camera.quaternion.copy(mainCam.quaternion);
    camera.position.set(0, 0, 0);
    camera.translateZ(2.55);
    camera.lookAt(0, 0, 0);
  };

  return {
    domElement: el,
    syncFromCamera,
    render() {
      renderer.render(scene, camera);
    },
    dispose() {
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerdown", onPointerDown);
      root.traverse((o) => {
        if (o instanceof THREE.Mesh || o instanceof THREE.Line) {
          o.geometry.dispose();
          const m = o.material;
          if (Array.isArray(m)) m.forEach((x) => x.dispose());
          else m.dispose();
        }
        if (o instanceof THREE.Sprite) {
          const m = o.material;
          m.map?.dispose();
          m.dispose();
        }
      });
      renderer.dispose();
      host.innerHTML = "";
    },
  };
}
