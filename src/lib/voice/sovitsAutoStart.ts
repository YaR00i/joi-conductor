/**
 * Boot-time / Settings shared GPT-SoVITS auto-start.
 * Prevents double spawn when App and Settings both try to start.
 */
import { wantsSovitsAutoStart } from "./ttsEngineAutoStart";

export type SovitsAutoStartResult = {
  online: boolean;
  detail: string;
  managedByApp?: boolean;
  /** Already online or another caller already kicked off start */
  skipped: boolean;
};

let inFlight: Promise<SovitsAutoStartResult | null> | null = null;
let startedOnce = false;

/**
 * Start GPT-SoVITS api_v2 when settings ask for it (Electron only).
 * Safe to call from App mount and from Settings — only one attempt.
 */
export async function ensureSovitsAutoStart(opts: {
  ttsEnabled: boolean;
  autoStartSovits: boolean;
  ttsProvider: string;
  sovitsUrl: string;
}): Promise<SovitsAutoStartResult | null> {
  if (!wantsSovitsAutoStart(opts)) return null;
  const api = window.joiDesktop?.tts;
  if (!api?.sovitsStart) return null;

  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      const cur = await api.sovitsStatus?.({ baseUrl: opts.sovitsUrl });
      if (cur?.online) {
        startedOnce = true;
        return {
          online: true,
          detail: cur.detail,
          managedByApp: Boolean(cur.managedByApp),
          skipped: true,
        };
      }
      if (startedOnce) {
        return {
          online: Boolean(cur?.online),
          detail: cur?.detail ?? "ожидание SoVITS…",
          managedByApp: Boolean(cur?.managedByApp),
          skipped: true,
        };
      }
      const installed = await api.sovitsInstallStatus?.();
      if (installed && !installed.ready && api.installSovits) {
        await api.installSovits();
      }
      startedOnce = true;
      const st = await api.sovitsStart({ baseUrl: opts.sovitsUrl });
      return {
        online: st.online,
        detail: st.detail,
        managedByApp: Boolean(st.managedByApp),
        skipped: false,
      };
    } catch (err) {
      startedOnce = false;
      throw err;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

/** Allow Settings start / toggle to try again after a failed boot start. */
export function resetSovitsAutoStartGate(): void {
  startedOnce = false;
  inFlight = null;
}
