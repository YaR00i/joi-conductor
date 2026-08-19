import { useMemo } from "react";
import { listQuestBoardRows } from "../lib/questBoardDisplay";
import { playUiClick, primeUiAudio } from "../lib/uiSound";

type QuestMetaBoardProps = {
  onGoSession?: () => void;
  onGoRoulette?: () => void;
};

/** Read-only catalog of mid-session quests — meta board outside live session. */
export function QuestMetaBoard({
  onGoSession,
  onGoRoulette,
}: QuestMetaBoardProps) {
  const rows = useMemo(() => listQuestBoardRows(), []);

  return (
    <section className="quest-meta-board" aria-label="Квесты сессии">
      <div className="quest-meta-board__head">
        <span className="quest-meta-board__title">Квесты сессии</span>
        <span className="quest-meta-board__sub">
          Всплывают mid-session · награда ◆
        </span>
      </div>
      <p className="quest-meta-board__lead">
        Справочник офферов во время сессии. Взять их здесь нельзя — только
        принять, когда госпожа предложит на ходу.
      </p>
      <ul className="quest-meta-board__list">
        {rows.map((row) => (
          <li key={row.id} className="quest-meta-board__row">
            <div className="quest-meta-board__main">
              <span className="quest-meta-board__kind">{row.kindRu}</span>
              <span className="quest-meta-board__name">{row.nameRu}</span>
              <span className="quest-meta-board__meta">
                {row.durationLabelRu} · {row.rewardLabelRu}
              </span>
            </div>
            <p className="quest-meta-board__rule">{row.ruleRu}</p>
          </li>
        ))}
      </ul>
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
