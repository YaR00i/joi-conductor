import { useState, type ReactNode } from "react";
import {
  parsePixelPaletteText,
  serializePixelPalette,
} from "./pixelPalette";
import { PixelColorOperationsPanel } from "./PixelColorOperationsPanel";
import type {
  PixelColorAdjustments,
  PixelColorDitherMode,
} from "./pixelColorOperations";

type Props = {
  className: string;
  foreground: string;
  background: string;
  baseColors: readonly string[];
  favorites: readonly string[];
  recentColors: readonly string[];
  onForegroundChange: (color: string) => void;
  onForegroundPreview?: (color: string) => void;
  onBackgroundChange: (color: string) => void;
  onFavoritesChange: (colors: string[]) => void;
  onSwap: () => void;
  onReset: () => void;
  onReplace?: (tolerance: number) => void;
  replaceDisabled?: boolean;
  onAdjust?: (adjustments: PixelColorAdjustments) => void;
  onQuantize?: (colors: number, dither: PixelColorDitherMode, strength: number) => void;
  onOutline?: (thickness: number, diagonal: boolean) => void;
  outlineDisabled?: boolean;
  canvasView?: ReactNode;
};

const TRANSPARENT_BG =
  "repeating-conic-gradient(#3b3b3b 0% 25%, #242424 0% 50%) 50% / 8px 8px";

function swatchBackground(color: string): string {
  return color === "#00000000" ? TRANSPARENT_BG : color;
}

export function PixelPalettePanel({
  className,
  foreground,
  background,
  baseColors,
  favorites,
  recentColors,
  onForegroundChange,
  onForegroundPreview,
  onBackgroundChange,
  onFavoritesChange,
  onSwap,
  onReset,
  onReplace,
  replaceDisabled,
  onAdjust,
  onQuantize,
  onOutline,
  outlineDisabled,
  canvasView,
}: Props) {
  const [exchangeMode, setExchangeMode] = useState<"import" | "export" | null>(null);
  const [exchangeDraft, setExchangeDraft] = useState("");
  const [replaceTolerance, setReplaceTolerance] = useState(0);
  const custom = favorites.filter((color) => !baseColors.includes(color));
  const recent = recentColors.filter(
    (color, index) => recentColors.indexOf(color) === index,
  );
  const selectSwatch = (color: string, backgroundTarget: boolean) => {
    if (backgroundTarget) onBackgroundChange(color);
    else onForegroundChange(color);
  };
  const renderSwatches = (colors: readonly string[], keyPrefix: string) => (
    <div className="ember-pixel-palette__grid">
      {colors.map((color) => (
        <button
          key={`${keyPrefix}-${color}`}
          type="button"
          className={`ember-palette-swatch ${foreground === color ? "is-active" : ""} ${background === color ? "is-background" : ""}`}
          style={{ background: swatchBackground(color) }}
          title={`${color === "#00000000" ? "Прозрачный" : color} · ЛКМ основной · ПКМ фоновый`}
          onClick={() => selectSwatch(color, false)}
          onContextMenu={(event) => {
            event.preventDefault();
            selectSwatch(color, true);
          }}
        />
      ))}
    </div>
  );

  return (
    <aside className={`${className} ember-pixel-palette`}>
      <div className="ember-pixel-palette__head">
        <h3>Цвет</h3>
        <div className="ember-pixel-palette__fgbg" title="Основной / фоновый цвет · X меняет местами · D сбрасывает">
          <button
            type="button"
            className="is-background"
            style={{ background: swatchBackground(background) }}
            onClick={() => onForegroundChange(background)}
            aria-label={`Фоновый цвет ${background}`}
          />
          <button
            type="button"
            className="is-foreground"
            style={{ background: swatchBackground(foreground) }}
            onClick={() => onForegroundChange(foreground)}
            aria-label={`Основной цвет ${foreground}`}
          />
          <button type="button" className="is-swap" onClick={onSwap} title="Поменять цвета · X">↔</button>
          <button type="button" className="is-reset" onClick={onReset} title="Сбросить цвета · D">◩</button>
        </div>
      </div>

      {recent.length ? (
        <section>
          <p>Недавние</p>
          {renderSwatches(recent, "recent")}
        </section>
      ) : null}
      <section>
        <p>Базовые</p>
        {renderSwatches(baseColors, "base")}
      </section>
      <section>
        <div className="ember-pixel-palette__section-head">
          <p>Пользовательские</p>
          <button
            type="button"
            className="ghost ember-chip--sm"
            disabled={!custom.includes(foreground)}
            onClick={() => onFavoritesChange(favorites.filter((color) => color !== foreground))}
            title="Удалить активный пользовательский цвет"
          >−</button>
        </div>
        {custom.length ? renderSwatches(custom, "custom") : <span className="muted">Пока пусто</span>}
        <label className="ember-pixel-palette__picker" title="Выбрать и добавить цвет">
          <span>+</span>
          <input
            type="color"
            aria-label="Добавить пользовательский цвет"
            value={foreground.length === 7 ? foreground : "#c45c26"}
            ref={(node) => {
              if (!node) return;
              node.onchange = () => {
                onForegroundChange(node.value);
                if (!baseColors.includes(node.value) && !favorites.includes(node.value)) {
                  onFavoritesChange([...favorites, node.value]);
                }
              };
            }}
            onInput={(event) =>
              (onForegroundPreview ?? onForegroundChange)(event.currentTarget.value)
            }
          />
        </label>
      </section>

      {onReplace ? (
        <section className="ember-pixel-palette__replace">
          <div>
            <span style={{ background: swatchBackground(background) }} />
            <b>→</b>
            <span style={{ background: swatchBackground(foreground) }} />
            <button
              type="button"
              className="ghost ember-chip--sm"
              disabled={replaceDisabled || background === foreground}
              onClick={() => onReplace(replaceTolerance)}
              title="Заменить фоновый цвет основным в активном слое или выделении"
            >Заменить</button>
          </div>
          <label>
            <span>Допуск</span>
            <input
              type="range"
              min={0}
              max={255}
              value={replaceTolerance}
              onChange={(event) => setReplaceTolerance(Number(event.target.value))}
            />
            <output>{replaceTolerance}</output>
          </label>
        </section>
      ) : null}

      {onAdjust && onQuantize && onOutline ? (
        <PixelColorOperationsPanel
          foreground={foreground}
          disabled={replaceDisabled}
          outlineDisabled={outlineDisabled}
          onAdjust={onAdjust}
          onQuantize={onQuantize}
          onOutline={onOutline}
        />
      ) : null}

      {canvasView}

      <div className="ember-pixel-palette__exchange-actions">
        <button
          type="button"
          className="ghost ember-chip--sm"
          onClick={() => {
            setExchangeDraft("");
            setExchangeMode("import");
          }}
        >Импорт</button>
        <button
          type="button"
          className="ghost ember-chip--sm"
          onClick={() => {
            setExchangeDraft(serializePixelPalette(custom));
            setExchangeMode("export");
          }}
        >Экспорт</button>
      </div>
      {exchangeMode ? (
        <div className="ember-pixel-palette__exchange">
          <textarea
            value={exchangeDraft}
            readOnly={exchangeMode === "export"}
            autoFocus
            aria-label={exchangeMode === "import" ? "Импорт палитры" : "Экспорт палитры"}
            placeholder="#112233, #aabbcc…"
            onChange={(event) => setExchangeDraft(event.target.value)}
            onFocus={(event) => exchangeMode === "export" && event.currentTarget.select()}
          />
          <div>
            {exchangeMode === "import" ? (
              <button
                type="button"
                className="ember-chip ember-chip--sm"
                onClick={() => {
                  const imported = parsePixelPaletteText(exchangeDraft).filter(
                    (color) => !baseColors.includes(color),
                  );
                  onFavoritesChange([...favorites, ...imported]);
                  setExchangeMode(null);
                }}
              >Добавить</button>
            ) : null}
            <button type="button" className="ghost ember-chip--sm" onClick={() => setExchangeMode(null)}>Закрыть</button>
          </div>
        </div>
      ) : null}
    </aside>
  );
}
