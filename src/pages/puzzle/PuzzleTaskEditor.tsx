import { useEffect, useMemo, useState } from "react";
import {
  blankPuzzleTask,
  loadPuzzleTasks,
  newPuzzleTaskId,
  PUZZLE_TASK_KIND_LABELS,
  puzzleTaskSpec,
  savePuzzleTasks,
  taskRequiresVibe,
  type PerTouchAction,
  type PuzzleTask,
  type PuzzleTaskKind,
} from "../../lib/puzzleTasks";
import { UiCheck } from "../../components/UiCheck";

interface Props {
  onExit: () => void;
}

type PerTouchKind = PerTouchAction["kind"];

export function PuzzleTaskEditor({ onExit }: Props) {
  const [tasks, setTasks] = useState<PuzzleTask[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setTasks(loadPuzzleTasks());
  }, []);

  const editing = useMemo(
    () => tasks.find((t) => t.id === editingId) ?? null,
    [tasks, editingId],
  );

  const persist = (next: PuzzleTask[]) => {
    setTasks(next);
    savePuzzleTasks(next);
    setDirty(false);
  };

  const startNew = () => {
    const t = blankPuzzleTask();
    persist([t, ...tasks]);
    setEditingId(t.id);
  };

  const duplicate = (t: PuzzleTask) => {
    const copy: PuzzleTask = { ...t, id: newPuzzleTaskId(), builtin: false, titleRu: `${t.titleRu} (копия)` };
    persist([copy, ...tasks]);
    setEditingId(copy.id);
  };

  const remove = (t: PuzzleTask) => {
    persist(tasks.filter((x) => x.id !== t.id));
    if (editingId === t.id) setEditingId(null);
  };

  const update = (patch: Partial<PuzzleTask>) => {
    if (!editing) return;
    persist(tasks.map((t) => (t.id === editing.id ? { ...t, ...patch } : t)));
  };

  const updatePerTouch = (patch: Partial<PerTouchAction>) => {
    if (!editing || !editing.perTouchAction) return;
    const next = { ...editing.perTouchAction, ...patch } as PerTouchAction;
    update({ perTouchAction: next });
  };

  const changePerTouchKind = (kind: PerTouchKind) => {
    const base: PerTouchAction =
      kind === "spank"
        ? { kind: "spank", count: 5 }
        : kind === "vibe"
          ? { kind: "vibe", level: 2, sec: 15 }
          : { kind: "edge", holdSec: 15 };
    update({ perTouchAction: base });
  };

  return (
    <div className="puzzle-editor">
      <div className="puzzle-editor__bar">
        <button type="button" className="puzzle-btn" onClick={onExit}>
          ← К мини-играм
        </button>
        <h2 className="puzzle-editor__title">Редактор заданий мини-игр</h2>
        <span className="muted puzzle-editor__hint">
          Только Песочница · задания для всех мини-игр, в обоих слотах
        </span>
        <button type="button" className="primary" onClick={startNew}>
          + Новое задание
        </button>
      </div>

      <div className="puzzle-editor__body">
        <div className="puzzle-editor__list">
          {tasks.map((t) => (
            <div
              key={t.id}
              className={`puzzle-editor__row ${editingId === t.id ? "is-active" : ""}`}
            >
              <button
                type="button"
                className="puzzle-editor__row-main"
                onClick={() => setEditingId(t.id)}
              >
                <span className="puzzle-editor__row-title">
                  {t.titleRu || "(без названия)"}
                  {t.builtin ? <span className="puzzle-editor__builtin">встроено</span> : null}
                </span>
                <span className="puzzle-editor__row-spec muted">
                  {PUZZLE_TASK_KIND_LABELS[t.kind]} · {puzzleTaskSpec(t)}
                </span>
                <span className="puzzle-editor__row-reward">
                  {taskRequiresVibe(t) ? (
                    <span className="puzzle-editor__vibe-badge" title="Задание с вибрацией">
                      〰
                    </span>
                  ) : null}
                  +{t.rewardBonus} / −{t.failPenalty}
                </span>
              </button>
              <div className="puzzle-editor__row-actions">
                <button type="button" className="ghost" onClick={() => duplicate(t)}>
                  Копия
                </button>
                <button type="button" className="ghost" onClick={() => remove(t)}>
                  {t.builtin ? "Скрыть" : "Удалить"}
                </button>
              </div>
            </div>
          ))}
          {tasks.length === 0 ? (
            <p className="muted">Список пуст. Создай первое задание.</p>
          ) : null}
        </div>

        <div className="puzzle-editor__form">
          {editing ? (
            <TaskForm
              key={editing.id}
              task={editing}
              onChange={update}
              onPerTouchKind={changePerTouchKind}
              onPerTouchChange={updatePerTouch}
            />
          ) : (
            <p className="muted">Выбери задание слева или создай новое.</p>
          )}
          {dirty ? <p className="muted">есть несохранённые правки</p> : null}
        </div>
      </div>
    </div>
  );
}

interface TaskFormProps {
  task: PuzzleTask;
  onChange: (patch: Partial<PuzzleTask>) => void;
  onPerTouchKind: (kind: PerTouchKind) => void;
  onPerTouchChange: (patch: Partial<PerTouchAction>) => void;
}

function TaskForm({ task, onChange, onPerTouchKind, onPerTouchChange }: TaskFormProps) {
  const showDuration = ["edge", "hold", "rest", "vibe", "ghost_hint"].includes(task.kind);
  const showCount = task.kind === "spank";
  const showVibe = task.kind === "vibe";
  const showPerTouch = task.kind === "per_touch";

  return (
    <div className="puzzle-form">
      <label className="puzzle-form__field">
        <span>Название</span>
        <input
          type="text"
          value={task.titleRu}
          onChange={(e) => onChange({ titleRu: e.target.value })}
          placeholder="Быстрый эдж"
        />
      </label>

      <label className="puzzle-form__field">
        <span>Инструкция (что делать игроку)</span>
        <textarea
          value={task.instructionRu}
          onChange={(e) => onChange({ instructionRu: e.target.value })}
          rows={3}
          placeholder="Дойди до края и подтверди…"
        />
      </label>

      <label className="puzzle-form__field">
        <span>Тип действия</span>
        <select
          value={task.kind}
          onChange={(e) => onChange({ kind: e.target.value as PuzzleTaskKind })}
        >
          {(Object.keys(PUZZLE_TASK_KIND_LABELS) as PuzzleTaskKind[]).map((k) => (
            <option key={k} value={k}>
              {PUZZLE_TASK_KIND_LABELS[k]}
            </option>
          ))}
        </select>
      </label>

      {showDuration ? (
        <label className="puzzle-form__field">
          <span>Окно / длительность (сек)</span>
          <input
            type="number"
            min={5}
            value={task.durationSec ?? 45}
            onChange={(e) => onChange({ durationSec: clampInt(e.target.value, 5, 3600) })}
          />
        </label>
      ) : null}

      {showCount ? (
        <label className="puzzle-form__field">
          <span>Сколько шлепков</span>
          <input
            type="number"
            min={1}
            value={task.count ?? 20}
            onChange={(e) => onChange({ count: clampInt(e.target.value, 1, 999) })}
          />
        </label>
      ) : null}

      {showCount ? (
        <label className="puzzle-form__field">
          <span>Окно на выполнение (сек)</span>
          <input
            type="number"
            min={5}
            value={task.durationSec ?? 90}
            onChange={(e) => onChange({ durationSec: clampInt(e.target.value, 5, 3600) })}
          />
        </label>
      ) : null}

      {showVibe ? (
        <label className="puzzle-form__field">
          <span>Уровень вибрации (1..5)</span>
          <input
            type="number"
            min={1}
            max={5}
            value={task.vibeLevel ?? 3}
            onChange={(e) => onChange({ vibeLevel: clampInt(e.target.value, 1, 5) })}
          />
        </label>
      ) : (
        <div className="puzzle-form__group puzzle-form__group--vibe">
          <UiCheck
            checked={(task.vibeLevel ?? 0) > 0}
            onChange={(on) => onChange({ vibeLevel: on ? 3 : 0 })}
          >
            <span className="puzzle-form__check-text">
              <strong>С вибрацией</strong>
              <span className="muted">
                стимул устройства работает, пока задание активно
              </span>
            </span>
          </UiCheck>
          {(task.vibeLevel ?? 0) > 0 ? (
            <label className="puzzle-form__field">
              <span>Уровень вибрации (1..5)</span>
              <input
                type="number"
                min={1}
                max={5}
                value={task.vibeLevel ?? 3}
                onChange={(e) => onChange({ vibeLevel: clampInt(e.target.value, 1, 5) })}
              />
            </label>
          ) : null}
        </div>
      )}

      {showPerTouch ? (
        <div className="puzzle-form__group">
          <label className="puzzle-form__field">
            <span>На сколько следующих ходов</span>
            <input
              type="number"
              min={1}
              max={200}
              value={task.perTouchPieces ?? 10}
              onChange={(e) => onChange({ perTouchPieces: clampInt(e.target.value, 1, 200) })}
            />
          </label>
          <label className="puzzle-form__field">
            <span>Действие на каждый ход</span>
            <select
              value={task.perTouchAction?.kind ?? "spank"}
              onChange={(e) => onPerTouchKind(e.target.value as PerTouchKind)}
            >
              <option value="spank">Шлепки</option>
              <option value="vibe">Стимул устройством</option>
              <option value="edge">Держать край</option>
            </select>
          </label>
          {task.perTouchAction?.kind === "spank" ? (
            <label className="puzzle-form__field">
              <span>Шлепков на каждый ход</span>
              <input
                type="number"
                min={1}
                value={task.perTouchAction.count}
                onChange={(e) =>
                  onPerTouchChange({ count: clampInt(e.target.value, 1, 999) })
                }
              />
            </label>
          ) : null}
          {task.perTouchAction?.kind === "vibe" ? (
            <>
              <label className="puzzle-form__field">
                <span>Уровень стимула (0..5)</span>
                <input
                  type="number"
                  min={0}
                  max={5}
                  value={task.perTouchAction.level}
                  onChange={(e) =>
                    onPerTouchChange({ level: clampInt(e.target.value, 0, 5) })
                  }
                />
              </label>
              <label className="puzzle-form__field">
                <span>Секунд стимула</span>
                <input
                  type="number"
                  min={1}
                  value={task.perTouchAction.sec}
                  onChange={(e) =>
                    onPerTouchChange({ sec: clampInt(e.target.value, 1, 600) })
                  }
                />
              </label>
            </>
          ) : null}
          {task.perTouchAction?.kind === "edge" ? (
            <label className="puzzle-form__field">
              <span>Держать край (сек)</span>
              <input
                type="number"
                min={1}
                value={task.perTouchAction.holdSec}
                onChange={(e) =>
                  onPerTouchChange({ holdSec: clampInt(e.target.value, 1, 600) })
                }
              />
            </label>
          ) : null}
        </div>
      ) : null}

      <div className="puzzle-form__row">
        <label className="puzzle-form__field">
          <span>Бонус за выполнение (уголей)</span>
          <input
            type="number"
            min={0}
            value={task.rewardBonus}
            onChange={(e) => onChange({ rewardBonus: clampInt(e.target.value, 0, 999) })}
          />
        </label>
        <label className="puzzle-form__field">
          <span>Штраф за провал (уголей)</span>
          <input
            type="number"
            min={0}
            value={task.failPenalty}
            onChange={(e) => onChange({ failPenalty: clampInt(e.target.value, 0, 999) })}
          />
        </label>
      </div>
    </div>
  );
}

function clampInt(raw: string, min: number, max: number): number {
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}
