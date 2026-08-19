import type {
  EmberWorldObject,
  EmberWorldObjectComponent,
  EmberWorldValueSource,
} from "./EmberWorldObject";
import { emberWorldObjectComponent } from "./EmberWorldObject";

export type EmberInspectorFieldValue = string | number | boolean | null;

export type EmberInspectorFieldEdit = Readonly<{
  componentType: EmberWorldObjectComponent["type"];
  fieldId: string;
  value: EmberInspectorFieldValue;
}>;

export type EmberInspectorFieldSchema = Readonly<{
  id: string;
  label: string;
  kind: "text" | "number" | "boolean" | "readonly";
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
  hint?: string;
  read(object: EmberWorldObject): EmberInspectorFieldValue;
  editable?: (object: EmberWorldObject) => boolean;
  source?: (object: EmberWorldObject) => EmberWorldValueSource | null;
}>;

export type EmberInspectorComponentSchema = Readonly<{
  type: EmberWorldObjectComponent["type"];
  label: string;
  order: number;
  fields: readonly EmberInspectorFieldSchema[];
}>;

const transformSchema: EmberInspectorComponentSchema = {
  type: "transform",
  label: "Transform",
  order: 0,
  fields: [
    {
      id: "x",
      label: "X",
      kind: "number",
      step: 1,
      read: (object) => object.transform.position.x,
      editable: (object) => object.kind !== "tile",
    },
    {
      id: "y",
      label: "Y",
      kind: "number",
      step: 1,
      read: (object) => object.transform.position.y,
      editable: (object) => object.kind !== "tile",
    },
    {
      id: "z",
      label: "Z",
      kind: "number",
      unit: "ур.",
      step: 1,
      read: (object) => object.transform.resolvedZ,
      editable: (object) => object.kind === "voxel",
      hint: "Высота экземпляра. Для остальных объектов наследуется от поверхности.",
    },
    {
      id: "rotationQuarterTurns",
      label: "Поворот",
      kind: "number",
      unit: "°",
      min: 0,
      max: 270,
      step: 90,
      read: (object) => object.transform.rotationQuarterTurns * 90,
      editable: (object) => object.kind === "voxel",
    },
  ],
};

function componentFieldSource(
  object: EmberWorldObject,
  componentType: "voxel-renderer" | "collider" | "voxel-light",
  fieldId: string,
): EmberWorldValueSource | null {
  const component = emberWorldObjectComponent(object, componentType);
  return (
    component?.fieldSources as Readonly<Record<string, EmberWorldValueSource>>
  )?.[fieldId] ?? null;
}

const schemas: readonly EmberInspectorComponentSchema[] = [
  transformSchema,
  {
    type: "voxel-renderer",
    label: "Voxel Renderer",
    order: 20,
    fields: [
      {
        id: "modelId",
        label: "Модель",
        kind: "readonly",
        read: (object) =>
          emberWorldObjectComponent(object, "voxel-renderer")?.modelId ?? "—",
      },
      {
        id: "directLightScale",
        label: "Прямой свет",
        kind: "number",
        min: 0.05,
        max: 1.5,
        step: 0.05,
        read: (object) =>
          emberWorldObjectComponent(object, "voxel-renderer")
            ?.directLightScale ?? 0.42,
        editable: () => true,
        source: (object) =>
          componentFieldSource(object, "voxel-renderer", "directLightScale"),
      },
    ],
  },
  {
    type: "sprite-renderer",
    label: "Sprite Renderer",
    order: 20,
    fields: [
      {
        id: "spriteId",
        label: "Спрайт",
        kind: "readonly",
        read: (object) =>
          emberWorldObjectComponent(object, "sprite-renderer")?.spriteId ?? "—",
      },
    ],
  },
  {
    type: "block",
    label: "Block",
    order: 20,
    fields: [
      {
        id: "tileId",
        label: "Тайл",
        kind: "readonly",
        read: (object) =>
          emberWorldObjectComponent(object, "block")?.tileId ?? 0,
      },
      {
        id: "heightVoxels",
        label: "Высота",
        kind: "readonly",
        unit: "vx",
        read: (object) =>
          emberWorldObjectComponent(object, "block")?.heightVoxels ?? 0,
      },
    ],
  },
  {
    type: "collider",
    label: "Collider",
    order: 30,
    fields: [
      {
        id: "enabled",
        label: "Включён",
        kind: "boolean",
        read: (object) =>
          emberWorldObjectComponent(object, "collider")?.modifier?.enabled !==
          false,
        editable: (object) =>
          object.kind === "voxel" ||
          object.kind === "sprite" ||
          object.kind === "tile",
        source: (object) => componentFieldSource(object, "collider", "enabled"),
      },
      {
        id: "isTrigger",
        label: "Trigger",
        kind: "boolean",
        read: (object) =>
          emberWorldObjectComponent(object, "collider")?.modifier?.isTrigger ===
          true,
        editable: (object) =>
          object.kind === "voxel" ||
          object.kind === "sprite" ||
          object.kind === "tile",
        source: (object) =>
          componentFieldSource(object, "collider", "isTrigger"),
      },
      {
        id: "walkableTop",
        label: "Проходимый верх",
        kind: "boolean",
        read: (object) =>
          emberWorldObjectComponent(object, "collider")?.modifier
            ?.walkableTop !== false,
        editable: (object) =>
          object.kind === "voxel" ||
          object.kind === "sprite" ||
          object.kind === "tile",
        source: (object) =>
          componentFieldSource(object, "collider", "walkableTop"),
      },
      {
        id: "offsetVoxels",
        label: "Сдвиг Y",
        kind: "number",
        unit: "vx",
        step: 1,
        read: (object) =>
          emberWorldObjectComponent(object, "collider")?.modifier
            ?.offsetVoxels ?? 0,
        editable: (object) =>
          object.kind === "voxel" ||
          object.kind === "sprite" ||
          object.kind === "tile",
        source: (object) =>
          componentFieldSource(object, "collider", "offsetVoxels"),
      },
    ],
  },
  {
    type: "voxel-light",
    label: "Emissive Light",
    order: 40,
    fields: [
      {
        id: "emissiveCastsLight",
        label: "PointLight",
        kind: "boolean",
        read: (object) =>
          emberWorldObjectComponent(object, "voxel-light")?.values
            .emissiveCastsLight ?? false,
        editable: () => true,
        source: (object) =>
          componentFieldSource(object, "voxel-light", "emissiveCastsLight"),
      },
      {
        id: "emissiveLightRange",
        label: "Дальность",
        kind: "number",
        unit: "тайл",
        min: 0.1,
        max: 16,
        step: 0.05,
        read: (object) =>
          emberWorldObjectComponent(object, "voxel-light")?.values
            .emissiveLightRange ?? 0.85,
        editable: () => true,
        source: (object) =>
          componentFieldSource(object, "voxel-light", "emissiveLightRange"),
      },
      {
        id: "emissiveStrength",
        label: "Сила",
        kind: "number",
        min: 0,
        max: 16,
        step: 0.05,
        read: (object) =>
          emberWorldObjectComponent(object, "voxel-light")?.values
            .emissiveStrength ?? 0.75,
        editable: () => true,
        source: (object) =>
          componentFieldSource(object, "voxel-light", "emissiveStrength"),
      },
      {
        id: "emissiveLightShadows",
        label: "Тени PointLight",
        kind: "boolean",
        read: (object) =>
          emberWorldObjectComponent(object, "voxel-light")?.values
            .emissiveLightShadows ?? false,
        editable: () => true,
        source: (object) =>
          componentFieldSource(object, "voxel-light", "emissiveLightShadows"),
      },
      {
        id: "emissiveSuppressHostShadow",
        label: "Рама без теней",
        kind: "boolean",
        read: (object) =>
          emberWorldObjectComponent(object, "voxel-light")?.values
            .emissiveSuppressHostShadow ?? false,
        editable: () => true,
        source: (object) =>
          componentFieldSource(
            object,
            "voxel-light",
            "emissiveSuppressHostShadow",
          ),
      },
      {
        id: "emissiveTorchFlicker",
        label: "Мерцание факела",
        kind: "boolean",
        read: (object) =>
          emberWorldObjectComponent(object, "voxel-light")?.values
            .emissiveTorchFlicker ?? false,
        editable: () => true,
        source: (object) =>
          componentFieldSource(object, "voxel-light", "emissiveTorchFlicker"),
      },
      {
        id: "emissiveLanternFlicker",
        label: "Мерцание фонаря",
        kind: "boolean",
        read: (object) =>
          emberWorldObjectComponent(object, "voxel-light")?.values
            .emissiveLanternFlicker ?? false,
        editable: () => true,
        source: (object) =>
          componentFieldSource(
            object,
            "voxel-light",
            "emissiveLanternFlicker",
          ),
      },
    ],
  },
  {
    type: "light",
    label: "Light",
    order: 40,
    fields: [
      {
        id: "enabled",
        label: "Включён",
        kind: "boolean",
        read: (object) =>
          emberWorldObjectComponent(object, "light")?.source.enabled !== false,
        editable: () => true,
      },
      {
        id: "lampRange",
        label: "Дальность",
        kind: "number",
        unit: "тайл",
        min: 1,
        max: 16,
        step: 0.25,
        read: (object) =>
          emberWorldObjectComponent(object, "light")?.source.lampRange ?? 4,
        editable: () => true,
      },
      {
        id: "lampColor",
        label: "Цвет света",
        kind: "text",
        read: (object) =>
          emberWorldObjectComponent(object, "light")?.source.lampColor ??
          "#ffaa48",
        editable: () => true,
      },
      {
        id: "lampFaceColor",
        label: "Цвет источника",
        kind: "text",
        read: (object) =>
          emberWorldObjectComponent(object, "light")?.source.lampFaceColor ??
          "#ff9030",
        editable: () => true,
      },
      {
        id: "lampHeight",
        label: "Высота",
        kind: "number",
        unit: "блок",
        min: 0.2,
        max: 3,
        step: 0.05,
        read: (object) =>
          emberWorldObjectComponent(object, "light")?.source.lampHeight ?? 1.15,
        editable: () => true,
      },
      {
        id: "lampDiscCore",
        label: "Радиус ядра",
        kind: "number",
        unit: "тайл",
        min: 0,
        max: 16,
        step: 1,
        read: (object) =>
          emberWorldObjectComponent(object, "light")?.source.lampDiscCore ?? 1,
        editable: () => true,
      },
      {
        id: "lampDiscMid",
        label: "Радиус полутени",
        kind: "number",
        unit: "тайл",
        min: 0,
        max: 16,
        step: 1,
        read: (object) =>
          emberWorldObjectComponent(object, "light")?.source.lampDiscMid ?? 2,
        editable: () => true,
      },
      {
        id: "lampStrength0",
        label: "Сила",
        kind: "number",
        min: 0,
        max: 1,
        step: 0.05,
        read: (object) =>
          emberWorldObjectComponent(object, "light")?.source.lampStrength0 ??
          0.62,
        editable: () => true,
      },
      {
        id: "lampStrengthFalloff",
        label: "Ослабление",
        kind: "number",
        min: 0,
        max: 1,
        step: 0.05,
        read: (object) =>
          emberWorldObjectComponent(object, "light")?.source
            .lampStrengthFalloff ?? 0.45,
        editable: () => true,
      },
      {
        id: "lampShowCore",
        label: "Показывать ядро",
        kind: "boolean",
        read: (object) =>
          emberWorldObjectComponent(object, "light")?.source.lampShowCore !==
          false,
        editable: () => true,
      },
      {
        id: "lampTorchFlicker",
        label: "Мерцание",
        kind: "boolean",
        read: (object) =>
          emberWorldObjectComponent(object, "light")?.source
            .lampTorchFlicker !== false,
        editable: () => true,
      },
    ],
  },
  {
    type: "volume",
    label: "Volume",
    order: 50,
    fields: [
      {
        id: "kind",
        label: "Тип",
        kind: "readonly",
        read: (object) =>
          emberWorldObjectComponent(object, "volume")?.region.kind ?? "—",
      },
      {
        id: "width",
        label: "Ширина",
        kind: "number",
        min: 1,
        step: 1,
        read: (object) =>
          emberWorldObjectComponent(object, "volume")?.region.w ?? 1,
        editable: () => true,
      },
      {
        id: "height",
        label: "Глубина",
        kind: "number",
        min: 1,
        step: 1,
        read: (object) =>
          emberWorldObjectComponent(object, "volume")?.region.h ?? 1,
        editable: () => true,
      },
    ],
  },
  {
    type: "trigger",
    label: "Trigger",
    order: 60,
    fields: [
      {
        id: "scriptId",
        label: "Скрипт",
        kind: "text",
        read: (object) =>
          emberWorldObjectComponent(object, "trigger")?.scriptId ?? "",
        editable: () => true,
      },
      {
        id: "note",
        label: "Заметка",
        kind: "text",
        read: (object) =>
          emberWorldObjectComponent(object, "trigger")?.note ?? "",
        editable: () => true,
      },
      {
        id: "group",
        label: "Группа",
        kind: "text",
        read: (object) =>
          emberWorldObjectComponent(object, "trigger")?.group ?? "",
        editable: () => true,
      },
    ],
  },
  {
    type: "teleport",
    label: "Teleport",
    order: 70,
    fields: [
      {
        id: "targetRegionId",
        label: "Целевая зона",
        kind: "text",
        read: (object) =>
          emberWorldObjectComponent(object, "teleport")?.targetRegionId ?? "",
        editable: () => true,
      },
      {
        id: "targetX",
        label: "Target X",
        kind: "number",
        step: 1,
        read: (object) =>
          emberWorldObjectComponent(object, "teleport")?.targetPosition?.x ?? 0,
        editable: () => true,
      },
      {
        id: "targetY",
        label: "Target Y",
        kind: "number",
        step: 1,
        read: (object) =>
          emberWorldObjectComponent(object, "teleport")?.targetPosition?.y ?? 0,
        editable: () => true,
      },
    ],
  },
  {
    type: "spawn",
    label: "Spawn",
    order: 70,
    fields: [
      {
        id: "role",
        label: "Роль",
        kind: "readonly",
        read: (object) =>
          emberWorldObjectComponent(object, "spawn")?.role ?? "—",
      },
      {
        id: "group",
        label: "Группа",
        kind: "text",
        read: (object) =>
          emberWorldObjectComponent(object, "spawn")?.group ?? "",
        editable: () => true,
      },
    ],
  },
  {
    type: "chest",
    label: "Chest",
    order: 70,
    fields: [
      {
        id: "closedModelId",
        label: "Закрытая модель",
        kind: "text",
        read: (object) =>
          emberWorldObjectComponent(object, "chest")?.closedModelId ?? "",
        editable: () => true,
      },
      {
        id: "openModelId",
        label: "Открытая модель",
        kind: "text",
        read: (object) =>
          emberWorldObjectComponent(object, "chest")?.openModelId ?? "",
        editable: () => true,
      },
      {
        id: "sceneId",
        label: "Сцена",
        kind: "text",
        read: (object) =>
          emberWorldObjectComponent(object, "chest")?.sceneId ?? "",
        editable: () => true,
      },
      {
        id: "openClipId",
        label: "Клип открытия",
        kind: "text",
        read: (object) =>
          emberWorldObjectComponent(object, "chest")?.openClipId ?? "",
        editable: () => true,
      },
    ],
  },
  {
    type: "camera-bounds",
    label: "Camera Bounds",
    order: 70,
    fields: [],
  },
];

const schemaByType = new Map(schemas.map((schema) => [schema.type, schema]));

export function getEmberInspectorComponentSchema(
  type: EmberWorldObjectComponent["type"],
): EmberInspectorComponentSchema | null {
  return schemaByType.get(type) ?? null;
}

export function listEmberInspectorSchemas(
  object: EmberWorldObject,
): EmberInspectorComponentSchema[] {
  return object.components
    .map((component) => schemaByType.get(component.type))
    .filter((schema): schema is EmberInspectorComponentSchema => Boolean(schema))
    .sort((left, right) => left.order - right.order);
}

export function listAllEmberInspectorSchemas(): readonly EmberInspectorComponentSchema[] {
  return schemas;
}
