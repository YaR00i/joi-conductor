/**
 * Builtin chips + saved pack/map camera presets.
 * Persist is the caller's job (cameras/registry.json).
 */
import { useMemo, useState } from "react";
import {
  EMBER_CAMERA_PRESET_IDS,
  type EmberMapCamera,
  type EmberUserCameraPreset,
} from "../../../game/content/types";
import {
  cameraFromPreset,
  cameraPresetLabelRu,
  matchingCameraPresetId,
  resolveMapCamera,
  type ResolvedEmberCamera,
} from "../../../game/content/emberCamera";
import {
  cameraFromUserPreset,
  listUserCameraPresetsForMap,
  matchingUserCameraPresetId,
  newCameraPresetId,
  snapshotUserCameraPreset,
} from "../../../game/content/cameraPresets";

type Scope = "pack" | "map";

type Props = {
  camera: EmberMapCamera | undefined;
  tileSize: number;
  mapId?: string;
  presets: Record<string, EmberUserCameraPreset>;
  onApply: (camera: EmberMapCamera, rig: ResolvedEmberCamera) => void;
  onPersist?: (
    next: Record<string, EmberUserCameraPreset>,
    msg: string,
  ) => void;
};

export function EmberCameraPresetLibrary({
  camera,
  tileSize,
  mapId,
  presets,
  onApply,
  onPersist,
}: Props) {
  const [name, setName] = useState("");
  const [scope, setScope] = useState<Scope>("pack");
  const rig = resolveMapCamera({ camera, tileSize }, tileSize, presets);
  const visible = useMemo(
    () => listUserCameraPresetsForMap(presets, mapId),
    [presets, mapId],
  );
  const matchedUser = matchingUserCameraPresetId(rig, tileSize, visible);
  const active =
    matchedUser ?? matchingCameraPresetId(rig, tileSize) ?? rig.presetId;

  const applyBuiltin = (id: (typeof EMBER_CAMERA_PRESET_IDS)[number]) => {
    const authored = cameraFromPreset(id, tileSize);
    onApply(authored, resolveMapCamera({ camera: authored, tileSize }, tileSize));
  };

  const applyUser = (preset: EmberUserCameraPreset) => {
    const authored = cameraFromUserPreset(preset, tileSize);
    onApply(
      authored,
      resolveMapCamera({ camera: authored, tileSize }, tileSize, presets),
    );
  };

  const persist = (
    next: Record<string, EmberUserCameraPreset>,
    msg: string,
  ) => {
    onPersist?.(next, msg);
  };

  const saveCurrent = () => {
    if (!onPersist) return;
    const label = name.trim() || `Камера ${visible.length + 1}`;
    const id = newCameraPresetId();
    const mapBind = scope === "map" && mapId ? mapId : undefined;
    const preset = snapshotUserCameraPreset(id, label, mapBind, rig, tileSize);
    persist(
      { ...presets, [id]: preset },
      mapBind
        ? `Пресет «${preset.nameRu}» сохранён для этой карты`
        : `Пресет «${preset.nameRu}» сохранён для всех карт`,
    );
    applyUser(preset);
    setName("");
  };

  const overwrite = (preset: EmberUserCameraPreset) => {
    if (!onPersist) return;
    const next = snapshotUserCameraPreset(
      preset.id,
      preset.nameRu,
      preset.mapId,
      rig,
      tileSize,
    );
    persist(
      { ...presets, [preset.id]: next },
      `Пресет «${preset.nameRu}» перезаписан`,
    );
    applyUser(next);
  };

  const toggleScope = (preset: EmberUserCameraPreset) => {
    if (!onPersist) return;
    if (preset.mapId) {
      const { mapId: _drop, ...rest } = preset;
      persist(
        { ...presets, [preset.id]: rest },
        `«${preset.nameRu}» теперь общий`,
      );
      return;
    }
    if (!mapId) return;
    persist(
      { ...presets, [preset.id]: { ...preset, mapId } },
      `«${preset.nameRu}» привязан к этой карте`,
    );
  };

  const remove = (preset: EmberUserCameraPreset) => {
    if (!onPersist) return;
    const next = { ...presets };
    delete next[preset.id];
    persist(next, `Пресет «${preset.nameRu}» удалён`);
  };

  return (
    <>
      <div
        className="ember-map-view__scale-chips ember-map-view__scale-chips--4"
        role="group"
        aria-label="Встроенные пресеты камеры"
      >
        {EMBER_CAMERA_PRESET_IDS.map((id) => (
          <button
            key={id}
            type="button"
            className={`ember-map-view__scale ${active === id ? "is-active" : ""}`}
            title={cameraPresetLabelRu(id)}
            onClick={() => applyBuiltin(id)}
          >
            {cameraPresetLabelRu(id)}
          </button>
        ))}
      </div>
      <p className="ember-map-view__hint">
        Iso JRPG — текущий вид Ember. Широкий — FOV 60°. Свои пресеты — общие на
        весь пак или только эта карта.
      </p>
      {visible.length > 0 ? (
        <ul className="ember-map-settings__preset-list ember-camera-presets__list">
          {visible.map((p) => (
            <li key={p.id} className="ember-map-settings__preset-item">
              <button
                type="button"
                className={`ember-map-settings__preset-name${
                  active === p.id ? " is-active" : ""
                }`}
                title={`Применить «${p.nameRu}»`}
                onClick={() => applyUser(p)}
              >
                {p.nameRu}
                <span className="ember-camera-presets__scope">
                  {p.mapId ? "карта" : "общее"}
                </span>
              </button>
              {onPersist ? (
                <>
                  <button
                    type="button"
                    className="ghost ember-chip--sm"
                    title={
                      p.mapId
                        ? "Сделать общим для всех карт"
                        : mapId
                          ? "Привязать к этой карте"
                          : "Нужна карта"
                    }
                    disabled={!p.mapId && !mapId}
                    onClick={() => toggleScope(p)}
                  >
                    {p.mapId ? "↔" : "▣"}
                  </button>
                  <button
                    type="button"
                    className="ghost ember-chip--sm"
                    title="Перезаписать текущими настройками"
                    onClick={() => overwrite(p)}
                  >
                    ↻
                  </button>
                  <button
                    type="button"
                    className="ghost ember-chip--sm"
                    title="Удалить пресет"
                    onClick={() => remove(p)}
                  >
                    ×
                  </button>
                </>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {onPersist ? (
        <div className="ember-map-settings__preset-save ember-camera-presets__save">
          <input
            className="ember-map-settings__preset-input"
            placeholder="Имя пресета"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                saveCurrent();
              }
            }}
          />
          <div
            className="ember-map-settings__seg ember-camera-presets__seg"
            role="group"
            aria-label="Привязка пресета"
          >
            <button
              type="button"
              className={`ghost ember-chip--sm${scope === "pack" ? " is-active" : ""}`}
              aria-pressed={scope === "pack"}
              onClick={() => setScope("pack")}
            >
              Все карты
            </button>
            <button
              type="button"
              className={`ghost ember-chip--sm${scope === "map" ? " is-active" : ""}`}
              aria-pressed={scope === "map"}
              disabled={!mapId}
              title={mapId ? "Только текущая карта" : "Нет id карты"}
              onClick={() => setScope("map")}
            >
              Эта карта
            </button>
          </div>
          <button
            type="button"
            className="ghost ember-chip--sm"
            title="Сохранить текущий риг"
            onClick={saveCurrent}
          >
            Сохранить
          </button>
        </div>
      ) : null}
    </>
  );
}
