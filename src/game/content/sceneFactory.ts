import type {
  EmberDialogueUse,
  EmberEvent,
  EmberEventTrigger,
  EmberPack,
  EmberScene,
  EmberStage,
  SceneStep,
} from "./types";
import { defaultActorFromSpeaker } from "./sceneStage";
import { isEmberDialogueUse } from "./emberScript";

function uid(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}`;
}

function talkTemplateSteps(speaker: string): {
  steps: SceneStep[];
  startStepId: string;
  editorLayout: EmberScene["editorLayout"];
} {
  const a = "line_a";
  const b = "line_b";
  return {
    startStepId: a,
    steps: [
      {
        id: a,
        type: "dialogue",
        speaker,
        portraitKey: "neutral",
        nameRu: speaker,
        textRu: "Привет.",
        next: b,
      },
      {
        id: b,
        type: "dialogue",
        speaker,
        portraitKey: "neutral",
        nameRu: speaker,
        textRu: "Что-нибудь ещё?",
        next: "end",
      },
      { id: "end", type: "end" },
    ],
    editorLayout: {
      [a]: { x: 40, y: 80 },
      [b]: { x: 280, y: 80 },
      end: { x: 520, y: 80 },
    },
  };
}

/** Build a playable scene. `use: talk|shop_intro` skips portraits/bg. */
export function createEmptyScene(opts?: {
  id?: string;
  nameRu?: string;
  defaultBgArtId?: string;
  speaker?: string;
  use?: EmberDialogueUse;
}): EmberScene {
  const id = opts?.id ?? uid("scene");
  const speaker = opts?.speaker ?? "hu_tao";
  const use = isEmberDialogueUse(opts?.use) ? opts.use : "cutscene";
  const light = use === "talk" || use === "shop_intro";
  if (light) {
    const built = talkTemplateSteps(speaker);
    if (use === "shop_intro") {
      built.steps = built.steps.filter((step) => step.id !== "line_b");
      const first = built.steps.find((step) => step.type === "dialogue");
      if (first && first.type === "dialogue") {
        first.textRu = "Добро пожаловать.";
        first.next = "end";
      }
      built.editorLayout = {
        line_a: { x: 40, y: 80 },
        end: { x: 320, y: 80 },
      };
    }
    return {
      id,
      nameRu:
        opts?.nameRu ?? (use === "shop_intro" ? "Приветствие лавки" : "Болтовня"),
      use,
      startStepId: built.startStepId,
      steps: built.steps,
      editorLayout: built.editorLayout,
    };
  }
  const portraitKey = "neutral";
  const dlgId = "start";
  const steps: SceneStep[] = [
    {
      id: dlgId,
      type: "dialogue",
      speaker,
      portraitKey,
      nameRu: speaker,
      textRu: "Новая сцена…",
      bgArtId: opts?.defaultBgArtId,
      actors: [defaultActorFromSpeaker(speaker, portraitKey, "left")],
      next: "end",
    },
    { id: "end", type: "end" },
  ];
  return {
    id,
    nameRu: opts?.nameRu ?? "Новая сцена",
    use,
    startStepId: dlgId,
    defaultBgArtId: opts?.defaultBgArtId,
    steps,
    editorLayout: {
      [dlgId]: { x: 40, y: 80 },
      end: { x: 320, y: 80 },
    },
  };
}

export function createEventForScene(
  scene: EmberScene,
  trigger: EmberEventTrigger = "manual",
): EmberEvent {
  return {
    id: scene.id,
    nameRu: scene.nameRu,
    trigger,
    sceneId: scene.id,
  };
}

/**
 * Keep stage.onClearEventId / onFailEventId in sync with the event's trigger.
 * Clears stale links that pointed at this event under another trigger.
 */
export function syncEventStageLinks(
  pack: EmberPack,
  event: EmberEvent,
): { pack: EmberPack; stagesChanged: EmberStage[] } {
  const stagesChanged: EmberStage[] = [];
  const stages: Record<string, EmberStage> = { ...pack.stages };

  for (const [id, stage] of Object.entries(stages)) {
    let next = stage;
    let dirty = false;

    if (stage.onClearEventId === event.id && event.trigger !== "on_stage_clear") {
      next = { ...next, onClearEventId: undefined };
      dirty = true;
    }
    if (stage.onFailEventId === event.id && event.trigger !== "on_stage_fail") {
      next = { ...next, onFailEventId: undefined };
      dirty = true;
    }

    if (event.trigger === "on_stage_clear" && event.stageId === id) {
      if (next.onClearEventId !== event.id) {
        next = { ...next, onClearEventId: event.id };
        dirty = true;
      }
    }
    if (event.trigger === "on_stage_fail" && event.stageId === id) {
      if (next.onFailEventId !== event.id) {
        next = { ...next, onFailEventId: event.id };
        dirty = true;
      }
    }

    // Another stage shouldn't keep this event as clear/fail if stageId moved
    if (
      event.trigger === "on_stage_clear" &&
      event.stageId &&
      event.stageId !== id &&
      next.onClearEventId === event.id
    ) {
      next = { ...next, onClearEventId: undefined };
      dirty = true;
    }
    if (
      event.trigger === "on_stage_fail" &&
      event.stageId &&
      event.stageId !== id &&
      next.onFailEventId === event.id
    ) {
      next = { ...next, onFailEventId: undefined };
      dirty = true;
    }

    if (dirty) {
      stages[id] = next;
      stagesChanged.push(next);
    }
  }

  return { pack: { ...pack, stages }, stagesChanged };
}
