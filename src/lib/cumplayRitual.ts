import { coerceCumplayForFinish } from "./finishCumplayCompat";
import type { FinaleOutcome, SessionMood } from "./types";

export type CumplayStepEffect =
  | "cumplay_ok"
  | "cumplay_fail"
  | "cumplay_soft"
  | "mute";

export type CumplayRitualStep = {
  id: string;
  kind: "command" | "question" | "close";
  speakEn: string;
  labelRu: string;
  options: {
    id: string;
    labelRu: string;
    effect: CumplayStepEffect;
  }[];
};

export type CumplayRitualPlan = {
  cumplayId: string;
  finishId: string;
  outcome: "cum" | "ruin";
  steps: CumplayRitualStep[];
};

const OK_FAIL = (
  okRu: string,
  failRu = "Не смог",
): CumplayRitualStep["options"] => [
  { id: "ok", labelRu: okRu, effect: "cumplay_ok" },
  { id: "fail", labelRu: failRu, effect: "cumplay_fail" },
  { id: "mute", labelRu: "Промолчал", effect: "mute" },
];

const FEEL_OPTS: CumplayRitualStep["options"] = [
  { id: "hot", labelRu: "Возбуждает", effect: "cumplay_ok" },
  { id: "shame", labelRu: "Стыдно", effect: "cumplay_soft" },
  { id: "mute", labelRu: "Промолчал", effect: "mute" },
];

function step(
  id: string,
  kind: CumplayRitualStep["kind"],
  speakEn: string,
  labelRu: string,
  options: CumplayRitualStep["options"],
): CumplayRitualStep {
  return { id, kind, speakEn, labelRu, options };
}

function opening(outcome: "cum" | "ruin", mood: SessionMood): CumplayRitualStep {
  if (outcome === "ruin") {
    return step(
      "open_ruin",
      "command",
      mood === "sweet" || mood === "horny"
        ? "Look at that ruined little drip. Hold still — show me how pathetic it is."
        : "Ruined. Pathetic dribble. Don't wipe. Hold it up where I can mock it.",
      "Покажи руин / не вытирай",
      OK_FAIL("Показал"),
    );
  }
  return step(
    "open_cum",
    "command",
    mood === "cruel" || mood === "chaotic"
      ? "Mess everywhere. Freeze. That load belongs to me now — don't clean yet."
      : "Good boy… look at that cum. Hold it. Don't waste a drop without my word.",
    "Замри и покажи кончу",
    OK_FAIL("Держу"),
  );
}

function finishCommand(finishId: string, outcome: "cum" | "ruin"): CumplayRitualStep | null {
  if (outcome === "ruin") {
    return step(
      "finish_ruin",
      "command",
      "Scoop whatever leaked. Present it on your fingers like an offering.",
      "Собери каплю на пальцы",
      OK_FAIL("Собрал"),
    );
  }
  switch (finishId) {
    case "feet":
      return step(
        "finish_feet",
        "command",
        "Cum on your soles — now stare at those messy feet. Don't wipe.",
        "Смотри на кончу на стопах",
        OK_FAIL("Смотрю"),
      );
    case "face":
      return step(
        "finish_face",
        "command",
        "Facial stays. Look in a mirror if you can — or just feel it cooling on your skin.",
        "Оставь на лице / посмотри",
        OK_FAIL("Оставил"),
      );
    case "chest":
      return step(
        "finish_chest",
        "command",
        "Smear it slow across your chest and stomach. Make it shiny for me.",
        "Размажь по груди / животу",
        OK_FAIL("Размазал"),
      );
    case "glass":
      return step(
        "finish_glass",
        "command",
        "Hold the glass up. Swirl it. You're going to deal with every drop.",
        "Подними стакан / покажи",
        OK_FAIL("Показал"),
      );
    case "drink":
      return step(
        "finish_drink",
        "command",
        "Look at the drink. My cum is in there now — stir it once. Don't sip yet.",
        "Перемешай напиток с кончой",
        OK_FAIL("Готово"),
      );
    case "food":
      return step(
        "finish_food",
        "command",
        "Food's ruined — perfect. You're eating my topping next.",
        "Подготовь еду с кончой",
        OK_FAIL("Готово"),
      );
    case "toy":
      return step(
        "finish_toy",
        "command",
        "Toy's messy. Don't put it away — you're cleaning it with your tongue later.",
        "Оставь игрушку грязной",
        OK_FAIL("Оставил"),
      );
    case "floor":
      return step(
        "finish_floor",
        "command",
        "On the floor like trash. Kneel closer. You're still not free.",
        "Встань на колени у лужи",
        OK_FAIL("Стоял"),
      );
    case "hand":
    default:
      return step(
        "finish_hand",
        "command",
        "Palm up. Show me the pool in your hand — tip tilted so nothing spills.",
        "Ладонь вверх — покажи",
        OK_FAIL("Показал"),
      );
  }
}

function mainCumplay(cumplayId: string, finishId: string): CumplayRitualStep {
  switch (cumplayId) {
    case "none":
      return step(
        "main_none",
        "command",
        "Fine — wipe only when I say. One tissue. No stroking after.",
        "Вытри только по команде",
        OK_FAIL("Вытер"),
      );
    case "hold":
      return step(
        "main_hold",
        "command",
        "Keep holding it. Count to twenty in your head. Eyes on the mess.",
        "Держи 20 секунд на виду",
        OK_FAIL("Удержал"),
      );
    case "smell":
      return step(
        "main_smell",
        "command",
        "Bring it to your nose. Deep breath. Tell yourself you smell owned.",
        "Понюхай свою кончу",
        OK_FAIL("Понюхал"),
      );
    case "smear_lips":
      return step(
        "main_lips",
        "command",
        "Paint your lips with it. Glossy. Don't lick clean yet unless I escalate.",
        "Обмажь губы",
        OK_FAIL("Обмазал"),
      );
    case "smear_chest":
      return step(
        "main_chest",
        "command",
        "Smear across nipples and belly. Rub it in like lotion — filthy lotion.",
        "Размажь по груди",
        OK_FAIL("Размазал"),
      );
    case "taste":
      return step(
        "main_taste",
        "command",
        "Tongue out. Taste it. Hold it on your tongue — don't swallow yet.",
        "Возьми в рот / подержи",
        OK_FAIL("Взял"),
      );
    case "lick_fingers":
      return step(
        "main_lick_fingers",
        "command",
        "Lick every finger clean. Slow. No skipping the webs between.",
        "Вылижи пальцы начисто",
        OK_FAIL("Вылизал"),
      );
    case "swallow":
      return step(
        "main_swallow",
        "command",
        "Swallow. All of it. Open your mouth after and show me empty.",
        "Проглоти всё",
        OK_FAIL("Проглотил"),
      );
    case "snowball_solo":
      return step(
        "main_snowball",
        "command",
        "Mouth, then palm, then mouth again. Snowball yourself. Gross and cute.",
        "Snowball: рот → рука → рот",
        OK_FAIL("Сделал"),
      );
    case "on_food_eat":
      return step(
        "main_food",
        "command",
        finishId === "food"
          ? "Eat it. Bite by bite. My cum is the sauce."
          : "No food? Then lick it off your hand like it was dessert.",
        finishId === "food" ? "Съешь с едой" : "Слизать как с едой",
        OK_FAIL("Съел"),
      );
    case "on_drink":
      return step(
        "main_drink",
        "command",
        finishId === "drink"
          ? "Drink it. Every last sip. My cum is the mixer."
          : "No drink? Then swallow from your hand like a toast to me.",
        finishId === "drink" ? "Выпей с напитком" : "Выпей как из напитка",
        OK_FAIL("Выпил"),
      );
    case "feet_lick":
      return step(
        "main_feet",
        "command",
        finishId === "feet"
          ? "Lick your soles clean. Every wrinkle. Don't stop until shiny."
          : "No feet shot? Lick it off your fingers while imagining soles.",
        finishId === "feet" ? "Слизать со стоп" : "Слизать (как со стоп)",
        OK_FAIL("Слизал"),
      );
    case "lick_toy":
      return step(
        "main_toy",
        "command",
        "Lick the toy clean — cage, plug, whatever wore your mess. Tongue only.",
        "Слизать с игрушки",
        OK_FAIL("Слизал"),
      );
    case "hold_then_wipe":
      return step(
        "main_hold_wipe",
        "command",
        "Hold for ten… now wipe. Only one wipe. Leftovers stay sticky.",
        "Подержи, потом один вытир",
        OK_FAIL("Сделал"),
      );
    case "ruin_inspect":
      return step(
        "main_ruin",
        "command",
        "Describe the drop out loud — weak, wasted, mine to laugh at.",
        "Опиши каплю вслух",
        OK_FAIL("Описал"),
      );
    case "smear_nose":
      return step(
        "main_nose",
        "command",
        "Smear a line across your nose. Breathe it. Own the smell.",
        "Обмажь нос",
        OK_FAIL("Обмазал"),
      );
    case "tongue_hold":
      return step(
        "main_tongue_hold",
        "command",
        "On your tongue. Don't swallow. Count to fifteen. Then wait for permission.",
        "Держи на языке",
        OK_FAIL("Удержал"),
      );
    case "chew":
      return step(
        "main_chew",
        "command",
        "Chew it. Slow. Humiliate yourself with the texture — then swallow.",
        "Пожуй и проглоти",
        OK_FAIL("Сделал"),
      );
    case "spit_catch":
      return step(
        "main_spit_catch",
        "command",
        "Spit it back into your palm. Show me. Then decide — lick or wipe when I say.",
        "Выплюнь в ладонь",
        OK_FAIL("Выплюнул"),
      );
    case "kiss_palm":
      return step(
        "main_kiss_palm",
        "command",
        "Kiss the puddle like a thank-you. Soft lips. Filthy gratitude.",
        "Поцелуй ладонь",
        OK_FAIL("Поцеловал"),
      );
    case "rub_gums":
      return step(
        "main_rub_gums",
        "command",
        "Rub it along your gums with a finger. Don't rinse. Taste stays.",
        "Размажь по дёснам",
        OK_FAIL("Размазал"),
      );
    default:
      return step(
        "main_fallback",
        "command",
        "Do what I asked with the mess. Clean when I say — not before.",
        "Выполни cumplay",
        OK_FAIL("Сделал"),
      );
  }
}

function feelingQuestion(outcome: "cum" | "ruin"): CumplayRitualStep {
  return step(
    "feel",
    "question",
    outcome === "ruin"
      ? "Be honest — ashamed of that ruined mess, or still throbbing for more?"
      : "How does my cum ownership feel — hot, shameful, or both?",
    outcome === "ruin" ? "Как ощущается руин?" : "Как тебе cumplay?",
    FEEL_OPTS,
  );
}

function closing(mood: SessionMood): CumplayRitualStep {
  const sweet = mood === "sweet" || mood === "horny";
  return step(
    "close",
    "close",
    sweet
      ? "Good. Thank me. Hands off. Breathe — session's almost over, still mine."
      : "Thank me for the privilege. Hands off. Don't you dare stroke that soft cock.",
    "Поблагодари и руки прочь",
    [
      { id: "thanks", labelRu: "Спасибо, хозяйка", effect: "cumplay_ok" },
      { id: "mute", labelRu: "Промолчал", effect: "mute" },
    ],
  );
}

function forceEatStep(): CumplayRitualStep {
  return step(
    "force_eat",
    "command",
    "You promised. Eat it. Every drop — for me. Now.",
    "Съешь кончу (обещание)",
    OK_FAIL("Съел", "Не смог"),
  );
}

/** Halfway CEI: already in mouth — ask to swallow like a good boy. */
function temptEatHalfwayStep(): CumplayRitualStep {
  return step(
    "tempt_eat_halfway",
    "command",
    "It's already on your tongue… swallow for me. Be a good boy — finish what you started.",
    "Съешь как хороший мальчик — раз уж во рту",
    OK_FAIL("Съел", "Не смог"),
  );
}

/** Soft CEI: tempt to eat instead of washing/wiping. */
function temptEatSoftStep(): CumplayRitualStep {
  return step(
    "tempt_eat_soft",
    "command",
    "Don't waste it in the sink. Lick it clean and swallow — good boys eat for me.",
    "Съешь как хороший мальчик — вместо того чтобы смыть",
    OK_FAIL("Съел", "Не смог"),
  );
}

/**
 * Ruin CEI: ruined drip is always meant to be eaten (easier than a full load).
 */
function temptEatRuinStep(): CumplayRitualStep {
  return step(
    "tempt_eat_ruin",
    "command",
    "That ruined drip is tiny — easy. Lick it up and swallow. Good boys don't waste a ruin.",
    "Съешь руин — капля маленькая, это легко",
    OK_FAIL("Съел", "Не смог"),
  );
}

const HALFWAY_CUMPLAY_IDS = new Set(["taste", "tongue_hold", "rub_gums"]);

const SOFT_TEMPT_CUMPLAY_IDS = new Set([
  "none",
  "hold",
  "smell",
  "kiss_palm",
  "hold_then_wipe",
  "ruin_inspect",
  "spit_catch",
]);

const EAT_DONE_CUMPLAY_IDS = new Set([
  "swallow",
  "on_food_eat",
  "on_drink",
  "lick_fingers",
  "chew",
  "snowball_solo",
  "lick_toy",
  "feet_lick",
]);

function midContinue(mood: SessionMood): CumplayRitualStep {
  const harsh =
    mood === "cruel" || mood === "chaotic" || mood === "bored";
  return step(
    "mid_continue",
    "close",
    harsh
      ? "Soft cock. Session isn't over — you ruined early and you keep obeying."
      : "Good. Soft cock. We continue — more teasing ahead.",
    "Продолжаем сессию",
    [
      { id: "go", labelRu: "Продолжаем", effect: "cumplay_ok" },
      { id: "mute", labelRu: "Промолчал", effect: "mute" },
    ],
  );
}

/**
 * Short mid-session ruin ritual — does NOT end the session.
 */
export function buildMidRuinRitual(opts: {
  mood: SessionMood;
  cumplayId?: string;
}): CumplayRitualPlan {
  const mood = opts.mood;
  const steps: CumplayRitualStep[] = [
    step(
      "mid_open",
      "command",
      mood === "sweet" || mood === "horny"
        ? "Ruin for me — that weak little drip. Hold it. Don't wipe yet."
        : "Ruin. Pathetic. Hold the drip up. Session keeps going after this.",
      "Покажи руин / не вытирай",
      OK_FAIL("Показал"),
    ),
    step(
      "mid_inspect",
      "command",
      "Scoop it. Smell or show — then wait for my next word.",
      "Собери каплю / покажи",
      OK_FAIL("Собрал"),
    ),
  ];

  // Optional light cumplay if user configured something mean
  const id = opts.cumplayId ?? "none";
  if (id === "smell" || id === "lick_fingers" || id === "smear_lips") {
    steps.push(mainCumplay(id, "hand"));
  } else {
    steps.push(
      step(
        "mid_feel",
        "question",
        "Still twitching, or soft and ashamed already?",
        "Как после руина?",
        FEEL_OPTS,
      ),
    );
  }

  // Mid-ruin always ends with eat (easier CEI on a ruined drip)
  if (!EAT_DONE_CUMPLAY_IDS.has(id)) {
    steps.push(temptEatRuinStep());
  }
  steps.push(midContinue(mood));

  return {
    cumplayId: id === "none" ? "ruin_inspect" : id,
    finishId: "hand",
    outcome: "ruin",
    steps,
  };
}

/**
 * FAB ruin without permission — shame + mess, then punishment rest.
 */
export function buildUnauthorizedRuinRitual(opts: {
  mood: SessionMood;
}): CumplayRitualPlan {
  const harsh =
    opts.mood === "cruel" || opts.mood === "chaotic" || opts.mood === "bored";
  const steps: CumplayRitualStep[] = [
    step(
      "unauth_ruin_open",
      "command",
      harsh
        ? "You ruined WITHOUT my word. Freeze. Hold that pathetic drip where I can see it."
        : "Ruined early… without asking. Hold still. Show me what you wasted.",
      "Замри / покажи руин без приказа",
      OK_FAIL("Показал"),
    ),
    step(
      "unauth_ruin_shame",
      "command",
      "Scoop it. Smell it. You don't get to enjoy this — this is evidence of failure.",
      "Собери и понюхай (без удовольствия)",
      OK_FAIL("Сделал"),
    ),
    temptEatRuinStep(),
    step(
      "unauth_ruin_close",
      "close",
      "Hands off. Rest coming. Extra edges for that little theft.",
      "Hands off — наказание дальше",
      [
        { id: "go", labelRu: "Понял", effect: "cumplay_ok" },
        { id: "mute", labelRu: "Промолчал", effect: "mute" },
      ],
    ),
  ];
  return {
    cumplayId: "unauthorized_ruin",
    finishId: "hand",
    outcome: "ruin",
    steps,
  };
}

/**
 * FAB cum without permission — cleanup shame, then hard denial path.
 */
export function buildUnauthorizedCumRitual(opts: {
  mood: SessionMood;
}): CumplayRitualPlan {
  const harsh =
    opts.mood === "cruel" || opts.mood === "chaotic" || opts.mood === "bored";
  const steps: CumplayRitualStep[] = [
    step(
      "unauth_cum_open",
      "command",
      harsh
        ? "You CAME without permission. Don't wipe. Look at that stolen load."
        : "Early orgasm… without my word. Freeze. Show me the mess you stole.",
      "Замри / покажи кончу без приказа",
      OK_FAIL("Показал"),
    ),
    step(
      "unauth_cum_clean",
      "command",
      harsh
        ? "Scoop every drop. Lick your fingers clean — waste nothing, toy."
        : "Clean it up properly. Taste or smear — then show empty hands.",
      "Собери / вылижи пальцы",
      OK_FAIL("Вылизал"),
    ),
    step(
      "unauth_cum_shame",
      "question",
      "Still proud of that orgasm… or ashamed you broke?",
      "Гордишься или стыдно?",
      [
        { id: "shame", labelRu: "Стыдно", effect: "cumplay_soft" },
        { id: "proud", labelRu: "Горжусь", effect: "cumplay_fail" },
        { id: "mute", labelRu: "Промолчал", effect: "mute" },
      ],
    ),
    step(
      "unauth_cum_close",
      "close",
      harsh
        ? "Denial from here. Soft cock. Hands off. You don't get another climax."
        : "Session continues — but finale is denial now. Soft. Hands off.",
      "Denial дальше — hands off",
      [
        { id: "go", labelRu: "Принимаю", effect: "cumplay_ok" },
        { id: "mute", labelRu: "Промолчал", effect: "mute" },
      ],
    ),
  ];
  return {
    cumplayId: "unauthorized_cum",
    finishId: "hand",
    outcome: "cum",
    steps,
  };
}

const PRECUM_COMMANDS: Omit<CumplayRitualStep, "options">[] = [
  {
    id: "precum_show",
    kind: "command",
    speakEn: "Look — that shiny precum. Pinch the tip. Show me the string.",
    labelRu: "Покажи нитку прекума",
  },
  {
    id: "precum_taste",
    kind: "command",
    speakEn: "Scoop that precum on a finger. Taste it. Don't pretend it's nothing.",
    labelRu: "Собери прекум / попробуй",
  },
  {
    id: "precum_smear",
    kind: "command",
    speakEn: "Smear precum over the head. Use it as lube — slow circles only.",
    labelRu: "Размажь прекум по головке",
  },
  {
    id: "precum_drip",
    kind: "command",
    speakEn: "Let it drip. Catch it. Rub it back into the slit — messy and obedient.",
    labelRu: "Поймай каплю / вотри в щёлочку",
  },
  {
    id: "precum_balls",
    kind: "command",
    speakEn: "Wipe precum down onto your balls. Slick them. Leave the shaft shiny.",
    labelRu: "Смажь яйца прекумом",
  },
  {
    id: "precum_smell",
    kind: "command",
    speakEn: "Hold precum under your nose. Breathe it. That's how needy you are.",
    labelRu: "Понюхай прекум на пальце",
  },
];

/**
 * Short precum-play gate after edges / heavy segments.
 */
export function buildPrecumRitual(opts: {
  mood: SessionMood;
  rng?: () => number;
}): CumplayRitualPlan {
  const rng = opts.rng ?? Math.random;
  const harsh =
    opts.mood === "cruel" || opts.mood === "chaotic" || opts.mood === "bored";
  const pool = [...PRECUM_COMMANDS];
  // Shuffle pick 2 commands
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  const picked = pool.slice(0, 2);
  const steps: CumplayRitualStep[] = picked.map((p) =>
    step(p.id, p.kind, p.speakEn, p.labelRu, OK_FAIL("Сделал")),
  );
  steps.push(
    step(
      "precum_feel",
      "question",
      harsh
        ? "Still leaking, or did I make you drip on purpose?"
        : "More precum coming… or drying up already?",
      "Ещё течёт?",
      [
        { id: "more", labelRu: "Ещё течёт", effect: "cumplay_ok" },
        { id: "less", labelRu: "Меньше", effect: "cumplay_soft" },
        { id: "mute", labelRu: "Промолчал", effect: "mute" },
      ],
    ),
  );
  steps.push(
    step(
      "precum_close",
      "close",
      harsh
        ? "Good. Sticky toy. Hands back when I say — teasing continues."
        : "Cute. Wipe only if I allow. We continue.",
      "Продолжаем",
      [
        { id: "go", labelRu: "Дальше", effect: "cumplay_ok" },
        { id: "mute", labelRu: "Промолчал", effect: "mute" },
      ],
    ),
  );
  return {
    cumplayId: "precum_play",
    finishId: "hand",
    outcome: "ruin",
    steps,
  };
}

/**
 * Build post-finale cumplay ritual for cum/ruin outcomes.
 * Deny → empty plan (caller skips).
 */
export function buildCumplayRitual(opts: {
  outcome: FinaleOutcome;
  finishId: string;
  cumplayId: string;
  mood: SessionMood;
  promiseCumEat?: boolean;
  /** finale = end gate; mid = continue session after */
  context?: "finale" | "mid";
}): CumplayRitualPlan | null {
  if (opts.context === "mid" && opts.outcome === "ruin") {
    return buildMidRuinRitual({
      mood: opts.mood,
      cumplayId: opts.cumplayId,
    });
  }

  if (opts.outcome !== "cum" && opts.outcome !== "ruin") return null;

  const outcome = opts.outcome;
  let cumplayId = coerceCumplayForFinish(
    opts.cumplayId || "none",
    opts.finishId,
  );

  // Ruin defaults to inspect if user left "none"
  if (outcome === "ruin" && cumplayId === "none") {
    cumplayId = coerceCumplayForFinish("ruin_inspect", opts.finishId);
  }

  const steps: CumplayRitualStep[] = [];
  steps.push(opening(outcome, opts.mood));

  const fin = finishCommand(opts.finishId, outcome);
  if (fin) steps.push(fin);

  // Main cumplay action
  steps.push(mainCumplay(cumplayId, opts.finishId));

  let insertedForceEat = false;
  if (
    opts.promiseCumEat &&
    cumplayId !== "swallow" &&
    cumplayId !== "on_food_eat" &&
    cumplayId !== "on_drink"
  ) {
    steps.push(forceEatStep());
    insertedForceEat = true;
  } else if (
    opts.promiseCumEat &&
    (cumplayId === "swallow" || cumplayId === "on_drink")
  ) {
    steps.push(
      step(
        "force_eat_confirm",
        "command",
        "Show me empty. You swallowed for me — good toy.",
        "Покажи пустой рот",
        OK_FAIL("Пусто"),
      ),
    );
    insertedForceEat = true;
  }

  // CEI training: ruin always ends with eat; soft/halfway tempt on cum
  if (!insertedForceEat) {
    if (outcome === "ruin") {
      if (!EAT_DONE_CUMPLAY_IDS.has(cumplayId)) {
        steps.push(temptEatRuinStep());
      }
    } else if (HALFWAY_CUMPLAY_IDS.has(cumplayId)) {
      steps.push(temptEatHalfwayStep());
    } else if (SOFT_TEMPT_CUMPLAY_IDS.has(cumplayId)) {
      steps.push(temptEatSoftStep());
    }
  }

  steps.push(feelingQuestion(outcome));
  steps.push(closing(opts.mood));

  return {
    cumplayId,
    finishId: opts.finishId,
    outcome,
    steps,
  };
}

export function cumplayEffectMoodDelta(effect: CumplayStepEffect): number {
  switch (effect) {
    case "cumplay_ok":
      return 1;
    case "cumplay_soft":
      return 0;
    case "cumplay_fail":
      return -1;
    case "mute":
      return -1;
    default: {
      const _exhaustive: never = effect;
      return _exhaustive;
    }
  }
}
