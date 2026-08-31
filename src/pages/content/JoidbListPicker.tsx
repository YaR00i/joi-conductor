import { useState, type FormEvent } from "react";
import {
  DEFAULT_JOIDB_LIST_NAME,
  type JoidbPlayList,
} from "../../lib/joidb/joidbLists";
import type { JoidbVideo } from "../../lib/joidb/parseCatalog";

type Props = {
  video: JoidbVideo;
  lists: JoidbPlayList[];
  onClose: () => void;
  onToggle: (listId: string) => void | Promise<void>;
  onCreate: (name: string) => void | Promise<void>;
};

function listHasVideo(list: JoidbPlayList, video: JoidbVideo): boolean {
  return list.items.some(
    (row) => row.id === video.id || row.mediaId === video.mediaId,
  );
}

export function JoidbListPicker({
  video,
  lists,
  onClose,
  onToggle,
  onCreate,
}: Props) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const empty = lists.length === 0;
  const title = video.title.trim() || video.id;

  async function run(action: () => void | Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Не удалось сохранить список",
      );
    } finally {
      setBusy(false);
    }
  }

  function submitCreate(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim() || DEFAULT_JOIDB_LIST_NAME;
    void run(async () => {
      await onCreate(trimmed);
      setName("");
    });
  }

  const createForm = (
    <form
      className={"doujin-picker__create" + (empty ? " is-primary" : "")}
      onSubmit={submitCreate}
    >
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Название нового списка"
        aria-label="Название нового списка"
        disabled={busy}
      />
      <button
        type="submit"
        className={empty ? "doujin-picker__submit" : "doujin-picker__new-go"}
        disabled={busy}
      >
        {busy ? "…" : empty ? "Создать и добавить" : "Создать"}
      </button>
    </form>
  );

  return (
    <div className="doujin-picker-scrim" onClick={onClose}>
      <div
        className="doujin-picker"
        role="dialog"
        aria-modal="true"
        aria-labelledby="joidb-picker-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="doujin-picker__head">
          <div className="doujin-picker__titles">
            <span className="doujin-chrome__kicker">добавить в список</span>
            <h2 id="joidb-picker-title">{title}</h2>
          </div>
          <button
            type="button"
            className="doujin-picker__close"
            onClick={onClose}
          >
            Готово
          </button>
        </header>
        {empty ? (
          <p className="doujin-picker__hint">
            Очередей пока нет. Создай первую — этот ролик сразу попадёт в неё.
          </p>
        ) : (
          <p className="doujin-picker__hint">
            Нажми очередь, чтобы добавить. Ещё раз — убрать.
          </p>
        )}
        {empty ? (
          createForm
        ) : (
          <>
            <ul className="doujin-picker__lists">
              {lists.map((list) => {
                const on = listHasVideo(list, video);
                return (
                  <li key={list.id}>
                    <button
                      type="button"
                      className={"doujin-picker__row" + (on ? " is-on" : "")}
                      disabled={busy}
                      title={on ? "Убрать из списка" : "Добавить в список"}
                      onClick={() => {
                        void run(() => onToggle(list.id));
                      }}
                    >
                      <span className="doujin-picker__check" aria-hidden>
                        {on ? "✓" : ""}
                      </span>
                      <span className="doujin-picker__name">{list.name}</span>
                      <span className="doujin-picker__action">
                        {on ? "Убрать" : "Добавить"}
                      </span>
                      <span className="doujin-picker__count">
                        {list.items.length}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <details className="doujin-picker__new">
              <summary>Новый список</summary>
              {createForm}
            </details>
          </>
        )}
        {error ? <p className="doujin-error">{error}</p> : null}
      </div>
    </div>
  );
}
