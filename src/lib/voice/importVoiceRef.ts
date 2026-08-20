import { audioBufferToVoiceRefWav, u8ToBase64 } from "./voiceRefWav";
import { maxSecondsForVoiceRef } from "../voiceRefPath";

export type VoiceRefImportResult = {
  relPath: string;
  seconds: number;
  sourcePath: string;
};

function desktopTts() {
  return window.joiDesktop?.tts;
}

export async function showVoiceRefFolder(relPath: string): Promise<string> {
  const api = desktopTts();
  if (!api?.voiceRefShow) {
    throw new Error("Папка рефа — только в окне приложения (Запуск.bat)");
  }
  const st = await api.voiceRefShow(relPath);
  if (!st.ok) throw new Error(st.detail || "не удалось открыть проводник");
  return st.path || relPath;
}

export async function statVoiceRefFile(relPath: string): Promise<{
  exists: boolean;
  bytes?: number;
}> {
  const api = desktopTts();
  if (!api?.voiceRefStat) return { exists: false };
  const st = await api.voiceRefStat(relPath);
  return { exists: Boolean(st.exists), bytes: st.bytes };
}

export async function importVoiceRefFromDialog(
  destRel: string,
): Promise<VoiceRefImportResult | null> {
  const api = desktopTts();
  if (!api?.voiceRefPick || !api.voiceRefWrite) {
    throw new Error("Импорт рефа — только в окне приложения (Запуск.bat)");
  }
  const picked = await api.voiceRefPick();
  if (picked.canceled) return null;
  if (!picked.ok || !picked.bytesBase64) {
    throw new Error(picked.detail || "не удалось прочитать файл");
  }
  const bin = atob(picked.bytesBase64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const copy = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  );
  if (!window.AudioContext) {
    throw new Error("нет Web Audio для конвертации ogg → wav");
  }
  const ctx = new AudioContext();
  let decoded: AudioBuffer;
  try {
    decoded = await ctx.decodeAudioData(copy);
  } catch {
    throw new Error(
      "Не удалось прочитать аудио (ogg/mp3/wav). Файл битый или кодек не тот.",
    );
  } finally {
    void ctx.close();
  }
  const { wav, seconds } = audioBufferToVoiceRefWav(decoded, {
    maxSeconds: maxSecondsForVoiceRef(destRel),
  });
  const written = await api.voiceRefWrite({
    destRel,
    wavBase64: u8ToBase64(wav),
  });
  if (!written.ok || !written.relPath) {
    throw new Error(written.detail || "не удалось сохранить ref.wav");
  }
  return {
    relPath: written.relPath,
    seconds,
    sourcePath: picked.sourcePath || "",
  };
}
