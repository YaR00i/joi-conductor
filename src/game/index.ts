export type { EmberBridgeEvent, EmberGameApi, EmberLootOption } from "./bridge/events";
export { loadEmberPack } from "./content/loadPack";
export {
  clearAllLocalOverrides,
  clearLocalOverride,
  deleteEmberFile,
  emberAssetUrl,
  listEmberDir,
  listLocalOverrides,
  readEmberJson,
  writeEmberBytes,
  writeEmberJson,
  writeEmberText,
} from "./content/io";
export {
  createEmptyScene,
  createEventForScene,
  syncEventStageLinks,
} from "./content/sceneFactory";
export {
  upsertEvent,
  upsertLightPresets,
  upsertLookPresets,
  upsertScene,
  upsertStage,
} from "./content/loadPack";
export type {
  EmberEvent,
  EmberEventTrigger,
  EmberLampParams,
  EmberLightPreset,
  EmberLookPreset,
  EmberMap,
  EmberMapGrade,
  EmberMapLight,
  EmberPack,
  EmberScene,
  EmberSceneGroup,
  EmberSceneHierarchy,
  EmberSceneLocalTransform,
  EmberStage,
  SceneActor,
  SceneEditorLayout,
  SceneStep,
  ValidationIssue,
} from "./content/types";
export {
  applyLampParamsToSource,
  lampParamsFromSource,
  lightsFileFromPresets,
  newLightPresetId,
  normalizeLampParams,
  normalizeLightPreset,
} from "./content/lightPresets";
export {
  applyLookPresetToLight,
  BUILTIN_SUNNY_EVENING_LOOK,
  isBuiltinLookPreset,
  listLookPresets,
  lookSnapshotFromLight,
  looksFileFromPresets,
  newLookPresetId,
  normalizeLookPreset,
} from "./content/lookPresets";
export {
  ACTOR_FLOOR_Y,
  ACTOR_Y_MAX,
  ACTOR_Y_MIN,
  actorFloorY,
  defaultActorFromSpeaker,
  findIncomingStageActors,
  PORTRAIT_ASSET_REV,
  resolveChoiceActors,
  resolveDialogueActors,
  resolveStepBgArtId,
  syncDialogueSpeakerFields,
} from "./content/sceneStage";
export { validatePack } from "./content/validate";
export {
  createEmberGame,
  createEmberPhaserGame,
} from "./phaser/createGame";
export { createEmberThreeGame } from "./three/createEmberThreeGame";
export {
  createEditorThreePreview,
  type EditorOverlayMarks,
  type EditorPick,
  type EditorThreePreview,
} from "./three/editorThreePreview";
export {
  createEmptyMap,
  paintMapToCanvas,
  type MapViewMode,
} from "./tile/mapUtils";
