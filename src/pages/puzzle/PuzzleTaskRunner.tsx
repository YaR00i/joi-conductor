import { useEffect, useRef, useState } from "react";
import { setDeviceVibeLevel, stopDevice } from "../../lib/device/deviceClient";
import {
  PUZZLE_TASK_KIND_LABELS,
  type PuzzleTask,
} from "../../lib/puzzleTasks";

/**
 * Blocking overlay that runs a PuzzleTask while the board is frozen.
 *
 * Modes:
 *  - task              full special-piece task (edge/spank/hold/rest/vibe)
 *  - pertouch_announce intro card before a per_touch modifier takes effect
 *  - pertouch_prompt   one per-touch action required for a single grabbed piece
 *
 * vibeMode selects how tasks with a stimulus component drive vibration:
 *  - device (default) the connected device runs the level (existing behavior)
 *  - manual            the device is NOT touched; the player performs the
 *                      vibration by hand following an on-screen instruction
 *                      (used by the runner when only manual vibes are enabled)
 */

export type TaskRunnerMode = "task" | "pertouch_announce" | "pertouch_prompt";
export type TaskVibeMode = "device" | "manual";

interface Props {
  mode: TaskRunnerMode;
  task: PuzzleTask;
  /** For pertouch_prompt: remaining pieces after this one resolves. */
  remaining?: number;
  vibeMode?: TaskVibeMode;
  /** Sandbox-only skip: dismiss without the usual fail path. */
  allowCancel?: boolean;
  onComplete: (success: boolean) => void;
}

function fmtSec(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.max(0, sec) % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Effective timer seconds for the current mode/task. 0 = no countdown. */
function timerFor(mode: TaskRunnerMode, task: PuzzleTask): number {
  if (mode === "pertouch_announce") return 0;
  if (mode === "pertouch_prompt") {
    const a = task.perTouchAction;
    if (!a) return 0;
    if (a.kind === "vibe") return a.sec;
    if (a.kind === "edge") return a.holdSec;
    return 0; // spank: self-counted
  }
  return task.durationSec ?? 0;
}

/** Vibe level to apply while active (0 = none). */
function vibeFor(mode: TaskRunnerMode, task: PuzzleTask): number {
  if (mode === "pertouch_prompt") {
    const a = task.perTouchAction;
    if (a?.kind === "vibe") return a.level;
    return 0;
  }
  if (task.kind === "vibe") return task.vibeLevel ?? 0;
  return task.vibeLevel ?? 0;
}

/** On timeout, is it a success (held out) or a fail (ran out)? */
function timeoutIsSuccess(mode: TaskRunnerMode, task: PuzzleTask): boolean {
  if (mode === "pertouch_prompt") {
    const a = task.perTouchAction;
    return a?.kind === "vibe";
  }
  return task.kind === "vibe";
}

export function PuzzleTaskRunner({
  mode,
  task,
  remaining,
  vibeMode = "device",
  allowCancel = false,
  onComplete,
}: Props) {
  const total = timerFor(mode, task);
  const [left, setLeft] = useState(total);
  const resolvedRef = useRef(false);
  const totalRef = useRef(total);
  totalRef.current = total;

  // device stimulus (skipped in manual mode — the player vibrates by hand)
  useEffect(() => {
    if (vibeMode === "manual") return;
    const lvl = vibeFor(mode, task);
    let active = false;
    if (lvl > 0) {
      active = true;
      void setDeviceVibeLevel(lvl);
    }
    return () => {
      if (active) void stopDevice();
    };
  }, [mode, task, vibeMode]);

  // countdown
  useEffect(() => {
    if (total <= 0) return;
    setLeft(total);
    const id = window.setInterval(() => {
      setLeft((prev) => {
        if (prev <= 1) {
          window.clearInterval(id);
          if (!resolvedRef.current) {
            resolvedRef.current = true;
            onComplete(timeoutIsSuccess(mode, task));
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [total, mode, task, onComplete]);

  const resolve = (success: boolean) => {
    if (resolvedRef.current) return;
    resolvedRef.current = true;
    onComplete(success);
  };

  const title =
    mode === "pertouch_announce"
      ? "Особый кусочек активирован"
      : mode === "pertouch_prompt"
        ? "Ход стоит действия"
        : task.titleRu || PUZZLE_TASK_KIND_LABELS[task.kind];

  const promptActionText = (): string | null => {
    if (mode !== "pertouch_prompt") return null;
    const a = task.perTouchAction;
    if (!a) return null;
    if (a.kind === "spank") return `${a.count} шлепков`;
    if (a.kind === "vibe") return `стимул уровень ${a.level}`;
    return `держать край ${a.holdSec}с`;
  };

  const showTimer = total > 0;

  return (
    <div className="puzzle-task" role="dialog" aria-modal="true">
      <div className="puzzle-task__card">
        <div className="puzzle-task__kicker">
          {PUZZLE_TASK_KIND_LABELS[task.kind]}
          {mode === "pertouch_prompt" && remaining != null
            ? ` · осталось ${Math.max(0, remaining - 1)}`
            : null}
        </div>
        <h3 className="puzzle-task__title">{title}</h3>
        <p className="puzzle-task__text">
          {mode === "pertouch_announce"
            ? task.instructionRu
            : mode === "pertouch_prompt"
              ? `${task.instructionRu} Сейчас: ${promptActionText()}.`
              : task.instructionRu}
        </p>

        {vibeMode === "manual" && vibeFor(mode, task) > 0 ? (
          <p className="puzzle-task__manual-note">
            Ручной режим: без устройства — делай вибрацию сам, уровень{" "}
            {vibeFor(mode, task)} из 5, пока идёт таймер.
          </p>
        ) : null}

        {showTimer ? (
          <div
            className={`puzzle-task__timer ${left <= 5 ? "is-low" : ""}`}
            aria-live="polite"
          >
            {fmtSec(left)}
          </div>
        ) : null}

        <div className="puzzle-task__reward">
          {mode === "task" ? (
            <>
              <span className="puzzle-task__plus">+{task.rewardBonus}</span>
              <span className="puzzle-task__minus">−{task.failPenalty}</span>
            </>
          ) : mode === "pertouch_announce" ? (
            <span className="muted">Нажми «Понятно», чтобы продолжить</span>
          ) : (
            <span className="muted">Выполни и подтверди, либо пропусти ход</span>
          )}
        </div>

        <div className="puzzle-task__actions">
          {mode === "pertouch_announce" ? (
            <button
              type="button"
              className="primary"
              onClick={() => resolve(true)}
            >
              Понятно
            </button>
          ) : (
            <>
              <button
                type="button"
                className="primary"
                onClick={() => resolve(true)}
              >
                {mode === "pertouch_prompt" ? "Готово ✓" : "Готово ✓"}
              </button>
              <button
                type="button"
                className="ghost"
                onClick={() => resolve(false)}
              >
                {mode === "pertouch_prompt" ? "Пропустить ход" : "Пропустить"}
              </button>
            </>
          )}
          {allowCancel ? (
            <button
              type="button"
              className="puzzle-task__cancel"
              onClick={() => resolve(true)}
            >
              Отменить
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
