export function SessionUnauthorizedFab({
  disabled,
  bpm,
  statusLabel,
  onUnauthorizedEdge,
  onUnauthorizedRuin,
  onUnauthorizedCum,
}: {
  disabled: boolean;
  bpm: number;
  statusLabel: string;
  onUnauthorizedEdge: () => void;
  onUnauthorizedRuin: () => void;
  onUnauthorizedCum: () => void;
}) {
  return (
    <>
      <button
        type="button"
        className="fab fab--hand"
        title="Эдж без команды → наказание"
        disabled={disabled}
        onClick={onUnauthorizedEdge}
      >
        <span className="fab__glyph">✦</span>
        <span className="fab__tag">
          <span className="fab__letter">E</span>
          <span className="fab__rest">dge</span>
        </span>
      </button>

      <button
        type="button"
        className="fab fab--ruin"
        title="Руинить без команды → наказание"
        disabled={disabled}
        onClick={onUnauthorizedRuin}
      >
        <span className="fab__glyph">◆</span>
        <span className="fab__tag">
          <span className="fab__letter">R</span>
          <span className="fab__rest">uin</span>
        </span>
      </button>

      <button
        type="button"
        className="fab fab--cum"
        title="Кончить без команды → denial"
        disabled={disabled}
        onClick={onUnauthorizedCum}
      >
        <span className="fab__glyph">●</span>
        <span className="fab__tag">
          <span className="fab__letter">C</span>
          <span className="fab__rest">um</span>
        </span>
      </button>

      <div className="session__bpm-label">{bpm} bpm</div>
      <div className="session__status-mini">{statusLabel}</div>
    </>
  );
}
