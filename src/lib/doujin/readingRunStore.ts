import {
  readingRunSource,
  type ReadingRunGalleryLog,
  type ReadingRunSource,
  type ReadingRunState,
} from "./readingRun";

const KEY = "joi-doujin-reading-run-v1";

function asId(v: unknown): string | null {
  if (typeof v === "string" && v.length > 0) return v;
  if (typeof v === "number" && Number.isFinite(v)) return String(Math.trunc(v));
  return null;
}

function normalizeReadingRun(raw: unknown): ReadingRunState | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  if (typeof rec.id !== "string" || typeof rec.listId !== "string") return null;
  const source: ReadingRunSource =
    rec.source === "gelbooru" ? "gelbooru" : "nhentai";
  const finished = Array.isArray(rec.finishedGalleryIds)
    ? rec.finishedGalleryIds
        .map(asId)
        .filter((id): id is string => id != null)
    : [];
  const galleries: ReadingRunGalleryLog[] = [];
  if (Array.isArray(rec.galleries)) {
    for (const row of rec.galleries) {
      if (!row || typeof row !== "object") continue;
      const g = row as Record<string, unknown>;
      const galleryId = asId(g.galleryId);
      if (!galleryId) continue;
      galleries.push({
        galleryId,
        title: typeof g.title === "string" ? g.title : "",
        pagesShown: typeof g.pagesShown === "number" ? g.pagesShown : 0,
        pagesContent: typeof g.pagesContent === "number" ? g.pagesContent : 0,
      });
    }
  }
  let activeTask: ReadingRunState["activeTask"] = null;
  if (rec.activeTask && typeof rec.activeTask === "object") {
    const task = rec.activeTask as ReadingRunState["activeTask"] & {
      galleryId?: unknown;
    };
    const gid = asId(task.galleryId);
    if (task && gid) activeTask = { ...task, galleryId: gid };
  }
  return {
    ...(rec as unknown as ReadingRunState),
    source,
    finishedGalleryIds: finished,
    galleries,
    activeTask,
  };
}

export function loadReadingRun(): ReadingRunState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return normalizeReadingRun(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function loadReadingRunForSource(
  source: ReadingRunSource,
): ReadingRunState | null {
  const run = loadReadingRun();
  if (!run || readingRunSource(run) !== source) return null;
  return run;
}

export function saveReadingRun(state: ReadingRunState | null): void {
  try {
    if (!state || state.status === "ended") {
      localStorage.removeItem(KEY);
      return;
    }
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* quota */
  }
}

export function saveReadingRunForSource(
  state: ReadingRunState | null,
  source: ReadingRunSource,
): void {
  const stored = loadReadingRun();
  if (!state) {
    if (stored && readingRunSource(stored) === source) saveReadingRun(null);
    return;
  }
  if (readingRunSource(state) !== source) return;
  saveReadingRun(state);
}
