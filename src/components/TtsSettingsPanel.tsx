import { useCallback, useEffect, useRef, useState } from "react";
import { getActiveMistress } from "../lib/mistress";
import type { MistressId } from "../lib/mistress/types";
import {
  DEFAULT_QWEN_VOICE,
  QWEN_TTS_CUSTOM_VOICES,
  inferQwenFlavor,
  isCustomVoiceId,
  qwenModelForFlavor,
  qwenServeHint,
  type QwenTtsFlavor,
} from "../lib/qwenTtsCatalog";
import {
  isQwenTtsProvider,
  qwenServeDevice,
  resetMistressVoiceProfile,
  setMistressClonePrompt,
  setMistressQwenPrompt,
  setMistressVoiceTuning,
  type VoiceSettings,
} from "../lib/voiceSettings";
import {
  EDGE_VOICE_FALLBACK,
  SpeechTts,
  type TtsOptions,
  type TtsProvider,
} from "../lib/voice/speechTts";
import {
  ensureSovitsAutoStart,
  resetSovitsAutoStartGate,
} from "../lib/voice/sovitsAutoStart";
import {
  ensureQwenAutoStart,
  resetQwenAutoStartGate,
} from "../lib/voice/qwenAutoStart";
import { UiCheck } from "./UiCheck";
import { VoiceRefPathField } from "./VoiceRefPathField";
import "./voiceSettings.css";

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
  starting?: boolean;
  managedByApp?: boolean;
  python?: string | null;
  modelPath?: string | null;
  tokenizer?: boolean;
  customVoice?: boolean;
  base?: boolean;
  torchCuda?: boolean;
  torchCpu?: boolean;
  device?: string;
  gpu?: string;
  torch?: string;
  backend?: string;
  warmed?: boolean;
  baseUrl: string;
  detail: string;
};

function neuralOptsFromVoice(
  voice: VoiceSettings,
  extra: Partial<TtsOptions> = {},
): Partial<TtsOptions> {
  return {
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
    qwenRefPath: voice.qwenRefPath,
    qwenPromptText: voice.qwenPromptText,
    qwenUrl: voice.qwenUrl,
    qwenModel: voice.qwenModel,
    qwenVoice: voice.qwenVoice,
    qwenApiKey: voice.qwenApiKey,
    ...extra,
  };
}

const ENGINE_CHOICES: Array<{
  id: TtsProvider;
  title: string;
  sub: string;
}> = [
  { id: "qwen", title: "Qwen3-TTS", sub: "качество · RAM или VRAM" },
  { id: "sovits", title: "SoVITS", sub: "клон по рефу" },
  { id: "auto", title: "Авто", sub: "SoVITS → Qwen → Piper → Edge" },
  { id: "piper", title: "Piper", sub: "офлайн · Irina" },
  { id: "edge", title: "Edge", sub: "Microsoft Neural" },
  { id: "system", title: "Windows", sub: "системный TTS" },
];

function formatVoiceTiming(result: {
  generationMs?: number;
  audioSeconds?: number;
  realtimeX?: number;
  device?: string;
}): string {
  if (!result.generationMs) return "";
  const generated = (result.generationMs / 1000).toFixed(1);
  const audio = result.audioSeconds?.toFixed(1);
  const speed = result.realtimeX?.toFixed(1);
  return [
    `готово за ${generated} с`,
    audio ? `аудио ${audio} с` : "",
    speed ? `${speed}× realtime` : "",
    result.device ? result.device.toUpperCase() : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

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
  const [sovitsInstall, setSovitsInstall] = useState<string | null>(null);
  const [qwenOnline, setQwenOnline] = useState<boolean | null>(null);
  const [qwenDetail, setQwenDetail] = useState<string | null>(null);
  const [qwenManaged, setQwenManaged] = useState(false);
  const [qwenStarting, setQwenStarting] = useState(false);
  const [edgeVoices, setEdgeVoices] = useState(EDGE_VOICE_FALLBACK);
  const [sysVoices, setSysVoices] = useState(() => tts.listRussianVoices());
  const [hint, setHint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const desktop = Boolean(window.joiDesktop?.tts);
  const canManageSovits = Boolean(window.joiDesktop?.tts?.sovitsStart);
  const canStartSovits =
    canManageSovits && (Boolean(sovitsInstall) || sovitsOnline === true);
  const canManageQwen = Boolean(window.joiDesktop?.tts?.qwenStart);
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
      setSovitsInstall(st.installPath ?? null);
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
        model: voice.qwenModel,
        flavor: inferQwenFlavor(voice.qwenModel),
        device: qwenServeDevice(voice.ttsProvider),
      })) as QwenStatus;
      setQwenOnline(st.online);
      setQwenDetail(st.detail || (st.online ? "онлайн" : "офлайн"));
      setQwenManaged(Boolean(st.managedByApp));
      setQwenStarting(Boolean(st.starting));
      return st;
    } catch {
      setQwenOnline(false);
      setQwenDetail("ошибка статуса");
      return null;
    }
  }, [voice.qwenUrl, voice.qwenModel, voice.ttsProvider]);

  useEffect(() => {
    void refreshQwen();
    const poll = window.setInterval(() => {
      void refreshQwen();
    }, 6000);
    return () => window.clearInterval(poll);
  }, [voice.qwenUrl, voice.qwenModel, refreshQwen]);

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

  useEffect(() => {
    if (!canManageQwen) return;
    let cancelled = false;
    void (async () => {
      try {
        const st = await ensureQwenAutoStart({
          ttsEnabled: voice.ttsEnabled,
          autoStartQwen: voice.autoStartQwen,
          ttsProvider: voice.ttsProvider,
          qwenUrl: voice.qwenUrl,
          qwenModel: voice.qwenModel,
          qwenFlavor: inferQwenFlavor(voice.qwenModel),
        });
        if (cancelled) return;
        if (st) {
          setQwenOnline(st.online);
          setQwenDetail(st.detail);
          setQwenManaged(Boolean(st.managedByApp));
          if (!st.skipped) {
            setHint(st.online ? "Qwen TTS онлайн" : st.detail);
          }
        } else {
          await refreshQwen();
        }
      } catch {
        if (!cancelled) {
          await refreshQwen();
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    voice.ttsEnabled,
    voice.ttsProvider,
    voice.autoStartQwen,
    voice.qwenUrl,
    voice.qwenModel,
    canManageQwen,
    refreshQwen,
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
      setSovitsInstall(st.installPath ?? null);
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

  async function startQwen() {
    const api = window.joiDesktop?.tts;
    if (!api?.qwenStart) {
      setHint("Запуск Qwen только в Electron (Запуск.bat)");
      return;
    }
    resetQwenAutoStartGate();
    setBusy(true);
    setQwenStarting(true);
    setHint(
      voice.ttsProvider === "qwen-cpu"
        ? "Загружаю Qwen3-TTS в RAM и прогреваю аудиокодек…"
        : "Загружаю Qwen3-TTS в VRAM и прогреваю аудиокодек…",
    );
    try {
      const st = await api.qwenStart({
        baseUrl: voice.qwenUrl,
        model: voice.qwenModel,
        flavor: inferQwenFlavor(voice.qwenModel),
        device: qwenServeDevice(voice.ttsProvider),
        refAudio: voice.qwenRefPath,
        refText: voice.qwenPromptText,
      });
      setQwenOnline(st.online);
      setQwenDetail(st.detail);
      setQwenManaged(Boolean(st.managedByApp));
      setQwenStarting(Boolean(st.starting));
      setHint(
        st.online
          ? st.warmed
            ? "Qwen онлайн · модель и аудиокодек прогреты"
            : "Qwen онлайн"
          : st.detail,
      );
    } catch (err) {
      setHint(err instanceof Error ? err.message : "Ошибка запуска Qwen");
      await refreshQwen();
    } finally {
      setBusy(false);
    }
  }

  async function stopQwen() {
    const api = window.joiDesktop?.tts;
    if (!api?.qwenStop) return;
    setBusy(true);
    setHint("Останавливаю Qwen TTS…");
    try {
      const st = await api.qwenStop({ baseUrl: voice.qwenUrl });
      setQwenOnline(st.online);
      setQwenDetail(st.detail);
      setQwenManaged(Boolean(st.managedByApp));
      setQwenStarting(false);
      setHint(st.stopped ? "Qwen остановлен" : "Нечего останавливать / уже офлайн");
    } catch (err) {
      setHint(err instanceof Error ? err.message : "Ошибка остановки Qwen");
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
          `Офлайн · ${st?.detail || "нет ответа"}. Жми «старт».`,
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
    setHint("Проверяю Qwen3-TTS…");
    try {
      const api = window.joiDesktop?.tts;
      const st = api?.qwenStatus
        ? ((await api.qwenStatus({
            baseUrl: voice.qwenUrl,
            device: qwenServeDevice(voice.ttsProvider),
          })) as QwenStatus)
        : null;
      if (!st?.online) {
        setQwenOnline(false);
        setHint(
          `Офлайн · ${st?.detail || "нет ответа"}. Скачай Qwen во вкладке «ИИ ресурсы» и нажми старт.`,
        );
        return;
      }
      setQwenOnline(true);
      setQwenDetail(st.detail || "онлайн");
      setHint(`Qwen онлайн · синтезирую и играю через Windows…`);
      const qwenLang =
        inferQwenFlavor(voice.qwenModel) === "base" ? "en" : "ru";
      tts.configure(
        neuralOptsFromVoice(voice, {
          provider: isQwenTtsProvider(voice.ttsProvider)
            ? voice.ttsProvider
            : "qwen",
          sovitsTextLang: qwenLang,
        }),
      );
      const sample =
        qwenLang === "en"
          ? `Hello. It's ${sampleNameEn}. Can you hear me?`
          : `Привет. ${mistress.displayNameRu} на связи. Слышишь меня?`;
      const res = await tts.testAsync(sample, "tease");
      if (res.ok) {
        setHint(
          `Qwen · ${formatVoiceTiming(res) || "воспроизведение через Windows"}.`,
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

  async function test(emotion: "tease" | "intense" | "strict" | "soft") {
    setBusy(true);
    const qwenFlavorNow = inferQwenFlavor(voice.qwenModel);
    const qwenBase =
      isQwenTtsProvider(voice.ttsProvider) && qwenFlavorNow === "base";
    setHint(
      isQwenTtsProvider(voice.ttsProvider)
        ? voice.ttsProvider === "qwen-cpu"
          ? "Синтезирую в RAM… первая фраза после старта может занять до 3 мин"
          : "Синтезирую… первая фраза после старта может занять до 3 мин (это не длина текста)"
        : `Синтезирую «${emotion}»… подожди 5–20 с`,
    );
    const sampleLang =
      voice.ttsProvider === "sovits" || voice.ttsProvider === "auto"
        ? voice.sovitsTextLang === "en"
          ? "en"
          : "ru"
        : qwenBase
          ? "en"
          : "ru";
    tts.configure(
      neuralOptsFromVoice(voice, {
        sovitsTextLang: sampleLang,
      }),
    );
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
    const samples = sampleLang === "en" ? samplesEn : samplesRu;
    try {
      const res = await tts.testAsync(samples[emotion], emotion);
      if (res.ok) {
        const timing = formatVoiceTiming(res);
        setHint(
          `Играет · ${emotion} · ${res.engine ?? "tts"}${timing ? ` · ${timing}` : ""}.`,
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

  const qwenFlavor = inferQwenFlavor(voice.qwenModel);

  function setQwenFlavor(next: QwenTtsFlavor) {
    const nextVoice =
      next === "custom_voice" && !isCustomVoiceId(voice.qwenVoice)
        ? DEFAULT_QWEN_VOICE
        : voice.qwenVoice;
    onVoice({
      ...voice,
      qwenModel: qwenModelForFlavor(next),
      qwenVoice: nextVoice,
    });
  }

  function engineMeta(id: TtsProvider): string {
    switch (id) {
      case "qwen":
        return qwenStarting
          ? "запуск…"
          : qwenOnline === true
            ? qwenManaged
              ? "онлайн · app"
              : "онлайн"
            : qwenOnline === false
              ? "офлайн"
              : "GPU · CustomVoice / Base";
      case "qwen-cpu":
        return qwenStarting
          ? "запуск RAM…"
          : qwenOnline === true
            ? qwenManaged
              ? "RAM · app"
              : "RAM"
            : qwenOnline === false
              ? "офлайн"
              : "через оперативку";
      case "sovits":
        return sovitsOnline === true
          ? sovitsManaged
            ? "онлайн · app"
            : "онлайн"
          : sovitsOnline === false
            ? "офлайн"
            : "клон по рефу";
      case "auto":
        return "цепочка fallback";
      case "piper":
        return piperReady ? "готов" : "веса во вкладке ИИ ресурсы";
      case "edge":
        return "нужен интернет";
      case "system":
        return "офлайн ОС";
      default: {
        const _exhaustive: never = id;
        return _exhaustive;
      }
    }
  }

  const engineTone =
    isQwenTtsProvider(voice.ttsProvider)
      ? qwenStarting
        ? "busy"
        : qwenOnline === true
          ? "ok"
          : qwenOnline === false
            ? "off"
            : "busy"
      : voice.ttsProvider === "sovits" || voice.ttsProvider === "auto"
        ? sovitsOnline === true
          ? "ok"
          : sovitsOnline === false
            ? "off"
            : "busy"
        : voice.ttsProvider === "piper"
          ? piperReady
            ? "ok"
            : "warn"
          : "ok";

  return (
    <div className="brain-panel">
      <div className="voice-summary">
        <div>
          <span className="voice-summary__eyebrow">Активный голос</span>
          <strong>{mistress.displayNameRu}</strong>
          <span className={`brain-dot brain-dot--${engineTone}`}>
            {voice.ttsEnabled ? engineMeta(voice.ttsProvider) : "выкл"}
          </span>
        </div>
        <div className="brain-panel__links">
          <button
            type="button"
            className="brain-act"
            disabled={!voice.ttsEnabled}
            onClick={() => {
              onVoice(resetMistressVoiceProfile(voice, mistress));
              setHint(
                `Голос «${mistress.displayNameRu}»: реф, громкость и скорость сброшены к профилю.`,
              );
            }}
          >
            сбросить голос
          </button>
        </div>
      </div>
      <div className="voice-summary__switches">
        <UiCheck
          checked={voice.ttsEnabled}
          onChange={(v) => onVoice({ ...voice, ttsEnabled: v })}
        >
          Читать реплики вслух
        </UiCheck>
        <UiCheck
          checked={voice.captionGoogleRu}
          onChange={(v) => onVoice({ ...voice, captionGoogleRu: v })}
        >
          Русские субтитры для английского голоса
        </UiCheck>
      </div>

      <h3 className="brain-panel__h">Движок</h3>
      <div className="voice-engine-grid" role="radiogroup" aria-label="Движок голоса">
        {ENGINE_CHOICES.map((engine) => {
          const active =
            engine.id === "qwen"
              ? isQwenTtsProvider(voice.ttsProvider)
              : voice.ttsProvider === engine.id;
          return (
            <button
              type="button"
              role="radio"
              aria-checked={active}
              key={engine.id}
              className={"voice-engine-card" + (active ? " is-active" : "")}
              disabled={!voice.ttsEnabled}
              onClick={() => {
                if (active) return;
                if (!active && isQwenTtsProvider(voice.ttsProvider)) {
                  resetQwenAutoStartGate();
                }
                onVoice({ ...voice, ttsProvider: engine.id });
              }}
            >
              <span className="voice-engine-card__name">{engine.title}</span>
              <span className="voice-engine-card__sub">{engine.sub}</span>
              <span className={`voice-engine-card__state${active ? " is-active" : ""}`}>
                {active ? engineMeta(voice.ttsProvider) : "выбрать"}
              </span>
            </button>
          );
        })}
      </div>

      <div className="brain-fields brain-fields--voice">
        {voice.ttsProvider === "sovits" || voice.ttsProvider === "auto" ? (
          <>
            <h3 className="brain-panel__h">
              {voice.ttsProvider === "auto"
                ? "Авто · SoVITS первым"
                : `SoVITS · ${mistress.displayNameRu}`}
            </h3>
            <UiCheck
              checked={voice.autoStartSovits}
              disabled={!voice.ttsEnabled || !canManageSovits}
              onChange={(v) => onVoice({ ...voice, autoStartSovits: v })}
            >
              Автозапуск GPT-SoVITS при SoVITS / Авто
            </UiCheck>
            <label className="brain-field">
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
            {voice.ttsProvider === "auto" ? (
              <p className="brain-panel__hint">
                Цепочка: SoVITS → Qwen → Piper → Edge. Параметры Qwen / Piper /
                Edge — после выбора того движка в списке.
              </p>
            ) : null}
            <p className="brain-panel__hint">
              {sovitsDetail ||
                "При закрытии приложения SoVITS и Ollama (запущенные отсюда) гасятся."}
            </p>
            {!sovitsInstall && sovitsOnline !== true ? (
              <p className="brain-panel__hint">
                GPT-SoVITS не установлен. Скачай во вкладке «ИИ ресурсы» (репо +
                venv + pretrained, несколько ГБ). Реф — отдельный wav 4–10 с,
                не клип Qwen.
              </p>
            ) : null}
            <div className="brain-panel__links">
              <button
                type="button"
                className="brain-act"
                disabled={!canStartSovits || busy || !voice.ttsEnabled}
                onClick={() => void startSovits()}
              >
                старт
              </button>
              <button
                type="button"
                className="brain-act"
                disabled={!canManageSovits || busy}
                onClick={() => void stopSovits()}
              >
                стоп
              </button>
              <button
                type="button"
                className="brain-act"
                disabled={!desktop || busy || !voice.ttsEnabled}
                onClick={() => void checkSovits()}
              >
                проверить
              </button>
            </div>
            <p className="brain-panel__hint">
              Реф SoVITS — отдельный wav 4–10 с чистой речи (не клип Qwen ~3 с).
              Смена госпожи переключает файл сама. ogg/mp3 → «выбрать файл»:
              моно wav 40 кГц, имя sovits-ref.wav.
            </p>
            <VoiceRefPathField
              destRel={mistress.voice.sovitsRefPath}
              value={voice.sovitsRefPath}
              disabled={!voice.ttsEnabled}
              label="Реф SoVITS · 4–10 с"
              onPath={(sovitsRefPath) => onVoice({ ...voice, sovitsRefPath })}
              onHint={setHint}
            />
            <label className="brain-field">
              <span className="field__label">
                Текст референса SoVITS (что сказано в клипе 4–10 с)
              </span>
              <textarea
                rows={2}
                value={voice.sovitsPromptText}
                disabled={!voice.ttsEnabled}
                onChange={(e) =>
                  onVoice(
                    setMistressClonePrompt(voice, mistress.id, {
                      sovitsPromptText: e.target.value,
                    }),
                  )
                }
                placeholder="Дословная расшифровка фразы из катсцены…"
              />
            </label>
            <label className="brain-field">
              <span className="field__label">Язык референса</span>
              <select
                value={voice.sovitsPromptLang}
                disabled={!voice.ttsEnabled}
                onChange={(e) =>
                  onVoice(
                    setMistressClonePrompt(voice, mistress.id, {
                      sovitsPromptLang: e.target.value as
                        | "ru"
                        | "zh"
                        | "en"
                        | "ja",
                    }),
                  )
                }
              >
                <option value="zh">zh · китайский (катсцены CN)</option>
                <option value="ru">ru · русский дубляж</option>
                <option value="en">en</option>
                <option value="ja">ja</option>
              </select>
            </label>
            <label className="brain-field">
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
            <p className="brain-panel__hint">
              LLM пишет на английском (под SoVITS-клон). На экране по умолчанию
              тоже EN; RU-субтитры — опция Google выше.
            </p>
          </>
        ) : null}

        {isQwenTtsProvider(voice.ttsProvider) ? (
          <>
            <h3 className="brain-panel__h">
              Qwen3-TTS
              {voice.ttsProvider === "qwen-cpu" ? " · RAM" : ""} ·{" "}
              {mistress.displayNameRu}
            </h3>
            <div
              className="voice-runtime-grid"
              role="radiogroup"
              aria-label="Ресурсный профиль Qwen"
            >
              <button
                type="button"
                role="radio"
                aria-checked={voice.ttsProvider === "qwen"}
                className={`voice-runtime-card${voice.ttsProvider === "qwen" ? " is-active" : ""}`}
                onClick={() => {
                  resetQwenAutoStartGate();
                  onVoice({ ...voice, ttsProvider: "qwen" });
                }}
              >
                <span className="voice-runtime-card__badge">Рекомендуется</span>
                <strong>Быстро · VRAM</strong>
                <span>CUDA, BF16 и прогретый codec. Освободи видеопамять от тяжёлой LLM.</span>
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={voice.ttsProvider === "qwen-cpu"}
                className={`voice-runtime-card${voice.ttsProvider === "qwen-cpu" ? " is-active" : ""}`}
                onClick={() => {
                  resetQwenAutoStartGate();
                  onVoice({ ...voice, ttsProvider: "qwen-cpu" });
                }}
              >
                <span className="voice-runtime-card__badge">Совместимость</span>
                <strong>Экономно · RAM</strong>
                <span>Видеокарта свободна для Ollama. Генерация заметно медленнее.</span>
              </button>
            </div>
            <UiCheck
              checked={voice.autoStartQwen}
              disabled={!voice.ttsEnabled || !canManageQwen}
              onChange={(v) => onVoice({ ...voice, autoStartQwen: v })}
            >
              {voice.ttsProvider === "qwen-cpu"
                ? "Автозапуск Qwen TTS в RAM (CUDA свободна для LLM)"
                : "Автозапуск Qwen TTS, когда выбран Qwen (GPU, до нескольких минут)"}
            </UiCheck>
            <div className="brain-seg" role="radiogroup" aria-label="Линейка Qwen">
              <button
                type="button"
                role="radio"
                aria-checked={qwenFlavor === "custom_voice"}
                className={
                  "brain-seg__btn" +
                  (qwenFlavor === "custom_voice" ? " is-on" : "")
                }
                onClick={() => setQwenFlavor("custom_voice")}
              >
                CustomVoice
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={qwenFlavor === "base"}
                className={
                  "brain-seg__btn" + (qwenFlavor === "base" ? " is-on" : "")
                }
                onClick={() => setQwenFlavor("base")}
              >
                Base
              </button>
            </div>
            <details className="voice-advanced">
              <summary>Сервер и модель</summary>
              <div className="voice-advanced__body">
            <label className="brain-field">
              <span className="field__label">
                Qwen API{" "}
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
            <p className="brain-panel__hint">
              {qwenDetail ||
                `Tokenizer-12Hz обязателен. Запусти: ${qwenServeHint(null, qwenFlavor)}`}
            </p>
            <label className="brain-field">
              <span className="field__label">Модель (локальный путь или HF id)</span>
              <input
                value={voice.qwenModel}
                onChange={(e) =>
                  onVoice({ ...voice, qwenModel: e.target.value })
                }
                placeholder={qwenModelForFlavor(qwenFlavor)}
              />
            </label>
            <label className="brain-field">
              <span className="field__label">
                API key (только для внешнего сервера)
              </span>
              <input
                type="password"
                value={voice.qwenApiKey}
                onChange={(e) =>
                  onVoice({ ...voice, qwenApiKey: e.target.value })
                }
                placeholder="локальному серверу ключ не нужен"
              />
            </label>
              </div>
            </details>
            {qwenFlavor === "custom_voice" ? (
              <label className="brain-field">
                <span className="field__label">Голос CustomVoice</span>
                <select
                  value={
                    isCustomVoiceId(voice.qwenVoice)
                      ? voice.qwenVoice
                      : DEFAULT_QWEN_VOICE
                  }
                  onChange={(e) =>
                    onVoice({ ...voice, qwenVoice: e.target.value })
                  }
                >
                  {QWEN_TTS_CUSTOM_VOICES.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.labelRu}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <>
                <p className="brain-panel__hint">
                  Base клонирует тембр с короткого клипа (~3 с). SoVITS для этого
                  не подходит — у него свой файл 4–10 с. Без wav синтез Base не
                  пойдёт. CustomVoice реф не нужен. «Выбрать файл» пишет{" "}
                  <code>{mistress.voice.qwenRefPath ?? mistress.voice.sovitsRefPath}</code>.
                </p>
                <VoiceRefPathField
                  destRel={
                    mistress.voice.qwenRefPath ?? mistress.voice.sovitsRefPath
                  }
                  value={voice.qwenRefPath}
                  disabled={!voice.ttsEnabled}
                  label="Реф Qwen Base · ~3 с"
                  onPath={(qwenRefPath) => onVoice({ ...voice, qwenRefPath })}
                  onHint={setHint}
                />
                <label className="brain-field">
                  <span className="field__label">Текст в клипе Qwen (ref_text)</span>
                  <textarea
                    rows={2}
                    value={voice.qwenPromptText}
                    disabled={!voice.ttsEnabled}
                    onChange={(e) =>
                      onVoice(
                        setMistressQwenPrompt(voice, mistress.id, {
                          qwenPromptText: e.target.value,
                        }),
                      )
                    }
                    placeholder="Дословная расшифровка короткой фразы…"
                  />
                </label>
              </>
            )}
            <div className="brain-panel__links">
              <button
                type="button"
                className="brain-act"
                disabled={!canManageQwen || busy || !voice.ttsEnabled}
                onClick={() => void startQwen()}
              >
                старт
              </button>
              <button
                type="button"
                className="brain-act"
                disabled={!canManageQwen || busy}
                onClick={() => void stopQwen()}
              >
                стоп
              </button>
              <button
                type="button"
                className="brain-act"
                disabled={!desktop || busy}
                onClick={() => void checkQwen()}
              >
                проверить
              </button>
            </div>
            <p className="brain-panel__hint">
              CustomVoice говорит по-русски без рефа. Веса — вкладка «ИИ
              ресурсы».
            </p>
          </>
        ) : null}

        {voice.ttsProvider === "edge" ? (
          <>
            <h3 className="brain-panel__h">Edge</h3>
            <label className="brain-field">
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
          </>
        ) : null}

        {voice.ttsProvider === "system" ? (
          <>
            <h3 className="brain-panel__h">Windows</h3>
            <label className="brain-field">
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
          </>
        ) : null}

        {voice.ttsProvider === "piper" ? (
          <>
            <h3 className="brain-panel__h">Piper</h3>
            <p className="brain-panel__hint">
              {piperReady
                ? "Piper · Irina готов, сервер не нужен."
                : "Скачай Piper во вкладке «ИИ ресурсы». Сервер не нужен."}
            </p>
          </>
        ) : null}

        <label className="brain-field">
          <span>
            Громкость · {mistress.displayNameRu} ·{" "}
            {Math.round(voice.ttsVolume * 100)}%
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

        <label className="brain-field">
          <span>
            Скорость · {mistress.displayNameRu} · {voice.ttsRate.toFixed(2)}
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

        <label className="brain-field">
          <span>
            Тон · {mistress.displayNameRu} · {voice.ttsPitch.toFixed(2)}
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

      <h3 className="brain-panel__h">Пробы</h3>
      {isQwenTtsProvider(voice.ttsProvider) ? (
        <p className="brain-panel__hint">
          {voice.ttsProvider === "qwen-cpu"
            ? "Синтез в оперативке, без CUDA. Медленнее GPU, зато видеокарта свободна для Ollama."
            : "После статуса «онлайн» модель уже прогрета. Проба покажет время генерации, длину аудио и скорость realtime."}
        </p>
      ) : null}
      <div className="brain-emo">
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
            className="brain-act"
            disabled={!voice.ttsEnabled || busy}
            onClick={() => void test(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {hint ? <p className="brain-panel__log">{hint}</p> : null}
    </div>
  );
}
