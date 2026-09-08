const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("joiDesktop", {
  isDesktop: true,
  nativeControls: false,
  minimize: () => ipcRenderer.send("window:minimize"),
  maximize: () => ipcRenderer.send("window:maximize"),
  close: () => ipcRenderer.send("window:close"),
  setFullScreen: (on) => ipcRenderer.invoke("window:set-fullscreen", Boolean(on)),
  toggleFullScreen: () => ipcRenderer.invoke("window:toggle-fullscreen"),
  isFullScreen: () => ipcRenderer.invoke("window:is-fullscreen"),
  onMaximized: (cb) => {
    const handler = (_e, value) => cb(Boolean(value));
    ipcRenderer.on("window:maximized", handler);
    return () => ipcRenderer.removeListener("window:maximized", handler);
  },
  onFullScreen: (cb) => {
    const handler = (_e, value) => cb(Boolean(value));
    ipcRenderer.on("window:fullscreen", handler);
    return () => ipcRenderer.removeListener("window:fullscreen", handler);
  },
  cursor: {
    clip: (rect) => ipcRenderer.invoke("cursor:clip", rect),
    unclip: () => ipcRenderer.invoke("cursor:unclip"),
    warpCenter: () => ipcRenderer.send("cursor:warp-center"),
  },
  ollama: {
    status: (preferredModel) =>
      ipcRenderer.invoke("ollama:status", preferredModel ?? ""),
    start: (preferredModel) =>
      ipcRenderer.invoke("ollama:start", preferredModel ?? ""),
    stop: () => ipcRenderer.invoke("ollama:stop"),
    models: () => ipcRenderer.invoke("ollama:models"),
    pull: (model) => ipcRenderer.invoke("ollama:pull", model),
    delete: (model) => ipcRenderer.invoke("ollama:delete", model),
    searchHtml: (query) => ipcRenderer.invoke("ollama:search-html", query),
    onPullProgress: (cb) => {
      const handler = (_e, payload) => cb(payload);
      ipcRenderer.on("ollama:pull-progress", handler);
      return () =>
        ipcRenderer.removeListener("ollama:pull-progress", handler);
    },
  },
  shell: {
    openExternal: (url) => ipcRenderer.invoke("shell:open-external", url),
    showTempFile: (payload) =>
      ipcRenderer.invoke("shell:show-temp-file", payload),
  },
  ember: {
    readText: (relPath) => ipcRenderer.invoke("ember:read-text", relPath),
    readBytes: (relPath) => ipcRenderer.invoke("ember:read-bytes", relPath),
    writeText: (relPath, text) =>
      ipcRenderer.invoke("ember:write-text", relPath, text),
    writeBytes: (relPath, base64) =>
      ipcRenderer.invoke("ember:write-bytes", relPath, base64),
    delete: (relPath) => ipcRenderer.invoke("ember:delete", relPath),
    list: (relDir) => ipcRenderer.invoke("ember:list", relDir),
    openPath: (relPath) => ipcRenderer.invoke("ember:open-path", relPath),
    watch: (relPath) => ipcRenderer.invoke("ember:watch", relPath),
    unwatch: () => ipcRenderer.invoke("ember:unwatch"),
    onFileChanged: (cb) => {
      const handler = (_e, payload) => cb(payload);
      ipcRenderer.on("ember:file-changed", handler);
      return () =>
        ipcRenderer.removeListener("ember:file-changed", handler);
    },
  },
  python: {
    status: () => ipcRenderer.invoke("python:status"),
    install: () => ipcRenderer.invoke("python:install"),
    onInstallProgress: (cb) => {
      const handler = (_e, payload) => cb(payload);
      ipcRenderer.on("python:install-progress", handler);
      return () =>
        ipcRenderer.removeListener("python:install-progress", handler);
    },
  },
  tts: {
    voices: () => ipcRenderer.invoke("tts:voices"),
    speak: (payload) => ipcRenderer.invoke("tts:speak", payload),
    stop: () => ipcRenderer.invoke("tts:stop"),
    piperStatus: () => ipcRenderer.invoke("tts:piper-status"),
    installPiper: () => ipcRenderer.invoke("tts:piper-install"),
    uninstallPiper: () => ipcRenderer.invoke("tts:piper-uninstall"),
    onPiperProgress: (cb) => {
      const handler = (_e, payload) => cb(payload);
      ipcRenderer.on("tts:piper-progress", handler);
      return () =>
        ipcRenderer.removeListener("tts:piper-progress", handler);
    },
    sovitsStatus: (opts) =>
      ipcRenderer.invoke(
        "tts:sovits-status",
        typeof opts === "string" ? { baseUrl: opts } : opts ?? {},
      ),
    sovitsStart: (opts) => ipcRenderer.invoke("tts:sovits-start", opts ?? {}),
    sovitsStop: (opts) => ipcRenderer.invoke("tts:sovits-stop", opts ?? {}),
    sovitsInstallStatus: () => ipcRenderer.invoke("tts:sovits-install-status"),
    installSovits: () => ipcRenderer.invoke("tts:sovits-install"),
    uninstallSovits: () => ipcRenderer.invoke("tts:sovits-uninstall"),
    onSovitsInstallProgress: (cb) => {
      const handler = (_e, payload) => cb(payload);
      ipcRenderer.on("tts:sovits-install-progress", handler);
      return () =>
        ipcRenderer.removeListener("tts:sovits-install-progress", handler);
    },
    qwenStatus: (opts) =>
      ipcRenderer.invoke(
        "tts:qwen-status",
        typeof opts === "string" ? { baseUrl: opts } : opts ?? {},
      ),
    qwenStart: (opts) => ipcRenderer.invoke("tts:qwen-start", opts ?? {}),
    qwenStop: (opts) => ipcRenderer.invoke("tts:qwen-stop", opts ?? {}),
    qwenInstallStatus: () => ipcRenderer.invoke("tts:qwen-install-status"),
    installQwenModel: (target) =>
      ipcRenderer.invoke("tts:qwen-install", { target }),
    uninstallQwenModel: (target) =>
      ipcRenderer.invoke("tts:qwen-uninstall", { target }),
    onQwenInstallProgress: (cb) => {
      const handler = (_e, payload) => cb(payload);
      ipcRenderer.on("tts:qwen-install-progress", handler);
      return () =>
        ipcRenderer.removeListener("tts:qwen-install-progress", handler);
    },
    voiceRefShow: (relPath) =>
      ipcRenderer.invoke("tts:voice-ref-show", relPath ?? ""),
    voiceRefStat: (relPath) =>
      ipcRenderer.invoke("tts:voice-ref-stat", relPath ?? ""),
    voiceRefPick: () => ipcRenderer.invoke("tts:voice-ref-pick"),
    voiceRefWrite: (payload) =>
      ipcRenderer.invoke("tts:voice-ref-write", payload ?? {}),
  },
  media: {
    wd14Status: (opts) =>
      ipcRenderer.invoke(
        "media:wd14-status",
        typeof opts === "string" ? { baseUrl: opts } : opts ?? {},
      ),
    wd14Start: (opts) => ipcRenderer.invoke("media:wd14-start", opts ?? {}),
    wd14Stop: (opts) => ipcRenderer.invoke("media:wd14-stop", opts ?? {}),
    onWd14Progress: (cb) => {
      const handler = (_e, payload) => cb(payload);
      ipcRenderer.on("media:wd14-progress", handler);
      return () =>
        ipcRenderer.removeListener("media:wd14-progress", handler);
    },
    tagImage: (payload) => ipcRenderer.invoke("media:wd14-tag", payload),
    censorDetectStatus: () =>
      ipcRenderer.invoke("media:censor-detect-status"),
    censorDetectInstall: () =>
      ipcRenderer.invoke("media:censor-detect-install"),
    censorDetectModel: () => ipcRenderer.invoke("media:censor-detect-model"),
    censorDetectAnimeModel: () =>
      ipcRenderer.invoke("media:censor-detect-anime-model"),
    censorDetectBooruModel: () =>
      ipcRenderer.invoke("media:censor-detect-booru-model"),
    censorDetectHandModel: () =>
      ipcRenderer.invoke("media:censor-detect-hand-model"),
    censorDetectPpModel: () =>
      ipcRenderer.invoke("media:censor-detect-pp-model"),
    onCensorDetectProgress: (cb) => {
      const handler = (_e, payload) => cb(payload);
      ipcRenderer.on("media:censor-detect-progress", handler);
      return () =>
        ipcRenderer.removeListener("media:censor-detect-progress", handler);
    },
  },
  device: {
    status: () => ipcRenderer.invoke("device:status"),
    connect: (opts) => ipcRenderer.invoke("device:connect", opts ?? {}),
    disconnect: () => ipcRenderer.invoke("device:disconnect"),
    stop: () => ipcRenderer.invoke("device:stop"),
    setIntensity: (intensity, level) =>
      ipcRenderer.invoke("device:set-intensity", intensity, level),
  },
});
