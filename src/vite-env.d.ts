/// <reference types="vite/client" />

interface OllamaDesktopStatus {
  installed: boolean;
  running: boolean;
  ready: boolean;
  modelReady: boolean;
  models: string[];
  managedByApp: boolean;
  binaryPath: string | null;
  detail: string;
  baseUrl: string;
  version?: string | null;
}

interface JoiDesktopOllamaApi {
  status: (preferredModel?: string) => Promise<OllamaDesktopStatus>;
  start: (preferredModel?: string) => Promise<OllamaDesktopStatus>;
  stop: () => Promise<OllamaDesktopStatus & { stopped: boolean }>;
  models: () => Promise<string[]>;
  pull: (model: string) => Promise<OllamaDesktopStatus>;
  onPullProgress: (
    cb: (payload: { model: string; line: string }) => void,
  ) => () => void;
}

interface EdgeTtsVoiceInfo {
  id: string;
  nameRu: string;
  gender: string;
  hint: string;
}

interface PiperStatus {
  ready: boolean;
  exe: boolean;
  model: boolean;
  root: string;
  voice: string;
}

interface TtsSpeakResult {
  mime: string;
  base64: string;
  voice: string;
  bytes: number;
  engine?: string;
  playedOnHost?: boolean;
  hostPlayDetail?: string;
}

interface JoiDesktopTtsApi {
  voices: () => Promise<{
    edge: EdgeTtsVoiceInfo[];
    piper: EdgeTtsVoiceInfo[];
    piperStatus: PiperStatus;
  }>;
  speak: (payload: {
    text: string;
    provider?: "auto" | "edge" | "piper" | "sovits" | "qwen";
    voice?: string;
    emotion?: string;
    rate?: number;
    pitch?: number;
    volume?: number;
    sovitsUrl?: string;
    refAudioPath?: string;
    promptText?: string;
    promptLang?: string;
    textLang?: string;
    qwenUrl?: string;
    qwenModel?: string;
    qwenVoice?: string;
    qwenApiKey?: string;
  }) => Promise<TtsSpeakResult>;
  stop?: () => Promise<{ ok: boolean }>;
  piperStatus: () => Promise<PiperStatus>;
  installPiper: () => Promise<PiperStatus>;
  onPiperProgress: (
    cb: (payload: { phase: string; pct: number }) => void,
  ) => () => void;
  sovitsStatus: (opts?: {
    baseUrl?: string;
    installPath?: string;
    pythonPath?: string;
  }) => Promise<{
    online: boolean;
    starting?: boolean;
    managedByApp?: boolean;
    installPath?: string | null;
    pythonPath?: string | null;
    baseUrl: string;
    detail: string;
  }>;
  sovitsStart: (opts?: {
    baseUrl?: string;
    installPath?: string;
    pythonPath?: string;
  }) => Promise<{
    online: boolean;
    starting?: boolean;
    managedByApp?: boolean;
    installPath?: string | null;
    pythonPath?: string | null;
    baseUrl: string;
    detail: string;
  }>;
  sovitsStop: (opts?: {
    baseUrl?: string;
  }) => Promise<{
    stopped: boolean;
    online: boolean;
    managedByApp?: boolean;
    baseUrl: string;
    detail: string;
  }>;
  qwenStatus: (opts?: {
    baseUrl?: string;
  }) => Promise<{
    online: boolean;
    baseUrl: string;
    detail: string;
  }>;
}

interface JoiDesktopMediaApi {
  wd14Status: (opts?: {
    baseUrl?: string;
    pythonPath?: string;
    modelDir?: string;
  }) => Promise<{
    online: boolean;
    starting?: boolean;
    managedByApp?: boolean;
    scriptPath?: string | null;
    pythonPath?: string;
    modelDir?: string;
    baseUrl: string;
    detail: string;
  }>;
  wd14Start: (opts?: {
    baseUrl?: string;
    pythonPath?: string;
    modelDir?: string;
  }) => Promise<{
    online: boolean;
    starting?: boolean;
    managedByApp?: boolean;
    detail: string;
  }>;
  wd14Stop: (opts?: { baseUrl?: string }) => Promise<{
    stopped: boolean;
    online: boolean;
    detail: string;
  }>;
  tagImage: (payload: {
    base64: string;
    mime?: string;
    baseUrl?: string;
    generalThreshold?: number;
    characterThreshold?: number;
    maxTags?: number;
  }) => Promise<{
    tags: string[];
    scores: { tag: string; score: number }[];
  }>;
}

interface JoiDesktopShellApi {
  openExternal: (url: string) => Promise<{ ok: boolean; detail?: string }>;
  showTempFile: (payload: {
    fileName: string;
    bytes: ArrayBuffer | Uint8Array | number[];
  }) => Promise<{ ok: boolean; path?: string; detail?: string }>;
}

interface JoiDesktopEmberApi {
  readText: (
    relPath: string,
  ) => Promise<{ ok: boolean; text?: string; detail?: string }>;
  writeText: (
    relPath: string,
    text: string,
  ) => Promise<{ ok: boolean; detail?: string }>;
  writeBytes: (
    relPath: string,
    base64: string,
  ) => Promise<{ ok: boolean; detail?: string }>;
  delete: (
    relPath: string,
  ) => Promise<{ ok: boolean; missing?: boolean; detail?: string }>;
  list: (
    relDir: string,
  ) => Promise<{ ok: boolean; names?: string[]; detail?: string }>;
}

type DeviceBackendId = "mock" | "lovense" | "buttplug";

type DeviceConnectionState =
  | "disconnected"
  | "connecting"
  | "connected"
  | "error";

interface JoiDesktopDeviceStatus {
  backend: DeviceBackendId;
  state: DeviceConnectionState;
  intensity: number;
  level: number;
  detailRu: string;
  devices: string[];
  desktop: boolean;
  trustNoteRu?: string;
  lastCommandAt?: number;
  error?: string;
}

interface JoiDesktopDeviceApi {
  status: () => Promise<JoiDesktopDeviceStatus>;
  connect: (opts?: {
    backend?: DeviceBackendId;
    lovenseBaseUrl?: string;
    buttplugUrl?: string;
  }) => Promise<JoiDesktopDeviceStatus>;
  disconnect: () => Promise<JoiDesktopDeviceStatus>;
  stop: () => Promise<JoiDesktopDeviceStatus>;
  setIntensity: (
    intensity: number,
    level?: number,
  ) => Promise<JoiDesktopDeviceStatus>;
}

interface JoiDesktopApi {
  isDesktop: boolean;
  nativeControls?: boolean;
  minimize: () => void;
  maximize: () => void;
  close: () => void;
  setFullScreen?: (on: boolean) => Promise<boolean>;
  toggleFullScreen?: () => Promise<boolean>;
  isFullScreen?: () => Promise<boolean>;
  onMaximized: (cb: (maximized: boolean) => void) => () => void;
  onFullScreen?: (cb: (fullscreen: boolean) => void) => () => void;
  shell?: JoiDesktopShellApi;
  ember?: JoiDesktopEmberApi;
  ollama?: JoiDesktopOllamaApi;
  tts?: JoiDesktopTtsApi;
  media?: JoiDesktopMediaApi;
  device?: JoiDesktopDeviceApi;
}

interface Window {
  joiDesktop?: JoiDesktopApi;
}
