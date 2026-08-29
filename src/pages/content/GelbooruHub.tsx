import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BooruTagInput } from "../../components/BooruTagInput";
import { MediaKindFilter } from "../../components/MediaKindFilter";
import type { NavId } from "../../components/SideNav";
import type { ContentUnlockLists } from "../../lib/contentUnlocks";
import { gelbooruRecsQuery, type ContentTab } from "../../lib/contentHub";
import { buildFavoriteTasteProfile } from "../../lib/favoriteTagTaste";
import { useFavoriteSaveQueue, listDownloadJobId } from "../../lib/favoriteSaveQueue";
import { assembleGelbooruMistressList } from "../../lib/gelbooruListBuild";
import {
  addManyToGelbooruList,
  createGelbooruList,
  deleteGelbooruList,
  gelbooruItemOnShelf,
  gelbooruListUnsavedItems,
  listedGelbooruIds,
  listGelbooruLists,
  moveInGelbooruList,
  removeFromGelbooruList,
  renameGelbooruList,
  setGelbooruListCursor,
  setGelbooruListNote,
  toggleInGelbooruList,
  type GelbooruPlayList,
} from "../../lib/gelbooruLists";
import {
  addFavoriteFromItem,
  listFavoriteMetadata,
  removeFavoriteForItem,
} from "../../lib/mediaFavorites";
import {
  ensureMediaCached,
  isMediaCached,
  readCachedMediaBlob,
} from "../../lib/mediaPreload";
import {
  DEFAULT_MEDIA_SETTINGS,
  fetchGelbooru,
  filterMediaByKinds,
  hydrateGelbooruNativeTypes,
  loadMediaSettings,
  type MediaItem,
} from "../../lib/media";
import { MEDIA_QUEUE_MIN, type MediaQueueSize } from "../../lib/mediaQueue";
import {
  applyHubKindQuery,
  kindsForHubKind,
  type HubKindFilter,
} from "../../lib/mediaTypeFilter";
import { BookmarkIcon } from "../../components/FavLightbox";
import { HubSearchDock } from "../../components/HubSearchDock";
import { toggleSelectedById } from "../../lib/feedTake";
import { FavoritesPage } from "../FavoritesPage";
import { DoujinPager } from "../doujin/DoujinPager";
import { GelbooruFeed } from "./GelbooruFeed";
import { GelbooruListPicker } from "./GelbooruListPicker";
import { GelbooruLists } from "./GelbooruLists";
import { useGelbooruReadingRun } from "./useGelbooruReadingRun";
import { DoujinReadingRunHud } from "../doujin/DoujinReadingRunHud";
import { DoujinReadingRunPrompt } from "../doujin/DoujinReadingRunPrompt";

const PAGE_SIZE = 36;

async function blobForFavoriteSave(
  item: MediaItem,
  report?: (progress: {
    percent: number | null;
    loadedBytes?: number;
    totalBytes?: number | null;
  }) => void,
): Promise<Blob | null> {
  await ensureMediaCached(item, report);
  return readCachedMediaBlob(item.id);
}

type Props = {
  tab: ContentTab;
  onTabChange?: (tab: ContentTab) => void;
  onNavigate?: (id: NavId) => void;
  onFavoritesChanged: () => void;
  onPlayPlaylist?: (items: MediaItem[], listId?: string) => void;
  unlocks?: ContentUnlockLists;
};

function hasGelbooruCreds(): boolean {
  const media = loadMediaSettings();
  return Boolean(media.gelbooruUserId.trim() && media.gelbooruApiKey.trim());
}

export function GelbooruHub({
  tab,
  onTabChange,
  onNavigate,
  onFavoritesChanged,
  onPlayPlaylist,
  unlocks,
}: Props) {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [lists, setLists] = useState<GelbooruPlayList[]>([]);
  const [openListId, setOpenListId] = useState<string | null>(null);
  const [listPlay, setListPlay] = useState<{
    listId: string;
    index: number;
    gen: number;
  } | null>(null);
  const [listTarget, setListTarget] = useState<{
    item: MediaItem;
    pool: MediaItem[] | null;
    heading?: string;
    packExact?: boolean;
  } | null>(null);
  const [selectedItems, setSelectedItems] = useState<MediaItem[]>([]);
  const [queueSize, setQueueSize] = useState<MediaQueueSize>(MEDIA_QUEUE_MIN);
  const [assembleBusy, setAssembleBusy] = useState(false);
  const [assembleError, setAssembleError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [committed, setCommitted] = useState("");
  const [recsTick, setRecsTick] = useState(0);
  const [recsHint, setRecsHint] = useState<string | null>(null);
  const [kindFilter, setKindFilter] = useState<HubKindFilter>("all");
  const loadingRef = useRef(false);
  const genRef = useRef(0);
  const pidRef = useRef(0);

  const keyed = hasGelbooruCreds();

  const refreshSaved = useCallback(async () => {
    const rows = await listFavoriteMetadata();
    setSavedIds(new Set(rows.map((row) => row.id)));
  }, []);

  const refreshLists = useCallback(async () => {
    setLists(await listGelbooruLists());
  }, []);

  const reading = useGelbooruReadingRun({
    lists,
    queueSize,
    onOpenPlay: (listId, index) => {
      setOpenListId(listId);
      setListPlay({ listId, index, gen: Date.now() });
    },
    onRefreshLists: refreshLists,
    onGoToListsOverview: () => setOpenListId(null),
  });

  const favSave = useFavoriteSaveQueue({
    onIdle: () => {
      void refreshSaved().then(() => onFavoritesChanged());
    },
  });

  useEffect(() => {
    void refreshSaved();
  }, [refreshSaved]);

  useEffect(() => {
    void refreshLists();
  }, [refreshLists]);

  const tagsForTab = useCallback(async (): Promise<string> => {
    const media = loadMediaSettings();
    const fallback = media.tags.trim() || DEFAULT_MEDIA_SETTINGS.tags;
    if (tab === "search") {
      return applyHubKindQuery(committed.trim() || fallback, kindFilter);
    }
    if (tab === "recs") {
      const rows = await listFavoriteMetadata();
      const liked = buildFavoriteTasteProfile(rows).liked;
      void hydrateGelbooruNativeTypes(
        liked.map((row) => row.tag),
        { autocompleteFallback: false },
      );
      const query = gelbooruRecsQuery(liked, recsTick, fallback);
      setRecsHint(
        liked.length > 0
          ? query.replace(" rating:explicit", "").trim()
          : "Полка без тегов — обычные новинки.",
      );
      return applyHubKindQuery(query, kindFilter);
    }
    setRecsHint(null);
    return fallback;
  }, [committed, kindFilter, recsTick, tab]);

  const loadPage = useCallback(
    async (reset: boolean) => {
      if (!keyed) return;
      if (loadingRef.current && !reset) return;
      const gen = reset ? genRef.current + 1 : genRef.current;
      genRef.current = gen;
      loadingRef.current = true;
      setLoading(true);
      setError(null);
      try {
        const media = loadMediaSettings();
        const tags = await tagsForTab();
        const nextPid = reset ? 0 : pidRef.current;
        const batch = await fetchGelbooru(tags, PAGE_SIZE, {
          userId: media.gelbooruUserId,
          apiKey: media.gelbooruApiKey,
        }, { pid: nextPid });
        if (gen !== genRef.current) return;
        pidRef.current = nextPid + 1;
        const shown = filterMediaByKinds(batch, kindsForHubKind(kindFilter));
        setHasMore(batch.length >= PAGE_SIZE);
        setItems((prev) => {
          if (reset) return shown;
          const have = new Set(prev.map((row) => row.id));
          return [...prev, ...shown.filter((row) => !have.has(row.id))];
        });
      } catch (err) {
        if (gen !== genRef.current) return;
        setError(err instanceof Error ? err.message : "Не удалось загрузить");
        if (reset) setItems([]);
        setHasMore(false);
      } finally {
        if (gen === genRef.current) {
          loadingRef.current = false;
          setLoading(false);
        }
      }
    },
    [keyed, kindFilter, tagsForTab],
  );

  useEffect(() => {
    if (tab === "library" || tab === "lists") {
      genRef.current += 1;
      loadingRef.current = false;
      return;
    }
    if (tab === "search" && !committed.trim()) {
      genRef.current += 1;
      loadingRef.current = false;
      pidRef.current = 0;
      setItems([]);
      setHasMore(false);
      setLoading(false);
      setError(null);
      return;
    }
    pidRef.current = 0;
    setItems([]);
    setHasMore(true);
    void loadPage(true);
  }, [tab, committed, recsTick, keyed, loadPage]);

  useEffect(() => {
    setSelectedItems([]);
  }, [tab, committed, kindFilter, recsTick]);

  const onLoadMore = useCallback(() => {
    if (!hasMore || loadingRef.current) return;
    void loadPage(false);
  }, [hasMore, loadPage]);

  function toggleSave(item: MediaItem) {
    if (favSave.isBusy(item.id)) return;
    const nextOn = !savedIds.has(item.id);
    setSavedIds((prev) => {
      const next = new Set(prev);
      if (nextOn) next.add(item.id);
      else next.delete(item.id);
      return next;
    });
    favSave.enqueue({
      id: item.id,
      kind: nextOn ? "save" : "remove",
      mediaKind:
        item.kind === "video" || item.kind === "gif" ? item.kind : "image",
      publicId: item.gelbooruId?.trim() || item.id.replace(/^gb-/, ""),
      detail: item.tags?.trim()
        ? item.tags.trim().length > 72
          ? `${item.tags.trim().slice(0, 72).trim()}…`
          : item.tags.trim()
        : undefined,
      run: async (report) => {
        try {
          if (nextOn) {
            await addFavoriteFromItem(
              item,
              await blobForFavoriteSave(item, report),
            );
          } else {
            await removeFavoriteForItem(item);
          }
        } catch (err) {
          setSavedIds((prev) => {
            const next = new Set(prev);
            if (nextOn) next.delete(item.id);
            else next.add(item.id);
            return next;
          });
          throw err;
        }
      },
    });
  }

  function enqueueListCache(list: GelbooruPlayList) {
    const pending = list.items.filter(
      (item) =>
        !gelbooruItemOnShelf(item, savedIds) &&
        !isMediaCached(item.id) &&
        !favSave.isBusy(listDownloadJobId(item.id)),
    );
    if (pending.length === 0) return;
    favSave.enqueueMany(
      pending.map((item) => ({
        id: listDownloadJobId(item.id),
        kind: "cache" as const,
        mediaKind:
          item.kind === "video" || item.kind === "gif" ? item.kind : "image",
        publicId: item.gelbooruId?.trim() || item.id.replace(/^gb-/, ""),
        detail: item.tags?.trim()
          ? item.tags.trim().length > 72
            ? `${item.tags.trim().slice(0, 72).trim()}…`
            : item.tags.trim()
          : undefined,
        group: { id: list.id, label: list.name },
        run: async (report) => {
          await ensureMediaCached(item, report);
        },
      })),
    );
  }

  function enqueueListSave(list: GelbooruPlayList) {
    const pending = gelbooruListUnsavedItems(list, savedIds, favSave.busyIds);
    if (pending.length === 0) return;
    setSavedIds((prev) => {
      const next = new Set(prev);
      for (const item of pending) next.add(item.id);
      return next;
    });
    favSave.enqueueMany(
      pending.map((item) => ({
        id: item.id,
        kind: "save" as const,
        mediaKind:
          item.kind === "video" || item.kind === "gif" ? item.kind : "image",
        publicId: item.gelbooruId?.trim() || item.id.replace(/^gb-/, ""),
        detail: item.tags?.trim()
          ? item.tags.trim().length > 72
            ? `${item.tags.trim().slice(0, 72).trim()}…`
            : item.tags.trim()
          : undefined,
        group: { id: `${list.id}:shelf`, label: `${list.name} · полка` },
        run: async (report) => {
          try {
            await addFavoriteFromItem(
              item,
              await blobForFavoriteSave(item, report),
            );
          } catch (err) {
            setSavedIds((prev) => {
              const next = new Set(prev);
              next.delete(item.id);
              return next;
            });
            throw err;
          }
        },
      })),
    );
  }

  const emptyHint = useMemo(() => {
    if (tab === "search" && !committed.trim()) {
      return "Введи теги Gelbooru и нажми Enter.";
    }
    if (tab === "recs") return "Нет постов по связке вкуса.";
    return "Нет постов. Проверь теги в Настройках → Медиа.";
  }, [committed, tab]);

  const listedIds = useMemo(() => listedGelbooruIds(lists), [lists]);

  async function handleCreateList(name: string) {
    await createGelbooruList(name);
    await refreshLists();
  }

  function openFoundPack(
    pool: MediaItem[],
    opts?: { heading?: string; packExact?: boolean },
  ) {
    const first = pool[0];
    if (!first) return;
    setListTarget({
      item: first,
      pool,
      heading:
        opts?.heading ??
        (opts?.packExact ? `${pool.length} выбранных` : "Найденное"),
      packExact: opts?.packExact,
    });
  }

  function packFromFeed(pool: MediaItem[], feedHeading?: string) {
    if (selectedItems.length > 0) {
      openFoundPack(selectedItems, {
        packExact: true,
        heading: `${selectedItems.length} выбранных`,
      });
      return;
    }
    openFoundPack(pool, feedHeading ? { heading: feedHeading } : undefined);
  }

  async function handleCreatePackedList(name: string, pack?: MediaItem[]) {
    const created = await createGelbooruList(name);
    const rows =
      pack && pack.length > 0
        ? pack
        : listTarget
          ? [listTarget.item]
          : [];
    if (rows.length > 0) await addManyToGelbooruList(created.id, rows);
    await refreshLists();
  }

  async function handleAssemble(size: MediaQueueSize) {
    setAssembleBusy(true);
    setAssembleError(null);
    try {
      const list = await assembleGelbooruMistressList(size);
      await refreshLists();
      setOpenListId(list.id);
    } catch (err) {
      setAssembleError(
        err instanceof Error ? err.message : "Не удалось собрать очередь",
      );
    } finally {
      setAssembleBusy(false);
    }
  }

  const selectedIds = useMemo(
    () => new Set(selectedItems.map((item) => item.id)),
    [selectedItems],
  );
  const packTitle =
    selectedItems.length > 0
      ? `В список: ${selectedItems.length} выбранных`
      : "В список из найденного";
  const packDisabled =
    selectedItems.length === 0 && items.length === 0;
  const picker = listTarget ? (
    <GelbooruListPicker
      item={listTarget.item}
      pool={listTarget.pool}
      heading={listTarget.heading}
      packExact={listTarget.packExact}
      lists={lists}
      onClose={() => setListTarget(null)}
      onToggle={async (listId) => {
        await toggleInGelbooruList(listId, listTarget.item);
        await refreshLists();
      }}
      onPack={async (listId, pack) => {
        await addManyToGelbooruList(listId, pack);
        if (listTarget.packExact) setSelectedItems([]);
        await refreshLists();
      }}
      onCreate={(name, pack) =>
        handleCreatePackedList(name, pack).then(() => {
          if (listTarget.packExact) setSelectedItems([]);
        })
      }
    />
  ) : null;

  if (tab === "lists") {
    return (
      <div className="gelbooru-hub is-lists">
        <GelbooruLists
          lists={lists}
          openListId={openListId}
          savedIds={savedIds}
          listedIds={listedIds}
          busyIds={favSave.busyIds}
          assembleBusy={assembleBusy}
          assembleError={assembleError ?? reading.assembleError}
          keyed={keyed}
          queueSize={queueSize}
          onQueueSize={setQueueSize}
          onOpenList={setOpenListId}
          onCreate={handleCreateList}
          onRename={(id, name) => {
            void renameGelbooruList(id, name).then(() => refreshLists());
          }}
          onNote={(id, note) => {
            void setGelbooruListNote(id, note).then(() => refreshLists());
          }}
          onDelete={(id) => {
            void deleteGelbooruList(id).then(() => {
              if (openListId === id) setOpenListId(null);
              return refreshLists();
            });
          }}
          onRemoveItem={(listId, itemId) => {
            void removeFromGelbooruList(listId, itemId).then(() =>
              refreshLists(),
            );
          }}
          onMoveItem={(listId, from, to) => {
            void moveInGelbooruList(listId, from, to).then(() => refreshLists());
          }}
          onToggleSave={(item) => void toggleSave(item)}
          onDownloadList={(listId) => {
            const list = lists.find((row) => row.id === listId);
            if (list) enqueueListCache(list);
          }}
          onSaveList={(listId) => {
            const list = lists.find((row) => row.id === listId);
            if (list) enqueueListSave(list);
          }}
          onOpenLists={(item) => setListTarget({ item, pool: null })}
          onAssemble={(size) => void handleAssemble(size)}
          onPlaySession={(listId) => {
            const list = lists.find((row) => row.id === listId);
            if (list && list.items.length > 0) onPlayPlaylist?.(list.items, list.id);
          }}
          onStartRun={reading.requestStartRun}
          onCursor={(listId, index) => {
            void setGelbooruListCursor(listId, index).then(() => refreshLists());
          }}
          listPlay={listPlay}
          runHud={
            reading.run &&
            reading.runLive &&
            reading.hudHandlers &&
            reading.run.listId === openListId ? (
              <DoujinReadingRunHud
                run={reading.run}
                now={reading.nowMs}
                otherLists={reading.otherLists}
                {...reading.hudHandlers}
              />
            ) : null
          }
          onRunNote={reading.notePost}
          onRunHitEnd={reading.runLive ? reading.hitListEnd : undefined}
          onRunRequestClose={
            reading.runLive ? (close) => reading.requestLeave(close) : undefined
          }
        />
        {picker}
        {reading.startPromptList ? (
          <DoujinReadingRunPrompt
            kind="start"
            onStartFresh={() =>
              reading.startRunFromPrompt(reading.startPromptList!.id, true)
            }
            onContinue={() =>
              reading.startRunFromPrompt(reading.startPromptList!.id, false)
            }
            onCancel={() => reading.cancelPrompt()}
          />
        ) : null}
        {reading.runPrompt?.kind === "leave" ? (
          <DoujinReadingRunPrompt
            kind="leave"
            onStay={reading.stayInRun}
            onLeave={reading.leaveRun}
          />
        ) : null}
      </div>
    );
  }

  if (tab === "library") {
    return (
      <div className="gelbooru-hub">
        <FavoritesPage
          embedded
          onNavigate={onNavigate}
          unlocks={unlocks}
          onFavoritesChanged={onFavoritesChanged}
          listedIds={listedIds}
          selectedIds={selectedIds}
          onToggleSelect={(item) =>
            setSelectedItems((prev) => toggleSelectedById(prev, item))
          }
          onClearSelection={() => setSelectedItems([])}
          onOpenLists={(item) => setListTarget({ item, pool: null })}
          onPackFound={(pool) => packFromFeed(pool, "Избранное")}
          onOpenSearch={
            onTabChange
              ? (query, kind) => {
                  setSearch(query);
                  setCommitted(query);
                  setKindFilter(kind);
                  onTabChange("search");
                }
              : undefined
          }
        />
        {picker}
      </div>
    );
  }

  if (!keyed) {
    return (
      <div className="gelbooru-hub">
        <div className="doujin-empty">
          <p className="muted">
            Нужны Gelbooru user_id и api_key. Вставь их в Настройках → Медиа.
          </p>
          <button
            type="button"
            className="btn-primary"
            onClick={() => onNavigate?.("settings")}
          >
            К настройкам
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="gelbooru-hub">
      {tab === "search" ? (
        <HubSearchDock peek={search}>
        <form
          className="gelbooru-hub__search"
          onSubmit={(e) => {
            e.preventDefault();
            setCommitted(search.trim());
          }}
        >
          <div className="gelbooru-hub__search-field">
            <BooruTagInput
              value={search}
              onChange={setSearch}
              placeholder="Теги Gelbooru — как в сессии"
              ariaLabel="Поиск Gelbooru"
              unlocks={unlocks}
            />
            <MediaKindFilter value={kindFilter} onChange={setKindFilter} />
          </div>
          <button
            type="button"
            className="gelbooru-hub__icon-btn is-list"
            disabled={packDisabled}
            title={packTitle}
            aria-label={packTitle}
            onClick={() => packFromFeed(items)}
          >
            <BookmarkIcon filled={false} />
          </button>
          <button
            type="submit"
            className="gelbooru-hub__icon-btn"
            title="Искать"
            aria-label="Искать"
          >
            <SearchIcon />
          </button>
        </form>
        </HubSearchDock>
      ) : null}
      {tab === "recs"
        ? createPortal(
            <div className="gelbooru-hub__recs-overlay">
              <div className="gelbooru-hub__recs">
                <div className="gelbooru-hub__recs-copy">
                  <span className="gelbooru-hub__recs-kicker">Связка вкуса</span>
                  <p className="gelbooru-hub__recs-line">
                    {recsHint ?? "полка избранного"}
                  </p>
                </div>
                <div className="gelbooru-hub__recs-tools">
                  <MediaKindFilter value={kindFilter} onChange={setKindFilter} />
                  <button
                    type="button"
                    className="gelbooru-hub__icon-btn is-list"
                    disabled={packDisabled}
                    title={packTitle}
                    aria-label={packTitle}
                    onClick={() => packFromFeed(items)}
                  >
                    <BookmarkIcon filled={false} />
                  </button>
                  <button
                    type="button"
                    className="gelbooru-hub__icon-btn"
                    disabled={loading}
                    title="Обновить связку"
                    aria-label="Обновить"
                    onClick={() => setRecsTick((n) => n + 1)}
                  >
                    <RefreshIcon />
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
      {error ? <p className="doujin-error">{error}</p> : null}
      <GelbooruFeed
        items={items}
        loading={loading}
        hasMore={hasMore}
        savedIds={savedIds}
        listedIds={listedIds}
        emptyHint={emptyHint}
        onLoadMore={onLoadMore}
        onToggleSave={(item) => void toggleSave(item)}
        onOpenLists={(item) => setListTarget({ item, pool: null })}
        selectedIds={selectedIds}
        onToggleSelect={(item) =>
          setSelectedItems((prev) => toggleSelectedById(prev, item))
        }
        busyIds={favSave.busyIds}
      />
      {tab === "newest" ? (
        <DoujinPager
          layout="tools"
          page={1}
          numPages={1}
          onPage={() => undefined}
          onPackFound={() => packFromFeed(items)}
          packDisabled={packDisabled}
          packTitle={packTitle}
        />
      ) : null}
      {picker}
    </div>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden>
      <circle
        cx="7"
        cy="7"
        r="4.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.45"
      />
      <path
        d="m10.2 10.2 3 3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.45"
        strokeLinecap="round"
      />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden>
      <path
        d="M13.2 8a5.2 5.2 0 1 1-1.45-3.55"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.45"
        strokeLinecap="round"
      />
      <path
        d="M13.2 3.4v3.1h-3.1"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.45"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
