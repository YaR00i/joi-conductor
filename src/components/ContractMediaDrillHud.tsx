import { useEffect, useState } from "react";
import {
  clearActiveMediaDrill,
  loadActiveMediaDrill,
  mediaDrillRemainingMs,
  setMediaDrillStatus,
  syncMediaDrillExpiry,
  type ActiveMediaDrill,
} from "../lib/contracts/mediaDrill";
import {
  findContract,
  formatCountdown,
  reportContract,
  type ContractReportResult,
} from "../lib/contracts/dailyBoard";
import type { PlaylistPreloadStatus } from "../lib/mediaPreload";
import { playUiClick, playUiConfirm, primeUiAudio } from "../lib/uiSound";

type Props = {
  /** Hide dock while a live session is running */
  sessionLive?: boolean;
  mediaLoading?: boolean;
  playlistPreload?: PlaylistPreloadStatus | null;
  /** Bump to re-read storage */
  revision?: number;
  onBoardChange?: (result: ContractReportResult) => void;
  onDrillCleared?: () => void;
};

export function ContractMediaDrillHud({
  sessionLive = false,
  mediaLoading = false,
  playlistPreload = null,
  revision = 0,
  onBoardChange,
  onDrillCleared,
}: Props) {
  const [drill, setDrill] = useState<ActiveMediaDrill | null>(() =>
    loadActiveMediaDrill(),
  );
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [modalOpen, setModalOpen] = useState(false);
  const [countStr, setCountStr] = useState("0");
  const [warn, setWarn] = useState<string | null>(null);
  const [forceHigh, setForceHigh] = useState(false);

  useEffect(() => {
    setDrill(syncMediaDrillExpiry(loadActiveMediaDrill()));
  }, [revision]);

  useEffect(() => {
    const id = window.setInterval(() => {
      const now = Date.now();
      setNowMs(now);
      const cur = syncMediaDrillExpiry(loadActiveMediaDrill(), now);
      setDrill(cur);
      if (cur?.status === "expired") {
        const open = findContract(cur.instanceId);
        if (open?.status === "open") {
          const result = reportContract(cur.instanceId, "failed");
          if (result) onBoardChange?.(result);
        }
        clearActiveMediaDrill();
        setDrill(null);
        setModalOpen(false);
        onDrillCleared?.();
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [onBoardChange, onDrillCleared]);

  if (!drill) return null;
  if (drill.status === "done" || drill.status === "expired") return null;

  const left = mediaDrillRemainingMs(drill, nowMs);
  const preloadPct =
    playlistPreload && playlistPreload.total > 0
      ? Math.round(
          (playlistPreload.ready / playlistPreload.total) * 100,
        )
      : null;

  function openReport() {
    void primeUiAudio();
    playUiClick();
    if (Date.now() > drill!.deadlineMs) return;
    setMediaDrillStatus("report");
    setCountStr("0");
    setWarn(null);
    setForceHigh(false);
    setModalOpen(true);
  }

  function submitReport() {
    void primeUiAudio();
    const n = Math.floor(Number(countStr));
    if (!Number.isFinite(n) || n < 0) {
      setWarn("Введи целое число ≥ 0");
      return;
    }
    const limit = drill!.limit;
    if (n > limit * 5 && !forceHigh) {
      setWarn(`Многовато для ${limit} кадров — нажми «Сдать» ещё раз, если верно.`);
      setForceHigh(true);
      return;
    }
    const result = reportContract(drill!.instanceId, "done", {
      triggersReported: n,
    });
    clearActiveMediaDrill();
    setDrill(null);
    setModalOpen(false);
    if (result) {
      playUiConfirm();
      onBoardChange?.(result);
    }
    onDrillCleared?.();
  }

  const contract = findContract(drill.instanceId);
  const stillOpen = contract?.status === "open";

  return (
    <>
      {!sessionLive && stillOpen ? (
        <div
          className="confirm-dock confirm-dock--prompt contracts-drill-dock"
          role="group"
          aria-label="Контракт: кэш и триггеры"
        >
          <div className="confirm-dock__prompt">
            <span className="confirm-dock__prompt-tag">
              Контракт · {formatCountdown(left)}
            </span>
            <span className="confirm-dock__prompt-q">
              Триггер: <strong>{drill.triggerRu}</strong> → {drill.actionRu}
            </span>
            <span className="contracts-drill-dock__meta">
              Кэш {drill.limit} · «{drill.tag}»
              {mediaLoading
                ? " · загрузка…"
                : preloadPct != null
                  ? ` · кэш ${preloadPct}%`
                  : ""}
            </span>
          </div>
          <div className="confirm-dock__prompt-opts">
            <button
              type="button"
              className="confirm-dock__btn confirm-dock__btn--prompt confirm-dock__btn--feeling_good"
              onClick={openReport}
            >
              Доложить
            </button>
          </div>
        </div>
      ) : null}

      {modalOpen ? (
        <div className="contracts-drill-modal" role="dialog" aria-modal="true">
          <div className="contracts-drill-modal__card">
            <h3 className="contracts-drill-modal__title">Сколько триггеров?</h3>
            <p className="contracts-drill-modal__hint">
              Кадры с «{drill.triggerRu}» — сколько раз сделал «{drill.actionRu}
              ».
            </p>
            <label className="contracts-drill-modal__label">
              Число
              <input
                type="number"
                min={0}
                step={1}
                className="contracts-drill-modal__input"
                value={countStr}
                onChange={(e) => {
                  setCountStr(e.target.value);
                  setWarn(null);
                }}
              />
            </label>
            {warn ? (
              <p className="contracts-drill-modal__warn">{warn}</p>
            ) : null}
            <div className="contracts-drill-modal__actions">
              <button
                type="button"
                className="contracts-card__btn contracts-card__btn--done"
                onClick={submitReport}
              >
                Сдать
              </button>
              <button
                type="button"
                className="contracts-card__btn contracts-card__btn--fail"
                onClick={() => {
                  void primeUiAudio();
                  playUiClick();
                  setMediaDrillStatus("browsing");
                  setModalOpen(false);
                }}
              >
                Ещё смотрю
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
