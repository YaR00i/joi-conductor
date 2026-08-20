import { useEffect, useState } from "react";
import { getActiveMistress } from "../lib/mistress";
import type { MistressId } from "../lib/mistress/types";
import {
  EDGE_VOICE_FALLBACK,
  SpeechTts,
  type TtsProvider,
} from "../lib/voice/speechTts";
import type { VoiceSettings } from "../lib/voiceSettings";

type Props = {
  voice: VoiceSettings;
  onVoice: (next: VoiceSettings) => void;
  tts: SpeechTts;
};

type WizardStep = 1 | 2;

const STEPS: { id: WizardStep; label: string }[] = [
  { id: 1, label: "Озвучка" },
  { id: 2, label: "Клон" },
];

function sampleNameEn(id: MistressId): string {
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

/** Short RU test line for Edge / system — per active mistress. */
function testPhraseRu(id: MistressId, nameRu: string): string {
  switch (id) {
    case "hu_tao":
      return `Привет. Это ${nameRu}. Слышишь меня? Хорошо — тогда слушай внимательно.`;
    case "furina":
      return `Тишина в зале. Это ${nameRu}. Если слышишь — отвечай телом, не словами.`;
    case "sunna":
      return `Мягко… это ${nameRu}. Дыши и слушай — я рядом.`;
    case "sparkle":
      return `Хихи. ${nameRu} на связи! Слышишь? Тогда не зевай — играем.`;
    default: {
      const _exhaustive: never = id;
      return _exhaustive;
    }
  }
}

/** EN sample for SoVITS clone check. */
function testPhraseEn(id: MistressId): string {
  const name = sampleNameEn(id);
  switch (id) {
    case "hu_tao":
      return `Hello. It's ${name}. Can you hear me? Good — then listen carefully.`;
    case "furina":
      return `Silence in the court. This is ${name}. If you hear me — answer with your body.`;
    case "sunna":
      return `Softly… it's ${name}. Breathe and listen — I'm right here.`;
    case "sparkle":
      return `Hehe. ${name} here! Hear me? Don't zone out — let's play.`;
    default: {
      const _exhaustive: never = id;
      return _exhaustive;
    }
  }
}

function applyTtsConfig(tts: SpeechTts, voice: VoiceSettings, provider: TtsProvider) {
  tts.configure({
    enabled: true,
    provider,
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
  });
}

export function VoiceSetupWizard({ voice, onVoice, tts }: Props) {
  const mistress = getActiveMistress();
  const [step, setStep] = useState<WizardStep>(1);
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [edgeVoices, setEdgeVoices] = useState(EDGE_VOICE_FALLBACK);
  const [sysVoices, setSysVoices] = useState(() => tts.listRussianVoices());
  const desktop = Boolean(window.joiDesktop?.tts);
  const phraseRu = testPhraseRu(mistress.id, mistress.displayNameRu);
  const phraseEn = testPhraseEn(mistress.id);

  useEffect(() => {
    void tts.listCatalog().then((c) => {
      setEdgeVoices(c.edge?.length ? c.edge : EDGE_VOICE_FALLBACK);
    });
    const refresh = () => setSysVoices(tts.listRussianVoices());
    refresh();
    if (!window.speechSynthesis) return;
    window.speechSynthesis.addEventListener("voiceschanged", refresh);
    const id = window.setTimeout(refresh, 400);
    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", refresh);
      window.clearTimeout(id);
    };
  }, [tts]);

  async function playTest(provider: "edge" | "system" | "sovits") {
    setBusy(true);
    setHint(
      provider === "sovits"
        ? "Синтезирую клон… 5–20 с"
        : "Играю тестовую фразу…",
    );
    const nextVoice: VoiceSettings = {
      ...voice,
      ttsEnabled: true,
      ttsProvider: provider,
    };
    onVoice(nextVoice);
    applyTtsConfig(tts, nextVoice, provider);
    const sample = provider === "sovits" ? phraseEn : phraseRu;
    try {
      const res = await tts.testAsync(sample, "tease");
      if (res.ok) {
        setHint(
          `Играет · ${res.engine ?? provider}. Если тишина — громкость Windows / наушники.`,
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

  function pickQuickBackend(provider: "edge" | "system") {
    onVoice({
      ...voice,
      ttsEnabled: true,
      ttsProvider: provider,
    });
    setHint(
      provider === "edge"
        ? "Edge Neural — быстрый старт без GPU."
        : "Системный голос Windows — без сети и SoVITS.",
    );
  }

  return (
    <div className="voice-wizard">
      <div className="voice-wizard__head">
        <strong>Быстрая настройка голоса</strong>
        <span className="tts-panel__sub">
          Два шага для {mistress.displayNameRu}: простая озвучка → опционально
          клон SoVITS. Текст реплик (шаблоны / LLM) — вкладка «ИИ ресурсы».
        </span>
      </div>

      <ol className="voice-wizard__steps" aria-label="Шаги мастера">
        {STEPS.map((s) => (
          <li key={s.id}>
            <button
              type="button"
              className={`voice-wizard__step${
                step === s.id ? " is-active" : ""
              }${step > s.id ? " is-done" : ""}`}
              onClick={() => {
                setStep(s.id);
                setHint(null);
              }}
              aria-current={step === s.id ? "step" : undefined}
            >
              <span className="voice-wizard__num">{s.id}</span>
              {s.label}
            </button>
          </li>
        ))}
      </ol>

      {step === 1 ? (
        <div className="voice-wizard__body">
          <p className="voice-howto">
            <strong>Шаг 1.</strong> Выбери Edge или системный голос и проверь
            фразу для <em>{mistress.displayNameRu}</em>. SoVITS — на шаге 2.
          </p>
          <div className="voice-wizard__picks">
            <button
              type="button"
              className={`voice-wizard__pick${
                voice.ttsProvider === "edge" ? " is-selected" : ""
              }`}
              onClick={() => pickQuickBackend("edge")}
            >
              <strong>Edge Neural</strong>
              <span>Microsoft · без GPU · нужен интернет</span>
            </button>
            <button
              type="button"
              className={`voice-wizard__pick${
                voice.ttsProvider === "system" ? " is-selected" : ""
              }`}
              onClick={() => pickQuickBackend("system")}
            >
              <strong>Системный Windows</strong>
              <span>Встроенный TTS · офлайн</span>
            </button>
          </div>

          {voice.ttsProvider === "edge" ? (
            <div className="today__fields">
              <label className="field">
                <span className="field__label">Голос Edge</span>
                <select
                  value={voice.ttsEdgeVoice}
                  onChange={(e) =>
                    onVoice({
                      ...voice,
                      ttsEnabled: true,
                      ttsProvider: "edge",
                      ttsEdgeVoice: e.target.value,
                    })
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
            </div>
          ) : null}

          {voice.ttsProvider === "system" ? (
            <div className="today__fields">
              <label className="field">
                <span className="field__label">Голос ОС</span>
                <select
                  value={voice.ttsVoiceURI}
                  onChange={(e) =>
                    onVoice({
                      ...voice,
                      ttsEnabled: true,
                      ttsProvider: "system",
                      ttsVoiceURI: e.target.value,
                    })
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
            </div>
          ) : null}

          <p className="tts-panel__hint voice-wizard__phrase">
            Тест: «{phraseRu}»
          </p>

          <div className="today__actions">
            <button
              type="button"
              className="btn-primary"
              disabled={
                busy ||
                (voice.ttsProvider !== "edge" && voice.ttsProvider !== "system")
              }
              onClick={() =>
                void playTest(
                  voice.ttsProvider === "system" ? "system" : "edge",
                )
              }
            >
              Проиграть тест
            </button>
            <button
              type="button"
              className="btn-ghost"
              disabled={busy}
              onClick={() => {
                setStep(2);
                setHint(null);
              }}
            >
              Дальше · SoVITS
            </button>
            {!desktop && voice.ttsProvider === "edge" ? (
              <span className="tts-panel__sub">
                Edge лучше в Electron (Запуск.bat).
              </span>
            ) : null}
          </div>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="voice-wizard__body">
          <p className="voice-howto">
            Клон голоса через GPT-SoVITS. Нужен отдельный реф 4–10 с (не клип
            Qwen). Скачать стек — вкладка «ИИ ресурсы». Подробности:{" "}
            <code>docs/GPT_SOVITS_SETUP.md</code>.
          </p>
          <div className="today__fields">
            <label className="field">
              <span className="field__label">Референс wav</span>
              <span className="field__hint">
                Подставляется из профиля; править можно в полной панели ниже.
              </span>
              <input
                value={voice.sovitsRefPath}
                readOnly
                title={voice.sovitsRefPath}
              />
            </label>
            <label className="field">
              <span className="field__label">SoVITS API</span>
              <input
                value={voice.sovitsUrl}
                onChange={(e) =>
                  onVoice({ ...voice, sovitsUrl: e.target.value })
                }
                placeholder="http://127.0.0.1:9880"
              />
            </label>
          </div>
          <p className="tts-panel__hint voice-wizard__phrase">
            Тест (EN): «{phraseEn}»
          </p>
          <div className="today__actions">
            <button
              type="button"
              className="btn-ghost"
              disabled={busy}
              onClick={() => setStep(1)}
            >
              Назад
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={busy || !desktop}
              onClick={() => void playTest("sovits")}
            >
              Включить SoVITS + тест
            </button>
            <button
              type="button"
              className="btn-ghost"
              disabled={busy}
              onClick={() => {
                setHint(
                  "Готово. Edge/system достаточно для старта; SoVITS — когда клон настроен.",
                );
                setStep(1);
              }}
            >
              Пропустить · оставить Edge/system
            </button>
            {!desktop ? (
              <span className="tts-panel__sub">
                SoVITS только в Electron (Запуск.bat).
              </span>
            ) : null}
          </div>
        </div>
      ) : null}

      {hint ? (
        <p className={`voice-status ${busy ? "voice-status--busy" : ""}`}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}
