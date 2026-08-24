import type { PixelCanvasReference } from "./pixelCanvasView";

const DB_NAME = "ember-pixel-editor";
const DB_VERSION = 1;
const STORE_NAME = "references";

export type StoredPixelReference = Omit<PixelCanvasReference, "url"> & {
  key: string;
  blob: Blob;
  updatedAt: number;
};

let databasePromise: Promise<IDBDatabase> | null = null;

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

function openPixelReferenceDb(): Promise<IDBDatabase> {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is unavailable"));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      databasePromise = null;
      reject(request.error ?? new Error("Cannot open pixel reference database"));
    };
  });
  return databasePromise;
}

export async function loadPixelReference(
  key: string,
): Promise<StoredPixelReference | null> {
  const db = await openPixelReferenceDb();
  const tx = db.transaction(STORE_NAME, "readonly");
  const record = await requestResult(
    tx.objectStore(STORE_NAME).get(key) as IDBRequest<StoredPixelReference | undefined>,
  );
  return record ?? null;
}

export async function savePixelReference(
  key: string,
  blob: Blob,
  reference: PixelCanvasReference,
): Promise<void> {
  const db = await openPixelReferenceDb();
  const tx = db.transaction(STORE_NAME, "readwrite");
  await requestResult(tx.objectStore(STORE_NAME).put({
    key,
    blob,
    name: reference.name,
    mode: reference.mode,
    opacity: reference.opacity,
    scale: reference.scale,
    offsetX: reference.offsetX,
    offsetY: reference.offsetY,
    mirror: reference.mirror,
    updatedAt: Date.now(),
  } satisfies StoredPixelReference));
}

export async function deletePixelReference(key: string): Promise<void> {
  const db = await openPixelReferenceDb();
  const tx = db.transaction(STORE_NAME, "readwrite");
  await requestResult(tx.objectStore(STORE_NAME).delete(key));
}
