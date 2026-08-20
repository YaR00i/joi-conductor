import { useEffect, useState } from "react";
import type { EmberLootOption } from "../../game/bridge/events";
import { ParamRoulette } from "../ParamRoulette";

type Props = {
  titleRu: string;
  options: EmberLootOption[];
  targetId: string;
  onDone: (itemId: string) => void;
};

export function EmberLootRoulette({
  titleRu,
  options,
  targetId,
  onDone,
}: Props) {
  const [phase, setPhase] = useState<"spinning" | "revealed">("spinning");
  const landed =
    options.find((o) => o.id === targetId) ?? options[0] ?? null;

  useEffect(() => {
    setPhase("spinning");
  }, [targetId, options]);

  return (
    <div
      className="ember-loot-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={titleRu}
    >
      <div className="ember-loot-card">
        <ParamRoulette
          titleRu={titleRu}
          options={options.map((o) => ({
            id: o.id,
            labelRu: o.labelRu,
            weight: o.weight,
            color: o.color,
          }))}
          targetId={targetId}
          spinning={phase === "spinning"}
          onSpinDone={() => setPhase("revealed")}
          stepIndex={0}
          stepTotal={1}
          landedLabel={phase === "revealed" ? (landed?.labelRu ?? null) : null}
        />
        {phase === "revealed" && landed ? (
          <button
            type="button"
            className="primary ember-loot-take"
            onClick={() => onDone(landed.itemId)}
          >
            Взять
          </button>
        ) : (
          <div className="ember-loot-take-slot" aria-hidden />
        )}
      </div>
    </div>
  );
}
