import {
  CHAT_LLM_PROVIDERS,
  chatLlmProviderLabelRu,
  chatPresetsFor,
  chatProviderNeedsKey,
  type ChatLlmProvider,
  type ChatLlmSettings,
} from "../lib/soul/llmSettings";
import { playUiClick, primeUiAudio } from "../lib/uiSound";

type Props = {
  value: ChatLlmSettings;
  onChange: (next: ChatLlmSettings) => void;
  ollamaModelHint?: string;
};

export function ChatLlmPanel({ value, onChange, ollamaModelHint }: Props) {
  const presets = chatPresetsFor(value.provider);
  const s = value.sampling;

  function setProvider(provider: ChatLlmProvider) {
    void primeUiAudio();
    playUiClick();
    const nextPresets = chatPresetsFor(provider);
    onChange({
      ...value,
      provider,
      model:
        provider === value.provider
          ? value.model
          : nextPresets[0]?.id ?? value.model,
      endpoint: provider === "custom" ? value.endpoint : "",
    });
  }

  return (
    <div className="chat-llm">
      <div className="chat-llm__providers" role="tablist" aria-label="Провайдер чата">
        {CHAT_LLM_PROVIDERS.map((provider) => (
          <button
            key={provider}
            type="button"
            role="tab"
            aria-selected={value.provider === provider}
            className={`chat-llm__prov${value.provider === provider ? " is-active" : ""}`}
            onClick={() => setProvider(provider)}
          >
            {chatLlmProviderLabelRu(provider)}
          </button>
        ))}
      </div>

      <label className="chat-llm__field">
        <span>Модель</span>
        <input
          value={value.model}
          placeholder={
            value.provider === "ollama"
              ? ollamaModelHint || "как в ИИ ресурсах"
              : "id модели"
          }
          onChange={(e) => onChange({ ...value, model: e.target.value })}
        />
      </label>

      {presets.length > 0 ? (
        <div className="chat-llm__presets">
          {presets.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`chat-llm__chip${value.model === p.id ? " is-on" : ""}`}
              title={p.hint}
              onClick={() => {
                void primeUiAudio();
                playUiClick();
                onChange({ ...value, model: p.id });
              }}
            >
              <span className="chat-llm__chip-id">{p.id}</span>
              <span className="chat-llm__chip-hint">{p.hint}</span>
            </button>
          ))}
        </div>
      ) : null}

      {value.provider === "custom" ? (
        <label className="chat-llm__field">
          <span>Endpoint</span>
          <input
            value={value.endpoint}
            placeholder="http://127.0.0.1:1234/v1/chat/completions"
            onChange={(e) => onChange({ ...value, endpoint: e.target.value })}
          />
        </label>
      ) : null}

      {chatProviderNeedsKey(value.provider) ? (
        <label className="chat-llm__field">
          <span>API-ключ</span>
          <input
            type="password"
            autoComplete="off"
            value={value.apiKey}
            placeholder={
              value.provider === "openrouter" ? "sk-or-…" : "sk-…"
            }
            onChange={(e) => onChange({ ...value, apiKey: e.target.value })}
          />
        </label>
      ) : null}

      <details className="chat-llm__more">
        <summary>Параметры SoW</summary>
        <label className="chat-llm__range">
          <span>Temperature {s.temperature.toFixed(2)}</span>
          <input
            type="range"
            min={0}
            max={2}
            step={0.05}
            value={s.temperature}
            onChange={(e) =>
              onChange({
                ...value,
                sampling: { ...s, temperature: Number(e.target.value) },
              })
            }
          />
        </label>
        <label className="chat-llm__range">
          <span>Top-P {s.topP.toFixed(2)}</span>
          <input
            type="range"
            min={0.05}
            max={1}
            step={0.05}
            value={s.topP}
            onChange={(e) =>
              onChange({
                ...value,
                sampling: { ...s, topP: Number(e.target.value) },
              })
            }
          />
        </label>
        <label className="chat-llm__range">
          <span>Min-P {s.minP.toFixed(2)}</span>
          <input
            type="range"
            min={0}
            max={0.3}
            step={0.01}
            value={s.minP}
            onChange={(e) =>
              onChange({
                ...value,
                sampling: { ...s, minP: Number(e.target.value) },
              })
            }
          />
        </label>
        <label className="chat-llm__range">
          <span>Max tokens {s.maxTokens}</span>
          <input
            type="range"
            min={128}
            max={2048}
            step={32}
            value={s.maxTokens}
            onChange={(e) =>
              onChange({
                ...value,
                sampling: { ...s, maxTokens: Number(e.target.value) },
              })
            }
          />
        </label>
        <label className="chat-llm__range">
          <span>Frequency {s.frequencyPenalty.toFixed(2)}</span>
          <input
            type="range"
            min={0}
            max={1.5}
            step={0.05}
            value={s.frequencyPenalty}
            onChange={(e) =>
              onChange({
                ...value,
                sampling: {
                  ...s,
                  frequencyPenalty: Number(e.target.value),
                },
              })
            }
          />
        </label>
        <label className="chat-llm__range">
          <span>Presence {s.presencePenalty.toFixed(2)}</span>
          <input
            type="range"
            min={0}
            max={1.5}
            step={0.05}
            value={s.presencePenalty}
            onChange={(e) =>
              onChange({
                ...value,
                sampling: {
                  ...s,
                  presencePenalty: Number(e.target.value),
                },
              })
            }
          />
        </label>
      </details>
    </div>
  );
}
