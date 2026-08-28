import { proxiedImageUrl } from "./cdn";
import {
  idbRequest,
  openDoujinDb,
  PAGE_BLOBS_STORE,
} from "./library";
import type { DoujinGallery, DoujinReadingList } from "./types";

export type PageBlobRow = {
  key: string;
  galleryId: number;
  pageIndex: number;
  blob: Blob;
  url: string;
  savedAt: number;
};

export type PageCacheProgress = {
  listId: string;
  galleriesDone: number;
  galleriesTotal: number;
  pagesDone: number;
  pagesTotal: number;
  status: "idle" | "running" | "done" | "error";
  error?: string;
};

export function pageBlobKey(galleryId: number, pageIndex: number): string {
  return `${galleryId}:${pageIndex}`;
}

export async function getPageBlob(
  galleryId: number,
  pageIndex: number,
): Promise<Blob | undefined> {
  const db = await openDoujinDb();
  const tx = db.transaction(PAGE_BLOBS_STORE, "readonly");
  const row = (await idbRequest(
    tx.objectStore(PAGE_BLOBS_STORE).get(pageBlobKey(galleryId, pageIndex)),
  )) as PageBlobRow | undefined;
  return row?.blob;
}

export async function putPageBlob(row: PageBlobRow): Promise<void> {
  const db = await openDoujinDb();
  const tx = db.transaction(PAGE_BLOBS_STORE, "readwrite");
  await idbRequest(tx.objectStore(PAGE_BLOBS_STORE).put(row));
}

export async function deleteGalleryPageBlobs(galleryId: number): Promise<void> {
  const db = await openDoujinDb();
  const tx = db.transaction(PAGE_BLOBS_STORE, "readwrite");
  const store = tx.objectStore(PAGE_BLOBS_STORE);
  const index = store.index("galleryId");
  const rows = (await idbRequest(index.getAll(galleryId))) as PageBlobRow[];
  for (const row of rows) {
    await idbRequest(store.delete(row.key));
  }
}

export async function cacheGalleryPages(
  gallery: DoujinGallery,
  onPage?: (done: number, total: number) => void,
  concurrency = 3,
): Promise<void> {
  const pages = gallery.pages;
  const total = pages.length;
  let done = 0;
  let cursor = 0;

  async function worker(): Promise<void> {
    while (cursor < pages.length) {
      const index = cursor;
      cursor += 1;
      const page = pages[index];
      if (!page?.url) {
        done += 1;
        onPage?.(done, total);
        continue;
      }
      const existing = await getPageBlob(gallery.id, index);
      if (!existing) {
        try {
          const res = await fetch(proxiedImageUrl(page.url));
          if (res.ok) {
            const blob = await res.blob();
            await putPageBlob({
              key: pageBlobKey(gallery.id, index),
              galleryId: gallery.id,
              pageIndex: index,
              blob,
              url: page.url,
              savedAt: Date.now(),
            });
          }
        } catch {
          /* skip a failed page; reader falls back to proxy */
        }
      }
      done += 1;
      onPage?.(done, total);
    }
  }

  const n = Math.max(1, Math.min(concurrency, pages.length || 1));
  await Promise.all(Array.from({ length: n }, () => worker()));
}

export function emptyPageCacheProgress(listId = ""): PageCacheProgress {
  return {
    listId,
    galleriesDone: 0,
    galleriesTotal: 0,
    pagesDone: 0,
    pagesTotal: 0,
    status: "idle",
  };
}

export function estimateListPages(list: DoujinReadingList): number {
  return list.items.reduce((sum, item) => sum + Math.max(0, item.numPages), 0);
}
