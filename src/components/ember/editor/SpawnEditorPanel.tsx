import { useEffect, useState } from "react";
import { writeEmberJson } from "../../../game/content/io";
import type {
  EmberPack,
  EmberSpawnTable,
} from "../../../game/content/types";

type Props = {
  pack: EmberPack;
  spawn: EmberSpawnTable;
  onChange: (spawn: EmberSpawnTable) => void;
  onSaved: (msg: string) => void;
};

export function SpawnEditorPanel({ spawn, onChange, onSaved }: Props) {
  const [json, setJson] = useState(() => JSON.stringify(spawn, null, 2));
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setJson(JSON.stringify(spawn, null, 2));
  }, [spawn]);

  const apply = () => {
    try {
      const parsed = JSON.parse(json) as EmberSpawnTable;
      onChange(parsed);
      setErr(null);
      onSaved("Spawn применён в память");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "parse");
    }
  };

  const save = async () => {
    try {
      const parsed = JSON.parse(json) as EmberSpawnTable;
      onChange(parsed);
      const res = await writeEmberJson(`spawns/${parsed.id}.json`, parsed);
      onSaved(
        res.ok
          ? `Spawn сохранён (${res.source})`
          : `Ошибка: ${"error" in res ? res.error : "?"}`,
      );
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "save");
    }
  };

  return (
    <div className="ember-ed-scene">
      <div className="ember-ed-toolbar">
        <button type="button" onClick={apply}>
          Apply JSON
        </button>
        <button type="button" className="primary" onClick={() => void save()}>
          Save spawn
        </button>
      </div>
      {err ? <p className="ember-error">{err}</p> : null}
      <textarea
        className="ember-ed-json"
        value={json}
        onChange={(e) => setJson(e.target.value)}
        spellCheck={false}
      />
      <p className="muted">
        Поля entry: atSec, untilSec, enemyId, count, intervalSec, regionGroup,
        once?
      </p>
    </div>
  );
}
