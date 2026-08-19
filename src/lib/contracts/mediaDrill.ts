import type { ContractInstance } from "./dailyBoard";
import { getContractDef } from "./catalog";

const STORAGE_KEY = "joi-contract-media-drill-v1";

export type MediaDrillStatus =
  | "loading"
  | "browsing"
  | "report"
  | "done"
  | "expired";

export type ActiveMediaDrill = {
  instanceId: string;
  dayKey: string;
  defId: string;
  limit: number;
  tag: string;
  triggerRu: string;
  actionRu: string;
  timerMin: number;
  startedAtMs: number;
  deadlineMs: number;
  status: MediaDrillStatus;
};

export const MEDIA_DRILL_DEF_IDS = new Set([
  "media_cache_triggers",
  "media_cache_triggers_hard",
]);

export function isMediaDrillContract(c: ContractInstance): boolean {
  if (MEDIA_DRILL_DEF_IDS.has(c.defId)) return true;
  return getContractDef(c.defId)?.kind === "media_drill";
}

export function timerMinForLimit(limit: number): number {
  if (limit >= 80) return 45;
  if (limit >= 60) return 35;
  if (limit >= 40) return 25;
  return 15;
}

export const MEDIA_DRILL_TRIGGERS = [
  "сосок",
  "сиськи",
  "лицо",
  "пальцы",
  "ножки",
  "попа",
  "живот",
  "взгляд в камеру",
] as const;

export const MEDIA_DRILL_FOCUS_TAGS = [
  "nipples",
  "breasts",
  "feet",
  "hand_focus",
  "facial",
  "ass_focus",
  "looking_at_viewer",
  "ahegao",
  "foot_focus",
  "femdom",
] as const;

type ActionKind = "ball_tap" | "edge" | "strokes" | "vibe";

export function rollMediaDrillAction(rng: () => number): {
  actionRu: string;
  actionKind: ActionKind;
  actionN: number;
} {
  const kinds: ActionKind[] = ["ball_tap", "edge", "strokes", "vibe"];
  const kind = kinds[Math.floor(rng() * kinds.length)]!;
  switch (kind) {
    case "ball_tap":
      return { actionRu: "удар по яйцам", actionKind: kind, actionN: 1 };
    case "edge":
      return { actionRu: "эдж", actionKind: kind, actionN: 1 };
    case "strokes": {
      const ns = [50, 100, 150];
      const actionN = ns[Math.floor(rng() * ns.length)]!;
      return {
        actionRu: `${actionN} дрочений`,
        actionKind: kind,
        actionN,
      };
    }
    case "vibe": {
      const ns = [10, 15, 20];
      const actionN = ns[Math.floor(rng() * ns.length)]!;
      return {
        actionRu: `${actionN} сек вибраций`,
        actionKind: kind,
        actionN,
      };
    }
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

export function mediaDrillRewardBonus(triggersReported: number): number {
  const n = Math.max(0, Math.floor(triggersReported));
  return Math.min(12, Math.floor(n / 10));
}

export function loadActiveMediaDrill(): ActiveMediaDrill | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ActiveMediaDrill;
    if (
      typeof parsed.instanceId !== "string" ||
      typeof parsed.deadlineMs !== "number"
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveActiveMediaDrill(drill: ActiveMediaDrill): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(drill));
  } catch {
    /* quota */
  }
}

export function clearActiveMediaDrill(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function startMediaDrillFromContract(
  contract: ContractInstance,
  nowMs = Date.now(),
): ActiveMediaDrill {
  const limit = Math.max(
    5,
    Math.min(100, Number(contract.params.limit) || 40),
  );
  const timerMin =
    Number(contract.params.timerMin) || timerMinForLimit(limit);
  const drill: ActiveMediaDrill = {
    instanceId: contract.instanceId,
    dayKey: contract.dayKey,
    defId: contract.defId,
    limit,
    tag: String(contract.params.tag ?? "rating:explicit"),
    triggerRu: String(contract.params.trigger ?? "сиськи"),
    actionRu: String(contract.params.actionLabel ?? "удар по яйцам"),
    timerMin,
    startedAtMs: nowMs,
    deadlineMs: nowMs + timerMin * 60_000,
    status: "loading",
  };
  saveActiveMediaDrill(drill);
  return drill;
}

/** If past deadline, mark expired (caller should fail the contract). */
export function syncMediaDrillExpiry(
  drill: ActiveMediaDrill | null,
  nowMs = Date.now(),
): ActiveMediaDrill | null {
  if (!drill) return null;
  if (
    drill.status !== "done" &&
    drill.status !== "expired" &&
    nowMs > drill.deadlineMs
  ) {
    const next: ActiveMediaDrill = { ...drill, status: "expired" };
    saveActiveMediaDrill(next);
    return next;
  }
  return drill;
}

export function setMediaDrillStatus(
  status: MediaDrillStatus,
): ActiveMediaDrill | null {
  const cur = loadActiveMediaDrill();
  if (!cur) return null;
  const next = { ...cur, status };
  saveActiveMediaDrill(next);
  return next;
}

export function mediaDrillRemainingMs(
  drill: ActiveMediaDrill,
  nowMs = Date.now(),
): number {
  return Math.max(0, drill.deadlineMs - nowMs);
}

/** Active browsing/report drill can soft-remind inside a live session. */
export function mediaDrillAllowsSessionBridge(
  drill: ActiveMediaDrill | null | undefined,
  nowMs = Date.now(),
): drill is ActiveMediaDrill {
  if (!drill) return false;
  if (drill.status === "done" || drill.status === "expired") return false;
  if (nowMs > drill.deadlineMs) return false;
  return drill.status === "browsing" || drill.status === "report" || drill.status === "loading";
}

/** Right-rail flash copy for soft media-drill → session bridge. */
export function buildMediaDrillSessionBridgeFlash(
  drill: ActiveMediaDrill,
  reward = 0,
): {
  titleRu: string;
  ruleRu: string;
  metaRu: string;
  reward: number;
} {
  const trigger = drill.triggerRu?.trim();
  return {
    titleRu: "Медиа-дрель",
    ruleRu: trigger
      ? `Напоминание: тег «${drill.tag}» · триггер «${trigger}» → ${drill.actionRu}`
      : `Напоминание: тег «${drill.tag}» → ${drill.actionRu}`,
    metaRu: "Контракт · медиа",
    reward: Math.max(0, Math.floor(reward)),
  };
}

/** Soft session tag hint from an active drill (no full wager rewrite). */
export function mediaDrillSessionTagHint(drill: ActiveMediaDrill): string {
  const tag = drill.tag.trim();
  if (!tag) return "rating:explicit";
  return tag.includes("rating:") ? tag : `${tag} rating:explicit`;
}
