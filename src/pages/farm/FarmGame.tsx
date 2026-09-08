import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CindersGlyph } from "../../components/CindersGlyph";
import { MinigameMistressFace } from "../../components/MinigameMistressFace";
import { MinigameStimToggles } from "../../components/MinigameStimToggles";
import { recordMinigameClear } from "../../lib/achievements";
import {
  FARM_INSPECTION_WARN_MS,
  calcFarmVisitReward,
  type FarmRewardResult,
} from "../../lib/farmReward";
import { activeMistressNameRu, subscribeActiveMistress } from "../../lib/mistress";
import { loadPuzzleTasks, pickRandomTask, type PuzzleTask } from "../../lib/puzzleTasks";
import {
  filterArcadeTasks,
  loadRunnerSettings,
  saveRunnerSettings,
  stimVibeMode,
} from "../../lib/runnerSettings";
import { getActiveSaveSlot } from "../../lib/saveSlots";
import { PuzzleTaskRunner } from "../puzzle/PuzzleTaskRunner";
import { FarmCanvas, type FarmCanvasHandle } from "./FarmCanvas";
import {
  FARM_INSPECTION_EVERY_MS,
  FARM_INSPECTION_FIRST_MS,
  FARM_UPGRADE_DEFS,
  buyFarmUpgrade,
  defaultFarmRanks,
  farmUnlocks,
  farmUpgradesFrom,
  type FarmRanks,
  type FarmUpgradeId,
} from "./farmCampaign";
import {
  FARM_ANIMALS,
  FARM_BUILD_GOLD,
  FARM_CROPS,
  FARM_FACTORIES,
  FARM_ITEMS,
  warehouseUsed,
} from "./farmItems";
import {
  bootFarmWorld,
  farmLevelFromXp,
  farmXpBar,
  loadFarmDisk,
  packFarmDisk,
  saveFarmDisk,
  syncFarmUnlocks,
} from "./farmSave";
import {
  animalIsHungry,
  clickBuildFactory,
  clickBuy,
  clickFactory,
  clickTruck,
  clickWell,
  farmMessCount,
  farmMessSummaryRu,
  stepFarmWorld,
  type FarmEvent,
  type FarmFieldTool,
  type FarmWorld,
} from "./farmSim";
import "./farm.css";

interface Props {
  onReward: (cinders: number) => void;
  onExit: () => void;
}

type Phase = "play" | "result";

const TICK_MS = 50;
const BANNER_MS = 2600;
const SAVE_MS = 2000;

function playEventBanner(events: FarmEvent[]): { kind: string; text: string } | null {
  let best: { kind: string; text: string; rank: number } | null = null;
  const take = (rank: number, kind: string, text: string) => {
    if (!best || rank >= best.rank) best = { kind, text, rank };
  };
  for (const e of events) {
    switch (e.kind) {
      case "starve":
        take(
          5,
          "warn",
          e.reason === "bear"
            ? `Медведь напугал: ${e.nameRu} — покорми`
            : `${e.nameRu} голодает — полей траву`,
        );
        break;
      case "hungry":
        take(4, "warn", `${e.nameRu} голодна — полей траву`);
        break;
      case "full":
        take(4, "warn", "Сарай полный — отправь грузовик");
        break;
      case "rot":
        take(3, "warn", `${FARM_ITEMS[e.item].nameRu} сгнило — не успел в сарай`);
        break;
      case "pest":
        take(3, "warn", "Медведь на поле! Кликай, пока не сядет в клетку");
        break;
      case "built":
        take(3, "clean", `${e.nameRu} стоит у двора`);
        break;
      case "sold":
        take(2, "clean", `Грузовик: +${e.gold} золота`);
        break;
      case "harvest":
        take(1, "clean", `Собрал: ${FARM_ITEMS[e.item].nameRu}`);
        break;
      case "planted":
      case "collect":
      case "win":
      case "fail":
        break;
      default: {
        const _never: never = e;
        void _never;
      }
    }
  }
  return best;
}

function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function inspectionDue(elapsedMs: number): number {
  if (elapsedMs < FARM_INSPECTION_FIRST_MS) return 0;
  return 1 + Math.floor((elapsedMs - FARM_INSPECTION_FIRST_MS) / FARM_INSPECTION_EVERY_MS);
}

export function FarmGame({ onReward, onExit }: Props) {
  const [phase, setPhase] = useState<Phase>("play");
  const [ranks, setRanks] = useState<FarmRanks>(defaultFarmRanks);
  const [feel, setFeel] = useState(loadRunnerSettings);
  const [mistressName, setMistressName] = useState(activeMistressNameRu);
  const [hud, setHud] = useState(0);
  const [banner, setBanner] = useState<string | null>(null);
  const [bannerKind, setBannerKind] = useState("warn");
  const [task, setTask] = useState<PuzzleTask | null>(null);
  const [result, setResult] = useState<FarmRewardResult | null>(null);
  const [tool, setTool] = useState<FarmFieldTool>("water");
  const [panel, setPanel] = useState<null | "market" | "barn" | "build">(null);
  const [ready, setReady] = useState(false);
  const worldRef = useRef<FarmWorld | null>(null);
  const ranksRef = useRef<FarmRanks>(ranks);
  const viewRef = useRef<FarmCanvasHandle | null>(null);
  const rngRef = useRef(mulberry32(1));
  const claimedRef = useRef(true);
  const taskRewardRef = useRef(0);
  const taskPenaltyRef = useRef(0);
  const nextInspRef = useRef(0);
  const warnForRef = useRef(-1);
  const bannerTimer = useRef(0);
  const visitGoldRef = useRef(0);
  const visitXpRef = useRef(0);
  const visitAtRef = useRef(0);
  const tasks = useMemo(
    () => filterArcadeTasks(loadPuzzleTasks(), feel),
    [feel],
  );

  useEffect(() => subscribeActiveMistress((p) => setMistressName(p.displayNameRu)), []);

  const bumpHud = useCallback(() => setHud((n) => n + 1), []);

  const persistWorld = useCallback(() => {
    const w = worldRef.current;
    if (!w) return;
    saveFarmDisk(packFarmDisk(w, ranksRef.current));
  }, []);

  const showBanner = (kind: string, text: string, auto = true) => {
    setBannerKind(kind);
    setBanner(text);
    window.clearTimeout(bannerTimer.current);
    if (auto) {
      bannerTimer.current = window.setTimeout(() => setBanner(null), BANNER_MS);
    }
  };

  useEffect(() => {
    rngRef.current = mulberry32((Date.now() ^ 7) >>> 0);
    const disk = loadFarmDisk();
    const nextRanks = disk?.ranks ?? defaultFarmRanks();
    ranksRef.current = nextRanks;
    setRanks(nextRanks);
    const w = bootFarmWorld(rngRef.current, disk);
    worldRef.current = w;
    visitGoldRef.current = w.gold;
    visitXpRef.current = w.xp;
    visitAtRef.current = Date.now();
    nextInspRef.current = inspectionDue(w.elapsedMs);
    warnForRef.current = -1;
    claimedRef.current = true;
    setReady(true);
    showBanner("clean", "Это твой двор. Посей пшеницу, полей траву, строй станки.", false);
  }, []);

  useEffect(() => {
    ranksRef.current = ranks;
  }, [ranks]);

  useEffect(() => {
    if (!ready || phase !== "play") return;
    const id = window.setInterval(persistWorld, SAVE_MS);
    return () => window.clearInterval(id);
  }, [ready, phase, persistWorld]);

  useEffect(() => () => persistWorld(), [persistWorld]);

  const applyRanks = (next: FarmRanks) => {
    const w = worldRef.current;
    if (!w) return;
    ranksRef.current = next;
    setRanks(next);
    w.upgrades = farmUpgradesFrom(next);
    if (w.upgrades.hasCat && !w.cat) w.cat = { x: 0.8, y: w.rows - 0.8, vx: 0, vy: 0 };
    if (!w.upgrades.hasCat) w.cat = null;
    if (w.upgrades.hasDog && !w.dog) w.dog = { x: 1.6, y: w.rows - 0.8, vx: 0, vy: 0 };
    if (!w.upgrades.hasDog) w.dog = null;
    persistWorld();
    bumpHud();
  };

  const leaveYard = useCallback(() => {
    const w = worldRef.current;
    persistWorld();
    if (!w) {
      onExit();
      return;
    }
    const reward = calcFarmVisitReward({
      visitMs: Date.now() - visitAtRef.current,
      goldEarned: w.gold - visitGoldRef.current,
      xpGained: w.xp - visitXpRef.current,
      taskReward: taskRewardRef.current,
      taskPenalty: taskPenaltyRef.current,
    });
    if (w.gold > visitGoldRef.current) recordMinigameClear("farm");
    if (reward.total <= 0) {
      onExit();
      return;
    }
    claimedRef.current = false;
    setResult(reward);
    setPhase("result");
  }, [onExit, persistWorld]);

  useEffect(() => {
    if (!ready || phase !== "play") return;
    const id = window.setInterval(() => {
      const w = worldRef.current;
      if (!w || task) return;
      const events = stepFarmWorld(w, TICK_MS, rngRef.current);
      syncFarmUnlocks(w);
      const due = inspectionDue(w.elapsedMs);
      const k = nextInspRef.current;
      let hushEvents = false;
      if (due > k) {
        hushEvents = true;
        nextInspRef.current = due;
        warnForRef.current = -1;
        const dirt = farmMessCount(w);
        if (dirt === 0) {
          showBanner("clean", `👠 ${mistressName} обходу довольна.`);
        } else {
          const picked = pickRandomTask(tasks);
          if (!picked) {
            taskPenaltyRef.current += dirt;
            showBanner("warn", `👠 Бардак (${farmMessSummaryRu(w)}). Заданий нет.`);
          } else {
            setBanner(null);
            setTask(picked);
          }
        }
      } else if (due === k) {
        const atMs = k === 0
          ? FARM_INSPECTION_FIRST_MS
          : FARM_INSPECTION_FIRST_MS + k * FARM_INSPECTION_EVERY_MS;
        if (w.elapsedMs >= atMs - FARM_INSPECTION_WARN_MS && w.elapsedMs < atMs && warnForRef.current !== k) {
          hushEvents = true;
          warnForRef.current = k;
          const mess = farmMessSummaryRu(w);
          showBanner(
            "warn",
            mess
              ? `👠 ${mistressName} идёт! ${mess}.`
              : `👠 ${mistressName} идёт с проверкой.`,
            false,
          );
        }
      }
      const note = playEventBanner(events);
      if (note && !hushEvents) showBanner(note.kind, note.text);
      bumpHud();
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, [ready, phase, task, tasks, mistressName, bumpHud]);

  useEffect(() => () => window.clearTimeout(bannerTimer.current), []);

  const claim = (then: () => void) => {
    if (!claimedRef.current && result) {
      claimedRef.current = true;
      if (result.total > 0) onReward(result.total);
    }
    then();
  };

  if (phase === "result" && result) {
    return (
      <div className="farm-result">
        <MinigameMistressFace size="sm" />
        <h2>Двор сохранён</h2>
        <p className="muted">
          Угольки за визит: касса {result.goldConvert} · опыт {result.xpConvert}
          {result.visit ? ` · смена ${result.visit}` : ""}
          {result.taskReward ? ` · задания +${result.taskReward}` : ""}
          {result.taskPenalty ? ` · штраф −${result.taskPenalty}` : ""}
        </p>
        <div className="farm-result__actions">
          <button type="button" className="primary" onClick={() => claim(onExit)}>
            Забрать {result.total} <CindersGlyph className="runner-inline-glyph" />
          </button>
          <button
            type="button"
            className="ghost"
            onClick={() => claim(() => {
              visitGoldRef.current = worldRef.current?.gold ?? visitGoldRef.current;
              visitXpRef.current = worldRef.current?.xp ?? visitXpRef.current;
              visitAtRef.current = Date.now();
              taskRewardRef.current = 0;
              taskPenaltyRef.current = 0;
              setResult(null);
              setPhase("play");
            })}
          >
            Обратно во двор
          </button>
        </div>
      </div>
    );
  }

  const world = worldRef.current;
  if (!ready || !world) return null;
  const vibeMode = stimVibeMode(feel);
  const near = farmMessCount(world) > 0;
  const hungryN = world.animals.filter(animalIsHungry).length;
  const bar = farmXpBar(world.xp);
  const unlocks = farmUnlocks(farmLevelFromXp(world.xp));
  const toBuild = unlocks.factories.filter((k) => !world.factories.some((f) => f.kind === k));
  void hud;

  return (
    <div className="farm-play farm-play--iso">
      <div className="farm-play__stage">
        <FarmCanvas
          ref={viewRef}
          worldRef={worldRef}
          paused={task != null}
          onHud={bumpHud}
          tool={tool}
        />
        <div className="farm-hud-top">
          <button type="button" className="puzzle-hud__btn puzzle-hud__btn--back" onClick={leaveYard} title="К играм">
            ←
          </button>
          <MinigameMistressFace size="sm" />
          <div className="farm-hud-top__meta">
            <strong>Двор · ур. {bar.level}</strong>
            <span className="muted">
              {bar.need > 0 ? `опыт ${bar.have} / ${bar.need}` : "максимум"}
            </span>
          </div>
          <span className="farm-chip">золото {world.gold}</span>
          <span className={`farm-chip${hungryN ? " is-hot" : ""}`}>скот {world.animals.length}</span>
          <span className={`farm-chip${near ? " is-hot" : ""}`}>{mistressName}</span>
        </div>
        <div className="farm-hud-quest">
          <strong>Двор</strong>
          <ul className="farm-goals">
            <li>посей пшеницу лейкой-семенами</li>
            <li>трава — еда скота, не грядка</li>
            <li>яичко в сарай, грузовик в город</li>
            {unlocks.factories.length === 0 ? <li>уровень 2 откроет сушилку</li> : null}
          </ul>
        </div>
        <div className="farm-hud-zoom">
          <button type="button" className="ghost" onClick={() => viewRef.current?.zoomBy(1.15)} title="Крупнее">
            +
          </button>
          <button type="button" className="ghost" onClick={() => viewRef.current?.zoomBy(1 / 1.15)} title="Мельче">
            −
          </button>
        </div>
        <div className="farm-hud-dock">
          <button
            type="button"
            className={tool === "water" ? "primary" : "ghost"}
            onClick={() => setTool("water")}
          >
            Лейка {world.water}/{world.upgrades.wellCap}
          </button>
          {unlocks.crops.map((kind) => (
            <button
              key={kind}
              type="button"
              className={tool === kind ? "primary" : "ghost"}
              onClick={() => setTool(kind)}
            >
              {FARM_CROPS[kind].nameRu} · {FARM_CROPS[kind].seedGold}
            </button>
          ))}
          <button
            type="button"
            className={panel === "market" ? "primary" : "ghost"}
            onClick={() => setPanel(panel === "market" ? null : "market")}
          >
            Рынок
          </button>
          <button
            type="button"
            className={panel === "build" ? "primary" : "ghost"}
            onClick={() => setPanel(panel === "build" ? null : "build")}
          >
            Стройка
          </button>
          <button
            type="button"
            className={panel === "barn" ? "primary" : "ghost"}
            onClick={() => setPanel(panel === "barn" ? null : "barn")}
          >
            Склад {warehouseUsed(world.warehouse)}/{world.upgrades.warehouseCap}
          </button>
        </div>
        {banner ? <div className={`farm-banner farm-hud-banner is-${bannerKind}`}>{banner}</div> : null}
        {panel === "market" ? (
          <div className="farm-hud-sheet">
            <strong>Рынок</strong>
            <div className="farm-side__row">
              {world.spec.shop.map((kind) => (
                <button
                  key={kind}
                  type="button"
                  className="ghost"
                  onClick={() => { clickBuy(world, kind, rngRef.current); persistWorld(); bumpHud(); }}
                >
                  {FARM_ANIMALS[kind].nameRu} · {FARM_ANIMALS[kind].buyGold}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="ghost"
              onClick={() => {
                if (clickWell(world)) showBanner("clean", "Колодец полный.");
                else if (world.water >= world.upgrades.wellCap) showBanner("clean", "Вода есть.");
                else showBanner("warn", `Долив стоит ${world.upgrades.wellRefillCost} золота.`);
                persistWorld();
                bumpHud();
              }}
            >
              Долить колодец (−{world.upgrades.wellRefillCost})
            </button>
            <button type="button" className="ghost" onClick={() => { clickTruck(world); persistWorld(); bumpHud(); }}>
              {world.truck.awayMs > 0 ? "Грузовик в пути…" : "Отправить грузовик"}
            </button>
            {world.factories.map((f) => (
              <button
                key={f.kind}
                type="button"
                className="ghost"
                disabled={f.busyMs > 0}
                onClick={() => { clickFactory(world, f.kind, []); persistWorld(); bumpHud(); }}
              >
                {FARM_FACTORIES[f.kind].nameRu}
                {f.busyMs > 0 ? "…" : ""}
              </button>
            ))}
          </div>
        ) : null}
        {panel === "build" ? (
          <div className="farm-hud-sheet">
            <strong>Стройка</strong>
            <p className="muted">Станок встанет справа от поля. Уровень двора открывает новые.</p>
            <div className="farm-side__row">
              {toBuild.length === 0 ? (
                <span className="muted">
                  {unlocks.factories.length === 0 ? "Сначала добери опыт — сушилка с ур. 2." : "Все открытые станки уже стоят."}
                </span>
              ) : (
                toBuild.map((kind) => (
                  <button
                    key={kind}
                    type="button"
                    className="ghost"
                    onClick={() => {
                      const ev: FarmEvent[] = [];
                      if (clickBuildFactory(world, kind, ev)) {
                        const note = playEventBanner(ev);
                        if (note) showBanner(note.kind, note.text);
                      } else {
                        showBanner("warn", `Нужно ${FARM_BUILD_GOLD[kind]} золота.`);
                      }
                      persistWorld();
                      bumpHud();
                    }}
                  >
                    {FARM_FACTORIES[kind].nameRu} · {FARM_BUILD_GOLD[kind]}
                  </button>
                ))
              )}
            </div>
            <strong>Апгрейды</strong>
            {FARM_UPGRADE_DEFS.map((u) => {
              const rank = ranks[u.id] ?? 0;
              const maxed = rank >= u.maxRank;
              return (
                <div key={u.id} className="farm-upgrade">
                  <div>
                    <div>{u.nameRu} · {rank}/{u.maxRank}</div>
                    <div className="muted">{u.hintRu}</div>
                  </div>
                  <button
                    type="button"
                    className="ghost"
                    disabled={maxed || world.gold < u.goldCost}
                    onClick={() => {
                      const next = buyFarmUpgrade(ranks, world.gold, u.id as FarmUpgradeId);
                      if (!next) return;
                      world.gold = next.gold;
                      applyRanks(next.ranks);
                    }}
                  >
                    {maxed ? "Макс" : `${u.goldCost}з`}
                  </button>
                </div>
              );
            })}
            <MinigameStimToggles
              settings={feel}
              onChange={(next) => {
                setFeel(next);
                saveRunnerSettings(next);
              }}
            />
          </div>
        ) : null}
        {panel === "barn" ? (
          <div className="farm-hud-sheet">
            <strong>Сарай {warehouseUsed(world.warehouse)}/{world.upgrades.warehouseCap}</strong>
            <p>
              {world.warehouse.length === 0
                ? "Пусто. Кликай яйца, урожай и кувшины на земле."
                : world.warehouse.map((i) => FARM_ITEMS[i].nameRu).join(", ")}
            </p>
            <button type="button" className="ghost" onClick={() => { clickTruck(world); persistWorld(); bumpHud(); }}>
              {world.truck.awayMs > 0 ? "Грузовик в пути…" : "Увезти грузовиком"}
            </button>
          </div>
        ) : null}
      </div>
      {task ? (
        <PuzzleTaskRunner
          mode="task"
          task={task}
          vibeMode={vibeMode}
          allowCancel={getActiveSaveSlot() === "sandbox"}
          onComplete={(ok) => {
            if (ok) {
              taskRewardRef.current += task.rewardBonus;
              showBanner("clean", `👠 Отработал: +${task.rewardBonus}`);
            } else {
              taskPenaltyRef.current += task.failPenalty;
              showBanner("warn", `👠 Провалил: −${task.failPenalty}`);
            }
            setTask(null);
          }}
        />
      ) : null}
    </div>
  );
}