import * as THREE from "three";
import type { PointShadowAtlasLayout } from "./pointShadowAtlas";
import {
  PointShadowAtlasGpu,
  pointShadowLightCacheId,
} from "./pointShadowAtlasGpu";

type ShadowEntry = {
  light: THREE.PointLight;
  dirty: boolean;
};

export type LocalPointShadowMapBankStats = {
  cached: number;
  dirty: number;
  active: number;
  dynamic: number;
  atlasTiles: number;
};

/**
 * Owns atlas cache tiles for granted PointLights. PointLight.castShadow stays
 * false so MeshToon keeps NUM_POINT_LIGHT_SHADOWS = 0. Actor-aware recooks
 * write a `#dyn` tile; leaving the pool does not relink a Three cube map.
 */
export class LocalPointShadowMapBank {
  private readonly entries = new Map<THREE.PointLight, ShadowEntry>();
  private readonly dynamicLights = new Set<THREE.PointLight>();
  private activeLights = new Set<THREE.PointLight>();
  private dynamicLimit: number;
  private atlasGpu: PointShadowAtlasGpu | null = null;

  constructor(dynamicLimit = 0) {
    this.dynamicLimit = Math.max(0, Math.floor(dynamicLimit));
  }

  replaceLights(lights: readonly THREE.PointLight[]): void {
    this.dynamicLights.clear();
    this.entries.clear();
    this.activeLights.clear();
    this.atlasGpu?.clearCache();
    for (const light of lights) {
      this.entries.set(light, { light, dirty: true });
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

  /**
   * Allocate the 4×2 cache/atlas. PointLight.castShadow stays false so
   * MeshToon keeps NUM_POINT_LIGHT_SHADOWS = 0.
   */
  enableAtlas(layout: PointShadowAtlasLayout): PointShadowAtlasGpu {
    this.atlasGpu?.dispose();
    this.atlasGpu = new PointShadowAtlasGpu(layout);
    return this.atlasGpu;
  }

  atlas(): PointShadowAtlasGpu | null {
    return this.atlasGpu;
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

  registeredLights(): THREE.PointLight[] {
    return [...this.entries.keys()];
  }

  cacheIdFor(light: THREE.PointLight): string {
    return pointShadowLightCacheId(
      light,
      [...this.entries.keys()].indexOf(light),
    );
  }

  prepareStaticBatch(_batch: readonly THREE.PointLight[]): void {
    this.dynamicLights.clear();
    for (const entry of this.entries.values()) {
      entry.light.castShadow = false;
      entry.light.shadow.autoUpdate = false;
      entry.light.shadow.needsUpdate = false;
    }
  }

  captureStaticBatch(batch: readonly THREE.PointLight[]): void {
    for (const light of batch) {
      const entry = this.entries.get(light);
      if (!entry) continue;
      const cached = this.atlasGpu?.hasCacheTile(this.cacheIdFor(light)) === true;
      entry.dirty = !cached;
      light.userData.emberStaticShadowCached = cached;
      light.userData.emberStaticShadowDirty = !cached;
      light.castShadow = false;
      light.shadow.autoUpdate = false;
      light.shadow.needsUpdate = false;
    }
  }

  applyAssignments(
    activeLights: readonly THREE.PointLight[],
    requestedDynamicLights: readonly THREE.PointLight[],
  ): { enteredDynamic: THREE.PointLight[]; leftDynamic: THREE.PointLight[] } {
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
    for (const light of leftDynamic) this.dynamicLights.delete(light);

    this.activeLights = nextActive;
    for (const entry of this.entries.values()) {
      entry.light.castShadow = false;
      entry.light.shadow.autoUpdate = false;
      entry.light.shadow.needsUpdate = false;
    }
    const enteredDynamic = [...nextDynamic].filter(
      (light) => !this.dynamicLights.has(light),
    );
    this.dynamicLights.clear();
    for (const light of nextDynamic) this.dynamicLights.add(light);
    return { enteredDynamic, leftDynamic };
  }

  isCached(light: THREE.PointLight): boolean {
    return this.atlasGpu?.hasCacheTile(this.cacheIdFor(light)) === true;
  }

  isDynamic(light: THREE.PointLight): boolean {
    return this.dynamicLights.has(light);
  }

  stats(): LocalPointShadowMapBankStats {
    let cached = 0;
    let dirty = 0;
    for (const entry of this.entries.values()) {
      if (entry.dirty) dirty += 1;
      if (this.atlasGpu?.hasCacheTile(this.cacheIdFor(entry.light))) {
        cached += 1;
      }
    }
    return {
      cached,
      dirty,
      active: this.activeLights.size,
      dynamic: this.dynamicLights.size,
      atlasTiles: this.atlasGpu?.cacheSize() ?? 0,
    };
  }

  resetGpuResources(): void {
    this.dynamicLights.clear();
    for (const entry of this.entries.values()) {
      entry.dirty = true;
      entry.light.castShadow = false;
      entry.light.shadow.map = null;
      entry.light.shadow.needsUpdate = false;
      entry.light.userData.emberStaticShadowCached = false;
      entry.light.userData.emberStaticShadowDirty = true;
    }
    this.activeLights.clear();
    if (this.atlasGpu) {
      const layout = this.atlasGpu.layout;
      this.atlasGpu.dispose();
      this.atlasGpu = new PointShadowAtlasGpu(layout);
    }
  }

  dispose(): void {
    this.dynamicLights.clear();
    for (const entry of this.entries.values()) {
      entry.light.userData.emberStaticShadowCached = false;
    }
    this.entries.clear();
    this.activeLights.clear();
    this.atlasGpu?.dispose();
    this.atlasGpu = null;
  }
}
