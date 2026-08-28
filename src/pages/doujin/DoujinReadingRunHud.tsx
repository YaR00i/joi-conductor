import { moodFromScore } from "../../lib/moodEngine";
import { getActiveMoodLines } from "../../lib/voice/moodLines";
import {
  canAskPermission,
  readingRunElapsedSec,
  type ReadingRunState,
} from "../../lib/doujin/readingRun";
import { DoujinReadingRunOverlay } from "./DoujinReadingRunOverlay";

export type ReadingRunListOption = {
  id: string;
  name: string;
  count: number;
};

function formatElapsed(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

type Props = {
  run: ReadingRunState;
  now: number;
  otherLists: ReadingRunListOption[];
  onPause: () => void;
  onResume: () => void;
  onEdge: () => void;
  onRuin: () => void;
  onCum: () => void;
  onPermission: () => void;
  onSpinPermission: () => void;
  onCumplay: (id: string) => void;
  onTaskDone: () => void;
  onTaskSkip: () => void;
  onSurvey: (pick: "loved" | "rare" | "stop") => void;
  onPickList: (listId: string) => void;
  onAssembleAuto: () => void;
  onAssembleSelf: () => void;
  onCloseOverlay: () => void;
};

export function DoujinReadingRunHud({
  run,
  now,
  otherLists,
  onPause,
  onResume,
  onEdge,
  onRuin,
  onCum,
  onPermission,
  onSpinPermission,
  onCumplay,
  onTaskDone,
  onTaskSkip,
  onSurvey,
  onPickList,
  onAssembleAuto,
  onAssembleSelf,
  onCloseOverlay,
}: Props) {
  const mood = moodFromScore(run.moodScore);
  const moodLabel = getActiveMoodLines().moods[mood]?.labelRu ?? mood;
  const elapsed = readingRunElapsedSec(run, now);
  const paused = run.status === "paused";
  const live = run.status !== "ended";
  const ask = canAskPermission(run, now);
  const task = run.activeTask;

  return (
    <>
      <div className="doujin-run-fab">
        <button
          type="button"
          className="fab fab--play"
          title={paused ? "Продолжить" : "Пауза"}
          disabled={!live}
          onClick={() => (paused ? onResume() : onPause())}
        >
          <span className={"fab__glyph" + (paused ? " fab__glyph--play" : "")}>
            {paused ? "▶" : "❚❚"}
          </span>
          <span className="fab__tag">
            <span className="fab__letter">P</span>
            <span className="fab__rest">{paused ? "lay" : "ause"}</span>
          </span>
        </button>
        <button
          type="button"
          className="fab fab--hand"
          title="Эдж"
          disabled={!live}
          onClick={onEdge}
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
          title="Руина"
          disabled={!live}
          onClick={onRuin}
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
          title={
            run.mode === "self"
              ? "Кончил"
              : "Кончил без разрешения"
          }
          disabled={!live}
          onClick={onCum}
        >
          <span className="fab__glyph">●</span>
          <span className="fab__tag">
            <span className="fab__letter">C</span>
            <span className="fab__rest">um</span>
          </span>
        </button>
        {run.mode === "mistress" ? (
          <button
            type="button"
            className="fab fab--ask"
            title="Разрешение кончить"
            disabled={!live || !ask}
            onClick={onPermission}
          >
            <span className="fab__glyph">?</span>
            <span className="fab__tag">
              <span className="fab__letter">A</span>
              <span className="fab__rest">sk</span>
            </span>
          </button>
        ) : null}
        <div className="doujin-run-fab__meta">
          <div className="session__bpm-label">{formatElapsed(elapsed)}</div>
          <div className="session__status-mini">
            {paused ? "Пауза" : run.status === "ended" ? "Конец" : "Идёт"}
          </div>
          <div
            className={`session__mood-chip session__mood-chip--${mood}`}
            title={`Настроение · ${run.moodScore}`}
          >
            {moodLabel}
          </div>
        </div>
      </div>

      {task ? (
        <div className="doujin-reader__task-card">
          <div className="doujin-reader__task-name">{task.nameRu}</div>
          <p>{task.ruleRu}</p>
          <p className="muted">
            {run.source === "gelbooru" ? "посты" : "стр."}{" "}
            {task.startPage + 1}–{task.endPage + 1}
          </p>
          <div className="doujin-reader__task-actions">
            <button type="button" className="btn-primary" onClick={onTaskDone}>
              Сделал
            </button>
            <button type="button" className="btn-ghost" onClick={onTaskSkip}>
              Пропустить
            </button>
          </div>
        </div>
      ) : null}

      <DoujinReadingRunOverlay
        run={run}
        otherLists={otherLists}
        onSpinPermission={onSpinPermission}
        onCumplay={onCumplay}
        onSurvey={onSurvey}
        onPickList={onPickList}
        onAssembleAuto={onAssembleAuto}
        onAssembleSelf={onAssembleSelf}
        onClose={onCloseOverlay}
      />
    </>
  );
}
