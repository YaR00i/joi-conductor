import type { TideHitVerifyMode } from "../lib/tideHitVerify";
import {
  TIDE_HIT_VERIFY_MODES,
  tideHitVerifyModeHintRu,
  tideHitVerifyModeLabelRu,
  tideHitVerifyModeSubRu,
} from "../lib/tideHitVerify";

export function TideHitVerifyToggle({
  mode,
  onChange,
  compact = false,
  variant = "dock",
}: {
  mode: TideHitVerifyMode;
  onChange: (mode: TideHitVerifyMode) => void;
  compact?: boolean;
  variant?: "dock" | "brain";
}) {
  if (variant === "brain") {
    return (
      <div
        className="brain-seg"
        role="radiogroup"
        aria-label="Режим проверки CBT / plapping"
      >
        {TIDE_HIT_VERIFY_MODES.map((id) => {
          const on = id === mode;
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={on}
              title={tideHitVerifyModeHintRu(id)}
              className={"brain-seg__btn" + (on ? " is-on" : "")}
              onClick={() => onChange(id)}
            >
              {tideHitVerifyModeLabelRu(id)}
              <span className="brain-seg__sub">
                {tideHitVerifyModeSubRu(id)}
              </span>
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div
      className={
        "tide-verify-toggle" + (compact ? " tide-verify-toggle--compact" : "")
      }
      role="group"
      aria-label="Режим проверки CBT / plapping"
    >
      {TIDE_HIT_VERIFY_MODES.map((id) => {
        const active = id === mode;
        return (
          <button
            key={id}
            type="button"
            className={
              "tide-verify-toggle__btn" + (active ? " is-active" : "")
            }
            aria-pressed={active}
            title={tideHitVerifyModeHintRu(id)}
            onClick={() => onChange(id)}
          >
            {tideHitVerifyModeLabelRu(id)}
            <span>{tideHitVerifyModeSubRu(id)}</span>
          </button>
        );
      })}
    </div>
  );
}
