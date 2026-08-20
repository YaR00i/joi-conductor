import { isQuestBlockId } from "./quests";
import type { Block } from "./types";

/** Upcoming blocks the player may reorder / drop. Current, finale, quests stay locked. */
export function isUpcomingEditable(
  block: Block,
  queueIndex: number,
  currentIndex: number,
): boolean {
  if (queueIndex <= currentIndex) return false;
  if (block.goal === "finale") return false;
  if (isQuestBlockId(block.id)) return false;
  return true;
}

export function dropUpcomingBlock(
  queue: Block[],
  queueIndex: number,
  currentIndex: number,
): Block[] | null {
  const block = queue[queueIndex];
  if (!block || !isUpcomingEditable(block, queueIndex, currentIndex)) {
    return null;
  }
  return [...queue.slice(0, queueIndex), ...queue.slice(queueIndex + 1)];
}

export function moveUpcomingBlock(
  queue: Block[],
  queueIndex: number,
  dir: -1 | 1,
  currentIndex: number,
): Block[] | null {
  const swapIndex = queueIndex + dir;
  const a = queue[queueIndex];
  const b = queue[swapIndex];
  if (!a || !b) return null;
  if (!isUpcomingEditable(a, queueIndex, currentIndex)) return null;
  if (swapIndex <= currentIndex) return null;
  if (b.goal === "finale" || isQuestBlockId(b.id)) return null;
  const next = queue.slice();
  next[queueIndex] = b;
  next[swapIndex] = a;
  return next;
}

/** Insert after `afterIndex` (may be the current block). */
export function insertBlockAfter(
  queue: Block[],
  afterIndex: number,
  currentIndex: number,
  block: Block,
): Block[] | null {
  if (afterIndex < currentIndex || afterIndex >= queue.length) return null;
  return [
    ...queue.slice(0, afterIndex + 1),
    block,
    ...queue.slice(afterIndex + 1),
  ];
}
