/**
 * Local Piper neural TTS (RU Irina) — works offline after one-time download.
 */
import { app } from "electron";
import { createWriteStream, existsSync, mkdirSync, promises as fs } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { pipeline } from "node:stream/promises";
import { createHash } from "node:crypto";
import https from "node:https";
import http from "node:http";

const PIPER_ZIP =
  "https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_windows_amd64.zip";
const MODEL_ONNX =
  "https://huggingface.co/rhasspy/piper-voices/resolve/main/ru/ru_RU/irina/medium/ru_RU-irina-medium.onnx";
const MODEL_JSON =
  "https://huggingface.co/rhasspy/piper-voices/resolve/main/ru/ru_RU/irina/medium/ru_RU-irina-medium.onnx.json";

export const PIPER_VOICES = [
  {
    id: "ru_RU-irina-medium",
    nameRu: "Ирина · Piper Neural",
    gender: "female",
    hint: "локально, офлайн, русский",
  },
];

function piperRoot() {
  return path.join(app.getPath("userData"), "piper");
}

function binDir() {
  return path.join(piperRoot(), "bin");
}

function modelDir() {
  return path.join(piperRoot(), "models", "ru_RU-irina-medium");
}

function piperExe() {
  return path.join(binDir(), "piper", "piper.exe");
}

function modelOnnx() {
  return path.join(modelDir(), "ru_RU-irina-medium.onnx");
}

function modelJson() {
  return path.join(modelDir(), "ru_RU-irina-medium.onnx.json");
}

export function getPiperStatus() {
  const exe = existsSync(piperExe());
  const model = existsSync(modelOnnx()) && existsSync(modelJson());
  return {
    ready: exe && model,
    exe,
    model,
    root: piperRoot(),
    voice: "ru_RU-irina-medium",
  };
}

function downloadFile(url, dest, onProgress) {
  return new Promise((resolve, reject) => {
    mkdirSync(path.dirname(dest), { recursive: true });
    const file = createWriteStream(dest);
    const getter = url.startsWith("https") ? https : http;

    const follow = (u, redirects = 0) => {
      if (redirects > 8) {
        reject(new Error("Слишком много редиректов"));
        return;
      }
      getter
        .get(u, { headers: { "User-Agent": "joi-conductor/piper" } }, (res) => {
          if (
            res.statusCode &&
            res.statusCode >= 300 &&
            res.statusCode < 400 &&
            res.headers.location
          ) {
            res.resume();
            follow(res.headers.location, redirects + 1);
            return;
          }
          if ((res.statusCode ?? 500) >= 400) {
            reject(new Error(`HTTP ${res.statusCode} для ${u}`));
            return;
          }
          const total = Number(res.headers["content-length"] || 0);
          let got = 0;
          res.on("data", (chunk) => {
            got += chunk.length;
            if (total > 0 && onProgress) {
              onProgress(Math.min(99, Math.round((got / total) * 100)));
            }
          });
          pipeline(res, file).then(resolve).catch(reject);
        })
        .on("error", reject);
    };
    follow(url);
  });
}

function expandZip(zipPath, outDir) {
  mkdirSync(outDir, { recursive: true });
  return new Promise((resolve, reject) => {
    const ps = spawn(
      "powershell.exe",
      [
        "-NoProfile",
        "-Command",
        `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${outDir.replace(/'/g, "''")}' -Force`,
      ],
      { windowsHide: true },
    );
    ps.on("error", reject);
    ps.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Распаковка zip код ${code}`));
    });
  });
}

/**
 * Download piper binary + RU Irina model. onProgress({phase, pct})
 * @param {(p: { phase: string, pct: number }) => void} [onProgress]
 */
export async function installPiper(onProgress) {
  const root = piperRoot();
  mkdirSync(root, { recursive: true });
  const zipPath = path.join(root, "piper_windows_amd64.zip");

  if (!existsSync(piperExe())) {
    onProgress?.({ phase: "Скачиваю Piper…", pct: 5 });
    await downloadFile(PIPER_ZIP, zipPath, (pct) =>
      onProgress?.({ phase: "Скачиваю Piper…", pct: Math.round(pct * 0.4) }),
    );
    onProgress?.({ phase: "Распаковываю…", pct: 45 });
    await expandZip(zipPath, binDir());
    // zip may contain piper/piper.exe already under bin/piper
    if (!existsSync(piperExe())) {
      // sometimes flat extract
      const alt = path.join(binDir(), "piper.exe");
      if (existsSync(alt)) {
        mkdirSync(path.join(binDir(), "piper"), { recursive: true });
        await fs.rename(alt, piperExe());
      }
    }
    try {
      await fs.unlink(zipPath);
    } catch {
      /* ignore */
    }
  }

  mkdirSync(modelDir(), { recursive: true });
  if (!existsSync(modelOnnx())) {
    onProgress?.({ phase: "Скачиваю голос Irina…", pct: 55 });
    await downloadFile(MODEL_ONNX, modelOnnx(), (pct) =>
      onProgress?.({
        phase: "Скачиваю голос Irina…",
        pct: 55 + Math.round(pct * 0.35),
      }),
    );
  }
  if (!existsSync(modelJson())) {
    onProgress?.({ phase: "Скачиваю конфиг голоса…", pct: 92 });
    await downloadFile(MODEL_JSON, modelJson());
  }

  onProgress?.({ phase: "Готово", pct: 100 });
  return getPiperStatus();
}

/**
 * Emotion → Piper synthesis knobs
 * lengthScale: higher = slower
 */
export function piperParamsForEmotion(emotion, rateMul = 1) {
  const table = {
    tease: { lengthScale: 0.95, noiseScale: 0.72, noiseW: 0.85 },
    amused: { lengthScale: 0.92, noiseScale: 0.78, noiseW: 0.9 },
    intense: { lengthScale: 0.88, noiseScale: 0.8, noiseW: 0.95 },
    strict: { lengthScale: 1.05, noiseScale: 0.55, noiseW: 0.7 },
    soft: { lengthScale: 1.12, noiseScale: 0.5, noiseW: 0.65 },
    neutral: { lengthScale: 1.0, noiseScale: 0.667, noiseW: 0.8 },
  };
  const base = table[emotion] ?? table.tease;
  // user rate: higher = faster → lower lengthScale
  const lengthScale = Math.max(
    0.7,
    Math.min(1.4, base.lengthScale / Math.max(0.7, rateMul)),
  );
  return { ...base, lengthScale };
}

/**
 * @param {{ text: string, emotion?: string, rate?: number }} opts
 */
export async function synthesizePiperTts(opts) {
  const status = getPiperStatus();
  if (!status.ready) {
    throw new Error("Piper не установлен — нажми «Скачать Piper» в настройках");
  }
  const text = String(opts.text ?? "").trim();
  if (!text) throw new Error("Пустой текст");

  const emotion = typeof opts.emotion === "string" ? opts.emotion : "tease";
  const rateMul = typeof opts.rate === "number" ? opts.rate : 1;
  const knobs = piperParamsForEmotion(emotion, rateMul);

  const hash = createHash("sha1")
    .update(`${text}|${emotion}|${knobs.lengthScale}`)
    .digest("hex")
    .slice(0, 16);
  const outWav = path.join(piperRoot(), "cache", `${hash}.wav`);
  mkdirSync(path.dirname(outWav), { recursive: true });

  if (!existsSync(outWav)) {
    await new Promise((resolve, reject) => {
      const args = [
        "--model",
        modelOnnx(),
        "--output_file",
        outWav,
        "--length_scale",
        String(knobs.lengthScale),
        "--noise_scale",
        String(knobs.noiseScale),
        "--noise_w",
        String(knobs.noiseW),
      ];
      const child = spawn(piperExe(), args, {
        windowsHide: true,
        cwd: path.dirname(piperExe()),
        env: { ...process.env },
      });
      let err = "";
      child.stderr?.on("data", (c) => {
        err += c.toString();
      });
      child.on("error", reject);
      child.on("exit", (code) => {
        if (code === 0 && existsSync(outWav)) resolve();
        else reject(new Error(err.trim() || `piper exit ${code}`));
      });
      child.stdin.write(text, "utf8");
      child.stdin.end();
    });
  }

  const buf = await fs.readFile(outWav);
  return {
    mime: "audio/wav",
    base64: buf.toString("base64"),
    voice: "ru_RU-irina-medium",
    bytes: buf.length,
    engine: "piper",
  };
}
