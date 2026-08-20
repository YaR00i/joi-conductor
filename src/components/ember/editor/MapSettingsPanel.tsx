/**
 * Map look & atmosphere: night fill, sun, bloom, grade, weather FX.
 * Lamp sources stay in MapLightPanel.
 */
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import {
  applyLookPresetToLight,
  BUILTIN_SUNNY_EVENING_LOOK,
  isBuiltinLookPreset,
  listLookPresets,
  lookSnapshotFromLight,
  looksFileFromPresets,
  newLookPresetId,
  normalizeLookPreset,
} from "../../../game/content/lookPresets";
import { writeEmberJson } from "../../../game/content/io";
import type {
  EmberLookPreset,
  EmberMapLight,
  EmberMapPlayProfile,
  EmberPack,
} from "../../../game/content/types";
import {
  resolveMapAutoAttack,
  resolveMapPlayProfile,
} from "../../../game/content/playProfile";
import {
  DEFAULT_MAP_ATMOSPHERE,
  DEFAULT_MAP_GRADE,
  DEFAULT_MAP_LIGHT,
  omitUnsetLightBudget,
  type ResolvedMapAtmosphere,
  type ResolvedMapGrade,
  type ResolvedMapLight,
} from "../../../game/tile/mapUtils";

type Props = {
  globalLight: ResolvedMapLight;
  onCommitGlobal: (light: EmberMapLight) => void;
  onResetGlobal: () => void;
  playProfile?: EmberMapPlayProfile;
  onCommitPlayProfile?: (profile: EmberMapPlayProfile) => void;
  autoAttack?: boolean;
  onCommitAutoAttack?: (enabled: boolean) => void;
  pack?: EmberPack;
  onPackChange?: (pack: EmberPack) => void;
  onSaved?: (msg: string) => void;
};

function fmtNum(n: number, digits = 2): string {
  return n.toFixed(digits).replace(/\.?0+$/, "") || "0";
}

export function MapSettingsPanel({
  globalLight,
  onCommitGlobal,
  onResetGlobal,
  playProfile,
  onCommitPlayProfile,
  autoAttack,
  onCommitAutoAttack,
  pack,
  onPackChange,
  onSaved,
}: Props) {
  const [draft, setDraft] = useState<ResolvedMapLight>(globalLight);
  const draftRef = useRef(draft);
  const [presetName, setPresetName] = useState("");

  useEffect(() => {
    setDraft(globalLight);
    draftRef.current = globalLight;
  }, [globalLight]);

  const presets = useMemo(
    () => listLookPresets(pack?.lookPresets),
    [pack?.lookPresets],
  );

  const patchGlobal = (partial: Partial<ResolvedMapLight>) => {
    const next = { ...draftRef.current, ...partial };
    draftRef.current = next;
    setDraft(next);
  };

  const patchAndCommitGlobal = (partial: Partial<ResolvedMapLight>) => {
    const next = { ...draftRef.current, ...partial };
    draftRef.current = next;
    setDraft(next);
    onCommitGlobal(omitUnsetLightBudget(next));
  };

  const flushGlobal = () => onCommitGlobal(omitUnsetLightBudget(draftRef.current));

  const onGlobalRange =
    (key: keyof ResolvedMapLight) => (e: ChangeEvent<HTMLInputElement>) => {
      const raw = Number(e.target.value);
      if (!Number.isFinite(raw)) return;
      patchGlobal({ [key]: raw });
    };

  const onGradeRange =
    (key: keyof ResolvedMapGrade) => (e: ChangeEvent<HTMLInputElement>) => {
      const grade = {
        ...draftRef.current.grade,
        [key]: Number(e.target.value) || 0,
      };
      patchGlobal({ grade });
    };

  const onAtmosRange =
    (key: keyof ResolvedMapAtmosphere) =>
    (e: ChangeEvent<HTMLInputElement>) => {
      const atmosphere = {
        ...draftRef.current.atmosphere,
        [key]: Number(e.target.value) || 0,
      };
      patchGlobal({ atmosphere });
    };

  const flushGrade = () => onCommitGlobal(omitUnsetLightBudget(draftRef.current));
  const flushAtmos = () => onCommitGlobal(omitUnsetLightBudget(draftRef.current));

  const applyLook = (preset: EmberLookPreset, msg?: string) => {
    onCommitGlobal(applyLookPresetToLight(draftRef.current, preset));
    onSaved?.(msg ?? `Образ «${preset.nameRu}» применён`);
  };

  const persistPresets = async (
    next: Record<string, EmberLookPreset>,
    msg: string,
  ) => {
    if (!pack || !onPackChange) {
      onSaved?.("Нет колбэка пака — пресет не сохранён");
      return;
    }
    const res = await writeEmberJson(
      "looks/registry.json",
      looksFileFromPresets(next),
    );
    if (!res.ok) {
      onSaved?.(res.error || "Не удалось сохранить пресеты образа");
      return;
    }
    onPackChange({ ...pack, lookPresets: next });
    onSaved?.(msg);
  };

  const saveCurrentAsPreset = () => {
    if (!pack) return;
    const name = presetName.trim() || `Образ ${presets.length + 1}`;
    const id = newLookPresetId();
    const preset = normalizeLookPreset({
      id,
      nameRu: name,
      ...lookSnapshotFromLight(draftRef.current),
    });
    if (!preset) return;
    const stored = { ...(pack.lookPresets ?? {}) };
    // Keep builtins in memory only — don't write them into user map.
    for (const key of Object.keys(stored)) {
      if (isBuiltinLookPreset(key)) delete stored[key];
    }
    void persistPresets(
      { ...stored, [id]: preset },
      `Образ «${preset.nameRu}» сохранён`,
    );
    setPresetName("");
  };

  const overwritePreset = (preset: EmberLookPreset) => {
    if (!pack || isBuiltinLookPreset(preset.id)) return;
    const next = normalizeLookPreset({
      ...preset,
      ...lookSnapshotFromLight(draftRef.current),
      id: preset.id,
      nameRu: preset.nameRu,
    });
    if (!next) return;
    const stored = { ...(pack.lookPresets ?? {}) };
    for (const key of Object.keys(stored)) {
      if (isBuiltinLookPreset(key)) delete stored[key];
    }
    void persistPresets(
      { ...stored, [preset.id]: next },
      `Образ «${preset.nameRu}» перезаписан`,
    );
  };

  const deletePreset = (presetId: string) => {
    if (!pack || isBuiltinLookPreset(presetId)) return;
    const cur = { ...(pack.lookPresets ?? {}) };
    const name = cur[presetId]?.nameRu ?? presetId;
    delete cur[presetId];
    for (const key of Object.keys(cur)) {
      if (isBuiltinLookPreset(key)) delete cur[key];
    }
    void persistPresets(cur, `Образ «${name}» удалён`);
  };

  const atm = draft.atmosphere;
  const resolvedProfile = resolveMapPlayProfile({ playProfile });
  const resolvedAutoAttack = resolveMapAutoAttack({
    playProfile,
    autoAttack,
  });

  return (
    <div className="ember-map-settings">
      <header className="ember-map-settings__head">
        <div>
          <p className="ember-map-settings__eyebrow">Карта</p>
          <h3 className="ember-map-settings__title">Настройки карты</h3>
        </div>
        <button
          type="button"
          className="ghost ember-map-settings__reset"
          onClick={() => {
            const reset = {
              ...DEFAULT_MAP_LIGHT,
              grade: { ...DEFAULT_MAP_GRADE },
              atmosphere: { ...DEFAULT_MAP_ATMOSPHERE },
            };
            setDraft(reset);
            draftRef.current = reset;
            onResetGlobal();
          }}
        >
          Сброс
        </button>
      </header>

      <p className="muted ember-hint">
        Ночь, солнце, картинка и атмосфера всей сцены. Фонари — вкладка «Свет».
      </p>

      {onCommitPlayProfile ? (
        <section className="ember-map-settings__section">
          <div className="ember-map-settings__section-head">
            <h4>Режим игры</h4>
          </div>
          <p className="muted ember-hint">
            Арена — бой и толпа. Исследование — деревня, свет, мало NPC.
          </p>
          <div
            className="ember-map-settings__presets"
            role="group"
            aria-label="Режим карты"
          >
            <button
              type="button"
              className={`ghost ember-chip--sm${resolvedProfile === "arena" ? " is-active" : ""}`}
              aria-pressed={resolvedProfile === "arena"}
              onClick={() => onCommitPlayProfile("arena")}
            >
              Арена
            </button>
            <button
              type="button"
              className={`ghost ember-chip--sm${resolvedProfile === "explore" ? " is-active" : ""}`}
              aria-pressed={resolvedProfile === "explore"}
              onClick={() => onCommitPlayProfile("explore")}
            >
              Исследование
            </button>
          </div>
          {onCommitAutoAttack ? (
            <>
              <label className="ember-map-settings__field ember-map-settings__field--full">
                <span>Автоатака оружием</span>
                <input
                  type="checkbox"
                  checked={resolvedAutoAttack}
                  onChange={(event) =>
                    onCommitAutoAttack(event.target.checked)
                  }
                />
                <strong>{resolvedAutoAttack ? "вкл" : "выкл"}</strong>
              </label>
              <p className="muted ember-hint">
                Если выключено, выстрел или удар выполняется вручную по ЛКМ.
                Для «Исследования» автоатака по умолчанию выключена.
              </p>
            </>
          ) : null}
        </section>
      ) : null}

      <section className="ember-map-settings__section">
        <div className="ember-map-settings__section-head">
          <h4>Образы</h4>
        </div>
        <p className="muted ember-hint">
          Снимок заливки, солнца, bloom, грейда и атмосферы. Фонари не входят.
        </p>
        <div className="ember-map-settings__presets" role="group" aria-label="Быстрые образы">
          <button
            type="button"
            className="ghost ember-chip--sm"
            onClick={() =>
              applyLook(BUILTIN_SUNNY_EVENING_LOOK, "Солнечный вечер применён")
            }
          >
            Солнечный вечер
          </button>
          <button
            type="button"
            className="ghost ember-chip--sm"
            onClick={() =>
              patchAndCommitGlobal({
                atmosphere: {
                  ...DEFAULT_MAP_ATMOSPHERE,
                  fog: 0.35,
                  fogColor: "#0a1218",
                  rain: 0.55,
                  wind: 0.55,
                  cloudShadows: 0.4,
                  cloudSpeed: 0.7,
                  dust: 0.15,
                  vignette: 0.35,
                },
              })
            }
          >
            Ливень
          </button>
          <button
            type="button"
            className="ghost ember-chip--sm"
            onClick={() =>
              patchAndCommitGlobal({
                atmosphere: {
                  ...DEFAULT_MAP_ATMOSPHERE,
                  fog: 0.55,
                  fogColor: "#141018",
                  dust: 0.35,
                  fireflies: 0.55,
                  cloudShadows: 0.2,
                  vignette: 0.45,
                },
              })
            }
          >
            Кладбище
          </button>
          <button
            type="button"
            className="ghost ember-chip--sm"
            onClick={() =>
              patchAndCommitGlobal({
                atmosphere: {
                  ...DEFAULT_MAP_ATMOSPHERE,
                  fog: 0.2,
                  fogColor: "#1a2230",
                  cloudShadows: 0.65,
                  cloudSpeed: 0.35,
                  dust: 0.1,
                  vignette: 0.2,
                },
              })
            }
          >
            Пасмурно
          </button>
        </div>

        {onPackChange && pack ? (
          <>
            <div className="ember-map-settings__preset-save">
              <input
                className="ember-map-settings__preset-input"
                placeholder="Имя образа"
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
                className="ghost ember-chip--sm"
                title="Сохранить текущий look как пресет пака"
                onClick={saveCurrentAsPreset}
              >
                Сохранить
              </button>
            </div>
            {presets.length > 0 ? (
              <ul className="ember-map-settings__preset-list">
                {presets.map((p) => (
                  <li key={p.id} className="ember-map-settings__preset-item">
                    <button
                      type="button"
                      className="ember-map-settings__preset-swatch"
                      style={{ background: p.sunColor || p.ambientColor }}
                      title={`Применить «${p.nameRu}»`}
                      onClick={() => applyLook(p)}
                    />
                    <button
                      type="button"
                      className="ember-map-settings__preset-name"
                      title={`Применить «${p.nameRu}»`}
                      onClick={() => applyLook(p)}
                    >
                      {p.nameRu}
                      {isBuiltinLookPreset(p.id) ? " · встроенный" : ""}
                    </button>
                    {!isBuiltinLookPreset(p.id) ? (
                      <>
                        <button
                          type="button"
                          className="ghost ember-chip--sm"
                          title="Перезаписать текущими параметрами"
                          onClick={() => overwritePreset(p)}
                        >
                          ↻
                        </button>
                        <button
                          type="button"
                          className="ghost ember-chip--sm"
                          title="Удалить пресет"
                          onClick={() => deletePreset(p.id)}
                        >
                          ×
                        </button>
                      </>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        ) : null}
      </section>

      <section className="ember-map-settings__section">
        <h4>Ночь и заливка</h4>
        <label className="ember-map-settings__field">
          <span>Цвет ночи · глубина</span>
          <div className="ember-map-settings__colorrow">
            <input
              type="color"
              value={draft.ambientColor}
              onChange={(e) =>
                patchAndCommitGlobal({ ambientColor: e.target.value })
              }
            />
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={draft.ambientAlpha}
              onChange={onGlobalRange("ambientAlpha")}
              onPointerUp={flushGlobal}
              onKeyUp={flushGlobal}
            />
            <strong>{fmtNum(draft.ambientAlpha)}</strong>
          </div>
        </label>
        <label className="ember-map-settings__field ember-map-settings__field--full">
          <span>Сила заливки</span>
          <input
            type="range"
            min={0}
            max={3}
            step={0.01}
            value={draft.fillIntensity}
            onChange={onGlobalRange("fillIntensity")}
            onPointerUp={flushGlobal}
            onKeyUp={flushGlobal}
          />
          <strong>{fmtNum(draft.fillIntensity)}</strong>
        </label>
      </section>

      <section className="ember-map-settings__section">
        <h4>Мерцание факелов</h4>
        <p className="muted ember-hint">
          Глобально дышат радиусы кругов света у фонарей (не сила). У каждого
          света можно выключить отдельно во вкладке «Свет».
        </p>
        <label className="ember-map-settings__field ember-map-settings__field--full">
          <span>Размах</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={draft.torchFlicker}
            onChange={onGlobalRange("torchFlicker")}
            onPointerUp={flushGlobal}
            onKeyUp={flushGlobal}
          />
          <strong>{fmtNum(draft.torchFlicker)}</strong>
        </label>
        <label className="ember-map-settings__field ember-map-settings__field--full">
          <span>Скорость</span>
          <input
            type="range"
            min={0.25}
            max={3}
            step={0.05}
            value={draft.torchFlickerSpeed}
            onChange={onGlobalRange("torchFlickerSpeed")}
            onPointerUp={flushGlobal}
            onKeyUp={flushGlobal}
            disabled={draft.torchFlicker < 0.01}
          />
          <strong>{fmtNum(draft.torchFlickerSpeed)}</strong>
        </label>
        <label className="ember-map-settings__field ember-map-settings__field--full">
          <span>По умолчанию у фонарей</span>
          <input
            type="checkbox"
            checked={draft.lampTorchFlicker}
            onChange={(e) =>
              patchAndCommitGlobal({ lampTorchFlicker: e.target.checked })
            }
          />
          <strong>{draft.lampTorchFlicker ? "вкл" : "выкл"}</strong>
        </label>
      </section>

      <section className="ember-map-settings__section">
        <h4>Воксельный свет</h4>
        <p className="muted ember-hint">
          Сэмплы света и теней привязываются к центрам вокселей — круги ламп и
          тени от солнца читаются ступенями, а не гладким градиентом.
        </p>
        <label className="ember-map-settings__field ember-map-settings__field--full">
          <span>Квантовать по вокселям</span>
          <input
            type="checkbox"
            checked={draft.voxelSnapLight}
            onChange={(e) =>
              patchAndCommitGlobal({ voxelSnapLight: e.target.checked })
            }
          />
          <strong>{draft.voxelSnapLight ? "вкл" : "выкл"}</strong>
        </label>
      </section>

      <section className="ember-map-settings__section">
        <h4>Солнце</h4>
        <p className="muted ember-hint">
          Низкий угол — длинные тени. Цвет и сила влияют на key-light.
        </p>
        <label className="ember-map-settings__field">
          <span>Цвет · сила</span>
          <div className="ember-map-settings__colorrow">
            <input
              type="color"
              value={draft.sunColor}
              onChange={(e) =>
                patchAndCommitGlobal({ sunColor: e.target.value })
              }
            />
            <input
              type="range"
              min={0}
              max={3}
              step={0.01}
              value={draft.sunIntensity}
              onChange={onGlobalRange("sunIntensity")}
              onPointerUp={flushGlobal}
              onKeyUp={flushGlobal}
            />
            <strong>{fmtNum(draft.sunIntensity)}</strong>
          </div>
        </label>
        <label className="ember-map-settings__field ember-map-settings__field--full">
          <span>Азимут</span>
          <input
            type="range"
            min={0}
            max={360}
            step={1}
            value={draft.sunAzimuth}
            onChange={onGlobalRange("sunAzimuth")}
            onPointerUp={flushGlobal}
            onKeyUp={flushGlobal}
          />
          <strong>{Math.round(draft.sunAzimuth)}°</strong>
        </label>
        <label className="ember-map-settings__field ember-map-settings__field--full">
          <span>Высота</span>
          <input
            type="range"
            min={5}
            max={85}
            step={1}
            value={draft.sunElevation}
            onChange={onGlobalRange("sunElevation")}
            onPointerUp={flushGlobal}
            onKeyUp={flushGlobal}
          />
          <strong>{Math.round(draft.sunElevation)}°</strong>
        </label>
      </section>

      <section className="ember-map-settings__section">
        <h4>Bloom</h4>
        <label className="ember-map-settings__field ember-map-settings__field--full">
          <span>Сила</span>
          <input
            type="range"
            min={0}
            max={2}
            step={0.01}
            value={draft.bloomStrength}
            onChange={onGlobalRange("bloomStrength")}
            onPointerUp={flushGlobal}
            onKeyUp={flushGlobal}
          />
          <strong>{fmtNum(draft.bloomStrength)}</strong>
        </label>
        <label className="ember-map-settings__field ember-map-settings__field--full">
          <span>Порог</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={draft.bloomThreshold}
            onChange={onGlobalRange("bloomThreshold")}
            onPointerUp={flushGlobal}
            onKeyUp={flushGlobal}
          />
          <strong>{fmtNum(draft.bloomThreshold)}</strong>
        </label>
        <label className="ember-map-settings__field ember-map-settings__field--full">
          <span>Радиус</span>
          <input
            type="range"
            min={0}
            max={2}
            step={0.01}
            value={draft.bloomRadius}
            onChange={onGlobalRange("bloomRadius")}
            onPointerUp={flushGlobal}
            onKeyUp={flushGlobal}
          />
          <strong>{fmtNum(draft.bloomRadius)}</strong>
        </label>
      </section>

      <section className="ember-map-settings__section">
        <h4>Картинка</h4>
        <label className="ember-map-settings__field ember-map-settings__field--full">
          <span>Тон (холод ↔ тепло)</span>
          <input
            type="range"
            min={-1}
            max={1}
            step={0.01}
            value={draft.grade.tone}
            onChange={onGradeRange("tone")}
            onPointerUp={flushGrade}
            onKeyUp={flushGrade}
          />
          <strong>{fmtNum(draft.grade.tone)}</strong>
        </label>
        <label className="ember-map-settings__field ember-map-settings__field--full">
          <span>Яркость</span>
          <input
            type="range"
            min={0.25}
            max={3}
            step={0.01}
            value={draft.grade.brightness}
            onChange={onGradeRange("brightness")}
            onPointerUp={flushGrade}
            onKeyUp={flushGrade}
          />
          <strong>{fmtNum(draft.grade.brightness)}</strong>
        </label>
        <label className="ember-map-settings__field ember-map-settings__field--full">
          <span>Насыщенность</span>
          <input
            type="range"
            min={0}
            max={2}
            step={0.01}
            value={draft.grade.saturation}
            onChange={onGradeRange("saturation")}
            onPointerUp={flushGrade}
            onKeyUp={flushGrade}
          />
          <strong>{fmtNum(draft.grade.saturation)}</strong>
        </label>
        <label className="ember-map-settings__field ember-map-settings__field--full">
          <span>Виньетка</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={atm.vignette}
            onChange={onAtmosRange("vignette")}
            onPointerUp={flushAtmos}
            onKeyUp={flushAtmos}
          />
          <strong>{fmtNum(atm.vignette)}</strong>
        </label>
      </section>

      <section className="ember-map-settings__section">
        <div className="ember-map-settings__section-head">
          <h4>Атмосфера</h4>
          <button
            type="button"
            className="ghost"
            onClick={() =>
              patchAndCommitGlobal({
                atmosphere: { ...DEFAULT_MAP_ATMOSPHERE },
              })
            }
          >
            Выкл
          </button>
        </div>
        <p className="muted ember-hint">
          Туман, дымка, дождь, облака, пыль, блик солнца и светлячки.
        </p>

        <label className="ember-map-settings__field">
          <span>Туман · цвет</span>
          <div className="ember-map-settings__colorrow">
            <input
              type="color"
              value={atm.fogColor}
              onChange={(e) =>
                patchAndCommitGlobal({
                  atmosphere: { ...atm, fogColor: e.target.value },
                })
              }
            />
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={atm.fog}
              onChange={onAtmosRange("fog")}
              onPointerUp={flushAtmos}
              onKeyUp={flushAtmos}
            />
            <strong>{fmtNum(atm.fog)}</strong>
          </div>
        </label>

        <label className="ember-map-settings__field ember-map-settings__field--full">
          <span>Тёплая дымка</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={atm.haze}
            onChange={onAtmosRange("haze")}
            onPointerUp={flushAtmos}
            onKeyUp={flushAtmos}
          />
          <strong>{fmtNum(atm.haze)}</strong>
        </label>
        <label className="ember-map-settings__field ember-map-settings__field--full">
          <span>Блик солнца</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={atm.sunGlare}
            onChange={onAtmosRange("sunGlare")}
            onPointerUp={flushAtmos}
            onKeyUp={flushAtmos}
          />
          <strong>{fmtNum(atm.sunGlare)}</strong>
        </label>

        <label className="ember-map-settings__field ember-map-settings__field--full">
          <span>Дождь</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={atm.rain}
            onChange={onAtmosRange("rain")}
            onPointerUp={flushAtmos}
            onKeyUp={flushAtmos}
          />
          <strong>{fmtNum(atm.rain)}</strong>
        </label>
        <label className="ember-map-settings__field ember-map-settings__field--full">
          <span>Ветер (наклон дождя)</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={atm.wind}
            onChange={onAtmosRange("wind")}
            onPointerUp={flushAtmos}
            onKeyUp={flushAtmos}
          />
          <strong>{fmtNum(atm.wind)}</strong>
        </label>

        <label className="ember-map-settings__field ember-map-settings__field--full">
          <span>Тени облаков</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={atm.cloudShadows}
            onChange={onAtmosRange("cloudShadows")}
            onPointerUp={flushAtmos}
            onKeyUp={flushAtmos}
          />
          <strong>{fmtNum(atm.cloudShadows)}</strong>
        </label>
        <label className="ember-map-settings__field ember-map-settings__field--full">
          <span>Скорость облаков</span>
          <input
            type="range"
            min={0}
            max={2}
            step={0.01}
            value={atm.cloudSpeed}
            onChange={onAtmosRange("cloudSpeed")}
            onPointerUp={flushAtmos}
            onKeyUp={flushAtmos}
          />
          <strong>{fmtNum(atm.cloudSpeed)}</strong>
        </label>

        <label className="ember-map-settings__field ember-map-settings__field--full">
          <span>Пыль / пепел</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={atm.dust}
            onChange={onAtmosRange("dust")}
            onPointerUp={flushAtmos}
            onKeyUp={flushAtmos}
          />
          <strong>{fmtNum(atm.dust)}</strong>
        </label>
        <label className="ember-map-settings__field ember-map-settings__field--full">
          <span>Светлячки</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={atm.fireflies}
            onChange={onAtmosRange("fireflies")}
            onPointerUp={flushAtmos}
            onKeyUp={flushAtmos}
          />
          <strong>{fmtNum(atm.fireflies)}</strong>
        </label>
      </section>
    </div>
  );
}
