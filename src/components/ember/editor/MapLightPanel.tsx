import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import {
  lightsFileFromPresets,
  lampParamsFromSource,
  newLightPresetId,
  normalizeLightPreset,
} from "../../../game/content/lightPresets";
import { writeEmberJson } from "../../../game/content/io";
import type {
  EmberLightPreset,
  EmberLightSource,
  EmberMap,
  EmberMapLight,
  EmberPack,
  EmberTileset,
} from "../../../game/content/types";
import {
  MAP_DYNAMIC_POINT_SHADOWS_MAX,
  MAP_DYNAMIC_SHADOW_SCALE_MIN,
  MAP_LIGHT_RANGE_MAX,
  MAP_POINT_LIGHTS_MAX,
  MAP_POINT_SHADOWS_MAX,
} from "../../../game/tile/lightLimits";
import {
  clampLampDiscRadii,
  omitUnsetLightBudget,
  resolveMapAtmosphere,
  resolveMapGrade,
  type LanternSource,
  type ResolvedMapLight,
} from "../../../game/tile/mapUtils";
import { countMapLocalLightObjects } from "../../../game/three/emissiveLocalLights";
import {
  copyLampParams,
  hasLampClipboard,
  peekLampClipboard,
} from "./lightClipboard";

type Props = {
  pack: EmberPack;
  map: EmberMap;
  tileset: EmberTileset;
  globalLight: ResolvedMapLight;
  sources: LanternSource[];
  selected: LanternSource | null;
  /** True when the map tool «Свет» (lightpick) is active. */
  pickModeActive: boolean;
  onActivatePickMode: () => void;
  onSelectSource: (id: string | null) => void;
  onCommitGlobal: (light: EmberMapLight) => void;
  onResetGlobal: () => void;
  onCommitSource: (
    source: EmberLightSource,
    opts?: { history?: boolean },
  ) => void;
  onBeginSourceEdit?: () => void;
  onDeleteSource: (id: string) => void;
  onClearSourceOverrides: (id: string) => void;
  onPackChange?: (pack: EmberPack) => void;
  onSaved?: (msg: string) => void;
};

export type LightSourceEditorProps = {
  selected: LanternSource;
  globalLight: ResolvedMapLight;
  pack: EmberPack;
  compact?: boolean;
  mapWidth?: number;
  mapHeight?: number;
  /** `history: false` = live slider preview without undo step. */
  onCommitSource: (
    source: EmberLightSource,
    opts?: { history?: boolean },
  ) => void;
  /** One undo checkpoint at the start of a slider drag. */
  onBeginSourceEdit?: () => void;
  onDeleteSource: (id: string) => void;
  onClearSourceOverrides: (id: string) => void;
  onMoveSource?: (id: string, x: number, y: number) => void;
  onBeginSourceGrabMove?: (id: string) => void;
  onPackChange?: (pack: EmberPack) => void;
  onSaved?: (msg: string) => void;
  onClose?: () => void;
};

function fmtNum(n: number, digits = 2): string {
  return n.toFixed(digits).replace(/\.?0+$/, "") || "0";
}

function newLightId(): string {
  return `light_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

/** Per-source lamp controls — dock section + canvas float. */
export function LightSourceEditor({
  selected,
  globalLight,
  pack,
  compact = false,
  mapWidth,
  mapHeight,
  onCommitSource,
  onBeginSourceEdit,
  onDeleteSource,
  onClearSourceOverrides,
  onMoveSource,
  onBeginSourceGrabMove,
  onPackChange,
  onSaved,
  onClose,
}: LightSourceEditorProps) {
  const [srcDraft, setSrcDraft] = useState<ResolvedMapLight>(() => ({
    ...globalLight,
    ...selected.params,
  }));
  const srcDraftRef = useRef(srcDraft);
  const [presetName, setPresetName] = useState("");
  const [clipTick, setClipTick] = useState(0);
  const presets = useMemo(
    () =>
      Object.values(pack.lightPresets ?? {}).sort((a, b) =>
        a.nameRu.localeCompare(b.nameRu, "ru"),
      ),
    [pack.lightPresets],
  );

  useEffect(() => {
    const next = {
      ...globalLight,
      ...selected.params,
    };
    setSrcDraft(next);
    srcDraftRef.current = next;
  }, [selected, globalLight]);

  const patchSource = (partial: Partial<ResolvedMapLight>) => {
    const next = { ...srcDraftRef.current, ...partial };
    srcDraftRef.current = next;
    setSrcDraft(next);
    return next;
  };

  const historyArmedRef = useRef(false);

  const commitDraft = (history: boolean) => {
    const d = srcDraftRef.current;
    const discs = clampLampDiscRadii(
      d.lampDiscCore,
      d.lampDiscMid,
      d.lampRange,
    );
    onCommitSource(
      {
        id: selected.hasOverride ? selected.id : newLightId(),
        x: selected.x,
        y: selected.y,
        enabled: true,
        lampColor: d.lampColor,
        lampFaceColor: d.lampFaceColor,
        lampRange: discs.range,
        lampDiscCore: discs.core,
        lampDiscMid: discs.mid,
        lampHeight: d.lampHeight,
        lampShowCore: d.lampShowCore,
        lampStrength0: d.lampStrength0,
        lampStrengthFalloff: d.lampStrengthFalloff,
        lampTorchFlicker: d.lampTorchFlicker,
      },
      { history },
    );
  };

  const patchAndCommitSource = (partial: Partial<ResolvedMapLight>) => {
    patchSource(partial);
    commitDraft(true);
  };

  /** Live scene update while dragging; one undo step per gesture. */
  const onSourceRange =
    (
      key:
        | "lampRange"
        | "lampDiscCore"
        | "lampDiscMid"
        | "lampHeight"
        | "lampStrength0"
        | "lampStrengthFalloff",
    ) =>
    (e: ChangeEvent<HTMLInputElement>) => {
      const raw = Number(e.target.value) || 0;
      const cur = srcDraftRef.current;
      if (
        key === "lampRange" ||
        key === "lampDiscCore" ||
        key === "lampDiscMid"
      ) {
        const nextRange =
          key === "lampRange"
            ? Math.max(1, Math.min(MAP_LIGHT_RANGE_MAX, Math.round(raw)))
            : cur.lampRange;
        const nextCore =
          key === "lampDiscCore"
            ? Math.max(1, Math.min(MAP_LIGHT_RANGE_MAX, Math.round(raw)))
            : cur.lampDiscCore;
        const nextMid =
          key === "lampDiscMid"
            ? Math.max(1, Math.min(MAP_LIGHT_RANGE_MAX, Math.round(raw)))
            : cur.lampDiscMid;
        const discs = clampLampDiscRadii(nextCore, nextMid, nextRange);
        patchSource({
          lampRange: discs.range,
          lampDiscCore: discs.core,
          lampDiscMid: discs.mid,
        });
      } else if (key === "lampHeight") {
        patchSource({
          lampHeight: Math.max(0.2, Math.min(3, raw)),
        });
      } else {
        patchSource({ [key]: raw });
      }
      commitDraft(false);
    };

  const armHistory = () => {
    if (historyArmedRef.current) return;
    historyArmedRef.current = true;
    onBeginSourceEdit?.();
  };

  const releaseHistory = () => {
    historyArmedRef.current = false;
  };

  const currentParams = () => lampParamsFromSource(srcDraftRef.current);

  const applyParams = (partial: Partial<ResolvedMapLight>, history = true) => {
    patchSource(partial);
    commitDraft(history);
  };

  const persistPresets = async (
    next: Record<string, EmberLightPreset>,
    msg: string,
  ) => {
    if (!onPackChange) {
      onSaved?.("Нет колбэка пака — пресет не сохранён");
      return;
    }
    const res = await writeEmberJson(
      "lights/registry.json",
      lightsFileFromPresets(next),
    );
    if (!res.ok) {
      onSaved?.(res.error || "Не удалось сохранить пресеты света");
      return;
    }
    onPackChange({ ...pack, lightPresets: next });
    onSaved?.(msg);
  };

  const saveCurrentAsPreset = () => {
    const name =
      presetName.trim() ||
      `Свет ${presets.length + 1}`;
    const id = newLightPresetId();
    const preset = normalizeLightPreset({
      id,
      nameRu: name,
      ...currentParams(),
    });
    if (!preset) return;
    void persistPresets(
      { ...(pack.lightPresets ?? {}), [id]: preset },
      `Пресет «${preset.nameRu}» сохранён`,
    );
    setPresetName("");
  };

  const overwritePreset = (preset: EmberLightPreset) => {
    const next = normalizeLightPreset({
      ...preset,
      ...currentParams(),
      id: preset.id,
      nameRu: preset.nameRu,
    });
    if (!next) return;
    void persistPresets(
      { ...(pack.lightPresets ?? {}), [preset.id]: next },
      `Пресет «${preset.nameRu}» перезаписан`,
    );
  };

  const deletePreset = (presetId: string) => {
    const cur = pack.lightPresets ?? {};
    const name = cur[presetId]?.nameRu ?? presetId;
    const next = { ...cur };
    delete next[presetId];
    void persistPresets(next, `Пресет «${name}» удалён`);
  };

  const kindLabel =
    selected.kind === "placed" ? "свой" : "glow";
  const kindMeta = selected.hasOverride
    ? `${kindLabel} · override`
    : kindLabel;
  const canPaste = clipTick >= 0 && hasLampClipboard();
  const w = Math.max(1, mapWidth ?? 1);
  const h = Math.max(1, mapHeight ?? 1);
  const canMove = Boolean(onMoveSource);
  const moveBy = (dx: number, dy: number) => {
    if (!onMoveSource) return;
    const nx = Math.max(0, Math.min(w - 1, selected.x + dx));
    const ny = Math.max(0, Math.min(h - 1, selected.y + dy));
    if (nx === selected.x && ny === selected.y) return;
    onMoveSource(selected.id, nx, ny);
  };

  return (
    <div
      className={[
        "ember-map-light-source",
        compact ? "ember-map-light-source--compact" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="ember-map-light-source__head">
        <div className="ember-map-light-source__title">
          <strong>
            {selected.x},{selected.y}
          </strong>
          <span className="ember-map-light-source__kind">{kindMeta}</span>
        </div>
        {onClose ? (
          <button
            type="button"
            className="ghost ember-map-light-source__close"
            aria-label="Закрыть"
            onClick={onClose}
          >
            ×
          </button>
        ) : null}
      </div>

      {canMove ? (
        <div className="ember-map-light-source__place">
          <p className="ember-map-light-source__section">Размещение</p>
          <p className="ember-map-light-source__section ember-map-light-source__section--sub">
            Переместить
          </p>
          <div
            className="ember-map-inspector__pad"
            role="group"
            aria-label="Сдвиг"
          >
            <button
              type="button"
              className="ghost"
              title="Север (−Y)"
              onClick={() => moveBy(0, -1)}
            >
              ↑
            </button>
            <div className="ember-map-inspector__pad-mid">
              <button
                type="button"
                className="ghost"
                title="Запад (−X)"
                onClick={() => moveBy(-1, 0)}
              >
                ←
              </button>
              <button
                type="button"
                className="ghost"
                title="Юг (+Y)"
                onClick={() => moveBy(0, 1)}
              >
                ↓
              </button>
              <button
                type="button"
                className="ghost"
                title="Восток (+X)"
                onClick={() => moveBy(1, 0)}
              >
                →
              </button>
            </div>
          </div>
          {onBeginSourceGrabMove ? (
            <button
              type="button"
              className="ghost ember-map-light-source__btn"
              title="Перенос к курсору (G)"
              onClick={() => onBeginSourceGrabMove(selected.id)}
            >
              G · перенос к курсору
            </button>
          ) : null}
          <p className="muted ember-hint">
            На карте: G — перенос к курсору · клик — подтвердить · Esc — отмена
          </p>
        </div>
      ) : null}

      <div className="ember-map-light-source__swatches">
        <label className="ember-map-light-source__swatch" title="Цвет пола">
          <input
            type="color"
            value={srcDraft.lampColor}
            aria-label="Цвет пола"
            onChange={(e) =>
              patchAndCommitSource({ lampColor: e.target.value })
            }
          />
          <span>Пол</span>
        </label>
        <label className="ember-map-light-source__swatch" title="Цвет стен">
          <input
            type="color"
            value={srcDraft.lampFaceColor}
            aria-label="Цвет стен"
            onChange={(e) =>
              patchAndCommitSource({ lampFaceColor: e.target.value })
            }
          />
          <span>Стены</span>
        </label>
      </div>

      <div className="ember-map-light-source__sliders">
        <label className="ember-map-light-source__row">
          <span>Ядро (тайлы)</span>
          <input
            type="range"
            min={1}
            max={MAP_LIGHT_RANGE_MAX}
            step={1}
            value={srcDraft.lampDiscCore}
            onPointerDown={armHistory}
            onPointerUp={releaseHistory}
            onChange={onSourceRange("lampDiscCore")}
          />
          <em>{srcDraft.lampDiscCore}</em>
        </label>
        <label className="ember-map-light-source__row">
          <span>Кольцо (тайлы)</span>
          <input
            type="range"
            min={1}
            max={MAP_LIGHT_RANGE_MAX}
            step={1}
            value={srcDraft.lampDiscMid}
            onPointerDown={armHistory}
            onPointerUp={releaseHistory}
            onChange={onSourceRange("lampDiscMid")}
          />
          <em>{srcDraft.lampDiscMid}</em>
        </label>
        <label className="ember-map-light-source__row">
          <span>Край / дальность</span>
          <input
            type="range"
            min={1}
            max={MAP_LIGHT_RANGE_MAX}
            step={1}
            value={srcDraft.lampRange}
            onPointerDown={armHistory}
            onPointerUp={releaseHistory}
            onChange={onSourceRange("lampRange")}
          />
          <em>{srcDraft.lampRange}</em>
        </label>
        <label className="ember-map-light-source__row">
          <span>Высота</span>
          <input
            type="range"
            min={0.2}
            max={3}
            step={0.05}
            value={srcDraft.lampHeight}
            onPointerDown={armHistory}
            onPointerUp={releaseHistory}
            onChange={onSourceRange("lampHeight")}
          />
          <em>{fmtNum(srcDraft.lampHeight)}</em>
        </label>
        <label className="ember-map-light-source__row ember-map-light-source__row--check">
          <span>Точка света</span>
          <input
            type="checkbox"
            checked={srcDraft.lampShowCore}
            onChange={(e) => {
              armHistory();
              patchSource({ lampShowCore: e.target.checked });
              commitDraft(true);
              releaseHistory();
            }}
          />
          <em>{srcDraft.lampShowCore ? "видн." : "скрыта"}</em>
        </label>
        <label className="ember-map-light-source__row ember-map-light-source__row--check">
          <span>Мерцание факела</span>
          <input
            type="checkbox"
            checked={srcDraft.lampTorchFlicker}
            onChange={(e) => {
              armHistory();
              patchSource({ lampTorchFlicker: e.target.checked });
              commitDraft(true);
              releaseHistory();
            }}
          />
          <em>{srcDraft.lampTorchFlicker ? "вкл" : "выкл"}</em>
        </label>
        <label className="ember-map-light-source__row">
          <span>Сила (центр)</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={srcDraft.lampStrength0}
            onPointerDown={armHistory}
            onPointerUp={releaseHistory}
            onChange={onSourceRange("lampStrength0")}
          />
          <em>{fmtNum(srcDraft.lampStrength0)}</em>
        </label>
        <label className="ember-map-light-source__row">
          <span>Заливка диска</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={srcDraft.lampStrengthFalloff}
            onPointerDown={armHistory}
            onPointerUp={releaseHistory}
            onChange={onSourceRange("lampStrengthFalloff")}
          />
          <em>{fmtNum(srcDraft.lampStrengthFalloff)}</em>
        </label>
      </div>

      <div className="ember-map-light-source__presets">
        <div className="ember-map-light-source__preset-tools">
          <button
            type="button"
            className="ghost ember-map-light-source__btn"
            title="Скопировать параметры света"
            onClick={() => {
              copyLampParams(currentParams());
              setClipTick((n) => n + 1);
              onSaved?.("Параметры света скопированы");
            }}
          >
            Копировать
          </button>
          <button
            type="button"
            className="ghost ember-map-light-source__btn"
            title="Вставить скопированные параметры"
            disabled={!canPaste}
            onClick={() => {
              const clip = peekLampClipboard();
              if (!clip) return;
              onBeginSourceEdit?.();
              applyParams(clip, true);
              onSaved?.("Параметры света вставлены");
            }}
          >
            Вставить
          </button>
        </div>
        {onPackChange ? (
          <>
            <div className="ember-map-light-source__preset-save">
              <input
                className="ember-map-light-source__preset-input"
                placeholder="Имя пресета"
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    saveCurrentAsPreset();
                  }
                }}
              />
              <button
                type="button"
                className="ghost ember-map-light-source__btn"
                title="Сохранить текущие параметры как пресет пака"
                onClick={saveCurrentAsPreset}
              >
                Сохранить
              </button>
            </div>
            {presets.length > 0 ? (
              <ul className="ember-map-light-source__preset-list">
                {presets.map((p) => (
                  <li key={p.id} className="ember-map-light-source__preset-item">
                    <button
                      type="button"
                      className="ember-map-light-source__preset-swatch"
                      style={{ background: p.lampColor }}
                      title={`Применить «${p.nameRu}»`}
                      onClick={() => {
                        onBeginSourceEdit?.();
                        applyParams(p, true);
                        onSaved?.(`Пресет «${p.nameRu}» применён`);
                      }}
                    />
                    <button
                      type="button"
                      className="ember-map-light-source__preset-name"
                      title={`Применить «${p.nameRu}»`}
                      onClick={() => {
                        onBeginSourceEdit?.();
                        applyParams(p, true);
                        onSaved?.(`Пресет «${p.nameRu}» применён`);
                      }}
                    >
                      {p.nameRu}
                    </button>
                    <button
                      type="button"
                      className="ghost ember-map-light-source__btn"
                      title="Перезаписать текущими параметрами"
                      onClick={() => overwritePreset(p)}
                    >
                      ↻
                    </button>
                    <button
                      type="button"
                      className="ghost ember-danger ember-map-light-source__btn"
                      title="Удалить пресет"
                      onClick={() => deletePreset(p.id)}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted ember-hint">
                Пресеты появятся здесь и в библиотеке «Свет».
              </p>
            )}
          </>
        ) : null}
      </div>

      <div className="ember-map-light-source__actions">
        {selected.hasOverride ? (
          <button
            type="button"
            className="ghost ember-map-light-source__btn"
            title="Удалить только индивидуальные настройки и вернуть базовый glow-свет"
            onClick={() => onClearSourceOverrides(selected.id)}
          >
            Сбросить override
          </button>
        ) : null}
        <button
          type="button"
          className="ghost ember-danger ember-map-light-source__btn"
          title="Полностью выключить этот источник, включая свет от glow-тайла или glow-спрайта"
          onClick={() => onDeleteSource(selected.id)}
        >
          Удалить источник
        </button>
      </div>
    </div>
  );
}

export function MapLightPanel({
  pack,
  map,
  tileset,
  globalLight,
  sources,
  selected,
  pickModeActive,
  onActivatePickMode,
  onSelectSource,
  onCommitGlobal,
  onResetGlobal: _onResetGlobal,
  onCommitSource,
  onBeginSourceEdit,
  onDeleteSource,
  onClearSourceOverrides,
  onPackChange,
  onSaved,
}: Props) {
  const [draft, setDraft] = useState(globalLight);
  const draftRef = useRef(globalLight);
  const lightObjectCount = useMemo(
    () =>
      countMapLocalLightObjects(map, tileset, {
        sprites: pack.sprites,
        voxelModels: pack.voxelModels,
        voxelScenes: pack.voxelScenes,
      }),
    [map, pack.sprites, pack.voxelModels, pack.voxelScenes, tileset],
  );
  const cubeShadowFromObjects = Math.max(
    0,
    Math.min(MAP_POINT_SHADOWS_MAX, lightObjectCount),
  );

  useEffect(() => {
    setDraft(globalLight);
    draftRef.current = globalLight;
  }, [globalLight]);

  const patchGlobal = (partial: Partial<ResolvedMapLight>) => {
    const next: ResolvedMapLight = {
      ...draftRef.current,
      ...partial,
      grade: resolveMapGrade(
        partial.grade !== undefined
          ? { ...draftRef.current.grade, ...partial.grade }
          : draftRef.current.grade,
      ),
      atmosphere: resolveMapAtmosphere(
        partial.atmosphere !== undefined
          ? { ...draftRef.current.atmosphere, ...partial.atmosphere }
          : draftRef.current.atmosphere,
      ),
    };
    draftRef.current = next;
    setDraft(next);
    return next;
  };

  const flushGlobal = () => onCommitGlobal(omitUnsetLightBudget(draftRef.current));

  const patchAndCommitGlobal = (partial: Partial<ResolvedMapLight>) => {
    onCommitGlobal(omitUnsetLightBudget(patchGlobal(partial)));
  };

  const onGlobalRange =
    (key: keyof EmberMapLight) => (e: ChangeEvent<HTMLInputElement>) => {
      const raw = Number(e.target.value) || 0;
      if (
        key === "lampRange" ||
        key === "lampDiscCore" ||
        key === "lampDiscMid"
      ) {
        const cur = draftRef.current;
        const nextRange =
          key === "lampRange"
            ? Math.max(1, Math.min(MAP_LIGHT_RANGE_MAX, Math.round(raw)))
            : cur.lampRange;
        const nextCore =
          key === "lampDiscCore"
            ? Math.max(1, Math.min(MAP_LIGHT_RANGE_MAX, Math.round(raw)))
            : cur.lampDiscCore;
        const nextMid =
          key === "lampDiscMid"
            ? Math.max(1, Math.min(MAP_LIGHT_RANGE_MAX, Math.round(raw)))
            : cur.lampDiscMid;
        const discs = clampLampDiscRadii(nextCore, nextMid, nextRange);
        patchGlobal({
          lampRange: discs.range,
          lampDiscCore: discs.core,
          lampDiscMid: discs.mid,
        });
        return;
      }
      patchGlobal({ [key]: raw });
    };

  return (
    <div className="ember-map-lightpanel">
      <header className="ember-map-lightpanel__head">
        <div>
          <p className="ember-map-lightpanel__eyebrow">Освещение</p>
          <h3 className="ember-map-lightpanel__title">Фонари</h3>
        </div>
      </header>

      <p className="muted ember-hint">
        Источники на карте и дефолты ламп. Ночь, bloom и атмосфера — вкладка
        «Настройки».
      </p>

      <button
        type="button"
        className={`ember-map-lightpanel__pick ${pickModeActive ? "is-active" : ""}`}
        onClick={onActivatePickMode}
      >
        <span className="ember-map-lightpanel__pick-glyph" aria-hidden>
          L
        </span>
        <span className="ember-map-lightpanel__pick-text">
          <strong>
            {pickModeActive ? "Режим выбора активен" : "Выбрать источник на карте"}
          </strong>
          <span>
            {pickModeActive
              ? "Кликни фонарь — настройки появятся над ним"
              : "Включи режим, затем кликни источник на карте"}
          </span>
        </span>
      </button>

      <section className="ember-map-lightpanel__section">
        <h4>Лампы по умолчанию</h4>
        <div className="ember-map-lightpanel__grid">
          <label className="ember-map-lightpanel__field">
            <span>Лампы · пол</span>
            <input
              type="color"
              value={draft.lampColor}
              onChange={(e) =>
                patchAndCommitGlobal({ lampColor: e.target.value })
              }
            />
          </label>
          <label className="ember-map-lightpanel__field">
            <span>Лампы · стены</span>
            <input
              type="color"
              value={draft.lampFaceColor}
              onChange={(e) =>
                patchAndCommitGlobal({ lampFaceColor: e.target.value })
              }
            />
          </label>
          <label className="ember-map-lightpanel__field">
            <span>Ядро по умолч.</span>
            <input
              type="range"
              min={1}
              max={MAP_LIGHT_RANGE_MAX}
              step={1}
              value={draft.lampDiscCore}
              onChange={onGlobalRange("lampDiscCore")}
              onPointerUp={flushGlobal}
              onKeyUp={flushGlobal}
            />
            <strong>{draft.lampDiscCore}</strong>
          </label>
          <label className="ember-map-lightpanel__field">
            <span>Кольцо по умолч.</span>
            <input
              type="range"
              min={1}
              max={MAP_LIGHT_RANGE_MAX}
              step={1}
              value={draft.lampDiscMid}
              onChange={onGlobalRange("lampDiscMid")}
              onPointerUp={flushGlobal}
              onKeyUp={flushGlobal}
            />
            <strong>{draft.lampDiscMid}</strong>
          </label>
          <label className="ember-map-lightpanel__field">
            <span>Край / дальность</span>
            <input
              type="range"
              min={1}
              max={MAP_LIGHT_RANGE_MAX}
              step={1}
              value={draft.lampRange}
              onChange={onGlobalRange("lampRange")}
              onPointerUp={flushGlobal}
              onKeyUp={flushGlobal}
            />
            <strong>{draft.lampRange}</strong>
          </label>
          <label className="ember-map-lightpanel__field">
            <span>Высота по умолч.</span>
            <input
              type="range"
              min={0.2}
              max={3}
              step={0.05}
              value={draft.lampHeight}
              onChange={onGlobalRange("lampHeight")}
              onPointerUp={flushGlobal}
              onKeyUp={flushGlobal}
            />
            <strong>{fmtNum(draft.lampHeight)}</strong>
          </label>
          <label className="ember-map-lightpanel__field">
            <span>Точка света</span>
            <input
              type="checkbox"
              checked={draft.lampShowCore}
              onChange={(e) =>
                patchAndCommitGlobal({ lampShowCore: e.target.checked })
              }
            />
            <strong>{draft.lampShowCore ? "видн." : "скрыта"}</strong>
          </label>
          <label className="ember-map-lightpanel__field">
            <span>Мерцание по умолч.</span>
            <input
              type="checkbox"
              checked={draft.lampTorchFlicker}
              onChange={(e) =>
                patchAndCommitGlobal({ lampTorchFlicker: e.target.checked })
              }
            />
            <strong>{draft.lampTorchFlicker ? "вкл" : "выкл"}</strong>
          </label>
          <label className="ember-map-lightpanel__field">
            <span>Сила в центре</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={draft.lampStrength0}
              onChange={onGlobalRange("lampStrength0")}
              onPointerUp={flushGlobal}
              onKeyUp={flushGlobal}
            />
            <strong>{fmtNum(draft.lampStrength0)}</strong>
          </label>
          <label className="ember-map-lightpanel__field ember-map-lightpanel__field--full">
            <span>Мощность ламп (Three)</span>
            <input
              type="range"
              min={0}
              max={4}
              step={0.01}
              value={draft.lampPower}
              onChange={onGlobalRange("lampPower")}
              onPointerUp={flushGlobal}
              onKeyUp={flushGlobal}
            />
            <strong>{fmtNum(draft.lampPower)}</strong>
          </label>
        </div>
      </section>

      <section className="ember-map-lightpanel__section">
        <h4>На экране</h4>
        <p className="muted ember-hint">
          Сколько PointLight видно сразу. «Теней (cube)» в режиме авто равно
          числу объектов со светом на карте. «По объектам» записывает это
          число и для динамических кубов. «Динамических рядом» — живые кубы
          с актёрами (до числа объектов на карте).
        </p>
        <div className="ember-map-lightpanel__grid">
          <label className="ember-map-lightpanel__field ember-map-lightpanel__field--full">
            <span>Источников на экране</span>
            <input
              type="range"
              min={1}
              max={MAP_POINT_LIGHTS_MAX}
              step={1}
              value={draft.maxPointLights ?? 24}
              onChange={(e) => {
                const raw = Math.round(Number(e.target.value));
                if (!Number.isFinite(raw)) return;
                patchGlobal({
                  maxPointLights: Math.max(
                    1,
                    Math.min(MAP_POINT_LIGHTS_MAX, raw),
                  ),
                });
              }}
              onPointerUp={flushGlobal}
              onKeyUp={flushGlobal}
            />
            <span className="ember-map-lightpanel__value-row">
              <strong>
                {draft.maxPointLights == null ? "авто" : draft.maxPointLights}
              </strong>
              {draft.maxPointLights != null ? (
                <button
                  type="button"
                  className="ghost ember-chip--sm"
                  onClick={() =>
                    patchAndCommitGlobal({ maxPointLights: null })
                  }
                >
                  Авто
                </button>
              ) : null}
            </span>
          </label>
          <div className="ember-map-lightpanel__field ember-map-lightpanel__field--full">
            <span>Теней (cube)</span>
            <input
              type="range"
              min={0}
              max={MAP_POINT_SHADOWS_MAX}
              step={1}
              value={draft.maxPointShadows ?? cubeShadowFromObjects}
              onChange={(e) => {
                const raw = Math.round(Number(e.target.value));
                if (!Number.isFinite(raw)) return;
                patchGlobal({
                  maxPointShadows: Math.max(
                    0,
                    Math.min(MAP_POINT_SHADOWS_MAX, raw),
                  ),
                });
              }}
              onPointerUp={flushGlobal}
              onKeyUp={flushGlobal}
            />
            <span className="ember-map-lightpanel__value-row">
              <strong>
                {draft.maxPointShadows == null
                  ? `авто · ${cubeShadowFromObjects}`
                  : draft.maxPointShadows}
              </strong>
              <button
                type="button"
                className={`ghost ember-chip--sm${draft.maxPointShadows == null ? " is-active" : ""}`}
                onClick={() =>
                  patchAndCommitGlobal({ maxPointShadows: null })
                }
              >
                Авто
              </button>
              <button
                type="button"
                className={`ghost ember-chip--sm${draft.maxPointShadows === cubeShadowFromObjects ? " is-active" : ""}`}
                onClick={() =>
                  patchAndCommitGlobal({
                    maxPointShadows: cubeShadowFromObjects,
                  })
                }
              >
                По объектам
              </button>
            </span>
          </div>
          <div className="ember-map-lightpanel__field ember-map-lightpanel__field--full">
            <span>Динамических рядом</span>
            <input
              type="range"
              min={0}
              max={MAP_DYNAMIC_POINT_SHADOWS_MAX}
              step={1}
              value={draft.dynamicPointShadows}
              onChange={(e) =>
                patchGlobal({
                  dynamicPointShadows: Math.max(
                    0,
                    Math.min(
                      MAP_DYNAMIC_POINT_SHADOWS_MAX,
                      Math.round(Number(e.target.value)),
                    ),
                  ),
                })
              }
              onPointerUp={flushGlobal}
              onKeyUp={flushGlobal}
            />
            <span className="ember-map-lightpanel__value-row">
              <strong>{draft.dynamicPointShadows}</strong>
              <button
                type="button"
                className={`ghost ember-chip--sm${draft.dynamicPointShadows === cubeShadowFromObjects ? " is-active" : ""}`}
                onClick={() =>
                  patchAndCommitGlobal({
                    dynamicPointShadows: cubeShadowFromObjects,
                  })
                }
              >
                По объектам
              </button>
            </span>
          </div>
          <label className="ember-map-lightpanel__field">
            <span>Включение (% радиуса)</span>
            <input
              type="range"
              min={MAP_DYNAMIC_SHADOW_SCALE_MIN}
              max={1}
              step={0.05}
              value={draft.dynamicShadowEnterScale}
              onChange={(e) => {
                const enter = Number(e.target.value);
                patchGlobal({
                  dynamicShadowEnterScale: enter,
                  dynamicShadowExitScale: Math.max(
                    enter,
                    draftRef.current.dynamicShadowExitScale,
                  ),
                });
              }}
              onPointerUp={flushGlobal}
              onKeyUp={flushGlobal}
            />
            <strong>
              {Math.round(draft.dynamicShadowEnterScale * 100)}%
            </strong>
          </label>
          <label className="ember-map-lightpanel__field">
            <span>Выключение (% радиуса)</span>
            <input
              type="range"
              min={draft.dynamicShadowEnterScale}
              max={1}
              step={0.05}
              value={Math.min(1, draft.dynamicShadowExitScale)}
              onChange={(e) =>
                patchGlobal({
                  dynamicShadowExitScale: Math.max(
                    draftRef.current.dynamicShadowEnterScale,
                    Number(e.target.value),
                  ),
                })
              }
              onPointerUp={flushGlobal}
              onKeyUp={flushGlobal}
            />
            <strong>{Math.round(draft.dynamicShadowExitScale * 100)}%</strong>
          </label>
        </div>
      </section>

      <section className="ember-map-lightpanel__section">
        <div className="ember-map-lightpanel__section-head">
          <h4>Источники ({sources.length})</h4>
          {selected ? (
            <button
              type="button"
              className="ghost"
              onClick={() => onSelectSource(null)}
            >
              Снять выбор
            </button>
          ) : null}
        </div>

        {sources.length === 0 ? (
          <p className="muted ember-hint">
            Нет фонарей. Поставь glow-тайл/спрайт или кликни клетку на карте.
          </p>
        ) : (
          <div className="ember-map-lightpanel__list">
            {sources.map((s) => (
              <button
                key={s.id}
                type="button"
                className={`ember-map-lightpanel__src ${
                  selected?.id === s.id ? "is-active" : ""
                }`}
                onClick={() => onSelectSource(s.id)}
              >
                <span
                  className="ember-map-lightpanel__swatch"
                  style={{ background: s.params.lampColor }}
                />
                <span className="ember-map-lightpanel__src-text">
                  <strong>
                    {s.x},{s.y}
                  </strong>
                  <span>
                    {s.kind === "placed" ? "свой" : "glow"} · R
                    {s.params.lampRange}
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}
      </section>

      {selected ? (
        <section className="ember-map-lightpanel__section ember-map-lightpanel__section--source">
          <LightSourceEditor
            selected={selected}
            globalLight={globalLight}
            pack={pack}
            onCommitSource={onCommitSource}
            onBeginSourceEdit={onBeginSourceEdit}
            onDeleteSource={onDeleteSource}
            onClearSourceOverrides={onClearSourceOverrides}
            onPackChange={onPackChange}
            onSaved={onSaved}
          />
        </section>
      ) : null}
    </div>
  );
}
