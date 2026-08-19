import { ParamRoulette } from "./ParamRoulette";
import type { ActiveChoiceRoulette } from "../lib/types";

type Props = {
  roulette: ActiveChoiceRoulette;
  onSpinDone: () => void;
};

/**
 * Mid-session choice wheel — same predetermined-spin pattern as finale / param roulette.
 */
export function ChoiceRoulette({ roulette, onSpinDone }: Props) {
  const landed =
    roulette.options.find((o) => o.id === roulette.targetId) ??
    roulette.options[0];

  return (
    <div className="choice-overlay" role="dialog" aria-label={roulette.titleRu}>
      <ParamRoulette
        titleRu={roulette.titleRu}
        options={roulette.options.map((o) => ({
          id: o.id,
          labelRu: o.labelRu,
          weight: o.weight,
          color: o.color,
        }))}
        targetId={roulette.targetId}
        spinning={roulette.phase === "spinning"}
        onSpinDone={onSpinDone}
        stepIndex={0}
        stepTotal={1}
        landedLabel={
          roulette.phase === "revealed" ? (landed?.labelRu ?? null) : null
        }
      />
    </div>
  );
}
