import { applyMoodDelta } from "../moodEngine";
import type {
  ActiveReadingTask,
  ReadingRunPatch,
  ReadingRunState,
} from "../doujin/readingRun";
import type { JoidbVttCue } from "./parseVtt";

function patch(state: ReadingRunState, moodDelta = 0): ReadingRunPatch {
  return {
    state: {
      ...state,
      moodScore: applyMoodDelta(state.moodScore, moodDelta).score,
    },
    moodDelta,
  };
}

function inferTaskKind(
  text: string,
): ActiveReadingTask["kind"] {
  const t = text.toLowerCase();
  if (/\bedge/.test(t) || /\bкрай/.test(t)) return "edge";
  if (/hands[\s-]?off|hands off|руки прочь|stop stroking/.test(t)) {
    return "hands_off";
  }
  if (/\bslap|шлеп/.test(t)) return "slap";
  return "strokes";
}

export function taskFromInstructionCue(
  cue: JoidbVttCue,
  videoId: string,
): ActiveReadingTask {
  const lines = cue.text.split(/\n/).map((l) => l.trim()).filter(Boolean);
  const nameRu = lines[0] ?? "Инструкция";
  return {
    specId: `joidb-cue-${cue.id}`,
    nameRu: nameRu.slice(0, 80),
    ruleRu: cue.text,
    kind: inferTaskKind(cue.text),
    galleryId: videoId,
    startPage: 0,
    endPage: 0,
    severity: 1,
    strokesPerPage: 0,
  };
}

/** Drive HUD from a VTT instruction cue. Never calls pickReadingTask. */
export function applyInstructionCue(
  state: ReadingRunState,
  opts: { videoId: string; cue: JoidbVttCue | null },
): ReadingRunPatch {
  if (state.status === "ended") return patch(state);
  if (state.source !== "joidb") return patch(state);
  const cue = opts.cue;
  if (!cue || cue.kind !== "instruction") {
    if (!state.activeTask) return patch(state);
    if (!state.activeTask.specId.startsWith("joidb-cue-")) return patch(state);
    return patch({ ...state, activeTask: null });
  }
  const next = taskFromInstructionCue(cue, opts.videoId);
  const prev = state.activeTask;
  if (
    prev &&
    prev.specId === next.specId &&
    prev.ruleRu === next.ruleRu &&
    prev.galleryId === next.galleryId
  ) {
    return patch(state);
  }
  return patch({ ...state, activeTask: next });
}

/** List progress: one video = one page. Does not spawn pickReadingTask. */
export function noteReadingVideo(
  state: ReadingRunState,
  opts: {
    listId: string;
    videoId: string;
    title: string;
    index: number;
    total: number;
  },
): ReadingRunPatch {
  if (state.status === "ended") return patch(state);
  const key = `${opts.listId}:${opts.index}`;
  if (state.lastPageKey === key) return patch(state);
  let moodDelta = 0;
  let finished = state.finishedGalleryIds;
  if (!finished.includes(opts.videoId)) {
    finished = [...finished, opts.videoId];
    moodDelta += 1;
  }
  const galleries = [...state.galleries];
  const existing = galleries.findIndex((g) => g.galleryId === opts.videoId);
  const row = {
    galleryId: opts.videoId,
    title: opts.title,
    pagesShown: 1,
    pagesContent: 1,
  };
  if (existing >= 0) galleries[existing] = row;
  else galleries.push(row);
  return patch(
    {
      ...state,
      lastPageKey: key,
      pagesShown: state.pagesShown + 1,
      pagesContent: state.pagesContent + 1,
      galleries,
      finishedGalleryIds: finished,
      listTotal: Math.max(state.listTotal, opts.total),
    },
    moodDelta,
  );
}
