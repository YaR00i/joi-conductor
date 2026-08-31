import { useEffect, useRef, useState } from "react";
import { proxiedImageUrl } from "../../lib/doujin/cdn";
import {
  EMPTY_READING_LIST_PLAY_STATS,
  formatReadingPlayStats,
  readingPlayStatsCaption,
} from "../../lib/doujin/readingListPlayStats";
import {
  DEFAULT_JOIDB_LIST_NAME,
  JOIDB_LIST_NOTE_MAX,
  joidbListCanResume,
  joidbListDeckUrls,
  joidbListItemLabel,
  joidbListOrigin,
  joidbListResumeIndex,
  type JoidbPlayList,
} from "../../lib/joidb/joidbLists";
import type { JoidbVideo } from "../../lib/joidb/parseCatalog";
import { DoujinListDeck } from "../doujin/DoujinListDeck";
import { DoujinListTileActions } from "../doujin/DoujinListTileActions";
import "./joidb.css";

type Props = {
  lists: JoidbPlayList[];
  openListId: string | null;
  onOpenList: (id: string | null) => void;
  onCreate: (name: string) => void | Promise<void>;
  onRename: (id: string, name: string) => void;
  onNote: (id: string, note: string) => void;
  onDelete: (id: string) => void;
  onRemoveItem: (listId: string, itemId: string) => void;
  onMoveItem: (listId: string, from: number, to: number) => void;
  onPlay: (listId: string, index: number) => void;
  onStartRun: (listId: string) => void;
};

function nextListName(lists: JoidbPlayList[]): string {
  const used = new Set(lists.map((list) => list.name));
  if (!used.has(DEFAULT_JOIDB_LIST_NAME)) return DEFAULT_JOIDB_LIST_NAME;
  for (let n = 2; n < 1000; n += 1) {
    const name = `${DEFAULT_JOIDB_LIST_NAME} ${n}`;
    if (!used.has(name)) return name;
  }
  return DEFAULT_JOIDB_LIST_NAME;
}

function videosLabel(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n} ролик`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return `${n} ролика`;
  }
  return `${n} роликов`;
}

export function JoidbLists({
  lists,
  openListId,
  onOpenList,
  onCreate,
  onRename,
  onNote,
  onDelete,
  onRemoveItem,
  onMoveItem,
  onPlay,
  onStartRun,
}: Props) {
  const open = lists.find((row) => row.id === openListId) ?? null;
  const [rename, setRename] = useState<string | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

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
  }, [openListId]);

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

  const resume = open ? joidbListResumeIndex(open) : 0;
  const selectedIndex = open
    ? Math.min(
        Math.max(0, picked ?? resume),
        Math.max(0, open.items.length - 1),
      )
    : 0;
  const selected = open?.items[selectedIndex] ?? null;

  if (open) {
    const canResume = joidbListCanResume(open);
    const cover = selected?.thumbnail
      ? proxiedImageUrl(selected.thumbnail)
      : "";
    return (
      <div className="doujin-lists doujin-lists--detail joidb-lists">
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
              <span>{videosLabel(open.items.length)}</span>
              <span aria-hidden>·</span>
              <span>
                {joidbListOrigin(open) === "mistress"
                  ? "её очередь"
                  : "своя очередь"}
              </span>
              {open.items.length > 0 && open.cursorIndex > 0 ? (
                <>
                  <span aria-hidden>·</span>
                  <span>с {resume + 1}</span>
                </>
              ) : null}
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
            maxLength={JOIDB_LIST_NOTE_MAX}
            placeholder="Зачем эта очередь — теги, настроение, заметка себе."
            aria-label="Описание списка"
            onChange={(e) => setNoteDraft(e.target.value)}
            onBlur={commitOpenNote}
          />
        ) : null}
        {open.items.length === 0 ? (
          <div className="doujin-empty">
            <p className="muted">
              Пусто. Закладка на карточке в ленте добавит ролик сюда.
            </p>
          </div>
        ) : (
          <div className="doujin-lists__split">
            <ol className="doujin-lists__queue">
              {open.items.map((item, index) => {
                const thumb = item.thumbnail
                  ? proxiedImageUrl(item.thumbnail)
                  : "";
                const on =
                  index === selectedIndex
                    ? " is-on"
                    : index === resume
                      ? " is-cursor"
                      : "";
                return (
                  <li
                    key={`${open.id}-${item.mediaId}`}
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
                        onDoubleClick={() => onPlay(open.id, index)}
                      >
                        <span className="doujin-lists__cover-btn" aria-hidden>
                          {thumb ? (
                            <img src={thumb} alt="" />
                          ) : (
                            <span className="doujin-lists__cover-ph" />
                          )}
                        </span>
                        <span className="doujin-lists__meta">
                          <span className="doujin-lists__title">
                            {joidbListItemLabel(item)}
                          </span>
                          <span className="doujin-lists__sub">
                            {[item.duration, item.creator]
                              .filter(Boolean)
                              .join(" · ")}
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
            {selected ? (
              <aside className="doujin-lists__preview">
                <div className="doujin-lists__preview-hero">
                  <button
                    type="button"
                    className="doujin-lists__preview-cover"
                    onClick={() => onPlay(open.id, selectedIndex)}
                    title="Смотреть"
                  >
                    {cover ? (
                      <img src={cover} alt="" />
                    ) : (
                      <span className="doujin-lists__cover-ph" />
                    )}
                    <span className="joidb-lists__preview-play">
                      <span className="joidb-watch__play-disc" aria-hidden>
                        <PlayIcon />
                      </span>
                      Смотреть
                    </span>
                  </button>
                  <div className="doujin-lists__preview-meta">
                    <p className="doujin-chrome__kicker">ролик</p>
                    <h2>{joidbListItemLabel(selected)}</h2>
                    <p className="doujin-lists__preview-id">
                      {[selected.duration, selected.creator]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                </div>
              </aside>
            ) : null}
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
            onClick={() => onPlay(open.id, 0)}
          >
            С начала
          </button>
          {canResume ? (
            <button
              type="button"
              className="btn-ghost"
              onClick={() => onPlay(open.id, resume)}
            >
              Продолжить
            </button>
          ) : null}
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
    <div className="doujin-lists joidb-lists">
      {error ? <p className="doujin-error">{error}</p> : null}
      <ul className="doujin-lists__overview">
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
          const resumeAt = joidbListResumeIndex(list);
          const canResume = joidbListCanResume(list);
          const playStatsLine = readingPlayStatsCaption(list.playStats);
          const urls = joidbListDeckUrls(list.items).map((u) =>
            proxiedImageUrl(u),
          );
          return (
            <li key={list.id} className="doujin-lists__tile">
              <button
                type="button"
                className="doujin-lists__tile-hit"
                onClick={() => onOpenList(list.id)}
              >
                <DoujinListDeck
                  urls={urls}
                  stagger={`${(index % 4) * 0.55}s`}
                  className="doujin-lists__deck--wide"
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
                  cacheState="idle"
                  canRead={list.items.length > 0}
                  canResume={canResume}
                  readTitle="Смотреть"
                  onRead={() => onPlay(list.id, 0)}
                  onResume={() => onPlay(list.id, resumeAt)}
                />
                <span className="doujin-lists__sub">
                  {videosLabel(list.items.length)}
                  {joidbListOrigin(list) === "mistress" ? " · её" : ""}
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

export function joidbVideoFromList(
  list: JoidbPlayList,
  index: number,
): JoidbVideo | null {
  const item = list.items[index];
  if (!item) return null;
  return item;
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

function PlayIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden>
      <path d="M5.1 3.2v9.6L13.2 8 5.1 3.2z" fill="currentColor" />
    </svg>
  );
}
