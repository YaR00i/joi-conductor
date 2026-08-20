import { useEffect, useRef } from "react";
import { RUNNER_CROWD_CAP, type RunnerDifficulty } from "../../lib/runnerReward";
import type { PuzzleTask } from "../../lib/puzzleTasks";

/**
 * Gate-runner mini-game canvas (Count Masters style).
 *
 * The crowd auto-runs forward; the player steers left/right to pick gate
 * columns (+n / ×n grow the crowd, −n / ÷2 punish it, 🔥 pauses the run with a
 * task), enemy crowds block the whole road and are resolved as a flat
 * subtract, and a boss guards the finish line. Beating the boss raises the
 * onBossDefeated event so the shell can show the favorite-image trophy.
 *
 * All world state lives in a ref; React only renders overlays around the canvas.
 */

export interface RunnerOutcome {
  survived: boolean;
  finalCrowd: number;
  fightsWon: number;
  taskReward: number;
  taskPenalty: number;
  gatesGood: number;
  gatesBad: number;
  bossDefeated: boolean;
  deathCause: "gates" | "fight" | "boss" | null;
  trackPct: number;
}

interface Props {
  difficulty: RunnerDifficulty;
  tasks: PuzzleTask[];
  paused: boolean;
  /** Resolve with true when the fire-gate task succeeded. */
  onTaskGate: (task: PuzzleTask) => Promise<boolean>;
  /** Fired once when the boss crowd is beaten (visual trophy trigger). */
  onBossDefeated?: () => void;
  onOutcome: (o: RunnerOutcome) => void;
}

// ---- world tuning (world units) ----
const ROAD_HALF = 180;
const ROW_SPACING = 320;
const CAM_BACK = 150;
/** Focal length ≈ inverse FOV: smaller = wider lens, objects read farther. */
const FOCAL = 250;
/** Camera pitch — horizon height as a fraction of the canvas. Lower = the
 *  camera sits higher and looks down (closer to a top-down view). */
const HORIZON_FRAC = 0.27;
const DRAW_DIST = 2400;
const GATE_HALF = 95;
const GATE_H = 150;
const COL_CX = 90;
const PLAYER_SPEED = 178;
const STRAFE_SPEED = 540;
/** Waves hold their line on the road (0 = no counter-march): everything on
 *  the track then moves in one camera frame and depth reads synchronized.
 *  The closing speed comes from the player's own run. */
const ENEMY_SPEED = 0;
/** Fight triggers when crowd edges touch (each spread reaches ±30 around its
 *  center: 30 + 30 + 2) so clusters meet without interpenetrating. */
const FIGHT_GAP = 62;
const TASK_GATE_CHANCE = 0.2;
const MAX_DRAWN_DUDES = 55;
const CROWD_SPREAD_W = 52;
const CROWD_SPREAD_D = 30;
const PLAYER_MARGIN = 36;
const RAIL_H = 16;

type GateKind = "add" | "mul" | "sub" | "div" | "task";

export interface GateCol {
  cx: number;
  kind: GateKind;
  value: number;
  label: string;
  task: PuzzleTask | null;
}
interface GateRow {
  z: number;
  cols: GateCol[];
  taken: boolean;
}
interface Enemy {
  z: number;
  count: number;
  boss: boolean;
  dead: boolean;
}
interface Floater {
  x: number;
  y: number;
  vy: number;
  text: string;
  color: string;
  size: number;
  t: number;
  life: number;
}
interface Particle {
  wx: number;
  wz: number;
  h: number;
  vx: number;
  vz: number;
  vh: number;
  color: string;
  size: number;
  t: number;
  life: number;
}

interface World {
  rows: GateRow[];
  enemies: Enemy[];
  finishZ: number;
  playerZ: number;
  x: number;
  targetX: number;
  crowd: number;
  /** Fractional accumulator for stragglers joining the crowd. */
  crowdFrac: number;
  fightsWon: number;
  gatesGood: number;
  gatesBad: number;
  taskReward: number;
  taskPenalty: number;
  bossDefeated: boolean;
  phase: "run" | "dying" | "finish";
  phaseT: number;
  deathCause: RunnerOutcome["deathCause"];
  /** Crowd size at the moment of the wipe (drives the 40% burn cut). */
  deadCrowd: number;
  pendingTask: PuzzleTask | null;
  shake: number;
  flash: { color: string; t: number } | null;
  floaters: Floater[];
  particles: Particle[];
  time: number;
  done: boolean;
}

function clamp(v: number, a: number, b: number): number {
  return v < a ? a : v > b ? b : v;
}

// ---- track generation ----

function goodGate(rng: () => number, progress: number, strong: boolean): GateCol {
  if (rng() < (strong ? 0.55 : 0.42)) {
    const v = strong && rng() < 0.3 ? 3 : 2;
    return { cx: 0, kind: "mul", value: v, label: `×${v}`, task: null };
  }
  const n = 4 + Math.round(progress * 13 + rng() * 4) + (strong ? 3 : 0);
  return { cx: 0, kind: "add", value: n, label: `+${n}`, task: null };
}

function badGate(rng: () => number, progress: number): GateCol {
  if (rng() < 0.45) {
    return { cx: 0, kind: "div", value: 2, label: "÷2", task: null };
  }
  const n = 6 + Math.round(progress * 12 + rng() * 4);
  return { cx: 0, kind: "sub", value: n, label: `−${n}`, task: null };
}

/** Apply a gate to a crowd count (used for gameplay and greedy calibration). */
export function applyGate(c: number, col: GateCol): number {
  switch (col.kind) {
    case "add":
      return Math.min(RUNNER_CROWD_CAP, c + col.value);
    case "mul":
      return Math.min(RUNNER_CROWD_CAP, c * col.value);
    case "sub":
      return Math.max(0, c - col.value);
    case "div":
      return Math.ceil(c / col.value);
    case "task":
      return Math.min(RUNNER_CROWD_CAP, c + Math.max(4, Math.round(c * 0.35)));
  }
}

export function buildTrack(
  diff: RunnerDifficulty,
  tasks: PuzzleTask[],
  rng: () => number = Math.random,
) {
  const rows: GateRow[] = [];
  let z = 360;
  let lastTask = false;
  while (z < diff.trackLen) {
    const progress = z / diff.trackLen;
    const r = rng();
    // First row is always a safe dilemma with one strong gate: the crowd
    // starts with a single runner, red gates here would kill the run at once.
    const first = rows.length === 0;
    const canTask = tasks.length > 0 && !lastTask && !first;
    const canBad = rows.length > 1;
    let cols: GateCol[];
    if (canBad && r < diff.badGateChance) {
      const good = goodGate(rng, progress, false);
      const bad = badGate(rng, progress);
      cols = rng() < 0.5 ? [good, bad] : [bad, good];
      lastTask = false;
    } else if (canTask && r < diff.badGateChance + TASK_GATE_CHANCE) {
      const task = tasks[Math.floor(rng() * tasks.length)];
      const taskCol: GateCol = { cx: 0, kind: "task", value: 0, label: "🔥", task };
      const good = goodGate(rng, progress, true);
      cols = rng() < 0.5 ? [taskCol, good] : [good, taskCol];
      lastTask = true;
    } else {
      const a = goodGate(rng, progress, first);
      let b = goodGate(rng, progress, false);
      if (a.kind === b.kind && a.value === b.value) b = goodGate(rng, progress, true);
      cols = [a, b];
      lastTask = false;
    }
    cols[0].cx = -COL_CX;
    cols[1].cx = COL_CX;
    rows.push({ z, cols, taken: false });
    z += ROW_SPACING * (0.9 + rng() * 0.25);
  }

  // Mercy pass: a red −n gate may cost at most ~half of what a typical crowd
  // has at that point. Red gates should maim a sloppy run, not execute it —
  // full wipe stays possible only for genuinely tiny crowds.
  {
    let t0 = 1;
    const typBefore: number[] = [];
    for (const row of rows) {
      typBefore.push(t0);
      const [a, b] = row.cols;
      const best = Math.max(applyGate(t0, a), applyGate(t0, b));
      const worst = Math.min(applyGate(t0, a), applyGate(t0, b));
      t0 = Math.round(best * 0.75 + worst * 0.25);
    }
    for (let i = 0; i < rows.length; i++) {
      for (const col of rows[i].cols) {
        if (col.kind !== "sub") continue;
        const cap = Math.max(2, Math.round(typBefore[i] * 0.5));
        if (col.value > cap) {
          col.value = cap;
          col.label = `−${cap}`;
        }
      }
    }
  }

  // Calibrate enemies off a "typical" player: best gate column 75% of the
  // time, worst 25%, and every wave toll is paid. Greedy play then banks a
  // buffer for the boss, sloppy play scrapes by (or dies on harder runs).
  let typ = 1;
  const enemies: Enemy[] = [];
  for (let i = 0; i < rows.length; i++) {
    const [a, b] = rows[i].cols;
    const tBest = Math.max(applyGate(typ, a), applyGate(typ, b));
    const tWorst = Math.min(applyGate(typ, a), applyGate(typ, b));
    const tNext = Math.round(tBest * 0.75 + tWorst * 0.25);
    let toll = 0;
    if (i + 2 < rows.length && rng() < diff.enemyChance) {
      // Early waves ramp up so the tiny opening crowd isn't wiped at once.
      const ramp = Math.min(1, 0.35 + (0.65 * i) / 5);
      toll = Math.max(
        1,
        Math.round(tNext * diff.enemyFactor * ramp * (0.85 + rng() * 0.25)),
      );
      enemies.push({ z: rows[i].z + ROW_SPACING * 0.55, count: toll, boss: false, dead: false });
    }
    typ = Math.max(1, tNext - toll);
  }
  const bossCount = Math.max(5, Math.round(typ * diff.bossFactor * (1 + rng() * 0.15)));
  const bossZ = (rows.length ? rows[rows.length - 1].z : diff.trackLen) + ROW_SPACING * 0.8;
  enemies.push({ z: bossZ, count: bossCount, boss: true, dead: false });
  return { rows, enemies, finishZ: bossZ + 140 };
}

/** Deterministic small-seed RNG so balance simulations are reproducible. */
export function makeSeededRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    // mulberry32
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- palette ----

const GATE_COLORS: Record<GateKind, { main: string; wall: string; bright: string }> = {
  add: { main: "#3dd68c", wall: "rgba(61,214,140,", bright: "#eafff4" },
  mul: { main: "#ffd23e", wall: "rgba(255,210,62,", bright: "#fff8dc" },
  sub: { main: "#ff5a4e", wall: "rgba(255,90,78,", bright: "#ffece8" },
  div: { main: "#ff5a4e", wall: "rgba(255,90,78,", bright: "#ffece8" },
  task: { main: "#ff8a4a", wall: "rgba(255,138,74,", bright: "#ffd9b0" },
};

const PLAYER_BODIES = ["#ff9a55", "#ff8a4a", "#ffb27a", "#f97b3c", "#ffc49a"];
const PLAYER_HEADS = ["#ffd9b0", "#ffe3c4", "#f7c9a0"];
const ENEMY_BODIES = ["#d14b40", "#b23a31", "#8f2f28", "#c4453a", "#a33329"];
const ENEMY_HEADS = ["#2e100c", "#3a1510", "#261009"];

export function RunnerTrack({
  difficulty,
  tasks,
  paused,
  onTaskGate,
  onBossDefeated,
  onOutcome,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const onTaskGateRef = useRef(onTaskGate);
  onTaskGateRef.current = onTaskGate;
  const onBossDefeatedRef = useRef(onBossDefeated);
  onBossDefeatedRef.current = onBossDefeated;
  const onOutcomeRef = useRef(onOutcome);
  onOutcomeRef.current = onOutcome;

  const keysRef = useRef<Set<string>>(new Set());
  const dragRef = useRef(false);
  const dimsRef = useRef({ w: 0, h: 0, dpr: 1 });

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const track = buildTrack(difficulty, tasks);
    const world: World = {
      rows: track.rows,
      enemies: track.enemies,
      finishZ: track.finishZ,
      playerZ: 0,
      x: 0,
      targetX: 0,
      crowd: 1,
      crowdFrac: 0,
      fightsWon: 0,
      gatesGood: 0,
      gatesBad: 0,
      taskReward: 0,
      taskPenalty: 0,
      bossDefeated: false,
      phase: "run",
      phaseT: 0,
      deathCause: null,
      deadCrowd: 0,
      pendingTask: null,
      shake: 0,
      flash: null,
      floaters: [],
      particles: [],
      time: 0,
      done: false,
    };

    // ---- sizing ----
    const resize = () => {
      const r = wrap.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      dimsRef.current = { w: r.width, h: r.height, dpr };
      canvas.width = Math.max(1, Math.round(r.width * dpr));
      canvas.height = Math.max(1, Math.round(r.height * dpr));
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    // ---- input ----
    const onKeyDown = (e: KeyboardEvent) => {
      keysRef.current.add(e.code);
      if (e.code === "ArrowLeft" || e.code === "ArrowRight") e.preventDefault();
    };
    const onKeyUp = (e: KeyboardEvent) => keysRef.current.delete(e.code);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    const pointerToTarget = (clientX: number) => {
      const { w } = dimsRef.current;
      const rect = canvas.getBoundingClientRect();
      const px = clientX - rect.left;
      const roadHalfPx = Math.min(w * 0.46, rect.height * 0.75);
      const pxPerUnit = roadHalfPx / ROAD_HALF;
      const s0 = FOCAL / (FOCAL + CAM_BACK);
      world.targetX = clamp(
        (px - w / 2) / (pxPerUnit * s0),
        -ROAD_HALF + PLAYER_MARGIN,
        ROAD_HALF - PLAYER_MARGIN,
      );
    };
    const onPointerDown = (e: PointerEvent) => {
      dragRef.current = true;
      canvas.setPointerCapture(e.pointerId);
      pointerToTarget(e.clientX);
    };
    const onPointerMove = (e: PointerEvent) => {
      if (dragRef.current) pointerToTarget(e.clientX);
    };
    const onPointerUp = () => {
      dragRef.current = false;
    };
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);

    // ---- gameplay helpers ----
    const addFloater = (text: string, color: string, size = 26) => {
      const { w, h } = dimsRef.current;
      world.floaters.push({
        x: w / 2 + (world.x / ROAD_HALF) * w * 0.18,
        y: h * 0.62,
        vy: -46,
        text,
        color,
        size,
        t: 0,
        life: 0.95,
      });
    };
    const burst = (wx: number, wz: number, n: number, colors: string[]) => {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = 40 + Math.random() * 130;
        world.particles.push({
          wx,
          wz,
          h: 6 + Math.random() * 22,
          vx: Math.cos(a) * sp,
          vz: Math.sin(a) * sp * 0.5,
          vh: 60 + Math.random() * 160,
          color: colors[Math.floor(Math.random() * colors.length)],
          size: 2 + Math.random() * 3.5,
          t: 0,
          life: 0.6 + Math.random() * 0.5,
        });
      }
    };
    const startDying = (cause: RunnerOutcome["deathCause"]) => {
      world.phase = "dying";
      world.phaseT = 0;
      world.deathCause = cause;
      world.deadCrowd = world.crowd;
      world.shake = 1.4;
      world.flash = { color: "255,70,50", t: 1 };
      world.crowd = 0;
      burst(world.x, world.playerZ, 46, PLAYER_BODIES);
    };
    const emitOutcome = () => {
      world.done = true;
      onOutcomeRef.current({
        survived: world.phase === "finish",
        finalCrowd: world.phase === "finish" ? world.crowd : world.deadCrowd,
        fightsWon: world.fightsWon,
        taskReward: world.taskReward,
        taskPenalty: world.taskPenalty,
        gatesGood: world.gatesGood,
        gatesBad: world.gatesBad,
        bossDefeated: world.bossDefeated,
        deathCause: world.phase === "dying" ? world.deathCause : null,
        trackPct: clamp(world.playerZ / world.finishZ, 0, 1),
      });
    };

    const applyHit = (col: GateCol) => {
      if (col.kind === "task" && col.task) {
        const task = col.task;
        world.pendingTask = task;
        void onTaskGateRef.current(task).then((success) => {
          if (world.done || world.pendingTask !== task) return;
          world.pendingTask = null;
          if (success) {
            const gain = Math.max(4, Math.round(world.crowd * 0.35));
            world.crowd = Math.min(RUNNER_CROWD_CAP, world.crowd + gain);
            world.taskReward += task.rewardBonus;
            world.gatesGood++;
            addFloater(`+${gain}`, "#3dd68c");
            world.flash = { color: "61,214,140", t: 0.5 };
          } else {
            const loss = Math.max(1, Math.round(world.crowd * 0.2));
            world.crowd = Math.max(1, world.crowd - loss); // a failed task never wipes the run
            world.taskPenalty += task.failPenalty;
            world.gatesBad++;
            addFloater(`−${loss}`, "#ff5a4e");
            world.shake = 0.7;
            world.flash = { color: "255,90,78", t: 0.6 };
          }
        });
        return;
      }
      const before = world.crowd;
      world.crowd = applyGate(world.crowd, col);
      const delta = world.crowd - before;
      if (col.kind === "add" || col.kind === "mul") {
        world.gatesGood++;
        addFloater((delta >= 0 ? "+" : "−") + Math.abs(delta), "#3dd68c");
        world.flash = { color: "61,214,140", t: 0.35 };
      } else {
        world.gatesBad++;
        addFloater(`−${Math.abs(delta)}`, "#ff5a4e");
        world.shake = 0.5;
        world.flash = { color: "255,90,78", t: 0.45 };
      }
      if (world.crowd <= 0) startDying("gates");
    };

    const resolveFight = (e: Enemy) => {
      if (world.crowd > e.count) {
        world.crowd -= e.count;
        world.fightsWon++;
        e.dead = true;
        world.shake = 1;
        burst(0, e.z, 34, ENEMY_BODIES);
        addFloater(`−${e.count}`, "#ff9a55", 22);
        if (e.boss) {
          world.bossDefeated = true;
          world.flash = { color: "255,210,62", t: 0.8 };
          addFloater("БОСС ПАЛ!", "#ffd23e", 34);
          onBossDefeatedRef.current?.();
        }
      } else {
        startDying(e.boss ? "boss" : "fight");
      }
    };

    // ---- update ----
    const step = (dt: number) => {
      world.time += dt;
      if (world.shake > 0) world.shake = Math.max(0, world.shake - dt * 2.4);
      if (world.flash) {
        world.flash.t -= dt * 2.4;
        if (world.flash.t <= 0) world.flash = null;
      }
      for (const f of world.floaters) {
        f.t += dt;
        f.y += f.vy * dt;
        f.vy += 30 * dt;
      }
      world.floaters = world.floaters.filter((f) => f.t < f.life);
      for (const p of world.particles) {
        p.t += dt;
        p.wx += p.vx * dt;
        p.wz += p.vz * dt;
        p.h += p.vh * dt;
        p.vh -= 420 * dt;
        if (p.h < 0) {
          p.h = 0;
          p.vh *= -0.35;
        }
      }
      world.particles = world.particles.filter((p) => p.t < p.life);

      const blocked = world.pendingTask !== null;
      if (world.phase === "run" && !blocked) {
        const pct = clamp(world.playerZ / world.finishZ, 0, 1);
        const prevZ = world.playerZ;
        world.playerZ += PLAYER_SPEED * (1 + 0.18 * pct) * dt;

        // stragglers join the crowd over time — cushions a few gate mistakes
        world.crowdFrac += dt * 0.45;
        if (world.crowdFrac >= 1) {
          const join = Math.floor(world.crowdFrac);
          world.crowdFrac -= join;
          world.crowd = Math.min(RUNNER_CROWD_CAP, world.crowd + join);
        }

        let dir = 0;
        if (keysRef.current.has("ArrowLeft") || keysRef.current.has("KeyA")) dir -= 1;
        if (keysRef.current.has("ArrowRight") || keysRef.current.has("KeyD")) dir += 1;
        if (dir !== 0) {
          world.targetX = clamp(
            world.targetX + dir * STRAFE_SPEED * dt,
            -ROAD_HALF + PLAYER_MARGIN,
            ROAD_HALF - PLAYER_MARGIN,
          );
        }
        world.x += (world.targetX - world.x) * Math.min(1, dt * 11);

        for (const row of world.rows) {
          if (row.taken) continue;
          if (row.z > prevZ && row.z <= world.playerZ) {
            row.taken = true;
            const near =
              Math.abs(world.x - row.cols[0].cx) <= Math.abs(world.x - row.cols[1].cx)
                ? row.cols[0]
                : row.cols[1];
            applyHit(near);
            if (world.phase !== "run") break;
          }
        }
        for (const e of world.enemies) {
          if (e.dead) continue;
          e.z -= ENEMY_SPEED * dt;
          if (e.z - world.playerZ < FIGHT_GAP) {
            resolveFight(e);
            if (world.phase !== "run") break;
          }
        }
        if (world.phase === "run" && world.playerZ >= world.finishZ) {
          world.phase = "finish";
          world.phaseT = 0;
          addFloater("ФИНИШ!", "#ffd23e", 36);
          burst(world.x, world.finishZ, 40, ["#ffd23e", "#ff8a4a", "#3dd68c"]);
        }
      } else if (world.phase === "dying") {
        world.phaseT += dt;
        if (world.phaseT > 1.35 && !world.done) emitOutcome();
      } else if (world.phase === "finish") {
        world.phaseT += dt;
        world.playerZ += PLAYER_SPEED * dt;
        if (world.phaseT > 1.1 && !world.done) emitOutcome();
      }
    };

    // ---- draw ----
    const draw = () => {
      const { w, h, dpr } = dimsRef.current;
      if (w < 4 || h < 4) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const horizonY = h * HORIZON_FRAC;
      const baseY = h * 0.99;
      const roadHalfPx = Math.min(w * 0.46, h * 0.75);
      const pxPerUnit = roadHalfPx / ROAD_HALF;
      const camZ = world.playerZ - CAM_BACK;

      const project = (wx: number, z: number) => {
        const dz = Math.max(-FOCAL * 0.8, z - camZ);
        const s = FOCAL / (FOCAL + dz);
        return {
          x: w / 2 + wx * s * pxPerUnit,
          y: horizonY + (baseY - horizonY) * s,
          s,
        };
      };

      // camera shake
      const shakeAmp = world.shake * 7;
      const ox = shakeAmp ? (Math.random() - 0.5) * shakeAmp : 0;
      const oy = shakeAmp ? (Math.random() - 0.5) * shakeAmp : 0;
      ctx.translate(ox, oy);

      // ---- sky ----
      const sky = ctx.createLinearGradient(0, 0, 0, horizonY);
      sky.addColorStop(0, "#170c0b");
      sky.addColorStop(0.7, "#251310");
      sky.addColorStop(1, "#43201a");
      ctx.fillStyle = sky;
      ctx.fillRect(-20, -20, w + 40, horizonY + 20);
      // stars (deterministic per index, gentle twinkle)
      for (let i = 0; i < 34; i++) {
        const sx = ((i * 97.31) % 1) * w;
        const sy = ((i * 57.17) % 1) * horizonY * 0.85;
        const tw = 0.25 + 0.35 * Math.abs(Math.sin(world.time * 1.6 + i * 2.1));
        ctx.fillStyle = `rgba(255,214,170,${tw})`;
        ctx.fillRect(sx, sy, 1.6, 1.6);
      }
      // ember sun
      const sun = ctx.createRadialGradient(
        w / 2, horizonY, 4, w / 2, horizonY, Math.max(w, h) * 0.24,
      );
      sun.addColorStop(0, "rgba(255,150,80,0.55)");
      sun.addColorStop(0.35, "rgba(255,100,45,0.18)");
      sun.addColorStop(1, "rgba(255,90,40,0)");
      ctx.fillStyle = sun;
      ctx.fillRect(-20, -20, w + 40, horizonY + 20);
      // drifting ambient embers
      for (let i = 0; i < 10; i++) {
        const ex = ((i * 0.37 + 0.08) % 1) * w + Math.sin(world.time * 0.7 + i * 1.3) * 14;
        const ey = h * 0.92 - ((world.time * 16 + i * 131) % (h * 0.85));
        const ea = 0.14 + 0.12 * Math.abs(Math.sin(world.time * 2 + i));
        ctx.fillStyle = `rgba(255,138,74,${ea})`;
        ctx.beginPath();
        ctx.arc(ex, ey, 1.6 + (i % 3) * 0.7, 0, Math.PI * 2);
        ctx.fill();
      }

      // ---- road ----
      const farZ = world.playerZ + DRAW_DIST;
      const fl = project(-ROAD_HALF, farZ);
      const fr = project(ROAD_HALF, farZ);
      const nl = project(-ROAD_HALF, camZ + 4);
      const nr = project(ROAD_HALF, camZ + 4);
      const road = ctx.createLinearGradient(0, horizonY, 0, h);
      road.addColorStop(0, "#150d0a");
      road.addColorStop(1, "#221610");
      ctx.fillStyle = road;
      ctx.beginPath();
      ctx.moveTo(fl.x, fl.y);
      ctx.lineTo(fr.x, fr.y);
      ctx.lineTo(nr.x, nr.y);
      ctx.lineTo(nl.x, nl.y);
      ctx.closePath();
      ctx.fill();

      // cross stripes (motion feel)
      const stripeStep = 130;
      const firstStripe = Math.floor(camZ / stripeStep) * stripeStep;
      for (let sz = firstStripe; sz < farZ; sz += stripeStep) {
        const a = clamp(1 - (sz - camZ) / DRAW_DIST, 0, 1) * 0.14;
        if (a <= 0.01) continue;
        const a1 = project(-ROAD_HALF, sz);
        const a2 = project(ROAD_HALF, sz);
        ctx.strokeStyle = `rgba(255,150,95,${a})`;
        ctx.lineWidth = Math.max(1, 3 * a1.s);
        ctx.beginPath();
        ctx.moveTo(a1.x, a1.y);
        ctx.lineTo(a2.x, a2.y);
        ctx.stroke();
      }
      // center dashed divider
      const dashStep = 110;
      const firstDash = Math.floor(camZ / dashStep) * dashStep;
      for (let dz0 = firstDash; dz0 < farZ; dz0 += dashStep) {
        const a = clamp(1 - (dz0 - camZ) / DRAW_DIST, 0, 1) * 0.22;
        if (a <= 0.01) continue;
        const d1 = project(0, dz0);
        const d2 = project(0, dz0 + 52);
        ctx.strokeStyle = `rgba(255,226,200,${a})`;
        ctx.lineWidth = Math.max(1, 2.6 * d1.s);
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(d1.x, d1.y);
        ctx.lineTo(d2.x, d2.y);
        ctx.stroke();
      }

      // side rails (low glowing walls)
      for (const edge of [-1, 1]) {
        const wx = edge * ROAD_HALF;
        const f = project(wx, farZ);
        const n2 = project(wx, camZ + 4);
        const ft = { x: f.x, y: f.y - RAIL_H * f.s * pxPerUnit };
        const nt = { x: n2.x, y: n2.y - RAIL_H * n2.s * pxPerUnit };
        ctx.fillStyle = "#241511";
        ctx.beginPath();
        ctx.moveTo(f.x, f.y);
        ctx.lineTo(ft.x, ft.y);
        ctx.lineTo(nt.x, nt.y);
        ctx.lineTo(n2.x, n2.y);
        ctx.closePath();
        ctx.fill();
        const rg = ctx.createLinearGradient(0, ft.y, 0, nt.y);
        rg.addColorStop(0, "rgba(255,138,74,0)");
        rg.addColorStop(1, "rgba(255,138,74,0.6)");
        ctx.strokeStyle = rg;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(ft.x, ft.y);
        ctx.lineTo(nt.x, nt.y);
        ctx.stroke();
      }

      // roadside torches
      const torchStep = 260;
      const firstTorch = Math.floor(camZ / torchStep) * torchStep;
      for (let tz = firstTorch; tz < farZ; tz += torchStep) {
        const a = clamp(1 - (tz - camZ) / DRAW_DIST, 0, 1);
        if (a <= 0.02) continue;
        const side = Math.floor(tz / torchStep) % 2 === 0 ? -1 : 1;
        const p = project(side * (ROAD_HALF + 26), tz);
        const ph = 30 * p.s;
        ctx.fillStyle = "#3a241b";
        ctx.fillRect(p.x - 1.6 * p.s, p.y - ph, Math.max(1, 3.2 * p.s), ph);
        const flick = 0.55 + 0.45 * Math.abs(Math.sin(world.time * 9 + tz * 0.13));
        const fr2 = 9 * p.s * (0.8 + flick * 0.4);
        const tg = ctx.createRadialGradient(p.x, p.y - ph, 0, p.x, p.y - ph, Math.max(2, fr2));
        tg.addColorStop(0, `rgba(255,190,110,${0.75 * a * flick})`);
        tg.addColorStop(0.4, `rgba(255,120,50,${0.32 * a})`);
        tg.addColorStop(1, "rgba(255,90,40,0)");
        ctx.fillStyle = tg;
        ctx.beginPath();
        ctx.arc(p.x, p.y - ph, Math.max(2, fr2), 0, Math.PI * 2);
        ctx.fill();
      }

      // ---- finish line ----
      if (world.finishZ - world.playerZ < DRAW_DIST) {
        const f1 = project(-ROAD_HALF, world.finishZ);
        const f2 = project(ROAD_HALF, world.finishZ);
        const fh = 26 * f1.s * pxPerUnit;
        const cells = 12;
        const cw = (f2.x - f1.x) / cells;
        for (let i = 0; i < cells; i++) {
          ctx.fillStyle = i % 2 === 0 ? "#e8d9c8" : "#241813";
          ctx.fillRect(f1.x + i * cw, f2.y - fh, cw, fh);
        }
      }

      // ---- actors ----
      const drawDude = (
        x: number,
        y: number,
        s: number,
        body: string,
        head: string,
        phase: number,
      ) => {
        const u = 32 * s * pxPerUnit * 0.55;
        const bob = Math.sin(world.time * 11 + phase) * 0.1;
        // shadow
        ctx.fillStyle = "rgba(0,0,0,0.3)";
        ctx.beginPath();
        ctx.ellipse(x, y + u * 0.02, u * 0.26, u * 0.09, 0, 0, Math.PI * 2);
        ctx.fill();
        // body capsule
        const bh = u * (0.62 + bob * 0.5);
        ctx.beginPath();
        ctx.roundRect(x - u * 0.21, y - bh, u * 0.42, bh, u * 0.2);
        ctx.fillStyle = body;
        ctx.fill();
        ctx.lineWidth = Math.max(1, u * 0.07);
        ctx.strokeStyle = "rgba(18,8,6,0.85)";
        ctx.stroke();
        // head
        ctx.beginPath();
        ctx.arc(x, y - bh - u * 0.12, u * 0.16, 0, Math.PI * 2);
        ctx.fillStyle = head;
        ctx.fill();
        ctx.stroke();
      };

      const drawBadge = (
        cx: number,
        bottomY: number,
        text: string,
        color: string,
        fs: number,
      ) => {
        ctx.font = `800 ${fs}px system-ui, 'Segoe UI', sans-serif`;
        const tw = ctx.measureText(text).width;
        const pw = tw + fs * 0.75;
        const ph = fs * 1.3;
        ctx.beginPath();
        ctx.roundRect(cx - pw / 2, bottomY - ph, pw, ph, ph * 0.42);
        ctx.fillStyle = "rgba(14,7,5,0.86)";
        ctx.fill();
        ctx.lineWidth = Math.max(1.5, fs * 0.1);
        ctx.strokeStyle = color;
        ctx.stroke();
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = color;
        ctx.fillText(text, cx, bottomY - ph / 2 + fs * 0.04);
        return ph;
      };

      const drawCrown = (cx: number, bottomY: number, w2: number) => {
        const hh = w2 * 0.55;
        ctx.beginPath();
        ctx.moveTo(cx - w2 / 2, bottomY);
        ctx.lineTo(cx - w2 / 2, bottomY - hh * 0.6);
        ctx.lineTo(cx - w2 * 0.17, bottomY - hh * 0.2);
        ctx.lineTo(cx, bottomY - hh);
        ctx.lineTo(cx + w2 * 0.17, bottomY - hh * 0.2);
        ctx.lineTo(cx + w2 / 2, bottomY - hh * 0.6);
        ctx.lineTo(cx + w2 / 2, bottomY);
        ctx.closePath();
        ctx.fillStyle = "#ffd23e";
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = "rgba(60,30,5,0.8)";
        ctx.stroke();
      };

      const drawCrowdCluster = (
        wx: number,
        z: number,
        count: number,
        kind: "player" | "enemy",
        boss: boolean,
      ) => {
        const bodies = kind === "player" ? PLAYER_BODIES : ENEMY_BODIES;
        const heads = kind === "player" ? PLAYER_HEADS : ENEMY_HEADS;
        const ringColor =
          kind === "player" ? "255,138,74" : boss ? "255,90,60" : "220,60,48";
        const badgeColor = kind === "player" ? "#ffe0a8" : boss ? "#ffd23e" : "#ff9d92";
        const base = project(wx, z);
        // ground ring (team marker — makes crowds pop off the road)
        const pulse = kind === "player" ? 1 + 0.06 * Math.sin(world.time * 5) : 1;
        const rx = CROWD_SPREAD_W * 1.4 * base.s * pxPerUnit * pulse;
        const ry = rx * 0.32;
        ctx.beginPath();
        ctx.ellipse(base.x, base.y, rx, ry, 0, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${ringColor},0.16)`;
        ctx.fill();
        ctx.lineWidth = Math.max(1.5, 3 * base.s);
        ctx.strokeStyle = `rgba(${ringColor},0.7)`;
        ctx.stroke();

        const n = Math.min(count, MAX_DRAWN_DUDES);
        const pts: { x: number; y: number; s: number; i: number }[] = [];
        for (let i = 0; i < n; i++) {
          const rr = 0.92 * Math.sqrt((i + 0.4) / n);
          const a = i * 2.39996 + 0.9;
          const p = project(
            wx + Math.cos(a) * rr * CROWD_SPREAD_W,
            z + Math.sin(a) * rr * CROWD_SPREAD_D,
          );
          pts.push({ x: p.x, y: p.y, s: p.s, i });
        }
        pts.sort((a, b) => a.y - b.y);
        for (const p of pts) {
          drawDude(
            p.x,
            p.y,
            p.s,
            bodies[p.i % bodies.length],
            heads[p.i % heads.length],
            p.i * 1.9,
          );
        }
        // count badge above the topmost runner
        const topY = pts.length ? pts[0].y : base.y;
        const fs = Math.max(14, (boss ? 46 : 34) * base.s * pxPerUnit * 0.55);
        const ph = drawBadge(base.x, topY - fs * 0.45, String(count), badgeColor, fs);
        if (boss) {
          drawCrown(base.x, topY - fs * 0.45 - ph - fs * 0.18, fs * 1.5);
        }
      };

      const drawGateRow = (row: GateRow) => {
        if (row.taken) return;
        if (row.z - world.playerZ > DRAW_DIST || row.z < world.playerZ - 60) return;
        for (const col of row.cols) {
          const c = GATE_COLORS[col.kind];
          const pulse = col.kind === "task" ? 0.5 + 0.5 * Math.sin(world.time * 6) : 0;
          const g1 = project(col.cx - GATE_HALF, row.z);
          const g2 = project(col.cx + GATE_HALF, row.z);
          const topH = GATE_H * g1.s * pxPerUnit;
          const postW = Math.max(3, 14 * g1.s);
          // translucent wall — dense at the header, clear near the ground so
          // enemy crowds behind the gate stay readable at a glance
          const wg = ctx.createLinearGradient(0, g1.y - topH, 0, g1.y);
          wg.addColorStop(0, `${c.wall}${0.24 + pulse * 0.12})`);
          wg.addColorStop(1, `${c.wall}${0.08 + pulse * 0.08})`);
          ctx.fillStyle = wg;
          ctx.fillRect(g1.x, g1.y - topH, g2.x - g1.x, topH);
          // floor strip
          ctx.fillStyle = `${c.wall}0.38)`;
          ctx.fillRect(g1.x, g1.y - Math.max(2, 7 * g1.s), g2.x - g1.x, Math.max(2, 7 * g1.s));
          // posts with glowing caps
          for (const gx of [g1.x, g2.x]) {
            ctx.fillStyle = c.main;
            ctx.fillRect(gx - postW / 2, g1.y - topH, postW, topH);
            ctx.beginPath();
            ctx.arc(gx, g1.y - topH - postW * 0.55, postW * 0.78, 0, Math.PI * 2);
            ctx.shadowColor = c.main;
            ctx.shadowBlur = 14;
            ctx.fill();
            ctx.shadowBlur = 0;
          }
          // header bar
          ctx.fillStyle = c.main;
          ctx.fillRect(
            g1.x - postW / 2,
            g1.y - topH - postW * 1.5,
            g2.x - g1.x + postW,
            postW * 1.5,
          );
          // glowing label
          const colW = g2.x - g1.x;
          const fs = Math.max(12, colW * 0.3);
          ctx.font = `800 ${fs}px system-ui, 'Segoe UI', sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          const lx = (g1.x + g2.x) / 2;
          const ly = g1.y - topH * 0.52;
          ctx.shadowColor = c.main;
          ctx.shadowBlur = 14 * g1.s + 4;
          ctx.fillStyle = c.bright;
          ctx.fillText(col.label, lx, ly);
          ctx.shadowBlur = 0;
          if (col.kind === "task") {
            drawBadge(lx, ly + fs * 1.15, "ЗАДАНИЕ", "#ffc49a", Math.max(9, colW * 0.1));
          }
        }
      };

      // Enemy danger corridors: a fading red band on the road from each wave
      // toward the player. Makes the wave's depth readable at a glance — the
      // band starts exactly at the enemy line, so "behind or in front of the
      // gate" is unambiguous (drawn on the ground, under gates and crowds).
      if (world.phase !== "dying") {
        for (const e of world.enemies) {
          if (e.dead || e.z <= world.playerZ || e.z - world.playerZ > DRAW_DIST) continue;
          const frontZ = e.z;
          const backZ = Math.max(world.playerZ + 10, e.z - 150);
          if (backZ >= frontZ) continue;
          const fl = project(-ROAD_HALF, frontZ);
          const fr = project(ROAD_HALF, frontZ);
          const bl = project(-ROAD_HALF, backZ);
          const br = project(ROAD_HALF, backZ);
          const baseA = e.boss ? 0.3 : 0.2;
          const bandG = ctx.createLinearGradient(0, fl.y, 0, bl.y);
          bandG.addColorStop(0, `rgba(255,80,55,${baseA})`);
          bandG.addColorStop(1, "rgba(255,80,55,0)");
          ctx.fillStyle = bandG;
          ctx.beginPath();
          ctx.moveTo(fl.x, fl.y);
          ctx.lineTo(fr.x, fr.y);
          ctx.lineTo(br.x, br.y);
          ctx.lineTo(bl.x, bl.y);
          ctx.closePath();
          ctx.fill();
          // crisp front line under the wave itself
          ctx.strokeStyle = `rgba(255,90,60,${e.boss ? 0.65 : 0.45})`;
          ctx.lineWidth = Math.max(1.5, 3.5 * fl.s);
          ctx.beginPath();
          ctx.moveTo(fl.x, fl.y);
          ctx.lineTo(fr.x, fr.y);
          ctx.stroke();
        }
      }

      // depth-sorted world objects
      const items: Array<{ z: number; draw: () => void }> = [];
      for (const row of world.rows) items.push({ z: row.z, draw: () => drawGateRow(row) });
      for (const e of world.enemies) {
        if (e.dead) continue;
        if (e.z < world.playerZ - 80) continue;
        items.push({
          z: e.z,
          draw: () => drawCrowdCluster(0, e.z, e.count, "enemy", e.boss),
        });
      }
      items.sort((a, b) => b.z - a.z);
      for (const it of items) it.draw();

      // player crowd
      if (world.phase !== "dying") {
        drawCrowdCluster(world.x, world.playerZ, world.crowd, "player", false);
      }

      // particles
      for (const p of world.particles) {
        const pr = project(p.wx, p.wz);
        const a = clamp(1 - p.t / p.life, 0, 1);
        ctx.globalAlpha = a;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(pr.x, pr.y - p.h * pr.s * pxPerUnit, p.size * pr.s, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // floaters (screen space)
      for (const f of world.floaters) {
        const a = clamp(1 - f.t / f.life, 0, 1);
        ctx.globalAlpha = a;
        ctx.font = `800 ${f.size}px system-ui, 'Segoe UI', sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.lineWidth = 4;
        ctx.strokeStyle = "rgba(12,6,5,0.85)";
        ctx.fillStyle = f.color;
        ctx.strokeText(f.text, f.x, f.y);
        ctx.fillText(f.text, f.x, f.y);
      }
      ctx.globalAlpha = 1;

      // vignette
      const vg = ctx.createRadialGradient(
        w / 2, h * 0.55, h * 0.35, w / 2, h * 0.55, Math.max(w, h) * 0.72,
      );
      vg.addColorStop(0, "rgba(6,3,2,0)");
      vg.addColorStop(1, "rgba(6,3,2,0.42)");
      ctx.fillStyle = vg;
      ctx.fillRect(-20, -20, w + 40, h + 40);

      ctx.translate(-ox, -oy);

      // ---- HUD (no shake) ----
      // progress bar
      const bw = Math.min(380, w * 0.5);
      const bx = (w - bw) / 2;
      const by = 12;
      const pct = clamp(world.playerZ / world.finishZ, 0, 1);
      ctx.fillStyle = "rgba(12,7,6,0.72)";
      ctx.strokeStyle = "rgba(255,140,90,0.35)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(bx, by, bw, 10, 5);
      ctx.fill();
      ctx.stroke();
      if (pct > 0.01) {
        const fill = ctx.createLinearGradient(bx, 0, bx + bw, 0);
        fill.addColorStop(0, "#ff8a4a");
        fill.addColorStop(1, "#ffd23e");
        ctx.fillStyle = fill;
        ctx.beginPath();
        ctx.roundRect(bx + 1.5, by + 1.5, Math.max(2, (bw - 3) * pct), 7, 3.5);
        ctx.fill();
        ctx.fillStyle = "#ffe0a8";
        ctx.beginPath();
        ctx.arc(bx + 1.5 + (bw - 3) * pct, by + 5, 5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.font = "700 11px system-ui, 'Segoe UI', sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#b0704d";
      ctx.fillText("СТАРТ", bx - 2, by + 5);
      ctx.textAlign = "right";
      ctx.fillText("БОСС ☠", bx + bw + 2, by + 5);

      // flash
      if (world.flash) {
        ctx.fillStyle = `rgba(${world.flash.color},${clamp(world.flash.t, 0, 1) * 0.22})`;
        ctx.fillRect(0, 0, w, h);
      }
      // dying vignette
      if (world.phase === "dying") {
        const a = clamp(world.phaseT / 0.5, 0, 1) * 0.5;
        const dvg = ctx.createRadialGradient(
          w / 2, h / 2, h * 0.2, w / 2, h / 2, h * 0.75,
        );
        dvg.addColorStop(0, "rgba(120,10,5,0)");
        dvg.addColorStop(1, `rgba(120,10,5,${a})`);
        ctx.fillStyle = dvg;
        ctx.fillRect(0, 0, w, h);
      }
    };

    // ---- loop ----
    let raf = 0;
    let last = performance.now();
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!pausedRef.current) step(dt);
      draw();
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
    };
    // Track and crowd are generated once per mount; the parent remounts the
    // component (key) to restart, so difficulty/tasks are read at mount only.
  }, []);

  return (
    <div className="runner-canvas-wrap" ref={wrapRef}>
      <canvas ref={canvasRef} />
    </div>
  );
}
