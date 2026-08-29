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

export function formatPageCacheProgress(
  progress: PageCacheProgress | null | undefined,
): string {
  if (!progress || progress.status === "idle") return "";
  if (progress.status === "error") {
    return progress.error?.trim() || "Не удалось скачать список";
  }
  const pages =
    progress.pagesTotal > 0
      ? `${progress.pagesDone} / ${progress.pagesTotal} стр.`
      : "";
  const works =
    progress.galleriesTotal > 0
      ? `${progress.galleriesDone} / ${progress.galleriesTotal} работ`
      : "";
  if (progress.status === "done") {
    if (progress.galleriesTotal > 0) {
      return `Скачано · ${progress.galleriesDone} работ`;
    }
    return pages ? `Скачано · ${pages}` : "Скачано";
  }
  if (pages && works) return `${works} · ${pages}`;
  return pages || works || "Качаю…";
}

export function estimateListPages(list: DoujinReadingList): number {
  return list.items.reduce((sum, item) => sum + Math.max(0, item.numPages), 0);
}

/** Counts cached pages per gallery from blob keys only — does not load blobs. */
export async function countPageBlobsByGallery(): Promise<Map<number, number>> {
  const db = await openDoujinDb();
  const tx = db.transaction(PAGE_BLOBS_STORE, "readonly");
  const keys = (await idbRequest(
    tx.objectStore(PAGE_BLOBS_STORE).getAllKeys(),
  )) as IDBValidKey[];
  const counts = new Map<number, number>();
  for (const key of keys) {
    if (typeof key !== "string") continue;
    const colon = key.indexOf(":");
    if (colon <= 0) continue;
    const id = Number(key.slice(0, colon));
    if (!Number.isFinite(id)) continue;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}

export function readingListIsCached(
  list: Pick<DoujinReadingList, "items">,
  counts: ReadonlyMap<number, number>,
): boolean {
  if (list.items.length === 0) return false;
  return list.items.every((item) => {
    const need = Math.max(1, item.numPages || 0);
    return (counts.get(item.galleryId) ?? 0) >= need;
  });
}
