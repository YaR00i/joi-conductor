import { rollFinale } from "../conductor";
import { applyMoodDelta, moodFromScore } from "../moodEngine";
import { DEFAULT_PARAMS, type FinaleOutcome } from "../types";
import {
  canSpawnTaskOnPage,
  clipTaskSpan,
  isContentPage,
} from "./contentPages";
import {
  pickReadingTask,
  rollTaskGap,
  scaledStrokesPerPage,
  taskRuleRu,
  type ReadingTaskSpec,
} from "./readingRunTasks";
import type { DoujinReadingListOrigin } from "./types";

export type ReadingRunSource = "nhentai" | "gelbooru";

export type ReadingRunMode = "mistress" | "self";

export type ReadingRunStatus = "running" | "paused" | "ended";

export type ReadingRunOverlay =
  | { kind: "none" }
  | { kind: "permission" }
  | {
      kind: "cumplay";
      reason: "permission" | "unauthorized" | "self";
      outcome: "cum" | "ruin";
    }
  | { kind: "survey" }
  | { kind: "selfEnd" };

export type ActiveReadingTask = {
  specId: string;
  nameRu: string;
  ruleRu: string;
  kind: ReadingTaskSpec["kind"];
  galleryId: string;
  startPage: number;
  endPage: number;
  severity: 1 | 2 | 3;
  strokesPerPage: number;
};

export type ReadingRunGalleryLog = {
  galleryId: string;
  title: string;
  pagesShown: number;
  pagesContent: number;
};

export type ReadingRunState = {
  id: string;
  source: ReadingRunSource;
  listId: string;
  listName: string;
  listTotal: number;
  origin: DoujinReadingListOrigin;
  mode: ReadingRunMode;
  status: ReadingRunStatus;
  startedAt: number;
  elapsedMs: number;
  runningSince: number;
  moodScore: number;
  pCumBias: number;
  edgesDone: number;
  ruinsDone: number;
  strokesDone: number;
  slapsDone: number;
  skipCount: number;
  hardness: number;
  pagesShown: number;
  pagesContent: number;
  contentSinceTask: number;
  nextTaskGap: number;
  lastTaskHeavy: boolean;
  lastPageKey: string;
  finishedGalleryIds: string[];
  galleries: ReadingRunGalleryLog[];
  activeTask: ActiveReadingTask | null;
  unauthorizedCum: boolean;
  hadOrgasm: boolean;
  finaleOutcome?: FinaleOutcome;
  cumplayId: string;
  permissionDeniedUntil: number;
  overlay: ReadingRunOverlay;
};

export type ReadingRunPatch = {
  state: ReadingRunState;
  moodDelta: number;
};

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `run_${Date.now().toString(36)}`;
}

export function runModeForOrigin(
  origin: DoujinReadingListOrigin | undefined,
): ReadingRunMode {
  return origin === "mistress" ? "mistress" : "self";
}

export function createReadingRun(opts: {
  listId: string;
  listName: string;
  listTotal: number;
  origin: DoujinReadingListOrigin;
  moodScore: number;
  source?: ReadingRunSource;
  now?: number;
  rng?: () => number;
}): ReadingRunState {
  const now = opts.now ?? Date.now();
  const origin = opts.origin === "mistress" ? "mistress" : "user";
  return {
    id: newId(),
    source: opts.source === "gelbooru" ? "gelbooru" : "nhentai",
    listId: opts.listId,
    listName: opts.listName,
    listTotal: Math.max(0, opts.listTotal),
    origin,
    mode: runModeForOrigin(origin),
    status: "running",
    startedAt: now,
    elapsedMs: 0,
    runningSince: now,
    moodScore: opts.moodScore,
    pCumBias: 0,
    edgesDone: 0,
    ruinsDone: 0,
    strokesDone: 0,
    slapsDone: 0,
    skipCount: 0,
    hardness: 0,
    pagesShown: 0,
    pagesContent: 0,
    contentSinceTask: 0,
    nextTaskGap: rollTaskGap(opts.rng ?? Math.random),
    lastTaskHeavy: false,
    lastPageKey: "",
    finishedGalleryIds: [],
    galleries: [],
    activeTask: null,
    unauthorizedCum: false,
    hadOrgasm: false,
    cumplayId: "none",
    permissionDeniedUntil: 0,
    overlay: { kind: "none" },
  };
}

export function readingRunElapsedSec(state: ReadingRunState, now: number): number {
  let ms = state.elapsedMs;
  if (state.status === "running" && state.runningSince > 0) {
    ms += Math.max(0, now - state.runningSince);
  }
  return Math.max(0, Math.floor(ms / 1000));
}

export function pauseReadingRun(
  state: ReadingRunState,
  now: number,
): ReadingRunState {
  if (state.status !== "running") return state;
  const extra = state.runningSince > 0 ? Math.max(0, now - state.runningSince) : 0;
  return {
    ...state,
    status: "paused",
    elapsedMs: state.elapsedMs + extra,
    runningSince: 0,
  };
}

export function resumeReadingRun(
  state: ReadingRunState,
  now: number,
): ReadingRunState {
  if (state.status !== "paused") return state;
  return { ...state, status: "running", runningSince: now };
}

function applyDelta(state: ReadingRunState, delta: number): ReadingRunState {
  if (!delta) return state;
  return { ...state, moodScore: applyMoodDelta(state.moodScore, delta).score };
}

function patch(state: ReadingRunState, moodDelta = 0): ReadingRunPatch {
  return { state: applyDelta(state, moodDelta), moodDelta };
}

function runGalleryId(id: string | number): string {
  return String(id);
}

function upsertGallery(
  state: ReadingRunState,
  galleryId: string,
  title: string,
  content: boolean,
): ReadingRunGalleryLog[] {
  const rows = state.galleries.slice();
  const index = rows.findIndex((row) => row.galleryId === galleryId);
  if (index < 0) {
    rows.push({
      galleryId,
      title,
      pagesShown: 1,
      pagesContent: content ? 1 : 0,
    });
    return rows;
  }
  const prev = rows[index]!;
  rows[index] = {
    ...prev,
    title,
    pagesShown: prev.pagesShown + 1,
    pagesContent: prev.pagesContent + (content ? 1 : 0),
  };
  return rows;
}

function taskLeftWindow(
  task: ActiveReadingTask,
  galleryId: string,
  pageIndex: number,
): boolean {
  if (task.galleryId !== galleryId) return true;
  return pageIndex < task.startPage || pageIndex > task.endPage;
}

export function skipActiveTask(state: ReadingRunState): ReadingRunPatch {
  if (!state.activeTask) return patch(state);
  return patch(
    {
      ...state,
      activeTask: null,
      skipCount: state.skipCount + 1,
      hardness: state.hardness + 1,
      contentSinceTask: 0,
      nextTaskGap: Math.max(4, state.nextTaskGap - 1),
      lastTaskHeavy: false,
    },
    -1,
  );
}

export function completeActiveTask(state: ReadingRunState): ReadingRunPatch {
  const task = state.activeTask;
  if (!task) return patch(state);
  const span = task.endPage - task.startPage + 1;
  const strokes =
    task.kind === "strokes" ? task.strokesPerPage * span : 0;
  const slaps = task.kind === "slap" ? span : 0;
  const edges = task.kind === "edge" ? span : 0;
  return patch(
    {
      ...state,
      activeTask: null,
      strokesDone: state.strokesDone + strokes,
      slapsDone: state.slapsDone + slaps,
      edgesDone: state.edgesDone + edges,
      contentSinceTask: 0,
      lastTaskHeavy:
      task.severity >= 2 && (task.kind === "edge" || task.kind === "slap"),
    },
    0,
  );
}

function spawnTask(
  state: ReadingRunState,
  galleryId: string,
  pageIndex: number,
  pageCount: number,
  rng: () => number,
): ReadingRunState {
  if (state.mode !== "mistress") return state;
  if (state.activeTask) return state;
  if (state.overlay.kind !== "none") return state;
  if (state.contentSinceTask < state.nextTaskGap) return state;
  if (!canSpawnTaskOnPage(pageIndex, pageCount)) return state;
  const spec = pickReadingTask(state.hardness, state.lastTaskHeavy, rng);
  const span = clipTaskSpan(pageIndex, spec.spanPages, pageCount);
  if (!span) return state;
  const strokesPerPage = scaledStrokesPerPage(spec, state.hardness);
  return {
    ...state,
    contentSinceTask: 0,
    nextTaskGap: rollTaskGap(rng),
    activeTask: {
      specId: spec.id,
      nameRu: spec.nameRu,
      ruleRu: taskRuleRu(spec, state.hardness),
      kind: spec.kind,
      galleryId,
      startPage: span.start,
      endPage: span.end,
      severity: spec.severity,
      strokesPerPage,
    },
  };
}

export function noteReadingPage(
  state: ReadingRunState,
  opts: {
    galleryId: string | number;
    title: string;
    pageIndex: number;
    pageCount: number;
    rng?: () => number;
  },
): ReadingRunPatch {
  if (state.status === "ended") return patch(state);
  const galleryId = runGalleryId(opts.galleryId);
  const key = `${galleryId}:${opts.pageIndex}`;
  if (state.lastPageKey === key) return patch(state);
  const rng = opts.rng ?? Math.random;
  let next = state;
  let moodDelta = 0;
  if (
    next.activeTask &&
    taskLeftWindow(next.activeTask, galleryId, opts.pageIndex)
  ) {
    const skipped = skipActiveTask(next);
    next = skipped.state;
    moodDelta += skipped.moodDelta;
  }
  const content = isContentPage(opts.pageIndex, opts.pageCount);
  const last = Math.max(0, opts.pageCount - 1);
  let finished = next.finishedGalleryIds;
  if (opts.pageIndex >= last && !finished.includes(galleryId)) {
    finished = [...finished, galleryId];
    moodDelta += 1;
  }
  next = {
    ...next,
    lastPageKey: key,
    pagesShown: next.pagesShown + 1,
    pagesContent: next.pagesContent + (content ? 1 : 0),
    contentSinceTask: next.contentSinceTask + (content ? 1 : 0),
    galleries: upsertGallery(next, galleryId, opts.title, content),
    finishedGalleryIds: finished,
    listTotal:
      next.source === "gelbooru"
        ? Math.max(next.listTotal, opts.pageCount)
        : next.listTotal,
    moodScore: applyMoodDelta(next.moodScore, moodDelta).score,
  };
  next = spawnTask(next, galleryId, opts.pageIndex, opts.pageCount, rng);
  return { state: next, moodDelta };
}

export function reportEdge(state: ReadingRunState): ReadingRunPatch {
  return patch({ ...state, edgesDone: state.edgesDone + 1 });
}

export function reportRuin(state: ReadingRunState): ReadingRunPatch {
  const overlay: ReadingRunOverlay = {
    kind: "cumplay",
    reason: state.mode === "self" ? "self" : "unauthorized",
    outcome: "ruin",
  };
  return patch(
    {
      ...state,
      ruinsDone: state.ruinsDone + 1,
      hadOrgasm: true,
      finaleOutcome: "ruin",
      overlay,
    },
    state.mode === "mistress" ? -1 : 0,
  );
}

export function reportCum(state: ReadingRunState): ReadingRunPatch {
  if (state.mode === "self") {
    return patch({
      ...state,
      hadOrgasm: true,
      finaleOutcome: "cum",
      overlay: { kind: "cumplay", reason: "self", outcome: "cum" },
    });
  }
  return patch(
    {
      ...state,
      unauthorizedCum: true,
      hadOrgasm: true,
      finaleOutcome: "cum",
      pCumBias: state.pCumBias - 0.25,
      overlay: { kind: "cumplay", reason: "unauthorized", outcome: "cum" },
    },
    -2,
  );
}

function pageIndexFromKey(key: string): number | null {
  const i = key.lastIndexOf(":");
  if (i < 0) return null;
  const n = Number(key.slice(i + 1));
  return Number.isFinite(n) ? n : null;
}

export function queueProgress(state: ReadingRunState): number {
  if (state.listTotal <= 0) return 1;
  if (state.source === "gelbooru") {
    const page = pageIndexFromKey(state.lastPageKey);
    if (page == null) return 0;
    return Math.min(1, (page + 1) / state.listTotal);
  }
  return Math.min(1, state.finishedGalleryIds.length / state.listTotal);
}

export function readingFinaleOdds(
  state: ReadingRunState,
): { pCum: number; pRuin: number } {
  const mood = moodFromScore(state.moodScore);
  let pCum = DEFAULT_PARAMS.pCum;
  let pRuin = DEFAULT_PARAMS.pRuin;
  switch (mood) {
    case "sweet":
      pCum += 0.12;
      pRuin -= 0.04;
      break;
    case "horny":
      pCum += 0.08;
      break;
    case "calm":
      break;
    case "bored":
      pCum -= 0.06;
      pRuin += 0.04;
      break;
    case "cruel":
      pCum -= 0.15;
      pRuin += 0.08;
      break;
    case "chaotic":
      pCum -= 0.05;
      pRuin += 0.1;
      break;
    default: {
      const _never: never = mood;
      return _never;
    }
  }
  const progress = queueProgress(state);
  if (progress < 0.25) pCum -= 0.18;
  else if (progress >= 0.85) pCum += 0.1;
  if (state.unauthorizedCum) pCum -= 0.2;
  pCum += state.pCumBias;
  if (state.edgesDone >= 4) pCum += 0.04;
  pCum = Math.max(0, Math.min(0.85, pCum));
  pRuin = Math.max(0, Math.min(1 - pCum, pRuin));
  return { pCum, pRuin };
}

export function canAskPermission(state: ReadingRunState, now: number): boolean {
  if (state.mode !== "mistress") return false;
  if (state.status === "ended") return false;
  if (state.overlay.kind !== "none") return false;
  return now >= state.permissionDeniedUntil;
}

export function openPermission(state: ReadingRunState): ReadingRunState {
  if (state.mode !== "mistress") return state;
  return { ...state, overlay: { kind: "permission" } };
}

export function resolvePermission(
  state: ReadingRunState,
  now: number,
  rng: () => number = Math.random,
): ReadingRunPatch {
  if (state.overlay.kind !== "permission") return patch(state);
  const odds = readingFinaleOdds(state);
  const outcome = rollFinale({ ...DEFAULT_PARAMS, ...odds }, rng);
  if (outcome === "deny") {
    const early = queueProgress(state) < 0.25 ? -1 : 0;
    return patch(
      {
        ...state,
        finaleOutcome: "deny",
        permissionDeniedUntil: now + 3 * 60 * 1000,
        overlay: { kind: "none" },
      },
      early,
    );
  }
  return patch(
    {
      ...state,
      hadOrgasm: true,
      finaleOutcome: outcome,
      overlay: { kind: "cumplay", reason: "permission", outcome },
    },
    outcome === "cum" ? 1 : 0,
  );
}

export function applyCumplayChoice(
  state: ReadingRunState,
  cumplayId: string,
): ReadingRunState {
  if (state.overlay.kind !== "cumplay") return state;
  return { ...state, cumplayId, overlay: { kind: "none" } };
}

export function closeOverlay(state: ReadingRunState): ReadingRunState {
  return { ...state, overlay: { kind: "none" } };
}

export function offerListEnd(state: ReadingRunState): ReadingRunState {
  if (state.status === "ended") return state;
  if (state.mode === "mistress" && !state.hadOrgasm) {
    return { ...state, overlay: { kind: "survey" } };
  }
  if (state.mode === "self") {
    return { ...state, overlay: { kind: "selfEnd" } };
  }
  return { ...state, status: "ended", overlay: { kind: "none" } };
}

export type MistressSurveyPick = "loved" | "rare" | "stop";

export function applyMistressSurvey(
  state: ReadingRunState,
  pick: MistressSurveyPick,
): ReadingRunPatch {
  if (state.overlay.kind !== "survey") return patch(state);
  if (pick === "stop") {
    return patch({ ...state, status: "ended", overlay: { kind: "none" } }, -1);
  }
  const delta = pick === "loved" ? 1 : -1;
  return patch({ ...state, overlay: { kind: "none" } }, delta);
}

export function endReadingRun(state: ReadingRunState, now: number): ReadingRunState {
  const paused =
    state.status === "running" ? pauseReadingRun(state, now) : state;
  return { ...paused, status: "ended", overlay: { kind: "none" } };
}

export function shouldPrefetchRare(state: ReadingRunState): boolean {
  const mood = moodFromScore(state.moodScore);
  return mood === "bored" || mood === "cruel" || mood === "chaotic";
}

export function readingRunSource(
  run: Pick<ReadingRunState, "source"> | null | undefined,
): ReadingRunSource {
  return run?.source === "gelbooru" ? "gelbooru" : "nhentai";
}

export function readingRunCanResume(
  run: ReadingRunState | null,
  listId: string,
  source: ReadingRunSource = "nhentai",
): boolean {
  return Boolean(
    run &&
      run.status !== "ended" &&
      run.listId === listId &&
      readingRunSource(run) === source,
  );
}

export function readingRunHasProgress(state: ReadingRunState): boolean {
  if (state.status === "ended") return false;
  if (state.pagesShown > 1) return true;
  if (state.pagesContent > 0) return true;
  if (state.galleries.length > 1) return true;
  if (state.finishedGalleryIds.length > 0) return true;
  if (state.edgesDone > 0 || state.ruinsDone > 0 || state.hadOrgasm) {
    return true;
  }
  if (state.activeTask) return true;
  return false;
}
