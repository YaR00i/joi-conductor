import * as THREE from "three";

type ShadowEntry = {
  light: THREE.PointLight;
  staticMap: THREE.WebGLRenderTarget | null;
  dirty: boolean;
};

export type LocalPointShadowMapBankStats = {
  cached: number;
  dirty: number;
  active: number;
  dynamic: number;
  pooledDynamic: number;
};

/**
 * Owns immutable layer-0 point-shadow maps and a reusable set of actor-aware
 * render targets. Static targets are detached while a light is dynamic, then
 * restored without another six-face render when the light leaves the pool.
 */
export class LocalPointShadowMapBank {
  private readonly entries = new Map<THREE.PointLight, ShadowEntry>();
  private readonly dynamicLights = new Set<THREE.PointLight>();
  private readonly dynamicPool: THREE.WebGLRenderTarget[] = [];
  private activeLights = new Set<THREE.PointLight>();
  private dynamicLimit: number;

  constructor(dynamicLimit = 0) {
    this.dynamicLimit = Math.max(0, Math.floor(dynamicLimit));
  }

  replaceLights(lights: readonly THREE.PointLight[]): void {
    this.releaseAllDynamic();
    for (const entry of this.entries.values()) {
      if (entry.light.shadow.map === entry.staticMap) {
        entry.light.shadow.map = null;
      }
      entry.staticMap?.dispose();
    }
    this.entries.clear();
    this.activeLights.clear();
    for (const light of lights) {
      this.entries.set(light, { light, staticMap: null, dirty: true });
      light.userData.emberStaticShadowCached = false;
      light.userData.emberStaticShadowDirty = true;
      light.castShadow = false;
      light.shadow.autoUpdate = false;
      light.shadow.needsUpdate = false;
      light.shadow.map = null;
    }
  }

  setDynamicLimit(limit: number): void {
    this.dynamicLimit = Math.max(0, Math.floor(limit));
  }

  markAllDirty(): void {
    for (const entry of this.entries.values()) {
      entry.dirty = true;
      entry.light.userData.emberStaticShadowDirty = true;
    }
  }

  dirtyLights(): THREE.PointLight[] {
    return [...this.entries.values()]
      .filter((entry) => entry.dirty)
      .map((entry) => entry.light);
  }

  prepareStaticBatch(batch: readonly THREE.PointLight[]): void {
    this.releaseAllDynamic();
    const batchSet = new Set(batch);
    for (const entry of this.entries.values()) {
      const inBatch = batchSet.has(entry.light);
      // Keep already-cached lights sampled so NUM_POINT_LIGHT_SHADOWS stays
      // stable. Toggling castShadow recompiles every toon material.
      const keepActive = inBatch || entry.staticMap != null;
      entry.light.castShadow = keepActive;
      entry.light.shadow.autoUpdate = false;
      entry.light.shadow.needsUpdate = inBatch;
      if (keepActive) entry.light.shadow.map = entry.staticMap;
    }
  }

  captureStaticBatch(batch: readonly THREE.PointLight[]): void {
    for (const light of batch) {
      const entry = this.entries.get(light);
      if (!entry) continue;
      entry.staticMap = light.shadow.map;
      entry.dirty = false;
      light.userData.emberStaticShadowCached = entry.staticMap != null;
      light.userData.emberStaticShadowDirty = false;
      light.shadow.autoUpdate = false;
      light.shadow.needsUpdate = false;
    }
  }

  applyAssignments(
    activeLights: readonly THREE.PointLight[],
    requestedDynamicLights: readonly THREE.PointLight[],
  ): { enteredDynamic: THREE.PointLight[]; leftDynamic: THREE.PointLight[] } {
    // Every registered light stays sampled. Capping the active set toggles
    // castShadow and recompiles NUM_POINT_LIGHT_SHADOWS on every toon material.
    const nextActive = new Set(
      activeLights.filter((light) => this.entries.has(light)),
    );
    for (const light of this.entries.keys()) nextActive.add(light);
    const nextDynamic = new Set(
      requestedDynamicLights
        .filter((light) => nextActive.has(light))
        .slice(0, this.dynamicLimit),
    );
    const leftDynamic = [...this.dynamicLights].filter(
      (light) => !nextDynamic.has(light),
    );
    for (const light of leftDynamic) this.releaseDynamic(light);

    this.activeLights = nextActive;
    for (const entry of this.entries.values()) {
      const enabled = nextActive.has(entry.light);
      entry.light.castShadow = enabled;
      entry.light.shadow.autoUpdate = false;
      if (!nextDynamic.has(entry.light)) {
        entry.light.shadow.map = entry.staticMap;
        entry.light.shadow.needsUpdate = false;
      }
    }

    const enteredDynamic = [...nextDynamic].filter(
      (light) => !this.dynamicLights.has(light),
    );
    for (const light of enteredDynamic) {
      const entry = this.entries.get(light);
      if (!entry) continue;
      entry.light.shadow.map = this.dynamicPool.pop() ?? null;
      entry.light.shadow.autoUpdate = false;
      entry.light.shadow.needsUpdate = true;
    }
    this.dynamicLights.clear();
    for (const light of nextDynamic) this.dynamicLights.add(light);
    return { enteredDynamic, leftDynamic };
  }

  isCached(light: THREE.PointLight): boolean {
    return this.entries.get(light)?.staticMap != null;
  }

  isDynamic(light: THREE.PointLight): boolean {
    return this.dynamicLights.has(light);
  }

  stats(): LocalPointShadowMapBankStats {
    let cached = 0;
    let dirty = 0;
    for (const entry of this.entries.values()) {
      if (entry.staticMap) cached += 1;
      if (entry.dirty) dirty += 1;
    }
    return {
      cached,
      dirty,
      active: this.activeLights.size,
      dynamic: this.dynamicLights.size,
      pooledDynamic: this.dynamicPool.length,
    };
  }

  resetGpuResources(): void {
    this.releaseAllDynamic();
    for (const entry of this.entries.values()) {
      if (entry.light.shadow.map === entry.staticMap) {
        entry.light.shadow.map = null;
      }
      entry.staticMap?.dispose();
      entry.staticMap = null;
      entry.dirty = true;
      entry.light.castShadow = false;
      entry.light.shadow.map = null;
      entry.light.shadow.needsUpdate = false;
      entry.light.userData.emberStaticShadowCached = false;
      entry.light.userData.emberStaticShadowDirty = true;
    }
    this.activeLights.clear();
    for (const target of this.dynamicPool) target.dispose();
    this.dynamicPool.length = 0;
  }

  dispose(): void {
    this.releaseAllDynamic();
    for (const entry of this.entries.values()) {
      if (entry.light.shadow.map === entry.staticMap) {
        entry.light.shadow.map = null;
      }
      entry.light.userData.emberStaticShadowCached = false;
      entry.staticMap?.dispose();
    }
    this.entries.clear();
    this.activeLights.clear();
    for (const target of this.dynamicPool) target.dispose();
    this.dynamicPool.length = 0;
  }

  private releaseDynamic(light: THREE.PointLight): void {
    const entry = this.entries.get(light);
    if (!entry) {
      this.dynamicLights.delete(light);
      return;
    }
    const dynamicMap = light.shadow.map;
    if (dynamicMap && dynamicMap !== entry.staticMap) {
      this.dynamicPool.push(dynamicMap);
    }
    light.shadow.map = entry.staticMap;
    light.shadow.needsUpdate = false;
    this.dynamicLights.delete(light);
  }

  private releaseAllDynamic(): void {
    for (const light of [...this.dynamicLights]) this.releaseDynamic(light);
  }
}
