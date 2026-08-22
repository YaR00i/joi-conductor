import { ACHIEVEMENT_DEFS, levelForValue, loadAchievements } from "./achievements";
import { loadContractJournal } from "./contractJournal";
import { scaleByMood } from "./moodScale";

const CAGE_HOURS_BY_TIER = [4, 4, 8, 8, 12] as const;
const PLUG_HOURS_BY_STEP = [1, 1, 2, 2, 3, 4] as const;
const CBT_TAPS_BY_STEP = [10, 10, 20, 20, 40] as const;

function journalDoneCount(defId: string): number {
  return loadContractJournal().filter(
    (e) => e.contractDefId === defId && e.outcome === "done",
  ).length;
}

function cageAchievementLevel(): number {
  const def = ACHIEVEMENT_DEFS.find((d) => d.id === "cage");
  const hours = loadAchievements().counters.cageHours;
  if (!def) return 0;
  return levelForValue(def.tiers, hours);
}

export type PunishKind = "cage" | "plug" | "cbt" | "deny" | "task";

export type PunishSpec = {
  kind: PunishKind;
  defId: string;
  params: Record<string, string | number>;
  labelRu: string;
};

export function cagePunishSpec(moodScore: number, cageAlreadyOn: boolean): PunishSpec | null {
  if (cageAlreadyOn) return null;
  const level = cageAchievementLevel();
  if (level >= 4) {
    return {
      kind: "cage",
      defId: "chastity_night",
      params: {},
      labelRu: "Ночь в клетке",
    };
  }
  const base = CAGE_HOURS_BY_TIER[Math.min(level, CAGE_HOURS_BY_TIER.length - 1)]!;
  const hours = scaleByMood(base, moodScore, 4, 12);
  return {
    kind: "cage",
    defId: "chastity_locked_hours",
    params: { hours },
    labelRu: `Клетка ${hours} ч`,
  };
}

export function plugPunishSpec(moodScore: number, plugAlreadyOn: boolean): PunishSpec | null {
  if (plugAlreadyOn) return null;
  const done = journalDoneCount("anal_plug_hours");
  const base =
    PLUG_HOURS_BY_STEP[Math.min(done, PLUG_HOURS_BY_STEP.length - 1)]!;
  const hours = scaleByMood(base, moodScore, 1, 6);
  return {
    kind: "plug",
    defId: "anal_plug_hours",
    params: { hours },
    labelRu: `Пробка ${hours} ч`,
  };
}

export function cbtPunishSpec(moodScore: number): PunishSpec {
  const done = journalDoneCount("cbt_taps");
  const base =
    CBT_TAPS_BY_STEP[Math.min(done, CBT_TAPS_BY_STEP.length - 1)]!;
  const taps = scaleByMood(base, moodScore, 10, 40);
  return {
    kind: "cbt",
    defId: "cbt_taps",
    params: { taps },
    labelRu: `${taps} ударов`,
  };
}

export function denyPunishSpec(): PunishSpec {
  return {
    kind: "deny",
    defId: "session_deny_tomorrow",
    params: {},
    labelRu: "Deny до завтра",
  };
}

export function squeezePunishSpec(moodScore: number): PunishSpec {
  const n = scaleByMood(8, moodScore, 5, 12);
  return {
    kind: "cbt",
    defId: "cbt_squeeze",
    params: { n },
    labelRu: `Сжатие ×${n}`,
  };
}

export function icePunishSpec(moodScore: number): PunishSpec {
  const sec = scaleByMood(25, moodScore, 15, 40);
  const n = scaleByMood(3, moodScore, 2, 4);
  return {
    kind: "cbt",
    defId: "cbt_ice",
    params: { sec, n },
    labelRu: `Лёд ${n}×${sec}с`,
  };
}

export function exercisePunishSpec(moodScore: number): PunishSpec {
  const squats = scaleByMood(30, moodScore, 20, 40);
  const pushups = scaleByMood(15, moodScore, 10, 20);
  const plank = scaleByMood(60, moodScore, 40, 90);
  return {
    kind: "task",
    defId: "body_daily_exercise",
    params: { n: squats, taps: pushups, sec: plank },
    labelRu: `Зарядка ${squats}/${pushups}`,
  };
}

export type IdleTaskSpec = {
  defId: string;
  params: Record<string, string | number>;
  labelRu: string;
};

export function idleTaskSpecs(moodScore: number): IdleTaskSpec[] {
  const pinchMin = scaleByMood(8, moodScore, 5, 12);
  const tubeMin = scaleByMood(15, moodScore, 10, 20);
  const sniffMin = scaleByMood(12, moodScore, 8, 15);
  return [
    {
      defId: "body_nipple_pinch",
      params: { minutes: pinchMin },
      labelRu: `Соски ${pinchMin} мин`,
    },
    {
      defId: "media_hypnotube_timer",
      params: { minutes: tubeMin },
      labelRu: `Hypnotube ${tubeMin} мин`,
    },
    {
      defId: "body_socks_sniff",
      params: { minutes: sniffMin },
      labelRu: `Носки ${sniffMin} мин`,
    },
  ];
}

export function punishSpecsForLive(opts: {
  moodScore: number;
  cageOn: boolean;
  plugOn: boolean;
  denialOn: boolean;
}): PunishSpec[] {
  const live: PunishSpec[] = [];
  const cage = cagePunishSpec(opts.moodScore, opts.cageOn);
  if (cage) live.push(cage);
  const plug = plugPunishSpec(opts.moodScore, opts.plugOn);
  if (plug) live.push(plug);
  if (!opts.denialOn) live.push(denyPunishSpec());

  const tasks: PunishSpec[] = [
    squeezePunishSpec(opts.moodScore),
    icePunishSpec(opts.moodScore),
    exercisePunishSpec(opts.moodScore),
  ];

  const session: PunishSpec[] = [cbtPunishSpec(opts.moodScore)];

  const out: PunishSpec[] = [];
  if (live[0]) out.push(live[0]);
  if (tasks[0]) out.push(tasks[0]);
  if (session[0]) out.push(session[0]);
  if (live[1] && out.length < 3) out.push(live[1]);
  return out;
}
