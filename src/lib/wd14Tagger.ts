/**
 * WD14 auto-tagger — hybrid orchestrator.
 *
 * Backend priority:
 *   1. Python server (scripts/wd14_server.py via electron/wd14Process.mjs)
 *      — most accurate, GPU-friendly, model loaded once.
 *   2. WASM fallback (onnxruntime-web) — lazy, in-browser. NOT yet wired; the
 *      dynamic import is in place but returns a "not available" result so the
 *      UI can show a clear hint instead of crashing. See docs/WD14_TAGGER.md.
 *   3. none — caller keeps the filename-as-tags fallback.
 *
 * The renderer calls tagLocalFile / tagMediaItems; electron IPC carries the
 * image bytes to the main process which proxies to the Python server.
 */

import type { MediaItem } from "./media";

export type TagScore = { tag: string; score: number };

export type TagResult = {
  tags: string[];
  scores: TagScore[];
};

export type Wd14Backend = "python" | "wasm" | "none";

export type Wd14Status = {
  backend: Wd14Backend;
  online: boolean;
  detail: string;
  managedByApp?: boolean;
  starting?: boolean;
};

export type TagProgress = {
  done: number;
  total: number;
  currentItem?: string;
};

export type Wd14RuntimeProgress = {
  phase: string;
  pct: number;
  detail?: string;
};

export type TagOptions = {
  baseUrl?: string;
  generalThreshold?: number;
  characterThreshold?: number;
  maxTags?: number;
  /** AbortSignal for cancellation. */
  signal?: AbortSignal;
  /** Progress callback (fires once per image). */
  onProgress?: (p: TagProgress) => void;
};

/** Probe what backend is available right now (cheap; safe to call on render). */
export async function getWd14Status(
  baseUrl?: string,
): Promise<Wd14Status> {
  const api = window.joiDesktop?.media;
  if (!api?.wd14Status) {
    return { backend: "none", online: false, detail: "только в Electron" };
  }
  try {
    const st = await api.wd14Status(baseUrl ? { baseUrl } : undefined);
    if (st.online) {
      return {
        backend: "python",
        online: true,
        detail: st.detail,
        managedByApp: st.managedByApp,
        starting: st.starting,
      };
    }
    // Python offline → check WASM availability (lazy).
    const wasm = await probeWasmBackend();
    if (wasm) {
      return {
        backend: "wasm",
        online: true,
        detail: "Python оффлайн · WASM-фолбэк",
      };
    }
    return {
      backend: "none",
      online: false,
      detail: st.detail || "сервер WD14 не запущен",
    };
  } catch (err) {
    return {
      backend: "none",
      online: false,
      detail: err instanceof Error ? err.message : "ошибка статуса",
    };
  }
}

export function onWd14RuntimeProgress(
  cb: (payload: Wd14RuntimeProgress) => void,
): () => void {
  const api = window.joiDesktop?.media;
  if (!api?.onWd14Progress) return () => undefined;
  return api.onWd14Progress(cb);
}

/** Start the Python server (best-effort; throws on missing python/model). */
export async function startWd14Server(
  opts: { baseUrl?: string; pythonPath?: string; modelDir?: string } = {},
): Promise<Wd14Status> {
  const api = window.joiDesktop?.media;
  if (!api?.wd14Start) {
    return { backend: "none", online: false, detail: "только в Electron" };
  }
  try {
    const st = await api.wd14Start(opts);
    return {
      backend: st.online ? "python" : "none",
      online: st.online,
      detail: st.detail,
      managedByApp: st.managedByApp,
      starting: st.starting,
    };
  } catch (err) {
    return {
      backend: "none",
      online: false,
      detail: err instanceof Error ? err.message : "ошибка запуска",
    };
  }
}

/** Tag a single image File. Returns tags or null if no backend available. */
export async function tagLocalFile(
  file: File,
  opts: TagOptions = {},
): Promise<TagResult | null> {
  const api = window.joiDesktop?.media;
  if (api?.tagImage) {
    try {
      const base64 = await fileToBase64(file);
      const res = await api.tagImage({
        base64,
        mime: file.type || "image/png",
        baseUrl: opts.baseUrl,
        generalThreshold: opts.generalThreshold,
        characterThreshold: opts.characterThreshold,
        maxTags: opts.maxTags,
      });
      return { tags: res.tags, scores: res.scores };
    } catch {
      // fall through to wasm
    }
  }
  // WASM fallback (not yet implemented in-process).
  return tagViaWasm(file, opts);
}

/**
 * Batch-tag a list of (MediaItem, File) pairs, updating tags incrementally.
 * Returns a new items array with tags filled in where tagging succeeded.
 * Items that were already auto-tagged (tagSource === "auto") are skipped.
 */
export async function tagMediaItems(
  items: MediaItem[],
  files: File[],
  opts: TagOptions = {},
): Promise<MediaItem[]> {
  const fileById = new Map<string, File>();
  for (const f of files) {
    // Match by the same id key mediaFromFiles uses: local-<name>-<i>-<size>
    const i = files.indexOf(f);
    const id = `local-${f.name}-${i}-${f.size}`;
    if (!fileById.has(id)) fileById.set(id, f);
  }

  const next = items.slice();
  let done = 0;
  const taggable = items.filter(
    (it) =>
      it.source === "local" &&
      it.kind !== "video" &&
      it.tagSource !== "auto" &&
      it.tagSource !== "manual" &&
      fileById.has(it.id),
  );
  const total = taggable.length;

  for (const item of taggable) {
    if (opts.signal?.aborted) break;
    const file = fileById.get(item.id)!;
    try {
      const result = await tagLocalFile(file, {
        ...opts,
        onProgress: undefined,
      });
      if (result && result.tags.length > 0) {
        const idx = next.findIndex((x) => x.id === item.id);
        if (idx >= 0) {
          next[idx] = {
            ...next[idx]!,
            tags: result.tags.join(" "),
            tagScores: result.scores,
            tagSource: "auto",
          };
        }
      }
    } catch {
      // individual failure — keep filename tags, continue
    }
    done += 1;
    opts.onProgress?.({
      done,
      total,
      currentItem: item.id,
    });
  }
  return next;
}

async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

// ---- WASM fallback (onnxruntime-web) ----------------------------------------

/**
 * WASM is intentionally not bundled yet — the dynamic import below would fail
 * at runtime. This stub keeps the interface in place so callers degrade
 * gracefully ("no backend") rather than crash, and so a future PR can wire
 * onnxruntime-web + the MoAT model with a matching signature.
 */
let wasmProbed = false;
let wasmAvailable = false;

async function probeWasmBackend(): Promise<boolean> {
  if (wasmProbed) return wasmAvailable;
  wasmProbed = true;
  try {
    // Detect whether onnxruntime-web is resolvable without forcing a download.
    // We do NOT actually import it here (would pull ~5MB into the bundle).
    // For now: always false — Python is the only supported backend.
    wasmAvailable = false;
  } catch {
    wasmAvailable = false;
  }
  return wasmAvailable;
}

async function tagViaWasm(
  _file: File,
  _opts: TagOptions,
): Promise<TagResult | null> {
  // Not yet implemented — see docs/WD14_TAGGER.md (future work).
  return null;
}
