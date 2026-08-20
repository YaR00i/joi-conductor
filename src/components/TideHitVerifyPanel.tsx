import { useEffect, useRef, useState } from "react";
import { TideHitLevelMeter } from "./TideHitMeter";
import { TideHitVerifyToggle } from "./TideHitVerifyToggle";
import {
  loadTideHitVerifySettings,
  saveTideHitVerifySettings,
  thresholdFromPeakDb,
  TIDE_HIT_THRESHOLD_MAX_DB,
  TIDE_HIT_THRESHOLD_MIN_DB,
  type TideHitVerifySettings,
} from "../lib/tideHitVerify";
import {
  startTideHitMic,
  tideHitMicStatusRu,
  type TideHitMicHandle,
  type TideHitMicStatus,
} from "../lib/tideHitMic";

export function TideHitVerifyPanel() {
  const [settings, setSettings] = useState<TideHitVerifySettings>(() =>
    loadTideHitVerifySettings(),
  );
  const [listening, setListening] = useState(false);
  const [micStatus, setMicStatus] = useState<TideHitMicStatus>("idle");
  const [micDetail, setMicDetail] = useState<string | undefined>();
  const [levelDb, setLevelDb] = useState(-80);
  const [peakDb, setPeakDb] = useState(-80);
  const [flash, setFlash] = useState(false);
  const handleRef = useRef<TideHitMicHandle | null>(null);
  const thresholdRef = useRef(settings.thresholdDb);
  thresholdRef.current = settings.thresholdDb;

  function persist(next: TideHitVerifySettings) {
    const saved = saveTideHitVerifySettings(next);
    setSettings(saved);
    handleRef.current?.setThresholdDb(saved.thresholdDb);
  }

  useEffect(() => {
    if (!listening) {
      handleRef.current?.stop();
      handleRef.current = null;
      setMicStatus("idle");
      setMicDetail(undefined);
      return;
    }
    const handle = startTideHitMic({
      thresholdDb: thresholdRef.current,
      onHit: () => {
        setFlash(true);
        window.setTimeout(() => setFlash(false), 180);
      },
      onLevel: (db) => {
        setLevelDb(db);
        setPeakDb((prev) => Math.max(prev, db));
      },
      onStatus: (status, detail) => {
        setMicStatus(status);
        setMicDetail(detail);
        if (status === "denied" || status === "error") {
          setListening(false);
        }
      },
    });
    handleRef.current = handle;
    return () => {
      handle.stop();
      if (handleRef.current === handle) handleRef.current = null;
    };
  }, [listening]);

  return (
    <div className="tide-verify-panel">
      <div className="tide-verify-panel__grid">
        <section className="tide-verify-panel__mode">
          <h3 className="brain-panel__h">Режим</h3>
          <TideHitVerifyToggle
            variant="brain"
            mode={settings.mode}
            onChange={(mode) => persist({ ...settings, mode })}
          />
        </section>

        <section className="tide-verify-panel__cal">
          <h3 className="brain-panel__h">Порог</h3>
          <label className="brain-field">
            <span className="field__label">
              Громкость · {settings.thresholdDb.toFixed(0)} дБ
            </span>
            <input
              type="range"
              min={TIDE_HIT_THRESHOLD_MIN_DB}
              max={TIDE_HIT_THRESHOLD_MAX_DB}
              step={1}
              value={settings.thresholdDb}
              onChange={(e) =>
                persist({
                  ...settings,
                  thresholdDb: Number(e.target.value),
                })
              }
            />
            <span className="field__hint">
              Левее — чувствительнее. Правее — только сильный шлепок.
            </span>
          </label>

          <TideHitLevelMeter
            db={listening ? levelDb : -80}
            thresholdDb={settings.thresholdDb}
            flash={flash}
          />

          <div className="brain-panel__links">
            <button
              type="button"
              className="brain-act"
              onClick={() => {
                setPeakDb(-80);
                setListening((v) => !v);
              }}
            >
              {listening ? "стоп" : "слушать"}
            </button>
            <button
              type="button"
              className="brain-act"
              disabled={!listening || peakDb < -70}
              onClick={() =>
                persist({
                  ...settings,
                  thresholdDb: thresholdFromPeakDb(peakDb),
                })
              }
            >
              порог по удару
            </button>
          </div>
        </section>
      </div>
      <p className="brain-panel__hint">
        {listening
          ? `${tideHitMicStatusRu(micStatus, micDetail)} · пик ${peakDb.toFixed(0)} дБ. Ударь и нажми «порог по удару».`
          : "В сессии на CBT / plapping тот же переключатель. Микрофон включается сам в режиме «Микрофон»."}
      </p>
    </div>
  );
}
