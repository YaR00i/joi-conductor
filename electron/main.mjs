import {
  app,
  BrowserWindow,
  ipcMain,
  net,
  protocol,
  screen,
  session,
  shell,
} from "electron";
import {
  appendFileSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  watch,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  getOllamaStatus,
  listOllamaModels,
  ollamaVersion,
  pullOllamaModel,
  deleteOllamaModel,
  startOllamaServe,
  stopManagedOllama,
  stopOllamaOnQuit,
} from "./ollama.mjs";
import { fetchOllamaSearchHtml } from "./ollamaSearch.mjs";
import { EDGE_RU_VOICES, synthesizeEdgeTts } from "./tts.mjs";
import {
  getPiperStatus,
  installPiper,
  uninstallPiper,
  PIPER_VOICES,
  synthesizePiperTts,
} from "./piper.mjs";
import { pingSovits, synthesizeSovitsTts } from "./sovits.mjs";
import {
  shouldRefreshJsonBak,
  voxelLibraryWriteGuard,
} from "./emberVoxelWriteGuard.mjs";
import { emberWatchEventMatches } from "./emberVoxWatch.mjs";
import { getQwenStatus, synthesizeQwenTts } from "./qwen.mjs";
import {
  getQwenInstallStatus,
  installQwenTtsModel,
  uninstallQwenModel,
} from "./qwenInstall.mjs";
import {
  getQwenProcessStatus,
  startQwenProcess,
  stopQwenOnQuit,
  stopQwenProcess,
} from "./qwenProcess.mjs";
import {
  getWd14ProcessStatus,
  startWd14Process,
  stopWd14OnQuit,
  stopWd14Process,
} from "./wd14Process.mjs";
import { tagImageViaServer } from "./wd14Client.mjs";
import {
  CENSOR_DETECT_ORT_FILES,
  censorDetectOrtDir,
  getCensorDetectStatus,
  installCensorDetect,
  readCensorDetectAnimeModel,
  readCensorDetectBooruModel,
  readCensorDetectHandModel,
  readCensorDetectModel,
  readCensorDetectPpModel,
} from "./censorDetectInstall.mjs";
import {
  getSovitsProcessStatus,
  startSovitsProcess,
  stopSovitsOnQuit,
  stopSovitsProcess,
} from "./sovitsProcess.mjs";
import {
  getSovitsInstallStatus,
  installSovitsRuntime,
  uninstallSovitsRuntime,
} from "./sovitsInstall.mjs";
import { playWavOnHost, stopHostAudio } from "./audioOut.mjs";
import {
  applyCursorClip,
  reapplyCursorClip,
  releaseCursorClip,
  stopCursorGrab,
  warpCursorToWindow,
} from "./cursorClip.mjs";
import {
  pickVoiceRefSource,
  showVoiceRefFolder,
  statVoiceRef,
  writeVoiceRefWav,
} from "./voiceRef.mjs";
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

protocol.registerSchemesAsPrivileged([
  {
    scheme: "joi-censor",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);

// One window owns the pack and the dev server; a second launch focuses the
// existing window instead of racing it for content/ember writes.
const singleInstanceLockHeld = app.requestSingleInstanceLock();
if (!singleInstanceLockHeld) app.quit();

app.on("second-instance", () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
});

// A stray throw in main would exit before before-quit runs and orphan the
// managed child processes (ollama/qwen/sovits/wd14). Log and stay alive.
const mainErrorLogPath = path.join(app.getPath("userData"), "main-errors.log");

function logMainError(kind, err) {
  const detail =
    err instanceof Error ? err.stack ?? err.message : String(err);
  const line = `${new Date().toISOString()} ${kind} ${detail}\n`;
  console.error(line.trimEnd());
  try {
    mkdirSync(path.dirname(mainErrorLogPath), { recursive: true });
    if (
      existsSync(mainErrorLogPath) &&
      statSync(mainErrorLogPath).size > 1_000_000
    ) {
      renameSync(mainErrorLogPath, `${mainErrorLogPath}.old`);
    }
    appendFileSync(mainErrorLogPath, line, "utf8");
  } catch {
    // logging must never take main down
  }
}

process.on("uncaughtException", (err) => logMainError("uncaughtException", err));
process.on("unhandledRejection", (reason) =>
  logMainError("unhandledRejection", reason),
);

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

/** Safe re-register so a stale/double load cannot skip later channels. */
function handleIpc(channel, listener) {
  try {
    ipcMain.removeHandler(channel);
  } catch {
    // first registration
  }
  ipcMain.handle(channel, listener);
}

function createWindow() {
  // Layout is authored for Full HD. Clamp to the work area so a 1080p
  // desktop with a taskbar still fits; agents check UI at 1920×1080.
  const work = screen.getPrimaryDisplay().workAreaSize;
  mainWindow = new BrowserWindow({
    width: Math.min(1920, work.width),
    height: Math.min(1080, work.height),
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

  mainWindow.setMenu(null);

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
  mainWindow.on("blur", () => {
    releaseCursorClip();
  });
  mainWindow.on("minimize", () => {
    releaseCursorClip();
  });
  mainWindow.on("focus", () => {
    reapplyCursorClip();
  });
  mainWindow.on("closed", () => {
    releaseCursorClip();
  });

  // F11 → Electron fullscreen (hides taskbar) + notify renderer to hide titlebar.
  mainWindow.webContents.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown") return;
    if (input.key !== "F11" && input.code !== "F11") return;
    event.preventDefault();
    applyFullscreen(!mainWindow?.isFullScreen());
  });

  void mainWindow.loadURL(startUrl);
}

function configureSessionPermissions() {
  const ses = session.defaultSession;
  const allow = (permission) =>
    permission === "media" ||
    permission === "audioCapture" ||
    permission === "mediaKeySystem" ||
    // Native <video> controls call requestFullscreen(); denying this makes
    // the player's fullscreen button a silent no-op.
    permission === "fullscreen" ||
    // Ember's relative mouse-look depends on Pointer Lock. Denying it forces
    // the OS cursor-warp fallback, whose synthetic moves are less regular.
    permission === "pointerLock";
  ses.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(allow(permission));
  });
  ses.setPermissionCheckHandler((_wc, permission) => allow(permission));

  protocol.handle("joi-censor", (request) => {
    const name = path.basename(new URL(request.url).pathname);
    if (!CENSOR_DETECT_ORT_FILES.includes(name)) {
      return new Response("not found", { status: 404 });
    }
    const file = path.join(censorDetectOrtDir(), name);
    if (!existsSync(file)) {
      return new Response("missing", { status: 404 });
    }
    return net.fetch(pathToFileURL(file).href);
  });
}

const MEDIA_CDN_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

function mediaCdnReferer(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (host === "nhentai.net" || host.endsWith(".nhentai.net")) {
      return "https://nhentai.net/";
    }
    if (
      host === "the-joi-database.com" ||
      host.endsWith(".the-joi-database.com")
    ) {
      return "https://www.the-joi-database.com/";
    }
    if (host === "gelbooru.com" || host.endsWith(".gelbooru.com")) {
      return "https://gelbooru.com/";
    }
    if (host === "xbooru.com" || host.endsWith(".xbooru.com")) {
      return "https://xbooru.com/";
    }
    if (host === "hypnohub.net" || host.endsWith(".hypnohub.net")) {
      return "https://hypnohub.net/";
    }
    if (host === "realbooru.com" || host.endsWith(".realbooru.com")) {
      return "https://realbooru.com/";
    }
    if (host === "thumbs.booru.org" || host === "img.booru.org") {
      const slug = parsed.pathname.split("/").filter(Boolean)[0]?.toLowerCase();
      if (slug === "censored" || slug === "blacked") {
        return `https://${slug}.booru.org/`;
      }
    }
    if (
      host.endsWith(".booru.org") &&
      host !== "booru.org" &&
      host !== "thumbs.booru.org" &&
      host !== "img.booru.org"
    ) {
      return `https://${host}/`;
    }
  } catch {
    return null;
  }
  return null;
}

/** Let <video>/<img> hit the CDN like the site (hotlink). XHR still uses the proxy. */
function configureMediaCdnHeaders() {
  const filter = {
    urls: [
      "https://*.gelbooru.com/*",
      "https://gelbooru.com/*",
      "https://*.xbooru.com/*",
      "https://xbooru.com/*",
      "https://*.hypnohub.net/*",
      "https://hypnohub.net/*",
      "https://*.realbooru.com/*",
      "https://realbooru.com/*",
      "https://*.nhentai.net/*",
      "https://nhentai.net/*",
      "https://www.the-joi-database.com/*",
      "https://the-joi-database.com/*",
      "https://*.the-joi-database.com/*",
      "https://thumbs.booru.org/*",
      "https://img.booru.org/*",
      "https://*.booru.org/*",
    ],
  };
  session.defaultSession.webRequest.onBeforeSendHeaders(
    filter,
    (details, callback) => {
      const referer = mediaCdnReferer(details.url);
      const requestHeaders = { ...details.requestHeaders };
      if (referer) {
        requestHeaders.Referer = referer;
        requestHeaders["User-Agent"] = MEDIA_CDN_UA;
      }
      callback({ requestHeaders });
    },
  );
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
handleIpc("cursor:clip", () => {
  if (!mainWindow) return { ok: false };
  return applyCursorClip(mainWindow);
});
handleIpc("cursor:unclip", () => releaseCursorClip());
ipcMain.on("cursor:warp-center", () => {
  warpCursorToWindow(mainWindow);
});

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
function writeEmberFileAtomic(abs, data, encoding, relPath) {
  mkdirSync(path.dirname(abs), { recursive: true });
  const temp = `${abs}.tmp-${process.pid}-${Date.now()}-${emberWriteNonce++}`;
  try {
    writeFileSync(temp, data, encoding);
    if (existsSync(abs) && abs.toLowerCase().endsWith(".json")) {
      try {
        const current = readFileSync(abs, "utf8");
        JSON.parse(current);
        const bakPath = `${abs}.bak`;
        const bakText = existsSync(bakPath) ? readFileSync(bakPath, "utf8") : null;
        if (shouldRefreshJsonBak(relPath ?? abs, current, bakText)) {
          copyFileSync(abs, bakPath);
        }
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

ipcMain.handle("ember:read-bytes", async (_e, relPath) => {
  const abs = resolveEmberPath(relPath);
  if (!abs) return { ok: false, detail: "bad path" };
  if (!existsSync(abs)) return { ok: false, detail: "not found" };
  try {
    return { ok: true, base64: readFileSync(abs).toString("base64") };
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
      if (existsSync(abs)) {
        let prev = "";
        try {
          prev = readFileSync(abs, "utf8");
        } catch {
          prev = "";
        }
        const guard = voxelLibraryWriteGuard(relPath, text, prev);
        if (!guard.ok) return { ok: false, detail: guard.detail };
      }
    }
    writeEmberFileAtomic(abs, text, "utf8", relPath);
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
      // Crash-leftover `.tmp-*` siblings and `.bak` backups are not content.
      if (/\.tmp-/.test(name) || name.endsWith(".bak.json")) return false;
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

/** One directory watcher per renderer, filtered by the watched pack-relative file. */
const emberFileWatches = new Map();

function stopEmberFileWatch(webContentsId) {
  const entry = emberFileWatches.get(webContentsId);
  if (!entry) return;
  try {
    entry.watcher.close();
  } catch {
    // ignore
  }
  if (entry.timer) clearTimeout(entry.timer);
  emberFileWatches.delete(webContentsId);
}

ipcMain.handle("ember:open-path", async (_e, relPath) => {
  const abs = resolveEmberPath(relPath);
  if (!abs) return { ok: false, detail: "bad path" };
  if (!existsSync(abs)) return { ok: false, detail: "not found" };
  try {
    const err = await shell.openPath(abs);
    if (err) return { ok: false, detail: err };
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      detail: err instanceof Error ? err.message : "open failed",
    };
  }
});

ipcMain.handle("ember:watch", async (event, relPath) => {
  const abs = resolveEmberPath(relPath);
  if (!abs) return { ok: false, detail: "bad path" };
  const wc = event.sender;
  const wcId = wc.id;
  stopEmberFileWatch(wcId);
  const dir = path.dirname(abs);
  try {
    mkdirSync(dir, { recursive: true });
  } catch {
    return { ok: false, detail: "mkdir failed" };
  }
  const rel = String(relPath).replace(/\\/g, "/").replace(/^\/+/, "");
  let timer = null;
  let watcher;
  try {
    watcher = watch(dir, (eventType, filename) => {
      if (!emberWatchEventMatches(rel, filename ?? "")) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        const current = emberFileWatches.get(wcId);
        if (current) current.timer = null;
        if (wc.isDestroyed()) return;
        wc.send("ember:file-changed", { rel, eventType });
      }, 450);
      const current = emberFileWatches.get(wcId);
      if (current) current.timer = timer;
    });
  } catch (err) {
    return {
      ok: false,
      detail: err instanceof Error ? err.message : "watch failed",
    };
  }
  emberFileWatches.set(wcId, { watcher, rel, timer });
  wc.once("destroyed", () => stopEmberFileWatch(wcId));
  return { ok: true };
});

ipcMain.handle("ember:unwatch", async (event) => {
  stopEmberFileWatch(event.sender.id);
  return { ok: true };
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

ipcMain.handle("ollama:start", async (event, preferredModel) => {
  await startOllamaServe((p) => {
    event.sender.send("ollama:pull-progress", {
      model: "ollama",
      line: p.detail ? `${p.phase} · ${p.detail}` : p.phase,
      phase: p.phase,
      pct: p.pct,
    });
  });
  return getOllamaStatus(
    typeof preferredModel === "string" ? preferredModel : "",
  );
});

ipcMain.handle("ollama:stop", async () => {
  const stopped = stopManagedOllama();
  return { stopped, ...(await getOllamaStatus()) };
});

ipcMain.handle("ollama:models", async () => listOllamaModels());

ipcMain.handle("ollama:search-html", async (_e, query) => {
  return fetchOllamaSearchHtml(typeof query === "string" ? query : "");
});

ipcMain.handle("ollama:pull", async (event, model) => {
  if (typeof model !== "string" || !model.trim()) {
    throw new Error("Укажи имя модели");
  }
  const name = model.trim();
  await pullOllamaModel(name, (payload) => {
    const line =
      typeof payload === "string" ? payload : payload.line || payload.phase || "";
    event.sender.send("ollama:pull-progress", {
      model: name,
      line,
      phase: typeof payload === "object" ? payload.phase : undefined,
      pct: typeof payload === "object" ? payload.pct : undefined,
    });
  });
  return getOllamaStatus(name);
});

ipcMain.handle("ollama:delete", async (_e, model) => {
  if (typeof model !== "string" || !model.trim()) {
    throw new Error("Укажи имя модели");
  }
  await deleteOllamaModel(model.trim());
  return getOllamaStatus();
});

ipcMain.handle("tts:voices", async () => {
  return {
    edge: EDGE_RU_VOICES,
    piper: PIPER_VOICES,
    piperStatus: getPiperStatus(),
  };
});

ipcMain.handle("tts:voice-ref-show", async (_e, relPath) => {
  return showVoiceRefFolder(root, String(relPath ?? ""));
});

ipcMain.handle("tts:voice-ref-stat", async (_e, relPath) => {
  return statVoiceRef(root, String(relPath ?? ""));
});

ipcMain.handle("tts:voice-ref-pick", async () => {
  return pickVoiceRefSource(mainWindow);
});

ipcMain.handle("tts:voice-ref-write", async (_e, payload) => {
  return writeVoiceRefWav(
    root,
    String(payload?.destRel ?? ""),
    String(payload?.wavBase64 ?? ""),
  );
});

handleIpc("tts:piper-status", async () => getPiperStatus());

handleIpc("tts:piper-install", async (event) => {
  return installPiper((p) => {
    event.sender.send("tts:piper-progress", p);
  });
});

handleIpc("tts:piper-uninstall", async () => uninstallPiper());

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

handleIpc("tts:sovits-install-status", async () => getSovitsInstallStatus());

handleIpc("tts:sovits-install", async (event) => {
  return installSovitsRuntime((p) => {
    event.sender.send("tts:sovits-install-progress", p);
  });
});

handleIpc("tts:sovits-uninstall", async () => {
  stopSovitsProcess({ forcePort: true });
  return uninstallSovitsRuntime();
});

ipcMain.handle("tts:stop", async () => {
  stopHostAudio();
  return { ok: true };
});

handleIpc("tts:qwen-status", async (_e, payload) => {
  const opts =
    payload && typeof payload === "object"
      ? payload
      : { baseUrl: typeof payload === "string" ? payload : "" };
  return getQwenProcessStatus(opts);
});

handleIpc("tts:qwen-start", async (_e, payload) => {
  const opts = payload && typeof payload === "object" ? payload : {};
  await startQwenProcess(opts);
  return getQwenProcessStatus(opts);
});

handleIpc("tts:qwen-stop", async (_e, payload) => {
  const opts = payload && typeof payload === "object" ? payload : {};
  const stopped = stopQwenProcess({ ...opts, forcePort: true });
  return { stopped, ...(await getQwenProcessStatus(opts)) };
});

handleIpc("tts:qwen-install-status", async () => getQwenInstallStatus());

handleIpc("tts:qwen-install", async (event, payload) => {
  const target =
    payload && typeof payload === "object" ? payload.target : payload;
  return installQwenTtsModel(String(target || "custom_voice"), (p) => {
    event.sender.send("tts:qwen-install-progress", p);
  });
});

handleIpc("tts:qwen-uninstall", async (_e, payload) => {
  const target =
    payload && typeof payload === "object" ? payload.target : payload;
  return uninstallQwenModel(String(target || "custom_voice"));
});

// ---- WD14 tagger (auto-tagging local images) ----
ipcMain.handle("media:wd14-status", async (_e, payload) => {
  const opts =
    payload && typeof payload === "object"
      ? payload
      : { baseUrl: typeof payload === "string" ? payload : "" };
  return getWd14ProcessStatus(opts);
});

ipcMain.handle("media:wd14-start", async (event, payload) => {
  const opts = payload && typeof payload === "object" ? payload : {};
  await startWd14Process(opts, (p) => {
    event.sender.send("media:wd14-progress", p);
  });
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

handleIpc("media:censor-detect-status", async () => getCensorDetectStatus());

handleIpc("media:censor-detect-install", async (event) => {
  return installCensorDetect((p) => {
    event.sender.send("media:censor-detect-progress", p);
  });
});

handleIpc("media:censor-detect-model", async () => readCensorDetectModel());

handleIpc("media:censor-detect-anime-model", async () =>
  readCensorDetectAnimeModel(),
);

handleIpc("media:censor-detect-booru-model", async () =>
  readCensorDetectBooruModel(),
);

handleIpc("media:censor-detect-hand-model", async () =>
  readCensorDetectHandModel(),
);

handleIpc("media:censor-detect-pp-model", async () =>
  readCensorDetectPpModel(),
);

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
  const volume =
    typeof payload.volume === "number" && Number.isFinite(payload.volume)
      ? Math.max(0, Math.min(2, payload.volume))
      : 1;

  const trySovits = async () => {
    let ref = String(
      payload.sovitsRefPath ?? payload.refAudioPath ?? "",
    ).trim();
    if (ref && !path.isAbsolute(ref)) {
      ref = path.resolve(root, ref);
    }
    return synthesizeSovitsTts({
      text: payload.text,
      baseUrl: payload.sovitsUrl,
      refAudioPath: ref,
      promptText: payload.sovitsPromptText ?? payload.promptText ?? "",
      promptLang: payload.promptLang ?? "en",
      textLang: payload.textLang ?? "en",
      emotion: payload.emotion,
      rate: payload.rate,
    });
  };
  const tryEdge = async () => synthesizeEdgeTts(payload);
  const tryPiper = async () => synthesizePiperTts(payload);
  const tryQwen = async () => {
    let ref = String(payload.qwenRefPath ?? payload.refAudioPath ?? "").trim();
    if (ref && !path.isAbsolute(ref)) {
      ref = path.resolve(root, ref);
    }
    return synthesizeQwenTts({
      text: payload.text,
      baseUrl: payload.qwenUrl,
      model: payload.qwenModel,
      voice: payload.qwenVoice,
      apiKey: payload.qwenApiKey,
      emotion: payload.emotion,
      rate: payload.rate,
      language: payload.textLang || "en",
      refAudio: ref,
      refText: payload.qwenPromptText ?? payload.promptText ?? "",
    });
  };

  let result;
  if (provider === "sovits") result = await trySovits();
  else if (provider === "qwen" || provider === "qwen-cpu") result = await tryQwen();
  else if (provider === "edge") result = await tryEdge();
  else if (provider === "piper") result = await tryPiper();
  else {
    const sovitsGuess = String(
      payload.sovitsRefPath ?? payload.refAudioPath ?? "",
    ).trim();
    const sovitsAbs = sovitsGuess
      ? path.isAbsolute(sovitsGuess)
        ? sovitsGuess
        : path.resolve(root, sovitsGuess)
      : "";
    if (sovitsAbs && existsSync(sovitsAbs)) {
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
  const host = await playWavOnHost(wav, { volume });
  return {
    ...result,
    playedOnHost: host.played,
    hostPlayDetail: host.detail,
  };
});

app.whenReady().then(() => {
  if (!singleInstanceLockHeld) return;
  configureSessionPermissions();
  configureMediaCdnHeaders();
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
  for (const id of [...emberFileWatches.keys()]) stopEmberFileWatch(id);
  stopCursorGrab();
  deviceStopOnQuit();
  stopOllamaOnQuit();
  stopSovitsOnQuit();
  stopQwenOnQuit();
  stopWd14OnQuit();
});

app.on("window-all-closed", async () => {
  await deviceStopOnQuit();
  stopOllamaOnQuit();
  stopSovitsOnQuit();
  stopQwenOnQuit();
  stopWd14OnQuit();
  if (process.platform !== "darwin") app.quit();
});
