import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getDifficulty,
  calcPuzzleReward,
  computeJigsawGrid,
  PUZZLE_DIFFICULTIES,
  type PuzzleDifficulty,
  type PuzzleDifficultyId,
  type PuzzleRewardResult,
} from "../../lib/puzzleReward";
import { cellKey } from "../../lib/puzzle/jigsaw";
import {
  loadPuzzleTasks,
  pickRandomTask,
  type PuzzleTask,
} from "../../lib/puzzleTasks";
import { PuzzleBoard, type PuzzleBoardHandle } from "./PuzzleBoard";
import { PuzzleSourcePicker, type PickedImage } from "./PuzzleSourcePicker";
import { PuzzleTaskRunner, type TaskRunnerMode } from "./PuzzleTaskRunner";
import { CindersGlyph } from "../../components/CindersGlyph";
import { UiCheck } from "../../components/UiCheck";
import { getActiveSaveSlot } from "../../lib/saveSlots";

interface Props {
  onReward: (cinders: number) => void;
  onExit: () => void;
}

type Phase = "source" | "config" | "play" | "result";

type Overlay =
  | { mode: "task"; task: PuzzleTask; ghostOnSuccess?: boolean }
  | { mode: "pertouch_announce"; task: PuzzleTask }
  | { mode: "pertouch_prompt"; task: PuzzleTask }
  | null;

interface PerTouchMod {
  taskId: string;
  remaining: number;
  skipped: number;
  total: number;
}

function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.max(0, sec) % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** How long the earned ghost hint stays on after completing its task. */
const GHOST_EARN_MS = 30_000;

export function PuzzleGame({ onReward, onExit }: Props) {
  const [phase, setPhase] = useState<Phase>("source");
  const [picked, setPicked] = useState<PickedImage | null>(null);
  const [difficultyId, setDifficultyId] = useState<PuzzleDifficultyId>("medium");
  const [rotateEnabled, setRotateEnabled] = useState(false);
  /** Pre-game option: whether the ghost may be earned/used at all. */
  const [showGhost, setShowGhost] = useState(true);
  /** Whether the ghost is actually visible right now (always off at start). */
  const [ghostOn, setGhostOn] = useState(false);
  /** Seconds left of an earned ghost hint (null = no active hint). */
  const [ghostLeftSec, setGhostLeftSec] = useState<number | null>(null);

  const [overlay, setOverlay] = useState<Overlay>(null);
  const [overlaySeq, setOverlaySeq] = useState(0);
  const [perTouch, setPerTouch] = useState<PerTouchMod | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [startMs, setStartMs] = useState<number | null>(null);
  const [result, setResult] = useState<PuzzleRewardResult | null>(null);

  const startMsRef = useRef<number | null>(null);
  startMsRef.current = startMs;
  const boardRef = useRef<PuzzleBoardHandle>(null);
  const objectUrlRef = useRef<string | null>(null);
  const rewardRef = useRef(0);
  const penaltyRef = useRef(0);
  const tasksByIdRef = useRef<Map<string, PuzzleTask>>(new Map());
  const specialCellsRef = useRef<Map<string, string>>(new Map());
  const overlayRef = useRef<Overlay>(null);
  const perTouchRef = useRef<PerTouchMod | null>(null);
  const showGhostRef = useRef(showGhost);
  const ghostHintTimerRef = useRef<number | null>(null);
  const ghostTickRef = useRef<number | null>(null);
  overlayRef.current = overlay;
  perTouchRef.current = perTouch;
  showGhostRef.current = showGhost;

  // specialCells is rebuilt per game; mirror into state so the board sees it
  const [specialCells, setSpecialCells] = useState<Map<string, string>>(
    () => new Map(),
  );

  const difficulty: PuzzleDifficulty = useMemo(
    () => getDifficulty(difficultyId),
    [difficultyId],
  );

  // Auto-grid: derive cols×rows from the chosen image aspect so pieces stay
  // close to square regardless of portrait/landscape images.
  const imgAspect =
    picked && picked.img && picked.img.naturalWidth
      ? picked.img.naturalWidth / picked.img.naturalHeight
      : 1;
  const grid = useMemo(
    () => computeJigsawGrid(difficulty.targetPieces, imgAspect),
    [difficulty.targetPieces, imgAspect],
  );

  const tasks = useMemo(() => loadPuzzleTasks(), []);
  useEffect(() => {
    const m = new Map<string, PuzzleTask>();
    for (const t of tasks) m.set(t.id, t);
    tasksByIdRef.current = m;
  }, [tasks]);

  // timer tick — restarts when startMs becomes set (first move)
  useEffect(() => {
    if (phase !== "play" || startMs == null) return;
    const id = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - startMs) / 1000));
    }, 500);
    return () => window.clearInterval(id);
  }, [phase, startMs]);

  // revoke object url on change/unmount
  useEffect(() => {
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
  }, []);

  const showOverlay = useCallback((next: Overlay) => {
    setOverlay(next);
    if (next) setOverlaySeq((s) => s + 1);
  }, []);

  const onPickImage = (p: PickedImage) => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = p.objectUrl;
    setPicked(p);
    setPhase("config");
  };

  const startGame = () => {
    if (!picked) return;
    rewardRef.current = 0;
    penaltyRef.current = 0;
    setElapsed(0);
    setStartMs(null);
    setOverlay(null);
    setPerTouch(null);
    setResult(null);
    // Ghost always starts hidden; the pre-game option only allows earning it.
    setGhostOn(false);
    setGhostLeftSec(null);
    if (ghostHintTimerRef.current) {
      window.clearTimeout(ghostHintTimerRef.current);
      ghostHintTimerRef.current = null;
    }
    if (ghostTickRef.current) {
      window.clearInterval(ghostTickRef.current);
      ghostTickRef.current = null;
    }
    // seed special pieces
    const total = grid.cols * grid.rows;
    const n = Math.min(difficulty.specialPieces, total);
    const cells = new Map<string, string>();
    if (tasks.length > 0 && n > 0) {
      const all: Array<[number, number]> = [];
      for (let r = 0; r < grid.rows; r++) {
        for (let c = 0; c < grid.cols; c++) all.push([c, r]);
      }
      for (let i = all.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [all[i], all[j]] = [all[j], all[i]];
      }
      for (let i = 0; i < n; i++) {
        const [c, r] = all[i];
        const task = pickRandomTask(tasks);
        if (task) cells.set(cellKey(c, r), task.id);
      }
    }
    specialCellsRef.current = cells;
    setSpecialCells(new Map(cells));
    setPhase("play");
  };

  const onFirstMove = useCallback(() => {
    if (startMsRef.current == null) setStartMs(Date.now());
  }, []);

  /** Turn the ghost hint on for a while (as a reward), with a countdown. */
  const earnGhost = useCallback((ms: number) => {
    setGhostOn(true);
    setGhostLeftSec(Math.ceil(ms / 1000));
    if (ghostHintTimerRef.current) window.clearTimeout(ghostHintTimerRef.current);
    if (ghostTickRef.current) window.clearInterval(ghostTickRef.current);
    ghostTickRef.current = window.setInterval(() => {
      setGhostLeftSec((s) => (s == null || s <= 1 ? null : s - 1));
    }, 1000);
    ghostHintTimerRef.current = window.setTimeout(() => {
      ghostHintTimerRef.current = null;
      if (ghostTickRef.current) {
        window.clearInterval(ghostTickRef.current);
        ghostTickRef.current = null;
      }
      setGhostLeftSec(null);
      setGhostOn(false);
    }, ms);
  }, []);

  /** Ghost button in the play HUD: give a random task; success earns the ghost. */
  const requestGhost = useCallback(() => {
    if (overlayRef.current) return;
    const candidates = tasks.filter(
      (t) => t.kind !== "per_touch" && t.kind !== "ghost_hint",
    );
    const task = pickRandomTask(candidates);
    if (!task) return;
    showOverlay({ mode: "task", task, ghostOnSuccess: true });
  }, [tasks, showOverlay]);

  const onSpecialPlaced = useCallback(
    (key: string) => {
      const taskId = specialCellsRef.current.get(key);
      if (!taskId) return;
      specialCellsRef.current.delete(key);
      const task = tasksByIdRef.current.get(taskId);
      if (!task) return;
      if (task.kind === "ghost_hint") {
        // Bonus piece: briefly reveal the ghost (only if allowed by options)
        // without blocking the board.
        rewardRef.current += Math.max(0, task.rewardBonus);
        if (showGhostRef.current) {
          earnGhost(Math.max(2, task.durationSec ?? 10) * 1000);
        }
        return;
      }
      if (task.kind === "per_touch") {
        setPerTouch({
          taskId,
          remaining: task.perTouchPieces ?? 10,
          skipped: 0,
          total: task.perTouchPieces ?? 10,
        });
        showOverlay({ mode: "pertouch_announce", task });
      } else {
        showOverlay({ mode: "task", task });
      }
    },
    [showOverlay, earnGhost],
  );

  const onPieceTouched = useCallback(() => {
    const mod = perTouchRef.current;
    if (!mod) return;
    if (overlayRef.current) return; // an overlay is already up
    const task = tasksByIdRef.current.get(mod.taskId);
    if (task) showOverlay({ mode: "pertouch_prompt", task });
  }, [showOverlay]);

  const onOverlayComplete = useCallback(
    (success: boolean) => {
      const cur = overlayRef.current;
      if (!cur) return;
      if (cur.mode === "task") {
        if (success) rewardRef.current += cur.task.rewardBonus;
        else penaltyRef.current += cur.task.failPenalty;
        if (success && cur.ghostOnSuccess) {
          earnGhost(GHOST_EARN_MS);
        }
        setOverlay(null);
        return;
      }
      if (cur.mode === "pertouch_announce") {
        setOverlay(null);
        return;
      }
      // pertouch_prompt
      const mod = perTouchRef.current;
      setOverlay(null);
      if (!mod) return;
      const t = tasksByIdRef.current.get(mod.taskId);
      const remaining = mod.remaining - 1;
      const skipped = mod.skipped + (success ? 0 : 1);
      if (remaining <= 0) {
        if (t) {
          rewardRef.current += t.rewardBonus;
          penaltyRef.current += Math.round(
            (t.failPenalty / Math.max(1, mod.total)) * skipped,
          );
        }
        setPerTouch(null);
      } else {
        setPerTouch({ ...mod, remaining, skipped });
      }
    },
    [earnGhost],
  );

  const onSolved = useCallback(() => {
    if (result) return;
    const elapsedSec = startMsRef.current
      ? Math.floor((Date.now() - startMsRef.current) / 1000)
      : elapsed;
    const res = calcPuzzleReward({
      difficulty,
      elapsedSec,
      taskReward: rewardRef.current,
      taskPenalty: penaltyRef.current,
    });
    setResult(res);
    setPhase("result");
  }, [result, elapsed, difficulty]);

  const locked = overlay !== null;
  const perTouchActive = overlay === null && perTouch !== null;

  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const toolbarRef = useRef<HTMLElement>(null);

  // Close the config toolbar dropdown on outside click / Escape (like Ember Editor).
  useEffect(() => {
    if (!openMenu) return;
    const onDocDown = (e: MouseEvent) => {
      const root = toolbarRef.current;
      if (root && !root.contains(e.target as Node)) setOpenMenu(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenMenu(null);
    };
    document.addEventListener("mousedown", onDocDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [openMenu]);

  const optsOn = [rotateEnabled, showGhost].filter(Boolean).length;

  // ----- render phases -----
  if (phase === "source") {
    return <PuzzleSourcePicker onPick={onPickImage} onBack={onExit} />;
  }

  if (phase === "config") {
    return (
      <div className="puzzle-config puzzle-config--toolbar">
        <nav
          className="ember-menubar puzzle-config__toolbar"
          ref={toolbarRef}
          aria-label="Настройка пазла"
        >
          <button
            type="button"
            className="puzzle-btn"
            onClick={() => setPhase("source")}
            title="Другая картинка"
          >
            ←
          </button>

          <div className={`ember-menubar__menu ${openMenu === "diff" ? "is-open" : ""}`}>
            <button
              type="button"
              className={`ember-menubar__trigger ${openMenu === "diff" ? "is-open" : ""}`}
              aria-haspopup="menu"
              aria-expanded={openMenu === "diff"}
              onClick={() => setOpenMenu((c) => (c === "diff" ? null : "diff"))}
            >
              <span>{difficulty.labelRu}</span>
              <span className="ember-menubar__crumb">
                {grid.cols}×{grid.rows} · {grid.pieces}
              </span>
            </button>
            {openMenu === "diff" ? (
              <div className="ember-menubar__dropdown" role="menu">
                {PUZZLE_DIFFICULTIES.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    role="menuitem"
                    className={`ember-menubar__item ${difficultyId === d.id ? "is-active" : ""}`}
                    onClick={() => {
                      setDifficultyId(d.id);
                      setOpenMenu(null);
                    }}
                  >
                    <span>
                      <strong>{d.labelRu}</strong>{" "}
                      <span className="muted">~{d.targetPieces} кусочков</span>
                    </span>
                    <span className="ember-menubar__badge" title="особых кусочков">
                      {d.specialPieces}
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className={`ember-menubar__menu ${openMenu === "opts" ? "is-open" : ""}`}>
            <button
              type="button"
              className={`ember-menubar__trigger ${openMenu === "opts" ? "is-open" : ""}`}
              aria-haspopup="menu"
              aria-expanded={openMenu === "opts"}
              onClick={() => setOpenMenu((c) => (c === "opts" ? null : "opts"))}
            >
              <span>Опции</span>
              <span className="ember-menubar__crumb">{optsOn}/2</span>
            </button>
            {openMenu === "opts" ? (
              <div
                className="ember-menubar__dropdown puzzle-config__opts-dd"
                role="menu"
              >
                <UiCheck checked={rotateEnabled} onChange={setRotateEnabled}>
                  <span className="puzzle-config__check-text">
                    <strong>Вращение кусочков</strong>
                    <span className="muted">Поворот клавишей R</span>
                  </span>
                </UiCheck>
                <UiCheck checked={showGhost} onChange={setShowGhost}>
                  <span className="puzzle-config__check-text">
                    <strong>Призрак доступен</strong>
                    <span className="muted">
                      В игре призрак включается кнопкой — за задание (на 30 сек)
                    </span>
                  </span>
                </UiCheck>
              </div>
            ) : null}
          </div>

          <button
            type="button"
            className={`puzzle-btn ${showGhost ? "is-active" : ""}`}
            onClick={() => setShowGhost((v) => !v)}
            title="Разрешить призрак: в игре он включается кнопкой (за задание) или особым кусочком"
            aria-pressed={showGhost}
          >
            Призрак
          </button>

          <div className="ember-menubar__current puzzle-config__toolbar-info">
            <CindersGlyph className="puzzle-config__toolbar-glyph" />
            <span>{difficulty.specialPieces} особых</span>
            {picked?.label ? (
              <>
                <span className="ember-menubar__crumb-sep">·</span>
                <span className="muted puzzle-config__toolbar-name">{picked.label}</span>
              </>
            ) : null}
          </div>

          <div className="ember-menubar__actions">
            <button type="button" className="puzzle-config__start" onClick={startGame}>
              ▶ Начать
            </button>
          </div>
        </nav>

        <div className="puzzle-config__stage">
          <div className="puzzle-config__frame">
            {picked ? <img src={picked.objectUrl} alt={picked.label} /> : null}
            <div
              className="puzzle-config__grid-overlay"
              style={{
                backgroundSize: `${100 / grid.cols}% ${100 / grid.rows}%`,
              }}
              aria-hidden
            />
            <div className="puzzle-config__frame-meta">
              <span>{grid.cols}×{grid.rows}</span>
              <span>·</span>
              <span>{grid.pieces} кусочков</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (phase === "result" && result) {
    return (
      <div className="puzzle-result" role="dialog">
        <div className="puzzle-result__card">
          <div className="puzzle-result__headline">
            <CindersGlyph className="puzzle-result__headline-glyph" />
            <h2>Пазл собран!</h2>
          </div>
          <p className="muted">
            {fmtTime(elapsed)} · {difficulty.labelRu} · {grid.pieces} кусочков
          </p>
          <ul className="puzzle-result__breakdown">
            <li><span>База</span><span className="puzzle-result__num">{result.base}</span></li>
            <li>
              <span>Бонус за скорость</span>
              <span className="puzzle-result__num puzzle-result__num--plus">+{result.speedBonus}</span>
            </li>
            <li>
              <span>Задания</span>
              <span className={`puzzle-result__num ${result.taskReward > 0 ? "puzzle-result__num--plus" : ""}`}>
                {result.taskReward > 0 ? `+${result.taskReward}` : "—"}
              </span>
            </li>
            <li>
              <span>Штрафы</span>
              <span className={`puzzle-result__num ${result.taskPenalty > 0 ? "puzzle-result__num--minus" : ""}`}>
                {result.taskPenalty > 0 ? `−${result.taskPenalty}` : "—"}
              </span>
            </li>
            <li className="puzzle-result__total">
              <span>Итого</span>
              <span className="puzzle-result__total-num">
                <CindersGlyph className="puzzle-result__total-glyph" />
                {result.total}
              </span>
            </li>
          </ul>
          <div className="puzzle-result__actions">
            <button
              type="button"
              className="puzzle-config__start"
              onClick={() => {
                onReward(result.total);
                onExit();
              }}
            >
              <CindersGlyph className="puzzle-result__btn-glyph" />
              Забрать {result.total}
            </button>
            <button type="button" className="puzzle-btn" onClick={() => setPhase("source")}>
              Новый пазл
            </button>
          </div>
        </div>
      </div>
    );
  }

  // phase === "play"
  return (
    <div className="puzzle-play">
      <div className="puzzle-hud">
        <button
          type="button"
          className="puzzle-hud__btn puzzle-hud__btn--back"
          onClick={onExit}
          title="Выйти из пазла"
        >
          ←
        </button>
        <div className="puzzle-hud__title">
          <span>Пазл</span>
          <span className="puzzle-hud__crumb">
            {difficulty.labelRu} · {grid.cols}×{grid.rows}
          </span>
        </div>
        <div className="puzzle-hud__timer" aria-live="polite" title="Время сборки">
          {fmtTime(elapsed)}
        </div>
        <div className="puzzle-hud__actions">
          {ghostLeftSec != null ? (
            <span
              className="puzzle-hud__ghost-timer"
              title="Призрак исчезнет через"
            >
              {ghostLeftSec}с
            </span>
          ) : null}
          <button
            type="button"
            className={`puzzle-hud__btn ${ghostOn ? "is-active" : ""}`}
            disabled={!showGhost}
            onClick={() => (ghostOn ? setGhostOn(false) : requestGhost())}
            title={
              !showGhost
                ? "Призрак отключён в опциях (перед игной включи «Призрак»)"
                : ghostOn
                  ? "Скрыть призрак"
                  : "Заработать призрак: выполни задание — подсказка на 30 секунд"
            }
            aria-pressed={ghostOn}
          >
            Призрак
          </button>
          <button
            type="button"
            className="puzzle-hud__btn"
            onClick={() => boardRef.current?.edgeFirst()}
            title="Собрать краевые кусочки в сторону"
          >
            Края
          </button>
          <button
            type="button"
            className="puzzle-hud__btn"
            onClick={() => boardRef.current?.shuffle()}
            title="Перемешать кусочки"
          >
            Перемешать
          </button>
          {rotateEnabled ? (
            <button
              type="button"
              className="puzzle-hud__btn"
              onClick={() => boardRef.current?.rotateSelected()}
              title="Повернуть выбранный кусочек (R)"
            >
              Повернуть
            </button>
          ) : null}
        </div>
      </div>

      <PuzzleBoard
        ref={boardRef}
        image={picked?.img ?? null}
        cols={grid.cols}
        rows={grid.rows}
        rotateEnabled={rotateEnabled}
        showGhost={ghostOn}
        specialCells={specialCells}
        locked={locked}
        perTouchActive={perTouchActive}
        onFirstMove={onFirstMove}
        onSolved={onSolved}
        onSpecialPlaced={onSpecialPlaced}
        onPieceTouched={onPieceTouched}
      />

      {perTouch ? (
        <div className="puzzle-pertouch-badge">
          <CindersGlyph className="puzzle-pertouch-badge__glyph" />
          На каждый ход: осталось {perTouch.remaining}
        </div>
      ) : null}

      {overlay ? (
        <PuzzleTaskRunner
          key={overlaySeq}
          mode={overlay.mode as TaskRunnerMode}
          task={overlay.task}
          remaining={perTouch?.remaining}
          allowCancel={getActiveSaveSlot() === "sandbox"}
          onComplete={onOverlayComplete}
        />
      ) : null}
    </div>
  );
}
