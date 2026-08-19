import { app, BrowserWindow, ipcMain, shell } from "electron";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  getOllamaStatus,
  listOllamaModels,
  ollamaVersion,
  pullOllamaModel,
  startOllamaServe,
  stopManagedOllama,
  stopOllamaOnQuit,
} from "./ollama.mjs";
import { EDGE_RU_VOICES, synthesizeEdgeTts } from "./tts.mjs";
import {
  getPiperStatus,
  installPiper,
  PIPER_VOICES,
  synthesizePiperTts,
} from "./piper.mjs";
import { pingSovits, synthesizeSovitsTts } from "./sovits.mjs";
import { getQwenStatus, synthesizeQwenTts } from "./qwen.mjs";
import {
  getWd14ProcessStatus,
  startWd14Process,
  stopWd14OnQuit,
  stopWd14Process,
} from "./wd14Process.mjs";
import { tagImageViaServer } from "./wd14Client.mjs";
import {
  getSovitsProcessStatus,
  startSovitsProcess,
  stopSovitsOnQuit,
  stopSovitsProcess,
} from "./sovitsProcess.mjs";
import { playWavOnHost, stopHostAudio } from "./audioOut.mjs";
import {
  deviceConnect,
  deviceDisconnect,
  deviceSetIntensity,
  deviceStatus,
  deviceStop,
  deviceStopOnQuit,
} from "./deviceBridge.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const port = Number(process.env.PORT || 5173);
const startUrl =
  process.env.JOI_CONDUCTOR_URL || `http://127.0.0.1:${port}`;

// Chromium often blocks/mutes media in Electron without this.
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");

if (process.platform === "win32") {
  app.setAppUserModelId("local.joi-conductor");
}

/** @type {BrowserWindow | null} */
let mainWindow = null;

/** Set fullscreen and always notify renderer (Windows frameless is flaky). */
function applyFullscreen(next) {
  if (!mainWindow) return false;
  mainWindow.setFullScreen(Boolean(next));
  const on = Boolean(mainWindow.isFullScreen());
  mainWindow.webContents.send("window:fullscreen", on);
  return on;
}

function iconPath() {
  const ico = path.join(root, "public", "icon.ico");
  const png = path.join(root, "public", "icon.png");
  if (process.platform === "win32" && existsSync(ico)) return ico;
  return png;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 980,
    minHeight: 640,
    show: false,
    frame: false,
    fullscreenable: true,
    title: "JOI Conductor",
    backgroundColor: "#07080a",
    icon: iconPath(),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow?.webContents.setAudioMuted(false);
    mainWindow?.show();
    mainWindow?.webContents.send(
      "window:maximized",
      Boolean(mainWindow?.isMaximized()),
    );
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  const sendMax = () => {
    mainWindow?.webContents.send(
      "window:maximized",
      Boolean(mainWindow?.isMaximized()),
    );
  };
  mainWindow.on("maximize", sendMax);
  mainWindow.on("unmaximize", sendMax);

  const sendFullscreen = () => {
    mainWindow?.webContents.send(
      "window:fullscreen",
      Boolean(mainWindow?.isFullScreen()),
    );
  };
  mainWindow.on("enter-full-screen", sendFullscreen);
  mainWindow.on("leave-full-screen", sendFullscreen);

  // F11 → Electron fullscreen (hides taskbar) + notify renderer to hide titlebar.
  mainWindow.webContents.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown") return;
    if (input.key !== "F11" && input.code !== "F11") return;
    event.preventDefault();
    applyFullscreen(!mainWindow?.isFullScreen());
  });

  void mainWindow.loadURL(startUrl);
}

ipcMain.on("window:minimize", () => mainWindow?.minimize());
ipcMain.on("window:maximize", () => {
  if (!mainWindow) return;
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
});
ipcMain.on("window:close", () => mainWindow?.close());
ipcMain.handle("window:set-fullscreen", (_e, value) =>
  applyFullscreen(Boolean(value)),
);
ipcMain.handle("window:toggle-fullscreen", () => {
  if (!mainWindow) return false;
  return applyFullscreen(!mainWindow.isFullScreen());
});
ipcMain.handle("window:is-fullscreen", () =>
  Boolean(mainWindow?.isFullScreen()),
);

ipcMain.handle("shell:open-external", async (_e, url) => {
  if (typeof url !== "string" || !/^https?:\/\//i.test(url)) {
    return { ok: false, detail: "bad url" };
  }
  await shell.openExternal(url);
  return { ok: true };
});

const emberRoot = path.join(root, "content", "ember");

/** Resolve a relative pack path safely under content/ember. */
function resolveEmberPath(relPath) {
  if (typeof relPath !== "string" || !relPath.trim()) return null;
  const rel = relPath.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!rel || rel.includes("..") || path.isAbsolute(rel) || rel.includes("\0")) {
    return null;
  }
  const abs = path.resolve(emberRoot, rel);
  if (!abs.startsWith(emberRoot)) return null;
  return abs;
}

let emberWriteNonce = 0;

/**
 * Write beside the destination, then replace it. A crash cannot leave the
 * actual content file half-written/truncated. JSON files also keep one last
 * known-good sibling backup (`.bak`).
 */
function writeEmberFileAtomic(abs, data, encoding) {
  mkdirSync(path.dirname(abs), { recursive: true });
  const temp = `${abs}.tmp-${process.pid}-${Date.now()}-${emberWriteNonce++}`;
  try {
    writeFileSync(temp, data, encoding);
    if (existsSync(abs) && abs.toLowerCase().endsWith(".json")) {
      try {
        JSON.parse(readFileSync(abs, "utf8"));
        copyFileSync(abs, `${abs}.bak`);
      } catch {
        // Never overwrite a known-good backup with a corrupt current file.
      }
    }
    renameSync(temp, abs);
  } catch (err) {
    try {
      if (existsSync(temp)) unlinkSync(temp);
    } catch {
      // Preserve the original write error.
    }
    throw err;
  }
}

ipcMain.handle("ember:read-text", async (_e, relPath) => {
  const abs = resolveEmberPath(relPath);
  if (!abs) return { ok: false, detail: "bad path" };
  if (!existsSync(abs)) return { ok: false, detail: "not found" };
  try {
    return { ok: true, text: readFileSync(abs, "utf8") };
  } catch (err) {
    return {
      ok: false,
      detail: err instanceof Error ? err.message : "read failed",
    };
  }
});

ipcMain.handle("ember:write-text", async (_e, relPath, text) => {
  const abs = resolveEmberPath(relPath);
  if (!abs) return { ok: false, detail: "bad path" };
  if (typeof text !== "string") return { ok: false, detail: "bad text" };
  try {
    if (abs.toLowerCase().endsWith(".json")) {
      try {
        JSON.parse(text);
      } catch (err) {
        return {
          ok: false,
          detail: `invalid JSON: ${err instanceof Error ? err.message : "parse"}`,
        };
      }
    }
    writeEmberFileAtomic(abs, text, "utf8");
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      detail: err instanceof Error ? err.message : "write failed",
    };
  }
});

ipcMain.handle("ember:write-bytes", async (_e, relPath, base64) => {
  const abs = resolveEmberPath(relPath);
  if (!abs) return { ok: false, detail: "bad path" };
  if (typeof base64 !== "string" || !base64) {
    return { ok: false, detail: "bad bytes" };
  }
  try {
    writeEmberFileAtomic(abs, Buffer.from(base64, "base64"));
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      detail: err instanceof Error ? err.message : "write failed",
    };
  }
});

ipcMain.handle("ember:delete", async (_e, relPath) => {
  const abs = resolveEmberPath(relPath);
  if (!abs) return { ok: false, detail: "bad path" };
  if (!existsSync(abs)) return { ok: true, missing: true };
  try {
    unlinkSync(abs);
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      detail: err instanceof Error ? err.message : "delete failed",
    };
  }
});

ipcMain.handle("ember:list", async (_e, relDir) => {
  const abs = resolveEmberPath(
    typeof relDir === "string" && relDir.trim() ? relDir : ".",
  );
  if (!abs) return { ok: false, detail: "bad path" };
  if (!existsSync(abs) || !statSync(abs).isDirectory()) {
    return { ok: true, names: [] };
  }
  try {
    const names = readdirSync(abs).filter((name) => {
      try {
        return statSync(path.join(abs, name)).isFile();
      } catch {
        return false;
      }
    });
    return { ok: true, names };
  } catch (err) {
    return {
      ok: false,
      detail: err instanceof Error ? err.message : "list failed",
    };
  }
});

ipcMain.handle("shell:show-temp-file", async (_e, payload) => {
  const fileName =
    typeof payload?.fileName === "string" && payload.fileName.trim()
      ? payload.fileName.trim().replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
      : "favorite.bin";
  const bytes = payload?.bytes;
  let data;
  if (bytes instanceof Uint8Array) data = Buffer.from(bytes);
  else if (bytes instanceof ArrayBuffer) data = Buffer.from(bytes);
  else if (ArrayBuffer.isView(bytes)) {
    data = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  } else if (Array.isArray(bytes)) data = Buffer.from(bytes);
  else if (bytes?.type === "Buffer" && Array.isArray(bytes.data)) {
    data = Buffer.from(bytes.data);
  } else {
    return { ok: false, detail: "no bytes" };
  }

  const dir = path.join(os.tmpdir(), "joi-conductor-favorites");
  mkdirSync(dir, { recursive: true });
  const safe = fileName.slice(0, 120) || "favorite.bin";
  const target = path.join(dir, safe);
  writeFileSync(target, data);
  shell.showItemInFolder(target);
  return { ok: true, path: target };
});

ipcMain.handle("ollama:status", async (_e, preferredModel) => {
  const status = await getOllamaStatus(
    typeof preferredModel === "string" ? preferredModel : "",
  );
  const version = await ollamaVersion();
  return { ...status, version };
});

ipcMain.handle("ollama:start", async (_e, preferredModel) => {
  await startOllamaServe();
  return getOllamaStatus(
    typeof preferredModel === "string" ? preferredModel : "",
  );
});

ipcMain.handle("ollama:stop", async () => {
  const stopped = stopManagedOllama();
  return { stopped, ...(await getOllamaStatus()) };
});

ipcMain.handle("ollama:models", async () => listOllamaModels());

ipcMain.handle("ollama:pull", async (event, model) => {
  if (typeof model !== "string" || !model.trim()) {
    throw new Error("Укажи имя модели");
  }
  const name = model.trim();
  await pullOllamaModel(name, (line) => {
    event.sender.send("ollama:pull-progress", { model: name, line });
  });
  return getOllamaStatus(name);
});

ipcMain.handle("tts:voices", async () => {
  return {
    edge: EDGE_RU_VOICES,
    piper: PIPER_VOICES,
    piperStatus: getPiperStatus(),
  };
});

ipcMain.handle("tts:piper-status", async () => getPiperStatus());

ipcMain.handle("tts:piper-install", async (event) => {
  return installPiper((p) => {
    event.sender.send("tts:piper-progress", p);
  });
});

ipcMain.handle("tts:sovits-status", async (_e, payload) => {
  const opts =
    payload && typeof payload === "object"
      ? payload
      : { baseUrl: typeof payload === "string" ? payload : "" };
  return getSovitsProcessStatus(opts);
});

ipcMain.handle("tts:sovits-start", async (_e, payload) => {
  const opts = payload && typeof payload === "object" ? payload : {};
  await startSovitsProcess(opts);
  return getSovitsProcessStatus(opts);
});

ipcMain.handle("tts:sovits-stop", async (_e, payload) => {
  const opts = payload && typeof payload === "object" ? payload : {};
  const stopped = stopSovitsProcess({
    ...opts,
    forcePort: true,
  });
  return { stopped, ...(await getSovitsProcessStatus(opts)) };
});

ipcMain.handle("tts:stop", async () => {
  stopHostAudio();
  return { ok: true };
});

ipcMain.handle("tts:qwen-status", async (_e, payload) => {
  const opts =
    payload && typeof payload === "object"
      ? payload
      : { baseUrl: typeof payload === "string" ? payload : "" };
  const baseUrl = String(opts.baseUrl || "").trim();
  return getQwenStatus(baseUrl);
});

// ---- WD14 tagger (auto-tagging local images) ----
ipcMain.handle("media:wd14-status", async (_e, payload) => {
  const opts =
    payload && typeof payload === "object"
      ? payload
      : { baseUrl: typeof payload === "string" ? payload : "" };
  return getWd14ProcessStatus(opts);
});

ipcMain.handle("media:wd14-start", async (_e, payload) => {
  const opts = payload && typeof payload === "object" ? payload : {};
  await startWd14Process(opts);
  return getWd14ProcessStatus(opts);
});

ipcMain.handle("media:wd14-stop", async (_e, payload) => {
  const opts = payload && typeof payload === "object" ? payload : {};
  const stopped = await stopWd14Process({ ...opts, forcePort: true });
  return { stopped, ...(await getWd14ProcessStatus(opts)) };
});

ipcMain.handle("media:wd14-tag", async (_e, payload) => {
  if (!payload || typeof payload !== "object") {
    throw new Error("Нет данных изображения для тегирования");
  }
  const raw = String(payload.base64 ?? "").trim();
  if (!raw) throw new Error("Пустой base64 изображения");
  const fileBytes = Buffer.from(raw, "base64");
  return tagImageViaServer({
    baseUrl: payload.baseUrl,
    fileBytes,
    mime: payload.mime || "image/png",
    generalThreshold: payload.generalThreshold,
    characterThreshold: payload.characterThreshold,
    maxTags: payload.maxTags,
  });
});

/** Monotonic id so overlapping tts:speak calls don't stack host playback. */
let ttsSpeakEpoch = 0;

ipcMain.handle("tts:speak", async (_e, payload) => {
  if (!payload || typeof payload !== "object") {
    throw new Error("Нет текста для озвучки");
  }
  const speakId = ++ttsSpeakEpoch;
  // Stop any current host playback immediately when a new line is requested.
  stopHostAudio();

  const provider = payload.provider ?? "auto";

  const trySovits = async () => {
    let ref = String(payload.refAudioPath ?? "").trim();
    if (ref && !path.isAbsolute(ref)) {
      ref = path.resolve(root, ref);
    }
    return synthesizeSovitsTts({
      text: payload.text,
      baseUrl: payload.sovitsUrl,
      refAudioPath: ref,
      promptText: payload.promptText ?? "",
      promptLang: payload.promptLang ?? "en",
      textLang: payload.textLang ?? "en",
      emotion: payload.emotion,
      rate: payload.rate,
    });
  };
  const tryEdge = async () => synthesizeEdgeTts(payload);
  const tryPiper = async () => synthesizePiperTts(payload);
  const tryQwen = async () =>
    synthesizeQwenTts({
      text: payload.text,
      baseUrl: payload.qwenUrl,
      model: payload.qwenModel,
      voice: payload.qwenVoice,
      apiKey: payload.qwenApiKey,
      emotion: payload.emotion,
      rate: payload.rate,
    });

  let result;
  if (provider === "sovits") result = await trySovits();
  else if (provider === "qwen") result = await tryQwen();
  else if (provider === "edge") result = await tryEdge();
  else if (provider === "piper") result = await tryPiper();
  else {
    const refGuess = String(payload.refAudioPath ?? "").trim();
    const refAbs = refGuess
      ? path.isAbsolute(refGuess)
        ? refGuess
        : path.resolve(root, refGuess)
      : "";
    if (refAbs && existsSync(refAbs)) {
      const st = await pingSovits(payload.sovitsUrl);
      if (st.online) {
        try {
          result = await trySovits();
        } catch {
          /* fall through */
        }
      }
    }
    // Qwen (vLLM) — high-quality multilingual; prefer over piper when online.
    if (!result && payload.qwenUrl) {
      try {
        const qs = await getQwenStatus(payload.qwenUrl);
        if (qs.online) result = await tryQwen();
      } catch {
        /* fall through */
      }
    }
    if (!result) {
      const piper = getPiperStatus();
      if (piper.ready) {
        try {
          result = await tryPiper();
        } catch {
          /* fall through */
        }
      }
    }
    if (!result) {
      try {
        result = await tryEdge();
      } catch (edgeErr) {
        if (getPiperStatus().ready) result = await tryPiper();
        else throw edgeErr;
      }
    }
  }

  if (speakId !== ttsSpeakEpoch) {
    return {
      ...result,
      playedOnHost: false,
      hostPlayDetail: "superseded before play",
    };
  }

  const wav = Buffer.from(result.base64, "base64");
  const volume =
    typeof payload.volume === "number" && Number.isFinite(payload.volume)
      ? Math.max(0, Math.min(2, payload.volume))
      : 1;
  const host = await playWavOnHost(wav, { volume });
  return {
    ...result,
    playedOnHost: host.played,
    hostPlayDetail: host.detail,
  };
});

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

ipcMain.handle("device:status", async () => deviceStatus());
ipcMain.handle("device:connect", async (_e, opts) => deviceConnect(opts ?? {}));
ipcMain.handle("device:disconnect", async () => deviceDisconnect());
ipcMain.handle("device:stop", async () => deviceStop());
ipcMain.handle("device:set-intensity", async (_e, intensity, level) =>
  deviceSetIntensity(intensity, level),
);

app.on("before-quit", () => {
  deviceStopOnQuit();
  stopOllamaOnQuit();
  stopSovitsOnQuit();
  stopWd14OnQuit();
});

app.on("window-all-closed", () => {
  deviceStopOnQuit();
  stopOllamaOnQuit();
  stopSovitsOnQuit();
  stopWd14OnQuit();
  if (process.platform !== "darwin") app.quit();
});
