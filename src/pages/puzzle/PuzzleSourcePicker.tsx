import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  collectAllFavoriteTagStats,
  contentBooruTags,
  favoriteMatchesTagFilter,
  getFavoriteRecord,
  listFavoriteMetadata,
  type FavoriteMetadata,
  type FavoriteTagStat,
} from "../../lib/mediaFavorites";

export interface PickedImage {
  img: HTMLImageElement;
  /** Object URL the caller must revoke when done. */
  objectUrl: string;
  label: string;
}

interface Props {
  onPick: (picked: PickedImage) => void;
  onBack: () => void;
}

type Mode = "favorites" | "random" | "upload";

const PAGE_SIZE = 50;

/** Only still images are puzzle-solvable; drop videos/gifs. */
function isImageMeta(m: FavoriteMetadata): boolean {
  if (m.kind) return m.kind === "image";
  if (m.mime) return m.mime.startsWith("image/");
  return true;
}

export function PuzzleSourcePicker({ onPick, onBack }: Props) {
  const [mode, setMode] = useState<Mode>("favorites");
  const [allMeta, setAllMeta] = useState<FavoriteMetadata[]>([]);
  const [metaLoading, setMetaLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tagStats, setTagStats] = useState<FavoriteTagStat[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [loadedUrls, setLoadedUrls] = useState<Record<string, string>>({});
  const [gridCols, setGridCols] = useState(6);
  const gridWrapRef = useRef<HTMLDivElement>(null);

  /** Auto-fit column count so the page's cells fill the available area at the
   *  largest square size: cols ≈ round(sqrt((W/H) · N)). Recomputed on resize. */
  useEffect(() => {
    const el = gridWrapRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const update = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w <= 0 || h <= 0) return;
      const c = Math.max(
        4,
        Math.min(14, Math.round(Math.sqrt((w / h) * PAGE_SIZE))),
      );
      setGridCols(c);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [mode]);

  /** id → "loading" marker or its live URL; tracks URLs for unmount revoke. */
  const urlCacheRef = useRef<Map<string, string>>(new Map());
  /** Bumped on every page/filter change so stale fetches can self-cancel. */
  const genRef = useRef(0);

  // load lightweight metadata once (no blobs — cheap for large libraries)
  useEffect(() => {
    setMetaLoading(true);
    setError(null);
    listFavoriteMetadata()
      .then((rows) => setAllMeta(rows))
      .catch((e) =>
        setError(e instanceof Error ? e.message : "Не удалось загрузить избранное"),
      )
      .finally(() => setMetaLoading(false));
  }, []);

  useEffect(() => {
    void collectAllFavoriteTagStats().then(setTagStats).catch(() => undefined);
  }, []);

  const filteredMeta = useMemo(
    () =>
      allMeta
        .filter((m) => isImageMeta(m))
        .filter((m) => favoriteMatchesTagFilter(m.tags, selectedTags, search)),
    [allMeta, selectedTags, search],
  );

  // reset to first page whenever the filter changes
  useEffect(() => {
    setOffset(0);
  }, [selectedTags, search]);

  const total = filteredMeta.length;
  const pageStart = useMemo(
    () => Math.min(offset, Math.max(0, total - 1)),
    [offset, total],
  );
  const pageMeta = useMemo(
    () => filteredMeta.slice(pageStart, pageStart + PAGE_SIZE),
    [filteredMeta, pageStart],
  );
  const hasPrev = pageStart > 0;
  const hasNext = pageStart + PAGE_SIZE < total;

  const loadCell = useCallback(async (id: string) => {
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
    setLoadedUrls((prev) => ({ ...prev, [id]: url }));
  }, []);

  // When the page changes: revoke old previews, reset caches, then load every
  // cell as a staggered "wave" from the top-left (index → delay), so all cells
  // on the page fill in one-by-one instead of a single burst.
  useEffect(() => {
    setLoadedUrls((prev) => {
      for (const u of Object.values(prev)) URL.revokeObjectURL(u);
      return {};
    });
    urlCacheRef.current.clear();
    genRef.current += 1;
    const gen = genRef.current;
    const timers: number[] = [];
    pageMeta.forEach((m, i) => {
      const t = window.setTimeout(() => {
        if (gen === genRef.current) void loadCell(m.id);
      }, i * 40);
      timers.push(t);
    });
    return () => {
      for (const t of timers) window.clearTimeout(t);
    };
  }, [pageMeta, loadCell]);

  // Revoke live URLs on unmount; the gen bump cancels in-flight cells that
  // would otherwise create URLs after this cleanup already ran.
  useEffect(
    () => () => {
      genRef.current += 1;
      for (const u of urlCacheRef.current.values()) {
        if (u !== "loading") URL.revokeObjectURL(u);
      }
    },
    [],
  );

  // Tag chips: filter by search query (like Favorites), keep selected always visible.
  const selectedTagSet = useMemo(
    () => new Set(selectedTags.map((t) => t.toLowerCase())),
    [selectedTags],
  );
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
    // While searching, show every match (don't clip); otherwise top 24.
    if (search.trim()) return filteredTagStats;
    return filteredTagStats.slice(0, 24);
  }, [filteredTagStats, search]);

  const toggleTag = (tag: string) => {
    setSelectedTags((cur) =>
      cur.includes(tag) ? cur.filter((t) => t !== tag) : [...cur, tag],
    );
  };

  const pickById = useCallback(
    (id: string, label: string) => {
      // Always fetch a fresh object URL that the caller owns (independent of the
      // preview cache, which gets revoked on page change / unmount).
      getFavoriteRecord(id).then((r) => {
        if (!r) return;
        const objectUrl = URL.createObjectURL(r.blob);
        const img = new Image();
        img.onload = () => onPick({ img, objectUrl, label: r.fileName || label });
        img.onerror = () => {
          URL.revokeObjectURL(objectUrl);
          setError("Не удалось открыть картинку");
        };
        img.src = objectUrl;
      });
    },
    [onPick],
  );

  const pickRandom = useCallback(() => {
    if (filteredMeta.length === 0) return;
    const m = filteredMeta[Math.floor(Math.random() * filteredMeta.length)];
    pickById(m.id, "Избранное");
  }, [filteredMeta, pickById]);

  const onUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => onPick({ img, objectUrl, label: file.name });
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      setError("Не удалось открыть файл");
    };
    img.src = objectUrl;
  };

  const pageEnd = Math.min(pageStart + pageMeta.length, total);

  return (
    <div className="puzzle-source">
      <div className="puzzle-source__bar">
        <button type="button" className="puzzle-btn" onClick={onBack}>
          ← Назад
        </button>
        <h2 className="puzzle-source__title">Выбери картинку</h2>
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
            className={mode === "random" ? "is-active" : ""}
            onClick={() => setMode("random")}
          >
            Случайная
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

      {error ? <p className="puzzle-source__error muted">{error}</p> : null}

      {mode === "upload" ? (
        <div className="puzzle-source__upload">
          <label className="puzzle-source__drop">
            <input type="file" accept="image/*" onChange={onUpload} hidden />
            <span>Перетащи или выбери файл с диска</span>
            <span className="muted">PNG / JPG / WEBP</span>
          </label>
        </div>
      ) : (
        <>
          <div className="puzzle-source__filters">
            <input
              className="puzzle-source__search"
              type="search"
              placeholder="Поиск по тегам…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {visibleTags.length > 0 ? (
              <div className="puzzle-source__tags">
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
            {mode === "random" ? (
              <button
                type="button"
                className="primary puzzle-source__random"
                disabled={metaLoading || filteredMeta.length === 0}
                onClick={pickRandom}
              >
                🎲 Случайная картинка
              </button>
            ) : null}
          </div>

          {mode === "favorites" ? (
            <div className="puzzle-source__main">
              <button
                type="button"
                className="puzzle-source__arrow"
                disabled={!hasPrev}
                onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
                title="Предыдущая страница"
                aria-label="Предыдущая страница"
              >
                ◀
              </button>

              <div
                className="puzzle-source__grid"
                ref={gridWrapRef}
                style={{ gridTemplateColumns: `repeat(${gridCols}, 1fr)` }}
              >
                {!metaLoading && pageMeta.length === 0 ? (
                  <p className="muted puzzle-source__grid-msg">
                    {allMeta.length === 0
                      ? "В избранном пока нет картинок. Лайкай изображения на сессиях или загрузи с диска."
                      : "Ничего не найдено по фильтру."}
                  </p>
                ) : null}
                {pageMeta.map((m, i) => (
                  <button
                    key={m.id}
                    type="button"
                    className="puzzle-source__cell"
                    data-pzid={m.id}
                    data-pzidx={i}
                    style={{ "--i": i } as React.CSSProperties}
                    onClick={() => pickById(m.id, "Избранное")}
                  >
                    {loadedUrls[m.id] ? (
                      <img src={loadedUrls[m.id]} alt="" draggable={false} loading="lazy" />
                    ) : (
                      <span className="puzzle-source__cell-ph" aria-hidden />
                    )}
                  </button>
                ))}
              </div>

              <button
                type="button"
                className="puzzle-source__arrow"
                disabled={!hasNext}
                onClick={() => setOffset((o) => o + PAGE_SIZE)}
                title="Следующая страница"
                aria-label="Следующая страница"
              >
                ▶
              </button>
            </div>
          ) : (
            <div className="puzzle-source__random-info muted">
              {selectedTags.length > 0
                ? `Будет выбрана случайная картинка с тегами: ${selectedTags.join(", ")}`
                : "Будет выбрана случайная картинка из всего избранного."}
              {filteredMeta.length > 0 ? ` Подходящих: ${filteredMeta.length}.` : ""}
            </div>
          )}

          {mode === "favorites" && total > 0 ? (
            <div className="puzzle-source__count muted">
              {pageStart + 1}–{pageEnd} из {total}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
