import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import {
  buildJigsaw,
  cellKey,
  TAB_PAD,
  type JigsawSpec,
} from "../../lib/puzzle/jigsaw";

/**
 * Canvas-driven classic jigsaw board: scatter → drag groups → snap to place,
 * optional rotation, "edge first" arrange, ghost preview, special-piece glow.
 *
 * Pure pointer/draw logic. Reward/task concerns are owned by PuzzleGame via
 * callbacks (onSpecialPlaced / onPieceTouched / onFirstMove).
 */

export interface PuzzleBoardProps {
  image: HTMLImageElement | null;
  cols: number;
  rows: number;
  rotateEnabled: boolean;
  showGhost: boolean;
  /** cellKey → taskId; these pieces glow and fire onSpecialPlaced on snap. */
  specialCells: Map<string, string>;
  /** When true, the board ignores drag (a task overlay is up). */
  locked: boolean;
  /** When a per_touch task is active, every grab fires onPieceTouched. */
  perTouchActive: boolean;
  onFirstMove: () => void;
  onSolved: () => void;
  onSpecialPlaced: (cellKey: string) => void;
  onPieceTouched: () => void;
}

export interface PuzzleBoardHandle {
  edgeFirst: () => void;
  shuffle: () => void;
  rotateSelected: () => void;
}

interface Piece {
  col: number;
  row: number;
  x: number; // center, board coords
  y: number;
  rotation: number; // degrees 0/90/180/270
  groupId: number;
  placed: boolean;
  path: Path2D;
  isBorder: boolean;
  specialTaskId?: string;
}

const SNAP_THRESHOLD = 0.4; // fraction of piece size
const ROTATIONS = [0, 90, 180, 270];

function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export const PuzzleBoard = forwardRef<PuzzleBoardHandle, PuzzleBoardProps>(
  function PuzzleBoard(props, ref) {
    const {
      image,
      cols,
      rows,
      rotateEnabled,
      specialCells,
      locked,
      onFirstMove,
      onSolved,
      onSpecialPlaced,
      onPieceTouched,
    } = props;

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const wrapRef = useRef<HTMLDivElement>(null);
    const ctxRef = useRef<CanvasRenderingContext2D | null>(null);

    const specRef = useRef<JigsawSpec | null>(null);
    const piecesRef = useRef<Piece[]>([]);
    const orderRef = useRef<number[]>([]); // piece indices, bottom→top
    const boardRef = useRef({ x: 0, y: 0, w: 0, h: 0 });
    const dragRef = useRef<{
      groupIds: Set<number>;
      lastX: number;
      lastY: number;
      moved: boolean;
    } | null>(null);
    const selectedRef = useRef<number | null>(null);
    const solvedRef = useRef(false);
    const firstMoveFiredRef = useRef(false);
    const sizeRef = useRef({ w: 0, h: 0, dpr: 1 });
    const propsRef = useRef(props);
    propsRef.current = props;

    // ----- board sizing / layout -----
    const layout = useCallback(() => {
      const canvas = canvasRef.current;
      const wrap = wrapRef.current;
      const img = image;
      if (!canvas || !wrap || !img) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cw = wrap.clientWidth;
      const ch = wrap.clientHeight;
      if (cw === 0 || ch === 0) return;
      sizeRef.current = { w: cw, h: ch, dpr };
      canvas.width = Math.floor(cw * dpr);
      canvas.height = Math.floor(ch * dpr);
      canvas.style.width = `${cw}px`;
      canvas.style.height = `${ch}px`;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctxRef.current = ctx;

      // Fit the image into ~60% of the area, leaving a tray around it.
      const padTop = 16;
      const maxBoardW = cw * 0.6;
      const maxBoardH = (ch - padTop) * 0.78;
      const scale = Math.min(maxBoardW / img.naturalWidth, maxBoardH / img.naturalHeight);
      const bw = img.naturalWidth * scale;
      const bh = img.naturalHeight * scale;
      const bx = (cw - bw) / 2;
      const by = padTop + ((ch - padTop) - bh) / 2;
      boardRef.current = { x: bx, y: by, w: bw, h: bh };
    }, [image]);

    // ----- (re)build pieces when a new image/grid arrives -----
    const rebuild = useCallback(() => {
      const img = image;
      if (!img) return;
      layout();
      const board = boardRef.current;
      if (board.w === 0) return;
      const spec = buildJigsaw(cols, rows, board.w, board.h, makeRng((cols * 911 + rows * 31) | 0));
      specRef.current = spec;
      const rng = makeRng(Date.now() & 0xffffffff);
      const pieces: Piece[] = spec.cells.map((cell) => {
        const key = cellKey(cell.col, cell.row);
        const taskId = specialCells.get(key);
        // scatter into the tray (outside the board rect)
        let px = 0;
        let py = 0;
        const { w: cw, h: ch } = sizeRef.current;
        const margin = 8;
        for (let attempt = 0; attempt < 24; attempt++) {
          const inLeft = rng() < 0.5;
          const leftW = board.x - margin;
          const rightW = cw - (board.x + board.w) - margin;
          const useLeft = inLeft && leftW > 30;
          const useRight = !useLeft && rightW > 30;
          if (useLeft) px = margin + rng() * Math.max(1, leftW - margin);
          else if (useRight) px = board.x + board.w + margin + rng() * Math.max(1, rightW - margin);
          else px = margin + rng() * Math.max(1, cw - 2 * margin);
          py = margin + rng() * Math.max(1, ch - 2 * margin);
          // keep out of the board rect
          if (
            px < board.x - 4 ||
            px > board.x + board.w + 4 ||
            py < board.y - 4 ||
            py > board.y + board.h + 4
          ) {
            break;
          }
        }
        return {
          col: cell.col,
          row: cell.row,
          x: px,
          y: py,
          rotation: rotateEnabled ? ROTATIONS[1 + Math.floor(rng() * 3)] : 0,
          groupId: cell.col * 1000 + cell.row,
          placed: false,
          path: cell.path,
          isBorder: cell.isBorder,
          specialTaskId: taskId,
        };
      });
      piecesRef.current = pieces;
      orderRef.current = pieces.map((_, i) => i);
      solvedRef.current = false;
      firstMoveFiredRef.current = false;
      selectedRef.current = null;
    }, [image, cols, rows, rotateEnabled, specialCells, layout]);

    useEffect(() => {
      rebuild();
    }, [rebuild]);

    // Track wrapper size: initial mount may report 0 (flex not laid out yet),
    // so rebuild once a non-zero size appears.
    useEffect(() => {
      const wrap = wrapRef.current;
      if (!wrap || typeof ResizeObserver === "undefined") return;
      let mounted = true;
      const ro = new ResizeObserver(() => {
        if (!mounted) return;
        const before = boardRef.current.w;
        layout();
        if (before === 0 && boardRef.current.w > 0 && piecesRef.current.length === 0) {
          rebuild();
        }
      });
      ro.observe(wrap);
      return () => {
        mounted = false;
        ro.disconnect();
      };
    }, [layout, rebuild]);

    // ----- drawing -----
    const draw = useCallback(() => {
      const ctx = ctxRef.current;
      const img = image;
      const pieces = piecesRef.current;
      if (!ctx || !img) return;
      const { w: cw, h: ch } = sizeRef.current;
      const board = boardRef.current;
      const spec = specRef.current;
      ctx.clearRect(0, 0, cw, ch);

      // board drop zone
      ctx.save();
      ctx.fillStyle = "rgba(0,0,0,0.28)";
      ctx.fillRect(board.x, board.y, board.w, board.h);
      ctx.strokeStyle = "rgba(255,138,74,0.35)";
      ctx.lineWidth = 1;
      ctx.strokeRect(board.x, board.y, board.w, board.h);
      ctx.restore();

      // ghost preview
      if (propsRef.current.showGhost) {
        ctx.save();
        ctx.globalAlpha = 0.14;
        ctx.drawImage(img, board.x, board.y, board.w, board.h);
        ctx.restore();
      }

      if (!spec) return;
      const pw = spec.pieceW;
      const ph = spec.pieceH;
      const sw = img.naturalWidth / cols;
      const sh = img.naturalHeight / rows;

      const drawPiece = (p: Piece) => {
        ctx.save();
        ctx.translate(p.x, p.y);
        if (p.rotation) ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.translate(-pw / 2, -ph / 2);
        ctx.save();
        ctx.clip(p.path);
        // Draw the image tile with a margin so the tab/blank domes (which stick
        // out beyond the piece rectangle) are filled with texture, not empty.
        const pad = TAB_PAD;
        ctx.drawImage(
          img,
          p.col * sw - pad * sw,
          p.row * sh - pad * sh,
          sw * (1 + 2 * pad),
          sh * (1 + 2 * pad),
          -pad * pw,
          -pad * ph,
          pw * (1 + 2 * pad),
          ph * (1 + 2 * pad),
        );
        ctx.restore();
        ctx.lineWidth = p.placed ? 1 : 1.4;
        ctx.strokeStyle = p.placed
          ? "rgba(0,0,0,0.45)"
          : "rgba(0,0,0,0.7)";
        ctx.stroke(p.path);
        ctx.restore();

        // special-piece marker: a small ember in the top-right corner
        if (p.specialTaskId && !p.placed) {
          ctx.save();
          ctx.translate(p.x, p.y);
          const r = Math.min(pw, ph) * 0.13;
          const mx = pw / 2 - r * 1.25;
          const my = -ph / 2 + r * 1.25;
          ctx.beginPath();
          ctx.arc(mx, my, r, 0, Math.PI * 2);
          const g = ctx.createRadialGradient(mx, my, 0, mx, my, r);
          g.addColorStop(0, "#ffe0a8");
          g.addColorStop(0.5, "#ff8a4a");
          g.addColorStop(1, "#7a2410");
          ctx.fillStyle = g;
          ctx.shadowColor = "rgba(255,120,50,0.8)";
          ctx.shadowBlur = 8;
          ctx.fill();
          ctx.shadowBlur = 0;
          ctx.strokeStyle = "rgba(255,255,255,0.85)";
          ctx.lineWidth = 1.1;
          ctx.stroke();
          ctx.restore();
        }
      };

      for (const idx of orderRef.current) {
        drawPiece(pieces[idx]);
      }
    }, [image]);

    /** Correct center of a piece in CANVAS coords (spec coords are board-local). */
    const correctPos = (p: Piece): { x: number; y: number } => {
      const spec = specRef.current!;
      const board = boardRef.current;
      return {
        x: board.x + p.col * spec.pieceW + spec.pieceW / 2,
        y: board.y + p.row * spec.pieceH + spec.pieceH / 2,
      };
    };

    const checkSolved = useCallback(() => {
      if (solvedRef.current) return;
      const spec = specRef.current;
      const pieces = piecesRef.current;
      if (!spec || pieces.length === 0) return;
      // Never win mid-drag: the player must release the piece first.
      if (dragRef.current) return;
      // Win = everything interlocked into one group (glue keeps relative
      // offsets correct), or everything visually home on the board.
      const oneGroup = pieces.every((p) => p.groupId === pieces[0].groupId);
      const thx = spec.pieceW * 0.5;
      const thy = spec.pieceH * 0.5;
      const allHome = pieces.every((p) => {
        if (p.rotation !== 0) return false;
        const c = correctPos(p);
        return Math.abs(p.x - c.x) < thx && Math.abs(p.y - c.y) < thy;
      });
      if (oneGroup || allHome) {
        for (const p of pieces) {
          const c = correctPos(p);
          p.x = c.x;
          p.y = c.y;
          p.rotation = 0;
          p.placed = true;
        }
        solvedRef.current = true;
        onSolved();
      }
    }, [onSolved]);

    // ----- render loop -----
    useEffect(() => {
      let raf = 0;
      let frame = 0;
      const tick = () => {
        draw();
        // Safety net: catch the "all placed" win state even if the pointerup
        // path somehow missed it (checked ~2×/sec, cheap for ≤70 pieces).
        if (
          ++frame % 30 === 0 &&
          !solvedRef.current &&
          piecesRef.current.length > 0
        ) {
          checkSolved();
        }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(raf);
    }, [draw, checkSolved]);

    // ----- helpers -----
    const toBoard = (clientX: number, clientY: number): { x: number; y: number } => {
      const canvas = canvasRef.current!;
      const rect = canvas.getBoundingClientRect();
      return { x: clientX - rect.left, y: clientY - rect.top };
    };

    const hitTest = (bx: number, by: number): number | null => {
      const ctx = ctxRef.current;
      const pieces = piecesRef.current;
      const spec = specRef.current;
      if (!ctx || !spec) return null;
      const pw = spec.pieceW;
      const ph = spec.pieceH;
      // topmost first
      for (let i = orderRef.current.length - 1; i >= 0; i--) {
        const idx = orderRef.current[i];
        const p = pieces[idx];
        if (p.placed) continue;
        const dx = bx - p.x;
        const dy = by - p.y;
        const r = (-p.rotation * Math.PI) / 180;
        const lx = dx * Math.cos(r) - dy * Math.sin(r) + pw / 2;
        const ly = dx * Math.sin(r) + dy * Math.cos(r) + ph / 2;
        if (ctx.isPointInPath(p.path, lx, ly)) return idx;
      }
      return null;
    };

    const bringToFront = (idxs: number[]) => {
      const set = new Set(idxs);
      const rest = orderRef.current.filter((i) => !set.has(i));
      orderRef.current = [...rest, ...idxs];
    };

    const groupPieces = (gid: number): number[] => {
      const out: number[] = [];
      piecesRef.current.forEach((p, i) => {
        if (p.groupId === gid) out.push(i);
      });
      return out;
    };

    const pieceIndexAt = (col: number, row: number): number =>
      piecesRef.current.findIndex((q) => q.col === col && q.row === row);

    const NEIGHBOURS = [
      { dc: 0, dr: -1 },
      { dc: 1, dr: 0 },
      { dc: 0, dr: 1 },
      { dc: -1, dr: 0 },
    ];

    // Glue the dragged group to a neighbour whose relative offset is ~correct,
    // and align the dragged group exactly so the two interlock cleanly.
    const tryGlue = (dragId: number): boolean => {
      const pieces = piecesRef.current;
      const spec = specRef.current;
      if (!spec) return false;
      const pw = spec.pieceW;
      const ph = spec.pieceH;
      const thx = pw * SNAP_THRESHOLD;
      const thy = ph * SNAP_THRESHOLD;
      for (const p of pieces) {
        if (p.groupId !== dragId || p.placed || p.rotation !== 0) continue;
        for (const n of NEIGHBOURS) {
          const nc = p.col + n.dc;
          const nr = p.row + n.dr;
          if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue;
          const j = pieceIndexAt(nc, nr);
          if (j < 0) continue;
          const q = pieces[j];
          if (q.groupId === dragId) continue;
          const expDx = (p.col - q.col) * pw;
          const expDy = (p.row - q.row) * ph;
          if (
            Math.abs(p.x - q.x - expDx) < thx &&
            Math.abs(p.y - q.y - expDy) < thy
          ) {
            const shiftX = q.x + expDx - p.x;
            const shiftY = q.y + expDy - p.y;
            for (const pp of pieces) {
              if (pp.groupId === dragId && !pp.placed) {
                pp.x += shiftX;
                pp.y += shiftY;
              }
            }
            const toId = q.groupId;
            for (const pp of pieces) if (pp.groupId === dragId) pp.groupId = toId;
            return true;
          }
        }
      }
      return false;
    };

    // Fire onSpecialPlaced for special pieces that are now connected or placed.
    const checkSpecialTriggers = () => {
      const pieces = piecesRef.current;
      const sizes = new Map<number, number>();
      for (const p of pieces) sizes.set(p.groupId, (sizes.get(p.groupId) ?? 0) + 1);
      for (const p of pieces) {
        if (!p.specialTaskId) continue;
        const connected = (sizes.get(p.groupId) ?? 1) > 1 || p.placed;
        if (connected) {
          const key = cellKey(p.col, p.row);
          p.specialTaskId = undefined;
          onSpecialPlaced(key);
        }
      }
    };

    // ----- pointer handlers -----
    const onPointerDown = (e: React.PointerEvent) => {
      if (locked || solvedRef.current) return;
      const pt = toBoard(e.clientX, e.clientY);
      const idx = hitTest(pt.x, pt.y);
      if (idx == null) {
        selectedRef.current = null;
        return;
      }
      const p = piecesRef.current[idx];
      selectedRef.current = idx;
      if (p.placed) return;

      if (!firstMoveFiredRef.current) {
        firstMoveFiredRef.current = true;
        onFirstMove();
      }
      const members = groupPieces(p.groupId);
      bringToFront(members);
      dragRef.current = {
        groupIds: new Set([p.groupId]),
        lastX: pt.x,
        lastY: pt.y,
        moved: false,
      };
      (e.target as Element).setPointerCapture?.(e.pointerId);
    };

    const onPointerMove = (e: React.PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const pt = toBoard(e.clientX, e.clientY);
      const dx = pt.x - drag.lastX;
      const dy = pt.y - drag.lastY;
      drag.lastX = pt.x;
      drag.lastY = pt.y;
      if (Math.abs(dx) + Math.abs(dy) > 0.4) drag.moved = true;
      for (const p of piecesRef.current) {
        if (drag.groupIds.has(p.groupId) && !p.placed) {
          p.x += dx;
          p.y += dy;
        }
      }
    };

    const onPointerUp = (e: React.PointerEvent) => {
      const drag = dragRef.current;
      dragRef.current = null;
      (e.target as Element).releasePointerCapture?.(e.pointerId);
      if (!drag) return;
      const pieces = piecesRef.current;
      // anchor = topmost dragged piece
      let anchorIdx = -1;
      for (let i = orderRef.current.length - 1; i >= 0; i--) {
        const idx = orderRef.current[i];
        if (drag.groupIds.has(pieces[idx].groupId) && !pieces[idx].placed) {
          anchorIdx = idx;
          break;
        }
      }
      if (anchorIdx >= 0) {
        // chain glues so a dropped cluster can interlock with several neighbours
        let guard = 0;
        while (guard++ < 6 && tryGlue(pieces[anchorIdx].groupId)) {
          // keep going
        }
        checkSpecialTriggers();
        checkSolved();
      }
      // per-touch tasks charge on drop, not on grab — the player can still
      // move pieces freely; each completed move costs one prompt.
      if (propsRef.current.perTouchActive) onPieceTouched();
    };

    // ----- keyboard rotate -----
    useEffect(() => {
      const onKey = (e: KeyboardEvent) => {
        if (locked) return;
        if (e.key === "r" || e.key === "R" || e.key === "к" || e.key === "К") {
          rotateSelected();
        }
      };
      window.addEventListener("keydown", onKey);
      return () => window.removeEventListener("keydown", onKey);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [locked]);

    const rotateSelected = useCallback(() => {
      const idx = selectedRef.current;
      if (idx == null) return;
      const pieces = piecesRef.current;
      const p = pieces[idx];
      if (p.placed) return;
      p.rotation = (p.rotation + 90) % 360;
    }, []);

    // ----- imperative handle -----
    useImperativeHandle(
      ref,
      (): PuzzleBoardHandle => ({
        edgeFirst: () => {
          const board = boardRef.current;
          const spec = specRef.current;
          if (!spec) return;
          const pieces = piecesRef.current;
          // collect unsolved border pieces, lay them in a column to the right
          const borderIdx = pieces
            .map((p, i) => ({ p, i }))
            .filter(({ p }) => p.isBorder && !p.placed)
            .map(({ i }) => i);
          const step = spec.pieceH + 6;
          const startX = board.x + board.w + 12;
          let y = board.y;
          const { w: cw } = sizeRef.current;
          const clampedStart = startX + spec.pieceW > cw ? board.x - spec.pieceW - 12 : startX;
          for (const i of borderIdx) {
            pieces[i].x = clampedStart + spec.pieceW / 2;
            pieces[i].y = y + spec.pieceH / 2;
            pieces[i].rotation = 0;
            y += step;
            if (y + spec.pieceH > board.y + board.h + 200) {
              y = board.y;
            }
          }
        },
        shuffle: () => {
          const pieces = piecesRef.current;
          const board = boardRef.current;
          const { w: cw, h: ch } = sizeRef.current;
          const rng = makeRng(Date.now() & 0xffffffff);
          for (const p of pieces) {
            if (p.placed) continue;
            p.x = 10 + rng() * Math.max(1, cw - 20);
            p.y = 10 + rng() * Math.max(1, ch - 20);
          }
          void board;
        },
        rotateSelected,
      }),
      [rotateSelected],
    );

    return (
      <div className="puzzle-board" ref={wrapRef}>
        <canvas
          ref={canvasRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
      </div>
    );
  },
);
