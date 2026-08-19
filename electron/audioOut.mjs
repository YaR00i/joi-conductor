/**
 * Play PCM WAV on the host OS (Electron renderer audio is often silent/muted).
 * Only one SoundPlayer at a time — new play / stopHostAudio kills the previous.
 */
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, unlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

/** @type {import('node:child_process').ChildProcess | null} */
let currentPlayer = null;
let playEpoch = 0;

/**
 * Scale 16-bit PCM samples inside a RIFF WAV (copy).
 * @param {Buffer} wavBuf
 * @param {number} volume 0..2 (above 1 boosts quiet refs, hard-clipped)
 */
export function applyWavVolume(wavBuf, volume = 1) {
  const gain = Math.max(0, Math.min(2, Number(volume) || 0));
  if (!Buffer.isBuffer(wavBuf) || wavBuf.length < 44) return wavBuf;
  if (wavBuf.subarray(0, 4).toString("ascii") !== "RIFF") return wavBuf;
  if (gain >= 0.999 && gain <= 1.001) return wavBuf;

  const out = Buffer.from(wavBuf);
  let dataOffset = 44;
  for (let i = 12; i + 8 < out.length; i++) {
    if (
      out[i] === 0x64 &&
      out[i + 1] === 0x61 &&
      out[i + 2] === 0x74 &&
      out[i + 3] === 0x61
    ) {
      dataOffset = i + 8;
      break;
    }
  }
  for (let i = dataOffset; i + 1 < out.length; i += 2) {
    const sample = out.readInt16LE(i);
    const scaled = Math.max(-32768, Math.min(32767, Math.round(sample * gain)));
    out.writeInt16LE(scaled, i);
  }
  return out;
}

export function stopHostAudio() {
  playEpoch += 1;
  if (currentPlayer) {
    try {
      currentPlayer.kill();
    } catch {
      /* ignore */
    }
    currentPlayer = null;
  }
}

/**
 * @param {Buffer} wavBuf
 * @param {{ volume?: number }} [opts]
 * @returns {Promise<{ played: boolean; detail: string }>}
 */
export async function playWavOnHost(wavBuf, opts = {}) {
  if (!Buffer.isBuffer(wavBuf) || wavBuf.length < 44) {
    return { played: false, detail: "пустой/битый wav" };
  }
  const head = wavBuf.subarray(0, 4).toString("ascii");
  if (head !== "RIFF") {
    return { played: false, detail: `не RIFF (${head})` };
  }

  if (process.platform !== "win32") {
    return { played: false, detail: "host-play только Windows" };
  }

  const volume =
    typeof opts.volume === "number" && Number.isFinite(opts.volume)
      ? opts.volume
      : 1;
  if (volume <= 0.001) {
    return { played: true, detail: "громкость 0 · пропуск" };
  }

  // Barge-in: kill any in-flight SoundPlayer before starting a new one.
  stopHostAudio();
  const epoch = playEpoch;
  const playBuf = applyWavVolume(wavBuf, volume);

  const dir = await mkdtemp(path.join(tmpdir(), "joi-tts-"));
  const file = path.join(dir, "out.wav");
  try {
    if (epoch !== playEpoch) {
      return { played: false, detail: "отменено до старта" };
    }
    await writeFile(file, playBuf);
    const psFile = file.replace(/'/g, "''");
    const script = [
      `$p = New-Object System.Media.SoundPlayer -ArgumentList '${psFile}'`,
      "$p.Load()",
      "$p.PlaySync()",
    ].join("; ");

    await new Promise((resolve, reject) => {
      const child = spawn(
        "powershell.exe",
        [
          "-NoProfile",
          "-NonInteractive",
          "-ExecutionPolicy",
          "Bypass",
          "-Command",
          script,
        ],
        { windowsHide: true, stdio: "ignore" },
      );
      currentPlayer = child;
      child.on("error", (err) => {
        if (currentPlayer === child) currentPlayer = null;
        reject(err);
      });
      child.on("exit", (code) => {
        if (currentPlayer === child) currentPlayer = null;
        if (epoch !== playEpoch) {
          resolve();
          return;
        }
        if (code === 0 || code === null) resolve();
        else reject(new Error(`SoundPlayer exit ${code}`));
      });
    });
    if (epoch !== playEpoch) {
      return { played: false, detail: "прервано" };
    }
    return { played: true, detail: `Windows SoundPlayer · vol ${volume.toFixed(2)}` };
  } catch (err) {
    return {
      played: false,
      detail: err instanceof Error ? err.message : String(err),
    };
  } finally {
    await unlink(file).catch(() => {});
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
