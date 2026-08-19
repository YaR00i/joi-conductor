import { useEffect, useMemo, useState } from "react";
import type {
  EmberMap,
  EmberMapRegion,
  EmberPack,
  MapRegionKind,
} from "../../../game/content/types";
import {
  MapRegionEditor,
  pairTeleportRegions,
  replaceRegion,
} from "./MapRegionEditor";
import {
  makeRegionAt,
  MAP_REGION_KIND_COLOR,
  MAP_REGION_KIND_LABEL,
  MAP_REGION_KIND_ORDER,
} from "./mapRegionHelpers";

type RegionFilter = "all" | MapRegionKind;

type Props = {
  map: EmberMap;
  pack?: EmberPack;
  selectedId: string | null;
  showOverlay: boolean;
  onSelect: (id: string | null) => void;
  onFocus: (region: EmberMapRegion) => void;
  onChange: (regions: EmberMapRegion[]) => void;
  onToggleOverlay: () => void;
  onSaved: (msg: string) => void;
  onHoverPeer?: (regionId: string | null) => void;
  onOpenVoxelScene?: (sceneId: string) => void;
};

const KIND_LABEL = MAP_REGION_KIND_LABEL;
const KIND_COLOR = MAP_REGION_KIND_COLOR;

const FILTER_CHIPS: Array<{ id: RegionFilter; label: string }> = [
  { id: "all", label: "Все" },
  { id: "player_start", label: "Старт" },
  { id: "spawn", label: "Спавн" },
  { id: "chest", label: "Сундук" },
  { id: "teleport", label: "ТП" },
  { id: "trigger", label: "Триг" },
  { id: "camera_bound", label: "Кам*" },
];

function kindRank(kind: MapRegionKind): number {
  const i = MAP_REGION_KIND_ORDER.indexOf(kind);
  return i >= 0 ? i : MAP_REGION_KIND_ORDER.length;
}

export function MapRegionsPanel({
  map,
  pack,
  selectedId,
  showOverlay,
  onSelect,
  onFocus,
  onChange,
  onToggleOverlay,
  onSaved,
  onHoverPeer,
  onOpenVoxelScene,
}: Props) {
  const [filter, setFilter] = useState<RegionFilter>("all");
  const [regionsJson, setRegionsJson] = useState(() =>
    JSON.stringify(map.regions, null, 2),
  );
  const [jsonOpen, setJsonOpen] = useState(false);

  useEffect(() => {
    setRegionsJson(JSON.stringify(map.regions, null, 2));
  }, [map.regions]);

  const sorted = useMemo(() => {
    return [...map.regions].sort((a, b) => {
      const kr = kindRank(a.kind) - kindRank(b.kind);
      if (kr !== 0) return kr;
      return a.id.localeCompare(b.id);
    });
  }, [map.regions]);

  const visible = useMemo(() => {
    if (filter === "all") return sorted;
    return sorted.filter((r) => r.kind === filter);
  }, [sorted, filter]);

  const selected = useMemo(
    () => map.regions.find((r) => r.id === selectedId) ?? null,
    [map.regions, selectedId],
  );

  const counts = useMemo(() => {
    const out: Partial<Record<MapRegionKind, number>> = {};
    for (const r of map.regions) {
      out[r.kind] = (out[r.kind] ?? 0) + 1;
    }
    return out;
  }, [map.regions]);

  const removeRegion = (id: string) => {
    const next = map.regions.filter((r) => r.id !== id);
    onChange(next);
    if (selectedId === id) onSelect(null);
  };

  const addRegion = (kind: MapRegionKind) => {
    const cx = Math.max(0, Math.floor(map.width / 2) - 1);
    const cy = Math.max(0, Math.floor(map.height / 2) - 1);
    const region = makeRegionAt(map, kind, cx, cy);
    const next = [...map.regions, region];
    onChange(next);
    onSelect(region.id);
    onFocus(region);
  };

  const applyJson = () => {
    try {
      const regions = JSON.parse(regionsJson) as EmberMapRegion[];
      if (!Array.isArray(regions)) {
        onSaved("Regions JSON: ожидается массив");
        return;
      }
      onChange(regions);
      onSaved("Regions в памяти — автосохранение карты");
    } catch (err) {
      onSaved(`Regions JSON: ${err instanceof Error ? err.message : "?"}`);
    }
  };

  return (
    <div className="ember-map-popform ember-map-regions">
      <div className="ember-ed-card__head">
        <h3 className="ember-ed-card__title">Регионы</h3>
        <span className="muted">{map.regions.length}</span>
      </div>
      <p className="muted ember-hint">
        Старт, спавн, сундуки, телепорты, триггеры — работают в игре. «Кам*» —
        только оверлей в редакторе. Оверлей — иконка справа на панели.
      </p>

      <div className="ember-map-regions__toolbar">
        <button
          type="button"
          className={`ember-chip ember-chip--sm ${showOverlay ? "is-active" : ""}`}
          aria-pressed={showOverlay}
          onClick={onToggleOverlay}
        >
          Оверлей {showOverlay ? "вкл" : "выкл"}
        </button>
        <div className="ember-map-regions__add">
          <button type="button" className="ghost" onClick={() => addRegion("spawn")}>
            + Спавн
          </button>
          <button type="button" className="ghost" onClick={() => addRegion("chest")}>
            + Сундук
          </button>
          <button
            type="button"
            className="ghost"
            onClick={() => addRegion("teleport")}
          >
            + ТП
          </button>
        </div>
      </div>

      <div className="ember-chip-row ember-map-regions__filters" role="toolbar" aria-label="Фильтр регионов">
        {FILTER_CHIPS.map((chip) => {
          const count =
            chip.id === "all"
              ? map.regions.length
              : (counts[chip.id] ?? 0);
          if (chip.id !== "all" && count === 0) return null;
          return (
            <button
              key={chip.id}
              type="button"
              className={`ember-chip ember-chip--sm ${filter === chip.id ? "is-active" : ""}`}
              aria-pressed={filter === chip.id}
              onClick={() => setFilter(chip.id)}
            >
              {chip.label}
              <span className="ember-map-regions__count">{count}</span>
            </button>
          );
        })}
      </div>

      {visible.length === 0 ? (
        <p className="muted ember-map-regions__empty">
          {map.regions.length === 0
            ? "Регионов нет — добавь спавн или сундук, либо правь JSON ниже."
            : "Нет регионов этого типа."}
        </p>
      ) : (
        <ul className="ember-map-regions__list">
          {visible.map((r) => {
            const active = r.id === selectedId;
            return (
              <li key={r.id}>
                <button
                  type="button"
                  className={`ember-map-regions__row ${active ? "is-active" : ""}`}
                  onClick={() => {
                    onSelect(r.id);
                    onFocus(r);
                  }}
                >
                  <span
                    className="ember-map-regions__swatch"
                    style={{ background: KIND_COLOR[r.kind] }}
                    aria-hidden
                  />
                  <span className="ember-map-regions__meta">
                    <span className="ember-map-regions__id">{r.id}</span>
                    <span className="ember-map-regions__sub">
                      <span
                        className="ember-map-regions__badge"
                        style={{
                          borderColor: KIND_COLOR[r.kind],
                          color: KIND_COLOR[r.kind],
                        }}
                      >
                        {KIND_LABEL[r.kind]}
                      </span>
                      <span className="muted">
                        {r.w}×{r.h} @ {r.x},{r.y}
                        {r.group ? ` · ${r.group}` : ""}
                      </span>
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  className="ghost ember-danger ember-map-regions__del"
                  title={`Удалить ${r.id}`}
                  aria-label={`Удалить ${r.id}`}
                  onClick={() => removeRegion(r.id)}
                >
                  ×
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {selected ? (
        <MapRegionEditor
          region={selected}
          map={map}
          pack={pack}
          onChange={(next) => {
            const regions = replaceRegion(map.regions, selected.id, next);
            onChange(regions);
            if (next.id !== selected.id) onSelect(next.id);
          }}
          onDelete={() => removeRegion(selected.id)}
          onFocus={() => onFocus(selected)}
          onPairLink={(fromId, toId) => {
            onChange(pairTeleportRegions(map.regions, fromId, toId));
            onSaved("Телепорты связаны парой ↔");
          }}
          onHoverPeer={onHoverPeer}
          onOpenVoxelScene={onOpenVoxelScene}
        />
      ) : null}

      <details
        className="ember-map-regions__json"
        open={jsonOpen}
        onToggle={(e) => setJsonOpen((e.target as HTMLDetailsElement).open)}
      >
        <summary>JSON (advanced)</summary>
        <p className="muted ember-hint">
          player_start, spawn, chest, teleport, trigger. camera_bound — только
          оверлей (геймплей пока не читает). teleport: targetX/Y/Elevation или
          targetRegionId.
        </p>
        <textarea
          className="ember-ed-json ember-ed-json--compact"
          value={regionsJson}
          onChange={(e) => setRegionsJson(e.target.value)}
          rows={8}
          spellCheck={false}
        />
        <button type="button" onClick={applyJson}>
          Применить JSON
        </button>
      </details>
    </div>
  );
}
