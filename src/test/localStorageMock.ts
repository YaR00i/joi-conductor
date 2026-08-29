/** Minimal in-memory localStorage for node unit tests. */

import { resetTagTypeCaches } from "../lib/tagTypes";

const store = new Map<string, string>();

export function resetLocalStorage(): void {
  store.clear();
  resetTagTypeCaches();
}

export function installLocalStorageMock(): void {
  const api: Storage = {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    setItem(key: string, value: string) {
      store.set(String(key), String(value));
    },
    removeItem(key: string) {
      store.delete(String(key));
    },
    key(index: number) {
      return [...store.keys()][index] ?? null;
    },
  };
  Object.defineProperty(globalThis, "localStorage", {
    value: api,
    configurable: true,
    writable: true,
  });
}
