import { wantsQwenAutoStart, wantsSovitsAutoStart } from "./voice/ttsEngineAutoStart";

/**
 * First-launch jobs for a fresh PC: missing runtimes download via existing
 * Electron installers. Required jobs run immediately; Ollama is offered after.
 */
export const RUNTIME_BOOTSTRAP_JOBS = [
  "python",
  "piper",
  "censor",
  "ollama",
  "ollama-model",
  "wd14",
  "sovits",
  "qwen",
] as const;

export type RuntimeBootstrapJob = (typeof RUNTIME_BOOTSTRAP_JOBS)[number];

export type RuntimeBootstrapSnapshot = {
  desktop: boolean;
  ttsEnabled: boolean;
  ttsProvider: string;
  autoStartOllama: boolean;
  autoStartSovits: boolean;
  autoStartQwen: boolean;
  /** Pull the configured Ollama tag (chat + session LLM). */
  pullOllamaModel: boolean;
  ollamaModel: string;
  pythonReady: boolean;
  ollamaInstalled: boolean;
  ollamaRunning: boolean;
  ollamaModelReady: boolean;
  piperReady: boolean;
  censorReady: boolean;
  autoTagOnImport: boolean;
  wd14Online: boolean;
  wd14Installed: boolean;
  sovitsOnline: boolean;
  sovitsInstalled: boolean;
  qwenOnline: boolean;
  qwenWeightsReady: boolean;
};

export function wantsPiperBootstrap(opts: {
  ttsEnabled: boolean;
  ttsProvider: string;
}): boolean {
  if (!opts.ttsEnabled) return false;
  return opts.ttsProvider !== "edge" && opts.ttsProvider !== "system";
}

function wantsPythonBootstrap(snap: RuntimeBootstrapSnapshot): boolean {
  return (
    snap.autoTagOnImport ||
    wantsSovitsAutoStart(snap) ||
    wantsQwenAutoStart(snap)
  );
}

export function planRequiredRuntimeBootstrapJobs(
  snap: RuntimeBootstrapSnapshot,
): RuntimeBootstrapJob[] {
  if (!snap.desktop) return [];
  const jobs: RuntimeBootstrapJob[] = [];
  if (wantsPythonBootstrap(snap) && !snap.pythonReady) jobs.push("python");
  if (wantsPiperBootstrap(snap) && !snap.piperReady) jobs.push("piper");
  if (!snap.censorReady) jobs.push("censor");
  if (snap.autoTagOnImport && !snap.wd14Installed) jobs.push("wd14");
  if (wantsSovitsAutoStart(snap) && !snap.sovitsInstalled) jobs.push("sovits");
  if (wantsQwenAutoStart(snap) && !snap.qwenWeightsReady) jobs.push("qwen");
  return jobs;
}

/** SoVITS / WD14 / Qwen need the portable host Python. */
export function skipBootstrapJobAfterPythonFail(
  job: RuntimeBootstrapJob,
  pythonFailed: boolean,
): boolean {
  if (!pythonFailed) return false;
  switch (job) {
    case "wd14":
    case "sovits":
    case "qwen":
      return true;
    case "python":
    case "piper":
    case "censor":
    case "ollama":
    case "ollama-model":
      return false;
    default: {
      const _exhaustive: never = job;
      return _exhaustive;
    }
  }
}

export function planOptionalRuntimeBootstrapJobs(
  snap: RuntimeBootstrapSnapshot,
): RuntimeBootstrapJob[] {
  if (!snap.desktop) return [];
  const jobs: RuntimeBootstrapJob[] = [];
  if (!snap.ollamaInstalled) jobs.push("ollama");
  if (snap.pullOllamaModel && !snap.ollamaModelReady) jobs.push("ollama-model");
  return jobs;
}

/** @deprecated use planRequired / planOptional */
export function planRuntimeBootstrapJobs(
  snap: RuntimeBootstrapSnapshot,
): RuntimeBootstrapJob[] {
  return [
    ...planRequiredRuntimeBootstrapJobs(snap),
    ...planOptionalRuntimeBootstrapJobs(snap),
  ];
}

export function runtimeBootstrapJobLabelRu(job: RuntimeBootstrapJob): string {
  switch (job) {
    case "python":
      return "Python";
    case "piper":
      return "Piper · Irina";
    case "censor":
      return "Цензор нейросети";
    case "ollama":
      return "Ollama";
    case "ollama-model":
      return "Модель ИИ";
    case "wd14":
      return "Теги WD14";
    case "sovits":
      return "Голос GPT-SoVITS";
    case "qwen":
      return "Qwen TTS";
    default: {
      const _exhaustive: never = job;
      return _exhaustive;
    }
  }
}
