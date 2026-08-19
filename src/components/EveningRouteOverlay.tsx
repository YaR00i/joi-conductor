import { useEffect, useState } from "react";
import {
  EVENING_ROUTE_STEPS,
  eveningRouteStepMeta,
  type EveningRouteStepId,
} from "../lib/eveningRoute";
import {
  getActiveMistress,
  subscribeActiveMistress,
  type MistressPack,
} from "../lib/mistress";
import type { MistressUnlockSnapshot } from "../lib/mistress/mistressUnlocks";
import { playUiClick, playUiConfirm, playUiNav, primeUiAudio } from "../lib/uiSound";
import type { NavId } from "./SideNav";
import { MistressImg } from "./MistressImg";
import { MistressPicker } from "./MistressPicker";
import { UiCheck } from "./UiCheck";

type Props = {
  onNavigate: (id: NavId) => void;
  onComplete: () => void;
  /** Close for this session only — flag stays pending. */
  onLater: () => void;
  /** Persist «не показывать снова». */
  onNeverAgain: () => void;
  onMistressSwitched?: (pack: MistressPack) => void;
  unlocks?: MistressUnlockSnapshot | null;
  sessionLive?: boolean;
};

export function EveningRouteOverlay({
  onNavigate,
  onComplete,
  onLater,
  onNeverAgain,
  onMistressSwitched,
  unlocks = null,
  sessionLive = false,
}: Props) {
  const [step, setStep] = useState<EveningRouteStepId>(1);
  const [docked, setDocked] = useState(false);
  const [mistress, setMistress] = useState(() => getActiveMistress());
  const [neverAgain, setNeverAgain] = useState(false);

  useEffect(() => {
    return subscribeActiveMistress((pack) => setMistress(pack));
  }, []);

  const meta = eveningRouteStepMeta(step);

  function goStep(next: EveningRouteStepId) {
    void primeUiAudio();
    playUiClick();
    setStep(next);
    if (next >= 2) setDocked(true);
  }

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
    setDocked(true);
    onNavigate(id);
  }

  return (
    <div
      className={`evening-route${docked ? " evening-route--dock" : ""}`}
      role="dialog"
      aria-modal={!docked}
      aria-label="Вечерний маршрут"
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
            <p className="evening-route__eyebrow">
              Вечерний маршрут · {step}/3
            </p>
            <h2>{meta.titleRu}</h2>
          </div>
          <div className="evening-route__portrait" aria-hidden>
            <MistressImg
              className="evening-route__portrait-img"
              src={mistress.assets.moodPortrait.calm.src}
              alt=""
            />
          </div>
        </header>

        <ol className="evening-route__rail" aria-label="Шаги">
          {EVENING_ROUTE_STEPS.map((s) => {
            const done = s.id < step;
            const active = s.id === step;
            return (
              <li
                key={s.id}
                className={`evening-route__rail-item${active ? " is-active" : ""}${done ? " is-done" : ""}`}
              >
                <span className="evening-route__rail-num" aria-hidden>
                  {done ? "◆" : s.id}
                </span>
                <span className="evening-route__rail-label">{s.labelRu}</span>
              </li>
            );
          })}
        </ol>

        <div className="evening-route__body">
          {step === 1 ? (
            <>
              <p className="evening-route__lead">
                Выбери Госпожу или оставь текущую —{" "}
                <strong>{mistress.displayNameRu}</strong>.
              </p>
              <MistressPicker
                variant="faces"
                locked={sessionLive}
                unlocks={unlocks}
                onSwitched={(pack) => {
                  setMistress(pack);
                  onMistressSwitched?.(pack);
                }}
              />
            </>
          ) : null}

          {step === 2 ? (
            <>
              <p className="evening-route__lead">
                На Рулетке сверху блок «Сегодня»: контракты, угольки, задания.
                Можно взять один контракт или просто глянуть и идти дальше.
              </p>
              <p className="evening-route__hint">
                Хочешь потренироваться без прогресса — в Настройках есть слот
                «Песочница».
              </p>
              <div className="evening-route__actions">
                <button
                  type="button"
                  className="evening-route__btn evening-route__btn--primary"
                  onClick={() => nav("roulette")}
                >
                  К «Сегодня» на рулетке
                </button>
                <button
                  type="button"
                  className="evening-route__btn evening-route__btn--ghost"
                  onClick={() => nav("contracts")}
                >
                  К контрактам
                </button>
              </div>
            </>
          ) : null}

          {step === 3 ? (
            <>
              <p className="evening-route__lead">
                Дай {mistress.displayNameRu} решить на Рулетке — или начни без
                колёс. На этом маршрут заканчивается: дальше хаб уже твой.
              </p>
              <div className="evening-route__actions">
                <button
                  type="button"
                  className="evening-route__btn evening-route__btn--primary"
                  onClick={() => {
                    nav("roulette");
                    finish();
                  }}
                >
                  К рулетке
                </button>
              </div>
            </>
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
            {step < 3 ? (
              <button
                type="button"
                className="evening-route__btn evening-route__btn--primary"
                onClick={() => {
                  if (step === 1) {
                    void primeUiAudio();
                    playUiNav();
                    onNavigate("roulette");
                    goStep(2);
                    return;
                  }
                  goStep(3);
                }}
              >
                Дальше
              </button>
            ) : (
              <button
                type="button"
                className="evening-route__btn evening-route__btn--primary"
                onClick={finish}
              >
                Готово
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}
