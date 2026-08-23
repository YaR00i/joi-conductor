import * as THREE from "three";
import type {
  EmberVoxelModel,
  EmberVoxelPlacement,
} from "../content/types";
import {
  buildVoxelModelMesh,
  type BuildVoxelMeshOpts,
} from "../voxel/voxelMesher";
import { applyVoxelPlacementTransform } from "../voxel/voxelPlacement";

export type ResolvedEditorVoxelPlacement = Readonly<{
  placement: EmberVoxelPlacement;
  elev: number;
}>;

export type EditorVoxelInstanceBatch = Readonly<{
  root: THREE.Group;
  ids: ReadonlySet<string>;
  sync: (placements: readonly ResolvedEditorVoxelPlacement[]) => boolean;
}>;

type InstanceSource = Readonly<{
  source: THREE.Mesh;
  instances: THREE.InstancedMesh;
}>;

function copyMeshRenderState(
  target: THREE.InstancedMesh,
  source: THREE.Mesh,
): void {
  target.name = `instances:${source.name || source.uuid}`;
  target.castShadow = source.castShadow;
  target.receiveShadow = source.receiveShadow;
  target.customDepthMaterial = source.customDepthMaterial;
  target.customDistanceMaterial = source.customDistanceMaterial;
  target.renderOrder = source.renderOrder;
  target.frustumCulled = source.frustumCulled;
  target.layers.mask = source.layers.mask;
}

function worldBoundsOfSources(sources: readonly InstanceSource[]): THREE.Box3 {
  const result = new THREE.Box3();
  const next = new THREE.Box3();
  for (const { source } of sources) {
    if (!source.geometry.boundingBox) source.geometry.computeBoundingBox();
    const local = source.geometry.boundingBox;
    if (!local) continue;
    next.copy(local).applyMatrix4(source.matrixWorld);
    result.union(next);
  }
  return result;
}

/**
 * One draw per material bucket for all repeated placements of one voxel model.
 * The detached template owns the local pivot hierarchy; InstancedMesh matrices
 * receive its final world matrices so rendering, rotation and picking stay exact.
 */
export function createEditorVoxelInstanceBatch(
  model: EmberVoxelModel,
  tileSize: number,
  placements: readonly ResolvedEditorVoxelPlacement[],
  opts?: BuildVoxelMeshOpts,
): EditorVoxelInstanceBatch | null {
  if (placements.length < 2) return null;

  const template = buildVoxelModelMesh(model, tileSize, opts).group;
  // Creates the same centered pivot hierarchy used by ordinary props.
  const first = placements[0]!;
  applyVoxelPlacementTransform(
    template,
    first.placement,
    model,
    tileSize,
    first.elev,
  );
  template.updateMatrixWorld(true);

  const sourceMeshes: THREE.Mesh[] = [];
  template.traverse((object) => {
    if (object instanceof THREE.Mesh) sourceMeshes.push(object);
  });
  if (sourceMeshes.length === 0) return null;

  const root = new THREE.Group();
  root.name = `voxelInstances:${model.id}`;
  const picks = placements.map(({ placement }) => ({
    kind: "voxel" as const,
    id: placement.id,
  }));
  const sources: InstanceSource[] = sourceMeshes.map((source) => {
    const instances = new THREE.InstancedMesh(
      source.geometry,
      source.material,
      placements.length,
    );
    copyMeshRenderState(instances, source);
    instances.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    instances.userData.editorInstancePicks = picks;
    root.add(instances);
    return { source, instances };
  });

  const ids = new Set(picks.map((pick) => pick.id));
  const boundsById = new Map<string, THREE.Box3>();
  root.userData.editorInstanceBoundsById = boundsById;

  const sync = (
    nextPlacements: readonly ResolvedEditorVoxelPlacement[],
  ): boolean => {
    if (
      nextPlacements.length !== placements.length ||
      nextPlacements.some(({ placement }) => !ids.has(placement.id))
    ) {
      return false;
    }
    const byId = new Map(
      nextPlacements.map((entry) => [entry.placement.id, entry]),
    );
    boundsById.clear();
    for (let instanceId = 0; instanceId < picks.length; instanceId++) {
      const pick = picks[instanceId]!;
      const entry = byId.get(pick.id);
      if (!entry) return false;
      applyVoxelPlacementTransform(
        template,
        entry.placement,
        model,
        tileSize,
        entry.elev,
      );
      template.updateMatrixWorld(true);
      for (const { source, instances } of sources) {
        instances.setMatrixAt(instanceId, source.matrixWorld);
      }
      boundsById.set(pick.id, worldBoundsOfSources(sources));
    }
    for (const { instances } of sources) {
      instances.instanceMatrix.needsUpdate = true;
      instances.computeBoundingBox();
      instances.computeBoundingSphere();
    }
    return true;
  };

  sync(placements);
  return { root, ids, sync };
}
