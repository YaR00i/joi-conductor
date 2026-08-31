export type ListTileCacheState = "idle" | "running" | "done";

type Props = {
  cacheState: ListTileCacheState;
  canRead: boolean;
  canResume?: boolean;
  downloadDisabled?: boolean;
  onDownload?: () => void;
  onRead: () => void;
  onResume?: () => void;
  readTitle?: string;
};

export function DoujinListTileActions({
  cacheState,
  canRead,
  canResume = false,
  downloadDisabled = false,
  onDownload,
  onRead,
  onResume,
  readTitle = "Читать",
}: Props) {
  return (
    <div className="doujin-lists__tile-actions">
      {onDownload ? (
        <button
          type="button"
          className={
            "doujin-lists__tile-icon is-ghost" +
            (cacheState === "done" ? " is-done" : "") +
            (cacheState === "running" ? " is-live" : "")
          }
          disabled={downloadDisabled || cacheState !== "idle"}
          title={downloadTitle(cacheState)}
          aria-label={downloadTitle(cacheState)}
          onClick={onDownload}
        >
          <DownloadGlyph state={cacheState} />
        </button>
      ) : null}
      <button
        type="button"
        className="doujin-lists__tile-icon is-read"
        disabled={!canRead}
        title={readTitle}
        aria-label={readTitle}
        onClick={onRead}
      >
        <ReadIcon />
      </button>
      {canResume && onResume ? (
        <button
          type="button"
          className="doujin-lists__tile-icon is-ghost"
          title="Продолжить"
          aria-label="Продолжить"
          onClick={onResume}
        >
          <ResumeIcon />
        </button>
      ) : null}
    </div>
  );
}

function downloadTitle(state: ListTileCacheState): string {
  switch (state) {
    case "idle":
      return "Скачать";
    case "running":
      return "Качаю…";
    case "done":
      return "Скачано";
    default: {
      const _never: never = state;
      return _never;
    }
  }
}

function DownloadGlyph({ state }: { state: ListTileCacheState }) {
  switch (state) {
    case "idle":
      return <DownloadIcon />;
    case "running":
      return <SpinnerIcon />;
    case "done":
      return <DownloadedIcon />;
    default: {
      const _never: never = state;
      return _never;
    }
  }
}

function DownloadIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden>
      <path
        d="M8 2.4v7.2M5.2 7.2 8 10l2.8-2.8M3.2 12.4h9.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DownloadedIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden>
      <path
        d="M3.4 8.2 6.5 11.2 12.6 4.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden>
      <path
        d="M8 2.4a5.6 5.6 0 1 1-4.7 2.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ReadIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden>
      <path
        d="M5.2 3.4 12.6 8 5.2 12.6z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ResumeIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden>
      <path
        d="M3.2 3.4v9.2M6.1 4.2 13.2 8 6.1 11.8z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
