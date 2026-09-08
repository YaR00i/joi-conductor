import type { RuntimeBootstrapJob, RuntimeBootstrapSnapshot } from "./runtimeBootstrap";
import { planOptionalRuntimeBootstrapJobs } from "./runtimeBootstrap";

export const RUNTIME_OPTIONALS_STORAGE_KEY = "joi-runtime-optionals-v1";

export type RuntimeOptionalId = "ollama" | "ollama-model";

export type RuntimeOptionalOffer = {
  id: RuntimeOptionalId;
  titleRu: string;
  hintRu: string;
  defaultOn: boolean;
};

type Stored = { dismissed?: boolean };

export function loadOptionalOffersDismissed(): boolean {
  try {
    const raw = localStorage.getItem(RUNTIME_OPTIONALS_STORAGE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as Stored;
    return parsed.dismissed === true;
  } catch {
    return false;
  }
}

export function saveOptionalOffersDismissed(): void {
  localStorage.setItem(
    RUNTIME_OPTIONALS_STORAGE_KEY,
    JSON.stringify({ dismissed: true } satisfies Stored),
  );
}

export function planOptionalRuntimeOffers(
  snap: RuntimeBootstrapSnapshot,
): RuntimeOptionalOffer[] {
  const jobs = planOptionalRuntimeBootstrapJobs(snap);
  const out: RuntimeOptionalOffer[] = [];
  if (jobs.includes("ollama")) {
    out.push({
      id: "ollama",
      titleRu: "Ollama — программа ИИ",
      hintRu: "Нужна для чата и живых реплик. ~1 ГБ, качается с GitHub.",
      defaultOn: true,
    });
  }
  if (jobs.includes("ollama-model")) {
    const tag = snap.ollamaModel.trim() || "llama3.2";
    out.push({
      id: "ollama-model",
      titleRu: `Модель ${tag}`,
      hintRu: "Чтобы чат мог отвечать сразу. Ещё ~2 ГБ. Без неё ИИ можно скачать позже во вкладке «ИИ ресурсы».",
      defaultOn: true,
    });
  }
  return out;
}

export function optionalJobsFromSelection(
  selected: readonly RuntimeOptionalId[],
): RuntimeBootstrapJob[] {
  const set = new Set(selected);
  const jobs: RuntimeBootstrapJob[] = [];
  if (set.has("ollama") || set.has("ollama-model")) jobs.push("ollama");
  if (set.has("ollama-model")) jobs.push("ollama-model");
  return jobs;
}
