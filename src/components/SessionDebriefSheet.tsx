import { MistressImg } from "./MistressImg";
import {
  debriefContractsCtaSubRu,
  formatDebriefDurationRu,
  shouldShowSessionContractsCta,
  type SessionDebrief,
  type SessionDebriefCtaId,
} from "../lib/sessionDebrief";
import { tasteChipRu } from "../lib/tasteLoopDisplay";
import { playUiClick, playUiConfirm, playUiNav, primeUiAudio } from "../lib/uiSound";

type Props = {
  debrief: SessionDebrief;
  onNavigate: (id: SessionDebriefCtaId) => void;
  onDismiss: () => void;
};

type CtaDef = {
  id: SessionDebriefCtaId;
  main: string;
  sub: string;
  primary?: boolean;
};

const BASE_CTAS: CtaDef[] = [
  {
    id: "diary",
    main: "Дневник",
    sub: "Сувенир и запись",
    primary: true,
  },
  {
    id: "achievements",
    main: "Ачивки",
    sub: "Что прокачалось",
  },
  {
    id: "shop",
    main: "Магазин",
    sub: "Потратить угольки",
  },
  {
    id: "roulette",
    main: "Рулетка",
    sub: "Ещё раз",
  },
];

function buildCtas(debrief: SessionDebrief): CtaDef[] {
  if (!shouldShowSessionContractsCta(debrief) || !debrief.contract) {
    return BASE_CTAS;
  }
  const contractsCta: CtaDef = {
    id: "contracts",
    main: "Контракты",
    sub: debriefContractsCtaSubRu(debrief.contract),
  };
  // After achievements — unlock-adjacent, before shop/roulette.
  return [
    BASE_CTAS[0]!,
    BASE_CTAS[1]!,
    contractsCta,
    BASE_CTAS[2]!,
    BASE_CTAS[3]!,
  ];
}

export function SessionDebriefSheet({
  debrief,
  onNavigate,
  onDismiss,
}: Props) {
  const go = (id: SessionDebriefCtaId) => {
    void primeUiAudio();
    playUiNav();
    onNavigate(id);
  };

  const tasteChip = tasteChipRu(debrief.likesCount ?? 0);
  const ctas = buildCtas(debrief);

  return (
    <div
      className="session-debrief"
      role="dialog"
      aria-modal="true"
      aria-label="Итог сессии"
      onClick={onDismiss}
    >
      <div
        className={`session-debrief__card is-${debrief.mood}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="session-debrief__glow" aria-hidden />

        <header className="session-debrief__head">
          <div className="session-debrief__titles">
            <p className="session-debrief__eyebrow">После сессии</p>
            <h2>{debrief.mistressNameRu} подвела итог</h2>
          </div>
          <span className={`session-debrief__mood is-${debrief.mood}`}>
            {debrief.moodLabelRu}
          </span>
        </header>

        <section className="session-debrief__verdict" aria-label="Приговор">
          <div className="session-debrief__portrait">
            <MistressImg
              className="session-debrief__portrait-img"
              src={debrief.portraitSrc}
              alt=""
            />
          </div>
          <div className="session-debrief__verdict-body">
            <p className="session-debrief__section-k">Её вердикт</p>
            <p className="session-debrief__verdict-text">{debrief.verdictRu}</p>
          </div>
        </section>

        <div className="session-debrief__hero" aria-label="Награды">
          <div className="session-debrief__stat">
            <span className="session-debrief__stat-k">Угольки</span>
            <span className="session-debrief__stat-v">
              {debrief.cindersEarned > 0
                ? `+${debrief.cindersEarned}`
                : "—"}
            </span>
          </div>
          <div className="session-debrief__stat">
            <span className="session-debrief__stat-k">Финал</span>
            <span className="session-debrief__stat-v">
              {debrief.finaleLabelRu}
            </span>
          </div>
          <div className="session-debrief__stat">
            <span className="session-debrief__stat-k">Время</span>
            <span className="session-debrief__stat-v">
              {formatDebriefDurationRu(debrief.elapsedSec)}
            </span>
          </div>
          <div className="session-debrief__stat">
            <span className="session-debrief__stat-k">Эджи</span>
            <span className="session-debrief__stat-v">{debrief.edgesDone}</span>
          </div>
        </div>

        {tasteChip ? (
          <p className="session-debrief__taste" aria-label="Вкус">
            <span className="session-debrief__taste-chip">{tasteChip}</span>
            <span className="session-debrief__taste-hint">
              лайки кормят ставки и полку
            </span>
          </p>
        ) : null}

        {debrief.unlocks.length > 0 ? (
          <section className="session-debrief__unlocks" aria-label="Открыто">
            <p className="session-debrief__section-k">Открылось</p>
            <ul className="session-debrief__chips">
              {debrief.unlocks.map((u, i) => (
                <li
                  key={`${u.kind}-${u.titleRu}-${i}`}
                  className={`session-debrief__chip is-${u.kind}`}
                  style={{ ["--chip-i" as string]: i }}
                >
                  <span>{u.titleRu}</span>
                  <strong>
                    {[u.detailRu, u.cinders != null ? `+${u.cinders}` : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </strong>
                </li>
              ))}
            </ul>
          </section>
        ) : (
          <p className="session-debrief__empty-unlocks">
            Запись в дневнике есть — ачивки и контракты без новых уровней.
          </p>
        )}

        <div className="session-debrief__actions">
          {ctas.map((cta) => (
            <button
              key={cta.id}
              type="button"
              className={
                cta.primary
                  ? "session-debrief__cta"
                  : "session-debrief__cta session-debrief__cta--ghost"
              }
              onClick={() => go(cta.id)}
            >
              <span className="session-debrief__cta-main">{cta.main}</span>
              <span className="session-debrief__cta-sub">{cta.sub}</span>
            </button>
          ))}
        </div>

        <button
          type="button"
          className="btn-ghost session-debrief__dismiss"
          onClick={() => {
            void primeUiAudio();
            playUiClick();
            onDismiss();
          }}
        >
          Остаться в сессии
        </button>

        <button
          type="button"
          className="session-debrief__close"
          aria-label="Закрыть"
          onClick={() => {
            void primeUiAudio();
            playUiConfirm();
            onDismiss();
          }}
        >
          ×
        </button>
      </div>
    </div>
  );
}
