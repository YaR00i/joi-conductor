import { useEffect, useState } from "react";
import {
  CHAT_GENERATION_PRESETS,
  CHAT_LLM_PROVIDERS,
  applyChatGenerationPreset,
  chatGenerationPresetLabelRu,
  chatLlmProviderLabelRu,
  chatPresetsFor,
  chatProviderNeedsKey,
  type ChatLlmProvider,
  type ChatLlmSettings,
} from "../lib/soul/llmSettings";
import {
  ollamaRoleMarks,
  recommendedOllamaNotInstalled,
  resolveInstalledOllamaName,
  sameOllamaModel,
  sortOllamaInstalled,
} from "../lib/ollamaCatalog";
import { fetchOllamaStatus } from "../lib/ollamaClient";
import { playUiClick, primeUiAudio } from "../lib/uiSound";
import { SoulRoleAssign } from "./SoulRoleAssign";
import { GroqSettings } from "./GroqSettings";

type Props = {
  value: ChatLlmSettings;
  onChange: (next: ChatLlmSettings) => void;
  ollamaModelHint?: string;
  installedModels?: readonly string[];
};

export function ChatLlmPanel({
  value,
  onChange,
  ollamaModelHint,
  installedModels = [],
}: Props) {
  const presets = chatPresetsFor(value.provider);
  const s = value.sampling;
  const [disk, setDisk] = useState(() => sortOllamaInstalled(installedModels));
  const ollama = value.provider === "ollama";
  const installedKey = installedModels.join("\n");

  useEffect(() => {
    if (!installedKey) return;
    setDisk(sortOllamaInstalled(installedKey.split("\n")));
  }, [installedKey]);

  useEffect(() => {
    if (!ollama) return;
    let cancelled = false;
    void fetchOllamaStatus(value.model)
      .then((next) => {
        if (!cancelled) setDisk(sortOllamaInstalled(next.models));
      })
      .catch(() => {
        /* keep last known disk list */
      });
    return () => {
      cancelled = true;
    };
  }, [ollama, value.model]);

  const catalogMissing = ollama
    ? recommendedOllamaNotInstalled(disk)
    : [];
  const router = value.roleModels?.router ?? "";
  const extractor = value.roleModels?.extractor ?? "";
  const planner = value.roleModels?.planner ?? "";

  function setProvider(provider: ChatLlmProvider) {
    if (provider === value.provider) return;
    void primeUiAudio();
    playUiClick();
    const nextPresets = chatPresetsFor(provider);
    let nextModel = value.model;
    if (provider !== value.provider) {
      if (provider === "ollama") {
        nextModel =
          resolveInstalledOllamaName(value.model, disk) ?? disk[0] ?? "";
      } else {
        nextModel =
          nextPresets.find((p) => p.id === value.model)?.id ??
          nextPresets[0]?.id ??
          "";
      }
    }
    onChange({
      ...value,
      provider,
      model: nextModel,
      endpoint: provider === "custom" ? value.endpoint : "",
      apiKey: provider === value.provider ? value.apiKey : "",
      groqLocalModel: provider === "groq" && value.provider === "ollama" ? value.model : value.groqLocalModel,
      groqConversationId: "",
      roleModels: provider !== value.provider && !(provider === "groq" && value.provider === "ollama") ? {} : value.roleModels,
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

      {ollama ? (
        <div className="chat-llm__disk">
          <span className="chat-llm__field-label">На диске</span>
          {disk.length === 0 ? (
            <p className="chat-llm__chip-hint">
              Пока пусто. Скачай модель в Настройки → ИИ ресурсы, затем нажми
              «обновить» там же.
            </p>
          ) : (
            <ul className="llm-models" role="listbox" aria-label="Скачанные модели">
              {disk.map((name) => {
                const marks = ollamaRoleMarks({
                  name,
                  chat: value.model,
                  router,
                  extractor,
                  planner,
                });
                const active = sameOllamaModel(value.model, name);
                return (
                  <li key={name}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={active}
                      className={`llm-models__item${active ? " is-active" : ""}`}
                      onClick={() => {
                        void primeUiAudio();
                        playUiClick();
                        onChange({ ...value, model: name });
                      }}
                    >
                      <span className="llm-models__name">{name}</span>
                      <span className="llm-models__mark">
                        {marks.length > 0 ? marks.join(" · ") : "назначить"}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : (
        <>
          <label className="chat-llm__field">
            <span>Модель</span>
            <input
              value={value.model}
              placeholder="id модели"
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
        </>
      )}

      {value.provider === "groq" ? <GroqSettings value={value} onChange={onChange} /> : null}
      {value.provider !== "groq" ? <div className="chat-llm__field">
        <span>Роли</span>
        <SoulRoleAssign
          settings={value}
          onChange={onChange}
          installed={ollama ? disk : []}
          sessionFallback={ollamaModelHint}
          allowEmptyChat={ollama}
        />
      </div> : null}

      <div className="chat-llm__field">
        <span>Стиль ответа</span>
        <div className="chat-llm__presets chat-llm__presets--three">
          {CHAT_GENERATION_PRESETS.map((preset) => {
            const active = (value.generationPreset ?? "balanced") === preset;
            return (
              <button
                key={preset}
                type="button"
                className={`chat-llm__chip${active ? " is-on" : ""}`}
                onClick={() => {
                  void primeUiAudio();
                  playUiClick();
                  onChange(applyChatGenerationPreset(value, preset));
                }}
              >
                <span className="chat-llm__chip-hint">
                  {chatGenerationPresetLabelRu(preset)}
                </span>
              </button>
            );
          })}
        </div>
      </div>

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

      {value.provider !== "groq" && chatProviderNeedsKey(value.provider) ? (
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
        <summary>Тонкости генерации</summary>
        {catalogMissing.length > 0 ? (
          <div className="chat-llm__field">
            <span>Ещё не на диске</span>
            <p className="chat-llm__chip-hint">
              Имя подставится в чат. Скачать — Настройки → ИИ ресурсы.
            </p>
            <div className="chat-llm__presets">
              {catalogMissing.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="chat-llm__chip"
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
          </div>
        ) : null}
        <label className="chat-llm__check">
          <input
            type="checkbox"
            checked={value.voiceExamples !== false}
            onChange={(e) =>
              onChange({ ...value, voiceExamples: e.target.checked })
            }
          />
          Примеры голоса в промпте
        </label>
        <label className="chat-llm__check">
          <input
            type="checkbox"
            checked={Boolean(value.turnDebug)}
            onChange={(e) =>
              onChange({ ...value, turnDebug: e.target.checked })
            }
          />
          Контекст хода — почему модель получила такой промпт (в разработке виден всегда)
        </label>
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
