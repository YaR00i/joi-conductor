/**
 * Puzzle tasks (special-piece activities) for the Minigames → Puzzle section.
 *
 * Library is shared across save slots (lives in a non-progress localStorage key),
 * so tasks created in the Sandbox are playable in Live too. Editing the library
 * is sandbox-gated (see PuzzleTaskEditor / MinigamesPage).
 */

export type PuzzleTaskKind =
  | "edge"
  | "spank"
  | "hold"
  | "rest"
  | "vibe"
  | "per_touch"
  | "ghost_hint";

/** Action applied on every touched piece while a per_touch task is active. */
export type PerTouchAction =
  | { kind: "spank"; count: number }
  | { kind: "vibe"; level: number; sec: number }
  | { kind: "edge"; holdSec: number };

export interface PuzzleTask {
  id: string;
  /** Stable marker: builtins can be hidden but not re-saved with same id. */
  builtin?: boolean;
  titleRu: string;
  /** What the player must do — shown in the task runner. */
  instructionRu: string;
  kind: PuzzleTaskKind;
  /** edge/hold/rest/vibe: time window (seconds) to perform / hold. */
  durationSec?: number;
  /** spank: number of strikes. */
  count?: number;
  /** Optional device stimulus level 0..5 applied while the task is active. */
  vibeLevel?: number;
  /** per_touch: applies to the next N touched pieces. */
  perTouchPieces?: number;
  /** per_touch: action required on each touched piece. */
  perTouchAction?: PerTouchAction;
  /** Cinders added on success. */
  rewardBonus: number;
  /** Cinders subtracted on fail / timeout / skip. */
  failPenalty: number;
}

const STORAGE_KEY = "joi-puzzle-tasks-v1";

export const PUZZLE_TASK_KIND_LABELS: Record<PuzzleTaskKind, string> = {
  edge: "Эдж",
  spank: "Шлепки / CBT",
  hold: "Удержание",
  rest: "Пауза",
  vibe: "Стимул устройством",
  per_touch: "На каждый ход",
  ghost_hint: "Призрак-подсказка",
};

/** Human readable one-line spec of a task, used in lists / cards. */
export function puzzleTaskSpec(t: PuzzleTask): string {
  switch (t.kind) {
    case "edge":
      return `Дойти до края за ${t.durationSec ?? 60}с`;
    case "spank":
      return `${t.count ?? 20} шлепков за ${t.durationSec ?? 90}с`;
    case "hold":
      return `Удерживать ${t.durationSec ?? 45}с`;
    case "rest":
      return `Пауза / не трогать ${t.durationSec ?? 30}с`;
    case "vibe":
      return `Уровень ${t.vibeLevel ?? 3} на ${t.durationSec ?? 30}с`;
    case "ghost_hint":
      return `Призрак на ${t.durationSec ?? 10}с`;
    case "per_touch": {
      const n = t.perTouchPieces ?? 10;
      const a = t.perTouchAction;
      const aTxt = a
        ? a.kind === "spank"
          ? `${a.count} шлепков`
          : a.kind === "vibe"
            ? `уровень ${a.level} на ${a.sec}с`
            : `держать край ${a.holdSec}с`
        : "—";
      return `На следующие ${n} кусочков: ${aTxt}`;
    }
    default: {
      const _n: never = t.kind;
      void _n;
      return "";
    }
  }
}

function builtinTasks(): PuzzleTask[] {
  return [
    {
      id: "builtin_edge_rush",
      builtin: true,
      titleRu: "Быстрый эдж",
      instructionRu: "Дойди до края и подтверди. Не срывайся.",
      kind: "edge",
      durationSec: 60,
      rewardBonus: 5,
      failPenalty: 3,
    },
    {
      id: "builtin_spank_burst",
      builtin: true,
      titleRu: "Залп шлепков",
      instructionRu: "Сделай 20 шлепков. Считай сам, не жульничай.",
      kind: "spank",
      count: 20,
      durationSec: 90,
      rewardBonus: 6,
      failPenalty: 4,
    },
    {
      id: "builtin_hold_edge",
      builtin: true,
      titleRu: "Удержание",
      instructionRu: "Держи край столько, сколько скажет таймер.",
      kind: "hold",
      durationSec: 45,
      rewardBonus: 7,
      failPenalty: 4,
    },
    {
      id: "builtin_rest",
      builtin: true,
      titleRu: "Передышка",
      instructionRu: "Убери руки. Не трогай ничего до конца таймера.",
      kind: "rest",
      durationSec: 30,
      rewardBonus: 4,
      failPenalty: 2,
    },
    {
      id: "builtin_vibe_pulse",
      builtin: true,
      titleRu: "Вибро-импульс",
      instructionRu: "Терпи стимул, пока идёт таймер. Не двигай кусочки.",
      kind: "vibe",
      vibeLevel: 3,
      durationSec: 30,
      rewardBonus: 6,
      failPenalty: 3,
    },
    {
      id: "builtin_per_touch_spank",
      builtin: true,
      titleRu: "Шлёпай за каждый ход",
      instructionRu:
        "Каждый следующий кусочек, который ты тронешь, стоит 5 шлепков. Считай сам.",
      kind: "per_touch",
      perTouchPieces: 10,
      perTouchAction: { kind: "spank", count: 5 },
      rewardBonus: 10,
      failPenalty: 6,
    },
    {
      id: "builtin_ghost_hint",
      builtin: true,
      titleRu: "Проблеск призрака",
      instructionRu:
        "Подсказка-призрак появится на доске ненадолго. Успей запомнить, куда что кладётся.",
      kind: "ghost_hint",
      durationSec: 12,
      rewardBonus: 3,
      failPenalty: 0,
    },
    {
      id: "builtin_per_touch_vibe",
      builtin: true,
      titleRu: "Голодная доска",
      instructionRu:
        "Следующие 12 кусочков: каждый запускай стимул уровень 2 на 15 секунд.",
      kind: "per_touch",
      perTouchPieces: 12,
      perTouchAction: { kind: "vibe", level: 2, sec: 15 },
      rewardBonus: 12,
      failPenalty: 7,
    },
  ];
}

export function loadPuzzleTasks(): PuzzleTask[] {
  let user: PuzzleTask[] = [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<PuzzleTask>[];
      if (Array.isArray(parsed)) {
        user = parsed.filter(isValidTask) as PuzzleTask[];
      }
    }
  } catch {
    // ignore corrupt storage
  }
  // Builtins first, then user-created. Hidden builtins tracked separately.
  const hidden = loadHiddenBuiltinIds();
  const builtins = builtinTasks().filter((b) => !hidden.has(b.id));
  return [...builtins, ...user];
}

function isValidTask(t: unknown): t is PuzzleTask {
  if (!t || typeof t !== "object") return false;
  const o = t as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    typeof o.titleRu === "string" &&
    typeof o.instructionRu === "string" &&
    typeof o.kind === "string" &&
    typeof o.rewardBonus === "number" &&
    typeof o.failPenalty === "number"
  );
}

const HIDDEN_KEY = "joi-puzzle-tasks-hidden-v1";

function loadHiddenBuiltinIds(): Set<string> {
  try {
    const raw = localStorage.getItem(HIDDEN_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) return new Set(arr.filter((x) => typeof x === "string"));
  } catch {
    // ignore
  }
  return new Set();
}

function saveHiddenBuiltinIds(ids: Set<string>): void {
  try {
    localStorage.setItem(HIDDEN_KEY, JSON.stringify([...ids]));
  } catch {
    // ignore
  }
}

function saveUserTasks(tasks: PuzzleTask[]): void {
  const user = tasks.filter((t) => !t.builtin);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
  } catch {
    // ignore quota
  }
}

export function savePuzzleTasks(tasks: PuzzleTask[]): void {
  // Only persist user tasks; builtins are regenerated. Hidden state handled
  // separately, so derive current hidden set from incoming list.
  const allBuiltins = builtinTasks();
  const presentBuiltinIds = new Set(
    tasks.filter((t) => t.builtin).map((t) => t.id),
  );
  const hidden = new Set(
    allBuiltins.filter((b) => !presentBuiltinIds.has(b.id)).map((b) => b.id),
  );
  saveHiddenBuiltinIds(hidden);
  saveUserTasks(tasks);
}

export function newPuzzleTaskId(): string {
  return `pt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function blankPuzzleTask(): PuzzleTask {
  return {
    id: newPuzzleTaskId(),
    titleRu: "",
    instructionRu: "",
    kind: "edge",
    durationSec: 45,
    rewardBonus: 5,
    failPenalty: 3,
  };
}

/** Pick a random task from the library (used when seeding special pieces). */
export function pickRandomTask(
  tasks: PuzzleTask[],
  rng: () => number = Math.random,
): PuzzleTask | null {
  if (tasks.length === 0) return null;
  return tasks[Math.floor(rng() * tasks.length)];
}
