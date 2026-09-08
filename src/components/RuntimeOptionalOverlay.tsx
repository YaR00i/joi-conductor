import { useMemo, useState } from "react";
import { UiCheck } from "./UiCheck";
import type { RuntimeOptionalId, RuntimeOptionalOffer } from "../lib/runtimeOptionalOffers";
import { playUiClick, playUiConfirm, primeUiAudio } from "../lib/uiSound";
import "./runtimeBootstrap.css";

type Props = {
  offers: RuntimeOptionalOffer[];
  onConfirm: (selected: RuntimeOptionalId[]) => void;
  onSkip: () => void;
};

export function RuntimeOptionalOverlay({ offers, onConfirm, onSkip }: Props) {
  const initial = useMemo(() => {
    const next = new Set<RuntimeOptionalId>();
    for (const offer of offers) {
      if (offer.defaultOn) next.add(offer.id);
    }
    return next;
  }, [offers]);
  const [picked, setPicked] = useState(initial);

  function toggle(id: RuntimeOptionalId, on: boolean) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (id === "ollama-model" && on) next.add("ollama");
      if (id === "ollama" && !on) next.delete("ollama-model");
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function confirm() {
    void primeUiAudio();
    playUiConfirm();
    onConfirm([...picked]);
  }

  function skip() {
    void primeUiAudio();
    playUiClick();
    onSkip();
  }

  return (
    <div className="runtime-optional" role="dialog" aria-labelledby="runtime-optional-title">
      <div className="runtime-optional__card">
        <p className="runtime-optional__eyebrow">Первый запуск</p>
        <h2 id="runtime-optional-title">Нужен ли локальный ИИ?</h2>
        <p className="runtime-optional__lead">
          Голос и цензор уже ставятся сами. Ollama — отдельно: чат и живые реплики.
          Выбранное качается по очереди. Можно пропустить и скачать позже в
          Настройки → ИИ ресурсы.
        </p>
        <ul className="runtime-optional__list">
          {offers.map((offer) => (
            <li key={offer.id}>
              <UiCheck
                checked={picked.has(offer.id)}
                onChange={(on) => toggle(offer.id, on)}
              >
                <span className="runtime-optional__item">
                  <strong>{offer.titleRu}</strong>
                  <span>{offer.hintRu}</span>
                </span>
              </UiCheck>
            </li>
          ))}
        </ul>
        <div className="runtime-optional__acts">
          <button type="button" className="btn-ghost" onClick={skip}>
            Пропустить
          </button>
          <button type="button" className="btn-primary" onClick={confirm}>
            {picked.size ? "Скачать выбранное" : "Пропустить"}
          </button>
        </div>
      </div>
    </div>
  );
}
