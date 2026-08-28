/**
 * GPU resources for the point-shadow atlas (wave B).
 *
 * Owns 4×2 cache tiles and the shader atlas. Play/editor bake faces with
 * `pointShadowAtlasPass` (not WebGLShadowMap) and sample the atlas from
 * `voxelLightSnap`. Adopt remains for GPU unit tests.
 *
 * See docs/EMBER_AI_HANDOFF.md §9.1.
 */
import * as THREE from "three";
import {
  planPointShadowAtlasBlits,
  type PointShadowAtlasLayout,
} from "./pointShadowAtlas";

export type PointShadowAtlasCopier = (
  source: THREE.Texture,
  dest: THREE.Texture,
  destX: number,
  destY: number,
) => void;

type CacheTile = {
  target: THREE.WebGLRenderTarget;
  owned: boolean;
};

function createPackedTarget(
  width: number,
  height: number,
  name: string,
): THREE.WebGLRenderTarget {
  const target = new THREE.WebGLRenderTarget(width, height, {
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    generateMipmaps: false,
    depthBuffer: true,
    stencilBuffer: false,
  });
  target.texture.name = name;
  target.texture.generateMipmaps = false;
  return target;
}

export function pointShadowLightCacheId(
  light: THREE.PointLight,
  fallbackIndex = 0,
): string {
  const lamp = light.userData.emberLamp as { sourceId?: string } | undefined;
  return (
    lamp?.sourceId ??
    (light.userData.emberEmissiveSourceId as string | undefined) ??
    `local-${fallbackIndex + 1}`
  );
}

/** Actor-aware recook; the static tile for the same lamp stays untouched. */
export function pointShadowDynamicCacheId(baseId: string): string {
  return `${baseId}#dyn`;
}

/**
 * Copy a 4×2 cube tile into the atlas. r170+ takes (src, dst, region, pos);
 * older Three took (pos, src, dst).
 */
export function copyPointShadowTileTexture(
  renderer: THREE.WebGLRenderer,
  source: THREE.Texture,
  dest: THREE.Texture,
  destX: number,
  destY: number,
): void {
  const pos = new THREE.Vector2(destX, destY);
  const copy = renderer.copyTextureToTexture as (
    a: THREE.Texture | THREE.Vector2,
    b: THREE.Texture,
    c?: THREE.Texture | THREE.Box2 | null,
    d?: THREE.Vector2 | null,
  ) => void;
  copy(source, dest, null, pos);
}

export class PointShadowAtlasGpu {
  readonly layout: PointShadowAtlasLayout;
  private atlas: THREE.WebGLRenderTarget | null = null;
  private atlasCleared = false;
  private readonly cache = new Map<string, CacheTile>();
  private slotIds: (string | null)[] = [];

  constructor(layout: PointShadowAtlasLayout) {
    this.layout = layout;
    this.slotIds = Array.from({ length: layout.slotCount }, () => null);
  }

  atlasTarget(): THREE.WebGLRenderTarget | null {
    return this.atlas;
  }

  ensureAtlas(): THREE.WebGLRenderTarget {
    if (!this.atlas) {
      this.atlas = createPackedTarget(
        this.layout.width,
        this.layout.height,
        "emberPointShadowAtlas",
      );
      this.atlasCleared = false;
    }
    return this.atlas;
  }

  /** Unfilled atlas texels must be far-depth (white), not occluders. */
  clearAtlas(renderer: THREE.WebGLRenderer): void {
    if (this.atlasCleared) return;
    const atlas = this.ensureAtlas();
    const prevTarget = renderer.getRenderTarget();
    const prevAlpha = renderer.getClearAlpha();
    const prevColor = new THREE.Color();
    renderer.getClearColor(prevColor);
    renderer.setRenderTarget(atlas);
    renderer.setClearColor(0xffffff, 1);
    renderer.clear();
    renderer.setRenderTarget(prevTarget);
    renderer.setClearColor(prevColor, prevAlpha);
    this.atlasCleared = true;
  }

  cacheSize(): number {
    return this.cache.size;
  }

  hasCacheTile(id: string): boolean {
    return this.cache.has(id);
  }

  cacheTile(id: string): THREE.WebGLRenderTarget | null {
    return this.cache.get(id)?.target ?? null;
  }

  /** Allocate an owned 4×2 tile for a future self-bake. */
  ensureCacheTile(id: string): THREE.WebGLRenderTarget {
    const existing = this.cache.get(id);
    if (existing) return existing.target;
    const target = createPackedTarget(
      this.layout.tileWidth,
      this.layout.tileHeight,
      `emberPointShadowCache:${id}`,
    );
    this.cache.set(id, { target, owned: true });
    return target;
  }

  /**
   * Keep an existing 4×2 render target as the cache tile without copying
   * pixels. Atlas does not dispose adopted targets (the caller owns them).
   */
  adoptCacheTile(id: string, target: THREE.WebGLRenderTarget): void {
    const previous = this.cache.get(id);
    if (previous?.target === target) {
      previous.owned = false;
      return;
    }
    if (previous?.owned) previous.target.dispose();
    this.cache.set(id, { target, owned: false });
  }

  dropCacheTile(id: string): void {
    const previous = this.cache.get(id);
    if (!previous) return;
    if (previous.owned) previous.target.dispose();
    this.cache.delete(id);
    this.slotIds = this.slotIds.map((slot) => (slot === id ? null : slot));
  }

  clearCache(): void {
    for (const id of [...this.cache.keys()]) this.dropCacheTile(id);
  }

  slotIdsSnapshot(): (string | null)[] {
    return [...this.slotIds];
  }

  /**
   * Blit assigned cache tiles into the shader atlas. Missing tiles are skipped.
   * Does not change PointLight.castShadow.
   */
  blitSlots(
    slotIds: readonly (string | null)[],
    copy: PointShadowAtlasCopier,
  ): number {
    this.slotIds = Array.from({ length: this.layout.slotCount }, (_, i) =>
      i < slotIds.length ? slotIds[i] ?? null : null,
    );
    const atlas = this.ensureAtlas();
    let copied = 0;
    for (const job of planPointShadowAtlasBlits(this.layout, this.slotIds)) {
      const tile = this.cache.get(job.cacheId);
      if (!tile) continue;
      copy(tile.target.texture, atlas.texture, job.dest.x, job.dest.y);
      copied += 1;
    }
    return copied;
  }

  blitSlotsWithRenderer(
    renderer: THREE.WebGLRenderer,
    slotIds: readonly (string | null)[],
  ): number {
    this.clearAtlas(renderer);
    return this.blitSlots(slotIds, (source, dest, destX, destY) => {
      copyPointShadowTileTexture(renderer, source, dest, destX, destY);
    });
  }

  dispose(): void {
    this.atlas?.dispose();
    this.atlas = null;
    this.atlasCleared = false;
    for (const tile of this.cache.values()) {
      if (tile.owned) tile.target.dispose();
    }
    this.cache.clear();
    this.slotIds = Array.from({ length: this.layout.slotCount }, () => null);
  }
}
