import type { NavId } from "./SideNav";
import {
  tastePassportCtaHintRu,
  type TastePassportView,
  type TasteLoopCta,
} from "../lib/tasteLoopDisplay";
import { playUiNav, primeUiAudio } from "../lib/uiSound";

type Props = {
  view: TastePassportView;
  ctas?: TasteLoopCta[];
  onNavigate?: (id: NavId) => void;
  /** Compact strip for daily brief / hub — fewer chrome. */
  compact?: boolean;
  /** Masonry window vs shelf size, top-right on the card. */
  shelfLoadedLabel?: string;
};

function ctaToNav(id: TasteLoopCta["id"]): NavId {
  switch (id) {
    case "favorites":
      return "favorites";
    case "shop":
      return "shop";
    case "session":
      return "session";
    case "roulette":
      return "roulette";
    default: {
      const _exhaustive: never = id;
      return _exhaustive;
    }
  }
}

export function TastePassportPanel({
  view,
  ctas = [],
  onNavigate,
  compact = false,
  shelfLoadedLabel,
}: Props) {
  return (
    <section
      className={`taste-passport${compact ? " taste-passport--compact" : ""}`}
      aria-label={view.titleRu}
    >
      <header className="taste-passport__head">
        <div>
          <p className="taste-passport__kicker">{view.titleRu}</p>
          <p className="taste-passport__count">
            {view.likeCount > 0 ? (
              <>
                <em>{view.likeCount}</em> в избранном
              </>
            ) : (
              "Пока без лайков"
            )}
          </p>
        </div>
        {shelfLoadedLabel ? (
          <p className="taste-passport__shelf">{shelfLoadedLabel}</p>
        ) : null}
      </header>

      <p className="taste-passport__explain">{view.explanationRu}</p>

      {view.topTags.length > 0 ? (
        <ul className="taste-passport__tags" aria-label="Топ тегов вкуса">
          {view.topTags.map((t) => (
            <li key={t.tag} className="taste-passport__tag" title={`${t.count}×`}>
              <span>{t.label}</span>
              <em>{t.count}</em>
            </li>
          ))}
        </ul>
      ) : null}

      {ctas.length > 0 && onNavigate ? (
        <div className="taste-passport__cta-block">
          <div className="taste-passport__ctas">
            {ctas.map((cta) => (
              <button
                key={cta.id}
                type="button"
                className={`taste-passport__cta${
                  cta.ghost ? " taste-passport__cta--ghost" : ""
                }`}
                onClick={() => {
                  void primeUiAudio();
                  playUiNav();
                  onNavigate(ctaToNav(cta.id));
                }}
              >
                {cta.labelRu}
              </button>
            ))}
          </div>
          <p className="taste-passport__cta-hint">{tastePassportCtaHintRu()}</p>
        </div>
      ) : null}
    </section>
  );
}
