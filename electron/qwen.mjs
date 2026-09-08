import { existsSync } from "node:fs";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import {
  isQwenBaseModel,
  qwenLanguageName,
  qwenMaxNewTokens,
} from "./qwenLaunch.mjs";

/**
 * Qwen3-TTS 0.6B engine bridge.
 *
 * Talks to a vLLM (or any OpenAI-compatible) server exposing
 * `POST {baseUrl}/audio/speech` with body `{ model, input, voice,
 * response_format }`. Audio comes back as binary (we request `wav`
 * so host PlaySync can await it; vLLM also supports `flac`/`mp3`/`pcm`).
 *
 * Mirrors the shape/contract of sovits.mjs:
 *   synthesize* → { mime, base64, voice, bytes, engine }
 */

const DEFAULT_BASE = "http://127.0.0.1:8000/v1";
/** Idle timeout while the server computes (no bytes until wav is ready). */
export const QWEN_SPEAK_TIMEOUT_MS = 180_000;

/** Default port used by `vllm serve` (parsed from baseUrl for ping). */
const DEFAULT_PORT = 8000;

/**
 * Emotion → Qwen speech knobs.
 * OpenAI-compatible /v1/audio/speech exposes `speed` (0.25..4.0) and,
 * for Qwen3-TTS on vLLM, optional `temperature` passthrough in `extra_body`.
 * We keep the surface minimal: speed + a soft pitch-like feel via voice pick.
 *
 * @param {string} emotion
 * @param {number} rateMul   active mistress rate multiplier
 */
export function qwenParamsForEmotion(emotion, rateMul = 1) {
  const table = {
    tease: { speed: 1.05, temperature: 0.7, instruct: "playful teasing tone" },
    amused: { speed: 1.08, temperature: 0.75, instruct: "amused light tone" },
    intense: { speed: 1.15, temperature: 0.75, instruct: "urgent intense tone" },
    strict: { speed: 0.95, temperature: 0.65, instruct: "cold strict tone" },
    soft: { speed: 0.92, temperature: 0.7, instruct: "soft gentle tone" },
    neutral: { speed: 1.0, temperature: 0.7, instruct: "" },
  };
  const base = table[emotion] ?? table.tease;
  return {
    speed: Math.max(0.5, Math.min(2.0, base.speed * rateMul)),
    temperature: base.temperature,
    instruct: base.instruct,
  };
}

function requestBuffer(url, { method = "GET", body, headers, timeoutMs = 30000 } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === "https:" ? https : http;
    const reqHeaders = { ...(headers ?? {}) };
    if (body && !reqHeaders["Content-Type"]) {
      reqHeaders["Content-Type"] = "application/json";
      reqHeaders["Content-Length"] = Buffer.byteLength(body);
    }
    const req = lib.request(
      {
        hostname: u.hostname,
        port: u.port || (u.protocol === "https:" ? 443 : 80),
        path: `${u.pathname}${u.search}`,
        method,
        headers: reqHeaders,
        timeout: timeoutMs,
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const buf = Buffer.concat(chunks);
          if ((res.statusCode ?? 500) >= 400) {
            reject(
              new Error(
                `Qwen HTTP ${res.statusCode}: ${buf.toString("utf8").slice(0, 240)}`,
              ),
            );
            return;
          }
          resolve({
            status: res.statusCode ?? 200,
            buf,
            contentType: res.headers["content-type"] || "",
            headers: res.headers,
          });
        });
      },
    );
    req.on("timeout", () => {
      req.destroy();
      const sec = Math.round(timeoutMs / 1000);
      reject(
        new Error(
          `Qwen timeout (сервер не ответил за ${sec}с). Первая фраза после старта на GPU часто 1–3 мин — это не длина текста.`,
        ),
      );
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

function normalizeBase(baseUrl) {
  const base = (baseUrl || DEFAULT_BASE).replace(/\/+$/, "");
  return base || DEFAULT_BASE;
}

/**
 * Lightweight reachability: TCP connect (HTTP probe hangs while GPU is busy).
 * @param {string} baseUrl
 */
export async function pingQwen(baseUrl = DEFAULT_BASE) {
  const base = normalizeBase(baseUrl);
  let host = "127.0.0.1";
  let port = DEFAULT_PORT;
  try {
    const u = new URL(base);
    host = u.hostname || host;
    port = Number(u.port) || port;
  } catch {
    /* keep defaults */
  }

  const tcpOk = await new Promise((resolve) => {
    const socket = net.connect({ host, port });
    const done = (ok) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(900);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
  });

  if (tcpOk) {
    return { online: true, baseUrl: base, detail: "порт открыт" };
  }
  return { online: false, baseUrl: base, detail: "порт закрыт / нет процесса" };
}

/**
 * Format /health JSON for the status pill.
 * @param {{ device?: string, gpu?: string, torch?: string, backend?: string, engine?: string }} parsed
 */
export function qwenHealthDetail(parsed) {
  const device = String(parsed?.device || "");
  const gpu = String(parsed?.gpu || "");
  const torch = String(parsed?.torch || "");
  const backend = String(parsed?.backend || parsed?.engine || "");
  const cpu = device === "cpu" || /[+]?cpu/i.test(torch);
  if (cpu) {
    return `онлайн · CPU (${torch || "torch без CUDA"}) — не GPU, синтез в RAM`;
  }
  const graphs =
    backend === "faster" || backend.includes("faster-qwen3");
  if (gpu) {
    return graphs
      ? `онлайн · GPU · ${gpu} · CUDA graphs`
      : `онлайн · GPU · ${gpu}`;
  }
  return "";
}

/** Read PCM WAV duration without decoding the full file. */
export function wavDurationSeconds(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 44) return 0;
  if (buf.subarray(0, 4).toString("ascii") !== "RIFF") return 0;
  let offset = 12;
  let byteRate = 0;
  let dataBytes = 0;
  while (offset + 8 <= buf.length) {
    const id = buf.subarray(offset, offset + 4).toString("ascii");
    const size = buf.readUInt32LE(offset + 4);
    if (id === "fmt " && size >= 16 && offset + 20 <= buf.length) {
      byteRate = buf.readUInt32LE(offset + 16);
    } else if (id === "data") {
      dataBytes = Math.min(size, Math.max(0, buf.length - offset - 8));
      break;
    }
    offset += 8 + size + (size % 2);
  }
  return byteRate > 0 ? dataBytes / byteRate : 0;
}

/** Normalize timing headers from the bundled server, with external-server fallbacks. */
export function qwenSynthesisMetrics(headers, wallMs, buf) {
  const numberHeader = (name) => {
    const raw = headers?.[name];
    const value = Array.isArray(raw) ? raw[0] : raw;
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  };
  const generationMs = numberHeader("x-joi-generation-ms") || Math.max(0, wallMs);
  const audioSeconds =
    numberHeader("x-joi-audio-seconds") || wavDurationSeconds(buf);
  const realtimeX =
    numberHeader("x-joi-realtime-x") ||
    (generationMs > 0 ? audioSeconds / (generationMs / 1000) : 0);
  return {
    generationMs: Math.round(generationMs),
    audioSeconds,
    realtimeX,
    backend: String(headers?.["x-joi-backend"] || ""),
    device: String(headers?.["x-joi-device"] || ""),
  };
}

/**
 * Soft status probe: hit /health, then /models.
 * @param {string} baseUrl
 */
export async function getQwenStatus(baseUrl = DEFAULT_BASE) {
  const base = normalizeBase(baseUrl);
  try {
    const { status, buf } = await requestBuffer(`${base}/health`, {
      timeoutMs: 2500,
    });
    if (status < 400) {
      let device = "";
      let gpu = "";
      let torch = "";
      let backend = "";
      let warmed = false;
      try {
        const parsed = JSON.parse(buf.toString("utf8"));
        if (parsed && typeof parsed === "object") {
          device = String(parsed.device || "");
          gpu = String(parsed.gpu || "");
          torch = String(parsed.torch || "");
          backend = String(parsed.backend || parsed.engine || "");
          warmed = parsed.warmed === true;
        }
      } catch {
        /* ignore */
      }
      const cpu = device === "cpu" || /[+]?cpu/i.test(torch);
      const detail =
        qwenHealthDetail({ device, gpu, torch, backend }) ||
        buf.toString("utf8").slice(0, 120) ||
        `HTTP ${status}`;
      return {
        online: true,
        baseUrl: base,
        device: device || (cpu ? "cpu" : ""),
        gpu,
        torch,
        backend,
        warmed,
        detail,
      };
    }
  } catch {
    /* fall through to /models */
  }
  try {
    const { status, buf } = await requestBuffer(`${base}/models`, {
      timeoutMs: 2500,
    });
    return {
      online: status < 400,
      baseUrl: base,
      detail: buf.toString("utf8").slice(0, 120) || `HTTP ${status}`,
    };
  } catch (err) {
    return {
      online: false,
      baseUrl: base,
      detail: err instanceof Error ? err.message : "offline",
    };
  }
}

/**
 * @param {{
 *   text: string,
 *   baseUrl?: string,
 *   model?: string,
 *   voice?: string,
 *   apiKey?: string,
 *   emotion?: string,
 *   rate?: number,
 *   language?: string,
 *   refAudio?: string,
 *   refText?: string,
 * }} opts
 * @returns {Promise<{mime: string, base64: string, voice: string, bytes: number, engine: string}>}
 */
export async function synthesizeQwenTts(opts) {
  const base = normalizeBase(opts.baseUrl);
  const text = String(opts.text ?? "").trim();
  if (!text) throw new Error("Пустой текст для Qwen3-TTS");

  const model = String(
    opts.model || "Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice",
  ).trim();
  const voice = String(opts.voice || "Serena").trim();
  const emotion = opts.emotion || "tease";
  const knobs = qwenParamsForEmotion(emotion, opts.rate ?? 1);

  const headers = {};
  const apiKey = String(opts.apiKey ?? "").trim();
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

  const extraBody = {
    temperature: knobs.temperature,
    language: qwenLanguageName(opts.language || "en"),
    max_new_tokens: qwenMaxNewTokens(text),
  };
  if (knobs.instruct) extraBody.instruct = knobs.instruct;
  const refAudio = String(opts.refAudio ?? "").trim();
  const refText = String(opts.refText ?? "").trim();
  if (isQwenBaseModel(model)) {
    if (!refAudio) {
      throw new Error(
        "Qwen Base — клон: нужен wav госпожи (поле референса). Или переключись на CustomVoice.",
      );
    }
    if (!existsSync(refAudio)) {
      throw new Error(
        `Qwen Base — нет файла рефа: ${refAudio}. Положи wav или переключись на CustomVoice.`,
      );
    }
  }
  if (refAudio) extraBody.ref_audio = refAudio;
  if (refText) extraBody.ref_text = refText;

  const body = JSON.stringify({
    model,
    input: text,
    voice,
    response_format: "wav",
    speed: knobs.speed,
    extra_body: extraBody,
  });

  const startedAt = Date.now();
  const { buf, contentType, headers: responseHeaders } = await requestBuffer(`${base}/audio/speech`, {
    method: "POST",
    headers,
    body,
    timeoutMs: QWEN_SPEAK_TIMEOUT_MS,
  });
  const metrics = qwenSynthesisMetrics(responseHeaders, Date.now() - startedAt, buf);

  // Error JSON from API
  const head = buf.subarray(0, Math.min(64, buf.length)).toString("utf8");
  if (head.trim().startsWith("{") && /message|Exception|error|detail/i.test(head)) {
    throw new Error(buf.toString("utf8").slice(0, 240));
  }
  if (buf.length < 100) {
    throw new Error(`Qwen пустой ответ (${buf.length} bytes)`);
  }

  // Silence guard (mirror sovits): sometimes a misconfigured server returns
  // near-empty PCM. WAV peak amplitude should exceed a small floor.
  if (buf.length >= 44 && buf.subarray(0, 4).toString("ascii") === "RIFF") {
    let peak = 0;
    for (let i = 44; i + 1 < buf.length; i += 2) {
      const s = buf.readInt16LE(i);
      const a = s < 0 ? -s : s;
      if (a > peak) peak = a;
      if (peak > 64) break;
    }
    if (peak <= 64) {
      throw new Error(
        "Qwen вернул тишину. Проверь модель/голос и что сервер (qwen-tts или vLLM) собрался с аудио.",
      );
    }
  }

  const ct = contentType.toLowerCase();
  const mime = ct.includes("wav")
    ? "audio/wav"
    : ct.includes("mpeg") || ct.includes("mp3")
      ? "audio/mpeg"
      : ct.includes("flac")
        ? "audio/flac"
        : ct.includes("ogg")
          ? "audio/ogg"
          : "audio/wav";

  return {
    mime,
    base64: buf.toString("base64"),
    voice: `qwen:${voice}`,
    bytes: buf.length,
    engine: "qwen",
    ...metrics,
  };
}
