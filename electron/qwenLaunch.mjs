/**
 * Pick how to serve Qwen3-TTS and map session lang codes to qwen-tts names.
 */

/**
 * @param {string} code
 * @returns {string}
 */
export function qwenLanguageName(code) {
  switch (String(code || "").toLowerCase()) {
    case "ru":
      return "Russian";
    case "zh":
    case "cn":
      return "Chinese";
    case "ja":
      return "Japanese";
    case "ko":
      return "Korean";
    case "auto":
      return "Auto";
    case "en":
    default:
      return "English";
  }
}

/**
 * @param {{ hasVllm?: boolean, hasQwenTts?: boolean, device?: string }} opts
 * @returns {"vllm" | "qwen-tts" | "none"}
 */
export function pickQwenServeBackend(opts = {}) {
  if (resolveQwenServeDevice(opts.device) === "cpu") {
    return opts.hasQwenTts ? "qwen-tts" : "none";
  }
  if (opts.hasVllm) return "vllm";
  if (opts.hasQwenTts) return "qwen-tts";
  return "none";
}

/**
 * @param {unknown} raw
 * @returns {"cpu" | "cuda"}
 */
export function resolveQwenServeDevice(raw) {
  const d = String(raw ?? "").toLowerCase();
  if (d === "cpu" || d === "ram" || d === "qwen-cpu") return "cpu";
  return "cuda";
}

/**
 * Running /health device vs requested engine.
 * Unknown (old server) matches CUDA, not RAM — restart RAM if we cannot tell.
 * @param {string | undefined} running
 * @param {"cpu" | "cuda"} wanted
 */
export function qwenDeviceMatches(running, wanted) {
  const r = String(running ?? "").toLowerCase();
  if (!r) return wanted !== "cpu";
  if (wanted === "cpu") return r === "cpu";
  return r !== "cpu";
}

/**
 * Cap codec tokens from text length (keep in sync with scripts/qwen_tts_server.py).
 * 12Hz ≈ 12.5 tokens/s of audio; speech ≈ 15 chars/s → ~1 token/char. 2× + EOS pad.
 * A 5× cap let short lines generate ~15s of audio (~14s wait) if EOS did not fire.
 * The old fixed ceiling of 192 cut long chat replies at ~15 seconds. Keep the
 * length-based allowance, with a bounded 2048-token ceiling for runaway output.
 * @param {string} text
 */
export function qwenMaxNewTokens(text) {
  const n = Array.from(String(text ?? "").trim()).length;
  return Math.min(2048, Math.max(40, n * 2 + 24));
}

/**
 * Base lineup needs a reference wav; CustomVoice does not.
 * @param {string} modelId
 */
export function isQwenBaseModel(modelId) {
  const name = String(modelId || "")
    .replace(/\\/g, "/")
    .toLowerCase();
  if (!name || name.includes("customvoice")) return false;
  const leaf = name.split("/").filter(Boolean).pop() || name;
  return leaf.includes("base") || name.includes("-base") || name.endsWith("/base");
}
