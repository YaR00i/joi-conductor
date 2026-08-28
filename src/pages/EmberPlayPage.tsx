import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EmberLootRoulette } from "../components/ember/EmberLootRoulette";
import {
  EmberInventoryPanel,
  type EmberInventoryPanelState,
} from "../components/ember/EmberInventoryPanel";
import {
  EmberShopPanel,
  type EmberShopPanelState,
} from "../components/ember/EmberShopPanel";
import { ScenePlayer } from "../components/ember/ScenePlayer";
import { EmberSavePanel } from "../components/ember/EmberSavePanel";
import { EmberCameraRigFields } from "../components/ember/editor/EmberCameraRigFields";
import { PlayHubChrome } from "../components/HubChrome";
import type { NavId } from "../components/SideNav";
import type { EmberMapCamera, EmberUserCameraPreset } from "../game/content/types";
import type {
  EmberBridgeEvent,
  EmberGameApi,
  EmberLootOption,
} from "../game/bridge/events";
import { loadEmberPack, upsertCameraPresets } from "../game/content/loadPack";
import { writeEmberJson } from "../game/content/io";
import { camerasFileFromPresets } from "../game/content/cameraPresets";
import { resolveMapPlayProfile } from "../game/content/playProfile";
import {
  createLocalStorageSaveBackend,
  getActiveExploreSaveSlot,
  readExploreSave,
  writeExploreSave,
  type EmberExploreAutosaveReason,
} from "../game/content/emberSave";
import type {
  EmberPack,
  ValidationIssue,
} from "../game/content/types";
import { createEmberThreeGame } from "../game/three/createEmberThreeGame";
import { requestPlayPointerLock } from "../game/three/playPointer";

type Props = {
  onReward: (cinders: number) => void;
  onOpenEditor: () => void;
  onNavigate?: (id: NavId) => void;
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
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function toggleEmberPlayFullscreen(): void {
  const desktop = window.joiDesktop;
  if (desktop?.toggleFullScreen) {
    void desktop.toggleFullScreen();
    return;
  }
  if (!document.fullscreenElement) {
    void document.documentElement.requestFullscreen?.();
    return;
  }
  void document.exitFullscreen?.();
}

export function EmberPlayPage({ onReward, onOpenEditor, onNavigate }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<EmberGameApi | null>(null);
  const [pack, setPack] = useState<EmberPack | null>(null);
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [engineLoading, setEngineLoading] = useState(false);
  const [loadProgress, setLoadProgress] = useState({
    ratio: 0.04,
    labelRu: "Движок…",
  });
  const [shortMode, setShortMode] = useState(true);
  const [stageId, setStageId] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [hud, setHud] = useState<Extract<EmberBridgeEvent, { type: "hud" }> | null>(
    null,
  );
  const [loot, setLoot] = useState<LootModal | null>(null);
  const [shop, setShop] = useState<EmberShopPanelState | null>(null);
  const [inventory, setInventory] = useState<EmberInventoryPanelState | null>(
    null,
  );
  const [toast, setToast] = useState<string | null>(null);
  const [result, setResult] = useState<ResultState | null>(null);
  const [sceneId, setSceneId] = useState<string | null>(null);
  const [playDialogueId, setPlayDialogueId] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [playCamera, setPlayCamera] = useState<EmberMapCamera | undefined>();
  const [saveDebugOpen, setSaveDebugOpen] = useState(false);
  const [relockAtMs, setRelockAtMs] = useState(0);
  const [nowMs, setNowMs] = useState(0);
  const rewardedRef = useRef(false);
  const engineRequestRef = useRef(0);
  const startingRef = useRef(false);
  const saveBackend = useMemo(() => createLocalStorageSaveBackend(), []);
  const pendingPlayRemountPackRef = useRef<EmberPack | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    const remountPlay = apiRef.current != null || startingRef.current;
    try {
      const { pack: p, issues: iss } = await loadEmberPack();
      setPack(p);
      setIssues(iss);
      setStageId((prev) => {
        if (prev && p.stages[prev]) return prev;
        return p.meta.defaultStageId;
      });
      if (remountPlay) pendingPlayRemountPackRef.current = p;
    } catch (err) {
      setError(err instanceof Error ? err.message : "load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  const persistPlayCameraPresets = useCallback(
    async (next: Record<string, EmberUserCameraPreset>, msg: string) => {
      if (!pack) return;
      const res = await writeEmberJson(
        "cameras/registry.json",
        camerasFileFromPresets(next),
      );
      if (!res.ok) {
        setToast(res.error || "Не удалось сохранить пресеты камеры");
        window.setTimeout(() => setToast(null), 1800);
        return;
      }
      setPack(upsertCameraPresets(pack, next));
      setToast(msg);
      window.setTimeout(() => setToast(null), 1800);
    },
    [pack],
  );

  useEffect(() => {
    void reload();
  }, [reload]);

  const stopGame = useCallback(() => {
    engineRequestRef.current += 1;
    apiRef.current?.destroy();
    apiRef.current = null;
    setRunning(false);
    setLoot(null);
    setShop(null);
    setInventory(null);
    setPlayDialogueId(null);
    setHud(null);
    setMenuOpen(false);
    setSaveDebugOpen(false);
  }, []);

  useEffect(() => () => stopGame(), [stopGame]);

  useEffect(() => {
    if (!menuOpen) return;
    if (performance.now() >= relockAtMs) {
      setNowMs(relockAtMs);
      return;
    }
    const id = window.setInterval(() => {
      const now = performance.now();
      setNowMs(now);
      if (now >= relockAtMs) window.clearInterval(id);
    }, 100);
    return () => window.clearInterval(id);
  }, [menuOpen, relockAtMs]);

  const packRef = useRef(pack);
  packRef.current = pack;

  const persistExplore = useCallback(
    (reason: EmberExploreAutosaveReason) => {
      const p = packRef.current;
      if (!p) return;
      const blob = apiRef.current?.captureExploreSave();
      if (!blob) return;
      const slot = getActiveExploreSaveSlot(saveBackend, p.meta.id);
      writeExploreSave(saveBackend, {
        ...blob,
        packId: p.meta.id,
        slot,
        savedAtMs: Date.now(),
      });
      void reason;
    },
    [saveBackend],
  );

  useEffect(() => {
    const onLeave = () => persistExplore("quit");
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [persistExplore]);

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
        case "load_progress":
          setLoadProgress({ ratio: ev.ratio, labelRu: ev.labelRu });
          break;
        case "pause_menu":
          setMenuOpen(true);
          setRelockAtMs(performance.now() + ev.relockWaitMs);
          setNowMs(performance.now());
          break;
        case "shop":
          setPlayDialogueId(null);
          setShop({
            shopId: ev.shopId,
            nameRu: ev.nameRu,
            wallet: ev.wallet,
            listings: ev.listings,
            sellable: ev.sellable,
            errorRu: ev.errorRu,
          });
          break;
        case "shop_close":
          setShop(null);
          break;
        case "inventory":
          setInventory({
            items: ev.items,
            equipment: ev.equipment,
            atk: ev.atk,
            def: ev.def,
            arenaAtk: ev.arenaAtk,
            errorRu: ev.errorRu,
          });
          break;
        case "inventory_close":
          setInventory(null);
          break;
        case "dialogue":
          setPlayDialogueId(ev.sceneId);
          break;
        case "explore_autosave":
          persistExplore(ev.reason);
          break;
        default: {
          const _n: never = ev;
          void _n;
        }
      }
    },
    [stopGame, persistExplore],
  );

  const startWithPack = useCallback(
    async (nextPack: EmberPack) => {
      const host = hostRef.current;
      if (!nextPack || !host) return;
      const shell = host.parentElement;
      requestPlayPointerLock(shell instanceof HTMLElement ? shell : host);
      stopGame();
      startingRef.current = true;
      const requestId = engineRequestRef.current;
      setResult(null);
      setSceneId(null);
      setPlayDialogueId(null);
      setPlayCamera(undefined);
      rewardedRef.current = false;
      setEngineLoading(true);
      setLoadProgress({ ratio: 0.04, labelRu: "Движок…" });
      setError(null);
      try {
        if (
          requestId !== engineRequestRef.current ||
          !hostRef.current
        ) {
          return;
        }
        const stageIdToStart =
          stageId && nextPack.stages[stageId]
            ? stageId
            : nextPack.meta.defaultStageId;
        const startStage = nextPack.stages[stageIdToStart];
        const startMap = startStage ? nextPack.maps[startStage.mapId] : undefined;
        const exploreRun =
          startMap != null && resolveMapPlayProfile(startMap) === "explore";
        const exploreSave = exploreRun
          ? readExploreSave(
              saveBackend,
              nextPack.meta.id,
              getActiveExploreSaveSlot(saveBackend, nextPack.meta.id),
            )
          : null;
        const api = createEmberThreeGame({
          parent: hostRef.current,
          pack: nextPack,
          stageId: stageIdToStart,
          onBridge,
          shortMode: exploreRun ? false : shortMode,
          exploreSave,
        });
        apiRef.current = api;
        api.lockLook();
        await api.ready;
        if (
          requestId !== engineRequestRef.current ||
          apiRef.current !== api
        ) {
          api.destroy();
          return;
        }
        api.lockLook();
        setRunning(true);
      } catch (err) {
        if (requestId !== engineRequestRef.current) return;
        setError(
          err instanceof Error
            ? `Не удалось загрузить движок: ${err.message}`
            : "Не удалось загрузить движок",
        );
      } finally {
        if (requestId === engineRequestRef.current) {
          startingRef.current = false;
          setEngineLoading(false);
        }
      }
    },
    [onBridge, saveBackend, shortMode, stageId, stopGame],
  );

  const start = () => {
    if (!pack) return;
    void startWithPack(pack);
  };

  useEffect(() => {
    const next = pendingPlayRemountPackRef.current;
    if (!next || loading) return;
    pendingPlayRemountPackRef.current = null;
    persistExplore("quit");
    void startWithPack(next);
  }, [pack, loading, persistExplore, startWithPack]);

  const continuePlay = () => {
    if (performance.now() < relockAtMs) return;
    apiRef.current?.resume();
    setMenuOpen(false);
  };

  const quitToLobby = () => {
    persistExplore("quit");
    setResult(null);
    stopGame();
  };

  const quitToEditor = () => {
    quitToLobby();
    onOpenEditor();
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
  const selectedStageId =
    (stageId && pack?.stages[stageId] ? stageId : null) ??
    pack?.meta.defaultStageId ??
    null;
  const selectedStage = selectedStageId ? pack?.stages[selectedStageId] : undefined;
  const selectedMap = selectedStage ? pack?.maps[selectedStage.mapId] : undefined;
  const explore = selectedMap
    ? resolveMapPlayProfile(selectedMap) === "explore"
    : false;
  const stageName = selectedStage?.nameRu ?? "Загрузка…";
  const idle = !running && !sceneId && !engineLoading;
  const relockWaitMs = Math.max(0, relockAtMs - nowMs);
  const canContinue = relockWaitMs <= 0;
  const relockWaitSec = Math.ceil(relockWaitMs / 1000);

  return (
    <div className="page page--ember">
      {onNavigate ? (
        <PlayHubChrome active="ember" onChange={onNavigate} tight />
      ) : null}
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
            {hud.durationSec > 0 ? (
              <>
                <span className="ember-play-bar__sep">/</span>
                <span className="muted">{fmtTime(hud.durationSec)}</span>
              </>
            ) : null}
            <span className="ember-play-bar__dot" aria-hidden>
              ·
            </span>
            <span>Lv {hud.level}</span>
          </div>
        ) : (
          <div className="ember-play-bar__status muted">
            {loading || engineLoading
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
                persistExplore("quit");
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
          <button
            type="button"
            className="ghost"
            title="На весь экран (F11)"
            onClick={() => toggleEmberPlayFullscreen()}
          >
            F11
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
          className={`ember-play__stage ${running || engineLoading ? "is-live" : ""} ${!running && !sceneId ? "is-idle" : ""}`}
          ref={hostRef}
        />

        {engineLoading ? (
          <div
            className="ember-play__boot"
            role="status"
            aria-live="polite"
            onPointerDown={() => apiRef.current?.lockLook()}
          >
            <div className="ember-play__boot-card">
              <p className="ember-play__kicker muted">Загрузка</p>
              <h2 className="ember-play__stage-name">{stageName}</h2>
              <div
                className="ember-play__boot-track"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(loadProgress.ratio * 100)}
              >
                <div
                  className="ember-play__boot-fill"
                  style={{
                    width: `${Math.max(4, Math.min(100, loadProgress.ratio * 100))}%`,
                  }}
                />
              </div>
              <p className="muted ember-play__boot-label">
                {loadProgress.labelRu}
              </p>
            </div>
          </div>
        ) : null}

        {idle ? (
          <div className="ember-play__lobby">
            <div className="ember-play__lobby-card">
              <p className="ember-play__kicker muted">
                {explore ? "Прогулка" : "Забег"}
              </p>
              {pack && Object.keys(pack.stages).length > 1 ? (
                <label className="ember-play__stage-pick">
                  Стадия
                  <select
                    value={selectedStageId ?? ""}
                    onChange={(e) => setStageId(e.target.value)}
                  >
                    {Object.values(pack.stages).map((st) => (
                      <option key={st.id} value={st.id}>
                        {st.nameRu ?? st.id}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <h2 className="ember-play__stage-name">{stageName}</h2>
              )}
              {pack && Object.keys(pack.stages).length > 1 ? (
                <h2 className="ember-play__stage-name">{stageName}</h2>
              ) : null}
              <p className="muted ember-play__blurb">
                {explore
                  ? "WASD — гулять по деревне · без волн и орды · фонари и окна"
                  : "Движение WASD · атаки сами · XP и сундуки качают билд"}
              </p>
              {pack && explore ? (
                <EmberSavePanel
                  packId={pack.meta.id}
                  backend={saveBackend}
                  mode="editor"
                  onToast={(textRu) => {
                    setToast(textRu);
                    window.setTimeout(() => setToast(null), 1800);
                  }}
                />
              ) : null}

              {explore ? null : (
                <label className="ember-check ember-play__short">
                  <input
                    type="checkbox"
                    checked={shortMode}
                    onChange={(e) => setShortMode(e.target.checked)}
                  />
                  Короткий режим (~90с)
                </label>
              )}

              <button
                type="button"
                className="primary ember-play__start"
                disabled={!pack || loading || engineLoading || errors.length > 0}
                onPointerDown={(e) => {
                  if (e.button !== 0) return;
                  void start();
                }}
                onClick={(e) => {
                  if (e.detail === 0) void start();
                }}
              >
                {engineLoading ? "Загрузка движка…" : "Начать"}
              </button>

              <ul className="muted ember-play__tips">
                {explore ? (
                  <>
                    <li>Карта: {selectedMap?.nameRu ?? selectedStage?.mapId}</li>
                    <li>Редактор → Карты → «Деревня Ху Тао»</li>
                    <li>WASD — движение · мышь — камера · Esc — меню</li>
                    <li>F11 — игра на весь экран</li>
                    <li>F у прилавка — магазин · F у сундука — лут</li>
                    <li>I — инвентарь и экипировка (пока открыт магазин — нет)</li>
                    <li>Фонари и окна — локальный свет с гибридными тенями</li>
                  </>
                ) : (
                  <>
                    <li>Мышь — камера · Esc — меню</li>
                    <li>F11 — игра на весь экран</li>
                    <li>Слизь замедляет</li>
                    <li>Урон оголяет (strip)</li>
                    <li>Контент — в Редакторе</li>
                  </>
                )}
              </ul>
            </div>
          </div>
        ) : null}

        {menuOpen && running ? (
          <div className="ember-play__menu" role="dialog" aria-modal="true" aria-label="Меню">
            <div className="ember-play__menu-card">
              <p className="ember-play__kicker muted">Пауза</p>
              <h2 className="ember-play__stage-name">{stageName}</h2>
              <button
                type="button"
                className="primary"
                disabled={!canContinue}
                onPointerDown={(e) => {
                  if (e.button !== 0) return;
                  continuePlay();
                }}
                onClick={(e) => {
                  if (e.detail === 0) continuePlay();
                }}
              >
                {canContinue
                  ? "Продолжить"
                  : `Продолжить (${relockWaitSec})`}
              </button>
              {!canContinue ? (
                <p className="muted ember-play__menu-hint">
                  После Esc браузер ~1.5 с не даёт снова захватить мышь
                </p>
              ) : null}
              {pack && explore ? (
                <EmberSavePanel
                  packId={pack.meta.id}
                  backend={saveBackend}
                  mode="pause"
                  capture={() => apiRef.current?.captureExploreSave() ?? null}
                  apply={(save) => apiRef.current?.applyExploreSave(save) ?? false}
                  onNewRun={() => {
                    void start();
                  }}
                  onToast={(textRu) => {
                    setToast(textRu);
                    window.setTimeout(() => setToast(null), 1800);
                  }}
                />
              ) : null}
              <button type="button" className="ghost" onClick={quitToLobby}>
                Выйти
              </button>
              <button type="button" className="ghost" onClick={quitToEditor}>
                Редактор
              </button>
              <p className="muted ember-play__menu-hint">F11 — на весь экран</p>
              {selectedMap ? (
                <div className="ember-play__menu-camera">
                  <p className="ember-play__kicker muted">Камера</p>
                  <EmberCameraRigFields
                    camera={playCamera ?? selectedMap.camera}
                    tileSize={selectedMap.tileSize}
                    mapId={selectedMap.id}
                    presets={pack?.cameraPresets ?? {}}
                    onChange={(camera) => {
                      setPlayCamera(camera);
                      apiRef.current?.applyCameraSettings(camera);
                    }}
                    onPresetsPersist={persistPlayCameraPresets}
                  />
                </div>
              ) : null}
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
            <button
              type="button"
              className="ghost ember-hud__inv"
              disabled={shop != null}
              title={
                shop
                  ? "Сначала закрой лавку"
                  : "Инвентарь (I)"
              }
              onClick={() => apiRef.current?.toggleInventory()}
            >
              Сумка
            </button>
            {explore && pack ? (
              <button
                type="button"
                className="ghost ember-hud__inv"
                onClick={() => setSaveDebugOpen((open) => !open)}
              >
                Сейвы
              </button>
            ) : null}
          </div>
        ) : null}
        {saveDebugOpen && running && explore && pack ? (
          <div className="ember-save-debug">
            <EmberSavePanel
              packId={pack.meta.id}
              backend={saveBackend}
              mode="play"
              capture={() => apiRef.current?.captureExploreSave() ?? null}
              apply={(save) => apiRef.current?.applyExploreSave(save) ?? false}
              onNewRun={() => {
                void start();
              }}
              onToast={(textRu) => {
                setToast(textRu);
                window.setTimeout(() => setToast(null), 1800);
              }}
            />
          </div>
        ) : null}

        {toast ? <div className="ember-toast">{toast}</div> : null}

        {loot ? (
          <EmberLootRoulette
            titleRu={loot.kind === "chest" ? "Сундук" : "Level Up"}
            options={loot.options}
            targetId={loot.targetId}
            onDone={takeLoot}
          />
        ) : null}

        {shop && pack ? (
          <EmberShopPanel
            shop={shop}
            items={pack.items}
            itemIcons={pack.itemIcons}
            onBuy={(itemId) => apiRef.current?.buyShopItem(itemId)}
            onSell={(itemId) => apiRef.current?.sellShopItem(itemId)}
            onClose={() => apiRef.current?.closeShop()}
          />
        ) : null}

        {inventory && pack && !shop ? (
          <EmberInventoryPanel
            inventory={inventory}
            items={pack.items}
            itemIcons={pack.itemIcons}
            onEquip={(itemId) => apiRef.current?.equipItem(itemId)}
            onUnequip={(slot) => apiRef.current?.unequipSlot(slot)}
            onUse={(itemId) => apiRef.current?.useItem(itemId)}
            onClose={() => apiRef.current?.closeInventory()}
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

        {playDialogueId && pack && !shop ? (
          <div className="ember-scene-host ember-scene-host--overlay">
            <ScenePlayer
              pack={pack}
              sceneId={playDialogueId}
              variant="play"
              onGrantCinders={onReward}
              onClose={() => {
                setPlayDialogueId(null);
                apiRef.current?.advanceDialogue();
              }}
            />
          </div>
        ) : null}

        {sceneId && pack ? (
          <div className="ember-scene-host">
            <ScenePlayer
              pack={pack}
              sceneId={sceneId}
              variant="stage"
              onGrantCinders={onReward}
              onClose={() => setSceneId(null)}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
