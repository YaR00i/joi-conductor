import { useMemo, useRef, useState } from "react";
import {
  CONTRACT_CATALOG,
  CONTRACT_CATEGORY_LABELS,
  type ContractCategory,
  type ContractDef,
  type ContractRollKey,
} from "../lib/contracts/catalog";
import {
  addUserContract,
  cloneBuiltinToUser,
  deleteUserContract,
  exportUserContractsJson,
  exportAllContractsJson,
  importUserContractsJson,
  isBuiltinCloned,
  loadUserContracts,
  makeUserContractId,
  updateUserContract,
  type UserContractDef,
} from "../lib/contracts/userCatalog";
import { listMistressPacks } from "../lib/mistress/packs";
import type { MistressId } from "../lib/mistress/types";

const ROLL_KEYS: ContractRollKey[] = [
  "n",
  "minutes",
  "hours",
  "tag",
  "taps",
  "pages",
  "sec",
  "limit",
];

const CATEGORIES = Object.keys(CONTRACT_CATEGORY_LABELS) as ContractCategory[];

/** Draft shape used in the form (strings for inputs, normalized on save). */
type Draft = {
  id: string;
  nameRu: string;
  briefRu: string;
  instructionRu: string;
  category: ContractCategory;
  difficulty: 1 | 2 | 3;
  durationHintMin: string;
  durationLimitMin: string;
  rewardMin: string;
  rewardMax: string;
  rollsText: string; // key1: a, b; key2: c
  biasHints: string;
  mistressBias: MistressId[];
  kind: "" | ContractDef["kind"];
  requireActivityDebrief: boolean;
};

const EMPTY_DRAFT: Draft = {
  id: "",
  nameRu: "",
  briefRu: "",
  instructionRu: "",
  category: "edge",
  difficulty: 1,
  durationHintMin: "",
  durationLimitMin: "",
  rewardMin: "10",
  rewardMax: "20",
  rollsText: "",
  biasHints: "",
  mistressBias: [],
  kind: "",
  requireActivityDebrief: false,
};

function draftFromDef(def: UserContractDef): Draft {
  const rolls = def.rolls
    ? Object.entries(def.rolls)
        .map(([k, vals]) => `${k}: ${(vals ?? []).join(", ")}`)
        .join("; ")
    : "";
  return {
    id: def.id,
    nameRu: def.nameRu,
    briefRu: def.briefRu,
    instructionRu: def.instructionRu,
    category: def.category,
    difficulty: def.difficulty,
    durationHintMin:
      typeof def.durationHintMin === "number"
        ? String(def.durationHintMin)
        : "",
    durationLimitMin:
      typeof def.durationLimitMin === "number"
        ? String(def.durationLimitMin)
        : "",
    rewardMin: String(def.rewardMin),
    rewardMax: String(def.rewardMax),
    rollsText: rolls,
    biasHints: (def.biasHints ?? []).join(", "),
    mistressBias: def.mistressBias ?? [],
    kind: def.kind ?? "",
    requireActivityDebrief: Boolean(def.requireActivityDebrief),
  };
}

function parseRolls(
  text: string,
): Partial<Record<ContractRollKey, (string | number)[]>> | undefined {
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  const out: Partial<Record<ContractRollKey, (string | number)[]>> = {};
  for (const part of trimmed.split(/;|\n/)) {
    const m = part.match(/^\s*([a-zA-Z_]+)\s*:\s*(.+)$/);
    if (!m) continue;
    const key = m[1].trim() as ContractRollKey;
    if (!ROLL_KEYS.includes(key)) continue;
    const vals = m[2]
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean)
      .map((v) => {
        const num = Number(v);
        return Number.isFinite(num) && /^\d+(\.\d+)?$/.test(v)
          ? (num as number)
          : v;
      });
    if (vals.length > 0) out[key] = vals;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function draftToDef(draft: Draft, existingIds: string[]): Omit<UserContractDef, "userCreated" | "createdAt" | "updatedAt"> {
  const id =
    draft.id ||
    makeUserContractId(draft.nameRu || "contract", existingIds);
  const rewardMin = Math.max(0, Math.round(Number(draft.rewardMin) || 0));
  const rewardMax = Math.max(rewardMin, Math.round(Number(draft.rewardMax) || 0));
  const durationHintMin = Number(draft.durationHintMin);
  const durationLimitMin = Number(draft.durationLimitMin);
  return {
    id,
    nameRu: draft.nameRu.trim() || "Без названия",
    briefRu: draft.briefRu.trim(),
    instructionRu: draft.instructionRu.trim(),
    category: draft.category,
    difficulty: draft.difficulty,
    durationHintMin:
      Number.isFinite(durationHintMin) && durationHintMin > 0
        ? durationHintMin
        : undefined,
    durationLimitMin:
      Number.isFinite(durationLimitMin) && durationLimitMin > 0
        ? durationLimitMin
        : undefined,
    rewardMin,
    rewardMax,
    rolls: parseRolls(draft.rollsText),
    biasHints: draft.biasHints
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    mistressBias: draft.mistressBias.length > 0 ? draft.mistressBias : undefined,
    kind: (draft.kind || undefined) as ContractDef["kind"],
    requireActivityDebrief: draft.requireActivityDebrief || undefined,
  };
}

type Props = {
  onBack: () => void;
};

export function ContractEditorPage({ onBack }: Props) {
  const [revision, setRevision] = useState(0);
  const userContracts = useMemo(
    () => loadUserContracts(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [revision],
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mistressPacks = useMemo(() => listMistressPacks(), []);
  const importRef = useRef<HTMLInputElement | null>(null);

  const existingIds = useMemo(
    () => userContracts.map((c) => c.id),
    [userContracts],
  );

  function refresh() {
    setRevision((n) => n + 1);
  }

  function selectDef(def: UserContractDef | null) {
    setSelectedId(def?.id ?? null);
    setDraft(def ? draftFromDef(def) : EMPTY_DRAFT);
    setError(null);
    setStatus(null);
  }

  function patch(p: Partial<Draft>) {
    setDraft((d) => ({ ...d, ...p }));
  }

  function save() {
    setError(null);
    if (!draft.nameRu.trim()) {
      setError("Укажи название контракта.");
      return;
    }
    try {
      const data = draftToDef(draft, existingIds);
      if (selectedId && selectedId === draft.id) {
        updateUserContract(selectedId, data);
        setStatus(`Контракт «${data.nameRu}» обновлён.`);
      } else {
        const created = addUserContract(data);
        setSelectedId(created.id);
        setStatus(`Контракт «${created.nameRu}» создан (${created.id}).`);
      }
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось сохранить.");
    }
  }

  function remove(id: string) {
    if (!confirm("Удалить контракт? Это действие нельзя отменить.")) return;
    deleteUserContract(id);
    if (selectedId === id) selectDef(null);
    setStatus("Контракт удалён.");
    refresh();
  }

  function cloneBuiltin(builtinId: string) {
    const clone = cloneBuiltinToUser(builtinId);
    if (!clone) {
      setError(`Не найден встроенный контракт ${builtinId}.`);
      return;
    }
    refresh();
    selectDef(clone);
    setStatus(`Клон встроенного контракта создан — редактируй и сохрани.`);
  }

  function exportJson() {
    const json = exportUserContractsJson();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "joi-user-contracts.json";
    a.click();
    URL.revokeObjectURL(url);
    setStatus("Экспортировано в JSON.");
  }

  function exportAllJson() {
    const json = exportAllContractsJson();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "joi-all-contracts.json";
    a.click();
    URL.revokeObjectURL(url);
    setStatus("Полный каталог экспортирован (встроенные + свои, с таймерами).");
  }

  function importJson(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      const res = importUserContractsJson(text, "merge");
      setStatus(
        `Импортировано: ${res.imported}, пропущено: ${res.skipped}.`,
      );
      refresh();
    };
    reader.readAsText(file);
  }

  return (
    <section className="contracts-editor">
      <header className="contracts-editor__head">
        <div>
          <p className="contracts-page__eyebrow">Каталог пользователя</p>
          <h1 className="contracts-page__title">Свои контракты</h1>
          <p className="contracts-page__sub">
            Контракты попадают в дневную доску наравне с встроенными. ID
            начинаются с <code>user_</code>.
          </p>
        </div>
        <div className="contracts-editor__head-actions">
          <button
            type="button"
            className="contracts-card__btn contracts-card__btn--ghost"
            onClick={onBack}
          >
            ← К доске
          </button>
        </div>
      </header>

      <div className="contracts-editor__body">
        <aside className="contracts-editor__list">
          <button
            type="button"
            className={`contracts-editor__new${
              selectedId === null ? " is-active" : ""
            }`}
            onClick={() => selectDef(null)}
          >
            + Новый контракт
          </button>
          {userContracts.length === 0 ? (
            <p className="contracts-editor__empty">
              Пока нет своих контрактов. Создай первый →
            </p>
          ) : (
            <ul>
              {userContracts.map((c) => (
                <li
                  key={c.id}
                  className={
                    selectedId === c.id
                      ? "contracts-editor__item is-active"
                      : "contracts-editor__item"
                  }
                >
                  <button
                    type="button"
                    onClick={() => selectDef(c)}
                    className="contracts-editor__item-btn"
                  >
                    <span className="contracts-editor__item-name">
                      {c.nameRu}
                    </span>
                    <span className="contracts-editor__item-meta">
                      {CONTRACT_CATEGORY_LABELS[c.category]} · сложность{" "}
                      {c.difficulty} · +{c.rewardMin}–{c.rewardMax} ◆
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <details className="contracts-editor__builtins">
            <summary>
              Встроенные контракты ({CONTRACT_CATALOG.length}) · клонировать
            </summary>
            <ul>
              {CONTRACT_CATALOG.map((b) => {
                const cloned = isBuiltinCloned(b.id);
                return (
                  <li key={b.id} className="contracts-editor__builtin-item">
                    <span className="contracts-editor__builtin-name">
                      {b.nameRu}
                      <em className="contracts-editor__builtin-meta">
                        {" "}
                        · {CONTRACT_CATEGORY_LABELS[b.category]}
                        {cloned ? " · ✓ клонирован" : ""}
                      </em>
                    </span>
                    <button
                      type="button"
                      className="contracts-card__btn contracts-card__btn--ghost contracts-editor__builtin-clone"
                      onClick={() => cloneBuiltin(b.id)}
                    >
                      {cloned ? "Открыть клон" : "Клонировать"}
                    </button>
                  </li>
                );
              })}
            </ul>
          </details>
          <div className="contracts-editor__io">
            <button
              type="button"
              className="contracts-card__btn contracts-card__btn--ghost"
              onClick={exportJson}
              disabled={userContracts.length === 0}
            >
              Экспорт своих
            </button>
            <button
              type="button"
              className="contracts-card__btn contracts-card__btn--ghost"
              onClick={exportAllJson}
              title="Все встроенные + свои контракты с полем таймера (durationLimitMin)"
            >
              Экспорт всех (с таймерами)
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
              style={{ display: "none" }}
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
          <label className="field field--wide">
            <span className="field__label">Название *</span>
            <input
              value={draft.nameRu}
              onChange={(e) => patch({ nameRu: e.target.value })}
              placeholder="Например: Эдж-марафон на сайте"
            />
          </label>
          <label className="field field--wide">
            <span className="field__label">Краткое описание</span>
            <input
              value={draft.briefRu}
              onChange={(e) => patch({ briefRu: e.target.value })}
              placeholder="Одна строка для карточки на доске"
            />
          </label>
          <label className="field field--wide">
            <span className="field__label">
              Инструкция{" "}
              <em className="contracts-editor__hint">
                (плейсхолдеры: {`{n} {minutes} {hours} {tag} {taps} {pages} {sec} {limit} {trigger} {actionLabel} {timerMin}`})
              </em>
            </span>
            <textarea
              rows={4}
              value={draft.instructionRu}
              onChange={(e) => patch({ instructionRu: e.target.value })}
              placeholder="Иди на {site}, сделай {n} бросков. За каждый эдж — минус. В конце доложи результат."
            />
          </label>

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
                <option value={1}>1 · лёгкий</option>
                <option value={2}>2 · средний</option>
                <option value={3}>3 · тяжёлый</option>
              </select>
            </label>
            <label className="field">
              <span className="field__label">Награда мин ◆</span>
              <input
                type="number"
                min={0}
                value={draft.rewardMin}
                onChange={(e) => patch({ rewardMin: e.target.value })}
              />
            </label>
            <label className="field">
              <span className="field__label">Награда макс ◆</span>
              <input
                type="number"
                min={0}
                value={draft.rewardMax}
                onChange={(e) => patch({ rewardMax: e.target.value })}
              />
            </label>
            <label className="field">
              <span className="field__label">
                Подсказка длительности (мин)
              </span>
              <input
                type="number"
                min={0}
                value={draft.durationHintMin}
                onChange={(e) => patch({ durationHintMin: e.target.value })}
                placeholder="например 30"
              />
            </label>
            <label className="field">
              <span className="field__label">
                Лимит на выполнение (мин) — таймер
              </span>
              <input
                type="number"
                min={0}
                value={draft.durationLimitMin}
                onChange={(e) => patch({ durationLimitMin: e.target.value })}
                placeholder="если пусто — берётся из подсказки"
              />
            </label>
            <label className="field">
              <span className="field__label">Тип контракта (kind)</span>
              <select
                value={draft.kind}
                onChange={(e) =>
                  patch({
                    kind: e.target.value as Draft["kind"],
                  })
                }
              >
                <option value="">обычный (нет)</option>
                <option value="media_drill">media_drill</option>
                <option value="finish_debrief">finish_debrief</option>
              </select>
            </label>
          </div>

          <label className="field field--wide">
            <span className="field__label">
              Роллы{" "}
              <em className="contracts-editor__hint">
                (формат: <code>n: 6, 8, 10; minutes: 20, 30</code>)
              </em>
            </span>
            <textarea
              rows={2}
              value={draft.rollsText}
              onChange={(e) => patch({ rollsText: e.target.value })}
              placeholder="n: 6, 8, 10; minutes: 20, 30"
            />
          </label>

          <label className="field field--wide">
            <span className="field__label">
              biasHints{" "}
              <em className="contracts-editor__hint">
                (через запятую: edge, stroke, cei)
              </em>
            </span>
            <input
              value={draft.biasHints}
              onChange={(e) => patch({ biasHints: e.target.value })}
              placeholder="edge, stroke, cei"
            />
          </label>

          <fieldset className="field field--wide">
            <legend className="field__label"> mistressBias</legend>
            <div className="contracts-editor__chips">
              {mistressPacks.map((p) => {
                const active = draft.mistressBias.includes(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    className={
                      "contracts-editor__chip" +
                      (active ? " is-active" : "")
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
            <span>
              Вопросник после выполнения (сколько эджил / держал эдж / как
              закончил / что сделал потом)
            </span>
          </label>

          {error ? (
            <p className="contracts-page__flash is-error">{error}</p>
          ) : null}
          {status ? (
            <p className="contracts-page__flash">{status}</p>
          ) : null}

          <div className="contracts-editor__actions">
            <button type="submit" className="contracts-card__btn contracts-card__btn--done">
              {selectedId ? "Сохранить изменения" : "Создать контракт"}
            </button>
            {selectedId ? (
              <button
                type="button"
                className="contracts-card__btn contracts-card__btn--fail"
                onClick={() => remove(selectedId)}
              >
                Удалить
              </button>
            ) : null}
          </div>
        </form>
      </div>
    </section>
  );
}
