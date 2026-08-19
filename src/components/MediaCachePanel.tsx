import { useEffect, useRef, useState } from "react";
import {
  formatByteSize,
  formatBytesPerSec,
  getPlaylistPreloadDetail,
  retryAllFailedMedia,
  retryMediaItem,
  subscribePlaylistPreloadDetail,
  type FilePreloadEntry,
  type PlaylistPreloadDetail,
  type PlaylistPreloadStatus,
} from "../lib/mediaPreload";

type MediaCachePanelProps = {
  /** Aggregate status (chip summary) */
  playlistPreload: PlaylistPreloadStatus;
};

function phaseRu(phase: FilePreloadEntry["phase"]): string {
  switch (phase) {
    case "queued":
      return "очередь";
    case "loading":
      return "качаю";
    case "ready":
      return "готово";
    case "error":
      return "ошибка";
    default: {
      const _exhaustive: never = phase;
      return _exhaustive;
    }
  }
}

function loadingDetail(f: FilePreloadEntry): string {
  if (f.retryAt && f.errorDetail) {
    const sec = Math.max(1, Math.ceil((f.retryAt - Date.now()) / 1000));
    return `повтор ${Math.min(f.attempt + 1, f.maxAttempts)}/${f.maxAttempts} через ${sec}с · ${f.errorDetail}`;
  }
  if (f.attempt > 0) return `попытка ${f.attempt}/${f.maxAttempts}`;
  return "ожидает ответа";
}

export function MediaCachePanel({ playlistPreload }: MediaCachePanelProps) {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<PlaylistPreloadDetail>(() =>
    getPlaylistPreloadDetail(),
  );
  const [retrying, setRetrying] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => subscribePlaylistPreloadDetail(setDetail), []);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  if (playlistPreload.total <= 0 && detail.total <= 0) return null;

  const total = Math.max(playlistPreload.total, detail.total);
  const ready = detail.total > 0 ? detail.ready : playlistPreload.ready;
  const loading =
    detail.active || playlistPreload.active || ready < total;
  const speed =
    detail.aggregateBytesPerSec != null
      ? formatBytesPerSec(detail.aggregateBytesPerSec)
      : null;

  return (
    <div
      ref={wrapRef}
      className={`session__cache-panel${open ? " is-open" : ""}`}
    >
      <button
        type="button"
        className={`session__media-chip session__media-chip--cache${
          loading
            ? " is-loading"
            : detail.failed > 0
              ? " is-failed"
              : " is-ready"
        }`}
        title="Кэш плейлиста — нажми для списка файлов"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="session__media-chip__kind">кэш</span>
        <span className="session__media-chip__pct">
          {ready}/{total}
          {detail.failed > 0 ? ` · ⚠${detail.failed}` : ""}
          {loading && detail.percent > 0 ? ` · ${detail.percent}%` : ""}
        </span>
      </button>

      {open ? (
        <div
          className="session__cache-dropdown"
          role="dialog"
          aria-label="Кэш медиа"
        >
          <div className="session__cache-dropdown__head">
            <div>
              <strong>Загрузка кэша</strong>
              <span className="session__cache-dropdown__sub">
                по порядку воспроизведения
              </span>
            </div>
            <div className="session__cache-dropdown__stats">
              <span>
                {detail.ready}/{detail.total}
                {detail.failed > 0 ? ` · ошибок ${detail.failed}` : ""}
              </span>
              {speed && loading ? <span>{speed}</span> : null}
              {detail.failed > 0 ? (
                <button
                  type="button"
                  className="session__cache-retry-all"
                  disabled={retrying}
                  onClick={async () => {
                    setRetrying(true);
                    try {
                      await retryAllFailedMedia();
                    } finally {
                      setRetrying(false);
                    }
                  }}
                  title="Перекачать все упавшие файлы"
                >
                  {retrying ? "…" : `↻ Повторить (${detail.failed})`}
                </button>
              ) : null}
            </div>
          </div>

          <div className="session__cache-dropdown__bar">
            <div
              className="session__cache-dropdown__fill"
              style={{ width: `${detail.percent}%` }}
            />
          </div>

          <ul className="session__cache-dropdown__list">
            {detail.files.map((f) => (
              <li
                key={f.itemId}
                className={`session__cache-file is-${f.phase}`}
              >
                <div className="session__cache-file__top">
                  <span className="session__cache-file__label">{f.label}</span>
                  <span className="session__cache-file__phase">
                    {phaseRu(f.phase)}
                  </span>
                  {f.phase === "error" ? (
                    <button
                      type="button"
                      className="session__cache-file__retry"
                      title="Перекачать этот файл"
                      onClick={() => {
                        void retryMediaItem(f.itemId);
                      }}
                    >
                      ↻
                    </button>
                  ) : null}
                </div>
                <div className="session__cache-file__track">
                  <div
                    className="session__cache-file__fill"
                    style={{
                      width:
                        f.phase === "ready"
                          ? "100%"
                          : f.percent != null
                            ? `${f.percent}%`
                            : f.phase === "loading"
                              ? "12%"
                              : "0%",
                    }}
                  />
                </div>
                <div className="session__cache-file__meta">
                  <span>
                    {f.percent != null
                      ? `${f.percent}%`
                      : f.phase === "queued"
                        ? "—"
                        : f.phase === "loading"
                          ? "…"
                          : f.phase === "error"
                            ? "fail"
                            : "100%"}
                  </span>
                  <span>
                    {f.phase === "loading"
                      ? formatBytesPerSec(f.bytesPerSec)
                      : f.phase === "ready"
                        ? formatByteSize(f.totalBytes ?? f.loadedBytes)
                        : f.totalBytes != null
                          ? formatByteSize(f.totalBytes)
                          : "—"}
                  </span>
                  {f.phase === "loading" && f.totalBytes != null ? (
                    <span>
                      {formatByteSize(f.loadedBytes)} /{" "}
                      {formatByteSize(f.totalBytes)}
                    </span>
                  ) : null}
                </div>
                {f.phase === "loading" && f.percent == null ? (
                  <p className="session__cache-file__detail">
                    {loadingDetail(f)} · размер сервер не сообщил
                  </p>
                ) : null}
                {f.phase === "error" && f.errorDetail ? (
                  <p className="session__cache-file__detail is-error" title={f.errorDetail}>
                    {f.errorDetail}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
