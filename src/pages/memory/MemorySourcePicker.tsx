import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  collectAllFavoriteTagStats,
  contentBooruTags,
  favoriteMatchesTagFilter,
  favoriteMediaKind,
  getFavoriteRecord,
  listFavoriteMetadata,
  type FavoriteMetadata,
  type FavoriteTagStat,
} from "../../lib/mediaFavorites";
import {
  MEMORY_DIFFICULTIES,
  getMemoryDifficulty,
  type MemoryDifficultyId,
} from "../../lib/memoryReward";
import type { MemorySource } from "./memoryAssets";

/**
 * Setup screen for the memory game: pick a difficulty, narrow the favorites
 * pool by tags (with a live thumbnail preview of what's in the pool) or
 * upload pictures from disk, and start. Deck building (blob fetch + decode
 * validation) happens in MemoryGame after onStart.
 */

interface Props {
  difficultyId: MemoryDifficultyId;
  onDifficulty: (id: MemoryDifficultyId) => void;
  onStart: (source: MemorySource) => void;
  onBack: () => void;
}

type Mode = "favorites" | "upload";

/** How many pool thumbnails the setup screen previews. */
const PREVIEW_LIMIT = 48;

export function MemorySourcePicker({
  difficultyId,
  onDifficulty,
  onStart,
  onBack,
}: Props) {
  const [mode, setMode] = useState<Mode>("favorites");
  const [allMeta, setAllMeta] = useState<FavoriteMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tagStats, setTagStats] = useState<FavoriteTagStat[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});

  /** id → "loading" marker or its live URL; tracks URLs for unmount revoke. */
  const urlCacheRef = useRef<Map<string, string>>(new Map());
  /** Bumped on every pool change so stale fetches can self-cancel. */
  const genRef = useRef(0);

  useEffect(() => {
    setLoading(true);
    setError(null);
    listFavoriteMetadata()
      .then((rows) => setAllMeta(rows))
      .catch((e) =>
        setError(e instanceof Error ? e.message : "Не удалось загрузить избранное"),
      )
      .finally(() => setLoading(false));
    void collectAllFavoriteTagStats().then(setTagStats).catch(() => undefined);
  }, []);

  // The game matches pictures: still images (incl. gifs) only.
  const poolMeta = useMemo(
    () =>
      allMeta.filter(
        (m) =>
          favoriteMediaKind(m) !== "video" &&
          favoriteMatchesTagFilter(m.tags, selectedTags, search),
      ),
    [allMeta, selectedTags, search],
  );

  const previewMeta = useMemo(
    () => poolMeta.slice(0, PREVIEW_LIMIT),
    [poolMeta],
  );

  const visibleTags = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return tagStats.slice(0, 24);
    return tagStats.filter(({ tag }) => tag.toLowerCase().includes(q));
  }, [tagStats, search]);

  const toggleTag = (tag: string) =>
    setSelectedTags((cur) =>
      cur.includes(tag) ? cur.filter((t) => t !== tag) : [...cur, tag],
    );

  const loadPreviewCell = useCallback(async (id: string) => {
    if (urlCacheRef.current.has(id)) return;
    urlCacheRef.current.set(id, "loading");
    const gen = genRef.current;
    const rec = await getFavoriteRecord(id);
    if (gen !== genRef.current) {
      urlCacheRef.current.delete(id);
      return;
    }
    if (!rec) {
      urlCacheRef.current.delete(id);
      return;
    }
    const url = URL.createObjectURL(rec.blob);
    urlCacheRef.current.set(id, url);
    setPreviewUrls((prev) => ({ ...prev, [id]: url }));
  }, []);

  // When the pool changes: revoke old previews, reset caches, then load the
  // visible cells as a staggered wave (like the puzzle source picker).
  useEffect(() => {
    setPreviewUrls((prev) => {
      for (const u of Object.values(prev)) URL.revokeObjectURL(u);
      return {};
    });
    urlCacheRef.current.clear();
    genRef.current += 1;
    const gen = genRef.current;
    const timers: number[] = [];
    previewMeta.forEach((m, i) => {
      const t = window.setTimeout(() => {
        if (gen === genRef.current) void loadPreviewCell(m.id);
      }, i * 40);
      timers.push(t);
    });
    return () => {
      for (const t of timers) window.clearTimeout(t);
    };
  }, [previewMeta, loadPreviewCell]);

  // revoke whatever is left on unmount; the gen bump cancels in-flight cells
  useEffect(
    () => () => {
      genRef.current += 1;
      for (const u of urlCacheRef.current.values()) {
        if (u !== "loading") URL.revokeObjectURL(u);
      }
    },
    [],
  );

  const difficulty = getMemoryDifficulty(difficultyId);

  const imageFiles = useMemo(
    () => files.filter((f) => !f.type || f.type.startsWith("image/")),
    [files],
  );

  const canStart =
    mode === "upload"
      ? imageFiles.length >= difficulty.pairs
      : poolMeta.length >= difficulty.pairs;

  const start = () => {
    if (mode === "upload") {
      onStart({ kind: "files", files: imageFiles });
    } else {
      onStart({ kind: "favorites", ids: poolMeta.map((m) => m.id) });
    }
  };

  return (
    <div className="memory-setup">
      <div className="memory-setup__bar">
        <button type="button" className="puzzle-btn" onClick={onBack}>
          ← Назад
        </button>
        <h2 className="memory-setup__title">Пары на память</h2>
        <div className="puzzle-source__tabs">
          <button
            type="button"
            className={mode === "favorites" ? "is-active" : ""}
            onClick={() => setMode("favorites")}
          >
            Избранное
          </button>
          <button
            type="button"
            className={mode === "upload" ? "is-active" : ""}
            onClick={() => setMode("upload")}
          >
            С диска
          </button>
        </div>
      </div>

      {error ? <p className="muted">{error}</p> : null}

      <div className="memory-setup__cols">
        <section className="memory-panel memory-setup__source">
          <div className="memory-panel__title">Карты</div>
          {mode === "favorites" ? (
            <>
              <input
                className="puzzle-source__search memory-setup__search"
                type="search"
                placeholder="Поиск по тегам…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {visibleTags.length > 0 ? (
                <div className="memory-setup__tags">
                  {visibleTags.map((t) => (
                    <button
                      key={t.tag}
                      type="button"
                      className={`puzzle-source__tag ${selectedTags.includes(t.tag) ? "is-active" : ""}`}
                      onClick={() => toggleTag(t.tag)}
                      title={t.tag}
                    >
                      {contentBooruTags(t.tag).length ? contentBooruTags(t.tag)[0] : t.tag}
                      <span className="puzzle-source__tag-n">{t.count}</span>
                    </button>
                  ))}
                </div>
              ) : null}
              <div className="memory-setup__preview">
                {loading ? (
                  <p className="muted memory-setup__preview-msg">Читаю избранное…</p>
                ) : allMeta.length === 0 ? (
                  <p className="muted memory-setup__preview-msg">
                    В избранном пока нет картинок. Лайкай изображения на сессиях
                    или загрузи файлы с диска.
                  </p>
                ) : poolMeta.length === 0 ? (
                  <p className="muted memory-setup__preview-msg">
                    По фильтру ничего нет — ослабь теги или поиск.
                  </p>
                ) : (
                  previewMeta.map((m) => (
                    <span key={m.id} className="memory-setup__preview-cell">
                      {previewUrls[m.id] ? (
                        <img src={previewUrls[m.id]} alt="" draggable={false} />
                      ) : (
                        <span className="memory-setup__preview-ph" aria-hidden />
                      )}
                    </span>
                  ))
                )}
              </div>
              {poolMeta.length > PREVIEW_LIMIT ? (
                <p className="muted memory-setup__preview-more">
                  …и ещё {poolMeta.length - PREVIEW_LIMIT} в пуле
                </p>
              ) : null}
              <p className="memory-setup__poolline">
                Пул: <strong>{poolMeta.length}</strong> картинок · нужно не меньше{" "}
                {difficulty.pairs}
              </p>
            </>
          ) : (
            <div className="memory-setup__upload">
              <label className="puzzle-source__drop">
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  hidden
                  onChange={(e) => setFiles([...(e.target.files ?? [])])}
                />
                <span>Перетащи или выбери картинки с диска</span>
                <span className="muted">PNG / JPG / WEBP / GIF</span>
              </label>
              <p className="memory-setup__poolline">
                {imageFiles.length === 0
                  ? `Каждая картинка станет парой карт — выбери минимум ${difficulty.pairs}.`
                  : imageFiles.length < difficulty.pairs
                    ? <>Выбрано: <strong>{imageFiles.length}</strong> — мало, нужно {difficulty.pairs}</>
                    : <>Выбрано: <strong>{imageFiles.length}</strong> — хватит</>}
              </p>
            </div>
          )}
        </section>

        <section className="memory-panel memory-setup__config">
          <div className="memory-panel__title">Игра</div>
          <div className="memory-setup__diffs">
            {MEMORY_DIFFICULTIES.map((d) => (
              <button
                key={d.id}
                type="button"
                className={`memory-diff ${difficultyId === d.id ? "is-active" : ""}`}
                onClick={() => onDifficulty(d.id)}
              >
                <strong>{d.labelRu}</strong>
                <span>
                  {d.pairs} пар · {d.cursedPairs} с заданием
                </span>
                <span className="muted">
                  база {d.base} · подглядывание −{d.peekPenalty}
                </span>
              </button>
            ))}
          </div>
          <p className="memory-setup__hint">
            Пары с заданием не помечены на рубашках — узнаешь в момент
            совпадения: выполни — плюс к награде, сорвись — штраф. Серия подряд
            поднимает множитель до ×2, промах жжёт Угольки. Найденная пара на
            пару секунд появится целиком в панели награды.
          </p>
          <button
            type="button"
            className="memory-setup__start"
            disabled={!canStart || loading}
            onClick={start}
          >
            ▶ Начать
          </button>
        </section>
      </div>
    </div>
  );
}
