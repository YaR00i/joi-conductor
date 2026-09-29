import { useMemo, useState } from "react";
import type { SeriesOfferCard } from "../lib/contracts/contractSeriesView";
import { uniqueSeriesThemes } from "../lib/contracts/contractSeriesView";

type PeriodFilter = "all" | "week" | "month";

type Props = {
  offers: SeriesOfferCard[];
  onStart: (defId: string) => void;
};

export function SeriesPresetCatalog({ offers, onStart }: Props) {
  const [period, setPeriod] = useState<PeriodFilter>("all");
  const [themeId, setThemeId] = useState<string>("all");
  const themes = useMemo(() => uniqueSeriesThemes(offers), [offers]);
  const filtered = offers.filter((offer) => {
    if (period !== "all" && offer.periodKind !== period) return false;
    if (themeId !== "all" && offer.themeId !== themeId) return false;
    return true;
  });

  return (
    <div className="contract-series__catalog">
      <div className="contract-series__filters" role="toolbar" aria-label="Фильтр серий">
        <div className="contract-series__chips">
          {(
            [
              ["all", "Все"],
              ["week", "7 дней"],
              ["month", "30 дней"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={`contract-series__chip${period === id ? " is-active" : ""}`}
              onClick={() => setPeriod(id)}
            >
              {label}
            </button>
          ))}
        </div>
        {themes.length > 1 ? (
          <div className="contract-series__chips">
            <button
              type="button"
              className={`contract-series__chip${themeId === "all" ? " is-active" : ""}`}
              onClick={() => setThemeId("all")}
            >
              Все темы
            </button>
            {themes.map((theme) => (
              <button
                key={theme.id}
                type="button"
                className={`contract-series__chip${themeId === theme.id ? " is-active" : ""}`}
                onClick={() => setThemeId(theme.id)}
              >
                {theme.labelRu}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <div className="contract-series__offers">
        {filtered.map((offer) => (
          <article key={offer.defId} className="contract-series__offer">
            <div className="contract-series__offer-meta">
              <span className="contract-series__period">{offer.periodLabelRu}</span>
              <span className="contract-series__origin">{offer.originLabelRu}</span>
            </div>
            <h3>{offer.nameRu}</h3>
            <p className="contract-series__theme">{offer.themeLabelRu}</p>
            <p className="contract-series__desc">{offer.descriptionRu}</p>
            <p className="contract-series__progression">{offer.progressionRu}</p>
            {offer.previewRu.length > 0 ? (
              <ul className="contract-series__preview">
                {offer.previewRu.map((name, i) => (
                  <li key={`${i}:${name}`}>{name}</li>
                ))}
              </ul>
            ) : null}
            {offer.startError ? (
              <p className="contract-series__error">{offer.startError}</p>
            ) : null}
            <button
              type="button"
              className="contracts-card__btn contracts-card__btn--done"
              disabled={!offer.canStart}
              title={offer.startError}
              onClick={() => onStart(offer.defId)}
            >
              Начать
            </button>
          </article>
        ))}
      </div>
      {filtered.length === 0 ? (
        <p className="contract-series__desc">Нет серий с таким фильтром.</p>
      ) : null}
    </div>
  );
}
