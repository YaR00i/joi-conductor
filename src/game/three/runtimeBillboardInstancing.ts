import * as THREE from "three";
import {
  EMBER_DYNAMIC_ACTOR_LAYER,
  setObjectRenderLayer,
} from "./dynamicShadowPolicy";

export type RuntimeBillboardInstance = {
  slot: number;
  batch: RuntimeBillboardBatch;
};

type RuntimeBillboardEntry = {
  proxy: THREE.Object3D;
  handle: RuntimeBillboardInstance;
};

type RuntimeBillboardBatch = {
  key: string;
  mesh: THREE.InstancedMesh<
    THREE.BufferGeometry,
    THREE.Material | THREE.Material[]
  >;
  baseScale: THREE.Vector3;
  entries: RuntimeBillboardEntry[];
  dirty: boolean;
};

export type RuntimeBillboardBatchStats = {
  batches: number;
  instances: number;
};

const _dummy = new THREE.Object3D();
const _cameraPosition = new THREE.Vector3();

/**
 * Dense runtime batches for moving upright billboards.
 *
 * Gameplay state remains one Actor per enemy; only render resources and draw
 * submission are shared. A swap-remove keeps instance slots compact.
 */
export class RuntimeBillboardBatches {
  private readonly batches = new Map<string, RuntimeBillboardBatch>();
  private readonly lastCameraPosition = new THREE.Vector3(
    Number.POSITIVE_INFINITY,
    Number.POSITIVE_INFINITY,
    Number.POSITIVE_INFINITY,
  );

  constructor(
    private readonly root: THREE.Object3D,
    private readonly capacityPerBatch = 256,
  ) {}

  add(
    key: string,
    proxy: THREE.Object3D,
    createTemplate: () => THREE.Mesh<
      THREE.BufferGeometry,
      THREE.Material | THREE.Material[]
    >,
  ): RuntimeBillboardInstance {
    let batch = this.batches.get(key);
    if (!batch) {
      const template = createTemplate();
      const mesh = new THREE.InstancedMesh(
        template.geometry,
        template.material,
        this.capacityPerBatch,
      );
      mesh.name = `runtimeBillboardBatch:${key}`;
      mesh.count = 0;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.castShadow = template.castShadow;
      mesh.receiveShadow = template.receiveShadow;
      mesh.customDepthMaterial = template.customDepthMaterial;
      mesh.customDistanceMaterial = template.customDistanceMaterial;
      // The batch spans the active arena. Per-instance frustum culling is not
      // available on InstancedMesh; one batched draw is cheaper than rebuilding
      // aggregate bounds for every moving enemy each frame.
      mesh.frustumCulled = false;
      mesh.userData.emberRuntimeBillboardBatch = true;
      setObjectRenderLayer(mesh, EMBER_DYNAMIC_ACTOR_LAYER);
      batch = {
        key,
        mesh,
        baseScale: template.scale.clone(),
        entries: [],
        dirty: true,
      };
      this.batches.set(key, batch);
      this.root.add(mesh);
    }
    if (batch.entries.length >= this.capacityPerBatch) {
      throw new Error(
        `Runtime billboard batch '${key}' exceeded ${this.capacityPerBatch} instances`,
      );
    }
    const handle: RuntimeBillboardInstance = {
      batch,
      slot: batch.entries.length,
    };
    batch.entries.push({ proxy, handle });
    batch.mesh.count = batch.entries.length;
    batch.dirty = true;
    return handle;
  }

  markDirty(handle: RuntimeBillboardInstance | undefined): void {
    if (handle) handle.batch.dirty = true;
  }

  remove(handle: RuntimeBillboardInstance): void {
    const batch = handle.batch;
    const slot = handle.slot;
    if (slot < 0 || slot >= batch.entries.length) return;
    const lastIndex = batch.entries.length - 1;
    if (slot !== lastIndex) {
      const moved = batch.entries[lastIndex]!;
      batch.entries[slot] = moved;
      moved.handle.slot = slot;
    }
    batch.entries.pop();
    handle.slot = -1;
    batch.mesh.count = batch.entries.length;
    batch.dirty = true;
  }

  sync(camera: THREE.Camera): boolean {
    camera.getWorldPosition(_cameraPosition);
    const cameraMoved =
      this.lastCameraPosition.distanceToSquared(_cameraPosition) > 1e-10;
    if (cameraMoved) this.lastCameraPosition.copy(_cameraPosition);
    let changed = false;
    for (const batch of this.batches.values()) {
      if (!batch.dirty && !cameraMoved) continue;
      for (let i = 0; i < batch.entries.length; i++) {
        const proxy = batch.entries[i]!.proxy;
        const dx = _cameraPosition.x - proxy.position.x;
        const dz = _cameraPosition.z - proxy.position.z;
        const yaw = Math.atan2(dx, dz);
        _dummy.position.copy(proxy.position);
        _dummy.rotation.set(0, yaw, 0);
        _dummy.scale.copy(batch.baseScale);
        _dummy.updateMatrix();
        batch.mesh.setMatrixAt(i, _dummy.matrix);
      }
      batch.mesh.instanceMatrix.needsUpdate = true;
      batch.dirty = false;
      changed = true;
    }
    return changed;
  }

  stats(): RuntimeBillboardBatchStats {
    let instances = 0;
    for (const batch of this.batches.values()) {
      instances += batch.entries.length;
    }
    return { batches: this.batches.size, instances };
  }

  dispose(): void {
    for (const batch of this.batches.values()) {
      this.root.remove(batch.mesh);
      batch.mesh.geometry.dispose();
      const materials = Array.isArray(batch.mesh.material)
        ? batch.mesh.material
        : [batch.mesh.material];
      for (const material of materials) material.dispose();
      batch.mesh.customDepthMaterial?.dispose();
      batch.mesh.customDistanceMaterial?.dispose();
      batch.entries.length = 0;
    }
    this.batches.clear();
  }
}
