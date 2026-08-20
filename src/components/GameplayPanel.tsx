import { useEffect, useState } from "react";
import { DeviceSettingsPanel } from "./DeviceSettingsPanel";
import { RouletteSettingsPanel } from "./RouletteSettingsPanel";
import { TagTypesSettingsPanel } from "./TagTypesSettingsPanel";
import { TideHitVerifyPanel } from "./TideHitVerifyPanel";
import type { ContentUnlockLists } from "../lib/contentUnlocks";
import type { RouletteSettings } from "../lib/rouletteSettings";

const STORAGE_KEY = "joi-settings-gameplay-pane-v1";

const GAMEPLAY_PANES = ["roulette", "tags", "tide", "device"] as const;

export type GameplayPaneId = (typeof GAMEPLAY_PANES)[number];

function isGameplayPane(v: unknown): v is GameplayPaneId {
  return typeof v === "string" && (GAMEPLAY_PANES as readonly string[]).includes(v);
}

function loadPane(): GameplayPaneId {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (isGameplayPane(raw)) return raw;
  } catch {
    /* ignore */
  }
  return "roulette";
}

function paneLabelRu(id: GameplayPaneId): string {
  switch (id) {
    case "roulette":
      return "Рулетка";
    case "tags":
      return "Теги";
    case "tide":
      return "CBT";
    case "device":
      return "Игрушка";
    default: {
      const _exhaustive: never = id;
      return _exhaustive;
    }
  }
}

function paneHintRu(id: GameplayPaneId): string {
  switch (id) {
    case "roulette":
      return "колёса сессии";
    case "tags":
      return "типы библиотеки";
    case "tide":
      return "проверка ударов";
    case "device":
      return "Lovense / Buttplug";
    default: {
      const _exhaustive: never = id;
      return _exhaustive;
    }
  }
}

function paneDotRu(id: GameplayPaneId): string {
  switch (id) {
    case "roulette":
      return "пишется сразу";
    case "tags":
      return "купленные теги";
    case "tide":
      return "честь / микрофон";
    case "device":
      return "device bridge";
    default: {
      const _exhaustive: never = id;
      return _exhaustive;
    }
  }
}

type Props = {
  settings: RouletteSettings;
  onChange: (next: RouletteSettings) => void;
  unlocks: ContentUnlockLists;
};

/** Gameplay tab: same chrome as Voice / ИИ ресурсы (bar + one pane). */
export function GameplayPanel({ settings, onChange, unlocks }: Props) {
  const [pane, setPane] = useState<GameplayPaneId>(() => loadPane());

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, pane);
    } catch {
      /* ignore */
    }
  }, [pane]);

  return (
    <div className="brain-panel">
      <div
        className="gameplay-nav"
        role="radiogroup"
        aria-label="Раздел геймплея"
      >
        {GAMEPLAY_PANES.map((id) => {
          const on = pane === id;
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={on}
              className={"gameplay-nav__card" + (on ? " is-active" : "")}
              onClick={() => setPane(id)}
            >
              <span className="gameplay-nav__title">{paneLabelRu(id)}</span>
              <span className="gameplay-nav__sub">{paneHintRu(id)}</span>
              <span className="gameplay-nav__state">{paneDotRu(id)}</span>
            </button>
          );
        })}
      </div>

      {pane === "roulette" ? (
        <>
          <p className="brain-panel__hint">
            Сектора колёс, эскалации и свои теги. Сохраняется локально и сразу
            влияет на «Пусть Госпожа решает».
          </p>
          <RouletteSettingsPanel
            embedded
            hideEmbeddedTitle
            settings={settings}
            onChange={onChange}
            unlocks={unlocks}
          />
        </>
      ) : null}

      {pane === "tags" ? (
        <>
          <p className="brain-panel__hint">
            Категории для библиотеки на Рулетке и фильтров в Избранном. При
            покупке тип выбирается сразу — здесь можно поправить.
          </p>
          <TagTypesSettingsPanel embedded unlocks={unlocks} />
        </>
      ) : null}

      {pane === "tide" ? (
        <>
          <p className="brain-panel__hint">
            Честь — метроном считает акценты. Микрофон — удар засчитывается
            только если достаточно громкий.
          </p>
          <TideHitVerifyPanel />
        </>
      ) : null}

      {pane === "device" ? (
        <>
          <p className="brain-panel__hint">
            Уровни сессии 0–5 → интенсивность. Пауза, конец блока и смена
            блока гасят игрушку.
          </p>
          <DeviceSettingsPanel embedded />
        </>
      ) : null}
    </div>
  );
}
