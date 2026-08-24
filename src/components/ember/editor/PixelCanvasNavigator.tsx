import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import { pixelNavigatorViewport, type PixelCanvasRect } from "./pixelCanvasNavigation";

type Props = {
  stageRef: RefObject<HTMLDivElement | null>;
  sourceCanvasRef: RefObject<HTMLCanvasElement | null>;
  width: number;
  height: number;
  scale: number;
  visible: boolean;
  onClose: () => void;
  revisionA?: unknown;
  revisionB?: unknown;
  revisionC?: unknown;
};

const MAX_DRAW_WIDTH = 128;
const MAX_DRAW_HEIGHT = 92;

export function PixelCanvasNavigator({
  stageRef,
  sourceCanvasRef,
  width,
  height,
  scale,
  visible,
  onClose,
  revisionA,
  revisionB,
  revisionC,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<number | null>(null);
  const [viewport, setViewport] = useState<PixelCanvasRect>({
    left: 0,
    top: 0,
    width: 0,
    height: 0,
  });
  const drawSize = useMemo(() => {
    const ratio = Math.min(MAX_DRAW_WIDTH / Math.max(1, width), MAX_DRAW_HEIGHT / Math.max(1, height));
    let drawWidth = Math.max(1, Math.round(width * ratio));
    let drawHeight = Math.max(1, Math.round(height * ratio));
    const longest = Math.max(drawWidth, drawHeight);
    if (longest < 36) {
      const grow = 36 / longest;
      drawWidth = Math.round(drawWidth * grow);
      drawHeight = Math.round(drawHeight * grow);
    }
    return {
      width: drawWidth,
      height: drawHeight,
    };
  }, [height, width]);

  const update = useCallback(() => {
    frameRef.current = null;
    if (!visible) return;
    const stage = stageRef.current;
    const source = sourceCanvasRef.current;
    const canvas = canvasRef.current;
    if (!stage || !source || !canvas) return;
    if (canvas.width !== drawSize.width) canvas.width = drawSize.width;
    if (canvas.height !== drawSize.height) canvas.height = drawSize.height;
    const context = canvas.getContext("2d");
    if (context) {
      context.clearRect(0, 0, drawSize.width, drawSize.height);
      context.imageSmoothingEnabled = false;
      context.drawImage(source, 0, 0, drawSize.width, drawSize.height);
    }
    setViewport(pixelNavigatorViewport(
      source.getBoundingClientRect(),
      stage.getBoundingClientRect(),
      drawSize.width,
      drawSize.height,
    ));
  }, [drawSize.height, drawSize.width, sourceCanvasRef, stageRef, visible]);

  const scheduleUpdate = useCallback(() => {
    if (frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame(update);
  }, [update]);

  useEffect(() => {
    if (!visible) return;
    const stage = stageRef.current;
    if (!stage) return;
    scheduleUpdate();
    const observer = new ResizeObserver(scheduleUpdate);
    observer.observe(stage);
    stage.addEventListener("scroll", scheduleUpdate, { passive: true });
    return () => {
      observer.disconnect();
      stage.removeEventListener("scroll", scheduleUpdate);
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    };
  }, [scheduleUpdate, stageRef, visible]);

  useEffect(() => {
    scheduleUpdate();
  }, [revisionA, revisionB, revisionC, scale, scheduleUpdate]);

  const centerAt = (event: ReactPointerEvent<HTMLDivElement>) => {
    const stage = stageRef.current;
    const source = sourceCanvasRef.current;
    if (!stage || !source) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const sourceRect = source.getBoundingClientRect();
    const u = Math.max(0, Math.min(1, (event.clientX - rect.left) / Math.max(1, rect.width)));
    const v = Math.max(0, Math.min(1, (event.clientY - rect.top) / Math.max(1, rect.height)));
    const stageRect = stage.getBoundingClientRect();
    stage.scrollLeft += sourceRect.left + sourceRect.width * u - (stageRect.left + stageRect.width / 2);
    stage.scrollTop += sourceRect.top + sourceRect.height * v - (stageRect.top + stageRect.height / 2);
  };

  if (!visible) return null;
  return (
    <aside className="ember-pixel-navigator" aria-label="Навигатор холста">
      <header className="ember-pixel-navigator__header">
        <span>Навигатор</span>
        <button type="button" className="ghost" onClick={onClose} title="Скрыть навигатор" aria-label="Скрыть навигатор">×</button>
      </header>
      <div
        className="ember-pixel-navigator__map"
        style={{ width: drawSize.width, height: drawSize.height }}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          centerAt(event);
        }}
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) centerAt(event);
        }}
      >
        <canvas ref={canvasRef} className="ember-pixel-navigator__canvas" aria-hidden />
        <div
          className="ember-pixel-navigator__viewport"
          style={{
            left: viewport.left,
            top: viewport.top,
            width: viewport.width,
            height: viewport.height,
          }}
          aria-hidden
        />
      </div>
      <footer>{Math.round((scale / 16) * 100)}%</footer>
    </aside>
  );
}
