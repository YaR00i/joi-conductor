/**
 * Active scene-object parameters: transform, canvas size, color groups, light.
 */
import { useEffect, useState } from "react";
import type {
  EmberMaterialKind,
  EmberVoxelModel,
  EmberVoxelSceneObject,
} from "../../../game/content/types";
import {
  EMBER_MATERIAL_KINDS,
  EMBER_MATERIAL_LABELS_RU,
} from "../../../game/three/materialPresets";
import {
  DEFAULT_EMISSIVE_LIGHT_RANGE,
  MAX_EMISSIVE_LIGHT_RANGE,
  MAX_EMISSIVE_STRENGTH,
  MIN_EMISSIVE_LIGHT_RANGE,
  MIN_EMISSIVE_STRENGTH,
  resolveEmissiveLightRange,
  resolveEmissiveStrength,
} from "../../../game/tile/emissivePaint";
import {
  addVoxelEmissiveLamp,
  clusterVoxelEmissiveLamps,
  listVoxelEmissiveLamps,
  modelHasEmissiveVoxels,
  normalizeVoxelLightOffset,
  patchVoxelEmissiveLamp,
  removeVoxelEmissiveLamp,
  VOXEL_EMISSIVE_LAMPS_MAX,
} from "../../../game/voxel/voxelEmissiveLight";
import {
  listPaletteGroupFamilies,
  paletteGroupHitsSelection,
  setPaletteGroupChannel,
  setPaletteSlotColors,
  voxelDensity,
  voxelGridSize,
  type VoxelPaintChannel,
  type VoxelPaletteGroup,
  type VoxelSelectionSet,
} from "../../../game/voxel/voxelModel";
import { EditableRange } from "./EditableRange";
import { DeferredColorInput } from "./DeferredColorInput";

/** Parse draft; null while incomplete ("", "-", "1.", …). */
function parseDraftNumber(raw: string): number | null {
  const v = raw.replace(",", ".").trim();
  if (v === "" || v === "-" || v === "." || v === "-.") return null;
  if (v.endsWith(".")) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function formatDraftNumber(n: number, decimals: number): string {
  if (!Number.isFinite(n)) return "0";
  if (decimals <= 0) return String(Math.round(n));
  const t = n.toFixed(decimals);
  return t.replace(/(\.\d*?[1-9])0+$/, "$1").replace(/\.0+$/, "");
}

/** Allows typing "-", "", "0." mid-edit (controlled type=number fights that). */
function DraftNumberInput({
  value,
  disabled,
  title,
  decimals = 2,
  step = 0.25,
  onCommit,
}: {
  value: number;
  disabled?: boolean;
  title?: string;
  /** Max fractional digits (0 = integers). */
  decimals?: number;
  /** ArrowUp/Down and wheel step. */
  step?: number;
  onCommit: (n: number) => void;
}) {
  const [text, setText] = useState(() => formatDraftNumber(value, decimals));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setText(formatDraftNumber(value, decimals));
  }, [value, focused, decimals]);

  const commitRaw = (raw: string, fallback: number) => {
    const n = parseDraftNumber(raw);
    if (n === null) {
      setText(formatDraftNumber(fallback, decimals));
      return;
    }
    onCommit(n);
    setText(formatDraftNumber(n, decimals));
  };

  const nudge = (dir: 1 | -1) => {
    const cur = parseDraftNumber(text);
    const base = cur ?? value;
    const next = base + dir * step;
    onCommit(next);
    setText(formatDraftNumber(next, decimals));
  };

  return (
    <input
      type="text"
      inputMode="decimal"
      disabled={disabled}
      title={title}
      value={text}
      onFocus={() => setFocused(true)}
      onChange={(e) => {
        const v = e.target.value.replace(",", ".");
        if (v !== "" && !/^-?\d*\.?\d*$/.test(v)) return;
        setText(v);
        const n = parseDraftNumber(v);
        if (n !== null) onCommit(n);
      }}
      onBlur={() => {
        setFocused(false);
        commitRaw(text, value);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          (e.target as HTMLInputElement).blur();
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          nudge(1);
          return;
        }
        if (e.key === "ArrowDown") {
          e.preventDefault();
          nudge(-1);
        }
      }}
      onWheel={(e) => {
        if (disabled || !focused) return;
        e.preventDefault();
        nudge(e.deltaY < 0 ? 1 : -1);
      }}
    />
  );
}

/** Integer field whose text is harmless until the user explicitly presses Enter. */
function EnterCommitIntegerInput({
  value,
  min,
  max,
  title,
  onCommit,
}: {
  value: number;
  min: number;
  max: number;
  title?: string;
  onCommit: (value: number) => void;
}) {
  const [text, setText] = useState(String(value));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setText(String(value));
  }, [value, focused]);

  const reset = () => setText(String(value));
  const commit = () => {
    const parsed = Number(text.trim());
    if (!Number.isFinite(parsed)) {
      reset();
      return;
    }
    const next = Math.max(min, Math.min(max, Math.round(parsed)));
    setText(String(next));
    if (next !== value) onCommit(next);
  };

  return (
    <input
      type="text"
      inputMode="numeric"
      value={text}
      title={`${title ? `${title} · ` : ""}Enter — применить, Esc — отменить`}
      onFocus={() => setFocused(true)}
      onChange={(event) => {
        const next = event.target.value.trim();
        if (next !== "" && !/^\d+$/.test(next)) return;
        setText(next);
      }}
      onBlur={() => {
        setFocused(false);
        reset();
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          commit();
        } else if (event.key === "Escape") {
          event.preventDefault();
          reset();
          (event.currentTarget as HTMLInputElement).blur();
        }
      }}
    />
  );
}

function PaletteGroupCard({
  model,
  group,
  selection,
  subgroup,
  onSetPaletteColor,
  onPreviewPaletteColor,
  onEditModel,
}: {
  model: EmberVoxelModel;
  group: VoxelPaletteGroup;
  selection?: VoxelSelectionSet | null;
  subgroup: boolean;
  onSetPaletteColor: (index: number, hex: string) => void;
  onPreviewPaletteColor?: (index: number, hex: string) => void;
  onEditModel: (next: EmberVoxelModel) => void;
}) {
  const selected = paletteGroupHitsSelection(model, group.index, selection);
  const paint = (channel: VoxelPaintChannel, amount: number) => {
    onEditModel(
      setPaletteGroupChannel(
        model,
        group.index,
        channel,
        amount,
        selected ? selection : null,
      ),
    );
  };
  return (
    <div
      className={`ember-voxel-objprops__group${
        subgroup ? " is-sub" : ""
      }${selected ? " is-sel" : ""}`}
    >
      <div className="ember-voxel-objprops__group-head">
        <span
          className="ember-voxel-objprops__swatch"
          style={{ background: group.color }}
        />
        <span className="ember-voxel-objprops__group-meta">
          #{group.index}
          {subgroup ? " · подгруппа" : ""} · {group.count} кл.
        </span>
        <DeferredColorInput
          className="ember-voxel-objprops__color"
          value={group.color.startsWith("#") ? group.color : "#888888"}
          title="Цвет слота палитры"
          onPreview={(hex) => onPreviewPaletteColor?.(group.index, hex)}
          onCommit={(hex) => onSetPaletteColor(group.index, hex)}
        />
      </div>
      <EditableRange
        label="Свечение"
        value={group.emitAvg}
        min={0}
        max={255}
        onChange={(v) => paint("emissive", v)}
      />
      <EditableRange
        label="Блеск"
        value={group.shineAvg}
        min={0}
        max={255}
        onChange={(v) => paint("shine", v)}
      />
      <EditableRange
        label="Прозрачность"
        value={group.transparencyAvg}
        min={0}
        max={255}
        title="0 = непрозрачный · выше = стекло, свет проходит"
        onChange={(v) => paint("transparency", v)}
      />
      <EditableRange
        label="Просвет"
        value={group.transmittanceAvg}
        min={0}
        max={255}
        title="0 = глухая тень · выше = тень светлеет и мягче дальше от лампы · 255 = без тени"
        onChange={(v) => paint("transmittance", v)}
      />
    </div>
  );
}

type Props = {
  mode?: "sculpt" | "material" | "scene" | "animate";
  selectionCount?: number;
  object: EmberVoxelSceneObject | null;
  model: EmberVoxelModel | null;
  canRemove: boolean;
  onRename: (nameRu: string) => void;
  onSetOffset: (offset: { x: number; y: number; z: number }) => void;
  rotationQuarterTurns?: number;
  canRotateSelection?: boolean;
  onRotateSelection?: (quarterTurns: number) => void;
  onResizeBlocks: (axis: "x" | "z", blocks: number) => void;
  onResizeHeight: (voxels: number) => void;
  onSetMaterial: (material: EmberMaterialKind | undefined) => void;
  onSetPaletteColor: (index: number, hex: string) => void;
  onPreviewPaletteColor?: (index: number, hex: string) => void;
  onEditModel: (next: EmberVoxelModel) => void;
  onDuplicate?: () => void;
  onRemove?: () => void;
  /** Active sculpt selection — channel sliders split a subgroup from the rest. */
  selection?: VoxelSelectionSet | null;
  /** Pick light origin by clicking a voxel in the viewport. */
  pickingLightOrigin?: boolean;
  selectedLampId?: string | null;
  onSelectLamp?: (id: string) => void;
  onStartPickLightOrigin?: () => void;
  onClearLightOrigin?: () => void;
};

export function VoxelObjectPropsPanel({
  mode = "scene",
  selectionCount = 1,
  object,
  model,
  canRemove,
  onRename,
  onSetOffset,
  rotationQuarterTurns = 0,
  canRotateSelection = false,
  onRotateSelection,
  onResizeBlocks,
  onResizeHeight,
  onSetMaterial,
  onSetPaletteColor,
  onPreviewPaletteColor,
  onEditModel,
  onDuplicate,
  onRemove,
  selection,
  pickingLightOrigin,
  selectedLampId,
  onSelectLamp,
  onStartPickLightOrigin,
  onClearLightOrigin,
}: Props) {
  if (!object) {
    return (
      <p className="muted ember-hint">Выберите объект в списке сцены.</p>
    );
  }

  const grid = model ? voxelGridSize(model) : null;
  const density = model ? voxelDensity(model) : 16;
  const families = model ? listPaletteGroupFamilies(model) : [];
  const heightVoxels =
    model?.heightVoxels ??
    (model ? model.sizeBlocks.y * density : 1);
  const hasEmit = model ? modelHasEmissiveVoxels(model) : false;
  const castsLight = model?.emissiveCastsLight === true;
  const lightShadows = model?.emissiveLightShadows === true;
  const torchFlicker = model?.emissiveTorchFlicker === true;
  const lanternFlicker = model?.emissiveLanternFlicker === true;
  const origin = model?.emissiveLightOrigin;
  const lamps = model ? listVoxelEmissiveLamps(model) : [];
  const activeLamp =
    lamps.find((lamp) => lamp.id === selectedLampId) ?? lamps[0] ?? null;
  const activeOrigin = activeLamp?.origin ?? origin;
  const showTransform = mode === "scene" || mode === "animate";
  const showModel = mode === "sculpt";
  const showLight = mode === "material" || mode === "scene";
  const showGroups = mode === "material";

  return (
    <div className="ember-voxel-objprops">
      <p className="ember-voxel-sculpt__section">
        {showGroups
          ? "Материал объекта"
          : showModel
            ? "Геометрия объекта"
            : selectionCount > 1
              ? `Параметры объектов · ${selectionCount}`
              : "Параметры объекта"}
      </p>

      {showTransform ? (
        <>
      <label className="ember-voxel-objprops__field">
        <span>Имя</span>
        <input
          type="text"
          value={object.nameRu ?? ""}
          disabled={selectionCount > 1}
          title={
            selectionCount > 1
              ? "Имя меняется только у одного выбранного объекта"
              : undefined
          }
          onChange={(e) => onRename(e.target.value)}
        />
      </label>

      <div className="ember-voxel-objprops__offset">
        <span className="ember-voxel-objprops__sub">
          {selectionCount > 1
            ? `Позиция группы · опорный объект «${object.nameRu?.trim() || object.modelId}»`
            : "Позиция Δ"}
        </span>
        {(["x", "y", "z"] as const).map((axis) => (
          <label key={axis}>
            <span>{axis.toUpperCase()}</span>
            <DraftNumberInput
              value={object.offset[axis]}
              decimals={0}
              step={1}
              onCommit={(n) =>
                onSetOffset({
                  ...object.offset,
                  [axis]: Math.round(n),
                })
              }
            />
          </label>
        ))}
      </div>
      <div className="ember-voxel-objprops__rotation">
        <span className="ember-voxel-objprops__sub">
          {selectionCount > 1 ? "Поворот группы" : "Поворот Y"}
        </span>
        <button
          type="button"
          className="ghost"
          disabled={!canRotateSelection || !onRotateSelection}
          title={
            canRotateSelection
              ? "Повернуть на 90° против часовой стрелки"
              : "Поворот объектов со скелетными связями заблокирован"
          }
          onClick={() => onRotateSelection?.(-1)}
        >
          ↺ 90°
        </button>
        <strong>{((rotationQuarterTurns % 4 + 4) % 4) * 90}°</strong>
        <button
          type="button"
          className="ghost"
          disabled={!canRotateSelection || !onRotateSelection}
          title={
            canRotateSelection
              ? "Повернуть на 90° по часовой стрелке"
              : "Поворот объектов со скелетными связями заблокирован"
          }
          onClick={() => onRotateSelection?.(1)}
        >
          ↻ 90°
        </button>
      </div>
        </>
      ) : null}

      {model && grid && showModel ? (
        <>
          <div className="ember-voxel-objprops__canvas">
            <span className="ember-voxel-objprops__sub">
              Холст · {grid.sx}×{grid.sy}×{grid.sz} вокс · {density}/блок
            </span>
            <label>
              <span>Ширина</span>
              <EnterCommitIntegerInput
                min={1}
                max={4}
                value={model.sizeBlocks.x}
                title={`Блоков по X (${grid.sx} вокс)`}
                onCommit={(value) => onResizeBlocks("x", value)}
              />
              <em>бл</em>
            </label>
            <label>
              <span>Длина</span>
              <EnterCommitIntegerInput
                min={1}
                max={4}
                value={model.sizeBlocks.z}
                title={`Блоков по Z (${grid.sz} вокс)`}
                onCommit={(value) => onResizeBlocks("z", value)}
              />
              <em>бл</em>
            </label>
            <label>
              <span>Высота</span>
              <EnterCommitIntegerInput
                min={1}
                max={4 * density}
                value={heightVoxels}
                title="Высота в вокселях"
                onCommit={onResizeHeight}
              />
              <em>вкс</em>
            </label>
          </div>

          <label className="ember-voxel-objprops__field">
            <span>Материал</span>
            <select
              value={model.material ?? ""}
              onChange={(e) => {
                const v = e.target.value;
                onSetMaterial(
                  v ? (v as EmberMaterialKind) : undefined,
                );
              }}
            >
              <option value="">— по умолчанию —</option>
              {EMBER_MATERIAL_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {EMBER_MATERIAL_LABELS_RU[kind]}
                </option>
              ))}
            </select>
          </label>

          <label
            className="ember-voxel-objprops__check"
            title="Столкновение на карте: воксель-проп и объекты зон (сундук и т.п.). Выкл. — можно пройти сквозь."
          >
            <input
              type="checkbox"
              checked={model.physical !== false}
              onChange={(e) => {
                onEditModel({
                  ...model,
                  physical: e.target.checked ? true : false,
                });
              }}
            />
            Физичность
          </label>

        </>
      ) : null}

      {model && showLight ? (
          <div className="ember-voxel-objprops__light">
            <p className="ember-voxel-sculpt__section">Свет (PointLight)</p>
            {!hasEmit ? (
              <p className="muted ember-hint">
                Сначала кистью «Свечение» покрась воксели — потом включи свет.
              </p>
            ) : (
              <>
                <label
                  className="ember-voxel-objprops__check"
                  title="Настоящий локальный свет из центра светящихся вокселей (карта / play)"
                >
                  <input
                    type="checkbox"
                    checked={castsLight}
                    onChange={(e) => {
                      const on = e.target.checked;
                      onEditModel({
                        ...model,
                        emissiveCastsLight: on ? true : undefined,
                        emissiveLightShadows: on
                          ? model.emissiveLightShadows
                          : undefined,
                        emissiveLightSoftRings: on
                          ? model.emissiveLightSoftRings
                          : undefined,
                        emissiveLightSoftShadows: on
                          ? model.emissiveLightSoftShadows
                          : undefined,
                        emissiveLightRange: on
                          ? model.emissiveLightRange ??
                            DEFAULT_EMISSIVE_LIGHT_RANGE
                          : model.emissiveLightRange,
                      });
                    }}
                  />
                  Свет от emissive
                </label>
                {castsLight && lamps.length > 0 ? (
                  <div className="ember-voxel-objprops__lamps">
                    {lamps.map((lamp, i) => (
                      <button
                        key={lamp.id}
                        type="button"
                        className={`ghost${activeLamp?.id === lamp.id ? " is-active" : ""}`}
                        onClick={() => onSelectLamp?.(lamp.id)}
                      >
                        {lamp.nameRu?.trim() || `Свет ${i + 1}`}
                      </button>
                    ))}
                    <button
                      type="button"
                      className="ghost"
                      disabled={lamps.length >= VOXEL_EMISSIVE_LAMPS_MAX}
                      title="Ещё один PointLight на этом объекте"
                      onClick={() => {
                        const next = addVoxelEmissiveLamp(model);
                        onEditModel(next);
                        const added = listVoxelEmissiveLamps(next).at(-1);
                        if (added) onSelectLamp?.(added.id);
                      }}
                    >
                      +
                    </button>
                    <button
                      type="button"
                      className="ghost"
                      title="По одному источнику на каждый островок светящихся вокселей"
                      onClick={() => {
                        const next = clusterVoxelEmissiveLamps(model);
                        onEditModel(next);
                        const first = listVoxelEmissiveLamps(next)[0];
                        if (first) onSelectLamp?.(first.id);
                      }}
                    >
                      Кластеры
                    </button>
                    {lamps.length > 1 && activeLamp ? (
                      <button
                        type="button"
                        className="ghost"
                        title="Удалить выбранный источник"
                        onClick={() => {
                          const next = removeVoxelEmissiveLamp(
                            model,
                            activeLamp.id,
                          );
                          onEditModel(next);
                          onSelectLamp?.(
                            listVoxelEmissiveLamps(next)[0]?.id ?? "",
                          );
                        }}
                      >
                        Удалить
                      </button>
                    ) : null}
                  </div>
                ) : null}
                <EditableRange
                  label="Дальность (тайлы)"
                  value={resolveEmissiveLightRange(
                    activeLamp?.range ?? model.emissiveLightRange,
                  )}
                  min={MIN_EMISSIVE_LIGHT_RANGE}
                  max={MAX_EMISSIVE_LIGHT_RANGE}
                  step={0.05}
                  decimals={2}
                  disabled={!castsLight}
                  onChange={(v) => {
                    const range = resolveEmissiveLightRange(v);
                    if (activeLamp) {
                      onEditModel(
                        patchVoxelEmissiveLamp(model, activeLamp.id, {
                          range,
                        }),
                      );
                      return;
                    }
                    onEditModel({
                      ...model,
                      emissiveCastsLight: true,
                      emissiveLightRange: range,
                    });
                  }}
                />
                <EditableRange
                  label="Сила"
                  value={resolveEmissiveStrength(
                    activeLamp?.strength ?? model.emissiveStrength,
                  )}
                  min={MIN_EMISSIVE_STRENGTH}
                  max={MAX_EMISSIVE_STRENGTH}
                  step={0.05}
                  decimals={2}
                  disabled={!castsLight}
                  onChange={(v) => {
                    const strength = resolveEmissiveStrength(v);
                    if (activeLamp) {
                      onEditModel(
                        patchVoxelEmissiveLamp(model, activeLamp.id, {
                          strength,
                        }),
                      );
                      return;
                    }
                    onEditModel({
                      ...model,
                      emissiveCastsLight: true,
                      emissiveStrength: strength,
                    });
                  }}
                />
                <label
                  className="ember-voxel-objprops__check"
                  style={{ opacity: castsLight ? 1 : 0.4 }}
                  title="Cube-shadow от PointLight на рельеф и соседей (лимит ~12). Не путать с «Рама без теней»."
                >
                  <input
                    type="checkbox"
                    disabled={!castsLight}
                    checked={
                      activeLamp
                        ? activeLamp.shadows === true ||
                          model.emissiveLightShadows === true
                        : lightShadows
                    }
                    onChange={(e) => {
                      if (activeLamp) {
                        onEditModel(
                          patchVoxelEmissiveLamp(model, activeLamp.id, {
                            shadows: e.target.checked ? true : undefined,
                          }),
                        );
                        return;
                      }
                      onEditModel({
                        ...model,
                        emissiveCastsLight: true,
                        emissiveLightShadows: e.target.checked
                          ? true
                          : undefined,
                      });
                    }}
                  />
                  Тени PointLight
                </label>
                <label
                  className="ember-voxel-objprops__check"
                  style={{ opacity: castsLight ? 1 : 0.4 }}
                  title="Смягчает кольца MeshToon-света, особенно край, где свет кончается"
                >
                  <input
                    type="checkbox"
                    disabled={!castsLight}
                    checked={
                      activeLamp?.softRings === true ||
                      model.emissiveLightSoftRings === true
                    }
                    onChange={(e) => {
                      if (activeLamp) {
                        onEditModel(
                          patchVoxelEmissiveLamp(model, activeLamp.id, {
                            softRings: e.target.checked ? true : undefined,
                          }),
                        );
                        return;
                      }
                      onEditModel({
                        ...model,
                        emissiveCastsLight: true,
                        emissiveLightSoftRings: e.target.checked
                          ? true
                          : undefined,
                      });
                    }}
                  />
                  Мягкие кольца света
                </label>
                <label
                  className="ember-voxel-objprops__check"
                  style={{ opacity: castsLight ? 1 : 0.4 }}
                  title="Полутень как у просвета: край тени размывается с расстоянием. Можно тестить без слайдера просвета. Нужны тени PointLight."
                >
                  <input
                    type="checkbox"
                    disabled={!castsLight}
                    checked={
                      activeLamp?.softShadows === true ||
                      model.emissiveLightSoftShadows === true
                    }
                    onChange={(e) => {
                      if (activeLamp) {
                        onEditModel({
                          ...patchVoxelEmissiveLamp(model, activeLamp.id, {
                            softShadows: e.target.checked ? true : undefined,
                            shadows: e.target.checked ? true : activeLamp.shadows,
                          }),
                          ...(e.target.checked
                            ? { emissiveLightShadows: true }
                            : {}),
                        });
                        return;
                      }
                      onEditModel({
                        ...model,
                        emissiveCastsLight: true,
                        ...(e.target.checked
                          ? { emissiveLightShadows: true }
                          : {}),
                        emissiveLightSoftShadows: e.target.checked
                          ? true
                          : undefined,
                      });
                    }}
                  />
                  Мягкие тени
                </label>
                <label
                  className="ember-voxel-objprops__check"
                  style={{ opacity: castsLight ? 1 : 0.4 }}
                  title="Рама/столб не кастуют тени. Не отключает тени от самого PointLight."
                >
                  <input
                    type="checkbox"
                    disabled={!castsLight}
                    checked={model?.emissiveSuppressHostShadow === true}
                    onChange={(e) =>
                      onEditModel({
                        ...model,
                        emissiveCastsLight: true,
                        emissiveSuppressHostShadow: e.target.checked
                          ? true
                          : undefined,
                      })
                    }
                  />
                  Рама без теней
                </label>
                <label
                  className="ember-voxel-objprops__check"
                  style={{ opacity: castsLight ? 1 : 0.4 }}
                  title="Круги света дышат — расширяются и сжимаются, как у обычных фонарей"
                >
                  <input
                    type="checkbox"
                    disabled={!castsLight}
                    checked={torchFlicker}
                    onChange={(e) =>
                      onEditModel({
                        ...model,
                        emissiveCastsLight: true,
                        emissiveTorchFlicker: e.target.checked
                          ? true
                          : undefined,
                      })
                    }
                  />
                  Мерцание факела
                </label>
                <label
                  className="ember-voxel-objprops__check"
                  style={{ opacity: castsLight ? 1 : 0.4 }}
                  title="Короткие обрывы света (ломающаяся лампочка). Можно вместе с мерцанием факела"
                >
                  <input
                    type="checkbox"
                    disabled={!castsLight}
                    checked={lanternFlicker}
                    onChange={(e) =>
                      onEditModel({
                        ...model,
                        emissiveCastsLight: true,
                        emissiveLanternFlicker: e.target.checked
                          ? true
                          : undefined,
                      })
                    }
                  />
                  Мерцание фонаря
                </label>
                <p className="muted ember-hint">
                  Источник:{" "}
                  {activeOrigin
                    ? `${activeOrigin.x}, ${activeOrigin.y}, ${activeOrigin.z}`
                    : "авто (центр emissive)"}
                  {lamps.length > 1 ? ` · ${lamps.length} ламп` : ""}
                </p>
                <div
                  className="ember-voxel-objprops__offset"
                  style={{ opacity: castsLight ? 1 : 0.4 }}
                  title="Сдвиг PointLight от источника/авто-центра (воксели). В видовом окне — гизмо XYZ на жёлтой точке"
                >
                  <span className="ember-voxel-objprops__sub">Оффсет Δ</span>
                  {(["x", "y", "z"] as const).map((axis) => {
                    const off =
                      activeLamp?.offset ?? model.emissiveLightOffset;
                    const val = off?.[axis] ?? 0;
                    return (
                      <label key={axis}>
                        <span>{axis.toUpperCase()}</span>
                        <DraftNumberInput
                          disabled={!castsLight}
                          value={val}
                          decimals={2}
                          step={0.25}
                          title="Дробные воксели; ↑↓ / колесо — шаг 0.25"
                          onCommit={(n) => {
                            const next = {
                              x: off?.x ?? 0,
                              y: off?.y ?? 0,
                              z: off?.z ?? 0,
                              [axis]: n,
                            };
                            const normalized = normalizeVoxelLightOffset(next);
                            if (activeLamp) {
                              onEditModel(
                                patchVoxelEmissiveLamp(model, activeLamp.id, {
                                  offset: normalized,
                                }),
                              );
                              return;
                            }
                            onEditModel({
                              ...model,
                              emissiveCastsLight: true,
                              emissiveLightOffset: normalized,
                            });
                          }}
                        />
                      </label>
                    );
                  })}
                </div>
                <div className="ember-voxel-objprops__ops">
                  <button
                    type="button"
                    className={`ghost ${pickingLightOrigin ? "is-active" : ""}`}
                    disabled={!castsLight && !hasEmit}
                    title="Клик по вокселю в видовом окне"
                    onClick={() => onStartPickLightOrigin?.()}
                  >
                    {pickingLightOrigin ? "Кликните воксель…" : "Источник"}
                  </button>
                  <button
                    type="button"
                    className="ghost"
                    disabled={!origin && !model.emissiveLightOffset && !activeLamp?.offset}
                    title="Сбросить точку и оффсет на центр масс светящихся вокселей"
                    onClick={() => onClearLightOrigin?.()}
                  >
                    Авто
                  </button>
                </div>
              </>
            )}
          </div>
      ) : null}

      {showTransform ? (
        <div className="ember-voxel-objprops__ops">
        {onDuplicate ? (
          <button
            type="button"
            className="ghost"
            title="Дублировать объект в сцене"
            onClick={onDuplicate}
          >
            Дубль
          </button>
        ) : null}
        {onRemove ? (
          <button
            type="button"
            className="ghost ember-danger"
            disabled={!canRemove}
            title="Убрать объект из сцены"
            onClick={onRemove}
          >
            Убрать
          </button>
        ) : null}
        </div>
      ) : null}

      {model && showGroups ? (
        <div className="ember-voxel-objprops__groups">
          <p className="ember-voxel-sculpt__section">Группы цветов</p>
          <p className="muted ember-hint">
            Выдели часть цвета и смени просвет / блеск / свет — клетки станут
            подгруппой, слайдеры больше не смешаются.
          </p>
          {families.length === 0 ? (
            <p className="muted ember-hint">Нет сплошных вокселей</p>
          ) : (
            <ul className="ember-voxel-objprops__group-list">
              {families.map((fam) => {
                const nested = fam.groups.length > 1;
                return (
                  <li key={fam.hex} className="ember-voxel-objprops__family">
                    {nested ? (
                      <div className="ember-voxel-objprops__family-head">
                        <span
                          className="ember-voxel-objprops__swatch"
                          style={{
                            background: fam.groups[0]?.color || fam.hex,
                          }}
                        />
                        <span className="ember-voxel-objprops__group-meta">
                          {fam.groups.length} подгруппы · {fam.count} кл.
                        </span>
                        <DeferredColorInput
                          className="ember-voxel-objprops__color"
                          value={
                            (fam.groups[0]?.color ?? fam.hex).startsWith("#")
                              ? fam.groups[0]?.color ?? fam.hex
                              : "#888888"
                          }
                          title="Перекрасить все подгруппы этого цвета"
                          onPreview={(hex) => {
                            for (const g of fam.groups) {
                              onPreviewPaletteColor?.(g.index, hex);
                            }
                          }}
                          onCommit={(hex) =>
                            onEditModel(
                              setPaletteSlotColors(
                                model,
                                fam.groups.map((g) => g.index),
                                hex,
                              ),
                            )
                          }
                        />
                      </div>
                    ) : null}
                    {fam.groups.map((g) => (
                      <PaletteGroupCard
                        key={g.index}
                        model={model}
                        group={g}
                        selection={selection}
                        subgroup={nested}
                        onSetPaletteColor={onSetPaletteColor}
                        onPreviewPaletteColor={onPreviewPaletteColor}
                        onEditModel={onEditModel}
                      />
                    ))}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
