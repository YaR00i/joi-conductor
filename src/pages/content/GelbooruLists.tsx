import { useEffect, useRef, useState, type ReactNode } from "react";
import { WheelPicker } from "../../components/WheelPicker";
import { MEDIA_QUEUE_SIZES, snapMediaQueueSize, type MediaQueueSize } from "../../lib/mediaQueue";
import {
  DEFAULT_GELBOORU_LIST_NAME,
  GELBOORU_LIST_NOTE_MAX,
  gelbooruListCanResume,
  gelbooruListDeckUrls,
  gelbooruListItemLabel,
  gelbooruListOrigin,
  gelbooruItemOnShelf,
  gelbooruListResumeIndex,
  gelbooruListUnsavedItems,
  type GelbooruPlayList,
} from "../../lib/gelbooruLists";
import {
  EMPTY_READING_LIST_PLAY_STATS,
  formatReadingPlayStats,
  readingPlayStatsCaption,
} from "../../lib/doujin/readingListPlayStats";
import { masonryPreviewSrc, type MediaItem } from "../../lib/media";
import { isMediaCached } from "../../lib/mediaPreload";
import { listDownloadJobId } from "../../lib/favoriteSaveQueue";
import { getActiveMistress, subscribeActiveMistress } from "../../lib/mistress";
import { moodFromScore } from "../../lib/moodEngine";
import {
  CONTROL_CHANGED_EVENT,
  loadControlState,
} from "../../lib/soul/control";
import { DoujinListDeck } from "../doujin/DoujinListDeck";
import {
  DoujinListTileActions,
  type ListTileCacheState,
} from "../doujin/DoujinListTileActions";
import { GelbooruFeed } from "./GelbooruFeed";
import { useFavColumnCount } from "./favWallLayout";

type Props = {
  lists: GelbooruPlayList[];
  openListId: string | null;
  savedIds: Set<string>;
  listedIds: Set<string>;
  busyIds?: ReadonlySet<string>;
  assembleBusy?: boolean;
  assembleError?: string | null;
  keyed: boolean;
  queueSize: MediaQueueSize;
  onQueueSize: (size: MediaQueueSize) => void;
  onOpenList: (id: string | null) => void;
  onCreate: (name: string) => void | Promise<void>;
  onRename: (id: string, name: string) => void;
  onNote: (id: string, note: string) => void;
  onDelete: (id: string) => void;
  onRemoveItem: (listId: string, itemId: string) => void;
  onMoveItem: (listId: string, from: number, to: number) => void;
  onToggleSave: (item: MediaItem) => void;
  onDownloadList: (listId: string) => void;
  onSaveList: (listId: string) => void;
  onOpenLists: (item: MediaItem) => void;
  onAssemble: (size: MediaQueueSize) => void;
  onPlaySession: (listId: string) => void;
  onStartRun: (listId: string) => void;
  onCursor: (listId: string, index: number) => void;
  listPlay?: { listId: string; index: number; gen: number } | null;
  runHud?: ReactNode;
  onRunNote?: (list: GelbooruPlayList, index: number) => void;
  onRunHitEnd?: (listId: string) => void;
  onRunRequestClose?: (close: () => void) => void;
};

function nextListName(lists: GelbooruPlayList[]): string {
  const used = new Set(lists.map((list) => list.name));
  if (!used.has(DEFAULT_GELBOORU_LIST_NAME)) return DEFAULT_GELBOORU_LIST_NAME;
  for (let n = 2; n < 1000; n += 1) {
    const name = `${DEFAULT_GELBOORU_LIST_NAME} ${n}`;
    if (!used.has(name)) return name;
  }
  return DEFAULT_GELBOORU_LIST_NAME;
}

const ASSEMBLE_HINT = "связка вкуса полки · как плейлист рулетки";

function postsLabel(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n} пост`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return `${n} поста`;
  }
  return `${n} постов`;
}

function listCachePending(
  list: GelbooruPlayList,
  savedIds: ReadonlySet<string>,
  busyIds?: ReadonlySet<string>,
): number {
  return list.items.filter(
    (item) =>
      !gelbooruItemOnShelf(item, savedIds) &&
      !isMediaCached(item.id) &&
      !busyIds?.has(listDownloadJobId(item.id)),
  ).length;
}

function gelbooruListTileCacheState(
  list: GelbooruPlayList,
  savedIds: ReadonlySet<string>,
  busyIds?: ReadonlySet<string>,
): ListTileCacheState {
  if (list.items.length === 0) return "idle";
  const running = list.items.some((item) =>
    busyIds?.has(listDownloadJobId(item.id)),
  );
  if (running) return "running";
  if (listCachePending(list, savedIds, busyIds) === 0) return "done";
  return "idle";
}

function kindLabel(kind: GelbooruPlayList["items"][number]["kind"]): string {
  if (kind === "video") return "видео";
  if (kind === "gif") return "gif";
  return "фото";
}

function activeMistressPortrait(): { src: string; name: string } {
  const pack = getActiveMistress();
  const mood = moodFromScore(loadControlState(pack.id).moodScore);
  return {
    src: pack.assets.moodAvatar[mood] ?? pack.assets.avatarFull,
    name: pack.displayNameRu,
  };
}

function useMistressPortrait(): { src: string; name: string } {
  const [portrait, setPortrait] = useState(activeMistressPortrait);
  useEffect(() => {
    const sync = () => setPortrait(activeMistressPortrait());
    window.addEventListener(CONTROL_CHANGED_EVENT, sync);
    const unsub = subscribeActiveMistress(sync);
    return () => {
      window.removeEventListener(CONTROL_CHANGED_EVENT, sync);
      unsub();
    };
  }, []);
  return portrait;
}

export function GelbooruLists({
  lists,
  openListId,
  savedIds,
  listedIds,
  busyIds,
  assembleBusy = false,
  assembleError = null,
  keyed,
  queueSize,
  onQueueSize,
  onOpenList,
  onCreate,
  onRename,
  onNote,
  onDelete,
  onRemoveItem,
  onMoveItem,
  onToggleSave,
  onDownloadList,
  onSaveList,
  onOpenLists,
  onAssemble,
  onPlaySession,
  onStartRun,
  onCursor,
  listPlay = null,
  runHud = null,
  onRunNote,
  onRunHitEnd,
  onRunRequestClose,
}: Props) {
  const open = lists.find((list) => list.id === openListId) ?? null;
  const [rename, setRename] = useState<string | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [startId, setStartId] = useState<string | null>(null);
  const [startGen, setStartGen] = useState(0);
  const pendingPlayRef = useRef<{ listId: string; index: number } | null>(
    null,
  );
  const nameRef = useRef<HTMLInputElement>(null);
  const portrait = useMistressPortrait();
  const columns = Math.min(2, useFavColumnCount());

  function playAt(list: GelbooruPlayList, index: number) {
    const item = list.items[index];
    if (!item) return;
    pendingPlayRef.current = { listId: list.id, index };
    setPicked(index);
    setStartId(item.id);
    setStartGen((n) => n + 1);
    onCursor(list.id, index);
    if (openListId !== list.id) onOpenList(list.id);
    else pendingPlayRef.current = null;
  }

  async function createList() {
    setBusy(true);
    setError(null);
    try {
      await onCreate(nextListName(lists));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось создать список");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    setPicked(null);
    setConfirmDelete(false);
    setRename(null);
    setNoteOpen(false);
    setNoteDraft("");
    const pending = pendingPlayRef.current;
    pendingPlayRef.current = null;
    if (pending && pending.listId === openListId) {
      const list = lists.find((row) => row.id === pending.listId);
      const item = list?.items[pending.index];
      if (item) {
        setPicked(pending.index);
        setStartId(item.id);
        setStartGen((n) => n + 1);
        return;
      }
    }
    setStartId(null);
    setStartGen(0);
  }, [openListId]);

  useEffect(() => {
    if (!listPlay) return;
    const list = lists.find((row) => row.id === listPlay.listId);
    if (!list) return;
    playAt(list, listPlay.index);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- gen is the trigger
  }, [listPlay?.gen]);

  useEffect(() => {
    if (!open) return;
    setNoteDraft(open.note);
    setNoteOpen(open.note.trim().length > 0);
  }, [open?.id, open?.note]);

  const editingName = rename !== null;
  useEffect(() => {
    if (!editingName) return;
    nameRef.current?.focus();
    nameRef.current?.select();
  }, [editingName]);

  function commitOpenName() {
    if (!open || rename === null) return;
    const name = rename.trim() || open.name;
    if (name !== open.name) onRename(open.id, name);
    setRename(null);
  }

  function commitOpenNote() {
    if (!open) return;
    if (noteDraft === open.note) return;
    onNote(open.id, noteDraft);
  }

  const resume = open ? gelbooruListResumeIndex(open) : 0;
  const selectedIndex = open
    ? Math.min(
        Math.max(0, picked ?? resume),
        Math.max(0, open.items.length - 1),
      )
    : 0;

  if (open) {
    const canResume = gelbooruListCanResume(open);
    return (
      <div className="doujin-lists doujin-lists--detail">
        <header className="doujin-lists__toolbar">
          <button
            type="button"
            className="btn-ghost doujin-lists__back"
            onClick={() => onOpenList(null)}
          >
            <BackIcon />
            К спискам
          </button>
          <div className="doujin-lists__brand">
            <form
              className={
                "doujin-lists__rename" + (editingName ? " is-editing" : "")
              }
              onSubmit={(e) => {
                e.preventDefault();
                commitOpenName();
              }}
            >
              <button
                type="button"
                className={
                  "doujin-lists__pencil" + (editingName ? " is-on" : "")
                }
                title="Переименовать"
                aria-label="Переименовать"
                aria-pressed={editingName}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  if (editingName) {
                    commitOpenName();
                    return;
                  }
                  setRename(open.name);
                }}
              >
                <PencilIcon />
              </button>
              {editingName && rename !== null ? (
                <input
                  ref={nameRef}
                  value={rename}
                  size={Math.max(6, rename.length + 1)}
                  onChange={(e) => setRename(e.target.value)}
                  onBlur={commitOpenName}
                  onKeyDown={(e) => {
                    if (e.key !== "Escape") return;
                    e.preventDefault();
                    setRename(null);
                  }}
                  aria-label="Название списка"
                />
              ) : (
                <h2 className="doujin-lists__name">{open.name}</h2>
              )}
              <button
                type="button"
                className={
                  "doujin-lists__note-btn" + (noteOpen ? " is-on" : "")
                }
                aria-pressed={noteOpen}
                title="Описание очереди"
                onClick={() => {
                  if (noteOpen) commitOpenNote();
                  setNoteOpen((on) => !on);
                }}
              >
                Описание
              </button>
            </form>
            <p className="doujin-lists__brand-meta">
              <span>{postsLabel(open.items.length)}</span>
              <span aria-hidden>·</span>
              <span>
                {gelbooruListOrigin(open) === "mistress"
                  ? "её очередь"
                  : "своя очередь"}
              </span>
              <span aria-hidden>·</span>
              <span className="doujin-lists__play-stats">
                {formatReadingPlayStats(
                  open.playStats ?? EMPTY_READING_LIST_PLAY_STATS,
                )}
              </span>
            </p>
          </div>
          <button
            type="button"
            className={
              "btn-ghost doujin-lists__delete" +
              (confirmDelete ? " is-danger" : "")
            }
            onClick={() => {
              if (!confirmDelete) {
                setConfirmDelete(true);
                return;
              }
              onDelete(open.id);
              setConfirmDelete(false);
            }}
          >
            <TrashIcon />
            {confirmDelete ? "Удалить?" : "Удалить"}
          </button>
        </header>
        {noteOpen ? (
          <textarea
            className="gelbooru-lists__note"
            value={noteDraft}
            maxLength={GELBOORU_LIST_NOTE_MAX}
            placeholder="Сюда пишется, какие теги подтянули. Можно дописать своё."
            aria-label="Описание списка"
            onChange={(e) => setNoteDraft(e.target.value)}
            onBlur={commitOpenNote}
          />
        ) : null}
        {open.items.length === 0 ? (
          <div className="doujin-empty">
            <p className="muted">
              Пусто. Закладка на карточке в ленте добавит пост сюда.
            </p>
          </div>
        ) : (
          <div className="doujin-lists__split">
            <ol className="doujin-lists__queue">
              {open.items.map((item, index) => {
                const cover = masonryPreviewSrc(item);
                const on =
                  index === selectedIndex
                    ? " is-on"
                    : index === resume
                      ? " is-cursor"
                      : "";
                return (
                  <li
                    key={`${open.id}-${item.id}`}
                    className={"doujin-lists__row" + on}
                    draggable
                    onDragStart={() => setDragFrom(index)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => {
                      if (dragFrom == null) return;
                      onMoveItem(open.id, dragFrom, index);
                      setDragFrom(null);
                    }}
                  >
                    <div className="doujin-lists__pick">
                      <div className="doujin-lists__order">
                        <span className="doujin-lists__handle" title="Перетащить">
                          {index + 1}
                        </span>
                        <div className="doujin-lists__nudge">
                          <button
                            type="button"
                            className="doujin-lists__icon"
                            disabled={index === 0}
                            aria-label="Выше"
                            title="Выше"
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.stopPropagation();
                              onMoveItem(open.id, index, index - 1);
                              setPicked(index - 1);
                            }}
                          >
                            <ChevronIcon dir="up" />
                          </button>
                          <button
                            type="button"
                            className="doujin-lists__icon"
                            disabled={index === open.items.length - 1}
                            aria-label="Ниже"
                            title="Ниже"
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.stopPropagation();
                              onMoveItem(open.id, index, index + 1);
                              setPicked(index + 1);
                            }}
                          >
                            <ChevronIcon dir="down" />
                          </button>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="doujin-lists__pick-main"
                        onClick={() => setPicked(index)}
                      >
                        <span className="doujin-lists__cover-btn" aria-hidden>
                          {cover ? (
                            <img src={cover} alt="" />
                          ) : (
                            <span className="doujin-lists__cover-ph" />
                          )}
                        </span>
                        <span className="doujin-lists__meta">
                          <span className="doujin-lists__title">
                            {gelbooruListItemLabel(item)}
                          </span>
                          <span className="doujin-lists__sub">
                            {kindLabel(item.kind)}
                            {item.gelbooruId ? ` · #${item.gelbooruId}` : ""}
                          </span>
                        </span>
                      </button>
                      <button
                        type="button"
                        className="doujin-lists__drop"
                        aria-label="Убрать"
                        title="Убрать"
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          const next = Math.max(0, index - 1);
                          onRemoveItem(open.id, item.id);
                          setPicked(next);
                        }}
                      >
                        <CloseIcon />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ol>
            <div className="gelbooru-lists__wall">
              <GelbooruFeed
                items={open.items}
                loading={false}
                hasMore={false}
                savedIds={savedIds}
                listedIds={listedIds}
                emptyHint=""
                columnCount={columns}
                highlightId={open.items[selectedIndex]?.id ?? null}
                startId={startId}
                startGen={startGen}
                busyIds={busyIds}
                onLoadMore={() => undefined}
                onToggleSave={onToggleSave}
                onOpenLists={onOpenLists}
                onViewIndex={(index) => {
                  setPicked(index);
                  onCursor(open.id, index);
                  onRunNote?.(open, index);
                }}
                onRequestClose={onRunRequestClose}
                onHitEnd={
                  onRunHitEnd ? () => onRunHitEnd(open.id) : undefined
                }
                runHud={runHud}
              />
            </div>
          </div>
        )}
        <div
          className="doujin-lists__dock"
          role="toolbar"
          aria-label="Просмотр списка"
        >
          <button
            type="button"
            className="btn-ghost"
            disabled={open.items.length === 0}
            onClick={() => playAt(open, 0)}
          >
            С начала
          </button>
          {canResume ? (
            <button
              type="button"
              className="btn-ghost"
              onClick={() => playAt(open, resume)}
            >
              Продолжить
            </button>
          ) : null}
          <button
            type="button"
            className="btn-ghost"
            disabled={listCachePending(open, savedIds, busyIds) === 0}
            onClick={() => onDownloadList(open.id)}
          >
            Скачать
          </button>
          <button
            type="button"
            className="btn-ghost"
            disabled={
              gelbooruListUnsavedItems(open, savedIds, busyIds).length === 0
            }
            onClick={() => onSaveList(open.id)}
          >
            На полку
          </button>
          <button
            type="button"
            className="btn-ghost"
            disabled={open.items.length === 0}
            onClick={() => onPlaySession(open.id)}
          >
            В сессию
          </button>
          <button
            type="button"
            className="doujin-picker__submit"
            disabled={open.items.length === 0}
            onClick={() => onStartRun(open.id)}
          >
            Начать прогон
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="doujin-lists">
      {error ? <p className="doujin-error">{error}</p> : null}
      {assembleError ? <p className="doujin-error">{assembleError}</p> : null}
      <ul className="doujin-lists__overview">
        <li className="doujin-lists__tile doujin-lists__tile--assemble">
          <div className="doujin-lists__tile-hit">
            <div className="doujin-lists__assemble-face">
              <img
                className="doujin-lists__assemble-portrait"
                src={portrait.src}
                alt=""
              />
              <p className="doujin-lists__assemble-name">{portrait.name}</p>
              <div className="doujin-lists__assemble-dock">
                <WheelPicker
                  className="doujin-lists__size-wheel"
                  label="Длина"
                  hint={`${queueSize} постов`}
                  itemWidth={64}
                  value={queueSize}
                  onChange={(size) => onQueueSize(snapMediaQueueSize(size))}
                  items={MEDIA_QUEUE_SIZES.map((value) => ({
                    value,
                    label: String(value),
                  }))}
                />
              </div>
            </div>
          </div>
          <div className="doujin-lists__tile-foot">
            <span className="doujin-lists__title-row">
              <span className="doujin-lists__title">Автоочередь</span>
              <span
                className="doujin-lists__info"
                title={ASSEMBLE_HINT}
                aria-label={ASSEMBLE_HINT}
                tabIndex={0}
              >
                i
              </span>
            </span>
            <button
              type="button"
              className="doujin-lists__tile-play"
              disabled={assembleBusy || !keyed}
              onClick={() => onAssemble(queueSize)}
            >
              {assembleBusy
                ? "Собираю…"
                : keyed
                  ? `Выбор ${portrait.name}`
                  : "Нужен ключ Gelbooru"}
            </button>
          </div>
        </li>
        <li className="doujin-lists__tile doujin-lists__tile--add">
          <button
            type="button"
            className="doujin-lists__tile-hit"
            disabled={busy}
            aria-label="Создать список"
            onClick={() => void createList()}
          >
            <span className="doujin-lists__add-face">
              <PlusIcon />
            </span>
          </button>
          <div className="doujin-lists__tile-foot">
            <button
              type="button"
              className="doujin-lists__tile-caption"
              disabled={busy}
              onClick={() => void createList()}
            >
              <span className="doujin-lists__title">Создать</span>
            </button>
          </div>
        </li>
        {lists.map((list, index) => {
          const resumeAt = gelbooruListResumeIndex(list);
          const canResume = gelbooruListCanResume(list);
          const playStatsLine = readingPlayStatsCaption(list.playStats);
          const cacheState = gelbooruListTileCacheState(
            list,
            savedIds,
            busyIds,
          );
          return (
            <li key={list.id} className="doujin-lists__tile">
              <button
                type="button"
                className="doujin-lists__tile-hit"
                onClick={() => onOpenList(list.id)}
              >
                <DoujinListDeck
                  urls={gelbooruListDeckUrls(list.items)}
                  stagger={`${(index % 4) * 0.55}s`}
                />
              </button>
              <div className="doujin-lists__tile-foot">
                <button
                  type="button"
                  className="doujin-lists__tile-caption"
                  onClick={() => onOpenList(list.id)}
                >
                  <span className="doujin-lists__title">{list.name}</span>
                </button>
                <DoujinListTileActions
                  cacheState={cacheState}
                  canRead={list.items.length > 0}
                  canResume={canResume}
                  downloadDisabled={list.items.length === 0}
                  onDownload={() => onDownloadList(list.id)}
                  onRead={() => playAt(list, 0)}
                  onResume={() => playAt(list, resumeAt)}
                />
                <span className="doujin-lists__sub">
                  {postsLabel(list.items.length)}
                  {gelbooruListOrigin(list) === "mistress" ? " · её" : ""}
                  {canResume ? ` · с ${resumeAt + 1}` : ""}
                  {playStatsLine ? ` · ${playStatsLine}` : ""}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

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

function PencilIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden>
      <path
        d="M11.6 2.7 13.3 4.4 6.2 11.5 4.2 12l.5-2zM10.4 3.9 12.1 5.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.45"
        strokeLinecap="round"
        strokeLinejoin="round"
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

function ChevronIcon({ dir }: { dir: "up" | "down" }) {
  const path =
    dir === "up" ? "M4.2 10.2 8 6.4l3.8 3.8" : "M4.2 5.8 8 9.6l3.8-3.8";
  return (
    <svg viewBox="0 0 16 16" aria-hidden>
      <path
        d={path}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path
        d="M12 5v14M5 12h14"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden>
      <path
        d="M4.2 4.2 11.8 11.8M11.8 4.2 4.2 11.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}
