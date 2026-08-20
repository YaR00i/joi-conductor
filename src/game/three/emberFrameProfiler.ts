import type * as THREE from "three";

const STORAGE_KEY = "ember-profiler-visible";
const SAMPLE_LIMIT = 120;
const HUD_REFRESH_MS = 250;

type TimerQueryExt = {
  TIME_ELAPSED_EXT: number;
  GPU_DISJOINT_EXT: number;
};

export type EmberProfilerExtras = {
  chunks?: {
    loaded: number;
    desired: number;
    pending: number;
    total: number;
  };
  workers?: { active: number; jobs: number };
  lights?: {
    active: number;
    shadows: number;
    staticPointShadows?: number;
    dynamicPointShadows?: number;
    dynamicIds?: string;
    cachedPointShadows?: number;
    dirtyPointShadows?: number;
    activePointShadowSlots?: number;
    pooledDynamicShadows?: number;
  };
  actors?: {
    enemies: number;
    npcs?: number;
    batches: number;
    bullets: number;
    effects: number;
    logicHz?: number;
    logicSteps?: number;
    spatialBuckets?: number;
    effectBatches?: number;
    effectInstances?: number;
    pooledTransient?: number;
    createdTransient?: number;
    stressTarget?: number;
    physicsMoves?: number;
    contactSkips?: number;
    cadenceFull?: number;
    cadenceHalf?: number;
    cadenceThird?: number;
    cadenceQuarter?: number;
    avoidanceActors?: number;
    avoidanceNeighbors?: number;
  };
  renderables?: {
    terrain: number;
    props: number;
    overlays: number;
    instances: number;
  };
  reflection?: { updated: boolean; ageMs: number };
};

export type EmberFrameProfiler = {
  isVisible: () => boolean;
  beginFrame: () => void;
  beginGpu: () => void;
  endGpu: () => void;
  endFrame: (extras?: EmberProfilerExtras) => void;
  dispose: () => void;
};

function percentile95(samples: readonly number[]): number {
  if (samples.length === 0) return 0;
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))]!;
}

function pushSample(samples: number[], value: number): void {
  samples.push(value);
  if (samples.length > SAMPLE_LIMIT) samples.shift();
}

function fmt(value: number | null, digits = 1): string {
  return value == null || !Number.isFinite(value)
    ? "n/a"
    : value.toFixed(digits);
}

export function createEmberFrameProfiler(
  renderer: THREE.WebGLRenderer,
  label: "GAME" | "EDITOR",
  onVisibilityChange?: (visible: boolean) => void,
): EmberFrameProfiler {
  const previousAutoReset = renderer.info.autoReset;
  renderer.info.autoReset = false;
  const cpuSamples: number[] = [];
  const gpuSamples: number[] = [];
  const intervalSamples: number[] = [];
  let frameStartedAt = performance.now();
  let previousFrameEndedAt = frameStartedAt;
  let lastHudAt = 0;
  let disposed = false;
  let latestGpuMs: number | null = null;
  let activeQuery: WebGLQuery | null = null;
  const pendingQueries: WebGLQuery[] = [];

  const gl = renderer.getContext();
  const gl2 =
    typeof WebGL2RenderingContext !== "undefined" &&
    gl instanceof WebGL2RenderingContext
      ? gl
      : null;
  let timerExt = gl2?.getExtension(
    "EXT_disjoint_timer_query_webgl2",
  ) as TimerQueryExt | null;

  const hud = document.createElement("pre");
  hud.className = "ember-profiler";
  hud.dataset.mode = label.toLowerCase();
  let visible = false;
  try {
    visible = localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    /* storage may be unavailable */
  }
  hud.hidden = !visible;
  document.body.appendChild(hud);

  const clearPendingQueries = () => {
    if (!gl2) return;
    for (const query of pendingQueries) gl2.deleteQuery(query);
    pendingQueries.length = 0;
  };

  const disableGpuTimer = () => {
    const ext = timerExt;
    timerExt = null;
    if (gl2 && activeQuery) {
      try {
        if (ext) gl2.endQuery(ext.TIME_ELAPSED_EXT);
      } catch {
        /* query may already be invalid after a context event */
      }
      gl2.deleteQuery(activeQuery);
    }
    activeQuery = null;
    clearPendingQueries();
    latestGpuMs = null;
  };

  const pollGpu = () => {
    if (!gl2 || !timerExt || pendingQueries.length === 0) return;
    try {
      const disjoint = Boolean(gl2.getParameter(timerExt.GPU_DISJOINT_EXT));
      if (disjoint) {
        clearPendingQueries();
        latestGpuMs = null;
        return;
      }
      const query = pendingQueries[0]!;
      const available = Boolean(
        gl2.getQueryParameter(query, gl2.QUERY_RESULT_AVAILABLE),
      );
      if (!available) return;
      const elapsedNs = Number(gl2.getQueryParameter(query, gl2.QUERY_RESULT));
      gl2.deleteQuery(query);
      pendingQueries.shift();
      latestGpuMs = elapsedNs / 1_000_000;
      pushSample(gpuSamples, latestGpuMs);
    } catch {
      disableGpuTimer();
    }
  };

  const toggle = () => {
    visible = !visible;
    hud.hidden = !visible;
    if (visible) {
      cpuSamples.length = 0;
      gpuSamples.length = 0;
      intervalSamples.length = 0;
      previousFrameEndedAt = performance.now();
      lastHudAt = 0;
    }
    try {
      localStorage.setItem(STORAGE_KEY, visible ? "1" : "0");
    } catch {
      /* storage may be unavailable */
    }
    onVisibilityChange?.(visible);
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.code !== "F3") return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.repeat) return;
    toggle();
  };
  window.addEventListener("keydown", onKeyDown, true);

  return {
    isVisible() {
      return visible;
    },
    beginFrame() {
      if (disposed) return;
      frameStartedAt = performance.now();
      renderer.info.reset();
      pollGpu();
    },
    beginGpu() {
      if (
        disposed ||
        !visible ||
        !gl2 ||
        !timerExt ||
        activeQuery ||
        pendingQueries.length >= 4
      ) {
        return;
      }
      try {
        const query = gl2.createQuery();
        if (!query) return;
        gl2.beginQuery(timerExt.TIME_ELAPSED_EXT, query);
        activeQuery = query;
      } catch {
        disableGpuTimer();
      }
    },
    endGpu() {
      if (disposed || !gl2 || !timerExt || !activeQuery) return;
      try {
        gl2.endQuery(timerExt.TIME_ELAPSED_EXT);
        pendingQueries.push(activeQuery);
        activeQuery = null;
      } catch {
        disableGpuTimer();
      }
    },
    endFrame(extras = {}) {
      if (disposed) return;
      const now = performance.now();
      pushSample(cpuSamples, now - frameStartedAt);
      pushSample(intervalSamples, now - previousFrameEndedAt);
      previousFrameEndedAt = now;
      pollGpu();
      if (!visible || now - lastHudAt < HUD_REFRESH_MS) return;
      lastHudAt = now;
      const cpuAvg =
        cpuSamples.reduce((sum, value) => sum + value, 0) /
        Math.max(1, cpuSamples.length);
      const intervalAvg =
        intervalSamples.reduce((sum, value) => sum + value, 0) /
        Math.max(1, intervalSamples.length);
      const gpuAvg = gpuSamples.length
        ? gpuSamples.reduce((sum, value) => sum + value, 0) / gpuSamples.length
        : null;
      const info = renderer.info;
      const lines = [
        `EMBER ${label} PROFILER  [F3]`,
        `FPS ${fmt(1000 / Math.max(0.01, intervalAvg), 0)}  CPU ${fmt(cpuAvg)} ms  p95 ${fmt(percentile95(cpuSamples))}`,
        `GPU ${fmt(gpuAvg)} ms  p95 ${gpuSamples.length ? fmt(percentile95(gpuSamples)) : "n/a"}`,
        `Draw ${info.render.calls}  Tri ${info.render.triangles.toLocaleString("ru-RU")}`,
        `Geo ${info.memory.geometries}  Tex ${info.memory.textures}`,
      ];
      if (extras.chunks) {
        lines.push(
          `Chunks ${extras.chunks.loaded}/${extras.chunks.total}  target ${extras.chunks.desired}  pending ${extras.chunks.pending}`,
        );
      }
      if (extras.workers) {
        lines.push(
          `Workers ${extras.workers.active}  jobs ${extras.workers.jobs}`,
        );
      }
      if (extras.lights) {
        lines.push(
          `Lights ${extras.lights.active}  shadows ${extras.lights.shadows}`,
        );
        if (
          extras.lights.staticPointShadows != null ||
          extras.lights.dynamicPointShadows != null
        ) {
          lines.push(
            `Point cubes static ${extras.lights.staticPointShadows ?? 0}  dynamic ${extras.lights.dynamicPointShadows ?? 0}${extras.lights.dynamicIds ? `  [${extras.lights.dynamicIds}]` : ""}`,
            "Light marks  GREEN dynamic  BLUE baked  ORANGE cached",
          );
          if (extras.lights.cachedPointShadows != null) {
            lines.push(
              `Shadow bank cached ${extras.lights.cachedPointShadows}  dirty ${extras.lights.dirtyPointShadows ?? 0}  slots ${extras.lights.activePointShadowSlots ?? 0}  pool ${extras.lights.pooledDynamicShadows ?? 0}`,
            );
          }
        }
      }
      if (extras.actors) {
        lines.push(
          extras.actors.npcs
            ? `Enemies ${extras.actors.enemies}  NPC ${extras.actors.npcs} in ${extras.actors.batches} batches  bullets ${extras.actors.bullets}  fx ${extras.actors.effects}`
            : `Enemies ${extras.actors.enemies} in ${extras.actors.batches} batches  bullets ${extras.actors.bullets}  fx ${extras.actors.effects}`,
        );
        if (extras.actors.logicHz != null) {
          lines.push(
            `AI ${extras.actors.logicHz} Hz  steps ${extras.actors.logicSteps ?? 0}  spatial ${extras.actors.spatialBuckets ?? 0} buckets`,
          );
        }
        if (extras.actors.effectBatches != null) {
          lines.push(
            `FX ${extras.actors.effectInstances ?? 0} in ${extras.actors.effectBatches} batches  pool ${extras.actors.pooledTransient ?? 0}/${extras.actors.createdTransient ?? 0}`,
          );
        }
        if (extras.actors.stressTarget) {
          lines.push(`Stress target ${extras.actors.stressTarget}  invulnerable`);
        }
        if (extras.actors.physicsMoves != null) {
          lines.push(
            `Move physics ${extras.actors.physicsMoves}  contact skip ${extras.actors.contactSkips ?? 0}  LOD ${extras.actors.cadenceFull ?? 0}/${extras.actors.cadenceHalf ?? 0}/${extras.actors.cadenceThird ?? 0}/${extras.actors.cadenceQuarter ?? 0}`,
            `Avoid ${extras.actors.avoidanceActors ?? 0} actors / ${extras.actors.avoidanceNeighbors ?? 0} local neighbors`,
          );
        }
      }
      if (extras.renderables) {
        lines.push(
          `Scene terrain ${extras.renderables.terrain}  props ${extras.renderables.props}  UI ${extras.renderables.overlays}`,
          `Instances ${extras.renderables.instances}`,
        );
      }
      if (extras.reflection) {
        lines.push(
          extras.reflection.updated
            ? "Reflection updated"
            : `Reflection cached ${fmt(extras.reflection.ageMs, 0)} ms`,
        );
      }
      if (!timerExt) lines.push("GPU timer: n/a (driver/extension)");
      hud.textContent = lines.join("\n");
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      window.removeEventListener("keydown", onKeyDown, true);
      renderer.info.autoReset = previousAutoReset;
      disableGpuTimer();
      hud.remove();
    },
  };
}
