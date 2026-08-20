import { useEffect, useState } from "react";
import { writeEmberJson } from "../../../game/content/io";
import type { EmberPack, EmberStage } from "../../../game/content/types";

type Props = {
  pack: EmberPack;
  stage: EmberStage;
  stagesForMap: EmberStage[];
  onSelectStage: (id: string) => void;
  onChange: (stage: EmberStage) => void;
  onSaved: (msg: string) => void;
};

export function MapStageForm({
  pack,
  stage,
  stagesForMap,
  onSelectStage,
  onChange,
  onSaved,
}: Props) {
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
    <div className="ember-map-stage">
      <header className="ember-map-stage__head">
        <div>
          <p className="ember-map-stage__eyebrow">Стадия карты</p>
          <h3 className="ember-map-stage__title">
            {local.nameRu?.trim() || local.id}
          </h3>
        </div>
        <code className="ember-map-stage__id" title={local.id}>
          {local.id}
        </code>
      </header>

      {stagesForMap.length > 1 ? (
        <label className="ember-map-stage__field">
          <span>Какую стадию правим</span>
          <select
            value={local.id}
            onChange={(e) => onSelectStage(e.target.value)}
          >
            {stagesForMap.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nameRu || s.id}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <section className="ember-map-stage__section">
        <h4>Основное</h4>
        <div className="ember-map-stage__grid">
          <label className="ember-map-stage__field ember-map-stage__field--full">
            <span>Название</span>
            <input
              value={local.nameRu}
              onChange={(e) => set("nameRu", e.target.value)}
            />
          </label>
          <label className="ember-map-stage__field ember-map-stage__field--full">
            <span>Таблица спавнов</span>
            <select
              value={local.spawnTableId}
              onChange={(e) => set("spawnTableId", e.target.value)}
            >
              {Object.keys(pack.spawns).map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
          </label>
          <label className="ember-map-stage__field ember-map-stage__field--full">
            <span>Стартовое оружие</span>
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
        </div>
      </section>

      <section className="ember-map-stage__section">
        <h4>Время и бой</h4>
        <div className="ember-map-stage__grid">
          <label className="ember-map-stage__field">
            <span>Длительность, сек</span>
            <input
              type="number"
              min={0}
              value={local.durationSec}
              onChange={(e) => set("durationSec", Number(e.target.value))}
            />
          </label>
          <label className="ember-map-stage__field">
            <span>Босс на секунде</span>
            <input
              type="number"
              min={0}
              value={local.bossAtSec}
              onChange={(e) => set("bossAtSec", Number(e.target.value))}
            />
          </label>
          <label className="ember-map-stage__field">
            <span>HP игрока</span>
            <input
              type="number"
              min={1}
              value={local.playerHp}
              onChange={(e) => set("playerHp", Number(e.target.value))}
            />
          </label>
        </div>
      </section>

      <section className="ember-map-stage__section">
        <h4>Награды (угли)</h4>
        <div className="ember-map-stage__grid">
          <label className="ember-map-stage__field">
            <span>За победу</span>
            <input
              type="number"
              min={0}
              value={local.cindersClear}
              onChange={(e) => set("cindersClear", Number(e.target.value))}
            />
          </label>
          <label className="ember-map-stage__field">
            <span>За поражение</span>
            <input
              type="number"
              min={0}
              value={local.cindersFail}
              onChange={(e) => set("cindersFail", Number(e.target.value))}
            />
          </label>
        </div>
      </section>

      <section className="ember-map-stage__section">
        <h4>События сцены</h4>
        <div className="ember-map-stage__grid">
          <label className="ember-map-stage__field">
            <span>После победы</span>
            <select
              value={local.onClearEventId ?? ""}
              onChange={(e) =>
                set("onClearEventId", e.target.value || undefined)
              }
            >
              <option value="">Не запускать</option>
              {Object.keys(pack.events).map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
          </label>
          <label className="ember-map-stage__field">
            <span>После поражения</span>
            <select
              value={local.onFailEventId ?? ""}
              onChange={(e) =>
                set("onFailEventId", e.target.value || undefined)
              }
            >
              <option value="">Не запускать</option>
              {Object.keys(pack.events).map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <button
        type="button"
        className="primary ember-map-stage__save"
        onClick={() => void save()}
      >
        Сохранить стадию
      </button>
    </div>
  );
}
