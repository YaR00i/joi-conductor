import { useMemo, useRef, useState } from "react";
import "../components/contractSeries.css";
import {
  CONTRACT_CATEGORY_LABELS,
  getContractDef,
  type ContractRollKey,
} from "../lib/contracts/catalog";
import { CONTRACT_ROLL_KEY_RU } from "../lib/contracts/contractEditorDraft";
import { contractRng } from "../lib/contracts/contractTime";
import { getMergedContractCatalog } from "../lib/contracts/userCatalog";
import {
  expectedSeriesLength,
  previewSeriesDayBodyRu,
  resizeSeriesDays,
  SERIES_THEMES,
  validateSeriesDef,
  type ContractSeriesDaySpec,
  type ContractSeriesIntensity,
  type ContractSeriesPeriodKind,
} from "../lib/contracts/seriesCatalog";
import {
  draftFromSeriesDef,
  emptySeriesDraft,
  patchSeriesDay,
  payloadFromSeriesDraft,
  type SeriesEditorDraft,
} from "../lib/contracts/seriesEditorDraft";
import {
  generateSeriesProgression,
  seriesPhaseLabelRu,
  tileWeekSpecs,
  type ProgressionMode,
} from "../lib/contracts/seriesProgression";
import {
  numericRollBounds,
  overrideRangeWarnings,
  rollKeysForDef,
} from "../lib/contracts/seriesParams";
import {
  deleteUserSeries,
  duplicateToUserSeries,
  exportUserSeriesJson,
  importUserSeriesJson,
  listEditorSeries,
  loadUserSeriesCatalog,
  makeUserSeriesId,
  restoreBuiltinSeriesOverride,
  SERIES_EDITOR_ORIGIN_RU,
  upsertUserSeriesOverride,
  type SeriesEditorOrigin,
  type SeriesEditorRow,
} from "../lib/contracts/userSeriesCatalog";

const INTENSITIES: ContractSeriesIntensity[] = [1, 2, 3, 4, 5];

export function ContractSeriesEditor() {
  const [revision, setRevision] = useState(0);
  const rows = useMemo(() => listEditorSeries(), [revision]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<SeriesEditorDraft>(emptySeriesDraft());
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const importRef = useRef<HTMLInputElement | null>(null);
  const [childQuery, setChildQuery] = useState("");
  const [genDefId, setGenDefId] = useState("");
  const [genKey, setGenKey] = useState<ContractRollKey>("n");
  const [genStart, setGenStart] = useState("3");
  const [genEnd, setGenEnd] = useState("10");
  const [genMode, setGenMode] = useState<ProgressionMode>("smooth");
  const [genPreview, setGenPreview] = useState<ContractSeriesDaySpec[] | null>(
    null,
  );
  const [genWarning, setGenWarning] = useState<string | null>(null);
  const catalog = useMemo(() => getMergedContractCatalog(), [revision]);
  const childOptions = useMemo(() => {
    const q = childQuery.trim().toLowerCase();
    if (!q) return catalog;
    return catalog.filter((c) =>
      `${c.nameRu} ${c.id} ${CONTRACT_CATEGORY_LABELS[c.category]}`
        .toLowerCase()
        .includes(q),
    );
  }, [catalog, childQuery]);
  const selectedRow = rows.find((r) => r.id === selectedId) ?? null;
  const origin: SeriesEditorOrigin | "new" = selectedRow
    ? selectedRow.origin
    : "new";
  const payload = payloadFromSeriesDraft(draft);
  const validation = validateSeriesDef(payload, getContractDef);
  const genDef = getContractDef(genDefId);
  const genKeys = genDef
    ? rollKeysForDef(genDef).filter((key) =>
        Boolean(numericRollBounds(genDef, key)),
      )
    : [];

  function refresh() {
    setRevision((n) => n + 1);
  }

  function loadRow(row: SeriesEditorRow | null) {
    setSelectedId(row?.id ?? null);
    setDraft(row ? draftFromSeriesDef(row.def) : emptySeriesDraft());
    setError(null);
    setStatus(null);
    setGenPreview(null);
  }

  function save() {
    setError(null);
    if (!validation.ok) {
      setError(validation.errors[0] ?? "Исправь ошибки.");
      return;
    }
    const existingIds = loadUserSeriesCatalog().map((s) => s.id);
    const id =
      origin === "new"
        ? makeUserSeriesId(draft.nameRu, existingIds)
        : draft.id;
    upsertUserSeriesOverride({
      ...payload,
      id,
      clonedFrom: origin === "user" ? undefined : draft.clonedFrom ?? draft.id,
    });
    setStatus(`«${draft.nameRu}» сохранена.`);
    refresh();
    setSelectedId(id);
    setDraft((d) => ({ ...d, id }));
  }

  function duplicate() {
    const source = selectedRow?.def ?? (draft.nameRu ? payload : null);
    if (!source) {
      setError("Нечего копировать.");
      return;
    }
    const copy = duplicateToUserSeries(source);
    refresh();
    loadRow({
      id: copy.id,
      def: copy,
      origin: "user",
      errors: validateSeriesDef(copy, getContractDef).errors,
    });
    setStatus(`Копия «${copy.nameRu}».`);
  }

  function restore() {
    if (!selectedId) return;
    if (!window.confirm("Вернуть встроенную серию? Правка пропадёт.")) return;
    if (!restoreBuiltinSeriesOverride(selectedId)) {
      setError("Это не правка встроенной серии.");
      return;
    }
    refresh();
    setStatus("Встроенная серия возвращена.");
  }

  function remove() {
    if (!selectedId || origin !== "user") return;
    if (!window.confirm("Удалить свой пресет?")) return;
    deleteUserSeries(selectedId);
    loadRow(null);
    setStatus("Пресет удалён.");
    refresh();
  }

  function exportJson() {
    const json = exportUserSeriesJson();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "joi-user-series.json";
    a.click();
    URL.revokeObjectURL(url);
    setStatus("Скачаны свои пресеты серий.");
  }

  function importJson(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const res = importUserSeriesJson(String(reader.result ?? ""), "merge");
      setStatus(`Импортировано: ${res.imported}, пропущено: ${res.skipped}.`);
      refresh();
    };
    reader.readAsText(file);
  }

  function fillFromPrevious(index: number) {
    if (index <= 0) return;
    const prev = draft.days[index - 1];
    if (!prev?.contractDefId) return;
    setDraft((d) => ({
      ...d,
      days: patchSeriesDay(d.days, index, {
        contractDefId: prev.contractDefId,
        intensity: prev.intensity,
        paramOverrides: prev.paramOverrides
          ? { ...prev.paramOverrides }
          : undefined,
      }),
    }));
  }

  function copyWeek() {
    const tiled = tileWeekSpecs(draft.days, expectedSeriesLength(draft.periodKind));
    if ("error" in tiled) {
      setError(tiled.error);
      return;
    }
    setDraft((d) => ({ ...d, days: tiled }));
    setStatus("Первая неделя скопирована на остальные дни.");
  }

  function clearDays() {
    if (!window.confirm("Очистить все дни пресета?")) return;
    setDraft((d) => ({
      ...d,
      days: d.days.map(() => ({ contractDefId: "", intensity: 3 as const })),
    }));
    setStatus("Дни очищены.");
  }

  function runGeneratorPreview() {
    const start = Number(genStart);
    const end = Number(genEnd);
    if (!genDefId || !Number.isFinite(start) || !Number.isFinite(end)) {
      setError("Для генератора нужны контракт и числа старт/финиш.");
      return;
    }
    const result = generateSeriesProgression({
      length: expectedSeriesLength(draft.periodKind) as 7 | 30,
      contractDefId: genDefId,
      key: genKey,
      start,
      end,
      mode: genMode,
    });
    if (result.days.length === 0) {
      setError(result.warnings[0] ?? "Генератор не смог построить дни.");
      setGenPreview(null);
      return;
    }
    setGenPreview(result.days);
    setGenWarning(result.warnings[0] ?? null);
    setError(null);
  }

  function applyGenerator() {
    if (!genPreview) return;
    if (!window.confirm("Заменить все дни сгенерированной прогрессией?")) return;
    setDraft((d) => ({ ...d, days: genPreview }));
    setStatus("Прогрессия применена. Проверь превью дней и сохрани.");
    setGenPreview(null);
  }

  const knownTheme = SERIES_THEMES.some((t) => t.id === draft.theme.id);

  return (
    <div className="contracts-editor__body">
      <aside className="contracts-editor__list">
        <button
          type="button"
          className={`contracts-editor__new${selectedId === null ? " is-active" : ""}`}
          onClick={() => loadRow(null)}
        >
          + Новый пресет
        </button>
        <ul className="contracts-editor__catalog">
          {rows.map((row) => (
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
                onClick={() => loadRow(row)}
              >
                <span className="contracts-editor__item-name">{row.def.nameRu}</span>
                <span className="contracts-editor__item-meta">
                  {row.def.periodKind === "week" ? "7 дней" : "30 дней"} ·{" "}
                  {row.def.theme?.labelRu ?? "без темы"} ·{" "}
                  {SERIES_EDITOR_ORIGIN_RU[row.origin]}
                  {row.errors.length > 0 ? " · ошибки" : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
        <div className="contracts-editor__io">
          <button
            type="button"
            className="contracts-card__btn contracts-card__btn--ghost"
            onClick={exportJson}
          >
            Экспорт пресетов
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
            ? "Новый пресет — появится в блоке долгих контрактов."
            : origin === "builtin"
              ? "Встроенный. Сохрани — на доске будет твоя версия."
              : origin === "override"
                ? "Этот встроенный пресет уже изменён."
                : "Свой пресет."}
        </p>
        <label className="field">
          <span className="field__label">Название</span>
          <input
            value={draft.nameRu}
            onChange={(e) => setDraft((d) => ({ ...d, nameRu: e.target.value }))}
          />
        </label>
        <label className="field">
          <span className="field__label">Тема</span>
          <select
            value={knownTheme ? draft.theme.id : "custom"}
            onChange={(e) => {
              const id = e.target.value;
              if (id === "custom") {
                setDraft((d) => ({
                  ...d,
                  theme: { id: "custom", labelRu: d.theme.labelRu },
                }));
                return;
              }
              const theme = SERIES_THEMES.find((t) => t.id === id);
              if (theme) setDraft((d) => ({ ...d, theme }));
            }}
          >
            {SERIES_THEMES.map((theme) => (
              <option key={theme.id} value={theme.id}>
                {theme.labelRu}
              </option>
            ))}
            <option value="custom">Своя тема</option>
          </select>
        </label>
        {!knownTheme ? (
          <label className="field">
            <span className="field__label">Название своей темы</span>
            <input
              value={draft.theme.labelRu}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  theme: { id: "custom", labelRu: e.target.value },
                }))
              }
            />
          </label>
        ) : null}
        <label className="field">
          <span className="field__label">Описание</span>
          <textarea
            rows={3}
            value={draft.descriptionRu}
            onChange={(e) =>
              setDraft((d) => ({ ...d, descriptionRu: e.target.value }))
            }
          />
        </label>
        <label className="field">
          <span className="field__label">Длительность</span>
          <select
            value={draft.periodKind}
            onChange={(e) => {
              const periodKind = e.target.value as ContractSeriesPeriodKind;
              setDraft((d) => ({
                ...d,
                periodKind,
                days: resizeSeriesDays(d.days, periodKind),
              }));
            }}
          >
            <option value="week">7 дней</option>
            <option value="month">30 дней</option>
          </select>
        </label>
        <div className="contract-series__actions">
          <button
            type="button"
            className="contracts-card__btn contracts-card__btn--ghost"
            onClick={copyWeek}
            disabled={draft.periodKind !== "month"}
          >
            Скопировать неделю
          </button>
          <button
            type="button"
            className="contracts-card__btn contracts-card__btn--ghost"
            onClick={clearDays}
          >
            Очистить дни
          </button>
        </div>

        <fieldset className="contract-series-editor__generator">
          <legend>Генератор прогрессии</legend>
          <label className="field">
            <span className="field__label">Контракт</span>
            <select
              value={genDefId}
              onChange={(e) => {
                const id = e.target.value;
                setGenDefId(id);
                const next = getContractDef(id);
                const keys = rollKeysForDef(next).filter((key) =>
                  Boolean(next && numericRollBounds(next, key)),
                );
                if (keys[0]) setGenKey(keys[0]);
              }}
            >
              <option value="">— выбрать —</option>
              {catalog.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nameRu}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field__label">Параметр</span>
            <select
              value={genKey}
              onChange={(e) => setGenKey(e.target.value as ContractRollKey)}
              disabled={genKeys.length === 0}
            >
              {genKeys.map((key) => (
                <option key={key} value={key}>
                  {CONTRACT_ROLL_KEY_RU[key]}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field__label">От</span>
            <input
              value={genStart}
              onChange={(e) => setGenStart(e.target.value)}
            />
          </label>
          <label className="field">
            <span className="field__label">До</span>
            <input value={genEnd} onChange={(e) => setGenEnd(e.target.value)} />
          </label>
          <label className="field">
            <span className="field__label">Шаг</span>
            <select
              value={genMode}
              onChange={(e) => setGenMode(e.target.value as ProgressionMode)}
            >
              <option value="smooth">Плавно</option>
              <option value="steps">Ступенями</option>
            </select>
          </label>
          <div className="contract-series__actions">
            <button
              type="button"
              className="contracts-card__btn contracts-card__btn--ghost"
              onClick={runGeneratorPreview}
            >
              Превью прогрессии
            </button>
            <button
              type="button"
              className="contracts-card__btn contracts-card__btn--done"
              disabled={!genPreview}
              onClick={applyGenerator}
            >
              Применить
            </button>
          </div>
          {genWarning ? (
            <p className="contract-series__desc">{genWarning}</p>
          ) : null}
          {genPreview ? (
            <p className="contract-series__desc">
              {genPreview
                .map((d, i) => `${i + 1}:${d.paramOverrides ? Object.values(d.paramOverrides)[0] : "—"}`)
                .join(" · ")}
            </p>
          ) : null}
        </fieldset>

        <label className="field">
          <span className="field__label">Поиск контракта</span>
          <input
            value={childQuery}
            onChange={(e) => setChildQuery(e.target.value)}
            placeholder="Имя, категория или id…"
          />
        </label>
        <div className="contract-series-editor__days">
          {draft.days.map((spec, i) => {
            const child = getContractDef(spec.contractDefId);
            const options =
              spec.contractDefId &&
              !childOptions.some((c) => c.id === spec.contractDefId) &&
              child
                ? [child, ...childOptions]
                : childOptions;
            const keys = rollKeysForDef(child);
            const rangeWarn = child
              ? overrideRangeWarnings(child, spec.paramOverrides)
              : [];
            const preview = child
              ? previewSeriesDayBodyRu(
                  spec,
                  getContractDef,
                  contractRng(`preview:${draft.id || "new"}:d${i}`),
                )
              : null;
            return (
              <div key={i} className="contract-series-editor__day">
                <div className="contract-series-editor__day-head">
                  <span>
                    День {i + 1} · {seriesPhaseLabelRu(i, draft.days.length)}
                  </span>
                  {i > 0 ? (
                    <button
                      type="button"
                      className="contracts-card__btn contracts-card__btn--ghost"
                      onClick={() => fillFromPrevious(i)}
                    >
                      Как предыдущий
                    </button>
                  ) : null}
                </div>
                <select
                  value={spec.contractDefId}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      days: patchSeriesDay(d.days, i, {
                        contractDefId: e.target.value,
                      }),
                    }))
                  }
                >
                  <option value="">— выбрать —</option>
                  {options.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nameRu} · {CONTRACT_CATEGORY_LABELS[c.category]} ·{" "}
                      {c.difficulty}
                    </option>
                  ))}
                </select>
                <label className="contract-series-editor__intensity">
                  <span>Интенсивность</span>
                  <select
                    value={spec.intensity}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        days: patchSeriesDay(d.days, i, {
                          intensity: Number(e.target.value) as ContractSeriesIntensity,
                        }),
                      }))
                    }
                  >
                    {INTENSITIES.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
                {child ? (
                  <em>
                    {CONTRACT_CATEGORY_LABELS[child.category]} · сложность{" "}
                    {child.difficulty}
                  </em>
                ) : null}
                {keys.length > 0 ? (
                  <div className="contract-series-editor__overrides">
                    {keys.map((key) => (
                      <label key={key}>
                        <span>{CONTRACT_ROLL_KEY_RU[key]}</span>
                        <input
                          value={
                            spec.paramOverrides?.[key] != null
                              ? String(spec.paramOverrides[key])
                              : ""
                          }
                          placeholder="из броска"
                          onChange={(e) => {
                            const text = e.target.value;
                            const next = { ...(spec.paramOverrides ?? {}) };
                            if (!text.trim()) delete next[key];
                            else {
                              const num = Number(text);
                              next[key] =
                                Number.isFinite(num) && /^-?\d+(\.\d+)?$/.test(text)
                                  ? num
                                  : text;
                            }
                            setDraft((d) => ({
                              ...d,
                              days: patchSeriesDay(d.days, i, {
                                paramOverrides:
                                  Object.keys(next).length > 0 ? next : undefined,
                              }),
                            }));
                          }}
                        />
                      </label>
                    ))}
                  </div>
                ) : null}
                {preview ? (
                  <p className="contract-series-editor__preview-body">{preview}</p>
                ) : null}
                {rangeWarn.map((w) => (
                  <p key={w} className="contract-series__desc">
                    {w}
                  </p>
                ))}
              </div>
            );
          })}
        </div>
        {!validation.ok ? (
          <ul className="contract-series-editor__errors">
            {validation.errors.map((err) => (
              <li key={err}>{err}</li>
            ))}
          </ul>
        ) : null}
        {validation.warnings.length > 0 ? (
          <ul className="contract-series-editor__warnings">
            {validation.warnings.map((warn) => (
              <li key={warn}>{warn}</li>
            ))}
          </ul>
        ) : null}
        <div className="contracts-editor__actions">
          <button
            type="submit"
            className="contracts-card__btn contracts-card__btn--done"
            disabled={!validation.ok}
          >
            Сохранить пресет
          </button>
          {selectedId ? (
            <button
              type="button"
              className="contracts-card__btn contracts-card__btn--ghost"
              onClick={duplicate}
            >
              Дублировать
            </button>
          ) : null}
          {origin === "override" ? (
            <button
              type="button"
              className="contracts-card__btn contracts-card__btn--ghost"
              onClick={restore}
            >
              Вернуть встроенный
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
        {error ? <p className="contract-series__error">{error}</p> : null}
        {status ? <p className="contracts-page__flash">{status}</p> : null}
      </form>
    </div>
  );
}
