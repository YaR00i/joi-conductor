import { useState } from "react";
import type {
  PixelColorAdjustments,
  PixelColorDitherMode,
} from "./pixelColorOperations";

type Props = {
  foreground: string;
  disabled?: boolean;
  outlineDisabled?: boolean;
  onAdjust: (adjustments: PixelColorAdjustments) => void;
  onQuantize: (colors: number, dither: PixelColorDitherMode, strength: number) => void;
  onOutline: (thickness: number, diagonal: boolean) => void;
};

const DEFAULT_ADJUSTMENTS: PixelColorAdjustments = {
  hue: 0,
  saturation: 0,
  brightness: 0,
  contrast: 0,
};

const ADJUSTMENT_FIELDS: Array<{
  key: keyof PixelColorAdjustments;
  label: string;
  min: number;
  max: number;
}> = [
  { key: "hue", label: "Тон", min: -180, max: 180 },
  { key: "saturation", label: "Насыщ.", min: -100, max: 100 },
  { key: "brightness", label: "Яркость", min: -100, max: 100 },
  { key: "contrast", label: "Контраст", min: -100, max: 100 },
];

export function PixelColorOperationsPanel({
  foreground,
  disabled,
  outlineDisabled,
  onAdjust,
  onQuantize,
  onOutline,
}: Props) {
  const [adjustments, setAdjustments] = useState(DEFAULT_ADJUSTMENTS);
  const [colorLimit, setColorLimit] = useState(8);
  const [dither, setDither] = useState<PixelColorDitherMode>("none");
  const [ditherStrength, setDitherStrength] = useState(50);
  const [outlineThickness, setOutlineThickness] = useState(1);
  const [outlineDiagonal, setOutlineDiagonal] = useState(false);
  const hasAdjustments = Object.values(adjustments).some((value) => value !== 0);

  return (
    <details className="ember-pixel-color-ops">
      <summary>
        <span>Коррекция</span>
        <small>HSV · индекс · контур</small>
      </summary>
      <div className="ember-pixel-color-ops__body">
        <section>
          <div className="ember-pixel-color-ops__section-head">
            <b>Тон и свет</b>
            <button
              type="button"
              className="ghost ember-chip--sm"
              disabled={!hasAdjustments}
              onClick={() => setAdjustments(DEFAULT_ADJUSTMENTS)}
            >Сброс</button>
          </div>
          {ADJUSTMENT_FIELDS.map((field) => (
            <label className="ember-pixel-color-ops__range" key={field.key}>
              <span>{field.label}</span>
              <input
                type="range"
                min={field.min}
                max={field.max}
                value={adjustments[field.key]}
                onChange={(event) => setAdjustments((current) => ({
                  ...current,
                  [field.key]: Number(event.target.value),
                }))}
              />
              <input
                className="ember-pixel-color-ops__number"
                type="number"
                aria-label={`${field.label} значение`}
                min={field.min}
                max={field.max}
                value={adjustments[field.key]}
                onChange={(event) => setAdjustments((current) => ({
                  ...current,
                  [field.key]: Math.max(field.min, Math.min(field.max, Number(event.target.value) || 0)),
                }))}
              />
            </label>
          ))}
          <button
            type="button"
            className="ember-chip ember-chip--sm ember-pixel-color-ops__apply"
            disabled={disabled || !hasAdjustments}
            onClick={() => onAdjust(adjustments)}
          >Применить коррекцию</button>
        </section>

        <section>
          <b>Ограничение палитры</b>
          <div className="ember-pixel-color-ops__row">
            <label>
              <span>Цветов</span>
              <input
                type="number"
                min={2}
                max={32}
                value={colorLimit}
                onChange={(event) => setColorLimit(Math.max(2, Math.min(32, Number(event.target.value) || 2)))}
              />
            </label>
            <label>
              <span>Дизеринг</span>
              <select value={dither} onChange={(event) => setDither(event.target.value as PixelColorDitherMode)}>
                <option value="none">Нет</option>
                <option value="ordered">Bayer 4×4</option>
                <option value="floyd">Floyd–Steinberg</option>
              </select>
            </label>
          </div>
          {dither !== "none" ? (
            <label className="ember-pixel-color-ops__range">
              <span>Сила</span>
              <input
                type="range"
                min={0}
                max={100}
                value={ditherStrength}
                onChange={(event) => setDitherStrength(Number(event.target.value))}
              />
              <output>{ditherStrength}%</output>
            </label>
          ) : null}
          <button
            type="button"
            className="ember-chip ember-chip--sm ember-pixel-color-ops__apply"
            disabled={disabled}
            onClick={() => onQuantize(colorLimit, dither, ditherStrength)}
          >Индексировать</button>
        </section>

        <section>
          <div className="ember-pixel-color-ops__section-head">
            <b>Внешний контур</b>
            <span
              className="ember-pixel-color-ops__color"
              style={{ background: foreground }}
              title={`Цвет контура ${foreground}`}
            />
          </div>
          <div className="ember-pixel-color-ops__row">
            <label>
              <span>Толщина</span>
              <input
                type="number"
                min={1}
                max={4}
                value={outlineThickness}
                onChange={(event) => setOutlineThickness(Math.max(1, Math.min(4, Number(event.target.value) || 1)))}
              />
            </label>
            <label className="ember-pixel-color-ops__check">
              <input
                type="checkbox"
                checked={outlineDiagonal}
                onChange={(event) => setOutlineDiagonal(event.target.checked)}
              />
              Диагонали
            </label>
          </div>
          <button
            type="button"
            className="ember-chip ember-chip--sm ember-pixel-color-ops__apply"
            disabled={disabled || outlineDisabled || foreground === "#00000000"}
            onClick={() => onOutline(outlineThickness, outlineDiagonal)}
          >Создать контур</button>
        </section>
        <p className="ember-pixel-color-ops__hint">Активный слой или грань · выделение ограничивает область · одна команда = один Undo</p>
      </div>
    </details>
  );
}
