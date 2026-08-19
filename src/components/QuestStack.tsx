import { useEffect, useState } from "react";
import { getActiveMistress } from "../lib/mistress";
import { questUsesBeatCounter } from "../lib/quests";
import type { ActiveQuest, QuestOffer } from "../lib/types";
import {
  playUiConfirm,
  playUiDeny,
  primeUiAudio,
} from "../lib/uiSound";

type StackCard =
  | { kind: "offer"; offer: QuestOffer }
  | { kind: "pending"; quest: ActiveQuest }
  | { kind: "active"; quest: ActiveQuest };

/** Right-rail contract progress chip (~8s), distinct from quest cards. */
export type ContractProgressFlash = {
  key: number;
  titleRu: string;
  ruleRu: string;
  metaRu: string;
  reward: number;
};

/** Optional CBT-contract restyle for the active Done button. */
export type ContractQuestRestyle = {
  doneLabelRu: string;
  tagRu: string;
};

interface QuestStackProps {
  offer: QuestOffer | null | undefined;
  pending: ActiveQuest | null | undefined;
  active: ActiveQuest | null | undefined;
  onAccept: () => void;
  onDecline: () => void;
  onDone: () => void;
  onFail: () => void;
  /** Brief +N угольки burst after a quest payout. */
  rewardFlash?: { key: number; amount: number } | null;
  /** Live contract progress (ruin→eat etc.), different color from quests. */
  contractFlash?: ContractProgressFlash | null;
  /** CBT seal: restyle Done / tag on the active quest card. */
  contractQuestRestyle?: ContractQuestRestyle | null;
  /** Quest tag-cache prefetch after accept / while active. */
  mediaLoading?: boolean;
  cacheReady?: boolean;
}

function useQuestCountdown(endsAtPerf: number | undefined): number | null {
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    if (endsAtPerf == null) {
      setLeft(null);
      return;
    }
    const tick = () => {
      setLeft(Math.max(0, Math.ceil((endsAtPerf - performance.now()) / 1000)));
    };
    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [endsAtPerf]);
  return left;
}

function QuestCard({
  card,
  onAccept,
  onDecline,
  onDone,
  onFail,
  mediaLoading = false,
  cacheReady = false,
  contractQuestRestyle = null,
}: {
  card: StackCard;
  onAccept: () => void;
  onDecline: () => void;
  onDone: () => void;
  onFail: () => void;
  mediaLoading?: boolean;
  cacheReady?: boolean;
  contractQuestRestyle?: ContractQuestRestyle | null;
}) {
  const quest = card.kind === "offer" ? card.offer : card.quest;
  const endsAt = card.kind === "active" ? card.quest.endsAtPerf : undefined;
  const left = useQuestCountdown(endsAt);
  const counting =
    card.kind === "active" && questUsesBeatCounter(quest.exerciseKind);
  const showCache =
    mediaLoading &&
    Boolean(quest.mediaTags?.trim()) &&
    (card.kind === "pending" || card.kind === "active");
  const sealActive =
    card.kind === "active" && contractQuestRestyle != null;

  return (
    <article
      className={`quest-card quest-card--${card.kind}${
        counting ? " quest-card--counting" : ""
      }${showCache ? " is-caching" : ""}${
        sealActive ? " quest-card--contract-seal" : ""
      }`}
      aria-label={quest.nameRu}
    >
      <div className="quest-card__top">
        <span className="quest-card__tag">
          {sealActive
            ? contractQuestRestyle.tagRu
            : card.kind === "offer"
              ? "Задание"
              : card.kind === "pending"
                ? "Ждёт хода"
                : "Сейчас"}
        </span>
        <span className="quest-card__reward">
          {sealActive && quest.reward <= 0
            ? "печать"
            : `+${quest.reward} ◆`}
        </span>
      </div>
      <h3 className="quest-card__title">{quest.nameRu}</h3>
      <p className="quest-card__rule">{quest.ruleRu}</p>
      {quest.mediaLabelRu || quest.mediaTags ? (
        <p className="quest-card__media">
          Медиа: {quest.mediaLabelRu ?? quest.mediaTags}
        </p>
      ) : null}
      <div className="quest-card__meta">
        {card.kind === "active" && left != null ? (
          <span>{left}с</span>
        ) : (
          <span>~{quest.durationSec}с</span>
        )}
        {quest.targetBeats != null ? (
          <span>· цель {quest.targetBeats} бит</span>
        ) : null}
      </div>
      {card.kind === "offer" ? (
        <div className="quest-card__actions">
          <button
            type="button"
            className="quest-card__btn quest-card__btn--accept"
            onClick={() => {
              void primeUiAudio();
              playUiConfirm();
              onAccept();
            }}
          >
            Принять
          </button>
          <button
            type="button"
            className="quest-card__btn quest-card__btn--decline"
            onClick={() => {
              void primeUiAudio();
              playUiDeny();
              onDecline();
            }}
          >
            Отклонить
          </button>
        </div>
      ) : null}
      {card.kind === "pending" ? (
        <div className="quest-card__wait-block">
          <p className="quest-card__wait">Стартует после текущего хода</p>
          {showCache ? (
            <p className="quest-card__cache" aria-live="polite">
              <span className="quest-card__cache-dot" aria-hidden />
              Гружу кэш квеста…
            </p>
          ) : cacheReady && quest.mediaTags?.trim() ? (
            <p className="quest-card__cache quest-card__cache--ready">
              Кэш готов
            </p>
          ) : null}
        </div>
      ) : null}
      {card.kind === "active" ? (
        <div className="quest-card__actions">
          <button
            type="button"
            className="quest-card__btn quest-card__btn--accept"
            onClick={() => {
              void primeUiAudio();
              playUiConfirm();
              onDone();
            }}
          >
            {contractQuestRestyle?.doneLabelRu ?? "Сделал"}
          </button>
          <button
            type="button"
            className="quest-card__btn quest-card__btn--fail"
            onClick={() => {
              void primeUiAudio();
              playUiDeny();
              onFail();
            }}
          >
            Провал
          </button>
        </div>
      ) : null}
    </article>
  );
}

export function QuestStack({
  offer,
  pending,
  active,
  onAccept,
  onDecline,
  onDone,
  onFail,
  rewardFlash = null,
  contractFlash = null,
  contractQuestRestyle = null,
  mediaLoading = false,
  cacheReady = false,
}: QuestStackProps) {
  const cards: StackCard[] = [];
  if (active) cards.push({ kind: "active", quest: active });
  if (pending && pending.id !== active?.id) {
    cards.push({ kind: "pending", quest: pending });
  }
  if (offer) cards.push({ kind: "offer", offer });

  const showFlash = rewardFlash != null && rewardFlash.amount > 0;
  const showContract = contractFlash != null;
  if (cards.length === 0 && !showFlash && !showContract) return null;

  return (
    <div className="quest-stack" aria-label={`Задания ${getActiveMistress().displayNameRu}`}>
      {showContract ? (
        <article
          key={`contract-${contractFlash.key}`}
          className="quest-card quest-card--contract"
          role="status"
          aria-live="polite"
          aria-label={contractFlash.titleRu}
        >
          <div className="quest-card__top">
            <span className="quest-card__tag">Контракт</span>
            {contractFlash.reward > 0 ? (
              <span className="quest-card__reward">+{contractFlash.reward} ◆</span>
            ) : null}
          </div>
          <h3 className="quest-card__title">{contractFlash.titleRu}</h3>
          <p className="quest-card__rule">{contractFlash.ruleRu}</p>
          <div className="quest-card__meta">
            <span>{contractFlash.metaRu}</span>
          </div>
        </article>
      ) : null}
      {showFlash ? (
        <div
          key={`reward-${rewardFlash.key}`}
          className="quest-stack__reward-burst"
          role="status"
          aria-live="polite"
        >
          <span className="quest-stack__reward-burst-amt">
            +{rewardFlash.amount}
          </span>
          <span className="quest-stack__reward-burst-label">угольки</span>
        </div>
      ) : null}
      {cards.map((card) => (
        <QuestCard
          key={
            card.kind === "offer"
              ? `offer-${card.offer.id}`
              : `${card.kind}-${card.quest.id}`
          }
          card={card}
          onAccept={onAccept}
          onDecline={onDecline}
          onDone={onDone}
          onFail={onFail}
          mediaLoading={mediaLoading}
          cacheReady={cacheReady}
          contractQuestRestyle={
            card.kind === "active" ? contractQuestRestyle : null
          }
        />
      ))}
    </div>
  );
}
