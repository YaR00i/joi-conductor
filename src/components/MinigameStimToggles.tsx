import { UiCheck } from "./UiCheck";
import type { RunnerSettings } from "../lib/runnerSettings";

/**
 * Shared Lovense / hands toggles for mini-game setup screens.
 * Persists through runnerSettings so one preference covers every game.
 */

interface Props {
  settings: RunnerSettings;
  onChange: (next: RunnerSettings) => void;
}

export function MinigameStimToggles({ settings, onChange }: Props) {
  const setKey = (key: "lovenseVibe" | "manualVibe", value: boolean) => {
    onChange({ ...settings, [key]: value });
  };

  return (
    <div className="runner-intro__feel">
      <span className="runner-intro__feel-title">Ощущения</span>
      <UiCheck
        checked={settings.lovenseVibe}
        onChange={(v) => setKey("lovenseVibe", v)}
      >
        <span className="runner-intro__feel-text">
          <strong>С вибратором Lovense</strong>
          <span className="muted">
            игра сама включает мотор на заданиях со стимулом
          </span>
        </span>
      </UiCheck>
      <UiCheck
        checked={settings.manualVibe}
        onChange={(v) => setKey("manualVibe", v)}
      >
        <span className="runner-intro__feel-text">
          <strong>С ручной вибрацией</strong>
          <span className="muted">
            задания со стимулом можно делать руками по инструкции — без
            устройства. Выключи оба тумблера — и вибрационных заданий не будет
          </span>
        </span>
      </UiCheck>
    </div>
  );
}
