import { useEffect, useState } from "react";
import { writeEmberJson, type EmberPack, type EmberStage } from "../../../game";

type Props = {
  pack: EmberPack;
  stage: EmberStage;
  onChange: (stage: EmberStage) => void;
  onSaved: (msg: string) => void;
};

export function StageEditorPanel({ pack, stage, onChange, onSaved }: Props) {
  const [local, setLocal] = useState(stage);

  useEffect(() => {
    setLocal(stage);
  }, [stage]);

  const set = <K extends keyof EmberStage>(key: K, value: EmberStage[K]) => {
    const next = { ...local, [key]: value };
    setLocal(next);
    onChange(next);
  };

  const save = async () => {
    const res = await writeEmberJson(`stages/${local.id}.json`, local);
    onSaved(
      res.ok
        ? `Стадия сохранена (${res.source})`
        : `Ошибка: ${"error" in res ? res.error : "?"}`,
    );
  };

  return (
    <div className="ember-ed-form">
      <label>
        Название
        <input
          value={local.nameRu}
          onChange={(e) => set("nameRu", e.target.value)}
        />
      </label>
      <label>
        mapId
        <select
          value={local.mapId}
          onChange={(e) => set("mapId", e.target.value)}
        >
          {Object.keys(pack.maps).map((id) => (
            <option key={id} value={id}>
              {id}
            </option>
          ))}
        </select>
      </label>
      <label>
        durationSec
        <input
          type="number"
          value={local.durationSec}
          onChange={(e) => set("durationSec", Number(e.target.value))}
        />
      </label>
      <label>
        bossAtSec
        <input
          type="number"
          value={local.bossAtSec}
          onChange={(e) => set("bossAtSec", Number(e.target.value))}
        />
      </label>
      <label>
        playerHp
        <input
          type="number"
          value={local.playerHp}
          onChange={(e) => set("playerHp", Number(e.target.value))}
        />
      </label>
      <label>
        cindersClear
        <input
          type="number"
          value={local.cindersClear}
          onChange={(e) => set("cindersClear", Number(e.target.value))}
        />
      </label>
      <label>
        cindersFail
        <input
          type="number"
          value={local.cindersFail}
          onChange={(e) => set("cindersFail", Number(e.target.value))}
        />
      </label>
      <label>
        onClearEventId
        <select
          value={local.onClearEventId ?? ""}
          onChange={(e) =>
            set("onClearEventId", e.target.value || undefined)
          }
        >
          <option value="">—</option>
          {Object.keys(pack.events).map((id) => (
            <option key={id} value={id}>
              {id}
            </option>
          ))}
        </select>
      </label>
      <label>
        onFailEventId
        <select
          value={local.onFailEventId ?? ""}
          onChange={(e) =>
            set("onFailEventId", e.target.value || undefined)
          }
        >
          <option value="">—</option>
          {Object.keys(pack.events).map((id) => (
            <option key={id} value={id}>
              {id}
            </option>
          ))}
        </select>
      </label>
      <label>
        starterWeaponId
        <select
          value={local.starterWeaponId}
          onChange={(e) => set("starterWeaponId", e.target.value)}
        >
          {Object.keys(pack.weapons).map((id) => (
            <option key={id} value={id}>
              {pack.weapons[id]?.nameRu ?? id}
            </option>
          ))}
        </select>
      </label>
      <button type="button" className="primary" onClick={() => void save()}>
        Save stage
      </button>
    </div>
  );
}
