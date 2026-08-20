import { describe, expect, it } from "vitest";
import {
  canLand,
  DOODLE_GRAVITY,
  DOODLE_JUMP_V,
  DOODLE_LW,
  DOODLE_METER,
  DOODLE_PLAYER_R,
  genPlatform,
  makeSeededRng,
  maxTravel,
} from "./DoodleTrack";
import {
  DOODLE_DIFFICULTIES,
  getDoodleDifficulty,
  type DoodleDifficultyId,
} from "../../lib/doodleReward";
import type { PuzzleTask } from "../../lib/puzzleTasks";

/**
 * Balance simulation for the doodle jump: platform columns walked by synthetic
 * climbers of varying quality. Generation must guarantee that the next
 * platform is always reachable from the previous one (perfect play never
 * falls), while sloppy play dies — that's where the punishment loop lives.
 *
 * The simulated climb mirrors the real physics at bounce granularity: from a
 * platform the jumper can land on any platform whose top is within one jump
 * apex AND whose horizontal (wrap) distance fits into the strafe travel
 * budget before descending past it (see canLand in DoodleTrack). Imperfect
 * players additionally miss landings — the tighter the landing (distance
 * close to the travel budget), the more likely — and sometimes get saved by
 * a platform below while falling.
 */

const stubTask: PuzzleTask = {
  id: "stub",
  titleRu: "Задание",
  instructionRu: "Сделай это",
  kind: "edge",
  durationSec: 30,
  rewardBonus: 5,
  failPenalty: 3,
};

const START_Y = 80;
const APEX = (DOODLE_JUMP_V * DOODLE_JUMP_V) / (2 * DOODLE_GRAVITY);

type Policy = "greedy" | "typical" | "weak" | "worst";

interface SimPlat {
  y: number;
  cx: number;
  w: number;
  amp: number;
}

function wrapDx(a: number, b: number): number {
  const d = Math.abs(a - b);
  return Math.min(d, DOODLE_LW - d);
}

/** Climb one seeded column; returns the height (meters) where the sim fell. */
function simulate(
  id: DoodleDifficultyId,
  policy: Policy,
  seed: number,
  maxMeters = 800,
): number {
  const diff = getDoodleDifficulty(id);
  const rng = makeSeededRng(seed);
  const genRng = makeSeededRng(seed ^ 0x9e3779b9);
  const plats: SimPlat[] = [{ y: START_Y, cx: DOODLE_LW / 2, w: 110, amp: 0 }];
  let topY = START_Y;
  let topCx = DOODLE_LW / 2;
  let sinceTask = 0;
  const extend = (upToY: number) => {
    while (topY < upToY) {
      const { plat, sinceTask: st } = genPlatform(
        topY,
        topCx,
        diff,
        [stubTask],
        sinceTask,
        genRng,
      );
      sinceTask = st;
      topY = plat.y;
      topCx = plat.cx;
      plats.push({ y: plat.y, cx: plat.cx, w: plat.w, amp: plat.amp });
    }
  };

  let i = 0;
  extend(START_Y + APEX + 120);
  for (;;) {
    const cur = plats[i];
    const meters = (cur.y - START_Y) / DOODLE_METER;
    if (meters >= maxMeters) return meters;

    extend(cur.y + APEX + 80);
    const cand: SimPlat[] = [];
    for (let j = i + 1; j < plats.length; j++) {
      const p = plats[j];
      if (p.y <= cur.y + 4) continue;
      if (p.y > cur.y + APEX - 8) break;
      cand.push(p);
    }
    const reachOk = (p: SimPlat) =>
      canLand(wrapDx(p.cx, cur.cx), p.y - cur.y, p.amp, p.w / 2);
    const reachable = cand.filter(reachOk);
    const randomCand = cand.length ? cand[Math.floor(rng() * cand.length)] : null;

    // Aim: greedy = best platform every time; the rest sometimes go for a
    // sloppy pick (misjudged distance or a drifting platform).
    let target: SimPlat | null;
    if (policy === "greedy") {
      target = reachable.length ? reachable[reachable.length - 1] : null;
    } else if (policy === "worst") {
      target = randomCand;
    } else {
      const pBest = policy === "typical" ? 0.88 : 0.6;
      target =
        rng() < pBest && reachable.length
          ? reachable[reachable.length - 1]
          : randomCand;
    }
    if (!target || !reachOk(target)) return meters; // fell

    // Execution: landings close to the travel budget get missed; while
    // falling there is a chance to catch a lower platform and climb on.
    const missBase =
      policy === "greedy" ? 0 : policy === "typical" ? 0.05 : policy === "weak" ? 0.16 : 0.55;
    const tight = Math.max(
      0,
      Math.min(
        1,
        (wrapDx(target.cx, cur.cx) -
          (target.amp + target.w / 2 + DOODLE_PLAYER_R * 0.6)) /
          maxTravel(target.y - cur.y),
      ),
    );
    if (rng() < missBase * (0.25 + 0.75 * tight)) {
      const catchBelow = policy === "typical" ? 0.55 : policy === "weak" ? 0.4 : 0.15;
      if (rng() >= catchBelow) return meters; // nothing saved the fall
      // caught a platform below: continue from where we are
      continue;
    }
    i = plats.indexOf(target);
  }
}

function heights(
  id: DoodleDifficultyId,
  policy: Policy,
  runs = 120,
  maxMeters = 800,
): number[] {
  const out: number[] = [];
  for (let s = 1; s <= runs; s++) out.push(simulate(id, policy, s * 7919, maxMeters));
  return out;
}

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

describe("doodle generation invariants", () => {
  for (const diff of DOODLE_DIFFICULTIES) {
    it(`${diff.id}: gaps within tuning, always reachable, tasks spaced`, () => {
      const rng = makeSeededRng(4242 + diff.maxGap);
      let prev = { y: START_Y, cx: DOODLE_LW / 2 };
      let sinceTask = 0;
      let lastTaskIdx = -diff.taskMin;
      let idx = 0;
      for (let n = 0; n < 4000; n++) {
        const { plat, sinceTask: st } = genPlatform(
          prev.y,
          prev.cx,
          diff,
          [stubTask],
          sinceTask,
          rng,
        );
        sinceTask = st;
        const gap = plat.y - prev.y;
        expect(gap).toBeGreaterThanOrEqual(diff.minGap - 0.001);
        expect(gap).toBeLessThanOrEqual(diff.maxGap + 0.001);
        // the vertical gap alone must leave steering headroom under the apex
        expect(diff.maxGap).toBeLessThan(APEX - 20);
        // consecutive platforms are always landable → perfect play never falls
        expect(
          canLand(wrapDx(plat.cx, prev.cx), gap, plat.amp, plat.w / 2),
          `${diff.id} seed row ${n}`,
        ).toBe(true);
        if (plat.kind === "task") {
          expect(idx - lastTaskIdx).toBeGreaterThanOrEqual(diff.taskMin);
          lastTaskIdx = idx;
        }
        idx++;
        prev = { y: plat.y, cx: plat.cx };
      }
    });
  }
});

describe("doodle balance simulation", () => {
  it("greedy play never falls on any difficulty", () => {
    for (const d of DOODLE_DIFFICULTIES) {
      const hs = heights(d.id, "greedy", 120);
      const min = Math.min(...hs);
      expect(min, `${d.id} greedy min height`).toBeGreaterThanOrEqual(780);
    }
  });

  it("typical play climbs high but blunders eventually", () => {
    for (const d of DOODLE_DIFFICULTIES) {
      const hs = heights(d.id, "typical");
      const med = median(hs);
      expect(med, `${d.id} typical median`).toBeGreaterThanOrEqual(120);
      // a blundering climber cannot ride the 800 m cap forever
      expect(Math.min(...hs), `${d.id} typical min`).toBeLessThan(800);
    }
  });

  it("sloppy play falls far below typical play", () => {
    for (const d of DOODLE_DIFFICULTIES) {
      const weakMed = median(heights(d.id, "weak"));
      const typMed = median(heights(d.id, "typical"));
      expect(weakMed, `${d.id} weak vs typical`).toBeLessThan(typMed);
      expect(weakMed, `${d.id} weak median`).toBeLessThan(120);
    }
  });

  it("worst play dies almost immediately", () => {
    for (const d of DOODLE_DIFFICULTIES) {
      const hs = heights(d.id, "worst", 120, 200);
      const diedLow = hs.filter((h) => h < 60).length;
      expect(diedLow / hs.length, `${d.id} worst early deaths`).toBeGreaterThanOrEqual(0.6);
    }
  });

  it("higher difficulties pay out more per meter (reward curve)", () => {
    // sanity link between sim and reward math: same climb, bigger multiplier
    const sample = 150;
    const pay = (id: DoodleDifficultyId) =>
      Math.round(Math.sqrt(sample) * 3.2 * getDoodleDifficulty(id).heightMult);
    expect(pay("warmup")).toBeLessThan(pay("climb"));
    expect(pay("climb")).toBeLessThan(pay("storm"));
  });
});
