import type {
  EmberPack,
  EmberScene,
  PortraitSide,
  SceneActor,
  SceneStep,
} from "./types";

type DialogueStep = Extract<SceneStep, { type: "dialogue" }>;
type ChoiceStep = Extract<SceneStep, { type: "choice" }>;

/** Default floor line for standing portraits (anchor bottom of stage). */
export const ACTOR_FLOOR_Y = 96;
/** Min/max Y for editor sliders (max > 100 = under the frame). */
export const ACTOR_Y_MIN = 40;
export const ACTOR_Y_MAX = 140;

export function actorFloorY(actor: Pick<SceneActor, "floorY" | "y">): number {
  const raw = actor.floorY ?? actor.y ?? ACTOR_FLOOR_Y;
  return Math.max(ACTOR_Y_MIN, Math.min(ACTOR_Y_MAX, raw));
}

export function defaultActorFromSpeaker(
  speaker: string,
  portraitKey: string,
  side: PortraitSide = "left",
  id = "main",
): SceneActor {
  return {
    id,
    speaker,
    portraitKey,
    x: side === "right" ? 72 : 28,
    y: ACTOR_FLOOR_Y,
    floorY: ACTOR_FLOOR_Y,
    scale: 1.65,
    z: 1,
    lockY: true,
  };
}

/** Bust browser cache after portrait alpha / asset updates. */
export const PORTRAIT_ASSET_REV = "alpha3";

/** Actors for a dialogue step (explicit list or legacy L/R). */
export function resolveDialogueActors(step: DialogueStep): SceneActor[] {
  if (step.actors && step.actors.length > 0) {
    return step.actors.map((a) => ({ ...a }));
  }
  return [
    defaultActorFromSpeaker(
      step.speaker,
      step.portraitKey,
      step.portraitSide ?? "left",
    ),
  ];
}

/** Actors from the step that leads into `stepId` (dialogue/choice with stage). */
export function findIncomingStageActors(
  scene: EmberScene,
  stepId: string,
): SceneActor[] | null {
  for (const s of scene.steps) {
    if (s.type === "dialogue" && s.next === stepId) {
      const actors = resolveDialogueActors(s);
      if (actors.length > 0) return actors;
    }
    if (s.type === "choice" && s.options.some((o) => o.next === stepId)) {
      const actors =
        s.actors && s.actors.length > 0
          ? s.actors.map((a) => ({ ...a }))
          : null;
      if (actors && actors.length > 0) return actors;
    }
  }

  const idx = scene.steps.findIndex((s) => s.id === stepId);
  for (let i = idx - 1; i >= 0; i--) {
    const s = scene.steps[i];
    if (s.type === "dialogue") {
      const actors = resolveDialogueActors(s);
      if (actors.length > 0) return actors;
    }
    if (s.type === "choice" && s.actors && s.actors.length > 0) {
      return s.actors.map((a) => ({ ...a }));
    }
  }
  return null;
}

/**
 * Choice stage cast: prefer the previous step’s layout/size so the avatar
 * doesn’t “jump” when the prompt appears.
 */
export function resolveChoiceActors(
  step: ChoiceStep,
  scene?: EmberScene,
): SceneActor[] {
  const incoming = scene ? findIncomingStageActors(scene, step.id) : null;
  if (incoming && incoming.length > 0) {
    return incoming.map((a) => ({ ...a }));
  }
  if (step.actors && step.actors.length > 0) {
    return step.actors.map((a) => ({ ...a }));
  }
  return [];
}

export function resolveStepBgArtId(
  step: SceneStep,
  scene: EmberScene,
): string | undefined {
  if (step.type === "dialogue" || step.type === "choice") {
    return step.bgArtId || scene.defaultBgArtId;
  }
  if (step.type === "splash") return step.artId;
  return scene.defaultBgArtId;
}

export function actorPortraitUrl(
  pack: EmberPack,
  actor: SceneActor,
): string | null {
  const expr = pack.portraits[actor.speaker]?.expressions[actor.portraitKey];
  return expr?.path ?? null;
}

/** Keep speaker/portraitKey in sync with the first (or matching) actor. */
export function syncDialogueSpeakerFields(
  step: DialogueStep,
  actors: SceneActor[],
): Pick<DialogueStep, "speaker" | "portraitKey" | "portraitSide" | "actors"> {
  const primary =
    actors.find((a) => a.speaker === step.speaker) ?? actors[0] ?? null;
  if (!primary) {
    return { actors, speaker: step.speaker, portraitKey: step.portraitKey };
  }
  return {
    actors,
    speaker: primary.speaker,
    portraitKey: primary.portraitKey,
    portraitSide: primary.x >= 50 ? "right" : "left",
  };
}
