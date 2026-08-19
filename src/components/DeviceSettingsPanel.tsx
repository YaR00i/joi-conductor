import { useEffect, useState } from "react";
import {
  connectDevice,
  disconnectDevice,
  isDeviceDesktopAvailable,
  refreshDeviceStatus,
  setDeviceVibeLevel,
  stopDevice,
  subscribeDeviceStatus,
} from "../lib/device/deviceClient";
import {
  loadDeviceSettings,
  saveDeviceSettings,
} from "../lib/device/deviceSettings";
import {
  DEVICE_BACKEND_LABELS_RU,
  type DeviceBackendId,
  type DeviceSettings,
  type DeviceStatus,
  emptyDeviceStatus,
} from "../lib/device/deviceTypes";

const BACKENDS: DeviceBackendId[] = ["mock", "lovense", "buttplug"];

function backendBlurb(id: DeviceBackendId): string {
  switch (id) {
    case "mock":
      return "Без игрушки: Connect → тест уровней → статус пульсирует.";
    case "lovense":
      return "Lovense Remote → Discover → Game Mode (LAN). Базовый URL вида http://IP:20010.";
    case "buttplug":
      return "Intiface Central должен слушать WebSocket. Без проверки на железе — путь «на доверии».";
    default: {
      const _exhaustive: never = id;
      return _exhaustive;
    }
  }
}

export function DeviceSettingsPanel() {
  const [settings, setSettings] = useState<DeviceSettings>(() =>
    loadDeviceSettings(),
  );
  const [status, setStatus] = useState<DeviceStatus>(() =>
    emptyDeviceStatus(loadDeviceSettings().backend, isDeviceDesktopAvailable()),
  );
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [testLevel, setTestLevel] = useState(3);

  useEffect(() => {
    const unsub = subscribeDeviceStatus(setStatus);
    void refreshDeviceStatus();
    const poll = window.setInterval(() => {
      void refreshDeviceStatus();
    }, 1200);
    return () => {
      unsub();
      window.clearInterval(poll);
    };
  }, []);

  function persist(next: DeviceSettings) {
    setSettings(next);
    saveDeviceSettings(next);
  }

  async function onConnect() {
    setBusy(true);
    setHint(null);
    try {
      const st = await connectDevice({
        backend: settings.backend,
        lovenseBaseUrl: settings.lovenseBaseUrl,
        buttplugUrl: settings.buttplugUrl,
      });
      setHint(st.state === "connected" ? "подключено" : st.detailRu);
    } catch (err) {
      setHint(err instanceof Error ? err.message : "ошибка Connect");
    } finally {
      setBusy(false);
    }
  }

  async function onDisconnect() {
    setBusy(true);
    setHint(null);
    try {
      await disconnectDevice();
      setHint("отключено");
    } finally {
      setBusy(false);
    }
  }

  async function onStop() {
    setBusy(true);
    try {
      await stopDevice();
      setHint("стоп");
    } finally {
      setBusy(false);
    }
  }

  async function onTest() {
    setBusy(true);
    setHint(null);
    try {
      const st = await setDeviceVibeLevel(testLevel);
      setHint(
        st.state === "connected"
          ? `тест · уровень ${testLevel}`
          : st.detailRu,
      );
    } catch (err) {
      setHint(err instanceof Error ? err.message : "ошибка теста");
    } finally {
      setBusy(false);
    }
  }

  const connected = status.state === "connected";
  const stateClass =
    status.state === "connected"
      ? "is-ok"
      : status.state === "error"
        ? "is-err"
        : status.state === "connecting"
          ? "is-busy"
          : "";

  return (
    <div className="device-panel">
      <div className="device-panel__head">
        <strong>Игрушка · Device Bridge</strong>
        <span className="device-panel__sub">
          Уровни сессии 0–5 → интенсивность. Пауза / конец / смена блока — стоп.
        </span>
      </div>

      <div className="today__fields">
        <label className="field">
          <span className="field__label">Backend</span>
          <select
            value={settings.backend}
            disabled={busy || connected}
            onChange={(e) => {
              const backend = e.target.value as DeviceBackendId;
              if (!BACKENDS.includes(backend)) return;
              persist({ ...settings, backend });
            }}
          >
            {BACKENDS.map((id) => (
              <option key={id} value={id}>
                {DEVICE_BACKEND_LABELS_RU[id]}
              </option>
            ))}
          </select>
          <span className="field__hint">{backendBlurb(settings.backend)}</span>
        </label>

        {settings.backend === "lovense" ? (
          <label className="field">
            <span className="field__label">Lovense Game Mode URL</span>
            <input
              value={settings.lovenseBaseUrl}
              disabled={busy || connected}
              onChange={(e) =>
                persist({ ...settings, lovenseBaseUrl: e.target.value })
              }
              placeholder="http://192.168.1.10:20010"
              autoComplete="off"
            />
            <span className="field__hint">
              HTTP :20010 (без SSL). HTTPS :30010 часто ломается на сертификате.
            </span>
          </label>
        ) : null}

        {settings.backend === "buttplug" ? (
          <label className="field">
            <span className="field__label">Intiface WebSocket</span>
            <input
              value={settings.buttplugUrl}
              disabled={busy || connected}
              onChange={(e) =>
                persist({ ...settings, buttplugUrl: e.target.value })
              }
              placeholder="ws://127.0.0.1:12345"
              autoComplete="off"
            />
            <span className="field__hint">
              Запусти Intiface Central и включи Server. Железо здесь не
              проверялось.
            </span>
          </label>
        ) : null}

        <label className="field field--check">
          <input
            type="checkbox"
            checked={settings.autoConnect}
            onChange={(e) =>
              persist({ ...settings, autoConnect: e.target.checked })
            }
          />
          <span>
            Авто-Connect при старте приложения
            <span className="field__hint">
              {" "}
              · сработает в Electron, если bridge доступен
            </span>
          </span>
        </label>
      </div>

      <div
        className={`device-panel__status ${stateClass}${
          connected && status.intensity > 0 ? " is-pulse" : ""
        }`}
        role="status"
      >
        <div className="device-panel__status-row">
          <span className="device-panel__dot" aria-hidden />
          <strong>
            {DEVICE_BACKEND_LABELS_RU[status.backend]} · {status.state}
          </strong>
        </div>
        <p>{status.detailRu}</p>
        {status.devices.length > 0 ? (
          <p className="device-panel__devices">
            Устройства: {status.devices.join(", ")}
          </p>
        ) : null}
        {status.trustNoteRu ? (
          <p className="device-panel__trust">{status.trustNoteRu}</p>
        ) : null}
      </div>

      <div className="device-panel__actions today__actions">
        <button
          type="button"
          className="btn-primary"
          disabled={busy || connected}
          onClick={() => void onConnect()}
        >
          Connect
        </button>
        <button
          type="button"
          className="btn-ghost"
          disabled={busy || !connected}
          onClick={() => void onStop()}
        >
          Stop
        </button>
        <button
          type="button"
          className="btn-ghost"
          disabled={busy || status.state === "disconnected"}
          onClick={() => void onDisconnect()}
        >
          Disconnect
        </button>
      </div>

      <div className="device-panel__test">
        <label className="field">
          <span className="field__label">Тест уровня (0–5)</span>
          <input
            type="range"
            min={0}
            max={5}
            step={1}
            value={testLevel}
            disabled={busy || !connected}
            onChange={(e) => setTestLevel(Number(e.target.value))}
          />
          <span className="field__hint">сейчас: {testLevel}</span>
        </label>
        <button
          type="button"
          className="btn-ghost"
          disabled={busy || !connected}
          onClick={() => void onTest()}
        >
          Отправить уровень
        </button>
      </div>

      {hint ? (
        <p className="device-panel__hint" role="status">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
