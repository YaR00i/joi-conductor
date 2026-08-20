import {
  dbToMeterRatio,
  TIDE_HIT_THRESHOLD_MIN_DB,
} from "../lib/tideHitVerify";

export function TideHitLevelMeter({
  db,
  thresholdDb,
  flash,
}: {
  db: number;
  thresholdDb: number;
  flash?: boolean;
}) {
  const level = dbToMeterRatio(db);
  const mark = dbToMeterRatio(thresholdDb);
  return (
    <div
      className={"tide-hit-meter" + (flash ? " is-hit" : "")}
      role="meter"
      aria-valuemin={TIDE_HIT_THRESHOLD_MIN_DB}
      aria-valuemax={0}
      aria-valuenow={Math.round(db)}
      aria-label="Громкость микрофона"
    >
      <div className="tide-hit-meter__fill" style={{ width: `${level * 100}%` }} />
      <div
        className="tide-hit-meter__mark"
        style={{ left: `${mark * 100}%` }}
        title={`порог ${thresholdDb.toFixed(0)} дБ`}
      />
    </div>
  );
}
