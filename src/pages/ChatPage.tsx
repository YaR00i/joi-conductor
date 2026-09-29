import { useEffect, useRef, useState, type SetStateAction } from "react";
import "./chatPage.css";
import { ChatLlmPanel } from "../components/ChatLlmPanel";
import { GroqConversationSwitch } from "../components/GroqSettings";
import { ChatMessageActions } from "../components/ChatMessageActions";
import { ChatCommandPalette } from "../components/ChatCommandPalette";
import { ChatSpeechOffers } from "../components/ChatSpeechOffers";
import { ChatThinkFold } from "../components/ChatThinkFold";
import { ChatTurnDebugFold } from "../components/ChatTurnDebugFold";
import { MistressImg } from "../components/MistressImg";
import { UiCheck } from "../components/UiCheck";
import { useChatProposals } from "./useChatProposals";
import {
  getActiveMistress,
  subscribeActiveMistress,
  type MistressPack,
} from "../lib/mistress";
import { lastDiaryExcerpt } from "../lib/soul/markdown";
import {
  createSoulChatClient,
  loadSoulState,
  saveSoulState,
  sendSoulChatTurn,
  soulNeedsSync,
  syncSoulMemoryDetailed,
  soulMemoryModeLabelRu,
  SOUL_MEMORY_MODES,
  regenerateSoulReply,
  editSoulMessage,
  splitControlReply,
  loadChatLlmSettings,
  saveChatLlmSettings,
  resolveChatLlm,
  chatCloudConversationId,
  chatProviderUsesOllama,
  isGroqHybridProvider,
  CHAT_LLM_CHANGED_EVENT,
  newSoulMessage,
  lastSoulSessionEvent,
  formatIntentLabelRu,
  stanceMemoryView,
  clearSoulDiary,
  clearSoulTopics,
  type SoulMemoryMode,
  type SoulMistressState,
  type ChatLlmSettings,
} from "../lib/soul";
import type { SoulTurnDebugSnapshot } from "../lib/soul/turnDebug";
import {
  mergePlannerDebug,
  mergeProposalLifecycleDebug,
  mergeRouterDebug,
  type SoulProposalLifecycleState,
} from "../lib/soul/turnDebug";
import { getActiveSaveSlot } from "../lib/saveSlots";
import {
  assembleProgramSession,
  buildAcceptedSession,
  clearPendingProposal,
  CONTROL_CHANGED_EVENT,
  controlLiveSnapshot,
  ensureChatDispatch,
  finalePolicyLabelRu,
  formatHoursLeft,
  listMorningContracts,
  loadControlState,
  listChatContractOffers,
  contractToneLabelRu,
  acceptHintRu,
  dropTaskOffer,
  matchChatCommands,
  parseChatCommand,
  refuseSessionOffer,
  recordControlSessionKind,
  reportMorningPack,
  runChatCommand,
  sessionKindLabelRu,
  setDispatchPhase,
  unknownCommandNote,
  REFUSE_SESSION_CHAT,
  type ChatChip,
  type ChatCommandId,
  type ChatContractOffer,
  type ChatProposal,
  type ControlLiveSnapshot,
  type ControlState,
  type MistressSessionProposal,
  type QueuePatchEdit,
} from "../lib/soul/control";
import {
  acceptChatProposal,
  refuseChatProposal,
} from "../lib/soul/control/proposalApply";
import type { PlanRouletteResult } from "../lib/planRoulette";
import {
  findContract,
  type ContractInstance,
} from "../lib/contracts/dailyBoard";
import { playUiClick, playUiConfirm, primeUiAudio } from "../lib/uiSound";
import {
  clampTtsVolume,
  loadVoiceSettings,
} from "../lib/voiceSettings";
import type { SpeechTts } from "../lib/voice/speechTts";
import {
  canManageOllama,
  fetchOllamaStatus,
  ollamaStatusTone,
  startOllama,
  type OllamaStatus,
} from "../lib/ollamaClient";

const CHAT_TTS_KEY = "joi-soul-chat-tts-v1";

function isQuietContractReply(
  messages: SoulMistressState["messages"],
  assistantId: string,
): boolean {
  const idx = messages.findIndex((row) => row.id === assistantId);
  if (idx <= 0) return false;
  for (let i = idx - 1; i >= 0; i--) {
    const row = messages[i];
    if (row.role === "user") return /^Принимаю:/.test(row.text.trim());
    if (row.role === "assistant") return false;
  }
  return false;
}

type Props = {
  tts: SpeechTts;
  sessionLive?: boolean;
  ttsVolume?: number;
  onTtsVolume?: (volume: number) => void;
  onStartHerSession?: (proposal: MistressSessionProposal) => void;
  onStartAssembledSession?: (
    result: PlanRouletteResult,
  ) => void | Promise<void>;
  onAcceptContract?: (contract: ContractInstance) => void;
  onPatchQueue?: (edit: QueuePatchEdit) => boolean;
};

function loadSpeakPref(): boolean {
  try {
    return localStorage.getItem(CHAT_TTS_KEY) !== "0";
  } catch {
    return true;
  }
}

type SheetTab = "control" | "memory" | "model";

type RetryTurn =
  | { kind: "send"; messageId: string; skipSpeechOffers?: boolean }
  | { kind: "regenerate"; messageId: string };

const SHEET_TABS: { id: SheetTab; labelRu: string }[] = [
  { id: "control", labelRu: "Власть" },
  { id: "memory", labelRu: "Память" },
  { id: "model", labelRu: "Модель" },
];

function soulFocusRu(raw: string): string {
  const t = raw.trim();
  if (/not the queue/i.test(t) || /constraints she sets/i.test(t)) {
    return "Этот разговор — и то, что она ставит.";
  }
  return t;
}

function wearKindRu(kind: "cage" | "plug"): string {
  switch (kind) {
    case "cage":
      return "Клетка";
    case "plug":
      return "Пробка";
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

function assistantBubbleText(text: string): string {
  const { speech } = splitControlReply(text);
  if (speech) return speech;
  const cut = text.replace(/\{[\s\S]*$/u, "").trim();
  return cut || text;
}

function lastUserReceipt(
  messages: SoulMistressState["messages"],
  index: number,
  busy: boolean,
  failed: boolean,
): "прочитано" | "не доставлено" | null {
  const message = messages[index];
  if (!message || message.role !== "user") return null;
  const later = messages.slice(index + 1);
  if (later.some((item) => item.role === "user")) return null;
  if (later.some((item) => item.role === "assistant")) return "прочитано";
  if (busy) return "прочитано";
  if (failed) return "не доставлено";
  return null;
}

function chatEmptyHint(mode: SoulMemoryMode): string {
  switch (mode) {
    case 0:
      return "Расскажи, что сейчас занимает голову. Важное останется в памяти разговора.";
    case 1:
      return "Начни с любого места — она сохранит нить разговора и вернётся к ней позже.";
    case 2:
      return "Можно говорить без предисловий. Главное из разговора не потеряется.";
    case 3:
      return "Расскажи, как прошёл день, или сразу попроси помочь с выбором.";
    default: {
      const _exhaustive: never = mode;
      return _exhaustive;
    }
  }
}

const CHAT_STARTERS = [
  "Помоги собраться с мыслями",
  "Разбери со мной сегодняшний день",
  "Предложи короткую сессию",
] as const;

type TurnDebugMap = Record<string, SoulTurnDebugSnapshot>;

// Dev-only continuity across Chat → Session → Chat navigation. This deliberately
// never enters Soul/localStorage and is discarded with the renderer process.
let volatileTurnDebug: TurnDebugMap = {};

function saveSpeakPref(on: boolean): void {
  try {
    localStorage.setItem(CHAT_TTS_KEY, on ? "1" : "0");
  } catch {
    /* ignore */
  }
}

function makeClient(chat: ChatLlmSettings) {
  const voice = loadVoiceSettings();
  const resolved = resolveChatLlm(chat, voice);
  return {
    voice,
    resolved,
    client: createSoulChatClient(resolved),
  };
}

function chatLlmGate(
  chat: ChatLlmSettings,
  ollama: OllamaStatus | null,
): { ready: boolean; detailRu: string } {
  const resolved = resolveChatLlm(chat, loadVoiceSettings());
  if (isGroqHybridProvider(chat.provider) && !chat.groqConversationId) {
    return chatLlmGate({ ...chat, provider: "ollama", model: chat.groqLocalModel || "", endpoint: "", apiKey: "" }, ollama);
  }
  switch (chat.provider) {
    case "ollama": {
      if (!ollama) return { ready: false, detailRu: "Проверяю ИИ…" };
      if (!ollama.running) {
        return {
          ready: false,
          detailRu: "ИИ не запущен. Включи Ollama — иначе она не ответит.",
        };
      }
      if (!resolved.model.trim()) {
        return { ready: false, detailRu: "Не выбрана модель чата." };
      }
      if (!ollama.modelReady) {
        return {
          ready: false,
          detailRu: ollama.detail || "Модели нет на сервере.",
        };
      }
      return { ready: true, detailRu: ollama.detail };
    }
    case "openrouter":
    case "openai":
    case "groq_chat":
    case "groq":
      if (!resolved.apiKey) {
        return {
          ready: false,
          detailRu: "Нет API-ключа. Открой настройки чата → Модель.",
        };
      }
      if (!resolved.model.trim()) {
        return { ready: false, detailRu: "Не выбрана модель чата." };
      }
      return { ready: true, detailRu: "" };
    case "custom":
      if (!resolved.endpoint.trim() || !resolved.model.trim()) {
        return {
          ready: false,
          detailRu: "Укажи endpoint и модель в настройках чата.",
        };
      }
      return { ready: true, detailRu: "" };
    default: {
      const _exhaustive: never = chat.provider;
      return _exhaustive;
    }
  }
}

export function ChatPage({
  tts,
  sessionLive = false,
  ttsVolume,
  onTtsVolume,
  onStartHerSession,
  onStartAssembledSession,
  onAcceptContract,
  onPatchQueue,
}: Props) {
  const [pack, setPack] = useState<MistressPack>(() => getActiveMistress());
  const [soul, setSoul] = useState<SoulMistressState>(() =>
    loadSoulState(getActiveMistress().id, getActiveMistress().bible),
  );
  const [control, setControl] = useState<ControlState>(() =>
    loadControlState(getActiveMistress().id),
  );
  const [live, setLive] = useState<ControlLiveSnapshot>(() =>
    controlLiveSnapshot(loadControlState(getActiveMistress().id)),
  );
  const [chatLlm, setChatLlm] = useState<ChatLlmSettings>(loadChatLlmSettings);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deliveryNotice, setDeliveryNotice] = useState<string | null>(null);
  const [retryTurn, setRetryTurn] = useState<RetryTurn | null>(null);
  const [streamPreview, setStreamPreview] = useState("");
  const [speakOn, setSpeakOn] = useState(loadSpeakPref);
  const [volume, setVolume] = useState(
    () => ttsVolume ?? loadVoiceSettings().ttsVolume,
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [regenId, setRegenId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetTab, setSheetTab] = useState<SheetTab>("control");
  const [morningMarks, setMorningMarks] = useState<Record<string, "done" | "skip">>({});
  const [ollamaStatus, setOllamaStatus] = useState<OllamaStatus | null>(null);
  const [llmStarting, setLlmStarting] = useState(false);
  const [cmdsOpen, setCmdsOpen] = useState(false);
  const [cmdNotes, setCmdNotes] = useState<Array<{ id: string; text: string }>>(
    [],
  );
  const proposals = useChatProposals();
  const [turnDebug, setTurnDebugState] = useState<TurnDebugMap>(
    () => volatileTurnDebug,
  );
  const turnDebugMountedRef = useRef(true);
  const listRef = useRef<HTMLDivElement>(null);
  const soulRef = useRef(soul);
  const packRef = useRef(pack);

  function setTurnDebug(next: SetStateAction<TurnDebugMap>) {
    volatileTurnDebug =
      typeof next === "function" ? next(volatileTurnDebug) : next;
    if (turnDebugMountedRef.current) setTurnDebugState(volatileTurnDebug);
  }

  useEffect(() => {
    turnDebugMountedRef.current = true;
    return () => {
      turnDebugMountedRef.current = false;
    };
  }, []);
  const chatLlmRef = useRef(chatLlm);
  const ollamaStatusRef = useRef<OllamaStatus | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const syncingRef = useRef<AbortController | null>(null);
  soulRef.current = soul;
  packRef.current = pack;
  chatLlmRef.current = chatLlm;
  ollamaStatusRef.current = ollamaStatus;

  useEffect(() => {
    if (typeof ttsVolume === "number") setVolume(clampTtsVolume(ttsVolume));
  }, [ttsVolume]);

  useEffect(() => {
    return subscribeActiveMistress((next) => {
      abortRef.current?.abort();
      abortRef.current = null;
      setPack(next);
      setDeliveryNotice(null);
      setRetryTurn(null);
      setStreamPreview("");
      setSoul(loadSoulState(next.id, next.bible));
      setTurnDebug({});
      refreshControl(next.id);
      proposals.clearAll();
      setError(null);
      setBusy(false);
      setSyncing(false);
      setEditingId(null);
      syncingRef.current = null;
    });
  }, []);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [soul.messages.length, busy, cmdNotes.length]);

  useEffect(() => {
    const el = listRef.current;
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 140) {
      el.scrollTop = el.scrollHeight;
    }
  }, [streamPreview]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (!sessionLive) tts.stop();
    };
  }, [sessionLive, tts]);

  useEffect(() => {
    if (!sheetOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSheetOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sheetOpen]);

  function refreshControl(mistressId = packRef.current.id) {
    const next = loadControlState(mistressId);
    setControl(next);
    setLive(controlLiveSnapshot(next));
  }

  useEffect(() => {
    if (!chatProviderUsesOllama(chatLlm.provider)) {
      setOllamaStatus(null);
      return;
    }
    const config = resolveChatLlm(chatLlm, loadVoiceSettings());
    const model = config.localFallback?.model ?? config.model;
    let cancelled = false;
    const tick = async () => {
      try {
        const next = await fetchOllamaStatus(model);
        if (!cancelled) setOllamaStatus(next);
      } catch {
        if (!cancelled) setOllamaStatus(null);
      }
    };
    void tick();
    const id = window.setInterval(() => void tick(), 6000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [chatLlm]);

  useEffect(() => {
    const next = ensureChatDispatch(packRef.current.id);
    setControl(next);
    setLive(controlLiveSnapshot(next));
  }, []);

  useEffect(() => {
    const sync = () => refreshControl();
    window.addEventListener(CONTROL_CHANGED_EVENT, sync);
    const id = window.setInterval(sync, 15_000);
    return () => {
      window.removeEventListener(CONTROL_CHANGED_EVENT, sync);
      window.clearInterval(id);
    };
  }, []);

  function persist(next: SoulMistressState, mistressId = packRef.current.id) {
    saveSoulState(mistressId, next);
    soulRef.current = next;
    setSoul(next);
  }

  function attachTurnProposals(
    messages: SoulMistressState["messages"],
    next: ChatProposal[],
  ) {
    const lastAsst = [...messages].reverse().find((row) => row.role === "assistant");
    if (lastAsst && next.length > 0) proposals.attach(lastAsst.id, next);
  }

  function persistLlm(next: ChatLlmSettings) {
    setDeliveryNotice(null);
    setRetryTurn(null);
    const stored = saveChatLlmSettings(next);
    chatLlmRef.current = stored;
    setChatLlm(stored);
  }

  useEffect(() => {
    if (chatLlm.provider !== "groq_chat" || chatLlm.groqConversationId) return;
    persistLlm({ ...chatLlm, groqConversationId: crypto.randomUUID() });
  }, [chatLlm]);

  useEffect(() => {
    const sync = () => {
      setChatLlm(loadChatLlmSettings());
      setRetryTurn(null);
    };
    window.addEventListener(CHAT_LLM_CHANGED_EVENT, sync);
    return () => window.removeEventListener(CHAT_LLM_CHANGED_EVENT, sync);
  }, []);

  async function startChatLlm() {
    if (llmStarting) return;
    setLlmStarting(true);
    setError(null);
    try {
      const config = resolveChatLlm(chatLlmRef.current, loadVoiceSettings());
      const model = config.localFallback?.model ?? config.model;
      const next = await startOllama(model);
      setOllamaStatus(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "не удалось запустить ИИ");
    } finally {
      setLlmStarting(false);
    }
  }

  function beginRequest() {
    setStreamPreview("");
    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;
    return abort;
  }

  function isCurrentRequest(abort: AbortController) {
    return abortRef.current === abort && !abort.signal.aborted;
  }

  function stopReply() {
    setStreamPreview("");
    abortRef.current?.abort();
    abortRef.current = null;
    setBusy(false);
    setRegenId(null);
    setError(null);
    setDeliveryNotice("Ответ остановлен. Можно повторить запрос или написать новое сообщение.");
  }

  async function retryReply() {
    if (!retryTurn || busy) return;
    if (retryTurn.kind === "regenerate") return regenerate(retryTurn.messageId);
    const last = soulRef.current.messages.at(-1);
    if (last?.id !== retryTurn.messageId || last.role !== "user") return;
    await sendText(last.text, { ...retryTurn, retryMessageId: last.id });
  }

  function previewForRequest(abort: AbortController) {
    return (text: string) => {
      if (isCurrentRequest(abort)) setStreamPreview(text);
    };
  }

  function rememberTurnDebug(snapshot: SoulTurnDebugSnapshot | undefined) {
    if (!snapshot) return;
    setTurnDebug((prev) => {
      const next = { ...prev, [snapshot.turnId]: snapshot };
      const ids = Object.keys(next);
      if (ids.length <= 24) return next;
      const drop = ids.slice(0, ids.length - 24);
      for (const id of drop) delete next[id];
      return next;
    });
  }

  function markProposalLifecycle(
    messageId: string,
    offer: ChatProposal,
    state: SoulProposalLifecycleState,
    detail?: string,
  ) {
    setTurnDebug((prev) => {
      const current = prev[messageId];
      if (!current) return prev;
      return {
        ...prev,
        [messageId]: mergeProposalLifecycleDebug(
          current,
          offer,
          state,
          detail,
        ),
      };
    });
  }

  async function runBackgroundSync(snapshot: SoulMistressState) {
    if (chatLlmRef.current.provider === "groq_chat") return;
    if (!soulNeedsSync(snapshot) || syncingRef.current) return;
    const abort = abortRef.current;
    if (!abort || !isCurrentRequest(abort)) return;
    const pendingAtStart = snapshot.pendingSinceRouter;
    const { client } = makeClient(chatLlmRef.current);
    syncingRef.current = abort;
    setSyncing(true);
    try {
      const synced = await syncSoulMemoryDetailed(
        snapshot,
        packRef.current.bible,
        client,
        abort.signal,
      );
      if (!isCurrentRequest(abort)) return;
      const cur = soulRef.current;
      persist({
        ...cur,
        character: synced.state.character,
        user: synced.state.user,
        memoryMd: synced.state.memoryMd,
        userMd: synced.state.userMd,
        diaryMd: synced.state.diaryMd,
        topics: synced.state.topics,
        pendingSinceRouter: Math.max(
          0,
          cur.pendingSinceRouter - pendingAtStart,
        ),
      });
      const lastAsst = [...cur.messages]
        .reverse()
        .find((row) => row.role === "assistant");
      if (lastAsst) {
        setTurnDebug((prev) => {
          const current = prev[lastAsst.id];
          if (!current) return prev;
          return { ...prev, [lastAsst.id]: mergeRouterDebug(current, synced.router) };
        });
      }
      refreshControl();
    } catch (err) {
      if (!isCurrentRequest(abort)) return;
      if ((err as { name?: string }).name === "AbortError") return;
      setError(err instanceof Error ? err.message : "не удалось обновить память");
    } finally {
      if (syncingRef.current === abort) {
        syncingRef.current = null;
        setSyncing(false);
      }
    }
  }

  function maybeSpeak(text: string, voiceTtsEnabled: boolean) {
    if (speakOn && voiceTtsEnabled && !sessionLive && text.trim()) {
      tts.speak(text);
    }
  }

  function setChatVolume(next: number) {
    const clamped = clampTtsVolume(next);
    setVolume(clamped);
    tts.configure({ volume: clamped });
    onTtsVolume?.(clamped);
  }

  async function sendText(
    text: string,
    opts?: { skipSpeechOffers?: boolean; retryMessageId?: string },
  ) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    const last = soulRef.current.messages.at(-1);
    if (opts?.retryMessageId && (last?.id !== opts.retryMessageId || last.role !== "user")) return;
    const gate = chatLlmGate(chatLlmRef.current, ollamaStatusRef.current);
    if (!gate.ready) {
      setError(gate.detailRu);
      return;
    }
    void primeUiAudio();
    playUiConfirm();
    if (!opts?.retryMessageId) setDraft("");
    setError(null);
    setDeliveryNotice(null);
    setBusy(true);
    const nowMs = Date.now();
    setRegenId(null);
    const userMessage = opts?.retryMessageId ? last! : newSoulMessage("user", trimmed, nowMs);
    if (!opts?.retryMessageId) {
      persist({ ...soulRef.current, messages: [...soulRef.current.messages, userMessage] });
    }
    setRetryTurn({ kind: "send", messageId: userMessage.id, skipSpeechOffers: opts?.skipSpeechOffers });
    const abort = beginRequest();
    const { voice, client, resolved } = makeClient(chatLlmRef.current);
    try {
      const result = await sendSoulChatTurn({
        state: soulRef.current,
        bible: pack.bible,
        userText: trimmed,
        onSpeechPreview: previewForRequest(abort),
        client,
        signal: abort.signal,
        nowMs,
        voiceExamples: chatLlmRef.current.voiceExamples !== false,
        llm: resolved,
        skipServiceRoles: chatLlmRef.current.provider === "groq_chat",
        cloudConversationId: chatCloudConversationId(chatLlmRef.current),
      });
      if (!isCurrentRequest(abort)) return;
      persist(result.state);
      setDeliveryNotice(result.delivery?.notice ?? null);
      rememberTurnDebug(result.debug);
      if (!opts?.skipSpeechOffers) {
        attachTurnProposals(result.state.messages, result.proposals);
      }
      if (result.error) {
        setError(result.error);
        return;
      }
      setRetryTurn(null);
      maybeSpeak(result.reply, voice.ttsEnabled);
      void runBackgroundSync(result.state);
    } catch (err) {
      if (!isCurrentRequest(abort)) return;
      if ((err as { name?: string }).name === "AbortError") return;
      setError(err instanceof Error ? err.message : "модель не ответила");
    } finally {
      if (isCurrentRequest(abort)) {
        setStreamPreview("");
        setBusy(false);
      }
    }
  }

  async function send() {
    const parsed = parseChatCommand(draft);
    if (parsed) {
      setDraft("");
      if (parsed.kind === "unknown") {
        pushCmdNote(unknownCommandNote(parsed.token));
        return;
      }
      await runPickedCommand(parsed.id);
      return;
    }
    await sendText(draft);
  }

  function pushCmdNote(textRu: string) {
    setCmdNotes((prev) => [
      ...prev.slice(-11),
      { id: `cmd-${Date.now()}-${prev.length}`, text: textRu },
    ]);
  }

  async function runPickedCommand(id: ChatCommandId) {
    if (busy) return;
    setCmdsOpen(false);
    const effect = runChatCommand(
      id,
      packRef.current.id,
      control.dispatch.phase,
    );
    switch (effect.kind) {
      case "note":
        pushCmdNote(effect.textRu);
        return;
      case "refresh":
        refreshControl();
        if (effect.textRu) pushCmdNote(effect.textRu);
        return;
      case "start_session":
        await startAssembledSession();
        return;
      case "refuse_session":
        refuseSessionOffer(packRef.current.id);
        refreshControl();
        if (llmGate.ready) {
          await sendText(REFUSE_SESSION_CHAT);
        } else {
          pushCmdNote("Отказ от сессии принят. Кара на доске контрактов.");
        }
        return;
      default: {
        const _exhaustive: never = effect;
        return _exhaustive;
      }
    }
  }

  async function startAssembledSession() {
    try {
      const result = await assembleProgramSession(packRef.current.id);
      setDispatchPhase(packRef.current.id, "idle");
      refreshControl();
      onStartAssembledSession?.(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "не удалось собрать сессию");
    }
  }

  async function onChip(chip: ChatChip) {
    if (busy) return;
    void primeUiAudio();
    playUiClick();
    switch (chip.kind) {
      case "accept_session":
      case "ask_session":
        await startAssembledSession();
        break;
      case "refuse_session":
        refuseSessionOffer(packRef.current.id);
        refreshControl();
        await sendText(REFUSE_SESSION_CHAT);
        break;
      case "accept_punish": {
        if (!chip.contractInstanceId) break;
        const row = findContract(chip.contractInstanceId);
        if (row) onAcceptContract?.(row);
        setDispatchPhase(packRef.current.id, "idle");
        refreshControl();
        await sendText(`Принимаю: ${chip.labelRu}.`, {
          skipSpeechOffers: true,
        });
        break;
      }
      case "morning_report": {
        reportMorningPack(packRef.current.id, morningMarks);
        setMorningMarks({});
        refreshControl();
        await sendText("Отчитался по утру.");
        break;
      }
      default: {
        const _exhaustive: never = chip.kind;
        return _exhaustive;
      }
    }
  }

  async function acceptOffer(offer: ChatContractOffer) {
    if (busy) return;
    void primeUiAudio();
    playUiClick();
    const row = findContract(offer.instanceId);
    if (row) onAcceptContract?.(row);
    if (offer.tone === "punish") {
      setDispatchPhase(packRef.current.id, "idle");
    } else {
      dropTaskOffer(packRef.current.id, offer.instanceId);
    }
    refreshControl();
    await sendText(`Принимаю: ${offer.titleRu} (${offer.laneRu}).`, {
      skipSpeechOffers: true,
    });
  }

  async function acceptBubbleProposal(messageId: string, offer: ChatProposal) {
    if (busy) return;
    const accepted = acceptChatProposal({
      mistressId: packRef.current.id,
      proposal: offer,
      soul: soulRef.current,
    });
    if (accepted.blockedReason === "hard_boundary") {
      markProposalLifecycle(messageId, offer, "blocked", "hard_boundary");
      setError("Это предложение теперь запрещено жёсткой границей.");
      return;
    }
    markProposalLifecycle(messageId, offer, "accepted");
    proposals.dismiss(messageId, offer.id);
    persist(accepted.soul);
    if (accepted.applied) {
      setControl(accepted.applied.state);
      setLive(controlLiveSnapshot(accepted.applied.state));
      for (const edit of accepted.applied.queueEdits) {
        onPatchQueue?.(edit);
      }
    }
    if (accepted.contract) onAcceptContract?.(accepted.contract);
    refreshControl();
    if (accepted.session) {
      setRetryTurn(null);
      setError(null);
      setBusy(true);
      const abort = beginRequest();
      const { client, resolved } = makeClient(chatLlmRef.current);
      try {
        const built = await buildAcceptedSession({
          mistressId: packRef.current.id,
          proposal: accepted.session,
          stances: accepted.soul.user.stances ?? [],
          ...(chatLlmRef.current.sessionPlanner === "model" &&
          chatLlmRef.current.provider !== "groq_chat"
            ? { planner: { client, resolved, signal: abort.signal } }
            : {}),
        });
        setTurnDebug((prev) => {
          const current = prev[messageId];
          return current
            ? { ...prev, [messageId]: mergePlannerDebug(current, built.debug) }
            : prev;
        });
        await onStartAssembledSession?.(built.result);
        markProposalLifecycle(messageId, offer, "started", built.debug.source);
        recordControlSessionKind(
          packRef.current.id,
          accepted.session.sessionKind,
        );
      } catch (err) {
        const detail =
          (err as { name?: string }).name === "AbortError"
            ? "aborted"
            : err instanceof Error
              ? err.message
              : "session build failed";
        markProposalLifecycle(messageId, offer, "failed", detail);
        if ((err as { name?: string }).name !== "AbortError") {
          setError(
            err instanceof Error ? err.message : "не удалось собрать сессию",
          );
        }
      } finally {
        setBusy(false);
      }
      return;
    }
    await sendText(`Принимаю: ${offer.titleRu}.`, {
      skipSpeechOffers: true,
    });
  }

  function refuseBubbleProposal(messageId: string, offer: ChatProposal) {
    proposals.dismiss(messageId, offer.id);
    persist(refuseChatProposal(soulRef.current, offer));
    markProposalLifecycle(messageId, offer, "refused");
  }

  async function regenerate(messageId: string) {
    if (busy) return;
    setError(null);
    setDeliveryNotice(null);
    setRetryTurn({ kind: "regenerate", messageId });
    setRegenId(messageId);
    setBusy(true);
    const abort = beginRequest();
    const { voice, client, resolved } = makeClient(chatLlmRef.current);
    try {
      const result = await regenerateSoulReply({
        state: soulRef.current,
        bible: pack.bible,
        messageId,
        client,
        onSpeechPreview: previewForRequest(abort),
        signal: abort.signal,
        voiceExamples: chatLlmRef.current.voiceExamples !== false,
        llm: resolved,
        skipServiceRoles: chatLlmRef.current.provider === "groq_chat",
        cloudConversationId: chatCloudConversationId(chatLlmRef.current),
      });
      if (!isCurrentRequest(abort)) return;
      persist(result.state);
      setDeliveryNotice(result.delivery?.notice ?? null);
      rememberTurnDebug(result.debug);
      attachTurnProposals(result.state.messages, result.proposals);
      if (result.error) {
        setError(result.error);
        return;
      }
      setRetryTurn(null);
      maybeSpeak(result.reply, voice.ttsEnabled);
    } catch (err) {
      if (!isCurrentRequest(abort)) return;
      if ((err as { name?: string }).name === "AbortError") return;
      setError(err instanceof Error ? err.message : "модель не ответила");
    } finally {
      if (isCurrentRequest(abort)) {
        setStreamPreview("");
        setRegenId(null);
        setBusy(false);
      }
    }
  }

  function commitEdit(messageId: string) {
    setRetryTurn(null);
    persist(editSoulMessage(soulRef.current, messageId, editDraft));
    setEditingId(null);
    setEditDraft("");
  }

  function setMode(mode: SoulMemoryMode) {
    void primeUiAudio();
    playUiClick();
    persist({ ...soul, mode });
  }

  function chooseSheetTab(tab: SheetTab) {
    void primeUiAudio();
    playUiClick();
    setSheetTab(tab);
  }

  function clearThread() {
    abortRef.current?.abort();
    abortRef.current = null;
    setRetryTurn(null);
    setError(null);
    setDeliveryNotice(null);
    void primeUiAudio();
    playUiClick();
    persist({ ...soul, messages: [], pendingSinceRouter: 0 });
    setTurnDebug({});
    setEditingId(null);
  }

  function wipeSoulDiary() {
    if (!soul.diaryMd.trim()) return;
    if (!window.confirm("Стереть её дневник в чате? Переписка останется.")) {
      return;
    }
    void primeUiAudio();
    playUiClick();
    persist(clearSoulDiary(soul));
  }

  function wipeSoulTopics() {
    if (soul.topics.length === 0) return;
    if (!window.confirm("Стереть темы в памяти этой госпожи?")) return;
    void primeUiAudio();
    playUiClick();
    persist(clearSoulTopics(soul));
  }

  const portrait = pack.assets.avatarFull;
  const diaryBit = lastDiaryExcerpt(soul.diaryMd);
  const lastSession = lastSoulSessionEvent(soul);
  const stanceView = stanceMemoryView(soul.user.stances ?? []);
  const canSpeak = !sessionLive;
  const voiceHint = loadVoiceSettings().model;
  const llmGate = chatLlmGate(chatLlm, ollamaStatus);
  const llmBannerTone =
    llmGate.ready
      ? "ok"
      : chatLlm.provider === "ollama"
        ? ollamaStatusTone(ollamaStatus)
        : "off";
  const lastAssistantId = [...soul.messages]
    .reverse()
    .find((row) => row.role === "assistant")?.id;
  const morningRows = listMorningContracts(control);
  const contractOffers = listChatContractOffers(control, sessionLive);
  const slashHits = matchChatCommands(draft);
  const parsedDraft = parseChatCommand(draft);
  const canSendDraft = Boolean(draft.trim()) && !busy && Boolean(parsedDraft || llmGate.ready);

  return (
    <div className="chat-page page--chat">
      <header className="chat-page__head">
        <div className="chat-page__head-copy">
          <p className="chat-page__eyebrow">Госпожа</p>
          <h1 className="chat-page__title">Чат · {pack.displayNameRu}</h1>
          <p className="chat-page__sub">
            Она ставит клетку, denial и сессию. Речь в пузыре, приказы — в
            приложении.
            {live.checkInOverdue ? " Она ждёт отчёт." : ""}
          </p>
        </div>
        <div
          className={`chat-page__presence${busy ? " is-busy" : llmGate.ready ? " is-online" : ""}`}
          title={llmGate.ready ? "Модель готова отвечать" : llmGate.detailRu}
        >
          <span className="chat-page__presence-dot" aria-hidden="true" />
          {busy ? "Пишет…" : llmGate.ready ? "На связи" : "ИИ не запущен"}
        </div>
      </header>

      <div className="chat-page__layout">
        <aside className="chat-page__portrait">
          <MistressImg
            className="chat-page__face"
            src={portrait}
            alt={pack.displayNameRu}
          />
        </aside>

        <section className="chat-page__thread" aria-label="Переписка">
          <div className="chat-page__log" ref={listRef}>
            {soul.messages.length === 0 ? (
              <div className="chat-page__empty">
                <span className="chat-page__empty-mark" aria-hidden="true">✦</span>
                <h2>Начни разговор</h2>
                <p>{chatEmptyHint(soul.mode)}</p>
                <div className="chat-page__starters" aria-label="Идеи для начала разговора">
                  {CHAT_STARTERS.map((starter) => (
                    <button
                      key={starter}
                      type="button"
                      onClick={() => setDraft(starter)}
                      disabled={busy}
                    >
                      {starter}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              soul.messages.map((m, index) => {
                if (busy && regenId === m.id) return null;
                const receipt = lastUserReceipt(
                  soul.messages,
                  index,
                  busy,
                  Boolean(error),
                );
                return (
                <div
                  key={m.id}
                  className={`chat-page__msg chat-page__msg--${m.role}`}
                >
                {m.role === "assistant" && m.think && m.think !== m.text ? (
                  <ChatThinkFold text={m.think} />
                ) : null}
                {m.role === "assistant" &&
                (import.meta.env.DEV || chatLlm.turnDebug) &&
                turnDebug[m.id] ? (
                  <ChatTurnDebugFold
                    snapshot={turnDebug[m.id]!}
                    showPrompt={Boolean(import.meta.env.DEV || chatLlm.turnDebug)}
                  />
                ) : null}
                <div
                  className={`chat-page__bubble chat-page__bubble--${m.role}`}
                >
                  <span className="chat-page__who">
                    {m.role === "user" ? "Ты" : pack.displayNameRu}
                  </span>
                  {editingId === m.id ? (
                    <>
                      <textarea
                        className="chat-page__edit"
                        rows={4}
                        value={editDraft}
                        onChange={(e) => setEditDraft(e.target.value)}
                      />
                      <div className="chat-page__edit-row">
                        <button
                          type="button"
                          className="chat-page__send"
                          onClick={() => commitEdit(m.id)}
                          disabled={!editDraft.trim()}
                        >
                          Сохранить
                        </button>
                        <button
                          type="button"
                          className="chat-page__ghost"
                          onClick={() => setEditingId(null)}
                        >
                          Отмена
                        </button>
                      </div>
                    </>
                  ) : (
                    <p>{assistantBubbleText(m.text)}</p>
                  )}
                  {m.role === "assistant" && editingId !== m.id ? (
                    <ChatMessageActions
                      disabled={busy}
                      speakDisabled={!canSpeak}
                      onRegenerate={() => void regenerate(m.id)}
                      onEdit={() => {
                        setEditingId(m.id);
                        setEditDraft(assistantBubbleText(m.text));
                      }}
                      onSpeak={() => {
                        if (!canSpeak) return;
                        tts.speak(assistantBubbleText(m.text));
                      }}
                    />
                  ) : null}
                  {m.role === "assistant" &&
                  editingId !== m.id &&
                  lastAssistantId === m.id &&
                  !isQuietContractReply(soul.messages, m.id) ? (
                    <ChatSpeechOffers
                      offers={proposals.visibleFor(m.id)}
                      disabled={busy}
                      onAccept={(offer) => {
                        void acceptBubbleProposal(m.id, offer);
                      }}
                      onDismiss={(offer) => refuseBubbleProposal(m.id, offer)}
                    />
                  ) : null}
                </div>
                {receipt ? (
                  <p className="chat-page__receipt">{receipt}</p>
                ) : null}
                </div>
              );
              })
            )}
            {busy && streamPreview ? (
              <div className="chat-page__msg" aria-label="Ответ формируется" aria-busy="true">
                <div className="chat-page__bubble chat-page__bubble--stream">
                  <span className="chat-page__who">{pack.bible.nameRu} · пишет…</span>
                  <p>{streamPreview}</p>
                </div>
              </div>
            ) : busy ? (
              <div
                className="chat-page__typing"
                aria-live="polite"
                aria-label="Пишет"
              >
                <span className="chat-page__typing-label">Пишет</span>
                <span className="chat-page__typing-dots" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </span>
              </div>
            ) : syncing ? (
              <p className="chat-page__status">пишет память…</p>
            ) : null}
            {cmdNotes.map((note) => (
              <div key={note.id} className="chat-page__msg chat-page__msg--cmd">
                <div className="chat-page__bubble chat-page__bubble--cmd">
                  <span className="chat-page__who">Команда</span>
                  <p>{note.text}</p>
                </div>
              </div>
            ))}
          </div>

          {error ? <p className="chat-page__error">{error}</p> : null}

          <div className="chat-page__dock">
            {cmdsOpen ? (
              <ChatCommandPalette
                onPick={(id) => {
                  void runPickedCommand(id);
                }}
              />
            ) : null}

            {!cmdsOpen && slashHits.length > 0 ? (
              <div className="chat-page__slash" role="listbox" aria-label="Команды">
                {slashHits.map((cmd) => (
                  <button
                    key={cmd.id}
                    type="button"
                    className="chat-page__slash-hit"
                    onClick={() => {
                      void runPickedCommand(cmd.id);
                    }}
                  >
                    <span>{cmd.slash}</span>
                    <span>{cmd.hintRu}</span>
                  </button>
                ))}
              </div>
            ) : null}

            {!llmGate.ready ? (
              <div
                className={`chat-page__llm-gate chat-page__llm-gate--${llmBannerTone}`}
                role="status"
              >
                <p>{llmGate.detailRu}</p>
                <div className="chat-page__llm-gate-acts">
                  {chatProviderUsesOllama(chatLlm.provider) && canManageOllama() ? (
                    <button
                      type="button"
                      className="chat-page__send"
                      disabled={llmStarting}
                      onClick={() => {
                        void primeUiAudio();
                        playUiClick();
                        void startChatLlm();
                      }}
                    >
                      {llmStarting ? "Запуск…" : "Запустить ИИ"}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="chat-page__ghost"
                    onClick={() => {
                      void primeUiAudio();
                      playUiClick();
                      setSheetTab("model");
                      setSheetOpen(true);
                    }}
                  >
                    Настройки
                  </button>
                </div>
              </div>
            ) : null}

            {control.dispatch.phase === "morning" ? (
              <div className="chat-page__morning">
                <p className="chat-page__morning-lead">
                  Утренний пак — отметь и отчитайся.
                </p>
                <div className="chat-page__morning-list">
                  {morningRows.map((row) => (
                    <UiCheck
                      key={row.instanceId}
                      className="ui-check--inline"
                      checked={morningMarks[row.instanceId] === "done"}
                      onChange={(on) => {
                        setMorningMarks((prev) => ({
                          ...prev,
                          [row.instanceId]: on ? "done" : "skip",
                        }));
                      }}
                    >
                      {row.titleRu}
                    </UiCheck>
                  ))}
                </div>
                <div className="chat-page__morning-acts">
                  <button
                    type="button"
                    className="chat-page__send"
                    disabled={busy}
                    onClick={() => {
                      void onChip({
                        id: "morning_report",
                        kind: "morning_report",
                        labelRu: "Отчитался",
                      });
                    }}
                  >
                    Отчитался
                  </button>
                </div>
              </div>
            ) : null}

            {control.dispatch.phase === "session_offer" ? (
              <div className="chat-page__morning">
                <p className="chat-page__morning-lead">
                  Она предлагает сессию — собрать из рулетки и запустить.
                </p>
                <div className="chat-page__morning-acts">
                  <button
                    type="button"
                    className="chat-page__send"
                    disabled={busy}
                    onClick={() => {
                      void onChip({
                        id: "accept_session",
                        kind: "accept_session",
                        labelRu: "Сессия · согласен",
                      });
                    }}
                  >
                    Сессия · согласен
                  </button>
                  <button
                    type="button"
                    className="chat-page__ghost"
                    disabled={busy}
                    onClick={() => {
                      void onChip({
                        id: "refuse_session",
                        kind: "refuse_session",
                        labelRu: "Сессия · откажусь",
                      });
                    }}
                  >
                    Сессия · откажусь
                  </button>
                </div>
              </div>
            ) : null}

            {contractOffers.map((offer) => (
              <div
                key={offer.instanceId}
                className={`chat-page__offer chat-page__offer--${offer.tone}`}
              >
                <p className="chat-page__offer-meta">
                  <span>{contractToneLabelRu(offer.tone)}</span>
                  <span>{offer.categoryRu}</span>
                  <span>{offer.laneRu}</span>
                </p>
                <p className="chat-page__card-lead">{offer.titleRu}</p>
                {offer.briefRu ? (
                  <p className="chat-page__card-sub">{offer.briefRu}</p>
                ) : null}
                <p className="chat-page__offer-body">{offer.bodyRu}</p>
                <p className="chat-page__card-sub">{acceptHintRu(offer)}</p>
                <div className="chat-page__morning-acts">
                  <button
                    type="button"
                    className="chat-page__send"
                    disabled={busy}
                    onClick={() => {
                      void acceptOffer(offer);
                    }}
                  >
                    Принять
                  </button>
                  {offer.tone === "task" ? (
                    <button
                      type="button"
                      className="chat-page__ghost"
                      disabled={busy}
                      onClick={() => {
                        dropTaskOffer(pack.id, offer.instanceId);
                        refreshControl();
                      }}
                    >
                      Позже
                    </button>
                  ) : null}
                </div>
              </div>
            ))}

          {control.pendingProposal && !sessionLive ? (
            <div className="chat-page__her-session">
              <p>
                {sessionKindLabelRu(control.pendingProposal.kind)} ·{" "}
                {Math.round(control.pendingProposal.durationSec / 60)} мин · эджи{" "}
                {control.pendingProposal.edgesTarget} ·{" "}
                {finalePolicyLabelRu(control.pendingProposal.finalePolicy)}
              </p>
              <div className="chat-page__her-session-acts">
                <button
                  type="button"
                  className="chat-page__send"
                  onClick={() => {
                    const proposal = control.pendingProposal;
                    if (!proposal) return;
                    void primeUiAudio();
                    playUiConfirm();
                    onStartHerSession?.(proposal);
                    clearPendingProposal(pack.id);
                    refreshControl();
                  }}
                >
                  Её сессия
                </button>
                {getActiveSaveSlot() === "sandbox" ? (
                  <button
                    type="button"
                    className="chat-page__ghost"
                    onClick={() => {
                      void primeUiAudio();
                      playUiClick();
                      clearPendingProposal(pack.id);
                      refreshControl();
                    }}
                  >
                    Отменить
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}

          <form
            className="chat-page__composer"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <textarea
              className="chat-page__input"
              rows={2}
              value={draft}
              disabled={busy}
              placeholder="Напиши ей или /помощь"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
            />
            <div className="chat-page__composer-row">
              {busy && retryTurn ? (
                <button key="stop" type="button" className="chat-page__send" onClick={(e) => { e.preventDefault(); stopReply(); }}>
                  Остановить
                </button>
              ) : (
              <button
                key="send"
                type="submit"
                className="chat-page__send"
                disabled={!canSendDraft}
              >
                Отправить
              </button>
              )}
              {!busy && retryTurn && (
                <button type="button" className="chat-page__retry" disabled={!llmGate.ready} onClick={() => void retryReply()}>
                  Повторить ответ
                </button>
              )}
              <button
                type="button"
                className="chat-page__ghost"
                onClick={clearThread}
                disabled={busy || soul.messages.length === 0}
              >
                Очистить переписку
              </button>
              <span className="chat-page__composer-spacer" />
              <div className="chat-page__conversation-controls">
              <GroqConversationSwitch value={chatLlm} onChange={persistLlm} disabled={busy || syncing} compact />
              <div className="chat-page__voice">
                <UiCheck
                  className="ui-check--inline"
                  checked={speakOn && canSpeak}
                  disabled={!canSpeak}
                  onChange={(on) => {
                    setSpeakOn(on);
                    saveSpeakPref(on);
                  }}
                  title={
                    canSpeak
                      ? "Озвучивать новые ответы"
                      : "Пока сессия live, голос занят залом"
                  }
                >
                  Голос
                </UiCheck>
                <input
                  type="range"
                  className="chat-page__vol"
                  min={0}
                  max={2}
                  step={0.05}
                  value={volume}
                  disabled={!canSpeak}
                  aria-label="Громкость голоса"
                  title="Громкость голоса"
                  onChange={(e) => setChatVolume(Number(e.target.value))}
                />
              </div>
              </div>
              <button
                type="button"
                className={`chat-page__gear${cmdsOpen ? " is-on" : ""}`}
                title="Команды чата"
                aria-pressed={cmdsOpen}
                onClick={() => {
                  void primeUiAudio();
                  playUiClick();
                  setCmdsOpen((open) => !open);
                }}
              >
                <ChatSlashIcon />
              </button>
              <button
                type="button"
                className={`chat-page__gear${sheetOpen ? " is-on" : ""}`}
                title="Настройки чата"
                aria-pressed={sheetOpen}
                onClick={() => {
                  void primeUiAudio();
                  playUiClick();
                  setSheetOpen((open) => !open);
                }}
              >
                <ChatGearIcon />
              </button>
            </div>
            {deliveryNotice && <p className="chat-page__delivery-notice" role="status">{deliveryNotice}</p>}
            <p className="chat-page__composer-hint">
              Enter — отправить · Shift+Enter — новая строка
            </p>
          </form>
          </div>
        </section>
      </div>

      {sheetOpen ? (
        <>
          <button
            type="button"
            className="chat-page__scrim"
            aria-label="Закрыть настройки"
            onClick={() => setSheetOpen(false)}
          />
          <aside className="chat-page__sheet" aria-label="Настройки чата">
            <div className="chat-page__sheet-head">
              <div>
                <p className="chat-page__sheet-kicker">Чат</p>
                <h2 className="chat-page__soul-title">Настройки</h2>
              </div>
              <button
                type="button"
                className="chat-page__ghost"
                onClick={() => setSheetOpen(false)}
              >
                Закрыть
              </button>
            </div>

            <div className="chat-page__sheet-tabs" role="tablist" aria-label="Раздел настроек">
              {SHEET_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={sheetTab === tab.id}
                  className={`chat-page__sheet-tab${sheetTab === tab.id ? " is-active" : ""}`}
                  onClick={() => chooseSheetTab(tab.id)}
                >
                  {tab.labelRu}
                </button>
              ))}
            </div>

            <div className="chat-page__sheet-body">
              {sheetTab === "model" ? (
                <ChatLlmPanel
                  value={chatLlm}
                  onChange={persistLlm}
                  ollamaModelHint={voiceHint}
                  installedModels={ollamaStatus?.models ?? []}
                />
              ) : null}

              {sheetTab === "control" ? (
                <div className="chat-sheet-block">
                  <section className="chat-sheet-status" aria-label="Активные статусы">
                    <article
                      className={`chat-sheet-stat${live.wear ? " is-on" : ""}`}
                    >
                      <h3>Клетка / пробка</h3>
                      <p>
                        {live.wear
                          ? `${wearKindRu(live.wear.kind)} · ${formatHoursLeft(live.wear.remainingMs)}`
                          : "нет"}
                      </p>
                    </article>
                    <article
                      className={`chat-sheet-stat${live.denial ? " is-on" : ""}`}
                    >
                      <h3>Denial</h3>
                      <p>
                        {live.denial
                          ? `${formatHoursLeft(live.denial.remainingMs)} · эджи ${live.denial.edgesDone}/${live.denial.edgesTarget}`
                          : "нет"}
                      </p>
                    </article>
                    <article
                      className={`chat-sheet-stat${live.checkInOverdue ? " is-warn" : live.checkIn ? " is-on" : ""}`}
                    >
                      <h3>Check-in</h3>
                      <p>
                        {live.checkIn
                          ? live.checkInOverdue
                            ? "просрочен — ждёт отчёт"
                            : live.checkIn.note || live.checkIn.kind
                          : "нет"}
                      </p>
                    </article>
                    {live.clothing.active ? (
                      <article className="chat-sheet-stat is-on">
                        <h3>Одежда</h3>
                        <p>{live.clothing.detail}</p>
                      </article>
                    ) : null}
                  </section>

                  <section className="chat-sheet-levels" aria-label="Прогрессии">
                    <h3 className="chat-sheet-h">Прогрессии</h3>
                    <ul>
                      {control.progressions.map((p) => (
                        <li
                          key={p.id}
                          className={p.level > 0 ? "" : "is-dim"}
                          title={p.note || undefined}
                        >
                          <span>{p.labelRu}</span>
                          <b>{p.level}</b>
                        </li>
                      ))}
                    </ul>
                  </section>
                </div>
              ) : null}

              {sheetTab === "memory" ? (
                <div className="chat-sheet-block">
                  <p className="chat-page__soul-lead">
                    Психология, отношения, эпизоды, дневник — как в Soul of Waifu.
                  </p>
                  <div
                    className="chat-page__modes"
                    role="tablist"
                    aria-label="Режим памяти"
                  >
                    {SOUL_MEMORY_MODES.map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        role="tab"
                        aria-selected={soul.mode === mode}
                        className={`chat-page__mode${soul.mode === mode ? " is-active" : ""}`}
                        onClick={() => setMode(mode)}
                      >
                        {soulMemoryModeLabelRu(mode)}
                      </button>
                    ))}
                  </div>
                  <dl className="chat-sheet-metrics">
                    <div>
                      <dt>Чувство</dt>
                      <dd>
                        {soul.character.primaryEmotion} · {soul.character.intensity}
                      </dd>
                    </div>
                    <div>
                      <dt>Фокус</dt>
                      <dd>{soulFocusRu(soul.character.immediateFocus)}</dd>
                    </div>
                    <div>
                      <dt>Доверие</dt>
                      <dd>{soul.user.trustLevel}</dd>
                    </div>
                    {soul.openLoops.length > 0 ? (
                      <div>
                        <dt>Незакрыто</dt>
                        <dd>
                          {soul.openLoops
                            .slice(-3)
                            .map((loop) => loop.summary)
                            .join(" · ")}
                        </dd>
                      </div>
                    ) : null}
                    {lastSession ? (
                      <div>
                        <dt>Последняя сессия</dt>
                        <dd>{lastSession.summary}</dd>
                      </div>
                    ) : null}
                    {stanceView.likes.length +
                      stanceView.curious.length +
                      stanceView.refuses.length >
                    0 ? (
                      <div>
                        <dt>Предпочтения</dt>
                        <dd>
                          {[
                            stanceView.likes.length
                              ? `Любит: ${stanceView.likes.join(", ")}`
                              : "",
                            stanceView.curious.length
                              ? `Интересно: ${stanceView.curious.join(", ")}`
                              : "",
                            stanceView.refuses.length
                              ? `Часто отказывается: ${stanceView.refuses.join(", ")}`
                              : "",
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </dd>
                      </div>
                    ) : null}
                    {stanceView.boundaries.length > 0 ? (
                      <div>
                        <dt>Границы</dt>
                        <dd>{stanceView.boundaries.join(", ")}</dd>
                      </div>
                    ) : null}
                    {soul.intent &&
                    (!soul.intent.expiresAtMs ||
                      soul.intent.expiresAtMs > Date.now()) ? (
                      <div>
                        <dt>Цель</dt>
                        <dd>{formatIntentLabelRu(soul.intent)}</dd>
                      </div>
                    ) : null}
                    <div>
                      <dt>Темы</dt>
                      <dd>
                        {soul.topics.length === 0
                          ? "пока пусто"
                          : soul.topics
                              .map((t) => t.filename.replace(/\.md$/, ""))
                              .join(", ")}
                      </dd>
                    </div>
                  </dl>
                  {diaryBit ? (
                    <div className="chat-page__diary">
                      <h3>Дневник</h3>
                      <p>{diaryBit}</p>
                    </div>
                  ) : (
                    <p className="chat-page__muted">
                      Дневник появится после пачки реплик.
                    </p>
                  )}
                  <div className="chat-page__memory-acts">
                    <button
                      type="button"
                      className="chat-page__ghost"
                      disabled={!soul.diaryMd.trim()}
                      onClick={wipeSoulDiary}
                    >
                      Очистить дневник
                    </button>
                    <button
                      type="button"
                      className="chat-page__ghost"
                      disabled={soul.topics.length === 0}
                      onClick={wipeSoulTopics}
                    >
                      Очистить темы
                    </button>
                  </div>
                  <p className="chat-page__muted chat-page__selfie-note">
                    Селфи позже — когда будет Comfy/A1111.
                  </p>
                </div>
              ) : null}
            </div>
          </aside>
        </>
      ) : null}
    </div>
  );
}

function ChatGearIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <circle cx="12" cy="12" r="3" />
      <path
        d="M12 3.5v2.2M12 18.3v2.2M3.5 12h2.2M18.3 12h2.2M6.1 6.1l1.6 1.6M16.3 16.3l1.6 1.6M17.9 6.1l-1.6 1.6M7.7 16.3l-1.6 1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ChatSlashIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <rect x="4.5" y="4.5" width="15" height="15" rx="3.5" />
      <path d="M14.5 7.5 9.5 16.5" strokeLinecap="round" />
    </svg>
  );
}
