import type { ReactNode } from "react";
import { playUiToggle, primeUiAudio } from "../lib/uiSound";

type UiCheckProps = {
  checked: boolean;
  onChange: (next: boolean) => void;
  children: ReactNode;
  disabled?: boolean;
  className?: string;
  title?: string;
};

/** Shared ember-theme checkbox (diamond spark, not system green). */
export function UiCheck({
  checked,
  onChange,
  children,
  disabled = false,
  className = "",
  title,
}: UiCheckProps) {
  return (
    <label
      className={`ui-check ${checked ? "is-on" : "is-off"}${disabled ? " is-disabled" : ""}${className ? ` ${className}` : ""}`}
      title={title}
    >
      <input
        type="checkbox"
        className="ui-check__input"
        checked={checked}
        disabled={disabled}
        onChange={(e) => {
          if (disabled) return;
          void primeUiAudio();
          playUiToggle(e.target.checked);
          onChange(e.target.checked);
        }}
      />
      <span className="ui-check__box" aria-hidden>
        {checked ? (
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
            {/* Ember spark — Hu Tao diamond, not a system check */}
            <path
              d="M6 1.15 10.35 6 6 10.85 1.65 6Z"
              fill="currentColor"
            />
          </svg>
        ) : null}
      </span>
      <span className="ui-check__label">{children}</span>
    </label>
  );
}
