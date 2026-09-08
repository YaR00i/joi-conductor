/**
 * App-boot Ollama: install the zip if needed, serve, optionally pull a tag.
 */
import {
  fetchOllamaStatus,
  pullOllamaModel,
  startOllama,
  type OllamaStatus,
} from "../ollamaClient";

export type OllamaAutoStartResult = {
  status: OllamaStatus;
  skipped: boolean;
};

let inFlight: Promise<OllamaAutoStartResult | null> | null = null;
let startedOnce = false;

export async function ensureOllamaAutoStart(opts: {
  autoStart: boolean;
  model: string;
  pullModel: boolean;
}): Promise<OllamaAutoStartResult | null> {
  if (!opts.autoStart) return null;
  if (typeof window === "undefined" || !window.joiDesktop?.ollama) return null;

  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      const cur = await fetchOllamaStatus(opts.model);
      if (cur.running && (!opts.pullModel || cur.modelReady)) {
        startedOnce = true;
        return { status: cur, skipped: true };
      }
      if (startedOnce && cur.running) {
        return { status: cur, skipped: true };
      }
      startedOnce = true;
      let next = cur.running ? cur : await startOllama(opts.model);
      if (opts.pullModel && !next.modelReady && opts.model.trim()) {
        next = await pullOllamaModel(opts.model);
      }
      return { status: next, skipped: false };
    } catch (err) {
      startedOnce = false;
      throw err;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

export function resetOllamaAutoStartGate(): void {
  startedOnce = false;
  inFlight = null;
}
