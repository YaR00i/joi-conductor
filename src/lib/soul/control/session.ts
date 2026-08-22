import {
  dropUpcomingBlock,
  insertBlockAfter,
  isUpcomingEditable,
} from "../../queueEdit";
import type { Block } from "../../types";
import { makeMistressRestBlock } from "./catalog";
import type { QueuePatchEdit } from "./types";

export type QueuePatchResult = {
  queue: Block[] | null;
  reason: "ok" | "not_live" | "no_upcoming" | "locked";
};

/**
 * Live session: only upcoming blocks. Idle: no queue to patch.
 * drop_next — first editable block after current.
 * insert_rest / pause — rest after the current block.
 */
export function applyMistressQueuePatch(
  queue: Block[],
  currentIndex: number,
  live: boolean,
  edit: QueuePatchEdit,
  nowMs = Date.now(),
): QueuePatchResult {
  if (!live) return { queue: null, reason: "not_live" };
  const rest = makeMistressRestBlock(
    `mistress-rest-${nowMs}`,
    queue[currentIndex]?.mode ?? "stroke",
  );
  switch (edit) {
    case "pause":
    case "insert_rest": {
      const next = insertBlockAfter(queue, currentIndex, currentIndex, rest);
      return next
        ? { queue: next, reason: "ok" }
        : { queue: null, reason: "locked" };
    }
    case "drop_next": {
      const idx = queue.findIndex((block, i) =>
        isUpcomingEditable(block, i, currentIndex),
      );
      if (idx < 0) return { queue: null, reason: "no_upcoming" };
      const next = dropUpcomingBlock(queue, idx, currentIndex);
      return next
        ? { queue: next, reason: "ok" }
        : { queue: null, reason: "locked" };
    }
    default: {
      const _exhaustive: never = edit;
      return _exhaustive;
    }
  }
}
