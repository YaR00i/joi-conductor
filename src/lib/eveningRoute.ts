/**
 * First-run / dismissible «вечерний маршрут» — light guided path into Roulette.
 * Persisted in localStorage (shared across save slots; not progress).
 */

export const EVENING_ROUTE_STORAGE_KEY = "joi-evening-route-v1";

export type EveningRouteStatus = "pending" | "completed" | "dismissed";

export type EveningRouteState = {
  status: EveningRouteStatus;
};

/** 1-based step ids for the guided flow. */
export type EveningRouteStepId = 1 | 2 | 3;

export const EVENING_ROUTE_STEPS: ReadonlyArray<{
  id: EveningRouteStepId;
  labelRu: string;
  titleRu: string;
}> = [
  {
    id: 1,
    labelRu: "Госпожа",
    titleRu: "Кто ведёт вечер?",
  },
  {
    id: 2,
    labelRu: "Сегодня",
    titleRu: "Что сегодня на столе?",
  },
  {
    id: 3,
    labelRu: "Рулетка",
    titleRu: "Крути рулетку",
  },
];

export function defaultEveningRouteState(): EveningRouteState {
  return { status: "pending" };
}

function isStatus(v: unknown): v is EveningRouteStatus {
  return v === "pending" || v === "completed" || v === "dismissed";
}

export function loadEveningRouteState(): EveningRouteState {
  try {
    const raw = localStorage.getItem(EVENING_ROUTE_STORAGE_KEY);
    if (!raw) return defaultEveningRouteState();
    const parsed = JSON.parse(raw) as Partial<EveningRouteState>;
    if (isStatus(parsed.status)) return { status: parsed.status };
    return defaultEveningRouteState();
  } catch {
    return defaultEveningRouteState();
  }
}

export function saveEveningRouteState(state: EveningRouteState): void {
  try {
    localStorage.setItem(EVENING_ROUTE_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore quota / private mode
  }
}

/** Show on launch when the wizard was never finished or permanently dismissed. */
export function shouldShowEveningRoute(
  state: EveningRouteState = loadEveningRouteState(),
): boolean {
  return state.status === "pending";
}

export function markEveningRouteCompleted(): void {
  saveEveningRouteState({ status: "completed" });
}

/** «Не показывать снова» */
export function markEveningRouteDismissed(): void {
  saveEveningRouteState({ status: "dismissed" });
}

/** Re-open from Settings — clears completed/dismissed so the overlay can show. */
export function reopenEveningRoute(): void {
  saveEveningRouteState({ status: "pending" });
}

export function eveningRouteStepMeta(step: EveningRouteStepId) {
  switch (step) {
    case 1:
      return EVENING_ROUTE_STEPS[0]!;
    case 2:
      return EVENING_ROUTE_STEPS[1]!;
    case 3:
      return EVENING_ROUTE_STEPS[2]!;
    default: {
      const _exhaustive: never = step;
      return _exhaustive;
    }
  }
}
