import { useEffect, useState } from "react";
import {
  sectionBriefingCopy,
  type BriefableNavId,
} from "../lib/sectionBriefings";
import {
  getActiveMistress,
  subscribeActiveMistress,
} from "../lib/mistress";
import { playUiClick, playUiConfirm, playUiNav, primeUiAudio } from "../lib/uiSound";
import type { NavId } from "./SideNav";
import { MistressImg } from "./MistressImg";
import { UiCheck } from "./UiCheck";

type Props = {
  sectionId: BriefableNavId;
  onNavigate: (id: NavId) => void;
  onComplete: () => void;
  onLater: () => void;
  onNeverAgain: () => void;
};

export function SectionBriefingOverlay({
  sectionId,
  onNavigate,
  onComplete,
  onLater,
  onNeverAgain,
}: Props) {
  const copy = sectionBriefingCopy(sectionId);
  const [mistress, setMistress] = useState(() => getActiveMistress());
  const [neverAgain, setNeverAgain] = useState(false);

  useEffect(() => {
    return subscribeActiveMistress((pack) => setMistress(pack));
  }, []);

  function finish() {
    void primeUiAudio();
    playUiConfirm();
    if (neverAgain) onNeverAgain();
    else onComplete();
  }

  function dismissLater() {
    void primeUiAudio();
    playUiClick();
    if (neverAgain) onNeverAgain();
    else onLater();
  }

  function nav(id: NavId) {
    void primeUiAudio();
    playUiNav();
    onNavigate(id);
    finish();
  }

  return (
    <div
      className="evening-route evening-route--section"
      role="dialog"
      aria-modal="true"
      aria-label={copy.titleRu}
    >
      <div className="evening-route__card">
        <div className="evening-route__glow" aria-hidden />

        <button
          type="button"
          className="evening-route__close"
          aria-label="Закрыть"
          onClick={dismissLater}
        >
          ×
        </button>

        <header className="evening-route__head">
          <div className="evening-route__titles">
            <p className="evening-route__eyebrow">{copy.eyebrowRu}</p>
            <h2>{copy.titleRu}</h2>
          </div>
          <div className="evening-route__portrait" aria-hidden>
            <MistressImg
              className="evening-route__portrait-img"
              src={mistress.assets.moodPortrait.calm.src}
              alt=""
            />
          </div>
        </header>

        <div className="evening-route__body">
          <p className="evening-route__lead">{copy.leadRu}</p>
          {copy.hintRu ? (
            <p className="evening-route__hint">{copy.hintRu}</p>
          ) : null}
          {copy.ctas && copy.ctas.length > 0 ? (
            <div className="evening-route__actions">
              {copy.ctas.map((cta) => (
                <button
                  key={`${cta.nav}-${cta.labelRu}`}
                  type="button"
                  className={
                    cta.primary
                      ? "evening-route__btn evening-route__btn--primary"
                      : "evening-route__btn evening-route__btn--ghost"
                  }
                  onClick={() => nav(cta.nav)}
                >
                  {cta.labelRu}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <footer className="evening-route__foot">
          <UiCheck checked={neverAgain} onChange={setNeverAgain}>
            Не показывать снова
          </UiCheck>

          <div className="evening-route__foot-actions">
            <button
              type="button"
              className="evening-route__btn evening-route__btn--ghost"
              onClick={dismissLater}
            >
              Позже
            </button>
            <button
              type="button"
              className="evening-route__btn evening-route__btn--primary"
              onClick={finish}
            >
              Понятно
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
