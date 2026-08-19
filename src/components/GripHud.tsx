import { GRIP_LABELS, type GripStrength } from "../lib/grip";

interface GripHudProps {
  grip: GripStrength;
  bpm: number;
}

export function GripHud({ grip, bpm }: GripHudProps) {
  const info = GRIP_LABELS[grip];
  return (
    <div className="grip-hud" title={info.descriptionRu}>
      <div className="grip-hud__label">Хват</div>
      <div className="grip-hud__value">{info.nameRu}</div>
      <div className="grip-hud__desc">{info.descriptionRu}</div>
      <div className="grip-hud__bpm">{bpm} bpm</div>
    </div>
  );
}
