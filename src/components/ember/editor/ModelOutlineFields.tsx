/**
 * Shared authoring UI for interactive model outlines (chest and future
 * model-bound tools).
 */
import type { EmberModelOutline } from "../../../game/content/types";
import { resolveModelOutline } from "../../../game/three/interactiveOutline";

export type ModelOutlineFieldsProps = {
  value: EmberModelOutline | undefined;
  onChange: (next: EmberModelOutline | undefined) => void;
};

export function ModelOutlineFields({
  value,
  onChange,
}: ModelOutlineFieldsProps) {
  const resolved = resolveModelOutline(value);
  const enabled = value?.enabled === true;

  const patch = (partial: Partial<EmberModelOutline>) => {
    const next: EmberModelOutline = {
      ...(value ?? {}),
      ...partial,
    };
    if (!next.enabled) {
      onChange(
        next.color || next.interactColor || next.pulseSec != null
          ? { ...next, enabled: false }
          : undefined,
      );
      return;
    }
    onChange(next);
  };

  return (
    <div className="ember-map-region-ed__block ember-model-outline-fields">
      <p className="ember-map-region-ed__label">Обводка модели</p>
      <p className="muted ember-hint">
        Общий пункт для инструментов с привязанной моделью/сценой. В покое —
        цвет обводки; когда можно взаимодействовать — мерцание до цвета
        интерактива.
      </p>
      <label className="ember-map-region-ed__check">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => patch({ enabled: e.target.checked })}
        />
        <span>Показывать обводку</span>
      </label>
      <div
        className="ember-map-region-ed__grid2"
        style={{ opacity: enabled ? 1 : 0.4 }}
      >
        <label className="ember-map-region-ed__field">
          <span>Цвет</span>
          <input
            type="color"
            disabled={!enabled}
            value={resolved.color}
            onChange={(e) => patch({ color: e.target.value })}
          />
        </label>
        <label className="ember-map-region-ed__field">
          <span>Интерактив</span>
          <input
            type="color"
            disabled={!enabled}
            value={resolved.interactColor}
            onChange={(e) => patch({ interactColor: e.target.value })}
          />
        </label>
      </div>
      <label
        className="ember-map-region-ed__row"
        style={{ opacity: enabled ? 1 : 0.4 }}
      >
        <span>Период мерцания</span>
        <input
          type="range"
          min={0.35}
          max={3}
          step={0.05}
          disabled={!enabled}
          value={resolved.pulseSec}
          onChange={(e) => patch({ pulseSec: Number(e.target.value) })}
        />
        <em>{resolved.pulseSec.toFixed(2)}с</em>
      </label>
    </div>
  );
}
