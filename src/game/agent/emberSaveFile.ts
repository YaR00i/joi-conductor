/**
 * Node-only JSON save folder for ember-agent CLI.
 * Play still uses localStorage; this is for testers dumping slots on disk.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  EMBER_SAVE_SLOT_MAX,
  EMBER_SAVE_SLOT_MIN,
  exploreActiveSlotKey,
  exploreSaveKey,
  type EmberSaveBackend,
} from "../content/emberSave";
import { resolveEmberContentRoot } from "./explorePackDisk";

export const EMBER_DEBUG_SAVES_REL = "debug/ember-saves";

export function resolveEmberDebugSavesDir(
  contentRoot = resolveEmberContentRoot(),
): string {
  return path.resolve(contentRoot, "../..", EMBER_DEBUG_SAVES_REL);
}

function parseSaveKey(
  key: string,
): { kind: "save"; packId: string; slot: number } | { kind: "active"; packId: string } | null {
  const savePrefix = "ember-save-v1:";
  if (!key.startsWith(savePrefix)) return null;
  const rest = key.slice(savePrefix.length);
  if (rest.startsWith("active:")) {
    const packId = rest.slice("active:".length).trim();
    return packId ? { kind: "active", packId } : null;
  }
  const split = rest.lastIndexOf(":");
  if (split <= 0) return null;
  const packId = rest.slice(0, split).trim();
  const slot = Number(rest.slice(split + 1));
  if (
    !packId ||
    !Number.isInteger(slot) ||
    slot < EMBER_SAVE_SLOT_MIN ||
    slot > EMBER_SAVE_SLOT_MAX
  ) {
    return null;
  }
  return { kind: "save", packId, slot };
}

function packDir(root: string, packId: string): string {
  return path.join(root, packId);
}

function slotFile(root: string, packId: string, slot: number): string {
  return path.join(packDir(root, packId), `slot-${slot}.json`);
}

function activeFile(root: string, packId: string): string {
  return path.join(packDir(root, packId), "active.json");
}

function keyToPath(root: string, key: string): string | null {
  const parsed = parseSaveKey(key);
  if (!parsed) return null;
  switch (parsed.kind) {
    case "save":
      return slotFile(root, parsed.packId, parsed.slot);
    case "active":
      return activeFile(root, parsed.packId);
    default: {
      const _never: never = parsed;
      return _never;
    }
  }
}

export function createFileSaveBackend(rootDir: string): EmberSaveBackend {
  const root = path.resolve(rootDir);
  return {
    getItem(key) {
      const file = keyToPath(root, key);
      if (!file || !existsSync(file)) return null;
      try {
        return readFileSync(file, "utf8");
      } catch {
        return null;
      }
    },
    setItem(key, value) {
      const file = keyToPath(root, key);
      if (!file) return;
      mkdirSync(path.dirname(file), { recursive: true });
      const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
      writeFileSync(tmp, value);
      renameSync(tmp, file);
    },
    removeItem(key) {
      const file = keyToPath(root, key);
      if (!file || !existsSync(file)) return;
      try {
        unlinkSync(file);
      } catch {
        /* ignore */
      }
    },
    keys() {
      const out: string[] = [];
      if (!existsSync(root)) return out;
      let packs: string[] = [];
      try {
        packs = readdirSync(root, { withFileTypes: true })
          .filter((entry) => entry.isDirectory())
          .map((entry) => entry.name);
      } catch {
        return out;
      }
      for (const packId of packs) {
        if (existsSync(activeFile(root, packId))) {
          out.push(exploreActiveSlotKey(packId));
        }
        for (let slot = EMBER_SAVE_SLOT_MIN; slot <= EMBER_SAVE_SLOT_MAX; slot++) {
          if (existsSync(slotFile(root, packId, slot))) {
            out.push(exploreSaveKey(packId, slot));
          }
        }
      }
      return out;
    },
  };
}

export function createEmberAgentSaveBackend(
  contentRoot?: string,
): EmberSaveBackend {
  const emberRoot = contentRoot ?? resolveEmberContentRoot();
  return createFileSaveBackend(resolveEmberDebugSavesDir(emberRoot));
}

