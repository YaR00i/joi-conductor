import type { CSSProperties } from "react";
import type { MemoryCard, MemoryPairAsset } from "../../lib/memoryDeck";
import { MemoryCardFace } from "./MemoryCardFace";

/**
 * Presentational memory board: a CSS-3D flip card grid. All game state
 * (flipped pair, matches, streaks, curses) lives in MemoryGame — the board
 * only renders card states and reports clicks. Card backs are identical:
 * cursed pairs are not revealed until matched.
 */

interface Props {
  cards: MemoryCard[];
  assetsById: Map<string, MemoryPairAsset>;
  cols: number;
  rows: number;
  /** Card keys currently selected face-up (0..2). */
  flippedKeys: ReadonlySet<string>;
  /** Pair ids already matched (stay face-up, dimmed to a glow). */
  matchedPairs: ReadonlySet<string>;
  /** Card keys shaking after a mismatch (flip back when the class drops). */
  missKeys: ReadonlySet<string>;
  /** Peek active: everything shows its picture this render. */
  peekActive: boolean;
  /** Block input during flip-back delays and task overlays. */
  locked: boolean;
  onFlip: (card: MemoryCard) => void;
}

export function MemoryBoard({
  cards,
  assetsById,
  cols,
  rows,
  flippedKeys,
  matchedPairs,
  missKeys,
  peekActive,
  locked,
  onFlip,
}: Props) {
  return (
    <div
      className="memory-board"
      style={
        {
          gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
          "--cols": cols,
          "--rows": rows,
        } as CSSProperties
      }
    >
      {cards.map((card, i) => {
        const asset = assetsById.get(card.pairId);
        const matched = matchedPairs.has(card.pairId);
        const up = matched || peekActive || flippedKeys.has(card.key);
        const miss = missKeys.has(card.key);
        const cls = [
          "memory-card",
          up ? "is-up" : "",
          matched ? "is-matched" : "",
          miss ? "is-miss" : "",
        ]
          .filter(Boolean)
          .join(" ");
        return (
          <button
            key={card.key}
            type="button"
            className={cls}
            style={{ "--i": i } as CSSProperties}
            disabled={locked || up}
            aria-label={
              matched ? "Пара найдена" : up ? "Карта открыта" : "Закрытая карта"
            }
            onClick={() => onFlip(card)}
          >
            <span className="memory-card__inner" aria-hidden={up}>
              <span className="memory-card__cover">
                <span className="memory-card__emblem" />
              </span>
              <span className="memory-card__pic">
                {asset ? (
                  <MemoryCardFace url={asset.url} label={asset.label} />
                ) : null}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
