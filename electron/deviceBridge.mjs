/**
 * Device ↔ vibe intensity bridge (main process).
 * Backends: mock | lovense (Game Mode HTTP) | buttplug (Intiface WebSocket).
 *
 * Shared intensity API: setIntensity(0..1), stop(), connect/disconnect.
 */
import WebSocket from "ws";

/** @typedef {"mock" | "lovense" | "buttplug"} DeviceBackendId */
/** @typedef {"disconnected" | "connecting" | "connected" | "error"} DeviceConnectionState */

const TRUST = {
  mock: "Демо без железа — статус пульсирует в UI.",
  lovense:
    "Lovense Remote → Discover → Game Mode (LAN). ПК и телефон в одной сети. HTTP :20010.",
  buttplug:
    "Нужен Intiface Central (ws://127.0.0.1:12345). Без проверки на железе — путь «на доверии».",
};

/** @type {{
 *   backend: DeviceBackendId,
 *   state: DeviceConnectionState,
 *   intensity: number,
 *   level: number,
 *   detailRu: string,
 *   devices: string[],
 *   error?: string,
 *   lastCommandAt?: number,
 *   lovenseBaseUrl: string,
 *   buttplugUrl: string,
 *   pulsePhase: number,
 * }} */
let bridge = {
  backend: "mock",
  state: "disconnected",
  intensity: 0,
  level: 0,
  detailRu: "не подключено",
  devices: [],
  lovenseBaseUrl: "http://127.0.0.1:20010",
  buttplugUrl: "ws://127.0.0.1:12345",
  pulsePhase: 0,
};

/** @type {ReturnType<typeof setInterval> | null} */
let mockPulseTimer = null;

/** @type {WebSocket | null} */
let bpSocket = null;
/** @type {Map<number, { resolve: (v: unknown) => void, reject: (e: Error) => void, timer: ReturnType<typeof setTimeout> }>} */
let bpPending = new Map();
let bpMsgId = 1;
/** @type {Array<{ index: number, name: string, vibrateFeatures: number[] }>} */
let bpDevices = [];

function clamp01(n) {
  const x = typeof n === "number" && Number.isFinite(n) ? n : 0;
  return Math.max(0, Math.min(1, x));
}

function clampLevel(n) {
  const x = Math.round(typeof n === "number" && Number.isFinite(n) ? n : 0);
  if (x <= 0) return 0;
  if (x >= 5) return 5;
  return x;
}

function intensityToLovense(intensity) {
  return Math.round(clamp01(intensity) * 20);
}

function snapshot() {
  const pulsing =
    bridge.backend === "mock" &&
    bridge.state === "connected" &&
    bridge.intensity > 0
      ? ` · пульс ${Math.round(40 + bridge.pulsePhase * 40)}%`
      : "";
  return {
    backend: bridge.backend,
    state: bridge.state,
    intensity: bridge.intensity,
    level: bridge.level,
    detailRu: bridge.detailRu + pulsing,
    devices: [...bridge.devices],
    desktop: true,
    trustNoteRu: TRUST[bridge.backend],
    lastCommandAt: bridge.lastCommandAt,
    error: bridge.error,
  };
}

function setError(detailRu, error) {
  bridge.state = "error";
  bridge.detailRu = detailRu;
  bridge.error = error ?? detailRu;
  return snapshot();
}

function stopMockPulse() {
  if (mockPulseTimer != null) {
    clearInterval(mockPulseTimer);
    mockPulseTimer = null;
  }
  bridge.pulsePhase = 0;
}

function startMockPulse() {
  stopMockPulse();
  mockPulseTimer = setInterval(() => {
    bridge.pulsePhase = (bridge.pulsePhase + 0.15) % 1;
  }, 400);
}

async function lovenseCommand(body) {
  const base = bridge.lovenseBaseUrl.replace(/\/+$/, "");
  const url = `${base}/command`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-platform": "JOI-Conductor",
    },
    body: JSON.stringify({ ...body, apiVer: 1 }),
    signal: AbortSignal.timeout(8000),
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 120)}`);
  }
  // Lovense often returns { code: 200, ... } or { type: "ok" }
  if (
    json &&
    typeof json === "object" &&
    "code" in json &&
    Number(json.code) !== 200 &&
    Number(json.code) !== 0
  ) {
    throw new Error(json.message || `Lovense code ${json.code}`);
  }
  return json;
}

function bpClose() {
  if (bpSocket) {
    try {
      bpSocket.removeAllListeners();
      bpSocket.close();
    } catch {
      /* ignore */
    }
  }
  bpSocket = null;
  for (const [, p] of bpPending) {
    clearTimeout(p.timer);
    p.reject(new Error("buttplug closed"));
  }
  bpPending.clear();
  bpDevices = [];
}

/**
 * @param {Record<string, unknown>} msg
 * @param {number} [timeoutMs]
 */
function bpSend(msg, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    if (!bpSocket || bpSocket.readyState !== WebSocket.OPEN) {
      reject(new Error("buttplug не подключён"));
      return;
    }
    const id = bpMsgId++;
    const key = Object.keys(msg)[0];
    if (!key) {
      reject(new Error("empty buttplug message"));
      return;
    }
    const payload = { ...msg[key], Id: id };
    const envelope = [{ [key]: payload }];
    const timer = setTimeout(() => {
      bpPending.delete(id);
      reject(new Error("buttplug timeout"));
    }, timeoutMs);
    bpPending.set(id, { resolve, reject, timer });
    bpSocket.send(JSON.stringify(envelope));
  });
}

function bpHandleMessage(raw) {
  let list;
  try {
    list = JSON.parse(String(raw));
  } catch {
    return;
  }
  if (!Array.isArray(list)) return;
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const type = Object.keys(item)[0];
    if (!type) continue;
    const body = item[type];
    const id = body?.Id;
    if (type === "DeviceAdded" || type === "DeviceList") {
      syncBpDevices(type === "DeviceList" ? body?.Devices : [body]);
    }
    if (type === "DeviceRemoved" && body?.DeviceIndex != null) {
      bpDevices = bpDevices.filter((d) => d.index !== body.DeviceIndex);
      bridge.devices = bpDevices.map((d) => d.name);
    }
    if (typeof id === "number" && bpPending.has(id)) {
      const p = bpPending.get(id);
      bpPending.delete(id);
      clearTimeout(p.timer);
      if (type === "Error") {
        p.reject(new Error(body?.ErrorMessage || "buttplug error"));
      } else {
        p.resolve(item);
      }
    }
  }
}

function syncBpDevices(list) {
  if (!Array.isArray(list)) return;
  const next = [];
  for (const d of list) {
    if (!d || typeof d !== "object") continue;
    const index = d.DeviceIndex ?? d.deviceIndex;
    const name = d.DeviceName || d.deviceName || `device-${index}`;
    const vibrateFeatures = [];
    const attrs = d.DeviceMessages || d.deviceMessages || {};
    // Protocol v3: ScalarCmd array with ActuatorType
    const scalar = attrs.ScalarCmd || attrs.scalarCmd;
    if (Array.isArray(scalar)) {
      scalar.forEach((feat, i) => {
        const act = feat?.ActuatorType || feat?.actuatorType || "";
        if (String(act).toLowerCase().includes("vibrat") || !act) {
          vibrateFeatures.push(feat?.Index ?? i);
        }
      });
    }
    // Protocol v2 fallback: VibrateCmd
    const vibe = attrs.VibrateCmd || attrs.vibrateCmd;
    if (vibrateFeatures.length === 0 && vibe) {
      const n = vibe.FeatureCount ?? vibe.featureCount ?? 1;
      for (let i = 0; i < n; i++) vibrateFeatures.push(i);
    }
    if (vibrateFeatures.length === 0) vibrateFeatures.push(0);
    if (typeof index === "number") {
      next.push({ index, name: String(name), vibrateFeatures });
    }
  }
  if (next.length) {
    bpDevices = next;
    bridge.devices = bpDevices.map((d) => d.name);
  }
}

async function connectButtplug(url) {
  bpClose();
  await new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const failTimer = setTimeout(() => {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
      reject(new Error("таймаут Intiface"));
    }, 8000);
    ws.once("open", () => {
      clearTimeout(failTimer);
      bpSocket = ws;
      ws.on("message", (data) => bpHandleMessage(data));
      ws.on("close", () => {
        if (bpSocket === ws) {
          bpSocket = null;
          if (bridge.backend === "buttplug" && bridge.state === "connected") {
            bridge.state = "disconnected";
            bridge.detailRu = "Intiface отключился";
            bridge.devices = [];
            bridge.intensity = 0;
            bridge.level = 0;
          }
        }
      });
      ws.on("error", () => {
        /* close handler covers */
      });
      resolve();
    });
    ws.once("error", (err) => {
      clearTimeout(failTimer);
      reject(err instanceof Error ? err : new Error(String(err)));
    });
  });

  await bpSend({
    RequestServerInfo: {
      ClientName: "JOI Conductor",
      MessageVersion: 3,
    },
  });
  const listRes = await bpSend({ RequestDeviceList: {} });
  const listBody = listRes?.DeviceList;
  if (listBody?.Devices) syncBpDevices(listBody.Devices);
  try {
    await bpSend({ StartScanning: {} }, 3000);
  } catch {
    /* scanning optional */
  }
  // Brief wait for DeviceAdded
  await new Promise((r) => setTimeout(r, 600));
  try {
    await bpSend({ StopScanning: {} }, 2000);
  } catch {
    /* ignore */
  }
  if (bpDevices.length === 0) {
    const again = await bpSend({ RequestDeviceList: {} });
    if (again?.DeviceList?.Devices) syncBpDevices(again.DeviceList.Devices);
  }
}

async function buttplugSetIntensity(intensity) {
  if (!bpDevices.length) {
    throw new Error("нет устройств в Intiface");
  }
  const scalar = clamp01(intensity);
  for (const dev of bpDevices) {
    const scalars = dev.vibrateFeatures.map((idx) => ({
      Index: idx,
      Scalar: scalar,
      ActuatorType: "Vibrate",
    }));
    try {
      await bpSend({
        ScalarCmd: {
          DeviceIndex: dev.index,
          Scalars: scalars,
        },
      });
    } catch {
      // v2 fallback
      await bpSend({
        VibrateCmd: {
          DeviceIndex: dev.index,
          Speeds: dev.vibrateFeatures.map((idx) => ({
            Index: idx,
            Speed: scalar,
          })),
        },
      });
    }
  }
}

async function buttplugStop() {
  try {
    await bpSend({ StopAllDevices: {} });
  } catch {
    for (const dev of bpDevices) {
      try {
        await bpSend({ StopDeviceCmd: { DeviceIndex: dev.index } });
      } catch {
        /* ignore */
      }
    }
  }
}

/**
 * @param {{
 *   backend?: DeviceBackendId,
 *   lovenseBaseUrl?: string,
 *   buttplugUrl?: string,
 * }} opts
 */
export async function deviceConnect(opts = {}) {
  await deviceDisconnect();

  const backend = opts.backend || "mock";
  bridge.backend = backend;
  bridge.state = "connecting";
  bridge.error = undefined;
  bridge.intensity = 0;
  bridge.level = 0;
  bridge.devices = [];
  bridge.detailRu = "подключение…";

  if (typeof opts.lovenseBaseUrl === "string" && opts.lovenseBaseUrl.trim()) {
    bridge.lovenseBaseUrl = opts.lovenseBaseUrl.trim();
  }
  if (typeof opts.buttplugUrl === "string" && opts.buttplugUrl.trim()) {
    bridge.buttplugUrl = opts.buttplugUrl.trim();
  }

  try {
    switch (backend) {
      case "mock": {
        bridge.state = "connected";
        bridge.devices = ["Mock Vibe"];
        bridge.detailRu = "mock онлайн · 0%";
        bridge.lastCommandAt = Date.now();
        startMockPulse();
        return snapshot();
      }
      case "lovense": {
        const toys = await lovenseCommand({ command: "GetToys" });
        const names = [];
        const data = toys?.data ?? toys?.toys ?? toys;
        if (data && typeof data === "object") {
          for (const [id, info] of Object.entries(data)) {
            if (info && typeof info === "object" && info.name) {
              names.push(String(info.name));
            } else if (typeof info === "string") {
              names.push(info);
            } else {
              names.push(String(id));
            }
          }
        }
        bridge.state = "connected";
        bridge.devices = names.length ? names : ["Lovense (LAN)"];
        bridge.detailRu = names.length
          ? `Lovense · ${names.join(", ")}`
          : "Lovense Game Mode · ответ ок";
        bridge.lastCommandAt = Date.now();
        return snapshot();
      }
      case "buttplug": {
        await connectButtplug(bridge.buttplugUrl);
        bridge.state = "connected";
        bridge.detailRu = bpDevices.length
          ? `Intiface · ${bpDevices.map((d) => d.name).join(", ")}`
          : "Intiface онлайн · устройств пока нет (подключи в Central)";
        bridge.devices = bpDevices.map((d) => d.name);
        bridge.lastCommandAt = Date.now();
        return snapshot();
      }
      default: {
        return setError(`неизвестный backend: ${backend}`);
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    bridge.state = "error";
    bridge.detailRu = `ошибка: ${msg}`;
    bridge.error = msg;
    stopMockPulse();
    bpClose();
    return snapshot();
  }
}

export async function deviceDisconnect() {
  stopMockPulse();
  if (bridge.state === "connected") {
    try {
      await deviceStop();
    } catch {
      /* ignore */
    }
  }
  if (bridge.backend === "buttplug") bpClose();
  bridge.state = "disconnected";
  bridge.intensity = 0;
  bridge.level = 0;
  bridge.devices = [];
  bridge.detailRu = "не подключено";
  bridge.error = undefined;
  bridge.lastCommandAt = Date.now();
  return snapshot();
}

export async function deviceStop() {
  bridge.intensity = 0;
  bridge.level = 0;
  bridge.lastCommandAt = Date.now();
  if (bridge.state !== "connected") {
    bridge.detailRu =
      bridge.state === "disconnected" ? "не подключено" : bridge.detailRu;
    return snapshot();
  }
  try {
    switch (bridge.backend) {
      case "mock": {
        bridge.detailRu = "mock онлайн · стоп";
        return snapshot();
      }
      case "lovense": {
        await lovenseCommand({
          command: "Function",
          action: "Stop",
          timeSec: 0,
        });
        bridge.detailRu = "Lovense · стоп";
        return snapshot();
      }
      case "buttplug": {
        await buttplugStop();
        bridge.detailRu = "Intiface · стоп";
        return snapshot();
      }
      default: {
        return setError(`неизвестный backend: ${bridge.backend}`);
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return setError(`стоп: ${msg}`, msg);
  }
}

/**
 * @param {number} intensity 0..1
 * @param {number} [level] optional vibe level 0..5 for status
 */
export async function deviceSetIntensity(intensity, level) {
  const i = clamp01(intensity);
  const lvl =
    level != null ? clampLevel(level) : clampLevel(Math.round(i * 5));
  if (bridge.state !== "connected") {
    return setError("сначала Connect", "не подключено");
  }
  bridge.intensity = i;
  bridge.level = lvl;
  bridge.lastCommandAt = Date.now();
  try {
    switch (bridge.backend) {
      case "mock": {
        bridge.detailRu = `mock онлайн · ${(i * 100).toFixed(0)}%`;
        return snapshot();
      }
      case "lovense": {
        const v = intensityToLovense(i);
        if (v <= 0) {
          await lovenseCommand({
            command: "Function",
            action: "Stop",
            timeSec: 0,
          });
          bridge.detailRu = "Lovense · стоп";
        } else {
          await lovenseCommand({
            command: "Function",
            action: `Vibrate:${v}`,
            timeSec: 0,
          });
          bridge.detailRu = `Lovense · Vibrate:${v}`;
        }
        return snapshot();
      }
      case "buttplug": {
        if (i <= 0) await buttplugStop();
        else await buttplugSetIntensity(i);
        bridge.detailRu = `Intiface · ${(i * 100).toFixed(0)}%`;
        return snapshot();
      }
      default: {
        return setError(`неизвестный backend: ${bridge.backend}`);
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return setError(`команда: ${msg}`, msg);
  }
}

export function deviceStatus() {
  return snapshot();
}

const DEVICE_STOP_ON_QUIT_GRACE_MS = 1500;
let deviceStopOnQuitStarted = false;

/**
 * The stop command must reach the device before bpClose() discards pending
 * sends — otherwise a connected toy keeps running after the app exits.
 * Bounded by a short grace so quit is never delayed for long.
 */
export async function deviceStopOnQuit() {
  stopMockPulse();
  if (deviceStopOnQuitStarted) return;
  deviceStopOnQuitStarted = true;
  try {
    await Promise.race([
      deviceStop(),
      new Promise((resolve) =>
        setTimeout(resolve, DEVICE_STOP_ON_QUIT_GRACE_MS),
      ),
    ]);
  } catch {
    /* device already gone */
  }
  bpClose();
}
