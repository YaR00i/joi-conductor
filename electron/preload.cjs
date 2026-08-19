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
  ollama: {
    status: (preferredModel) =>
      ipcRenderer.invoke("ollama:status", preferredModel ?? ""),
    start: (preferredModel) =>
      ipcRenderer.invoke("ollama:start", preferredModel ?? ""),
    stop: () => ipcRenderer.invoke("ollama:stop"),
    models: () => ipcRenderer.invoke("ollama:models"),
    pull: (model) => ipcRenderer.invoke("ollama:pull", model),
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
    writeText: (relPath, text) =>
      ipcRenderer.invoke("ember:write-text", relPath, text),
    writeBytes: (relPath, base64) =>
      ipcRenderer.invoke("ember:write-bytes", relPath, base64),
    delete: (relPath) => ipcRenderer.invoke("ember:delete", relPath),
    list: (relDir) => ipcRenderer.invoke("ember:list", relDir),
  },
  tts: {
    voices: () => ipcRenderer.invoke("tts:voices"),
    speak: (payload) => ipcRenderer.invoke("tts:speak", payload),
    stop: () => ipcRenderer.invoke("tts:stop"),
    piperStatus: () => ipcRenderer.invoke("tts:piper-status"),
    installPiper: () => ipcRenderer.invoke("tts:piper-install"),
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
    qwenStatus: (opts) =>
      ipcRenderer.invoke(
        "tts:qwen-status",
        typeof opts === "string" ? { baseUrl: opts } : opts ?? {},
      ),
  },
  media: {
    wd14Status: (opts) =>
      ipcRenderer.invoke(
        "media:wd14-status",
        typeof opts === "string" ? { baseUrl: opts } : opts ?? {},
      ),
    wd14Start: (opts) => ipcRenderer.invoke("media:wd14-start", opts ?? {}),
    wd14Stop: (opts) => ipcRenderer.invoke("media:wd14-stop", opts ?? {}),
    tagImage: (payload) => ipcRenderer.invoke("media:wd14-tag", payload),
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
