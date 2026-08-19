import type { InstructionCardModel } from "../lib/instructions";

interface InstructionPanelProps {
  card: InstructionCardModel | null;
}

export function InstructionPanel({ card }: InstructionPanelProps) {
  if (!card) return null;

  const rest =
    card.restRemainingSec != null && card.restTotalSec != null
      ? card.restRemainingSec
      : null;

  return (
    <aside className="instr-panel" aria-live="polite">
      <div className="instr-panel__goal">{card.goalRu}</div>
      <h2 className="instr-panel__title">{card.titleRu}</h2>
      <p className="instr-panel__summary">{card.summaryRu}</p>

      {rest != null ? (
        <div className="instr-panel__rest">
          <div className="instr-panel__rest-label">До конца отдыха</div>
          <div className="instr-panel__rest-time">{formatRest(rest)}</div>
          <div className="instr-panel__rest-bar">
            <div
              className="instr-panel__rest-fill"
              style={{
                width: `${Math.min(
                  100,
                  ((card.restTotalSec! - rest) / card.restTotalSec!) * 100,
                )}%`,
              }}
            />
          </div>
        </div>
      ) : null}

      {card.toysRu && card.toysRu.length > 0 ? (
        <>
          <div className="instr-panel__sec">Игрушки</div>
          <ul className="instr-panel__list">
            {card.toysRu.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </>
      ) : null}

      {card.stepsRu.length > 0 ? (
        <>
          <div className="instr-panel__sec">Как делать</div>
          <ul className="instr-panel__list">
            {card.stepsRu.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ul>
        </>
      ) : null}

      <div className="instr-panel__sec">Ритм · {card.patternTitleRu}</div>
      <p className="instr-panel__pattern">{card.patternBodyRu}</p>
    </aside>
  );
}

function formatRest(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}:${String(s).padStart(2, "0")}` : `${s}с`;
}
