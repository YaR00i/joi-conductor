import type { CumplayStep } from "../../lib/types";
import { SessionCindersBribeButton } from "./SessionCindersBribeButton";

export function SessionCumplayDock({
  variant,
  tagLabel,
  stepIndex,
  stepCount,
  step,
  contractEatRestyle,
  cindersBalance,
  onAnswerCumplay,
  onBribeMistress,
}: {
  variant: "finale" | "session";
  tagLabel: string;
  stepIndex: number;
  stepCount: number;
  step: CumplayStep;
  contractEatRestyle?: {
    promptLabelRu: string;
    okButtonLabelRu: string;
  } | null;
  cindersBalance: number;
  onAnswerCumplay: (optionId: string) => void;
  onBribeMistress: () => void;
}) {
  const className =
    variant === "finale"
      ? `confirm-dock confirm-dock--prompt confirm-dock--promise-over confirm-dock--cumplay${
          contractEatRestyle ? " confirm-dock--contract-eat" : ""
        }`
      : `confirm-dock confirm-dock--prompt confirm-dock--cumplay${
          contractEatRestyle ? " confirm-dock--contract-eat" : ""
        }`;

  return (
    <div
      className={className}
      role="group"
      aria-label={variant === "finale" ? "Cumplay" : tagLabel}
    >
      <div className="confirm-dock__prompt">
        <span className="confirm-dock__prompt-tag">
          {contractEatRestyle
            ? "Контракт"
            : variant === "finale"
              ? "Cumplay"
              : tagLabel}{" "}
          · {stepIndex + 1}/{stepCount}
        </span>
        <span className="confirm-dock__prompt-q">
          {contractEatRestyle?.promptLabelRu ?? step.labelRu}
        </span>
      </div>
      <div className="confirm-dock__prompt-opts">
        {step.options.map((opt) => (
          <button
            key={opt.id}
            type="button"
            className={`confirm-dock__btn confirm-dock__btn--prompt confirm-dock__btn--${opt.effect}${
              contractEatRestyle && opt.effect === "cumplay_ok"
                ? " confirm-dock__btn--contract-eat"
                : ""
            }`}
            onClick={() => onAnswerCumplay(opt.id)}
          >
            {contractEatRestyle && opt.effect === "cumplay_ok"
              ? contractEatRestyle.okButtonLabelRu
              : opt.labelRu}
          </button>
        ))}
        <SessionCindersBribeButton
          cindersBalance={cindersBalance}
          onBribe={onBribeMistress}
        />
      </div>
    </div>
  );
}
