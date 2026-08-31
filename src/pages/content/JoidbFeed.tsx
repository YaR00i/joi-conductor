import { useEffect, useRef } from "react";
import { HeartIcon, BookmarkIcon } from "../../components/FavLightbox";
import { displayRemoteMediaUrl } from "../../lib/media";
import type { JoidbVideo } from "../../lib/joidb/parseCatalog";
import "./joidb.css";

type Props = {
  items: JoidbVideo[];
  loading: boolean;
  hasMore?: boolean;
  emptyHint: string;
  status?: string | null;
  savedIds: ReadonlySet<string>;
  listedIds: ReadonlySet<string>;
  busyIds?: ReadonlySet<string>;
  onLoadMore?: () => void;
  onOpen: (video: JoidbVideo) => void;
  onToggleSave: (video: JoidbVideo) => void;
  onOpenLists: (video: JoidbVideo) => void;
};

export function JoidbFeed({
  items,
  loading,
  hasMore = false,
  emptyHint,
  status,
  savedIds,
  listedIds,
  busyIds,
  onLoadMore,
  onOpen,
  onToggleSave,
  onOpenLists,
}: Props) {
  const moreRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = moreRef.current;
    if (!node || !onLoadMore || !hasMore) return;
    const root = node.closest(".joidb-hub");
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) onLoadMore();
      },
      {
        root: root instanceof Element ? root : null,
        rootMargin: "400px 0px",
        threshold: 0.01,
      },
    );
    obs.observe(node);
    return () => obs.disconnect();
  }, [onLoadMore, hasMore, items.length]);

  if (!loading && items.length === 0) {
    return <p className="muted joidb-empty">{status ?? emptyHint}</p>;
  }

  return (
    <>
      {status ? <p className="muted joidb-status">{status}</p> : null}
      <div className="joidb-grid">
        {items.map((video) => {
          const saved = savedIds.has(video.mediaId);
          const listed = listedIds.has(video.mediaId) || listedIds.has(video.id);
          const busy = Boolean(busyIds?.has(video.mediaId));
          return (
            <article key={video.mediaId} className="joidb-card">
              <div className="joidb-card__media">
                <button
                  type="button"
                  className="joidb-card__thumb"
                  onClick={() => onOpen(video)}
                >
                  {video.thumbnail ? (
                    <img
                      src={displayRemoteMediaUrl(video.thumbnail)}
                      alt=""
                      loading="lazy"
                    />
                  ) : (
                    <span className="joidb-card__ph" />
                  )}
                  {video.duration ? (
                    <span className="joidb-card__dur">{video.duration}</span>
                  ) : null}
                  {video.exclusive ? (
                    <span className="joidb-card__ex">patreon</span>
                  ) : null}
                </button>
                <div className="doujin-card__actions">
                  <button
                    type="button"
                    className={"doujin-card__list" + (listed ? " is-on" : "")}
                    aria-pressed={listed}
                    title={listed ? "В списках" : "Добавить в список"}
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenLists(video);
                    }}
                  >
                    <BookmarkIcon filled={listed} />
                  </button>
                  <button
                    type="button"
                    className={"doujin-card__fav" + (saved ? " is-on" : "")}
                    aria-pressed={saved}
                    disabled={busy}
                    title={saved ? "Убрать из избранного" : "В избранное"}
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleSave(video);
                    }}
                  >
                    <HeartIcon filled={saved} />
                  </button>
                </div>
              </div>
              <button
                type="button"
                className="joidb-card__title"
                onClick={() => onOpen(video)}
              >
                <span>{video.title}</span>
              </button>
            </article>
          );
        })}
      </div>
      {loading ? <p className="muted joidb-status">Загрузка…</p> : null}
      {hasMore ? <div ref={moreRef} className="joidb-more" /> : null}
    </>
  );
}
