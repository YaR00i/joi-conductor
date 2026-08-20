/**
 * Kind-aware editor for a single map region (zones on a tile / regions dock).
 */
import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import type {
  EmberMap,
  EmberMapRegion,
  EmberPack,
  MapRegionKind,
} from "../../../game/content/types";
import { MAX_ELEVATION } from "../../../game/content/types";
import {
  clampChestModelOffset,
  clampChestModelScale,
  resolveChestModelPose,
} from "../../../game/voxel/chestPlacement";
import {
  chestRegionFromVoxelModel,
  chestRegionFromVoxelScene,
} from "../../../game/voxel/voxelModelApply";
import {
  clampVoxelDirectLightScale,
  DEFAULT_VOXEL_DIRECT_LIGHT_SCALE,
} from "../../../game/voxel/voxelMesher";
import { normalizeVoxelRot } from "../../../game/voxel/voxelPlacement";
import {
  MAP_REGION_KIND_COLOR,
  MAP_REGION_KIND_LABEL,
  MAP_REGION_KIND_ORDER,
} from "./mapRegionHelpers";
import { ModelOutlineFields } from "./ModelOutlineFields";

const TP_HOVER_FOCUS_KEY = "ember-tp-hover-focus";

export type MapRegionEditorProps = {
  region: EmberMapRegion;
  map: EmberMap;
  pack?: EmberPack;
  /** Compact card for tile inspector. */
  compact?: boolean;
  /** Hide delete (e.g. library draft before placement). */
  hideDelete?: boolean;
  onChange: (next: EmberMapRegion) => void;
  onDelete: () => void;
  onFocus?: () => void;
  /** Wire reciprocal teleport A↔B when target is another teleport. */
  onPairLink?: (fromId: string, toId: string) => void;
  /**
   * Hover preview of another teleport (camera focus + blink).
   * `null` clears the preview.
   */
  onHoverPeer?: (regionId: string | null) => void;
  /** Open voxel sculptor on a chest scene (joints / clips). */
  onOpenVoxelScene?: (sceneId: string) => void;
};

function clampInt(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, Math.round(v)));
}

function regionCovers(r: EmberMapRegion, tx: number, ty: number): boolean {
  return (
    tx >= r.x && tx < r.x + r.w && ty >= r.y && ty < r.y + r.h
  );
}

/** Regions that contain tile (tx, ty). */
export function regionsAtTile(
  map: EmberMap,
  tx: number,
  ty: number,
): EmberMapRegion[] {
  return map.regions.filter((r) => regionCovers(r, tx, ty));
}

/**
 * Best zone to highlight when picking a tile.
 * Skips map-wide `camera_bound` so selecting grass doesn't flood the whole
 * map with region outlines.
 */
export function primaryRegionAtTile(
  map: EmberMap,
  tx: number,
  ty: number,
): EmberMapRegion | null {
  const zones = regionsAtTile(map, tx, ty);
  return (
    zones.find((r) => r.kind !== "camera_bound") ??
    null
  );
}

export function MapRegionEditor({
  region,
  map,
  pack,
  compact,
  hideDelete,
  onChange,
  onDelete,
  onFocus,
  onPairLink,
  onHoverPeer,
  onOpenVoxelScene,
}: MapRegionEditorProps) {
  const [hoverFocus, setHoverFocus] = useState(() => {
    try {
      return sessionStorage.getItem(TP_HOVER_FOCUS_KEY) !== "0";
    } catch {
      return true;
    }
  });

  useEffect(() => {
    return () => onHoverPeer?.(null);
  }, [onHoverPeer]);

  const linkTargets = useMemo(() => {
    return map.regions
      .filter((r) => r.id !== region.id)
      .slice()
      .sort((a, b) => a.id.localeCompare(b.id));
  }, [map.regions, region.id]);

  const teleportPeers = useMemo(() => {
    return map.regions
      .filter((r) => r.kind === "teleport" && r.id !== region.id)
      .slice()
      .sort((a, b) => a.id.localeCompare(b.id));
  }, [map.regions, region.id]);

  const linkedEvents = useMemo(() => {
    if (!pack || region.kind !== "trigger") return [];
    return Object.values(pack.events ?? {}).filter(
      (ev) =>
        ev.trigger === "on_region_enter" && ev.regionId === region.id,
    );
  }, [pack, region.kind, region.id]);

  const setHoverFocusPref = (on: boolean) => {
    setHoverFocus(on);
    try {
      sessionStorage.setItem(TP_HOVER_FOCUS_KEY, on ? "1" : "0");
    } catch {
      /* ignore */
    }
    if (!on) onHoverPeer?.(null);
  };

  const patch = (partial: Partial<EmberMapRegion>) => {
    onChange({ ...region, ...partial });
  };

  const onNum =
    (key: "x" | "y" | "w" | "h" | "targetX" | "targetY" | "targetElevation") =>
    (e: ChangeEvent<HTMLInputElement>) => {
      const raw = Number(e.target.value);
      if (key === "x") {
        patch({ x: clampInt(raw, 0, Math.max(0, map.width - region.w)) });
        return;
      }
      if (key === "y") {
        patch({ y: clampInt(raw, 0, Math.max(0, map.height - region.h)) });
        return;
      }
      if (key === "w") {
        const w = clampInt(raw, 1, map.width);
        patch({
          w,
          x: clampInt(region.x, 0, Math.max(0, map.width - w)),
        });
        return;
      }
      if (key === "h") {
        const h = clampInt(raw, 1, map.height);
        patch({
          h,
          y: clampInt(region.y, 0, Math.max(0, map.height - h)),
        });
        return;
      }
      if (key === "targetX") {
        patch({
          targetX: clampInt(raw, 0, map.width - 1),
          targetRegionId: undefined,
        });
        return;
      }
      if (key === "targetY") {
        patch({
          targetY: clampInt(raw, 0, map.height - 1),
          targetRegionId: undefined,
        });
        return;
      }
      if (key === "targetElevation") {
        patch({ targetElevation: clampInt(raw, 0, 8) });
      }
    };

  const linkMode: "region" | "tile" = region.targetRegionId
    ? "region"
    : "tile";

  const setLinkMode = (mode: "region" | "tile") => {
    if (mode === "region") {
      const first = linkTargets[0];
      patch({
        targetRegionId: first?.id,
        targetX: undefined,
        targetY: undefined,
      });
      return;
    }
    patch({
      targetRegionId: undefined,
      targetX: region.targetX ?? region.x,
      targetY: region.targetY ?? region.y,
    });
  };

  return (
    <section
      className={`ember-map-region-ed ${compact ? "ember-map-region-ed--compact" : ""}`}
    >
      <header className="ember-map-region-ed__head">
        <span
          className="ember-map-region-ed__swatch"
          style={{ background: MAP_REGION_KIND_COLOR[region.kind] }}
          aria-hidden
        />
        <div className="ember-map-region-ed__titles">
          <strong>{MAP_REGION_KIND_LABEL[region.kind]}</strong>
          <span className="muted">{region.id}</span>
        </div>
        {onFocus ? (
          <button type="button" className="ghost ember-chip--sm" onClick={onFocus}>
            На карте
          </button>
        ) : null}
      </header>

      <label className="ember-map-region-ed__field">
        <span>Id</span>
        <input
          type="text"
          value={region.id}
          onChange={(e) => {
            const id = e.target.value.trim().replace(/\s+/g, "_");
            if (!id) return;
            patch({ id });
          }}
        />
      </label>

      <label className="ember-map-region-ed__field">
        <span>Тип</span>
        <select
          value={region.kind}
          onChange={(e) => {
            const kind = e.target.value as MapRegionKind;
            const next: EmberMapRegion = { ...region, kind };
            if (kind === "teleport" && !next.targetRegionId && next.targetX == null) {
              next.targetX = region.x;
              next.targetY = region.y;
            }
            if (kind === "trigger" && next.scriptId == null) next.scriptId = "";
            if (kind === "spawn" && !next.group) next.group = next.id;
            patch(next);
          }}
        >
          {MAP_REGION_KIND_ORDER.map((k) => (
            <option key={k} value={k}>
              {MAP_REGION_KIND_LABEL[k]}
            </option>
          ))}
        </select>
      </label>

      <div className="ember-map-region-ed__grid4">
        <label className="ember-map-region-ed__field">
          <span>X</span>
          <input type="number" min={0} max={map.width - 1} value={region.x} onChange={onNum("x")} />
        </label>
        <label className="ember-map-region-ed__field">
          <span>Y</span>
          <input type="number" min={0} max={map.height - 1} value={region.y} onChange={onNum("y")} />
        </label>
        <label className="ember-map-region-ed__field">
          <span>W</span>
          <input type="number" min={1} max={map.width} value={region.w} onChange={onNum("w")} />
        </label>
        <label className="ember-map-region-ed__field">
          <span>H</span>
          <input type="number" min={1} max={map.height} value={region.h} onChange={onNum("h")} />
        </label>
      </div>

      {region.kind === "spawn" ? (
        <label className="ember-map-region-ed__field">
          <span>Группа спавна</span>
          <input
            type="text"
            value={region.group ?? ""}
            placeholder={region.id}
            onChange={(e) =>
              patch({ group: e.target.value.trim() || undefined })
            }
          />
        </label>
      ) : null}

      {region.kind === "chest" ? (
        <div className="ember-map-region-ed__block ember-map-region-ed__chest">
          <p className="muted ember-hint">
            Лут — пул стадии (`chestPoolId`). Зона X/Y/W/H — триггер; визуал
            настраивается ниже.
          </p>

          {(() => {
            const scenes = Object.values(pack?.voxelScenes ?? {}).slice().sort(
              (a, b) =>
                (a.nameRu || a.id).localeCompare(b.nameRu || b.id, "ru"),
            );
            const models = Object.values(pack?.voxelModels ?? {})
              .slice()
              .sort((a, b) =>
                (a.nameRu || a.id).localeCompare(b.nameRu || b.id, "ru"),
              );
            const activeScene = region.sceneId
              ? pack?.voxelScenes?.[region.sceneId]
              : undefined;
            const clips = activeScene?.animations ?? [];
            const jointCount = activeScene?.joints?.length ?? 0;
            const clip =
              region.openClipId != null
                ? clips.find((c) => c.id === region.openClipId)
                : clips[0];
            return (
              <div className="ember-map-region-ed__chest-visual">
                <p className="ember-map-region-ed__label">Визуал · сцена</p>
                <label className="ember-map-region-ed__field">
                  <span>Сцена</span>
                  <select
                    value={region.sceneId ?? ""}
                    onChange={(e) => {
                      const sceneId = e.target.value || undefined;
                      const sc = sceneId
                        ? pack?.voxelScenes?.[sceneId]
                        : undefined;
                      if (sc && pack?.voxelModels) {
                        patch(
                          chestRegionFromVoxelScene(
                            region,
                            sc,
                            pack.voxelModels,
                            map.width,
                            map.height,
                          ),
                        );
                        return;
                      }
                      patch({
                        sceneId: undefined,
                        openClipId: undefined,
                      });
                    }}
                  >
                    <option value="">— нет (старые модели) —</option>
                    {scenes.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.nameRu?.trim() || s.id}
                        {(s.joints?.length ?? 0) > 0 ? " · петля" : ""}
                        {(s.animations?.length ?? 0) > 0
                          ? ` · ${s.animations!.length} клип`
                          : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="ember-map-region-ed__field">
                  <span>Клип открытия</span>
                  <select
                    value={region.openClipId ?? ""}
                    disabled={!activeScene || clips.length === 0}
                    onChange={(e) =>
                      patch({
                        openClipId: e.target.value || undefined,
                      })
                    }
                  >
                    <option value="">
                      {clips.length === 0
                        ? "— нет клипов в сцене —"
                        : "— без анимации (миг) —"}
                    </option>
                    {clips.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nameRu?.trim() || c.id} · {c.durationSec.toFixed(1)}с
                      </option>
                    ))}
                  </select>
                </label>
                {activeScene ? (
                  <p className="muted ember-hint ember-map-region-ed__chest-meta">
                    {activeScene.objects.length} объект
                    {activeScene.objects.length === 1 ? "" : "а"}
                    {jointCount > 0 ? ` · ${jointCount} петл.` : ""}
                    {clip
                      ? ` · клип «${clip.nameRu?.trim() || clip.id}» ${clip.durationSec.toFixed(1)}с`
                      : " · при открытии сразу конечная поза"}
                  </p>
                ) : (
                  <p className="muted ember-hint ember-map-region-ed__chest-meta">
                    Без сцены — две статичные модели (закрыт / открыт), как
                    раньше.
                  </p>
                )}
                {region.sceneId && onOpenVoxelScene ? (
                  <button
                    type="button"
                    className="ghost"
                    title="Правка объектов, петли и клипов в скульпторе"
                    onClick={() => onOpenVoxelScene(region.sceneId!)}
                  >
                    Открыть в редакторе вокселей
                  </button>
                ) : null}

                <details className="ember-map-region-ed__chest-legacy">
                  <summary>Статичные модели (запасной путь)</summary>
                  <label className="ember-map-region-ed__field">
                    <span>Закрытый</span>
                    <select
                      value={region.closedModelId ?? ""}
                      onChange={(e) => {
                        const modelId = e.target.value || undefined;
                        const model = modelId
                          ? pack?.voxelModels?.[modelId]
                          : undefined;
                        if (model && !region.sceneId) {
                          patch(
                            chestRegionFromVoxelModel(
                              region,
                              model,
                              map.width,
                              map.height,
                            ),
                          );
                          return;
                        }
                        patch({ closedModelId: modelId });
                      }}
                    >
                      <option value="">— заглушка —</option>
                      {models.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.nameRu?.trim() || m.id}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="ember-map-region-ed__field">
                    <span>Открытый</span>
                    <select
                      value={region.openModelId ?? ""}
                      onChange={(e) =>
                        patch({
                          openModelId: e.target.value || undefined,
                        })
                      }
                    >
                      <option value="">— как закрытый / убрать —</option>
                      {models.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.nameRu?.trim() || m.id}
                        </option>
                      ))}
                    </select>
                  </label>
                </details>
              </div>
            );
          })()}

          <ModelOutlineFields
            value={region.modelOutline}
            onChange={(modelOutline) => patch({ modelOutline })}
          />

          {(() => {
            const pose = resolveChestModelPose(map, region);
            const rot = pose.rot;
            const rotDeg = rot * 90;
            const elevMax = Math.max(MAX_ELEVATION, 8);
            const directLightScale = clampVoxelDirectLightScale(
              region.modelDirectLightScale,
            );
            const offsetX = clampChestModelOffset(region.modelOffsetX);
            const offsetY = clampChestModelOffset(region.modelOffsetY);
            const scale = clampChestModelScale(region.modelScale);
            const nudgeOffset = (dx: number, dy: number) => {
              patch({
                modelOffsetX: clampChestModelOffset(offsetX + dx),
                modelOffsetY: clampChestModelOffset(offsetY + dy),
              });
            };
            const moveZone = (dx: number, dy: number) => {
              const nx = clampInt(region.x + dx, 0, Math.max(0, map.width - region.w));
              const ny = clampInt(region.y + dy, 0, Math.max(0, map.height - region.h));
              if (nx === region.x && ny === region.y) return;
              patch({ x: nx, y: ny });
            };
            return (
              <div className="ember-map-region-ed__place">
                <p className="ember-map-region-ed__label">Размещение визуала</p>

                <p className="ember-map-region-ed__sub">Зона на карте</p>
                <div
                  className="ember-map-inspector__pad"
                  role="group"
                  aria-label="Сдвиг зоны"
                >
                  <button
                    type="button"
                    className="ghost"
                    title="Север (−Y)"
                    onClick={() => moveZone(0, -1)}
                  >
                    ↑
                  </button>
                  <div className="ember-map-inspector__pad-mid">
                    <button
                      type="button"
                      className="ghost"
                      title="Запад (−X)"
                      onClick={() => moveZone(-1, 0)}
                    >
                      ←
                    </button>
                    <button
                      type="button"
                      className="ghost"
                      title="Юг (+Y)"
                      onClick={() => moveZone(0, 1)}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className="ghost"
                      title="Восток (+X)"
                      onClick={() => moveZone(1, 0)}
                    >
                      →
                    </button>
                  </div>
                </div>

                <p className="ember-map-region-ed__sub">Сдвиг модели (клетки)</p>
                <div
                  className="ember-map-inspector__pad"
                  role="group"
                  aria-label="Сдвиг модели"
                >
                  <button
                    type="button"
                    className="ghost"
                    title="Север (−Y)"
                    onClick={() => nudgeOffset(0, -0.25)}
                  >
                    ↑
                  </button>
                  <div className="ember-map-inspector__pad-mid">
                    <button
                      type="button"
                      className="ghost"
                      title="Запад (−X)"
                      onClick={() => nudgeOffset(-0.25, 0)}
                    >
                      ←
                    </button>
                    <button
                      type="button"
                      className="ghost"
                      title="Юг (+Y)"
                      onClick={() => nudgeOffset(0, 0.25)}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className="ghost"
                      title="Восток (+X)"
                      onClick={() => nudgeOffset(0.25, 0)}
                    >
                      →
                    </button>
                  </div>
                </div>
                <div className="ember-map-region-ed__grid2">
                  <label className="ember-map-region-ed__field">
                    <span>ΔX</span>
                    <input
                      type="number"
                      step={0.25}
                      min={-4}
                      max={4}
                      value={offsetX}
                      onChange={(e) =>
                        patch({
                          modelOffsetX: clampChestModelOffset(
                            Number(e.target.value),
                          ),
                        })
                      }
                    />
                  </label>
                  <label className="ember-map-region-ed__field">
                    <span>ΔY</span>
                    <input
                      type="number"
                      step={0.25}
                      min={-4}
                      max={4}
                      value={offsetY}
                      onChange={(e) =>
                        patch({
                          modelOffsetY: clampChestModelOffset(
                            Number(e.target.value),
                          ),
                        })
                      }
                    />
                  </label>
                </div>

                <p className="ember-map-region-ed__sub">Повернуть</p>
                <div
                  className="ember-map-inspector__rot"
                  role="group"
                  aria-label="Поворот модели"
                >
                  <button
                    type="button"
                    className="ghost"
                    title="Против часовой (−90°)"
                    onClick={() =>
                      patch({ modelRot: normalizeVoxelRot(rot - 1) })
                    }
                  >
                    ↺ −90°
                  </button>
                  <em>{rotDeg}°</em>
                  <button
                    type="button"
                    className="ghost"
                    title="По часовой (+90°)"
                    onClick={() =>
                      patch({ modelRot: normalizeVoxelRot(rot + 1) })
                    }
                  >
                    ↻ +90°
                  </button>
                </div>

                <label className="ember-map-region-ed__row">
                  <span>Высота пола (Z)</span>
                  <input
                    type="range"
                    min={0}
                    max={elevMax}
                    step={1}
                    value={pose.elev}
                    onChange={(e) =>
                      patch({ modelElev: Number(e.target.value) })
                    }
                  />
                  <em>{pose.elev}</em>
                </label>
                <p className="muted ember-hint">
                  Пол клетки: Z{pose.floorElev}
                  {pose.surfaceElev !== pose.floorElev
                    ? ` · верх стены: ${pose.surfaceElev.toFixed(2)}`
                    : ""}
                </p>

                <label className="ember-map-region-ed__row">
                  <span>Прямой свет</span>
                  <input
                    type="range"
                    min={0.05}
                    max={1.5}
                    step={0.05}
                    value={directLightScale}
                    onChange={(e) =>
                      patch({
                        modelDirectLightScale: Number(e.target.value),
                      })
                    }
                  />
                  <em>{directLightScale.toFixed(2)}</em>
                </label>
                <p className="muted ember-hint">
                  Ослабление ловли ламп (по умолчанию{" "}
                  {DEFAULT_VOXEL_DIRECT_LIGHT_SCALE.toFixed(2)}). Меньше —
                  тусклее под фонарём, 1.0 — полная реакция.
                </p>

                <label className="ember-map-region-ed__row">
                  <span>Масштаб</span>
                  <input
                    type="range"
                    min={0.25}
                    max={3}
                    step={0.05}
                    value={scale}
                    onChange={(e) =>
                      patch({
                        modelScale: clampChestModelScale(
                          Number(e.target.value),
                        ),
                      })
                    }
                  />
                  <em>×{scale.toFixed(2)}</em>
                </label>

                <div className="ember-map-region-ed__place-actions">
                  <button
                    type="button"
                    className="ghost"
                    title="Сбросить сдвиг / поворот / масштаб / свет"
                    onClick={() =>
                      patch({
                        modelOffsetX: undefined,
                        modelOffsetY: undefined,
                        modelRot: undefined,
                        modelScale: undefined,
                        modelDirectLightScale: undefined,
                        modelElev: undefined,
                      })
                    }
                  >
                    Сбросить размещение
                  </button>
                  <button
                    type="button"
                    className="ghost"
                    title="Поставить высоту на поверхность клетки"
                    onClick={() => patch({ modelElev: pose.surfaceElev })}
                  >
                    На поверхность
                  </button>
                </div>
              </div>
            );
          })()}
        </div>
      ) : null}

      {region.kind === "teleport" ? (
        <div className="ember-map-region-ed__block">
          <div className="ember-map-region-ed__section-head">
            <p className="ember-map-region-ed__label">Другие телепорты</p>
            <label className="ember-map-region-ed__check">
              <input
                type="checkbox"
                checked={hoverFocus}
                onChange={(e) => setHoverFocusPref(e.target.checked)}
              />
              <span>Фокус при наведении</span>
            </label>
          </div>
          {teleportPeers.length === 0 ? (
            <p className="muted ember-hint">
              На карте нет других ТП — поставь второй и свяжи здесь.
            </p>
          ) : (
            <ul
              className="ember-map-region-ed__tp-list"
              role="listbox"
              aria-label="Точки телепорта"
              onMouseLeave={() => {
                if (hoverFocus) onHoverPeer?.(null);
              }}
            >
              {teleportPeers.map((tp) => {
                const linked = region.targetRegionId === tp.id;
                const back = tp.targetRegionId === region.id;
                return (
                  <li key={tp.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={linked}
                      className={`ember-map-region-ed__tp ${linked ? "is-active" : ""}`}
                      onMouseEnter={() => {
                        if (hoverFocus) onHoverPeer?.(tp.id);
                      }}
                      onFocus={() => {
                        if (hoverFocus) onHoverPeer?.(tp.id);
                      }}
                      onClick={() =>
                        patch({
                          targetRegionId: tp.id,
                          targetX: undefined,
                          targetY: undefined,
                        })
                      }
                    >
                      <span className="ember-map-region-ed__tp-id">{tp.id}</span>
                      <span className="ember-map-region-ed__tp-xy">
                        {tp.x}, {tp.y}
                        {tp.w > 1 || tp.h > 1 ? ` · ${tp.w}×${tp.h}` : ""}
                      </span>
                      <span className="ember-map-region-ed__tp-flags">
                        {linked ? "цель" : "выбрать"}
                        {back ? " · ↔" : ""}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {region.targetRegionId &&
          teleportPeers.some((tp) => tp.id === region.targetRegionId) ? (
            <div className="ember-map-region-ed__pair">
              <button
                type="button"
                className="ghost ember-chip--sm"
                disabled={!onPairLink}
                onClick={() =>
                  region.targetRegionId &&
                  onPairLink?.(region.id, region.targetRegionId)
                }
              >
                Связать пару ↔
              </button>
              <p className="muted ember-hint">
                Пропишет обратный ТП на эту зону.
              </p>
            </div>
          ) : null}

          <p className="ember-map-region-ed__label">Или вручную</p>
          <div className="ember-map-region-ed__seg" role="group" aria-label="Тип цели">
            <button
              type="button"
              className={`ember-chip ember-chip--sm ${linkMode === "region" ? "is-active" : ""}`}
              onClick={() => setLinkMode("region")}
            >
              К зоне
            </button>
            <button
              type="button"
              className={`ember-chip ember-chip--sm ${linkMode === "tile" ? "is-active" : ""}`}
              onClick={() => setLinkMode("tile")}
            >
              К клетке
            </button>
          </div>

          {linkMode === "region" ? (
            <label className="ember-map-region-ed__field">
              <span>Цель · любая зона</span>
              <select
                value={region.targetRegionId ?? ""}
                onChange={(e) => {
                  const id = e.target.value || undefined;
                  patch({
                    targetRegionId: id,
                    targetX: undefined,
                    targetY: undefined,
                  });
                }}
              >
                <option value="">— выбери зону —</option>
                {linkTargets.map((r) => (
                  <option key={r.id} value={r.id}>
                    {MAP_REGION_KIND_LABEL[r.kind]} · {r.id} ({r.x},{r.y})
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <div className="ember-map-region-ed__grid3">
              <label className="ember-map-region-ed__field">
                <span>Цель X</span>
                <input
                  type="number"
                  min={0}
                  max={map.width - 1}
                  value={region.targetX ?? region.x}
                  onChange={onNum("targetX")}
                />
              </label>
              <label className="ember-map-region-ed__field">
                <span>Цель Y</span>
                <input
                  type="number"
                  min={0}
                  max={map.height - 1}
                  value={region.targetY ?? region.y}
                  onChange={onNum("targetY")}
                />
              </label>
              <label className="ember-map-region-ed__field">
                <span>Z</span>
                <input
                  type="number"
                  min={0}
                  max={8}
                  value={region.targetElevation ?? 0}
                  onChange={onNum("targetElevation")}
                />
              </label>
            </div>
          )}

          {linkMode === "region" && region.targetRegionId ? (
            <label className="ember-map-region-ed__field">
              <span>Высота прихода (Z)</span>
              <input
                type="number"
                min={0}
                max={8}
                value={region.targetElevation ?? 0}
                onChange={onNum("targetElevation")}
              />
            </label>
          ) : null}
        </div>
      ) : null}

      {region.kind === "trigger" ? (
        <div className="ember-map-region-ed__block">
          <label className="ember-map-region-ed__field">
            <span>Script id</span>
            <input
              type="text"
              value={region.scriptId ?? ""}
              placeholder="например intro_cutscene"
              onChange={(e) => patch({ scriptId: e.target.value })}
            />
          </label>
          <p className="muted ember-hint">
            События сцены с триггером «вход в регион» ссылаются на id этой зоны
            (`on_region_enter`). Script id — заготовка под будущие скрипты.
          </p>
          {linkedEvents.length > 0 ? (
            <ul className="ember-map-region-ed__events">
              {linkedEvents.map((ev) => (
                <li key={ev.id}>
                  <span className="ember-map-region-ed__ev-dot" aria-hidden />
                  {ev.id}
                  {ev.nameRu ? ` · ${ev.nameRu}` : ""}
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted ember-hint">
              Пока нет событий на эту зону — создай во вкладке «Сцены».
            </p>
          )}
        </div>
      ) : null}

      {region.kind === "camera_bound" ? (
        <p className="muted ember-hint">
          Только оверлей редактора — геймплей пока не читает границы камеры.
        </p>
      ) : null}

      {region.kind === "player_start" ? (
        <p className="muted ember-hint">
          Точка появления игрока. Обычно одна на карту.
        </p>
      ) : null}

      {region.kind === "npc_idle" || region.kind === "npc_wander" ? (
        <div className="ember-map-region-ed__block">
          <p className="muted ember-hint">
            {region.kind === "npc_wander"
              ? "Исследование: NPC патрулирует зону. Диалогов нет."
              : "Исследование: NPC стоит на месте. Диалогов нет."}
          </p>
          <label className="ember-map-region-ed__field">
            <span>Спрайт</span>
            <select
              value={region.spriteId ?? ""}
              onChange={(e) =>
                patch({ spriteId: e.target.value.trim() || undefined })
              }
            >
              <option value="">— не задан —</option>
              {Object.values(pack?.sprites ?? {})
                .slice()
                .sort((a, b) =>
                  (a.nameRu ?? a.id).localeCompare(b.nameRu ?? b.id, "ru"),
                )
                .map((sprite) => (
                  <option key={sprite.id} value={sprite.id}>
                    {sprite.nameRu ?? sprite.id}
                  </option>
                ))}
            </select>
          </label>
          {region.kind === "npc_wander" ? (
            <label className="ember-map-region-ed__field">
              <span>Зона прогулки</span>
              <select
                value={region.wanderRegionId ?? ""}
                onChange={(e) =>
                  patch({
                    wanderRegionId: e.target.value.trim() || undefined,
                  })
                }
              >
                <option value="">Эта зона</option>
                {map.regions
                  .filter((item) => item.id !== region.id)
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.id} ({MAP_REGION_KIND_LABEL[item.kind]})
                    </option>
                  ))}
              </select>
            </label>
          ) : null}
        </div>
      ) : null}

      <label className="ember-map-region-ed__field ember-map-region-ed__field--stack">
        <span>Заметка</span>
        <textarea
          rows={compact ? 2 : 3}
          value={region.note ?? ""}
          placeholder="TODO / пояснение для себя"
          onChange={(e) => patch({ note: e.target.value })}
        />
      </label>

      {!hideDelete ? (
        <div className="ember-map-region-ed__actions">
          <button type="button" className="ghost danger" onClick={onDelete}>
            Удалить зону
          </button>
        </div>
      ) : null}
    </section>
  );
}

/** Apply region patch into the map region list (handles id rename). */
export function replaceRegion(
  regions: EmberMapRegion[],
  prevId: string,
  next: EmberMapRegion,
): EmberMapRegion[] {
  const without = regions.filter((r) => r.id !== prevId);
  // Keep unique ids — if renamed onto existing, suffix.
  let id = next.id.trim() || prevId;
  if (without.some((r) => r.id === id)) {
    let n = 2;
    while (without.some((r) => r.id === `${id}_${n}`)) n += 1;
    id = `${id}_${n}`;
  }
  // Retarget teleports that pointed at old id.
  const remapped = without.map((r) =>
    r.targetRegionId === prevId ? { ...r, targetRegionId: id } : r,
  );
  return [...remapped, { ...next, id }];
}

/** Set reciprocal teleport link A↔B (B becomes teleport → A if needed). */
export function pairTeleportRegions(
  regions: EmberMapRegion[],
  fromId: string,
  toId: string,
): EmberMapRegion[] {
  return regions.map((r) => {
    if (r.id === fromId) {
      return {
        ...r,
        kind: "teleport" as const,
        targetRegionId: toId,
        targetX: undefined,
        targetY: undefined,
      };
    }
    if (r.id === toId) {
      return {
        ...r,
        kind: "teleport" as const,
        targetRegionId: fromId,
        targetX: undefined,
        targetY: undefined,
      };
    }
    return r;
  });
}
