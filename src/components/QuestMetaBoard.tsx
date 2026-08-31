import { useMemo, useState } from "react";
import { listQuestBoardRows } from "../lib/questBoardDisplay";
import {
  loadDisabledQuestIds,
  setQuestInPool,
} from "../lib/questPool";
import { playUiClick, primeUiAudio } from "../lib/uiSound";
import { UiCheck } from "./UiCheck";

type QuestMetaBoardProps = {
  onGoSession?: () => void;
  onGoRoulette?: () => void;
};

/** Catalog of mid-session quest types — toggle the pool, don't spoiler the offer. */
export function QuestMetaBoard({
  onGoSession,
  onGoRoulette,
}: QuestMetaBoardProps) {
  const [disabledIds, setDisabledIds] = useState(() => loadDisabledQuestIds());
  const rows = useMemo(
    () => listQuestBoardRows(undefined, disabledIds),
    [disabledIds],
  );
  const enabledCount = rows.filter((r) => r.enabled).length;

  return (
    <section className="quest-meta-board" aria-label="Пул квестов сессии">
      <div className="hub-media__head">
        <span className="hub-media__title">Квесты сессии</span>
        <span className="hub-media__sub">
          Пул · {enabledCount} из {rows.length}
        </span>
      </div>
      <ul className="quest-meta-board__list">
        {rows.map((row) => (
          <li
            key={row.id}
            className={`quest-meta-board__row${row.enabled ? "" : " is-off"}`}
          >
            <div className="quest-meta-board__main">
              <span className="quest-meta-board__kind">{row.kindRu}</span>
              <span className="quest-meta-board__name">{row.nameRu}</span>
            </div>
            <UiCheck
              className="ui-check--inline"
              checked={row.enabled}
              onChange={(on) => {
                setDisabledIds(setQuestInPool(row.id, on));
              }}
            >
              в пуле
            </UiCheck>
          </li>
        ))}
      </ul>
      {enabledCount === 0 ? (
        <p className="quest-meta-board__note">
          Все выключены — в сессии квесты не предложит, кроме контрактов.
        </p>
      ) : null}
      {(onGoSession || onGoRoulette) && (
        <div className="quest-meta-board__cta">
          {onGoRoulette ? (
            <button
              type="button"
              className="quest-meta-board__link"
              onClick={() => {
                void primeUiAudio();
                playUiClick();
                onGoRoulette();
              }}
            >
              К рулетке
            </button>
          ) : null}
          {onGoSession ? (
            <button
              type="button"
              className="quest-meta-board__link"
              onClick={() => {
                void primeUiAudio();
                playUiClick();
                onGoSession();
              }}
            >
              К сессии
            </button>
          ) : null}
        </div>
      )}
    </section>
  );
}
