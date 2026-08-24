import { useRef, type PointerEvent as ReactPointerEvent } from "react";
import type {
  PixelCanvasGuide,
  PixelCanvasReference,
} from "./pixelCanvasView";

type ReferenceProps = {
  reference: PixelCanvasReference | null;
  layer: "under" | "over" | "side";
  cellScale: number;
  width: number;
  height: number;
};

export function PixelCanvasReferenceLayer({
  reference,
  layer,
  cellScale,
  width,
  height,
}: ReferenceProps) {
  if (!reference || reference.mode !== layer) return null;
  const image = (
    <img
      src={reference.url}
      alt={`Референс ${reference.name}`}
      draggable={false}
      style={{
        opacity: reference.opacity / 100,
        transform: `translate(${reference.offsetX * cellScale}px, ${reference.offsetY * cellScale}px) scale(${reference.scale / 100}) scaleX(${reference.mirror ? -1 : 1})`,
      }}
    />
  );
  if (layer === "side") {
    return (
      <div
        className="ember-pixel-reference-side"
        style={{ width: width * cellScale, height: height * cellScale }}
      >
        {image}
        <span>{reference.name}</span>
      </div>
    );
  }
  return <div className={`ember-pixel-reference-layer is-${layer}`}>{image}</div>;
}

type OverlayProps = {
  width: number;
  height: number;
  cellScale: number;
  gridVisible: boolean;
  gridStep: number;
  gridOpacity: number;
  guidesVisible: boolean;
  guides: readonly PixelCanvasGuide[];
  onMoveGuide: (id: string, position: number, extent: number) => void;
  onRemoveGuide: (id: string) => void;
};

export function PixelCanvasOverlays({
  width,
  height,
  cellScale,
  gridVisible,
  gridStep,
  gridOpacity,
  guidesVisible,
  guides,
  onMoveGuide,
  onRemoveGuide,
}: OverlayProps) {
  const dragPositionRef = useRef<number | null>(null);
  const dragGuideRef = useRef<string | null>(null);
  const updateDrag = (
    event: ReactPointerEvent<HTMLButtonElement>,
    guide: PixelCanvasGuide,
  ) => {
    if (dragGuideRef.current !== guide.id) return;
    const overlay = event.currentTarget.parentElement;
    if (!overlay) return;
    const rect = overlay.getBoundingClientRect();
    const raw = guide.axis === "x"
      ? (event.clientX - rect.left) / cellScale
      : (event.clientY - rect.top) / cellScale;
    const extent = guide.axis === "x" ? width : height;
    const position = Math.max(0, Math.min(extent, Math.round(raw)));
    dragPositionRef.current = position;
    if (guide.axis === "x") event.currentTarget.style.left = `${position * cellScale}px`;
    else event.currentTarget.style.top = `${position * cellScale}px`;
    const label = event.currentTarget.querySelector("span");
    if (label) label.textContent = `${guide.axis.toUpperCase()} ${position}`;
  };
  const finishDrag = (
    event: ReactPointerEvent<HTMLButtonElement>,
    guide: PixelCanvasGuide,
  ) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    const position = dragPositionRef.current;
    dragPositionRef.current = null;
    dragGuideRef.current = null;
    if (position === null) return;
    onMoveGuide(guide.id, position, guide.axis === "x" ? width : height);
  };

  return (
    <>
      {gridVisible ? (
        <div
          className="ember-pixel-grid-overlay"
          style={{
            backgroundSize: `${cellScale * Math.max(1, gridStep)}px ${cellScale * Math.max(1, gridStep)}px`,
            opacity: Math.max(0, Math.min(100, gridOpacity)) / 100,
          }}
          aria-hidden
        />
      ) : null}
      {guidesVisible && guides.length ? (
        <div className="ember-pixel-guides" aria-label="Направляющие холста">
          {guides.map((guide) => (
            <button
              key={guide.id}
              type="button"
              className={`ember-pixel-guide is-${guide.axis}`}
              style={guide.axis === "x"
                ? { left: guide.position * cellScale }
                : { top: guide.position * cellScale }}
              title="Перетащить · двойной клик удаляет"
              onDoubleClick={() => onRemoveGuide(guide.id)}
              onPointerDown={(event) => {
                dragPositionRef.current = guide.position;
                dragGuideRef.current = guide.id;
                event.currentTarget.setPointerCapture(event.pointerId);
              }}
              onPointerMove={(event) => updateDrag(event, guide)}
              onPointerUp={(event) => finishDrag(event, guide)}
              onPointerCancel={(event) => finishDrag(event, guide)}
            >
              <span>{guide.axis.toUpperCase()} {guide.position}</span>
            </button>
          ))}
        </div>
      ) : null}
    </>
  );
}
