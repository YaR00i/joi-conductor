import { useEffect, useState, type ReactNode } from "react";
import { BookmarkIcon, HeartIcon } from "../../components/FavLightbox";
import { fetchJoidbWatch } from "../../lib/joidb/client";
import type { JoidbVideo, JoidbWatchMeta } from "../../lib/joidb/parseCatalog";
import { displayRemoteMediaUrl } from "../../lib/media";
import { JoidbFeed } from "./JoidbFeed";
import { JoidbPlayer } from "./JoidbPlayer";
import type { JoidbVttCue } from "../../lib/joidb/parseVtt";
import "./joidb.css";

type Props = {
  video: JoidbVideo;
  playing: boolean;
  cues: JoidbVttCue[];
  paused?: boolean;
  related?: JoidbVideo[];
  savedIds: ReadonlySet<string>;
  listedIds: ReadonlySet<string>;
  busyIds?: ReadonlySet<string>;
  onClose: () => void;
  onPlay: () => void;
  onToggleSave: (video: JoidbVideo) => void;
  onOpenLists: (video: JoidbVideo) => void;
  onOpenRelated: (video: JoidbVideo) => void;
  onTag: (tag: string) => void;
  onEnded?: () => void;
  onCue?: (cue: JoidbVttCue | null) => void;
  hud?: ReactNode;
};

function BackIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden>
      <path
        d="M10.2 3.2 5.4 8l4.8 4.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden>
      <path d="M5.1 3.2v9.6L13.2 8 5.1 3.2z" fill="currentColor" />
    </svg>
  );
}

export function JoidbWatch({
  video,
  playing,
  cues,
  paused,
  related = [],
  savedIds,
  listedIds,
  busyIds,
  onClose,
  onPlay,
  onToggleSave,
  onOpenLists,
  onOpenRelated,
  onTag,
  onEnded,
  onCue,
  hud,
}: Props) {
  const [meta, setMeta] = useState<JoidbWatchMeta | null>(null);
  const [metaError, setMetaError] = useState<string | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    setMeta(null);
    setMetaError(null);
    void fetchJoidbWatch(video.id, ac.signal)
      .then((row) => {
        if (!ac.signal.aborted) setMeta(row);
      })
      .catch((err) => {
        if (ac.signal.aborted) return;
        setMetaError(err instanceof Error ? err.message : "Нет описания");
        setMeta({ tags: [], description: "" });
      });
    return () => ac.abort();
  }, [video.id]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (document.fullscreenElement) return;
      e.preventDefault();
      onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const poster = video.thumbnail
    ? displayRemoteMediaUrl(video.thumbnail)
    : undefined;
  const creator = meta?.creator ?? video.creator;
  const saved = savedIds.has(video.mediaId);
  const listed = listedIds.has(video.mediaId) || listedIds.has(video.id);
  const busy = Boolean(busyIds?.has(video.mediaId));

  const backBtn = (
    <button
      type="button"
      className="joidb-watch__back doujin-reader__icon"
      title="Назад"
      aria-label="Назад"
      onClick={onClose}
    >
      <BackIcon />
    </button>
  );

  return (
    <div className="joidb-watch">
      <div className="joidb-watch__body">
        <div className="joidb-watch__main">
          <div className="joidb-watch__cinema">
            {playing ? (
              <div className="joidb-watch__stage">
                <JoidbPlayer
                  video={video}
                  cues={cues}
                  paused={paused}
                  chrome="stage"
                  onClose={onClose}
                  onEnded={onEnded}
                  onCue={onCue}
                  hud={hud}
                />
                {backBtn}
              </div>
            ) : (
              <div className="joidb-watch__poster">
                {poster ? (
                  <img src={poster} alt="" />
                ) : (
                  <span className="joidb-card__ph" />
                )}
                {backBtn}
                {video.duration ? (
                  <span className="joidb-card__dur">{video.duration}</span>
                ) : null}
                {video.exclusive ? (
                  <span className="joidb-card__ex">patreon</span>
                ) : null}
                <button type="button" className="joidb-watch__play" onClick={onPlay}>
                  <span className="joidb-watch__play-disc">
                    <PlayIcon />
                  </span>
                  Смотреть
                </button>
              </div>
            )}
          </div>
          <div className="joidb-watch__caption">
            <div className="joidb-watch__heading">
              <p className="doujin-chrome__kicker">ролик</p>
              <h2>{video.title}</h2>
              <div className="joidb-watch__pills">
                {video.duration ? (
                  <span className="joidb-watch__pill">{video.duration}</span>
                ) : null}
                {creator ? (
                  <span className="joidb-watch__pill">{creator}</span>
                ) : null}
                {video.exclusive ? (
                  <span className="joidb-watch__pill">patreon</span>
                ) : null}
              </div>
            </div>
            <div className="joidb-watch__tools">
              <button
                type="button"
                className={"doujin-reader__icon" + (listed ? " is-on" : "")}
                aria-pressed={listed}
                title={listed ? "В списках" : "Добавить в список"}
                onClick={() => onOpenLists(video)}
              >
                <BookmarkIcon filled={listed} />
              </button>
              <button
                type="button"
                className={"doujin-reader__icon" + (saved ? " is-on" : "")}
                aria-pressed={saved}
                disabled={busy}
                title={saved ? "Убрать из избранного" : "В избранное"}
                onClick={() => onToggleSave(video)}
              >
                <HeartIcon filled={saved} />
              </button>
            </div>
          </div>

          {related.length > 0 ? (
            <section className="joidb-watch__related" aria-label="Ещё ролики">
              <p className="doujin-chrome__kicker">ещё ролики</p>
              <JoidbFeed
                items={related}
                loading={false}
                hasMore={false}
                emptyHint=""
                savedIds={savedIds}
                listedIds={listedIds}
                busyIds={busyIds}
                onOpen={onOpenRelated}
                onToggleSave={onToggleSave}
                onOpenLists={onOpenLists}
              />
            </section>
          ) : null}
        </div>

        <aside className="joidb-watch__aside">
          {metaError ? <p className="muted joidb-status">{metaError}</p> : null}

          {meta && meta.tags.length > 0 ? (
            <div className="joidb-watch__tagblock">
              <p className="doujin-chrome__kicker">теги</p>
              <ul className="doujin-chips joidb-watch__tags">
                {meta.tags.map((tag) => (
                  <li key={tag}>
                    <button type="button" onClick={() => onTag(tag)}>
                      {tag}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {meta?.description ? (
            <div className="joidb-watch__desc">
              <p className="doujin-chrome__kicker">описание</p>
              <p>{meta.description}</p>
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
