import { useEffect, useRef, useState } from "react";
import { functions, patterns } from "../lib/catalog";
import { GOAL_LABELS } from "../lib/labels";
import type { Block } from "../lib/types";

/**
 * Session block-queue debug chip + dropdown.
 *
 * Mirrors MediaCachePanel's structure (chip button + click-to-open dropdown)
 * so it sits naturally next to the «кэш» chip in the SessionPage header.
 * Shows the upcoming Block[] with the current index highlighted — useful for
 * understanding what the conductor queued next.
 */

type Props = {
  queue: Block[];
  index: number;
};

export function SessionQueuePanel({ queue, index }: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  if (queue.length === 0) return null;

  const ahead = Math.max(0, queue.length - index - 1);

  return (
    <div className="session__cache-panel" ref={wrapRef}>
      <button
        type="button"
        className="session__media-chip session__media-chip--queue"
        title="Очередь блоков сессии — нажми для списка"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="session__media-chip__kind">очередь</span>
        <span className="session__media-chip__pct">
          {index + 1}/{queue.length}
          {ahead > 0 ? ` · +${ahead}` : ""}
        </span>
      </button>

      {open ? (
        <div
          className="session__cache-dropdown session__queue-dropdown"
          role="dialog"
          aria-label="Очередь блоков сессии"
        >
          <div className="session__cache-dropdown__head">
            <div>
              <strong>Очередь блоков</strong>
              <span className="session__cache-dropdown__sub">
                текущий #{index + 1} · всего {queue.length}
              </span>
            </div>
          </div>
          <ol className="session__queue-list">
            {queue.slice(0, 20).map((b, i) => {
              const fn = functions.find((f) => f.id === b.functionId);
              const pat = patterns.find((p) => p.id === b.patternId);
              const isCurrent = i === index;
              const isPast = i < index;
              return (
                <li
                  key={b.id}
                  className={
                    "session__queue-item" +
                    (isCurrent ? " is-current" : "") +
                    (isPast ? " is-past" : "")
                  }
                >
                  <span className="session__queue-item__num">#{i + 1}</span>
                  <span className="session__queue-item__body">
                    <strong>{fn?.nameRu ?? b.functionId}</strong>
                    {" · "}
                    {pat?.nameRu ?? b.patternId}
                    {" · "}
                    {b.drive === "vibe"
                      ? `вибро ${b.vibeProfileId ?? "профиль"}`
                      : `${b.bpm} BPM`}
                    {" · "}
                    {b.durationSec}с
                  </span>
                  <span className="session__queue-item__goal">
                    {GOAL_LABELS[b.goal]?.nameRu ?? b.goal}
                  </span>
                </li>
              );
            })}
            {queue.length > 20 ? (
              <li className="session__queue-item is-more">
                … и ещё {queue.length - 20}
              </li>
            ) : null}
          </ol>
        </div>
      ) : null}
    </div>
  );
}
