import {
  VOICE_REF_MAX_SECONDS,
  VOICE_REF_SAMPLE_RATE,
} from "../voiceRefPath";

export type PcmAudioBuffer = {
  sampleRate: number;
  numberOfChannels: number;
  getChannelData: (channel: number) => Float32Array;
};

export function mixToMono(channels: Float32Array[]): Float32Array {
  if (channels.length === 0) return new Float32Array(0);
  if (channels.length === 1) return Float32Array.from(channels[0]);
  const n = channels[0].length;
  const out = new Float32Array(n);
  const denom = channels.length;
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (const ch of channels) sum += ch[i] ?? 0;
    out[i] = sum / denom;
  }
  return out;
}

export function resampleLinear(
  input: Float32Array,
  fromRate: number,
  toRate: number,
): Float32Array {
  if (input.length === 0) return new Float32Array(0);
  if (!Number.isFinite(fromRate) || fromRate <= 0) return Float32Array.from(input);
  if (!Number.isFinite(toRate) || toRate <= 0) return Float32Array.from(input);
  if (Math.abs(fromRate - toRate) < 0.5) return Float32Array.from(input);
  const outLen = Math.max(1, Math.round((input.length * toRate) / fromRate));
  const out = new Float32Array(outLen);
  const scale = (input.length - 1) / Math.max(1, outLen - 1);
  for (let i = 0; i < outLen; i++) {
    const src = i * scale;
    const i0 = Math.floor(src);
    const i1 = Math.min(input.length - 1, i0 + 1);
    const t = src - i0;
    out[i] = input[i0] * (1 - t) + input[i1] * t;
  }
  return out;
}

export function clipSeconds(
  samples: Float32Array,
  sampleRate: number,
  maxSeconds: number,
): Float32Array {
  const max = Math.max(1, Math.floor(sampleRate * maxSeconds));
  if (samples.length <= max) return samples;
  return samples.subarray(0, max);
}

export function peakNormalize(samples: Float32Array, peak = 0.89): Float32Array {
  let max = 0;
  for (let i = 0; i < samples.length; i++) {
    const a = samples[i] < 0 ? -samples[i] : samples[i];
    if (a > max) max = a;
  }
  if (max < 1e-6) return samples;
  const g = peak / max;
  if (g >= 0.99 && g <= 1.01) return samples;
  const out = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) out[i] = samples[i] * g;
  return out;
}

export function encodePcm16Wav(
  samples: Float32Array,
  sampleRate: number,
): Uint8Array {
  const n = samples.length;
  const dataSize = n * 2;
  const buf = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buf);
  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, dataSize, true);
  let o = 44;
  for (let i = 0; i < n; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    o += 2;
  }
  return new Uint8Array(buf);
}

export function audioBufferToVoiceRefWav(
  buf: PcmAudioBuffer,
  opts?: { sampleRate?: number; maxSeconds?: number },
): { wav: Uint8Array; seconds: number } {
  const targetRate = opts?.sampleRate ?? VOICE_REF_SAMPLE_RATE;
  const maxSeconds = opts?.maxSeconds ?? VOICE_REF_MAX_SECONDS;
  const channels: Float32Array[] = [];
  const chCount = Math.max(1, buf.numberOfChannels);
  for (let c = 0; c < chCount; c++) channels.push(buf.getChannelData(c));
  let mono = mixToMono(channels);
  mono = resampleLinear(mono, buf.sampleRate, targetRate);
  mono = clipSeconds(mono, targetRate, maxSeconds);
  mono = peakNormalize(mono);
  return {
    wav: encodePcm16Wav(mono, targetRate),
    seconds: mono.length / targetRate,
  };
}

export function u8ToBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}
