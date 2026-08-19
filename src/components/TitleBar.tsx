import { useEffect, useState } from "react";
import {
  fetchOllamaStatus,
  ollamaStatusTone,
  type OllamaStatus,
} from "../lib/ollamaClient";
import type { TtsProviderSetting } from "../lib/voiceSettings";
import { CageLockPill } from "./CageLockPill";
import { DenialQuestPill } from "./DenialQuestPill";

export function isDesktopShell(): boolean {
  return Boolean(window.joiDesktop?.isDesktop);
}

function IconMinimize() {
  return (
    <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden>
      <path
        d="M2.2 6h7.6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconMaximize() {
  return (
    <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden>
      <rect
        x="2.1"
        y="2.1"
        width="7.8"
        height="7.8"
        rx="1.1"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.35"
      />
    </svg>
  );
}

function IconRestore() {
  return (
    <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden>
      <path
        d="M3.4 4.1h5.4v5.4H3.4z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.25"
      />
      <path
        d="M4.6 4.1V2.7h5.4v5.4H8.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.25"
      />
    </svg>
  );
}

function IconClose() {
  return (
    <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden>
      <path
        d="M3 3l6 6M9 3L3 9"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

type VoiceTone = "ok" | "warn" | "off" | "busy";

type TitleBarProps = {
  llmActive?: boolean;
  llmModel?: string;
  ttsEnabled?: boolean;
  ttsProvider?: TtsProviderSetting;
  sovitsUrl?: string;
};

/** Always visible themed window controls (min / max / close). */
export function TitleBar({
  llmActive = false,
  llmModel = "",
  ttsEnabled = false,
  ttsProvider = "sovits",
  sovitsUrl = "http://127.0.0.1:9880",
}: TitleBarProps) {
  const [desktop, setDesktop] = useState(() => isDesktopShell());
  const [maximized, setMaximized] = useState(false);
  const [llmStatus, setLlmStatus] = useState<OllamaStatus | null>(null);
  const [voiceTone, setVoiceTone] = useState<VoiceTone>("off");
  const [voiceDetail, setVoiceDetail] = useState("");

  useEffect(() => {
    setDesktop(isDesktopShell());
    if (!window.joiDesktop?.onMaximized) return;
    return window.joiDesktop.onMaximized(setMaximized);
  }, []);

  useEffect(() => {
    if (!llmActive) {
      setLlmStatus(null);
      return;
    }
    let cancelled = false;
    const tick = async () => {
      try {
        const next = await fetchOllamaStatus(llmModel);
        if (!cancelled) setLlmStatus(next);
      } catch {
        if (!cancelled) setLlmStatus(null);
      }
    };
    void tick();
    const id = window.setInterval(() => void tick(), 6000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [llmActive, llmModel]);

  useEffect(() => {
    if (!ttsEnabled) {
      setVoiceTone("off");
      setVoiceDetail("TTS выключен");
      return;
    }

    let cancelled = false;

    const tick = async () => {
      if (ttsProvider === "system") {
        if (!cancelled) {
          setVoiceTone("ok");
          setVoiceDetail("Системный TTS");
        }
        return;
      }
      if (ttsProvider === "edge") {
        if (!cancelled) {
          setVoiceTone("ok");
          setVoiceDetail("Edge Neural");
        }
        return;
      }
      if (ttsProvider === "piper") {
        try {
          const st = await window.joiDesktop?.tts?.piperStatus?.();
          if (cancelled) return;
          if (st?.ready) {
            setVoiceTone("ok");
            setVoiceDetail("Piper готов");
          } else {
            setVoiceTone("warn");
            setVoiceDetail("Piper не установлен");
          }
        } catch {
          if (!cancelled) {
            setVoiceTone("off");
            setVoiceDetail("Piper недоступен");
          }
        }
        return;
      }

      // sovits / auto — green when SoVITS online
      const api = window.joiDesktop?.tts;
      if (!api?.sovitsStatus) {
        if (!cancelled) {
          setVoiceTone(desktop ? "off" : "warn");
          setVoiceDetail(
            desktop ? "Нет IPC SoVITS" : "Голос только в Electron",
          );
        }
        return;
      }
      try {
        if (!cancelled) setVoiceTone((t) => (t === "ok" ? t : "busy"));
        const st = await api.sovitsStatus({ baseUrl: sovitsUrl });
        if (cancelled) return;
        if (st.online) {
          setVoiceTone("ok");
          setVoiceDetail(st.detail || "SoVITS онлайн");
        } else {
          setVoiceTone("off");
          setVoiceDetail(st.detail || "SoVITS офлайн");
        }
      } catch (err) {
        if (!cancelled) {
          setVoiceTone("off");
          setVoiceDetail(
            err instanceof Error ? err.message : "Ошибка статуса голоса",
          );
        }
      }
    };

    void tick();
    const id = window.setInterval(() => void tick(), 5000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [ttsEnabled, ttsProvider, sovitsUrl, desktop]);

  function onMinimize() {
    window.joiDesktop?.minimize();
  }

  function onMaximize() {
    if (window.joiDesktop?.maximize) {
      window.joiDesktop.maximize();
      return;
    }
    if (!document.fullscreenElement) {
      void document.documentElement.requestFullscreen?.();
      setMaximized(true);
    } else {
      void document.exitFullscreen?.();
      setMaximized(false);
    }
  }

  function onClose() {
    if (window.joiDesktop?.close) {
      window.joiDesktop.close();
      return;
    }
    window.close();
  }

  const llmTone = ollamaStatusTone(llmStatus);
  const llmLabel =
    llmTone === "ok"
      ? "LLM"
      : llmTone === "warn"
        ? "LLM · модель"
        : llmTone === "busy"
          ? "LLM…"
          : "LLM off";

  const voiceLabel =
    !ttsEnabled
      ? "Voice off"
      : voiceTone === "ok"
        ? "Voice"
        : voiceTone === "warn"
          ? "Voice · ?"
          : voiceTone === "busy"
            ? "Voice…"
            : "Voice off";

  return (
    <header className="titlebar" aria-label="Окно приложения">
      <div className="titlebar__brand">
        <img className="titlebar__icon" src="/icon.png" alt="" />
        <span className="titlebar__name">JOI Conductor</span>
        {llmActive ? (
          <span
            className={`titlebar__pill titlebar__pill--${llmTone}`}
            title={llmStatus?.detail ?? "Статус Local LLM"}
          >
            {llmLabel}
          </span>
        ) : null}
        <span
          className={`titlebar__pill titlebar__pill--${ttsEnabled ? voiceTone : "off"}`}
          title={voiceDetail || "Статус озвучки"}
        >
          {voiceLabel}
        </span>
        <CageLockPill />
        <DenialQuestPill />
        <span className="titlebar__phase" title="Фаза программы">
          Phase 2
        </span>
      </div>

      <div className="titlebar__controls">
        <button
          type="button"
          className="titlebar__btn"
          title="Свернуть"
          aria-label="Свернуть"
          onClick={onMinimize}
          disabled={!desktop}
        >
          <IconMinimize />
        </button>
        <button
          type="button"
          className="titlebar__btn"
          title={maximized ? "Восстановить" : "На весь экран"}
          aria-label={maximized ? "Восстановить" : "На весь экран"}
          onClick={onMaximize}
        >
          {maximized ? <IconRestore /> : <IconMaximize />}
        </button>
        <button
          type="button"
          className="titlebar__btn titlebar__btn--close"
          title="Закрыть"
          aria-label="Закрыть"
          onClick={onClose}
        >
          <IconClose />
        </button>
      </div>
    </header>
  );
}
