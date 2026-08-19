import http from "node:http";
import https from "node:https";
import { existsSync } from "node:fs";
import net from "node:net";

const DEFAULT_BASE = "http://127.0.0.1:9880";

const DIGIT_RU = [
  "ноль",
  "один",
  "два",
  "три",
  "четыре",
  "пять",
  "шесть",
  "семь",
  "восемь",
  "девять",
];

/**
 * Soften digits/symbols so synthesis doesn't choke.
 * Digit→Russian only when textLang is ru (EN clones must keep Arabic digits).
 * @param {string} raw
 * @param {string} [textLang]
 */
export function normalizeRuTtsText(raw, textLang = "en") {
  const lang = String(textLang || "en").toLowerCase();
  let s = String(raw ?? "")
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "")
    .replace(/ё/g, "е")
    // Curly quotes / dashes → ASCII (Windows SoVITS console often chokes)
    .replace(/[\u2018\u2019\u2032]/g, "'")
    .replace(/[\u201C\u201D\u2033]/g, '"')
    .replace(/[\u2013\u2014\u2212]/g, "-");

  if (lang === "ru") {
    // 12 → двенадцать (simple 0–99)
    s = s.replace(/\b(\d{1,2})\b/g, (_, n) => {
      const v = Number(n);
      if (Number.isNaN(v)) return n;
      if (v < 10) return DIGIT_RU[v] ?? n;
      if (v === 10) return "десять";
      if (v === 11) return "одиннадцать";
      if (v === 12) return "двенадцать";
      if (v === 13) return "тринадцать";
      if (v === 14) return "четырнадцать";
      if (v === 15) return "пятнадцать";
      if (v === 16) return "шестнадцать";
      if (v === 17) return "семнадцать";
      if (v === 18) return "восемнадцать";
      if (v === 19) return "девятнадцать";
      if (v === 20) return "двадцать";
      const tens = Math.floor(v / 10);
      const ones = v % 10;
      const tensWord = [
        "",
        "",
        "двадцать",
        "тридцать",
        "сорок",
        "пятьдесят",
        "шестьдесят",
        "семьдесят",
        "восемьдесят",
        "девяносто",
      ][tens];
      return ones ? `${tensWord} ${DIGIT_RU[ones]}` : tensWord;
    });
  }

  // strip leftover weird symbols, keep punctuation SoVITS likes
  s = s
    .replace(/[^\p{L}\p{N}\s.,!?;:«»"'()\-—…']/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  return s;
}

/**
 * @param {string} emotion
 * @param {number} rateMul
 */
export function sovitsParamsForEmotion(emotion, rateMul = 1) {
  const table = {
    tease: { speed: 1.05, temperature: 1.05, top_k: 15, top_p: 1 },
    amused: { speed: 1.08, temperature: 1.1, top_k: 20, top_p: 1 },
    intense: { speed: 1.12, temperature: 1.0, top_k: 12, top_p: 0.95 },
    strict: { speed: 0.95, temperature: 0.85, top_k: 8, top_p: 0.9 },
    soft: { speed: 0.92, temperature: 0.95, top_k: 12, top_p: 1 },
    neutral: { speed: 1.0, temperature: 1.0, top_k: 15, top_p: 1 },
  };
  const base = table[emotion] ?? table.tease;
  return {
    ...base,
    speed: Math.max(0.6, Math.min(1.5, base.speed * rateMul)),
  };
}

function requestBuffer(url, { method = "GET", body, timeoutMs = 120000 } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === "https:" ? https : http;
    const req = lib.request(
      {
        hostname: u.hostname,
        port: u.port || (u.protocol === "https:" ? 443 : 80),
        path: `${u.pathname}${u.search}`,
        method,
        headers: body
          ? {
              "Content-Type": "application/json",
              "Content-Length": Buffer.byteLength(body),
            }
          : undefined,
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
                `SoVITS HTTP ${res.statusCode}: ${buf.toString("utf8").slice(0, 200)}`,
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
      reject(new Error("SoVITS timeout"));
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

/**
 * @param {string} baseUrl
 */
export async function getSovitsStatus(baseUrl = DEFAULT_BASE) {
  const base = (baseUrl || DEFAULT_BASE).replace(/\/$/, "");
  try {
    // api_v2 often has no /health; probe with OPTIONS or empty — use control endpoint
    const { status, buf } = await requestBuffer(`${base}/control?command=status`, {
      timeoutMs: 2500,
    });
    // some builds return 404 on control — still means server is up if connection works
    return {
      online: status < 500,
      baseUrl: base,
      detail: buf.toString("utf8").slice(0, 120) || `HTTP ${status}`,
    };
  } catch (err) {
    // try bare connect via failed TTS is heavy — mark offline
    return {
      online: false,
      baseUrl: base,
      detail: err instanceof Error ? err.message : "offline",
    };
  }
}

/**
 * Lightweight reachability: TCP connect (HTTP / hangs while GPU is busy).
 * @param {string} baseUrl
 */
export async function pingSovits(baseUrl = DEFAULT_BASE) {
  const base = (baseUrl || DEFAULT_BASE).replace(/\/$/, "");
  let host = "127.0.0.1";
  let port = 9880;
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
    socket.setTimeout(800);
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
 * @param {{
 *   text: string,
 *   baseUrl?: string,
 *   refAudioPath: string,
 *   promptText: string,
 *   promptLang?: string,
 *   textLang?: string,
 *   emotion?: string,
 *   rate?: number,
 * }} opts
 */
export async function synthesizeSovitsTts(opts) {
  const base = (opts.baseUrl || DEFAULT_BASE).replace(/\/$/, "");
  const ref = String(opts.refAudioPath || "").trim();
  if (!ref) throw new Error("Укажи путь к референсу (wav из катсцены)");
  if (!existsSync(ref)) {
    throw new Error(`Референс не найден: ${ref}`);
  }

  const emotion = opts.emotion || "tease";
  const knobs = sovitsParamsForEmotion(emotion, opts.rate ?? 1);
  const promptText = normalizeRuTtsText(
    String(opts.promptText || "").trim(),
    String(opts.promptLang || "en"),
  );
  const promptLang = String(opts.promptLang || "en").toLowerCase();
  const textLang = String(opts.textLang || "en").toLowerCase();
  const text = normalizeRuTtsText(opts.text, textLang);
  if (!text) throw new Error("Пустой текст после нормализации");
  if (!promptText) {
    throw new Error(
      "Пустой текст референса (prompt). Смени профиль госпожи или вставь transcript клипа в настройках.",
    );
  }

  // GPT-SoVITS v1/v2 pretrained: no Russian. See TTS.py v2_languages.
  const allowed = new Set([
    "auto",
    "auto_yue",
    "en",
    "zh",
    "ja",
    "yue",
    "ko",
    "all_zh",
    "all_ja",
    "all_yue",
    "all_ko",
  ]);
  if (textLang === "ru" || !allowed.has(textLang)) {
    throw new Error(
      `SoVITS не поддерживает язык реплик «${textLang}» (v2: en/zh/ja/ko/yue/auto). Для клона Ху Тао поставь «Язык реплик сессии» = en и пиши/генерируй реплики на английском. Для русского текста — Piper/Edge, не SoVITS.`,
    );
  }
  if (promptLang === "ru" || !allowed.has(promptLang)) {
    throw new Error(
      `SoVITS не поддерживает язык референса «${promptLang}». Для VO_Hu_Tao_Hello поставь «en».`,
    );
  }

  const body = JSON.stringify({
    text,
    text_lang: textLang,
    ref_audio_path: ref,
    prompt_text: promptText,
    prompt_lang: promptLang,
    text_split_method: "cut5",
    batch_size: 1,
    media_type: "wav",
    streaming_mode: false,
    parallel_infer: true,
    speed_factor: knobs.speed,
    temperature: knobs.temperature,
    top_k: knobs.top_k,
    top_p: knobs.top_p,
    repetition_penalty: 1.35,
  });

  const { buf, contentType } = await requestBuffer(`${base}/tts`, {
    method: "POST",
    body,
    timeoutMs: 180000,
  });

  // Error JSON from API
  const head = buf.subarray(0, Math.min(32, buf.length)).toString("utf8");
  if (head.trim().startsWith("{") && /message|Exception|error/i.test(head)) {
    throw new Error(buf.toString("utf8").slice(0, 240));
  }
  if (buf.length < 100) {
    throw new Error(`SoVITS пустой ответ (${buf.length} bytes)`);
  }
  // SoVITS bug on Windows: internal UnicodeEncodeError → 1s of digital silence
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
        "SoVITS вернул тишину (часто UnicodeEncodeError в логах на Windows). Перезапусти голос — api_v2 уже с PYTHONUTF8.",
      );
    }
  }

  return {
    mime: contentType.includes("wav")
      ? "audio/wav"
      : contentType.includes("mpeg")
        ? "audio/mpeg"
        : "audio/wav",
    base64: buf.toString("base64"),
    voice: "gpt-sovits",
    bytes: buf.length,
    engine: "sovits",
  };
}
