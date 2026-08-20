import { useCallback, useEffect, useMemo, useState } from "react";
import { ContractFinishDebriefSheet } from "../components/ContractFinishDebriefSheet";
import { ContractEditorPage } from "./ContractEditorPage";
import { isUserContract } from "../lib/contracts/userCatalog";
import { getActiveSaveSlot } from "../lib/saveSlots";
import {
  requiresActivityDebrief,
  scoreActivityDebrief,
  type ActivityDebriefAnswers,
} from "../lib/contracts/activityDebrief";
import { ActivityDebriefSheet } from "../components/ActivityDebriefSheet";
import {
  appendContractJournalEntry,
  buildContractJournalEntry,
} from "../lib/contractJournal";
import { MistressImg } from "../components/MistressImg";
import { MistressPicker } from "../components/MistressPicker";
import {
  CONTRACT_CATEGORY_LABELS,
  getContractDef,
  type ContractCategory,
} from "../lib/contracts/catalog";
import {
  categoryLabelRu,
  CONTRACT_BOARD_REROLL_COST,
  contractBrief,
  countOpenContracts,
  ensureDailyContractBoard,
  findContract,
  formatCountdown,
  MISTRESS_CONTRACT_LINES,
  msUntilDeadline,
  reportContract,
  rerollDailyContractBoard,
  type ContractInstance,
  type ContractReportResult,
  type DailyContractBoard,
} from "../lib/contracts/dailyBoard";
import {
  finishDebriefMaxBonus,
  finishDebriefPresetFor,
  isFinishDebriefContract,
  type FinishDebriefAnswers,
} from "../lib/contracts/finishDebrief";
import {
  clearActiveMediaDrill,
  isMediaDrillContract,
  loadActiveMediaDrill,
  mediaDrillRemainingMs,
  type ActiveMediaDrill,
} from "../lib/contracts/mediaDrill";
import { notifyCageLockChanged } from "../components/CageLockPill";
import { notifyDenialQuestChanged } from "../components/DenialQuestPill";
import {
  clearActiveSessionSeed,
  clearActiveSessionSeedWithSideEffects,
  isSessionSeedableContract,
  loadActiveSessionSeed,
  pruneStaleSessionSeedDetailed,
  SESSION_SEAL_ACCEPT_CTA_RU,
  SESSION_SEAL_ACTIVE_TAG_RU,
  SESSION_SEAL_CANCEL_CTA_RU,
  sealedFatePhraseForSeed,
  isLiveGoalSessionSeed,
  sessionSeedLockLabelsRu,
  sessionSeedProgressLabelRu,
  unlinkSessionSeedSideEffects,
  type ActiveSessionSeed,
} from "../lib/contracts/sessionSeed";
import {
  contractHonorReportCtaRu,
  contractVerificationBadgeRu,
  contractVerificationCloseHintRu,
  contractVerificationMode,
  contractVerificationModeFromSeed,
  contractVerificationTitleRu,
} from "../lib/contracts/verificationMode";
import {
  getActiveMistress,
  subscribeActiveMistress,
  type MistressPack,
} from "../lib/mistress";
import {
  mistressUnlockSnapshotFromWallet,
  type WalletState,
} from "../lib/wallet";
import { playUiClick, playUiConfirm, playUiNav, primeUiAudio } from "../lib/uiSound";

type FilterId = "all" | ContractCategory;

type Props = {
  wallet: WalletState;
  onReward: (cinders: number) => void;
  /** Spend cinders; return false if balance is insufficient. */
  onSpend?: (amount: number) => boolean;
  revision?: number;
  onOpenCountChange?: (n: number) => void;
  /** Start guided media-drill (load cache + open Session) */
  onStartMediaDrill?: (contract: ContractInstance) => void;
  /** Seed SessionParams / roulette locks from a session-linked contract */
  onStartSessionSeed?: (contract: ContractInstance) => void;
  /** Notify app when seal is cleared locally (cancel / report / expire) */
  onSessionSeedCleared?: () => void;
  /** Keep media / plan in sync when mistress changes (same as Roulette). */
  onMistressSwitched?: (pack: MistressPack) => void;
  /** Lock picker during a live session. */
  sessionLive?: boolean;
  drillRevision?: number;
  seedRevision?: number;
  mediaLoading?: boolean;
  /** Brief card emphasis after Debrief → Contracts (title match). */
  highlightTitleRu?: string | null;
};

function statusLabel(c: ContractInstance): string {
  switch (c.status) {
    case "open":
      return "Открыт";
    case "done":
      return "Выполнен";
    case "failed":
      return "Провал";
    case "expired":
      return "Истёк";
    default: {
      const _exhaustive: never = c.status;
      return _exhaustive;
    }
  }
}

function difficultyDots(d: 1 | 2 | 3): string {
  return "●".repeat(d) + "○".repeat(3 - d);
}

export function ContractsPage({
  wallet,
  onReward,
  onSpend,
  revision = 0,
  onOpenCountChange,
  onStartMediaDrill,
  onStartSessionSeed,
  onSessionSeedCleared,
  onMistressSwitched,
  sessionLive = false,
  drillRevision = 0,
  seedRevision = 0,
  mediaLoading = false,
  highlightTitleRu = null,
}: Props) {
  const [mistress, setMistress] = useState(() => getActiveMistress());
  const [board, setBoard] = useState<DailyContractBoard>(() =>
    ensureDailyContractBoard(),
  );
  const [filter, setFilter] = useState<FilterId>("all");
  const [flash, setFlash] = useState<string | null>(null);
  const [mode, setMode] = useState<"board" | "editor">("board");
  /** Contract editor is a sandbox/dev-only feature. */
  const isSandbox = getActiveSaveSlot() === "sandbox";
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [activeDrill, setActiveDrill] = useState<ActiveMediaDrill | null>(() =>
    loadActiveMediaDrill(),
  );
  const [activeSeed, setActiveSeed] = useState<ActiveSessionSeed | null>(() =>
    loadActiveSessionSeed(),
  );
  const [pulseTitleRu, setPulseTitleRu] = useState<string | null>(null);
  const [debriefContract, setDebriefContract] =
    useState<ContractInstance | null>(null);
  const [activityDebriefContract, setActivityDebriefContract] =
    useState<ContractInstance | null>(null);

  const mistressUnlocks = useMemo(
    () => mistressUnlockSnapshotFromWallet(wallet),
    [wallet],
  );

  const refresh = useCallback(() => {
    const next = ensureDailyContractBoard();
    setBoard(next);
    onOpenCountChange?.(countOpenContracts(next));

    const drill = loadActiveMediaDrill();
    if (
      drill &&
      !next.contracts.some(
        (c) => c.instanceId === drill.instanceId && c.status === "open",
      )
    ) {
      clearActiveMediaDrill();
      setActiveDrill(null);
    } else {
      setActiveDrill(drill);
    }

    const hadSeed = Boolean(loadActiveSessionSeed());
    const pruned = pruneStaleSessionSeedDetailed((id) => findContract(id));
    if (pruned.clearedDenial) notifyDenialQuestChanged();
    if (pruned.clearedCage) notifyCageLockChanged();
    setActiveSeed(pruned.seed);
    if (hadSeed && !pruned.seed) onSessionSeedCleared?.();
  }, [onOpenCountChange, onSessionSeedCleared]);

  useEffect(() => subscribeActiveMistress(setMistress), []);

  useEffect(() => {
    refresh();
  }, [revision, mistress.id, drillRevision, seedRevision, refresh]);

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const title = highlightTitleRu?.trim();
    if (!title) return;
    setPulseTitleRu(title);
    const clearId = window.setTimeout(() => setPulseTitleRu(null), 2600);
    return () => window.clearTimeout(clearId);
  }, [highlightTitleRu]);

  const deadlineMs = board.contracts[0]?.deadlineMs ?? nowMs;
  const left = msUntilDeadline(deadlineMs, nowMs);

  const filters = useMemo(() => {
    const cats = new Set(board.contracts.map((c) => c.category));
    return [
      { id: "all" as const, label: "Все" },
      ...([...cats] as ContractCategory[]).map((id) => ({
        id,
        label: CONTRACT_CATEGORY_LABELS[id],
      })),
    ];
  }, [board.contracts]);

  const visible = useMemo(() => {
    const list =
      filter === "all"
        ? board.contracts
        : board.contracts.filter((c) => c.category === filter);
    const rank = (s: ContractInstance["status"]) => {
      switch (s) {
        case "open":
          return 0;
        case "done":
          return 1;
        case "failed":
          return 2;
        case "expired":
          return 3;
        default: {
          const _exhaustive: never = s;
          return _exhaustive;
        }
      }
    };
    return [...list].sort((a, b) => rank(a.status) - rank(b.status));
  }, [board.contracts, filter]);

  const openCount = countOpenContracts(board);
  const line =
    MISTRESS_CONTRACT_LINES[mistress.id] ?? MISTRESS_CONTRACT_LINES.hu_tao;

  function applyReportResult(result: ContractReportResult) {
    setBoard(result.board);
    onOpenCountChange?.(countOpenContracts(result.board));
    if (result.status === "done") {
      if (result.rewarded > 0) {
        playUiConfirm();
        onReward(result.rewarded);
        setFlash(result.rewardSummaryRu ?? `+${result.rewarded} угольков`);
      } else {
        playUiClick(0.6);
        setFlash(result.rewardSummaryRu ?? "Отчёт принят · без угольков");
      }
    } else if (result.status === "expired") {
      playUiClick(0.6);
      setFlash("Срок вышел — контракт истёк");
    } else if (result.status === "failed") {
      playUiClick(0.6);
      setFlash("Провал / время вышло. Без штрафа угольками.");
    }
    window.setTimeout(() => setFlash(null), 3200);
  }

  function finalizeReport(
    instanceId: string,
    outcome: "done" | "failed",
    opts?: {
      finishDebrief?: FinishDebriefAnswers;
      activityDebrief?: ActivityDebriefAnswers;
    },
  ) {
    const c = board.contracts.find((x) => x.instanceId === instanceId);
    // Activity-debrief answers can adjust the reward before reporting.
    let adjustedReward: number | undefined;
    let activitySummary: string | undefined;
    if (opts?.activityDebrief && c) {
      const score = scoreActivityDebrief(c.reward, opts.activityDebrief);
      adjustedReward = score.rewarded;
      activitySummary = score.summaryRu;
    }
    const result = reportContract(instanceId, outcome, {
      ...opts,
      ...(adjustedReward != null ? { reward: adjustedReward } : {}),
    });
    if (!result) return;
    if (activitySummary) {
      result.rewardSummaryRu = activitySummary;
    }
    if (loadActiveMediaDrill()?.instanceId === instanceId) {
      clearActiveMediaDrill();
      setActiveDrill(null);
    }
    const seedForJournal = loadActiveSessionSeed();
    if (seedForJournal?.instanceId === instanceId) {
      const seed = seedForJournal;
      // Deny quest outlives the session seal — only drop cage we started.
      const side = unlinkSessionSeedSideEffects(seed, {
        denial: false,
        cage: true,
      });
      if (side.clearedCage) notifyCageLockChanged();
      clearActiveSessionSeed();
      setActiveSeed(null);
      onSessionSeedCleared?.();
    }
    // Record into the separate contract journal.
    if (c) {
      const performedVia =
        opts?.activityDebrief != null
          ? "debrief"
          : opts?.finishDebrief != null
            ? "debrief"
            : outcome === "done"
              ? "honor"
              : "honor";
      appendContractJournalEntry(
        buildContractJournalEntry({
          contract: c,
          outcome:
            result.status === "expired"
              ? "expired"
              : (outcome as "done" | "failed"),
          reward: result.rewarded,
          baseReward: c.reward,
          performedVia,
          acceptedAtMs: seedForJournal?.startedAtMs,
          summaryRu: result.rewardSummaryRu,
          debriefPreset: opts?.finishDebrief
            ? "finish_debrief"
            : opts?.activityDebrief
              ? "activity_debrief"
              : undefined,
          debriefAnswers: opts?.finishDebrief ?? opts?.activityDebrief,
        }),
      );
    }
    applyReportResult(result);
  }

  function onReport(instanceId: string, outcome: "done" | "failed") {
    void primeUiAudio();
    if (outcome === "done") {
      const c = board.contracts.find((x) => x.instanceId === instanceId);
      if (c && isFinishDebriefContract(c)) {
        playUiNav();
        setDebriefContract(c);
        return;
      }
      if (c && requiresActivityDebrief(c)) {
        playUiNav();
        setActivityDebriefContract(c);
        return;
      }
    }
    finalizeReport(instanceId, outcome);
  }

  function onDebriefSubmit(answers: FinishDebriefAnswers) {
    if (!debriefContract) return;
    const id = debriefContract.instanceId;
    setDebriefContract(null);
    finalizeReport(id, "done", { finishDebrief: answers });
  }

  function onActivityDebriefSubmit(answers: ActivityDebriefAnswers) {
    if (!activityDebriefContract) return;
    const id = activityDebriefContract.instanceId;
    setActivityDebriefContract(null);
    finalizeReport(id, "done", { activityDebrief: answers });
  }

  function onStartDrill(c: ContractInstance) {
    void primeUiAudio();
    playUiConfirm();
    onStartMediaDrill?.(c);
  }

  function onStartSeed(c: ContractInstance) {
    void primeUiAudio();
    playUiConfirm();
    onStartSessionSeed?.(c);
  }

  function onClearSeed() {
    void primeUiAudio();
    playUiClick();
    const side = clearActiveSessionSeedWithSideEffects();
    if (side.clearedDenial) notifyDenialQuestChanged();
    if (side.clearedCage) notifyCageLockChanged();
    setActiveSeed(null);
    onSessionSeedCleared?.();
    setFlash("Печать снята — план снова можно крутить");
    window.setTimeout(() => setFlash(null), 2200);
  }

  function onRerollBoard() {
    void primeUiAudio();
    if (!onSpend) return;
    if (wallet.balance < CONTRACT_BOARD_REROLL_COST) {
      playUiClick(0.6);
      setFlash(`Нужно ${CONTRACT_BOARD_REROLL_COST} угольков`);
      window.setTimeout(() => setFlash(null), 2200);
      return;
    }
    if (!onSpend(CONTRACT_BOARD_REROLL_COST)) {
      playUiClick(0.6);
      setFlash(`Нужно ${CONTRACT_BOARD_REROLL_COST} угольков`);
      window.setTimeout(() => setFlash(null), 2200);
      return;
    }

    if (loadActiveMediaDrill()) {
      clearActiveMediaDrill();
      setActiveDrill(null);
    }
    if (loadActiveSessionSeed()) {
      const side = clearActiveSessionSeedWithSideEffects();
      if (side.clearedDenial) notifyDenialQuestChanged();
      if (side.clearedCage) notifyCageLockChanged();
      setActiveSeed(null);
      onSessionSeedCleared?.();
    }
    setDebriefContract(null);
    setActivityDebriefContract(null);

    const next = rerollDailyContractBoard();
    setBoard(next);
    onOpenCountChange?.(countOpenContracts(next));
    playUiConfirm();
    setFlash(`Доска обновлена · −${CONTRACT_BOARD_REROLL_COST} ◆`);
    window.setTimeout(() => setFlash(null), 2800);
  }

  const canReroll =
    Boolean(onSpend) && wallet.balance >= CONTRACT_BOARD_REROLL_COST;

  return (
    <div className="contracts-page">
      <header className="contracts-page__hero">
        <div className="contracts-page__hero-top">
          <div className="contracts-page__hero-text">
            <p className="contracts-page__eyebrow">Доска дня · сессия и вне</p>
            <h1 className="contracts-page__title">Контракты</h1>
            <p className="contracts-page__sub">
              {mistress.displayNameRu} выложила задания на сегодня.
            </p>
            <p className="contracts-page__line">«{line}»</p>
            <div className="contracts-page__mode-toggle">
              <button
                type="button"
                className={
                  mode === "board"
                    ? "contracts-page__mode-btn is-active"
                    : "contracts-page__mode-btn"
                }
                onClick={() => setMode("board")}
              >
                Доска
              </button>
              {isSandbox ? (
                <button
                  type="button"
                  className={
                    mode === "editor"
                      ? "contracts-page__mode-btn is-active"
                      : "contracts-page__mode-btn"
                  }
                  onClick={() => setMode("editor")}
                  title="Доступно только в Песочнице"
                >
                  Свои контракты
                </button>
              ) : null}
            </div>
          </div>
          <div className="contracts-page__avatar" aria-hidden>
            <MistressImg
              src={mistress.assets.shopAvatar}
              alt=""
              className="contracts-page__avatar-img"
            />
          </div>
        </div>

        <div className="contracts-page__toolbar">
          <div className="contracts-page__mistress">
            <MistressPicker
              locked={sessionLive || mediaLoading}
              unlocks={mistressUnlocks}
              onSwitched={(pack) => {
                setDebriefContract(null);
                setFlash(`Доска ${pack.displayNameRu}`);
                window.setTimeout(() => setFlash(null), 2200);
                onMistressSwitched?.(pack);
              }}
            />
          </div>
          <div className="contracts-page__stats" aria-label="Статус доски">
            <span className="contracts-page__stat">
              <em>до обновления</em>
              <strong>{formatCountdown(left)}</strong>
            </span>
            <span className="contracts-page__stat">
              <em>открыто</em>
              <strong>{openCount}</strong>
            </span>
            <span className="contracts-page__stat">
              <em>угольки</em>
              <strong>{wallet.balance}</strong>
            </span>
          </div>
          {onSpend ? (
            <button
              type="button"
              className="contracts-page__reroll"
              disabled={!canReroll}
              title={
                canReroll
                  ? "Новая доска контрактов на сегодня"
                  : `Нужно ${CONTRACT_BOARD_REROLL_COST} угольков`
              }
              onClick={onRerollBoard}
            >
              Обновить · {CONTRACT_BOARD_REROLL_COST} ◆
            </button>
          ) : null}
        </div>

        {activeSeed ? (
          <p className="contracts-page__seed-banner is-sealed" role="status">
            <span className="contracts-page__seed-tag">
              {SESSION_SEAL_ACTIVE_TAG_RU}
            </span>
            <strong>{activeSeed.titleRu}</strong>
            {" · "}
            {sessionSeedLockLabelsRu(activeSeed).join(" · ") ||
              (isLiveGoalSessionSeed(activeSeed)
                ? `обязательство${
                    sessionSeedProgressLabelRu(activeSeed)
                      ? ` · ${sessionSeedProgressLabelRu(activeSeed)}`
                      : ""
                  }`
                : "условия")}
            {" · "}
            {contractVerificationBadgeRu(
              contractVerificationModeFromSeed(activeSeed),
            )}
            {" · "}
            {sealedFatePhraseForSeed(activeSeed, mistress.id)}
            {typeof activeSeed.performDeadlineMs === "number" ? (
              <>
                {" · "}
                <span
                  className={`contracts-page__seed-timer${
                    nowMs > activeSeed.performDeadlineMs
                      ? " is-overdue"
                      : ""
                  }`}
                >
                  {nowMs > activeSeed.performDeadlineMs
                    ? `⏱ просрочено ${formatCountdown(
                        nowMs - activeSeed.performDeadlineMs,
                      )} назад`
                    : `⏱ ${formatCountdown(
                        activeSeed.performDeadlineMs - nowMs,
                      )}`}
                </span>
              </>
            ) : null}
            <button
              type="button"
              className="contracts-page__seed-clear"
              onClick={onClearSeed}
            >
              {SESSION_SEAL_CANCEL_CTA_RU}
            </button>
          </p>
        ) : null}

        {flash ? (
          <p className="contracts-page__flash" role="status">
            {flash}
          </p>
        ) : null}
      </header>

      {mode === "editor" ? (
        <ContractEditorPage onBack={() => setMode("board")} />
      ) : (
      <>
      <div className="contracts-page__tabs" role="tablist">
        {filters.map((f) => (
          <button
            key={f.id}
            type="button"
            role="tab"
            aria-selected={filter === f.id}
            className={`contracts-page__tab ${filter === f.id ? "is-active" : ""}`}
            onClick={() => {
              void primeUiAudio();
              playUiNav();
              setFilter(f.id);
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      <ul className="contracts-page__list">
        {visible.map((c) => {
          const open = c.status === "open" && nowMs <= c.deadlineMs;
          const drill = isMediaDrillContract(c);
          const seedable = !drill && isSessionSeedableContract(c);
          const active =
            activeDrill?.instanceId === c.instanceId ? activeDrill : null;
          const seeded =
            activeSeed?.instanceId === c.instanceId ? activeSeed : null;
          const verifyMode = contractVerificationMode({
            contract: c,
            activeSeed,
            activeDrill,
          });
          const contractDef = getContractDef(c.defId);
          const hasTimer = Boolean(
            contractDef && contractDef.durationLimitMin != null,
          );
          const drillLeft = active
            ? mediaDrillRemainingMs(active, nowMs)
            : 0;
          const fromDebrief =
            pulseTitleRu != null && pulseTitleRu === c.titleRu;
          return (
            <li
              key={c.instanceId}
              className={`contracts-card contracts-card--${c.status}${seeded ? " contracts-card--seeded" : ""}${fromDebrief ? " contracts-card--from-debrief" : ""}`}
            >
              <div className="contracts-card__top">
                <span className="contracts-card__cat">
                  {categoryLabelRu(c.category)}
                </span>
                <span
                  className="contracts-card__diff"
                  title={`Сложность ${c.difficulty}`}
                >
                  {difficultyDots(c.difficulty)}
                </span>
                <span
                  className={`contracts-card__verify contracts-card__verify--${verifyMode}`}
                  title={contractVerificationTitleRu(verifyMode)}
                >
                  {contractVerificationBadgeRu(verifyMode)}
                </span>
                <span className={`contracts-card__status status-${c.status}`}>
                  {statusLabel(c)}
                </span>
                {isUserContract(c.defId) ? (
                  <span className="contracts-card__user-tag" title="Свой контракт — можно удалить в «Свои контракты»">
                    свой
                  </span>
                ) : null}
              </div>
              <h2 className="contracts-card__title">{c.titleRu}</h2>
              {contractBrief(c.defId) ? (
                <p className="contracts-card__brief">{contractBrief(c.defId)}</p>
              ) : null}
              <p className="contracts-card__body">{c.bodyRu}</p>
              {active ? (
                <p className="contracts-card__drill-timer">
                  Таймер drill: <strong>{formatCountdown(drillLeft)}</strong>
                  {mediaLoading ? " · загрузка кэша…" : ""}
                </p>
              ) : null}
              {seeded ? (
                <p className="contracts-card__seed-hint">
                  {verifyMode === "honor" && seeded.lockKeys.length === 0
                    ? "Контракт принят · "
                    : isLiveGoalSessionSeed(seeded) && seeded.lockKeys.length === 0
                    ? "Обязательство в сессии · "
                    : "Условия приняты · печать: "}
                  <strong>
                    {verifyMode === "honor" && seeded.lockKeys.length === 0
                      ? typeof seeded.performDeadlineMs === "number"
                        ? "таймер запущен"
                        : "на честности"
                      : sessionSeedLockLabelsRu(seeded).join(" · ") ||
                      (sessionSeedProgressLabelRu(seeded)
                        ? `шаг ${sessionSeedProgressLabelRu(seeded)}`
                        : "без барабанов")}
                  </strong>
                  {" · "}
                  {sealedFatePhraseForSeed(seeded, mistress.id)}
                  {" — "}
                  {contractVerificationCloseHintRu(verifyMode, seeded)}
                </p>
              ) : null}
              <div className="contracts-card__foot">
                <span className="contracts-card__reward">
                  {isFinishDebriefContract(c)
                    ? `до +${c.reward + finishDebriefMaxBonus(finishDebriefPresetFor(c))} ◆`
                    : `+${c.reward} угольков`}
                </span>
                {open ? (
                  <div className="contracts-card__actions">
                    {drill ? (
                      active ? (
                        <span className="contracts-card__hint">
                          Смотри в Сессии → «Доложить»
                        </span>
                      ) : (
                        <button
                          type="button"
                          className="contracts-card__btn contracts-card__btn--done"
                          onClick={() => onStartDrill(c)}
                          disabled={!onStartMediaDrill}
                        >
                          Начать
                        </button>
                      )
                    ) : null}
                    {seedable ? (
                      seeded ? (
                        <span className="contracts-card__hint">
                          {isLiveGoalSessionSeed(seeded) &&
                          seeded.lockKeys.length === 0
                            ? "Активно · жду в сессии"
                            : verifyMode === "honor"
                              ? "Принято · после выполнения нажми «Выполнил»"
                            : verifyMode === "timer"
                              ? "Таймер активен · проверит Conductor"
                              : "Печать активна · рулетка / сессия"}
                        </span>
                      ) : (
                        <button
                          type="button"
                          className="contracts-card__btn contracts-card__btn--done"
                          onClick={() => onStartSeed(c)}
                          disabled={!onStartSessionSeed}
                        >
                          {SESSION_SEAL_ACCEPT_CTA_RU}
                        </button>
                      )
                    ) : null}
                    {(!drill || !active) && (!seedable || seeded) ? (
                      <>
                        {/* The countdown sits immediately left of the report CTA. */}
                        {hasTimer &&
                        seeded &&
                        typeof seeded.performDeadlineMs === "number" ? (
                          <span
                            className={`contracts-card__timer${
                              nowMs > seeded.performDeadlineMs
                                ? " is-overdue"
                                : ""
                            }`}
                            title="Осталось времени на выполнение контракта"
                          >
                            {nowMs > seeded.performDeadlineMs
                              ? `⏱ ${formatCountdown(
                                  nowMs - seeded.performDeadlineMs,
                                )} назад`
                              : `⏱ ${formatCountdown(
                                  seeded.performDeadlineMs - nowMs,
                                )}`}
                          </span>
                        ) : null}
                        <button
                          type="button"
                          className={`contracts-card__btn ${
                            verifyMode === "honor" ||
                            verifyMode === "debrief"
                              ? "contracts-card__btn--done"
                              : "contracts-card__btn--ghost"
                          }`}
                          onClick={() => onReport(c.instanceId, "done")}
                        >
                          {contractHonorReportCtaRu(verifyMode)}
                        </button>
                      </>
                    ) : null}
                    <button
                      type="button"
                      className="contracts-card__btn contracts-card__btn--fail"
                      onClick={() => onReport(c.instanceId, "failed")}
                    >
                      Не смог
                    </button>
                  </div>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>

      {visible.length === 0 ? (
        <p className="contracts-page__empty">В этой категории сегодня пусто.</p>
      ) : null}

      {debriefContract ? (
        <ContractFinishDebriefSheet
          contract={debriefContract}
          onSubmit={onDebriefSubmit}
          onCancel={() => setDebriefContract(null)}
        />
      ) : null}
      {activityDebriefContract ? (
        <ActivityDebriefSheet
          contract={activityDebriefContract}
          onSubmit={onActivityDebriefSubmit}
          onCancel={() => setActivityDebriefContract(null)}
        />
      ) : null}
      </>
      )}
    </div>
  );
}
