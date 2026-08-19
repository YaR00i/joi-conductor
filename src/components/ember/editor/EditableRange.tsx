/**
 * Compact range control with a clickable value that opens a numeric input.
 */
import { useEffect, useId, useRef, useState } from "react";

type Props = {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  disabled?: boolean;
  title?: string;
  onChange: (value: number) => void;
  /** Digits after decimal when displaying (default 0). */
  decimals?: number;
};

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function formatValue(n: number, decimals: number, suffix: string): string {
  const t =
    decimals > 0 ? n.toFixed(decimals) : String(Math.round(n));
  return suffix ? `${t}${suffix}` : t;
}

export function EditableRange({
  label,
  value,
  min,
  max,
  step = 1,
  suffix = "",
  disabled = false,
  title,
  onChange,
  decimals = 0,
}: Props) {
  const id = useId();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!editing) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [editing]);

  const commit = () => {
    setEditing(false);
    const raw = draft.replace(",", ".").replace(suffix, "").trim();
    const n = Number(raw);
    if (!Number.isFinite(n)) return;
    const snapped =
      step >= 1 ? Math.round(n / step) * step : Math.round(n / step) * step;
    onChange(clamp(snapped, min, max));
  };

  const pct = max === min ? 0 : ((clamp(value, min, max) - min) / (max - min)) * 100;

  return (
    <label className="ember-edit-range" title={title} htmlFor={id}>
      <span className="ember-edit-range__head">
        <span className="ember-edit-range__label">{label}</span>
        {editing ? (
          <input
            ref={inputRef}
            className="ember-edit-range__num"
            type="number"
            min={min}
            max={max}
            step={step}
            disabled={disabled}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commit();
              } else if (e.key === "Escape") {
                e.preventDefault();
                setEditing(false);
              }
            }}
            aria-label={`${label} (ввод)`}
          />
        ) : (
          <button
            type="button"
            className="ember-edit-range__value"
            disabled={disabled}
            title={`Клик — ввести число (${min}…${max})`}
            onClick={() => {
              if (disabled) return;
              setDraft(
                decimals > 0
                  ? value.toFixed(decimals)
                  : String(Math.round(value)),
              );
              setEditing(true);
            }}
          >
            {formatValue(value, decimals, suffix)}
          </button>
        )}
      </span>
      <input
        id={id}
        className="ember-edit-range__slider"
        type="range"
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        value={clamp(value, min, max)}
        style={{ ["--range-pct" as string]: `${pct}%` }}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}
