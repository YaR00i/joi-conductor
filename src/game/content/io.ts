/** Read/write ember content: Electron IPC, fetch /ember, local overrides. */
import {
  isVoxelLibraryRel,
  pickVoxelLibraryText,
} from "../voxel/voxelLibrary";

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

async function readEmberTextFromHost(
  relPath: string,
): Promise<EmberIoResult<string>> {
  const rel = normalizeRel(relPath);
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

async function readVoxelLibraryText(
  rel: string,
): Promise<EmberIoResult<string>> {
  const override = getOverrides()[rel];
  const disk = await readEmberTextFromHost(rel);
  const bak = await readEmberTextFromHost(`${rel}.bak`);
  const picked = pickVoxelLibraryText({
    overrideText: typeof override === "string" ? override : null,
    diskText: disk.ok ? disk.data : null,
    bakText: bak.ok ? bak.data : null,
  });
  if (!picked) {
    if (disk.ok) return disk;
    return { ok: false, error: `read ${rel}: not found` };
  }
  if (picked.source === "override") {
    return { ok: true, data: picked.text, source: "override" };
  }
  if (picked.source === "backup") {
    return { ok: true, data: picked.text, source: "backup" };
  }
  return disk.ok
    ? { ok: true, data: picked.text, source: disk.source }
    : { ok: true, data: picked.text, source: "fetch" };
}

export async function readEmberText(
  relPath: string,
): Promise<EmberIoResult<string>> {
  const rel = normalizeRel(relPath);
  if (isVoxelLibraryRel(rel)) {
    return readVoxelLibraryText(rel);
  }
  const overrides = getOverrides();
  if (rel in overrides) {
    return { ok: true, data: overrides[rel], source: "override" };
  }
  return readEmberTextFromHost(rel);
}

function parseJsonText<T>(
  relPath: string,
  text: EmberIoResult<string>,
): EmberIoResult<T> {
  if (!text.ok) return text;
  try {
    return {
      ok: true,
      data: JSON.parse(text.data) as T,
      source: text.source,
    };
  } catch (err) {
    return {
      ok: false,
      error: `JSON ${relPath}: ${err instanceof Error ? err.message : "parse"}`,
    };
  }
}

export async function readEmberJson<T>(
  relPath: string,
): Promise<EmberIoResult<T>> {
  const text = await readEmberText(relPath);
  const parsed = parseJsonText<T>(relPath, text);
  if (parsed.ok) return parsed;
  if (relPath.toLowerCase().endsWith(".bak")) return parsed;
  const backup = await readEmberText(`${relPath}.bak`);
  const backupParsed = parseJsonText<T>(relPath, backup);
  if (backupParsed.ok) {
    return { ok: true, data: backupParsed.data, source: "backup" };
  }
  return parsed;
}

/** Disk/fetch only — used as merge base so a thin override cannot wipe the catalog. */
export async function readEmberJsonFromDisk<T>(
  relPath: string,
): Promise<EmberIoResult<T>> {
  const rel = normalizeRel(relPath);
  const host = await readEmberTextFromHost(rel);
  if (isVoxelLibraryRel(rel)) {
    const bak = await readEmberTextFromHost(`${rel}.bak`);
    const picked = pickVoxelLibraryText({
      overrideText: null,
      diskText: host.ok ? host.data : null,
      bakText: bak.ok ? bak.data : null,
    });
    if (!picked) {
      return { ok: false, error: `read ${rel}: not found` };
    }
    try {
      return {
        ok: true,
        data: JSON.parse(picked.text) as T,
        source:
          picked.source === "backup"
            ? "backup"
            : host.ok
              ? host.source
              : "fetch",
      };
    } catch (err) {
      return {
        ok: false,
        error: `JSON ${rel}: ${err instanceof Error ? err.message : "parse"}`,
      };
    }
  }

  const parsed = parseJsonText<T>(rel, host);
  if (parsed.ok) return parsed;
  if (rel.toLowerCase().endsWith(".bak")) return parsed;
  const backup = await readEmberTextFromHost(`${rel}.bak`);
  const backupParsed = parseJsonText<T>(rel, backup);
  if (backupParsed.ok) {
    return { ok: true, data: backupParsed.data, source: "backup" };
  }
  return parsed;
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

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function dataUriToBytes(value: string): Uint8Array | null {
  const marker = ";base64,";
  const index = value.indexOf(marker);
  if (!value.startsWith("data:") || index < 0) return null;
  return base64ToBytes(value.slice(index + marker.length));
}

function mimeForRel(rel: string): string {
  const lower = rel.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".svg")) return "image/svg+xml";
  if (lower.endsWith(".vox") || lower.endsWith(".aseprite") || lower.endsWith(".ase")) {
    return "application/octet-stream";
  }
  return "application/octet-stream";
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

/** Read binary pack assets (MagicaVoxel `.vox`, PNG). Electron IPC, fetch, or data-URI override. */
export async function readEmberBytes(
  relPath: string,
): Promise<EmberIoResult<Uint8Array>> {
  const rel = normalizeRel(relPath);
  const overrides = getOverrides();
  if (rel in overrides) {
    const parsed = dataUriToBytes(overrides[rel]);
    if (parsed) return { ok: true, data: parsed, source: "override" };
  }
  const desktop = window.joiDesktop?.ember;
  if (desktop?.readBytes) {
    try {
      const res = await desktop.readBytes(rel);
      if (res.ok && typeof res.base64 === "string") {
        return { ok: true, data: base64ToBytes(res.base64), source: "electron" };
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
    return {
      ok: true,
      data: new Uint8Array(await res.arrayBuffer()),
      source: "fetch",
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "read failed",
    };
  }
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
