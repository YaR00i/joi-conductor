import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  filterOllamaPresets,
  ollamaRoleMarks,
  recommendedOllamaNotInstalled,
  resolveInstalledOllamaName,
  sameOllamaModel,
  sortOllamaInstalled,
} from "../lib/ollamaCatalog";
import {
  CHAT_LLM_CHANGED_EVENT,
  loadChatLlmSettings,
  saveChatLlmSettings,
  assignLocalChatModel,
  localChatModelOf,
  type ChatLlmSettings,
  chatLlmProviderLabelRu,
  isGroqHybridProvider,
} from "../lib/soul/llmSettings";
import {
  mergeOllamaSearchHits,
  parseOllamaSearchHtml,
  type OllamaLibraryHit,
} from "../lib/ollamaLibrarySearch";
import {
  fetchOllamaLibraryHtml,
  canManageOllama,
  deleteOllamaModel,
  fetchOllamaStatus,
  onOllamaPullProgress,
  ollamaStatusTone,
  pullOllamaModel,
  startOllama,
  stopManagedOllama,
  type OllamaStatus,
} from "../lib/ollamaClient";
import {
  QWEN_HF_REPOS,
  type QwenInstallTarget,
} from "../lib/qwenTtsCatalog";
import type { VoiceSettings } from "../lib/voiceSettings";
import { SoulRoleAssign } from "./SoulRoleAssign";
import { UiCheck } from "./UiCheck";
import "./voiceSettings.css";

type Props = {
  voice: VoiceSettings;
  onVoice: (next: VoiceSettings) => void;
  voiceStatus: string | null;
  onTestVoice: () => void;
};

const QWEN_ROWS: Array<{
  id: QwenInstallTarget;
  label: string;
  hint: string;
}> = [
  { id: "tokenizer", label: "Tokenizer-12Hz", hint: "кодек" },
  { id: "custom_voice", label: "CustomVoice 0.6B", hint: "9 голосов" },
  { id: "base", label: "Base 0.6B", hint: "клон 3 с" },
];

type PiperStatus = { ready: boolean; root?: string };

type QwenInstallStatus = {
  root: string;
  python?: string;
  venv?: boolean;
  hub?: boolean;
  qwenTts?: boolean;
  vllm?: boolean;
  fasterQwenTts?: boolean;
  torchCuda?: boolean;
  torchCpu?: boolean;
  torchWheel?: string;
  tokenizer: boolean;
  customVoice: boolean;
  base: boolean;
};

type SovitsInstallStatus = {
  root: string;
  repo: string;
  python: string;
  venv?: boolean;
  pretrained?: boolean;
  ffmpeg?: boolean;
  torchCuda?: boolean;
  torchCpu?: boolean;
  ready: boolean;
  detail: string;
};

type DiskXfer = {
  phase: string;
  pct: number;
  detail: string;
  at: number;
  filesDone?: number;
  filesTotal?: number;
};

function desktopTts() {
  return typeof window !== "undefined" ? window.joiDesktop?.tts : undefined;
}

function qwenInstalled(
  st: QwenInstallStatus | null,
  id: QwenInstallTarget,
): boolean {
  if (!st) return false;
  switch (id) {
    case "tokenizer":
      return st.tokenizer;
    case "custom_voice":
      return st.customVoice;
    case "base":
      return st.base;
    default: {
      const _exhaustive: never = id;
      return _exhaustive;
    }
  }
}

function desktopActionError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/No handler registered/i.test(msg)) {
    return "Electron не подхватил новые кнопки. Полностью закрой окно приложения и запусти снова через Запуск.bat — F5 недостаточно.";
  }
  return msg;
}

export function BrainPanel({
  voice,
  onVoice,
  voiceStatus,
  onTestVoice,
}: Props) {
  const manage = canManageOllama();
  const [status, setStatus] = useState<OllamaStatus | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [line, setLine] = useState<string | null>(null);
  const [customPull, setCustomPull] = useState("");
  const [hubQuery, setHubQuery] = useState("");
  const [hubHits, setHubHits] = useState<OllamaLibraryHit[]>([]);
  const [hubBusy, setHubBusy] = useState(false);
  const [hubError, setHubError] = useState<string | null>(null);
  const [piper, setPiper] = useState<PiperStatus | null>(null);
  const [qwen, setQwen] = useState<QwenInstallStatus | null>(null);
  const [sovits, setSovits] = useState<SovitsInstallStatus | null>(null);
  const [xfer, setXfer] = useState<DiskXfer | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [chatLlm, setChatLlm] = useState<ChatLlmSettings>(loadChatLlmSettings);
  const [resourceView, setResourceView] = useState<"text" | "voice">("text");
  const autoStartedRef = useRef(false);

  const refreshOllama = useCallback(async () => {
    try {
      const next = await fetchOllamaStatus(voice.model);
      setStatus(next);
      return next;
    } catch (err) {
      setLine(err instanceof Error ? err.message : "Ошибка статуса");
      return null;
    }
  }, [voice.model]);

  const refreshPiper = useCallback(async () => {
    const api = desktopTts();
    if (!api?.piperStatus) return;
    try {
      setPiper(await api.piperStatus());
    } catch (err) {
      setLine(desktopActionError(err));
    }
  }, []);

  const refreshQwen = useCallback(async () => {
    const api = desktopTts();
    if (!api?.qwenInstallStatus) return;
    try {
      setQwen(await api.qwenInstallStatus());
    } catch (err) {
      setLine(desktopActionError(err));
    }
  }, []);

  const refreshSovitsDisk = useCallback(async () => {
    const api = desktopTts();
    if (!api?.sovitsInstallStatus) return;
    try {
      setSovits(await api.sovitsInstallStatus());
    } catch (err) {
      setLine(desktopActionError(err));
    }
  }, []);

  useEffect(() => {
    void refreshOllama();
    void refreshPiper();
    void refreshQwen();
    void refreshSovitsDisk();
    const id = window.setInterval(() => {
      void refreshOllama();
    }, 5000);
    return () => window.clearInterval(id);
  }, [refreshOllama, refreshPiper, refreshQwen, refreshSovitsDisk]);

  useEffect(() => {
    return onOllamaPullProgress((p) => {
      setLine(p.line);
      if (typeof p.pct === "number") {
        setXfer({
          phase: p.phase || "Ollama",
          pct: p.pct,
          detail: p.line,
          at: Date.now(),
        });
        return;
      }
      setXfer(null);
    });
  }, []);

  useEffect(() => {
    const q = hubQuery.trim();
    if (!q) {
      setHubHits([]);
      setHubError(null);
      setHubBusy(false);
      return;
    }
    let cancelled = false;
    setHubBusy(true);
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const catalog = filterOllamaPresets(q);
          const html = await fetchOllamaLibraryHtml(q);
          if (cancelled) return;
          setHubHits(
            mergeOllamaSearchHits(catalog, parseOllamaSearchHtml(html)),
          );
          setHubError(null);
        } catch (err) {
          if (cancelled) return;
          setHubHits(
            mergeOllamaSearchHits(filterOllamaPresets(q), []),
          );
          setHubError(
            err instanceof Error ? err.message : "поиск библиотеки не удался",
          );
        } finally {
          if (!cancelled) setHubBusy(false);
        }
      })();
    }, 450);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [hubQuery]);

  useEffect(() => {
    if (!xfer || xfer.pct >= 100) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [xfer]);

  useEffect(() => {
    const api = desktopTts();
    if (!api?.onPiperProgress) return;
    return api.onPiperProgress((p) => {
      setXfer({
        phase: p.phase,
        pct: p.pct,
        detail: `${p.pct}%`,
        at: Date.now(),
      });
    });
  }, []);

  useEffect(() => {
    const api = desktopTts();
    if (!api?.onQwenInstallProgress) return;
    return api.onQwenInstallProgress((p) => {
      setLine(null);
      setXfer({
        phase: p.phase,
        pct: p.pct,
        detail: p.detail || p.line || "",
        at: Date.now(),
        filesDone: p.filesDone,
        filesTotal: p.filesTotal,
      });
    });
  }, []);

  useEffect(() => {
    const api = desktopTts();
    if (!api?.onSovitsInstallProgress) return;
    return api.onSovitsInstallProgress((p) => {
      setLine(null);
      setXfer({
        phase: p.phase,
        pct: p.pct,
        detail: p.detail || p.line || "",
        at: Date.now(),
        filesDone: p.filesDone,
        filesTotal: p.filesTotal,
      });
    });
  }, []);

  const installed = status?.models ?? [];
  const disk = useMemo(() => sortOllamaInstalled(installed), [installed]);
  const catalogMissing = useMemo(
    () => recommendedOllamaNotInstalled(disk),
    [disk],
  );

  useEffect(() => {
    const sync = () => setChatLlm(loadChatLlmSettings());
    window.addEventListener(CHAT_LLM_CHANGED_EVENT, sync);
    return () => window.removeEventListener(CHAT_LLM_CHANGED_EVENT, sync);
  }, []);

  function persistChatLlm(next: ChatLlmSettings) {
    setChatLlm(saveChatLlmSettings(next));
  }

  useEffect(() => {
    const resolved = resolveInstalledOllamaName(voice.model, installed);
    if (!resolved || resolved === voice.model) return;
    onVoice({ ...voice, model: resolved });
  }, [installed, voice.model, onVoice, voice]);

  useEffect(() => {
    if (voice.mode !== "llm" || !voice.autoStartOllama || !manage) return;
    if (autoStartedRef.current) return;
    let cancelled = false;
    void (async () => {
      const cur = await fetchOllamaStatus(voice.model);
      if (cancelled || cur.running) {
        setStatus(cur);
        return;
      }
      autoStartedRef.current = true;
      setBusy("start");
      setLine("Автозапуск Ollama…");
      setXfer({
        phase: "Ollama",
        pct: 1,
        detail: "проверяю среду…",
        at: Date.now(),
      });
      try {
        const next = await startOllama(voice.model);
        if (!cancelled) {
          setStatus(next);
          setXfer(null);
          setLine(next.detail);
        }
      } catch (err) {
        if (!cancelled) {
          setXfer(null);
          setLine(err instanceof Error ? err.message : "Автозапуск не удался");
        }
      } finally {
        if (!cancelled) setBusy(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [voice.mode, voice.autoStartOllama, voice.model, manage]);

  async function pullModel(id: string) {
    if (!manage) {
      setLine("Скачивание только в окне Electron");
      return;
    }
    setBusy(`pull:${id}`);
    setLine(`Скачиваю ${id}…`);
    setXfer({
      phase: "Ollama",
      pct: 1,
      detail: "проверяю среду…",
      at: Date.now(),
    });
    try {
      onVoice({ ...voice, model: id, mode: "llm" });
      const next = await pullOllamaModel(id);
      setStatus(next);
      setXfer(null);
      setLine(`Готово · ${id}`);
    } catch (err) {
      setXfer(null);
      setLine(err instanceof Error ? err.message : "Ошибка скачивания");
      await refreshOllama();
    } finally {
      setBusy(null);
    }
  }

  async function removeModel(name: string) {
    if (!manage) {
      setLine("Удаление только в окне Electron");
      return;
    }
    if (!window.confirm(`Удалить модель ${name} с диска?`)) return;
    setBusy(`rm:${name}`);
    setLine(`Удаляю ${name}…`);
    try {
      const next = await deleteOllamaModel(name);
      setStatus(next);
      if (sameOllamaModel(voice.model, name)) {
        const fallback = next.models[0] ?? "";
        onVoice({ ...voice, model: fallback });
      }
      const leftover = next.models;
      const still = (want: string) =>
        Boolean(want.trim()) &&
        Boolean(resolveInstalledOllamaName(want, leftover));
      persistChatLlm({
        ...chatLlm,
        model: still(chatLlm.model) ? chatLlm.model : leftover[0] ?? "",
        roleModels: {
          router: still(chatLlm.roleModels?.router ?? "")
            ? (chatLlm.roleModels?.router ?? "")
            : "",
          extractor: still(chatLlm.roleModels?.extractor ?? "")
            ? (chatLlm.roleModels?.extractor ?? "")
            : "",
          planner: still(chatLlm.roleModels?.planner ?? "")
            ? (chatLlm.roleModels?.planner ?? "")
            : "",
        },
      });
      setLine(`Удалена · ${name}`);
    } catch (err) {
      setLine(err instanceof Error ? err.message : "Ошибка удаления");
      await refreshOllama();
    } finally {
      setBusy(null);
    }
  }

  async function handleStart() {
    setBusy("start");
    setLine("Запускаю Ollama…");
    setXfer({
      phase: "Ollama",
      pct: 1,
      detail: "проверяю среду…",
      at: Date.now(),
    });
    try {
      const next = await startOllama(voice.model);
      setStatus(next);
      setXfer(null);
      setLine(next.detail);
    } catch (err) {
      setXfer(null);
      setLine(err instanceof Error ? err.message : "Ошибка запуска");
    } finally {
      setBusy(null);
    }
  }

  async function handleStop() {
    setBusy("stop");
    setLine("Останавливаю…");
    try {
      const next = await stopManagedOllama();
      setStatus(next);
      setLine(
        next.stopped ? "Остановлен процесс приложения" : "Внешний сервер — не трогаем",
      );
    } catch (err) {
      setLine(err instanceof Error ? err.message : "Ошибка остановки");
    } finally {
      setBusy(null);
    }
  }

  async function installPiper() {
    const api = desktopTts();
    if (!api?.installPiper) {
      setLine("Piper ставится только в Electron");
      return;
    }
    setBusy("piper");
    setLine(null);
    setXfer({
      phase: "Скачиваю Piper + Irina",
      pct: 1,
      detail: "скачиваю архив…",
      at: Date.now(),
    });
    try {
      setPiper(await api.installPiper());
      setXfer(null);
      setLine("Piper готов");
    } catch (err) {
      setXfer(null);
      setLine(desktopActionError(err));
    } finally {
      setBusy(null);
    }
  }

  async function removePiper() {
    const api = desktopTts();
    if (!api?.uninstallPiper) {
      setLine("Удаление Piper только в Electron");
      return;
    }
    if (!window.confirm("Удалить Piper + Irina с диска?")) return;
    setBusy("piper-rm");
    try {
      setPiper(await api.uninstallPiper());
      setLine("Piper удалён");
    } catch (err) {
      setLine(desktopActionError(err));
    } finally {
      setBusy(null);
    }
  }

  async function installSovits() {
    const api = desktopTts();
    if (!api?.installSovits) {
      setLine("SoVITS ставится только в Electron");
      return;
    }
    setBusy("sovits");
    setLine(null);
    setXfer({
      phase: "Ставлю GPT-SoVITS",
      pct: 1,
      detail: "клон + venv + pretrained (несколько ГБ)…",
      at: Date.now(),
    });
    try {
      setSovits(await api.installSovits());
      setXfer(null);
      setLine("GPT-SoVITS готов. Реф — wav 4–10 с во вкладке Голос.");
    } catch (err) {
      setXfer(null);
      setLine(desktopActionError(err));
    } finally {
      setBusy(null);
    }
  }

  async function removeSovits() {
    const api = desktopTts();
    if (!api?.uninstallSovits) {
      setLine("Удаление SoVITS только в Electron");
      return;
    }
    if (
      !window.confirm(
        "Удалить GPT-SoVITS из данных приложения (репо + venv + веса)?",
      )
    ) {
      return;
    }
    setBusy("sovits-rm");
    try {
      setSovits(await api.uninstallSovits());
      setLine("GPT-SoVITS удалён из данных приложения");
    } catch (err) {
      setLine(desktopActionError(err));
    } finally {
      setBusy(null);
    }
  }

  async function installQwen(target: QwenInstallTarget) {
    const api = desktopTts();
    if (!api?.installQwenModel) {
      setLine("Скачивание Qwen только в Electron");
      return;
    }
    setBusy(`qwen:${target}`);
    setLine(null);
    setXfer({
      phase: `Скачиваю ${QWEN_HF_REPOS[target]}`,
      pct: 1,
      detail: "среда Python + веса…",
      at: Date.now(),
    });
    try {
      setQwen(await api.installQwenModel(target));
      setXfer(null);
      setLine("Готово");
    } catch (err) {
      setXfer(null);
      setLine(desktopActionError(err));
    } finally {
      setBusy(null);
    }
  }

  async function removeQwen(target: QwenInstallTarget) {
    const api = desktopTts();
    if (!api?.uninstallQwenModel) {
      setLine("Удаление Qwen только в Electron");
      return;
    }
    if (!window.confirm(`Удалить ${QWEN_HF_REPOS[target]} с диска?`)) return;
    setBusy(`qwen-rm:${target}`);
    try {
      setQwen(await api.uninstallQwenModel(target));
      setLine("Удалено");
    } catch (err) {
      setLine(desktopActionError(err));
    } finally {
      setBusy(null);
    }
  }

  const tone = ollamaStatusTone(status);
  const idle = busy == null;
  const xferAgo = xfer ? Math.max(0, Math.round((now - xfer.at) / 1000)) : 0;
  const selectedName =
    resolveInstalledOllamaName(voice.model, installed) ?? voice.model;

  return (
    <div className="brain-panel">
      <div className="ai-resource-nav" role="tablist" aria-label="Тип ИИ-ресурсов">
        <button
          type="button"
          role="tab"
          aria-selected={resourceView === "text"}
          className={`ai-resource-nav__btn${resourceView === "text" ? " is-active" : ""}`}
          onClick={() => setResourceView("text")}
        >
          <strong>Текст и роли</strong>
          <span>Ollama · чат · роутер · планер</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={resourceView === "voice"}
          className={`ai-resource-nav__btn${resourceView === "voice" ? " is-active" : ""}`}
          onClick={() => setResourceView("voice")}
        >
          <strong>Голосовые модели</strong>
          <span>Qwen · SoVITS · Piper</span>
        </button>
      </div>

      {resourceView === "text" ? (
        <>
      <div className="brain-panel__bar">
        <div className="brain-seg" role="radiogroup" aria-label="Режим текста">
          <button
            type="button"
            role="radio"
            aria-checked={voice.mode === "template"}
            className={
              "brain-seg__btn" + (voice.mode === "template" ? " is-on" : "")
            }
            onClick={() => onVoice({ ...voice, mode: "template" })}
          >
            Шаблоны
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={voice.mode === "llm"}
            className={"brain-seg__btn" + (voice.mode === "llm" ? " is-on" : "")}
            onClick={() => onVoice({ ...voice, mode: "llm" })}
          >
            Local LLM
          </button>
        </div>
        <span className={`brain-dot brain-dot--${tone}`}>
          {tone === "ok"
            ? "онлайн"
            : tone === "warn"
              ? "нет модели"
              : tone === "busy"
                ? "запуск"
                : "офлайн"}
          {status?.version ? ` · ${status.version}` : ""}
        </span>
        <div className="brain-panel__links">
          <button
            type="button"
            className="brain-act"
            disabled={!idle}
            onClick={() => void refreshOllama()}
          >
            обновить
          </button>
          <button
            type="button"
            className="brain-act"
            disabled={!manage || !idle || Boolean(status?.running)}
            onClick={() => void handleStart()}
          >
            старт
          </button>
          <button
            type="button"
            className="brain-act"
            disabled={!manage || !idle || !status?.managedByApp}
            onClick={() => void handleStop()}
            title="Только процесс, который запустило приложение"
          >
            стоп
          </button>
          <button
            type="button"
            className="brain-act"
            disabled={voice.mode !== "llm" || !idle}
            onClick={onTestVoice}
          >
            проверить чат
          </button>
        </div>
      </div>

      <UiCheck
        checked={voice.autoStartOllama}
        disabled={!manage}
        onChange={(autoStartOllama) => onVoice({ ...voice, autoStartOllama })}
      >
        Автозапуск Ollama при Local LLM
      </UiCheck>

      {voice.mode !== "llm" ? (
        <p className="brain-panel__hint">
          Шаблоны из bible. Живые реплики сессии — Local LLM.
        </p>
      ) : null}

      <h3 className="brain-panel__h">На диске</h3>
      <p className="brain-panel__hint">
        Скачанные модели. «Сессия» — Local LLM в шаблонах. «Чат» — локальные реплики
        Soul, без смены облачного режима.
      </p>
      <ul className="brain-list">
        <li
          className={
            "brain-row" + (status?.binaryPath ? " is-ready" : "")
          }
        >
          <div className="brain-row__main">
            <span className="brain-row__name">Среда Ollama</span>
            <span className="brain-row__meta">
              {status?.binaryPath
                ? "CLI на диске"
                : "скачается вместе со стартом или моделью (~1 ГБ)"}
            </span>
          </div>
        </li>
        {disk.length === 0 ? (
          <li className="brain-row">
            <div className="brain-row__main">
              <span className="brain-row__name">Моделей пока нет</span>
              <span className="brain-row__meta">скачай ниже из каталога</span>
            </div>
          </li>
        ) : null}
        {disk.map((name) => {
          const localChat = localChatModelOf(chatLlm);
          const marks = ollamaRoleMarks({
            name,
            chat: localChat,
            router: chatLlm.roleModels?.router,
            extractor: chatLlm.roleModels?.extractor,
            planner: chatLlm.roleModels?.planner,
            session: selectedName,
          });
          const sessionOn = sameOllamaModel(selectedName, name);
          const chatOn = sameOllamaModel(localChat, name);
          return (
            <li
              key={name}
              className={
                "brain-row" + (sessionOn || chatOn ? " is-active" : "")
              }
            >
              <div className="brain-row__main">
                <span className="brain-row__name">{name}</span>
                <span className="brain-row__meta">
                  {busy === `pull:${name}`
                    ? "качаю…"
                    : marks.length > 0
                      ? marks.join(" · ")
                      : "на диске"}
                </span>
              </div>
              <div className="brain-row__acts">
                <button
                  type="button"
                  className="brain-act"
                  disabled={chatOn}
                  onClick={() =>
                    persistChatLlm(assignLocalChatModel(chatLlm, name))
                  }
                >
                  чат
                </button>
                <button
                  type="button"
                  className="brain-act"
                  disabled={sessionOn}
                  onClick={() =>
                    onVoice({ ...voice, model: name, mode: "llm" })
                  }
                >
                  сессия
                </button>
                <button
                  type="button"
                  className="brain-act"
                  disabled={!idle}
                  onClick={() => void pullModel(name)}
                >
                  обновить
                </button>
                <button
                  type="button"
                  className="brain-act brain-act--danger"
                  disabled={!idle}
                  onClick={() => void removeModel(name)}
                >
                  удалить
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      <h3 className="brain-panel__h">{isGroqHybridProvider(chatLlm.provider) ? "Локальные роли и резерв Groq" : "Роли чата"}</h3>
      {isGroqHybridProvider(chatLlm.provider) ? <p className="brain-panel__hint">
        Здесь выбирается локальная модель для приватного режима и служебных ролей.
        Облачная модель и ключ — Чат → настройки → Модель.
      </p> : chatLlm.provider === "groq_chat" ? (
        <p className="brain-panel__hint">
          Чат на чистом Groq: Ollama не нужна. Память, разбор и запасной локальный
          ответ выключены. «Чат» в списке моделей запоминает Ollama на потом,
          режим Groq не меняет.
        </p>
      ) : chatLlm.provider !== "ollama" ? (
        <p className="brain-panel__hint">
          Чат сейчас на {chatLlmProviderLabelRu(chatLlm.provider)}. «Чат» и роли
          ниже запоминают локальную Ollama, режим не переключают.
        </p>
      ) : null}
      {chatLlm.provider !== "groq_chat" ? (
      <SoulRoleAssign
        settings={chatLlm.provider === "ollama" ? chatLlm : { ...chatLlm, provider: "ollama", model: localChatModelOf(chatLlm) }}
        onChange={(next) => persistChatLlm(chatLlm.provider === "ollama"
          ? next
          : assignLocalChatModel({ ...chatLlm, roleModels: next.roleModels }, next.model))}
        installed={disk}
        sessionFallback={voice.model}
        allowEmptyChat
      />
      ) : null}

      <h3 className="brain-panel__h">Скачать</h3>
      <p className="brain-panel__hint">
        Поиск по библиотеке ollama.com плюс рекомендованные теги под 12 ГБ.
        Скачивание — в окне Electron.
      </p>
      <div className="brain-pull">
        <input
          className="brain-pull__input"
          value={hubQuery}
          placeholder="поиск: qwen, gemma, abliterated…"
          onChange={(e) => setHubQuery(e.target.value)}
        />
      </div>
      {hubBusy ? (
        <p className="brain-panel__hint">ищу в библиотеке…</p>
      ) : null}
      {hubError ? <p className="brain-panel__hint">{hubError}</p> : null}
      {hubQuery.trim() && !hubBusy && hubHits.length === 0 ? (
        <p className="brain-panel__hint">
          ничего не нашлось — попробуй другое имя, например qwen2.5 или gemma3
        </p>
      ) : null}
      {hubHits.length > 0 ? (
        <ul className="brain-list brain-list--search">
          {hubHits.map((hit) => (
            <li key={`${hit.source}:${hit.id}`} className="brain-row">
              <div className="brain-row__main">
                <span className="brain-row__name">{hit.id}</span>
                <span className="brain-row__meta">
                  {hit.source === "catalog" ? hit.hint : "библиотека"}
                </span>
              </div>
              <div className="brain-row__acts">
                <button
                  type="button"
                  className="brain-act"
                  disabled={!idle}
                  onClick={() => {
                    setCustomPull(hit.id);
                    void pullModel(hit.id);
                  }}
                >
                  скачать
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      {catalogMissing.length > 0 ? (
        <ul className="brain-list">
          {catalogMissing.map((row) => (
            <li key={row.id} className="brain-row">
              <div className="brain-row__main">
                <span className="brain-row__name">{row.id}</span>
                <span className="brain-row__meta">
                  {busy === `pull:${row.id}` ? "качаю…" : row.hint}
                </span>
              </div>
              <div className="brain-row__acts">
                <button
                  type="button"
                  className="brain-act"
                  disabled={!idle}
                  onClick={() => void pullModel(row.id)}
                >
                  скачать
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="brain-pull">
        <input
          className="brain-pull__input"
          value={customPull}
          placeholder="тег вручную, напр. qwen2.5:14b"
          onChange={(e) => setCustomPull(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && customPull.trim()) {
              void pullModel(customPull.trim());
            }
          }}
        />
        <button
          type="button"
          className="brain-act"
          disabled={!idle || !customPull.trim()}
          onClick={() => void pullModel(customPull.trim())}
        >
          скачать
        </button>
      </div>

      <h3 className="brain-panel__h">Параметры сессии</h3>
      <div className="brain-fields">
        <label className="brain-field">
          <span>Модель</span>
          <input
            value={voice.model}
            onChange={(e) => onVoice({ ...voice, model: e.target.value })}
          />
        </label>
        <label className="brain-field">
          <span>Endpoint</span>
          <input
            value={voice.endpoint}
            disabled={voice.mode !== "llm"}
            onChange={(e) => onVoice({ ...voice, endpoint: e.target.value })}
          />
        </label>
        <label className="brain-field">
          <span>Таймаут, мс</span>
          <input
            type="number"
            min={1000}
            max={20000}
            value={voice.timeoutMs}
            onChange={(e) =>
              onVoice({ ...voice, timeoutMs: Number(e.target.value) })
            }
          />
        </label>
      </div>

        </>
      ) : (
        <>

      <h3 className="brain-panel__h">Голосовые модели на диске</h3>
      <p className="brain-panel__hint">
        Здесь только установка и место на диске. Движок, RAM/VRAM, голос и
        проба находятся во вкладке «Голос».
      </p>
      <ul className="brain-list">
        <li className={"brain-row" + (sovits?.ready ? " is-ready" : "")}>
          <div className="brain-row__main">
            <span className="brain-row__name">GPT-SoVITS</span>
            <span className="brain-row__meta">
              {busy === "sovits"
                ? xfer
                  ? `${xfer.pct}%`
                  : "ставлю…"
                : sovits?.ready
                  ? sovits.torchCuda
                    ? "клон 4–10 с · CUDA"
                    : sovits.torchCpu
                      ? "готов · torch CPU"
                      : "готов"
                  : sovits?.repo
                    ? sovits.detail || "не докачан"
                    : "клон + venv + pretrained"}
            </span>
          </div>
          <div className="brain-row__acts">
            <button
              type="button"
              className="brain-act"
              disabled={!idle}
              onClick={() => void installSovits()}
            >
              {sovits?.ready ? "обновить" : "скачать"}
            </button>
            {sovits?.ready || sovits?.repo ? (
              <button
                type="button"
                className="brain-act brain-act--danger"
                disabled={!idle}
                onClick={() => void removeSovits()}
              >
                удалить
              </button>
            ) : null}
          </div>
        </li>
        <li className={"brain-row" + (qwen?.vllm || qwen?.qwenTts ? " is-ready" : "")}>
          <div className="brain-row__main">
            <span className="brain-row__name">Среда Qwen</span>
            <span className="brain-row__meta">
              {qwen?.torchCpu
                ? "torch CPU · не GPU, снова нажми «скачать» у Qwen"
                : qwen?.torchCuda
                  ? qwen?.fasterQwenTts
                    ? "venv + CUDA graphs"
                    : qwen?.vllm
                      ? "venv + vLLM · CUDA"
                      : "venv + qwen-tts · CUDA"
                  : qwen?.vllm
                    ? "venv + vLLM"
                    : qwen?.qwenTts
                      ? "venv + qwen-tts"
                      : qwen?.hub
                        ? "venv · huggingface_hub"
                        : "venv + pip вместе со скачиванием весов"}
            </span>
          </div>
        </li>
        <li className={"brain-row" + (piper?.ready ? " is-ready" : "")}>
          <div className="brain-row__main">
            <span className="brain-row__name">Piper · Irina</span>
                <span className="brain-row__meta">
                  {busy === "piper"
                    ? xfer
                      ? `${xfer.pct}%`
                      : "качаю…"
                    : piper?.ready
                      ? "готов"
                      : "офлайн RU"}
                </span>
          </div>
          <div className="brain-row__acts">
            <button
              type="button"
              className="brain-act"
              disabled={!idle}
              onClick={() => void installPiper()}
            >
              {piper?.ready ? "обновить" : "скачать"}
            </button>
            {piper?.ready ? (
              <button
                type="button"
                className="brain-act brain-act--danger"
                disabled={!idle}
                onClick={() => void removePiper()}
              >
                удалить
              </button>
            ) : null}
          </div>
        </li>
        {QWEN_ROWS.map((row) => {
          const ready = qwenInstalled(qwen, row.id);
          return (
            <li
              key={row.id}
              className={"brain-row" + (ready ? " is-ready" : "")}
            >
              <div className="brain-row__main">
                <span className="brain-row__name">{row.label}</span>
                <span className="brain-row__meta">
                  {busy === `qwen:${row.id}`
                    ? xfer
                      ? xfer.filesTotal
                        ? `${xfer.pct}% · ${xfer.filesDone ?? 0}/${xfer.filesTotal}`
                        : `${xfer.pct}%`
                      : "качаю…"
                    : ready
                      ? "на диске"
                      : row.hint}
                </span>
              </div>
              <div className="brain-row__acts">
                <button
                  type="button"
                  className="brain-act"
                  disabled={!idle}
                  onClick={() => void installQwen(row.id)}
                >
                  {ready ? "обновить" : "скачать"}
                </button>
                {ready ? (
                  <button
                    type="button"
                    className="brain-act brain-act--danger"
                    disabled={!idle}
                    onClick={() => void removeQwen(row.id)}
                  >
                    удалить
                  </button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
        </>
      )}

      {xfer ? (
        <div className="brain-xfer" aria-live="polite">
          <div className="brain-xfer__top">
            <span>{xfer.phase}</span>
            <span>{xfer.pct}%</span>
          </div>
          <div className="brain-xfer__bar">
            <i style={{ width: `${Math.max(1, Math.min(100, xfer.pct))}%` }} />
          </div>
          {xfer.detail ? (
            <p className="brain-xfer__meta">{xfer.detail}</p>
          ) : null}
          <p className="brain-xfer__live">
            {xfer.pct >= 100
              ? "готово"
              : xferAgo <= 2
                ? "идёт"
                : xferAgo < 15
                  ? `обновлено ${xferAgo} с назад`
                  : `тишина ${xferAgo} с — большой файл, не закрывай`}
          </p>
        </div>
      ) : null}
      {line ? <p className="brain-panel__log">{line}</p> : null}
      {voiceStatus ? <p className="brain-panel__log">{voiceStatus}</p> : null}
      {!manage ? (
        <p className="brain-panel__hint">
          Старт, стоп и диск — в Electron (Запуск.bat).
        </p>
      ) : null}
    </div>
  );
}
