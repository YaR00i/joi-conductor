import { useMemo } from "react";
import "./contractSeries.css";
import { SeriesPresetCatalog } from "./SeriesPresetCatalog";
import {
  loadSeriesState,
  type ContractSeriesInstance,
} from "../lib/contracts/contractSeries";
import { seriesPanelView } from "../lib/contracts/contractSeriesView";
import type { ContractInstance } from "../lib/contracts/dailyBoard";

type Props = {
  nowMs: number;
  todayChild: ContractInstance | null;
  flash?: string | null;
  onStart: (defId: string) => void;
  onCancel: () => void;
  onChooseNew: () => void;
};

export function ContractSeriesPanel({
  nowMs,
  todayChild,
  flash,
  onStart,
  onCancel,
  onChooseNew,
}: Props) {
  const series: ContractSeriesInstance | null = loadSeriesState().series;
  const view = useMemo(
    () =>
      seriesPanelView({
        series,
        todayTitleRu: todayChild?.titleRu,
        todayBodyRu: todayChild?.bodyRu,
        deadlineMs: todayChild?.deadlineMs,
        nowMs,
      }),
    [series, todayChild, nowMs],
  );

  return (
    <section className="contract-series" aria-label="Долгие контракты">
      <div className="contract-series__head">
        <div>
          <p className="contract-series__kicker">Долгие контракты</p>
          {view.kind === "idle" ? (
            <h2 className="contract-series__title">Каталог серий</h2>
          ) : (
            <h2 className="contract-series__title">{view.nameRu}</h2>
          )}
        </div>
      </div>

      {flash ? (
        <p className="contract-series__error" role="status">
          {flash}
        </p>
      ) : null}

      {view.kind === "idle" ? (
        <SeriesPresetCatalog offers={view.offers} onStart={onStart} />
      ) : null}

      {view.kind === "active" ? (
        <>
          <p className="contract-series__counts">
            {view.themeLabelRu ? `${view.themeLabelRu} · ` : ""}
            {view.phaseLabelRu}
            {view.intensity != null ? ` · интенсивность ${view.intensity}/5` : ""}
          </p>
          <p className="contract-series__counts">
            День {view.dayHuman} из {view.totalDays}
            {" · "}✓ {view.done} / × {view.failed} / ⏱ {view.expired}
          </p>
          <div
            className="contract-series__bar"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={view.totalDays}
            aria-valuenow={view.done + view.failed + view.expired}
          >
            <span style={{ width: `${Math.round(view.progress01 * 100)}%` }} />
          </div>
          {view.blockedReasonRu ? (
            <p className="contract-series__error" role="status">
              {view.blockedReasonRu}
            </p>
          ) : null}
          <p className="contract-series__today">
            Сегодня: <strong>{view.todayTitleRu}</strong>
            {view.todayBodyRu ? ` — ${view.todayBodyRu}` : ""}
          </p>
          {view.nextTitleRu ? (
            <p className="contract-series__counts">
              Завтра: {view.nextTitleRu}
            </p>
          ) : null}
          <p className="contract-series__counts">
            До конца дня: {view.countdownRu}
          </p>
          <div className="contract-series__actions">
            <button
              type="button"
              className="contracts-card__btn contracts-card__btn--ghost"
              onClick={onCancel}
            >
              Прервать серию
            </button>
          </div>
        </>
      ) : null}

      {view.kind === "settled" ? (
        <>
          <p className="contract-series__desc">
            {view.status === "cancelled" ? "Серия прервана. " : "Серия завершена. "}
            Выполнено {view.done} из {view.totalDays}
            {view.failed + view.expired > 0
              ? ` · провалы ${view.failed}, просрочки ${view.expired}`
              : ""}
          </p>
          <button
            type="button"
            className="contracts-card__btn contracts-card__btn--done"
            onClick={onChooseNew}
          >
            Выбрать новую
          </button>
        </>
      ) : null}
    </section>
  );
}
