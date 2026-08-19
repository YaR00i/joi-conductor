import type { VibeLevel } from "../lib/types";
import type { DeviceBackendId } from "../lib/device/deviceTypes";

export interface VibeHudState {
  level: VibeLevel;
  labelRu: string;
  profileNameRu: string;
  segmentDurationSec: number;
  segmentIndex: number;
}

export interface VibeHudDeviceInfo {
  connected: boolean;
  backend: DeviceBackendId;
  intensity: number;
  detailRu?: string;
}

interface VibeHudProps {
  state: VibeHudState | null;
  active: boolean;
  /** Live device bridge status (optional). */
  device?: VibeHudDeviceInfo | null;
}

const LEVEL_LABELS = ["выкл", "фон", "слабо", "средне", "сильно", "макс"] as const;

function hintForDevice(device: VibeHudDeviceInfo | null | undefined): string {
  if (!device?.connected) {
    return "Крути силу на игрушке под шкалу — или подключи Device Bridge в Настройках. Бита нет — только время и уровень.";
  }
  switch (device.backend) {
    case "mock":
      return "Mock: уровень уходит в симулятор (см. Настройки → Игрушка).";
    case "lovense":
      return "Lovense: уровень шлётся в Game Mode. На паузе/конце — стоп.";
    case "buttplug":
      return "Intiface: уровень → вибрация. На паузе/конце — стоп.";
    default: {
      const _exhaustive: never = device.backend;
      return _exhaustive;
    }
  }
}

/** Intensity timeline HUD for vibe / chastity blocks (no metronome). */
export function VibeHud({ state, active, device = null }: VibeHudProps) {
  if (!active || !state) return null;

  const deviceLine = device?.connected
    ? `Device · ${device.backend} · ${(device.intensity * 100).toFixed(0)}%`
    : null;

  return (
    <div
      className={`vibe-hud${device?.connected ? " vibe-hud--linked" : ""}${
        device?.connected && device.intensity > 0 ? " is-device-pulse" : ""
      }`}
      aria-live="polite"
    >
      <div className="vibe-hud__eyebrow">
        Вибрация · {state.profileNameRu}
        {deviceLine ? (
          <span className="vibe-hud__device-pill">{deviceLine}</span>
        ) : null}
      </div>
      <div className="vibe-hud__level-row">
        {[0, 1, 2, 3, 4, 5].map((n) => (
          <div
            key={n}
            className={`vibe-hud__bar ${n <= state.level ? "is-on" : ""} ${n === state.level ? "is-current" : ""}`}
            style={{ height: `${18 + n * 10}px` }}
            title={LEVEL_LABELS[n as VibeLevel]}
          />
        ))}
      </div>
      <div className="vibe-hud__readout">
        <strong>{state.level}</strong>
        <span>
          {LEVEL_LABELS[state.level]} · {state.labelRu} · {state.segmentDurationSec}с
        </span>
      </div>
      <p className="vibe-hud__hint">{hintForDevice(device)}</p>
    </div>
  );
}
