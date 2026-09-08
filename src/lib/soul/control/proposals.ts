import type { UserStance } from "../types";
import { hasHardBoundaryOn, scoreSubjectsForStance } from "../stance";
import { isCasualOpener } from "../initiative";
import { idleTaskSpecs } from "../../progressN";
import { getContractDef } from "../../contracts/catalog";
import { parseControlAction } from "./actions";
import {
  detectSoulTurnSubjects,
  soulSubjectIsPlay,
} from "../conversationMode";
import type { ControlAction } from "./types";
import type {
  CheckInKind,
  FinalePolicy,
  MistressSessionKind,
  WearKind,
} from "./types";

export const CHAT_PROPOSAL_SOURCES = ["extractor"] as const;
export type ChatProposalSource = (typeof CHAT_PROPOSAL_SOURCES)[number];

export const CHAT_PROPOSAL_KINDS = [
  "wear",
  "denial",
  "session",
  "task",
  "checkin",
] as const;
export type ChatProposalKind = (typeof CHAT_PROPOSAL_KINDS)[number];

type ChatProposalBase = {
  id: string;
  titleRu: string;
  hintRu: string;
  confirmRu: string;
  refuseRu: string;
  source: ChatProposalSource;
  candidateId?: string;
  intentId?: string;
};

export type ChatProposal =
  | (ChatProposalBase & {
      kind: "wear";
      wearKind: WearKind;
      hours: number;
    })
  | (ChatProposalBase & {
      kind: "denial";
      hours: number;
      edges: number;
    })
  | (ChatProposalBase & {
      kind: "session";
      sessionKind: MistressSessionKind;
      durationSec: number;
      edgesTarget: number;
      finalePolicy: FinalePolicy;
      noteRu: string;
    })
  | (ChatProposalBase & {
      kind: "task";
      defId: string;
      params: Record<string, string | number>;
    })
  | (ChatProposalBase & {
      kind: "checkin";
      checkInKind: CheckInKind;
      hours?: number;
      note: string;
    });

export type ChatProposalContext = {
  nowMs: number;
  userText: string;
  speech: string;
  moodScore: number;
  cageOn: boolean;
  plugOn: boolean;
  denialOn: boolean;
  checkInSet: boolean;
  sessionOfferOpen: boolean;
  pendingSession: boolean;
  candidateId?: string;
  intentId?: string;
};

const PROPOSAL_OPS = [
  "set_wear",
  "set_denial",
  "propose_session",
  "propose_task",
  "set_checkin",
] as const;
type ProposalOp = (typeof PROPOSAL_OPS)[number];

function isProposalOp(v: unknown): v is ProposalOp {
  return typeof v === "string" && (PROPOSAL_OPS as readonly string[]).includes(v);
}

function clampHours(v: unknown, fallback: number, min: number, max: number): number {
  const n =
    typeof v === "number"
      ? v
      : typeof v === "string" && v.trim()
        ? Number(v)
        : fallback;
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function clampInt(v: unknown, fallback: number, min: number, max: number): number {
  const n =
    typeof v === "number"
      ? v
      : typeof v === "string" && /^-?\d+$/.test(v.trim())
        ? Number(v.trim())
        : fallback;
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function withTurnMeta(
  proposal: ChatProposal,
  ctx: ChatProposalContext,
  source: ChatProposalSource,
): ChatProposal {
  return {
    ...proposal,
    source,
    ...(ctx.candidateId ? { candidateId: ctx.candidateId } : {}),
    ...(ctx.intentId ? { intentId: ctx.intentId } : {}),
  };
}

function wearTitle(kind: WearKind, hours: number): string {
  return kind === "cage"
    ? `Надень клетку · ${hours} ч`
    : `Вставь пробку · ${hours} ч`;
}

function catalogTask(moodScore: number, wantedId?: string) {
  const specs = idleTaskSpecs(moodScore);
  const wanted =
    wantedId && specs.some((row) => row.defId === wantedId)
      ? specs.find((row) => row.defId === wantedId)
      : specs[0];
  if (!wanted || !getContractDef(wanted.defId)) return null;
  return wanted;
}

function fromWear(
  wearKind: WearKind,
  hours: number,
  ctx: ChatProposalContext,
  source: ChatProposalSource,
): ChatProposal | null {
  if (wearKind === "cage" && ctx.cageOn) return null;
  if (wearKind === "plug" && ctx.plugOn) return null;
  const clamped = clampHours(hours, wearKind === "cage" ? 8 : 2, 0.25, 24);
  return withTurnMeta(
    {
      id: `wear:${wearKind}:${clamped}`,
      kind: "wear",
      wearKind,
      hours: clamped,
      titleRu: wearTitle(wearKind, clamped),
      hintRu: "Вне сессии · таймер начнётся, когда подтвердишь.",
      confirmRu: wearKind === "cage" ? "Надел" : "Поставил",
      refuseRu: "Не сейчас",
      source,
    },
    ctx,
    source,
  );
}

function fromDenial(
  hours: number,
  edges: number,
  ctx: ChatProposalContext,
  source: ChatProposalSource,
): ChatProposal | null {
  if (ctx.denialOn) return null;
  const clampedHours = clampHours(hours, 8, 0.25, 48);
  const clampedEdges = clampInt(edges, 0, 0, 20);
  return withTurnMeta(
    {
      id: `denial:${clampedHours}:${clampedEdges}`,
      kind: "denial",
      hours: clampedHours,
      edges: clampedEdges,
      titleRu: `Denial · ${clampedHours} ч${clampedEdges ? ` · эджи ${clampedEdges}` : ""}`,
      hintRu: "Вне сессии · таймер начнётся, когда подтвердишь.",
      confirmRu: "Принял",
      refuseRu: "Не сейчас",
      source,
    },
    ctx,
    source,
  );
}

function fromSession(
  rec: {
    sessionKind: MistressSessionKind;
    durationSec: number;
    edgesTarget: number;
    finalePolicy: FinalePolicy;
    noteRu: string;
  },
  ctx: ChatProposalContext,
  source: ChatProposalSource,
): ChatProposal | null {
  if (ctx.sessionOfferOpen || ctx.pendingSession) return null;
  return withTurnMeta(
    {
      id: `session:${rec.sessionKind}:${rec.durationSec}`,
      kind: "session",
      sessionKind: rec.sessionKind,
      durationSec: rec.durationSec,
      edgesTarget: rec.edgesTarget,
      finalePolicy: rec.finalePolicy,
      noteRu: rec.noteRu,
      titleRu: "Сессия Conductor",
      hintRu: "Система соберёт сессию. Старт — только после подтверждения.",
      confirmRu: "Согласен",
      refuseRu: "Не сейчас",
      source,
    },
    ctx,
    source,
  );
}

function fromTask(
  wantedId: string | undefined,
  ctx: ChatProposalContext,
  source: ChatProposalSource,
): ChatProposal | null {
  const spec = catalogTask(ctx.moodScore, wantedId);
  if (!spec) return null;
  return withTurnMeta(
    {
      id: `task:${spec.defId}`,
      kind: "task",
      defId: spec.defId,
      params: spec.params,
      titleRu: spec.labelRu,
      hintRu: "Задание из каталога приложения, не новая карточка модели.",
      confirmRu: "Принять",
      refuseRu: "Не сейчас",
      source,
    },
    ctx,
    source,
  );
}

function fromCheckIn(
  checkInKind: CheckInKind,
  hours: number | undefined,
  note: string,
  ctx: ChatProposalContext,
  source: ChatProposalSource,
): ChatProposal | null {
  if (ctx.checkInSet) return null;
  const clampedHours =
    hours == null ? undefined : clampHours(hours, 2, 0.25, 72);
  return withTurnMeta(
    {
      id: `checkin:${checkInKind}:${clampedHours ?? "none"}`,
      kind: "checkin",
      checkInKind,
      ...(clampedHours != null ? { hours: clampedHours } : {}),
      note,
      titleRu:
        checkInKind === "morning"
          ? "Отчёт утром"
          : clampedHours
            ? `Отчёт через ${clampedHours} ч`
            : "Отчёт по приказу",
      hintRu: "Check-in в Control. Таймер станет после подтверждения.",
      confirmRu: "Принять",
      refuseRu: "Не сейчас",
      source,
    },
    ctx,
    source,
  );
}

function fromControlAction(
  action: ControlAction,
  ctx: ChatProposalContext,
  source: ChatProposalSource,
): ChatProposal | null {
  switch (action.op) {
    case "set_wear":
      return fromWear(action.kind, action.hours, ctx, source);
    case "set_denial":
      return fromDenial(action.hours, action.edges, ctx, source);
    case "propose_session":
      return fromSession(
        {
          sessionKind: action.kind,
          durationSec: action.durationSec,
          edgesTarget: action.edgesTarget,
          finalePolicy: action.finalePolicy,
          noteRu: action.noteRu,
        },
        ctx,
        source,
      );
    case "set_checkin":
      return fromCheckIn(action.kind, action.hours, action.note, ctx, source);
    case "clear_wear":
    case "clear_denial":
    case "clear_checkin":
    case "set_clothing":
    case "clear_clothing":
    case "bump_progression":
    case "note_trigger":
    case "patch_queue":
    case "set_censor":
    case "clear_censor":
      return null;
    default: {
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
}

function readOp(rec: Record<string, unknown>): string | null {
  for (const key of ["op", "type", "action", "id"] as const) {
    if (typeof rec[key] === "string" && rec[key].trim()) {
      return rec[key].trim();
    }
  }
  return null;
}

function fromRawRecord(
  raw: unknown,
  ctx: ChatProposalContext,
  source: ChatProposalSource,
): ChatProposal | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const rec = raw as Record<string, unknown>;
  const op = readOp(rec);
  if (!op) return null;
  if (!isProposalOp(op)) return null;
  if (op === "propose_task") {
    const wanted =
      typeof rec.defId === "string"
        ? rec.defId.trim()
        : typeof rec.id === "string" && rec.id !== "propose_task"
          ? rec.id.trim()
          : undefined;
    return fromTask(wanted, ctx, source);
  }
  const action = parseControlAction(rec);
  if (!action) return null;
  return fromControlAction(action, ctx, source);
}

function rawRecords(raw: unknown): unknown[] {
  if (!raw || typeof raw !== "object") return [];
  const rec = raw as Record<string, unknown>;
  if (Array.isArray(rec.proposals)) return rec.proposals;
  if (Array.isArray(rec.actions)) return rec.actions;
  if (readOp(rec)) return [rec];
  return [];
}

function refuseSession(userText: string): boolean {
  return /отказываюсь от сессии/i.test(userText);
}

function dedupeProposals(rows: ChatProposal[]): ChatProposal[] {
  const seen = new Set<string>();
  const out: ChatProposal[] = [];
  for (const row of rows) {
    const key =
      row.kind === "wear"
        ? `wear:${row.wearKind}`
        : row.kind;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out.slice(0, 4);
}

export function proposalsFromExtract(
  raw: unknown,
  ctx: ChatProposalContext,
  source: ChatProposalSource = "extractor",
): ChatProposal[] {
  if (refuseSession(ctx.userText)) {
    const records = rawRecords(raw).filter((item) => {
      if (!item || typeof item !== "object") return true;
      const op = readOp(item as Record<string, unknown>);
      return op !== "set_wear" && op !== "set_denial";
    });
    raw = { proposals: records };
  }
  const mapped = rawRecords(raw)
    .map((item) => fromRawRecord(item, ctx, source))
    .filter((row): row is ChatProposal => row !== null);
  return dedupeProposals(mapped);
}

export function shouldRunProposalExtractor(
  userText: string,
  speech: string,
): boolean {
  return [userText, speech].some((text) =>
    detectSoulTurnSubjects(text).some(soulSubjectIsPlay),
  );
}

/** One card pipeline: validated Extractor JSON only. */
export function collectTurnProposals(opts: {
  userText: string;
  speech: string;
  extractedRaw?: unknown;
  extracted?: boolean;
  ctx: ChatProposalContext;
}): ChatProposal[] {
  const ctx = { ...opts.ctx, userText: opts.userText, speech: opts.speech };
  if (isCasualOpener(opts.userText)) return [];
  if (!opts.extracted) return [];
  return proposalsFromExtract(opts.extractedRaw, ctx, "extractor");
}

export function isChatProposalKind(v: unknown): v is ChatProposalKind {
  return (
    typeof v === "string" &&
    (CHAT_PROPOSAL_KINDS as readonly string[]).includes(v)
  );
}

function proposalSubjects(proposal: ChatProposal): string[] {
  switch (proposal.kind) {
    case "session":
      return ["session", proposal.sessionKind];
    case "wear":
      return [proposal.wearKind];
    case "denial":
      return ["denial"];
    case "task": {
      const category = getContractDef(proposal.defId)?.category;
      return category ? ["contract", category] : ["contract"];
    }
    case "checkin":
      return ["checkin"];
    default: {
      const _exhaustive: never = proposal;
      return _exhaustive;
    }
  }
}

export function applyStanceToProposals(
  stances: readonly UserStance[],
  proposals: readonly ChatProposal[],
  nowMs: number,
): ChatProposal[] {
  const kept = proposals.filter(
    (row) => !hasHardBoundaryOn(stances, proposalSubjects(row)),
  );
  return [...kept].sort((a, b) => {
    const wa = scoreSubjectsForStance(stances, proposalSubjects(a), nowMs);
    const wb = scoreSubjectsForStance(stances, proposalSubjects(b), nowMs);
    return wb - wa;
  });
}
