/**
 * Boot-time / Settings shared Qwen vLLM auto-start.
 */
import { inferQwenFlavor } from "../qwenTtsCatalog";
import {
  qwenDeviceMatches,
  qwenServeDevice,
} from "../voiceSettings";
import { wantsQwenAutoStart } from "./ttsEngineAutoStart";

export type QwenAutoStartResult = {
  online: boolean;
  detail: string;
  managedByApp?: boolean;
  skipped: boolean;
};

let inFlight: Promise<QwenAutoStartResult | null> | null = null;
let startedOnce = false;

export async function ensureQwenAutoStart(opts: {
  ttsEnabled: boolean;
  autoStartQwen: boolean;
  ttsProvider: string;
  qwenUrl: string;
  qwenModel: string;
  qwenFlavor?: string;
  qwenRefPath?: string;
  qwenPromptText?: string;
}): Promise<QwenAutoStartResult | null> {
  if (!wantsQwenAutoStart(opts)) return null;
  const api = window.joiDesktop?.tts;
  const start = api?.qwenStart;
  if (!start) return null;
  const device = qwenServeDevice(opts.ttsProvider);

  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      const cur = await api.qwenStatus?.({
        baseUrl: opts.qwenUrl,
        model: opts.qwenModel,
        flavor: opts.qwenFlavor,
        device,
      });
      const mismatch =
        Boolean(cur?.online) && !qwenDeviceMatches(cur?.device, device);
      if (cur?.online && !mismatch) {
        startedOnce = true;
        return {
          online: true,
          detail: cur.detail,
          managedByApp: Boolean(cur.managedByApp),
          skipped: true,
        };
      }
      if (startedOnce && !mismatch) {
        return {
          online: Boolean(cur?.online),
          detail: cur?.detail ?? "ожидание Qwen…",
          managedByApp: Boolean(cur?.managedByApp),
          skipped: true,
        };
      }
      const flavor = opts.qwenFlavor || inferQwenFlavor(opts.qwenModel);
      const inst = await api.qwenInstallStatus?.();
      if (inst && api.installQwenModel) {
        if (!inst.tokenizer) await api.installQwenModel("tokenizer");
        if (flavor === "base" && !inst.base) {
          await api.installQwenModel("base");
        } else if (flavor !== "base" && !inst.customVoice) {
          await api.installQwenModel("custom_voice");
        }
      }
      startedOnce = true;
      const st = await start({
        baseUrl: opts.qwenUrl,
        model: opts.qwenModel,
        flavor: opts.qwenFlavor,
        device,
        refAudio: opts.qwenRefPath,
        refText: opts.qwenPromptText,
      });
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

export function resetQwenAutoStartGate(): void {
  startedOnce = false;
  inFlight = null;
}
