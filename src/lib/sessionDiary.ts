import { getCumplay, getFinish, toys as catalogToys } from "./catalog";
import { MODE_LABELS, OUTCOME_LABELS } from "./labels";
import {
  getActiveMistress,
  getMistressPack,
  HU_TAO_PACK,
  type MistressId,
  type MistressPack,
} from "./mistress";
import type {
  FinaleOutcome,
  SessionEvent,
  SessionMode,
  SessionMood,
  SessionParams,
  SessionState,
} from "./types";
import { getActiveMoodLines } from "./voice/moodLines";

const STORAGE_KEY = "joi-diary-v1";
const MAX_ENTRIES = 200;

export type DiaryAteCum = "yes" | "no" | "none";

/** What happened to the load after cum/ruin (diary «Сперма»). */
export type DiaryCumFate =
  | "ate"
  | "smear_face"
  | "smear_body"
  | "washed"
  | "none";

const EAT_CUMPLAY_IDS = new Set([
  "swallow",
  "on_food_eat",
  "on_drink",
  "lick_fingers",
  "chew",
  "snowball_solo",
  "lick_toy",
  "feet_lick",
]);

const SMEAR_FACE_CUMPLAY_IDS = new Set(["smear_lips", "smear_nose"]);
const SMEAR_BODY_CUMPLAY_IDS = new Set(["smear_chest"]);

const TEMPT_OR_FORCE_PROMPT_IDS = new Set([
  "promise_cum_eat",
  "cumplay-step-force_eat",
  "cumplay-step-force_eat_confirm",
  "cumplay-step-tempt_eat_halfway",
  "cumplay-step-tempt_eat_soft",
  "cumplay-step-tempt_eat_ruin",
]);

const DIARY_ATE_PATCH_KEY = "joi-diary-ate-patch-v1";

export type DiaryEntry = {
  id: string;
  /** ISO end time */
  createdAt: string;
  /** ISO start time if known */
  startedAt?: string;
  ended: "complete" | "abort";
  elapsedSec: number;
  durationSec: number;
  edgesDone: number;
  edgesTarget: number;
  ruinsDone: number;
  ruinsTarget: number;
  finaleOutcome?: FinaleOutcome;
  finishId: string;
  finishNameRu: string;
  cumplayId: string;
  cumplayNameRu: string;
  /** Derived from cumFate for achievements / legacy stats. */
  ateCum: DiaryAteCum;
  /** Where the load went after the ritual. Legacy entries may omit this. */
  cumFate?: DiaryCumFate;
  mistressNameRu: string;
  /** Which mistress ran the session (for mood avatar). Legacy entries omit this. */
  mistressId?: MistressId;
  mood: SessionMood;
  moodLabelRu: string;
  moodScore: number;
  mode: SessionMode;
  modeNameRu: string;
  tagsLabelRu?: string;
  /**
   * Raw media query used in the session (gelbooru tags).
   * Prefer this for «Повторить план»; tagsLabelRu may be a human label.
   */
  mediaTags?: string;
  /** @deprecated Prefer bpmLabelRu / toysLabelRu — kept for old diary rows. */
  summaryLines?: string[];
  /** Tempo band, e.g. «Медленно 50–90» or «60–120». */
  bpmLabelRu?: string;
  /** Toys for the session, e.g. «Дилдо маленький» or «Без игрушек». */
  toysLabelRu?: string;
  seed?: number;
  /**
   * Full SessionParams snapshot for «Повторить план».
   * Absent on older diary entries (legacy reconstruct uses summary fields).
   */
  planParams?: SessionParams;
  /**
   * Media thumbnail captured when the finale wheel lands (cum/ruin).
   * Absent on older diary entries.
   */
  resultImageUrl?: string;
  /** Doujin reading run — not a metronome session. */
  source?: "session" | "reading";
  reading?: {
    listId: string;
    listName: string;
    origin: "user" | "mistress";
    galleries: number;
    pagesShown: number;
    pagesContent: number;
    strokesDone: number;
    slapsDone: number;
    orgasmsDone?: number;
  };
};

export type DiarySessionMeta = {
  tagsLabelRu?: string;
  /** Raw media query (gelbooru tags) for plan replay. */
  mediaTags?: string;
  /** @deprecated Prefer bpmLabelRu / toysLabelRu. */
  summaryLines?: string[];
  bpmLabelRu?: string;
  toysLabelRu?: string;
  /** Snapshot from the slide on screen when the finale wheel lands. */
  resultImageUrl?: string;
};

export type DiaryFactRow = { labelRu: string; valueRu: string };

function formatBpmLabel(params: SessionParams): string {
  const lo = Math.round(params.bpmMin);
  const hi = Math.round(params.bpmMax);
  if (lo === hi) return `${lo} BPM`;
  return `${lo}–${hi} BPM`;
}

function formatToysLabel(allowedToyIds: string[] | undefined): string | undefined {
  if (!allowedToyIds || allowedToyIds.length === 0) return undefined;
  if (allowedToyIds.includes("__none__") || allowedToyIds.every((id) => id === "__none__")) {
    return "Без игрушек";
  }
  const names = allowedToyIds
    .filter((id) => id !== "__none__")
    .map((id) => catalogToys.find((t) => t.id === id)?.nameRu ?? id)
    .filter(Boolean);
  if (names.length === 0) return "Без игрушек";
  return names.join(" · ");
}

function moodLabelRu(mood: SessionMood): string {
  return getActiveMoodLines().moods[mood]?.labelRu ?? mood;
}

function isCumOrRuin(outcome?: FinaleOutcome): boolean {
  return outcome === "cum" || outcome === "ruin";
}

function ateCumFromFate(fate: DiaryCumFate): DiaryAteCum {
  switch (fate) {
    case "ate":
      return "yes";
    case "none":
      return "none";
    case "smear_face":
    case "smear_body":
    case "washed":
      return "no";
    default: {
      const _exhaustive: never = fate;
      return _exhaustive;
    }
  }
}

function findEatGateAnswer(
  events: SessionEvent[],
): "ok" | "fail" | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e.type !== "mistress_answer") continue;
    if (!TEMPT_OR_FORCE_PROMPT_IDS.has(e.promptId)) continue;
    if (e.promptId === "promise_cum_eat") {
      return e.optionId === "done" ? "ok" : "fail";
    }
    if (
      e.optionId === "ok" ||
      e.effect === "feeling_good" ||
      e.effect === "promise_done"
    ) {
      return "ok";
    }
    return "fail";
  }
  return null;
}

/**
 * Resolve where the load went after finale cumplay.
 * Prefer explicit force/tempt answers; else infer from cumplay branch.
 * Ruin defaults to ate (CEI training — ruined load is meant to be eaten).
 */
export function resolveCumFate(
  events: SessionEvent[],
  cumplayId: string,
  finaleOutcome?: FinaleOutcome,
): DiaryCumFate {
  if (!isCumOrRuin(finaleOutcome)) return "none";

  const gate = findEatGateAnswer(events);
  if (gate === "ok") return "ate";
  if (gate === "fail") return "washed";

  if (finaleOutcome === "ruin") {
    const done = events.some((e) => e.type === "mistress_cumplay_done");
    return done ? "ate" : "washed";
  }

  if (EAT_CUMPLAY_IDS.has(cumplayId)) {
    const done = events.some((e) => e.type === "mistress_cumplay_done");
    return done ? "ate" : "washed";
  }
  if (SMEAR_FACE_CUMPLAY_IDS.has(cumplayId)) return "smear_face";
  if (SMEAR_BODY_CUMPLAY_IDS.has(cumplayId)) return "smear_body";
  // Soft / halfway without a logged tempt answer (legacy) → washed
  return "washed";
}

/** Live catalog name (so renames apply to old diary rows). */
export function diaryCumplayNameRu(entry: DiaryEntry): string {
  return getCumplay(entry.cumplayId)?.nameRu ?? entry.cumplayNameRu ?? entry.cumplayId;
}

/** Display fate for a stored entry, including pre-cumFate diary rows. */
export function entryCumFate(entry: DiaryEntry): DiaryCumFate {
  if (entry.cumFate) return entry.cumFate;
  if (entry.ateCum === "yes") return "ate";
  if (!isCumOrRuin(entry.finaleOutcome)) return "none";
  // Legacy ruin sessions: goal was always eat.
  if (entry.finaleOutcome === "ruin") return "ate";
  if (SMEAR_FACE_CUMPLAY_IDS.has(entry.cumplayId)) return "smear_face";
  if (SMEAR_BODY_CUMPLAY_IDS.has(entry.cumplayId)) return "smear_body";
  // Old soft cum rows stored ateCum "none" even after orgasm — treat as washed.
  return "washed";
}

function isPatchableAteRuin(e: DiaryEntry): boolean {
  if (e.finaleOutcome !== "ruin") return false;
  if (e.cumplayId !== "kiss_palm") return false;
  if (e.cumFate === "ate" && e.ateCum === "yes") return false;
  // Diary page: 2026-07-18 ~10:13 local
  const t = Date.parse(e.createdAt);
  if (!Number.isFinite(t)) return false;
  const local = new Date(t);
  return (
    local.getFullYear() === 2026 &&
    local.getMonth() === 6 &&
    local.getDate() === 18
  );
}

/**
 * User confirmed they ate on the 2026-07-18 kiss_palm ruin session
 * that was saved as washed before ruin→ate policy. Idempotent.
 */
function patchKnownAteRuinEntry(entries: DiaryEntry[]): DiaryEntry[] {
  if (!entries.some(isPatchableAteRuin)) return entries;

  const next = entries.map((e) =>
    isPatchableAteRuin(e)
      ? { ...e, cumFate: "ate" as const, ateCum: "yes" as const }
      : e,
  );
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    localStorage.setItem(DIARY_ATE_PATCH_KEY, "1");
  } catch {
    /* keep in-memory patch for this load */
  }
  return next;
}

/** How many completed diary sessions ended with cumFate ate. */
export function countDiaryAteCum(entries: DiaryEntry[] = loadDiaryEntries()): number {
  let n = 0;
  for (const e of entries) {
    if (e.ended !== "complete") continue;
    if (entryCumFate(e) === "ate") n += 1;
  }
  return n;
}

/** Smear without swallow — face/body fate only. */
export function countDiarySmearCum(
  entries: DiaryEntry[] = loadDiaryEntries(),
): number {
  let n = 0;
  for (const e of entries) {
    if (e.ended !== "complete") continue;
    const fate = entryCumFate(e);
    if (fate === "smear_face" || fate === "smear_body") n += 1;
  }
  return n;
}

export function buildDiaryEntry(opts: {
  state: SessionState;
  events: SessionEvent[];
  ended: "complete" | "abort";
  meta?: DiarySessionMeta | null;
  startedAt?: string | null;
  now?: Date;
}): DiaryEntry {
  const { state, events, ended } = opts;
  const now = opts.now ?? new Date();
  const finishId = state.params.finishId;
  const cumplayId = state.params.cumplayId;
  const finish = getFinish(finishId);
  const cumplay = getCumplay(cumplayId);
  const mode = state.params.mode;
  const cumFate = resolveCumFate(events, cumplayId, state.finaleOutcome);

  return {
    id: `diary-${now.getTime()}-${Math.floor(Math.random() * 1e6)}`,
    createdAt: now.toISOString(),
    startedAt: opts.startedAt ?? undefined,
    ended,
    elapsedSec: Math.max(0, Math.floor(state.elapsedSec)),
    durationSec: state.params.durationSec,
    edgesDone: state.edgesDone,
    edgesTarget: state.params.edgesTarget,
    ruinsDone: state.ruinsDone,
    ruinsTarget: state.params.ruinsTarget,
    finaleOutcome: state.finaleOutcome,
    finishId,
    finishNameRu: finish?.nameRu ?? finishId,
    cumplayId,
    cumplayNameRu: cumplay?.nameRu ?? cumplayId,
    cumFate,
    ateCum: ateCumFromFate(cumFate),
    mistressNameRu: getActiveMistress().displayNameRu,
    mistressId: getActiveMistress().id,
    mood: state.mood,
    moodLabelRu: moodLabelRu(state.mood),
    moodScore: state.moodScore,
    mode,
    modeNameRu: MODE_LABELS[mode]?.nameRu ?? mode,
    tagsLabelRu: opts.meta?.tagsLabelRu,
    mediaTags: opts.meta?.mediaTags?.trim() || undefined,
    summaryLines: opts.meta?.summaryLines,
    bpmLabelRu:
      opts.meta?.bpmLabelRu?.trim() ||
      formatBpmLabel(state.params),
    toysLabelRu:
      opts.meta?.toysLabelRu?.trim() ||
      formatToysLabel(state.params.allowedToyIds),
    seed: state.seed,
    planParams: { ...state.params },
    resultImageUrl: opts.meta?.resultImageUrl,
  };
}

function isEntry(raw: unknown): raw is DiaryEntry {
  if (!raw || typeof raw !== "object") return false;
  const o = raw as Record<string, unknown>;
  return typeof o.id === "string" && typeof o.createdAt === "string";
}

export function loadDiaryEntries(): DiaryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return patchKnownAteRuinEntry(parsed.filter(isEntry));
  } catch {
    return [];
  }
}

export function saveDiaryEntries(entries: DiaryEntry[]): boolean {
  const trimmed = entries.slice(0, MAX_ENTRIES);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
    return true;
  } catch {
    // Quota: drop souvenir images from oldest → newest, then retry.
    const stripped = trimmed.map((e, i) =>
      i === 0 ? e : { ...e, resultImageUrl: undefined },
    );
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stripped));
      return true;
    } catch {
      const noImages = trimmed.map((e) => ({
        ...e,
        resultImageUrl: undefined,
      }));
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(noImages));
        return true;
      } catch {
        return false;
      }
    }
  }
}

export function appendDiaryEntry(entry: DiaryEntry): DiaryEntry[] {
  const next = [entry, ...loadDiaryEntries()].slice(0, MAX_ENTRIES);
  saveDiaryEntries(next);
  return next;
}

/** Remove the «На что кончил» thumbnail from one entry. */
export function clearDiaryEntrySouvenir(entryId: string): DiaryEntry[] {
  const next = loadDiaryEntries().map((e) =>
    e.id === entryId ? { ...e, resultImageUrl: undefined } : e,
  );
  saveDiaryEntries(next);
  return next;
}

/** Mistress pack that owned the session (avatar), not the currently selected one. */
export function resolveDiaryMistressPack(entry: DiaryEntry): MistressPack {
  if (entry.mistressId) {
    return getMistressPack(entry.mistressId) ?? HU_TAO_PACK;
  }
  const name = entry.mistressNameRu?.trim();
  if (name === "Фурина" || name === "Furina") {
    return getMistressPack("furina") ?? HU_TAO_PACK;
  }
  return HU_TAO_PACK;
}

/** Skip tiny aborted warmups. */
/** Diary / Stats only from sessions finished via «Завершить». */
/**
 * Record both clean finishes and aborts so Stats Abort % / abort counters stay honest.
 * Abort rows use `ended: "abort"` and must not be treated as completed elsewhere.
 */
export function shouldRecordDiaryEntry(
  ended: "complete" | "abort",
  _elapsedSec: number,
): boolean {
  switch (ended) {
    case "complete":
    case "abort":
      return true;
    default: {
      const _exhaustive: never = ended;
      return _exhaustive;
    }
  }
}

export function formatDiaryDuration(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) return `${h} ч ${m} мин`;
  if (m > 0) return r > 0 ? `${m} мин ${r} с` : `${m} мин`;
  return `${r} с`;
}

export function formatDiaryWhen(iso: string): { day: string; time: string } {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { day: "—", time: "—" };
  const day = d.toLocaleDateString("ru-RU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const time = d.toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return { day, time };
}

export function formatFinaleOutcome(outcome?: FinaleOutcome): string {
  if (!outcome) return "не дошёл до финала";
  return OUTCOME_LABELS[outcome]?.nameRu ?? outcome;
}

export function formatAteCum(ate: DiaryAteCum): string {
  switch (ate) {
    case "yes":
      return "съел";
    case "no":
      return "не съел";
    case "none":
      return "не было";
    default: {
      const _exhaustive: never = ate;
      return _exhaustive;
    }
  }
}

export function formatCumFate(fate: DiaryCumFate): string {
  switch (fate) {
    case "ate":
      return "съел";
    case "smear_face":
      return "размазал по лицу";
    case "smear_body":
      return "размазал по телу";
    case "washed":
      return "смыл / вытер";
    case "none":
      return "не было";
    default: {
      const _exhaustive: never = fate;
      return _exhaustive;
    }
  }
}

function isBpmSummaryLine(line: string): boolean {
  return (
    /\d+\s*[–\-]\s*\d+/.test(line) ||
    /\d+\s*bpm/i.test(line) ||
    /^(медленно|средне|быстро|темп)/i.test(line)
  );
}

function isToySummaryLine(line: string): boolean {
  return (
    /игруш/i.test(line) ||
    /дилдо/i.test(line) ||
    /пробк/i.test(line) ||
    /клетка/i.test(line) ||
    /wand|edge\s*2|вибр/i.test(line) ||
    /без игрушек/i.test(line)
  );
}

/**
 * Session plan rows for the facts block (темп / игрушки).
 * Uses structured fields, with a fallback for legacy summaryLines.
 */
export function diaryPlanFactRows(entry: DiaryEntry): DiaryFactRow[] {
  const rows: DiaryFactRow[] = [];
  let bpm = entry.bpmLabelRu?.trim();
  let toys = entry.toysLabelRu?.trim();

  if (!bpm || !toys) {
    const lines = (entry.summaryLines ?? [])
      .map((l) => l.trim())
      .filter(Boolean);
    const bpmLine = lines.find(isBpmSummaryLine);
    const toyLines = lines.filter(isToySummaryLine);
    if (!bpm && bpmLine) bpm = bpmLine;
    if (!toys && toyLines.length > 0) {
      // Drop redundant «N игрушка» when concrete toy names follow.
      const named = toyLines.filter((l) => !/^\d+\s+игруш/i.test(l));
      toys = (named.length > 0 ? named : toyLines).join(" · ");
    }
  }

  if (bpm) rows.push({ labelRu: "Темп", valueRu: bpm });
  if (toys) rows.push({ labelRu: "Игрушки", valueRu: toys });
  return rows;
}
