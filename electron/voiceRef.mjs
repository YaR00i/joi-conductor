/**
 * Voice clone refs live under <project>/voice-refs/<slug>/{ref,sovits-ref}.wav.
 * Import writes only those canonical names; Explorer can open the folder.
 */
import { dialog, shell } from "electron";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

/** @type {string | null} */
let lastPickDir = null;

const VOICE_REF_REL =
  /^voice-refs\/(hu-tao|furina|sunna|sparkle)\/(ref|sovits-ref)\.wav$/i;

/**
 * @param {string} rel
 * @returns {string | null}
 */
export function normalizeVoiceRefRel(rel) {
  const n = String(rel || "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .trim();
  const m = n.match(VOICE_REF_REL);
  if (!m) return null;
  const file = m[2].toLowerCase() === "sovits-ref" ? "sovits-ref.wav" : "ref.wav";
  return `voice-refs/${m[1].toLowerCase()}/${file}`;
}

/**
 * @param {string} projectRoot
 * @param {string} relOrAbs
 * @returns {string | null}
 */
export function resolveVoiceRefShowPath(projectRoot, relOrAbs) {
  const raw = String(relOrAbs || "").trim();
  if (!raw || raw.includes("\0")) return null;
  if (path.isAbsolute(raw)) return raw;
  const rel = raw.replace(/\\/g, "/");
  if (!rel || rel.includes("..")) return null;
  const abs = path.resolve(projectRoot, rel);
  const fromRoot = path.relative(projectRoot, abs);
  if (!fromRoot || fromRoot.startsWith("..") || path.isAbsolute(fromRoot)) {
    return null;
  }
  return abs;
}

/**
 * @param {string} projectRoot
 * @param {string} relOrAbs
 */
export function statVoiceRef(projectRoot, relOrAbs) {
  const canonical = normalizeVoiceRefRel(relOrAbs);
  const abs = resolveVoiceRefShowPath(
    projectRoot,
    canonical || String(relOrAbs || "").trim(),
  );
  if (!abs) return { exists: false, path: null };
  try {
    const st = statSync(abs);
    if (!st.isFile() || st.size < 64) {
      return { exists: false, path: abs, bytes: st.size };
    }
    return { exists: true, path: abs, bytes: st.size };
  } catch {
    return { exists: false, path: abs };
  }
}

/**
 * @param {string} projectRoot
 * @param {string} relOrAbs
 */
export async function showVoiceRefFolder(projectRoot, relOrAbs) {
  const canonical = normalizeVoiceRefRel(relOrAbs);
  const abs =
    resolveVoiceRefShowPath(projectRoot, canonical || relOrAbs) ||
    (canonical
      ? path.resolve(projectRoot, canonical)
      : path.resolve(projectRoot, "voice-refs"));
  const dir = path.extname(abs) ? path.dirname(abs) : abs;
  mkdirSync(dir, { recursive: true });
  if (existsSync(abs) && path.extname(abs)) {
    shell.showItemInFolder(abs);
    return { ok: true, path: abs };
  }
  const err = await shell.openPath(dir);
  if (err) return { ok: false, detail: err, path: dir };
  return { ok: true, path: dir };
}

/**
 * @param {import('electron').BrowserWindow | null} win
 */
export async function pickVoiceRefSource(win) {
  const parent = win && !win.isDestroyed() ? win : null;
  const defaultPath =
    lastPickDir || path.join(os.homedir(), "Desktop");
  const opts = {
    title: "Референс голоса",
    defaultPath: existsSync(defaultPath) ? defaultPath : os.homedir(),
    properties: ["openFile"],
    filters: [
      {
        name: "Аудио",
        extensions: ["ogg", "wav", "mp3", "flac", "m4a", "opus", "aac", "wma"],
      },
      { name: "Все файлы", extensions: ["*"] },
    ],
  };
  const result = parent
    ? await dialog.showOpenDialog(parent, opts)
    : await dialog.showOpenDialog(opts);
  if (result.canceled || !result.filePaths[0]) {
    return { ok: true, canceled: true };
  }
  const sourcePath = result.filePaths[0];
  lastPickDir = path.dirname(sourcePath);
  const stOk = existsSync(sourcePath);
  if (!stOk) return { ok: false, detail: "файл исчез после выбора" };
  const buf = readFileSync(sourcePath);
  if (buf.length < 64) {
    return { ok: false, detail: "файл слишком короткий" };
  }
  if (buf.length > 40 * 1024 * 1024) {
    return { ok: false, detail: "файл больше 40 МБ" };
  }
  return {
    ok: true,
    canceled: false,
    sourcePath,
    bytesBase64: buf.toString("base64"),
  };
}

/**
 * @param {string} projectRoot
 * @param {string} destRel
 * @param {string} wavBase64
 */
export function writeVoiceRefWav(projectRoot, destRel, wavBase64) {
  const rel = normalizeVoiceRefRel(destRel);
  if (!rel) {
    return {
      ok: false,
      detail: "путь должен быть voice-refs/<госпожа>/ref.wav или sovits-ref.wav",
    };
  }
  const raw = String(wavBase64 || "").trim();
  if (!raw) return { ok: false, detail: "нет wav" };
  let data;
  try {
    data = Buffer.from(raw, "base64");
  } catch {
    return { ok: false, detail: "битый base64" };
  }
  if (data.length < 64 || data.subarray(0, 4).toString("ascii") !== "RIFF") {
    return { ok: false, detail: "ожидался PCM WAV" };
  }
  if (data.length > 20 * 1024 * 1024) {
    return { ok: false, detail: "wav слишком большой" };
  }
  const abs = path.resolve(projectRoot, rel);
  mkdirSync(path.dirname(abs), { recursive: true });
  const tmp = `${abs}.tmp`;
  writeFileSync(tmp, data);
  renameSync(tmp, abs);
  return { ok: true, relPath: rel, path: abs, bytes: data.length };
}
