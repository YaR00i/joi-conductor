import { useEffect, useRef, useState } from "react";
import { functions, patterns } from "../lib/catalog";
import { GOAL_LABELS } from "../lib/labels";
import { isUpcomingEditable, moveUpcomingBlock } from "../lib/queueEdit";
import type { Block } from "../lib/types";
import { playUiClick, primeUiAudio } from "../lib/uiSound";

/**
 * Session block-queue chip + dropdown.
 * Upcoming blocks can be reordered, dropped, or get a rest inserted after them.
 */

type Props = {
  queue: Block[];
  index: number;
  editable?: boolean;
  onDropUpcoming?: (queueIndex: number) => void;
  onMoveUpcoming?: (queueIndex: number, dir: -1 | 1) => void;
  onInsertRestAfter?: (queueIndex: number) => void;
};

export function SessionQueuePanel({
  queue,
  index,
  editable = false,
  onDropUpcoming,
  onMoveUpcoming,
  onInsertRestAfter,
}: Props) {
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
  const windowStart = Math.max(0, index - 2);
  const visible = queue.slice(windowStart, windowStart + 24);

  return (
    <div className="session__cache-panel" ref={wrapRef}>
      <button
        type="button"
        className="session__media-chip session__media-chip--queue"
        title={
          editable
            ? "Очередь блоков — нажми, чтобы править следующие"
            : "Очередь блоков — просмотр (правка только в песочнице)"
        }
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
                {editable
                  ? " · песочница · можно двигать"
                  : " · только просмотр"}
              </span>
            </div>
          </div>
          <ol className="session__queue-list">
            {visible.map((b, offset) => {
              const i = windowStart + offset;
              const fn = functions.find((f) => f.id === b.functionId);
              const pat = patterns.find((p) => p.id === b.patternId);
              const isCurrent = i === index;
              const isPast = i < index;
              const canEdit = editable && isUpcomingEditable(b, i, index);
              const canRestAfter = editable && i >= index && b.goal !== "finale";
              const canUp =
                canEdit && moveUpcomingBlock(queue, i, -1, index) != null;
              const canDown =
                canEdit && moveUpcomingBlock(queue, i, 1, index) != null;
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
                  {canEdit || canRestAfter ? (
                    <span className="session__queue-item__ops">
                      {canEdit ? (
                        <>
                          <button
                            type="button"
                            className="session__queue-op"
                            title="Выше"
                            disabled={!canUp}
                            onClick={() => {
                              void primeUiAudio();
                              playUiClick();
                              onMoveUpcoming?.(i, -1);
                            }}
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            className="session__queue-op"
                            title="Ниже"
                            disabled={!canDown}
                            onClick={() => {
                              void primeUiAudio();
                              playUiClick();
                              onMoveUpcoming?.(i, 1);
                            }}
                          >
                            ↓
                          </button>
                          <button
                            type="button"
                            className="session__queue-op"
                            title="Убрать из очереди"
                            onClick={() => {
                              void primeUiAudio();
                              playUiClick();
                              onDropUpcoming?.(i);
                            }}
                          >
                            ×
                          </button>
                        </>
                      ) : null}
                      {canRestAfter ? (
                        <button
                          type="button"
                          className="session__queue-op"
                          title="Вставить паузу после"
                          onClick={() => {
                            void primeUiAudio();
                            playUiClick();
                            onInsertRestAfter?.(i);
                          }}
                        >
                          +⏸
                        </button>
                      ) : null}
                    </span>
                  ) : null}
                </li>
              );
            })}
            {windowStart + visible.length < queue.length ? (
              <li className="session__queue-item is-more">
                … и ещё {queue.length - windowStart - visible.length}
              </li>
            ) : null}
          </ol>
        </div>
      ) : null}
    </div>
  );
}
