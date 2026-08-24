import type { EnemyCrowdOpenField } from "./enemyCrowdOpenField";

const FLOW_UNREACHABLE = -1;
const ELEV_EPSILON = 0.08;

export const ENEMY_FLOW_UNAVAILABLE = 0;
export const ENEMY_FLOW_GUIDED = 1;
export const ENEMY_FLOW_TARGET_CELL = 2;

export type EnemyCrowdFlowField = {
  source: EnemyCrowdOpenField;
  distance: Int32Array;
  directionX: Int8Array;
  directionY: Int8Array;
  /** Near-optimal downhill directions; stable enemy groups choose a lane. */
  directionMask: Uint8Array;
  queue: Int32Array;
  component: Int32Array;
  componentSeeds: Int32Array;
  componentBestDistanceSq: Float64Array;
  connectorGroup: Int16Array;
  connectorGroupCount: number;
  routeLayers: EnemyCrowdRouteLayer[];
  requestedTargetX: number;
  requestedTargetY: number;
  requestedTargetElevKey: number;
  targetIndex: number;
  targetElev: number;
  targetCount: number;
  componentCount: number;
  targetFallbackDistanceCells: number;
  reachableCells: number;
  rebuilds: number;
};

type EnemyCrowdRouteLayer = {
  connectorGroup: number;
  distance: Int32Array;
  directionX: Int8Array;
  directionY: Int8Array;
  directionMask: Uint8Array;
  queue: Int32Array;
  reachableCells: number;
};

export type EnemyCrowdFlowDirection = {
  x: number;
  y: number;
  heightTransition?: boolean;
  routeGroup?: number;
};

const ROUTE_DX = [1, -1, 0, 0, 1, -1, 1, -1] as const;
const ROUTE_DY = [0, 0, 1, -1, 1, 1, -1, -1] as const;
const ROUTE_DISTANCE_SLACK = 1;
/** Only break near-ties; a route four cells shorter always wins. */
const ROUTE_GROUP_JITTER = 4;

function routeGroupJitter(routeKey: number, connectorGroup: number): number {
  let value =
    (Math.trunc(routeKey) * 0x45d9f3b) ^
    ((connectorGroup + 1) * 0x27d4eb2d);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  value ^= value >>> 16;
  return (value >>> 0) % ROUTE_GROUP_JITTER;
}

function sameElevation(a: number, b: number): boolean {
  return Math.abs(a - b) <= ELEV_EPSILON;
}

function cellIndex(
  source: EnemyCrowdOpenField,
  tx: number,
  ty: number,
): number {
  if (tx < 0 || ty < 0 || tx >= source.width || ty >= source.height) {
    return -1;
  }
  return tx + ty * source.width;
}

function isConnector(source: EnemyCrowdOpenField, index: number): boolean {
  return source.connectorDx[index] !== 0 || source.connectorDy[index] !== 0;
}

function cellSupportsElevation(
  source: EnemyCrowdOpenField,
  index: number,
  elev: number,
): boolean {
  if (index < 0 || source.open[index] === 0) return false;
  if (!isConnector(source, index)) {
    const center = source.surfaceElev[index]!;
    const storedMin = source.surfaceMin[index]!;
    const storedMax = source.surfaceMax[index]!;
    const min = storedMin === 0 && storedMax === 0 && center !== 0 ? center : storedMin;
    const max = storedMin === 0 && storedMax === 0 && center !== 0 ? center : storedMax;
    return (
      elev >= min - 0.08 &&
      elev <= max + 0.08
    );
  }
  return (
    elev >= source.connectorLow[index]! - ELEV_EPSILON &&
    elev <= source.connectorHigh[index]! + ELEV_EPSILON
  );
}

/** Elevation of this cell at the shared boundary in offset direction. */
function boundaryElevation(
  source: EnemyCrowdOpenField,
  index: number,
  dx: number,
  dy: number,
): number {
  if (!isConnector(source, index)) return source.surfaceElev[index]!;
  const connectorDx = source.connectorDx[index]!;
  const connectorDy = source.connectorDy[index]!;
  if (dx === connectorDx && dy === connectorDy) {
    return source.connectorHigh[index]!;
  }
  if (dx === -connectorDx && dy === -connectorDy) {
    return source.connectorLow[index]!;
  }
  return Number.NaN;
}

/** Height-aware cardinal graph edge, including stair/ramp endpoints. */
function cellsConnected(
  source: EnemyCrowdOpenField,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  allowedConnectorGroup = -1,
  connectorGroup?: Int16Array,
): boolean {
  const dx = toX - fromX;
  const dy = toY - fromY;
  if (Math.abs(dx) + Math.abs(dy) !== 1) return false;
  const fromIndex = cellIndex(source, fromX, fromY);
  const toIndex = cellIndex(source, toX, toY);
  if (
    fromIndex < 0 ||
    toIndex < 0 ||
    source.open[fromIndex] === 0 ||
    source.open[toIndex] === 0
  ) {
    return false;
  }
  if (
    source.subdivisions > 1 &&
    source.moveMask.length === source.open.length &&
    !isConnector(source, fromIndex) &&
    !isConnector(source, toIndex)
  ) {
    const bit =
      dx === 1 ? 1 << 0 : dx === -1 ? 1 << 1 : dy === 1 ? 1 << 2 : 1 << 3;
    return (source.moveMask[fromIndex]! & bit) !== 0;
  }
  if (allowedConnectorGroup >= 0 && connectorGroup) {
    if (
      (isConnector(source, fromIndex) &&
        connectorGroup[fromIndex] !== allowedConnectorGroup) ||
      (isConnector(source, toIndex) &&
        connectorGroup[toIndex] !== allowedConnectorGroup)
    ) {
      return false;
    }
  }
  const fromElev = boundaryElevation(source, fromIndex, dx, dy);
  const toElev = boundaryElevation(source, toIndex, -dx, -dy);
  return (
    Number.isFinite(fromElev) &&
    Number.isFinite(toElev) &&
    sameElevation(fromElev, toElev)
  );
}

function cellsWeaklyConnected(
  source: EnemyCrowdOpenField,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
): boolean {
  return (
    cellsConnected(source, fromX, fromY, toX, toY) ||
    cellsConnected(source, toX, toY, fromX, fromY)
  );
}

function labelSurfaceComponents(
  source: EnemyCrowdOpenField,
  component: Int32Array,
  queue: Int32Array,
): number {
  component.fill(FLOW_UNREACHABLE);
  let componentCount = 0;
  for (let start = 0; start < component.length; start++) {
    if (source.open[start] === 0 || component[start] !== FLOW_UNREACHABLE) {
      continue;
    }
    let read = 0;
    let write = 0;
    component[start] = componentCount;
    queue[write++] = start;
    while (read < write) {
      const index = queue[read++]!;
      const tx = index % source.width;
      const ty = Math.floor(index / source.width);
      for (let direction = 0; direction < 4; direction++) {
        const nx = tx + ROUTE_DX[direction]!;
        const ny = ty + ROUTE_DY[direction]!;
        const nextIndex = cellIndex(source, nx, ny);
        if (
          nextIndex < 0 ||
          component[nextIndex] !== FLOW_UNREACHABLE ||
          !cellsWeaklyConnected(source, tx, ty, nx, ny)
        ) {
          continue;
        }
        component[nextIndex] = componentCount;
        queue[write++] = nextIndex;
      }
    }
    componentCount += 1;
  }
  return componentCount;
}

function targetDistanceSq(
  source: EnemyCrowdOpenField,
  index: number,
  targetWorldX: number,
  targetWorldY: number,
  targetElev: number,
): number {
  const tx = index % source.width;
  const ty = Math.floor(index / source.width);
  const dx = (tx + 0.5) * source.tileSize - targetWorldX;
  const dy = (ty + 0.5) * source.tileSize - targetWorldY;
  const center = source.surfaceElev[index]!;
  const storedMin = source.surfaceMin[index]!;
  const storedMax = source.surfaceMax[index]!;
  const min = storedMin === 0 && storedMax === 0 && center !== 0 ? center : storedMin;
  const max = storedMin === 0 && storedMax === 0 && center !== 0 ? center : storedMax;
  let elevDistance =
    targetElev < min
      ? min - targetElev
      : targetElev > max
        ? targetElev - max
        : 0;
  if (isConnector(source, index)) {
    if (
      targetElev >= source.connectorLow[index]! &&
      targetElev <= source.connectorHigh[index]!
    ) {
      elevDistance = 0;
    } else {
      elevDistance = Math.min(
        Math.abs(source.connectorLow[index]! - targetElev),
        Math.abs(source.connectorHigh[index]! - targetElev),
      );
    }
  }
  const tileDistanceSq =
    (dx * dx + dy * dy) / (source.tileSize * source.tileSize);
  return tileDistanceSq + elevDistance * elevDistance * 4;
}

function diagonalAllowed(
  source: EnemyCrowdOpenField,
  tx: number,
  ty: number,
  dx: number,
  dy: number,
  allowedConnectorGroup = -1,
  connectorGroup?: Int16Array,
): boolean {
  if (dx === 0 || dy === 0) return true;
  const current = cellIndex(source, tx, ty);
  const target = cellIndex(source, tx + dx, ty + dy);
  if (
    current < 0 ||
    target < 0 ||
    isConnector(source, current) ||
    isConnector(source, target) ||
    source.heightAware[current] !== 0 ||
    source.heightAware[target] !== 0
  ) {
    return false;
  }
  const viaX =
    cellsConnected(
      source,
      tx,
      ty,
      tx + dx,
      ty,
      allowedConnectorGroup,
      connectorGroup,
    ) &&
    cellsConnected(
      source,
      tx + dx,
      ty,
      tx + dx,
      ty + dy,
      allowedConnectorGroup,
      connectorGroup,
    );
  const viaY =
    cellsConnected(
      source,
      tx,
      ty,
      tx,
      ty + dy,
      allowedConnectorGroup,
      connectorGroup,
    ) &&
    cellsConnected(
      source,
      tx,
      ty + dy,
      tx + dx,
      ty + dy,
      allowedConnectorGroup,
      connectorGroup,
    );
  return viaX && viaY;
}

function labelConnectorGroups(
  source: EnemyCrowdOpenField,
  groups: Int16Array,
  queue: Int32Array,
): number {
  groups.fill(-1);
  let groupCount = 0;
  for (let start = 0; start < groups.length; start++) {
    if (!isConnector(source, start) || groups[start] >= 0) continue;
    let read = 0;
    let write = 0;
    groups[start] = groupCount;
    queue[write++] = start;
    while (read < write) {
      const index = queue[read++]!;
      const tx = index % source.width;
      const ty = Math.floor(index / source.width);
      for (let direction = 0; direction < 4; direction++) {
        const nx = tx + ROUTE_DX[direction]!;
        const ny = ty + ROUTE_DY[direction]!;
        const nextIndex = cellIndex(source, nx, ny);
        if (
          nextIndex < 0 ||
          groups[nextIndex] >= 0 ||
          !isConnector(source, nextIndex) ||
          !cellsConnected(source, tx, ty, nx, ny)
        ) {
          continue;
        }
        groups[nextIndex] = groupCount;
        queue[write++] = nextIndex;
      }
    }
    groupCount += 1;
  }
  return groupCount;
}

function buildDirections(
  source: EnemyCrowdOpenField,
  distance: Int32Array,
  directionX: Int8Array,
  directionY: Int8Array,
  directionMask: Uint8Array,
  allowedConnectorGroup = -1,
  connectorGroup?: Int16Array,
): void {
  directionX.fill(0);
  directionY.fill(0);
  directionMask.fill(0);
  for (let index = 0; index < distance.length; index++) {
    const currentDistance = distance[index]!;
    if (currentDistance <= 0) continue;
    const tx = index % source.width;
    const ty = Math.floor(index / source.width);
    let bestDistance = currentDistance;
    let bestDx = 0;
    let bestDy = 0;
    for (let route = 0; route < ROUTE_DX.length; route++) {
      const dx = ROUTE_DX[route]!;
      const dy = ROUTE_DY[route]!;
      const nx = tx + dx;
      const ny = ty + dy;
      const nextIndex = cellIndex(source, nx, ny);
      if (nextIndex < 0) continue;
      const connected =
        dx === 0 || dy === 0
          ? cellsConnected(
              source,
              tx,
              ty,
              nx,
              ny,
              allowedConnectorGroup,
              connectorGroup,
            )
          : diagonalAllowed(
              source,
              tx,
              ty,
              dx,
              dy,
              allowedConnectorGroup,
              connectorGroup,
            );
      if (!connected) continue;
      const nextDistance = distance[nextIndex]!;
      if (nextDistance < 0 || nextDistance >= bestDistance) continue;
      bestDistance = nextDistance;
      bestDx = dx;
      bestDy = dy;
    }
    directionX[index] = bestDx;
    directionY[index] = bestDy;
    if (bestDistance >= currentDistance) continue;
    let mask = 0;
    for (let route = 0; route < ROUTE_DX.length; route++) {
      const dx = ROUTE_DX[route]!;
      const dy = ROUTE_DY[route]!;
      const nx = tx + dx;
      const ny = ty + dy;
      const nextIndex = cellIndex(source, nx, ny);
      if (nextIndex < 0) continue;
      const connected =
        dx === 0 || dy === 0
          ? cellsConnected(
              source,
              tx,
              ty,
              nx,
              ny,
              allowedConnectorGroup,
              connectorGroup,
            )
          : diagonalAllowed(
              source,
              tx,
              ty,
              dx,
              dy,
              allowedConnectorGroup,
              connectorGroup,
            );
      if (!connected) continue;
      const nextDistance = distance[nextIndex]!;
      if (
        nextDistance >= 0 &&
        nextDistance < currentDistance &&
        nextDistance <= bestDistance + ROUTE_DISTANCE_SLACK
      ) {
        mask |= 1 << route;
      }
    }
    directionMask[index] = mask;
  }
}

function createRouteLayer(
  count: number,
  connectorGroup: number,
): EnemyCrowdRouteLayer {
  const distance = new Int32Array(count);
  distance.fill(FLOW_UNREACHABLE);
  return {
    connectorGroup,
    distance,
    directionX: new Int8Array(count),
    directionY: new Int8Array(count),
    directionMask: new Uint8Array(count),
    queue: new Int32Array(count),
    reachableCells: 0,
  };
}

export function createEnemyCrowdFlowField(
  source: EnemyCrowdOpenField,
): EnemyCrowdFlowField {
  const count = source.width * source.height;
  const queue = new Int32Array(count);
  const connectorGroup = new Int16Array(count);
  const connectorGroupCount = labelConnectorGroups(
    source,
    connectorGroup,
    queue,
  );
  const component = new Int32Array(count);
  const componentCount = labelSurfaceComponents(source, component, queue);
  const flow: EnemyCrowdFlowField = {
    source,
    distance: new Int32Array(count),
    directionX: new Int8Array(count),
    directionY: new Int8Array(count),
    directionMask: new Uint8Array(count),
    queue,
    component,
    componentSeeds: new Int32Array(count),
    componentBestDistanceSq: new Float64Array(count),
    connectorGroup,
    connectorGroupCount,
    routeLayers: Array.from({ length: connectorGroupCount }, (_, group) =>
      createRouteLayer(count, group),
    ),
    requestedTargetX: Number.MIN_SAFE_INTEGER,
    requestedTargetY: Number.MIN_SAFE_INTEGER,
    requestedTargetElevKey: Number.MIN_SAFE_INTEGER,
    targetIndex: -1,
    targetElev: 0,
    targetCount: 0,
    componentCount,
    targetFallbackDistanceCells: -1,
    reachableCells: 0,
    rebuilds: 0,
  };
  flow.distance.fill(FLOW_UNREACHABLE);
  return flow;
}

/**
 * One shared integration field over every baked height surface. Cardinal
 * edges cross stories only through authored connector endpoints.
 */
export function updateEnemyCrowdFlowField(
  flow: EnemyCrowdFlowField,
  targetWorldX: number,
  targetWorldY: number,
  targetElev: number,
): boolean {
  const source = flow.source;
  const requestedTargetX = Math.floor(targetWorldX / source.tileSize);
  const requestedTargetY = Math.floor(targetWorldY / source.tileSize);
  const requestedTargetElevKey = Math.round(targetElev);
  if (
    flow.requestedTargetX === requestedTargetX &&
    flow.requestedTargetY === requestedTargetY &&
    flow.requestedTargetElevKey === requestedTargetElevKey
  ) {
    return false;
  }

  flow.requestedTargetX = requestedTargetX;
  flow.requestedTargetY = requestedTargetY;
  flow.requestedTargetElevKey = requestedTargetElevKey;
  flow.targetElev = requestedTargetElevKey;
  flow.targetIndex = -1;
  flow.targetCount = 0;
  flow.targetFallbackDistanceCells = -1;
  flow.reachableCells = 0;
  flow.rebuilds += 1;
  flow.distance.fill(FLOW_UNREACHABLE);
  flow.directionX.fill(0);
  flow.directionY.fill(0);
  flow.directionMask.fill(0);

  const cardinalX = [1, -1, 0, 0] as const;
  const cardinalY = [0, 0, 1, -1] as const;
  let nearestTargetDistanceSq = Infinity;

  // Components depend only on the baked map and were labelled at load.
  flow.componentSeeds.fill(-1, 0, flow.componentCount);
  flow.componentBestDistanceSq.fill(Infinity, 0, flow.componentCount);
  for (let index = 0; index < flow.component.length; index++) {
    const componentId = flow.component[index]!;
    if (componentId < 0) continue;
    const distanceSq = targetDistanceSq(
      source,
      index,
      targetWorldX,
      targetWorldY,
      requestedTargetElevKey,
    );
    if (distanceSq >= flow.componentBestDistanceSq[componentId]!) continue;
    flow.componentBestDistanceSq[componentId] = distanceSq;
    flow.componentSeeds[componentId] = index;
  }
  flow.targetCount = flow.componentCount;
  for (let componentId = 0; componentId < flow.componentCount; componentId++) {
    const componentBestIndex = flow.componentSeeds[componentId]!;
    const componentBestDistanceSq = flow.componentBestDistanceSq[componentId]!;
    if (componentBestIndex < 0) continue;
    if (componentBestDistanceSq < nearestTargetDistanceSq) {
      nearestTargetDistanceSq = componentBestDistanceSq;
      flow.targetIndex = componentBestIndex;
    }
  }

  if (flow.targetCount === 0) return true;
  const requestedTargetIndex = cellIndex(
    source,
    requestedTargetX,
    requestedTargetY,
  );
  flow.targetFallbackDistanceCells =
    requestedTargetIndex >= 0 &&
    cellSupportsElevation(
      source,
      requestedTargetIndex,
      requestedTargetElevKey,
    )
      ? 0
      : Math.sqrt(nearestTargetDistanceSq);

  let queueRead = 0;
  let queueWrite = 0;
  for (let target = 0; target < flow.targetCount; target++) {
    const targetIndex = flow.componentSeeds[target]!;
    flow.distance[targetIndex] = 0;
    flow.queue[queueWrite++] = targetIndex;
  }
  while (queueRead < queueWrite) {
    const index = flow.queue[queueRead++]!;
    const tx = index % source.width;
    const ty = Math.floor(index / source.width);
    const nextDistance = flow.distance[index]! + 1;
    for (let direction = 0; direction < 4; direction++) {
      const nx = tx + cardinalX[direction]!;
      const ny = ty + cardinalY[direction]!;
      // Reverse traversal: neighbour must be able to move toward this cell.
      if (!cellsConnected(source, nx, ny, tx, ty)) continue;
      const nextIndex = nx + ny * source.width;
      if (flow.distance[nextIndex] !== FLOW_UNREACHABLE) continue;
      flow.distance[nextIndex] = nextDistance;
      flow.queue[queueWrite++] = nextIndex;
    }
  }
  flow.reachableCells = queueWrite;
  buildDirections(
    source,
    flow.distance,
    flow.directionX,
    flow.directionY,
    flow.directionMask,
  );

  // Each connector chain gets an independent integration field. In a layer,
  // every other staircase is closed, so its gradient cannot silently merge
  // back into the same globally shortest gateway.
  for (const layer of flow.routeLayers) {
    layer.distance.fill(FLOW_UNREACHABLE);
    layer.directionX.fill(0);
    layer.directionY.fill(0);
    layer.directionMask.fill(0);
    layer.reachableCells = 0;
    if (flow.targetIndex < 0) continue;
    let layerRead = 0;
    let layerWrite = 0;
    layer.distance[flow.targetIndex] = 0;
    layer.queue[layerWrite++] = flow.targetIndex;
    while (layerRead < layerWrite) {
      const index = layer.queue[layerRead++]!;
      const tx = index % source.width;
      const ty = Math.floor(index / source.width);
      const nextDistance = layer.distance[index]! + 1;
      for (let direction = 0; direction < 4; direction++) {
        const nx = tx + cardinalX[direction]!;
        const ny = ty + cardinalY[direction]!;
        if (
          !cellsConnected(
            source,
            tx,
            ty,
            nx,
            ny,
            layer.connectorGroup,
            flow.connectorGroup,
          )
        ) {
          continue;
        }
        const nextIndex = nx + ny * source.width;
        if (layer.distance[nextIndex] !== FLOW_UNREACHABLE) continue;
        layer.distance[nextIndex] = nextDistance;
        layer.queue[layerWrite++] = nextIndex;
      }
    }
    layer.reachableCells = layerWrite;
    buildDirections(
      source,
      layer.distance,
      layer.directionX,
      layer.directionY,
      layer.directionMask,
      layer.connectorGroup,
      flow.connectorGroup,
    );
  }
  return true;
}

/** Allocation-free lookup of the next shared height-aware waypoint. */
export function enemyCrowdFlowDirection(
  flow: EnemyCrowdFlowField,
  worldX: number,
  worldY: number,
  elev: number,
  out: EnemyCrowdFlowDirection,
  routeKey = 0,
): 0 | 1 | 2 {
  const source = flow.source;
  const tx = Math.floor(worldX / source.tileSize);
  const ty = Math.floor(worldY / source.tileSize);
  const index = cellIndex(source, tx, ty);
  if (!cellSupportsElevation(source, index, elev)) {
    return ENEMY_FLOW_UNAVAILABLE;
  }
  if (flow.distance[index] < 0) return ENEMY_FLOW_UNAVAILABLE;
  if (flow.distance[index] === 0) {
    // A connector is one graph cell but spans a full elevation band. Reaching
    // its XY cell is not enough when the player is farther up/down that stair.
    if (isConnector(source, index) && !sameElevation(elev, flow.targetElev)) {
      const sign = flow.targetElev > elev ? 1 : -1;
      out.x = source.connectorDx[index]! * sign;
      out.y = source.connectorDy[index]! * sign;
      out.heightTransition = true;
      out.routeGroup = flow.connectorGroup[index]!;
      return ENEMY_FLOW_GUIDED;
    }
    return ENEMY_FLOW_TARGET_CELL;
  }
  let selectedDirectionX = flow.directionX;
  let selectedDirectionY = flow.directionY;
  let selectedDirectionMask = flow.directionMask;
  let selectedScore = Infinity;
  let selectedConnectorGroup = -1;
  const currentConnectorGroup = flow.connectorGroup[index]!;
  for (const layer of flow.routeLayers) {
    const distance = layer.distance[index]!;
    if (distance < 0) continue;
    if (
      currentConnectorGroup >= 0 &&
      layer.connectorGroup !== currentConnectorGroup
    ) {
      continue;
    }
    const score =
      distance + routeGroupJitter(routeKey, layer.connectorGroup);
    if (score >= selectedScore) continue;
    selectedScore = score;
    selectedDirectionX = layer.directionX;
    selectedDirectionY = layer.directionY;
    selectedDirectionMask = layer.directionMask;
    selectedConnectorGroup = layer.connectorGroup;
  }
  let dx = selectedDirectionX[index]!;
  let dy = selectedDirectionY[index]!;
  const mask =
    source.heightAware[index] !== 0 ? 0 : selectedDirectionMask[index]!;
  if (mask !== 0) {
    let candidateCount = 0;
    for (let route = 0; route < ROUTE_DX.length; route++) {
      if ((mask & (1 << route)) !== 0) candidateCount += 1;
    }
    const lane = Math.abs(Math.trunc(routeKey)) % candidateCount;
    // Lane zero preserves the canonical shortest direction. Other stable
    // groups consume the remaining near-optimal exits from the cell.
    if (lane !== 0) {
      let selected = lane - 1;
      for (let route = 0; route < ROUTE_DX.length; route++) {
        if ((mask & (1 << route)) === 0) continue;
        if (ROUTE_DX[route] === dx && ROUTE_DY[route] === dy) continue;
        if (selected-- !== 0) continue;
        dx = ROUTE_DX[route]!;
        dy = ROUTE_DY[route]!;
        break;
      }
    }
  }
  if (dx === 0 && dy === 0) return ENEMY_FLOW_UNAVAILABLE;
  const nextIndex = cellIndex(source, tx + dx, ty + dy);
  const onHeightSurface =
    source.heightAware[index] !== 0 ||
    (nextIndex >= 0 && source.heightAware[nextIndex] !== 0);
  // On stairs keep the current cross-axis lane. Pulling every actor toward
  // the subcell centre made a crowd zig-zag and fight for one narrow line.
  const waypointX =
    onHeightSurface && dx === 0
      ? worldX
      : (tx + dx + 0.5) * source.tileSize;
  const waypointY =
    onHeightSurface && dy === 0
      ? worldY
      : (ty + dy + 0.5) * source.tileSize;
  const toWaypointX = waypointX - worldX;
  const toWaypointY = waypointY - worldY;
  const length = Math.hypot(toWaypointX, toWaypointY);
  if (length <= 1e-6) return ENEMY_FLOW_UNAVAILABLE;
  out.x = toWaypointX / length;
  out.y = toWaypointY / length;
  out.routeGroup = selectedConnectorGroup;
  out.heightTransition =
    isConnector(source, index) ||
    isConnector(source, nextIndex) ||
    !sameElevation(
      source.surfaceElev[index]!,
      source.surfaceElev[nextIndex]!,
    );
  return ENEMY_FLOW_GUIDED;
}
