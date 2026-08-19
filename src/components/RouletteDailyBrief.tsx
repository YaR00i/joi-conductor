import { useEffect, useMemo, useState } from "react";
import {
  cageIsActive,
  cageRemainingMs,
  loadCageLock,
} from "../lib/cageTimer";
import {
  categoryLabelRu,
  ensureDailyContractBoard,
  formatCountdown,
  msUntilDeadline,
  type ContractInstance,
} from "../lib/contracts/dailyBoard";
import { isMediaDrillContract } from "../lib/contracts/mediaDrill";
import {
  isSessionSeedableContract,
  SESSION_SEAL_ACCEPT_CTA_RU,
  SESSION_SEAL_ACTIVE_TAG_RU,
  SESSION_SEAL_CANCEL_CTA_RU,
  sealedFatePhraseForSeed,
  sessionSeedLockLabelsRu,
  sessionSeedVerifyLabelRu,
  type ActiveSessionSeed,
} from "../lib/contracts/sessionSeed";
import {
  contractVerificationBadgeRu,
  contractVerificationMode,
  contractVerificationPathHintRu,
  contractVerificationTitleRu,
} from "../lib/contracts/verificationMode";
import { getActiveMistress } from "../lib/mistress";
import {
  listOpenContractsToday,
  openContractsCountToday,
  recommendNextUnlock,
  type RecommendedUnlock,
} from "../lib/dailyBrief";
import {
  denialIsActive,
  denialRemainingMs,
  loadDenialQuest,
} from "../lib/denialQuest";
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

const MAX_CONTRACT_ROWS = 2;

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

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    const bump = () => setNowMs(Date.now());
    window.addEventListener("joi-denial-quest-changed", bump);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("joi-denial-quest-changed", bump);
    };
  }, []);

  const board = useMemo(() => ensureDailyContractBoard(), [revision]);

  const openContracts = useMemo(
    () => listOpenContractsToday(board, nowMs),
    [board, nowMs],
  );
  const openCount = openContractsCountToday(board);
  const visibleContracts = openContracts.slice(0, MAX_CONTRACT_ROWS);
  const hiddenCount = Math.max(0, openContracts.length - visibleContracts.length);

  const deadlineMs = board.contracts[0]?.deadlineMs ?? nowMs;
  const boardLeft = msUntilDeadline(deadlineMs, nowMs);

  const cage = loadCageLock();
  const denial = loadDenialQuest();
  const cageOn = cageIsActive(cage);
  const denialOn = denialIsActive(denial);

  const unlockHint: RecommendedUnlock | null = useMemo(
    () => recommendNextUnlock(wallet),
    [wallet],
  );

  const tasteChip = tasteChipRu(favoritesCount);

  const obligationBits: string[] = [];
  if (cageOn && cage) {
    const label =
      cage.kind === "plug"
        ? `Пробка ${formatRemain(cageRemainingMs(cage))}`
        : `Клетка ${formatRemain(cageRemainingMs(cage))}`;
    obligationBits.push(label);
  }
  if (denialOn && denial) {
    const edges =
      denial.edgesTarget > 0
        ? ` · эджи ${denial.edgesDone}/${denial.edgesTarget}`
        : "";
    obligationBits.push(
      `Denial ${formatRemain(denialRemainingMs(denial))}${edges}`,
    );
  }

  const hasSeed = Boolean(contractSeed);
  const hasAnything =
    hasSeed ||
    openCount > 0 ||
    obligationBits.length > 0 ||
    unlockHint != null ||
    tasteChip != null;

  if (!hasAnything) {
    return (
      <section className="roulette-daily" aria-label="Сегодня">
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
    <section className="roulette-daily" aria-label="Сегодня">
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
          {openCount > 0 ? (
            <span>
              Контракты · <em>{openCount}</em>
            </span>
          ) : null}
        </div>
      </header>

      {tasteChip ? (
        <div className="roulette-daily__taste">
          <span className="roulette-daily__taste-chip">{tasteChip}</span>
          <span className="roulette-daily__taste-hint">
            лайки смещают рулетку и полку
          </span>
          {onOpenFavorites ? (
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
        </div>
      ) : null}

      {contractSeed ? (
        <div className="roulette-daily__seed is-sealed" role="status">
          <div className="roulette-daily__seed-text">
            <span className="roulette-daily__seed-tag">
              {SESSION_SEAL_ACTIVE_TAG_RU}
            </span>
            <strong>{contractSeed.titleRu}</strong>
            <span>
              {" · "}
              {sessionSeedLockLabelsRu(contractSeed).join(" · ") || "параметры"}
              {" · "}
              {sessionSeedVerifyLabelRu(contractSeed)}
            </span>
            <span className="roulette-daily__seed-hint">
              {" "}
              — {sealedFatePhraseForSeed(contractSeed, getActiveMistress().id)}
              ; барабаны и колесо запечатаны
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

      {visibleContracts.length > 0 ? (
        <ul className="roulette-daily__contracts">
          {visibleContracts.map((c) => (
            <ContractBriefRow
              key={c.instanceId}
              contract={c}
              seeded={contractSeed?.instanceId === c.instanceId}
              mediaLoading={mediaLoading}
              onStartSessionSeed={onStartSessionSeed}
              onStartMediaDrill={onStartMediaDrill}
            />
          ))}
        </ul>
      ) : null}

      {hiddenCount > 0 || onOpenContracts ? (
        <div className="roulette-daily__foot-row">
          {hiddenCount > 0 ? (
            <span className="roulette-daily__more">ещё {hiddenCount}</span>
          ) : (
            <span />
          )}
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
      ) : null}

      {obligationBits.length > 0 ? (
        <p className="roulette-daily__obligations">
          {obligationBits.join(" · ")}
        </p>
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

function ContractBriefRow({
  contract,
  seeded,
  mediaLoading,
  onStartSessionSeed,
  onStartMediaDrill,
}: {
  contract: ContractInstance;
  seeded: boolean;
  mediaLoading: boolean;
  onStartSessionSeed?: (contract: ContractInstance) => void;
  onStartMediaDrill?: (contract: ContractInstance) => void;
}) {
  const drill = isMediaDrillContract(contract);
  const seedable = !drill && isSessionSeedableContract(contract);
  const verifyMode = contractVerificationMode(contract);

  return (
    <li
      className={`roulette-daily__row${seeded ? " is-seeded" : ""}`}
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
        <span className="roulette-daily__reward">+{contract.reward}</span>
      </div>
      <div className="roulette-daily__row-actions">
        {seeded ? (
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
    </li>
  );
}
