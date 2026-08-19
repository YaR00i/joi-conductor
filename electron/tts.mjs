/**
 * Microsoft Edge Read Aloud (neural TTS) for Electron main — zero Azure key.
 * Uses `ws` so we can send Edge User-Agent / Origin / Sec-MS-GEC headers.
 */
import crypto from "node:crypto";
import { Buffer } from "node:buffer";
import WebSocket from "ws";

const TRUSTED_CLIENT_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
const WIN_EPOCH = 11644473600;
const CHROMIUM = {
  major: "130",
  full: "130.0.2849.68",
  secVersion: "1-130.0.2849.68",
  ua:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0",
};

export const EDGE_RU_VOICES = [
  {
    id: "ru-RU-DariyaNeural",
    nameRu: "Дарья · Neural",
    gender: "female",
    hint: "моложе, живее — по умолчанию",
  },
  {
    id: "ru-RU-SvetlanaNeural",
    nameRu: "Светлана · Neural",
    gender: "female",
    hint: "мягче, спокойнее",
  },
  {
    id: "ru-RU-DmitryNeural",
    nameRu: "Дмитрий · Neural",
    gender: "male",
    hint: "мужской",
  },
];

function secMsGec(clockSkewSec = 0) {
  const ticks = Math.floor(
    (Date.now() / 1000 + clockSkewSec + WIN_EPOCH) * 10_000_000,
  );
  const rounded = ticks - (ticks % 3_000_000_000);
  return crypto
    .createHash("sha256")
    .update(`${rounded}${TRUSTED_CLIENT_TOKEN}`, "ascii")
    .digest("hex")
    .toUpperCase();
}

function escapeXml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * @param {string} emotion
 * @param {number} rateMul
 * @param {number} pitchMul
 */
export function prosodyForEmotion(emotion, rateMul = 1, pitchMul = 1) {
  const table = {
    tease: { rate: 1.08, pitchHz: 45, volume: "+12%" },
    amused: { rate: 1.12, pitchHz: 55, volume: "+10%" },
    intense: { rate: 1.16, pitchHz: 25, volume: "+18%" },
    strict: { rate: 0.94, pitchHz: -35, volume: "+6%" },
    soft: { rate: 0.9, pitchHz: 20, volume: "-4%" },
    neutral: { rate: 1.0, pitchHz: 0, volume: "+0%" },
  };
  const base = table[emotion] ?? table.tease;
  const rate = Math.max(0.6, Math.min(1.6, base.rate * rateMul));
  const pitchHz = Math.round(base.pitchHz + (pitchMul - 1) * 80);
  const pitch = `${pitchHz >= 0 ? "+" : ""}${pitchHz}Hz`;
  return {
    rate: `${Math.round(rate * 100)}%`,
    pitch,
    volume: base.volume,
  };
}

function buildSsml(text, voice, prosody) {
  const lang = voice.startsWith("ru-") ? "ru-RU" : "en-US";
  return (
    `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis"` +
    ` xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="${lang}">` +
    `<voice name="${voice}">` +
    `<prosody rate="${prosody.rate}" pitch="${prosody.pitch}" volume="${prosody.volume}">` +
    `${escapeXml(text)}` +
    `</prosody></voice></speak>`
  );
}

function wssUrl(clockSkewSec = 0) {
  const q = new URLSearchParams({
    TrustedClientToken: TRUSTED_CLIENT_TOKEN,
    "Sec-MS-GEC": secMsGec(clockSkewSec),
    "Sec-MS-GEC-Version": CHROMIUM.secVersion,
    ConnectionId: crypto.randomBytes(16).toString("hex").toUpperCase(),
  });
  return `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?${q}`;
}

function extractAudio(buf) {
  if (buf.length < 2) return null;
  const headerLen = buf.readUInt16BE(0);
  if (headerLen > 0 && 2 + headerLen < buf.length) {
    const header = buf.subarray(2, 2 + headerLen).toString("utf8");
    if (header.includes("Path:audio")) {
      return buf.subarray(2 + headerLen);
    }
  }
  const sep = buf.indexOf(Buffer.from("\r\n\r\n"));
  if (sep >= 0) {
    const header = buf.subarray(0, sep).toString("utf8");
    if (header.includes("Path:audio")) return buf.subarray(sep + 4);
  }
  return null;
}

/**
 * @param {{ text: string, voice?: string, emotion?: string, rate?: number, pitch?: number }} opts
 * @param {number} [clockSkewSec]
 */
async function synthesizeOnce(opts, clockSkewSec = 0) {
  const text = String(opts.text ?? "").trim();
  if (!text) throw new Error("Пустой текст для TTS");

  const voice =
    typeof opts.voice === "string" && opts.voice.trim()
      ? opts.voice.trim()
      : "ru-RU-DariyaNeural";
  const emotion = typeof opts.emotion === "string" ? opts.emotion : "tease";
  const rateMul = typeof opts.rate === "number" ? opts.rate : 1;
  const pitchMul = typeof opts.pitch === "number" ? opts.pitch : 1;
  const prosody = prosodyForEmotion(emotion, rateMul, pitchMul);
  const ssml = buildSsml(text, voice, prosody);

  const requestId = crypto.randomBytes(16).toString("hex").toUpperCase();
  const timestamp = new Date().toISOString();
  const audioChunks = [];

  await new Promise((resolve, reject) => {
    const ws = new WebSocket(wssUrl(clockSkewSec), {
      headers: {
        Pragma: "no-cache",
        "Cache-Control": "no-cache",
        Origin: "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold",
        "User-Agent": CHROMIUM.ua,
        "Accept-Encoding": "gzip, deflate, br",
        "Accept-Language": "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7",
      },
    });

    const timer = setTimeout(() => {
      try {
        ws.terminate();
      } catch {
        /* ignore */
      }
      reject(new Error("Edge TTS timeout (8с)"));
    }, 8000);

    const fail = (err) => {
      clearTimeout(timer);
      try {
        ws.terminate();
      } catch {
        /* ignore */
      }
      reject(err instanceof Error ? err : new Error(String(err)));
    };

    ws.on("open", () => {
      const configMsg =
        `X-Timestamp:${timestamp}\r\n` +
        `Content-Type:application/json; charset=utf-8\r\n` +
        `Path:speech.config\r\n\r\n` +
        JSON.stringify({
          context: {
            synthesis: {
              audio: {
                metadataoptions: {
                  sentenceBoundaryEnabled: "false",
                  wordBoundaryEnabled: "false",
                },
                outputFormat: "webm-24khz-16bit-mono-opus",
              },
            },
          },
        });
      ws.send(configMsg);

      const ssmlMsg =
        `X-RequestId:${requestId}\r\n` +
        `Content-Type:application/ssml+xml\r\n` +
        `X-Timestamp:${timestamp}Z\r\n` +
        `Path:ssml\r\n\r\n` +
        ssml;
      ws.send(ssmlMsg);
    });

    ws.on("message", (data, isBinary) => {
      if (!isBinary) {
        const textMsg = data.toString();
        if (textMsg.includes("Path:turn.end")) {
          clearTimeout(timer);
          ws.close();
          resolve(undefined);
        }
        return;
      }
      const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
      const audio = extractAudio(buf);
      if (audio && audio.length > 0) audioChunks.push(audio);
    });

    ws.on("error", (err) => fail(err));
    ws.on("unexpected-response", (_req, res) => {
      fail(
        new Error(
          `Edge TTS HTTP ${res.statusCode} (сеть / Sec-MS-GEC / блокировка)`,
        ),
      );
    });
  });

  const out = Buffer.concat(audioChunks);
  if (out.length < 64) {
    throw new Error("Edge TTS вернул пустой аудио");
  }

  return {
    mime: "audio/webm",
    base64: out.toString("base64"),
    voice,
    prosody,
    bytes: out.length,
  };
}

/**
 * @param {{ text: string, voice?: string, emotion?: string, rate?: number, pitch?: number }} opts
 */
export async function synthesizeEdgeTts(opts) {
  const skews = [0];
  let lastErr = null;
  for (const skew of skews) {
    try {
      return await synthesizeOnce(opts, skew);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr instanceof Error
    ? lastErr
    : new Error("Edge TTS недоступен");
}
