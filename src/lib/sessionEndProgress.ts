import {
  applySessionToAchievements,
  syncMistressUnlockAchievements,
  tallySessionDeltas,
  type AchievementLevelUp,
  type AchievementsState,
  type LifetimeCounters,
} from "./achievements";
import type { MistressId } from "./mistress/types";
import { shouldRecordDiaryEntry } from "./sessionDiary";
import type { SessionEvent, SessionState } from "./types";
import {
  mistressUnlockSnapshotFromWallet,
  syncMistressModeGrants,
  type WalletState,
} from "./wallet";

export type SessionEndProgressInput = {
  reason: "complete" | "abort";
  state: SessionState | null | undefined;
  events: SessionEvent[];
  cindersEarned: number;
  mistressId: MistressId;
  achievements: AchievementsState;
  wallet: WalletState;
  /** Mid-session quest cinders to claw back on abort. */
  sessionQuestCinders: number;
  /**
   * HMR / remount abort that keeps a checkpoint — skip diary, achievements,
   * debrief, and cinder claw/credit so resume stays intact.
   */
  silent?: boolean;
};

export type SessionEndProgressResult = {
  recordDiary: boolean;
  /** Chase on-screen souvenir for diary (complete only). */
  chaseDiarySouvenir: boolean;
  /** Sync achievements / mistress unlocks from this result. */
  syncAchievements: boolean;
  achievementCinders: number;
  levelUps: AchievementLevelUp[];
  achievements: AchievementsState;
  /** Wallet after mistress mode grants / unlock sync (may equal input). */
  wallet: WalletState;
  walletChanged: boolean;
  /** Net cinders to credit (session + achievements). 0 on abort. */
  creditCinders: number;
  /** Quest cinders to debit on abort. */
  clawQuestCinders: number;
  pendingCageHours: number | null;
  pendingDenialHours: number | null;
  pendingDenialEdges: number;
  /** Complete path — celebratory SessionDebriefSheet. */
  showDebrief: boolean;
  /** Abort path — quiet AbortDebriefSheet. */
  showAbortDebrief: boolean;
};

/** Thin abort counters only — never treat abort as a completed session. */
export function abortAchievementDeltas(): Partial<LifetimeCounters> {
  return {
    sessionsStarted: 1,
    sessionsAborted: 1,
  };
}

/**
 * Pure session_end progress side-effects: diary gate, achievements, wallet unlock sync,
 * cinder credit/claw. Caller still appends diary / opens debrief / settles contracts.
 */
export function computeSessionEndProgress(
  input: SessionEndProgressInput,
): SessionEndProgressResult {
  const st = input.state ?? null;

  if (input.silent) {
    return {
      recordDiary: false,
      chaseDiarySouvenir: false,
      syncAchievements: false,
      achievementCinders: 0,
      levelUps: [],
      achievements: input.achievements,
      wallet: input.wallet,
      walletChanged: false,
      creditCinders: 0,
      clawQuestCinders: 0,
      pendingCageHours: null,
      pendingDenialHours: null,
      pendingDenialEdges: 0,
      showDebrief: false,
      showAbortDebrief: false,
    };
  }

  const recordDiary = Boolean(
    st && shouldRecordDiaryEntry(input.reason, st.elapsedSec),
  );

  let achievementCinders = 0;
  let levelUps: AchievementLevelUp[] = [];
  let achievements = input.achievements;
  let wallet = input.wallet;
  let walletChanged = false;
  let syncAchievements = false;

  if (recordDiary && st) {
    switch (input.reason) {
      case "complete": {
        syncAchievements = true;
        const deltas = tallySessionDeltas({
          state: st,
          events: input.events,
          reason: input.reason,
          cindersEarned: input.cindersEarned,
          mistressId: input.mistressId,
        });
        const applied = applySessionToAchievements(achievements, deltas);
        achievements = applied.state;
        achievementCinders = applied.cindersReward;
        levelUps = applied.levelUps;

        const cage = applied.state.counters.chastitySessionsCompleted ?? 0;
        const synced = syncMistressModeGrants(wallet.unlocks, {
          chastitySessionsCompleted: cage,
        });
        if (
          synced.modeIds.join("\0") !== wallet.unlocks.modeIds.join("\0") ||
          synced.featureIds.join("\0") !== wallet.unlocks.featureIds.join("\0")
        ) {
          wallet = { ...wallet, unlocks: synced };
          walletChanged = true;
        }
        const unlockSnap = mistressUnlockSnapshotFromWallet(wallet, cage);
        const harem = syncMistressUnlockAchievements(achievements, unlockSnap);
        if (harem.cindersReward > 0 || harem.levelUps.length > 0) {
          achievements = harem.state;
          achievementCinders += harem.cindersReward;
          levelUps = [...levelUps, ...harem.levelUps];
        }
        break;
      }
      case "abort": {
        // Count abort only — do not run full session tallies (edges, finales, ateCum…).
        syncAchievements = true;
        const applied = applySessionToAchievements(
          achievements,
          abortAchievementDeltas(),
        );
        achievements = applied.state;
        achievementCinders = 0;
        levelUps = [];
        break;
      }
      default: {
        const _exhaustive: never = input.reason;
        void _exhaustive;
      }
    }
  }

  const sessionEarned =
    input.reason === "complete" ? Math.max(0, input.cindersEarned) : 0;
  const earned = sessionEarned + achievementCinders;

  let creditCinders = 0;
  let clawQuestCinders = 0;
  if (input.reason === "abort") {
    clawQuestCinders = Math.max(0, input.sessionQuestCinders);
  } else if (earned > 0) {
    creditCinders = earned;
  }

  const pendingCageHours =
    typeof st?.pendingCageHours === "number" && st.pendingCageHours > 0
      ? st.pendingCageHours
      : null;
  const pendingDenialHours =
    typeof st?.pendingDenialHours === "number" && st.pendingDenialHours > 0
      ? st.pendingDenialHours
      : null;

  return {
    recordDiary,
    chaseDiarySouvenir: Boolean(
      recordDiary && input.reason === "complete" && st,
    ),
    syncAchievements,
    achievementCinders,
    levelUps,
    achievements,
    wallet,
    walletChanged,
    creditCinders,
    clawQuestCinders,
    pendingCageHours,
    pendingDenialHours,
    pendingDenialEdges: st?.pendingDenialEdges ?? 0,
    showDebrief: Boolean(recordDiary && input.reason === "complete" && st),
    showAbortDebrief: Boolean(input.reason === "abort" && st),
  };
}
