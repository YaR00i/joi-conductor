import type {
  Block,
  BlockGoal,
  QuestExerciseKind,
  QuestId,
  QuestOffer,
  SessionMode,
  SessionMood,
} from "./types";
import { BEAT_LEAD_IN_MS } from "./beatTiming";
import { getActiveMistress } from "./mistress";
import { questPlayBiasWeight } from "./mistress/playBias";

export type QuestDef = {
  id: QuestId;
  nameRu: string;
  ruleRu: string;
  durationSec: number;
  rewardMin: number;
  rewardMax: number;
  goal: BlockGoal;
  functionId: string;
  patternId: string;
  bpm: number;
  holdSec?: number;
  exerciseKind: QuestExerciseKind;
  /** Default booru tags for temporary quest media cache. */
  mediaTags?: string;
};

export type { QuestOffer, QuestId };
export type { ActiveQuest } from "./types";

export const QUEST_CATALOG: QuestDef[] = [
  {
    id: "ball_taps",
    nameRu: "Ударь по яйцам",
    ruleRu: "Лёгких ударов по яйцам в темп. Не рвись — отметь в конце.",
    durationSec: 20,
    rewardMin: 8,
    rewardMax: 12,
    goal: "stroke",
    functionId: "cbt_light",
    patternId: "meter_straight",
    bpm: 70,
    exerciseKind: "cbt",
    mediaTags: "rating:explicit cbt ballbusting",
  },
  {
    id: "edge_rush",
    nameRu: "Дойди до эджа",
    ruleRu: "Догони грань за отведённое время. Сделал — отметь.",
    durationSec: 30,
    rewardMin: 10,
    rewardMax: 15,
    goal: "edge",
    functionId: "stroke_left",
    patternId: "meter_1_2",
    bpm: 90,
    exerciseKind: "edge",
    mediaTags: "rating:explicit edging",
  },
  {
    id: "stroke_count",
    nameRu: "Счёт движений",
    ruleRu:
      "Движение на каждый бит. Набери цель на счётчике — квест закроется сам.",
    durationSec: 22,
    rewardMin: 8,
    rewardMax: 14,
    goal: "stroke",
    functionId: "stroke_right",
    patternId: "meter_1_2_2",
    bpm: 80,
    exerciseKind: "count",
    mediaTags: "rating:explicit 1girl solo",
  },
  {
    id: "hands_off",
    nameRu: "Руки прочь",
    ruleRu: "Никаких касаний. Смотри кэш кадра и терпи до конца.",
    durationSec: 20,
    rewardMin: 6,
    rewardMax: 10,
    goal: "rest",
    functionId: "rest_hands_off",
    patternId: "meter_straight",
    bpm: 40,
    exerciseKind: "rest",
    mediaTags: "rating:explicit tease",
  },
  {
    id: "fetish_focus",
    nameRu: "Фокус на фетиш",
    ruleRu: "Дрочи на временный кэш тега. Честно отметь в конце.",
    durationSec: 25,
    rewardMin: 10,
    rewardMax: 16,
    goal: "stroke",
    functionId: "stroke_two_hands",
    patternId: "special_half",
    bpm: 65,
    exerciseKind: "media",
    mediaTags: "rating:explicit fetish",
  },
  {
    id: "slow_edge",
    nameRu: "Медленный эдж",
    ruleRu: "Медленно к грани. Без срыва. Удержал — отметь.",
    durationSec: 40,
    rewardMin: 12,
    rewardMax: 18,
    goal: "hold",
    functionId: "stroke_shaft_only",
    patternId: "special_half",
    bpm: 48,
    holdSec: 8,
    exerciseKind: "hold",
    mediaTags: "rating:explicit edging",
  },
  {
    id: "bpm_sync",
    nameRu: "В ритм",
    ruleRu:
      "Каждый бит — движение. Набери цель на счётчике — квест закроется сам.",
    durationSec: 22,
    rewardMin: 8,
    rewardMax: 12,
    goal: "stroke",
    functionId: "stroke_left",
    patternId: "meter_1_2_1_2_2",
    bpm: 88,
    exerciseKind: "sync",
    mediaTags: "rating:explicit 1girl",
  },
];

export type QuestOfferContext = {
  mood: SessionMood;
  fetishKey?: string | null;
};

function randInt(rng: () => number, min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function pickWeighted<T>(
  rng: () => number,
  items: T[],
  weightOf: (item: T) => number,
): T {
  const weights = items.map((item) => Math.max(0.01, weightOf(item)));
  const total = weights.reduce((a, b) => a + b, 0);
  let roll = rng() * total;
  for (let i = 0; i < items.length; i++) {
    roll -= weights[i]!;
    if (roll <= 0) return items[i]!;
  }
  return items[items.length - 1]!;
}

function sanitizeTagToken(raw: string): string {
  return raw.trim().replace(/\s+/g, "_");
}

/**
 * Beats the metronome can actually fire in a quest window.
 * First hit waits BEAT_LEAD_IN_MS; leave a small safety margin.
 */
export function questTargetBeats(bpm: number, durationSec: number): number {
  const leadSec = BEAT_LEAD_IN_MS / 1000;
  const audibleSec = Math.max(4, durationSec - leadSec - 0.4);
  return Math.max(6, Math.floor((Math.max(20, bpm) * audibleSec) / 60));
}

export type BuildQuestOfferOptions = QuestOfferContext & {
  /** Force a catalog quest instead of weighted pick. */
  forceQuestId?: QuestId;
  /** Override reward (e.g. 0 when a linked contract pays instead). */
  rewardOverride?: number;
  /** Prefix / replace rule with contract flavor. */
  contractRuleRu?: string;
  /** Random-pick pool. Forced ids still resolve against the full catalog. */
  pool?: readonly QuestDef[];
};

function finalizeQuestOffer(
  rng: () => number,
  def: QuestDef,
  ctx: BuildQuestOfferOptions,
): QuestOffer {
  let ruleRu = def.ruleRu;
  let mediaTags = def.mediaTags;
  let mediaLabelRu: string | undefined;

  const mistress = getActiveMistress();
  if (def.id === "fetish_focus" && ctx.fetishKey) {
    const token = sanitizeTagToken(ctx.fetishKey);
    mediaTags = `rating:explicit ${token}`;
    mediaLabelRu = ctx.fetishKey;
    ruleRu = `Дрочи на кэш «${ctx.fetishKey}». Медиатека временно заменена — отметь в конце.`;
  } else if (mediaTags) {
    const extras: string[] = [];
    if (mistress.characterTags[0]) extras.push(mistress.characterTags[0]);
    // Soft-lean quest cache toward pack focus (e.g. Furina CBT / prone).
    const focus = mistress.media.focusTags.slice(0, 2);
    for (const tag of focus) {
      if (tag && !mediaTags.includes(tag)) extras.push(tag);
    }
    if (extras.length > 0) mediaTags = `${mediaTags} ${extras.join(" ")}`;
  }

  if (mistress.id === "furina" && def.exerciseKind === "cbt") {
    ruleRu = `Приговор суда: ${ruleRu}`;
  }
  if (ctx.contractRuleRu) {
    ruleRu = ctx.contractRuleRu;
  }

  const durationSec =
    def.id === "hands_off" ? randInt(rng, 15, 25) : def.durationSec;
  const reward =
    ctx.rewardOverride != null
      ? Math.max(0, Math.floor(ctx.rewardOverride))
      : randInt(rng, def.rewardMin, def.rewardMax);

  const targetBeats =
    def.exerciseKind === "count" || def.exerciseKind === "sync"
      ? questTargetBeats(def.bpm, durationSec)
      : undefined;

  if (targetBeats != null && !ctx.contractRuleRu) {
    ruleRu = `${ruleRu} Цель: ${targetBeats} битов.`;
  }

  return {
    id: `qoffer-${Date.now()}-${Math.floor(rng() * 1e6)}`,
    questId: def.id,
    nameRu: def.nameRu,
    ruleRu,
    durationSec,
    reward,
    goal: def.goal,
    functionId: def.functionId,
    patternId: def.patternId,
    bpm: def.bpm,
    holdSec: def.holdSec,
    exerciseKind: def.exerciseKind,
    mediaTags,
    mediaLabelRu,
    targetBeats,
  };
}

export function buildQuestOffer(
  rng: () => number,
  ctx: BuildQuestOfferOptions = { mood: "calm" },
): QuestOffer | null {
  const forced = ctx.forceQuestId
    ? QUEST_CATALOG.find((q) => q.id === ctx.forceQuestId)
    : null;
  if (forced) return finalizeQuestOffer(rng, forced, ctx);
  const pool = ctx.pool ?? QUEST_CATALOG;
  if (pool.length === 0) return null;
  const def = pickWeighted(rng, [...pool], questPlayBiasWeight);
  return finalizeQuestOffer(rng, def, ctx);
}

/** Deterministic catalog offer for contract bridges (CBT etc.). */
export function buildForcedQuestOffer(
  rng: () => number,
  questId: QuestId,
  ctx: Omit<BuildQuestOfferOptions, "forceQuestId"> = { mood: "calm" },
): QuestOffer {
  const offer = buildQuestOffer(rng, { ...ctx, forceQuestId: questId });
  if (offer) return offer;
  return finalizeQuestOffer(rng, QUEST_CATALOG[0]!, ctx);
}

export function makeQuestBlock(
  offer: QuestOffer,
  mode: SessionMode,
): Block {
  const block: Block = {
    id: `quest-${offer.id}`,
    durationSec: offer.durationSec,
    functionId: offer.functionId,
    patternId: offer.patternId,
    bpm: offer.bpm,
    mode,
    modifiers: [],
    goal: offer.goal,
    drive: "beat",
  };
  if (offer.holdSec != null) {
    block.holdSec = offer.holdSec;
  }
  return block;
}

export function isQuestBlockId(blockId: string | undefined): boolean {
  return Boolean(blockId?.startsWith("quest-"));
}

export function questUsesBeatCounter(
  kind: QuestExerciseKind | undefined,
): boolean {
  return kind === "count" || kind === "sync";
}
