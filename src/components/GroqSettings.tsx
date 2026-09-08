import { useEffect, useRef, useState } from "react";
import { createDirectSoulChatClient } from "../lib/soul/client";
import { resolveChatLlm, type ChatLlmSettings } from "../lib/soul/llmSettings";
import { loadVoiceSettings } from "../lib/voiceSettings";
import "./groqSettings.css";

type Props = { value: ChatLlmSettings; onChange: (next: ChatLlmSettings) => void; disabled?: boolean };

export function GroqConversationSwitch({ value, onChange, disabled, compact = false }: Props & { compact?: boolean }) {
  if (value.provider !== "groq") return null;
  const cloud = Boolean(value.groqConversationId);
  return <div className={`groq-mode${compact ? " groq-mode--compact" : ""}`}>
    <div className="groq-mode__choices" role="group" aria-label="Приватность разговора">
      <button type="button" aria-pressed={!cloud} disabled={disabled}
        aria-label="Приватно · Ollama" title="Приватно · Ollama — разговор обрабатывается локально"
        onClick={() => onChange({ ...value, groqConversationId: "" })}>{compact ? "Ollama" : "Приватно · Ollama"}</button>
      <button type="button" aria-pressed={cloud} disabled={disabled || !value.apiKey.trim()}
        aria-label="Обычный разговор · Groq" title="Обычный разговор · Groq — новые сообщения передаются в облако"
        onClick={() => { if (!cloud) onChange({ ...value, groqConversationId: crypto.randomUUID() }); }}>
        {compact ? "Groq" : "Обычный разговор · Groq"}
      </button>
    </div>
    {!compact && <p>{cloud
      ? "В Groq отправляются новые сообщения этого разговора. Старый дневник и приватная история остаются на компьютере. Перед личной сценой переключись на Ollama."
      : "Переписка и память обрабатываются локальной Ollama. Для облачного разговора выбери Groq."}</p>}
  </div>;
}

export function GroqSettings({ value, onChange }: Props) {
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const request = useRef<AbortController | null>(null);
  useEffect(() => {
    setStatus("");
    return () => { request.current?.abort(); };
  }, [value.apiKey, value.model]);
  async function probe() {
    const abort = new AbortController();
    request.current?.abort();
    request.current = abort;
    setBusy(true);
    setStatus("Проверяю ключ и ответ выбранной модели…");
    const start = performance.now();
    try {
      const resolved = resolveChatLlm(value, loadVoiceSettings());
      const reply = await createDirectSoulChatClient(resolved).complete({
        messages: [{ role: "user", content: "Ответь по-русски одним коротким приветствием." }],
        maxTokens: 512, role: "chat", signal: abort.signal,
      });
      if (!abort.signal.aborted) setStatus(reply.text
        ? `Groq отвечает за ${((performance.now() - start) / 1000).toFixed(1)} с: ${reply.text}`
        : "Ответ без текста. Попробуй другую модель.");
    } catch (error) {
      if (!abort.signal.aborted) setStatus(error instanceof Error ? error.message : "Ошибка соединения");
    } finally {
      if (request.current === abort) { request.current = null; setBusy(false); }
    }
  }
  return <section className="groq-settings" aria-label="Подключение Groq">
    <strong>Облако для разговора, Ollama для приватного режима</strong>
    <p>Создай ключ в <a href="https://console.groq.com/keys" target="_blank" rel="noreferrer">Groq Console</a>,
      вставь его ниже и проверь подключение. Проверка отправляет только тестовое приветствие.</p>
    <label className="chat-llm__field"><span>API-ключ Groq</span>
      <input type="password" autoComplete="off" value={value.apiKey} placeholder="gsk_…"
        onChange={(event) => onChange({ ...value, apiKey: event.target.value })} />
    </label>
    <label className="chat-llm__field"><span>Локальная модель для приватного режима и резерва</span>
      <input value={value.groqLocalModel ?? ""} placeholder={loadVoiceSettings().model || "Имя модели Ollama"}
        onChange={(event) => onChange({ ...value, groqLocalModel: event.target.value })} />
    </label>
    <p>Пустое поле — модель из настроек Ollama. Разбор, память и планирование выполняются локально.
      При лимите или временном сбое Groq ответит Ollama, если она запущена и модель установлена.</p>
    <button type="button" className="chat-llm__chip" disabled={busy || !value.apiKey.trim()}
      onClick={() => void probe()}>{busy ? "Проверяю…" : "Проверить Groq"}</button>
    <p role="status">{status}</p>
    <GroqConversationSwitch value={value} onChange={onChange} disabled={busy} />
  </section>;
}
