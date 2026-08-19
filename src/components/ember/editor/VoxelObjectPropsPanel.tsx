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
import { VOXELS_PER_BLOCK } from "../../../game/voxel/constants";
import {
  modelHasEmissiveVoxels,
  normalizeVoxelLightOffset,
} from "../../../game/voxel/voxelEmissiveLight";
import {
  listPaletteGroups,
  setPaletteGroupChannel,
  voxelGridSize,
} from "../../../game/voxel/voxelModel";
import { EditableRange } from "./EditableRange";

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

type Props = {
  object: EmberVoxelSceneObject | null;
  model: EmberVoxelModel | null;
  canRemove: boolean;
  onRename: (nameRu: string) => void;
  onSetOffset: (offset: { x: number; y: number; z: number }) => void;
  onResizeBlocks: (axis: "x" | "z", blocks: number) => void;
  onResizeHeight: (voxels: number) => void;
  onSetMaterial: (material: EmberMaterialKind | undefined) => void;
  onSetPaletteColor: (index: number, hex: string) => void;
  onEditModel: (next: EmberVoxelModel) => void;
  onDuplicate?: () => void;
  onRemove?: () => void;
  /** Pick light origin by clicking a voxel in the viewport. */
  pickingLightOrigin?: boolean;
  onStartPickLightOrigin?: () => void;
  onClearLightOrigin?: () => void;
};

export function VoxelObjectPropsPanel({
  object,
  model,
  canRemove,
  onRename,
  onSetOffset,
  onResizeBlocks,
  onResizeHeight,
  onSetMaterial,
  onSetPaletteColor,
  onEditModel,
  onDuplicate,
  onRemove,
  pickingLightOrigin,
  onStartPickLightOrigin,
  onClearLightOrigin,
}: Props) {
  if (!object) {
    return (
      <p className="muted ember-hint">Выберите объект в списке сцены.</p>
    );
  }

  const grid = model ? voxelGridSize(model) : null;
  const groups = model ? listPaletteGroups(model) : [];
  const heightVoxels =
    model?.heightVoxels ??
    (model ? model.sizeBlocks.y * VOXELS_PER_BLOCK : 1);
  const hasEmit = model ? modelHasEmissiveVoxels(model) : false;
  const castsLight = model?.emissiveCastsLight === true;
  const lightRange = resolveEmissiveLightRange(model?.emissiveLightRange);
  const lightStrength = resolveEmissiveStrength(model?.emissiveStrength);
  const lightShadows = model?.emissiveLightShadows === true;
  const torchFlicker = model?.emissiveTorchFlicker === true;
  const lanternFlicker = model?.emissiveLanternFlicker === true;
  const origin = model?.emissiveLightOrigin;

  return (
    <div className="ember-voxel-objprops">
      <p className="ember-voxel-sculpt__section">Параметры объекта</p>

      <label className="ember-voxel-objprops__field">
        <span>Имя</span>
        <input
          type="text"
          value={object.nameRu ?? ""}
          onChange={(e) => onRename(e.target.value)}
        />
      </label>

      <div className="ember-voxel-objprops__offset">
        <span className="ember-voxel-objprops__sub">Позиция Δ</span>
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

      {model && grid ? (
        <>
          <div className="ember-voxel-objprops__canvas">
            <span className="ember-voxel-objprops__sub">
              Холст · {grid.sx}×{grid.sy}×{grid.sz} вокс
            </span>
            <label>
              <span>Ширина</span>
              <input
                type="number"
                min={1}
                max={4}
                value={model.sizeBlocks.x}
                title={`Блоков по X (${grid.sx} вокс)`}
                onChange={(e) =>
                  onResizeBlocks("x", Number(e.target.value) || 1)
                }
              />
              <em>бл</em>
            </label>
            <label>
              <span>Длина</span>
              <input
                type="number"
                min={1}
                max={4}
                value={model.sizeBlocks.z}
                title={`Блоков по Z (${grid.sz} вокс)`}
                onChange={(e) =>
                  onResizeBlocks("z", Number(e.target.value) || 1)
                }
              />
              <em>бл</em>
            </label>
            <label>
              <span>Высота</span>
              <input
                type="number"
                min={1}
                max={64}
                step={1}
                value={heightVoxels}
                title="Высота в вокселях"
                onChange={(e) =>
                  onResizeHeight(Number(e.target.value) || 1)
                }
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
                        emissiveLightRange: on
                          ? model.emissiveLightRange ??
                            DEFAULT_EMISSIVE_LIGHT_RANGE
                          : model.emissiveLightRange,
                      });
                    }}
                  />
                  Свет от emissive
                </label>
                <EditableRange
                  label="Дальность (тайлы)"
                  value={lightRange}
                  min={MIN_EMISSIVE_LIGHT_RANGE}
                  max={MAX_EMISSIVE_LIGHT_RANGE}
                  step={0.05}
                  decimals={2}
                  disabled={!castsLight}
                  onChange={(v) =>
                    onEditModel({
                      ...model,
                      emissiveCastsLight: true,
                      emissiveLightRange: resolveEmissiveLightRange(v),
                    })
                  }
                />
                <EditableRange
                  label="Сила"
                  value={lightStrength}
                  min={MIN_EMISSIVE_STRENGTH}
                  max={MAX_EMISSIVE_STRENGTH}
                  step={0.05}
                  decimals={2}
                  disabled={!castsLight}
                  onChange={(v) =>
                    onEditModel({
                      ...model,
                      emissiveCastsLight: true,
                      emissiveStrength: resolveEmissiveStrength(v),
                    })
                  }
                />
                <label
                  className="ember-voxel-objprops__check"
                  style={{ opacity: castsLight ? 1 : 0.4 }}
                  title="Cube-shadow от PointLight на рельеф и соседей (лимит ~12). Не путать с «Рама без теней»."
                >
                  <input
                    type="checkbox"
                    disabled={!castsLight}
                    checked={lightShadows}
                    onChange={(e) =>
                      onEditModel({
                        ...model,
                        emissiveCastsLight: true,
                        emissiveLightShadows: e.target.checked
                          ? true
                          : undefined,
                      })
                    }
                  />
                  Тени PointLight
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
                  {origin
                    ? `${origin.x}, ${origin.y}, ${origin.z}`
                    : "авто (центр emissive)"}
                </p>
                <div
                  className="ember-voxel-objprops__offset"
                  style={{ opacity: castsLight ? 1 : 0.4 }}
                  title="Сдвиг PointLight от источника/авто-центра (воксели). В видовом окне — гизмо XYZ на жёлтой точке"
                >
                  <span className="ember-voxel-objprops__sub">Оффсет Δ</span>
                  {(["x", "y", "z"] as const).map((axis) => {
                    const off = model.emissiveLightOffset;
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
                    disabled={!origin && !model.emissiveLightOffset}
                    title="Сбросить точку и оффсет на центр масс светящихся вокселей"
                    onClick={() => onClearLightOrigin?.()}
                  >
                    Авто
                  </button>
                </div>
              </>
            )}
          </div>
        </>
      ) : null}

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

      {model ? (
        <div className="ember-voxel-objprops__groups">
          <p className="ember-voxel-sculpt__section">Группы цветов</p>
          {groups.length === 0 ? (
            <p className="muted ember-hint">Нет сплошных вокселей</p>
          ) : (
            <ul className="ember-voxel-objprops__group-list">
              {groups.map((g) => (
                <li key={g.index} className="ember-voxel-objprops__group">
                  <div className="ember-voxel-objprops__group-head">
                    <span
                      className="ember-voxel-objprops__swatch"
                      style={{ background: g.color }}
                    />
                    <span className="ember-voxel-objprops__group-meta">
                      #{g.index} · {g.count} кл.
                    </span>
                    <input
                      type="color"
                      className="ember-voxel-objprops__color"
                      value={
                        g.color.startsWith("#") ? g.color : "#888888"
                      }
                      title="Цвет слота палитры"
                      onChange={(e) =>
                        onSetPaletteColor(g.index, e.target.value)
                      }
                    />
                  </div>
                  <EditableRange
                    label="Свечение"
                    value={g.emitAvg}
                    min={0}
                    max={255}
                    onChange={(v) =>
                      onEditModel(
                        setPaletteGroupChannel(
                          model,
                          g.index,
                          "emissive",
                          v,
                        ),
                      )
                    }
                  />
                  <EditableRange
                    label="Блеск"
                    value={g.shineAvg}
                    min={0}
                    max={255}
                    onChange={(v) =>
                      onEditModel(
                        setPaletteGroupChannel(
                          model,
                          g.index,
                          "shine",
                          v,
                        ),
                      )
                    }
                  />
                  <EditableRange
                    label="Прозрачность"
                    value={g.transparencyAvg}
                    min={0}
                    max={255}
                    title="0 = непрозрачный · выше = стекло, свет проходит"
                    onChange={(v) =>
                      onEditModel(
                        setPaletteGroupChannel(
                          model,
                          g.index,
                          "transparency",
                          v,
                        ),
                      )
                    }
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
