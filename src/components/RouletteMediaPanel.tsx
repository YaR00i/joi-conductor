import { useEffect, useMemo, useRef, useState } from "react";
import { MediaListCards } from "./MediaListCards";
import { BooruTagInput } from "./BooruTagInput";
import { TagLibraryPanel } from "./TagLibraryPanel";
import { UiCheck } from "./UiCheck";
import {
  rangeWheelItems,
  snapToRange,
  WheelPicker,
  type WheelItem,
} from "./WheelPicker";
import { onWd14RuntimeProgress } from "../lib/wd14Tagger";
import { isListMediaType, MEDIA_TYPE_CATALOG } from "../lib/contentCatalog";
import type { ContentUnlockLists } from "../lib/contentUnlocks";
import {
  BOORU_RATING_CATALOG,
  type BooruRatingId,
} from "../lib/booruRating";
import { booruNeedsKey } from "../lib/booruFetch";
import { BOORU_SITE_IDS, booruSite, type BooruSiteId } from "../lib/booruSites";
import type { MediaSettings } from "../lib/media";
import {
  MEDIA_QUEUE_MAX,
  MEDIA_QUEUE_MIN,
  MEDIA_QUEUE_STEP,
  snapMediaQueueSize,
} from "../lib/mediaQueue";
import type { PlaylistPreloadStatus } from "../lib/mediaPreload";
import type { GelbooruListOption } from "../lib/gelbooruLists";
import {
  getActiveMistress,
} from "../lib/mistress";
import {
  buildMistressMediaQuery,
  loadSecondaryCachePrefs,
  saveSecondaryCachePrefs,
  SECONDARY_BOORU_DEFS,
  type SecondaryBooruId,
} from "../lib/mistress/secondaryCache";
import {
  playUiClick,
  playUiConfirm,
  primeUiAudio,
} from "../lib/uiSound";

export type RouletteMediaPanelProps = {
  media: MediaSettings;
  mediaCount: number;
  favoritesCount: number;
  mediaLoading: boolean;
  mediaError: string | null;
  mediaSaveStatus: string | null;
  playlistPreload: PlaylistPreloadStatus;
  unlocks: ContentUnlockLists;
  onMedia: (next: MediaSettings) => void;
  onLoadGelbooru: () => void;
  onLoadMediaList?: () => void;
  onAssembleMediaList?: () => void;
  mediaLists?: ReadonlyArray<GelbooruListOption>;
  onPickLocal: (files: FileList) => void;
  onSaveMedia: () => void;
  wd14Status?: { backend: string; online: boolean; detail: string } | null;
  tagProgress?: { done: number; total: number } | null;
  onStartWd14?: () => void | Promise<unknown>;
  onRefreshWd14?: () => void;
  onOpenContentLists?: () => void;
};

const SOURCE_ITEMS: WheelItem<MediaSettings["source"]>[] = [
  { value: "gelbooru", label: "Booru" },
  { value: "favorites", label: "Избранное" },
  { value: "local", label: "Локально" },
];

const RATING_ITEMS: WheelItem<BooruRatingId>[] = BOORU_RATING_CATALOG.map(
  (row) => ({
    value: row.id,
    label: row.labelRu,
  }),
);

type QueueFill = "list" | "search";
type SearchMediaTypeId = Exclude<MediaSettings["mediaTypeId"], "list">;

const QUEUE_FILL_ITEMS: WheelItem<QueueFill>[] = [
  { value: "list", label: "Список" },
  { value: "search", label: "Поиск" },
];

const SEARCH_TYPE_ITEMS: WheelItem<SearchMediaTypeId>[] =
  MEDIA_TYPE_CATALOG.filter((m) => m.id !== "list").map((m) => ({
    value: m.id as SearchMediaTypeId,
    label: m.labelRu,
  }));

function isSearchMediaTypeId(id: MediaSettings["mediaTypeId"]): id is SearchMediaTypeId {
  return id !== "list";
}

export function RouletteMediaPanel({
  media,
  mediaCount,
  favoritesCount,
  mediaLoading,
  mediaError,
  mediaSaveStatus,
  playlistPreload,
  unlocks,
  onMedia,
  onLoadGelbooru,
  onLoadMediaList,
  onAssembleMediaList,
  mediaLists = [],
  onPickLocal,
  onSaveMedia,
  wd14Status,
  tagProgress,
  onStartWd14,
  onRefreshWd14,
  onOpenContentLists,
}: RouletteMediaPanelProps) {
  const site = media.booruSite ?? "gelbooru";
  const siteLabel = booruSite(site).label;
  const limitItems = useMemo(
    () => rangeWheelItems(MEDIA_QUEUE_MIN, MEDIA_QUEUE_MAX, MEDIA_QUEUE_STEP),
    [],
  );
  const slideItems = useMemo(
    () => rangeWheelItems(3, 60, 1, (n) => `${n}с`),
    [],
  );
  const usingList =
    media.source === "gelbooru" && isListMediaType(media.mediaTypeId);
  const lastSearchTypeRef = useRef<SearchMediaTypeId>("all");
  if (isSearchMediaTypeId(media.mediaTypeId)) {
    lastSearchTypeRef.current = media.mediaTypeId;
  }
  const searchType: SearchMediaTypeId = isSearchMediaTypeId(media.mediaTypeId)
    ? media.mediaTypeId
    : lastSearchTypeRef.current;
  const keyed =
    !booruNeedsKey(site) ||
    Boolean(media.gelbooruUserId.trim() && media.gelbooruApiKey.trim());
  const listValue =
    (media.listId && mediaLists.some((row) => row.id === media.listId)
      ? media.listId
      : mediaLists[0]?.id) ?? "";

  function setSite(next: BooruSiteId) {
    onMedia({
      ...media,
      booruSite: next,
      listId: null,
    });
  }

  function setSource(source: MediaSettings["source"]) {
    const leavingBooru = source !== "gelbooru";
    onMedia({
      ...media,
      source,
      mediaTypeId:
        leavingBooru && isListMediaType(media.mediaTypeId)
          ? lastSearchTypeRef.current
          : media.mediaTypeId,
    });
  }

  function setQueueFill(fill: QueueFill) {
    if (fill === "list") {
      onMedia({
        ...media,
        source: "gelbooru",
        mediaTypeId: "list",
        listId: media.listId ?? mediaLists[0]?.id ?? null,
      });
      return;
    }
    onMedia({
      ...media,
      mediaTypeId: lastSearchTypeRef.current,
    });
  }

  const slideWheel = (
    <WheelPicker
      label="Смена кадра"
      hint="Секунды на фото и порог «короткого» клипа."
      items={slideItems}
      value={snapToRange(media.slideSec, 3, 60, 1)}
      onChange={(slideSec) => onMedia({ ...media, slideSec })}
    />
  );

  return (
    <div className="roulette-hub__panel">
      <section className="hub-wheels__section hub-wheels__section--fire">
        <div className="hub-media__source">
          <WheelPicker
            label="Откуда"
            hint={
              media.source === "gelbooru"
                ? `Доска Контента · ${siteLabel}. Ключи Gelbooru — в Настройках.`
                : media.source === "favorites"
                  ? "Сессия из сохранённой полки."
                  : "Файлы с диска. Теги магазина не действуют."
            }
            items={SOURCE_ITEMS}
            value={media.source}
            itemWidth={100}
            onChange={setSource}
          />
          {media.source === "gelbooru" ? (
            <div
              className="hub-booru-sites"
              role="group"
              aria-label="Доска"
            >
              {BOORU_SITE_IDS.map((id) => (
                <button
                  key={id}
                  type="button"
                  className={`hub-booru-sites__btn${site === id ? " is-active" : ""}`}
                  onClick={() => {
                    if (id === site) {
                      playUiClick(0.6);
                      return;
                    }
                    void primeUiAudio();
                    playUiClick();
                    setSite(id);
                  }}
                >
                  {booruSite(id).label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        {media.source !== "local" ? (
          <WheelPicker
            label="Накал"
            hint={
              BOORU_RATING_CATALOG.find((row) => row.id === media.rating)
                ?.hintRu ?? "Рейтинг доски. Спин берёт это значение."
            }
            items={RATING_ITEMS}
            value={media.rating ?? "explicit"}
            itemWidth={118}
            onChange={(rating) => onMedia({ ...media, rating })}
          />
        ) : null}
        {media.source === "gelbooru" ? (
          <>
            <WheelPicker
              label="Очередь"
              hint={
                usingList
                  ? `Готовая колода с ${siteLabel} — те же списки, что Контент.`
                  : `Собрать с ${siteLabel} по тегам и типу.`
              }
              items={QUEUE_FILL_ITEMS}
              value={usingList ? "list" : "search"}
              itemWidth={110}
              onChange={setQueueFill}
            />
            {usingList ? (
              <div className="hub-media__pick">
                <MediaListCards
                  lists={mediaLists}
                  selectedId={listValue}
                  onSelect={(listId) =>
                    onMedia({ ...media, listId, source: "gelbooru" })
                  }
                  onAssemble={onAssembleMediaList}
                  assembling={mediaLoading}
                  keyed={keyed}
                />
                {mediaLists.length === 0 && onOpenContentLists ? (
                  <button
                    type="button"
                    className="hub-ember-btn"
                    onClick={() => {
                      void primeUiAudio();
                      playUiClick();
                      onOpenContentLists();
                    }}
                  >
                    Открыть списки в Контенте
                  </button>
                ) : null}
              </div>
            ) : (
              <WheelPicker
                label="Тип"
                hint="Фото, гифки, видео — тот же фильтр, что на колесе рулетки."
                items={SEARCH_TYPE_ITEMS}
                value={searchType}
                itemWidth={128}
                onChange={(mediaTypeId) =>
                  onMedia({ ...media, mediaTypeId })
                }
              />
            )}
          </>
        ) : media.source === "favorites" ? (
          <WheelPicker
            label="Тип"
            hint="Фильтр полки. Список — только на Booru."
            items={SEARCH_TYPE_ITEMS}
            value={searchType}
            itemWidth={128}
            onChange={(mediaTypeId) => onMedia({ ...media, mediaTypeId })}
          />
        ) : null}
        <div className="hub-wheels__row">
          {media.source === "gelbooru" ? (
            <WheelPicker
              label={usingList ? "Длина автоочереди" : "Лимит постов"}
              hint={
                usingList
                  ? "Сколько постов собрать карточкой госпожи (80–140)."
                  : `Сколько тянуть в сессию с ${siteLabel} (80–140).`
              }
              items={limitItems}
              value={snapMediaQueueSize(media.limit)}
              onChange={(limit) => onMedia({ ...media, limit })}
            />
          ) : null}
          {slideWheel}
        </div>
      </section>

      {media.source === "gelbooru" ? (
        <section className="hub-wheels__section hub-wheels__section--fire hub-media">
          {usingList ? (
            <div className="hub-media__head">
              <span className="hub-media__title">В сессию</span>
              <span className="hub-media__sub">
                Выбранная колода — как есть. Карточка госпожи собирает новую.
              </span>
            </div>
          ) : (
            <>
              <div className="hub-media__head">
                <span className="hub-media__title">Теги</span>
                <span className="hub-media__sub">
                  ✓ куплен · ✕ в магазине — автодополнение по unlocks
                </span>
              </div>
              <div className="hub-media__tags">
                <BooruTagInput
                  value={media.tags}
                  onChange={(tags) => onMedia({ ...media, tags })}
                  placeholder="soles feet"
                  unlocks={unlocks}
                />
              </div>
              <TagLibraryPanel
                unlocks={unlocks}
                tags={media.tags}
                onTagsChange={(tags) => onMedia({ ...media, tags })}
              />
              {site === "gelbooru" ? (
                <SecondaryCacheStub
                  onApplyFallbackTags={(extra) => {
                    const next = `${media.tags} ${extra}`
                      .replace(/\s+/g, " ")
                      .trim();
                    onMedia({ ...media, tags: next });
                  }}
                />
              ) : null}
            </>
          )}
          <div className="hub-media__actions">
            <button
              type="button"
              className="hub-ember-btn hub-ember-btn--primary"
              disabled={
                mediaLoading ||
                (usingList && (!listValue || !onLoadMediaList))
              }
              onClick={() => {
                void primeUiAudio();
                playUiConfirm();
                if (usingList) onLoadMediaList?.();
                else onLoadGelbooru();
              }}
            >
              {mediaLoading
                ? usingList
                  ? "Ставлю…"
                  : "Тяну…"
                : usingList
                  ? "Поставить список в сессию"
                  : `Подтянуть с ${siteLabel}`}
            </button>
            <button
              type="button"
              className="hub-ember-btn"
              onClick={() => {
                void primeUiAudio();
                playUiClick();
                onSaveMedia();
              }}
            >
              Сохранить
            </button>
            <span className="hub-media__stat">
              Плейлист <strong>{mediaCount}</strong>
              {mediaSaveStatus ? (
                <em> · {mediaSaveStatus}</em>
              ) : null}
              {mediaError ? (
                <em className="hub-media__err"> · {mediaError}</em>
              ) : null}
            </span>
          </div>
          {playlistPreload.total > 0 &&
          (playlistPreload.active ||
            playlistPreload.done < playlistPreload.total) ? (
            <div
              className="hub-media__preload"
              role="status"
              aria-live="polite"
            >
              <div className="hub-media__preload-track">
                <div
                  className="hub-media__preload-fill"
                  style={{ width: `${playlistPreload.percent}%` }}
                />
              </div>
              <p>
                Кэш {playlistPreload.ready}/{playlistPreload.total}
                {playlistPreload.failed > 0
                  ? ` · ошибок ${playlistPreload.failed}`
                  : ""}{" "}
                · {playlistPreload.percent}%
              </p>
            </div>
          ) : null}
        </section>
      ) : media.source === "favorites" ? (
        <section className="hub-wheels__section hub-wheels__section--fire hub-media">
          <div className="hub-media__head">
            <span className="hub-media__title">Фильтр тегов</span>
            <span className="hub-media__sub">
              В избранном: {favoritesCount} · unlocks учитываются при старте
            </span>
          </div>
          <div className="hub-media__tags">
            <BooruTagInput
              value={media.tags}
              onChange={(tags) => onMedia({ ...media, tags })}
              placeholder="feet soles …"
              unlocks={unlocks}
            />
          </div>
          <TagLibraryPanel
            unlocks={unlocks}
            tags={media.tags}
            onTagsChange={(tags) => onMedia({ ...media, tags })}
          />
          <div className="hub-media__actions">
            <button
              type="button"
              className="hub-ember-btn"
              onClick={() => {
                void primeUiAudio();
                playUiClick();
                onSaveMedia();
              }}
            >
              Сохранить
            </button>
            <span className="hub-media__stat">
              Плейлист <strong>{mediaCount}</strong>
              {mediaSaveStatus ? <em> · {mediaSaveStatus}</em> : null}
              {mediaError ? (
                <em className="hub-media__err"> · {mediaError}</em>
              ) : null}
            </span>
          </div>
        </section>
      ) : (
        <section className="hub-wheels__section hub-wheels__section--fire hub-media">
          <div className="hub-media__head">
            <span className="hub-media__title">Локальные файлы</span>
            <span className="hub-media__sub">
              Правила тегов магазина не действуют — контент как есть
            </span>
          </div>
          <div className="hub-local-pick">
            <label className="hub-file">
              <span>Папка</span>
              <input
                type="file"
                accept="image/*,video/*,.gif,.webm,.mp4"
                multiple
                ref={(el) => {
                  if (el) el.setAttribute("webkitdirectory", "");
                }}
                onChange={(e) => {
                  if (e.target.files?.length) {
                    void primeUiAudio();
                    playUiClick();
                    onPickLocal(e.target.files);
                  }
                }}
              />
            </label>
            <label className="hub-file">
              <span>Файлы</span>
              <input
                type="file"
                accept="image/*,video/*,.gif,.webm,.mp4"
                multiple
                onChange={(e) => {
                  if (e.target.files?.length) {
                    void primeUiAudio();
                    playUiClick();
                    onPickLocal(e.target.files);
                  }
                }}
              />
            </label>
          </div>
          <Wd14Panel
            wd14Status={wd14Status}
            tagProgress={tagProgress}
            autoTagOnImport={media.autoTagOnImport}
            onStartWd14={onStartWd14}
            onRefreshWd14={onRefreshWd14}
            onToggleAutoTag={(v) => onMedia({ ...media, autoTagOnImport: v })}
          />
          <div className="hub-media__actions">
            <button
              type="button"
              className="hub-ember-btn"
              onClick={() => {
                void primeUiAudio();
                playUiClick();
                onSaveMedia();
              }}
            >
              Сохранить
            </button>
            <span className="hub-media__stat">
              Плейлист <strong>{mediaCount}</strong>
              {mediaSaveStatus ? <em> · {mediaSaveStatus}</em> : null}
              {mediaError ? (
                <em className="hub-media__err"> · {mediaError}</em>
              ) : null}
            </span>
          </div>
        </section>
      )}
    </div>
  );
}

function SecondaryCacheStub({
  onApplyFallbackTags,
}: {
  onApplyFallbackTags: (tags: string) => void;
}) {
  const pack = getActiveMistress();
  const ids = pack.media.secondaryBooruIds;
  const [prefs, setPrefs] = useState(() => loadSecondaryCachePrefs());

  if (ids.length === 0) return null;

  const setEnabled = (id: SecondaryBooruId, on: boolean) => {
    const next = {
      enabled: { ...prefs.enabled, [id]: on },
    };
    setPrefs(next);
    saveSecondaryCachePrefs(next);
  };

  const enabledIds = ids.filter((id) => prefs.enabled[id]);

  return (
    <div className="hub-secondary-cache">
      <div className="hub-media__head">
        <span className="hub-media__title">Gelbooru bias</span>
        <span className="hub-media__sub">
          Доп. теги в запрос Gelbooru. Отдельного хоста нет.
        </span>
      </div>
      <div className="hub-secondary-cache__list">
        {ids.map((id) => {
          const def = SECONDARY_BOORU_DEFS[id];
          return (
            <UiCheck
              key={id}
              className="ui-check--inline"
              checked={Boolean(prefs.enabled[id])}
              onChange={(v) => setEnabled(id, v)}
            >
              {def.labelRu}
              <span className="hub-secondary-cache__bias">
                {" "}
                · {def.biasLabelRu}
              </span>
            </UiCheck>
          );
        })}
      </div>
      <button
        type="button"
        className="hub-ember-btn"
        disabled={enabledIds.length === 0}
        onClick={() => {
          void primeUiAudio();
          playUiClick();
          const q = buildMistressMediaQuery({
            primaryDefaultTags: "",
            focusTags: pack.media.focusTags,
            secondaryBooruIds: ids,
            enabledSecondary: enabledIds,
            includeFocus: true,
          });
          onApplyFallbackTags(q);
        }}
      >
        Добавить bias-теги в запрос
      </button>
      <button
        type="button"
        className="hub-ember-btn"
        onClick={() => {
          void primeUiAudio();
          playUiClick();
          onApplyFallbackTags(pack.media.primaryDefaultTags);
        }}
      >
        Подставить теги Госпожи
      </button>
    </div>
  );
}

function Wd14Panel({
  wd14Status,
  tagProgress,
  autoTagOnImport,
  onStartWd14,
  onRefreshWd14,
  onToggleAutoTag,
}: {
  wd14Status?: { backend: string; online: boolean; detail: string } | null;
  tagProgress?: { done: number; total: number } | null;
  autoTagOnImport: boolean;
  onStartWd14?: () => void | Promise<unknown>;
  onRefreshWd14?: () => void;
  onToggleAutoTag: (v: boolean) => void;
}) {
  const [runtime, setRuntime] = useState<{
    phase: string;
    pct: number;
  } | null>(null);
  const [starting, setStarting] = useState(false);
  const backend = wd14Status?.backend ?? "none";
  const online = Boolean(wd14Status?.online);
  const tone = online
    ? "is-online"
    : backend === "none"
      ? "is-offline"
      : "is-offline";
  const tagPct =
    tagProgress && tagProgress.total > 0
      ? Math.round((tagProgress.done / tagProgress.total) * 100)
      : 0;
  const installing = starting || (runtime !== null && runtime.pct < 100);

  useEffect(() => {
    return onWd14RuntimeProgress((p) => {
      setRuntime({ phase: p.phase, pct: p.pct });
    });
  }, []);

  useEffect(() => {
    if (online) setRuntime(null);
  }, [online]);

  return (
    <div className={`hub-wd14 ${tone}`}>
      <div className="hub-wd14__row">
        <span className="hub-wd14__label">
          WD14 автотеги{" "}
          <em className="hub-wd14__detail">
            {online
              ? `· ${wd14Status?.detail ?? "онлайн"}`
              : `· ${wd14Status?.detail ?? "офлайн"}`}
          </em>
        </span>
        <label className="hub-wd14__toggle">
          <input
            type="checkbox"
            checked={autoTagOnImport}
            onChange={(e) => onToggleAutoTag(e.target.checked)}
          />
          <span>при импорте</span>
        </label>
      </div>
      {runtime && !online ? (
        <div className="hub-wd14__progress" aria-live="polite">
          <div
            className="hub-wd14__progress-bar"
            style={{ width: `${Math.max(0, Math.min(100, runtime.pct))}%` }}
          />
          <span className="hub-wd14__progress-text">
            {runtime.phase} ({runtime.pct}%)
          </span>
        </div>
      ) : null}
      {tagProgress ? (
        <div className="hub-wd14__progress" aria-live="polite">
          <div
            className="hub-wd14__progress-bar"
            style={{ width: `${tagPct}%` }}
          />
          <span className="hub-wd14__progress-text">
            Тегирование {tagProgress.done}/{tagProgress.total} ({tagPct}%)
          </span>
        </div>
      ) : null}
      <div className="hub-wd14__actions">
        <button
          type="button"
          className="hub-ember-btn hub-ember-btn--sm"
          disabled={!onStartWd14 || installing}
          onClick={() => {
            void primeUiAudio();
            playUiClick();
            setStarting(true);
            void Promise.resolve(onStartWd14?.()).finally(() => {
              setStarting(false);
            });
          }}
        >
          {installing ? "Ставлю среду…" : "Запустить сервер"}
        </button>
        <button
          type="button"
          className="hub-ember-btn hub-ember-btn--sm"
          disabled={!onRefreshWd14 || installing}
          onClick={() => {
            void primeUiAudio();
            playUiClick();
            onRefreshWd14?.();
          }}
        >
          Проверить
        </button>
      </div>
      {!online ? (
        <p className="hub-wd14__hint">
          Первый старт сам ставит Python-среду и onnx (~440 МБ) в данные
          приложения. Без сервера локальные файлы получают теги из имени файла.
        </p>
      ) : null}
    </div>
  );
}
