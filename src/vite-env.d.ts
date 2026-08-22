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
  delete: (model: string) => Promise<OllamaDesktopStatus>;
  searchHtml?: (query: string) => Promise<string>;
  onPullProgress: (
    cb: (payload: {
      model: string;
      line: string;
      phase?: string;
      pct?: number;
    }) => void,
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
    provider?: "auto" | "edge" | "piper" | "sovits" | "qwen" | "qwen-cpu";
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
    qwenRefPath?: string;
    qwenPromptText?: string;
  }) => Promise<TtsSpeakResult>;
  stop?: () => Promise<{ ok: boolean }>;
  piperStatus: () => Promise<PiperStatus>;
  installPiper: () => Promise<PiperStatus>;
  uninstallPiper?: () => Promise<PiperStatus>;
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
  sovitsInstallStatus?: () => Promise<{
    root: string;
    repo: string;
    python: string;
    venv?: boolean;
    pretrained?: boolean;
    ffmpeg?: boolean;
    torchCuda?: boolean;
    torchCpu?: boolean;
    torchWheel?: string;
    ready: boolean;
    detail: string;
  }>;
  installSovits?: () => Promise<{
    root: string;
    repo: string;
    python: string;
    venv?: boolean;
    pretrained?: boolean;
    ffmpeg?: boolean;
    torchCuda?: boolean;
    torchCpu?: boolean;
    ready: boolean;
    detail: string;
  }>;
  uninstallSovits?: () => Promise<{
    root: string;
    repo: string;
    python: string;
    ready: boolean;
    detail: string;
  }>;
  onSovitsInstallProgress?: (
    cb: (payload: {
      phase: string;
      pct: number;
      line?: string;
      detail?: string;
      filesDone?: number;
      filesTotal?: number;
    }) => void,
  ) => () => void;
  qwenStatus: (opts?: {
    baseUrl?: string;
    flavor?: string;
    model?: string;
    device?: string;
  }) => Promise<{
    online: boolean;
    starting?: boolean;
    managedByApp?: boolean;
    python?: string | null;
    modelPath?: string | null;
    tokenizer?: boolean;
    customVoice?: boolean;
    base?: boolean;
    torchCuda?: boolean;
    torchCpu?: boolean;
    device?: string;
    gpu?: string;
    torch?: string;
    backend?: string;
    baseUrl: string;
    detail: string;
  }>;
  qwenStart?: (opts?: {
    baseUrl?: string;
    flavor?: string;
    model?: string;
    device?: string;
  }) => Promise<{
    online: boolean;
    starting?: boolean;
    managedByApp?: boolean;
    python?: string | null;
    modelPath?: string | null;
    torchCuda?: boolean;
    torchCpu?: boolean;
    device?: string;
    gpu?: string;
    torch?: string;
    backend?: string;
    baseUrl: string;
    detail: string;
  }>;
  qwenStop?: (opts?: { baseUrl?: string }) => Promise<{
    stopped: boolean;
    online: boolean;
    starting?: boolean;
    managedByApp?: boolean;
    baseUrl: string;
    detail: string;
  }>;
  qwenInstallStatus: () => Promise<{
    root: string;
    python: string;
    venv?: boolean;
    hub?: boolean;
    qwenTts?: boolean;
    vllm?: boolean;
    fasterQwenTts?: boolean;
    torchCuda?: boolean;
    torchCpu?: boolean;
    torchWheel?: string;
    tokenizer: boolean;
    customVoice: boolean;
    base: boolean;
    tokenizerDir: string;
    customVoiceDir: string;
    baseDir: string;
  }>;
  installQwenModel: (
    target: "tokenizer" | "custom_voice" | "base",
  ) => Promise<{
    root: string;
    python: string;
    venv?: boolean;
    hub?: boolean;
    qwenTts?: boolean;
    vllm?: boolean;
    fasterQwenTts?: boolean;
    torchCuda?: boolean;
    torchCpu?: boolean;
    torchWheel?: string;
    tokenizer: boolean;
    customVoice: boolean;
    base: boolean;
    tokenizerDir: string;
    customVoiceDir: string;
    baseDir: string;
  }>;
  uninstallQwenModel?: (
    target: "tokenizer" | "custom_voice" | "base",
  ) => Promise<{
    root: string;
    python: string;
    venv?: boolean;
    hub?: boolean;
    qwenTts?: boolean;
    vllm?: boolean;
    fasterQwenTts?: boolean;
    torchCuda?: boolean;
    torchCpu?: boolean;
    torchWheel?: string;
    tokenizer: boolean;
    customVoice: boolean;
    base: boolean;
    tokenizerDir: string;
    customVoiceDir: string;
    baseDir: string;
  }>;
  onQwenInstallProgress: (
    cb: (payload: {
      phase: string;
      pct: number;
      line?: string;
      detail?: string;
      filesDone?: number;
      filesTotal?: number;
    }) => void,
  ) => () => void;
  voiceRefShow: (
    relPath: string,
  ) => Promise<{ ok: boolean; path?: string; detail?: string }>;
  voiceRefStat: (
    relPath: string,
  ) => Promise<{
    exists: boolean;
    path?: string | null;
    bytes?: number;
  }>;
  voiceRefPick: () => Promise<{
    ok: boolean;
    canceled?: boolean;
    sourcePath?: string;
    bytesBase64?: string;
    detail?: string;
  }>;
  voiceRefWrite: (payload: {
    destRel: string;
    wavBase64: string;
  }) => Promise<{
    ok: boolean;
    relPath?: string;
    path?: string;
    bytes?: number;
    detail?: string;
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
  onWd14Progress: (
    cb: (payload: { phase: string; pct: number; detail?: string }) => void,
  ) => () => void;
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
  readBytes: (
    relPath: string,
  ) => Promise<{ ok: boolean; base64?: string; detail?: string }>;
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
  openPath: (
    relPath: string,
  ) => Promise<{ ok: boolean; detail?: string }>;
  watch: (relPath: string) => Promise<{ ok: boolean; detail?: string }>;
  unwatch: () => Promise<{ ok: boolean; detail?: string }>;
  onFileChanged: (
    cb: (payload: { rel: string; eventType?: string }) => void,
  ) => () => void;
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
  cursor?: {
    clip: (rect?: {
      left: number;
      top: number;
      width: number;
      height: number;
    }) => Promise<{ ok: boolean }>;
    unclip: () => Promise<{ ok: boolean }>;
    warpCenter?: () => void;
  };
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
