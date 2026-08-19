/** Read/write ember content: Electron IPC, fetch /ember, local overrides. */

const OVERRIDE_KEY = "ember-content-overrides-v1";

export type EmberIoResult<T> =
  | {
      ok: true;
      data: T;
      source: "electron" | "fetch" | "override" | "backup";
    }
  | { ok: false; error: string };

function getOverrides(): Record<string, string> {
  try {
    const raw = localStorage.getItem(OVERRIDE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveOverrides(map: Record<string, string>): void {
  try {
    localStorage.setItem(OVERRIDE_KEY, JSON.stringify(map));
  } catch {
    // quota
  }
}

export function listLocalOverrides(): string[] {
  return Object.keys(getOverrides()).sort();
}

export function clearLocalOverride(relPath: string): void {
  const map = getOverrides();
  delete map[normalizeRel(relPath)];
  saveOverrides(map);
}

export function clearAllLocalOverrides(): void {
  try {
    localStorage.removeItem(OVERRIDE_KEY);
  } catch {
    // ignore
  }
}

function normalizeRel(relPath: string): string {
  return relPath.replace(/^\/+/, "").replace(/\\/g, "/");
}

export async function readEmberText(
  relPath: string,
): Promise<EmberIoResult<string>> {
  const rel = normalizeRel(relPath);
  const overrides = getOverrides();
  if (rel in overrides) {
    return { ok: true, data: overrides[rel], source: "override" };
  }

  const desktop = window.joiDesktop?.ember;
  if (desktop?.readText) {
    try {
      const res = await desktop.readText(rel);
      if (res.ok && typeof res.text === "string") {
        return { ok: true, data: res.text, source: "electron" };
      }
    } catch {
      // fall through to fetch
    }
  }

  try {
    const url = `/ember/${rel}?t=${Date.now()}`;
    const res = await fetch(url);
    if (!res.ok) {
      return { ok: false, error: `fetch ${rel}: ${res.status}` };
    }
    return { ok: true, data: await res.text(), source: "fetch" };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "read failed",
    };
  }
}

export async function readEmberJson<T>(
  relPath: string,
): Promise<EmberIoResult<T>> {
  const text = await readEmberText(relPath);
  if (!text.ok) return text;
  try {
    return {
      ok: true,
      data: JSON.parse(text.data) as T,
      source: text.source,
    };
  } catch (err) {
    if (!relPath.toLowerCase().endsWith(".bak")) {
      const backup = await readEmberText(`${relPath}.bak`);
      if (backup.ok) {
        try {
          return {
            ok: true,
            data: JSON.parse(backup.data) as T,
            source: "backup",
          };
        } catch {
          // Report the original JSON error below.
        }
      }
    }
    return {
      ok: false,
      error: `JSON ${relPath}: ${err instanceof Error ? err.message : "parse"}`,
    };
  }
}

export async function writeEmberText(
  relPath: string,
  text: string,
): Promise<EmberIoResult<true>> {
  const rel = normalizeRel(relPath);
  const desktop = window.joiDesktop?.ember;
  if (desktop?.writeText) {
    try {
      const res = await desktop.writeText(rel, text);
      if (res.ok) {
        // Drop override if disk write succeeded
        clearLocalOverride(rel);
        return { ok: true, data: true, source: "electron" };
      }
      return { ok: false, error: res.detail ?? "electron write failed" };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "electron write",
      };
    }
  }

  // Browser / no IPC: persist override
  const map = getOverrides();
  map[rel] = text;
  saveOverrides(map);
  return { ok: true, data: true, source: "override" };
}

export async function writeEmberJson(
  relPath: string,
  data: unknown,
): Promise<EmberIoResult<true>> {
  return writeEmberText(relPath, JSON.stringify(data, null, 2) + "\n");
}

function mimeForRel(rel: string): string {
  const lower = rel.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".svg")) return "image/svg+xml";
  return "application/octet-stream";
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x2000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(
      null,
      bytes.subarray(i, i + chunk) as unknown as number[],
    );
  }
  return btoa(binary);
}

/** Write binary pack assets (PNG/JPEG/WebP). Uses Electron IPC or data-URI overrides. */
export async function writeEmberBytes(
  relPath: string,
  bytes: Uint8Array,
): Promise<EmberIoResult<true>> {
  const rel = normalizeRel(relPath);
  const base64 = bytesToBase64(bytes);
  const desktop = window.joiDesktop?.ember;
  if (desktop?.writeBytes) {
    try {
      const res = await desktop.writeBytes(rel, base64);
      if (res.ok) {
        clearLocalOverride(rel);
        return { ok: true, data: true, source: "electron" };
      }
      return { ok: false, error: res.detail ?? "electron write failed" };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "electron write",
      };
    }
  }

  const map = getOverrides();
  map[rel] = `data:${mimeForRel(rel)};base64,${base64}`;
  saveOverrides(map);
  return { ok: true, data: true, source: "override" };
}

export async function deleteEmberFile(
  relPath: string,
): Promise<EmberIoResult<true>> {
  const rel = normalizeRel(relPath);
  clearLocalOverride(rel);
  const desktop = window.joiDesktop?.ember;
  if (desktop?.delete) {
    try {
      const res = await desktop.delete(rel);
      if (res.ok) return { ok: true, data: true, source: "electron" };
      return { ok: false, error: res.detail ?? "electron delete failed" };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "electron delete",
      };
    }
  }
  return { ok: true, data: true, source: "override" };
}

/** List file names in a pack directory (e.g. `scenes`, `events`). */
export async function listEmberDir(
  relDir: string,
): Promise<EmberIoResult<string[]>> {
  const rel = normalizeRel(relDir).replace(/\/+$/, "");
  const desktop = window.joiDesktop?.ember;
  if (desktop?.list) {
    try {
      const res = await desktop.list(rel || ".");
      if (res.ok && Array.isArray(res.names)) {
        const fromDisk = res.names;
        const fromOverrides = listLocalOverrides()
          .filter((p) => p.startsWith(rel ? `${rel}/` : ""))
          .map((p) => p.slice(rel ? rel.length + 1 : 0))
          .filter((name) => name && !name.includes("/"));
        const names = [...new Set([...fromDisk, ...fromOverrides])].sort();
        return { ok: true, data: names, source: "electron" };
      }
    } catch {
      // fall through
    }
  }

  try {
    const url = `/ember/${rel}?list=1&t=${Date.now()}`;
    const res = await fetch(url);
    if (!res.ok) {
      return { ok: false, error: `list ${rel}: ${res.status}` };
    }
    const body = (await res.json()) as { names?: string[] };
    const fromDisk = Array.isArray(body.names) ? body.names : [];
    const fromOverrides = listLocalOverrides()
      .filter((p) => p.startsWith(rel ? `${rel}/` : ""))
      .map((p) => p.slice(rel ? rel.length + 1 : 0))
      .filter((name) => name && !name.includes("/"));
    const names = [...new Set([...fromDisk, ...fromOverrides])].sort();
    return { ok: true, data: names, source: "fetch" };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "list failed",
    };
  }
}

/** Public URL for an asset inside the pack (portraits, arts). */
export function emberAssetUrl(
  relPath: string,
  cacheBust?: number | string,
): string {
  const rel = normalizeRel(relPath);
  const overrides = getOverrides();
  if (rel in overrides && /\.(svg|png|webp|jpe?g|gif)$/i.test(rel)) {
    const value = overrides[rel];
    if (value.startsWith("data:")) return value;
    if (rel.endsWith(".svg")) {
      return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(value)}`;
    }
  }
  const base = `/ember/${rel}`;
  return cacheBust != null ? `${base}?t=${cacheBust}` : base;
}
