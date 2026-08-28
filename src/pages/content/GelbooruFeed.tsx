import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  BookmarkIcon,
  FavLightbox,
  HeartIcon,
} from "../../components/FavLightbox";
import { FavMasonryMedia } from "../../components/FavMasonryMedia";
import {
  lightboxCanGoNext,
  lightboxShouldPrefetch,
} from "../../lib/lightboxPrefetch";
import { type MediaItem } from "../../lib/media";
import { splitIntoColumns, useFavColumnCount } from "./favWallLayout";

type Props = {
  items: MediaItem[];
  loading: boolean;
  hasMore: boolean;
  savedIds: Set<string>;
  listedIds?: Set<string>;
  status?: string | null;
  emptyHint: string;
  busyIds?: ReadonlySet<string>;
  columnCount?: number;
  highlightId?: string | null;
  startId?: string | null;
  startGen?: number;
  onLoadMore: () => void;
  onToggleSave: (item: MediaItem) => void;
  onOpenLists?: (item: MediaItem) => void;
  onViewIndex?: (index: number) => void;
  onRequestClose?: (close: () => void) => void;
  onHitEnd?: () => void;
  runHud?: ReactNode;
};

export function GelbooruFeed({
  items,
  loading,
  hasMore,
  savedIds,
  listedIds,
  status,
  emptyHint,
  onLoadMore,
  onToggleSave,
  onOpenLists,
  onViewIndex,
  onRequestClose,
  onHitEnd,
  runHud = null,
  busyIds,
  columnCount: columnCountProp,
  highlightId = null,
  startId = null,
  startGen = 0,
}: Props) {
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [enterIds, setEnterIds] = useState<string[]>([]);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const wantNextRef = useRef(false);
  const autoColumns = useFavColumnCount();
  const columnCount = columnCountProp ?? autoColumns;
  const itemBusy = (id: string) => Boolean(busyIds?.has(id));
  const columns = useMemo(
    () => splitIntoColumns(items, columnCount),
    [items, columnCount],
  );
  const enterIndexById = useMemo(() => {
    const map = new Map<string, number>();
    enterIds.forEach((id, index) => map.set(id, index));
    return map;
  }, [enterIds]);

  const prevLen = useRef(0);
  useEffect(() => {
    if (items.length <= prevLen.current) {
      prevLen.current = items.length;
      return;
    }
    setEnterIds(items.slice(prevLen.current).map((row) => row.id));
    prevLen.current = items.length;
  }, [items]);

  useEffect(() => {
    const node = loadMoreRef.current;
    if (!node || !hasMore) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) onLoadMore();
      },
      { root: null, rootMargin: "280px 0px", threshold: 0.01 },
    );
    io.observe(node);
    return () => io.disconnect();
  }, [hasMore, onLoadMore, items.length]);

  const viewerIndex = viewerId
    ? items.findIndex((row) => row.id === viewerId)
    : -1;
  const viewer = viewerIndex >= 0 ? items[viewerIndex]! : null;

  const openViewer = useCallback(
    (id: string) => {
      setViewerId(id);
      const index = items.findIndex((row) => row.id === id);
      if (index >= 0) onViewIndex?.(index);
    },
    [items, onViewIndex],
  );

  useEffect(() => {
    if (!startId) return;
    setViewerId(startId);
    const index = items.findIndex((row) => row.id === startId);
    if (index >= 0) onViewIndex?.(index);
    // Only the dock token should reopen the lightbox.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- startGen is the trigger
  }, [startId, startGen]);

  const closeViewer = useCallback(() => {
    wantNextRef.current = false;
    setViewerId(null);
  }, []);
  const requestClose = useCallback(() => {
    if (onRequestClose) {
      onRequestClose(closeViewer);
      return;
    }
    closeViewer();
  }, [closeViewer, onRequestClose]);
  const showPrev = useCallback(() => {
    if (viewerIndex <= 0) return;
    wantNextRef.current = false;
    openViewer(items[viewerIndex - 1]!.id);
  }, [items, openViewer, viewerIndex]);
  const showNext = useCallback(() => {
    if (viewerIndex < 0) return;
    if (viewerIndex < items.length - 1) {
      wantNextRef.current = false;
      openViewer(items[viewerIndex + 1]!.id);
      return;
    }
    if (hasMore) {
      wantNextRef.current = true;
      onLoadMore();
      return;
    }
    onHitEnd?.();
  }, [hasMore, items, onHitEnd, onLoadMore, openViewer, viewerIndex]);

  useEffect(() => {
    if (loading) return;
    if (!lightboxShouldPrefetch(viewerIndex, items.length, hasMore)) return;
    onLoadMore();
  }, [hasMore, items.length, loading, onLoadMore, viewerIndex]);

  useEffect(() => {
    if (!wantNextRef.current) return;
    if (viewerIndex < 0 || viewerIndex >= items.length - 1) return;
    wantNextRef.current = false;
    openViewer(items[viewerIndex + 1]!.id);
  }, [items, openViewer, viewerIndex]);

  useEffect(() => {
    if (!viewer) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        requestClose();
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
  }, [viewer, requestClose, showPrev, showNext]);

  if (items.length === 0) {
    return (
      <div className="favorites-page__empty">
        <p>{loading ? "Загрузка…" : emptyHint}</p>
      </div>
    );
  }

  return (
    <div className="fav-masonry-wrap">
      {status ? <p className="doujin-status">{status}</p> : null}
      <div className="fav-masonry">
        {columns.map((column, colIndex) => (
          <div key={colIndex} className="fav-masonry__col">
            {column.map((item) => {
              const enterI = enterIndexById.get(item.id);
              const saved = savedIds.has(item.id);
              const listed = Boolean(listedIds?.has(item.id));
              const picked = highlightId === item.id;
              return (
                <article
                  key={item.id}
                  className={
                    "fav-masonry__card" +
                    (enterI != null ? " is-enter" : "") +
                    (picked ? " is-picked" : "")
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
                    onClick={() => openViewer(item.id)}
                    title="Открыть"
                    aria-label="Открыть"
                  >
                    <FavMasonryMedia item={item} />
                    <span className="fav-masonry__glow" aria-hidden />
                  </button>
                  {onOpenLists ? (
                    <div className="doujin-card__actions">
                      <button
                        type="button"
                        className={"doujin-card__list" + (listed ? " is-on" : "")}
                        aria-pressed={listed}
                        title={listed ? "В списках" : "Добавить в список"}
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenLists(item);
                        }}
                      >
                        <BookmarkIcon filled={listed} />
                      </button>
                      <button
                        type="button"
                        className={"doujin-card__fav" + (saved ? " is-on" : "")}
                        aria-pressed={saved}
                        disabled={itemBusy(item.id)}
                        title={saved ? "Убрать из полки" : "На полку"}
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleSave(item);
                        }}
                      >
                        <HeartIcon filled={saved} />
                      </button>
                    </div>
                  ) : null}
                  <div className="fav-masonry__bar">
                    <span className="fav-masonry__kind">
                      {item.kind === "video"
                        ? "видео"
                        : item.kind === "gif"
                          ? "gif"
                          : "фото"}
                      {item.gelbooruId ? ` · #${item.gelbooruId}` : ""}
                    </span>
                    {onOpenLists ? null : (
                    <button
                      type="button"
                      className={
                        "fav-masonry__del" + (saved ? " is-on" : "")
                      }
                      disabled={itemBusy(item.id)}
                      title={saved ? "Убрать из полки" : "На полку"}
                      onClick={() => onToggleSave(item)}
                    >
                      {itemBusy(item.id) ? "…" : saved ? "♥" : "♡"}
                    </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        ))}
      </div>
      {hasMore ? (
        <div ref={loadMoreRef} className="fav-masonry__sentinel">
          {loading ? "Подгружаю…" : "Ещё"}
        </div>
      ) : items.length > 0 ? (
        <div className="fav-masonry__count">Конец ленты</div>
      ) : null}

      {viewer ? (
        <FavLightbox
          item={viewer}
          canPrev={viewerIndex > 0}
          canNext={
            lightboxCanGoNext(viewerIndex, items.length, hasMore) ||
            Boolean(onHitEnd && viewerIndex >= items.length - 1 && !hasMore)
          }
          saved={savedIds.has(viewer.id)}
          listed={Boolean(listedIds?.has(viewer.id))}
          saveBusy={itemBusy(viewer.id)}
          counter={
            items.length > 1
              ? `${viewerIndex + 1} / ${items.length}${hasMore ? "+" : ""}`
              : null
          }
          onClose={requestClose}
          onPrev={showPrev}
          onNext={showNext}
          onToggleSave={() => onToggleSave(viewer)}
          onOpenLists={onOpenLists ? () => onOpenLists(viewer) : undefined}
          runHud={runHud}
        />
      ) : null}
    </div>
  );
}

