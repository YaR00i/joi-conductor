import {
  DEFAULT_DEVICE_SETTINGS,
  type DeviceBackendId,
  type DeviceSettings,
} from "./deviceTypes";

const STORAGE_KEY = "joi-device-settings-v1";

const BACKENDS: DeviceBackendId[] = ["mock", "lovense", "buttplug"];

function isBackend(v: unknown): v is DeviceBackendId {
  return typeof v === "string" && (BACKENDS as string[]).includes(v);
}

export function loadDeviceSettings(): DeviceSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_DEVICE_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<DeviceSettings>;
    return {
      backend: isBackend(parsed.backend)
        ? parsed.backend
        : DEFAULT_DEVICE_SETTINGS.backend,
      lovenseBaseUrl:
        typeof parsed.lovenseBaseUrl === "string" && parsed.lovenseBaseUrl.trim()
          ? parsed.lovenseBaseUrl.trim()
          : DEFAULT_DEVICE_SETTINGS.lovenseBaseUrl,
      buttplugUrl:
        typeof parsed.buttplugUrl === "string" && parsed.buttplugUrl.trim()
          ? parsed.buttplugUrl.trim()
          : DEFAULT_DEVICE_SETTINGS.buttplugUrl,
      autoConnect: Boolean(parsed.autoConnect),
    };
  } catch {
    return { ...DEFAULT_DEVICE_SETTINGS };
  }
}

export function saveDeviceSettings(settings: DeviceSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    /* ignore quota */
  }
}
