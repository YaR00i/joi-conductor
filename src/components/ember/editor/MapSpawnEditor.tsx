import { useEffect, useMemo, useState } from "react";
import { writeEmberJson } from "../../../game/content/io";
import type {
  EmberMap,
  EmberPack,
  EmberSpawnEntry,
  EmberSpawnTable,
} from "../../../game/content/types";

type Props = {
  pack: EmberPack;
  map: EmberMap;
  spawn: EmberSpawnTable;
  onChange: (spawn: EmberSpawnTable) => void;
  onSaved: (msg: string) => void;
};

function emptyEntry(regionGroup: string): EmberSpawnEntry {
  return {
    atSec: 0,
    untilSec: 60,
    enemyId: "",
    count: 1,
    intervalSec: 2,
    regionGroup,
    once: false,
  };
}

export function MapSpawnEditor({
  pack,
  map,
  spawn,
  onChange,
  onSaved,
}: Props) {
  const [local, setLocal] = useState(spawn);

  useEffect(() => {
    setLocal(spawn);
  }, [spawn]);

  const enemyIds = useMemo(() => Object.keys(pack.enemies).sort(), [pack.enemies]);
  const regionGroups = useMemo(() => {
    const groups = new Set<string>();
    for (const r of map.regions) {
      if (r.group) groups.add(r.group);
      groups.add(r.id);
    }
    if (groups.size === 0) groups.add("spawn");
    return [...groups].sort();
  }, [map.regions]);

  const defaultGroup = regionGroups[0] ?? "spawn";

  const patchEntry = (index: number, patch: Partial<EmberSpawnEntry>) => {
    const entries = local.entries.map((e, i) =>
      i === index ? { ...e, ...patch } : e,
    );
    const next = { ...local, entries };
    setLocal(next);
    onChange(next);
  };

  const removeEntry = (index: number) => {
    const entries = local.entries.filter((_, i) => i !== index);
    const next = { ...local, entries };
    setLocal(next);
    onChange(next);
  };

  const addEntry = () => {
    const entry = emptyEntry(defaultGroup);
    entry.enemyId = enemyIds[0] ?? "";
    const next = { ...local, entries: [...local.entries, entry] };
    setLocal(next);
    onChange(next);
  };

  const save = async () => {
    const res = await writeEmberJson(`spawns/${local.id}.json`, local);
    onSaved(
      res.ok
        ? `Спавн сохранён (${res.source})`
        : `Ошибка: ${"error" in res ? res.error : "?"}`,
    );
  };

  return (
    <div className="ember-map-popform">
      <div className="ember-ed-card__head">
        <h3 className="ember-ed-card__title">Спавны</h3>
        <span className="muted">{local.id}</span>
      </div>
      <p className="muted ember-hint">
        Волны привязаны к spawnTable стадии. regionGroup — id/group региона карты.
      </p>

      <div className="ember-map-spawn-list">
        {local.entries.map((entry, i) => (
          <div key={i} className="ember-map-spawn-card">
            <div className="ember-map-spawn-card__head">
              <strong>Волна {i + 1}</strong>
              <button
                type="button"
                className="ghost ember-danger"
                onClick={() => removeEntry(i)}
              >
                Удалить
              </button>
            </div>
            <div className="ember-map-popform__grid">
              <label className="ember-inline-field ember-inline-field--stack">
                enemyId
                <select
                  value={entry.enemyId}
                  onChange={(e) => patchEntry(i, { enemyId: e.target.value })}
                >
                  {!entry.enemyId ? <option value="">—</option> : null}
                  {enemyIds.map((id) => (
                    <option key={id} value={id}>
                      {pack.enemies[id]?.nameRu ?? id}
                    </option>
                  ))}
                </select>
              </label>
              <label className="ember-inline-field ember-inline-field--stack">
                regionGroup
                <select
                  value={entry.regionGroup}
                  onChange={(e) =>
                    patchEntry(i, { regionGroup: e.target.value })
                  }
                >
                  {!regionGroups.includes(entry.regionGroup) ? (
                    <option value={entry.regionGroup}>{entry.regionGroup}</option>
                  ) : null}
                  {regionGroups.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              </label>
              <label className="ember-inline-field ember-inline-field--stack">
                atSec
                <input
                  type="number"
                  value={entry.atSec}
                  onChange={(e) =>
                    patchEntry(i, { atSec: Number(e.target.value) })
                  }
                />
              </label>
              <label className="ember-inline-field ember-inline-field--stack">
                untilSec
                <input
                  type="number"
                  value={entry.untilSec}
                  onChange={(e) =>
                    patchEntry(i, { untilSec: Number(e.target.value) })
                  }
                />
              </label>
              <label className="ember-inline-field ember-inline-field--stack">
                count
                <input
                  type="number"
                  value={entry.count}
                  onChange={(e) =>
                    patchEntry(i, { count: Number(e.target.value) })
                  }
                />
              </label>
              <label className="ember-inline-field ember-inline-field--stack">
                intervalSec
                <input
                  type="number"
                  value={entry.intervalSec}
                  onChange={(e) =>
                    patchEntry(i, { intervalSec: Number(e.target.value) })
                  }
                />
              </label>
            </div>
            <label className="ember-check">
              <input
                type="checkbox"
                checked={Boolean(entry.once)}
                onChange={(e) => patchEntry(i, { once: e.target.checked })}
              />
              once
            </label>
          </div>
        ))}
        {local.entries.length === 0 ? (
          <p className="muted">Нет волн — добавьте первую.</p>
        ) : null}
      </div>

      <div className="ember-chip-row">
        <button type="button" className="ghost" onClick={addEntry}>
          + Волна
        </button>
        <button type="button" className="primary" onClick={() => void save()}>
          Сохранить спавн
        </button>
      </div>
    </div>
  );
}
