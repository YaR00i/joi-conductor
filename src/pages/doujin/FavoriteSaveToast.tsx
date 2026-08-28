import { useEffect, useMemo, useRef, useState } from "react";
import {
  favoriteSaveItemDetail,
  favoriteSaveItemFill,
  favoriteSaveItemPhaseRu,
  groupFavoriteSaveItems,
  useFavoriteSaveQueue,
  type FavoriteSaveHold,
  type FavoriteSaveItem,
  type FavoriteSaveToastState,
} from "../../lib/favoriteSaveQueue";
import "./doujin.css";

type FavoriteSaveToastProps = {
  toast: FavoriteSaveToastState | null;
  items?: readonly FavoriteSaveItem[];
  hold?: FavoriteSaveHold | null;
  batch?: number;
  ready?: number;
  failed?: number;
  onExpandedChange?: (open: boolean) => void;
  onDismiss?: () => void;
};

export function FavoriteSaveToastHost({
  onIdle,
}: {
  onIdle?: () => void;
}) {
  const favSave = useFavoriteSaveQueue({ onIdle });
  if (!favSave.toast) return null;
  return (
    <div className="doujin-toast-stack">
      <FavoriteSaveToast
        toast={favSave.toast}
        items={favSave.items}
        hold={favSave.hold}
        batch={favSave.batch}
        ready={favSave.ready}
        failed={favSave.failed}
        onExpandedChange={favSave.setHoldPaused}
        onDismiss={favSave.dismissToast}
      />
    </div>
  );
}

export function FavoriteSaveToast({
  toast,
  items = [],
  hold = null,
  batch = 0,
  ready = 0,
  failed = 0,
  onExpandedChange,
  onDismiss,
}: FavoriteSaveToastProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const onExpandedChangeRef = useRef(onExpandedChange);
  onExpandedChangeRef.current = onExpandedChange;
  const groups = useMemo(() => groupFavoriteSaveItems(items), [items]);
  const showGroupHeads = groups.length > 1 || Boolean(groups[0]?.id);

  useEffect(() => {
    if (!toast) setOpen(false);
  }, [toast]);

  useEffect(() => {
    if (!toast) {
      onExpandedChangeRef.current?.(false);
      return;
    }
    onExpandedChangeRef.current?.(open);
  }, [open, toast]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  if (!toast) return null;

  const total = Math.max(batch, items.length, 1);
  const doneCount = ready + failed;
  const livePct =
    toast.status === "live"
      ? Math.max(8, Math.round((doneCount / total) * 100))
      : 100;
  const stats = `${doneCount}/${total}${failed > 0 ? ` · ⚠${failed}` : ""}`;

  return (
    <div
      ref={wrapRef}
      className={
        "doujin-toast doujin-toast--save" +
        (toast.status === "error"
          ? " is-error"
          : toast.status === "live"
            ? " is-live"
            : " is-done") +
        (open ? " is-open" : "")
      }
      role="status"
      aria-live="polite"
    >
      <button
        type="button"
        className="doujin-toast__head"
        aria-expanded={open}
        title={open ? "Свернуть очередь" : "Показать очередь"}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="doujin-toast__copy">
          <span className="doujin-toast__kicker">{toast.kicker}</span>
          <span className="doujin-toast__text">{toast.text}</span>
        </span>
        <span className="doujin-toast__stats">{stats}</span>
        <span className="doujin-toast__chevron" aria-hidden>
          {open ? "▾" : "▸"}
        </span>
      </button>

      {open ? (
        <div
          className="doujin-toast__panel"
          role="dialog"
          aria-label="Очередь сохранения"
        >
          <div className="doujin-toast__panel-head">
            <div>
              <strong>
                {items.some((row) => row.kind === "cache") &&
                items.some(
                  (row) => row.kind === "save" || row.kind === "remove",
                )
                  ? "Очередь"
                  : items.some((row) => row.kind === "cache")
                    ? "Очередь кэша"
                    : "Очередь полки"}
              </strong>
              <span className="doujin-toast__panel-sub">
                {toast.status === "live"
                  ? showGroupHeads
                    ? "списки отдельно от избранного"
                    : "по порядку кликов"
                  : "последняя пачка"}
              </span>
            </div>
            <span className="doujin-toast__panel-count">{stats}</span>
          </div>
          <ul className="doujin-toast__list">
            {groups.map((group) => (
              <li
                key={group.id || "shelf"}
                className="doujin-toast__group"
              >
                {showGroupHeads ? (
                  <p className="doujin-toast__group-label">{group.label}</p>
                ) : null}
                <ul className="doujin-toast__list">
                  {group.items.map((item) => (
                    <li
                      key={item.id}
                      className={`doujin-toast__file is-${item.phase}`}
                    >
                      <div className="doujin-toast__file-top">
                        <span className="doujin-toast__file-label">
                          {item.label}
                        </span>
                        <span className="doujin-toast__file-phase">
                          {favoriteSaveItemPhaseRu(item.phase)}
                        </span>
                      </div>
                      <div className="doujin-toast__file-track">
                        <div
                          className="doujin-toast__file-fill"
                          style={{ width: `${favoriteSaveItemFill(item)}%` }}
                        />
                      </div>
                      <p className="doujin-toast__file-detail">
                        {favoriteSaveItemDetail(item)}
                      </p>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="doujin-toast__hold" aria-hidden>
        {toast.status === "live" || !hold ? (
          <div
            className="doujin-toast__hold-fill is-live"
            style={{ width: `${livePct}%` }}
          />
        ) : (
          <div
            key={hold.generation}
            className={
              "doujin-toast__hold-fill is-drain" + (open ? " is-paused" : "")
            }
            style={{ animationDuration: `${hold.durationMs}ms` }}
            onAnimationEnd={() => {
              if (!open) onDismiss?.();
            }}
          />
        )}
      </div>
    </div>
  );
}
