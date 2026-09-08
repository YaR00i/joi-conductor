import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import Phaser from "phaser";
import { FarmScene, type FarmSceneHandlers } from "./FarmScene";
import type { FarmFieldTool, FarmWorld } from "./farmSim";

type Props = {
  worldRef: React.MutableRefObject<FarmWorld | null>;
  paused: boolean;
  onHud: () => void;
  tool: FarmFieldTool;
};

export type FarmCanvasHandle = {
  zoomBy: (factor: number) => void;
};

export const FarmCanvas = forwardRef<FarmCanvasHandle, Props>(function FarmCanvas(
  { worldRef, paused, onHud, tool },
  ref,
) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const hudRef = useRef(onHud);
  hudRef.current = onHud;
  const toolRef = useRef(tool);
  toolRef.current = tool;

  useImperativeHandle(ref, () => ({
    zoomBy(factor: number) {
      const scene = gameRef.current?.scene.getScene("FarmScene") as FarmScene | undefined;
      scene?.zoomBy(factor);
    },
  }));

  useEffect(() => {
    const parent = hostRef.current;
    if (!parent) return;
    const handlers: FarmSceneHandlers = {
      world: () => worldRef.current,
      paused: () => pausedRef.current,
      onHud: () => hudRef.current(),
      tool: () => toolRef.current,
    };
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent,
      width: Math.max(640, parent.clientWidth || 1280),
      height: Math.max(480, parent.clientHeight || 720),
      backgroundColor: "#6ec8f0",
      render: {
        antialias: true,
        preserveDrawingBuffer: true,
      },
      scale: {
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
      scene: [],
    });
    game.scene.add("FarmScene", FarmScene, true, handlers);
    gameRef.current = game;
    return () => {
      gameRef.current = null;
      game.destroy(true);
    };
  }, [worldRef]);

  return <div ref={hostRef} className="farm-canvas" />;
});
