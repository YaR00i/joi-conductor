import { useEffect, useRef, useState } from "react";
import { questUsesBeatCounter } from "../lib/quests";
import type { ActiveQuest } from "../lib/types";

interface QuestActiveHudProps {
  quest: ActiveQuest;
  /** Session beat pulse counter — increments each metronome hit. */
  pulse: number;
  mediaLoading?: boolean;
  /** Fired once when count/sync reaches targetBeats. */
  onTargetReached?: () => void;
}

/**
 * Full-stage quest focus HUD: shows while a bonus quest block is live.
 * Count/sync quests track metronome beats as motion reps.
 */
export function QuestActiveHud({
  quest,
  pulse,
  mediaLoading = false,
  onTargetReached,
}: QuestActiveHudProps) {
  const counting = questUsesBeatCounter(quest.exerciseKind);
  const [beats, setBeats] = useState(0);
  const lastPulseRef = useRef(pulse);
  const reachedRef = useRef(false);
  const onTargetRef = useRef(onTargetReached);
  onTargetRef.current = onTargetReached;

  useEffect(() => {
    setBeats(0);
    lastPulseRef.current = pulse;
    reachedRef.current = false;
    // Reset only when the quest offer id changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quest.id]);

  useEffect(() => {
    if (!counting) return;
    if (pulse === lastPulseRef.current) return;
    lastPulseRef.current = pulse;
    setBeats((n) => n + 1);
  }, [pulse, counting]);

  const target = quest.targetBeats;
  const done = target != null && beats >= target;

  useEffect(() => {
    if (!counting || !done || reachedRef.current) return;
    reachedRef.current = true;
    onTargetRef.current?.();
  }, [counting, done]);

  const progress =
    target != null && target > 0
      ? Math.min(100, Math.round((beats / target) * 100))
      : null;

  return (
    <div
      className={`quest-active-hud quest-active-hud--${quest.exerciseKind}${
        done ? " is-done" : ""
      }`}
      aria-live="polite"
    >
      <div className="quest-active-hud__glow" aria-hidden />
      <div className="quest-active-hud__top">
        <span className="quest-active-hud__badge">
          {done ? "Цель взята" : "Задание активно"}
        </span>
        {mediaLoading ? (
          <span className="quest-active-hud__loading">гружу кэш…</span>
        ) : quest.mediaLabelRu || quest.mediaTags ? (
          <span className="quest-active-hud__media">
            {quest.mediaLabelRu ?? "тег-кэш"}
          </span>
        ) : null}
      </div>
      <h2 className="quest-active-hud__title">{quest.nameRu}</h2>
      <p className="quest-active-hud__rule">{quest.ruleRu}</p>
      {counting ? (
        <div className="quest-active-hud__counter">
          <span className="quest-active-hud__count">{beats}</span>
          {target != null ? (
            <span className="quest-active-hud__target">/ {target}</span>
          ) : null}
          <span className="quest-active-hud__unit">битов</span>
        </div>
      ) : null}
      {progress != null ? (
        <div className="quest-active-hud__bar" aria-hidden>
          <div
            className="quest-active-hud__fill"
            style={{ width: `${progress}%` }}
          />
        </div>
      ) : null}
    </div>
  );
}
