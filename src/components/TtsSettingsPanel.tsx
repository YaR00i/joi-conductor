import { useCallback, useEffect, useRef, useState } from "react";
import { getActiveMistress } from "../lib/mistress";
import type { MistressId } from "../lib/mistress/types";
import {
  resetMistressVoiceProfile,
  setMistressVoiceTuning,
  type VoiceSettings,
} from "../lib/voiceSettings";
import {
  EDGE_VOICE_FALLBACK,
  PIPER_VOICE_FALLBACK,
  SpeechTts,
  type TtsProvider,
} from "../lib/voice/speechTts";
import {
  ensureSovitsAutoStart,
  resetSovitsAutoStartGate,
} from "../lib/voice/sovitsAutoStart";
import { UiCheck } from "./UiCheck";

type Props = {
  voice: VoiceSettings;
  onVoice: (next: VoiceSettings) => void;
  tts: SpeechTts;
};

type SovitsStatus = {
  online: boolean;
  starting?: boolean;
  managedByApp?: boolean;
  installPath?: string | null;
  pythonPath?: string | null;
  baseUrl: string;
  detail: string;
};

type QwenStatus = {
  online: boolean;
  baseUrl: string;
  detail: string;
};

const ENGINE_CHOICES: Array<{
  id: TtsProvider;
  title: string;
  sub: string;
}> = [
  { id: "qwen", title: "Qwen3-TTS 0.6B", sub: "vLLM · русский и эмоции" },
  { id: "sovits", title: "GPT-SoVITS", sub: "клон голоса по референсу" },
  { id: "auto", title: "Авто", sub: "SoVITS → Qwen → Piper → Edge" },
  { id: "piper", title: "Piper", sub: "локально · Irina" },
  { id: "edge", title: "Edge Neural", sub: "облачные голоса Microsoft" },
  { id: "system", title: "Windows", sub: "системный синтезатор" },
];

function sampleNameEnFor(id: MistressId): string {
  switch (id) {
    case "furina":
      return "Furina";
    case "hu_tao":
      return "Hu Tao";
    case "sunna":
      return "Sunna";
    case "sparkle":
      return "Sparkle";
    default: {
      const _exhaustive: never = id;
      return _exhaustive;
    }
  }
}

export function TtsSettingsPanel({ voice, onVoice, tts }: Props) {
  const mistress = getActiveMistress();
  const sampleNameEn = sampleNameEnFor(mistress.id);
  const [piperReady, setPiperReady] = useState(false);
  const [sovitsOnline, setSovitsOnline] = useState<boolean | null>(null);
  const [sovitsDetail, setSovitsDetail] = useState<string>("");
  const [sovitsManaged, setSovitsManaged] = useState(false);
  const [qwenOnline, setQwenOnline] = useState<boolean | null>(null);
  const [qwenDetail, setQwenDetail] = useState<string | null>(null);
  const [edgeVoices, setEdgeVoices] = useState(EDGE_VOICE_FALLBACK);
  const [sysVoices, setSysVoices] = useState(() => tts.listRussianVoices());
  const [hint, setHint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [installPct, setInstallPct] = useState<number | null>(null);
  const [installPhase, setInstallPhase] = useState<string | null>(null);
  const desktop = Boolean(window.joiDesktop?.tts);
  const canManageSovits = Boolean(window.joiDesktop?.tts?.sovitsStart);
  /** Consecutive offline pings before UI flips to offline (GPU busy = false negatives). */
  const offlineStreakRef = useRef(0);

  const refreshSovits = useCallback(async () => {
    const api = window.joiDesktop?.tts;
    if (!api?.sovitsStatus) {
      setSovitsOnline(false);
      return null;
    }
    try {
      const st = (await api.sovitsStatus({
        baseUrl: voice.sovitsUrl,
      })) as SovitsStatus;
      if (st.online) {
        offlineStreakRef.current = 0;
        setSovitsOnline(true);
        setSovitsDetail(st.detail || "онлайн");
      } else {
        offlineStreakRef.current += 1;
        // While synthesizing, HTTP/TCP can flap — need 3 misses in a row
        if (offlineStreakRef.current >= 3) {
          setSovitsOnline(false);
          setSovitsDetail(st.detail || "офлайн");
        } else {
          setSovitsDetail(
            `проверяю… (${offlineStreakRef.current}/3) · ${st.detail || ""}`,
          );
        }
      }
      setSovitsManaged(Boolean(st.managedByApp));
      return st;
    } catch {
      offlineStreakRef.current += 1;
      if (offlineStreakRef.current >= 3) {
        setSovitsOnline(false);
        setSovitsDetail("ошибка статуса");
      }
      return null;
    }
  }, [voice.sovitsUrl]);

  const refreshQwen = useCallback(async () => {
    const api = window.joiDesktop?.tts;
    if (!api?.qwenStatus) {
      setQwenOnline(false);
      return null;
    }
    try {
      const st = (await api.qwenStatus({
        baseUrl: voice.qwenUrl,
      })) as QwenStatus;
      setQwenOnline(st.online);
      setQwenDetail(st.detail || (st.online ? "онлайн" : "офлайн"));
      return st;
    } catch {
      setQwenOnline(false);
      setQwenDetail("ошибка статуса");
      return null;
    }
  }, [voice.qwenUrl]);

  useEffect(() => {
    if (voice.ttsProvider !== "qwen") return;
    void refreshQwen();
    const poll = window.setInterval(() => {
      void refreshQwen();
    }, 6000);
    return () => window.clearInterval(poll);
  }, [voice.ttsProvider, voice.qwenUrl, refreshQwen]);

  useEffect(() => {
    void tts.listCatalog().then((c) => {
      setEdgeVoices(c.edge?.length ? c.edge : EDGE_VOICE_FALLBACK);
      setPiperReady(Boolean(c.piperStatus?.ready));
    });
    void refreshSovits();
    const refresh = () => setSysVoices(tts.listRussianVoices());
    refresh();
    const poll = window.setInterval(() => {
      void refreshSovits();
    }, 5000);
    if (!window.speechSynthesis) {
      return () => window.clearInterval(poll);
    }
    window.speechSynthesis.addEventListener("voiceschanged", refresh);
    const id = window.setTimeout(refresh, 400);
    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", refresh);
      window.clearTimeout(id);
      window.clearInterval(poll);
    };
  }, [tts, refreshSovits]);

  useEffect(() => {
    return window.joiDesktop?.tts?.onPiperProgress?.((p) => {
      setInstallPhase(p.phase);
      setInstallPct(p.pct);
    });
  }, []);

  useEffect(() => {
    if (!canManageSovits) return;
    let cancelled = false;
    void (async () => {
      try {
        const st = await ensureSovitsAutoStart({
          ttsEnabled: voice.ttsEnabled,
          autoStartSovits: voice.autoStartSovits,
          ttsProvider: voice.ttsProvider,
          sovitsUrl: voice.sovitsUrl,
        });
        if (cancelled) return;
        if (st) {
          setSovitsOnline(st.online);
          setSovitsDetail(st.detail);
          setSovitsManaged(Boolean(st.managedByApp));
          if (!st.skipped) {
            setHint(st.online ? "SoVITS онлайн" : st.detail);
          }
        } else {
          await refreshSovits();
        }
      } catch (err) {
        if (!cancelled) {
          setHint(
            err instanceof Error ? err.message : "Не удалось запустить SoVITS",
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    voice.ttsEnabled,
    voice.ttsProvider,
    voice.autoStartSovits,
    voice.sovitsUrl,
    canManageSovits,
    refreshSovits,
  ]);

  async function startSovits() {
    const api = window.joiDesktop?.tts;
    if (!api?.sovitsStart) {
      setHint("Запуск SoVITS только в Electron (Запуск.bat)");
      return;
    }
    resetSovitsAutoStartGate();
    setBusy(true);
    setHint("Запускаю GPT-SoVITS…");
    try {
      const st = await api.sovitsStart({ baseUrl: voice.sovitsUrl });
      setSovitsOnline(st.online);
      setSovitsDetail(st.detail);
      setSovitsManaged(Boolean(st.managedByApp));
      setHint(st.online ? "SoVITS онлайн" : st.detail);
    } catch (err) {
      setHint(err instanceof Error ? err.message : "Ошибка запуска SoVITS");
      await refreshSovits();
    } finally {
      setBusy(false);
    }
  }

  async function stopSovits() {
    const api = window.joiDesktop?.tts;
    if (!api?.sovitsStop) return;
    setBusy(true);
    setHint("Останавливаю SoVITS…");
    try {
      const st = await api.sovitsStop({ baseUrl: voice.sovitsUrl });
      setSovitsOnline(st.online);
      setSovitsDetail(st.detail);
      setSovitsManaged(Boolean(st.managedByApp));
      setHint(
        st.stopped ? "SoVITS остановлен" : "Нечего останавливать / уже офлайн",
      );
    } catch (err) {
      setHint(err instanceof Error ? err.message : "Ошибка остановки");
    } finally {
      setBusy(false);
    }
  }

  async function checkSovits() {
    setBusy(true);
    setHint("Проверяю API SoVITS…");
    try {
      offlineStreakRef.current = 0;
      const api = window.joiDesktop?.tts;
      const st = api?.sovitsStatus
        ? ((await api.sovitsStatus({
            baseUrl: voice.sovitsUrl,
          })) as SovitsStatus)
        : null;
      if (!st?.online) {
        setSovitsOnline(false);
        setHint(
          `Офлайн · ${st?.detail || "нет ответа"}. Жми «Запустить голос».`,
        );
        return;
      }
      offlineStreakRef.current = 0;
      setSovitsOnline(true);
      setSovitsDetail(st.detail || "онлайн");
      setSovitsManaged(Boolean(st.managedByApp));
      setHint(
        `API онлайн${st.managedByApp ? " · app" : ""} · синтезирую и играю через Windows…`,
      );
      tts.configure({
        enabled: true,
        provider: "sovits",
        rate: voice.ttsRate,
        volume: voice.ttsVolume,
        pitch: voice.ttsPitch,
        edgeVoice: voice.ttsEdgeVoice,
        voiceURI: voice.ttsVoiceURI,
        sovitsUrl: voice.sovitsUrl,
        sovitsRefPath: voice.sovitsRefPath,
        sovitsPromptText: voice.sovitsPromptText,
        sovitsPromptLang: voice.sovitsPromptLang,
        sovitsTextLang: voice.sovitsTextLang,
      });
      const sample =
        voice.sovitsTextLang === "en"
          ? `Hello. It's ${sampleNameEn}. Can you hear me?`
          : `Привет. ${mistress.displayNameRu} на связи. Слышишь меня?`;
      const res = await tts.testAsync(sample, "tease");
      if (res.ok) {
        setHint(
          `Воспроизведение через Windows · ${res.engine ?? "sovits"}. Должен быть слышен системный звук (не только окно приложения).`,
        );
      } else {
        setHint(res.error ?? "Синтез не удался");
      }
    } catch (err) {
      setHint(err instanceof Error ? err.message : "Ошибка проверки");
    } finally {
      setBusy(false);
    }
  }

  async function checkQwen() {
    setBusy(true);
    setHint("Проверяю Qwen3-TTS (vLLM)…");
    try {
      const api = window.joiDesktop?.tts;
      const st = api?.qwenStatus
        ? ((await api.qwenStatus({ baseUrl: voice.qwenUrl })) as QwenStatus)
        : null;
      if (!st?.online) {
        setQwenOnline(false);
        setHint(
          `Офлайн · ${st?.detail || "нет ответа"}. Подними vLLM с Qwen3-TTS-0.6B.`,
        );
        return;
      }
      setQwenOnline(true);
      setQwenDetail(st.detail || "онлайн");
      setHint(`vLLM онлайн · синтезирую и играю через Windows…`);
      tts.configure({
        enabled: true,
        provider: "qwen",
        rate: voice.ttsRate,
        volume: voice.ttsVolume,
        pitch: voice.ttsPitch,
        edgeVoice: voice.ttsEdgeVoice,
        voiceURI: voice.ttsVoiceURI,
        sovitsUrl: voice.sovitsUrl,
        sovitsRefPath: voice.sovitsRefPath,
        sovitsPromptText: voice.sovitsPromptText,
        sovitsPromptLang: voice.sovitsPromptLang,
        sovitsTextLang: voice.sovitsTextLang,
        qwenUrl: voice.qwenUrl,
        qwenModel: voice.qwenModel,
        qwenVoice: voice.qwenVoice,
        qwenApiKey: voice.qwenApiKey,
      });
      const sample = `Привет. ${mistress.displayNameRu} на связи. Слышишь меня?`;
      const res = await tts.testAsync(sample, "tease");
      if (res.ok) {
        setHint(
          `Воспроизведение через Windows · ${res.engine ?? "qwen"}.`,
        );
      } else {
        setHint(res.error ?? "Синтез не удался");
      }
    } catch (err) {
      setHint(err instanceof Error ? err.message : "Ошибка проверки Qwen");
    } finally {
      setBusy(false);
    }
  }

  async function installPiper() {
    const api = window.joiDesktop?.tts;
    if (!api?.installPiper) {
      setHint("Установка Piper только в Electron (Запуск.bat)");
      return;
    }
    setBusy(true);
    setHint(null);
    setInstallPct(0);
    setInstallPhase("Старт…");
    try {
      const st = await api.installPiper();
      setPiperReady(st.ready);
      setHint(st.ready ? "Piper готов · Irina (RU)" : "Установка не завершена");
    } catch (err) {
      setHint(err instanceof Error ? err.message : "Ошибка установки Piper");
    } finally {
      setBusy(false);
      setInstallPct(null);
      setInstallPhase(null);
    }
  }

  async function test(emotion: "tease" | "intense" | "strict" | "soft") {
    setBusy(true);
    setHint(`Синтезирую «${emotion}»… подожди 5–20 с`);
    tts.configure({
      enabled: true,
      provider: voice.ttsProvider,
      rate: voice.ttsRate,
      volume: voice.ttsVolume,
      pitch: voice.ttsPitch,
      edgeVoice: voice.ttsEdgeVoice,
      voiceURI: voice.ttsVoiceURI,
      sovitsUrl: voice.sovitsUrl,
      sovitsRefPath: voice.sovitsRefPath,
      sovitsPromptText: voice.sovitsPromptText,
      sovitsPromptLang: voice.sovitsPromptLang,
      sovitsTextLang: voice.sovitsTextLang,
    });
    const samplesEn = {
      tease: "Oh, already shaking? Slower, silly — I haven't said yes yet.",
      intense: "To the edge. Hold. I want to see you bite that lip.",
      strict: "Hands off. Breathe. That's exactly why — no.",
      soft: "Quiet… good. Listen to me and don't rush.",
    };
    const samplesRu = {
      tease: "Ох, уже дрожишь? Медленнее, глупыш — я ещё не разрешила.",
      intense: "К краю. И стой. Хочу видеть, как ты кусаешь губу.",
      strict: "Руки прочь. Дыши. Именно поэтому — нет.",
      soft: "Тише… хороший. Слушай меня и не торопись.",
    };
    const samples =
      voice.ttsProvider === "sovits" || voice.ttsProvider === "auto"
        ? voice.sovitsTextLang === "en"
          ? samplesEn
          : samplesRu
        : samplesRu;
    try {
      const res = await tts.testAsync(samples[emotion], emotion);
      if (res.ok) {
        setHint(
          `Играет · ${emotion} · ${res.engine ?? "tts"}. Если тишина — проверь громкость.`,
        );
      } else {
        setHint(
          `${res.error ?? "Ошибка"}${res.engine ? ` · сейчас: ${res.engine}` : ""}`,
        );
      }
    } catch (err) {
      setHint(err instanceof Error ? err.message : "Ошибка синтеза");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="tts-panel">
      <div className="tts-panel__head">
        <span className="tts-panel__sub">
          Выбери движок, затем настрой только его параметры. Выбор доступен
          даже при выключенной озвучке — выключатель управляет воспроизведением,
          а не скрывает конфигурацию.
        </span>
      </div>

      <UiCheck
        checked={voice.ttsEnabled}
        onChange={(v) => onVoice({ ...voice, ttsEnabled: v })}
      >
        Читать реплики {mistress.displayNameRu} вслух
      </UiCheck>

      <UiCheck
        checked={voice.captionGoogleRu}
        onChange={(v) => onVoice({ ...voice, captionGoogleRu: v })}
      >
        Субтитры через Google (EN→RU). Иначе на экране английский оригинал
      </UiCheck>

      <div className="tts-engine-grid" role="radiogroup" aria-label="Движок TTS">
        {ENGINE_CHOICES.map((engine) => {
          const active = voice.ttsProvider === engine.id;
          const state =
            engine.id === "qwen"
              ? qwenOnline === true
                ? "онлайн"
                : qwenOnline === false
                  ? "офлайн"
                  : null
              : engine.id === "sovits"
                ? sovitsOnline === true
                  ? "онлайн"
                  : sovitsOnline === false
                    ? "офлайн"
                    : null
                : null;
          return (
            <button
              key={engine.id}
              type="button"
              role="radio"
              aria-checked={active}
              className={`tts-engine-card${active ? " is-active" : ""}`}
              onClick={() => onVoice({ ...voice, ttsProvider: engine.id })}
            >
              <span className="tts-engine-card__title">{engine.title}</span>
              <span className="tts-engine-card__sub">{engine.sub}</span>
              {state ? (
                <span className={`tts-engine-card__state is-${state}`}>
                  {state}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="today__fields">
        <label className="field">
          <span className="field__label">Движок</span>
          <select
            value={voice.ttsProvider}
            onChange={(e) =>
              onVoice({
                ...voice,
                ttsProvider: e.target.value as TtsProvider,
              })
            }
          >
            <option value="sovits">GPT-SoVITS · клон (рекомендуется)</option>
            <option value="qwen">Qwen3-TTS 0.6B · vLLM</option>
            <option value="auto">Авто (SoVITS → Qwen → Piper → Edge)</option>
            <option value="piper">
              Piper Irina{piperReady ? "" : " · не установлен"}
            </option>
            <option value="edge">Edge Neural · Microsoft</option>
            <option value="system">Системный Windows</option>
          </select>
        </label>

        {voice.ttsProvider === "sovits" || voice.ttsProvider === "auto" ? (
          <>
            <UiCheck
              className="field--wide"
              checked={voice.autoStartSovits}
              disabled={!voice.ttsEnabled || !canManageSovits}
              onChange={(v) => onVoice({ ...voice, autoStartSovits: v })}
            >
              Автозапуск GPT-SoVITS при старте приложения
            </UiCheck>
            <label className="field">
              <span className="field__label">
                SoVITS API{" "}
                {sovitsOnline === true
                  ? "· онлайн"
                  : sovitsOnline === false
                    ? "· офлайн"
                    : ""}
                {sovitsManaged ? " · app" : ""}
              </span>
              <input
                value={voice.sovitsUrl}
                disabled={!voice.ttsEnabled}
                onChange={(e) =>
                  onVoice({ ...voice, sovitsUrl: e.target.value })
                }
                onBlur={() => void refreshSovits()}
                placeholder="http://127.0.0.1:9880"
              />
            </label>
            <p className="tts-panel__hint">
              {sovitsDetail ||
                "При закрытии приложения SoVITS и Ollama (запущенные отсюда) гасятся."}
            </p>
            <div className="tts-panel__install tts-panel__actions">
              <button
                type="button"
                disabled={!canManageSovits || busy || !voice.ttsEnabled}
                onClick={() => void startSovits()}
              >
                Запустить голос
              </button>
              <button
                type="button"
                disabled={!canManageSovits || busy}
                onClick={() => void stopSovits()}
              >
                Остановить
              </button>
              <button
                type="button"
                disabled={!desktop || busy || !voice.ttsEnabled}
                onClick={() => void checkSovits()}
              >
                Проверить + голос
              </button>
              <span className="tts-panel__sub">
                Проверка = пинг API и короткая фраза вслух
              </span>
            </div>
            <p className="tts-panel__sub">
              Референс и текст подставляются из профиля госпожи (сейчас:{" "}
              {mistress.displayNameRu}). Смена профиля переключает клон
              автоматически.
            </p>
            <div className="tts-panel__actions">
              <button
                type="button"
                disabled={!voice.ttsEnabled}
                onClick={() => {
                  onVoice(resetMistressVoiceProfile(voice, mistress));
                  setHint(
                    `Голос «${mistress.displayNameRu}»: референс, громкость и скорость сброшены к профилю.`,
                  );
                }}
              >
                Сбросить к голосу профиля
              </button>
            </div>
            <label className="field">
              <span className="field__label">Референс wav (катсцена)</span>
              <input
                value={voice.sovitsRefPath}
                disabled={!voice.ttsEnabled}
                onChange={(e) =>
                  onVoice({ ...voice, sovitsRefPath: e.target.value })
                }
                placeholder="voice-refs/hu-tao/ref.wav"
              />
            </label>
            <label className="field field--wide">
              <span className="field__label">
                Текст референса (что сказано в клипе)
              </span>
              <textarea
                rows={2}
                value={voice.sovitsPromptText}
                disabled={!voice.ttsEnabled}
                onChange={(e) =>
                  onVoice({ ...voice, sovitsPromptText: e.target.value })
                }
                placeholder="Дословная расшифровка фразы из катсцены…"
              />
            </label>
            <label className="field">
              <span className="field__label">Язык референса</span>
              <select
                value={voice.sovitsPromptLang}
                disabled={!voice.ttsEnabled}
                onChange={(e) =>
                  onVoice({
                    ...voice,
                    sovitsPromptLang: e.target.value as
                      | "ru"
                      | "zh"
                      | "en"
                      | "ja",
                  })
                }
              >
                <option value="zh">zh · китайский (катсцены CN)</option>
                <option value="ru">ru · русский дубляж</option>
                <option value="en">en</option>
                <option value="ja">ja</option>
              </select>
            </label>
            <label className="field">
              <span className="field__label">Язык реплик сессии</span>
              <select
                value={
                  voice.sovitsTextLang === "ru" ? "en" : voice.sovitsTextLang
                }
                disabled={!voice.ttsEnabled}
                onChange={(e) =>
                  onVoice({
                    ...voice,
                    sovitsTextLang: e.target.value as
                      | "ru"
                      | "zh"
                      | "en"
                      | "ja"
                      | "ko",
                  })
                }
              >
                <option value="en">en · английский (SoVITS ок)</option>
                <option value="zh">zh · китайский</option>
                <option value="ja">ja</option>
                <option value="ko">ko</option>
              </select>
            </label>
            <p className="tts-panel__hint">
              LLM пишет на английском (под SoVITS-клон). На экране по умолчанию
              тоже EN; RU-субтитры — опция «Google» выше.
            </p>
          </>
        ) : null}

        {voice.ttsProvider === "qwen" ? (
          <>
            <label className="field">
              <span className="field__label">
                vLLM API{" "}
                {qwenOnline === true
                  ? "· онлайн"
                  : qwenOnline === false
                    ? "· офлайн"
                    : ""}
              </span>
              <input
                value={voice.qwenUrl}
                onChange={(e) =>
                  onVoice({ ...voice, qwenUrl: e.target.value })
                }
                onBlur={() => void refreshQwen()}
                placeholder="http://127.0.0.1:8000/v1"
              />
            </label>
            <p className="tts-panel__hint">
              {qwenDetail ||
                "Qwen3-TTS обслуживает vLLM-сервер. Запусти: vllm serve Qwen/Qwen3-TTS-0.6B --port 8000."}
            </p>
            <label className="field">
              <span className="field__label">Модель (id в vLLM)</span>
              <input
                value={voice.qwenModel}
                onChange={(e) =>
                  onVoice({ ...voice, qwenModel: e.target.value })
                }
                placeholder="Qwen/Qwen3-TTS-0.6B"
              />
            </label>
            <label className="field">
              <span className="field__label">Голос (voice id)</span>
              <select
                value={voice.qwenVoice}
                onChange={(e) =>
                  onVoice({ ...voice, qwenVoice: e.target.value })
                }
              >
                <option value="Cherry">Cherry · женский (рекомендуется)</option>
                <option value="Ethan">Ethan · мужской</option>
                <option value="Chelsie">Chelsie · женский</option>
                <option value="Serena">Serena · женский</option>
                <option value="Dylan">Dylan · мужской</option>
              </select>
            </label>
            <label className="field">
              <span className="field__label">
                API key (опц., для защищённого vLLM)
              </span>
              <input
                type="password"
                value={voice.qwenApiKey}
                onChange={(e) =>
                  onVoice({ ...voice, qwenApiKey: e.target.value })
                }
                placeholder="оставь пустым для локального vLLM без авторизации"
              />
            </label>
            <div className="tts-panel__install tts-panel__actions">
              <button
                type="button"
                disabled={!desktop || busy}
                onClick={() => void checkQwen()}
              >
                Проверить + голос
              </button>
              <span className="tts-panel__sub">
                Проверка = пинг /v1/models и короткая фраза вслух
              </span>
            </div>
            <p className="tts-panel__sub">
              Qwen3-TTS работает на любом языке (включая русский) и не требует
              референса, в отличие от SoVITS. Скорость/тембр берутся из профиля
              госпожи.
            </p>
          </>
        ) : null}

        {voice.ttsProvider === "edge" ? (
          <label className="field">
            <span className="field__label">Голос Edge</span>
            <select
              value={voice.ttsEdgeVoice}
              disabled={!voice.ttsEnabled}
              onChange={(e) =>
                onVoice({ ...voice, ttsEdgeVoice: e.target.value })
              }
            >
              {(edgeVoices.length ? edgeVoices : EDGE_VOICE_FALLBACK).map(
                (v) => (
                  <option key={v.id} value={v.id}>
                    {v.nameRu} — {v.hint}
                  </option>
                ),
              )}
            </select>
          </label>
        ) : null}

        {voice.ttsProvider === "system" ? (
          <label className="field">
            <span className="field__label">Голос ОС</span>
            <select
              value={voice.ttsVoiceURI}
              disabled={!voice.ttsEnabled}
              onChange={(e) =>
                onVoice({ ...voice, ttsVoiceURI: e.target.value })
              }
            >
              <option value="">авто · русский</option>
              {sysVoices.map((v) => (
                <option key={v.voiceURI} value={v.voiceURI}>
                  {v.name} ({v.lang})
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {voice.ttsProvider === "piper" && !piperReady ? (
          <div className="tts-panel__install">
            <button
              type="button"
              disabled={!desktop || busy}
              onClick={() => void installPiper()}
            >
              Скачать Piper + Irina
            </button>
            {installPct != null ? (
              <span className="voice-status">
                {installPhase} · {installPct}%
              </span>
            ) : null}
          </div>
        ) : null}

        {piperReady && voice.ttsProvider === "piper" ? (
          <span className="voice-status">
            Piper готов · {PIPER_VOICE_FALLBACK[0]?.nameRu}
          </span>
        ) : null}

        <label className="field">
          <span className="field__label">
            Громкость · {mistress.displayNameRu} ·{" "}
            {Math.round(voice.ttsVolume * 100)}%
          </span>
          <span className="field__hint">
            Своя на каждую госпожу (до 200% — для тихих рефов вроде Санны).
          </span>
          <input
            type="range"
            min={0}
            max={2}
            step={0.05}
            value={voice.ttsVolume}
            disabled={!voice.ttsEnabled}
            onChange={(e) =>
              onVoice(
                setMistressVoiceTuning(voice, mistress.id, {
                  ttsVolume: Number(e.target.value),
                }),
              )
            }
          />
        </label>

        <label className="field">
          <span className="field__label">
            Скорость · {mistress.displayNameRu} · {voice.ttsRate.toFixed(2)}
          </span>
          <span className="field__hint">
            Своя на каждую госпожу. Смена профиля подставляет её скорость.
          </span>
          <input
            type="range"
            min={0.75}
            max={1.35}
            step={0.05}
            value={voice.ttsRate}
            disabled={!voice.ttsEnabled}
            onChange={(e) =>
              onVoice(
                setMistressVoiceTuning(voice, mistress.id, {
                  ttsRate: Number(e.target.value),
                }),
              )
            }
          />
        </label>

        <label className="field">
          <span className="field__label">
            Тон · {mistress.displayNameRu} · {voice.ttsPitch.toFixed(2)}
          </span>
          <span className="field__hint">
            Тоже отдельно для профиля (Edge / system; SoVITS почти не меняет).
          </span>
          <input
            type="range"
            min={0.8}
            max={1.4}
            step={0.05}
            value={voice.ttsPitch}
            disabled={!voice.ttsEnabled}
            onChange={(e) =>
              onVoice(
                setMistressVoiceTuning(voice, mistress.id, {
                  ttsPitch: Number(e.target.value),
                }),
              )
            }
          />
        </label>
      </div>

      <div className="tts-panel__emotions">
        <span className="field__label">Пробы эмоций</span>
        <div className="tts-panel__emo-row">
          {(
            [
              ["tease", "дразнит"],
              ["intense", "накал"],
              ["strict", "строго"],
              ["soft", "мягко"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              disabled={!voice.ttsEnabled || busy}
              onClick={() => test(id)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {hint ? (
        <p className={`voice-status ${busy ? "voice-status--busy" : ""}`}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}
