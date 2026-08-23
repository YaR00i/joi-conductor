import { useMemo, useState } from "react";
import {
  copyExploreSave,
  deleteExploreSave,
  EMBER_SAVE_DEFAULT_SLOT,
  EMBER_SAVE_SLOT_MAX,
  EMBER_SAVE_SLOT_MIN,
  getActiveExploreSaveSlot,
  listExploreSaveSlots,
  readExploreSave,
  setActiveExploreSaveSlot,
  writeExploreSave,
  type EmberExploreSaveState,
  type EmberSaveBackend,
} from "../../game/content/emberSave";

export type EmberSavePanelMode = "pause" | "play" | "editor";

type Props = {
  packId: string;
  backend: EmberSaveBackend;
  mode: EmberSavePanelMode;
  capture?: () => EmberExploreSaveState | null;
  apply?: (save: EmberExploreSaveState) => boolean;
  onNewRun?: () => void;
  onToast?: (textRu: string) => void;
};

function slotLabel(slot: number, empty: boolean, mapId: string | null): string {
  if (empty) return `${slot} · пусто`;
  return `${slot} · ${mapId ?? "?"}`;
}

export function EmberSavePanel({
  packId,
  backend,
  mode,
  capture,
  apply,
  onNewRun,
  onToast,
}: Props) {
  const [tick, setTick] = useState(0);
  const [copyTo, setCopyTo] = useState(
    Math.min(EMBER_SAVE_SLOT_MAX, EMBER_SAVE_DEFAULT_SLOT + 1),
  );
  const slots = useMemo(
    () => listExploreSaveSlots(backend, packId),
    [backend, packId, tick],
  );
  const active = useMemo(
    () => getActiveExploreSaveSlot(backend, packId),
    [backend, packId, tick],
  );
  const [selected, setSelected] = useState(active);

  const refresh = () => setTick((n) => n + 1);

  const toast = (textRu: string) => {
    onToast?.(textRu);
  };

  const selectSlot = (slot: number) => {
    setSelected(slot);
    setActiveExploreSaveSlot(backend, packId, slot);
    refresh();
  };

  const saveTo = (slot: number) => {
    const blob = capture?.();
    if (!blob) {
      toast("Нечего сохранять");
      return;
    }
    writeExploreSave(backend, { ...blob, packId, slot });
    setActiveExploreSaveSlot(backend, packId, slot);
    setSelected(slot);
    refresh();
    toast(`Слот ${slot} сохранён`);
  };

  const loadFrom = (slot: number) => {
    const save = readExploreSave(backend, packId, slot);
    if (!save) {
      toast(`Слот ${slot} пуст — старт как обычно`);
      return;
    }
    if (!apply) {
      setActiveExploreSaveSlot(backend, packId, slot);
      setSelected(slot);
      refresh();
      toast(`Активный слот ${slot} — загрузится при входе в explore`);
      return;
    }
    if (!apply(save)) {
      toast("Не удалось загрузить сейв");
      return;
    }
    setActiveExploreSaveSlot(backend, packId, slot);
    setSelected(slot);
    refresh();
    toast(`Слот ${slot} загружен`);
  };

  const wipe = (slot: number) => {
    deleteExploreSave(backend, packId, slot);
    refresh();
    toast(`Слот ${slot} удалён`);
  };

  const copySelected = () => {
    const copied = copyExploreSave(backend, packId, selected, copyTo);
    if (!copied) {
      toast(`Слот ${selected} пуст`);
      return;
    }
    refresh();
    toast(`Слот ${selected} → ${copyTo}`);
  };

  const startNew = () => {
    deleteExploreSave(backend, packId, selected);
    setActiveExploreSaveSlot(backend, packId, selected);
    refresh();
    if (onNewRun) {
      onNewRun();
      return;
    }
    toast(`Слот ${selected} сброшен`);
  };

  const compact = mode === "pause";

  return (
    <div
      className={`ember-save-panel ember-save-panel--${mode}`}
      data-ember-ui="save"
    >
      <p className="ember-save-panel__title">
        {compact ? "Сейв" : "Сейвы explore"}
      </p>
      <label className="ember-save-panel__row">
        Слот
        <select
          value={selected}
          onChange={(e) => selectSlot(Number(e.target.value))}
        >
          {slots.map((info) => (
            <option key={info.slot} value={info.slot}>
              {slotLabel(info.slot, info.empty, info.mapId)}
              {info.slot === active ? " · активный" : ""}
            </option>
          ))}
        </select>
      </label>
      <div className="ember-save-panel__actions">
        {capture ? (
          <button type="button" className="primary" onClick={() => saveTo(selected)}>
            Сохранить
          </button>
        ) : null}
        <button type="button" className="ghost" onClick={() => loadFrom(selected)}>
          Загрузить
        </button>
        {onNewRun || mode !== "play" ? (
          <button type="button" className="ghost" onClick={startNew}>
            Новая
          </button>
        ) : null}
        <button type="button" className="ghost" onClick={() => wipe(selected)}>
          Удалить
        </button>
      </div>
      {!compact ? (
        <div className="ember-save-panel__copy">
          <label>
            Копировать в
            <select
              value={copyTo}
              onChange={(e) => setCopyTo(Number(e.target.value))}
            >
              {Array.from(
                { length: EMBER_SAVE_SLOT_MAX - EMBER_SAVE_SLOT_MIN + 1 },
                (_, i) => EMBER_SAVE_SLOT_MIN + i,
              )
                .filter((slot) => slot !== selected)
                .map((slot) => (
                  <option key={slot} value={slot}>
                    {slot}
                  </option>
                ))}
            </select>
          </label>
          <button type="button" className="ghost" onClick={copySelected}>
            Копировать
          </button>
        </div>
      ) : null}
      <p className="muted ember-save-panel__hint">
        Пустой слот = стартовый инвентарь. Ключ localStorage{" "}
        <code>ember-save-v1:{packId}:N</code>
      </p>
    </div>
  );
}
