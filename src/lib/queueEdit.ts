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

/** Append after the last non-finale block (current allowed). Finale stays last. */
export function appendUpcomingBlocks(
  queue: Block[],
  currentIndex: number,
  blocks: Block[],
): Block[] | null {
  if (blocks.length === 0) return null;
  if (currentIndex < 0 || currentIndex >= queue.length) return null;
  let afterIndex = -1;
  for (let i = queue.length - 1; i >= currentIndex; i--) {
    if (queue[i]!.goal !== "finale") {
      afterIndex = i;
      break;
    }
  }
  if (afterIndex < 0) return null;
  let next = queue;
  for (const block of blocks) {
    const inserted = insertBlockAfter(next, afterIndex, currentIndex, block);
    if (!inserted) return null;
    next = inserted;
    afterIndex += 1;
  }
  return next;
}
