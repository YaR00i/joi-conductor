import { useCallback, useEffect, useRef, useState } from "react";
import { EmberLootRoulette } from "../components/ember/EmberLootRoulette";
import { ScenePlayer } from "../components/ember/ScenePlayer";
import {
  createEmberGame,
  loadEmberPack,
  type EmberBridgeEvent,
  type EmberGameApi,
  type EmberLootOption,
  type EmberPack,
  type ValidationIssue,
} from "../game";

type Props = {
  onReward: (cinders: number) => void;
  onOpenEditor: () => void;
};

type LootModal = {
  kind: "level_up" | "chest";
  options: EmberLootOption[];
  targetId: string;
};

type ResultState = {
  outcome: "clear" | "fail";
  cinders: number;
  elapsedSec: number;
  killed: number;
  level: number;
  onClearEventId?: string;
  onFailEventId?: string;
};

function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function EmberPlayPage({ onReward, onOpenEditor }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<EmberGameApi | null>(null);
  const [pack, setPack] = useState<EmberPack | null>(null);
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [shortMode, setShortMode] = useState(true);
  const [running, setRunning] = useState(false);
  const [hud, setHud] = useState<Extract<EmberBridgeEvent, { type: "hud" }> | null>(
    null,
  );
  const [loot, setLoot] = useState<LootModal | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [result, setResult] = useState<ResultState | null>(null);
  const [sceneId, setSceneId] = useState<string | null>(null);
  const rewardedRef = useRef(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { pack: p, issues: iss } = await loadEmberPack();
      setPack(p);
      setIssues(iss);
    } catch (err) {
      setError(err instanceof Error ? err.message : "load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const stopGame = useCallback(() => {
    apiRef.current?.destroy();
    apiRef.current = null;
    setRunning(false);
    setLoot(null);
    setHud(null);
  }, []);

  useEffect(() => () => stopGame(), [stopGame]);

  const packRef = useRef(pack);
  packRef.current = pack;

  const onBridge = useCallback(
    (ev: EmberBridgeEvent) => {
      switch (ev.type) {
        case "hud":
          setHud(ev);
          break;
        case "level_up":
          setLoot({
            kind: "level_up",
            options: ev.options,
            targetId: ev.targetId,
          });
          break;
        case "chest":
          setLoot({
            kind: "chest",
            options: ev.options,
            targetId: ev.targetId,
          });
          break;
        case "stage_result":
          setResult({
            outcome: ev.outcome,
            cinders: ev.cinders,
            elapsedSec: ev.elapsedSec,
            killed: ev.killed,
            level: ev.level,
            onClearEventId: ev.onClearEventId,
            onFailEventId: ev.onFailEventId,
          });
          break;
        case "pending_event": {
          const p = packRef.current;
          const evDoc = p?.events[ev.eventId];
          if (evDoc) {
            setSceneId(evDoc.sceneId);
            setResult(null);
            stopGame();
          }
          break;
        }
        case "toast":
          setToast(ev.textRu);
          window.setTimeout(() => setToast(null), 1800);
          break;
        default: {
          const _n: never = ev;
          void _n;
        }
      }
    },
    [stopGame],
  );

  const start = () => {
    if (!pack || !hostRef.current) return;
    stopGame();
    setResult(null);
    setSceneId(null);
    rewardedRef.current = false;
    const stageId = pack.meta.defaultStageId;
    apiRef.current = createEmberGame({
      parent: hostRef.current,
      pack,
      stageId,
      onBridge,
      shortMode,
    });
    setRunning(true);
  };

  const takeLoot = (itemId: string) => {
    apiRef.current?.applyLoot(itemId);
    setLoot(null);
  };

  const claimResult = () => {
    if (!result || rewardedRef.current) return;
    rewardedRef.current = true;
    onReward(result.cinders);
    const eventId =
      result.outcome === "clear"
        ? result.onClearEventId
        : result.onFailEventId;
    if (eventId && pack) {
      const ev = pack.events[eventId];
      if (ev) {
        setSceneId(ev.sceneId);
        setResult(null);
        stopGame();
        return;
      }
    }
    setResult(null);
    stopGame();
  };

  const errors = issues.filter((i) => i.level === "error");
  const stageName =
    pack?.stages[pack.meta.defaultStageId]?.nameRu ?? "Загрузка…";
  const idle = !running && !sceneId;

  return (
    <div className="page page--ember">
      <nav className="ember-play-bar" aria-label="Ember Anomaly">
        <div
          className="ember-play-bar__brand"
          title="Vampire Survivors–арена · пиксель в бою · аниме в сценках"
        >
          Ember
          <span className="ember-play-bar__brand-sub">Anomaly</span>
        </div>

        {running && hud ? (
          <div className="ember-play-bar__live" aria-live="polite">
            <span>{fmtTime(hud.elapsedSec)}</span>
            <span className="ember-play-bar__sep">/</span>
            <span className="muted">{fmtTime(hud.durationSec)}</span>
            <span className="ember-play-bar__dot" aria-hidden>
              ·
            </span>
            <span>Lv {hud.level}</span>
          </div>
        ) : (
          <div className="ember-play-bar__status muted">
            {loading
              ? "Загрузка…"
              : error
                ? "Ошибка пака"
                : errors.length > 0
                  ? `${errors.length} ошибок`
                  : "Готово к забегу"}
          </div>
        )}

        <div className="ember-play-bar__actions">
          {running ? (
            <button
              type="button"
              className="ghost"
              onClick={() => {
                stopGame();
                setResult(null);
              }}
            >
              Стоп
            </button>
          ) : null}
          <button type="button" className="ghost" onClick={onOpenEditor}>
            Редактор
          </button>
          <button type="button" className="ghost" onClick={() => void reload()}>
            Reload
          </button>
        </div>
      </nav>

      {error ? <p className="ember-error">{error}</p> : null}
      {errors.length > 0 && idle ? (
        <div className="ember-validate ember-validate--error ember-play__errors">
          {errors.slice(0, 4).map((i) => (
            <div key={i.path + i.message}>
              {i.path}: {i.message}
            </div>
          ))}
          {errors.length > 4 ? (
            <div className="muted">…ещё {errors.length - 4}</div>
          ) : null}
        </div>
      ) : null}

      <div className="ember-play-shell">
        <div
          className={`ember-play__stage ${running ? "is-live" : ""} ${idle ? "is-idle" : ""}`}
          ref={hostRef}
        />

        {idle ? (
          <div className="ember-play__lobby">
            <div className="ember-play__lobby-card">
              <p className="ember-play__kicker muted">Забег</p>
              <h2 className="ember-play__stage-name">{stageName}</h2>
              <p className="muted ember-play__blurb">
                Движение WASD · атаки сами · XP и сундуки качают билд
              </p>

              <label className="ember-check ember-play__short">
                <input
                  type="checkbox"
                  checked={shortMode}
                  onChange={(e) => setShortMode(e.target.checked)}
                />
                Короткий режим (~90с)
              </label>

              <button
                type="button"
                className="primary ember-play__start"
                disabled={!pack || loading || errors.length > 0}
                onClick={start}
              >
                Начать
              </button>

              <ul className="muted ember-play__tips">
                <li>Слизь замедляет</li>
                <li>Урон оголяет (strip)</li>
                <li>Контент — в Редакторе</li>
              </ul>
            </div>
          </div>
        ) : null}

        {hud && running ? (
          <div className="ember-hud" aria-label="Статус боя">
            <div className="ember-hud__meter" title="HP">
              <span className="ember-hud__label">HP</span>
              <div className="ember-hud__bar">
                <div
                  className="ember-hud__bar-fill ember-hud__bar-fill--hp"
                  style={{
                    width: `${Math.max(0, Math.min(100, (hud.hp / Math.max(1, hud.maxHp)) * 100))}%`,
                  }}
                />
              </div>
              <span className="ember-hud__num">
                {Math.ceil(hud.hp)}/{hud.maxHp}
              </span>
            </div>
            <div className="ember-hud__meter" title="Опыт">
              <span className="ember-hud__label">XP</span>
              <div className="ember-hud__bar">
                <div
                  className="ember-hud__bar-fill ember-hud__bar-fill--xp"
                  style={{
                    width: `${Math.max(0, Math.min(100, (hud.xp / Math.max(1, hud.xpToLevel)) * 100))}%`,
                  }}
                />
              </div>
              <span className="ember-hud__num">
                {hud.xp}/{hud.xpToLevel}
              </span>
            </div>
            <span className="ember-hud__chip">Strip {hud.stripTier}</span>
            {hud.filthMs > 0 ? (
              <span className="ember-hud__chip ember-hud__filth">Filth</span>
            ) : null}
            <span className="ember-hud__chip">☠ {hud.killed}</span>
          </div>
        ) : null}
      </div>

      {toast ? <div className="ember-toast">{toast}</div> : null}

      {loot ? (
        <EmberLootRoulette
          titleRu={loot.kind === "chest" ? "Сундук" : "Level Up"}
          options={loot.options}
          targetId={loot.targetId}
          onDone={takeLoot}
        />
      ) : null}

      {result ? (
        <div className="ember-result" role="dialog">
          <div className="ember-result__card">
            <h2>{result.outcome === "clear" ? "Победа" : "Поражение"}</h2>
            <p className="muted">
              {fmtTime(result.elapsedSec)} · ур. {result.level} · убито{" "}
              {result.killed}
            </p>
            <p className="ember-result__cinders">+{result.cinders} угольков</p>
            <button type="button" className="primary" onClick={claimResult}>
              {result.outcome === "clear" && result.onClearEventId
                ? "Забрать и смотреть сцену"
                : "Забрать"}
            </button>
          </div>
        </div>
      ) : null}

      {sceneId && pack ? (
        <div className="ember-scene-host">
          <ScenePlayer
            pack={pack}
            sceneId={sceneId}
            onGrantCinders={onReward}
            onClose={() => setSceneId(null)}
          />
        </div>
      ) : null}
    </div>
  );
}
