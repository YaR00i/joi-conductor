import { useCallback, useEffect, useState } from "react";
import {
  canManageOllama,
  fetchOllamaStatus,
  onOllamaPullProgress,
  pullOllamaModel,
} from "../lib/ollamaClient";
import {
  QWEN_HF_REPOS,
  type QwenInstallTarget,
  qwenServeHint,
} from "../lib/qwenTtsCatalog";
import type { VoiceSettings } from "../lib/voiceSettings";

type PiperStatus = {
  ready: boolean;
  root?: string;
};

type QwenInstallStatus = {
  root: string;
  python: string;
  tokenizer: boolean;
  customVoice: boolean;
  base: boolean;
  tokenizerDir: string;
  customVoiceDir: string;
  baseDir: string;
};

type SovitsInstallStatus = {
  root: string;
  repo: string;
  python: string;
  venv?: boolean;
  pretrained?: boolean;
  ready: boolean;
  detail: string;
  torchCuda?: boolean;
};

const OLLAMA_PRESETS = [
  { id: "llama3.2", hint: "лёгкая, по умолчанию" },
  { id: "qwen2.5:7b", hint: "лучше держит роль" },
  { id: "llama3.1:8b", hint: "запасной чат" },
] as const;

type Props = {
  voice: VoiceSettings;
  onVoice: (next: VoiceSettings) => void;
};

function desktopTts() {
  return typeof window !== "undefined" ? window.joiDesktop?.tts : undefined;
}

export function EnvironmentPanel({ voice, onVoice }: Props) {
  const manage = canManageOllama();
  const [ollamaBusy, setOllamaBusy] = useState<string | null>(null);
  const [ollamaLine, setOllamaLine] = useState<string | null>(null);
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [piperBusy, setPiperBusy] = useState(false);
  const [piper, setPiper] = useState<PiperStatus | null>(null);
  const [piperLine, setPiperLine] = useState<string | null>(null);
  const [qwen, setQwen] = useState<QwenInstallStatus | null>(null);
  const [qwenBusy, setQwenBusy] = useState<QwenInstallTarget | null>(null);
  const [qwenLine, setQwenLine] = useState<string | null>(null);
  const [sovits, setSovits] = useState<SovitsInstallStatus | null>(null);
  const [sovitsBusy, setSovitsBusy] = useState(false);
  const [sovitsLine, setSovitsLine] = useState<string | null>(null);

  const refreshOllama = useCallback(async () => {
    const st = await fetchOllamaStatus(voice.model);
    setOllamaModels(st.models);
  }, [voice.model]);

  const refreshPiper = useCallback(async () => {
    const api = desktopTts();
    if (!api?.piperStatus) return;
    const st = await api.piperStatus();
    setPiper(st);
  }, []);

  const refreshQwen = useCallback(async () => {
    const api = desktopTts();
    if (!api?.qwenInstallStatus) return;
    const st = await api.qwenInstallStatus();
    setQwen(st);
  }, []);

  const refreshSovits = useCallback(async () => {
    const api = desktopTts();
    if (!api?.sovitsInstallStatus) return;
    const st = await api.sovitsInstallStatus();
    setSovits(st);
  }, []);

  useEffect(() => {
    void refreshOllama();
    void refreshPiper();
    void refreshQwen();
    void refreshSovits();
  }, [refreshOllama, refreshPiper, refreshQwen, refreshSovits]);

  useEffect(() => {
    return onOllamaPullProgress((p) => {
      setOllamaLine(p.line);
    });
  }, []);

  useEffect(() => {
    const api = desktopTts();
    if (!api?.onPiperProgress) return;
    return api.onPiperProgress((p) => {
      setPiperLine(`${p.phase} ${p.pct}%`);
    });
  }, []);

  useEffect(() => {
    const api = desktopTts();
    if (!api?.onQwenInstallProgress) return;
    return api.onQwenInstallProgress((p) => {
      setQwenLine(p.line ? `${p.phase} · ${p.line}` : `${p.phase} ${p.pct}%`);
    });
  }, []);

  useEffect(() => {
    const api = desktopTts();
    if (!api?.onSovitsInstallProgress) return;
    return api.onSovitsInstallProgress((p) => {
      setSovitsLine(p.line ? `${p.phase} · ${p.line}` : `${p.phase} ${p.pct}%`);
    });
  }, []);

  async function pullPreset(id: string) {
    if (!manage) {
      setOllamaLine("Скачивание Ollama только в окне Electron");
      return;
    }
    setOllamaBusy(id);
    setOllamaLine(`Скачиваю ${id}…`);
    try {
      onVoice({ ...voice, model: id });
      const next = await pullOllamaModel(id);
      setOllamaModels(next.models);
      setOllamaLine(next.detail);
    } catch (err) {
      setOllamaLine(err instanceof Error ? err.message : "Ошибка pull");
    } finally {
      setOllamaBusy(null);
    }
  }

  async function installPiper() {
    const api = desktopTts();
    if (!api?.installPiper) {
      setPiperLine("Piper ставится только в Electron");
      return;
    }
    setPiperBusy(true);
    setPiperLine("Скачиваю Piper + Irina…");
    try {
      const st = await api.installPiper();
      setPiper(st);
      setPiperLine(st.ready ? "Piper готов · Irina" : "Установка не завершена");
    } catch (err) {
      setPiperLine(err instanceof Error ? err.message : "Ошибка Piper");
    } finally {
      setPiperBusy(false);
    }
  }

  async function installQwen(target: QwenInstallTarget) {
    const api = desktopTts();
    if (!api?.installQwenModel) {
      setQwenLine("Скачивание Qwen только в Electron (нужен Python + huggingface_hub)");
      return;
    }
    setQwenBusy(target);
    setQwenLine(`Скачиваю ${QWEN_HF_REPOS[target]}…`);
    try {
      const st = await api.installQwenModel(target);
      setQwen(st);
      setQwenLine("Готово");
    } catch (err) {
      setQwenLine(err instanceof Error ? err.message : "Ошибка скачивания Qwen");
    } finally {
      setQwenBusy(null);
    }
  }

  async function installSovits() {
    const api = desktopTts();
    if (!api?.installSovits) {
      setSovitsLine("SoVITS ставится только в Electron");
      return;
    }
    setSovitsBusy(true);
    setSovitsLine("Ставлю GPT-SoVITS (клон + venv + pretrained)…");
    try {
      const st = await api.installSovits();
      setSovits(st);
      setSovitsLine(st.ready ? st.detail : "Установка не завершена");
    } catch (err) {
      setSovitsLine(err instanceof Error ? err.message : "Ошибка SoVITS");
    } finally {
      setSovitsBusy(false);
    }
  }

  const hasModel = (id: string) =>
    ollamaModels.some((m) => m === id || m.startsWith(`${id}:`) || m.split(":")[0] === id.split(":")[0]);

  return (
    <div className="env-panel">
      <article className="ember-ed-card env-panel__card">
        <div className="ember-ed-card__head">
          <h3 className="ember-ed-card__title">Ollama · мозг</h3>
          <span className="env-panel__meta">
            {ollamaModels.length > 0
              ? `${ollamaModels.length} на диске`
              : "пусто"}
          </span>
        </div>
        <p className="env-panel__blurb">
          Текст реплик. Скачивается внутрь Ollama, не в папку проекта.
        </p>
        <div className="env-panel__row">
          {OLLAMA_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`ember-tool-card${hasModel(p.id) ? " is-active" : ""}`}
              disabled={Boolean(ollamaBusy)}
              onClick={() => void pullPreset(p.id)}
            >
              <span className="ember-tool-card__label">{p.id}</span>
              <span className="env-panel__chip-sub">
                {ollamaBusy === p.id
                  ? "качаю…"
                  : hasModel(p.id)
                    ? "есть"
                    : p.hint}
              </span>
            </button>
          ))}
        </div>
        {ollamaLine ? <p className="env-panel__line">{ollamaLine}</p> : null}
      </article>

      <article className="ember-ed-card env-panel__card">
        <div className="ember-ed-card__head">
          <h3 className="ember-ed-card__title">Piper · голос офлайн</h3>
          <span className="env-panel__meta">
            {piper?.ready ? "готов" : "не установлен"}
          </span>
        </div>
        <p className="env-panel__blurb">
          Irina neural. Кладутся в данные приложения, без Python.
        </p>
        <div className="env-panel__row">
          <button
            type="button"
            className={`ember-tool-card${piper?.ready ? " is-active" : ""}`}
            disabled={piperBusy}
            onClick={() => void installPiper()}
          >
            <span className="ember-tool-card__label">
              {piper?.ready ? "Piper · Irina" : "Скачать Piper + Irina"}
            </span>
          </button>
        </div>
        {piperLine ? <p className="env-panel__line">{piperLine}</p> : null}
      </article>

      <article className="ember-ed-card env-panel__card">
        <div className="ember-ed-card__head">
          <h3 className="ember-ed-card__title">Qwen3-TTS · голос</h3>
          <span className="env-panel__meta">
            {qwen
              ? `${[qwen.tokenizer, qwen.customVoice, qwen.base].filter(Boolean).length}/3`
              : "—"}
          </span>
        </div>
        <p className="env-panel__blurb">
          Tokenizer обязателен. CustomVoice — 9 голосов. Base — клон 3 сек по
          рефу госпожи. Потом:{" "}
          <code>{qwenServeHint(qwen?.customVoiceDir ?? null, "custom_voice")}</code>
        </p>
        <div className="env-panel__row">
          <button
            type="button"
            className={`ember-tool-card${qwen?.tokenizer ? " is-active" : ""}`}
            disabled={qwenBusy != null}
            onClick={() => void installQwen("tokenizer")}
          >
            <span className="ember-tool-card__label">Tokenizer-12Hz</span>
            <span className="env-panel__chip-sub">
              {qwenBusy === "tokenizer"
                ? "качаю…"
                : qwen?.tokenizer
                  ? "есть"
                  : "кодек"}
            </span>
          </button>
          <button
            type="button"
            className={`ember-tool-card${qwen?.customVoice ? " is-active" : ""}`}
            disabled={qwenBusy != null}
            onClick={() => void installQwen("custom_voice")}
          >
            <span className="ember-tool-card__label">CustomVoice 0.6B</span>
            <span className="env-panel__chip-sub">
              {qwenBusy === "custom_voice"
                ? "качаю…"
                : qwen?.customVoice
                  ? "есть"
                  : "9 голосов"}
            </span>
          </button>
          <button
            type="button"
            className={`ember-tool-card${qwen?.base ? " is-active" : ""}`}
            disabled={qwenBusy != null}
            onClick={() => void installQwen("base")}
          >
            <span className="ember-tool-card__label">Base 0.6B</span>
            <span className="env-panel__chip-sub">
              {qwenBusy === "base" ? "качаю…" : qwen?.base ? "есть" : "клон 3с"}
            </span>
          </button>
        </div>
        {qwen?.root ? (
          <p className="env-panel__path">{qwen.root}</p>
        ) : (
          <p className="env-panel__line">
            Скачивание из приложения: Python + <code>pip install huggingface_hub</code>
          </p>
        )}
        {qwenLine ? <p className="env-panel__line">{qwenLine}</p> : null}
      </article>

      <article className="ember-ed-card env-panel__card">
        <div className="ember-ed-card__head">
          <h3 className="ember-ed-card__title">GPT-SoVITS · клон 4–10 с</h3>
          <span className="env-panel__meta">
            {sovits?.ready ? "готов" : sovits?.repo ? "не докачан" : "нет"}
          </span>
        </div>
        <p className="env-panel__blurb">
          Отдельный стек от Qwen. Нужен свой wav 4–10 с (не короткий клип Base).
          Качается в данные приложения: репозиторий, venv, pretrained.
        </p>
        <div className="env-panel__row">
          <button
            type="button"
            className={`ember-tool-card${sovits?.ready ? " is-active" : ""}`}
            disabled={sovitsBusy}
            onClick={() => void installSovits()}
          >
            <span className="ember-tool-card__label">
              {sovits?.ready ? "GPT-SoVITS · обновить" : "Скачать GPT-SoVITS"}
            </span>
            <span className="env-panel__chip-sub">
              {sovitsBusy ? "ставлю…" : sovits?.torchCuda ? "CUDA" : "несколько ГБ"}
            </span>
          </button>
        </div>
        {sovits?.root ? <p className="env-panel__path">{sovits.root}</p> : null}
        {sovitsLine ? <p className="env-panel__line">{sovitsLine}</p> : null}
      </article>
    </div>
  );
}
