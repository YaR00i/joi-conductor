import type {
  EmberMap,
  EmberSceneGroup,
  EmberSceneHierarchy,
  EmberSceneLocalTransform,
} from "../../content/types";
import { resolveEmberTransformScale } from "../../world/worldTransform";
export type {
  EmberSceneGroup,
  EmberSceneHierarchy,
  EmberSceneLocalTransform,
} from "../../content/types";

function storedObjectPositions(map: EmberMap): Map<string, { x: number; y: number; z: number }> {
  const positions = new Map<string, { x: number; y: number; z: number }>();
  for (const item of map.voxelProps ?? []) {
    positions.set(`voxel:${item.id}`, { x: item.x, y: item.y, z: item.elev ?? 0 });
  }
  for (const item of map.sprites ?? []) {
    positions.set(`sprite:${item.id}`, {
      x: item.x,
      y: item.y,
      z: item.elev ?? 0,
    });
  }
  for (const item of map.lights ?? []) {
    if (item.enabled === false) continue;
    positions.set(`light:${item.id}`, { x: item.x, y: item.y, z: item.lampHeight ?? 0 });
  }
  for (const item of map.regions) {
    positions.set(`region:${item.id}`, {
      x: item.x + Math.max(0, item.w - 1) / 2,
      y: item.y + Math.max(0, item.h - 1) / 2,
      z: 0,
    });
  }
  return positions;
}

function normalizeTurns(value: number | undefined): number {
  return ((Math.round(value ?? 0) % 4) + 4) % 4;
}

function storedObjectRotations(map: EmberMap): Map<string, number> {
  const rotations = new Map<string, number>();
  for (const item of map.voxelProps ?? []) {
    rotations.set(`voxel:${item.id}`, normalizeTurns(item.rot));
  }
  for (const item of map.sprites ?? []) rotations.set(`sprite:${item.id}`, 0);
  for (const item of map.lights ?? []) {
    if (item.enabled !== false) rotations.set(`light:${item.id}`, 0);
  }
  for (const item of map.regions) rotations.set(`region:${item.id}`, 0);
  return rotations;
}

function inverseRotateOffset(x: number, y: number, quarterTurns: number) {
  let nextX = x;
  let nextY = y;
  for (let index = 0; index < normalizeTurns(-quarterTurns); index += 1) {
    [nextX, nextY] = [-nextY, nextX];
  }
  return { x: nextX, y: nextY };
}

function unique<T>(items: Iterable<T>): T[] {
  return [...new Set(items)];
}

function normalizedGroups(
  hierarchy: EmberSceneHierarchy,
  validObjectKeys: ReadonlySet<string>,
): EmberSceneGroup[] {
  const ids = new Set(hierarchy.groups.map((group) => group.id));
  const claimedObjects = new Set<string>();
  const groups = hierarchy.groups.map((group) => {
    const objectKeys = unique(group.objectKeys).filter((key) => {
      if (!validObjectKeys.has(key) || claimedObjects.has(key)) return false;
      claimedObjects.add(key);
      return true;
    });
    return {
      ...group,
      parentGroupId:
        group.parentGroupId &&
        group.parentGroupId !== group.id &&
        ids.has(group.parentGroupId)
          ? group.parentGroupId
          : undefined,
      objectKeys,
      pivot: { ...group.pivot },
      rotationQuarterTurns: normalizeTurns(group.rotationQuarterTurns),
      localTransforms: group.localTransforms
        ? Object.fromEntries(
            Object.entries(group.localTransforms).map(([key, transform]) => [
              key,
              { ...transform, position: { ...transform.position } },
            ]),
          )
        : undefined,
    };
  });
  const byId = new Map(groups.map((group) => [group.id, group]));
  for (const group of groups) {
    const visited = new Set([group.id]);
    let parentId = group.parentGroupId;
    while (parentId) {
      if (visited.has(parentId)) {
        delete group.parentGroupId;
        break;
      }
      visited.add(parentId);
      parentId = byId.get(parentId)?.parentGroupId;
    }
  }
  return groups;
}

/** Keeps stable parent pivots and synchronizes direct children into local space. */
export function refreshEmberSceneHierarchyPivots(map: EmberMap): EmberMap {
  if (!map.sceneHierarchy) return map;
  const positions = storedObjectPositions(map);
  const rotations = storedObjectRotations(map);
  const groups = map.sceneHierarchy.groups.map((group) => ({
    ...group,
    objectKeys: [...group.objectKeys],
    pivot: { ...group.pivot },
    rotationQuarterTurns: normalizeTurns(group.rotationQuarterTurns),
  }));
  for (const group of groups) {
    const childWorld = new Map<
      string,
      { position: { x: number; y: number; z: number }; rotation: number }
    >();
    for (const key of group.objectKeys) {
      const position = positions.get(key);
      if (position) childWorld.set(key, { position, rotation: rotations.get(key) ?? 0 });
    }
    for (const child of groups) {
      if (child.parentGroupId === group.id) {
        childWorld.set(`group:${child.id}`, {
          position: child.pivot,
          rotation: normalizeTurns(child.rotationQuarterTurns),
        });
      }
    }
    const localTransforms: Record<string, EmberSceneLocalTransform> = {};
    for (const [key, world] of childWorld) {
      const offset = inverseRotateOffset(
        world.position.x - group.pivot.x,
        world.position.y - group.pivot.y,
        group.rotationQuarterTurns ?? 0,
      );
      localTransforms[key] = {
        position: {
          x: offset.x,
          y: offset.y,
          z: world.position.z - group.pivot.z,
        },
        rotationQuarterTurns: normalizeTurns(
          world.rotation - normalizeTurns(group.rotationQuarterTurns),
        ),
      };
    }
    group.localTransforms = localTransforms;
  }
  return { ...map, sceneHierarchy: { version: 1, groups } };
}

/** Cleans stale references, duplicate parents and cycles in a saved hierarchy. */
export function normalizeEmberSceneHierarchy(map: EmberMap): EmberMap {
  if (!map.sceneHierarchy) return map;
  const validObjectKeys = new Set(storedObjectPositions(map).keys());
  const groups = normalizedGroups(map.sceneHierarchy, validObjectKeys);
  return refreshEmberSceneHierarchyPivots({
    ...map,
    sceneHierarchy: { version: 1, groups },
  });
}

export function emberSceneGroupObjectKeys(
  hierarchy: EmberSceneHierarchy | undefined,
  groupId: string,
): string[] {
  if (!hierarchy) return [];
  const byParent = new Map<string, EmberSceneGroup[]>();
  for (const group of hierarchy.groups) {
    if (!group.parentGroupId) continue;
    const children = byParent.get(group.parentGroupId) ?? [];
    children.push(group);
    byParent.set(group.parentGroupId, children);
  }
  const result = new Set<string>();
  const visit = (id: string, visiting: Set<string>) => {
    if (visiting.has(id)) return;
    const group = hierarchy.groups.find((candidate) => candidate.id === id);
    if (!group) return;
    const nextVisiting = new Set(visiting).add(id);
    for (const key of group.objectKeys) result.add(key);
    for (const child of byParent.get(id) ?? []) visit(child.id, nextVisiting);
  };
  visit(groupId, new Set());
  return [...result];
}

export function createEmberSceneGroup(
  map: EmberMap,
  objectKeys: Iterable<string>,
  options: { id?: string; name?: string; parentGroupId?: string } = {},
): { map: EmberMap; group: EmberSceneGroup | null } {
  const positions = storedObjectPositions(map);
  const keys = unique(objectKeys).filter((key) => positions.has(key));
  if (keys.length === 0) return { map, group: null };
  const current = map.sceneHierarchy?.groups ?? [];
  const number = current.length + 1;
  let id = options.id?.trim() || `group_${Date.now().toString(36)}`;
  let suffix = 2;
  while (current.some((group) => group.id === id)) id = `${options.id ?? "group"}_${suffix++}`;
  const points = keys.map((key) => positions.get(key)!);
  const group: EmberSceneGroup = {
    id,
    name: options.name?.trim() || `Группа ${number}`,
    parentGroupId: current.some((candidate) => candidate.id === options.parentGroupId)
      ? options.parentGroupId
      : undefined,
    objectKeys: keys,
    pivot: {
      x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
      y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
      z: points.reduce((sum, point) => sum + point.z, 0) / points.length,
    },
  };
  const groups = current.map((candidate) => ({
    ...candidate,
    objectKeys: candidate.objectKeys.filter((key) => !keys.includes(key)),
    pivot: { ...candidate.pivot },
  }));
  groups.push(group);
  return {
    map: refreshEmberSceneHierarchyPivots({
      ...map,
      sceneHierarchy: { version: 1, groups },
    }),
    group,
  };
}

export function removeEmberSceneGroup(map: EmberMap, id: string): EmberMap {
  const hierarchy = map.sceneHierarchy;
  if (!hierarchy?.groups.some((group) => group.id === id)) return map;
  const removed = hierarchy.groups.find((group) => group.id === id)!;
  const groups = hierarchy.groups
    .filter((group) => group.id !== id)
    .map((group) => ({
      ...group,
      parentGroupId:
        group.parentGroupId === id ? removed.parentGroupId : group.parentGroupId,
      objectKeys: [...group.objectKeys],
      pivot: { ...group.pivot },
    }));
  return refreshEmberSceneHierarchyPivots({
    ...map,
    sceneHierarchy: groups.length ? { version: 1, groups } : undefined,
  });
}

function emberSceneGroupBranchIds(
  hierarchy: EmberSceneHierarchy,
  id: string,
): Set<string> {
  const result = new Set<string>();
  const visit = (groupId: string) => {
    if (result.has(groupId)) return;
    result.add(groupId);
    for (const group of hierarchy.groups) {
      if (group.parentGroupId === groupId) visit(group.id);
    }
  };
  visit(id);
  return result;
}

/** Moves the stable world pivots for one hierarchy branch after its objects move. */
export function translateEmberSceneGroupTransforms(
  map: EmberMap,
  id: string,
  dx: number,
  dy: number,
): EmberMap {
  const hierarchy = map.sceneHierarchy;
  if (!hierarchy) return map;
  const branchIds = emberSceneGroupBranchIds(hierarchy, id);
  if (!branchIds.has(id)) return map;
  return refreshEmberSceneHierarchyPivots({
    ...map,
    sceneHierarchy: {
      version: 1,
      groups: hierarchy.groups.map((group) =>
        branchIds.has(group.id)
          ? {
              ...group,
              pivot: {
                x: group.pivot.x + dx,
                y: group.pivot.y + dy,
                z: group.pivot.z,
              },
            }
          : group,
      ),
    },
  });
}

/** Rotates group transforms after descendant objects rotate around the root pivot. */
export function rotateEmberSceneGroupTransforms(
  map: EmberMap,
  id: string,
  quarterTurns: number,
): EmberMap {
  const hierarchy = map.sceneHierarchy;
  const root = hierarchy?.groups.find((group) => group.id === id);
  if (!hierarchy || !root) return map;
  const turns = normalizeTurns(quarterTurns);
  if (!turns) return map;
  const branchIds = emberSceneGroupBranchIds(hierarchy, id);
  const rotatePoint = (point: EmberSceneGroup["pivot"]) => {
    let x = point.x - root.pivot.x;
    let y = point.y - root.pivot.y;
    for (let index = 0; index < turns; index += 1) [x, y] = [-y, x];
    return { x: root.pivot.x + x, y: root.pivot.y + y, z: point.z };
  };
  return refreshEmberSceneHierarchyPivots({
    ...map,
    sceneHierarchy: {
      version: 1,
      groups: hierarchy.groups.map((group) =>
        branchIds.has(group.id)
          ? {
              ...group,
              pivot: rotatePoint(group.pivot),
              rotationQuarterTurns: normalizeTurns(
                normalizeTurns(group.rotationQuarterTurns) + turns,
              ),
            }
          : group,
      ),
    },
  });
}

/** Scales nested group pivots after their descendant world objects scale. */
export function scaleEmberSceneGroupTransforms(
  map: EmberMap,
  id: string,
  scale: Readonly<{ x: number; y: number; z: number }>,
): EmberMap {
  const hierarchy = map.sceneHierarchy;
  const root = hierarchy?.groups.find((group) => group.id === id);
  if (!hierarchy || !root) return map;
  const delta = resolveEmberTransformScale(scale);
  const branchIds = emberSceneGroupBranchIds(hierarchy, id);
  return refreshEmberSceneHierarchyPivots({
    ...map,
    sceneHierarchy: {
      version: 1,
      groups: hierarchy.groups.map((group) =>
        branchIds.has(group.id) && group.id !== id
          ? {
              ...group,
              pivot: {
                x: root.pivot.x + (group.pivot.x - root.pivot.x) * delta.x,
                y: root.pivot.y + (group.pivot.y - root.pivot.y) * delta.y,
                z: root.pivot.z + (group.pivot.z - root.pivot.z) * delta.z,
              },
            }
          : group,
      ),
    },
  });
}

export function renameEmberSceneGroup(
  map: EmberMap,
  id: string,
  name: string,
): EmberMap {
  const nextName = name.trim();
  if (!nextName || !map.sceneHierarchy) return map;
  const current = map.sceneHierarchy.groups.find((group) => group.id === id);
  if (!current || current.name === nextName) return map;
  return {
    ...map,
    sceneHierarchy: {
      version: 1,
      groups: map.sceneHierarchy.groups.map((group) =>
        group.id === id ? { ...group, name: nextName } : group,
      ),
    },
  };
}

/** Reparents stored objects to one group, or to the scene root when omitted. */
export function assignEmberSceneObjectsToGroup(
  map: EmberMap,
  objectKeys: Iterable<string>,
  groupId?: string,
): EmberMap {
  const hierarchy = map.sceneHierarchy;
  if (!hierarchy) return map;
  if (groupId && !hierarchy.groups.some((group) => group.id === groupId)) return map;
  const valid = storedObjectPositions(map);
  const keys = new Set(unique(objectKeys).filter((key) => valid.has(key)));
  if (keys.size === 0) return map;
  const groups = hierarchy.groups.map((group) => ({
    ...group,
    objectKeys: group.objectKeys.filter((key) => !keys.has(key)),
    pivot: { ...group.pivot },
  }));
  if (groupId) {
    const target = groups.find((group) => group.id === groupId)!;
    target.objectKeys = unique([...target.objectKeys, ...keys]);
  }
  return refreshEmberSceneHierarchyPivots({
    ...map,
    sceneHierarchy: { version: 1, groups },
  });
}

/** Duplicates one complete hierarchy branch and all stored scene objects below it. */
export function duplicateEmberSceneGroup(
  map: EmberMap,
  id: string,
  options: { offsetX?: number; offsetY?: number; suffix?: string } = {},
): { map: EmberMap; groupId: string | null } {
  const hierarchy = map.sceneHierarchy;
  const source = hierarchy?.groups.find((group) => group.id === id);
  if (!hierarchy || !source) return { map, groupId: null };
  const branchIds = new Set<string>();
  const collectGroups = (groupId: string) => {
    if (branchIds.has(groupId)) return;
    branchIds.add(groupId);
    for (const group of hierarchy.groups) {
      if (group.parentGroupId === groupId) collectGroups(group.id);
    }
  };
  collectGroups(id);
  const branch = hierarchy.groups.filter((group) => branchIds.has(group.id));
  const suffix = options.suffix?.trim() || `_copy_${Date.now().toString(36)}`;
  const dx = Math.round(options.offsetX ?? 1);
  const dy = Math.round(options.offsetY ?? 1);
  const uniqueId = (seed: string, existing: Set<string>) => {
    let candidate = `${seed}${suffix}`;
    let number = 2;
    while (existing.has(candidate)) candidate = `${seed}${suffix}_${number++}`;
    existing.add(candidate);
    return candidate;
  };
  const objectKeyMap = new Map<string, string>();
  const branchObjectKeys = new Set(branch.flatMap((group) => group.objectKeys));
  const voxelIds = new Set((map.voxelProps ?? []).map((item) => item.id));
  const spriteIds = new Set((map.sprites ?? []).map((item) => item.id));
  const lightIds = new Set((map.lights ?? []).map((item) => item.id));
  const regionIds = new Set(map.regions.map((item) => item.id));
  const clampX = (value: number, width = 1) =>
    Math.max(0, Math.min(map.width - width, value + dx));
  const clampY = (value: number, height = 1) =>
    Math.max(0, Math.min(map.height - height, value + dy));
  const voxelProps = [...(map.voxelProps ?? [])];
  for (const item of map.voxelProps ?? []) {
    const key = `voxel:${item.id}`;
    if (!branchObjectKeys.has(key)) continue;
    const nextId = uniqueId(item.id, voxelIds);
    objectKeyMap.set(key, `voxel:${nextId}`);
    voxelProps.push({
      ...item,
      id: nextId,
      x: clampX(item.x),
      y: clampY(item.y),
      collider: item.collider ? { ...item.collider } : undefined,
    });
  }
  const sprites = [...(map.sprites ?? [])];
  for (const item of map.sprites ?? []) {
    const key = `sprite:${item.id}`;
    if (!branchObjectKeys.has(key)) continue;
    const nextId = uniqueId(item.id, spriteIds);
    objectKeyMap.set(key, `sprite:${nextId}`);
    sprites.push({ ...item, id: nextId, x: clampX(item.x), y: clampY(item.y) });
  }
  const lights = [...(map.lights ?? [])];
  for (const item of map.lights ?? []) {
    const key = `light:${item.id}`;
    if (!branchObjectKeys.has(key)) continue;
    const nextId = uniqueId(item.id, lightIds);
    objectKeyMap.set(key, `light:${nextId}`);
    lights.push({ ...item, id: nextId, x: clampX(item.x), y: clampY(item.y) });
  }
  const regionIdMap = new Map<string, string>();
  const regions = [...map.regions];
  for (const item of map.regions) {
    const key = `region:${item.id}`;
    if (!branchObjectKeys.has(key)) continue;
    const nextId = uniqueId(item.id, regionIds);
    regionIdMap.set(item.id, nextId);
    objectKeyMap.set(key, `region:${nextId}`);
    regions.push({
      ...item,
      id: nextId,
      x: clampX(item.x, item.w),
      y: clampY(item.y, item.h),
    });
  }
  for (const region of regions.slice(map.regions.length)) {
    if (region.targetRegionId && regionIdMap.has(region.targetRegionId)) {
      region.targetRegionId = regionIdMap.get(region.targetRegionId);
    }
  }
  const groupIds = new Set(hierarchy.groups.map((group) => group.id));
  const groupIdMap = new Map<string, string>();
  for (const group of branch) groupIdMap.set(group.id, uniqueId(group.id, groupIds));
  const clonedGroups = branch.map((group) => ({
    ...group,
    id: groupIdMap.get(group.id)!,
    name: group.id === id ? `${group.name} копия` : group.name,
    parentGroupId: group.parentGroupId && branchIds.has(group.parentGroupId)
      ? groupIdMap.get(group.parentGroupId)
      : group.parentGroupId,
    objectKeys: group.objectKeys.flatMap((key) => {
      const mapped = objectKeyMap.get(key);
      return mapped ? [mapped] : [];
    }),
    pivot: {
      x: group.pivot.x + dx,
      y: group.pivot.y + dy,
      z: group.pivot.z,
    },
  }));
  const next = refreshEmberSceneHierarchyPivots({
    ...map,
    voxelProps,
    sprites,
    lights,
    regions,
    sceneHierarchy: {
      version: 1,
      groups: [
        ...hierarchy.groups.map((group) => ({
          ...group,
          objectKeys: [...group.objectKeys],
          pivot: { ...group.pivot },
        })),
        ...clonedGroups,
      ],
    },
  });
  return { map: next, groupId: groupIdMap.get(id) ?? null };
}

export function setEmberSceneGroupParent(
  map: EmberMap,
  id: string,
  parentGroupId?: string,
): EmberMap {
  const hierarchy = map.sceneHierarchy;
  if (!hierarchy || id === parentGroupId) return map;
  const group = hierarchy.groups.find((candidate) => candidate.id === id);
  if (!group) return map;
  if (parentGroupId) {
    if (!hierarchy.groups.some((candidate) => candidate.id === parentGroupId)) return map;
    let cursor: string | undefined = parentGroupId;
    while (cursor) {
      if (cursor === id) return map;
      cursor = hierarchy.groups.find((candidate) => candidate.id === cursor)?.parentGroupId;
    }
  }
  return refreshEmberSceneHierarchyPivots({
    ...map,
    sceneHierarchy: {
      version: 1,
      groups: hierarchy.groups.map((candidate) =>
        candidate.id === id ? { ...candidate, parentGroupId } : candidate,
      ),
    },
  });
}
