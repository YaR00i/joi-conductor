import { useEffect, useRef, useState } from "react";
import { ChatLlmPanel } from "../components/ChatLlmPanel";
import { ChatMessageActions } from "../components/ChatMessageActions";
import { MistressImg } from "../components/MistressImg";
import { UiCheck } from "../components/UiCheck";
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
  syncSoulMemory,
  soulMemoryModeLabelRu,
  SOUL_MEMORY_MODES,
  regenerateSoulReply,
  editSoulMessage,
  loadChatLlmSettings,
  saveChatLlmSettings,
  resolveChatLlm,
  type SoulMemoryMode,
  type SoulMistressState,
  type ChatLlmSettings,
} from "../lib/soul";
import { playUiClick, playUiConfirm, primeUiAudio } from "../lib/uiSound";
import { loadVoiceSettings } from "../lib/voiceSettings";
import type { SpeechTts } from "../lib/voice/speechTts";

const CHAT_TTS_KEY = "joi-soul-chat-tts-v1";

type Props = {
  tts: SpeechTts;
  sessionLive?: boolean;
};

function loadSpeakPref(): boolean {
  try {
    return localStorage.getItem(CHAT_TTS_KEY) !== "0";
  } catch {
    return true;
  }
}

function chatEmptyHint(mode: SoulMemoryMode): string {
  switch (mode) {
    case 0:
      return "Напиши ей. После пары реплик роутер обновит MEMORY.md, USER.md, темы и дневник.";
    case 1:
      return "Напиши ей. После пары реплик обновится индекс и дневник — без отдельных тем.";
    case 2:
      return "Напиши ей. После пары реплик обновится индекс памяти, без дневника.";
    case 3:
      return "Напиши ей. После пары реплик она допишет дневник, без роутера тем.";
    default: {
      const _exhaustive: never = mode;
      return _exhaustive;
    }
  }
}

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

export function ChatPage({ tts, sessionLive = false }: Props) {
  const [pack, setPack] = useState<MistressPack>(() => getActiveMistress());
  const [soul, setSoul] = useState<SoulMistressState>(() =>
    loadSoulState(getActiveMistress().id, getActiveMistress().bible),
  );
  const [chatLlm, setChatLlm] = useState<ChatLlmSettings>(loadChatLlmSettings);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [speakOn, setSpeakOn] = useState(loadSpeakPref);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const soulRef = useRef(soul);
  const packRef = useRef(pack);
  const chatLlmRef = useRef(chatLlm);
  const abortRef = useRef<AbortController | null>(null);
  const syncingRef = useRef(false);
  soulRef.current = soul;
  packRef.current = pack;
  chatLlmRef.current = chatLlm;

  useEffect(() => {
    return subscribeActiveMistress((next) => {
      abortRef.current?.abort();
      abortRef.current = null;
      setPack(next);
      setSoul(loadSoulState(next.id, next.bible));
      setError(null);
      setBusy(false);
      setSyncing(false);
      setEditingId(null);
      syncingRef.current = false;
    });
  }, []);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [soul.messages.length, busy]);

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

  function persist(next: SoulMistressState, mistressId = packRef.current.id) {
    saveSoulState(mistressId, next);
    setSoul(next);
  }

  function persistLlm(next: ChatLlmSettings) {
    saveChatLlmSettings(next);
    setChatLlm(next);
  }

  function beginRequest() {
    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;
    return abort;
  }

  async function runBackgroundSync(snapshot: SoulMistressState) {
    if (!soulNeedsSync(snapshot) || syncingRef.current) return;
    const pendingAtStart = snapshot.pendingSinceRouter;
    const { client } = makeClient(chatLlmRef.current);
    syncingRef.current = true;
    setSyncing(true);
    try {
      const synced = await syncSoulMemory(
        snapshot,
        packRef.current.bible,
        client,
        abortRef.current?.signal,
      );
      const cur = soulRef.current;
      persist({
        ...cur,
        character: synced.character,
        user: synced.user,
        memoryMd: synced.memoryMd,
        userMd: synced.userMd,
        diaryMd: synced.diaryMd,
        topics: synced.topics,
        pendingSinceRouter: Math.max(
          0,
          cur.pendingSinceRouter - pendingAtStart,
        ),
      });
    } catch (err) {
      if ((err as { name?: string }).name === "AbortError") return;
      setError(err instanceof Error ? err.message : "не удалось обновить память");
    } finally {
      syncingRef.current = false;
      setSyncing(false);
    }
  }

  function maybeSpeak(text: string, voiceTtsEnabled: boolean) {
    if (speakOn && voiceTtsEnabled && !sessionLive && text.trim()) {
      tts.speak(text);
    }
  }

  async function send() {
    const text = draft.trim();
    if (!text || busy) return;
    void primeUiAudio();
    playUiConfirm();
    setDraft("");
    setError(null);
    setBusy(true);
    const abort = beginRequest();
    const { voice, client } = makeClient(chatLlmRef.current);
    try {
      const result = await sendSoulChatTurn({
        state: soulRef.current,
        bible: pack.bible,
        userText: text,
        client,
        signal: abort.signal,
      });
      persist(result.state);
      if (result.error) {
        setError(result.error);
        return;
      }
      maybeSpeak(result.reply, voice.ttsEnabled);
      void runBackgroundSync(result.state);
    } catch (err) {
      if ((err as { name?: string }).name === "AbortError") return;
      setError(err instanceof Error ? err.message : "модель не ответила");
    } finally {
      setBusy(false);
    }
  }

  async function regenerate(messageId: string) {
    if (busy) return;
    setError(null);
    setBusy(true);
    const abort = beginRequest();
    const { voice, client } = makeClient(chatLlmRef.current);
    try {
      const result = await regenerateSoulReply({
        state: soulRef.current,
        bible: pack.bible,
        messageId,
        client,
        signal: abort.signal,
      });
      persist(result.state);
      if (result.error) {
        setError(result.error);
        return;
      }
      maybeSpeak(result.reply, voice.ttsEnabled);
    } catch (err) {
      if ((err as { name?: string }).name === "AbortError") return;
      setError(err instanceof Error ? err.message : "модель не ответила");
    } finally {
      setBusy(false);
    }
  }

  function commitEdit(messageId: string) {
    persist(editSoulMessage(soulRef.current, messageId, editDraft));
    setEditingId(null);
    setEditDraft("");
  }

  function setMode(mode: SoulMemoryMode) {
    void primeUiAudio();
    playUiClick();
    persist({ ...soul, mode });
  }

  function clearThread() {
    void primeUiAudio();
    playUiClick();
    persist({ ...soul, messages: [], pendingSinceRouter: 0 });
    setEditingId(null);
  }

  const portrait = pack.assets.avatarFull;
  const diaryBit = lastDiaryExcerpt(soul.diaryMd);
  const canSpeak = !sessionLive;
  const voiceHint = loadVoiceSettings().model;

  return (
    <div className="chat-page page--chat">
      <header className="chat-page__head">
        <div>
          <p className="chat-page__eyebrow">Вне сессии</p>
          <h1 className="chat-page__title">Чат · {pack.displayNameRu}</h1>
          <p className="chat-page__sub">
            Свободный разговор. Очередь сессии сюда не ходит — только характер и
            Soul Memory.
          </p>
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
              <p className="chat-page__empty">{chatEmptyHint(soul.mode)}</p>
            ) : (
              soul.messages.map((m) => (
                <div
                  key={m.id}
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
                    <p>{m.text}</p>
                  )}
                  {m.role === "assistant" && editingId !== m.id ? (
                    <ChatMessageActions
                      disabled={busy}
                      speakDisabled={!canSpeak}
                      onRegenerate={() => void regenerate(m.id)}
                      onEdit={() => {
                        setEditingId(m.id);
                        setEditDraft(m.text);
                      }}
                      onSpeak={() => {
                        if (!canSpeak) return;
                        tts.speak(m.text);
                      }}
                    />
                  ) : null}
                </div>
              ))
            )}
            {busy ? (
              <p className="chat-page__status">думает…</p>
            ) : syncing ? (
              <p className="chat-page__status">пишет память…</p>
            ) : null}
          </div>

          {error ? <p className="chat-page__error">{error}</p> : null}

          <form
            className="chat-page__composer"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <textarea
              className="chat-page__input"
              rows={3}
              value={draft}
              disabled={busy}
              placeholder="Напиши ей…"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
            />
            <div className="chat-page__composer-row">
              <button
                type="submit"
                className="chat-page__send"
                disabled={busy || !draft.trim()}
              >
                Отправить
              </button>
              <button
                type="button"
                className="chat-page__ghost"
                onClick={clearThread}
                disabled={busy || soul.messages.length === 0}
              >
                Очистить переписку
              </button>
              <UiCheck
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
              <span className="chat-page__composer-spacer" />
              <button
                type="button"
                className={`chat-page__gear${sheetOpen ? " is-on" : ""}`}
                title="Модель и Soul Memory"
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
          </form>
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
              <h2 className="chat-page__soul-title">Модель</h2>
              <button
                type="button"
                className="chat-page__ghost"
                onClick={() => setSheetOpen(false)}
              >
                Закрыть
              </button>
            </div>
            <ChatLlmPanel
              value={chatLlm}
              onChange={persistLlm}
              ollamaModelHint={voiceHint}
            />

            <h2 className="chat-page__soul-title">Soul Memory</h2>
            <p className="chat-page__soul-lead">
              Как в Soul of Waifu: психология, отношения, эпизоды, дневник.
            </p>

            <div className="chat-page__modes" role="tablist" aria-label="Режим памяти">
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

            <dl className="chat-page__facts">
              <div>
                <dt>Чувство</dt>
                <dd>
                  {soul.character.primaryEmotion} · {soul.character.intensity}
                </dd>
              </div>
              <div>
                <dt>Фокус</dt>
                <dd>{soul.character.immediateFocus}</dd>
              </div>
              <div>
                <dt>Доверие</dt>
                <dd>{soul.user.trustLevel}</dd>
              </div>
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

            <button
              type="button"
              className="chat-page__selfie"
              disabled
              title="Селфи позже: сначала Comfy/A1111 и смена GPU"
            >
              Селфи
            </button>
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
