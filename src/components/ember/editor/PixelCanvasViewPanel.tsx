import { useState } from "react";
import type {
  PixelCanvasGuide,
  PixelCanvasReference,
  PixelGuideAxis,
  PixelReferenceMode,
} from "./pixelCanvasView";

type Props = {
  width: number;
  height: number;
  gridVisible: boolean;
  gridStep: number;
  gridOpacity: number;
  guidesVisible: boolean;
  guides: readonly PixelCanvasGuide[];
  reference: PixelCanvasReference | null;
  onGridVisibleChange: (value: boolean) => void;
  onGridStepChange: (value: number) => void;
  onGridOpacityChange: (value: number) => void;
  onGuidesVisibleChange: (value: boolean) => void;
  onAddGuide: (axis: PixelGuideAxis, position: number, extent: number) => void;
  onRemoveGuide: (id: string) => void;
  onClearGuides: () => void;
  onReferenceFile: (file: File | null) => string | null;
  onRemoveReference: () => void;
  onReferenceChange: (patch: Partial<Omit<PixelCanvasReference, "url" | "name">>) => void;
  onReferenceModeChange: (mode: PixelReferenceMode) => void;
};

export function PixelCanvasViewPanel({
  width,
  height,
  gridVisible,
  gridStep,
  gridOpacity,
  guidesVisible,
  guides,
  reference,
  onGridVisibleChange,
  onGridStepChange,
  onGridOpacityChange,
  onGuidesVisibleChange,
  onAddGuide,
  onRemoveGuide,
  onClearGuides,
  onReferenceFile,
  onRemoveReference,
  onReferenceChange,
  onReferenceModeChange,
}: Props) {
  const [guideX, setGuideX] = useState(Math.floor(width / 2));
  const [guideY, setGuideY] = useState(Math.floor(height / 2));
  const [fileError, setFileError] = useState("");
  const addGuide = (axis: PixelGuideAxis) => {
    onAddGuide(axis, axis === "x" ? guideX : guideY, axis === "x" ? width : height);
  };

  return (
    <details className="ember-pixel-view-panel">
      <summary>
        <span>Вид холста</span>
        <small>сетка · направляющие · референс</small>
      </summary>
      <div className="ember-pixel-view-panel__body">
        <section>
          <div className="ember-pixel-view-panel__section-head">
            <b>Пиксельная сетка</b>
            <label className="ember-pixel-view-panel__check">
              <input type="checkbox" checked={gridVisible} onChange={(event) => onGridVisibleChange(event.target.checked)} />
              Показать
            </label>
          </div>
          <div className="ember-pixel-view-panel__row">
            <label>
              <span>Шаг</span>
              <input type="number" min={1} max={8} value={gridStep} onChange={(event) => onGridStepChange(Math.max(1, Math.min(8, Number(event.target.value) || 1)))} />
            </label>
            <label>
              <span>Прозр.</span>
              <input type="number" min={0} max={100} value={gridOpacity} onChange={(event) => onGridOpacityChange(Math.max(0, Math.min(100, Number(event.target.value) || 0)))} />
            </label>
          </div>
        </section>

        <section>
          <div className="ember-pixel-view-panel__section-head">
            <b>Направляющие</b>
            <label className="ember-pixel-view-panel__check">
              <input type="checkbox" checked={guidesVisible} onChange={(event) => onGuidesVisibleChange(event.target.checked)} />
              Показать
            </label>
          </div>
          <div className="ember-pixel-view-panel__guide-add">
            <label>X<input type="number" min={0} max={width} value={guideX} onChange={(event) => setGuideX(Number(event.target.value) || 0)} /></label>
            <button type="button" className="ghost ember-chip--sm" onClick={() => addGuide("x")}>+</button>
            <label>Y<input type="number" min={0} max={height} value={guideY} onChange={(event) => setGuideY(Number(event.target.value) || 0)} /></label>
            <button type="button" className="ghost ember-chip--sm" onClick={() => addGuide("y")}>+</button>
          </div>
          <div className="ember-pixel-view-panel__guide-actions">
            <button type="button" className="ghost ember-chip--sm" onClick={() => {
              onAddGuide("x", Math.floor(width / 2), width);
              onAddGuide("y", Math.floor(height / 2), height);
            }}>Центр</button>
            <button type="button" className="ghost ember-chip--sm" disabled={!guides.length} onClick={onClearGuides}>Очистить</button>
          </div>
          {guides.length ? (
            <div className="ember-pixel-view-panel__guides">
              {guides.map((guide) => (
                <button key={guide.id} type="button" onClick={() => onRemoveGuide(guide.id)} title="Удалить направляющую">
                  {guide.axis.toUpperCase()} {guide.position} ×
                </button>
              ))}
            </div>
          ) : null}
        </section>

        <section>
          <div className="ember-pixel-view-panel__section-head">
            <b>Референс</b>
            {reference ? <button type="button" className="ghost ember-chip--sm" onClick={onRemoveReference}>Удалить</button> : null}
          </div>
          {!reference ? (
            <label className="ember-pixel-view-panel__file">
              <span>Открыть изображение</span>
              <input type="file" accept="image/*" onChange={(event) => {
                const error = onReferenceFile(event.target.files?.[0] ?? null);
                setFileError(error ?? "");
                event.currentTarget.value = "";
              }} />
            </label>
          ) : (
            <>
              <span className="ember-pixel-view-panel__filename" title={reference.name}>{reference.name}</span>
              <label className="ember-pixel-view-panel__select">
                <span>Режим</span>
                <select value={reference.mode} onChange={(event) => onReferenceModeChange(event.target.value as PixelReferenceMode)}>
                  <option value="over">Поверх</option>
                  <option value="under">Под рисунком</option>
                  <option value="side">Рядом</option>
                </select>
              </label>
              <div className="ember-pixel-view-panel__row">
                <label><span>Opacity</span><input type="number" min={0} max={100} value={reference.opacity} onChange={(event) => onReferenceChange({ opacity: Math.max(0, Math.min(100, Number(event.target.value) || 0)) })} /></label>
                <label><span>Масштаб</span><input type="number" min={10} max={400} value={reference.scale} onChange={(event) => onReferenceChange({ scale: Math.max(10, Math.min(400, Number(event.target.value) || 100)) })} /></label>
              </div>
              <div className="ember-pixel-view-panel__row">
                <label><span>Сдвиг X</span><input type="number" min={-width} max={width} value={reference.offsetX} onChange={(event) => onReferenceChange({ offsetX: Math.max(-width, Math.min(width, Number(event.target.value) || 0)) })} /></label>
                <label><span>Сдвиг Y</span><input type="number" min={-height} max={height} value={reference.offsetY} onChange={(event) => onReferenceChange({ offsetY: Math.max(-height, Math.min(height, Number(event.target.value) || 0)) })} /></label>
              </div>
              <label className="ember-pixel-view-panel__check">
                <input type="checkbox" checked={reference.mirror} onChange={(event) => onReferenceChange({ mirror: event.target.checked })} />
                Отразить по X
              </label>
            </>
          )}
          {fileError ? <p className="ember-pixel-view-panel__error">{fileError}</p> : null}
        </section>
        <p className="ember-pixel-view-panel__hint">Только рабочий вид · не сохраняется в pack и не попадает в экспорт</p>
      </div>
    </details>
  );
}
