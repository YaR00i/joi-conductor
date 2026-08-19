import http from "node:http";
import https from "node:https";
import net from "node:net";

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
    tease: { speed: 1.05, temperature: 0.9 },
    amused: { speed: 1.08, temperature: 1.0 },
    intense: { speed: 1.15, temperature: 1.0 },
    strict: { speed: 0.95, temperature: 0.7 },
    soft: { speed: 0.92, temperature: 0.8 },
    neutral: { speed: 1.0, temperature: 0.9 },
  };
  const base = table[emotion] ?? table.tease;
  return {
    speed: Math.max(0.5, Math.min(2.0, base.speed * rateMul)),
    temperature: base.temperature,
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
          });
        });
      },
    );
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Qwen timeout (сервер не ответил за 30с)"));
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
 * Soft status probe: hit /models (every OpenAI-compatible server has it).
 * @param {string} baseUrl
 */
export async function getQwenStatus(baseUrl = DEFAULT_BASE) {
  const base = normalizeBase(baseUrl);
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
 * }} opts
 * @returns {Promise<{mime: string, base64: string, voice: string, bytes: number, engine: string}>}
 */
export async function synthesizeQwenTts(opts) {
  const base = normalizeBase(opts.baseUrl);
  const text = String(opts.text ?? "").trim();
  if (!text) throw new Error("Пустой текст для Qwen3-TTS");

  const model = String(opts.model || "Qwen/Qwen3-TTS-0.6B").trim();
  const voice = String(opts.voice || "Cherry").trim();
  const emotion = opts.emotion || "tease";
  const knobs = qwenParamsForEmotion(emotion, opts.rate ?? 1);

  const headers = {};
  const apiKey = String(opts.apiKey ?? "").trim();
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

  // OpenAI-compatible speech endpoint. `extra_body` passes Qwen-specific
  // sampling knobs through vLLM without breaking the standard schema.
  const body = JSON.stringify({
    model,
    input: text,
    voice,
    response_format: "wav",
    speed: knobs.speed,
    extra_body: { temperature: knobs.temperature },
  });

  const { buf, contentType } = await requestBuffer(`${base}/audio/speech`, {
    method: "POST",
    headers,
    body,
    timeoutMs: 30000,
  });

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
        "Qwen вернул тишину. Проверь модель/голос и что vLLM собран с аудио-бэкендом.",
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
  };
}
