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
  type DeviceBackendId,
  type DeviceConnectionState,
  type DeviceSettings,
  type DeviceStatus,
  emptyDeviceStatus,
} from "../lib/device/deviceTypes";
import { UiCheck } from "./UiCheck";

function deviceTone(
  state: DeviceConnectionState,
): "ok" | "off" | "busy" | "warn" {
  switch (state) {
    case "connected":
      return "ok";
    case "connecting":
      return "busy";
    case "error":
      return "off";
    case "disconnected":
      return "warn";
    default: {
      const _exhaustive: never = state;
      return _exhaustive;
    }
  }
}

function deviceStateRu(state: DeviceConnectionState): string {
  switch (state) {
    case "connected":
      return "онлайн";
    case "connecting":
      return "подключаю";
    case "error":
      return "ошибка";
    case "disconnected":
      return "офлайн";
    default: {
      const _exhaustive: never = state;
      return _exhaustive;
    }
  }
}

function backendRowCopy(id: DeviceBackendId): { title: string; sub: string } {
  switch (id) {
    case "mock":
      return { title: "Mock", sub: "без железа" };
    case "lovense":
      return { title: "Lovense", sub: "Game Mode · LAN" };
    case "buttplug":
      return { title: "Buttplug", sub: "Intiface" };
    default: {
      const _exhaustive: never = id;
      return _exhaustive;
    }
  }
}

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

const BACKENDS: DeviceBackendId[] = ["mock", "lovense", "buttplug"];

export function DeviceSettingsPanel({
  embedded = false,
}: {
  embedded?: boolean;
}) {
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
  const tone = deviceTone(status.state);

  return (
    <div className={embedded ? "gameplay-pane" : "device-panel"}>
      {embedded ? null : (
        <div className="device-panel__head">
          <strong>Игрушка · Device Bridge</strong>
          <span className="device-panel__sub">
            Уровни сессии 0–5 → интенсивность. Пауза / конец / смена блока —
            стоп.
          </span>
        </div>
      )}

      <div className="brain-panel__bar">
        <span className={`brain-dot brain-dot--${tone}`}>
          {deviceStateRu(status.state)}
          {status.desktop ? " · electron" : " · браузер"}
        </span>
        <div className="brain-panel__links">
          <button
            type="button"
            className="brain-act"
            disabled={busy || connected}
            onClick={() => void onConnect()}
          >
            connect
          </button>
          <button
            type="button"
            className="brain-act"
            disabled={busy || !connected}
            onClick={() => void onStop()}
          >
            стоп
          </button>
          <button
            type="button"
            className="brain-act"
            disabled={busy || status.state === "disconnected"}
            onClick={() => void onDisconnect()}
          >
            disconnect
          </button>
        </div>
      </div>

      <h3 className="brain-panel__h">Backend</h3>
      <ul className="brain-list">
        {BACKENDS.map((id) => {
          const copy = backendRowCopy(id);
          const active = settings.backend === id;
          return (
            <li
              key={id}
              className={"brain-row" + (active ? " is-active" : "")}
            >
              <div className="brain-row__main">
                <span className="brain-row__name">{copy.title}</span>
                <span className="brain-row__meta">
                  {active ? "активен · " : ""}
                  {copy.sub}
                </span>
              </div>
              <div className="brain-row__acts">
                <button
                  type="button"
                  className="brain-act"
                  disabled={active || busy || connected}
                  onClick={() => persist({ ...settings, backend: id })}
                >
                  выбрать
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="brain-panel__hint">{backendBlurb(settings.backend)}</p>

      <div className="brain-fields">
        {settings.backend === "lovense" ? (
          <label className="brain-field">
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
          <label className="brain-field">
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
              Запусти Intiface Central и включи Server.
            </span>
          </label>
        ) : null}

        <UiCheck
          checked={settings.autoConnect}
          onChange={(v) => persist({ ...settings, autoConnect: v })}
        >
          Авто-Connect при старте приложения
        </UiCheck>
      </div>

      <p className="brain-panel__hint" role="status">
        {status.detailRu}
        {status.devices.length > 0
          ? ` · ${status.devices.join(", ")}`
          : ""}
        {status.trustNoteRu ? ` · ${status.trustNoteRu}` : ""}
      </p>

      <h3 className="brain-panel__h">Тест</h3>
      <label className="brain-field">
        <span className="field__label">Уровень {testLevel} / 5</span>
        <input
          type="range"
          min={0}
          max={5}
          step={1}
          value={testLevel}
          disabled={busy || !connected}
          onChange={(e) => setTestLevel(Number(e.target.value))}
        />
      </label>
      <div className="brain-panel__links">
        <button
          type="button"
          className="brain-act"
          disabled={busy || !connected}
          onClick={() => void onTest()}
        >
          отправить уровень
        </button>
      </div>

      {hint ? (
        <p className="brain-panel__log" role="status">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
