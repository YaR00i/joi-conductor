import { useMemo, useState } from "react";
import {
  contractJournalStats,
  loadContractJournal,
  clearContractJournal,
  type ContractJournalEntry,
  type ContractJournalOutcome,
} from "../lib/contractJournal";
import { CONTRACT_CATEGORY_LABELS } from "../lib/contracts/catalog";
import { listMistressPacks } from "../lib/mistress/packs";
import "../components/contractSeries.css";

type Props = {
  revision?: number;
  variant?: "page" | "embed";
};

type OutcomeFilter = "all" | ContractJournalOutcome;

const OUTCOME_LABELS: Record<ContractJournalOutcome, string> = {
  done: "Выполнен",
  failed: "Провален",
  expired: "Просрочен",
};

const OUTCOME_TONES: Record<ContractJournalOutcome, string> = {
  done: "is-done",
  failed: "is-failed",
  expired: "is-expired",
};

function formatDuration(sec: number): string {
  if (sec < 60) return `${sec} с`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m < 60) return s > 0 ? `${m} мин ${s} с` : `${m} мин`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return mm > 0 ? `${h} ч ${mm} мин` : `${h} ч`;
}

function formatWhen(iso: string): { day: string; time: string } {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { day: iso, time: "" };
  const day = d.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "short",
  });
  const time = d.toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return { day, time };
}

export function ContractJournalPage({
  revision = 0,
  variant = "page",
}: Props) {
  const [outcomeFilter, setOutcomeFilter] = useState<OutcomeFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const entries = useMemo(
    () => loadContractJournal(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [revision],
  );
  const stats = useMemo(() => contractJournalStats(entries), [entries]);
  const mistressPacks = useMemo(() => listMistressPacks(), []);
  const mistressName = useMemo(() => {
    const map = new Map(
      mistressPacks.map((p) => [p.id as string, p.displayNameRu]),
    );
    return (id: string) => map.get(id) ?? id;
  }, [mistressPacks]);

  const filtered = useMemo(() => {
    return entries.filter((e) => {
      if (outcomeFilter !== "all" && e.outcome !== outcomeFilter) return false;
      if (categoryFilter !== "all" && e.category !== categoryFilter) return false;
      return true;
    });
  }, [entries, outcomeFilter, categoryFilter]);

  const categories = useMemo(() => {
    const set = new Set(entries.map((e) => e.category));
    return Array.from(set);
  }, [entries]);

  function handleClear() {
    if (!confirm("Очистить весь журнал отчётов по контрактам? Необратимо.")) return;
    clearContractJournal();
    window.location.reload();
  }

  return (
    <section
      className={`contract-journal${variant === "embed" ? " contract-journal--embed" : ""}`}
    >
      <header className="contract-journal__head">
        <div>
          <p className="contracts-page__eyebrow">Хроника</p>
          <h1 className="contracts-page__title">Журнал контрактов</h1>
          <p className="contracts-page__sub">
            {variant === "embed"
              ? "Итоги контрактов этого сохранения — отдельно от дневника."
              : "Отдельно от дневника сессий — только итоги контрактов: выполнение, награды, отчёты-вопросники."}
          </p>
        </div>
      </header>

      <div className="contract-journal__kpis">
        <div className="stats-kpi">
          <span className="stats-kpi__label">Всего</span>
          <span className="stats-kpi__value">{stats.total}</span>
        </div>
        <div className="stats-kpi">
          <span className="stats-kpi__label">Выполнено</span>
          <span className="stats-kpi__value">{stats.done}</span>
          <span className="stats-kpi__hint">
            успех {Math.round(stats.successRate * 100)}%
          </span>
        </div>
        <div className="stats-kpi">
          <span className="stats-kpi__label">Провалено</span>
          <span className="stats-kpi__value">{stats.failed}</span>
        </div>
        <div className="stats-kpi">
          <span className="stats-kpi__label">Просрочено</span>
          <span className="stats-kpi__value">{stats.expired}</span>
        </div>
        <div className="stats-kpi">
          <span className="stats-kpi__label">Угольков</span>
          <span className="stats-kpi__value">+{stats.totalCinders} ◆</span>
        </div>
      </div>

      <div className="contract-journal__filters">
        <label className="field">
          <span className="field__label">Итог</span>
          <select
            value={outcomeFilter}
            onChange={(e) => setOutcomeFilter(e.target.value as OutcomeFilter)}
          >
            <option value="all">Все</option>
            <option value="done">Выполнен</option>
            <option value="failed">Провален</option>
            <option value="expired">Просрочен</option>
          </select>
        </label>
        <label className="field">
          <span className="field__label">Категория</span>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            <option value="all">Все</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {CONTRACT_CATEGORY_LABELS[c] ?? c}
              </option>
            ))}
          </select>
        </label>
        {entries.length > 0 ? (
          <button
            type="button"
            className="contracts-card__btn contracts-card__btn--ghost"
            onClick={handleClear}
          >
            Очистить журнал
          </button>
        ) : null}
      </div>

      {filtered.length === 0 ? (
        <p className="contracts-page__empty">
          {entries.length === 0
            ? "Журнал пуст. Выполни или проваль контракт — запись появится здесь."
            : "Нет записей под текущий фильтр."}
        </p>
      ) : (
        <ul className="contract-journal__list">
          {filtered.map((e) => (
            <JournalCard
              key={e.id}
              entry={e}
              mistressName={mistressName(e.mistressId)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function JournalCard({
  entry: e,
  mistressName,
}: {
  entry: ContractJournalEntry;
  mistressName: string;
}) {
  const when = formatWhen(e.createdAt);
  const catLabel = CONTRACT_CATEGORY_LABELS[e.category] ?? e.category;
  return (
    <li className={`contract-journal__card ${OUTCOME_TONES[e.outcome]}`}>
      <header className="contract-journal__card-head">
        <div className="contract-journal__when">
          <span className="contract-journal__day">{when.day}</span>
          <span className="contract-journal__time">{when.time}</span>
        </div>
        <span
          className={`contract-journal__outcome ${OUTCOME_TONES[e.outcome]}`}
        >
          {OUTCOME_LABELS[e.outcome]}
        </span>
      </header>
      <div className="contract-journal__card-body">
        <h3 className="contract-journal__title">{e.contractInstanceTitleRu}</h3>
        {typeof e.seriesDayIndex === "number" &&
        typeof e.seriesTotalDays === "number" ? (
          <span className="contracts-card__series-chip">
            Серия · день {e.seriesDayIndex + 1}/{e.seriesTotalDays}
          </span>
        ) : null}
        <dl className="contract-journal__facts">
          <div>
            <dt>Госпожа</dt>
            <dd>{mistressName}</dd>
          </div>
          <div>
            <dt>Категория</dt>
            <dd>{catLabel}</dd>
          </div>
          <div>
            <dt>Награда</dt>
            <dd>
              {e.outcome === "done" ? `+${e.reward} ◆` : "0 ◆"}
              {e.baseReward !== e.reward && e.outcome === "done" ? (
                <em className="contract-journal__base">
                  {" "}
                  (база {e.baseReward})
                </em>
              ) : null}
            </dd>
          </div>
          {e.actualDurationSec != null ? (
            <div>
              <dt>Заняло</dt>
              <dd>{formatDuration(e.actualDurationSec)}</dd>
            </div>
          ) : null}
          {e.hadTimer && e.durationLimitMin ? (
            <div>
              <dt>Лимит</dt>
              <dd>{e.durationLimitMin} мин</dd>
            </div>
          ) : null}
          <div>
            <dt>Канал</dt>
            <dd>{performedViaLabel(e.performedVia)}</dd>
          </div>
        </dl>
        {e.summaryRu ? (
          <p className="contract-journal__summary">{e.summaryRu}</p>
        ) : null}
        {e.debriefAnswers && Object.keys(e.debriefAnswers).length > 0 ? (
          <details className="contract-journal__debrief">
            <summary>Ответы вопросника ({e.debriefPreset ?? "?"})</summary>
            <dl>
              {Object.entries(e.debriefAnswers).map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          </details>
        ) : null}
      </div>
    </li>
  );
}

function performedViaLabel(via: ContractJournalEntry["performedVia"]): string {
  switch (via) {
    case "honor":
      return "самоотчёт";
    case "timer":
      return "таймер";
    case "debrief":
      return "вопросник";
    case "auto":
      return "авто";
    default:
      return via;
  }
}
