import { useState, type ReactNode } from "react";
import {
  listEmberInspectorSchemas,
  type EmberInspectorComponentSchema,
  type EmberInspectorFieldEdit,
  type EmberInspectorFieldSchema,
  type EmberInspectorFieldValue,
  type EmberVoxelOverrideComponentType,
  type EmberOptionalComponentType,
  type EmberWorldObject,
  type EmberWorldTransformPatch,
  type EmberWorldTransformSpace,
} from "../../../game/editor";
import type { EmberSceneLocalTransform } from "../../../game/content/types";

type Props = {
  object: EmberWorldObject;
  onEdit: (edit: EmberInspectorFieldEdit) => void;
  localTransform?: EmberSceneLocalTransform;
  parentName?: string;
  onTransformPatch?: (
    space: EmberWorldTransformSpace,
    patch: EmberWorldTransformPatch,
  ) => void;
  onApplyComponentToAsset?: (component: EmberVoxelOverrideComponentType) => void;
  onRevertComponentOverrides?: (
    component: EmberVoxelOverrideComponentType,
  ) => void;
  onAddComponent?: (component: EmberOptionalComponentType) => void;
  onRemoveComponent?: (component: EmberOptionalComponentType) => void;
  showTransform?: boolean;
  /** Asset inspectors can edit asset-owned fields that instances only inherit. */
  assetMode?: boolean;
  /** Read-only projections (for example built-in presets). */
  editable?: boolean;
};

function snapValue(value: number, step: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(step) || step <= 0) return value;
  return Math.round(value / step) * step;
}

function InspectorComponentFrame({
  title,
  defaultOpen = false,
  enabled,
  enabledDisabled,
  onEnabledChange,
  status,
  toolbar,
  menu,
  onRemove,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  enabled?: boolean;
  enabledDisabled?: boolean;
  onEnabledChange?: (enabled: boolean) => void;
  status?: ReactNode;
  toolbar?: ReactNode;
  menu?: ReactNode;
  onRemove?: () => void;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className={`ember-schema-component${enabled === false ? " is-disabled" : ""}`}>
      <div className="ember-schema-component__head">
        <button
          type="button"
          className="ember-schema-component__fold"
          aria-label={open ? `Свернуть ${title}` : `Развернуть ${title}`}
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
        >
          {open ? "▾" : "▸"}
        </button>
        {enabled != null ? (
          <label className="ember-schema-component__enabled" title="Активность компонента">
            <input
              type="checkbox"
              aria-label={`Включить ${title}`}
              checked={enabled}
              disabled={enabledDisabled}
              onChange={(event) => onEnabledChange?.(event.target.checked)}
            />
          </label>
        ) : null}
        <strong>{title}</strong>
        {status ? <span className="ember-schema-component__status">{status}</span> : null}
        {toolbar ? <div className="ember-schema-component__toolbar">{toolbar}</div> : null}
        <details className="ember-schema-component__menu">
          <summary aria-label={`Меню ${title}`}>•••</summary>
          <div className="ember-schema-component__menu-popover">
            {menu}
            <button
              type="button"
              disabled={!onRemove}
              title={
                onRemove
                  ? "Удалить необязательный компонент"
                  : "Встроенный компонент определяется типом объекта"
              }
              onClick={onRemove}
            >
              Удалить компонент
            </button>
          </div>
        </details>
      </div>
      {open ? <div className="ember-schema-component__body">{children}</div> : null}
    </section>
  );
}

function TransformVectorField({
  label,
  values,
  disabled,
  step,
  onCommit,
}: {
  label: string;
  values: readonly [number, number, number];
  disabled?: readonly [boolean, boolean, boolean];
  step: number;
  onCommit?: (axis: "x" | "y" | "z", value: number) => void;
}) {
  const axes = ["x", "y", "z"] as const;
  return (
    <div className="ember-transform-vector">
      <span className="ember-transform-vector__label">{label}</span>
      {axes.map((axis, index) => (
        <label className={`ember-transform-axis is-${axis}`} key={`${axis}-${values[index]}`}>
          <span>{axis.toUpperCase()}</span>
          <input
            type="number"
            aria-label={`${label} ${axis.toUpperCase()}`}
            defaultValue={values[index]}
            step={step}
            disabled={disabled?.[index] ?? !onCommit}
            onBlur={(event) => {
              const next = Number(event.target.value);
              if (Number.isFinite(next) && next !== values[index]) onCommit?.(axis, next);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
              if (event.key === "Escape") {
                event.currentTarget.value = String(values[index]);
                event.currentTarget.blur();
              }
            }}
          />
        </label>
      ))}
    </div>
  );
}

function TransformComponent({
  object,
  localTransform,
  parentName,
  onPatch,
}: {
  object: EmberWorldObject;
  localTransform?: EmberSceneLocalTransform;
  parentName?: string;
  onPatch?: (space: EmberWorldTransformSpace, patch: EmberWorldTransformPatch) => void;
}) {
  const [requestedSpace, setRequestedSpace] = useState<EmberWorldTransformSpace>(
    localTransform ? "local" : "world",
  );
  const [positionSnap, setPositionSnap] = useState(1);
  const space = requestedSpace === "local" && localTransform ? "local" : "world";
  const canMove = object.kind !== "tile" && Boolean(onPatch);
  const canEditZ = object.kind === "voxel" && Boolean(onPatch);
  const canRotate = object.kind === "voxel" && Boolean(onPatch);
  const position =
    space === "local" && localTransform
      ? localTransform.position
      : {
          x: object.transform.position.x,
          y: object.transform.position.y,
          z: object.transform.position.z ?? object.transform.resolvedZ,
        };
  const rotationQuarterTurns =
    space === "local" && localTransform
      ? localTransform.rotationQuarterTurns
      : object.transform.rotationQuarterTurns;
  const commitPosition = (axis: "x" | "y" | "z", value: number) => {
    onPatch?.(space, { [axis]: value });
  };
  const commitRotation = (axis: "x" | "y" | "z", value: number) => {
    if (axis !== "z") return;
    onPatch?.(space, { rotationQuarterTurns: value / 90 });
  };
  const snapTransform = () => {
    if (!onPatch || object.kind === "tile") return;
    onPatch(space, {
      x: snapValue(position.x, positionSnap),
      y: snapValue(position.y, positionSnap),
      ...(canEditZ ? { z: snapValue(position.z, positionSnap) } : {}),
      ...(canRotate
        ? { rotationQuarterTurns: Math.round(rotationQuarterTurns) }
        : {}),
    });
  };
  const resetTransform = () => {
    if (!onPatch || object.kind === "tile") return;
    onPatch(space, {
      x: 0,
      y: 0,
      ...(canEditZ ? { z: 0 } : {}),
      ...(canRotate ? { rotationQuarterTurns: 0 } : {}),
    });
  };

  return (
    <InspectorComponentFrame
      title="Transform"
      defaultOpen
      toolbar={(
        <>
        <div className="ember-transform-component__spaces" role="group" aria-label="Система координат">
          <button
            type="button"
            className={space === "world" ? "is-active" : ""}
            aria-pressed={space === "world"}
            onClick={() => setRequestedSpace("world")}
          >
            World
          </button>
          <button
            type="button"
            className={space === "local" ? "is-active" : ""}
            aria-pressed={space === "local"}
            disabled={!localTransform}
            onClick={() => setRequestedSpace("local")}
          >
            Local
          </button>
        </div>
        <button type="button" className="ghost ember-transform-component__reset" disabled={!canMove} onClick={resetTransform}>
          Reset
        </button>
        </>
      )}
      menu={(
        <button type="button" disabled={!canMove} onClick={resetTransform}>
          Reset Transform
        </button>
      )}
    >
        <div className="ember-transform-component__body">
          <TransformVectorField
            label="Position"
            values={[position.x, position.y, position.z]}
            disabled={[!canMove, !canMove, !canEditZ]}
            step={positionSnap}
            onCommit={commitPosition}
          />
          <TransformVectorField
            label="Rotation"
            values={[0, 0, rotationQuarterTurns * 90]}
            disabled={[true, true, !canRotate]}
            step={90}
            onCommit={commitRotation}
          />
          <TransformVectorField
            label="Scale"
            values={[
              object.transform.scale.x,
              object.transform.scale.y,
              object.transform.scale.z,
            ]}
            disabled={[true, true, true]}
            step={0.1}
          />
          <div className="ember-transform-component__meta">
            <span>{space === "local" ? `Parent · ${parentName ?? "Group"}` : "Scene Root · World space"}</span>
            <span>Yaw · Z axis</span>
          </div>
          <details className="ember-transform-snap">
            <summary>Привязка к сетке</summary>
            <div className="ember-transform-snap__body">
              <label>
                <span>Position</span>
                <input
                  type="number"
                  min="0.125"
                  max="16"
                  step="0.125"
                  value={positionSnap}
                  onChange={(event) => setPositionSnap(Math.max(0.125, Number(event.target.value) || 1))}
                />
              </label>
              <label>
                <span>Rotation</span>
                <input type="text" value="90°" disabled />
              </label>
              <button type="button" className="ghost" disabled={!canMove} onClick={snapTransform}>
                Привязать сейчас
              </button>
            </div>
          </details>
          <p className="muted ember-map-inspector__hint">
            Scale пока только читается: его запись появится вместе с единым масштабированием Renderer и Collider.
          </p>
        </div>
    </InspectorComponentFrame>
  );
}

const SOURCE_LABELS = {
  instance: "override",
  asset: "asset",
  legacy: "legacy",
  default: "default",
} as const;

function displayValue(value: EmberInspectorFieldValue): string {
  if (value == null || value === "") return "—";
  if (typeof value === "boolean") return value ? "Да" : "Нет";
  return String(value);
}

function SchemaField({
  object,
  component,
  field,
  onEdit,
  assetMode,
  inspectorEditable,
}: {
  object: EmberWorldObject;
  component: EmberInspectorComponentSchema;
  field: EmberInspectorFieldSchema;
  onEdit: (edit: EmberInspectorFieldEdit) => void;
  assetMode?: boolean;
  inspectorEditable: boolean;
}) {
  const value = field.read(object);
  const editable =
    inspectorEditable &&
    field.kind !== "readonly" &&
    (field.editable?.(object) === true ||
      (assetMode && component.type === "collider"));
  const source = field.source?.(object) ?? null;
  const commit = (next: EmberInspectorFieldValue) =>
    onEdit({ componentType: component.type, fieldId: field.id, value: next });
  const sourceControl = source ? (
    <span className={`ember-schema-source is-${source}`}>
      {SOURCE_LABELS[source]}
      {source === "instance" ? (
        <button
          type="button"
          className="ember-schema-source__reset"
          title="Сбросить только этот override"
          aria-label={`Сбросить ${field.label}`}
          onClick={(event) => {
            event.preventDefault();
            commit(null);
          }}
        >
          ×
        </button>
      ) : null}
    </span>
  ) : null;
  const commitNumber = (raw: string) => {
    const next = Number(raw);
    if (Number.isFinite(next) && next !== value) commit(next);
  };

  if (field.kind === "boolean") {
    return (
      <label
        className="ember-map-inspector__row ember-map-inspector__row--check"
        title={field.hint}
      >
        <span>{field.label}</span>
        <span className="ember-schema-field__inline-control">
          {sourceControl}
          <input
            type="checkbox"
            checked={value === true}
            disabled={!editable}
            onChange={(event) => commit(event.target.checked)}
          />
        </span>
      </label>
    );
  }

  if (field.kind === "number" && editable) {
    return (
      <label className="ember-schema-field" title={field.hint}>
        <span>
          {field.label}
          {sourceControl}
        </span>
        <div className="ember-schema-field__control">
          <input
            type="number"
            defaultValue={typeof value === "number" ? value : 0}
            min={field.min}
            max={field.max}
            step={field.step ?? 1}
            onBlur={(event) => commitNumber(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
            }}
          />
          {field.unit ? <small>{field.unit}</small> : null}
        </div>
      </label>
    );
  }

  if (field.kind === "text" && editable) {
    return (
      <label className="ember-schema-field" title={field.hint}>
        <span>
          {field.label}
          {sourceControl}
        </span>
        <input
          type="text"
          defaultValue={typeof value === "string" ? value : ""}
          onBlur={(event) => {
            if (event.target.value !== value) commit(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
          }}
        />
      </label>
    );
  }

  return (
    <div className="ember-schema-field is-readonly" title={field.hint}>
      <span>{field.label}</span>
      <strong>
        {displayValue(value)}
        {field.unit ? ` ${field.unit}` : ""}
      </strong>
    </div>
  );
}

function SchemaComponent({
  object,
  schema,
  onEdit,
  onApplyComponentToAsset,
  onRevertComponentOverrides,
  onRemoveComponent,
  assetMode,
  inspectorEditable,
}: {
  object: EmberWorldObject;
  schema: EmberInspectorComponentSchema;
  onEdit: (edit: EmberInspectorFieldEdit) => void;
  onApplyComponentToAsset?: (component: EmberVoxelOverrideComponentType) => void;
  onRevertComponentOverrides?: (
    component: EmberVoxelOverrideComponentType,
  ) => void;
  onRemoveComponent?: (component: EmberOptionalComponentType) => void;
  assetMode?: boolean;
  inspectorEditable: boolean;
}) {
  const component = object.components.find((item) => item.type === schema.type);
  const fieldSources =
    component && "fieldSources" in component ? component.fieldSources : null;
  const presenceOverride =
    component &&
    "presenceSource" in component &&
    component.presenceSource === "instance"
      ? 1
      : 0;
  const overrideCount =
    presenceOverride +
    (fieldSources
      ? Object.values(fieldSources).filter((source) => source === "instance")
          .length
      : 0);
  const inheritedOrigin = fieldSources
    ? Object.values(fieldSources).find((source) => source !== "default") ??
      "default"
    : null;
  const prefabComponent =
    schema.type === "voxel-renderer" ||
    schema.type === "collider" ||
    schema.type === "voxel-light"
      ? schema.type
      : null;
  const optionalComponent =
    ((object.kind === "voxel" &&
      (schema.type === "collider" || schema.type === "voxel-light")) ||
      ((object.kind === "sprite" || object.kind === "tile") &&
        schema.type === "collider"))
      ? schema.type
      : null;
  const enabledField = schema.fields.find(
    (field) => field.id === "enabled" && field.kind === "boolean",
  );
  const enabled = enabledField ? enabledField.read(object) === true : undefined;
  const canToggleEnabled =
    inspectorEditable &&
    (enabledField?.editable?.(object) === true ||
      (assetMode && schema.type === "collider"));
  const visibleFields = enabledField
    ? schema.fields.filter((field) => field !== enabledField)
    : schema.fields;
  const status =
    overrideCount > 0 ? (
      <small className="is-override">{overrideCount} override</small>
    ) : inheritedOrigin ? (
      <small>{SOURCE_LABELS[inheritedOrigin]}</small>
    ) : null;
  return (
    <InspectorComponentFrame
      title={schema.label}
      enabled={enabled}
      enabledDisabled={!canToggleEnabled}
      onEnabledChange={(next) => {
        if (!enabledField) return;
        onEdit({
          componentType: schema.type,
          fieldId: enabledField.id,
          value: next,
        });
      }}
      status={status}
      onRemove={
        optionalComponent && onRemoveComponent
          ? () => onRemoveComponent(optionalComponent)
          : undefined
      }
      menu={
        prefabComponent && overrideCount > 0 ? (
          <>
              <button
                type="button"
                onClick={() => onRevertComponentOverrides?.(prefabComponent)}
                disabled={!onRevertComponentOverrides}
              >
                Сбросить overrides
              </button>
              <button
                type="button"
                title="Записать overrides в общий ассет и очистить их у экземпляра"
                onClick={() => onApplyComponentToAsset?.(prefabComponent)}
                disabled={!onApplyComponentToAsset}
              >
                Применить к ассету
              </button>
          </>
        ) : (
          <span className="muted">Нет переопределений</span>
        )
      }
    >
          {visibleFields.length > 0 ? (
            visibleFields.map((field) => (
              <SchemaField
                key={`${object.key}:${field.id}`}
                object={object}
                component={schema}
                field={field}
                onEdit={onEdit}
                assetMode={assetMode}
                inspectorEditable={inspectorEditable}
              />
            ))
          ) : (
            <p className="muted ember-map-inspector__hint">
              Компонент не требует дополнительных параметров.
            </p>
          )}
    </InspectorComponentFrame>
  );
}

export function WorldObjectSchemaInspector({
  object,
  onEdit,
  localTransform,
  parentName,
  onTransformPatch,
  onApplyComponentToAsset,
  onRevertComponentOverrides,
  onAddComponent,
  onRemoveComponent,
  showTransform = true,
  assetMode = false,
  editable = true,
}: Props) {
  const schemas = listEmberInspectorSchemas(object).filter(
    (schema) => schema.type !== "transform",
  );
  const presentTypes = new Set(object.components.map((component) => component.type));
  const removedTypes = new Set(object.removedComponents ?? []);
  const optionalComponentCatalog: Array<{
    type: EmberOptionalComponentType;
    label: string;
  }> = [
    { type: "collider", label: "Collider" },
    { type: "voxel-light", label: "Emissive Light" },
  ];
  const allowedOptionalTypes =
    object.kind === "voxel"
      ? new Set<EmberOptionalComponentType>(["collider", "voxel-light"])
      : object.kind === "sprite" || object.kind === "tile"
        ? new Set<EmberOptionalComponentType>(["collider"])
        : new Set<EmberOptionalComponentType>();
  const addableComponents = optionalComponentCatalog.filter(
    (item) =>
      allowedOptionalTypes.has(item.type) && !presentTypes.has(item.type),
  ).filter(
    (item) => !removedTypes.has(item.type),
  );
  return (
    <div className="ember-schema-inspector">
      {showTransform ? (
        <TransformComponent
          key={`transform:${object.key}`}
          object={object}
          localTransform={localTransform}
          parentName={parentName}
          onPatch={onTransformPatch}
        />
      ) : null}
      {schemas.map((schema) => (
        <SchemaComponent
          key={schema.type}
          object={object}
          schema={schema}
          onEdit={onEdit}
          onApplyComponentToAsset={onApplyComponentToAsset}
          onRevertComponentOverrides={onRevertComponentOverrides}
          onRemoveComponent={onRemoveComponent}
          assetMode={assetMode}
          inspectorEditable={editable}
        />
      ))}
      {(object.removedComponents ?? []).map((type) => {
        const item = optionalComponentCatalog.find(
          (candidate) => candidate.type === type,
        );
        return (
          <section className="ember-schema-removed-component" key={`removed:${type}`}>
            <div>
              <strong>{item?.label ?? type}</strong>
              <small>Removed override · компонент ассета отключён у экземпляра</small>
            </div>
            <button
              type="button"
              disabled={!onRevertComponentOverrides}
              onClick={() => onRevertComponentOverrides?.(type)}
            >
              Вернуть из ассета
            </button>
          </section>
        );
      })}
      {editable && addableComponents.length > 0 && onAddComponent ? (
        <details className="ember-schema-add-component">
          <summary>＋ Add Component</summary>
          <div>
            {addableComponents.map((component) => (
              <button
                type="button"
                key={component.type}
                onClick={() => onAddComponent(component.type)}
              >
                <strong>{component.label}</strong>
                <small>
                  {component.type === "collider"
                    ? "Физика, trigger и проходимый верх"
                    : "Локальный свет от emissive-вокселей"}
                </small>
              </button>
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}
