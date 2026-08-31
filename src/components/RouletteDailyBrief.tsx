import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  cageIsActive,
  cageRemainingMs,
  loadCageLock,
} from "../lib/cageTimer";
import {
  categoryLabelRu,
  contractBrief,
  ensureDailyContractBoard,
  formatCountdown,
  msUntilDeadline,
  type ContractInstance,
} from "../lib/contracts/dailyBoard";
import { isHabitContractId } from "../lib/contracts/catalog";
import { isMediaDrillContract } from "../lib/contracts/mediaDrill";
import {
  isSessionSeedableContract,
  isWearTimerContractDefId,
  SESSION_SEAL_ACCEPT_CTA_RU,
  SESSION_SEAL_ACTIVE_TAG_RU,
  SESSION_SEAL_CANCEL_CTA_RU,
  sessionSeedVerifyLabelRu,
  type ActiveSessionSeed,
} from "../lib/contracts/sessionSeed";
import {
  contractVerificationBadgeRu,
  contractVerificationMode,
  contractVerificationPathHintRu,
  contractVerificationTitleRu,
} from "../lib/contracts/verificationMode";
import {
  isDenialLiveContract,
  liveWearKindForContract,
  syncLiveObligationContracts,
} from "../lib/contracts/liveObligation";
import {
  listHomeTasksToday,
  openContractsCountToday,
  recommendNextUnlock,
  type RecommendedUnlock,
} from "../lib/dailyBrief";
import {
  denialEdgesComplete,
  denialIsActive,
  denialRemainingMs,
  loadDenialQuest,
  reportDenialEdge,
  type DenialQuest,
} from "../lib/denialQuest";
import { notifyDenialQuestChanged } from "./DenialQuestPill";
import { tasteChipRu } from "../lib/tasteLoopDisplay";
import type { WalletState } from "../lib/wallet";
import { playUiClick, playUiConfirm, playUiNav, primeUiAudio } from "../lib/uiSound";

function formatRemain(ms: number): string {
  const totalSec = Math.ceil(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}ч ${m}м`;
  if (m > 0) return `${m}м ${s}с`;
  return `${s}с`;
}

export type RouletteDailyBriefProps = {
  wallet: WalletState;
  contractSeed?: ActiveSessionSeed | null;
  onClearContractSeed?: () => void;
  onStartSessionSeed?: (contract: ContractInstance) => void;
  onStartMediaDrill?: (contract: ContractInstance) => void;
  onOpenContracts?: () => void;
  onOpenShop?: () => void;
  onOpenFavorites?: () => void;
  /** IndexedDB favorites count — light taste chip. */
  favoritesCount?: number;
  /** Bump when board / seed / wallet externally changes */
  revision?: number;
  mediaLoading?: boolean;
};

const MAX_FRESH_ROWS = 2;
const MAX_ACTIVE_ROWS = 2;

export function RouletteDailyBrief({
  wallet,
  contractSeed = null,
  onClearContractSeed,
  onStartSessionSeed,
  onStartMediaDrill,
  onOpenContracts,
  onOpenShop,
  onOpenFavorites,
  favoritesCount = 0,
  revision = 0,
  mediaLoading = false,
}: RouletteDailyBriefProps) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [boardTick, setBoardTick] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    const bump = () => {
      if (syncLiveObligationContracts()) setBoardTick((n) => n + 1);
      setNowMs(Date.now());
    };
    bump();
    window.addEventListener("joi-denial-quest-changed", bump);
    window.addEventListener("joi-cage-lock-changed", bump);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("joi-denial-quest-changed", bump);
      window.removeEventListener("joi-cage-lock-changed", bump);
    };
  }, []);

  useEffect(() => {
    if (syncLiveObligationContracts()) setBoardTick((n) => n + 1);
  }, [revision]);

  const board = useMemo(
    () => ensureDailyContractBoard(),
    [revision, boardTick],
  );

  const homeTasks = useMemo(
    () =>
      listHomeTasksToday(
        board,
        nowMs,
        contractSeed && isWearTimerContractDefId(contractSeed.defId)
          ? null
          : contractSeed?.instanceId,
      ),
    [board, nowMs, contractSeed],
  );
  const openCount = openContractsCountToday(board);
  const visibleFresh = homeTasks.fresh.slice(0, MAX_FRESH_ROWS);
  const visibleActive = homeTasks.active.slice(0, MAX_ACTIVE_ROWS);
  const hiddenCount = Math.max(
    0,
    homeTasks.fresh.length -
      visibleFresh.length +
      (homeTasks.active.length - visibleActive.length),
  );

  const deadlineMs = board.contracts[0]?.deadlineMs ?? nowMs;
  const boardLeft = msUntilDeadline(deadlineMs, nowMs);

  const cage = loadCageLock();
  const denial = loadDenialQuest();

  const unlockHint: RecommendedUnlock | null = useMemo(
    () => recommendNextUnlock(wallet),
    [wallet],
  );

  const tasteChip = tasteChipRu(favoritesCount);
  const liveWearSeed = Boolean(
    contractSeed && isWearTimerContractDefId(contractSeed.defId),
  );

  const hasSeed = Boolean(contractSeed) && !liveWearSeed;
  const hasAnything =
    hasSeed ||
    homeTasks.active.length > 0 ||
    homeTasks.fresh.length > 0 ||
    openCount > 0 ||
    unlockHint != null ||
    tasteChip != null;

  if (!hasAnything) {
    return (
      <section className="roulette-daily roulette-daily--home" aria-label="Сегодня">
        <header className="roulette-daily__head">
          <div>
            <p className="roulette-daily__kicker">Сегодня</p>
            <p className="roulette-daily__empty-line">
              Доска чистая — можно крутить без обязательств.
            </p>
          </div>
          <div className="roulette-daily__meta">
            <span title="Угольки">
              <em>{wallet.balance}</em> угольков
            </span>
          </div>
        </header>
      </section>
    );
  }

  return (
    <section className="roulette-daily roulette-daily--home" aria-label="Сегодня">
      <header className="roulette-daily__head">
        <div>
          <p className="roulette-daily__kicker">Сегодня</p>
          <p className="roulette-daily__sub">
            До обновления доски · <strong>{formatCountdown(boardLeft)}</strong>
          </p>
        </div>
        <div className="roulette-daily__meta">
          <span title="Угольки">
            <em>{wallet.balance}</em> угольков
          </span>
          {homeTasks.active.length > 0 ? (
            <span>
              Активные · <em>{homeTasks.active.length}</em>
            </span>
          ) : null}
          {homeTasks.fresh.length > 0 ? (
            <span>
              Новые · <em>{homeTasks.fresh.length}</em>
            </span>
          ) : openCount > 0 && homeTasks.active.length === 0 ? (
            <span>
              Контракты · <em>{openCount}</em>
            </span>
          ) : null}
          {tasteChip ? (
            <span className="roulette-daily__taste-chip">{tasteChip}</span>
          ) : null}
          {onOpenFavorites && tasteChip ? (
            <button
              type="button"
              className="roulette-daily__link"
              onClick={() => {
                void primeUiAudio();
                playUiNav();
                onOpenFavorites();
              }}
            >
              Вкус →
            </button>
          ) : null}
          {onOpenContracts ? (
            <button
              type="button"
              className="roulette-daily__link"
              onClick={() => {
                void primeUiAudio();
                playUiNav();
                onOpenContracts();
              }}
            >
              Все контракты →
            </button>
          ) : null}
        </div>
      </header>

      {contractSeed && !liveWearSeed ? (
        <div className="roulette-daily__seed is-sealed" role="status">
          <div className="roulette-daily__seed-text">
            <span className="roulette-daily__seed-tag">
              {SESSION_SEAL_ACTIVE_TAG_RU}
            </span>
            <strong>{contractSeed.titleRu}</strong>
            <span>
              {" · "}
              {sessionSeedVerifyLabelRu(contractSeed)}
            </span>
          </div>
          {onClearContractSeed ? (
            <button
              type="button"
              className="btn-ghost roulette-daily__seed-clear"
              onClick={() => {
                void primeUiAudio();
                playUiClick();
                onClearContractSeed();
              }}
            >
              {SESSION_SEAL_CANCEL_CTA_RU}
            </button>
          ) : null}
        </div>
      ) : null}

      {visibleActive.length > 0 ? (
        <div className="roulette-daily__group">
          <p className="roulette-daily__group-label">Активные</p>
          <ul className="roulette-daily__contracts">
            {visibleActive.map((c) => (
              <ContractBriefRow
                key={c.instanceId}
                contract={c}
                tone="active"
                seeded={contractSeed?.instanceId === c.instanceId}
                liveRemainRu={liveRemainRuFor(c, cage, denial, nowMs)}
                denialQuest={
                  isDenialLiveContract(c) && denialIsActive(denial, nowMs)
                    ? denial
                    : null
                }
                mediaLoading={mediaLoading}
                onStartSessionSeed={onStartSessionSeed}
                onStartMediaDrill={onStartMediaDrill}
                onDenialEdge={() => {
                  reportDenialEdge();
                  notifyDenialQuestChanged();
                  setNowMs(Date.now());
                }}
              />
            ))}
          </ul>
        </div>
      ) : null}

      {visibleFresh.length > 0 ? (
        <div className="roulette-daily__group">
          <p className="roulette-daily__group-label">Новые</p>
          <ul className="roulette-daily__contracts">
            {visibleFresh.map((c) => (
              <ContractBriefRow
                key={c.instanceId}
                contract={c}
                tone="fresh"
                seeded={false}
                mediaLoading={mediaLoading}
                onStartSessionSeed={onStartSessionSeed}
                onStartMediaDrill={onStartMediaDrill}
              />
            ))}
          </ul>
        </div>
      ) : null}

      {hiddenCount > 0 ? (
        onOpenContracts ? (
          <button
            type="button"
            className="roulette-daily__link roulette-daily__more"
            onClick={() => {
              void primeUiAudio();
              playUiNav();
              onOpenContracts();
            }}
          >
            ещё {hiddenCount}
          </button>
        ) : (
          <p className="roulette-daily__more">ещё {hiddenCount}</p>
        )
      ) : null}

      {unlockHint ? (
        <div className="roulette-daily__unlock">
          <span>
            {unlockHint.affordable ? "Можно взять" : "Ближайший анлок"}:{" "}
            <strong>{unlockHint.nameRu}</strong>
            {" · "}
            {unlockHint.cost} угольков
          </span>
          {onOpenShop ? (
            <button
              type="button"
              className="roulette-daily__link"
              onClick={() => {
                void primeUiAudio();
                playUiNav();
                onOpenShop();
              }}
            >
              Лавка →
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function liveRemainRuFor(
  contract: ContractInstance,
  cage: ReturnType<typeof loadCageLock>,
  denial: DenialQuest | null,
  nowMs: number,
): string | null {
  const wearKind = liveWearKindForContract(contract);
  if (wearKind && cageIsActive(cage, nowMs) && cage) {
    const lockKind = cage.kind === "plug" ? "plug" : "cage";
    if (lockKind === wearKind) return formatRemain(cageRemainingMs(cage, nowMs));
  }
  if (isDenialLiveContract(contract) && denialIsActive(denial, nowMs) && denial) {
    const edges =
      denial.edgesTarget > 0
        ? ` · эджи ${denial.edgesDone}/${denial.edgesTarget}`
        : "";
    return `${formatRemain(denialRemainingMs(denial, nowMs))}${edges}`;
  }
  return null;
}

type DailyPopBox = {
  left: number;
  width: number;
  maxHeight: number;
  top?: number;
  bottom?: number;
};

function dailyPopBoxForRow(row: HTMLElement): DailyPopBox {
  const r = row.getBoundingClientRect();
  const margin = 10;
  const width = Math.min(r.width, window.innerWidth - margin * 2);
  const left = Math.min(
    Math.max(margin, r.left),
    Math.max(margin, window.innerWidth - width - margin),
  );
  const below = window.innerHeight - r.bottom - margin;
  const above = r.top - margin;
  if (below >= 132 || below >= above) {
    return { top: r.bottom + 6, left, width, maxHeight: Math.max(88, below) };
  }
  return {
    bottom: window.innerHeight - r.top + 6,
    left,
    width,
    maxHeight: Math.max(88, above),
  };
}

function ContractBriefRow({
  contract,
  tone,
  seeded,
  liveRemainRu,
  denialQuest,
  mediaLoading,
  onStartSessionSeed,
  onStartMediaDrill,
  onDenialEdge,
}: {
  contract: ContractInstance;
  tone: "active" | "fresh";
  seeded: boolean;
  liveRemainRu?: string | null;
  denialQuest?: DenialQuest | null;
  mediaLoading: boolean;
  onStartSessionSeed?: (contract: ContractInstance) => void;
  onStartMediaDrill?: (contract: ContractInstance) => void;
  onDenialEdge?: () => void;
}) {
  const drill = isMediaDrillContract(contract);
  const seedable = !drill && isSessionSeedableContract(contract);
  const verifyMode = contractVerificationMode(contract);
  const brief = contractBrief(contract.defId);
  const rowRef = useRef<HTMLLIElement>(null);
  const [popOpen, setPopOpen] = useState(false);
  const [popBox, setPopBox] = useState<DailyPopBox | null>(null);
  const popId = `daily-pop-${contract.instanceId}`;

  const updatePopBox = () => {
    const row = rowRef.current;
    if (!row) return;
    setPopBox(dailyPopBoxForRow(row));
  };

  const openPop = () => {
    updatePopBox();
    setPopOpen(true);
  };

  useLayoutEffect(() => {
    if (!popOpen) return;
    updatePopBox();
    const onMove = () => updatePopBox();
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    return () => {
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
  }, [popOpen]);

  return (
    <li
      ref={rowRef}
      className={`roulette-daily__row${seeded ? " is-seeded" : ""}${tone === "active" ? " is-active-task" : ""}`}
      tabIndex={0}
      aria-describedby={popOpen ? popId : undefined}
      onMouseEnter={openPop}
      onMouseLeave={() => setPopOpen(false)}
      onFocus={openPop}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          setPopOpen(false);
        }
      }}
    >
      <div className="roulette-daily__row-main">
        <span className="roulette-daily__cat">
          {categoryLabelRu(contract.category)}
        </span>
        <span
          className={`roulette-daily__verify roulette-daily__verify--${verifyMode}`}
          title={contractVerificationTitleRu(verifyMode)}
        >
          {contractVerificationBadgeRu(verifyMode)}
        </span>
        <span className="roulette-daily__title">{contract.titleRu}</span>
        {liveRemainRu ? (
          <span className="roulette-daily__live">{liveRemainRu}</span>
        ) : null}
        {isHabitContractId(contract.defId) ? (
          <span className="roulette-daily__habit">привычка</span>
        ) : null}
        <span className="roulette-daily__reward">+{contract.reward}</span>
      </div>
      <div className="roulette-daily__row-actions">
        {brief ? (
          <span className="roulette-daily__brief" title={brief}>
            {brief}
          </span>
        ) : null}
        {tone === "active" ? (
          <>
            {denialQuest &&
            denialQuest.edgesTarget > 0 &&
            !denialEdgesComplete(denialQuest) ? (
              <button
                type="button"
                className="btn-primary roulette-daily__cta"
                onClick={() => {
                  void primeUiAudio();
                  playUiClick();
                  onDenialEdge?.();
                }}
              >
                Эдж ✓
              </button>
            ) : liveRemainRu ? (
              <span className="roulette-daily__hint">идёт</span>
            ) : (
              <span className="roulette-daily__hint">принято</span>
            )}
          </>
        ) : seeded ? (
          <span className="roulette-daily__hint">
            {contractVerificationPathHintRu(verifyMode, { seeded: true })}
          </span>
        ) : drill ? (
          <button
            type="button"
            className="btn-primary roulette-daily__cta"
            disabled={!onStartMediaDrill || mediaLoading}
            onClick={() => {
              void primeUiAudio();
              playUiConfirm();
              onStartMediaDrill?.(contract);
            }}
          >
            {mediaLoading ? "…" : "Начать"}
          </button>
        ) : seedable ? (
          <button
            type="button"
            className="btn-primary roulette-daily__cta"
            disabled={!onStartSessionSeed}
            onClick={() => {
              void primeUiAudio();
              playUiConfirm();
              onStartSessionSeed?.(contract);
            }}
          >
            {SESSION_SEAL_ACCEPT_CTA_RU}
          </button>
        ) : (
          <span className="roulette-daily__hint">
            {contractVerificationPathHintRu(verifyMode)}
          </span>
        )}
      </div>
      {popOpen && popBox
        ? createPortal(
            <div
              id={popId}
              className="roulette-daily__pop"
              role="tooltip"
              style={{
                left: popBox.left,
                width: popBox.width,
                maxHeight: popBox.maxHeight,
                top: popBox.top,
                bottom: popBox.bottom,
              }}
            >
              <p className="roulette-daily__pop-kicker">
                {categoryLabelRu(contract.category)}
                {isHabitContractId(contract.defId) ? " · привычка" : ""}
                {" · "}
                {contractVerificationBadgeRu(verifyMode)}
                {" · +"}
                {contract.reward}
              </p>
              <strong>{contract.titleRu}</strong>
              <p className="roulette-daily__pop-body">{contract.bodyRu}</p>
            </div>,
            document.body,
          )
        : null}
    </li>
  );
}
