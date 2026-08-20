/**
 * Parse huggingface_hub / tqdm progress (JSON JOI: lines or classic bars).
 */

const ANSI_RE = /\x1b\[[0-9;]*[A-Za-z]/g;

/** @param {string} text */
export function stripAnsi(text) {
  return String(text).replace(ANSI_RE, "");
}

/**
 * @param {number | null | undefined} seconds
 * @returns {string}
 */
export function formatDuration(seconds) {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return "";
  const s = Math.round(seconds);
  if (s < 90) return `${s} с`;
  const m = Math.round(s / 60);
  if (m < 90) return `~${m} мин`;
  const h = seconds / 3600;
  return h < 10 ? `~${h.toFixed(1)} ч` : `~${Math.round(h)} ч`;
}

/**
 * @param {number} n
 * @returns {string}
 */
export function formatBytes(n) {
  if (!Number.isFinite(n) || n < 0) return "";
  if (n < 1024) return `${Math.round(n)} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

/**
 * @param {number | null | undefined} rate
 * @param {string} unit
 */
export function formatRate(rate, unit) {
  if (rate == null || !Number.isFinite(rate) || rate <= 0) return "";
  const u = String(unit || "").toLowerCase();
  if (u === "b") return `${formatBytes(rate)}/с`;
  if (u === "files" || /fetch/i.test(u)) return `${rate.toFixed(2)} файл/с`;
  return `${rate.toFixed(2)}/с`;
}

/**
 * @typedef {{
 *   desc: string,
 *   n: number,
 *   total: number | null,
 *   unit: string,
 *   rate: number | null,
 *   elapsed: number | null,
 *   remaining: number | null,
 *   pct: number | null,
 *   kind: "files" | "bytes" | "other",
 * }} HfProgressEvent
 */

/**
 * @param {string} raw
 * @returns {HfProgressEvent | null}
 */
export function parseHfProgressLine(raw) {
  const line = stripAnsi(raw).replace(/\s+/g, " ").trim();
  if (!line) return null;

  if (line.startsWith("JOI:")) {
    try {
      const obj = JSON.parse(line.slice(4));
      return normalizeEvent(obj);
    } catch {
      return null;
    }
  }

  const pctMatch = line.match(/(\d+(?:\.\d+)?)%/);
  const frac = line.match(/(\d+(?:\.\d+)?(?:[kMGT]i?B)?)\s*\/\s*(\d+(?:\.\d+)?(?:[kMGT]i?B)?)/i);
  const rateMatch = line.match(
    /([\d.]+)\s*([kMGT]i?B|it|files)?\/s/i,
  );
  const remainingMatch = line.match(/<(\d+:\d+(?::\d+)?)/);
  const elapsedMatch = line.match(/\[(\d+:\d+(?::\d+)?)/);
  const desc = (line.split(/[|:]/)[0] ?? "").trim();

  const nRaw = frac ? parseSize(frac[1]) : null;
  const totalRaw = frac ? parseSize(frac[2]) : null;
  const looksBytes =
    /[kMGT]i?B/i.test(frac?.[1] ?? "") ||
    /[kMGT]i?B/i.test(frac?.[2] ?? "") ||
    (totalRaw != null && totalRaw > 4096);
  const looksFiles =
    /fetching/i.test(line) ||
    /files/i.test(line) ||
    (totalRaw != null && totalRaw <= 512 && !looksBytes);

  let unit = looksBytes ? "B" : looksFiles ? "files" : "it";
  let rate = null;
  if (rateMatch) {
    rate = Number(rateMatch[1]);
    const ru = (rateMatch[2] || "").toLowerCase();
    if (/b$/i.test(ru)) {
      unit = "B";
      rate = parseSize(`${rateMatch[1]}${rateMatch[2] || ""}`);
    }
  }

  const pct = pctMatch ? Number(pctMatch[1]) : null;
  const kind = looksFiles ? "files" : looksBytes ? "bytes" : "other";

  if (pct == null && nRaw == null && !desc) return null;

  return {
    desc,
    n: nRaw ?? 0,
    total: totalRaw,
    unit,
    rate,
    elapsed: elapsedMatch ? parseClock(elapsedMatch[1]) : null,
    remaining: remainingMatch ? parseClock(remainingMatch[1]) : null,
    pct,
    kind,
  };
}

/**
 * @param {Record<string, unknown>} obj
 * @returns {HfProgressEvent | null}
 */
function normalizeEvent(obj) {
  if (!obj || typeof obj !== "object") return null;
  const n = Number(obj.n);
  const total =
    obj.total == null || obj.total === "" ? null : Number(obj.total);
  const unit = String(obj.unit || "");
  const desc = String(obj.desc || "");
  const looksFiles =
    /fetching/i.test(desc) ||
    /files/i.test(unit) ||
    (total != null && Number.isFinite(total) && total <= 512 && unit !== "B");
  const looksBytes = unit === "B" || unit.toLowerCase() === "b";
  const kind = looksFiles ? "files" : looksBytes ? "bytes" : "other";
  const pct =
    total && Number.isFinite(total) && total > 0 && Number.isFinite(n)
      ? (n / total) * 100
      : obj.pct != null
        ? Number(obj.pct)
        : null;
  return {
    desc,
    n: Number.isFinite(n) ? n : 0,
    total: total != null && Number.isFinite(total) ? total : null,
    unit,
    rate: obj.rate == null ? null : Number(obj.rate),
    elapsed: obj.elapsed == null ? null : Number(obj.elapsed),
    remaining: obj.remaining == null ? null : Number(obj.remaining),
    pct: pct != null && Number.isFinite(pct) ? pct : null,
    kind,
  };
}

/**
 * @param {string} token
 */
function parseSize(token) {
  const m = String(token)
    .trim()
    .match(/^([\d.]+)\s*([kMGT]i?B)?$/i);
  if (!m) return Number(token);
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return 0;
  const u = (m[2] || "").toLowerCase();
  if (u === "kb" || u === "kib") return n * 1024;
  if (u === "mb" || u === "mib") return n * 1024 ** 2;
  if (u === "gb" || u === "gib") return n * 1024 ** 3;
  if (u === "tb" || u === "tib") return n * 1024 ** 4;
  return n;
}

/**
 * @param {string} clock mm:ss or hh:mm:ss
 */
function parseClock(clock) {
  const parts = String(clock)
    .split(":")
    .map((p) => Number(p));
  if (parts.some((n) => !Number.isFinite(n))) return null;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return null;
}

/**
 * @typedef {{
 *   filesDone: number,
 *   filesTotal: number,
 *   bytesDone: number,
 *   bytesTotal: number,
 *   desc: string,
 *   rate: string,
 *   elapsed: string,
 *   remaining: string,
 *   pct: number,
 * }} HfProgressState
 */

/** @returns {HfProgressState} */
export function emptyHfProgressState() {
  return {
    filesDone: 0,
    filesTotal: 0,
    bytesDone: 0,
    bytesTotal: 0,
    desc: "",
    rate: "",
    elapsed: "",
    remaining: "",
    pct: 0,
  };
}

/**
 * @param {HfProgressState} prev
 * @param {HfProgressEvent} ev
 * @returns {HfProgressState}
 */
export function applyHfProgressEvent(prev, ev) {
  const next = { ...prev, desc: ev.desc || prev.desc };
  if (ev.kind === "files") {
    next.filesDone = ev.n;
    if (ev.total) next.filesTotal = ev.total;
  } else if (ev.kind === "bytes") {
    next.bytesDone = ev.n;
    if (ev.total) next.bytesTotal = ev.total;
  }
  const rate = formatRate(ev.rate, ev.unit);
  if (rate) next.rate = rate;
  const elapsed = formatDuration(ev.elapsed);
  if (elapsed) next.elapsed = elapsed;
  const remaining = formatDuration(ev.remaining);
  if (remaining) next.remaining = remaining;

  if (next.filesTotal > 0) {
    const inner =
      next.bytesTotal > 0 ? next.bytesDone / next.bytesTotal : 0;
    next.pct = Math.min(
      99,
      Math.round(((next.filesDone + inner) / next.filesTotal) * 100),
    );
  } else if (ev.pct != null) {
    next.pct = Math.max(0, Math.min(99, Math.round(ev.pct)));
  } else if (next.bytesTotal > 0) {
    next.pct = Math.min(
      99,
      Math.round((next.bytesDone / next.bytesTotal) * 100),
    );
  }
  return next;
}

/**
 * @param {HfProgressState} st
 * @param {string} repo
 */
export function formatHfProgressDetail(st, repo) {
  const bits = [];
  if (st.filesTotal > 0) {
    bits.push(`файлы ${st.filesDone}/${st.filesTotal}`);
  }
  if (st.bytesTotal > 0) {
    bits.push(`${formatBytes(st.bytesDone)} / ${formatBytes(st.bytesTotal)}`);
  }
  if (st.rate) bits.push(st.rate);
  if (st.remaining) bits.push(`осталось ${st.remaining}`);
  else if (st.elapsed) bits.push(`прошло ${st.elapsed}`);
  if (st.desc && !/fetching/i.test(st.desc) && st.desc !== repo) {
    bits.unshift(st.desc.replace(/:\s*$/, ""));
  }
  return bits.join(" · ") || `качаю ${repo}`;
}
