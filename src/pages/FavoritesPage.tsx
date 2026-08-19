import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { NavId } from "../components/SideNav";
import { TastePassportPanel } from "../components/TastePassportPanel";
import { TagTypePickerModal } from "../components/TagTypePickerModal";
import { buildFavoriteTasteProfile } from "../lib/favoriteTagTaste";
import {
  collectFavoriteTagStats,
  favoriteMatchesTagFilter,
  listFavoriteMetadata,
  listFavoriteRecordsPaged,
  removeFavorite,
  revokeFavoriteMedia,
  type FavoriteMetadata,
  type FavoriteRecord,
} from "../lib/mediaFavorites";
import type { MediaItem } from "../lib/media";
import {
  buildTastePassportView,
  favoritesTasteLoopCtas,
} from "../lib/tasteLoopDisplay";
import {
  getTagType,
  groupTagsByType,
  loadTagTypeMap,
  setTagType,
  setTagTypesBulk,
  type TagTypeId,
  type TagTypeMap,
} from "../lib/tagTypes";
import { playUiClick, playUiConfirm, primeUiAudio } from "../lib/uiSound";

interface FavoritesPageProps {
  /** Called after add/remove so App can refresh counts / playlist */
  onFavoritesChanged: () => void;
  onNavigate?: (id: NavId) => void;
}

type FavView = {
  record: FavoriteRecord;
  item: MediaItem;
};

const TAG_CHIP_LIMIT = 48;
const FAVORITES_PAGE_SIZE = 36;

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
}: FavoritesPageProps) {
  const [views, setViews] = useState<FavView[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [favoriteMetadata, setFavoriteMetadata] = useState<FavoriteMetadata[]>([]);
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

  const filtered = useMemo(
    () =>
      views.filter((v) =>
        favoriteMatchesTagFilter(v.record.tags, selectedTags, search),
      ),
    [views, selectedTags, search],
  );

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
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    setError(null);
    try {
      const offset = reset ? 0 : views.length;
      const { rows, total } = await listFavoriteRecordsPaged({
        offset,
        limit: FAVORITES_PAGE_SIZE,
      });
      const next: FavView[] = rows.map((record) => ({
        record,
        item: {
          id: record.id,
          url: URL.createObjectURL(record.blob),
          kind: record.kind,
          source: "favorites" as const,
          tags: record.tags,
          gelbooruId: record.gelbooruId,
        },
      }));
      setTotalCount(total);
      setViews((prev) => {
        if (reset) {
          revokeViews(prev);
          return next;
        }
        const have = new Set(prev.map((v) => v.record.id));
        return [...prev, ...next.filter((v) => !have.has(v.record.id))];
      });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Не удалось загрузить избранное",
      );
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [views.length]);

  const refreshFavoriteMetadata = useCallback(async (): Promise<void> => {
    setFavoriteMetadata(await listFavoriteMetadata());
  }, []);

  async function reload(): Promise<void> {
    await Promise.all([loadPage(true), refreshFavoriteMetadata()]);
  }

  useEffect(() => {
    void loadPage(true);
    void refreshFavoriteMetadata();
    // initial page only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshFavoriteMetadata]);

  useEffect(() => {
    const node = loadMoreRef.current;
    if (!node || views.length >= totalCount) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void loadPage(false);
      },
      { rootMargin: "700px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [loadPage, totalCount, views.length]);

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
      setTotalCount((n) => Math.max(0, n - 1));
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
            {search.trim() || selectedTags.length > 0
              ? `${filtered.length} найдено · `
              : ""}
            {views.length} / {totalCount} загружено
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

      {views.length > 0 ? (
        <div className="favorites-page__filters">
          <div className="favorites-page__search-row">
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
            {selectedTags.length > 0 || search.trim() ? (
              <button
                type="button"
                className="favorites-page__clear"
                onClick={() => {
                  setSelectedTags([]);
                  setSearch("");
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
                        <span
                          key={tag}
                          className={`fav-tag fav-tag--with-gear${
                            active ? " is-active" : ""
                          }`}
                        >
                          <button
                            type="button"
                            className="fav-tag__main"
                            onClick={() => toggleTag(tag)}
                            title={`${count} шт.`}
                          >
                            {tag}
                          </button>
                          <span className="fav-tag__slot">
                            <span className="fav-tag__n" aria-hidden>
                              {count}
                            </span>
                            <button
                              type="button"
                              className="fav-tag__gear"
                              title="Настройки тега"
                              aria-label={`Настройки тега ${tag}`}
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                void primeUiAudio();
                                playUiClick();
                                setEditTag(tag);
                              }}
                            >
                              ⚙
                            </button>
                          </span>
                        </span>
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

      {loading && views.length === 0 ? (
        <p className="favorites-page__empty">Загрузка…</p>
      ) : views.length === 0 ? (
        <div className="favorites-page__empty">
          <p>Пока пусто</p>
          <p className="favorites-page__hint">
            На сессии с Gelbooru жми Like — файлы появятся здесь каскадом, а вкус
            начнёт смещать рулетку и магазин.
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="favorites-page__empty">
          <p>Ничего не найдено</p>
          <p className="favorites-page__hint">
            Сними теги или измени поиск.
          </p>
        </div>
      ) : (
        <div className="fav-masonry">
          {filtered.map(({ record, item }) => (
            <article key={record.id} className="fav-masonry__card">
              <button
                type="button"
                className="fav-masonry__open"
                onClick={() => setViewerId(record.id)}
                title="Открыть на весь экран"
                aria-label="Открыть на весь экран"
              >
                {item.kind === "video" ? (
                  <video
                    className="fav-masonry__media"
                    src={item.url}
                    muted
                    loop
                    playsInline
                    preload="metadata"
                  />
                ) : (
                  <img
                    className="fav-masonry__media"
                    src={item.url}
                    alt={item.tags ?? ""}
                    loading="lazy"
                    draggable={false}
                  />
                )}
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
          ))}
          {views.length < totalCount ? (
            <div ref={loadMoreRef} className="fav-masonry__sentinel">
              {loading
                ? "Подгружаю…"
                : `Показано ${views.length} из ${totalCount}`}
            </div>
          ) : (
            <div className="fav-masonry__count">
              {totalCount > 0 ? `Все ${totalCount} загружены` : ""}
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
