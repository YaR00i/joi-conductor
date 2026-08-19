import { vibeLevelToIntensity, clampVibeLevel } from "./intensityMap";
import {
  emptyDeviceStatus,
  type DeviceBackendId,
  type DeviceConnectOptions,
  type DeviceStatus,
} from "./deviceTypes";
import type { VibeLevel } from "../types";

/**
 * Renderer-side device client.
 * Prefers Electron IPC (`joiDesktop.device`); falls back to in-process mock
 * so Settings / VibeHud work in the browser without a toy.
 */

type StatusListener = (status: DeviceStatus) => void;

const listeners = new Set<StatusListener>();

function normalizeStatus(raw: {
  backend: DeviceBackendId;
  state: DeviceStatus["state"];
  intensity: number;
  level: number;
  detailRu: string;
  devices: string[];
  desktop: boolean;
  trustNoteRu?: string;
  lastCommandAt?: number;
  error?: string;
}): DeviceStatus {
  return {
    backend: raw.backend,
    state: raw.state,
    intensity: Math.max(0, Math.min(1, raw.intensity)),
    level: clampVibeLevel(raw.level),
    detailRu: raw.detailRu,
    devices: Array.isArray(raw.devices) ? raw.devices.map(String) : [],
    desktop: Boolean(raw.desktop),
    trustNoteRu: raw.trustNoteRu,
    lastCommandAt: raw.lastCommandAt,
    error: raw.error,
  };
}

/** In-process mock used when Electron bridge is absent. */
class LocalMockDevice {
  private connected = false;
  private intensity = 0;
  private level: VibeLevel = 0;
  private pulseTimer: ReturnType<typeof setInterval> | null = null;
  private pulsePhase = 0;
  private lastCommandAt: number | undefined;

  status(): DeviceStatus {
    const pulsing =
      this.connected && this.intensity > 0
        ? ` · пульс ${Math.round(40 + this.pulsePhase * 40)}%`
        : "";
    return {
      backend: "mock",
      state: this.connected ? "connected" : "disconnected",
      intensity: this.intensity,
      level: this.level,
      detailRu: this.connected
        ? `mock онлайн · ${(this.intensity * 100).toFixed(0)}%${pulsing}`
        : "mock · не подключено",
      devices: this.connected ? ["Mock Vibe"] : [],
      desktop: false,
      trustNoteRu: "Демо без железа — шкала в UI пульсирует.",
      lastCommandAt: this.lastCommandAt,
    };
  }

  async connect(): Promise<DeviceStatus> {
    this.connected = true;
    this.lastCommandAt = Date.now();
    this.startPulse();
    return this.status();
  }

  async disconnect(): Promise<DeviceStatus> {
    this.stopPulse();
    this.connected = false;
    this.intensity = 0;
    this.level = 0;
    this.lastCommandAt = Date.now();
    return this.status();
  }

  async stop(): Promise<DeviceStatus> {
    this.intensity = 0;
    this.level = 0;
    this.lastCommandAt = Date.now();
    return this.status();
  }

  async setIntensity(intensity: number, level?: VibeLevel): Promise<DeviceStatus> {
    if (!this.connected) {
      return {
        ...this.status(),
        state: "error",
        error: "не подключено",
        detailRu: "сначала Connect",
      };
    }
    const i = Math.max(0, Math.min(1, intensity));
    this.intensity = i;
    this.level = level ?? clampVibeLevel(Math.round(i * 5));
    this.lastCommandAt = Date.now();
    return this.status();
  }

  private startPulse(): void {
    this.stopPulse();
    this.pulseTimer = setInterval(() => {
      this.pulsePhase = (this.pulsePhase + 0.15) % 1;
      emitStatus(this.status());
    }, 400);
  }

  private stopPulse(): void {
    if (this.pulseTimer != null) {
      clearInterval(this.pulseTimer);
      this.pulseTimer = null;
    }
    this.pulsePhase = 0;
  }
}

const localMock = new LocalMockDevice();
let lastStatus: DeviceStatus = emptyDeviceStatus("mock", false);

function desktopApi() {
  return window.joiDesktop?.device;
}

function emitStatus(st: DeviceStatus): void {
  lastStatus = st;
  for (const cb of listeners) {
    try {
      cb(st);
    } catch {
      /* ignore listener errors */
    }
  }
}

function hasDesktopBridge(): boolean {
  return Boolean(desktopApi()?.status);
}

export function getCachedDeviceStatus(): DeviceStatus {
  return lastStatus;
}

export function subscribeDeviceStatus(cb: StatusListener): () => void {
  listeners.add(cb);
  cb(lastStatus);
  return () => {
    listeners.delete(cb);
  };
}

export async function refreshDeviceStatus(): Promise<DeviceStatus> {
  const api = desktopApi();
  if (api?.status) {
    const st = normalizeStatus(await api.status());
    emitStatus(st);
    return st;
  }
  const st = localMock.status();
  emitStatus(st);
  return st;
}

export async function connectDevice(
  opts: DeviceConnectOptions,
): Promise<DeviceStatus> {
  const api = desktopApi();
  if (api?.connect) {
    const st = normalizeStatus(await api.connect(opts));
    emitStatus(st);
    return st;
  }
  if (opts.backend !== "mock") {
    const st: DeviceStatus = {
      ...emptyDeviceStatus(opts.backend, false),
      state: "error",
      error: "нужен Electron",
      detailRu: `${opts.backend} доступен только в десктоп-приложении`,
      trustNoteRu:
        "В браузере работает только mock. Запусти через Electron (npm run app).",
    };
    emitStatus(st);
    return st;
  }
  const st = await localMock.connect();
  emitStatus(st);
  return st;
}

export async function disconnectDevice(): Promise<DeviceStatus> {
  const api = desktopApi();
  if (api?.disconnect) {
    const st = normalizeStatus(await api.disconnect());
    emitStatus(st);
    return st;
  }
  const st = await localMock.disconnect();
  emitStatus(st);
  return st;
}

/** Hard stop motors (intensity 0) but keep connection. */
export async function stopDevice(): Promise<DeviceStatus> {
  const api = desktopApi();
  if (api?.stop) {
    const st = normalizeStatus(await api.stop());
    emitStatus(st);
    return st;
  }
  const st = await localMock.stop();
  emitStatus(st);
  return st;
}

export async function setDeviceIntensity(
  intensity: number,
  level?: VibeLevel,
): Promise<DeviceStatus> {
  const api = desktopApi();
  if (api?.setIntensity) {
    const st = normalizeStatus(await api.setIntensity(intensity, level));
    emitStatus(st);
    return st;
  }
  const st = await localMock.setIntensity(intensity, level);
  emitStatus(st);
  return st;
}

export async function setDeviceVibeLevel(level: number): Promise<DeviceStatus> {
  const lvl = clampVibeLevel(level);
  const intensity = vibeLevelToIntensity(lvl);
  return setDeviceIntensity(intensity, lvl);
}

export function deviceBackendNeedsDesktop(backend: DeviceBackendId): boolean {
  switch (backend) {
    case "mock":
      return false;
    case "lovense":
    case "buttplug":
      return true;
    default: {
      const _exhaustive: never = backend;
      return _exhaustive;
    }
  }
}

export function isDeviceDesktopAvailable(): boolean {
  return hasDesktopBridge();
}
