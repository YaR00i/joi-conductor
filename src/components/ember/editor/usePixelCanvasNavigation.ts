import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type MouseEvent as ReactMouseEvent,
  type RefObject,
  type SetStateAction,
} from "react";
import {
  PIXEL_CANVAS_SCALE_100,
  clampPixelCanvasScale,
  fitPixelCanvasScale,
  stepPixelCanvasScale,
} from "./pixelCanvasNavigation";

type Props = {
  stageRef: RefObject<HTMLDivElement | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  scale: number;
  setScale: Dispatch<SetStateAction<number>>;
  width: number;
  height: number;
  minScale?: number;
  maxScale?: number;
  fitPaddingX?: number;
  fitPaddingY?: number;
};

function typingTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
}

export function usePixelCanvasNavigation({
  stageRef,
  canvasRef,
  scale,
  setScale,
  width,
  height,
  minScale = 4,
  maxScale = 48,
  fitPaddingX = 32,
  fitPaddingY = 32,
}: Props) {
  const [handMode, setHandMode] = useState(false);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [navigatorVisible, setNavigatorVisible] = useState(true);
  const spaceHeldRef = useRef(false);
  const handModeRef = useRef(false);
  const dragRef = useRef<{
    x: number;
    y: number;
    scrollLeft: number;
    scrollTop: number;
  } | null>(null);
  handModeRef.current = handMode;

  const shouldPan = useCallback((button = 0) => (
    button === 1 || handModeRef.current || spaceHeldRef.current
  ), []);

  const beginPan = useCallback((event: ReactMouseEvent | MouseEvent) => {
    if (!shouldPan(event.button)) return false;
    const stage = stageRef.current;
    if (!stage) return false;
    event.preventDefault();
    if ("stopPropagation" in event) event.stopPropagation();
    dragRef.current = {
      x: event.clientX,
      y: event.clientY,
      scrollLeft: stage.scrollLeft,
      scrollTop: stage.scrollTop,
    };
    setDragging(true);
    return true;
  }, [shouldPan, stageRef]);

  useEffect(() => {
    const onMove = (event: MouseEvent) => {
      const drag = dragRef.current;
      const stage = stageRef.current;
      if (!drag || !stage) return;
      event.preventDefault();
      stage.scrollLeft = drag.scrollLeft - (event.clientX - drag.x);
      stage.scrollTop = drag.scrollTop - (event.clientY - drag.y);
    };
    const onUp = () => {
      if (!dragRef.current) return;
      dragRef.current = null;
      setDragging(false);
    };
    window.addEventListener("mousemove", onMove, true);
    window.addEventListener("mouseup", onUp, true);
    return () => {
      window.removeEventListener("mousemove", onMove, true);
      window.removeEventListener("mouseup", onUp, true);
    };
  }, [stageRef]);

  useEffect(() => {
    const onDown = (event: KeyboardEvent) => {
      if (event.code !== "Space" || typingTarget(event.target)) return;
      event.preventDefault();
      if (spaceHeldRef.current) return;
      spaceHeldRef.current = true;
      setSpaceHeld(true);
    };
    const onUp = (event: KeyboardEvent) => {
      if (event.code !== "Space") return;
      spaceHeldRef.current = false;
      setSpaceHeld(false);
    };
    const onBlur = () => {
      spaceHeldRef.current = false;
      dragRef.current = null;
      setSpaceHeld(false);
      setDragging(false);
    };
    window.addEventListener("keydown", onDown, true);
    window.addEventListener("keyup", onUp, true);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onDown, true);
      window.removeEventListener("keyup", onUp, true);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  const zoomTo = useCallback((rawScale: number, clientX?: number, clientY?: number) => {
    const stage = stageRef.current;
    const canvas = canvasRef.current;
    const next = clampPixelCanvasScale(rawScale, minScale, maxScale);
    if (!stage || !canvas || next === scale) return;
    const before = canvas.getBoundingClientRect();
    const stageRect = stage.getBoundingClientRect();
    const anchorX = clientX ?? stageRect.left + stageRect.width / 2;
    const anchorY = clientY ?? stageRect.top + stageRect.height / 2;
    const logicalX = Math.max(0, Math.min(width, (anchorX - before.left) / Math.max(1, scale)));
    const logicalY = Math.max(0, Math.min(height, (anchorY - before.top) / Math.max(1, scale)));
    setScale(next);
    requestAnimationFrame(() => {
      const after = canvas.getBoundingClientRect();
      stage.scrollLeft += after.left + logicalX * next - anchorX;
      stage.scrollTop += after.top + logicalY * next - anchorY;
    });
  }, [canvasRef, height, maxScale, minScale, scale, setScale, stageRef, width]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const direction: 1 | -1 = event.deltaY < 0 ? 1 : -1;
      zoomTo(stepPixelCanvasScale(scale, direction, minScale, maxScale), event.clientX, event.clientY);
    };
    stage.addEventListener("wheel", onWheel, { passive: false });
    return () => stage.removeEventListener("wheel", onWheel);
  }, [maxScale, minScale, scale, stageRef, zoomTo]);

  const fit = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    const next = fitPixelCanvasScale(
      rect.width,
      rect.height,
      width,
      height,
      fitPaddingX,
      fitPaddingY,
      minScale,
      maxScale,
    );
    setScale(next);
    requestAnimationFrame(() => {
      stage.scrollLeft = Math.max(0, (stage.scrollWidth - stage.clientWidth) / 2);
      stage.scrollTop = Math.max(0, (stage.scrollHeight - stage.clientHeight) / 2);
    });
  }, [fitPaddingX, fitPaddingY, height, maxScale, minScale, setScale, stageRef, width]);

  const zoomIn = useCallback(() => {
    zoomTo(stepPixelCanvasScale(scale, 1, minScale, maxScale));
  }, [maxScale, minScale, scale, zoomTo]);

  const zoomOut = useCallback(() => {
    zoomTo(stepPixelCanvasScale(scale, -1, minScale, maxScale));
  }, [maxScale, minScale, scale, zoomTo]);

  const zoom100 = useCallback(() => {
    zoomTo(PIXEL_CANVAS_SCALE_100);
  }, [zoomTo]);

  return {
    handMode,
    setHandMode,
    spaceHeld,
    dragging,
    navigatorVisible,
    setNavigatorVisible,
    shouldPan,
    beginPan,
    zoomIn,
    zoomOut,
    zoom100,
    fit,
    zoomPercent: Math.round((scale / PIXEL_CANVAS_SCALE_100) * 100),
  };
}
