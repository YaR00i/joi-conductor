import { useMemo, useState } from "react";
import {
  ollamaSelectOptions,
  resolveInstalledOllamaName,
  sortOllamaInstalled,
} from "../lib/ollamaCatalog";
import {
  type ChatLlmSettings,
  type SoulRoleModels,
} from "../lib/soul/llmSettings";
import { probeSoulRoleHealth } from "../lib/soul/roleHealth";
import { playUiClick, primeUiAudio } from "../lib/uiSound";

type Props = {
  settings: ChatLlmSettings;
  onChange: (next: ChatLlmSettings) => void;
  installed: readonly string[];
  /** Empty chat model falls back to the session Local LLM. */
  allowEmptyChat?: boolean;
  sessionFallback?: string;
  /** Picking a disk model switches the chat provider to Ollama. */
  preferOllama?: boolean;
};

function roleModelsOf(settings: ChatLlmSettings): SoulRoleModels {
  return {
    router: settings.roleModels?.router ?? "",
    extractor: settings.roleModels?.extractor ?? "",
    planner: settings.roleModels?.planner ?? "",
  };
}

function selectValue(current: string, installed: readonly string[]): string {
  return resolveInstalledOllamaName(current, installed) ?? current.trim();
}

export function SoulRoleAssign({
  settings,
  onChange,
  installed,
  allowEmptyChat = true,
  sessionFallback = "",
  preferOllama = false,
}: Props) {
  const roles = roleModelsOf(settings);
  const disk = useMemo(() => sortOllamaInstalled(installed), [installed]);
  const useSelect = disk.length > 0;
  const [probe, setProbe] = useState("");
  const [probeBusy, setProbeBusy] = useState(false);

  function commit(patch: {
    model?: string;
    router?: string;
    extractor?: string;
    planner?: string;
  }) {
    const next: ChatLlmSettings = {
      ...settings,
      model: patch.model ?? settings.model,
      roleModels: {
        router: patch.router ?? roles.router,
        extractor: patch.extractor ?? roles.extractor,
        planner: patch.planner ?? roles.planner,
      },
    };
    if (preferOllama) next.provider = "ollama";
    onChange(next);
  }

  const chatOptions = ollamaSelectOptions(settings.model, disk);
  const routerOptions = ollamaSelectOptions(roles.router, disk);
  const extractorOptions = ollamaSelectOptions(roles.extractor, disk);
  const plannerOptions = ollamaSelectOptions(roles.planner, disk);
  const chatSelect = selectValue(settings.model, disk);
  const routerSelect = selectValue(roles.router, disk);
  const extractorSelect = selectValue(roles.extractor, disk);
  const plannerSelect = selectValue(roles.planner, disk);

  return (
    <div className="soul-roles">
      <p className="soul-roles__hint">
        Чат — реплики. Роутер — что запомнить. Разбор — предложения действий.
        Планер — из каких деталей собрать принятую сессию. Пусто у служебной роли = модель чата. Для них лучше небольшая
        instruct-модель, которая держит JSON.
      </p>

      {useSelect ? (
        <>
          <label className="soul-roles__row">
            <span>
              <strong>Чат</strong>
              реплики
            </span>
            <select
              value={chatSelect}
              aria-label="Модель чата"
              onChange={(e) => commit({ model: e.target.value })}
            >
              {allowEmptyChat ? (
                <option value="">
                  {sessionFallback
                    ? `Как в сессии · ${sessionFallback}`
                    : "Как в сессии"}
                </option>
              ) : null}
              {chatOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label className="soul-roles__row">
            <span>
              <strong>Роутер</strong>
              память
            </span>
            <select
              value={routerSelect}
              aria-label="Модель роутера"
              onChange={(e) => commit({ router: e.target.value })}
            >
              <option value="">Как чат</option>
              {routerOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label className="soul-roles__row">
            <span>
              <strong>Разбор</strong>
              действия
            </span>
            <select
              value={extractorSelect}
              aria-label="Модель разбора действий"
              onChange={(e) => commit({ extractor: e.target.value })}
            >
              <option value="">Как чат</option>
              {extractorOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label className="soul-roles__row">
            <span>
              <strong>Планер</strong>
              принятая сессия
            </span>
            <select
              value={plannerSelect}
              aria-label="Модель планера"
              onChange={(e) => commit({ planner: e.target.value })}
            >
              <option value="">Как чат</option>
              {plannerOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        </>
      ) : (
        <>
          <label className="soul-roles__row">
            <span>
              <strong>Чат</strong>
              реплики
            </span>
            <input
              value={settings.model}
              placeholder={sessionFallback || "id модели"}
              onChange={(e) => commit({ model: e.target.value })}
            />
          </label>
          <label className="soul-roles__row">
            <span>
              <strong>Роутер</strong>
              память
            </span>
            <input
              value={roles.router}
              placeholder="пусто = как чат"
              onChange={(e) => commit({ router: e.target.value })}
            />
          </label>
          <label className="soul-roles__row">
            <span>
              <strong>Разбор</strong>
              действия
            </span>
            <input
              value={roles.extractor}
              placeholder="пусто = как чат"
              onChange={(e) => commit({ extractor: e.target.value })}
            />
          </label>
          <label className="soul-roles__row">
            <span>
              <strong>Планер</strong>
              принятая сессия
            </span>
            <input
              value={roles.planner}
              placeholder="пусто = как чат"
              onChange={(e) => commit({ planner: e.target.value })}
            />
          </label>
        </>
      )}

      <label className="chat-llm__check">
        <input
          type="checkbox"
          checked={settings.sessionPlanner === "model"}
          onChange={(e) =>
            onChange({
              ...settings,
              sessionPlanner: e.target.checked ? "model" : "program",
            })
          }
        />
        ИИ-планер после «Согласен»
      </label>

      <button
        type="button"
        className="chat-llm__chip soul-roles__probe-btn"
        disabled={probeBusy}
        onClick={() => {
          void primeUiAudio();
          playUiClick();
          setProbeBusy(true);
          setProbe("");
          void probeSoulRoleHealth(settings)
            .then((result) => {
              setProbe(
                [
                  `Router`,
                  result.router.model || "(чат)",
                  `${result.router.latencyMs} ms`,
                  `retry ${result.router.retryUsed ? "yes" : "no"}`,
                  result.router.ok ? "✓ JSON" : `✗ ${result.router.detail}`,
                  "",
                  `Extractor`,
                  result.extractor.model || "(чат)",
                  `${result.extractor.latencyMs} ms`,
                  `retry ${result.extractor.retryUsed ? "yes" : "no"}`,
                  result.extractor.ok
                    ? "✓ proposal"
                    : `✗ ${result.extractor.detail}`,
                  "",
                  `Planner`,
                  result.planner.model || "(чат)",
                  `${result.planner.latencyMs} ms`,
                  `retry ${result.planner.retryUsed ? "yes" : "no"}`,
                  result.planner.ok
                    ? "✓ bounded plan"
                    : `✗ ${result.planner.detail}`,
                ].join("\n"),
              );
            })
            .catch((err) => {
              setProbe(
                err instanceof Error
                  ? err.message
                  : "не удалось проверить роли",
              );
            })
            .finally(() => setProbeBusy(false));
        }}
      >
        <span className="chat-llm__chip-hint">
          {probeBusy ? "Проверяю…" : "Проверить роли"}
        </span>
      </button>
      {probe ? <pre className="chat-llm__probe">{probe}</pre> : null}
    </div>
  );
}
