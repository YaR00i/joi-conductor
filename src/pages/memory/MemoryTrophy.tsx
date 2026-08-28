import type { MemoryPairAsset } from "../../lib/memoryDeck";
import { MemoryCardFace } from "./MemoryCardFace";

/**
 * Right-hand reward rail of the play screen: when a pair is matched its
 * picture shows up here large (the "наргада на время" moment), then the rail
 * settles back to the idle hint while the strip below collects small
 * thumbnails of everything matched so far.
 */

export interface TrophyReward {
  pairId: string;
  gained: number;
  mult: number;
}

interface Props {
  reward: TrophyReward | null;
  /** Pair ids in the order they were matched. */
  matchedIds: readonly string[];
  assetsById: Map<string, MemoryPairAsset>;
  pairsTotal: number;
}

export function MemoryTrophy({
  reward,
  matchedIds,
  assetsById,
  pairsTotal,
}: Props) {
  const rewardAsset = reward ? assetsById.get(reward.pairId) : undefined;
  const multLabel = reward && reward.mult > 1 ? ` · ×${reward.mult}` : "";

  return (
    <aside className="memory-trophy" aria-label="Награда за пару">
      <div className="memory-trophy__head">
        <span className="memory-trophy__kicker">Награда</span>
        {reward ? (
          <span className="memory-trophy__points">
            +{reward.gained}
            {multLabel}
          </span>
        ) : null}
      </div>

      <div className={`memory-trophy__stage ${reward ? "is-live" : ""}`}>
        {rewardAsset ? (
          <MemoryCardFace url={rewardAsset.url} label={rewardAsset.label} />
        ) : (
          <p className="memory-trophy__idle muted">
            Найди пару — и она появится здесь целиком на несколько секунд.
          </p>
        )}
      </div>

      <div className="memory-trophy__progress">
        Пар найдено: {matchedIds.length}/{pairsTotal || "…"}
      </div>
      {rewardAsset?.label ? (
        <div className="memory-trophy__label" title={rewardAsset.label}>
          {rewardAsset.label}
        </div>
      ) : null}

      {matchedIds.length > 0 ? (
        <div className="memory-trophy__strip">
          {matchedIds.slice(-8).map((id) => {
            const a = assetsById.get(id);
            if (!a) return null;
            return (
              <span key={id} className="memory-trophy__thumb" title={a.label}>
                <MemoryCardFace url={a.url} label={a.label} />
              </span>
            );
          })}
        </div>
      ) : null}
    </aside>
  );
}
