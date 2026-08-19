import type { VibeLevel } from "../types";

export type DeviceBackendId = "mock" | "lovense" | "buttplug";

export type DeviceConnectionState =
  | "disconnected"
  | "connecting"
  | "connected"
  | "error";

export interface DeviceStatus {
  backend: DeviceBackendId;
  state: DeviceConnectionState;
  /** Normalized intensity currently commanded (0–1). */
  intensity: number;
  /** Last vibe level applied (0–5), if any. */
  level: VibeLevel;
  /** Human-readable RU status line. */
  detailRu: string;
  /** Connected toy / mock device names. */
  devices: string[];
  /** True when Electron IPC bridge is available. */
  desktop: boolean;
  /** Backend-specific trust / setup note. */
  trustNoteRu?: string;
  /** Milliseconds since epoch of last successful command. */
  lastCommandAt?: number;
  error?: string;
}

export interface DeviceConnectOptions {
  backend: DeviceBackendId;
  /** Lovense Game Mode base, e.g. http://192.168.1.10:20010 */
  lovenseBaseUrl?: string;
  /** Intiface Central WebSocket, e.g. ws://127.0.0.1:12345 */
  buttplugUrl?: string;
}

export interface DeviceSettings {
  backend: DeviceBackendId;
  lovenseBaseUrl: string;
  buttplugUrl: string;
  /** Auto-connect on app start when desktop bridge exists. */
  autoConnect: boolean;
}

export const DEFAULT_DEVICE_SETTINGS: DeviceSettings = {
  backend: "mock",
  lovenseBaseUrl: "http://127.0.0.1:20010",
  buttplugUrl: "ws://127.0.0.1:12345",
  autoConnect: false,
};

export const DEVICE_BACKEND_LABELS_RU: Record<DeviceBackendId, string> = {
  mock: "Mock (без игрушки)",
  lovense: "Lovense (Game Mode)",
  buttplug: "Buttplug / Intiface",
};

export function emptyDeviceStatus(
  backend: DeviceBackendId = "mock",
  desktop = false,
): DeviceStatus {
  return {
    backend,
    state: "disconnected",
    intensity: 0,
    level: 0,
    detailRu: desktop ? "не подключено" : "браузер · только mock",
    devices: [],
    desktop,
  };
}
