import type {
  EmberEvent,
  EmberEventTrigger,
  EmberPack,
  EmberScene,
  EmberStage,
  SceneStep,
} from "./types";
import { defaultActorFromSpeaker } from "./sceneStage";

function uid(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Build a minimal playable scene (dialogue → end). */
export function createEmptyScene(opts?: {
  id?: string;
  nameRu?: string;
  defaultBgArtId?: string;
  speaker?: string;
}): EmberScene {
  const id = opts?.id ?? uid("scene");
  const speaker = opts?.speaker ?? "hu_tao";
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
