import { useEffect, useState } from "react";
import {
  MediaCensorCoverageSeg,
  MediaCensorDetectSeg,
  MediaCensorOnOffSeg,
  MediaCensorPartsRow,
  MediaCensorStyleSeg,
  MediaCensorToggle,
} from "./MediaCensorToggle";
import {
  clearMediaCensorLock,
  formatMediaCensorPenisHole,
  loadMediaCensorLive,
  MEDIA_CENSOR_LOAD_TAUNTS,
  MEDIA_CENSOR_PENIS_HOLE_MAX,
  MEDIA_CENSOR_PENIS_HOLE_MIN,
  MEDIA_CENSOR_PENIS_HOLE_STEP,
  patchMediaCensorSettings,
  pickMediaCensorLoadTaunt,
  setMediaCensorEnabled,
  subscribeMediaCensor,
  type MediaCensorLive,
} from "../lib/mediaCensor";
import { subscribeCensorDetectRuntime } from "../lib/mediaCensorDetect";
import { warmupCensorDetect } from "../lib/mediaCensorYolox";

function shortRemoteError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  return raw.replace(/^Error invoking remote method '[^']+': (?:Error:\s*)?/, "");
}

function CensorHead({
  label,
  hint,
}: {
  label: string;
  hint: string;
}) {
  return (
    <span className="media-censor-head">
      <span className="field__label">{label}</span>
      <button
        type="button"
        className="media-censor-i"
        title={hint}
        aria-label={hint}
      >
        i
      </button>
    </span>
  );
}

export function MediaCensorPanel() {
  const [live, setLive] = useState<MediaCensorLive>(() => loadMediaCensorLive());
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ phase: string; pct: number } | null>(
    null,
  );
  const [runtime, setRuntime] = useState<string | null>(null);
  const [logLines, setLogLines] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [tauntOffset, setTauntOffset] = useState(0);

  useEffect(() => subscribeMediaCensor(() => setLive(loadMediaCensorLive())), []);

  useEffect(() => {
    const unsub = window.joiDesktop?.media?.onCensorDetectProgress?.((p) => {
      setProgress({ phase: p.phase, pct: p.pct });
    });
    return () => {
      unsub?.();
    };
  }, []);

  useEffect(
    () =>
      subscribeCensorDetectRuntime((state) => {
        setRuntime(state.detail);
        if (state.logLine) {
          setLogLines((prev) => [state.logLine!, ...prev].slice(0, 12));
        }
      }),
    [],
  );

  function persistEnabled(on: boolean) {
    setLive(setMediaCensorEnabled(on));
  }

  async function persistDetect(on: boolean) {
    if (!on) {
      setError(null);
      setProgress(null);
      setRuntime(null);
      setLogLines([]);
      setLive({
        ...live,
        settings: patchMediaCensorSettings({ detect: false }),
      });
      return;
    }
    setBusy(true);
    setError(null);
    setProgress({ phase: "Готовлю аниме…", pct: 1 });
    try {
      setRuntime(null);
      await warmupCensorDetect((p) => setProgress(p));
      setLive({
        ...live,
        settings: patchMediaCensorSettings({ detect: true }),
      });
      setProgress(null);
    } catch (err) {
      setError(shortRemoteError(err));
      setProgress(null);
    } finally {
      setBusy(false);
    }
  }

  const showParts =
    live.settings.coverage === "bands" || live.settings.detect;
  const detectOn =
    live.settings.detect && live.settings.coverage !== "full";

  return (
    <div className="media-censor-panel">
      <div className="media-censor-panel__grid">
        <section className="media-censor-card">
          <CensorHead
            label="Кадр"
            hint="Главный рубильник. Работает на сцене сессии. Госпожа может включить из чата и запретить снимать до конца сессии — тогда снять можно только здесь."
          />
          <MediaCensorToggle
            variant="brain"
            active={live.active}
            locked={live.lock.locked}
            onChange={persistEnabled}
          />
          {live.lock.locked ? (
            <div className="brain-panel__links">
              <button
                type="button"
                className="brain-act"
                onClick={() => setLive(clearMediaCensorLock())}
              >
                снять запрет госпожи
              </button>
            </div>
          ) : null}
        </section>

        <section className="media-censor-card">
          <CensorHead
            label="Вид"
            hint="Мозаика — крупные пиксели. Размытие — смазать. Плашки — чёрные прямоугольники. Надпись — слово «цензура» на пятне. Сила 1–5: крупнее пиксель, сильнее блюр, шире плашки."
          />
          <MediaCensorStyleSeg
            style={live.settings.style}
            onChange={(style) =>
              setLive({
                ...live,
                settings: patchMediaCensorSettings({ style }),
              })
            }
          />
          <div className="brain-field">
            <span className="field__label">
              Сила · {live.settings.strength}
            </span>
            <input
              type="range"
              min={1}
              max={5}
              step={1}
              value={live.settings.strength}
              onChange={(e) =>
                setLive({
                  ...live,
                  settings: patchMediaCensorSettings({
                    strength: Number(e.target.value),
                  }),
                })
              }
            />
          </div>
        </section>

        <section className="media-censor-card media-censor-card--wide">
          <CensorHead
            label="Что закрывать"
            hint="Зоны — только выбранные части. Кадр — весь слайд мозаикой; слежение всё равно ловит член для дырки. На видео и гифках всегда полный блюр. Наведи на чип — что ловит."
          />
          <MediaCensorCoverageSeg
            coverage={live.settings.coverage}
            onChange={(coverage) =>
              setLive({
                ...live,
                settings: patchMediaCensorSettings({ coverage }),
              })
            }
          />
          {showParts ? (
            <>
              <MediaCensorPartsRow
                parts={live.settings.parts}
                onChange={(part, on) =>
                  setLive({
                    ...live,
                    settings: patchMediaCensorSettings({
                      parts: { ...live.settings.parts, [part]: on },
                    }),
                  })
                }
              />
              {!live.settings.parts.penis ? (
                <div className="brain-field">
                  <CensorHead
                    label={`Дырка члена · ${formatMediaCensorPenisHole(live.settings.penisHole)}`}
                    hint="Пока «Член» выкл, сеть вырезает ствол из мозаики паха. На наклоне дырка крутится по стволу при слежении — смени слайд, чтобы пересчитать. 1 — почти по контуру. 5 — широкий запас. Шаг 0,1."
                  />
                  <input
                    type="range"
                    min={MEDIA_CENSOR_PENIS_HOLE_MIN}
                    max={MEDIA_CENSOR_PENIS_HOLE_MAX}
                    step={MEDIA_CENSOR_PENIS_HOLE_STEP}
                    value={
                      Number.isFinite(live.settings.penisHole)
                        ? live.settings.penisHole
                        : 2
                    }
                    onChange={(e) =>
                      setLive({
                        ...live,
                        settings: patchMediaCensorSettings({
                          penisHole: Number(e.target.value),
                        }),
                      })
                    }
                  />
                </div>
              ) : null}
            </>
          ) : null}
        </section>

        <section className="media-censor-card">
          <CensorHead
            label="Слежение"
            hint="На фото ищет части нейросетью (один прогон на слайд). Тело качается сразу. Руки и позы — отдельно, ~56 МБ; если не вышло, грудь и пах всё равно ловятся. На «Кадр» сеть нужна для дырки члена."
          />
          <MediaCensorDetectSeg
            detect={live.settings.detect}
            busy={busy}
            onChange={(on) => {
              void persistDetect(on);
            }}
          />
          {detectOn ? (
            <>
              <CensorHead
                label="Если сеть промахнулась"
                hint="Вкл: добить широкой полоской типичного кадра. Выкл: только пятна, которые нашла сеть."
              />
              <MediaCensorOnOffSeg
                ariaLabel="Если сеть промахнулась"
                value={live.settings.bandsFallback}
                onSub="добить зоной"
                offSub="только сеть"
                onChange={(on) =>
                  setLive({
                    ...live,
                    settings: patchMediaCensorSettings({ bandsFallback: on }),
                  })
                }
              />
            </>
          ) : null}
          {progress ? (
            <span className="field__hint">
              {progress.phase} · {progress.pct}%
            </span>
          ) : null}
          {error ? (
            <span className="field__hint media-censor-panel__err">
              Не скачалось: {error}. Остались обычные зоны.
            </span>
          ) : null}
          {runtime && !progress && !error ? (
            <span className="field__hint">{runtime}</span>
          ) : null}
          {logLines.length > 0 ? (
            <pre className="media-censor-panel__log">{logLines.join("\n")}</pre>
          ) : null}
        </section>

        <section className="media-censor-card">
          <CensorHead
            label="Пока грузится"
            hint="Пока новый слайд не закрыт, кадр блюрится, чтобы голое не мелькнуло. Вкл — ещё обидная фраза поверх."
          />
          <MediaCensorOnOffSeg
            ariaLabel="Надпись при загрузке"
            value={live.settings.loadTaunt}
            onSub="фраза"
            offSub="тихий блюр"
            onChange={(on) =>
              setLive({
                ...live,
                settings: patchMediaCensorSettings({ loadTaunt: on }),
              })
            }
          />
          {live.settings.loadTaunt ? (
            <div className="media-censor-panel__taunt">
              <span className="field__hint">
                {pickMediaCensorLoadTaunt("preview", tauntOffset)}
              </span>
              <button
                type="button"
                className="brain-act"
                onClick={() =>
                  setTauntOffset((n) => (n + 1) % MEDIA_CENSOR_LOAD_TAUNTS.length)
                }
              >
                другая фраза
              </button>
            </div>
          ) : null}
        </section>
      </div>
      {live.lock.locked ? (
        <p className="brain-panel__hint">
          Госпожа закрыла кадр. В сессии выключатель не снять — только здесь
          или если она скажет открыть.
        </p>
      ) : null}
    </div>
  );
}
