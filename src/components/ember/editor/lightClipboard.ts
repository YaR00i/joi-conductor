/** Shared lamp-param clipboard for the map light editor. */

import type { EmberLampParams } from "../../../game/content/types";
import { normalizeLampParams } from "../../../game/content/lightPresets";

const STORAGE_KEY = "ember-light-clipboard-v1";

let memory: EmberLampParams | null = null;

export function copyLampParams(params: EmberLampParams): void {
  memory = normalizeLampParams(params);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(memory));
  } catch {
    // quota / private mode
  }
}

export function hasLampClipboard(): boolean {
  return peekLampClipboard() != null;
}

export function peekLampClipboard(): EmberLampParams | null {
  if (memory) return memory;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    memory = normalizeLampParams(JSON.parse(raw) as EmberLampParams);
    return memory;
  } catch {
    return null;
  }
}
