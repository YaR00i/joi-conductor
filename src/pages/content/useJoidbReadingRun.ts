import { useCallback, useEffect, useRef, useState } from "react";
import {
  applyCumplayChoice,
  closeOverlay,
  completeActiveTask,
  createReadingRun,
  endReadingRun,
  offerListEnd,
  openPermission,
  pauseReadingRun,
  readingRunCanResume,
  readingRunHasProgress,
  reportCum,
  reportEdge,
  reportRuin,
  resolvePermission,
  resumeReadingRun,
  skipActiveTask,
  type ReadingRunPatch,
  type ReadingRunState,
} from "../../lib/doujin/readingRun";
import { buildReadingDiaryEntry } from "../../lib/doujin/readingRunDiary";
import {
  loadReadingRunForSource,
  saveReadingRunForSource,
} from "../../lib/doujin/readingRunStore";
import {
  readingPlayStatsDelta,
  readingPlayStatsHasAny,
} from "../../lib/doujin/readingListPlayStats";
import { applyInstructionCue, noteReadingVideo } from "../../lib/joidb/instructionRun";
import {
  bumpJoidbListPlayStats,
  joidbListCanResume,
  joidbListItemLabel,
  joidbListOrigin,
  joidbListResumeIndex,
  otherUserJoidbLists,
  type JoidbPlayList,
} from "../../lib/joidb/joidbLists";
import type { JoidbVttCue } from "../../lib/joidb/parseVtt";
import { getActiveMistress } from "../../lib/mistress";
import { appendDiaryEntry } from "../../lib/sessionDiary";
import {
  applyControlMoodDelta,
  loadControlState,
  saveControlMood,
} from "../../lib/soul/control/store";

type RunPrompt =
  | { kind: "start"; listId: string }
  | { kind: "leave" }
  | null;

type Opts = {
  lists: JoidbPlayList[];
  onOpenPlay: (listId: string, index: number) => void;
  onRefreshLists: () => Promise<void>;
  onGoToListsOverview: () => void;
};

export function useJoidbReadingRun({
  lists,
  onOpenPlay,
  onRefreshLists,
  onGoToListsOverview,
}: Opts) {
  const [run, setRun] = useState<ReadingRunState | null>(() =>
    loadReadingRunForSource("joidb"),
  );
  const [runLive, setRunLive] = useState(false);
  const [runPrompt, setRunPrompt] = useState<RunPrompt>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const runRef = useRef(run);
  runRef.current = run;
  const leavePausedRef = useRef(false);
  const afterLeaveRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    saveReadingRunForSource(run, "joidb");
  }, [run]);

  useEffect(() => {
    if (!run || run.status !== "running") return;
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [run]);

  function applyRunPatch(patch: ReadingRunPatch) {
    const prev = runRef.current;
    if (prev) {
      const delta = readingPlayStatsDelta(prev, patch.state);
      if (readingPlayStatsHasAny(delta)) {
        void bumpJoidbListPlayStats(prev.listId, delta).then(() => {
          void onRefreshLists();
        });
      }
    }
    runRef.current = patch.state;
    setRun(patch.state);
    if (patch.moodDelta) {
      applyControlMoodDelta(getActiveMistress().id, patch.moodDelta);
    }
  }

  function commitRun(state: ReadingRunState, ended: "complete" | "abort") {
    const finished = endReadingRun(state, Date.now());
    appendDiaryEntry(buildReadingDiaryEntry({ run: finished, ended }));
    saveControlMood(getActiveMistress().id, finished.moodScore);
    runRef.current = null;
    setRun(null);
    setRunLive(false);
  }

  function beginRun(list: JoidbPlayList, index: number, resetRun: boolean) {
    const existing =
      runRef.current && runRef.current.status !== "ended"
        ? runRef.current
        : null;
    const reuse = Boolean(
      existing &&
        existing.listId === list.id &&
        existing.source === "joidb" &&
        !resetRun,
    );
    if (existing && !reuse) commitRun(existing, "abort");
    if (reuse && existing) {
      const next =
        existing.status === "paused"
          ? resumeReadingRun(existing, Date.now())
          : existing;
      runRef.current = next;
      setRun(next);
    } else {
      const moodScore = loadControlState(getActiveMistress().id).moodScore;
      const next = createReadingRun({
        listId: list.id,
        listName: list.name,
        listTotal: list.items.length,
        origin: joidbListOrigin(list),
        moodScore,
        source: "joidb",
      });
      runRef.current = next;
      setRun(next);
    }
    setRunLive(true);
    onOpenPlay(list.id, index);
  }

  function startRunFromPrompt(listId: string, reset: boolean) {
    const list = lists.find((row) => row.id === listId);
    if (!list || list.items.length === 0) {
      setRunPrompt(null);
      return;
    }
    setRunPrompt(null);
    const index = reset ? 0 : joidbListResumeIndex(list);
    beginRun(list, index, reset);
  }

  function requestStartRun(listId: string) {
    const list = lists.find((row) => row.id === listId);
    if (!list || list.items.length === 0) return;
    const canContinue =
      readingRunCanResume(run, list.id, "joidb") || joidbListCanResume(list);
    if (canContinue) {
      setRunPrompt({ kind: "start", listId });
      return;
    }
    startRunFromPrompt(listId, true);
  }

  function requestLeave(afterLeave?: () => void) {
    if (runPrompt?.kind === "leave") return;
    const live = runRef.current;
    if (!runLive || !live || live.status === "ended") {
      afterLeave?.();
      return;
    }
    const paused =
      live.status === "running" ? pauseReadingRun(live, Date.now()) : live;
    if (!readingRunHasProgress(paused)) {
      runRef.current = null;
      setRun(null);
      setRunLive(false);
      saveReadingRunForSource(null, "joidb");
      afterLeave?.();
      return;
    }
    leavePausedRef.current = live.status === "running";
    afterLeaveRef.current = afterLeave ?? null;
    runRef.current = paused;
    setRun(paused);
    saveReadingRunForSource(paused, "joidb");
    setRunPrompt({ kind: "leave" });
  }

  function stayInRun() {
    const live = runRef.current;
    if (leavePausedRef.current && live && live.status === "paused") {
      const next = resumeReadingRun(live, Date.now());
      runRef.current = next;
      setRun(next);
    }
    leavePausedRef.current = false;
    afterLeaveRef.current = null;
    setRunPrompt(null);
  }

  function leaveRun() {
    const close = afterLeaveRef.current;
    afterLeaveRef.current = null;
    leavePausedRef.current = false;
    setRunLive(false);
    setRunPrompt(null);
    close?.();
  }

  const noteVideo = useCallback(
    (list: JoidbPlayList, index: number) => {
      const live = runRef.current;
      if (!runLive || !live || live.status === "ended") return;
      if (live.listId !== list.id) return;
      const item = list.items[index];
      applyRunPatch(
        noteReadingVideo(live, {
          listId: list.id,
          videoId: item?.id ?? list.id,
          title: item ? joidbListItemLabel(item) : list.name,
          index,
          total: list.items.length,
        }),
      );
    },
    [runLive],
  );

  const noteCue = useCallback((cue: JoidbVttCue | null, videoId: string) => {
    const live = runRef.current;
    if (!runLive || !live || live.status === "ended") return;
    applyRunPatch(applyInstructionCue(live, { videoId, cue }));
  }, [runLive]);

  function hitListEnd(listId: string) {
    const live = runRef.current;
    if (!runLive || !live || live.listId !== listId || live.status === "ended") {
      return;
    }
    setRun(offerListEnd(live));
  }

  const otherLists = run ? otherUserJoidbLists(lists, run.listId) : [];

  const hudHandlers = run && runLive
    ? {
        onPause: () => setRun(pauseReadingRun(run, Date.now())),
        onResume: () => setRun(resumeReadingRun(run, Date.now())),
        onEdge: () => {
          const live = runRef.current;
          if (live) applyRunPatch(reportEdge(live));
        },
        onRuin: () => {
          const live = runRef.current;
          if (live) applyRunPatch(reportRuin(live));
        },
        onCum: () => {
          const live = runRef.current;
          if (live) applyRunPatch(reportCum(live));
        },
        onPermission: () => setRun(openPermission(run)),
        onSpinPermission: () => {
          const live = runRef.current;
          if (live) applyRunPatch(resolvePermission(live, Date.now()));
        },
        onCumplay: (id: string) => setRun(applyCumplayChoice(run, id)),
        onTaskDone: () => {
          const live = runRef.current;
          if (live) applyRunPatch(completeActiveTask(live));
        },
        onTaskSkip: () => {
          const live = runRef.current;
          if (live) applyRunPatch(skipActiveTask(live));
        },
        onSurvey: (_pick: "loved" | "rare" | "stop") => {
          commitRun(run, "complete");
        },
        onPickList: (listId: string) => {
          commitRun(run, "complete");
          const list = lists.find((row) => row.id === listId);
          if (list && list.items.length > 0) beginRun(list, 0, true);
        },
        onAssembleAuto: () => {
          commitRun(run, "complete");
          onGoToListsOverview();
        },
        onAssembleSelf: () => {
          commitRun(run, "complete");
          onGoToListsOverview();
        },
        onCloseOverlay: () => {
          if (run.overlay.kind === "selfEnd") {
            commitRun(run, "complete");
            return;
          }
          setRun(closeOverlay(run));
        },
      }
    : null;

  const startPromptList =
    runPrompt?.kind === "start"
      ? (lists.find((row) => row.id === runPrompt.listId) ?? null)
      : null;

  return {
    run,
    runLive,
    nowMs,
    runPrompt,
    startPromptList,
    otherLists,
    hudHandlers,
    requestStartRun,
    startRunFromPrompt,
    requestLeave,
    stayInRun,
    leaveRun,
    cancelPrompt: () => setRunPrompt(null),
    noteVideo,
    noteCue,
    hitListEnd,
  };
}
