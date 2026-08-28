/**
 * Shared play/editor camera rig: FOV, distance, polar, presets.
 * Does not own map save — callers commit `onChange`.
 */
import type {
  EmberMapCamera,
  EmberUserCameraPreset,
} from "../../../game/content/types";
import {
  CAMERA_DIST_MAX,
  CAMERA_DIST_MIN,
  CAMERA_FOV_MAX,
  CAMERA_FOV_MIN,
  CAMERA_POLAR_DEG_MAX,
  CAMERA_POLAR_DEG_MIN,
  compactMapCamera,
  polarDegFromRad,
  polarRadFromDeg,
  resolveMapCamera,
  type ResolvedEmberCamera,
} from "../../../game/content/emberCamera";
import { EditableRange } from "./EditableRange";
import { EmberCameraPresetLibrary } from "./EmberCameraPresetLibrary";

type Props = {
  camera: EmberMapCamera | undefined;
  tileSize: number;
  mapId?: string;
  presets?: Record<string, EmberUserCameraPreset>;
  onChange: (camera: EmberMapCamera | undefined) => void;
  onLive?: (rig: ResolvedEmberCamera, mode: "lens" | "preview" | "play") => void;
  onPresetsPersist?: (
    next: Record<string, EmberUserCameraPreset>,
    msg: string,
  ) => void;
};

export function EmberCameraRigFields({
  camera,
  tileSize,
  mapId,
  presets = {},
  onChange,
  onLive,
  onPresetsPersist,
}: Props) {
  const rig = resolveMapCamera({ camera, tileSize }, tileSize, presets);
  const polarDeg = polarDegFromRad(rig.polarAngle);

  const commit = (
    next: ResolvedEmberCamera,
    mode: "lens" | "preview" | "play",
  ) => {
    const compact = compactMapCamera(next, tileSize);
    onLive?.(next, mode);
    onChange(compact);
  };

  const patch = (
    partial: Partial<ResolvedEmberCamera>,
    mode: "lens" | "preview" | "play",
  ) => {
    commit(
      resolveMapCamera(
        { camera: { ...camera, ...partial, presetId: undefined }, tileSize },
        tileSize,
        presets,
      ),
      mode,
    );
  };

  return (
    <>
      <EmberCameraPresetLibrary
        camera={camera}
        tileSize={tileSize}
        mapId={mapId}
        presets={presets}
        onApply={(authored, next) => {
          onLive?.(next, "play");
          onChange(authored);
        }}
        onPersist={onPresetsPersist}
      />
      <EditableRange
        label="FOV"
        title="Вертикальный угол обзора PerspectiveCamera"
        value={rig.fov}
        min={CAMERA_FOV_MIN}
        max={CAMERA_FOV_MAX}
        step={1}
        suffix="°"
        onChange={(fov) => patch({ fov }, "lens")}
      />
      <EditableRange
        label="Дистанция"
        title="Радиус орбиты вокруг персонажа"
        value={rig.followDistance}
        min={CAMERA_DIST_MIN}
        max={CAMERA_DIST_MAX}
        step={2}
        onChange={(followDistance) => patch({ followDistance }, "preview")}
      />
      <EditableRange
        label="Наклон"
        title="Поляр от зенита: 20° почти сверху, 80° почти сбоку"
        value={Math.round(polarDeg)}
        min={CAMERA_POLAR_DEG_MIN}
        max={CAMERA_POLAR_DEG_MAX}
        step={1}
        suffix="°"
        onChange={(deg) => patch({ polarAngle: polarRadFromDeg(deg) }, "preview")}
      />
      <EditableRange
        label="Высота взгляда"
        title="Смещение look-at вверх от ног"
        value={rig.lookHeight}
        min={0}
        max={24}
        step={0.5}
        decimals={1}
        onChange={(lookHeight) => patch({ lookHeight }, "preview")}
      />
      <EditableRange
        label="Чувств. мыши"
        title="Множитель yaw/pitch в play"
        value={rig.mouseSensitivity}
        min={0.25}
        max={3}
        step={0.05}
        decimals={2}
        onChange={(mouseSensitivity) => patch({ mouseSensitivity }, "lens")}
      />
      <label className="ember-check ember-camera-pitch-lock">
        <input
          type="checkbox"
          checked={rig.pitchLock}
          onChange={(e) => patch({ pitchLock: e.target.checked }, "lens")}
        />
        Только yaw (iso lock)
      </label>
      {rig.pitchLock ? null : (
        <>
          <EditableRange
            label="Наклон min"
            value={Math.round(polarDegFromRad(rig.polarMin))}
            min={CAMERA_POLAR_DEG_MIN}
            max={CAMERA_POLAR_DEG_MAX}
            step={1}
            suffix="°"
            onChange={(deg) =>
              patch({ polarMin: polarRadFromDeg(deg) }, "preview")
            }
          />
          <EditableRange
            label="Наклон max"
            value={Math.round(polarDegFromRad(rig.polarMax))}
            min={CAMERA_POLAR_DEG_MIN}
            max={CAMERA_POLAR_DEG_MAX}
            step={1}
            suffix="°"
            onChange={(deg) =>
              patch({ polarMax: polarRadFromDeg(deg) }, "preview")
            }
          />
        </>
      )}
      <EditableRange
        label="Near clip"
        title="Ближняя плоскость отсечения"
        value={rig.near}
        min={0.2}
        max={8}
        step={0.1}
        decimals={1}
        onChange={(near) => patch({ near }, "lens")}
      />
      <EditableRange
        label="Far clip"
        title="Дальняя плоскость отсечения"
        value={rig.far}
        min={500}
        max={12000}
        step={100}
        onChange={(far) => patch({ far }, "lens")}
      />
    </>
  );
}
