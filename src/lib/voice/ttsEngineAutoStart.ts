import { isQwenTtsProvider } from "../voiceSettings";

export function wantsSovitsAutoStart(opts: {
  ttsEnabled: boolean;
  autoStartSovits: boolean;
  ttsProvider: string;
}): boolean {
  if (!opts.ttsEnabled || !opts.autoStartSovits) return false;
  return opts.ttsProvider === "sovits" || opts.ttsProvider === "auto";
}

export function wantsQwenAutoStart(opts: {
  ttsEnabled: boolean;
  autoStartQwen: boolean;
  ttsProvider: string;
}): boolean {
  if (!opts.ttsEnabled || !opts.autoStartQwen) return false;
  return isQwenTtsProvider(opts.ttsProvider);
}
