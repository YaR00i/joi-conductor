import { inferQwenFlavor } from "./qwenTtsCatalog";
import { pullOllamaModel } from "./ollamaClient";
import {
  planRequiredRuntimeBootstrapJobs,
  runtimeBootstrapJobLabelRu,
  skipBootstrapJobAfterPythonFail,
  type RuntimeBootstrapJob,
  type RuntimeBootstrapSnapshot,
} from "./runtimeBootstrap";
import { startWd14Server } from "./wd14Tagger";
import { ensureOllamaAutoStart } from "./voice/ollamaAutoStart";
import { ensureQwenAutoStart } from "./voice/qwenAutoStart";
import { ensureSovitsAutoStart } from "./voice/sovitsAutoStart";
import type { VoiceSettings } from "./voiceSettings";

export type RuntimeBootstrapProgress = {
  job: RuntimeBootstrapJob | null;
  jobIndex: number;
  jobCount: number;
  phase: string;
  pct: number;
  detail: string;
  done: boolean;
  error: string | null;
};

export type RuntimeBootstrapOpts = {
  voice: VoiceSettings;
  autoTagOnImport: boolean;
  wd14Url: string;
  onProgress?: (p: RuntimeBootstrapProgress) => void;
  /** When set, run exactly these jobs (optional Ollama after the offer). */
  jobs?: RuntimeBootstrapJob[];
  stage?: "required" | "optional";
};

let inFlight: Promise<void> | null = null;
const progressListeners = new Set<
  NonNullable<RuntimeBootstrapOpts["onProgress"]>
>();

function emit(patch: RuntimeBootstrapProgress) {
  for (const cb of progressListeners) cb(patch);
}

/** Electron wraps main-process throws as "Error invoking remote method 'x': …". */
export function unwrapIpcError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const inner = raw.replace(/^Error invoking remote method '[^']+':\s*/u, "").trim();
  if (!inner || inner === "AggregateError") {
    return "Сеть не пускает. Перезапусти окно после починки интернета.";
  }
  return inner;
}

export async function collectRuntimeBootstrapSnapshot(opts: {
  voice: VoiceSettings;
  autoTagOnImport: boolean;
  wd14Url: string;
}): Promise<RuntimeBootstrapSnapshot> {
  const desktop = Boolean(window.joiDesktop?.isDesktop);
  const empty: RuntimeBootstrapSnapshot = {
    desktop,
    ttsEnabled: opts.voice.ttsEnabled,
    ttsProvider: opts.voice.ttsProvider,
    autoStartOllama: opts.voice.autoStartOllama,
    autoStartSovits: opts.voice.autoStartSovits,
    autoStartQwen: opts.voice.autoStartQwen,
    pullOllamaModel: Boolean(opts.voice.model.trim()),
    ollamaModel: opts.voice.model.trim(),
    pythonReady: true,
    ollamaInstalled: false,
    ollamaRunning: false,
    ollamaModelReady: false,
    piperReady: false,
    censorReady: false,
    autoTagOnImport: opts.autoTagOnImport,
    wd14Online: false,
    wd14Installed: false,
    sovitsOnline: false,
    sovitsInstalled: false,
    qwenOnline: false,
    qwenWeightsReady: false,
  };
  if (!desktop) return empty;

  const tts = window.joiDesktop?.tts;
  const media = window.joiDesktop?.media;
  const flavor = inferQwenFlavor(opts.voice.qwenModel);

  const [python, ollama, piper, censor, wd14, sovits, sovitsInst, qwen, qwenInst] =
    await Promise.all([
      window.joiDesktop?.python?.status().catch(() => null),
      window.joiDesktop?.ollama
        ?.status(opts.voice.model)
        .catch(() => null),
      tts?.piperStatus?.().catch(() => null),
      media?.censorDetectStatus?.().catch(() => null),
      media?.wd14Status?.({ baseUrl: opts.wd14Url }).catch(() => null),
      tts?.sovitsStatus?.({ baseUrl: opts.voice.sovitsUrl }).catch(() => null),
      tts?.sovitsInstallStatus?.().catch(() => null),
      tts
        ?.qwenStatus?.({
          baseUrl: opts.voice.qwenUrl,
          model: opts.voice.qwenModel,
        })
        .catch(() => null),
      tts?.qwenInstallStatus?.().catch(() => null),
    ]);

  return {
    ...empty,
    pythonReady:
      Boolean(python?.ready) || python?.supported === false,
    ollamaInstalled: Boolean(ollama?.installed),
    ollamaRunning: Boolean(ollama?.running),
    ollamaModelReady: Boolean(ollama?.modelReady),
    piperReady: Boolean(piper?.ready),
    censorReady: Boolean(censor?.ready),
    wd14Online: Boolean(wd14?.online),
    wd14Installed: Boolean(wd14?.modelsReady),
    sovitsOnline: Boolean(sovits?.online),
    sovitsInstalled: Boolean(sovitsInst?.ready),
    qwenOnline: Boolean(qwen?.online),
    qwenWeightsReady: Boolean(
      qwenInst?.tokenizer &&
        (flavor === "base" ? qwenInst.base : qwenInst.customVoice),
    ),
  };
}

async function runJob(
  job: RuntimeBootstrapJob,
  opts: RuntimeBootstrapOpts,
  onTick: (phase: string, pct: number, detail: string) => void,
): Promise<void> {
  const voice = opts.voice;
  const tts = window.joiDesktop?.tts;
  const media = window.joiDesktop?.media;
  switch (job) {
    case "python": {
      const api = window.joiDesktop?.python;
      if (!api?.install) return;
      const st = await api.status();
      if (st.ready || st.supported === false) return;
      onTick("Скачиваю Python", 1, "встроенный CPython 3.12");
      await api.install();
      return;
    }
    case "piper": {
      if (!tts?.installPiper) return;
      const st = await tts.piperStatus?.();
      if (st?.ready) return;
      onTick("Скачиваю Piper", 1, "бинарь и голос Irina");
      await tts.installPiper();
      return;
    }
    case "censor": {
      if (!media?.censorDetectInstall) return;
      const st = await media.censorDetectStatus?.();
      if (st?.ready) return;
      onTick("Скачиваю цензор", 1, "ONNX и onnxruntime");
      await media.censorDetectInstall();
      return;
    }
    case "ollama": {
      await ensureOllamaAutoStart({
        autoStart: true,
        model: voice.model,
        pullModel: false,
      });
      return;
    }
    case "ollama-model": {
      onTick("Качаю модель ИИ", 1, voice.model);
      await pullOllamaModel(voice.model);
      return;
    }
    case "wd14": {
      onTick("Среда WD14", 1, "venv и веса теггера");
      const st = await startWd14Server({ baseUrl: opts.wd14Url });
      if (!st.online) {
        throw new Error(st.detail || "WD14 не запустился");
      }
      return;
    }
    case "sovits": {
      await ensureSovitsAutoStart({
        ttsEnabled: voice.ttsEnabled,
        autoStartSovits: voice.autoStartSovits,
        ttsProvider: voice.ttsProvider,
        sovitsUrl: voice.sovitsUrl,
      });
      return;
    }
    case "qwen": {
      await ensureQwenAutoStart({
        ttsEnabled: voice.ttsEnabled,
        autoStartQwen: voice.autoStartQwen,
        ttsProvider: voice.ttsProvider,
        qwenUrl: voice.qwenUrl,
        qwenModel: voice.qwenModel,
      });
      return;
    }
    default: {
      const _exhaustive: never = job;
      return _exhaustive;
    }
  }
}

/**
 * Download and start missing first-run runtimes. Safe to call from App mount
 * and after settings toggles: overlapping calls share one in-flight run.
 */
export async function runRuntimeBootstrap(
  opts: RuntimeBootstrapOpts,
): Promise<void> {
  if (opts.onProgress) progressListeners.add(opts.onProgress);
  if (inFlight) return inFlight;
  inFlight = (async () => {
    const snap = await collectRuntimeBootstrapSnapshot(opts);
    const jobs =
      opts.jobs ??
      (opts.stage === "optional"
        ? []
        : planRequiredRuntimeBootstrapJobs(snap));
    if (jobs.length === 0) {
      emit({
        job: null,
        jobIndex: 0,
        jobCount: 0,
        phase: "",
        pct: 100,
        detail: "",
        done: true,
        error: null,
      });
      return;
    }

    const errors: string[] = [];
    let pythonFailed = false;
    let active = 0;
    const unbind = bindRuntimeBootstrapProgress((phase, pct, detail) => {
      const job = jobs[active];
      if (!job) return;
      emit({
        job,
        jobIndex: active,
        jobCount: jobs.length,
        phase,
        pct: Math.round(((active + pct / 100) / jobs.length) * 100),
        detail,
        done: false,
        error: null,
      });
    });
    try {
      for (let i = 0; i < jobs.length; i++) {
        active = i;
        const job = jobs[i];
        if (skipBootstrapJobAfterPythonFail(job, pythonFailed)) continue;
        const label = runtimeBootstrapJobLabelRu(job);
        emit({
          job,
          jobIndex: i,
          jobCount: jobs.length,
          phase: label,
          pct: Math.round((i / jobs.length) * 100),
          detail: "проверяю…",
          done: false,
          error: null,
        });
        try {
          await runJob(job, opts, (phase, pct, detail) => {
            emit({
              job,
              jobIndex: i,
              jobCount: jobs.length,
              phase,
              pct: Math.round(((i + pct / 100) / jobs.length) * 100),
              detail,
              done: false,
              error: null,
            });
          });
        } catch (err) {
          const msg = unwrapIpcError(err);
          errors.push(`${label}: ${msg}`);
          if (job === "python") pythonFailed = true;
        }
      }
    } finally {
      unbind();
    }

    emit({
      job: null,
      jobIndex: jobs.length,
      jobCount: jobs.length,
      phase: errors.length ? "Часть сред не встала" : "Среды готовы",
      pct: 100,
      detail: errors[0] ?? "",
      done: true,
      error: errors.length ? errors.join(" · ") : null,
    });
  })().finally(() => {
    inFlight = null;
    progressListeners.clear();
  });

  return inFlight;
}

export function bindRuntimeBootstrapProgress(
  onTick: (phase: string, pct: number, detail: string) => void,
): () => void {
  const tts = window.joiDesktop?.tts;
  const media = window.joiDesktop?.media;
  const ollama = window.joiDesktop?.ollama;
  const python = window.joiDesktop?.python;
  const offs: Array<() => void> = [];
  if (python?.onInstallProgress) {
    offs.push(
      python.onInstallProgress((p) =>
        onTick(p.phase || "Python", p.pct ?? 0, p.detail || ""),
      ),
    );
  }
  if (tts?.onPiperProgress) {
    offs.push(
      tts.onPiperProgress((p) =>
        onTick(p.phase || "Piper", p.pct ?? 0, ""),
      ),
    );
  }
  if (tts?.onSovitsInstallProgress) {
    offs.push(
      tts.onSovitsInstallProgress((p) =>
        onTick(
          p.phase || "SoVITS",
          p.pct ?? 0,
          p.detail || p.line || "",
        ),
      ),
    );
  }
  if (tts?.onQwenInstallProgress) {
    offs.push(
      tts.onQwenInstallProgress((p) =>
        onTick(p.phase || "Qwen", p.pct ?? 0, p.detail || p.line || ""),
      ),
    );
  }
  if (media?.onCensorDetectProgress) {
    offs.push(
      media.onCensorDetectProgress((p) =>
        onTick(p.phase || "Цензор", p.pct ?? 0, ""),
      ),
    );
  }
  if (media?.onWd14Progress) {
    offs.push(
      media.onWd14Progress((p) =>
        onTick(p.phase || "WD14", p.pct ?? 0, p.detail || ""),
      ),
    );
  }
  if (ollama?.onPullProgress) {
    offs.push(
      ollama.onPullProgress((p) =>
        onTick(p.phase || "Ollama", p.pct ?? 0, p.line || p.model || ""),
      ),
    );
  }
  return () => {
    for (const off of offs) off();
  };
}
