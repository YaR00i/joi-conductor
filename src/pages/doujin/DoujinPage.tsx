import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_DOUJIN_GRID_FIT,
  LIBRARY_GRID_MAX_COLS,
} from "../../lib/doujin/fitGrid";
import {
  fetchAccountTaste,
  fetchLocalFavoritesWindow,
  loadAccountFavoriteIds,
  peekAccountTasteCache,
  peekFavoriteIds,
  setAccountFavoriteLocal,
  writeTasteCache,
} from "../../lib/doujin/accountTaste";
import { proxiedImageUrl } from "../../lib/doujin/cdn";
import {
  fetchGallery,
  fetchNewest,
  fetchRelated,
  fetchSearch,
  hasDoujinApiKey,
  setGalleryFavorite,
} from "../../lib/doujin/client";
import {
  continueReadingRows,
  getLibraryRecord,
  listLibrary,
  libraryTagPool,
  saveToLibrary,
  touchLibraryProgress,
} from "../../lib/doujin/library";
import {
  addManyToReadingList,
  createReadingList,
  deleteReadingList,
  listedGalleryIds,
  listCanResume,
  listOrigin,
  listResumeIndex,
  listReadingLists,
  moveInReadingList,
  otherUserLists,
  refreshReadingListItem,
  removeFromReadingList,
  renameReadingList,
  setReadingListCursor,
  setReadingListNote,
  toggleInReadingList,
} from "../../lib/doujin/readingLists";
import { cardMatchesLanguage, displayTitle } from "../../lib/doujin/normalize";
import {
  buildRecommendPlans,
  mixUniqueCards,
  pickRecommendPlan,
  recsPlanAndWindow,
  recsSearchApiPage,
  recsWindowPageCount,
  toggleLibrarySortTag,
  toggleLovedTag,
  moveLibrarySortTag,
} from "../../lib/doujin/query";
import { loadDoujinSettings, saveDoujinSettings } from "../../lib/doujin/settings";
import {
  cardTagIds,
  ingestTasteGallery,
  peekTasteSyncStatus,
  rememberTasteGalleryCards,
  startTasteSync,
  subscribeTasteSync,
  type TasteSyncStatus,
} from "../../lib/doujin/tasteSync";
import { effectiveBlacklist } from "../../lib/doujin/safety";
import {
  applyCumplayChoice,
  applyMistressSurvey,
  closeOverlay,
  completeActiveTask,
  createReadingRun,
  endReadingRun,
  noteReadingPage,
  offerListEnd,
  openPermission,
  pauseReadingRun,
  readingRunCanResume,
  readingRunHasProgress,
  reportCum,
  reportEdge,
  reportRuin,
  resolvePermission,
  resumeReadingRun,
  skipActiveTask,
  type ReadingRunPatch,
  type ReadingRunState,
} from "../../lib/doujin/readingRun";
import {
  assembleMistressList,
  prefetchReadingList,
} from "../../lib/doujin/readingRunActions";
import type { ReadingQueueSize } from "../../lib/doujin/readingRunBuild";
import { buildReadingDiaryEntry } from "../../lib/doujin/readingRunDiary";
import {
  loadReadingRunForSource,
  saveReadingRunForSource,
} from "../../lib/doujin/readingRunStore";
import {
  deleteGalleryPageBlobs,
  type PageCacheProgress,
} from "../../lib/doujin/pageCache";
import { appendDiaryEntry } from "../../lib/sessionDiary";
import { getActiveMistress } from "../../lib/mistress";
import {
  applyControlMoodDelta,
  loadControlState,
  saveControlMood,
} from "../../lib/soul/control/store";
import type {
  DoujinCard,
  DoujinCategoryFilter,
  DoujinGallery,
  DoujinLanguageFilter,
  DoujinLibraryCatalogSort,
  DoujinMinFavorites,
  DoujinPagesBand,
  DoujinPlaylistNav,
  DoujinReadingList,
  DoujinSearchSort,
  DoujinTag,
} from "../../lib/doujin/types";
import type { NavId } from "../../components/SideNav";
import type { ContentUnlockLists } from "../../lib/contentUnlocks";
import type { MediaItem } from "../../lib/media";
import {
  CONTENT_TAB_LABELS,
  loadContentHub,
  rememberFavoritesRedirect,
  saveContentHub,
  type ContentSource,
  type ContentTab,
} from "../../lib/contentHub";
import { useFavoriteSaveQueue } from "../../lib/favoriteSaveQueue";
import { toggleSelectedById } from "../../lib/feedTake";
import { ContentSourceKicker } from "../content/ContentSourceKicker";
import { GelbooruHub } from "../content/GelbooruHub";
import { DoujinPager } from "./DoujinPager";
import { DoujinDetail } from "./DoujinDetail";
import { DoujinGrid } from "./DoujinGrid";
import { DoujinListPicker } from "./DoujinListPicker";
import { DoujinReader } from "./DoujinReader";
import { DoujinReadingLists } from "./DoujinReadingLists";
import { DoujinReadingRunHud } from "./DoujinReadingRunHud";
import { DoujinReadingRunPrompt } from "./DoujinReadingRunPrompt";
import { DoujinSearchBar } from "./DoujinSearchBar";
import {
  DoujinCacheToast,
  DoujinSyncToast,
  DoujinTasteRail,
} from "./DoujinTasteRail";
import { useDoujinGridFit } from "./useDoujinGridFit";
import "./doujin.css";

type Tab = ContentTab;

type Props = {
  onNavigate?: (id: NavId) => void;
  onFavoritesChanged?: () => void;
  onPlayPlaylist?: (items: MediaItem[], listId?: string) => void;
  unlocks?: ContentUnlockLists;
  /** Old sidebar Избранное: open Gelbooru shelf inside Content. */
  fromFavorites?: boolean;
};

async function coverBlob(url: string): Promise<Blob | undefined> {
  if (!url) return undefined;
  try {
    const res = await fetch(proxiedImageUrl(url));
    if (!res.ok) return undefined;
    return await res.blob();
  } catch {
    return undefined;
  }
}

export function DoujinPage({
  onNavigate,
  onFavoritesChanged,
  onPlayPlaylist,
  unlocks,
  fromFavorites = false,
}: Props) {
  const [source, setSource] = useState<ContentSource>(() => {
    if (fromFavorites) rememberFavoritesRedirect();
    return loadContentHub().source;
  });
  const [tab, setTab] = useState<Tab>(() => loadContentHub().tab);
  const [page, setPage] = useState(1);
  const [numPages, setNumPages] = useState(1);
  const [listTotal, setListTotal] = useState<number | undefined>();
  const [items, setItems] = useState<DoujinCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stripped, setStripped] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [committedQuery, setCommittedQuery] = useState("");
  const [language, setLanguage] = useState<DoujinLanguageFilter>("all");
  const [category, setCategory] = useState<DoujinCategoryFilter>("all");
  const [pagesBand, setPagesBand] = useState<DoujinPagesBand>("all");
  const [minFavorites, setMinFavorites] =
    useState<DoujinMinFavorites>("all");
  const [recsTick, setRecsTick] = useState(0);
  const [sort, setSort] = useState<DoujinSearchSort>("date");
  const [savedIds, setSavedIds] = useState<Set<number>>(new Set());
  const [coverOverrides, setCoverOverrides] = useState<Record<number, string>>(
    {},
  );
  const [reader, setReader] = useState<DoujinGallery | null>(null);
  const [reading, setReading] = useState(false);
  const [readerPage, setReaderPage] = useState(0);
  const [emptyLibraryHint, setEmptyLibraryHint] = useState(false);
  const [recHint, setRecHint] = useState<string | null>(null);
  const [lovedTags, setLovedTags] = useState<DoujinTag[]>(
    () => loadDoujinSettings().lovedTags,
  );
  const [librarySortTags, setLibrarySortTags] = useState<DoujinTag[]>(
    () => loadDoujinSettings().librarySortTags,
  );
  const [libraryCatalogSort, setLibraryCatalogSort] =
    useState<DoujinLibraryCatalogSort>(
      () => loadDoujinSettings().libraryCatalogSort,
    );
  const [tasteTags, setTasteTags] = useState<DoujinTag[]>(
    () => peekAccountTasteCache()?.tags ?? [],
  );
  const [tasteSampled, setTasteSampled] = useState(
    () => peekAccountTasteCache()?.sampled ?? 0,
  );
  const [tasteTotal, setTasteTotal] = useState(
    () => peekAccountTasteCache()?.total ?? 0,
  );
  const [tasteComplete, setTasteComplete] = useState(
    () => peekAccountTasteCache()?.complete === true,
  );
  const [tasteBusy, setTasteBusy] = useState(false);
  const [tasteSync, setTasteSync] = useState<TasteSyncStatus>(
    peekTasteSyncStatus,
  );
  const [lists, setLists] = useState<DoujinReadingList[]>([]);
  const [openListId, setOpenListId] = useState<string | null>(null);
  const [listTarget, setListTarget] = useState<{
    card: DoujinCard;
    pool: DoujinCard[] | null;
    heading?: string;
    packExact?: boolean;
  } | null>(null);
  const [selectedCards, setSelectedCards] = useState<DoujinCard[]>([]);
  const [pageProgress, setPageProgress] = useState<Record<number, number>>(
    {},
  );
  const [playlist, setPlaylist] = useState<{
    listId: string;
    index: number;
  } | null>(null);
  const [run, setRun] = useState<ReadingRunState | null>(() =>
    loadReadingRunForSource("nhentai"),
  );
  const [runLive, setRunLive] = useState(false);
  const [runPrompt, setRunPrompt] = useState<
    { kind: "start"; listId: string } | { kind: "leave" } | null
  >(null);
  const runRef = useRef(run);
  runRef.current = run;
  const leavePausedRef = useRef(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [queueSize, setQueueSize] = useState<ReadingQueueSize>(15);
  const [assembleBusy, setAssembleBusy] = useState(false);
  const [cacheProgress, setCacheProgress] = useState<PageCacheProgress | null>(
    null,
  );
  const genRef = useRef(0);
  const coverUrlsRef = useRef<string[]>([]);
  const gridWrapRef = useRef<HTMLDivElement>(null);

  const keyed = hasDoujinApiKey();
  const nhentai = source === "nhentai";
  const showGrid =
    nhentai && keyed && !emptyLibraryHint && !reader && tab !== "lists";
  const fit = useDoujinGridFit(
    gridWrapRef,
    showGrid,
    tab === "library" ? LIBRARY_GRID_MAX_COLS : undefined,
  );
  const pageSize = showGrid ? fit.pageSize : DEFAULT_DOUJIN_GRID_FIT.pageSize;
  const recsPlans = useMemo(
    () => buildRecommendPlans(tasteTags, effectiveBlacklist(), lovedTags),
    [lovedTags, tasteTags],
  );

  const listedIds = useMemo(() => listedGalleryIds(lists), [lists]);

  const refreshSaved = useCallback(async () => {
    try {
      const ids = await loadAccountFavoriteIds();
      setSavedIds(ids);
    } catch {
      setSavedIds(peekFavoriteIds());
    }
    const rows = await listLibrary();
    for (const url of coverUrlsRef.current) URL.revokeObjectURL(url);
    const next: Record<number, string> = {};
    const created: string[] = [];
    for (const row of rows) {
      if (!row.coverBlob) continue;
      const u = URL.createObjectURL(row.coverBlob);
      created.push(u);
      next[row.id] = u;
    }
    coverUrlsRef.current = created;
    setCoverOverrides(next);
    const progress: Record<number, number> = {};
    for (const row of rows) progress[row.id] = row.pageIndex;
    setPageProgress(progress);
  }, []);

  const refreshLists = useCallback(async () => {
    setLists(await listReadingLists());
  }, []);

  const tabRef = useRef(tab);
  tabRef.current = tab;
  const loadFeedRef = useRef<() => void>(() => undefined);
  const favSave = useFavoriteSaveQueue({
    onIdle: () => {
      void refreshSaved().then(() => {
        if (tabRef.current === "library") loadFeedRef.current();
      });
    },
  });

  useEffect(() => {
    if (source !== "nhentai") return;
    setRun(loadReadingRunForSource("nhentai"));
  }, [source]);

  useEffect(() => {
    saveReadingRunForSource(run, "nhentai");
  }, [run]);

  useEffect(() => {
    if (!run || run.status !== "running") return;
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [run]);

  function applyRunPatch(patch: ReadingRunPatch) {
    setRun(patch.state);
    if (patch.moodDelta) {
      applyControlMoodDelta(getActiveMistress().id, patch.moodDelta);
    }
  }

  function commitRun(state: ReadingRunState, ended: "complete" | "abort") {
    const finished = endReadingRun(state, Date.now());
    appendDiaryEntry(buildReadingDiaryEntry({ run: finished, ended }));
    saveControlMood(getActiveMistress().id, finished.moodScore);
    runRef.current = null;
    setRun(null);
    setRunLive(false);
  }

  async function assembleQueue(size: ReadingQueueSize, rare = false) {
    setAssembleBusy(true);
    setError(null);
    try {
      const moodScore = loadControlState(getActiveMistress().id).moodScore;
      const list = await assembleMistressList({
        size,
        moodScore,
        savedTags: tasteTags,
        lovedTags,
        rare,
      });
      await refreshLists();
      setOpenListId(list.id);
      setTab("lists");
      await prefetchReadingList(list, setCacheProgress);
      await refreshLists();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Не удалось собрать очередь",
      );
    } finally {
      setAssembleBusy(false);
    }
  }

  useEffect(() => {
    void refreshSaved();
    void refreshLists();
    return () => {
      for (const url of coverUrlsRef.current) URL.revokeObjectURL(url);
    };
  }, [refreshLists, refreshSaved]);

  useEffect(() => {
    if (!nhentai || !keyed || tab !== "library") return;
    let cancelled = false;
    setTasteBusy(true);
    void fetchAccountTaste()
      .then((taste) => {
        if (cancelled) return;
        setTasteTags(taste.tags);
        setTasteSampled(taste.sampled);
        setTasteTotal(taste.total);
        setTasteComplete(taste.complete === true);
      })
      .catch(() => {
        if (!cancelled) setTasteTags([]);
      })
      .finally(() => {
        if (!cancelled) setTasteBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [keyed, nhentai, tab]);

  useEffect(() => {
    return subscribeTasteSync((next, taste) => {
      setTasteSync(next);
      if (!taste) return;
      writeTasteCache(taste);
      setTasteTags(taste.tags);
      setTasteSampled(taste.sampled);
      setTasteTotal(taste.total);
      setTasteComplete(taste.complete === true);
    });
  }, []);

  const loadFeed = useCallback(async () => {
    if (!nhentai) {
      setLoading(false);
      return;
    }
    if (!keyed) return;
    const gen = ++genRef.current;
    setLoading(true);
    setError(null);
    setStripped([]);
    setEmptyLibraryHint(false);
    setRecHint(null);
    try {
      if (tab === "lists") {
        if (gen !== genRef.current) return;
        setItems([]);
        setNumPages(1);
        setListTotal(undefined);
        return;
      }
      if (tab === "library") {
        const result = await fetchLocalFavoritesWindow(
          page,
          pageSize,
          librarySortTags,
          libraryCatalogSort,
        );
        if (gen !== genRef.current) return;
        setItems(result.items);
        setNumPages(result.numPages);
        setListTotal(result.total);
        if (page > result.numPages) {
          setPage(Math.max(1, result.numPages));
        }
        if (result.items.length === 0 && page <= 1) {
          setRecHint(
            librarySortTags.length > 0
              ? "В каталоге нет работ с выбранными тегами сортировки."
              : "На аккаунте nhentai пока нет избранного.",
          );
        }
        setSavedIds((prev) => {
          const next = new Set(prev);
          for (const card of result.items) next.add(card.id);
          return next;
        });
        return;
      }
      if (tab === "newest") {
        const result = await fetchNewest(page, undefined, pageSize);
        if (gen !== genRef.current) return;
        setItems(result.items);
        setNumPages(result.numPages);
        setListTotal(result.total);
        if (page > result.numPages) {
          setPage(Math.max(1, result.numPages));
        }
        setStripped(result.stripped);
        return;
      }
      if (tab === "search") {
        const result = await fetchSearch({
          query: committedQuery,
          sort,
          page,
          language,
          category,
          pagesBand,
          minFavorites,
          perPage: pageSize,
        });
        if (gen !== genRef.current) return;
        setItems(result.items);
        setNumPages(result.numPages);
        setListTotal(result.total);
        if (page > result.numPages) {
          setPage(Math.max(1, result.numPages));
        }
        setStripped(result.stripped);
        return;
      }
      const rows = await listLibrary();
      let accountTags: DoujinTag[] = [];
      let accountIds: number[] = [];
      let accountTotal = 0;
      let accountError: string | null = null;
      try {
        const taste = await fetchAccountTaste();
        accountTags = taste.tags;
        accountIds = taste.favoriteIds;
        accountTotal = taste.total;
        setTasteTags(taste.tags);
        setTasteSampled(taste.sampled);
        setTasteTotal(taste.total);
        setTasteComplete(taste.complete === true);
      } catch (err) {
        accountError =
          err instanceof Error ? err.message : "Не удалось прочитать избранное аккаунта";
      }
      const tasteTags =
        accountTags.length > 0 ? accountTags : libraryTagPool(rows);
      const fromAccount = accountTags.length > 0;
      if (tasteTags.length === 0) {
        if (gen !== genRef.current) return;
        setEmptyLibraryHint(true);
        setItems([]);
        setNumPages(1);
        setListTotal(undefined);
        if (accountError) setError(accountError);
        return;
      }
      const recs = loadDoujinSettings().recs;
      const plans = buildRecommendPlans(
        tasteTags,
        effectiveBlacklist(),
        lovedTags,
      );
      const { planTick, windowTick } = recsPlanAndWindow(
        recsTick,
        plans.length,
      );
      const recPlan = pickRecommendPlan(plans, planTick);
      const recQuery = recPlan?.query ?? null;
      const exclude = new Set<number>([
        ...rows.map((r) => r.id),
        ...accountIds,
      ]);
      const continueIds = continueReadingRows(rows).map((r) => r.id);
      const seedPool = [
        ...continueIds,
        ...accountIds.filter((id) => !continueIds.includes(id)),
        ...rows
          .map((r) => r.id)
          .filter((id) => !continueIds.includes(id) && !accountIds.includes(id)),
      ];
      const seedId =
        seedPool[recsTick % Math.max(1, seedPool.length)] ?? seedPool[0];
      const related =
        page <= 1 && seedId ? await fetchRelated(seedId) : [];
      const apiPage = recsSearchApiPage(windowTick, page);
      const searched = recQuery
        ? await fetchSearch({
            query: recQuery,
            sort: recs.sort,
            page: apiPage,
            language: recs.language,
            category: recs.category,
            pagesBand: recs.pagesBand,
            minFavorites: recs.minFavorites,
            perPage: pageSize,
          })
        : { items: [] as DoujinCard[], numPages: 1, stripped: [] as string[] };
      if (gen !== genRef.current) return;
      let windowPages = recQuery
        ? recsWindowPageCount(searched.numPages || 1, windowTick)
        : 1;
      if (recQuery && windowPages <= 0) {
        setRecsTick(0);
        setPage(1);
        return;
      }
      if (recQuery && apiPage > (searched.numPages || 1) && windowTick > 0) {
        setRecsTick(0);
        setPage(1);
        return;
      }
      const relatedFit =
        page <= 1
          ? related.filter((card) =>
              cardMatchesLanguage(card.languages ?? card.language, recs.language),
            )
          : [];
      setItems(
        mixUniqueCards(
          page <= 1 ? [relatedFit, searched.items] : [searched.items],
          exclude,
          pageSize,
        ),
      );
      setNumPages(Math.max(1, windowPages));
      setListTotal(undefined);
      setStripped(searched.stripped ?? []);
      const pageLabel = `${page}/${Math.max(1, windowPages)}`;
      const pairing = recPlan?.label ? ` · ${recPlan.label}` : "";
      if (fromAccount) {
        setRecHint(
          `Вкус из избранного аккаунта nhentai (${accountTotal || accountIds.length} работ) · ${pageLabel}${pairing}`,
        );
      } else {
        setRecHint(
          accountError
            ? `${accountError} Реки из локальной библиотеки · ${pageLabel}${pairing}`
            : `Избранное аккаунта пустое — реки из локальной библиотеки · ${pageLabel}${pairing}`,
        );
      }
    } catch (err) {
      if (gen !== genRef.current) return;
      setError(err instanceof Error ? err.message : "Ошибка загрузки");
      setItems([]);
    } finally {
      if (gen === genRef.current) setLoading(false);
    }
  }, [category, committedQuery, keyed, language, libraryCatalogSort, librarySortTags, lovedTags, minFavorites, nhentai, page, pageSize, pagesBand, recsTick, sort, tab]);

  loadFeedRef.current = () => {
    void loadFeed();
  };

  useEffect(() => {
    void loadFeed();
  }, [loadFeed]);

  useEffect(() => {
    saveContentHub({ source, tab });
  }, [source, tab]);

  useEffect(() => {
    setSelectedCards([]);
  }, [tab, committedQuery, source]);

  async function openGallery(
    id: number,
    fromList?: { listId: string; index: number },
  ): Promise<boolean> {
    setError(null);
    setLoading(true);
    try {
      const gallery = await fetchGallery(id);
      if (savedIds.has(id) || peekFavoriteIds().has(id)) {
        try {
          await rememberTasteGalleryCards([gallery]);
        } catch {
          /* catalog optional */
        }
      }
      const row = await getLibraryRecord(id);
      if (!row && peekFavoriteIds().has(id)) {
        await saveToLibrary(gallery);
      }
      setReaderPage(row?.pageIndex ?? 0);
      setReading(false);
      setPlaylist(fromList ?? null);
      if (fromList) {
        await setReadingListCursor(fromList.listId, fromList.index);
        await refreshLists();
      }
      setReader(gallery);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось открыть");
      return false;
    } finally {
      setLoading(false);
    }
  }

  function toggleSave(card: DoujinCard) {
    const id = String(card.id);
    if (favSave.isBusy(id)) return;
    const nextOn = !savedIds.has(card.id);
    const openGallery = reader;
    setSavedIds((prev) => {
      const next = new Set(prev);
      if (nextOn) next.add(card.id);
      else next.delete(card.id);
      return next;
    });
    favSave.enqueue({
      id,
      kind: nextOn ? "save" : "remove",
      mediaKind: "gallery",
      publicId: id,
      detail: displayTitle(card.title) || undefined,
      run: async () => {
        try {
          await setGalleryFavorite(card.id, nextOn);
          setSavedIds(setAccountFavoriteLocal(card.id, nextOn));
          if (nextOn) {
            const gallery =
              openGallery?.id === card.id
                ? openGallery
                : await fetchGallery(card.id);
            const blob = await coverBlob(
              gallery.coverUrl || gallery.thumbnailUrl,
            );
            await saveToLibrary(gallery, { coverBlob: blob });
            const taste = await ingestTasteGallery(
              gallery.id,
              cardTagIds(gallery),
              true,
              gallery,
            );
            if (taste) {
              writeTasteCache(taste);
              setTasteTags(taste.tags);
              setTasteSampled(taste.sampled);
              setTasteTotal(taste.total);
              setTasteComplete(taste.complete === true);
            }
          } else {
            const taste = await ingestTasteGallery(
              card.id,
              cardTagIds(card),
              false,
            );
            if (taste) {
              writeTasteCache(taste);
              setTasteTags(taste.tags);
              setTasteSampled(taste.sampled);
              setTasteTotal(taste.total);
              setTasteComplete(taste.complete === true);
            }
          }
        } catch (err) {
          setSavedIds(setAccountFavoriteLocal(card.id, !nextOn));
          throw err;
        }
      },
    });
  }

  async function toggleCardInList(listId: string, card: DoujinCard) {
    await toggleInReadingList(listId, card);
    await refreshLists();
  }

  async function createListAndAdd(name: string, cards: DoujinCard[]) {
    await createReadingList(name, { items: cards });
    await refreshLists();
  }

  function openFoundPack(
    pool: DoujinCard[],
    heading: string,
    packExact = false,
  ) {
    const first = pool[0];
    if (!first) return;
    setListTarget({ card: first, pool, heading, packExact });
  }

  function unfavoriteSelected() {
    if (selectedCards.length === 0) return;
    for (const card of selectedCards) {
      if (savedIds.has(card.id)) toggleSave(card);
    }
    setSelectedCards([]);
  }

  async function playFromList(
    listId: string,
    index: number,
    pageIndex?: number,
    runOpts?: { startRun?: boolean; resetRun?: boolean },
  ) {
    const list =
      lists.find((row) => row.id === listId) ??
      (await listReadingLists()).find((row) => row.id === listId);
    const item = list?.items[index];
    if (!item) return;
    setError(null);
    setLoading(true);
    try {
      await setReadingListCursor(listId, index);
      const gallery = await fetchGallery(item.galleryId);
      const row = await getLibraryRecord(item.galleryId);
      setPlaylist({ listId, index });
      setOpenListId(listId);
      setReaderPage(pageIndex ?? row?.pageIndex ?? 0);
      setReader(gallery);
      setReading(true);
      if (runOpts?.startRun && list) {
        const existing =
          runRef.current && runRef.current.status !== "ended"
            ? runRef.current
            : null;
        const reuse = Boolean(
          existing &&
            existing.listId === listId &&
            existing.source !== "gelbooru" &&
            !runOpts.resetRun,
        );
        if (existing && !reuse) {
          commitRun(existing, "abort");
        }
        if (reuse && existing) {
          const next =
            existing.status === "paused"
              ? resumeReadingRun(existing, Date.now())
              : existing;
          runRef.current = next;
          setRun(next);
        } else {
          const moodScore = loadControlState(getActiveMistress().id).moodScore;
          const next = createReadingRun({
            listId,
            listName: list.name,
            listTotal: list.items.length,
            origin: listOrigin(list),
            moodScore,
            source: "nhentai",
          });
          runRef.current = next;
          setRun(next);
        }
        setRunLive(true);
      }
      await refreshLists();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось открыть");
    } finally {
      setLoading(false);
    }
  }

  async function advancePlaylist(dir: -1 | 1) {
    if (!playlist) return;
    const nextIndex = playlist.index + dir;
    const list =
      lists.find((row) => row.id === playlist.listId) ??
      (await listReadingLists()).find((row) => row.id === playlist.listId);
    const item = list?.items[nextIndex];
    if (!item) {
      if (run && run.listId === playlist.listId && dir > 0) {
        setRun(offerListEnd(run));
      }
      return;
    }
    setLoading(true);
    try {
      await setReadingListCursor(playlist.listId, nextIndex);
      const gallery = await fetchGallery(item.galleryId);
      setPlaylist({ listId: playlist.listId, index: nextIndex });
      setReaderPage(
        dir > 0 ? 0 : Math.max(0, gallery.pages.length - 1),
      );
      setReader(gallery);
      setReading(true);
      await refreshLists();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось открыть");
    } finally {
      setLoading(false);
    }
  }

  function leaveGallery() {
    const listId = playlist?.listId;
    setReader(null);
    setReading(false);
    setPlaylist(null);
    setRunLive(false);
    setRunPrompt(null);
    leavePausedRef.current = false;
    void refreshSaved();
    if (listId) {
      setTab("lists");
      setOpenListId(listId);
    }
  }

  function requestLeaveRun() {
    if (runPrompt?.kind === "leave") return;
    const live = runRef.current;
    if (!runLive || !live || live.status === "ended") {
      leaveGallery();
      return;
    }
    const paused =
      live.status === "running" ? pauseReadingRun(live, Date.now()) : live;
    if (!readingRunHasProgress(paused)) {
      runRef.current = null;
      setRun(null);
      setRunLive(false);
      saveReadingRunForSource(null, "nhentai");
      leaveGallery();
      return;
    }
    leavePausedRef.current = live.status === "running";
    runRef.current = paused;
    setRun(paused);
    saveReadingRunForSource(paused, "nhentai");
    setRunPrompt({ kind: "leave" });
  }

  function stayInRun() {
    const live = runRef.current;
    if (leavePausedRef.current && live && live.status === "paused") {
      const next = resumeReadingRun(live, Date.now());
      runRef.current = next;
      setRun(next);
    }
    leavePausedRef.current = false;
    setRunPrompt(null);
  }

  function startRunFromPrompt(listId: string, reset: boolean) {
    const list = lists.find((row) => row.id === listId);
    if (!list || list.items.length === 0) {
      setRunPrompt(null);
      return;
    }
    setRunPrompt(null);
    const index = reset ? 0 : listResumeIndex(list);
    void playFromList(listId, index, reset ? 0 : undefined, {
      startRun: true,
      resetRun: reset,
    });
  }

  function toggleLoved(tag: DoujinTag) {
    const next = toggleLovedTag(lovedTags, tag);
    saveDoujinSettings({ lovedTags: next });
    setLovedTags(next);
  }

  function toggleSort(tag: DoujinTag) {
    const next = toggleLibrarySortTag(librarySortTags, tag);
    saveDoujinSettings({ librarySortTags: next });
    setLibrarySortTags(next);
    setPage(1);
  }

  function moveSort(from: number, to: number) {
    const next = moveLibrarySortTag(librarySortTags, from, to);
    saveDoujinSettings({ librarySortTags: next });
    setLibrarySortTags(next);
  }

  function setCatalogSort(next: DoujinLibraryCatalogSort) {
    if (next === libraryCatalogSort) return;
    saveDoujinSettings({ libraryCatalogSort: next });
    setLibraryCatalogSort(next);
    setPage(1);
  }

  const playlistNav: DoujinPlaylistNav | null = (() => {
    if (!playlist) return null;
    const list = lists.find((row) => row.id === playlist.listId);
    if (!list) return null;
    return {
      name: list.name,
      index: playlist.index,
      total: list.items.length,
      hasPrev: playlist.index > 0,
      hasNext: playlist.index < list.items.length - 1,
    };
  })();

  const selectedIds = useMemo(
    () => new Set(selectedCards.map((card) => card.id)),
    [selectedCards],
  );
  const picker = listTarget ? (
    <DoujinListPicker
      card={listTarget.card}
      lists={lists}
      pool={listTarget.pool}
      heading={listTarget.heading}
      packExact={listTarget.packExact}
      onClose={() => setListTarget(null)}
      onToggle={(id) => toggleCardInList(id, listTarget.card)}
      onPack={(id, cards) =>
        addManyToReadingList(id, cards).then(() => {
          if (listTarget.packExact) setSelectedCards([]);
          return refreshLists();
        })
      }
      onCreate={(name, cards) =>
        createListAndAdd(name, cards ?? [listTarget.card]).then(() => {
          if (listTarget.packExact) setSelectedCards([]);
        })
      }
    />
  ) : null;
  const syncToast = <DoujinSyncToast sync={tasteSync} />;
  const toasts = (
    <div
      className={
        "doujin-toast-stack" + (favSave.toast ? " is-with-save" : "")
      }
    >
      {syncToast}
      <DoujinCacheToast progress={cacheProgress} />
    </div>
  );
  const startPromptList =
    runPrompt?.kind === "start"
      ? (lists.find((row) => row.id === runPrompt.listId) ?? null)
      : null;

  const onReaderPage = useCallback(
    (index: number) => {
      if (!reader) return;
      void touchLibraryProgress(reader, index);
      if (!runLive || !run || run.status === "ended") return;
      if (playlist && playlist.listId !== run.listId) return;
      applyRunPatch(
        noteReadingPage(run, {
          galleryId: String(reader.id),
          title: displayTitle(reader.title) || `#${reader.id}`,
          pageIndex: index,
          pageCount: reader.pages.length || reader.numPages,
        }),
      );
    },
    [playlist, reader, run, runLive],
  );

  if (reader && reading) {
    return (
      <div className="page page--doujin">
        {toasts}
        <DoujinReader
          gallery={reader}
          saved={savedIds.has(reader.id)}
          initialPage={readerPage}
          busy={favSave.isBusy(String(reader.id))}
          playlist={playlistNav}
          backLabel={playlist ? "К списку" : "К описанию"}
          onBack={() => {
            if (playlist) {
              requestLeaveRun();
              return;
            }
            setReading(false);
          }}
          onToggleSave={() => void toggleSave(reader)}
          onPage={onReaderPage}
          onPlaylistBound={(dir) => void advancePlaylist(dir)}
          runHud={
            run && runLive && playlist?.listId === run.listId ? (
              <DoujinReadingRunHud
                run={run}
                now={nowMs}
                otherLists={otherUserLists(lists, run.listId).map((list) => ({
                  id: list.id,
                  name: list.name,
                  count: list.items.length,
                }))}
                onPause={() => setRun(pauseReadingRun(run, Date.now()))}
                onResume={() => setRun(resumeReadingRun(run, Date.now()))}
                onEdge={() => applyRunPatch(reportEdge(run))}
                onRuin={() => applyRunPatch(reportRuin(run))}
                onCum={() => applyRunPatch(reportCum(run))}
                onPermission={() => setRun(openPermission(run))}
                onSpinPermission={() =>
                  applyRunPatch(resolvePermission(run, Date.now()))
                }
                onCumplay={(id) => setRun(applyCumplayChoice(run, id))}
                onTaskDone={() => applyRunPatch(completeActiveTask(run))}
                onTaskSkip={() => applyRunPatch(skipActiveTask(run))}
                onSurvey={(pick) => {
                  const patch = applyMistressSurvey(run, pick);
                  applyRunPatch(patch);
                  if (pick === "stop") {
                    commitRun(patch.state, "complete");
                    return;
                  }
                  void (async () => {
                    try {
                      const list = await assembleMistressList({
                        size: 10,
                        moodScore: patch.state.moodScore,
                        savedTags: tasteTags,
                        lovedTags,
                        rare: pick === "rare",
                        appendToId: run.listId,
                      });
                      await refreshLists();
                      await prefetchReadingList(list, setCacheProgress);
                      await refreshLists();
                    } catch (err) {
                      setError(
                        err instanceof Error
                          ? err.message
                          : "Не удалось докинуть очередь",
                      );
                    }
                  })();
                }}
                onPickList={(listId) => {
                  commitRun(run, "complete");
                  void playFromList(listId, 0, undefined, {
                    startRun: true,
                    resetRun: true,
                  });
                }}
                onAssembleAuto={() => {
                  commitRun(run, "complete");
                  void assembleQueue(queueSize);
                }}
                onAssembleSelf={() => {
                  commitRun(run, "complete");
                  setReading(false);
                  setReader(null);
                  setPlaylist(null);
                  setTab("lists");
                  setOpenListId(null);
                }}
                onCloseOverlay={() => {
                  if (run.overlay.kind === "selfEnd") {
                    commitRun(run, "complete");
                    return;
                  }
                  setRun(closeOverlay(run));
                }}
              />
            ) : null
          }
        />
        {runPrompt?.kind === "leave" ? (
          <DoujinReadingRunPrompt
            kind="leave"
            onStay={stayInRun}
            onLeave={leaveGallery}
          />
        ) : null}
        {picker}
      </div>
    );
  }

  if (reader) {
    return (
      <div className="page page--doujin">
        {toasts}
        {error ? <p className="doujin-error">{error}</p> : null}
        <DoujinDetail
          gallery={reader}
          saved={savedIds.has(reader.id)}
          listed={listedIds.has(reader.id)}
          busy={favSave.isBusy(String(reader.id))}
          backLabel={playlist ? "К списку" : "К ленте"}
          onBack={leaveGallery}
          onRead={(pageIndex) => {
            setReaderPage(pageIndex);
            setReading(true);
          }}
          onToggleSave={() => void toggleSave(reader)}
          onOpenLists={() => setListTarget({ card: reader, pool: null })}
          onTag={(q) => {
            setQuery(q);
            setCommittedQuery(q);
            setTab("search");
            setPage(1);
            setReader(null);
            setReading(false);
            setPlaylist(null);
          }}
          onOpenRelated={(id) => void openGallery(id)}
        />
        {picker}
      </div>
    );
  }

  const status =
    error ??
    (stripped.length > 0
      ? `С фильтра сняты теги: ${stripped.join(", ")}`
      : null);

  return (
    <div className="page page--doujin">
      {toasts}
      <header className="doujin-chrome">
        <div className="doujin-chrome__brand">
          <h1>Контент</h1>
          <ContentSourceKicker
            source={source}
            onChange={(next) => {
              setSource(next);
              setReader(null);
              setReading(false);
              setPlaylist(null);
            }}
          />
        </div>
        <div className="doujin-tabs" role="tablist">
          {CONTENT_TAB_LABELS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              role="tab"
              className={tab === id ? "is-active" : ""}
              disabled={nhentai && !keyed && id !== "lists"}
              onClick={() => {
                setTab(id);
                setPage(1);
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      {source === "gelbooru" ? (
        <div className="doujin-hub">
          <GelbooruHub
            tab={tab}
            onTabChange={(next) => {
              setTab(next);
              setPage(1);
            }}
            onNavigate={onNavigate}
            unlocks={unlocks}
            onFavoritesChanged={onFavoritesChanged ?? (() => undefined)}
            onPlayPlaylist={onPlayPlaylist}
          />
        </div>
      ) : !keyed && tab !== "lists" ? (
        <div className="doujin-empty">
          <p className="muted">
            Нужен API-ключ nhentai. Вставь его в Настройках → Медиа.
          </p>
          <button
            type="button"
            className="btn-primary"
            onClick={() => onNavigate?.("settings")}
          >
            К настройкам
          </button>
        </div>
      ) : (
        <div className="doujin-hub">
          {tab === "search" ? (
            <DoujinSearchBar
              query={query}
              language={language}
              category={category}
              pagesBand={pagesBand}
              minFavorites={minFavorites}
              sort={sort}
              suggestTags={tasteTags}
              onQuery={setQuery}
              onLanguage={(lang) => {
                setLanguage(lang);
                setPage(1);
              }}
              onCategory={(next) => {
                setCategory(next);
                setPage(1);
              }}
              onPagesBand={(next) => {
                setPagesBand(next);
                setPage(1);
              }}
              onMinFavorites={(next) => {
                setMinFavorites(next);
                setPage(1);
              }}
              onSort={(next) => {
                setSort(next);
                setPage(1);
              }}
              onSubmit={() => {
                setCommittedQuery(query);
                setPage(1);
              }}
            />
          ) : null}

          {tab !== "lists" && status ? (
            <p className={error ? "doujin-error" : "doujin-status"}>
              {status}
            </p>
          ) : null}

          {tab === "lists" ? (
            <DoujinReadingLists
              lists={lists}
              openListId={openListId}
              coverOverrides={coverOverrides}
              pageProgress={pageProgress}
              onOpenList={setOpenListId}
              onCreate={async (name) => {
                await createReadingList(name);
                await refreshLists();
              }}
              onRename={(id, name) =>
                void renameReadingList(id, name).then(refreshLists)
              }
              onNote={(id, note) =>
                void setReadingListNote(id, note).then(refreshLists)
              }
              onDelete={(id) => {
                void deleteReadingList(id).then(() => {
                  setOpenListId(null);
                  return refreshLists();
                });
              }}
              onRemoveItem={(listId, galleryId) =>
                void removeFromReadingList(listId, galleryId).then(async () => {
                  const next = await listReadingLists();
                  setLists(next);
                  if (!listedGalleryIds(next).has(galleryId)) {
                    await deleteGalleryPageBlobs(galleryId);
                  }
                })
              }
              onMoveItem={(listId, from, to) =>
                void moveInReadingList(listId, from, to).then(refreshLists)
              }
              onPlay={(listId, index, pageIndex) =>
                void playFromList(listId, index, pageIndex)
              }
              onStartRun={(listId) => {
                const list = lists.find((row) => row.id === listId);
                if (!list) return;
                const canContinue =
                  readingRunCanResume(run, list.id, "nhentai") ||
                  listCanResume(list, pageProgress);
                if (canContinue) {
                  setRunPrompt({ kind: "start", listId });
                  return;
                }
                startRunFromPrompt(listId, true);
              }}
              onAssemble={(size) => void assembleQueue(size)}
              queueSize={queueSize}
              onQueueSize={setQueueSize}
              assembleBusy={assembleBusy}
              cacheProgress={cacheProgress}
              keyed={keyed}
              onDownloadList={(listId) => {
                const list = lists.find((row) => row.id === listId);
                if (
                  !list ||
                  list.items.length === 0 ||
                  cacheProgress?.status === "running"
                ) {
                  return;
                }
                void prefetchReadingList(list, setCacheProgress)
                  .then(() => refreshLists())
                  .catch((err) => {
                    setError(
                      err instanceof Error
                        ? err.message
                        : "Не удалось скачать список",
                    );
                  });
              }}
              onTag={(q) => {
                setQuery(q);
                setCommittedQuery(q);
                setTab("search");
                setPage(1);
              }}
              onEnrichItem={async (listId, galleryId) => {
                if (!keyed) return;
                const gallery = await fetchGallery(galleryId);
                await refreshReadingListItem(listId, gallery);
                await refreshLists();
              }}
            />
          ) : emptyLibraryHint ? (
            <div className="doujin-empty">
              <p className="muted">
                Поставь сердечки на сайте или здесь — это одно избранное аккаунта
                nhentai. От его тегов пойдут рекомендации.
              </p>
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  setTab("newest");
                  setPage(1);
                }}
              >
                К новинкам
              </button>
            </div>
          ) : (
            (() => {
              const grid = (
                <div
                  ref={gridWrapRef}
                  className={
                    "doujin-grid-wrap" + (loading ? " is-loading" : "")
                  }
                >
                  {tab === "recs" && recHint ? (
                    <p className="doujin-status doujin-status--overlay">
                      {recHint}
                    </p>
                  ) : null}
                  <DoujinGrid
                    items={items.slice(0, pageSize)}
                    savedIds={savedIds}
                    listedIds={listedIds}
                    busyIds={favSave.busyIds}
                    cols={fit.cols}
                    rows={fit.rows}
                    loading={loading}
                    coverOverrides={coverOverrides}
                    onOpen={(id) => void openGallery(id)}
                    onToggleSave={(card) => void toggleSave(card)}
                    onOpenLists={(card) =>
                      setListTarget({ card, pool: null })
                    }
                    selectedIds={selectedIds}
                    onToggleSelect={(card) =>
                      setSelectedCards((prev) =>
                        toggleSelectedById(prev, card),
                      )
                    }
                  />
                </div>
              );
              if (tab !== "library") return grid;
              return (
                <div className="doujin-library">
                  <DoujinTasteRail
                    tags={tasteTags}
                    lovedTags={lovedTags}
                    sortTags={librarySortTags}
                    sampled={tasteSampled}
                    total={tasteTotal}
                    complete={tasteComplete}
                    busy={tasteBusy}
                    sync={tasteSync}
                    onSearch={(q) => {
                      setQuery(q);
                      setCommittedQuery(q);
                      setTab("search");
                      setPage(1);
                    }}
                    onToggleLoved={toggleLoved}
                    onToggleSort={toggleSort}
                    onMoveSort={moveSort}
                    onSync={() => void startTasteSync()}
                  />
                  {grid}
                </div>
              );
            })()
          )}
        </div>
      )}
      {nhentai &&
      keyed &&
      tab !== "lists" &&
      !emptyLibraryHint ? (
        <DoujinPager
          page={page}
          numPages={numPages}
          total={tab === "recs" ? undefined : listTotal}
          loading={loading}
          mode={tab === "recs" ? "refresh" : "pages"}
          recsTitle={
            recsPlans.length > 1
              ? `Другая связка вкуса · сейчас ${recsPlans[recsTick % recsPlans.length]?.label ?? "поиск"}`
              : `Страница ${page} из ${numPages}. Ещё раз — следующая пачка поиска.`
          }
          onPage={setPage}
          onRefresh={() => {
            setPage(1);
            setRecsTick((n) => n + 1);
          }}
          onPackFound={() => {
            if (selectedCards.length > 0) {
              openFoundPack(
                selectedCards,
                `${selectedCards.length} выбранных`,
                true,
              );
              return;
            }
            openFoundPack(
              items,
              tab === "library" ? "Избранное" : "Найденное",
            );
          }}
          packDisabled={
            selectedCards.length === 0 && items.length === 0
          }
          packTitle={
            selectedCards.length > 0
              ? `В список: ${selectedCards.length} выбранных`
              : "В список из найденного"
          }
          onDeleteSelected={
            tab === "library" ? unfavoriteSelected : undefined
          }
          deleteDisabled={selectedCards.length === 0}
          deleteTitle={
            selectedCards.length > 0
              ? `Убрать из избранного: ${selectedCards.length}`
              : "Выбери работы, чтобы убрать из избранного"
          }
          catalogSort={tab === "library" ? libraryCatalogSort : undefined}
          onCatalogSort={tab === "library" ? setCatalogSort : undefined}
        />
      ) : null}
      {picker}
      {startPromptList ? (
        <DoujinReadingRunPrompt
          kind="start"
          onStartFresh={() => startRunFromPrompt(startPromptList.id, true)}
          onContinue={() => startRunFromPrompt(startPromptList.id, false)}
          onCancel={() => setRunPrompt(null)}
        />
      ) : null}
    </div>
  );
}
