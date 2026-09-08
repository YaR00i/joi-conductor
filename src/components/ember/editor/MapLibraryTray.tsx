import {
  useMemo,
  useState,
  type DragEvent as ReactDragEvent,
  type ReactNode,
} from "react";
import { normalizePixelSprite } from "../../../game/content/pixelSprite";
import type {
  EmberPack,
  EmberTileset,
  MapRegionKind,
} from "../../../game/content/types";
import {
  countLibraryAssetReferences,
  filterLibraryAssets,
  uniqueLibraryTags,
} from "../../../game/editor/emberLibraryIndex";
import { voxelDensity } from "../../../game/voxel/voxelModel";
import { EmberSpriteThumb, EmberTileSwatch, EmberVoxelSceneThumb, EmberVoxelThumb } from "./EmberThumbGrid";
import {
  MAP_REGION_KIND_COLOR,
  MAP_REGION_KIND_HINT,
  MAP_REGION_KIND_LABEL,
  MAP_REGION_KIND_ORDER,
} from "./mapRegionHelpers";

/** MIME for HTML5 DnD between library tray and map canvas. */
export const MAP_LIB_MIME = "application/x-ember-map-lib";

/** Built-in tray ids, or a pack `lightPresets` id. */
export type MapLibLightPresetId = string;

export const BUILTIN_LIGHT_PRESET_IDS = [
  "default",
  "warm",
  "cool",
  "bright",
  "dim",
] as const;

export type BuiltinLightPresetId = (typeof BUILTIN_LIGHT_PRESET_IDS)[number];

export type MapLibPayload =
  | { kind: "sprite"; spriteId: string }
  | { kind: "voxel"; modelId: string }
  | { kind: "light"; presetId: MapLibLightPresetId }
  | { kind: "region"; regionKind: MapRegionKind }
  | { kind: "tile"; tileId: number };

export type MapLibCategory =
  | "sprites"
  | "voxels"
  | "tiles"
  | "lights"
  | "regions";

type Props = {
  pack: EmberPack;
  tileset: EmberTileset | undefined;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  selected: MapLibPayload | null;
  onSelect: (payload: MapLibPayload | null) => void;
  onDragActiveChange?: (active: boolean) => void;
  onOpenVoxelSculpt?: () => void;
};

const CATEGORIES: Array<{ id: MapLibCategory; labelRu: string }> = [
  { id: "sprites", labelRu: "Спрайты" },
  { id: "voxels", labelRu: "Воксели" },
  { id: "tiles", labelRu: "Тайлы" },
  { id: "lights", labelRu: "Свет" },
  { id: "regions", labelRu: "Зоны" },
];

function regionKindGlyph(kind: MapRegionKind): string {
  switch (kind) {
    case "trigger":
      return "Scr";
    case "player_start":
      return "▶";
    case "teleport":
      return "⇄";
    case "chest":
      return "▣";
    case "spawn":
      return "※";
    case "npc_idle":
      return "☺";
    case "npc_wander":
      return "↝";
    case "camera_bound":
      return "⬚";
    default: {
      const _never: never = kind;
      return _never;
    }
  }
}

const BUILTIN_LIGHT_PRESETS: Array<{
  id: BuiltinLightPresetId;
  labelRu: string;
  hint: string;
  swatch: string;
}> = [
  {
    id: "default",
    labelRu: "Фонарь",
    hint: "Обычный фонарь по настройкам карты",
    swatch: "#ffb060",
  },
  {
    id: "warm",
    labelRu: "Тёплый",
    hint: "Тёплый оранжевый свет",
    swatch: "#ff9a40",
  },
  {
    id: "cool",
    labelRu: "Холодный",
    hint: "Холодный голубой свет",
    swatch: "#80a8ff",
  },
  {
    id: "bright",
    labelRu: "Яркий",
    hint: "Дальний яркий фонарь",
    swatch: "#ffe8a0",
  },
  {
    id: "dim",
    labelRu: "Тусклый",
    hint: "Короткий слабый свет",
    swatch: "#c07040",
  },
];

function payloadKey(p: MapLibPayload): string {
  switch (p.kind) {
    case "sprite":
      return `sprite:${p.spriteId}`;
    case "voxel":
      return `voxel:${p.modelId}`;
    case "light":
      return `light:${p.presetId}`;
    case "region":
      return `region:${p.regionKind}`;
    case "tile":
      return `tile:${p.tileId}`;
    default: {
      const _n: never = p;
      return _n;
    }
  }
}

export function parseMapLibPayload(raw: string): MapLibPayload | null {
  try {
    const data = JSON.parse(raw) as MapLibPayload;
    if (!data || typeof data !== "object" || !("kind" in data)) return null;
    switch (data.kind) {
      case "sprite":
        return typeof data.spriteId === "string" ? data : null;
      case "voxel":
        return typeof data.modelId === "string" ? data : null;
      case "light":
        return typeof data.presetId === "string" ? data : null;
      case "region":
        return typeof data.regionKind === "string" ? data : null;
      case "tile":
        return typeof data.tileId === "number" ? data : null;
      default: {
        const _n: never = data;
        return _n;
      }
    }
  } catch {
    return null;
  }
}

type TrayItem = {
  key: string;
  payload: MapLibPayload;
  label: string;
  title: string;
  thumb: ReactNode;
  usage?: number;
};

export function MapLibraryTray({
  pack,
  tileset,
  collapsed,
  onToggleCollapsed,
  selected,
  onSelect,
  onDragActiveChange,
  onOpenVoxelSculpt,
}: Props) {
  const [category, setCategory] = useState<MapLibCategory>("sprites");
  const [query, setQuery] = useState("");
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const voxelModels = pack.voxelModels ?? {};
  const libraryTags = useMemo(() => uniqueLibraryTags(pack), [pack]);

  const items = useMemo((): TrayItem[] => {
    switch (category) {
      case "sprites":
        return filterLibraryAssets(
          Object.values(pack.sprites).map((raw) => normalizePixelSprite(raw)),
          query,
          tagFilter,
        ).map((s) => {
          const usage = countLibraryAssetReferences(pack, "sprite", s.id);
          return {
            key: `sprite:${s.id}`,
            payload: { kind: "sprite" as const, spriteId: s.id },
            label: s.nameRu?.trim() || s.id,
            title: `${s.nameRu ?? s.id}${s.tags?.length ? ` · ${s.tags.join(", ")}` : ""}${usage ? ` · ${usage} на картах` : ""} — перетащи на карту`,
            usage,
            thumb: <EmberSpriteThumb sprite={s} size={48} />,
          };
        });
      case "voxels": {
        const scenes = pack.voxelScenes ?? {};
        return filterLibraryAssets(Object.values(voxelModels), query, tagFilter).map(
          (m) => {
            const scene = scenes[m.id];
            const useScene = scene != null && scene.objects.length > 1;
            const usage = countLibraryAssetReferences(pack, "voxel", m.id);
            return {
              key: `voxel:${m.id}`,
              payload: { kind: "voxel" as const, modelId: m.id },
              label: m.nameRu?.trim() || m.id,
              title: `${m.nameRu ?? m.id} · ${m.sizeBlocks.x}×${m.sizeBlocks.y}×${m.sizeBlocks.z} бл. · ${voxelDensity(m)} вокс/блок${m.tags?.length ? ` · ${m.tags.join(", ")}` : ""}${usage ? ` · ${usage} на картах` : ""}`,
              usage,
              thumb: useScene ? (
                <EmberVoxelSceneThumb
                  scene={scene}
                  models={voxelModels}
                  size={48}
                />
              ) : (
                <EmberVoxelThumb model={m} size={48} />
              ),
            };
          },
        );
      }
      case "tiles": {
        const q = query.trim().toLowerCase();
        const tiles = tileset?.tiles ?? [];
        return tiles
          .filter((t) => t.id !== 0 && !t.stair)
          .filter((t) => {
            if (!q) return true;
            const hay = `${t.name ?? ""} #${t.id}`.toLowerCase();
            return hay.includes(q);
          })
          .map((t) => ({
            key: `tile:${t.id}`,
            payload: { kind: "tile" as const, tileId: t.id },
            label: t.name || `#${t.id}`,
            title: `#${t.id} ${t.name} — перетащи на карту`,
            thumb: (
              <EmberTileSwatch
                color={t.color}
                empty={t.color === "#00000000"}
                size={48}
              />
            ),
          }));
      }
      case "lights": {
        const q = query.trim().toLowerCase();
        const builtins = BUILTIN_LIGHT_PRESETS.map((p) => ({
          key: `light:${p.id}`,
          payload: { kind: "light" as const, presetId: p.id },
          label: p.labelRu,
          title: `${p.labelRu}: ${p.hint}`,
          thumb: (
            <span
              className="ember-map-lib__light-swatch"
              style={{ background: p.swatch }}
              aria-hidden
            >
              ✦
            </span>
          ),
        }));
        const custom = Object.values(pack.lightPresets ?? {})
          .slice()
          .sort((a, b) => a.nameRu.localeCompare(b.nameRu, "ru"))
          .map((p) => ({
            key: `light:${p.id}`,
            payload: { kind: "light" as const, presetId: p.id },
            label: p.nameRu,
            title: `${p.nameRu} — свой пресет · перетащи на карту`,
            thumb: (
              <span
                className="ember-map-lib__light-swatch"
                style={{ background: p.lampColor }}
                aria-hidden
              >
                ✦
              </span>
            ),
          }));
        return [...builtins, ...custom].filter((item) => {
          if (!q) return true;
          return `${item.label} ${item.title}`.toLowerCase().includes(q);
        });
      }
      case "regions": {
        const q = query.trim().toLowerCase();
        return MAP_REGION_KIND_ORDER.map((kind) => {
          const accent = MAP_REGION_KIND_COLOR[kind];
          return {
            key: `region:${kind}`,
            payload: { kind: "region" as const, regionKind: kind },
            label: MAP_REGION_KIND_LABEL[kind],
            title: `${MAP_REGION_KIND_LABEL[kind]} — ${MAP_REGION_KIND_HINT[kind]}`,
            thumb: (
              <span
                className="ember-map-lib__region-swatch"
                style={{
                  borderColor: accent,
                  color: accent,
                  background: `color-mix(in srgb, ${accent} 18%, #140e0c)`,
                }}
                aria-hidden
              >
                {regionKindGlyph(kind)}
              </span>
            ),
          };
        }).filter((item) => {
          if (!q) return true;
          return `${item.label} ${item.title}`.toLowerCase().includes(q);
        });
      }
      default: {
        const _n: never = category;
        return _n;
      }
    }
  }, [
    category,
    pack,
    pack.sprites,
    pack.voxelScenes,
    pack.lightPresets,
    query,
    tagFilter,
    tileset,
    voxelModels,
  ]);

  const selectedKey = selected ? payloadKey(selected) : null;

  const beginDrag = (e: ReactDragEvent, payload: MapLibPayload) => {
    e.dataTransfer.setData(MAP_LIB_MIME, JSON.stringify(payload));
    e.dataTransfer.setData("text/plain", JSON.stringify(payload));
    e.dataTransfer.effectAllowed = "copy";
    onSelect(payload);
    onDragActiveChange?.(true);
  };

  const endDrag = () => {
    onDragActiveChange?.(false);
  };

  return (
    <section
      className={`ember-map-lib ${collapsed ? "is-collapsed" : ""}`}
      aria-label="Библиотека карты"
    >
      <header className="ember-map-lib__head">
        <div className="ember-map-lib__title-row">
          <h3 className="ember-map-lib__title">Библиотека</h3>
          <span className="ember-map-lib__hint">
            {collapsed
              ? "свернуто"
              : selected
                ? "клик по карте или перетащи"
                : "перетащи на карту"}
          </span>
          {category === "voxels" && onOpenVoxelSculpt ? (
            <button
              type="button"
              className="ghost ember-map-lib__sculpt-btn"
              onClick={onOpenVoxelSculpt}
            >
              Скульптор
            </button>
          ) : null}
        </div>
        {!collapsed ? (
          <div
            className="ember-map-lib__cats"
            role="tablist"
            aria-label="Категории библиотеки"
          >
            {CATEGORIES.map((c) => (
              <button
                key={c.id}
                type="button"
                role="tab"
                aria-selected={category === c.id}
                className={`ember-map-lib__cat ${category === c.id ? "is-active" : ""}`}
                onClick={() => setCategory(c.id)}
              >
                {c.labelRu}
              </button>
            ))}
          </div>
        ) : null}
        <button
          type="button"
          className="ember-map-lib__collapse"
          aria-expanded={!collapsed}
          title={collapsed ? "Развернуть библиотеку" : "Свернуть библиотеку"}
          onClick={onToggleCollapsed}
        >
          {collapsed ? (
            <>
              <span className="ember-map-lib__collapse-glyph" aria-hidden>
                ▴
              </span>
              <span>Библиотека</span>
            </>
          ) : (
            <span className="ember-map-lib__collapse-glyph" aria-hidden>
              ▾
            </span>
          )}
        </button>
      </header>

      {!collapsed ? (
        <div className="ember-map-lib__body">
          <div className="ember-map-lib__tools">
            <input
              type="search"
              className="ember-map-lib__search"
              value={query}
              placeholder="Поиск по имени, id или тегу…"
              aria-label="Поиск в библиотеке"
              onChange={(e) => setQuery(e.target.value)}
            />
            {category === "voxels" || category === "sprites" ? (
              <div className="ember-map-lib__tags" role="list" aria-label="Теги">
                <button
                  type="button"
                  className={`ember-map-lib__tag ${tagFilter == null ? "is-active" : ""}`}
                  onClick={() => setTagFilter(null)}
                >
                  все
                </button>
                {libraryTags.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    className={`ember-map-lib__tag ${tagFilter === tag ? "is-active" : ""}`}
                    onClick={() =>
                      setTagFilter((cur) => (cur === tag ? null : tag))
                    }
                  >
                    {tag}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          {items.length === 0 ? (
            <p className="ember-map-lib__empty">
              {query.trim() || tagFilter
                ? "Ничего не найдено"
                : category === "sprites"
                ? "Нет спрайтов в паке — создайте во вкладке «Спрайты»."
                : category === "voxels"
                  ? "Нет воксель-моделей — открой «Скульптор»."
                  : category === "tiles"
                    ? "Нет тайлов в тайлесете карты."
                    : "Пусто"}
            </p>
          ) : (
            <ul className="ember-map-lib__strip" role="listbox" aria-label="Ассеты">
              {items.map((item) => {
                const active = selectedKey === item.key;
                return (
                  <li key={item.key} className="ember-map-lib__strip-item">
                    <button
                      type="button"
                      className={`ember-map-lib__item ${active ? "is-active" : ""}`}
                      title={item.title}
                      draggable
                      role="option"
                      aria-selected={active}
                      onClick={() =>
                        onSelect(active ? null : item.payload)
                      }
                      onDragStart={(e) => beginDrag(e, item.payload)}
                      onDragEnd={endDrag}
                    >
                      <span className="ember-map-lib__thumb">{item.thumb}</span>
                      <span className="ember-map-lib__label">
                        {item.label}
                        {item.usage ? (
                          <span className="ember-map-lib__use"> · {item.usage}</span>
                        ) : null}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </section>
  );
}
