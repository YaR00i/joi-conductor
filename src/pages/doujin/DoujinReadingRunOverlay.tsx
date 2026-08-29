import type { ReactNode } from "react";
import { cumplayOptions } from "../../lib/catalog";
import type {
  MistressSurveyPick,
  ReadingRunOverlay,
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

function cumplayHint(reason: Extract<ReadingRunOverlay, { kind: "cumplay" }>["reason"]): string {
  switch (reason) {
    case "self":
      return "Как распорядиться.";
    case "permission":
      return "Камплей по разрешению.";
    case "unauthorized":
      return "Без разрешения. Отметь камплей.";
    default: {
      const _never: never = reason;
      return _never;
    }
  }
}

function OverlayChoice({
  children,
  onClick,
  primary = false,
}: {
  children: ReactNode;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      className={
        "doujin-run-overlay__choice" + (primary ? " is-primary" : "")
      }
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function OverlayShell({
  kicker,
  title,
  hint,
  children,
}: {
  kicker: string;
  title: string;
  hint: string;
  children: ReactNode;
}) {
  return (
    <div
      className="doujin-run-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="doujin-run-overlay-title"
    >
      <div className="doujin-run-overlay__card">
        <header className="doujin-run-overlay__head">
          <span className="doujin-chrome__kicker">{kicker}</span>
          <h2 id="doujin-run-overlay-title">{title}</h2>
        </header>
        <p className="doujin-run-overlay__hint">{hint}</p>
        {children}
      </div>
    </div>
  );
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
  switch (overlay.kind) {
    case "none":
      return null;
    case "permission":
      return (
        <OverlayShell
          kicker="прогон"
          title="Разрешение"
          hint="Рулетка как в сессии: кончить, руина или отказ."
        >
          <div className="doujin-run-overlay__actions">
            <OverlayChoice onClick={onClose}>Позже</OverlayChoice>
            <OverlayChoice primary onClick={onSpinPermission}>
              Крутить
            </OverlayChoice>
          </div>
        </OverlayShell>
      );
    case "cumplay": {
      const plays = cumplayOptions.filter((row) => row.enabled);
      return (
        <OverlayShell
          kicker="камплей"
          title={outcomeRu(overlay.outcome)}
          hint={cumplayHint(overlay.reason)}
        >
          <ul className="doujin-run-overlay__plays">
            {plays.map((play) => (
              <li key={play.id}>
                <OverlayChoice onClick={() => onCumplay(play.id)}>
                  {play.nameRu}
                </OverlayChoice>
              </li>
            ))}
          </ul>
        </OverlayShell>
      );
    }
    case "survey":
      return (
        <OverlayShell
          kicker="прогон"
          title="Неужто не понравилось?"
          hint="Очередь кончилась, а ты так и не кончил. Докину в этот список."
        >
          <div className="doujin-run-overlay__stack">
            <OverlayChoice primary onClick={() => onSurvey("loved")}>
              Дай любимые теги
            </OverlayChoice>
            <OverlayChoice onClick={() => onSurvey("rare")}>
              Реже / жёстче
            </OverlayChoice>
            <OverlayChoice onClick={() => onSurvey("stop")}>
              Хватит
            </OverlayChoice>
          </div>
        </OverlayShell>
      );
    case "selfEnd":
      return (
        <OverlayShell
          kicker="прогон"
          title="Полка кончилась"
          hint="Коллекцию не трогаю. Другая очередь?"
        >
          {otherLists.length > 0 ? (
            <ul className="doujin-run-overlay__plays doujin-run-overlay__plays--lists">
              {otherLists.map((list) => (
                <li key={list.id}>
                  <OverlayChoice onClick={() => onPickList(list.id)}>
                    {list.name} · {list.count}
                  </OverlayChoice>
                </li>
              ))}
            </ul>
          ) : (
            <div className="doujin-run-overlay__stack">
              <OverlayChoice primary onClick={onAssembleAuto}>
                Собрать автоочередь
              </OverlayChoice>
              <OverlayChoice onClick={onAssembleSelf}>
                Составлю сам
              </OverlayChoice>
            </div>
          )}
          <div className="doujin-run-overlay__stack">
            <OverlayChoice onClick={onClose}>Закрыть</OverlayChoice>
          </div>
        </OverlayShell>
      );
    default: {
      const _never: never = overlay;
      return _never;
    }
  }
}
