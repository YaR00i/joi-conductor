import type { Edge, Node } from "@xyflow/react";
import type {
  EmberScene,
  SceneEditorLayout,
  SceneStep,
} from "../../../../game";

export const STEP_HANDLE_IN = "in";
export const STEP_HANDLE_OUT = "out";
export const optionHandleId = (optionId: string) => `opt:${optionId}`;
export const parseOptionHandle = (handle: string | null | undefined) => {
  if (!handle?.startsWith("opt:")) return null;
  return handle.slice(4);
};

export type StepNodeData = {
  step: SceneStep;
  label: string;
  preview: string;
  isStart: boolean;
  optionLabels?: Array<{ id: string; label: string }>;
};

export type StepNodeType = Node<StepNodeData, "step">;

const STEP_LABELS: Record<SceneStep["type"], string> = {
  dialogue: "Диалог",
  splash: "Splash / CG",
  choice: "Выбор",
  grant_cinders: "Угольки",
  set_flag: "Флаг",
  end: "Конец",
};

export function stepTypeLabel(type: SceneStep["type"]): string {
  return STEP_LABELS[type];
}

export function stepPreviewText(step: SceneStep, max = 42): string {
  let text: string;
  switch (step.type) {
    case "dialogue":
      text = step.textRu.trim() || "(пустой текст)";
      break;
    case "splash":
      text = step.captionRu?.trim() || step.artId;
      break;
    case "choice":
      text = step.promptRu.trim() || "(вопрос)";
      break;
    case "grant_cinders":
      text = `+${step.amount} угольков`;
      break;
    case "set_flag":
      text = `${step.flag} = ${String(step.value)}`;
      break;
    case "end":
      text = "Конец сцены";
      break;
    default: {
      const _n: never = step;
      void _n;
      text = "";
    }
  }
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function edgeId(source: string, sourceHandle: string, target: string): string {
  return `${source}::${sourceHandle}→${target}`;
}

/** Build React Flow nodes/edges from scene steps + layout. */
export function sceneToFlow(
  scene: EmberScene,
  layout: SceneEditorLayout,
): { nodes: StepNodeType[]; edges: Edge[] } {
  const nodes: StepNodeType[] = scene.steps.map((step) => {
    const pos = layout[step.id] ?? { x: 0, y: 0 };
    const data: StepNodeData = {
      step,
      label: STEP_LABELS[step.type],
      preview: stepPreviewText(step),
      isStart: scene.startStepId === step.id,
      optionLabels:
        step.type === "choice"
          ? step.options.map((o) => ({
              id: o.id,
              label: o.labelRu.trim() || o.id,
            }))
          : undefined,
    };
    return {
      id: step.id,
      type: "step",
      position: { x: pos.x, y: pos.y },
      data,
    };
  });

  const edges: Edge[] = [];
  for (const step of scene.steps) {
    if (step.type === "choice") {
      for (const opt of step.options) {
        if (!opt.next) continue;
        const handle = optionHandleId(opt.id);
        edges.push({
          id: edgeId(step.id, handle, opt.next),
          source: step.id,
          sourceHandle: handle,
          target: opt.next,
          targetHandle: STEP_HANDLE_IN,
          label: opt.labelRu.trim() || opt.id,
        });
      }
      continue;
    }
    if (step.type === "end") continue;
    if (!("next" in step) || !step.next) continue;
    edges.push({
      id: edgeId(step.id, STEP_HANDLE_OUT, step.next),
      source: step.id,
      sourceHandle: STEP_HANDLE_OUT,
      target: step.next,
      targetHandle: STEP_HANDLE_IN,
    });
  }

  return { nodes, edges };
}

/** BFS left-to-right layout from startStepId. */
export function autoLayoutScene(scene: EmberScene): SceneEditorLayout {
  const byId = new Map(scene.steps.map((s) => [s.id, s]));
  const children = new Map<string, string[]>();
  const addChild = (from: string, to: string) => {
    const list = children.get(from) ?? [];
    if (!list.includes(to)) list.push(to);
    children.set(from, list);
  };

  for (const step of scene.steps) {
    if (step.type === "choice") {
      for (const opt of step.options) {
        if (opt.next && byId.has(opt.next)) addChild(step.id, opt.next);
      }
    } else if (step.type !== "end" && "next" in step && step.next) {
      if (byId.has(step.next)) addChild(step.id, step.next);
    }
  }

  const depth = new Map<string, number>();
  const queue: string[] = [];
  const start = byId.has(scene.startStepId)
    ? scene.startStepId
    : (scene.steps[0]?.id ?? "");
  if (start) {
    depth.set(start, 0);
    queue.push(start);
  }

  while (queue.length) {
    const id = queue.shift()!;
    const d = depth.get(id) ?? 0;
    for (const child of children.get(id) ?? []) {
      const prev = depth.get(child);
      if (prev === undefined || d + 1 < prev) {
        depth.set(child, d + 1);
        queue.push(child);
      }
    }
  }

  // Orphans / unreachable
  for (const step of scene.steps) {
    if (!depth.has(step.id)) depth.set(step.id, 0);
  }

  const columns = new Map<number, string[]>();
  for (const [id, d] of depth) {
    const col = columns.get(d) ?? [];
    col.push(id);
    columns.set(d, col);
  }

  const COL_W = 280;
  const ROW_H = 140;
  const layout: SceneEditorLayout = {};
  for (const [d, ids] of columns) {
    ids.forEach((id, row) => {
      layout[id] = { x: d * COL_W, y: row * ROW_H };
    });
  }
  return layout;
}

export function resolveEditorLayout(scene: EmberScene): SceneEditorLayout {
  const existing = scene.editorLayout ?? {};
  const missing = scene.steps.some((s) => !existing[s.id]);
  if (!missing && Object.keys(existing).length > 0) return { ...existing };
  const auto = autoLayoutScene(scene);
  return { ...auto, ...existing };
}

export type GraphConnect = {
  source: string;
  sourceHandle: string | null;
  target: string;
  targetHandle: string | null;
};

/** Apply a new edge to steps (source of truth). */
export function applyConnect(
  steps: SceneStep[],
  conn: GraphConnect,
): SceneStep[] {
  const { source, sourceHandle, target } = conn;
  if (!source || !target || source === target) return steps;

  return steps.map((step) => {
    if (step.id !== source) return step;
    if (step.type === "choice") {
      const optId = parseOptionHandle(sourceHandle);
      if (!optId) return step;
      return {
        ...step,
        options: step.options.map((o) =>
          o.id === optId ? { ...o, next: target } : o,
        ),
      };
    }
    if (step.type === "end") return step;
    if (sourceHandle && sourceHandle !== STEP_HANDLE_OUT) return step;
    return { ...step, next: target } as SceneStep;
  });
}

export type GraphDisconnect = {
  source: string;
  sourceHandle: string | null;
  target: string;
};

/** Clear next / option.next for a removed edge. */
export function applyDisconnect(
  steps: SceneStep[],
  edge: GraphDisconnect,
): SceneStep[] {
  const { source, sourceHandle } = edge;
  return steps.map((step) => {
    if (step.id !== source) return step;
    if (step.type === "choice") {
      const optId = parseOptionHandle(sourceHandle);
      if (!optId) return step;
      return {
        ...step,
        options: step.options.map((o) =>
          o.id === optId ? { ...o, next: "end" } : o,
        ),
      };
    }
    if (step.type === "end") return step;
    if ("next" in step) {
      return { ...step, next: undefined } as SceneStep;
    }
    return step;
  });
}

/** Remove a step and retarget dangling links to end / clear. */
export function removeStepFromGraph(
  scene: EmberScene,
  id: string,
): EmberScene {
  const step = scene.steps.find((s) => s.id === id);
  if (!step || step.type === "end") return scene;

  const steps = scene.steps
    .filter((s) => s.id !== id)
    .map((s) => {
      if (s.type === "choice") {
        return {
          ...s,
          options: s.options.map((o) =>
            o.next === id ? { ...o, next: "end" } : o,
          ),
        };
      }
      if (s.type !== "end" && "next" in s && s.next === id) {
        return { ...s, next: "end" } as SceneStep;
      }
      return s;
    });

  const layout = { ...(scene.editorLayout ?? {}) };
  delete layout[id];

  const start =
    scene.startStepId === id
      ? (steps.find((s) => s.type !== "end")?.id ?? "end")
      : scene.startStepId;

  return { ...scene, steps, startStepId: start, editorLayout: layout };
}

/** Remove many steps (skips `end`). */
export function removeStepsFromGraph(
  scene: EmberScene,
  ids: string[],
): EmberScene {
  let next = scene;
  for (const id of ids) {
    next = removeStepFromGraph(next, id);
  }
  return next;
}

function cloneStepWithNewId(step: SceneStep, newId: string): SceneStep {
  if (step.type === "choice") {
    return {
      ...step,
      id: newId,
      options: step.options.map((o) => ({
        ...o,
        id: `${o.id}_${Math.random().toString(36).slice(2, 5)}`,
      })),
      actors: step.actors?.map((a) => ({ ...a })),
    };
  }
  if (step.type === "dialogue") {
    return {
      ...step,
      id: newId,
      actors: step.actors?.map((a) => ({ ...a })),
    };
  }
  return { ...step, id: newId } as SceneStep;
}

/**
 * Duplicate selected steps (not `end`). Remaps next links among the copy set.
 * Returns new scene + ids of created steps.
 */
export function duplicateStepsInGraph(
  scene: EmberScene,
  ids: string[],
): { scene: EmberScene; newIds: string[] } {
  const selected = ids.filter((id) => {
    const s = scene.steps.find((x) => x.id === id);
    return s && s.type !== "end";
  });
  if (!selected.length) return { scene, newIds: [] };

  const idMap = new Map<string, string>();
  for (const id of selected) {
    idMap.set(id, `${id}_copy_${Math.random().toString(36).slice(2, 6)}`);
  }

  const layout = { ...(scene.editorLayout ?? {}) };
  const clones: SceneStep[] = [];
  for (const id of selected) {
    const step = scene.steps.find((s) => s.id === id);
    const newId = idMap.get(id);
    if (!step || !newId) continue;
    let clone = cloneStepWithNewId(step, newId);
    if (clone.type === "choice") {
      clone = {
        ...clone,
        options: clone.options.map((o) => ({
          ...o,
          next: idMap.get(o.next) ?? o.next,
        })),
      };
    } else if (clone.type !== "end" && "next" in clone && clone.next) {
      clone = {
        ...clone,
        next: idMap.get(clone.next) ?? clone.next,
      } as SceneStep;
    }
    clones.push(clone);
    const pos = layout[id] ?? { x: 40, y: 40 };
    layout[newId] = { x: pos.x + 36, y: pos.y + 36 };
  }

  const body = scene.steps.filter((s) => s.type !== "end");
  const end = scene.steps.find((s) => s.type === "end") ?? {
    id: "end",
    type: "end" as const,
  };
  return {
    scene: {
      ...scene,
      steps: [...body, ...clones, end],
      editorLayout: layout,
    },
    newIds: [...idMap.values()],
  };
}

/** Apply background art to dialogue / choice / splash steps. */
export function applyBgToSteps(
  scene: EmberScene,
  ids: string[],
  bgArtId: string | undefined,
): EmberScene {
  const set = new Set(ids);
  const steps = scene.steps.map((s) => {
    if (!set.has(s.id)) return s;
    if (s.type === "dialogue" || s.type === "choice") {
      return { ...s, bgArtId: bgArtId || undefined };
    }
    if (s.type === "splash" && bgArtId) {
      return { ...s, artId: bgArtId };
    }
    return s;
  });
  return { ...scene, steps };
}

/** Ensure a single end step exists. */
export function ensureEndStep(steps: SceneStep[]): SceneStep[] {
  const body = steps.filter((s) => s.type !== "end");
  const end = steps.find((s) => s.type === "end") ?? {
    id: "end",
    type: "end" as const,
  };
  return [...body, end];
}

/** Place a new step to the right of an anchor (or at origin). */
export function placeNear(
  layout: SceneEditorLayout,
  newId: string,
  nearId?: string | null,
): SceneEditorLayout {
  const anchor = nearId ? layout[nearId] : undefined;
  const pos = anchor
    ? { x: anchor.x + 280, y: anchor.y }
    : { x: 40, y: 40 };
  // Nudge if occupied
  let y = pos.y;
  const taken = new Set(
    Object.entries(layout).map(([, p]) => `${p.x},${p.y}`),
  );
  while (taken.has(`${pos.x},${y}`)) y += 140;
  return { ...layout, [newId]: { x: pos.x, y } };
}
