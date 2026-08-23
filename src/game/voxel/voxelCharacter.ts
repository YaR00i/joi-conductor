/**
 * Voxel character scenes: chibi template, slots, capsule vs visual height.
 * Reuses EmberVoxelScene objects/joints/clips — not a second asset type.
 */
import type {
  EmberChibi32Slot,
  EmberCharacterCardView,
  EmberCharacterFacing,
  EmberVoxelAnimClip,
  EmberVoxelCharacterDef,
  EmberVoxelCharacterTemplate,
  EmberVoxelModel,
  EmberVoxelScene,
  EmberVoxelSceneJoint,
  EmberVoxelSceneObject,
} from "../content/types";
import {
  EMBER_CHARACTER_CARD_VIEWS,
  EMBER_CHARACTER_CLIP_ROLES,
  EMBER_CHIBI32_SLOTS,
  EMBER_VOXEL_CHARACTER_TEMPLATES,
} from "../content/types";
import { DEFAULT_VOXEL_PALETTE, VOXELS_PER_BLOCK } from "./constants";
import {
  createEmptyVoxelModel,
  voxelIndex,
} from "./voxelModel";

export const CHIBI32_VISUAL_HEIGHT_VOXELS = 32;
export const CHIBI32_BODY_HEIGHT_VOXELS = 22;
export const CHIBI32_BODY_RADIUS_VOXELS = 4.5;
export const CHIBI32_GRID = VOXELS_PER_BLOCK;
export const CHIBI_TEMPLATE_LABEL_RU: Record<
  EmberVoxelCharacterTemplate,
  string
> = {
  chibi_32: "объём",
  chibi_25d: "2.5D",
};

/** Play camera yaws 360°; a 1-voxel card vanishes in profile. */
export const CHIBI25D_SLAB_DEPTH = 3;
export const CHIBI32_CAPSULE_X = CHIBI32_GRID / 2;
export const CHIBI32_CAPSULE_Z = CHIBI32_GRID / 2;

export const CHIBI32_REQUIRED_SLOTS: readonly EmberChibi32Slot[] = [
  "pelvis",
  "torso",
  "head",
  "arm_l",
  "arm_r",
  "leg_l",
  "leg_r",
];

export const CHIBI32_DECOR_SLOTS: readonly EmberChibi32Slot[] = [
  "hair",
  "twin_l",
  "twin_r",
  "ears",
];

export const CHIBI32_SLOT_LABEL_RU: Record<EmberChibi32Slot, string> = {
  pelvis: "Таз",
  torso: "Торс",
  head: "Голова",
  arm_l: "Рука Л",
  arm_r: "Рука П",
  leg_l: "Нога Л",
  leg_r: "Нога П",
  hair: "Волосы",
  twin_l: "Хвост Л",
  twin_r: "Хвост П",
  ears: "Ушки",
};

const CHIBI_PALETTE = [
  "",
  "#e8c8b0",
  "#7ec8f0",
  "#f4f0ea",
  "#3a6aaa",
  "#2a4060",
  "#c04040",
  ...DEFAULT_VOXEL_PALETTE.slice(7),
];

const PI = {
  skin: 1,
  hair: 2,
  cloth: 3,
  clothDark: 4,
  dark: 5,
  accent: 6,
} as const;

type Vec3 = { x: number; y: number; z: number };

export type VoxelCharacterBuild = {
  scene: EmberVoxelScene;
  models: Record<string, EmberVoxelModel>;
};

function isTemplateId(raw: unknown): raw is EmberVoxelCharacterTemplate {
  return (
    typeof raw === "string" &&
    (EMBER_VOXEL_CHARACTER_TEMPLATES as readonly string[]).includes(raw)
  );
}

function isSlotName(raw: string): raw is EmberChibi32Slot {
  return (EMBER_CHIBI32_SLOTS as readonly string[]).includes(raw);
}

export function isCharacterScene(
  scene: EmberVoxelScene | null | undefined,
): boolean {
  return scene?.role === "character" || scene?.character != null;
}

function isFacing(raw: unknown): raw is EmberCharacterFacing {
  return raw === "volume" || raw === "card4";
}

function isCardView(raw: string): raw is EmberCharacterCardView {
  return (EMBER_CHARACTER_CARD_VIEWS as readonly string[]).includes(raw);
}

export function normalizeVoxelCharacterDef(
  raw: unknown,
): EmberVoxelCharacterDef | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const rec = raw as Partial<EmberVoxelCharacterDef> & {
    templateId?: unknown;
  };
  const templateId = isTemplateId(rec.templateId) ? rec.templateId : "chibi_32";
  const slots: EmberVoxelCharacterDef["slots"] = {};
  for (const [key, value] of Object.entries(rec.slots ?? {})) {
    if (!isSlotName(key) || typeof value !== "string" || !value) continue;
    slots[key] = value;
  }
  const sockets: EmberVoxelCharacterDef["sockets"] = {};
  for (const [key, value] of Object.entries(rec.sockets ?? {})) {
    if (typeof value !== "string" || !value) continue;
    if (key === "hand_r" || key === "hat" || key === "pet") {
      sockets[key] = value;
    }
  }
  const clips: EmberVoxelCharacterDef["clips"] = {};
  for (const role of EMBER_CHARACTER_CLIP_ROLES) {
    const id = rec.clips?.[role];
    if (typeof id === "string" && id) clips[role] = id;
  }
  const bodyHeightVoxels = Number.isFinite(rec.bodyHeightVoxels)
    ? Math.max(8, Math.min(64, Math.round(rec.bodyHeightVoxels as number)))
    : CHIBI32_BODY_HEIGHT_VOXELS;
  const bodyRadiusVoxels = Number.isFinite(rec.bodyRadiusVoxels)
    ? Math.max(1.5, Math.min(12, Number(rec.bodyRadiusVoxels)))
    : CHIBI32_BODY_RADIUS_VOXELS;
  const facing: EmberCharacterFacing | undefined = isFacing(rec.facing)
    ? rec.facing
    : templateId === "chibi_25d"
      ? "card4"
      : "volume";
  const views: EmberVoxelCharacterDef["views"] = {};
  if (rec.views && typeof rec.views === "object") {
    for (const [viewKey, slotMap] of Object.entries(rec.views)) {
      if (!isCardView(viewKey) || !slotMap || typeof slotMap !== "object") {
        continue;
      }
      const next: Partial<Record<EmberChibi32Slot, string>> = {};
      for (const [slot, modelId] of Object.entries(slotMap)) {
        if (!isSlotName(slot) || typeof modelId !== "string" || !modelId) {
          continue;
        }
        next[slot] = modelId;
      }
      if (Object.keys(next).length) views[viewKey] = next;
    }
  }
  return {
    templateId,
    bodyHeightVoxels,
    bodyRadiusVoxels,
    facing,
    slots,
    views: Object.keys(views).length ? views : undefined,
    sockets: Object.keys(sockets).length ? sockets : undefined,
    clips: Object.keys(clips).length ? clips : undefined,
  };
}

export function characterModelIdForSlotView(
  scene: EmberVoxelScene,
  slot: EmberChibi32Slot,
  view: EmberCharacterCardView,
): string | undefined {
  const ch = scene.character;
  if (!ch) return undefined;
  if (ch.facing === "card4" && view !== "front") {
    const override = ch.views?.[view]?.[slot];
    if (override) return override;
  }
  const objectId = ch.slots?.[slot];
  if (!objectId) return undefined;
  return scene.objects.find((o) => o.id === objectId)?.modelId;
}

export function characterObjectIdForSlot(
  scene: EmberVoxelScene,
  slot: EmberChibi32Slot,
): string | undefined {
  return scene.character?.slots?.[slot];
}

export function characterSlotForObject(
  scene: EmberVoxelScene,
  objectId: string,
): EmberChibi32Slot | undefined {
  const slots = scene.character?.slots;
  if (!slots) return undefined;
  for (const slot of EMBER_CHIBI32_SLOTS) {
    if (slots[slot] === objectId) return slot;
  }
  return undefined;
}

export function isLockedCharacterObject(
  scene: EmberVoxelScene,
  objectId: string,
): boolean {
  return characterSlotForObject(scene, objectId) != null;
}

export function characterCapsule(
  scene: EmberVoxelScene | null | undefined,
): { radius: number; height: number } {
  const ch = scene?.character;
  return {
    radius: ch?.bodyRadiusVoxels ?? CHIBI32_BODY_RADIUS_VOXELS,
    height: ch?.bodyHeightVoxels ?? CHIBI32_BODY_HEIGHT_VOXELS,
  };
}

/** Capsule group origin (center) relative to the active object. */
export function characterCapsuleCenterRelativeTo(
  scene: EmberVoxelScene,
  activeOffset: Vec3,
): Vec3 {
  const { height } = characterCapsule(scene);
  return {
    x: CHIBI32_CAPSULE_X - activeOffset.x,
    y: height * 0.5 - activeOffset.y,
    z: CHIBI32_CAPSULE_Z - activeOffset.z,
  };
}

function fillBox(
  model: EmberVoxelModel,
  x0: number,
  y0: number,
  z0: number,
  sx: number,
  sy: number,
  sz: number,
  paletteIndex: number,
): EmberVoxelModel {
  const voxels = [...model.voxels];
  const emissive = [...(model.emissive ?? model.voxels.map(() => 0))];
  const shine = [...(model.shine ?? model.voxels.map(() => 0))];
  const transparency = [...(model.transparency ?? model.voxels.map(() => 0))];
  const transmittance = [
    ...(model.transmittance ?? model.voxels.map(() => 0)),
  ];
  const x1 = x0 + sx;
  const y1 = y0 + sy;
  const z1 = z0 + sz;
  const pi = Math.max(1, Math.min(model.palette.length - 1, paletteIndex));
  for (let y = y0; y < y1; y++) {
    for (let z = z0; z < z1; z++) {
      for (let x = x0; x < x1; x++) {
        const i = voxelIndex(model, x, y, z);
        if (i < 0) continue;
        voxels[i] = pi;
        emissive[i] = 0;
        shine[i] = 0;
        transparency[i] = 0;
        transmittance[i] = 0;
      }
    }
  }
  return { ...model, voxels, emissive, shine, transparency, transmittance };
}

function setCell(
  model: EmberVoxelModel,
  x: number,
  y: number,
  z: number,
  paletteIndex: number,
): EmberVoxelModel {
  const i = voxelIndex(model, x, y, z);
  if (i < 0) return model;
  const voxels = [...model.voxels];
  voxels[i] = paletteIndex;
  return { ...model, voxels };
}

function hingePivots(
  parentOff: Vec3,
  childOff: Vec3,
  childPivot: Vec3,
): { parentPivot: Vec3; childPivot: Vec3 } {
  return {
    childPivot,
    parentPivot: {
      x: childOff.x - parentOff.x + childPivot.x,
      y: childOff.y - parentOff.y + childPivot.y,
      z: childOff.z - parentOff.z + childPivot.z,
    },
  };
}

function partModel(
  id: string,
  nameRu: string,
  heightVoxels: number,
  physical: boolean,
  material: EmberVoxelModel["material"],
  palette: readonly string[] = CHIBI_PALETTE,
): EmberVoxelModel {
  const empty = createEmptyVoxelModel(
    id,
    { x: 1, y: 1, z: 1 },
    nameRu,
    heightVoxels,
  );
  return {
    ...empty,
    palette: [...palette],
    tags: ["character", "chibi"],
    physical,
    material,
  };
}

export function newVoxelCharacterId(): string {
  return `vox_chr_${Date.now().toString(36)}`;
}

function walkClip(id: string, joints: Record<string, string>): EmberVoxelAnimClip {
  const swing = (jointId: string, sign: number) => ({
    jointId,
    keys: [
      { t: 0, angleDeg: 0 },
      { t: 0.25, angleDeg: 18 * sign },
      { t: 0.5, angleDeg: 0 },
      { t: 0.75, angleDeg: -18 * sign },
      { t: 1, angleDeg: 0 },
    ],
  });
  return {
    id,
    nameRu: "Ходьба",
    durationSec: 0.8,
    tracks: [
      swing(joints.leg_l, 1),
      swing(joints.leg_r, -1),
      swing(joints.arm_l, -1),
      swing(joints.arm_r, 1),
    ],
  };
}

export function createChibi32Character(
  baseId: string,
  nameRu: string,
): VoxelCharacterBuild {
  const origin: Vec3 = { x: 0, y: 0, z: 0 };
  const off = {
    pelvis: { x: 0, y: 12, z: 0 },
    torso: { x: 0, y: 16, z: 0 },
    head: { x: 0, y: 20, z: 0 },
    arm_l: { x: 0, y: 14, z: 0 },
    arm_r: { x: 0, y: 14, z: 0 },
    leg_l: origin,
    leg_r: origin,
    hair: { x: 0, y: 28, z: 0 },
    twin_l: { x: 0, y: 10, z: 0 },
    twin_r: { x: 0, y: 10, z: 0 },
    ears: { x: 0, y: 31, z: 0 },
  } as const;

  const models: Record<string, EmberVoxelModel> = {};
  const objects: EmberVoxelSceneObject[] = [];
  const slots: EmberVoxelCharacterDef["slots"] = {};
  const jointIds: Record<string, string> = {};

  const addPart = (
    slot: EmberChibi32Slot,
    height: number,
    physical: boolean,
    material: EmberVoxelModel["material"],
    paint: (model: EmberVoxelModel) => EmberVoxelModel,
  ) => {
    const modelId = `${baseId}_${slot}`;
    const objectId = `obj_${slot}`;
    const model = paint(
      partModel(modelId, CHIBI32_SLOT_LABEL_RU[slot], height, physical, material),
    );
    models[modelId] = model;
    objects.push({
      id: objectId,
      nameRu: CHIBI32_SLOT_LABEL_RU[slot],
      modelId,
      offset: { ...off[slot] },
      visible: true,
    });
    slots[slot] = objectId;
    return { modelId, objectId };
  };

  addPart("pelvis", 4, true, "cloth", (m) =>
    fillBox(m, 5, 0, 5, 6, 4, 5, PI.clothDark),
  );
  addPart("torso", 8, true, "cloth", (m) => {
    let next = fillBox(m, 4, 0, 5, 8, 8, 6, PI.cloth);
    next = fillBox(next, 4, 0, 5, 8, 2, 6, PI.clothDark);
    return next;
  });
  addPart("head", 12, true, "cloth", (m) => {
    let next = fillBox(m, 2, 0, 2, 12, 12, 12, PI.skin);
    next = fillBox(next, 2, 9, 2, 12, 3, 12, PI.hair);
    next = setCell(next, 5, 8, 13, PI.dark);
    next = setCell(next, 10, 8, 13, PI.dark);
    return next;
  });
  addPart("arm_l", 10, true, "cloth", (m) => {
    let next = fillBox(m, 1, 2, 6, 3, 8, 3, PI.cloth);
    next = fillBox(next, 1, 0, 6, 3, 2, 3, PI.skin);
    return next;
  });
  addPart("arm_r", 10, true, "cloth", (m) => {
    let next = fillBox(m, 12, 2, 6, 3, 8, 3, PI.cloth);
    next = fillBox(next, 12, 0, 6, 3, 2, 3, PI.skin);
    return next;
  });
  addPart("leg_l", 12, true, "cloth", (m) => {
    let next = fillBox(m, 4, 4, 6, 4, 8, 4, PI.skin);
    next = fillBox(next, 4, 0, 6, 4, 4, 4, PI.dark);
    return next;
  });
  addPart("leg_r", 12, true, "cloth", (m) => {
    let next = fillBox(m, 8, 4, 6, 4, 8, 4, PI.skin);
    next = fillBox(next, 8, 0, 6, 4, 4, 4, PI.dark);
    return next;
  });
  addPart("hair", 6, false, "cloth", (m) => fillBox(m, 2, 0, 2, 12, 6, 12, PI.hair));
  addPart("twin_l", 18, false, "cloth", (m) =>
    fillBox(m, 1, 0, 2, 3, 18, 3, PI.hair),
  );
  addPart("twin_r", 18, false, "cloth", (m) =>
    fillBox(m, 12, 0, 2, 3, 18, 3, PI.hair),
  );
  addPart("ears", 4, false, "cloth", (m) => {
    let next = fillBox(m, 3, 0, 6, 3, 3, 3, PI.cloth);
    next = fillBox(next, 10, 0, 6, 3, 3, 3, PI.cloth);
    return next;
  });

  const joint = (
    id: string,
    nameRu: string,
    parentSlot: EmberChibi32Slot,
    childSlot: EmberChibi32Slot,
    axis: EmberVoxelSceneJoint["axis"],
    childPivot: Vec3,
  ): EmberVoxelSceneJoint => {
    const pivots = hingePivots(off[parentSlot], off[childSlot], childPivot);
    jointIds[childSlot] = id;
    return {
      id,
      nameRu,
      parentObjectId: `obj_${parentSlot}`,
      childObjectId: `obj_${childSlot}`,
      parentPivot: pivots.parentPivot,
      childPivot: pivots.childPivot,
      axis,
    };
  };

  const joints: EmberVoxelSceneJoint[] = [
    joint("jnt_torso", "Пояс", "pelvis", "torso", "x", { x: 8, y: 0, z: 8 }),
    joint("jnt_head", "Шея", "torso", "head", "y", { x: 8, y: 0, z: 8 }),
    joint("jnt_arm_l", "Плечо Л", "torso", "arm_l", "x", { x: 4, y: 10, z: 7 }),
    joint("jnt_arm_r", "Плечо П", "torso", "arm_r", "x", { x: 12, y: 10, z: 7 }),
    joint("jnt_leg_l", "Бедро Л", "pelvis", "leg_l", "x", { x: 6, y: 12, z: 8 }),
    joint("jnt_leg_r", "Бедро П", "pelvis", "leg_r", "x", { x: 10, y: 12, z: 8 }),
    joint("jnt_hair", "Волосы", "head", "hair", "y", { x: 8, y: 0, z: 8 }),
    joint("jnt_twin_l", "Хвост Л", "hair", "twin_l", "x", { x: 2, y: 18, z: 3 }),
    joint("jnt_twin_r", "Хвост П", "hair", "twin_r", "x", { x: 13, y: 18, z: 3 }),
    joint("jnt_ears", "Ушки", "head", "ears", "y", { x: 8, y: 0, z: 8 }),
  ];

  const idle: EmberVoxelAnimClip = {
    id: "clip_idle",
    nameRu: "Стойка",
    durationSec: 1.2,
    tracks: [],
  };
  const walk = walkClip("clip_walk", jointIds);

  const character: EmberVoxelCharacterDef = {
    templateId: "chibi_32",
    bodyHeightVoxels: CHIBI32_BODY_HEIGHT_VOXELS,
    bodyRadiusVoxels: CHIBI32_BODY_RADIUS_VOXELS,
    slots,
    clips: { idle: idle.id, walk: walk.id },
  };

  const scene: EmberVoxelScene = {
    id: baseId,
    nameRu,
    objects,
    joints,
    animations: [idle, walk],
    role: "character",
    character,
  };

  return { scene, models };
}

const CHIBI_25D_PALETTE = [
  "",
  "#f0c8a8",
  "#f07828",
  "#c05018",
  "#2a9aaa",
  "#2a2030",
  "#1a1820",
  "#e87898",
  "#3cb8b0",
  "#f4f0ea",
];

const P25 = {
  skin: 1,
  hair: 2,
  hairDark: 3,
  eye: 4,
  dark: 5,
  dress: 6,
  pink: 7,
  teal: 8,
  white: 9,
} as const;

/**
 * Sprite-front chibi: 3-voxel body card facing +Z, volume on hair / nose / skirt.
 * Play explore yaws around the player — 1-voxel depth would read as a thread.
 */
export function createChibi25dCharacter(
  baseId: string,
  nameRu: string,
): VoxelCharacterBuild {
  const origin: Vec3 = { x: 0, y: 0, z: 0 };
  const off = {
    pelvis: { x: 0, y: 12, z: 0 },
    torso: { x: 0, y: 16, z: 0 },
    head: { x: 0, y: 20, z: 0 },
    arm_l: { x: 0, y: 14, z: 0 },
    arm_r: { x: 0, y: 14, z: 0 },
    leg_l: origin,
    leg_r: origin,
    hair: { x: 0, y: 28, z: 0 },
    twin_l: { x: 0, y: 10, z: 0 },
    twin_r: { x: 0, y: 10, z: 0 },
    ears: { x: 0, y: 31, z: 0 },
  } as const;

  const models: Record<string, EmberVoxelModel> = {};
  const objects: EmberVoxelSceneObject[] = [];
  const slots: EmberVoxelCharacterDef["slots"] = {};
  const jointIds: Record<string, string> = {};

  const addPart = (
    slot: EmberChibi32Slot,
    height: number,
    physical: boolean,
    material: EmberVoxelModel["material"],
    paint: (model: EmberVoxelModel) => EmberVoxelModel,
  ) => {
    const modelId = `${baseId}_${slot}`;
    const objectId = `obj_${slot}`;
    const model = paint(
      partModel(
        modelId,
        CHIBI32_SLOT_LABEL_RU[slot],
        height,
        physical,
        material,
        CHIBI_25D_PALETTE,
      ),
    );
    models[modelId] = model;
    objects.push({
      id: objectId,
      nameRu: CHIBI32_SLOT_LABEL_RU[slot],
      modelId,
      offset: { ...off[slot] },
      visible: true,
    });
    slots[slot] = objectId;
    return { modelId, objectId };
  };

  // Front is +Z (sculpt iso SE + play 3/4). Card lives in z=7..9.
  addPart("pelvis", 4, true, "cloth", (m) =>
    fillBox(m, 4, 0, 7, 8, 4, 3, P25.dress),
  );
  addPart("torso", 8, true, "cloth", (m) => {
    let next = fillBox(m, 4, 2, 7, 8, 6, 3, P25.dress);
    next = fillBox(next, 3, 0, 6, 10, 3, 5, P25.dress);
    next = fillBox(next, 3, 0, 6, 10, 1, 5, P25.teal);
    next = fillBox(next, 4, 4, 7, 8, 1, 3, P25.pink);
    next = fillBox(next, 7, 0, 10, 2, 5, 1, P25.pink);
    return next;
  });
  addPart("head", 12, true, "cloth", (m) => {
    let next = fillBox(m, 3, 0, 7, 10, 10, 3, P25.skin);
    next = fillBox(next, 3, 8, 6, 10, 4, 5, P25.hair);
    next = fillBox(next, 3, 7, 9, 10, 2, 2, P25.hair);
    next = fillBox(next, 3, 8, 6, 10, 2, 1, P25.hairDark);
    next = setCell(next, 5, 5, 9, P25.eye);
    next = setCell(next, 5, 6, 9, P25.eye);
    next = setCell(next, 10, 5, 9, P25.eye);
    next = setCell(next, 10, 6, 9, P25.eye);
    next = setCell(next, 5, 6, 10, P25.white);
    next = setCell(next, 10, 6, 10, P25.white);
    next = setCell(next, 7, 4, 10, P25.skin);
    next = setCell(next, 8, 4, 10, P25.skin);
    next = setCell(next, 7, 3, 9, P25.dark);
    next = setCell(next, 8, 3, 9, P25.dark);
    return next;
  });
  addPart("arm_l", 10, true, "cloth", (m) => {
    let next = fillBox(m, 2, 2, 7, 2, 8, 3, P25.dress);
    next = fillBox(next, 2, 0, 7, 2, 2, 3, P25.skin);
    return next;
  });
  addPart("arm_r", 10, true, "cloth", (m) => {
    let next = fillBox(m, 12, 2, 7, 2, 8, 3, P25.dress);
    next = fillBox(next, 12, 0, 7, 2, 2, 3, P25.skin);
    return next;
  });
  addPart("leg_l", 12, true, "cloth", (m) => {
    let next = fillBox(m, 5, 3, 7, 3, 9, 3, P25.skin);
    next = fillBox(next, 5, 0, 7, 3, 3, 3, P25.teal);
    return next;
  });
  addPart("leg_r", 12, true, "cloth", (m) => {
    let next = fillBox(m, 8, 3, 7, 3, 9, 3, P25.skin);
    next = fillBox(next, 8, 0, 7, 3, 3, 3, P25.teal);
    return next;
  });
  addPart("hair", 6, false, "cloth", (m) => {
    let next = fillBox(m, 3, 0, 5, 10, 6, 6, P25.hair);
    next = fillBox(next, 4, 2, 4, 8, 4, 2, P25.hairDark);
    return next;
  });
  addPart("twin_l", 18, false, "cloth", (m) => {
    let next = m;
    for (let y = 0; y < 18; y++) {
      const wave = Math.floor(y / 3) % 2;
      next = fillBox(next, 1 + wave, y, 5, 2, 1, 4, P25.hair);
    }
    return next;
  });
  addPart("twin_r", 18, false, "cloth", (m) => {
    let next = m;
    for (let y = 0; y < 18; y++) {
      const wave = Math.floor(y / 3) % 2;
      next = fillBox(next, 12 - wave, y, 5, 2, 1, 4, P25.hair);
    }
    return next;
  });
  addPart("ears", 4, false, "cloth", (m) => {
    let next = fillBox(m, 2, 0, 8, 2, 3, 2, P25.hair);
    next = fillBox(next, 12, 0, 8, 2, 3, 2, P25.hair);
    next = setCell(next, 2, 1, 9, P25.pink);
    next = setCell(next, 13, 1, 9, P25.pink);
    return next;
  });

  const viewModel = (
    slot: EmberChibi32Slot,
    view: EmberCharacterCardView,
    height: number,
    physical: boolean,
    paint: (model: EmberVoxelModel) => EmberVoxelModel,
  ): string => {
    const modelId = `${baseId}_${slot}__${view}`;
    models[modelId] = paint(
      partModel(
        modelId,
        `${CHIBI32_SLOT_LABEL_RU[slot]} · ${view}`,
        height,
        physical,
        "cloth",
        CHIBI_25D_PALETTE,
      ),
    );
    return modelId;
  };

  const xFlip = (x: number, sx = 1) => 16 - x - sx;
  const paintHeadBack = (m: EmberVoxelModel) => {
    let next = fillBox(m, 3, 0, 7, 10, 10, 3, P25.hair);
    next = fillBox(next, 3, 0, 6, 10, 5, 2, P25.hairDark);
    next = fillBox(next, 4, 3, 9, 8, 6, 2, P25.hair);
    return next;
  };
  const paintHeadProfile = (flip: boolean) => (m: EmberVoxelModel) => {
    const x = (v: number, s = 1) => (flip ? xFlip(v, s) : v);
    let next = fillBox(m, x(5, 7), 0, 7, 7, 10, 3, P25.skin);
    next = fillBox(next, x(4, 8), 6, 6, 8, 6, 5, P25.hair);
    next = setCell(next, x(10), 5, 9, P25.eye);
    next = setCell(next, x(10), 6, 9, P25.eye);
    next = setCell(next, x(10), 6, 10, P25.white);
    next = setCell(next, x(11), 4, 10, P25.skin);
    next = setCell(next, x(9), 3, 9, P25.dark);
    return next;
  };
  const paintHairBack = (m: EmberVoxelModel) => {
    let next = fillBox(m, 3, 0, 5, 10, 6, 6, P25.hair);
    next = fillBox(next, 4, 0, 4, 8, 5, 3, P25.hairDark);
    return next;
  };
  const paintHairProfile = (flip: boolean) => (m: EmberVoxelModel) => {
    const x = (v: number, s = 1) => (flip ? xFlip(v, s) : v);
    return fillBox(m, x(4, 8), 0, 5, 8, 6, 6, P25.hair);
  };
  const paintEarsBack = (m: EmberVoxelModel) => {
    let next = fillBox(m, 2, 0, 7, 2, 3, 3, P25.hair);
    next = fillBox(next, 12, 0, 7, 2, 3, 3, P25.hair);
    return next;
  };
  const paintEarsProfile = (flip: boolean) => (m: EmberVoxelModel) => {
    const x = (v: number, s = 1) => (flip ? xFlip(v, s) : v);
    return fillBox(m, x(12, 2), 0, 8, 2, 3, 2, P25.hair);
  };

  const views: EmberVoxelCharacterDef["views"] = {
    back: {
      head: viewModel("head", "back", 12, true, paintHeadBack),
      hair: viewModel("hair", "back", 6, false, paintHairBack),
      ears: viewModel("ears", "back", 4, false, paintEarsBack),
    },
    side_l: {
      head: viewModel("head", "side_l", 12, true, paintHeadProfile(true)),
      hair: viewModel("hair", "side_l", 6, false, paintHairProfile(true)),
      ears: viewModel("ears", "side_l", 4, false, paintEarsProfile(true)),
    },
    side_r: {
      head: viewModel("head", "side_r", 12, true, paintHeadProfile(false)),
      hair: viewModel("hair", "side_r", 6, false, paintHairProfile(false)),
      ears: viewModel("ears", "side_r", 4, false, paintEarsProfile(false)),
    },
  };

  const joint = (
    id: string,
    nameRu: string,
    parentSlot: EmberChibi32Slot,
    childSlot: EmberChibi32Slot,
    axis: EmberVoxelSceneJoint["axis"],
    childPivot: Vec3,
  ): EmberVoxelSceneJoint => {
    const pivots = hingePivots(off[parentSlot], off[childSlot], childPivot);
    jointIds[childSlot] = id;
    return {
      id,
      nameRu,
      parentObjectId: `obj_${parentSlot}`,
      childObjectId: `obj_${childSlot}`,
      parentPivot: pivots.parentPivot,
      childPivot: pivots.childPivot,
      axis,
    };
  };

  const joints: EmberVoxelSceneJoint[] = [
    joint("jnt_torso", "Пояс", "pelvis", "torso", "x", { x: 8, y: 0, z: 8 }),
    joint("jnt_head", "Шея", "torso", "head", "y", { x: 8, y: 0, z: 8 }),
    joint("jnt_arm_l", "Плечо Л", "torso", "arm_l", "x", { x: 4, y: 10, z: 8 }),
    joint("jnt_arm_r", "Плечо П", "torso", "arm_r", "x", { x: 12, y: 10, z: 8 }),
    joint("jnt_leg_l", "Бедро Л", "pelvis", "leg_l", "x", { x: 6, y: 12, z: 8 }),
    joint("jnt_leg_r", "Бедро П", "pelvis", "leg_r", "x", { x: 10, y: 12, z: 8 }),
    joint("jnt_hair", "Волосы", "head", "hair", "y", { x: 8, y: 0, z: 8 }),
    joint("jnt_twin_l", "Хвост Л", "hair", "twin_l", "x", { x: 2, y: 18, z: 6 }),
    joint("jnt_twin_r", "Хвост П", "hair", "twin_r", "x", { x: 13, y: 18, z: 6 }),
    joint("jnt_ears", "Ушки", "head", "ears", "y", { x: 8, y: 0, z: 8 }),
  ];

  const idle: EmberVoxelAnimClip = {
    id: "clip_idle",
    nameRu: "Стойка",
    durationSec: 1.2,
    tracks: [],
  };
  const walk = walkClip("clip_walk", jointIds);

  const character: EmberVoxelCharacterDef = {
    templateId: "chibi_25d",
    bodyHeightVoxels: CHIBI32_BODY_HEIGHT_VOXELS,
    bodyRadiusVoxels: CHIBI32_BODY_RADIUS_VOXELS,
    facing: "card4",
    slots,
    views,
    clips: { idle: idle.id, walk: walk.id },
  };

  const scene: EmberVoxelScene = {
    id: baseId,
    nameRu,
    objects,
    joints,
    animations: [idle, walk],
    role: "character",
    character,
  };

  return { scene, models };
}

export function createVoxelCharacter(
  templateId: EmberVoxelCharacterTemplate,
  baseId: string,
  nameRu: string,
): VoxelCharacterBuild {
  switch (templateId) {
    case "chibi_32":
      return createChibi32Character(baseId, nameRu);
    case "chibi_25d":
      return createChibi25dCharacter(baseId, nameRu);
    default: {
      const _n: never = templateId;
      return _n;
    }
  }
}
