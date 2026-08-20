export type OllamaStatus = {
  installed: boolean;
  running: boolean;
  ready: boolean;
  modelReady: boolean;
  models: string[];
  managedByApp: boolean;
  binaryPath: string | null;
  detail: string;
  baseUrl: string;
  version?: string | null;
};

export type OllamaPullProgress = {
  model: string;
  line: string;
  phase?: string;
  pct?: number;
};

function desktopApi() {
  return typeof window !== "undefined" ? window.joiDesktop : undefined;
}

async function browserProbe(preferredModel = ""): Promise<OllamaStatus> {
  try {
    const res = await fetch("/api/ollama/api/tags", {
      method: "GET",
      signal: AbortSignal.timeout
        ? AbortSignal.timeout(2500)
        : undefined,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as {
      models?: Array<{ name?: string }>;
    };
    const models = (data.models ?? [])
      .map((m) => m.name)
      .filter((n): n is string => typeof n === "string");

    let modelReady = true;
    let detail = `Готов · ${models.length} моделей`;
    if (preferredModel) {
      const want = preferredModel.split(":")[0] ?? preferredModel;
      modelReady = models.some((name) => {
        const base = name.split(":")[0] ?? name;
        return (
          name === preferredModel ||
          name.startsWith(`${preferredModel}:`) ||
          base === want
        );
      });
      detail = modelReady
        ? `Готов · модель ${preferredModel}`
        : `Сервер онлайн, модели «${preferredModel}» нет`;
    }

    return {
      installed: true,
      running: true,
      ready: preferredModel ? modelReady : true,
      modelReady,
      models,
      managedByApp: false,
      binaryPath: null,
      detail,
      baseUrl: "http://127.0.0.1:11434",
      version: null,
    };
  } catch {
    return {
      installed: false,
      running: false,
      ready: false,
      modelReady: false,
      models: [],
      managedByApp: false,
      binaryPath: null,
      detail:
        "Ollama недоступен. Запусти через Electron-окно или вручную (ollama serve).",
      baseUrl: "http://127.0.0.1:11434",
      version: null,
    };
  }
}

export function canManageOllama(): boolean {
  return Boolean(desktopApi()?.ollama);
}

export async function fetchOllamaStatus(
  preferredModel = "",
): Promise<OllamaStatus> {
  const api = desktopApi()?.ollama;
  if (api) return api.status(preferredModel);
  return browserProbe(preferredModel);
}

export async function startOllama(
  preferredModel = "",
): Promise<OllamaStatus> {
  const api = desktopApi()?.ollama;
  if (!api) {
    throw new Error("Запуск Ollama доступен только в окне приложения (Electron)");
  }
  return api.start(preferredModel);
}

export async function stopManagedOllama(): Promise<OllamaStatus & { stopped: boolean }> {
  const api = desktopApi()?.ollama;
  if (!api) {
    throw new Error("Стоп доступен только в окне приложения");
  }
  return api.stop();
}

export async function pullOllamaModel(model: string): Promise<OllamaStatus> {
  const api = desktopApi()?.ollama;
  if (!api) {
    throw new Error("Скачивание модели доступно только в окне приложения");
  }
  return api.pull(model);
}

export async function deleteOllamaModel(model: string): Promise<OllamaStatus> {
  const api = desktopApi()?.ollama;
  if (!api?.delete) {
    throw new Error("Удаление модели доступно только в окне приложения");
  }
  return api.delete(model);
}

export function onOllamaPullProgress(
  cb: (payload: OllamaPullProgress) => void,
): () => void {
  const api = desktopApi()?.ollama;
  if (!api?.onPullProgress) return () => undefined;
  return api.onPullProgress(cb);
}

export async function fetchOllamaLibraryHtml(query: string): Promise<string> {
  const q = query.trim().slice(0, 80);
  if (!q) return "";
  const api = desktopApi()?.ollama;
  if (api?.searchHtml) return api.searchHtml(q);
  const res = await fetch(
    `/api/ollama-hub/search?q=${encodeURIComponent(q)}`,
    { signal: AbortSignal.timeout ? AbortSignal.timeout(12000) : undefined },
  );
  if (!res.ok) throw new Error(`Библиотека Ollama HTTP ${res.status}`);
  return res.text();
}

export function ollamaStatusTone(
  status: OllamaStatus | null,
): "off" | "warn" | "ok" | "busy" {
  if (!status) return "busy";
  if (status.ready) return "ok";
  if (status.running && !status.modelReady) return "warn";
  if (status.managedByApp && !status.running) return "busy";
  return "off";
}
