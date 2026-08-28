import { cumplayOptions } from "../../lib/catalog";
import type {
  MistressSurveyPick,
  ReadingRunState,
} from "../../lib/doujin/readingRun";
import type { ReadingRunListOption } from "./DoujinReadingRunHud";

type Props = {
  run: ReadingRunState;
  otherLists: ReadingRunListOption[];
  onSpinPermission: () => void;
  onCumplay: (id: string) => void;
  onSurvey: (pick: MistressSurveyPick) => void;
  onPickList: (listId: string) => void;
  onAssembleAuto: () => void;
  onAssembleSelf: () => void;
  onClose: () => void;
};

function outcomeRu(outcome: "cum" | "ruin" | "deny"): string {
  switch (outcome) {
    case "cum":
      return "Кончить";
    case "ruin":
      return "Руина";
    case "deny":
      return "Отказ";
    default: {
      const _never: never = outcome;
      return _never;
    }
  }
}

export function DoujinReadingRunOverlay({
  run,
  otherLists,
  onSpinPermission,
  onCumplay,
  onSurvey,
  onPickList,
  onAssembleAuto,
  onAssembleSelf,
  onClose,
}: Props) {
  const overlay = run.overlay;
  if (overlay.kind === "none") return null;

  const plays = cumplayOptions.filter((row) => row.enabled);

  return (
    <div className="doujin-run-overlay" role="dialog">
      <div className="doujin-run-overlay__card">
        {overlay.kind === "permission" ? (
          <>
            <h2>Разрешение</h2>
            <p className="muted">Рулетка как в сессии: кончить, руина или отказ.</p>
            <button type="button" className="btn-primary" onClick={onSpinPermission}>
              Крутить
            </button>
            <button type="button" className="btn-ghost" onClick={onClose}>
              Позже
            </button>
          </>
        ) : null}

        {overlay.kind === "cumplay" ? (
          <>
            <h2>{outcomeRu(overlay.outcome)}</h2>
            <p className="muted">
              {overlay.reason === "self"
                ? "Как распорядиться."
                : overlay.reason === "permission"
                  ? "Камплей по разрешению."
                  : "Без разрешения. Отметь камплей."}
            </p>
            <ul className="doujin-run-overlay__plays">
              {plays.map((play) => (
                <li key={play.id}>
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => onCumplay(play.id)}
                  >
                    {play.nameRu}
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : null}

        {overlay.kind === "survey" ? (
          <>
            <h2>Неужто не понравилось?</h2>
            <p className="muted">
              Очередь кончилась, а ты так и не кончил. Докину в этот список.
            </p>
            <button
              type="button"
              className="btn-primary"
              onClick={() => onSurvey("loved")}
            >
              Дай любимые теги
            </button>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => onSurvey("rare")}
            >
              Реже / жёстче
            </button>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => onSurvey("stop")}
            >
              Хватит
            </button>
          </>
        ) : null}

        {overlay.kind === "selfEnd" ? (
          <>
            <h2>Полка кончилась</h2>
            <p className="muted">Коллекцию не трогаю. Другая очередь?</p>
            {otherLists.length > 0 ? (
              <ul className="doujin-run-overlay__plays">
                {otherLists.map((list) => (
                  <li key={list.id}>
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => onPickList(list.id)}
                    >
                      {list.name} · {list.count}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <>
                <p className="muted">Других своих списков нет.</p>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={onAssembleAuto}
                >
                  Собрать автоочередь
                </button>
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={onAssembleSelf}
                >
                  Составлю сам
                </button>
              </>
            )}
            <button type="button" className="btn-ghost" onClick={onClose}>
              Закрыть
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}
