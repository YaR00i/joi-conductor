import { MistressImg } from "./MistressImg";
import {
  abortDiaryStatusRu,
  formatDebriefDurationRu,
  shouldShowAbortContractsCta,
  type AbortDebrief,
  type AbortDebriefCtaId,
} from "../lib/sessionDebrief";
import { playUiClick, playUiConfirm, playUiNav, primeUiAudio } from "../lib/uiSound";

type Props = {
  debrief: AbortDebrief;
  onNavigate: (id: AbortDebriefCtaId) => void;
  onDismiss: () => void;
};

type CtaDef = {
  id: AbortDebriefCtaId;
  main: string;
  sub: string;
  primary?: boolean;
};

const BASE_CTAS: CtaDef[] = [
  {
    id: "diary",
    main: "Дневник",
    sub: "Прошлые записи",
  },
  {
    id: "roulette",
    main: "Рулетка",
    sub: "Начать заново",
    primary: true,
  },
];

function buildCtas(debrief: AbortDebrief): CtaDef[] {
  if (!shouldShowAbortContractsCta(debrief)) return BASE_CTAS;
  // Quiet ghost between diary and roulette — only when a contract failed.
  return [
    BASE_CTAS[0]!,
    {
      id: "contracts",
      main: "Контракты",
      sub: "Провал на доске",
    },
    BASE_CTAS[1]!,
  ];
}

export function AbortDebriefSheet({
  debrief,
  onNavigate,
  onDismiss,
}: Props) {
  const go = (id: AbortDebriefCtaId) => {
    void primeUiAudio();
    playUiNav();
    onNavigate(id);
  };

  const ctas = buildCtas(debrief);

  return (
    <div
      className="session-debrief session-debrief--abort"
      role="dialog"
      aria-modal="true"
      aria-label="Сессия прервана"
      onClick={onDismiss}
    >
      <div
        className={`session-debrief__card session-debrief__card--abort is-${debrief.mood}`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="session-debrief__head">
          <div className="session-debrief__titles">
            <p className="session-debrief__eyebrow">Сессия прервана</p>
            <h2>{debrief.mistressNameRu} остановила</h2>
          </div>
          <span className={`session-debrief__mood is-${debrief.mood}`}>
            {debrief.moodLabelRu}
          </span>
        </header>

        <section className="session-debrief__verdict" aria-label="Заметка">
          <div className="session-debrief__portrait">
            <MistressImg
              className="session-debrief__portrait-img"
              src={debrief.portraitSrc}
              alt=""
            />
          </div>
          <div className="session-debrief__verdict-body">
            <p className="session-debrief__section-k">Тихий стоп</p>
            <p className="session-debrief__verdict-text">{debrief.noteRu}</p>
          </div>
        </section>

        <div className="session-debrief__hero session-debrief__hero--abort" aria-label="Что успело">
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
          <div className="session-debrief__stat">
            <span className="session-debrief__stat-k">Руины</span>
            <span className="session-debrief__stat-v">{debrief.ruinsDone}</span>
          </div>
          <div className="session-debrief__stat">
            <span className="session-debrief__stat-k">Квест ◆</span>
            <span className="session-debrief__stat-v">
              {debrief.clawQuestCinders > 0
                ? `−${debrief.clawQuestCinders}`
                : "—"}
            </span>
          </div>
        </div>

        <p className="session-debrief__abort-note">
          {abortDiaryStatusRu(debrief.diaryRecorded)}
          {debrief.clawQuestCinders > 0
            ? ` · угольки квеста сняты (−${debrief.clawQuestCinders})`
            : ""}
          {debrief.contractFailedTitleRu
            ? ` · контракт «${debrief.contractFailedTitleRu}» провален`
            : ""}
        </p>

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
