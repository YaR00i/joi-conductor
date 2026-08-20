import type { Emotion } from "../types";
import {
  DEFAULT_QWEN_VOICE,
  QWEN_TTS_CUSTOM_VOICE_ID,
} from "../qwenTtsCatalog";

export type TtsProvider =
  | "auto"
  | "sovits"
  | "qwen"
  | "qwen-cpu"
  | "piper"
  | "edge"
  | "system";

export type TtsOptions = {
  enabled: boolean;
  provider: TtsProvider;
  rate: number;
  volume: number;
  pitch: number;
  edgeVoice: string;
  voiceURI: string;
  sovitsUrl: string;
  sovitsRefPath: string;
  sovitsPromptText: string;
  sovitsPromptLang: string;
  sovitsTextLang: string;
  qwenRefPath: string;
  qwenPromptText: string;
  qwenUrl: string;
  qwenModel: string;
  qwenVoice: string;
  qwenApiKey: string;
};

const DEFAULTS: TtsOptions = {
  enabled: true,
  provider: "sovits",
  rate: 1.05,
  volume: 1,
  pitch: 1.12,
  edgeVoice: "ru-RU-DariyaNeural",
  voiceURI: "",
  sovitsUrl: "http://127.0.0.1:9880",
  sovitsRefPath: "voice-refs/hu-tao/sovits-ref.wav",
  sovitsPromptText: "",
  sovitsPromptLang: "en",
  sovitsTextLang: "en",
  qwenRefPath: "voice-refs/hu-tao/ref.wav",
  qwenPromptText:
    'Hu as in "Who put me in this coffin?" and Tao as in "I can\'t geT OUt!" Hehe... No, not funny?',
  qwenUrl: "http://127.0.0.1:8000/v1",
  qwenModel: QWEN_TTS_CUSTOM_VOICE_ID,
  qwenVoice: DEFAULT_QWEN_VOICE,
  qwenApiKey: "",
};

export const EDGE_VOICE_FALLBACK = [
  {
    id: "ru-RU-DariyaNeural",
    nameRu: "Дарья · Neural",
    gender: "female",
    hint: "Microsoft, нужен интернет",
  },
  {
    id: "ru-RU-SvetlanaNeural",
    nameRu: "Светлана · Neural",
    gender: "female",
    hint: "Microsoft, мягче",
  },
];

export const PIPER_VOICE_FALLBACK = [
  {
    id: "ru_RU-irina-medium",
    nameRu: "Ирина · Piper",
    gender: "female",
    hint: "локально, офлайн",
  },
];

export function textForSpeech(raw: string): string {
  return raw
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function pickRussianVoice(
  voices: SpeechSynthesisVoice[],
  preferredURI: string,
): SpeechSynthesisVoice | null {
  if (preferredURI) {
    const exact = voices.find((v) => v.voiceURI === preferredURI);
    if (exact) return exact;
  }
  const ru = voices.filter(
    (v) =>
      v.lang.toLowerCase().startsWith("ru") ||
      /russian|русск/i.test(v.name),
  );
  if (ru.length === 0) return voices[0] ?? null;
  const female = ru.find((v) =>
    /female|жен|irina|milena|elena|katya|anna|oksana|svetlana/i.test(
      `${v.name} ${v.voiceURI}`,
    ),
  );
  return female ?? ru[0] ?? null;
}

function rateForEmotion(base: number, emotion?: Emotion): number {
  switch (emotion) {
    case "intense":
      return Math.min(1.35, base * 1.08);
    case "strict":
      return Math.min(1.25, base * 1.02);
    case "soft":
      return Math.max(0.85, base * 0.92);
    case "amused":
    case "tease":
      return Math.min(1.3, base * 1.05);
    default:
      return base;
  }
}

function pitchForEmotion(base: number, emotion?: Emotion): number {
  switch (emotion) {
    case "intense":
      return Math.min(1.4, base * 1.05);
    case "strict":
      return Math.max(0.8, base * 0.92);
    case "soft":
      return Math.min(1.5, base * 1.08);
    case "tease":
    case "amused":
      return Math.min(1.55, base * 1.12);
    default:
      return base;
  }
}

function desktopTts() {
  return window.joiDesktop?.tts;
}

/**
 * TTS: auto (Piper offline / Edge online) → system Web Speech fallback.
 * Emotion maps to prosody (Edge) or Piper length/noise scales.
 */
export class SpeechTts {
  private opts: TtsOptions = { ...DEFAULTS };
  private voices: SpeechSynthesisVoice[] = [];
  private audio: HTMLAudioElement | null = null;
  private objectUrl: string | null = null;
  private generation = 0;
  private lastError: string | null = null;
  private lastEngine: string | null = null;
  private draining = false;
  private queued: {
    text: string;
    emotion: Emotion | undefined;
    resolve: (value: {
      ok: boolean;
      engine: string | null;
      error: string | null;
    }) => void;
    gen: number;
  } | null = null;

  constructor() {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    const load = () => {
      this.voices = window.speechSynthesis.getVoices();
    };
    load();
    window.speechSynthesis.addEventListener("voiceschanged", load);
  }

  configure(partial: Partial<TtsOptions>): void {
    this.opts = { ...this.opts, ...partial };
  }

  getLastError(): string | null {
    return this.lastError;
  }

  getLastEngine(): string | null {
    return this.lastEngine;
  }

  isSupported(): boolean {
    return Boolean(desktopTts()?.speak) || Boolean(window.speechSynthesis);
  }

  listVoices(): SpeechSynthesisVoice[] {
    if (typeof window === "undefined" || !window.speechSynthesis) return [];
    this.voices = window.speechSynthesis.getVoices();
    return this.voices;
  }

  listRussianVoices(): SpeechSynthesisVoice[] {
    return this.listVoices().filter(
      (v) =>
        v.lang.toLowerCase().startsWith("ru") ||
        /russian|русск/i.test(v.name),
    );
  }

  async listCatalog() {
    try {
      const api = desktopTts();
      if (api?.voices) return api.voices();
    } catch {
      /* ignore */
    }
    return {
      edge: EDGE_VOICE_FALLBACK,
      piper: PIPER_VOICE_FALLBACK,
      piperStatus: {
        ready: false,
        exe: false,
        model: false,
        root: "",
        voice: "ru_RU-irina-medium",
      },
    };
  }

  stop(): void {
    this.generation += 1;
    if (this.queued) {
      this.queued.resolve({
        ok: false,
        engine: null,
        error: "cancelled",
      });
      this.queued = null;
    }
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    if (this.audio) {
      this.audio.pause();
      this.audio.src = "";
      this.audio = null;
    }
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
    void desktopTts()?.stop?.();
  }

  speak(text: string, emotion?: Emotion): boolean {
    if (!this.opts.enabled) return false;
    const clean = textForSpeech(text);
    if (!clean) return false;
    void this.speakUntilDone(clean, emotion);
    return true;
  }

  /**
   * Speak one line. Concurrent calls barge-in: previous audio is stopped and
   * only the latest pending line is kept (no overlapping host PlaySync).
   */
  async speakUntilDone(
    text: string,
    emotion?: Emotion,
  ): Promise<{ ok: boolean; engine: string | null; error: string | null }> {
    if (!this.opts.enabled) {
      return { ok: false, engine: null, error: "TTS выключен" };
    }
    const clean = textForSpeech(text);
    if (!clean) {
      return { ok: false, engine: null, error: "Пустой текст" };
    }

    return new Promise((resolve) => {
      this.generation += 1;
      const gen = this.generation;
      this.lastError = null;
      if (typeof window !== "undefined" && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      if (this.audio) {
        this.audio.pause();
        this.audio.src = "";
        this.audio = null;
      }
      void desktopTts()?.stop?.();

      if (this.queued) {
        this.queued.resolve({
          ok: false,
          engine: null,
          error: "superseded",
        });
      }
      this.queued = { text: clean, emotion, resolve, gen };
      void this.drainSpeakQueue();
    });
  }

  private async drainSpeakQueue(): Promise<void> {
    if (this.draining) return;
    this.draining = true;
    try {
      while (this.queued) {
        const job = this.queued;
        this.queued = null;
        if (job.gen !== this.generation) {
          job.resolve({
            ok: false,
            engine: null,
            error: "cancelled",
          });
          continue;
        }
        await this.speakAsync(job.text, job.emotion, job.gen);
        job.resolve({
          ok: !this.lastError && job.gen === this.generation,
          engine: this.lastEngine,
          error: this.lastError,
        });
      }
    } finally {
      this.draining = false;
      if (this.queued) void this.drainSpeakQueue();
    }
  }

  /** Speak and resolve when synthesis/playback call returns (may be before audio ends on some paths). */
  async speakAndWait(
    text: string,
    emotion?: Emotion,
  ): Promise<{ ok: boolean; engine: string | null; error: string | null }> {
    return this.speakUntilDone(text, emotion);
  }

  private async speakAsync(
    clean: string,
    emotion: Emotion | undefined,
    gen: number,
  ): Promise<void> {
    const provider = this.opts.provider;
    if (provider !== "system" && desktopTts()?.speak) {
      try {
        await this.speakNeural(clean, emotion, gen);
        return;
      } catch (err) {
        this.lastError =
          err instanceof Error ? err.message : "Neural TTS ошибка";
        if (gen !== this.generation) return;
      }
    }
    if (gen !== this.generation) return;
    this.lastEngine = "system";
    await this.speakSystem(clean, emotion);
  }

  private async speakNeural(
    clean: string,
    emotion: Emotion | undefined,
    gen: number,
  ): Promise<void> {
    const api = desktopTts();
    if (!api) throw new Error("Нейро-TTS только в Electron (Запуск.bat)");

    if (window.speechSynthesis) window.speechSynthesis.cancel();

    const provider =
      this.opts.provider === "system"
        ? "auto"
        : this.opts.provider === "auto"
          ? "auto"
          : this.opts.provider;

    const result = await api.speak({
      text: clean,
      provider:
        provider === "edge" ||
        provider === "piper" ||
        provider === "sovits" ||
        provider === "qwen" ||
        provider === "qwen-cpu"
          ? provider
          : "auto",
      voice: this.opts.edgeVoice,
      emotion: emotion ?? "tease",
      rate: this.opts.rate,
      pitch: this.opts.pitch,
      volume: this.opts.volume,
      sovitsUrl: this.opts.sovitsUrl,
      refAudioPath: this.opts.sovitsRefPath,
      promptText: this.opts.sovitsPromptText,
      promptLang: this.opts.sovitsPromptLang || "en",
      textLang: this.opts.sovitsTextLang || "en",
      qwenUrl: this.opts.qwenUrl,
      qwenModel: this.opts.qwenModel,
      qwenVoice: this.opts.qwenVoice,
      qwenApiKey: this.opts.qwenApiKey,
      qwenRefPath: this.opts.qwenRefPath,
      qwenPromptText: this.opts.qwenPromptText,
    });

    if (gen !== this.generation) return;
    this.lastEngine = result.engine ?? "neural";

    // Prefer OS-level playback from main (Electron <audio> often silent).
    // Host PlaySync blocks until audio finishes — speakUntilDone can await this.
    if (result.playedOnHost) {
      return;
    }

    const bin = atob(result.base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const blob = new Blob([bytes], {
      type: result.mime || "audio/wav",
    });

    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
    this.objectUrl = URL.createObjectURL(blob);
    if (this.audio) this.audio.pause();
    const audio = new Audio(this.objectUrl);
    // HTMLAudioElement caps at 1; host PlaySync can boost above 1 via WAV gain.
    audio.volume = Math.max(0, Math.min(1, this.opts.volume ?? 1));
    this.audio = audio;
    try {
      await audio.play();
      if (gen !== this.generation) return;
      await new Promise<void>((resolve) => {
        const done = () => {
          audio.removeEventListener("ended", done);
          audio.removeEventListener("error", done);
          resolve();
        };
        audio.addEventListener("ended", done);
        audio.addEventListener("error", done);
        // If stop() bumped generation, bail soon.
        const poll = window.setInterval(() => {
          if (gen !== this.generation) {
            window.clearInterval(poll);
            done();
          }
        }, 120);
        audio.addEventListener(
          "ended",
          () => window.clearInterval(poll),
          { once: true },
        );
      });
    } catch (err) {
      this.lastError =
        err instanceof Error
          ? `Не удалось воспроизвести: ${err.message}`
          : "Не удалось воспроизвести аудио";
      // Synthesis ok; playback failed — don't fall back to system TTS.
    }
  }

  private speakSystem(clean: string, emotion?: Emotion): Promise<boolean> {
    if (!window.speechSynthesis) return Promise.resolve(false);
    window.speechSynthesis.cancel();
    if (this.audio) {
      this.audio.pause();
      this.audio = null;
    }
    const utter = new SpeechSynthesisUtterance(clean);
    utter.lang = "ru-RU";
    utter.rate = rateForEmotion(this.opts.rate, emotion);
    utter.pitch = pitchForEmotion(this.opts.pitch, emotion);
    const voice = pickRussianVoice(this.listVoices(), this.opts.voiceURI);
    if (voice) {
      utter.voice = voice;
      utter.lang = voice.lang || "ru-RU";
    }
    return new Promise((resolve) => {
      utter.onend = () => resolve(true);
      utter.onerror = () => resolve(false);
      window.speechSynthesis.speak(utter);
    });
  }

  test(
    sample = "Ну что, глупыш… сегодня ты мой. Слушай внимательно — и дрожи.",
    emotion: Emotion = "tease",
  ): boolean {
    return this.speak(sample, emotion);
  }

  testAsync(
    sample = "Ну что, глупыш… сегодня ты мой. Слушай внимательно — и дрожи.",
    emotion: Emotion = "tease",
  ) {
    return this.speakAndWait(sample, emotion);
  }
}
