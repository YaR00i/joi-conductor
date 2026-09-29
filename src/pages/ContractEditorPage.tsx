import { useMemo, useRef, useState } from "react";
import {
  CONTRACT_CATALOG,
  CONTRACT_CATEGORY_LABELS,
  type ContractCategory,
  type FinishDebriefPreset,
} from "../lib/contracts/catalog";
import {
  CONTRACT_KIND_RU,
  CONTRACT_ROLL_KEY_RU,
  CONTRACT_ROLL_KEYS,
  EMPTY_CONTRACT_DRAFT,
  FINISH_DEBRIEF_PRESET_RU,
  INSTRUCTION_PLACEHOLDERS,
  draftFromContractDef,
  draftToContractPayload,
  draftsLookEqual,
  previewInstructionRu,
  type ContractEditorDraft,
} from "../lib/contracts/contractEditorDraft";
import {
  CONTRACT_EDITOR_ORIGIN_RU,
  deleteUserContract,
  duplicateToUserContract,
  exportAllContractsJson,
  exportUserContractsJson,
  importUserContractsJson,
  listEditorCatalog,
  loadUserContracts,
  restoreBuiltinOverride,
  upsertUserOverride,
  type ContractEditorOrigin,
  type ContractEditorRow,
} from "../lib/contracts/userCatalog";
import { listMistressPacks } from "../lib/mistress/packs";
import { ContractSeriesEditor } from "./ContractSeriesEditor";
import "../components/contractSeries.css";

const CATEGORIES = Object.keys(CONTRACT_CATEGORY_LABELS) as ContractCategory[];
const KIND_OPTIONS = Object.keys(CONTRACT_KIND_RU) as Array<
  keyof typeof CONTRACT_KIND_RU
>;
const PRESET_OPTIONS = Object.keys(
  FINISH_DEBRIEF_PRESET_RU,
) as FinishDebriefPreset[];

type FilterId = "all" | "changed" | ContractCategory;

type Props = {
  onBack: () => void;
};

export function ContractEditorPage({ onBack }: Props) {
  const [revision, setRevision] = useState(0);
  const catalog = useMemo(() => listEditorCatalog(), [revision]);
  const userContracts = useMemo(() => loadUserContracts(), [revision]);
  const [filter, setFilter] = useState<FilterId>("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [baseline, setBaseline] = useState<ContractEditorDraft>(
    EMPTY_CONTRACT_DRAFT,
  );
  const [draft, setDraft] = useState<ContractEditorDraft>(EMPTY_CONTRACT_DRAFT);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [catalogKind, setCatalogKind] = useState<"singles" | "series">("singles");
  const mistressPacks = useMemo(() => listMistressPacks(), []);
  const importRef = useRef<HTMLInputElement | null>(null);
  const instructionRef = useRef<HTMLTextAreaElement | null>(null);
  const dirty = !draftsLookEqual(draft, baseline);
  const selectedRow = catalog.find((r) => r.id === selectedId) ?? null;
  const origin: ContractEditorOrigin | "new" = selectedRow
    ? selectedRow.origin
    : "new";

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return catalog.filter((row) => {
      if (filter === "changed") {
        if (row.origin === "builtin") return false;
      } else if (filter !== "all" && row.def.category !== filter) {
        return false;
      }
      if (!q) return true;
      const hay = `${row.def.nameRu} ${row.def.briefRu} ${row.id}`.toLowerCase();
      return hay.includes(q);
    });
  }, [catalog, filter, query]);

  const existingIds = useMemo(
    () => userContracts.map((c) => c.id),
    [userContracts],
  );

  function refresh() {
    setRevision((n) => n + 1);
  }

  function confirmLeaveDirty(): boolean {
    if (!dirty) return true;
    return window.confirm("Есть несохранённые правки. Уйти без сохранения?");
  }

  function loadRow(row: ContractEditorRow | null) {
    const next = row ? draftFromContractDef(row.def) : EMPTY_CONTRACT_DRAFT;
    setSelectedId(row?.id ?? null);
    setDraft(next);
    setBaseline(next);
    setError(null);
    setStatus(null);
  }

  function selectRow(row: ContractEditorRow | null) {
    if (row?.id === selectedId) return;
    if (!confirmLeaveDirty()) return;
    loadRow(row);
  }

  function patch(p: Partial<ContractEditorDraft>) {
    setDraft((d) => ({ ...d, ...p }));
  }

  function insertPlaceholder(token: string) {
    const el = instructionRef.current;
    if (!el) {
      patch({ instructionRu: `${draft.instructionRu}${token}` });
      return;
    }
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const next =
      draft.instructionRu.slice(0, start) +
      token +
      draft.instructionRu.slice(end);
    patch({ instructionRu: next });
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + token.length;
      el.setSelectionRange(pos, pos);
    });
  }

  function save() {
    setError(null);
    if (!draft.nameRu.trim()) {
      setError("Укажи название контракта.");
      return;
    }
    try {
      const payload = draftToContractPayload(draft, existingIds);
      if (origin === "builtin" || origin === "override") {
        payload.clonedFrom = payload.clonedFrom ?? payload.id;
      }
      const saved = upsertUserOverride(payload);
      const next = draftFromContractDef(saved);
      setSelectedId(saved.id);
      setDraft(next);
      setBaseline(next);
      setStatus(
        origin === "new"
          ? `«${saved.nameRu}» создан — появится на доске.`
          : origin === "builtin"
            ? `«${saved.nameRu}» сохранён — на доске будет эта версия.`
            : `«${saved.nameRu}» обновлён.`,
      );
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось сохранить.");
    }
  }

  function restore() {
    if (!selectedId) return;
    if (
      !window.confirm(
        "Вернуть встроенный текст? Твоя правка этого контракта пропадёт.",
      )
    ) {
      return;
    }
    if (!restoreBuiltinOverride(selectedId)) {
      setError("Нечего возвращать — это не правка встроенного.");
      return;
    }
    refresh();
    const builtin = CONTRACT_CATALOG.find((d) => d.id === selectedId);
    loadRow(
      builtin
        ? { id: builtin.id, def: builtin, origin: "builtin" }
        : null,
    );
    setStatus("Вернула встроенный текст.");
  }

  function duplicate() {
    const source = selectedRow?.def ?? (draft.nameRu ? draftToContractPayload(draft, existingIds) : null);
    if (!source) {
      setError("Нечего копировать.");
      return;
    }
    if (!confirmLeaveDirty()) return;
    const copy = duplicateToUserContract(source);
    refresh();
    loadRow({ id: copy.id, def: copy, origin: "user" });
    setStatus(`Копия «${copy.nameRu}» — отдельный контракт на доске.`);
  }

  function remove() {
    if (!selectedId || origin !== "user") return;
    if (!window.confirm("Удалить свой контракт? Это нельзя отменить.")) return;
    deleteUserContract(selectedId);
    loadRow(null);
    setStatus("Контракт удалён.");
    refresh();
  }

  function exportJson(kind: "user" | "all") {
    const json =
      kind === "all" ? exportAllContractsJson() : exportUserContractsJson();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download =
      kind === "all" ? "joi-all-contracts.json" : "joi-user-contracts.json";
    a.click();
    URL.revokeObjectURL(url);
    setStatus(
      kind === "all"
        ? "Скачан полный каталог."
        : "Скачаны свои и изменённые контракты.",
    );
  }

  function importJson(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const res = importUserContractsJson(String(reader.result ?? ""), "merge");
      setStatus(`Импортировано: ${res.imported}, пропущено: ${res.skipped}.`);
      refresh();
    };
    reader.readAsText(file);
  }

  const preview = previewInstructionRu(draft);
  const saveLabel =
    origin === "new"
      ? "Создать контракт"
      : origin === "builtin"
        ? "Сохранить правку"
        : "Сохранить";

  return (
    <section className="contracts-editor">
      <header className="contracts-editor__head">
        <div>
          <p className="contracts-page__eyebrow">Каталог</p>
          <h1 className="contracts-page__title">Редактор контрактов</h1>
          <p className="contracts-page__sub">
            Открой любой готовый — правь текст и награды. Сохранение пишет
            поверх встроенного на доске. «Свой» — отдельная карточка.
          </p>
          <div className="contract-series-editor__toggle" role="tablist">
            <button
              type="button"
              className={
                catalogKind === "singles"
                  ? "contracts-page__mode-btn is-active"
                  : "contracts-page__mode-btn"
              }
              onClick={() => {
                if (!confirmLeaveDirty()) return;
                setCatalogKind("singles");
              }}
            >
              Одиночные
            </button>
            <button
              type="button"
              className={
                catalogKind === "series"
                  ? "contracts-page__mode-btn is-active"
                  : "contracts-page__mode-btn"
              }
              onClick={() => {
                if (!confirmLeaveDirty()) return;
                setCatalogKind("series");
              }}
            >
              Пресеты серий
            </button>
          </div>
        </div>
        <button
          type="button"
          className="contracts-card__btn contracts-card__btn--ghost"
          onClick={() => {
            if (!confirmLeaveDirty()) return;
            onBack();
          }}
        >
          ← К доске
        </button>
      </header>

      {catalogKind === "series" ? (
        <ContractSeriesEditor />
      ) : (
      <div className="contracts-editor__body">
        <aside className="contracts-editor__list">
          <button
            type="button"
            className={`contracts-editor__new${
              selectedId === null ? " is-active" : ""
            }`}
            onClick={() => selectRow(null)}
          >
            + Новый контракт
          </button>
          <input
            className="contracts-editor__search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск по имени…"
            aria-label="Поиск контрактов"
          />
          <div className="contracts-editor__filters" role="tablist">
            <button
              type="button"
              className={`contracts-editor__filter${
                filter === "all" ? " is-active" : ""
              }`}
              onClick={() => setFilter("all")}
            >
              Все
            </button>
            <button
              type="button"
              className={`contracts-editor__filter${
                filter === "changed" ? " is-active" : ""
              }`}
              onClick={() => setFilter("changed")}
            >
              Изменённые
            </button>
            {CATEGORIES.map((c) => (
              <button
                key={c}
                type="button"
                className={`contracts-editor__filter${
                  filter === c ? " is-active" : ""
                }`}
                onClick={() => setFilter(c)}
              >
                {CONTRACT_CATEGORY_LABELS[c]}
              </button>
            ))}
          </div>
          <ul className="contracts-editor__catalog">
            {filtered.length === 0 ? (
              <li className="contracts-editor__empty">Ничего не найдено.</li>
            ) : (
              filtered.map((row) => (
                <li
                  key={row.id}
                  className={
                    selectedId === row.id
                      ? "contracts-editor__item is-active"
                      : "contracts-editor__item"
                  }
                >
                  <button
                    type="button"
                    className="contracts-editor__item-btn"
                    onClick={() => selectRow(row)}
                  >
                    <span className="contracts-editor__item-name">
                      {row.def.nameRu}
                    </span>
                    <span className="contracts-editor__item-meta">
                      {CONTRACT_CATEGORY_LABELS[row.def.category]} ·{" "}
                      {CONTRACT_EDITOR_ORIGIN_RU[row.origin]}
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
          <div className="contracts-editor__io">
            <button
              type="button"
              className="contracts-card__btn contracts-card__btn--ghost"
              onClick={() => exportJson("user")}
              disabled={userContracts.length === 0}
            >
              Экспорт правок
            </button>
            <button
              type="button"
              className="contracts-card__btn contracts-card__btn--ghost"
              onClick={() => exportJson("all")}
            >
              Экспорт всех
            </button>
            <button
              type="button"
              className="contracts-card__btn contracts-card__btn--ghost"
              onClick={() => importRef.current?.click()}
            >
              Импорт JSON
            </button>
            <input
              ref={importRef}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) importJson(f);
                e.target.value = "";
              }}
            />
          </div>
        </aside>

        <form
          className="contracts-editor__form"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <p className="contracts-editor__origin">
            {origin === "new"
              ? "Новый контракт — появится на доске как свой."
              : origin === "builtin"
                ? "Встроенный. Сохрани — на доске будет твоя версия."
                : origin === "override"
                  ? "Этот встроенный уже изменён."
                  : "Свой контракт, не из каталога."}
            {dirty ? " · не сохранено" : ""}
          </p>
          <div className="contracts-editor__actions">
            <button
              type="submit"
              className="contracts-card__btn contracts-card__btn--done"
              disabled={origin !== "new" && !dirty}
            >
              {saveLabel}
            </button>
            {selectedId ? (
              <button
                type="button"
                className="contracts-card__btn contracts-card__btn--ghost"
                onClick={duplicate}
              >
                Копия как свой
              </button>
            ) : null}
            {origin === "override" ? (
              <button
                type="button"
                className="contracts-card__btn contracts-card__btn--ghost"
                onClick={restore}
              >
                Вернуть оригинал
              </button>
            ) : null}
            {origin === "user" ? (
              <button
                type="button"
                className="contracts-card__btn contracts-card__btn--fail"
                onClick={remove}
              >
                Удалить
              </button>
            ) : null}
          </div>
          {error ? (
            <p className="contracts-page__flash is-error">{error}</p>
          ) : null}
          {status ? <p className="contracts-page__flash">{status}</p> : null}

          <label className="field field--wide">
            <span className="field__label">Название *</span>
            <input
              value={draft.nameRu}
              onChange={(e) => patch({ nameRu: e.target.value })}
              placeholder="Как на карточке доски"
            />
          </label>
          <label className="field field--wide">
            <span className="field__label">Кратко</span>
            <input
              value={draft.briefRu}
              onChange={(e) => patch({ briefRu: e.target.value })}
              placeholder="Одна строка под названием"
            />
          </label>
          <label className="field field--wide">
            <span className="field__label">Инструкция</span>
            <textarea
              ref={instructionRef}
              rows={5}
              value={draft.instructionRu}
              onChange={(e) => patch({ instructionRu: e.target.value })}
              placeholder="Что делать. Можно вставить {n} или {minutes}."
            />
          </label>
          <span className="contracts-editor__tokens">
            {INSTRUCTION_PLACEHOLDERS.map((token) => (
              <button
                key={token}
                type="button"
                className="contracts-editor__token"
                onClick={() => insertPlaceholder(token)}
              >
                {token}
              </button>
            ))}
          </span>
          {preview.trim() ? (
            <p className="contracts-editor__preview">
              Как на доске: {preview}
            </p>
          ) : null}

          <div className="today__fields">
            <label className="field">
              <span className="field__label">Категория</span>
              <select
                value={draft.category}
                onChange={(e) =>
                  patch({ category: e.target.value as ContractCategory })
                }
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {CONTRACT_CATEGORY_LABELS[c]}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field__label">Сложность</span>
              <select
                value={draft.difficulty}
                onChange={(e) =>
                  patch({
                    difficulty: Number(e.target.value) as 1 | 2 | 3,
                  })
                }
              >
                <option value={1}>Лёгкий</option>
                <option value={2}>Средний</option>
                <option value={3}>Тяжёлый</option>
              </select>
            </label>
            <label className="field">
              <span className="field__label">Награда от ◆</span>
              <input
                type="number"
                min={0}
                value={draft.rewardMin}
                onChange={(e) => patch({ rewardMin: e.target.value })}
              />
            </label>
            <label className="field">
              <span className="field__label">Награда до ◆</span>
              <input
                type="number"
                min={0}
                value={draft.rewardMax}
                onChange={(e) => patch({ rewardMax: e.target.value })}
              />
            </label>
            <label className="field">
              <span className="field__label">Длительность, мин</span>
              <input
                type="number"
                min={0}
                value={draft.durationHintMin}
                onChange={(e) => patch({ durationHintMin: e.target.value })}
                placeholder="например 30"
              />
            </label>
            <label className="field">
              <span className="field__label">Таймер выполнения, мин</span>
              <input
                type="number"
                min={0}
                value={draft.durationLimitMin}
                onChange={(e) => patch({ durationLimitMin: e.target.value })}
                placeholder="пусто — без таймера"
              />
            </label>
            <label className="field">
              <span className="field__label">Как закрывается</span>
              <select
                value={draft.kind}
                onChange={(e) =>
                  patch({
                    kind: e.target.value as ContractEditorDraft["kind"],
                    finishDebriefPreset:
                      e.target.value === "finish_debrief"
                        ? draft.finishDebriefPreset || "choice"
                        : "",
                  })
                }
              >
                {KIND_OPTIONS.map((k) => (
                  <option key={k || "plain"} value={k}>
                    {CONTRACT_KIND_RU[k]}
                  </option>
                ))}
              </select>
            </label>
            {draft.kind === "finish_debrief" ? (
              <label className="field">
                <span className="field__label">Отчёт о финале</span>
                <select
                  value={draft.finishDebriefPreset}
                  onChange={(e) =>
                    patch({
                      finishDebriefPreset: e.target
                        .value as FinishDebriefPreset,
                    })
                  }
                >
                  {PRESET_OPTIONS.map((p) => (
                    <option key={p} value={p}>
                      {FINISH_DEBRIEF_PRESET_RU[p]}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>

          <fieldset className="field field--wide">
            <legend className="field__label">
              Случайные числа в инструкции
            </legend>
            <div className="contracts-editor__rolls">
              {CONTRACT_ROLL_KEYS.map((key) => (
                <label key={key} className="field">
                  <span className="field__label">{CONTRACT_ROLL_KEY_RU[key]}</span>
                  <input
                    value={draft.rolls[key]}
                    onChange={(e) =>
                      patch({
                        rolls: { ...draft.rolls, [key]: e.target.value },
                      })
                    }
                    placeholder={
                      key === "tag" ? "femdom, cei" : "3, 5, 8"
                    }
                  />
                </label>
              ))}
            </div>
          </fieldset>

          <label className="field field--wide">
            <span className="field__label">Наклон вкуса</span>
            <input
              value={draft.biasHints}
              onChange={(e) => patch({ biasHints: e.target.value })}
              placeholder="edge, stroke, cei — через запятую"
            />
          </label>

          <fieldset className="field field--wide">
            <legend className="field__label">Чаще у госпожи</legend>
            <div className="contracts-editor__chips">
              {mistressPacks.map((p) => {
                const active = draft.mistressBias.includes(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    className={
                      "contracts-editor__chip" + (active ? " is-active" : "")
                    }
                    onClick={() =>
                      patch({
                        mistressBias: active
                          ? draft.mistressBias.filter((x) => x !== p.id)
                          : [...draft.mistressBias, p.id],
                      })
                    }
                  >
                    {p.displayNameRu}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <label className="field field--wide ui-check-row">
            <input
              type="checkbox"
              checked={draft.requireActivityDebrief}
              onChange={(e) =>
                patch({ requireActivityDebrief: e.target.checked })
              }
            />
            <span>После выполнения спросить, как прошло</span>
          </label>
        </form>
      </div>
      )}
    </section>
  );
}
