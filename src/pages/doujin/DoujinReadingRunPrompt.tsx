import { useEffect, type ReactNode } from "react";

type StartProps = {
  kind: "start";
  onStartFresh: () => void;
  onContinue: () => void;
  onCancel: () => void;
};

type LeaveProps = {
  kind: "leave";
  onStay: () => void;
  onLeave: () => void;
};

type Props = StartProps | LeaveProps;

export function DoujinReadingRunPrompt(props: Props) {
  const onCancel = props.kind === "start" ? props.onCancel : props.onStay;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      e.preventDefault();
      onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  let kicker: string;
  let title: string;
  let hint: string;
  let actions: ReactNode;
  switch (props.kind) {
    case "start":
      kicker = "прогон";
      title = "Продолжить?";
      hint = "Есть место остановки. Можно с начала списка.";
      actions = (
        <>
          <button
            type="button"
            className="doujin-run-prompt__ghost"
            onClick={props.onStartFresh}
          >
            Сначала
          </button>
          <button
            type="button"
            className="doujin-run-prompt__go"
            onClick={props.onContinue}
          >
            Продолжить
          </button>
        </>
      );
      break;
    case "leave":
      kicker = "прогон";
      title = "Выйти?";
      hint = "Прогресс сохранён — вернёшься к этому месту.";
      actions = (
        <>
          <button
            type="button"
            className="doujin-run-prompt__ghost"
            onClick={props.onLeave}
          >
            Выйти
          </button>
          <button
            type="button"
            className="doujin-run-prompt__go"
            onClick={props.onStay}
          >
            Остаться
          </button>
        </>
      );
      break;
    default: {
      const _never: never = props;
      return _never;
    }
  }

  return (
    <div
      className="doujin-picker-scrim doujin-run-prompt-scrim"
      role="dialog"
      aria-modal="true"
      aria-labelledby="doujin-run-prompt-title"
      onClick={onCancel}
    >
      <div
        className="doujin-picker doujin-run-prompt"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="doujin-picker__head">
          <div className="doujin-picker__titles">
            <span className="doujin-chrome__kicker">{kicker}</span>
            <h2 id="doujin-run-prompt-title">{title}</h2>
          </div>
          <button
            type="button"
            className="doujin-picker__close"
            onClick={onCancel}
          >
            {props.kind === "start" ? "Отмена" : "Назад"}
          </button>
        </header>
        <p className="doujin-picker__hint">{hint}</p>
        <div className="doujin-run-prompt__actions">{actions}</div>
      </div>
    </div>
  );
}
