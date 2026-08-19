import { UiCheck } from "../UiCheck";
import {
  playUiClick,
  playUiDeny,
  primeUiAudio,
} from "../../lib/uiSound";
import type { SessionState } from "../../lib/types";

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function SessionToolbar({
  state,
  status,
  busy,
  inPreflight,
  promptGate,
  mediaAutoplay,
  onMediaAutoplay,
  contentAutoplay,
  onContentAutoplay,
  muted,
  onMuted,
  ttsEnabled,
  onTtsEnabled,
  sfxVolume,
  onSfxVolume,
  ttsVolume,
  onTtsVolume,
  videoVolume,
  onVideoVolume,
  punishNotice,
  onSkip,
  onForceFinale,
  onAbort,
  onExport,
}: {
  state: SessionState | null;
  status: SessionState["status"] | "idle";
  busy: boolean;
  inPreflight: boolean;
  promptGate: boolean;
  mediaAutoplay: boolean;
  onMediaAutoplay: (v: boolean) => void;
  contentAutoplay: boolean;
  onContentAutoplay: (v: boolean) => void;
  muted: boolean;
  onMuted: (v: boolean) => void;
  ttsEnabled: boolean;
  onTtsEnabled: (v: boolean) => void;
  sfxVolume: number;
  onSfxVolume: (v: number) => void;
  ttsVolume: number;
  onTtsVolume: (v: number) => void;
  videoVolume: number;
  onVideoVolume: (v: number) => void;
  punishNotice?: string | null;
  onSkip: () => void;
  onForceFinale: () => void;
  onAbort: () => void;
  onExport: () => void;
}) {
  return (
    <div className="session__toolbar">
      <div className="session__toolbar-group session__toolbar-group--actions">
        <button
          type="button"
          disabled={status !== "running" || inPreflight || promptGate}
          onClick={() => {
            void primeUiAudio();
            playUiClick();
            onSkip();
          }}
        >
          Пропуск
        </button>
        <button
          type="button"
          disabled={!busy || inPreflight || promptGate}
          onClick={onForceFinale}
          title="Сразу к финальному роллу"
        >
          К финалу
        </button>
        {busy || inPreflight ? (
          <button
            type="button"
            className="btn-danger"
            onClick={() => {
              void primeUiAudio();
              playUiDeny();
              onAbort();
            }}
          >
            Стоп
          </button>
        ) : null}
        <button
          type="button"
          onClick={onExport}
          title="Скачать JSON сессии"
        >
          Экспорт
        </button>
      </div>

      <div className="session__toolbar-group session__toolbar-group--media">
        <UiCheck
          className="ui-check--inline"
          checked={mediaAutoplay}
          onChange={onMediaAutoplay}
          title="Автоматически запускать видео при появлении"
        >
          автоплей видео
        </UiCheck>
        <UiCheck
          className="ui-check--inline"
          checked={contentAutoplay}
          onChange={onContentAutoplay}
          title="Автоматически листать слайды (фото / гиф / видео)"
        >
          автоплей контента
        </UiCheck>
      </div>

      <div className="session__toolbar-group session__toolbar-group--audio">
        <UiCheck
          className="ui-check--inline"
          checked={muted}
          onChange={onMuted}
          title="Выключить биты, вибро-гул и UI-звуки"
        >
          тишина
        </UiCheck>
        <UiCheck
          className="ui-check--inline"
          checked={ttsEnabled}
          onChange={onTtsEnabled}
        >
          озвучка
        </UiCheck>
        <label
          className="session__vol session__vol--sfx"
          title="Громкость битов, вибро и UI"
        >
          <span className="session__vol-label">
            биты {Math.round(sfxVolume * 100)}%
          </span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={sfxVolume}
            disabled={muted}
            onChange={(e) => onSfxVolume(Number(e.target.value))}
          />
        </label>
        <label
          className="session__vol"
          title="Громкость озвучки этой госпожи (до 200%)"
        >
          <span className="session__vol-label">
            голос {Math.round(ttsVolume * 100)}%
          </span>
          <input
            type="range"
            min={0}
            max={2}
            step={0.05}
            value={Math.min(2, Math.max(0, ttsVolume))}
            disabled={!ttsEnabled}
            onChange={(e) => onTtsVolume(Number(e.target.value))}
          />
        </label>
        <label
          className="session__vol session__vol--video"
          title="Громкость видео"
        >
          <span className="session__vol-label">
            видео {Math.round(videoVolume * 100)}%
          </span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={videoVolume}
            onChange={(e) => onVideoVolume(Number(e.target.value))}
          />
        </label>
      </div>

      {state ? (
        <span className="session__counters">
          эдж {state.edgesDone}/{state.params.edgesTarget} · руин{" "}
          {state.ruinsDone}/{state.params.ruinsTarget} ·{" "}
          {formatTime(state.elapsedSec)}
          {state.finaleOutcome ? ` · ${state.finaleOutcome}` : ""}
        </span>
      ) : null}
      {punishNotice ? (
        <p className="session__punish-notice" role="status">
          {punishNotice}
        </p>
      ) : null}
    </div>
  );
}
