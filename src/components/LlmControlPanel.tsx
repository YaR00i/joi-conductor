import { useCallback, useEffect, useRef, useState } from "react";
import {
  canManageOllama,
  fetchOllamaStatus,
  onOllamaPullProgress,
  ollamaStatusTone,
  pullOllamaModel,
  startOllama,
  stopManagedOllama,
  type OllamaStatus,
} from "../lib/ollamaClient";
import { UiCheck } from "./UiCheck";

type Props = {
  model: string;
  enabled: boolean;
  autoStart: boolean;
  onModelChange: (model: string) => void;
  onAutoStartChange: (value: boolean) => void;
};

function modelBase(name: string): string {
  return name.split(":")[0] ?? name;
}

function resolveModelName(preferred: string, models: string[]): string | null {
  if (!preferred || models.length === 0) return null;
  if (models.includes(preferred)) return preferred;
  const want = modelBase(preferred);
  return models.find((m) => modelBase(m) === want) ?? null;
}

export function LlmControlPanel({
  model,
  enabled,
  autoStart,
  onModelChange,
  onAutoStartChange,
}: Props) {
  const [status, setStatus] = useState<OllamaStatus | null>(null);
  const [busy, setBusy] = useState<"idle" | "refresh" | "start" | "stop" | "pull">(
    "idle",
  );
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [pullLine, setPullLine] = useState<string | null>(null);
  const autoStartedRef = useRef(false);
  const manage = canManageOllama();

  const refresh = useCallback(async () => {
    setBusy((b) => (b === "idle" ? "refresh" : b));
    try {
      const next = await fetchOllamaStatus(model);
      setStatus(next);
      return next;
    } catch (err) {
      setActionMsg(err instanceof Error ? err.message : "Ошибка статуса");
      return null;
    } finally {
      setBusy((b) => (b === "refresh" ? "idle" : b));
    }
  }, [model]);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => {
      void refresh();
    }, 5000);
    return () => window.clearInterval(id);
  }, [refresh]);

  useEffect(() => {
    return onOllamaPullProgress((p) => {
      setPullLine(p.line);
    });
  }, []);

  // Sync short name (llama3.2) → full Ollama tag (llama3.2:latest)
  useEffect(() => {
    const models = status?.models ?? [];
    const resolved = resolveModelName(model, models);
    if (!resolved || resolved === model) return;
    onModelChange(resolved);
  }, [status?.models, model, onModelChange]);

  useEffect(() => {
    if (!enabled || !autoStart || !manage || autoStartedRef.current) return;
    let cancelled = false;
    void (async () => {
      const cur = await fetchOllamaStatus(model);
      if (cancelled || cur.running) {
        setStatus(cur);
        return;
      }
      autoStartedRef.current = true;
      setBusy("start");
      setActionMsg("Автозапуск Ollama…");
      try {
        const next = await startOllama(model);
        if (!cancelled) {
          setStatus(next);
          setActionMsg(next.detail);
        }
      } catch (err) {
        if (!cancelled) {
          setActionMsg(
            err instanceof Error ? err.message : "Не удалось автозапустить",
          );
        }
      } finally {
        if (!cancelled) setBusy("idle");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, autoStart, manage, model]);

  async function handleStart() {
    setBusy("start");
    setActionMsg("Запускаю Ollama…");
    try {
      const next = await startOllama(model);
      setStatus(next);
      setActionMsg(next.detail);
    } catch (err) {
      setActionMsg(err instanceof Error ? err.message : "Ошибка запуска");
      await refresh();
    } finally {
      setBusy("idle");
    }
  }

  async function handleStop() {
    setBusy("stop");
    setActionMsg("Останавливаю…");
    try {
      const next = await stopManagedOllama();
      setStatus(next);
      setActionMsg(
        next.stopped
          ? "Остановлен процесс, запущенный приложением"
          : "Нечего останавливать (сервер внешний)",
      );
    } catch (err) {
      setActionMsg(err instanceof Error ? err.message : "Ошибка остановки");
    } finally {
      setBusy("idle");
    }
  }

  async function handlePull() {
    if (!model.trim()) {
      setActionMsg("Укажи имя модели");
      return;
    }
    setBusy("pull");
    setPullLine(null);
    setActionMsg(`Скачиваю ${model}…`);
    try {
      const next = await pullOllamaModel(model.trim());
      setStatus(next);
      setActionMsg(`Модель ${model} готова`);
      setPullLine(null);
    } catch (err) {
      setActionMsg(err instanceof Error ? err.message : "Ошибка pull");
      await refresh();
    } finally {
      setBusy("idle");
    }
  }

  const tone = ollamaStatusTone(status);
  const models = status?.models ?? [];
  const selected =
    resolveModelName(model, models) ?? (models.includes(model) ? model : null);

  return (
    <div className="llm-panel">
      <div className="llm-panel__head">
        <span className={`llm-badge llm-badge--${tone}`} aria-live="polite">
          {tone === "ok"
            ? "LLM готов"
            : tone === "warn"
              ? "Нет модели"
              : tone === "busy"
                ? "Запуск…"
                : "Офлайн"}
        </span>
        <span className="llm-panel__detail">
          {status?.detail ?? "Проверяю…"}
          {status?.version ? ` · ${status.version}` : ""}
        </span>
      </div>

      <div className="llm-panel__meta">
        <span>
          {status?.running ? "сервер онлайн" : "сервер выкл"}
          {status?.managedByApp ? " · управляется приложением" : ""}
        </span>
        {!enabled ? (
          <span className="llm-panel__hint">
            Режим голоса сейчас Templates — переключи на Local LLM ниже
          </span>
        ) : null}
        {!manage ? (
          <span className="llm-panel__hint">
            Управление запуском — в Electron-окне (Запуск.bat)
          </span>
        ) : null}
      </div>

      <div className="llm-panel__row">
        <UiCheck
          checked={autoStart}
          disabled={!manage}
          onChange={onAutoStartChange}
        >
          Автозапуск Ollama при Local LLM
        </UiCheck>
      </div>

      <div className="llm-panel__row llm-panel__row--models">
        <div className="field">
          <span className="field__label">
            Модели на диске
            {models.length > 0 ? ` · ${models.length}` : ""}
          </span>
          {models.length === 0 ? (
            <p className="llm-models__empty">
              Пока пусто — укажи имя выше и нажми «Скачать модель»
            </p>
          ) : (
            <ul className="llm-models" role="listbox" aria-label="Модели Ollama">
              {models.map((m) => {
                const active = selected === m || model === m;
                return (
                  <li key={m}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={active}
                      className={`llm-models__item ${active ? "is-active" : ""}`}
                      onClick={() => onModelChange(m)}
                    >
                      <span className="llm-models__name">{m}</span>
                      {active ? (
                        <span className="llm-models__mark">выбрана</span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      <div className="llm-panel__actions">
        <button
          type="button"
          disabled={busy !== "idle"}
          onClick={() => void refresh()}
        >
          Обновить
        </button>
        <button
          type="button"
          disabled={!manage || busy !== "idle" || Boolean(status?.running)}
          onClick={() => void handleStart()}
        >
          Запустить Ollama
        </button>
        <button
          type="button"
          disabled={!manage || busy !== "idle" || !status?.managedByApp}
          onClick={() => void handleStop()}
          title="Останавливает только процесс, запущенный этим приложением"
        >
          Стоп (наш)
        </button>
        <button
          type="button"
          disabled={!manage || busy !== "idle" || !model.trim()}
          onClick={() => void handlePull()}
        >
          Скачать модель
        </button>
      </div>

      {pullLine ? <p className="llm-panel__pull">{pullLine}</p> : null}
      {actionMsg ? <p className="llm-panel__msg">{actionMsg}</p> : null}
    </div>
  );
}
