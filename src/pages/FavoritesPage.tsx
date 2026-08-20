import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { FavMasonryMedia } from "../components/FavMasonryMedia";
import { FavTagChip } from "../components/FavTagChip";
import type { NavId } from "../components/SideNav";
import { TastePassportPanel } from "../components/TastePassportPanel";
import { TagTypePickerModal } from "../components/TagTypePickerModal";
import {
  tagPurchaseStatus,
  type ContentUnlockLists,
} from "../lib/contentUnlocks";
import { buildFavoriteTasteProfile } from "../lib/favoriteTagTaste";
import type { MediaItem } from "../lib/media";
import {
  collectFavoriteTagStats,
  filterFavoriteMetadata,
  listFavoriteMetadata,
  listFavoriteRecordsByIds,
  removeFavorite,
  revokeFavoriteMedia,
  type FavoriteKindFilter,
  type FavoriteMetadata,
  type FavoriteRecord,
} from "../lib/mediaFavorites";
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
  favoritesTasteLoopCtas,
} from "../lib/tasteLoopDisplay";
import { playUiClick, playUiConfirm, primeUiAudio } from "../lib/uiSound";
import { emptyWallet } from "../lib/wallet";

interface FavoritesPageProps {
  /** Called after add/remove so App can refresh counts / playlist */
  onFavoritesChanged: () => void;
  onNavigate?: (id: NavId) => void;
  unlocks?: ContentUnlockLists;
}

type FavView = {
  record: FavoriteRecord;
  item: MediaItem;
};

const TAG_CHIP_LIMIT = 48;
const FAVORITES_PAGE_SIZE = 36;

function favColumnCountForWidth(width: number): number {
  if (width <= 700) return 1;
  if (width <= 1100) return 2;
  return 3;
}

/** Left-to-right, then down: 1 2 3 / 4 5 6, packed in columns so heights don't leave holes. */
function splitIntoColumns<T>(items: T[], columnCount: number): T[][] {
  const count = Math.max(1, columnCount);
  const cols: T[][] = Array.from({ length: count }, () => []);
  items.forEach((item, index) => {
    cols[index % count]!.push(item);
  });
  return cols;
}

function useFavColumnCount(): number {
  const [count, setCount] = useState(() =>
    favColumnCountForWidth(window.innerWidth),
  );
  useEffect(() => {
    function onResize() {
      setCount(favColumnCountForWidth(window.innerWidth));
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return count;
}

function isFullscreenActive(): boolean {
  return Boolean(document.fullscreenElement);
}

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

export function FavoritesPage({
  onFavoritesChanged,
  onNavigate,
  unlocks = { ...emptyWallet().unlocks, pendingShopTags: [] },
}: FavoritesPageProps) {
  const [views, setViews] = useState<FavView[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
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
  const [isFs, setIsFs] = useState(false);
  const [tagTypeMap, setTagTypeMap] = useState<TagTypeMap>(() =>
    loadTagTypeMap(),
  );
  const lightboxRef = useRef<HTMLDivElement | null>(null);
  const viewerVideoRef = useRef<HTMLVideoElement | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
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
  const canPrev = viewerIndex > 0;
  const canNext = viewerIndex >= 0 && viewerIndex < filtered.length - 1;

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
      const byId = new Map(rows.map((record) => [record.id, record]));
      const next: FavView[] = pageIds.flatMap((id) => {
        const record = byId.get(id);
        if (!record) return [];
        return [
          {
            record,
            item: {
              id: record.id,
              url: URL.createObjectURL(record.blob),
              kind: record.kind,
              source: "favorites" as const,
              tags: record.tags,
              gelbooruId: record.gelbooruId,
            },
          },
        ];
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

  async function reload(): Promise<void> {
    await Promise.all([loadPage(true), refreshFavoriteMetadata()]);
  }

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

  const closeViewer = useCallback(async () => {
    disposeViewerPlayback();
    if (isFullscreenActive()) {
      try {
        await document.exitFullscreen();
      } catch {
        // ignore
      }
    }
    setViewerId(null);
  }, [disposeViewerPlayback]);

  const showPrev = useCallback(() => {
    if (viewerIndex <= 0) return;
    const prev = filtered[viewerIndex - 1];
    if (!prev) return;
    leaveCurrentSlide();
    setViewerId(prev.record.id);
  }, [filtered, viewerIndex, leaveCurrentSlide]);

  const showNext = useCallback(() => {
    if (viewerIndex < 0 || viewerIndex >= filtered.length - 1) return;
    const next = filtered[viewerIndex + 1];
    if (!next) return;
    leaveCurrentSlide();
    setViewerId(next.record.id);
  }, [filtered, viewerIndex, leaveCurrentSlide]);

  const toggleFullscreen = useCallback(async () => {
    const el = lightboxRef.current;
    if (!el) return;
    try {
      if (isFullscreenActive()) {
        await document.exitFullscreen();
      } else {
        await el.requestFullscreen();
      }
    } catch {
      // Fullscreen API blocked / unavailable
    }
  }, []);

  useEffect(() => {
    function onFsChange() {
      setIsFs(isFullscreenActive());
    }
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  useEffect(() => {
    if (!viewerId) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (isFullscreenActive()) {
          void document.exitFullscreen();
          e.preventDefault();
          return;
        }
        void closeViewer();
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
        return;
      }
      if (e.key === "f" || e.key === "F" || e.key === "а" || e.key === "А") {
        if (
          e.target instanceof HTMLElement &&
          (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")
        ) {
          return;
        }
        e.preventDefault();
        void toggleFullscreen();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [viewerId, showPrev, showNext, toggleFullscreen, closeViewer]);

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
    if (busyId) return;
    setBusyId(id);
    try {
      const idx = filtered.findIndex((v) => v.record.id === id);
      const fallback =
        filtered[idx + 1] ?? filtered[idx - 1] ?? null;
      await removeFavorite(id);
      setViews((prev) => {
        const gone = prev.filter((v) => v.record.id === id);
        revokeViews(gone);
        return prev.filter((v) => v.record.id !== id);
      });
      await refreshFavoriteMetadata();
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

  const viewerTags = viewer
    ? (viewer.record.tags ?? "").trim().split(/\s+/).filter(Boolean)
    : [];

  const gelbooruId = viewer?.record.gelbooruId;
  const canOpenSite = Boolean(gelbooruId);

  const openOnSite = useCallback(async () => {
    if (!gelbooruId) return;
    void primeUiAudio();
    playUiClick();
    const url = `https://gelbooru.com/index.php?page=post&s=view&id=${gelbooruId}`;
    const desktop = window.joiDesktop?.shell?.openExternal;
    if (desktop) {
      await desktop(url);
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  }, [gelbooruId]);

  const openInExplorer = useCallback(async () => {
    if (!viewer) return;
    void primeUiAudio();
    playUiClick();
    const show = window.joiDesktop?.shell?.showTempFile;
    if (!show) {
      setError("Открыть в проводнике можно только в десктоп-приложении");
      return;
    }
    try {
      const buf = await viewer.record.blob.arrayBuffer();
      const bytes = Array.from(new Uint8Array(buf));
      const res = await show({
        fileName: viewer.record.fileName || `favorite-${viewer.record.id}`,
        bytes,
      });
      if (!res.ok) setError(res.detail ?? "Не удалось открыть файл");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось открыть файл");
    }
  }, [viewer]);

  return (
    <div className="favorites-page">
      <header className="favorites-page__head">
        <div>
          <h1 className="favorites-page__title">Избранное</h1>
          <p className="favorites-page__sub">
            Локальные копии с тегами booru. Повторно подтянутый пост с
            Gelbooru снова отметится как ♥.
          </p>
        </div>
        <div className="favorites-page__actions">
          <span className="favorites-page__count">
            {hasActiveFilter ? `${matchedIds.length} найдено · ` : ""}
            {views.length} / {matchedIds.length} загружено
          </span>
          <button
            type="button"
            disabled={loading}
            onClick={() => void reload().then(() => onFavoritesChanged())}
          >
            Обновить
          </button>
        </div>
      </header>

      {!loading || views.length > 0 ? (
        <TastePassportPanel
          view={tastePassport.view}
          ctas={onNavigate ? tastePassport.ctas : []}
          onNavigate={onNavigate}
        />
      ) : null}

      {favoriteMetadata.length > 0 ? (
        <div className="favorites-page__filters">
          <div className="favorites-page__search-row">
            <div className="favorites-page__kind" role="group" aria-label="Тип медиа">
              {(
                [
                  ["all", "Все"],
                  ["image", "Картинки"],
                  ["gif", "Гифки"],
                  ["video", "Видео"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={`favorites-page__kind-btn${
                    kindFilter === id ? " is-active" : ""
                  }`}
                  aria-pressed={kindFilter === id}
                  onClick={() => {
                    void primeUiAudio();
                    playUiClick();
                    setKindFilter(id);
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <input
              className="favorites-page__search"
              type="search"
              placeholder="Поиск по тегам…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Поиск по тегам"
            />
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
                  return (
                  <article
                    key={record.id}
                    className={
                      "fav-masonry__card" +
                      (enterI != null ? " is-enter" : "")
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
                        disabled={busyId === record.id}
                        title="Удалить из избранного"
                        onClick={() => void handleDelete(record.id)}
                      >
                        {busyId === record.id ? "…" : "Удалить"}
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
        <div
          ref={lightboxRef}
          className={`fav-lightbox${isFs ? " is-fullscreen" : ""}`}
          role="dialog"
          aria-modal="true"
          aria-label="Просмотр избранного"
          onClick={() => {
            if (!isFullscreenActive()) void closeViewer();
          }}
        >
          <div className="fav-lightbox__toolbar" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="fav-lightbox__tool fav-lightbox__tool--text"
              title="Открыть файл в проводнике"
              aria-label="Открыть в проводнике"
              onClick={() => void openInExplorer()}
            >
              Проводник
            </button>
            <button
              type="button"
              className="fav-lightbox__tool fav-lightbox__tool--text"
              title="Открыть пост на Gelbooru"
              aria-label="Открыть на сайте"
              disabled={!canOpenSite}
              onClick={() => void openOnSite()}
            >
              На сайте
            </button>
            <button
              type="button"
              className="fav-lightbox__tool"
              title={isFs ? "Свернуть (F)" : "На весь экран (F)"}
              aria-label={isFs ? "Свернуть" : "На весь экран"}
              onClick={() => void toggleFullscreen()}
            >
              {isFs ? "⛶" : "⧉"}
            </button>
            <button
              type="button"
              className="fav-lightbox__tool fav-lightbox__tool--close"
              title="Закрыть"
              aria-label="Закрыть"
              onClick={() => void closeViewer()}
            >
              ×
            </button>
          </div>

          <button
            type="button"
            className="fav-lightbox__nav fav-lightbox__nav--prev"
            title="Предыдущая (←)"
            aria-label="Предыдущая"
            disabled={!canPrev}
            onClick={(e) => {
              e.stopPropagation();
              showPrev();
            }}
          >
            ‹
          </button>
          <button
            type="button"
            className="fav-lightbox__nav fav-lightbox__nav--next"
            title="Следующая (→)"
            aria-label="Следующая"
            disabled={!canNext}
            onClick={(e) => {
              e.stopPropagation();
              showNext();
            }}
          >
            ›
          </button>

          <div
            className="fav-lightbox__stage"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="fav-lightbox__media-wrap">
              {viewer.item.kind === "video" ? (
                <video
                  key={viewer.record.id}
                  ref={viewerVideoRef}
                  className="fav-lightbox__media"
                  src={viewer.item.url}
                  controls
                  autoPlay
                  loop
                  playsInline
                />
              ) : (
                <img
                  key={viewer.record.id}
                  className="fav-lightbox__media"
                  src={viewer.item.url}
                  alt={viewer.record.tags ?? ""}
                  draggable={false}
                />
              )}
            </div>
            {viewerTags.length > 0 && !isFs ? (
              <div className="fav-lightbox__tags">
                {viewerTags.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    className="fav-tag is-active"
                    onClick={() => {
                      toggleTag(tag);
                      void closeViewer();
                    }}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            ) : null}
            {filtered.length > 1 ? (
              <p className="fav-lightbox__counter" aria-live="polite">
                {viewerIndex + 1} / {filtered.length}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
