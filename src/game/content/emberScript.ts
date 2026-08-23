/**
 * Dialogue + action-list resolution shared by editor, play, and exploreSim.
 * One graph (EmberScene) for talk and cutscenes; scripts are ordered steps.
 */
import { grantItemCounts } from "./emberItem";
import type {
  EmberActionScript,
  EmberDialogueUse,
  EmberFlagValue,
  EmberInteractivityModifier,
  EmberItemDef,
  EmberItemIcon,
  EmberMap,
  EmberQuestMarkerStatus,
  EmberScene,
  EmberScriptStep,
  SceneStep,
} from "./types";
import {
  EMBER_DIALOGUE_USES,
  EMBER_QUEST_MARKER_STATUSES,
  EMBER_SCRIPT_STEP_KINDS,
} from "./types";

export const DEFAULT_QUEST_ICON_BY_STATUS: Record<
  EmberQuestMarkerStatus,
  string
> = {
  available: "quest_available",
  active: "quest_active",
  done: "quest_done",
};

const SCRIPT_RECURSE_MAX = 8;

export function isEmberDialogueUse(value: unknown): value is EmberDialogueUse {
  return (
    typeof value === "string" &&
    (EMBER_DIALOGUE_USES as readonly string[]).includes(value)
  );
}

export function isEmberQuestMarkerStatus(
  value: unknown,
): value is EmberQuestMarkerStatus {
  return (
    typeof value === "string" &&
    (EMBER_QUEST_MARKER_STATUSES as readonly string[]).includes(value)
  );
}

export function isEmberScriptStepKind(
  value: unknown,
): value is EmberScriptStep["type"] {
  return (
    typeof value === "string" &&
    (EMBER_SCRIPT_STEP_KINDS as readonly string[]).includes(value)
  );
}

export function dialogueUseOf(scene: EmberScene | undefined): EmberDialogueUse {
  if (scene && isEmberDialogueUse(scene.use)) return scene.use;
  return "cutscene";
}

export function parseFlagValue(raw: unknown): EmberFlagValue | null {
  if (typeof raw === "boolean" || typeof raw === "string") return raw;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  return null;
}

function optionalText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text || null;
}

export function parseScriptStep(raw: unknown): EmberScriptStep | null {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const rec = raw as Record<string, unknown>;
  if (!isEmberScriptStepKind(rec.type)) return null;
  switch (rec.type) {
    case "talk": {
      const dialogueId = optionalText(rec.dialogueId);
      return dialogueId ? { type: "talk", dialogueId } : null;
    }
    case "change_map": {
      const targetMapId = optionalText(rec.targetMapId);
      if (!targetMapId) return null;
      const targetRegionId = optionalText(rec.targetRegionId);
      return targetRegionId
        ? { type: "change_map", targetMapId, targetRegionId }
        : { type: "change_map", targetMapId };
    }
    case "open_shop": {
      const shopId = optionalText(rec.shopId);
      return shopId ? { type: "open_shop", shopId } : null;
    }
    case "give_item": {
      const itemId = optionalText(rec.itemId);
      if (!itemId) return null;
      const count =
        typeof rec.count === "number" && Number.isFinite(rec.count)
          ? Math.max(1, Math.round(rec.count))
          : undefined;
      return count != null
        ? { type: "give_item", itemId, count }
        : { type: "give_item", itemId };
    }
    case "set_flag": {
      const flag = optionalText(rec.flag);
      const value = parseFlagValue(rec.value);
      return flag && value != null ? { type: "set_flag", flag, value } : null;
    }
    case "wait": {
      if (typeof rec.sec !== "number" || !Number.isFinite(rec.sec)) return null;
      return { type: "wait", sec: Math.max(0, rec.sec) };
    }
    case "run_script": {
      const scriptId = optionalText(rec.scriptId);
      return scriptId ? { type: "run_script", scriptId } : null;
    }
    default: {
      const _never: never = rec.type;
      return _never;
    }
  }
}

export function parseActionScript(raw: unknown): EmberActionScript | null {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const rec = raw as Record<string, unknown>;
  const id = optionalText(rec.id);
  if (!id) return null;
  const nameRu =
    typeof rec.nameRu === "string" && rec.nameRu.trim()
      ? rec.nameRu.trim()
      : id;
  if (!Array.isArray(rec.steps)) return { id, nameRu, steps: [] };
  const steps: EmberScriptStep[] = [];
  for (const item of rec.steps) {
    const step = parseScriptStep(item);
    if (step) steps.push(step);
  }
  return { id, nameRu, steps };
}

export type ScriptRef =
  | { kind: "script"; script: EmberActionScript }
  | { kind: "dialogue"; scene: EmberScene };

export function resolveScriptRef(
  scripts: Record<string, EmberActionScript> | undefined,
  scenes: Record<string, EmberScene> | undefined,
  id: string | null | undefined,
): ScriptRef | null {
  const key = id?.trim() ?? "";
  if (!key) return null;
  const script = scripts?.[key];
  if (script) return { kind: "script", script };
  const scene = scenes?.[key];
  if (scene) return { kind: "dialogue", scene };
  return null;
}

export type DialoguePlaythrough = {
  id: string;
  use: EmberDialogueUse;
  lines: string[];
  choices: Array<{ id: string; labelRu: string }>;
  picked: string | null;
  flags: Record<string, EmberFlagValue>;
};

export function playDialogueHeadless(
  scene: EmberScene,
  opts?: { pickFirstChoice?: boolean },
): DialoguePlaythrough {
  const pickFirst = opts?.pickFirstChoice !== false;
  const byId = new Map(scene.steps.map((step) => [step.id, step]));
  const lines: string[] = [];
  const choices: Array<{ id: string; labelRu: string }> = [];
  const flags: Record<string, EmberFlagValue> = {};
  let picked: string | null = null;
  let stepId: string | undefined = scene.startStepId;
  const seen = new Set<string>();
  while (stepId && !seen.has(stepId)) {
    seen.add(stepId);
    const step: SceneStep | undefined = byId.get(stepId);
    if (!step) break;
    switch (step.type) {
      case "dialogue":
        if (step.textRu.trim()) lines.push(step.textRu.trim());
        stepId = step.next;
        break;
      case "splash":
        if (step.captionRu?.trim()) lines.push(step.captionRu.trim());
        stepId = step.next;
        break;
      case "choice":
        for (const option of step.options) {
          choices.push({ id: option.id, labelRu: option.labelRu });
        }
        if (pickFirst && step.options[0]) {
          const option = step.options[0];
          picked = option.id;
          if (option.setFlags) Object.assign(flags, option.setFlags);
          stepId = option.next;
        } else {
          stepId = undefined;
        }
        break;
      case "set_flag":
        flags[step.flag] = step.value;
        stepId = step.next;
        break;
      case "grant_cinders":
        stepId = step.next;
        break;
      case "end":
        stepId = undefined;
        break;
      default: {
        const _never: never = step;
        void _never;
        stepId = undefined;
      }
    }
  }
  return {
    id: scene.id,
    use: dialogueUseOf(scene),
    lines,
    choices,
    picked,
    flags,
  };
}

export type ScriptRunResult = {
  flags: Record<string, EmberFlagValue>;
  inventory: Record<string, number>;
  dialogues: DialoguePlaythrough[];
  openedShopId: string | null;
  changeMap: { targetMapId: string; targetRegionId: string | null } | null;
  log: EmberScriptStep["type"][];
};

export type ScriptRunLibs = {
  scripts?: Record<string, EmberActionScript>;
  scenes?: Record<string, EmberScene>;
  items?: Record<string, EmberItemDef>;
};

export function runActionScriptSync(
  script: EmberActionScript,
  libs: ScriptRunLibs,
  state?: {
    flags?: Record<string, EmberFlagValue>;
    inventory?: Record<string, number>;
  },
  depth = 0,
): ScriptRunResult {
  const flags = { ...(state?.flags ?? {}) };
  let inventory = { ...(state?.inventory ?? {}) };
  const dialogues: DialoguePlaythrough[] = [];
  let openedShopId: string | null = null;
  let changeMap: ScriptRunResult["changeMap"] = null;
  const log: EmberScriptStep["type"][] = [];
  if (depth > SCRIPT_RECURSE_MAX) {
    return { flags, inventory, dialogues, openedShopId, changeMap, log };
  }
  for (const step of script.steps) {
    log.push(step.type);
    switch (step.type) {
      case "talk": {
        const scene = libs.scenes?.[step.dialogueId];
        if (!scene) break;
        const play = playDialogueHeadless(scene);
        dialogues.push(play);
        Object.assign(flags, play.flags);
        break;
      }
      case "change_map":
        changeMap = {
          targetMapId: step.targetMapId,
          targetRegionId: step.targetRegionId ?? null,
        };
        break;
      case "open_shop":
        openedShopId = step.shopId;
        break;
      case "give_item": {
        const repeats = Math.max(1, step.count ?? 1);
        const loot = Array.from({ length: repeats }, () => step.itemId);
        inventory = grantItemCounts(inventory, loot, libs.items);
        break;
      }
      case "set_flag":
        flags[step.flag] = step.value;
        break;
      case "wait":
        break;
      case "run_script": {
        const nested = libs.scripts?.[step.scriptId];
        if (!nested) break;
        const inner = runActionScriptSync(
          nested,
          libs,
          { flags, inventory },
          depth + 1,
        );
        Object.assign(flags, inner.flags);
        inventory = inner.inventory;
        dialogues.push(...inner.dialogues);
        log.push(...inner.log);
        if (inner.openedShopId) openedShopId = inner.openedShopId;
        if (inner.changeMap) changeMap = inner.changeMap;
        break;
      }
      default: {
        const _never: never = step;
        void _never;
      }
    }
  }
  return { flags, inventory, dialogues, openedShopId, changeMap, log };
}

export function runScriptRefSync(
  ref: ScriptRef,
  libs: ScriptRunLibs,
  state?: {
    flags?: Record<string, EmberFlagValue>;
    inventory?: Record<string, number>;
  },
): ScriptRunResult {
  switch (ref.kind) {
    case "script":
      return runActionScriptSync(ref.script, libs, state);
    case "dialogue": {
      const play = playDialogueHeadless(ref.scene);
      return {
        flags: { ...(state?.flags ?? {}), ...play.flags },
        inventory: { ...(state?.inventory ?? {}) },
        dialogues: [play],
        openedShopId: null,
        changeMap: null,
        log: ["talk"],
      };
    }
    default: {
      const _never: never = ref;
      return _never;
    }
  }
}

export function resolveQuestMarkerStatus(
  modifier: EmberInteractivityModifier,
  flags?: Record<string, EmberFlagValue>,
): EmberQuestMarkerStatus {
  const authored = modifier.questStatus;
  const fromFlag = flags?.[modifier.scriptId ?? ""];
  if (isEmberQuestMarkerStatus(fromFlag)) return fromFlag;
  if (fromFlag === true) return "done";
  if (isEmberQuestMarkerStatus(authored)) return authored;
  return "available";
}

export function resolveQuestMarkerIconId(
  modifier: EmberInteractivityModifier,
  icons?: Record<string, EmberItemIcon>,
  flags?: Record<string, EmberFlagValue>,
): string {
  const status = resolveQuestMarkerStatus(modifier, flags);
  const authored = modifier.iconId?.trim() ?? "";
  if (authored && authored !== "quest" && icons?.[authored]) return authored;
  if (authored === "quest" && icons?.quest_available) {
    return "quest_available";
  }
  if (authored === "quest" && icons?.quest) return "quest";
  const byStatus = DEFAULT_QUEST_ICON_BY_STATUS[status];
  if (icons?.[byStatus]) return byStatus;
  if (authored) return authored;
  return byStatus;
}

export type QuestMarkerState = {
  objectId: string;
  source: "voxel" | "sprite";
  status: EmberQuestMarkerStatus;
  iconId: string;
};

export function listQuestMarkerStates(
  map: EmberMap,
  icons?: Record<string, EmberItemIcon>,
  flags?: Record<string, EmberFlagValue>,
): QuestMarkerState[] {
  const out: QuestMarkerState[] = [];
  for (const place of map.voxelProps ?? []) {
    const interactivity = place.interactivity;
    if (!interactivity || interactivity.kind !== "quest_marker") continue;
    out.push({
      objectId: place.id,
      source: "voxel",
      status: resolveQuestMarkerStatus(interactivity, flags),
      iconId: resolveQuestMarkerIconId(interactivity, icons, flags),
    });
  }
  for (const place of map.sprites ?? []) {
    const interactivity = place.interactivity;
    if (!interactivity || interactivity.kind !== "quest_marker") continue;
    out.push({
      objectId: place.id,
      source: "sprite",
      status: resolveQuestMarkerStatus(interactivity, flags),
      iconId: resolveQuestMarkerIconId(interactivity, icons, flags),
    });
  }
  return out;
}

export function listAssignableScriptOptions(
  scenes: Record<string, EmberScene> | undefined,
  scripts: Record<string, EmberActionScript> | undefined,
): Array<{ value: string; label: string }> {
  const out: Array<{ value: string; label: string }> = [];
  for (const scene of Object.values(scenes ?? {})) {
    const use = dialogueUseOf(scene);
    const tag =
      use === "talk" ? "болтовня" : use === "shop_intro" ? "лавка" : "сцена";
    out.push({
      value: scene.id,
      label: `${scene.nameRu} · ${tag} (${scene.id})`,
    });
  }
  for (const script of Object.values(scripts ?? {})) {
    out.push({
      value: script.id,
      label: `${script.nameRu} · цепочка (${script.id})`,
    });
  }
  return out.sort((a, b) => a.label.localeCompare(b.label, "ru"));
}
