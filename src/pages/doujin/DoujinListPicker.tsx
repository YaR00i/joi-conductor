import { useMemo, useState, type FormEvent } from "react";
import { WheelPicker } from "../../components/WheelPicker";
import { displayTitle } from "../../lib/doujin/normalize";
import {
  DEFAULT_READING_LIST_NAME,
  readingFeedTakeCounts,
  sliceDoujinFeedFrom,
} from "../../lib/doujin/readingLists";
import type { DoujinCard, DoujinReadingList } from "../../lib/doujin/types";

type Props = {
  card: DoujinCard;
  lists: DoujinReadingList[];
  /** Loaded search / library order. When set, the drum packs N works from the start. */
  pool?: DoujinCard[] | null;
  heading?: string;
  onClose: () => void;
  onToggle: (listId: string) => void | Promise<void>;
  onPack?: (listId: string, cards: DoujinCard[]) => void | Promise<void>;
  onCreate: (name: string, cards?: DoujinCard[]) => void | Promise<void>;
};

function defaultTake(counts: number[]): number {
  if (counts.includes(10)) return 10;
  return counts[counts.length - 1] ?? 1;
}

export function DoujinListPicker({
  card,
  lists,
  pool,
  heading,
  onClose,
  onToggle,
  onPack,
  onCreate,
}: Props) {
  const packMode = Boolean(pool && pool.length > 0 && onPack);
  const startId = pool?.[0]?.id ?? card.id;
  const remaining = useMemo(() => {
    if (!pool || pool.length === 0) return 1;
    const sliced = sliceDoujinFeedFrom(pool, startId, pool.length);
    return Math.max(1, sliced.length);
  }, [pool, startId]);
  const counts = readingFeedTakeCounts(remaining);
  const [take, setTake] = useState(() => defaultTake(counts));
  const takeSafe = counts.includes(take) ? take : defaultTake(counts);
  const [name, setName] = useState("");
  const [pickedListId, setPickedListId] = useState(lists[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const title = heading ?? (displayTitle(card.title) || `#${card.id}`);
  const empty = lists.length === 0;
  const picked =
    lists.some((list) => list.id === pickedListId)
      ? pickedListId
      : (lists[0]?.id ?? "");
  const pickedName = lists.find((list) => list.id === picked)?.name;

  function packCards(): DoujinCard[] {
    if (!pool || pool.length === 0) return [card];
    const sliced = sliceDoujinFeedFrom(pool, startId, takeSafe);
    return sliced.length > 0 ? sliced : [card];
  }

  async function run(action: () => void | Promise<void>, closeAfter = false) {
    setBusy(true);
    setError(null);
    try {
      await action();
      if (closeAfter) onClose();
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
    const trimmed = name.trim() || DEFAULT_READING_LIST_NAME;
    void run(async () => {
      await onCreate(trimmed, packMode ? packCards() : [card]);
      setName("");
    }, packMode);
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
        {busy
          ? "…"
          : empty
            ? packMode
              ? `Создать · ${takeSafe}`
              : "Создать и добавить"
            : "Создать"}
      </button>
    </form>
  );

  const takeWheel = packMode ? (
    <div className="doujin-picker__take">
      <WheelPicker
        className="doujin-picker__take-wheel"
        label="Сколько"
        hint={`${takeSafe} из ${remaining}`}
        itemWidth={52}
        value={takeSafe}
        onChange={setTake}
        items={counts.map((value) => ({
          value,
          label: String(value),
        }))}
      />
    </div>
  ) : null;

  return (
    <div className="doujin-picker-scrim" onClick={onClose}>
      <div
        className="doujin-picker"
        role="dialog"
        aria-modal="true"
        aria-labelledby="doujin-picker-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="doujin-picker__head">
          <div className="doujin-picker__titles">
            <span className="doujin-chrome__kicker">
              {packMode ? "из найденного" : "добавить в список"}
            </span>
            <h2 id="doujin-picker-title">{title}</h2>
          </div>
          <button
            type="button"
            className="doujin-picker__close"
            onClick={onClose}
          >
            {packMode ? "Отмена" : "Готово"}
          </button>
        </header>
        {packMode ? (
          <p className="doujin-picker__hint">
            Сколько работ из найденного. Новый список — имя ниже, или выбери
            очередь.
          </p>
        ) : empty ? (
          <p className="doujin-picker__hint">
            Очередей пока нет. Создай первую — эта работа сразу попадёт в неё.
          </p>
        ) : (
          <p className="doujin-picker__hint">
            Нажми очередь, чтобы добавить. Ещё раз — убрать.
          </p>
        )}
        {takeWheel}
        {empty ? (
          createForm
        ) : (
          <>
            <ul className="doujin-picker__lists">
              {lists.map((list) => {
                const on = packMode
                  ? list.id === picked
                  : list.items.some((item) => item.galleryId === card.id);
                return (
                  <li key={list.id}>
                    <button
                      type="button"
                      className={"doujin-picker__row" + (on ? " is-on" : "")}
                      disabled={busy}
                      title={
                        packMode
                          ? "Добавить в эту очередь"
                          : on
                            ? "Убрать из списка"
                            : "Добавить в список"
                      }
                      onClick={() => {
                        if (packMode) {
                          setPickedListId(list.id);
                          return;
                        }
                        void run(() => onToggle(list.id));
                      }}
                    >
                      <span className="doujin-picker__check" aria-hidden>
                        {on ? "✓" : ""}
                      </span>
                      <span className="doujin-picker__name">{list.name}</span>
                      <span className="doujin-picker__action">
                        {packMode
                          ? on
                            ? "Выбрана"
                            : "Выбрать"
                          : on
                            ? "Убрать"
                            : "Добавить"}
                      </span>
                      <span className="doujin-picker__count">
                        {list.items.length}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            {packMode && picked ? (
              <button
                type="button"
                className="doujin-picker__submit"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await onPack?.(picked, packCards());
                  }, true)
                }
              >
                {busy
                  ? "…"
                  : `Добавить ${takeSafe} · ${pickedName ?? "очередь"}`}
              </button>
            ) : null}
            {packMode ? (
              createForm
            ) : (
              <details className="doujin-picker__new">
                <summary>Новый список</summary>
                {createForm}
              </details>
            )}
          </>
        )}
        {error ? <p className="doujin-error">{error}</p> : null}
      </div>
    </div>
  );
}
