import { fetchGallery, fetchSearch } from "./client";
import { cacheGalleryPages, type PageCacheProgress } from "./pageCache";
import {
  addManyToReadingList,
  createReadingList,
  listedGalleryIds,
  listReadingLists,
  refreshReadingListItem,
} from "./readingLists";
import {
  collectMistressQueueCards,
  mistressQueueName,
  pickMistressQueuePlans,
  type ReadingQueueSize,
} from "./readingRunBuild";
import { effectiveBlacklist } from "./safety";
import type { DoujinReadingList, DoujinTag } from "./types";

export async function assembleMistressList(opts: {
  size: ReadingQueueSize;
  moodScore: number;
  savedTags: readonly DoujinTag[];
  lovedTags: readonly DoujinTag[];
  rare?: boolean;
  appendToId?: string;
}): Promise<DoujinReadingList> {
  const lists = await listReadingLists();
  const exclude = listedGalleryIds(lists);
  const moodScore = opts.rare ? Math.min(opts.moodScore, -1) : opts.moodScore;
  const plans = pickMistressQueuePlans(
    moodScore,
    opts.savedTags,
    opts.lovedTags,
    effectiveBlacklist(),
  );
  const cards = await collectMistressQueueCards({
    size: opts.size,
    plans,
    exclude,
    search: async (query) => {
      const page = await fetchSearch({ query, sort: "popular", page: 1 });
      return page.items;
    },
  });
  if (opts.appendToId) {
    const next = await addManyToReadingList(opts.appendToId, cards);
    if (!next) throw new Error("Список не найден");
    return next;
  }
  const created = await createReadingList(mistressQueueName(), {
    origin: "mistress",
  });
  const filled = await addManyToReadingList(created.id, cards);
  return filled ?? created;
}

export async function prefetchReadingList(
  list: DoujinReadingList,
  onProgress: (progress: PageCacheProgress) => void,
): Promise<void> {
  const galleriesTotal = list.items.length;
  let galleriesDone = 0;
  let pagesDone = 0;
  const pagesTotal = list.items.reduce(
    (sum, item) => sum + Math.max(1, item.numPages),
    0,
  );
  onProgress({
    listId: list.id,
    galleriesDone: 0,
    galleriesTotal,
    pagesDone: 0,
    pagesTotal,
    status: "running",
  });
  try {
    for (const item of list.items) {
      const gallery = await fetchGallery(item.galleryId);
      await refreshReadingListItem(list.id, gallery);
      const before = pagesDone;
      await cacheGalleryPages(gallery, (done, total) => {
        onProgress({
          listId: list.id,
          galleriesDone,
          galleriesTotal,
          pagesDone: before + done,
          pagesTotal: Math.max(pagesTotal, before + total),
          status: "running",
        });
      });
      pagesDone += gallery.pages.length;
      galleriesDone += 1;
      onProgress({
        listId: list.id,
        galleriesDone,
        galleriesTotal,
        pagesDone,
        pagesTotal,
        status: "running",
      });
    }
    onProgress({
      listId: list.id,
      galleriesDone,
      galleriesTotal,
      pagesDone,
      pagesTotal,
      status: "done",
    });
  } catch (err) {
    onProgress({
      listId: list.id,
      galleriesDone,
      galleriesTotal,
      pagesDone,
      pagesTotal,
      status: "error",
      error: err instanceof Error ? err.message : "Не удалось скачать",
    });
    throw err;
  }
}
