import { useEffect, useMemo, useState } from "react";
import type { ContractInstance } from "../lib/contracts/dailyBoard";
import {
  finishDebriefComplete,
  finishDebriefMaxBonus,
  finishDebriefPresetFor,
  finishDebriefTitleRu,
  scoreFinishDebrief,
  visibleFinishDebriefQuestions,
  type FinishDebriefAnswers,
} from "../lib/contracts/finishDebrief";
import { playUiClick, playUiConfirm, primeUiAudio } from "../lib/uiSound";

type Props = {
  contract: ContractInstance;
  onSubmit: (answers: FinishDebriefAnswers) => void;
  onCancel: () => void;
};

export function ContractFinishDebriefSheet({
  contract,
  onSubmit,
  onCancel,
}: Props) {
  const preset = finishDebriefPresetFor(contract);
  const [answers, setAnswers] = useState<FinishDebriefAnswers>({});
  const [step, setStep] = useState(0);

  const visible = useMemo(
    () => visibleFinishDebriefQuestions(preset, answers),
    [preset, answers],
  );

  useEffect(() => {
    if (step > visible.length - 1) {
      setStep(Math.max(0, visible.length - 1));
    }
  }, [step, visible.length]);

  const current = visible[Math.min(step, Math.max(0, visible.length - 1))];
  const complete = finishDebriefComplete(preset, answers);
  const preview = scoreFinishDebrief(contract.reward, preset, answers);
  const maxBonus = finishDebriefMaxBonus(preset);
  const titleRu = finishDebriefTitleRu(preset);

  function selectOption(questionId: string, optionId: string) {
    void primeUiAudio();
    playUiClick();
    setAnswers((prev) => {
      const next: FinishDebriefAnswers = { ...prev, [questionId]: optionId };
      const keep = new Set(
        visibleFinishDebriefQuestions(preset, next).map((q) => q.id),
      );
      for (const key of Object.keys(next)) {
        if (!keep.has(key)) delete next[key];
      }
      return next;
    });
  }

  function goNext() {
    void primeUiAudio();
    if (step < visible.length - 1) {
      playUiClick();
      setStep((s) => s + 1);
      return;
    }
    if (!complete) return;
    playUiConfirm();
    onSubmit(answers);
  }

  function goBack() {
    void primeUiAudio();
    playUiClick();
    if (step <= 0) {
      onCancel();
      return;
    }
    setStep((s) => Math.max(0, s - 1));
  }

  if (!current) return null;

  const answeredCurrent = Boolean(answers[current.id]);
  const isLast = step >= visible.length - 1;

  return (
    <div
      className="finish-debrief"
      role="dialog"
      aria-modal="true"
      aria-label={titleRu}
      onClick={onCancel}
    >
      <div
        className="finish-debrief__card"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="finish-debrief__head">
          <p className="finish-debrief__eyebrow">Самоотчёт · финал</p>
          <h2 className="finish-debrief__title">{titleRu}</h2>
          <p className="finish-debrief__sub">
            {contract.titleRu} · база {contract.reward} ◆ · бонус до +{maxBonus}
          </p>
          <div
            className="finish-debrief__steps"
            aria-label={`Шаг ${step + 1} из ${visible.length}`}
          >
            {visible.map((q, i) => (
              <span
                key={q.id}
                className={`finish-debrief__dot${
                  i === step ? " is-active" : ""
                }${answers[q.id] ? " is-done" : ""}`}
              />
            ))}
          </div>
        </header>

        <section className="finish-debrief__body" aria-live="polite">
          <p className="finish-debrief__prompt">{current.promptRu}</p>
          <div className="finish-debrief__list" role="listbox">
            {current.options.map((opt) => {
              const active = answers[current.id] === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  role="option"
                  aria-selected={active}
                  className={`finish-debrief__option${active ? " is-active" : ""}`}
                  onClick={() => selectOption(current.id, opt.id)}
                >
                  <span className="finish-debrief__option-name">
                    {opt.labelRu}
                  </span>
                  {opt.hintRu ? (
                    <span className="finish-debrief__option-hint">
                      {opt.hintRu}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </section>

        <p
          className={`finish-debrief__preview is-${preview.tone}`}
          aria-live="polite"
        >
          {complete
            ? preview.summaryRu
            : `Пока ~${preview.rewarded} ◆ (ответь на все вопросы)`}
        </p>

        <div className="finish-debrief__actions">
          <button type="button" className="btn-ghost" onClick={goBack}>
            {step <= 0 ? "Отмена" : "Назад"}
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={!answeredCurrent || (isLast && !complete)}
            onClick={goNext}
          >
            {isLast ? "Закрыть контракт" : "Дальше"}
          </button>
        </div>
      </div>
    </div>
  );
}
