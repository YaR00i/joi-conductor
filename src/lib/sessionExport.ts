import type { Block, SessionEvent, SessionParams, SessionState } from "./types";
import type { VoiceSettings } from "./voiceSettings";

export interface SessionExportPayload {
  version: 1;
  exportedAt: string;
  seed?: number;
  presetId?: string | null;
  voice?: Pick<VoiceSettings, "mode" | "model" | "endpoint">;
  params: SessionParams;
  queue: Block[];
  state: SessionState | null;
  events: SessionEvent[];
}

export function buildSessionExport(input: {
  params: SessionParams;
  queue: Block[];
  state: SessionState | null;
  seed?: number;
  events: SessionEvent[];
  presetId?: string | null;
  voice?: VoiceSettings;
}): SessionExportPayload {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    seed: input.seed ?? input.state?.seed,
    presetId: input.presetId ?? null,
    voice: input.voice
      ? {
          mode: input.voice.mode,
          model: input.voice.model,
          endpoint: input.voice.endpoint,
        }
      : undefined,
    params: input.params,
    queue: input.queue,
    state: input.state,
    events: input.events,
  };
}

/** Download session snapshot as JSON (Phase 1 dump; IndexedDB later). */
export function downloadSessionJson(payload: SessionExportPayload): void {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = payload.exportedAt.replace(/[:.]/g, "-").slice(0, 19);
  a.href = url;
  a.download = `joi-session-${stamp}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
