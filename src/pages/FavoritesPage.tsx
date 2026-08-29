import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  BookmarkIcon,
  CardSelectButton,
  FavLightbox,
} from "../components/FavLightbox";
import { FavMasonryMedia } from "../components/FavMasonryMedia";
import { FavTagChip } from "../components/FavTagChip";
import { MediaKindFilter } from "../components/MediaKindFilter";
import type { NavId } from "../components/SideNav";
import { TastePassportPanel } from "../components/TastePassportPanel";
import { TagTypePickerModal } from "../components/TagTypePickerModal";
import { gelbooruQueryFromFavoriteFilters } from "../lib/contentHub";
import {
  tagPurchaseStatus,
  type ContentUnlockLists,
} from "../lib/contentUnlocks";
import { buildFavoriteTasteProfile } from "../lib/favoriteTagTaste";
import type { MediaItem } from "../lib/media";
import {
  collectFavoriteTagStats,
  ensureFavoriteWallThumbs,
  favoriteRecordToListItem,
  favoriteRecordToMedia,
  filterFavoriteMetadata,
  listFavoriteMetadata,
  listFavoriteRecordsByIds,
  removeFavorite,
  revokeFavoriteMedia,
  type FavoriteKindFilter,
  type FavoriteMetadata,
  type FavoriteRecord,
} from "../lib/mediaFavorites";
import {
  lightboxCanGoNext,
  lightboxShouldPrefetch,
} from "../lib/lightboxPrefetch";
import { setShopFocusTag } from "../lib/shopFocus";
import {
  getTagType,
  groupTagsByType,
  loadTagTypeMap,
  setTagType,
  setTagTypesBulk,
  type TagTypeId,
  type TagTypeMap,
} from "../lib/tagTypes";
import {
  buildTastePassportView,
  favoritesShelfLoadedRu,
  favoritesTasteLoopCtas,
} from "../lib/tasteLoopDisplay";
import { playUiClick, playUiConfirm, primeUiAudio } from "../lib/uiSound";
import { emptyWallet } from "../lib/wallet";
import { splitIntoColumns, useFavColumnCount } from "./content/favWallLayout";

interface FavoritesPageProps {
  /** Called after add/remove so App can refresh counts / playlist */
  onFavoritesChanged: () => void;
  onNavigate?: (id: NavId) => void;
  unlocks?: ContentUnlockLists;
  /** Hide the standalone h1 when nested under Content chrome. */
  embedded?: boolean;
  listedIds?: Set<string>;
  selectedIds?: ReadonlySet<string>;
  onToggleSelect?: (item: MediaItem) => void;
  onClearSelection?: () => void;
  onOpenLists?: (item: MediaItem) => void;
  onPackFound?: (pool: MediaItem[]) => void;
  onOpenSearch?: (query: string, kind: FavoriteKindFilter) => void;
}

type FavView = {
  record: FavoriteRecord;
  item: MediaItem;
};

const TAG_CHIP_LIMIT = 48;
const FAVORITES_PAGE_SIZE = 36;

/** Detach media pipeline when leaving a slide so audio cannot keep playing. */
function disposeVideoElement(video: HTMLVideoElement | null | undefined): void {
  if (!video) return;
  try {
    video.pause();
    video.removeAttribute("src");
    video.load();
  } catch {
    // ignore
  }
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

function TrashIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden>
      <path
        d="M3.2 4.3h9.6M6.2 4.3V3.2h3.6v1.1M5.1 6.1v6.1M8 6.1v6.1M10.9 6.1v6.1M4.3 4.3l.65 8.3c.06.55.5.95 1.05.95h4c.55 0 1-.4 1.05-.95l.65-8.3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function pickForFavorite(record: FavoriteRecord, item: MediaItem): MediaItem {
  return (
    favoriteRecordToListItem(record) ?? {
      id: record.id,
      url: item.url,
      kind: item.kind,
      source: item.source,
      tags: record.tags,
      gelbooruId: record.gelbooruId,
    }
  );
}

function favoriteIsSelected(
  record: FavoriteRecord,
  selectedIds: ReadonlySet<string> | undefined,
): boolean {
  if (!selectedIds || selectedIds.size === 0) return false;
  const listed = favoriteRecordToListItem(record);
  return selectedIds.has(listed?.id ?? record.id) || selectedIds.has(record.id);
}

export function FavoritesPage({
  onFavoritesChanged,
  onNavigate,
  unlocks = { ...emptyWallet().unlocks, pendingShopTags: [] },
  embedded = false,
  listedIds,
  selectedIds,
  onToggleSelect,
  onClearSelection,
  onOpenLists,
  onPackFound,
  onOpenSearch,
}: FavoritesPageProps) {
  const [views, setViews] = useState<FavView[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [kindFilter, setKindFilter] = useState<FavoriteKindFilter>("all");
  const [favoriteMetadata, setFavoriteMetadata] = useState<FavoriteMetadata[]>([]);
  const [enterIds, setEnterIds] = useState<string[]>([]);
  const [showAllTags, setShowAllTags] = useState(false);
  const [tagsExpanded, setTagsExpanded] = useState(false);
  const [editTag, setEditTag] = useState<string | null>(null);
  const [bulkTypeOpen, setBulkTypeOpen] = useState(false);
  const [tagTypeMap, setTagTypeMap] = useState<TagTypeMap>(() =>
    loadTagTypeMap(),
  );
  const viewerVideoRef = useRef<HTMLVideoElement | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const wantNextRef = useRef(false);
  const loadingRef = useRef(false);
  const loadGenRef = useRef(0);
  const viewsRef = useRef<FavView[]>([]);
  viewsRef.current = views;

  const tagStats = useMemo(
    () => collectFavoriteTagStats(favoriteMetadata),
    [favoriteMetadata],
  );

  const tastePassport = useMemo(() => {
    const profile = buildFavoriteTasteProfile(favoriteMetadata);
    const view = buildTastePassportView(profile, { topN: 6 });
    const ctas = favoritesTasteLoopCtas({
      likeCount: favoriteMetadata.length,
      hasTasteTags: view.hasTaste,
    });
    return { view, ctas };
  }, [favoriteMetadata]);

  const selectedTagSet = useMemo(
    () => new Set(selectedTags.map((t) => t.toLowerCase())),
    [selectedTags],
  );

  /** Tag chips: keep mouse-selected tags; hide unselected that don't match search letters. */
  const filteredTagStats = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return tagStats;
    const parts = q.split(/\s+/).filter(Boolean);
    return tagStats.filter(({ tag }) => {
      const lower = tag.toLowerCase();
      if (selectedTagSet.has(lower)) return true;
      return parts.some((p) => lower.includes(p));
    });
  }, [tagStats, search, selectedTagSet]);

  const visibleTags = useMemo(() => {
    // While searching, show every match + selected (don't clip).
    if (showAllTags || search.trim()) return filteredTagStats;
    return filteredTagStats.slice(0, TAG_CHIP_LIMIT);
  }, [filteredTagStats, showAllTags, search]);

  const tagGroups = useMemo(
    () => groupTagsByType(visibleTags, tagTypeMap),
    [visibleTags, tagTypeMap],
  );

  useEffect(() => {
    const onFocus = () => setTagTypeMap(loadTagTypeMap());
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  const matchedMetadata = useMemo(
    () =>
      filterFavoriteMetadata(favoriteMetadata, {
        selectedTags,
        search,
        kind: kindFilter,
      }),
    [favoriteMetadata, selectedTags, search, kindFilter],
  );

  const matchedIds = useMemo(
    () => matchedMetadata.map((row) => row.id),
    [matchedMetadata],
  );
  const matchedIdsRef = useRef<string[]>([]);
  matchedIdsRef.current = matchedIds;

  const filtered = views;
  const hasActiveFilter =
    kindFilter !== "all" || selectedTags.length > 0 || Boolean(search.trim());
  const columnCount = useFavColumnCount();
  const masonryColumns = useMemo(
    () => splitIntoColumns(filtered, columnCount),
    [filtered, columnCount],
  );
  const searchQuery = useMemo(
    () =>
      gelbooruQueryFromFavoriteFilters({
        selectedTags,
        search,
      }),
    [selectedTags, search],
  );
  const listPool = useMemo(() => {
    if (!onPackFound) return [];
    const out: MediaItem[] = [];
    for (const view of views) {
      const row = favoriteRecordToListItem(view.record);
      if (row) out.push(row);
    }
    return out;
  }, [onPackFound, views]);
  const selectedCount = selectedIds?.size ?? 0;
  const packTitle =
    selectedCount > 0
      ? `В список: ${selectedCount} выбранных`
      : "В список из найденного";
  const packDisabled = selectedCount === 0 && listPool.length === 0;
  const onClearSelectionRef = useRef(onClearSelection);
  onClearSelectionRef.current = onClearSelection;
  useEffect(() => {
    onClearSelectionRef.current?.();
  }, [kindFilter, search, selectedTags]);
  const enterIndexById = useMemo(() => {
    const map = new Map<string, number>();
    enterIds.forEach((id, index) => map.set(id, index));
    return map;
  }, [enterIds]);

  const viewerIndex = useMemo(
    () => (viewerId ? filtered.findIndex((v) => v.record.id === viewerId) : -1),
    [filtered, viewerId],
  );
  const viewer = viewerIndex >= 0 ? (filtered[viewerIndex] ?? null) : null;
  const hasMore = views.length < matchedIds.length;
  const canPrev = viewerIndex > 0;
  const canNext = lightboxCanGoNext(viewerIndex, filtered.length, hasMore);

  function revokeViews(list: FavView[]) {
    revokeFavoriteMedia(list.map((v) => v.item));
  }

  const loadPage = useCallback(async (reset = false): Promise<void> => {
    if (loadingRef.current && !reset) return;
    const gen = reset ? loadGenRef.current + 1 : loadGenRef.current;
    loadGenRef.current = gen;
    loadingRef.current = true;
    setLoading(true);
    setError(null);
    try {
      const ids = matchedIdsRef.current;
      const offset = reset ? 0 : viewsRef.current.length;
      if (!reset && offset >= ids.length) {
        return;
      }
      const pageIds = ids.slice(offset, offset + FAVORITES_PAGE_SIZE);
      const rows = await listFavoriteRecordsByIds(pageIds);
      const ready = await ensureFavoriteWallThumbs(rows);
      if (gen !== loadGenRef.current) {
        return;
      }
      const byId = new Map(ready.map((record) => [record.id, record]));
      const next: FavView[] = pageIds.flatMap((id) => {
        const record = byId.get(id);
        if (!record) return [];
        return [{ record, item: favoriteRecordToMedia(record) }];
      });
      if (gen !== loadGenRef.current) {
        revokeViews(next);
        return;
      }
      setEnterIds(next.map((view) => view.record.id));
      setViews((prev) => {
        if (reset) {
          revokeViews(prev);
          return next;
        }
        const have = new Set(prev.map((v) => v.record.id));
        return [...prev, ...next.filter((v) => !have.has(v.record.id))];
      });
    } catch (err) {
      if (gen !== loadGenRef.current) return;
      setError(
        err instanceof Error ? err.message : "Не удалось загрузить избранное",
      );
    } finally {
      if (gen === loadGenRef.current) {
        loadingRef.current = false;
        setLoading(false);
      }
    }
  }, []);

  const refreshFavoriteMetadata = useCallback(async (): Promise<void> => {
    setFavoriteMetadata(await listFavoriteMetadata());
  }, []);

  useEffect(() => {
    void refreshFavoriteMetadata();
  }, [refreshFavoriteMetadata]);

  useEffect(() => {
    void loadPage(true);
  }, [loadPage, kindFilter, search, selectedTags, favoriteMetadata]);

  useEffect(() => {
    const node = loadMoreRef.current;
    if (!node || views.length >= matchedIds.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void loadPage(false);
      },
      { rootMargin: "700px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [loadPage, matchedIds.length, views.length]);

  useEffect(() => {
    if (enterIds.length === 0) return;
    const ms = enterIds.length * 32 + 520;
    const timer = window.setTimeout(() => setEnterIds([]), ms);
    return () => window.clearTimeout(timer);
  }, [enterIds]);

  useEffect(() => {
    return () => {
      revokeViews(viewsRef.current);
    };
  }, []);

  const pendingDisposeRef = useRef<HTMLVideoElement | null>(null);

  const disposeViewerPlayback = useCallback(() => {
    disposeVideoElement(viewerVideoRef.current);
    disposeVideoElement(pendingDisposeRef.current);
    viewerVideoRef.current = null;
    pendingDisposeRef.current = null;
  }, []);

  /** Pause current video immediately; hard-dispose after React swaps the slide. */
  const leaveCurrentSlide = useCallback(() => {
    const leaving = viewerVideoRef.current;
    if (!leaving) return;
    try {
      leaving.pause();
      leaving.muted = true;
    } catch {
      // ignore
    }
    viewerVideoRef.current = null;
    pendingDisposeRef.current = leaving;
  }, []);

  const closeViewer = useCallback(() => {
    wantNextRef.current = false;
    disposeViewerPlayback();
    setViewerId(null);
  }, [disposeViewerPlayback]);

  const showPrev = useCallback(() => {
    if (viewerIndex <= 0) return;
    const prev = filtered[viewerIndex - 1];
    if (!prev) return;
    wantNextRef.current = false;
    leaveCurrentSlide();
    setViewerId(prev.record.id);
  }, [filtered, viewerIndex, leaveCurrentSlide]);

  const showNext = useCallback(() => {
    if (viewerIndex < 0) return;
    if (viewerIndex < filtered.length - 1) {
      const next = filtered[viewerIndex + 1];
      if (!next) return;
      wantNextRef.current = false;
      leaveCurrentSlide();
      setViewerId(next.record.id);
      return;
    }
    if (!hasMore) return;
    wantNextRef.current = true;
    void loadPage(false);
  }, [filtered, hasMore, leaveCurrentSlide, loadPage, viewerIndex]);

  useEffect(() => {
    if (loading) return;
    if (!lightboxShouldPrefetch(viewerIndex, filtered.length, hasMore)) return;
    void loadPage(false);
  }, [filtered.length, hasMore, loadPage, loading, viewerIndex]);

  useEffect(() => {
    if (!wantNextRef.current) return;
    if (viewerIndex < 0 || viewerIndex >= filtered.length - 1) return;
    const next = filtered[viewerIndex + 1];
    if (!next) return;
    wantNextRef.current = false;
    leaveCurrentSlide();
    setViewerId(next.record.id);
  }, [filtered, leaveCurrentSlide, viewerIndex]);

  useEffect(() => {
    if (!viewerId) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        closeViewer();
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        showPrev();
        return;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        showNext();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [viewerId, showPrev, showNext, closeViewer]);

  useEffect(() => {
    if (!viewerId) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [viewerId]);

  // Hard-dispose the previous video after the new slide is mounted.
  useEffect(() => {
    const doomed = pendingDisposeRef.current;
    pendingDisposeRef.current = null;
    if (doomed && doomed !== viewerVideoRef.current) {
      disposeVideoElement(doomed);
    }
  }, [viewerId]);

  // Autoplay when a video slide is shown.
  useEffect(() => {
    if (!viewerId || !viewer || viewer.item.kind !== "video") return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      const video = viewerVideoRef.current;
      if (!video) return;
      try {
        video.muted = false;
        if (video.currentTime > 0.05) video.currentTime = 0;
      } catch {
        // ignore
      }
      void video.play().catch(() => {
        // Autoplay with sound may be blocked — user can press play.
      });
    }, 50);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [viewerId, viewer]);

  useEffect(() => {
    if (viewerId && viewerIndex < 0) {
      disposeViewerPlayback();
      setViewerId(null);
    }
  }, [viewerId, viewerIndex, disposeViewerPlayback]);

  function toggleTag(tag: string) {
    setSelectedTags((prev) =>
      prev.some((t) => t.toLowerCase() === tag.toLowerCase())
        ? prev.filter((t) => t.toLowerCase() !== tag.toLowerCase())
        : [...prev, tag],
    );
  }

  async function handleDelete(id: string) {
    if (busyId || bulkBusy) return;
    setBusyId(id);
    try {
      const idx = filtered.findIndex((v) => v.record.id === id);
      const fallback =
        filtered[idx + 1] ?? filtered[idx - 1] ?? null;
      const view = viewsRef.current.find((row) => row.record.id === id);
      const pick = view ? pickForFavorite(view.record, view.item) : null;
      await removeFavorite(id);
      setViews((prev) => {
        const gone = prev.filter((v) => v.record.id === id);
        revokeViews(gone);
        return prev.filter((v) => v.record.id !== id);
      });
      await refreshFavoriteMetadata();
      if (view && pick && favoriteIsSelected(view.record, selectedIds)) {
        onToggleSelect?.(pick);
      }
      if (viewerId === id) {
        setViewerId(
          fallback && fallback.record.id !== id ? fallback.record.id : null,
        );
      }
      onFavoritesChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось удалить");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDeleteSelected() {
    if (selectedCount === 0 || bulkBusy || busyId) return;
    const targets = viewsRef.current.filter((view) =>
      favoriteIsSelected(view.record, selectedIds),
    );
    if (targets.length === 0) return;
    setBulkBusy(true);
    setError(null);
    const goneIds = new Set<string>();
    try {
      for (const view of targets) {
        await removeFavorite(view.record.id);
        goneIds.add(view.record.id);
      }
      setViews((prev) => {
        const gone = prev.filter((v) => goneIds.has(v.record.id));
        revokeViews(gone);
        return prev.filter((v) => !goneIds.has(v.record.id));
      });
      if (viewerId && goneIds.has(viewerId)) setViewerId(null);
      await refreshFavoriteMetadata();
      onClearSelection?.();
      onFavoritesChanged();
    } catch (err) {
      if (goneIds.size > 0) {
        setViews((prev) => {
          const gone = prev.filter((v) => goneIds.has(v.record.id));
          revokeViews(gone);
          return prev.filter((v) => !goneIds.has(v.record.id));
        });
        await refreshFavoriteMetadata();
        onClearSelection?.();
        onFavoritesChanged();
      }
      setError(err instanceof Error ? err.message : "Не удалось удалить");
    } finally {
      setBulkBusy(false);
    }
  }

  const listItem = viewer ? favoriteRecordToListItem(viewer.record) : null;
  const listed = Boolean(
    viewer &&
      (listedIds?.has(viewer.record.id) ||
        (viewer.record.gelbooruId &&
          listedIds?.has(`gb-${viewer.record.gelbooruId}`))),
  );

  return (
    <div className={"favorites-page" + (embedded ? " is-embedded" : "")}>
      {embedded ? null : (
        <header className="favorites-page__head">
          <h1 className="favorites-page__title">Избранное</h1>
        </header>
      )}

      <TastePassportPanel
        view={tastePassport.view}
        ctas={onNavigate ? tastePassport.ctas : []}
        onNavigate={onNavigate}
        shelfLoadedLabel={
          matchedIds.length > 0
            ? favoritesShelfLoadedRu(views.length, matchedIds.length)
            : undefined
        }
      />

      {favoriteMetadata.length > 0 ? (
        <div className="favorites-page__filters">
            <div className="favorites-page__search-row">
            <MediaKindFilter
              value={kindFilter}
              onChange={setKindFilter}
            />
            <input
              className="favorites-page__search"
              type="search"
              placeholder="Поиск по тегам…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Поиск по тегам"
            />
            {onPackFound ? (
              <button
                type="button"
                className="favorites-page__pack"
                disabled={packDisabled || bulkBusy}
                title={packTitle}
                aria-label={packTitle}
                onClick={() => onPackFound(listPool)}
              >
                <BookmarkIcon filled={false} />
              </button>
            ) : null}
            {onToggleSelect ? (
              <button
                type="button"
                className="favorites-page__pack"
                disabled={selectedCount === 0 || bulkBusy}
                title={
                  selectedCount > 0
                    ? `Удалить выбранные: ${selectedCount}`
                    : "Удалить выбранные"
                }
                aria-label={
                  selectedCount > 0
                    ? `Удалить выбранные: ${selectedCount}`
                    : "Удалить выбранные"
                }
                onClick={() => void handleDeleteSelected()}
              >
                <TrashIcon />
              </button>
            ) : null}
            {onOpenSearch ? (
              <button
                type="button"
                className="favorites-page__pack"
                disabled={!searchQuery}
                title="Искать в облаке gelbooru"
                aria-label="Искать в облаке gelbooru"
                onClick={() => onOpenSearch(searchQuery, kindFilter)}
              >
                <SearchIcon />
              </button>
            ) : null}
            {tagStats.length > 0 ? (
              <button
                type="button"
                className="favorites-page__tags-toggle"
                aria-expanded={tagsExpanded}
                onClick={() => {
                  void primeUiAudio();
                  playUiClick();
                  setTagsExpanded((v) => !v);
                }}
              >
                {tagsExpanded ? "Свернуть" : "Развернуть"}
                <span className="favorites-page__tags-toggle-arrow" aria-hidden>
                  {tagsExpanded ? "▴" : "▾"}
                </span>
              </button>
            ) : null}
            {hasActiveFilter ? (
              <button
                type="button"
                className="favorites-page__clear"
                onClick={() => {
                  setSelectedTags([]);
                  setSearch("");
                  setKindFilter("all");
                }}
              >
                Сбросить фильтр
              </button>
            ) : null}
          </div>
          {tagStats.length > 0 && tagsExpanded ? (
            <div className="favorites-page__tag-groups" aria-label="Теги по типам">
              {tagGroups.length === 0 ? (
                <p className="favorites-page__tags-empty">Нет тегов по запросу.</p>
              ) : null}
              {tagGroups.map((group) => (
                <section key={group.type} className="tag-type-section">
                  <header className="tag-type-section__head">
                    <h3 className="tag-type-section__title">{group.meta.nameRu}</h3>
                    <p className="tag-type-section__desc">
                      {group.meta.descriptionRu}
                    </p>
                  </header>
                  <div
                    className="favorites-page__tags"
                    role="group"
                    aria-label={group.meta.nameRu}
                  >
                    {group.items.map(({ tag, count }) => {
                      const active = selectedTags.some(
                        (t) => t.toLowerCase() === tag.toLowerCase(),
                      );
                      return (
                        <FavTagChip
                          key={tag}
                          tag={tag}
                          count={count}
                          active={active}
                          purchase={tagPurchaseStatus(tag, unlocks)}
                          onToggle={() => toggleTag(tag)}
                          onEdit={() => {
                            void primeUiAudio();
                            playUiClick();
                            setEditTag(tag);
                          }}
                          onBuy={() => {
                            void primeUiAudio();
                            playUiClick();
                            setShopFocusTag(tag);
                            onNavigate?.("shop");
                          }}
                        />
                      );
                    })}
                  </div>
                </section>
              ))}
              {!search.trim() && tagStats.length > TAG_CHIP_LIMIT ? (
                <button
                  type="button"
                  className="fav-tag fav-tag--more"
                  onClick={() => setShowAllTags((v) => !v)}
                >
                  {showAllTags
                    ? "Свернуть список"
                    : `Ещё ${tagStats.length - TAG_CHIP_LIMIT}`}
                </button>
              ) : null}
            </div>
          ) : tagStats.length === 0 ? (
            <p className="favorites-page__tags-empty">
              Теги появятся у новых лайков (у старых могли сохраниться только
              строка поиска).
            </p>
          ) : null}
        </div>
      ) : null}

      {error ? <p className="favorites-page__err">{error}</p> : null}

      {loading && views.length === 0 && favoriteMetadata.length === 0 ? (
        <p className="favorites-page__empty">Загрузка…</p>
      ) : favoriteMetadata.length === 0 ? (
        <div className="favorites-page__empty">
          <p>Пока пусто</p>
          <p className="favorites-page__hint">
            На сессии с Gelbooru жми Like — файлы появятся здесь каскадом, а вкус
            начнёт смещать рулетку и магазин.
          </p>
        </div>
      ) : matchedIds.length === 0 ? (
        <div className="favorites-page__empty">
          <p>Ничего не найдено</p>
          <p className="favorites-page__hint">
            Сними теги или измени поиск.
          </p>
        </div>
      ) : loading && views.length === 0 ? (
        <p className="favorites-page__empty">Загрузка…</p>
      ) : (
        <div className="fav-masonry-wrap">
          <div className="fav-masonry">
            {masonryColumns.map((column, colIndex) => (
              <div key={colIndex} className="fav-masonry__col">
                {column.map(({ record, item }) => {
                  const enterI = enterIndexById.get(record.id);
                  const listItem = onOpenLists
                    ? favoriteRecordToListItem(record)
                    : null;
                  const listed = Boolean(
                    listItem &&
                      (listedIds?.has(listItem.id) ||
                        listedIds?.has(record.id) ||
                        (record.gelbooruId &&
                          listedIds?.has(`gb-${record.gelbooruId}`))),
                  );
                  const chosen = favoriteIsSelected(record, selectedIds);
                  const pick = pickForFavorite(record, item);
                  return (
                  <article
                    key={record.id}
                    className={
                      "fav-masonry__card" +
                      (enterI != null ? " is-enter" : "") +
                      (chosen ? " is-selected" : "")
                    }
                    style={
                      enterI != null
                        ? ({ "--fav-enter-i": enterI } as CSSProperties)
                        : undefined
                    }
                  >
                    <button
                      type="button"
                      className="fav-masonry__open"
                      onClick={() => setViewerId(record.id)}
                      title="Открыть на весь экран"
                      aria-label="Открыть на весь экран"
                    >
                      <FavMasonryMedia item={item} />
                      <span className="fav-masonry__glow" aria-hidden />
                    </button>
                    {onToggleSelect || listItem ? (
                      <div className="doujin-card__actions">
                        {onToggleSelect ? (
                          <CardSelectButton
                            selected={chosen}
                            onClick={() => onToggleSelect(pick)}
                          />
                        ) : null}
                        {listItem ? (
                          <button
                            type="button"
                            className={
                              "doujin-card__list" + (listed ? " is-on" : "")
                            }
                            aria-pressed={listed}
                            title={listed ? "В списках" : "Добавить в список"}
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpenLists?.(listItem);
                            }}
                          >
                            <BookmarkIcon filled={listed} />
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                    <div className="fav-masonry__bar">
                      <span className="fav-masonry__kind">
                        {item.kind === "video"
                          ? "видео"
                          : item.kind === "gif"
                            ? "gif"
                            : "фото"}
                        {record.gelbooruId ? ` · #${record.gelbooruId}` : ""}
                      </span>
                      <button
                        type="button"
                        className="fav-masonry__del"
                        disabled={busyId === record.id || bulkBusy}
                        title="Удалить из избранного"
                        onClick={() => void handleDelete(record.id)}
                      >
                        {busyId === record.id || bulkBusy ? "…" : "Удалить"}
                      </button>
                    </div>
                  </article>
                  );
                })}
              </div>
            ))}
          </div>
          {views.length < matchedIds.length ? (
            <div ref={loadMoreRef} className="fav-masonry__sentinel">
              {loading
                ? "Подгружаю…"
                : `Показано ${views.length} из ${matchedIds.length}`}
            </div>
          ) : (
            <div className="fav-masonry__count">
              {matchedIds.length > 0
                ? `Все ${matchedIds.length} загружены`
                : ""}
            </div>
          )}
        </div>
      )}

      {selectedTags.length > 0 && !viewer ? (
        <button
          type="button"
          className="favorites-page__bulk-type"
          onClick={() => {
            void primeUiAudio();
            playUiClick();
            setBulkTypeOpen(true);
          }}
        >
          Настроить выбранные
          <span className="favorites-page__bulk-type-n">
            {selectedTags.length}
          </span>
        </button>
      ) : null}

      {editTag ? (
        <TagTypePickerModal
          tag={editTag}
          initialType={getTagType(editTag, tagTypeMap)}
          titleRu="Настройки тега"
          confirmRu="Сохранить"
          onCancel={() => setEditTag(null)}
          onConfirm={(type: TagTypeId) => {
            setTagTypeMap(setTagType(editTag, type));
            setEditTag(null);
          }}
        />
      ) : null}

      {bulkTypeOpen && selectedTags.length > 0 ? (
        <TagTypePickerModal
          tag={selectedTags.join(" ")}
          labelRu={`${selectedTags.length} тег(ов)`}
          detailRu={
            selectedTags.length <= 8
              ? selectedTags.join(" · ")
              : `${selectedTags.slice(0, 8).join(" · ")} · ещё ${
                  selectedTags.length - 8
                }`
          }
          initialType={getTagType(selectedTags[0]!, tagTypeMap)}
          titleRu="Тип для выбранных"
          confirmRu="Применить ко всем"
          onCancel={() => setBulkTypeOpen(false)}
          onConfirm={(type: TagTypeId) => {
            void primeUiAudio();
            playUiConfirm();
            setTagTypeMap(
              setTagTypesBulk(
                selectedTags.map((tag) => ({ tag, type })),
              ),
            );
            setSelectedTags([]);
            setBulkTypeOpen(false);
          }}
        />
      ) : null}

      {viewer ? (
        <FavLightbox
          item={viewer.item}
          videoRef={viewerVideoRef}
          label="Просмотр избранного"
          canPrev={canPrev}
          canNext={canNext}
          saved
          listed={listed}
          saveBusy={busyId === viewer.record.id || bulkBusy}
          counter={
            filtered.length > 1
              ? `${viewerIndex + 1} / ${filtered.length}${hasMore ? "+" : ""}`
              : null
          }
          onClose={closeViewer}
          onPrev={showPrev}
          onNext={showNext}
          onToggleSave={() => void handleDelete(viewer.record.id)}
          onOpenLists={
            onOpenLists && listItem
              ? () => onOpenLists(listItem)
              : undefined
          }
        />
      ) : null}
    </div>
  );
}
