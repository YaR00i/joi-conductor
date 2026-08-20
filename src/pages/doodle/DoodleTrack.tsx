import { useEffect, useRef } from "react";
import type { DoodleDifficulty } from "../../lib/doodleReward";
import type { PuzzleTask } from "../../lib/puzzleTasks";

/**
 * Doodle-jump mini-game canvas («Прыжки уголька»).
 *
 * The ember bounces by itself; the player steers left/right (screen edges
 * wrap). Platform kinds: normal, moving (drifts sideways), break (crumbles
 * after one bounce), spring (boosts ~3× higher) and task (🔥 pauses the game
 * with a PuzzleTask: success = cinders + a boost, fail = penalty + fog +
 * device pulse from the shell). Every run eventually ends with a fall —
 * max height is the score.
 *
 * All world state lives in a closure; React only renders overlays. Balance-
 * critical generation/physics helpers are exported pure for simulations.
 */

export interface DoodleOutcome {
  heightM: number;
  bounces: number;
  springs: number;
  tasksGood: number;
  tasksBad: number;
  taskReward: number;
  taskPenalty: number;
}

interface Props {
  difficulty: DoodleDifficulty;
  tasks: PuzzleTask[];
  paused: boolean;
  /** Best height for this difficulty (dashed "рекорд" line), meters. */
  bestHeightM?: number;
  /** Resolve with true when the task-platform task succeeded. */
  onTaskGate: (task: PuzzleTask) => Promise<boolean>;
  /** Fired once per crossed 100 m mark (trophy trigger). */
  onMilestone?: (meters: number) => void;
  onOutcome: (o: DoodleOutcome) => void;
}

// ---- world tuning (world units) ----
export const DOODLE_LW = 420;
export const DOODLE_GRAVITY = 2300;
export const DOODLE_JUMP_V = 820;
export const DOODLE_STRAFE = 350;
export const DOODLE_SPRING_MULT = 1.7;
export const DOODLE_TASK_MULT = 1.35;
export const DOODLE_METER = 40;
export const DOODLE_VIEW_H = 480;
export const DOODLE_PLAYER_R = 15;
const START_Y = 80;
const PLAT_H = 11;

export type PlatKind = "normal" | "moving" | "break" | "spring" | "task";

export interface GenPlat {
  y: number;
  cx: number;
  w: number;
  kind: PlatKind;
  amp: number;
  task: PuzzleTask | null;
}

interface Plat extends GenPlat {
  om: number; // moving: angular speed
  ph: number; // moving: phase
  broken: boolean;
  fallV: number;
  rot: number;
  spin: number;
  springT: number;
  taskUsed: boolean;
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
  wy: number;
  vx: number;
  vy: number;
  color: string;
  size: number;
  t: number;
  life: number;
}

interface World {
  plats: Plat[];
  topY: number;
  topCx: number;
  sinceTask: number;
  playerX: number;
  playerY: number;
  vy: number;
  targetX: number;
  camY: number;
  maxY: number;
  milestone: number;
  bounces: number;
  springs: number;
  tasksGood: number;
  tasksBad: number;
  taskReward: number;
  taskPenalty: number;
  fogT: number;
  phase: "run" | "dead";
  phaseT: number;
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

// ---- generation (pure, unit-tested) ----

/** Time from a bounce until the jumper descends back to `gap` above the start. */
export function descendTime(gap: number): number {
  const disc = DOODLE_JUMP_V * DOODLE_JUMP_V - 2 * DOODLE_GRAVITY * gap;
  if (disc <= 0) return 0;
  return (DOODLE_JUMP_V + Math.sqrt(disc)) / DOODLE_GRAVITY;
}

/** Horizontal distance a player can cover before descending back to `gap`. */
export function maxTravel(gap: number): number {
  return DOODLE_STRAFE * descendTime(gap) * 0.92;
}

/** True when a platform `dx` (wrap-min) away at `gap` above can be landed on. */
export function canLand(
  dx: number,
  gap: number,
  amp: number,
  halfW: number,
): boolean {
  const slack = amp + halfW + DOODLE_PLAYER_R * 0.6;
  return Math.max(0, dx - slack) <= maxTravel(gap);
}

export function genPlatform(
  prevY: number,
  prevCx: number,
  diff: DoodleDifficulty,
  tasks: PuzzleTask[],
  sinceTask: number,
  rng: () => number,
): { plat: GenPlat; sinceTask: number } {
  const gap = diff.minGap + rng() * (diff.maxGap - diff.minGap);
  const y = prevY + gap;

  const wantTask =
    tasks.length > 0 &&
    (sinceTask >= diff.taskMax ||
      (sinceTask >= diff.taskMin && rng() < 0.22));

  let kind: PlatKind = "normal";
  let w = diff.platWidth * (0.94 + rng() * 0.12);
  let amp = 0;
  let task: PuzzleTask | null = null;
  if (wantTask) {
    kind = "task";
    w = diff.platWidth * 1.05;
    task = tasks[Math.floor(rng() * tasks.length)];
  } else {
    const r = rng();
    if (r < diff.springChance) {
      kind = "spring";
      w = diff.platWidth * 0.9;
    } else if (r < diff.springChance + diff.breakChance) {
      kind = "break";
      w = diff.platWidth * 0.85;
    } else if (r < diff.springChance + diff.breakChance + diff.movingChance) {
      kind = "moving";
      w = diff.platWidth;
      amp = 40 + rng() * 60;
    }
  }

  // Reachability guarantee: the next platform always stays within the
  // horizontal travel budget of the jump that reaches its height.
  const reach = Math.max(30, maxTravel(gap) - (amp + 34));
  const dir = rng() < 0.5 ? -1 : 1;
  const dx = dir * rng() * reach;
  let cx = prevCx + dx;
  const half = w / 2;
  if (kind === "moving") {
    cx = clamp(cx, half + 14 + amp, DOODLE_LW - half - 14 - amp);
  } else {
    cx = clamp(cx, half + 14, DOODLE_LW - half - 14);
  }

  return { plat: { y, cx, w, kind, amp, task }, sinceTask: wantTask ? 0 : sinceTask + 1 };
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

const PLAT_COLORS: Record<PlatKind, { main: string; top: string; base: string }> = {
  normal: { main: "#3dd68c", top: "#7cf0b8", base: "#1d6b46" },
  moving: { main: "#ffd23e", top: "#ffe98a", base: "#a5811a" },
  break: { main: "#8a5f4e", top: "#a97a63", base: "#5d3e32" },
  spring: { main: "#3dd68c", top: "#7cf0b8", base: "#1d6b46" },
  task: { main: "#ff8a4a", top: "#ffc49a", base: "#b3541f" },
};
const PLAT_USED_COLOR = { main: "#4a3a33", top: "#6b564c", base: "#332620" };
const TRAIL_COLORS = ["#ffb066", "#ff8a4a", "#ffd9a0", "#ff7c3a"];

export function DoodleTrack({
  difficulty,
  tasks,
  paused,
  bestHeightM,
  onTaskGate,
  onMilestone,
  onOutcome,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const onTaskGateRef = useRef(onTaskGate);
  onTaskGateRef.current = onTaskGate;
  const onMilestoneRef = useRef(onMilestone);
  onMilestoneRef.current = onMilestone;
  const onOutcomeRef = useRef(onOutcome);
  onOutcomeRef.current = onOutcome;

  const keysRef = useRef<Set<string>>(new Set());
  const dragRef = useRef(false);
  const dimsRef = useRef({ w: 0, h: 0, dpr: 1, x0: 0, scale: 1, viewH: DOODLE_VIEW_H });

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rng = makeSeededRng((Date.now() ^ (Math.random() * 0xffffffff)) >>> 0);
    const world: World = {
      plats: [
        {
          y: START_Y,
          cx: DOODLE_LW / 2,
          w: 110,
          kind: "normal",
          amp: 0,
          task: null,
          om: 0,
          ph: 0,
          broken: false,
          fallV: 0,
          rot: 0,
          spin: 0,
          springT: 0,
          taskUsed: true,
        },
      ],
      topY: START_Y,
      topCx: DOODLE_LW / 2,
      sinceTask: 0,
      playerX: DOODLE_LW / 2,
      playerY: START_Y + DOODLE_PLAYER_R * 0.8,
      vy: DOODLE_JUMP_V,
      targetX: DOODLE_LW / 2,
      camY: START_Y - 190,
      maxY: START_Y,
      milestone: 0,
      bounces: 0,
      springs: 0,
      tasksGood: 0,
      tasksBad: 0,
      taskReward: 0,
      taskPenalty: 0,
      fogT: 0,
      phase: "run",
      phaseT: 0,
      pendingTask: null,
      shake: 0,
      flash: null,
      floaters: [],
      particles: [],
      time: 0,
      done: false,
    };

    const platX = (p: Plat): number =>
      p.kind === "moving" ? p.cx + p.amp * Math.sin(p.om * world.time + p.ph) : p.cx;

    const wrapDx = (a: number, b: number): number => {
      const d = Math.abs(a - b);
      return Math.min(d, DOODLE_LW - d);
    };

    // ---- sizing ----
    const resize = () => {
      const r = wrap.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.max(1, r.width);
      const h = Math.max(1, r.height);
      const scale = Math.min(h / DOODLE_VIEW_H, (w * 0.95) / DOODLE_LW);
      dimsRef.current = {
        w,
        h,
        dpr,
        x0: (w - DOODLE_LW * scale) / 2,
        scale,
        viewH: h / scale,
      };
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
      const { x0, scale } = dimsRef.current;
      const rect = canvas.getBoundingClientRect();
      world.targetX = clamp((clientX - rect.left - x0) / scale, 0, DOODLE_LW);
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
    const addFloater = (text: string, color: string, size = 24) => {
      const { w, h } = dimsRef.current;
      world.floaters.push({
        x: w / 2 + (world.playerX / DOODLE_LW - 0.5) * w * 0.3,
        y: h * 0.42,
        vy: -42,
        text,
        color,
        size,
        t: 0,
        life: 1,
      });
    };
    const burst = (wx: number, wy: number, n: number, colors: string[]) => {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = 40 + Math.random() * 130;
        world.particles.push({
          wx,
          wy,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp,
          color: colors[Math.floor(Math.random() * colors.length)],
          size: 2 + Math.random() * 3,
          t: 0,
          life: 0.5 + Math.random() * 0.4,
        });
      }
    };
    const emitOutcome = () => {
      world.done = true;
      onOutcomeRef.current({
        heightM: Math.max(0, Math.floor((world.maxY - START_Y) / DOODLE_METER)),
        bounces: world.bounces,
        springs: world.springs,
        tasksGood: world.tasksGood,
        tasksBad: world.tasksBad,
        taskReward: world.taskReward,
        taskPenalty: world.taskPenalty,
      });
    };

    const generate = () => {
      const { viewH } = dimsRef.current;
      while (world.topY < world.camY + viewH + 240) {
        const { plat, sinceTask } = genPlatform(
          world.topY,
          world.topCx,
          difficulty,
          tasks,
          world.sinceTask,
          rng,
        );
        world.sinceTask = sinceTask;
        world.plats.push({
          ...plat,
          om: 0.9 + rng() * 0.8,
          ph: rng() * Math.PI * 2,
          broken: false,
          fallV: 0,
          rot: 0,
          spin: (rng() < 0.5 ? -1 : 1) * (1.4 + rng() * 1.4),
          springT: 0,
          taskUsed: false,
        });
        world.topY = plat.y;
        world.topCx = plat.cx;
      }
    };

    const land = (p: Plat) => {
      world.playerY = p.y + DOODLE_PLAYER_R * 0.8;
      world.vy = DOODLE_JUMP_V;
      world.bounces++;
      if (p.kind === "spring") {
        world.vy = DOODLE_JUMP_V * DOODLE_SPRING_MULT;
        world.springs++;
        p.springT = 0.3;
        addFloater("ПРУЖИНА!", "#ffd23e", 22);
        burst(world.playerX, world.playerY - DOODLE_PLAYER_R, 14, ["#ffd23e", "#ff8a4a"]);
      }
      if (p.kind === "break" && !p.broken) {
        p.broken = true; // one bounce, then it crumbles away
        burst(p.cx, p.y, 10, ["#8a5f4e", "#5d3e32", "#a97a63"]);
      }
      if (p.kind === "task" && p.task && !p.taskUsed) {
        const task = p.task;
        p.taskUsed = true;
        world.pendingTask = task;
        void onTaskGateRef.current(task).then((success) => {
          if (world.done || world.pendingTask !== task) return;
          world.pendingTask = null;
          if (success) {
            world.taskReward += task.rewardBonus;
            world.tasksGood++;
            world.vy = Math.max(world.vy, DOODLE_JUMP_V * DOODLE_TASK_MULT);
            addFloater(`+${task.rewardBonus} Угольков`, "#3dd68c");
            world.flash = { color: "61,214,140", t: 0.5 };
          } else {
            world.taskPenalty += task.failPenalty;
            world.tasksBad++;
            world.fogT = difficulty.fogSec;
            world.shake = 0.8;
            world.flash = { color: "255,90,78", t: 0.6 };
            addFloater(`−${task.failPenalty} · туман`, "#ff5a4e");
          }
        });
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
      if (world.fogT > 0) world.fogT = Math.max(0, world.fogT - dt);
      for (const f of world.floaters) {
        f.t += dt;
        f.y += f.vy * dt;
        f.vy += 26 * dt;
      }
      world.floaters = world.floaters.filter((f) => f.t < f.life);
      for (const p of world.particles) {
        p.t += dt;
        p.wx += p.vx * dt;
        p.wy += p.vy * dt;
        p.vy -= 160 * dt;
      }
      world.particles = world.particles.filter((p) => p.t < p.life);

      // crumbling platforms fall away
      for (const p of world.plats) {
        if (!p.broken) continue;
        p.fallV += DOODLE_GRAVITY * 0.5 * dt;
        p.y -= p.fallV * dt;
        p.rot += p.spin * dt;
        if (p.springT > 0) p.springT = Math.max(0, p.springT - dt);
      }
      for (const p of world.plats) {
        if (p.springT > 0 && !p.broken) p.springT = Math.max(0, p.springT - dt);
      }

      const blocked = world.pendingTask !== null;
      if (world.phase === "run" && !blocked) {
        // horizontal steering (shortest way around the wrap)
        let dir = 0;
        if (keysRef.current.has("ArrowLeft") || keysRef.current.has("KeyA")) dir -= 1;
        if (keysRef.current.has("ArrowRight") || keysRef.current.has("KeyD")) dir += 1;
        if (dir !== 0) {
          world.targetX += dir * DOODLE_STRAFE * 1.35 * dt;
        }
        if (world.targetX - world.playerX > DOODLE_LW / 2) world.targetX -= DOODLE_LW;
        else if (world.targetX - world.playerX < -DOODLE_LW / 2) world.targetX += DOODLE_LW;
        const dx = clamp(
          world.targetX - world.playerX,
          -DOODLE_STRAFE * dt,
          DOODLE_STRAFE * dt,
        );
        world.playerX += dx;
        if (world.playerX >= DOODLE_LW) {
          world.playerX -= DOODLE_LW;
          world.targetX -= DOODLE_LW;
        } else if (world.playerX < 0) {
          world.playerX += DOODLE_LW;
          world.targetX += DOODLE_LW;
        }

        // vertical physics
        const prevBottom = world.playerY - DOODLE_PLAYER_R * 0.8;
        world.vy -= DOODLE_GRAVITY * dt;
        world.playerY += world.vy * dt;
        const bottom = world.playerY - DOODLE_PLAYER_R * 0.8;

        // trail while rising
        if (world.vy > 150 && Math.random() < 0.7) {
          world.particles.push({
            wx: world.playerX + (Math.random() - 0.5) * 10,
            wy: world.playerY - DOODLE_PLAYER_R * 0.5,
            vx: (Math.random() - 0.5) * 26,
            vy: -30 - Math.random() * 40,
            color: TRAIL_COLORS[Math.floor(Math.random() * TRAIL_COLORS.length)],
            size: 1.6 + Math.random() * 2.2,
            t: 0,
            life: 0.35 + Math.random() * 0.2,
          });
        }

        // landing: bottom crosses a platform top while descending
        if (world.vy < 0) {
          for (const p of world.plats) {
            if (p.broken) continue;
            if (p.y <= prevBottom && p.y > bottom) {
              if (wrapDx(platX(p), world.playerX) <= p.w / 2 + DOODLE_PLAYER_R * 0.55) {
                land(p);
                break;
              }
            }
          }
        }

        world.maxY = Math.max(world.maxY, world.playerY);
        const { viewH } = dimsRef.current;
        world.camY = Math.max(world.camY, world.playerY - viewH * 0.45);
        generate();
        world.plats = world.plats.filter((p) => p.y > world.camY - 200);

        // milestone every 100 m
        const heightM = Math.floor((world.maxY - START_Y) / DOODLE_METER);
        if (Math.floor(heightM / 100) > world.milestone) {
          world.milestone = Math.floor(heightM / 100);
          const m = world.milestone * 100;
          addFloater(`${m} М!`, "#ffd23e", 32);
          burst(world.playerX, world.playerY, 22, ["#ffd23e", "#ff8a4a", "#3dd68c"]);
          world.flash = { color: "255,210,62", t: 0.45 };
          onMilestoneRef.current?.(m);
        }

        // fell below the view — the run is over
        if (world.playerY - DOODLE_PLAYER_R < world.camY - 30) {
          world.phase = "dead";
          world.phaseT = 0;
          world.shake = 0.6;
        }
      } else if (world.phase === "dead") {
        world.vy -= DOODLE_GRAVITY * dt;
        world.playerY += world.vy * dt;
        world.phaseT += dt;
        if (world.phaseT > 1 && !world.done) emitOutcome();
      }
    };

    // ---- draw ----
    const draw = () => {
      const { w, h, dpr, x0, scale } = dimsRef.current;
      if (w < 4 || h < 4) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const shakeAmp = world.shake * 6;
      const ox = shakeAmp ? (Math.random() - 0.5) * shakeAmp : 0;
      const oy = shakeAmp ? (Math.random() - 0.5) * shakeAmp : 0;
      ctx.translate(ox, oy);

      const fieldPx = DOODLE_LW * scale;
      const sx = (wx: number) => x0 + wx * scale;
      const sy = (wy: number) => h - (wy - world.camY) * scale;

      // ---- sky, darker with altitude ----
      const alt = clamp((world.camY - START_Y) / 6000, 0, 1);
      const skyTop = [23 + alt * (5 - 23), 12 + alt * (3 - 12), 11 + alt * (10 - 11)];
      const skyBot = [43 - alt * 23, 23 - alt * 11, 18 - alt * 6];
      const sky = ctx.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, `rgb(${skyTop.map(Math.round)})`);
      sky.addColorStop(1, `rgb(${skyBot.map(Math.round)})`);
      ctx.fillStyle = sky;
      ctx.fillRect(-20, -20, w + 40, h + 40);

      // stars in deterministic 160u bands
      const band0 = Math.floor(world.camY / 160);
      const band1 = Math.ceil((world.camY + h / scale) / 160);
      for (let i = band0; i <= band1; i++) {
        for (let j = 0; j < 5; j++) {
          const frac = (i * 97.13 + j * 61.7) % 1;
          const wy = i * 160 + ((i * 53.7 + j * 37.3) % 1) * 160;
          const px = x0 + frac * fieldPx;
          const py = sy(wy);
          if (py < -10 || py > h + 10) continue;
          const tw = 0.2 + 0.35 * Math.abs(Math.sin(world.time * 1.7 + i + j * 2.3));
          ctx.fillStyle = `rgba(255,220,180,${tw})`;
          ctx.fillRect(px, py, 1.6, 1.6);
        }
      }

      // play field bed + side walls
      ctx.fillStyle = "rgba(26,15,11,0.4)";
      ctx.fillRect(x0, -20, fieldPx, h + 40);
      for (const edge of [x0, x0 + fieldPx]) {
        const g = ctx.createLinearGradient(edge, 0, edge + (edge === x0 ? 10 : -10), 0);
        g.addColorStop(0, "rgba(255,138,74,0.22)");
        g.addColorStop(1, "rgba(255,138,74,0)");
        ctx.fillStyle = g;
        ctx.fillRect(Math.min(edge, edge + (edge === x0 ? 10 : -10)), -20, 10, h + 40);
        ctx.fillStyle = "rgba(255,138,74,0.4)";
        ctx.fillRect(edge - 1, -20, 2, h + 40);
      }

      // Everything world-drawn is clipped to the field: the ember slides
      // behind the side walls when it wraps around an edge, exactly like the
      // classic doodle jump, instead of being ghost-drawn outside the field.
      ctx.save();
      ctx.beginPath();
      ctx.rect(x0, -20, fieldPx, h + 40);
      ctx.clip();

      // altitude lines every 25 m
      const m0 = Math.max(
        1,
        Math.ceil(((world.camY - START_Y) / DOODLE_METER) / 25) * 25,
      );
      const m1 = Math.floor(
        ((world.camY + h / scale - START_Y) / DOODLE_METER) / 25,
      ) * 25;
      ctx.font = `600 ${Math.max(9, 10 * scale)}px system-ui, 'Segoe UI', sans-serif`;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      for (let m = m0; m <= m1; m += 25) {
        const py = sy(START_Y + m * DOODLE_METER);
        ctx.strokeStyle = "rgba(255,180,120,0.08)";
        ctx.lineWidth = 1;
        ctx.setLineDash([6, 8]);
        ctx.beginPath();
        ctx.moveTo(x0 + 6, py);
        ctx.lineTo(x0 + fieldPx - 6, py);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = "rgba(255,180,120,0.3)";
        ctx.fillText(`${m}`, x0 + 8, py - 8);
      }

      // best-height line
      if (bestHeightM != null && bestHeightM > 0) {
        const py = sy(START_Y + bestHeightM * DOODLE_METER);
        if (py > -6 && py < h + 6) {
          ctx.strokeStyle = "rgba(255,210,62,0.4)";
          ctx.lineWidth = 1.5;
          ctx.setLineDash([10, 7]);
          ctx.beginPath();
          ctx.moveTo(x0, py);
          ctx.lineTo(x0 + fieldPx, py);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = "rgba(255,210,62,0.75)";
          ctx.font = `700 ${Math.max(10, 11 * scale)}px system-ui, 'Segoe UI', sans-serif`;
          ctx.textAlign = "right";
          ctx.fillText("рекорд", x0 + fieldPx - 8, py - 9);
        }
      }

      // ---- platforms ----
      const ph = Math.max(3, PLAT_H * scale);
      const drawFlame = (cx0: number, cy0: number, s: number) => {
        const flick = 0.5 + 0.5 * Math.sin(world.time * 9 + cx0);
        ctx.beginPath();
        ctx.moveTo(cx0, cy0 - s * (1.3 + flick * 0.35));
        ctx.quadraticCurveTo(cx0 + s * 0.6, cy0 - s * 0.45, cx0 + s * 0.42, cy0 + s * 0.1);
        ctx.quadraticCurveTo(cx0, cy0 + s * 0.4, cx0 - s * 0.42, cy0 + s * 0.1);
        ctx.quadraticCurveTo(cx0 - s * 0.6, cy0 - s * 0.45, cx0, cy0 - s * (1.3 + flick * 0.35));
        ctx.fillStyle = "#ff8a4a";
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(cx0, cy0 - s * (0.75 + flick * 0.2));
        ctx.quadraticCurveTo(cx0 + s * 0.3, cy0 - s * 0.2, cx0 + s * 0.2, cy0 + s * 0.08);
        ctx.quadraticCurveTo(cx0, cy0 + s * 0.24, cx0 - s * 0.2, cy0 + s * 0.08);
        ctx.quadraticCurveTo(cx0 - s * 0.3, cy0 - s * 0.2, cx0, cy0 - s * (0.75 + flick * 0.2));
        ctx.fillStyle = "#ffd23e";
        ctx.fill();
      };

      const drawPlat = (p: Plat, px: number) => {
        const py = sy(p.y);
        if (py < -40 || py > h + 40) return;
        const wpx = p.w * scale;
        const c = p.kind === "task" && p.taskUsed ? PLAT_USED_COLOR : PLAT_COLORS[p.kind];
        const glow =
          p.kind === "task" && !p.taskUsed
            ? 10 + 7 * Math.sin(world.time * 5)
            : p.kind === "spring"
              ? 6
              : 0;
        if (glow > 0) {
          ctx.shadowColor = PLAT_COLORS[p.kind].main;
          ctx.shadowBlur = glow * scale * 1.6;
        }
        if (p.broken) {
          ctx.globalAlpha = 0.85;
          ctx.translate(px, py);
          ctx.rotate(p.rot);
          ctx.translate(-px, -py);
        }
        // base plate
        ctx.beginPath();
        ctx.roundRect(px - wpx / 2, py, wpx, ph, ph * 0.45);
        ctx.fillStyle = c.base;
        ctx.fill();
        // top face
        ctx.beginPath();
        ctx.roundRect(px - wpx / 2, py, wpx, ph * 0.62, ph * 0.45);
        ctx.fillStyle = c.main;
        ctx.fill();
        // top highlight
        ctx.fillStyle = c.top;
        ctx.fillRect(px - wpx / 2 + 3, py + 1, Math.max(2, wpx - 6), Math.max(1, ph * 0.16));
        ctx.shadowBlur = 0;

        if (p.kind === "break") {
          ctx.strokeStyle = "rgba(30,15,10,0.7)";
          ctx.lineWidth = Math.max(1, 1.6 * scale);
          ctx.beginPath();
          ctx.moveTo(px - wpx * 0.22, py);
          ctx.lineTo(px - wpx * 0.08, py + ph * 0.55);
          ctx.lineTo(px + wpx * 0.1, py + ph * 0.2);
          ctx.lineTo(px + wpx * 0.24, py + ph * 0.7);
          ctx.stroke();
        }
        if (p.kind === "moving") {
          ctx.fillStyle = "rgba(60,35,5,0.8)";
          const s = Math.max(3, 6 * scale);
          for (const sgn of [-1, 1]) {
            const ax = px + sgn * (wpx / 2 - s * 1.2);
            ctx.beginPath();
            ctx.moveTo(ax, py + ph * 0.31);
            ctx.lineTo(ax + sgn * s, py + ph * 0.5);
            ctx.lineTo(ax, py + ph * 0.69);
            ctx.closePath();
            ctx.fill();
          }
        }
        if (p.kind === "spring") {
          const coilH = (p.springT > 0 ? 6 : 15) * scale;
          const topY2 = py - coilH;
          ctx.strokeStyle = "#ff8a4a";
          ctx.lineWidth = Math.max(1.5, 2.4 * scale);
          ctx.beginPath();
          ctx.moveTo(px - 7 * scale, py);
          ctx.lineTo(px + 7 * scale, py - coilH * 0.33);
          ctx.lineTo(px - 7 * scale, py - coilH * 0.66);
          ctx.lineTo(px + 7 * scale, topY2);
          ctx.stroke();
          ctx.beginPath();
          ctx.roundRect(px - 10 * scale, topY2 - 4 * scale, 20 * scale, 5 * scale, 2.5 * scale);
          ctx.fillStyle = "#ffb27a";
          ctx.fill();
        }
        if (p.kind === "task" && !p.taskUsed) {
          drawFlame(px, py - 6 * scale, Math.max(6, 11 * scale));
        }
        if (p.broken) {
          ctx.translate(px, py);
          ctx.rotate(-p.rot);
          ctx.translate(-px, -py);
          ctx.globalAlpha = 1;
        }
      };

      // Platforms are generated strictly inside the field (cx is clamped with
      // width/amp margins), so unlike the player they never wrap — drawing a
      // wrapped copy here would paint ghosts outside the side walls.
      for (const p of world.plats) {
        drawPlat(p, sx(platX(p)));
      }

      // ---- particles (world space) ----
      for (const p of world.particles) {
        const a = clamp(1 - p.t / p.life, 0, 1);
        ctx.globalAlpha = a;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(sx(p.wx), sy(p.wy), p.size * scale, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // ---- player ember: layered flame mascot ----
      const drawEmber = (px: number) => {
        const py = sy(world.playerY);
        const r = DOODLE_PLAYER_R * scale;
        if (py < -80 || py > h + 80) return;

        const dead = world.phase === "dead";
        // squash & stretch by vertical speed, lean into the steering
        const stretch = 1 + Math.min(0.28, Math.abs(world.vy) / 3400);
        const rx = r / stretch;
        const ry = r * stretch;
        const look = clamp((world.targetX - world.playerX) / 60, -1, 1);
        const flick = Math.sin(world.time * 13) * 0.5 + Math.sin(world.time * 23 + 1.7) * 0.3;
        const sway = flick * r * 0.3 + look * r * 0.18;
        // the flame perks up while rising and droops a little while falling
        const tipLen =
          r * (1.0 + Math.max(0, world.vy) / 2400 -
            (world.vy < 0 ? Math.min(0.25, -world.vy / 3000) : 0));

        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(look * 0.16);

        // aura — flares up with speed
        const glowR = r * (2.1 + Math.min(0.9, Math.abs(world.vy) / 1700));
        const halo = ctx.createRadialGradient(0, 0, r * 0.3, 0, 0, glowR);
        halo.addColorStop(0, "rgba(255,150,70,0.42)");
        halo.addColorStop(1, "rgba(255,110,40,0)");
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(0, 0, glowR, 0, Math.PI * 2);
        ctx.fill();

        // flame teardrop with a swaying tip: round belly, sweeping sides
        const flame = (w: number, hb: number, tip: number, sw: number) => {
          ctx.beginPath();
          ctx.moveTo(-w, -hb * 0.1);
          ctx.bezierCurveTo(-w, hb, w, hb, w, -hb * 0.1);
          ctx.bezierCurveTo(
            w * 0.92, -hb * 0.72,
            w * 0.34 + sw * 0.45, -hb - tip * 0.55,
            sw, -hb - tip,
          );
          ctx.bezierCurveTo(
            -w * 0.34 + sw * 0.45, -hb - tip * 0.55,
            -w * 0.92, -hb * 0.72,
            -w, -hb * 0.1,
          );
          ctx.closePath();
        };

        // outer coat + sticker outline
        flame(rx * 1.14, ry * 1.22, tipLen, sway);
        let g = ctx.createLinearGradient(0, ry, 0, -ry - tipLen);
        g.addColorStop(0, "#c8401c");
        g.addColorStop(0.5, "#f26a28");
        g.addColorStop(1, "#ff9a4e");
        ctx.fillStyle = g;
        ctx.fill();
        ctx.lineWidth = Math.max(1.2, r * 0.08);
        ctx.strokeStyle = "rgba(60,20,8,0.55)";
        ctx.stroke();

        // mid coat
        flame(rx * 0.85, ry * 1.02, tipLen * 0.62, sway * 0.8);
        g = ctx.createLinearGradient(0, ry, 0, -ry - tipLen * 0.62);
        g.addColorStop(0, "#ff8a3c");
        g.addColorStop(1, "#ffcf8a");
        ctx.fillStyle = g;
        ctx.fill();

        // hot core — the face lives here
        const core = ctx.createRadialGradient(
          -rx * 0.2, ry * 0.05, rx * 0.1,
          0, ry * 0.22, rx * 1.05,
        );
        core.addColorStop(0, "#fff7e6");
        core.addColorStop(0.6, "#ffe0ae");
        core.addColorStop(1, "#ffb877");
        ctx.beginPath();
        ctx.ellipse(0, ry * 0.26, rx * 0.8, ry * 0.66, 0, 0, Math.PI * 2);
        ctx.fillStyle = core;
        ctx.fill();

        // face: blinking eyes with highlights, blush, smile (frown when falling to death)
        const blinkCycle = world.time % 3.9;
        const blinkK =
          blinkCycle > 3.62 ? Math.sin(((blinkCycle - 3.62) / 0.28) * Math.PI) : 0;
        const eyeH = dead ? 0.12 : 1 - 0.92 * blinkK;
        const eyeY = ry * 0.1;
        const eyeX = rx * 0.32;
        const ink = "#43140a";
        for (const sgn of [-1, 1]) {
          ctx.beginPath();
          ctx.ellipse(
            sgn * eyeX + look * rx * 0.1,
            eyeY,
            rx * 0.155,
            Math.max(0.03, rx * 0.23 * eyeH),
            0,
            0,
            Math.PI * 2,
          );
          ctx.fillStyle = ink;
          ctx.fill();
          if (eyeH > 0.4) {
            ctx.beginPath();
            ctx.arc(
              sgn * eyeX + look * rx * 0.1 - rx * 0.05,
              eyeY - rx * 0.07,
              rx * 0.05,
              0,
              Math.PI * 2,
            );
            ctx.fillStyle = "rgba(255,252,245,0.95)";
            ctx.fill();
          }
          // blush
          ctx.beginPath();
          ctx.ellipse(sgn * rx * 0.56, ry * 0.42, rx * 0.13, rx * 0.075, 0, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(255,110,95,0.32)";
          ctx.fill();
        }
        ctx.strokeStyle = ink;
        ctx.lineWidth = Math.max(1.2, r * 0.07);
        ctx.lineCap = "round";
        ctx.beginPath();
        if (dead) {
          ctx.arc(look * rx * 0.06, ry * 0.62, rx * 0.16, Math.PI * 1.15, Math.PI * 1.85);
        } else {
          ctx.arc(look * rx * 0.06, ry * 0.42, rx * 0.16, Math.PI * 0.15, Math.PI * 0.85);
        }
        ctx.stroke();

        // orbiting sparks
        for (let i = 0; i < 3; i++) {
          const a = world.time * 2.1 + i * 2.094;
          const ox = Math.cos(a) * rx * 1.55;
          const oy = Math.sin(a * 1.37 + i) * ry * 0.9 - ry * 0.15;
          const al = 0.35 + 0.3 * Math.sin(world.time * 6 + i * 2.1);
          ctx.beginPath();
          ctx.arc(ox, oy, Math.max(1, r * 0.075), 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255,210,130,${al.toFixed(3)})`;
          ctx.fill();
        }

        ctx.restore();
      };
      if (world.phase !== "dead" || world.phaseT < 0.6) {
        drawEmber(sx(world.playerX));
      }
      ctx.restore();

      // ---- fog punishment ----
      if (world.fogT > 0) {
        const psx = sx(world.playerX);
        const psy = sy(world.playerY);
        const r0 = 130 * scale;
        const r1 = Math.max(r0 * 1.6, Math.max(w, h) * 0.55);
        const fog = ctx.createRadialGradient(psx, psy, r0, psx, psy, r1);
        fog.addColorStop(0, "rgba(10,6,16,0)");
        fog.addColorStop(0.55, "rgba(10,6,16,0.55)");
        fog.addColorStop(1, "rgba(10,6,16,0.94)");
        ctx.fillStyle = fog;
        ctx.fillRect(-20, -20, w + 40, h + 40);
      }

      // ---- floaters (screen space) ----
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

      ctx.translate(-ox, -oy);

      // ---- HUD (no shake) ----
      const heightM = Math.max(0, Math.floor((world.playerY - START_Y) / DOODLE_METER));
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `800 22px system-ui, 'Segoe UI', sans-serif`;
      ctx.lineWidth = 4;
      ctx.strokeStyle = "rgba(12,6,5,0.85)";
      ctx.fillStyle = "#ffe0a8";
      const hudX = x0 + fieldPx / 2;
      ctx.strokeText(`${heightM} м`, hudX, 22);
      ctx.fillText(`${heightM} м`, hudX, 22);
      ctx.font = `700 10px system-ui, 'Segoe UI', sans-serif`;
      ctx.fillStyle = "rgba(176,112,77,0.9)";
      ctx.fillText("ВЫСОТА", hudX, 40);

      if (world.fogT > 0) {
        const label = `Туман ${Math.ceil(world.fogT)} с`;
        ctx.font = `700 12px system-ui, 'Segoe UI', sans-serif`;
        const tw = ctx.measureText(label).width;
        const bw = tw + 22;
        const bx = x0 + fieldPx - bw - 10;
        ctx.beginPath();
        ctx.roundRect(bx, 12, bw, 24, 12);
        ctx.fillStyle = "rgba(18,10,28,0.85)";
        ctx.fill();
        ctx.strokeStyle = "rgba(150,110,200,0.6)";
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = "#c9b3e8";
        ctx.textAlign = "center";
        ctx.fillText(label, bx + bw / 2, 24);
      }

      // flash
      if (world.flash) {
        ctx.fillStyle = `rgba(${world.flash.color},${clamp(world.flash.t, 0, 1) * 0.22})`;
        ctx.fillRect(0, 0, w, h);
      }
      // vignette
      const vg = ctx.createRadialGradient(
        w / 2, h * 0.55, h * 0.35, w / 2, h * 0.55, Math.max(w, h) * 0.72,
      );
      vg.addColorStop(0, "rgba(6,3,2,0)");
      vg.addColorStop(1, "rgba(6,3,2,0.42)");
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, w, h);
      // dead fade
      if (world.phase === "dead") {
        const a = clamp(world.phaseT / 0.6, 0, 1) * 0.55;
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
    // The level is generated once per mount; the parent remounts the
    // component (key) to restart, so difficulty/tasks are read at mount only.
  }, []);

  return (
    <div className="doodle-canvas-wrap" ref={wrapRef}>
      <canvas ref={canvasRef} />
    </div>
  );
}
