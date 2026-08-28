import { useCallback, useEffect, useRef, useState } from "react";
import {
  applyCumplayChoice,
  applyMistressSurvey,
  closeOverlay,
  completeActiveTask,
  createReadingRun,
  endReadingRun,
  noteReadingPage,
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
import { assembleGelbooruMistressList } from "../../lib/gelbooruListBuild";
import {
  gelbooruListCanResume,
  gelbooruListItemLabel,
  gelbooruListOrigin,
  gelbooruListResumeIndex,
  otherUserGelbooruLists,
  type GelbooruPlayList,
} from "../../lib/gelbooruLists";
import type { MediaQueueSize } from "../../lib/mediaQueue";
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
  lists: GelbooruPlayList[];
  queueSize: MediaQueueSize;
  onOpenPlay: (listId: string, index: number) => void;
  onRefreshLists: () => Promise<void>;
  onGoToListsOverview: () => void;
};

export function useGelbooruReadingRun({
  lists,
  queueSize,
  onOpenPlay,
  onRefreshLists,
  onGoToListsOverview,
}: Opts) {
  const [run, setRun] = useState<ReadingRunState | null>(() =>
    loadReadingRunForSource("gelbooru"),
  );
  const [runLive, setRunLive] = useState(false);
  const [runPrompt, setRunPrompt] = useState<RunPrompt>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [assembleError, setAssembleError] = useState<string | null>(null);
  const runRef = useRef(run);
  runRef.current = run;
  const leavePausedRef = useRef(false);
  const afterLeaveRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    saveReadingRunForSource(run, "gelbooru");
  }, [run]);

  useEffect(() => {
    if (!run || run.status !== "running") return;
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [run]);

  function applyRunPatch(patch: ReadingRunPatch) {
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

  function beginRun(list: GelbooruPlayList, index: number, resetRun: boolean) {
    const existing =
      runRef.current && runRef.current.status !== "ended"
        ? runRef.current
        : null;
    const reuse = Boolean(
      existing &&
        existing.listId === list.id &&
        existing.source === "gelbooru" &&
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
        origin: gelbooruListOrigin(list),
        moodScore,
        source: "gelbooru",
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
    const index = reset ? 0 : gelbooruListResumeIndex(list);
    beginRun(list, index, reset);
  }

  function requestStartRun(listId: string) {
    const list = lists.find((row) => row.id === listId);
    if (!list || list.items.length === 0) return;
    const canContinue =
      readingRunCanResume(run, list.id, "gelbooru") ||
      gelbooruListCanResume(list);
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
      saveReadingRunForSource(null, "gelbooru");
      afterLeave?.();
      return;
    }
    leavePausedRef.current = live.status === "running";
    afterLeaveRef.current = afterLeave ?? null;
    runRef.current = paused;
    setRun(paused);
    saveReadingRunForSource(paused, "gelbooru");
    setRunPrompt({ kind: "leave" });
  }

  function cancelPrompt() {
    setRunPrompt(null);
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

  const notePost = useCallback(
    (list: GelbooruPlayList, index: number) => {
      const live = runRef.current;
      if (!runLive || !live || live.status === "ended") return;
      if (live.listId !== list.id) return;
      const item = list.items[index];
      applyRunPatch(
        noteReadingPage(live, {
          galleryId: list.id,
          title: item
            ? gelbooruListItemLabel(item)
            : list.name,
          pageIndex: index,
          pageCount: list.items.length,
        }),
      );
    },
    [runLive],
  );

  function hitListEnd(listId: string) {
    const live = runRef.current;
    if (!live || live.listId !== listId || live.status === "ended") return;
    setRun(offerListEnd(live));
  }

  const otherLists = run ? otherUserGelbooruLists(lists, run.listId) : [];

  async function appendMistress(_pick: "loved" | "rare") {
    const live = runRef.current;
    if (!live) return;
    try {
      await assembleGelbooruMistressList(queueSize, { appendToId: live.listId });
      await onRefreshLists();
    } catch (err) {
      setAssembleError(
        err instanceof Error ? err.message : "Не удалось докинуть очередь",
      );
    }
  }

  const hudHandlers = run
    ? {
        onPause: () => setRun(pauseReadingRun(run, Date.now())),
        onResume: () => setRun(resumeReadingRun(run, Date.now())),
        onEdge: () => applyRunPatch(reportEdge(run)),
        onRuin: () => applyRunPatch(reportRuin(run)),
        onCum: () => applyRunPatch(reportCum(run)),
        onPermission: () => setRun(openPermission(run)),
        onSpinPermission: () =>
          applyRunPatch(resolvePermission(run, Date.now())),
        onCumplay: (id: string) => setRun(applyCumplayChoice(run, id)),
        onTaskDone: () => applyRunPatch(completeActiveTask(run)),
        onTaskSkip: () => applyRunPatch(skipActiveTask(run)),
        onSurvey: (pick: "loved" | "rare" | "stop") => {
          const patch = applyMistressSurvey(run, pick);
          applyRunPatch(patch);
          if (pick === "stop") {
            commitRun(patch.state, "complete");
            return;
          }
          void appendMistress(pick);
        },
        onPickList: (listId: string) => {
          commitRun(run, "complete");
          const list = lists.find((row) => row.id === listId);
          if (list && list.items.length > 0) beginRun(list, 0, true);
        },
        onAssembleAuto: () => {
          commitRun(run, "complete");
          void assembleGelbooruMistressList(queueSize)
            .then(async (list) => {
              await onRefreshLists();
              beginRun(list, 0, true);
            })
            .catch((err) => {
              setAssembleError(
                err instanceof Error
                  ? err.message
                  : "Не удалось собрать очередь",
              );
            });
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
    assembleError,
    hudHandlers,
    requestStartRun,
    startRunFromPrompt,
    requestLeave,
    stayInRun,
    leaveRun,
    cancelPrompt,
    notePost,
    hitListEnd,
  };
}
