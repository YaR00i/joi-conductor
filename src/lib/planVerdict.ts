import type { MistressEmojiId } from "./huTaoEmoji";
import {
  FURINA_OUTCOME_VERDICT,
  type VerdictOutcomeHook,
} from "./furinaVerdict";
import { getActiveMistress } from "./mistress";
import type { PlanRouletteResult } from "./planRoulette";
import {
  pickRouletteVerdictLine,
  type RouletteLine,
} from "./huTaoRouletteLines";
import { MODE_LABELS } from "./labels";
import type { RouletteStepId } from "./rouletteSettings";
import type { SessionMood, SessionMode } from "./types";

export type VerdictHistoryItem = {
  id: RouletteStepId;
  title: string;
  label: string;
};

export type VerdictHeatMeter = {
  id: "heat" | "control" | "chaos";
  label: string;
  value: number;
};

export type VerdictPack = {
  line: RouletteLine;
  faceLabel: string;
  portraitSrc: string;
  orders: string[];
  meters: VerdictHeatMeter[];
};

type OutcomeHook = VerdictOutcomeHook;

function line(text: string, emoji: MistressEmojiId): RouletteLine {
  return { text, emoji };
}

function pick<T>(arr: T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)]!;
}

function clampHeat(n: number): number {
  return Math.max(0, Math.min(5, Math.round(n)));
}

function modeLabel(mode: SessionMode): string {
  return MODE_LABELS[mode]?.nameRu ?? mode;
}

function byId(
  history: VerdictHistoryItem[],
  id: RouletteStepId,
): VerdictHistoryItem | undefined {
  return history.find((h) => h.id === id);
}

function firstOf(
  history: VerdictHistoryItem[],
  ids: RouletteStepId[],
): VerdictHistoryItem | undefined {
  for (const id of ids) {
    const hit = byId(history, id);
    if (hit) return hit;
  }
  return undefined;
}

function hasStep(
  history: VerdictHistoryItem[],
  id: RouletteStepId,
): boolean {
  return history.some((h) => h.id === id);
}

/** Mood → sticker used in the verdict face header. */
export function verdictEmojiForMood(mood: SessionMood): MistressEmojiId {
  switch (mood) {
    case "sweet":
      return "shy";
    case "horny":
      return "smug";
    case "calm":
      return "sleep";
    case "bored":
      return "yawn";
    case "cruel":
      return "angry";
    case "chaotic":
      return "dizzy";
    default: {
      const _exhaustive: never = mood;
      return _exhaustive;
    }
  }
}

function toneOrder(
  mood: SessionMood,
  soft: string,
  hard: string,
  wild: string,
): string {
  switch (mood) {
    case "sweet":
    case "calm":
      return soft;
    case "cruel":
    case "horny":
      return hard;
    case "chaotic":
    case "bored":
      return wild;
    default: {
      const _exhaustive: never = mood;
      return _exhaustive;
    }
  }
}

/** Outcome-specific taunts for «Её приговор» (priority over generic mood). */
const OUTCOME_VERDICT: Record<OutcomeHook, RouletteLine[]> = {
  mystery_finale: [
    line(
      "Финал я тебе сейчас не покажу. Жми «ГОТОВ КОНЧИТЬ» — десять секунд до грани, и колесо скажет, как кончить.",
      "smug",
    ),
    line(
      "Сюрприз берегу до конца. Десять секунд на край — потом рулетка. Молись красиво.",
      "dizzy",
    ),
    line(
      "Расклад без приговора. Исход — на таймере и колесе. Хи-хи. Не подглядывай.",
      "pout",
    ),
    line(
      "Cum? Ruin? Denial? Узнаешь после десяти секунд и крутки. До того — только край и мои шутки.",
      "angry",
    ),
  ],
  chastity: [
    line(
      "Клетка. Замок щёлкнет — и этот жалкий член станет украшением. Вибрируй, скули, но не трогай. Моё.",
      "pout",
    ),
    line(
      "Chastity. Руки прочь. Игрушки — только те, что я разрешу. Бессилие тебе идёт… почти мило.",
      "smug",
    ),
    line(
      "В клетке ты честнее. Никакого героизма — только просьбы и мокрые глаза.",
      "angry",
    ),
  ],
  cbt: [
    line(
      "CBT. Яйца и член — под мой счёт. Не геройствуй. Считай удары вслух.",
      "angry",
    ),
    line(
      "Боль по расписанию. Хи-хи. Дыши ровнее — пригодится.",
      "smug",
    ),
    line(
      "Tide-день. CBT в раскладе. Я смотрю, ты считаешь, колесо уже всё решило.",
      "pout",
    ),
  ],
  anal: [
    line(
      "Анал. Ооо… сегодня дырочка работает на меня. Глубже, медленнее, пока не забудешь, где у тебя руки.",
      "shock",
    ),
    line(
      "Дилдо вместо жалости. Ритм мой. Если скулишь — я только ускорю.",
      "smug",
    ),
    line(
      "Анальный расклад. Расслабься… или не расслабляйся. Мне весело в обоих случаях.",
      "dizzy",
    ),
  ],
  onahole: [
    line(
      "Онахол. Честная дырка для честной твари. Трахай игрушку так, будто это единственное, что тебе позволено.",
      "smug",
    ),
    line(
      "Onahole mode. Ритм тот же — достоинство ниже. Не вынимай, пока я не скажу.",
      "dizzy",
    ),
  ],
  heavy_edges: [
    line(
      "Эджей много. Будешь жить на грани, как послушный датчик. Сорвёшься — накажу. Выдержишь — всё равно накажу… ласково.",
      "smug",
    ),
    line(
      "Карусель эджей. Каждый раз почти… и снова нет. Обожаю этот звук в твоём горле.",
      "pout",
    ),
    line(
      "Край за краем. Ноги мягкие, мозг пустой, член мокрый. Идеальный ты.",
      "angry",
    ),
  ],
  ruins: [
    line(
      "Руины mid. Маленькие убийства оргазма. Сожмись, дёрнись — и получи пустоту. Ещё раз.",
      "smug",
    ),
    line(
      "Тебя будут подводить к пику… и срезать. Красиво. Грязно. По-моему.",
      "angry",
    ),
  ],
  cumplay_heavy: [
    line(
      "Тяжёлый cumplay. После финала не вытрешься и не сбежишь — сделаешь, как сказано, языком и лицом.",
      "smug",
    ),
    line(
      "Грязный ритуал в раскладе. Кончишь — или руин — и всё равно останешься с моим заданием на губах.",
      "angry",
    ),
    line(
      "Cumplay hard. Стыд — часть игры. Чем противнее тебе, тем слаще мне.",
      "pout",
    ),
  ],
  sadistic_tags: [
    line(
      "Садистский слой фетишей. Одетое, злое, унизительное — как раз мой вкус. Улыбайся шире.",
      "angry",
    ),
    line(
      "Последний слой открыт. Здесь уже не «немножко грязно», а по-настоящему. Добро пожаловать.",
      "pout",
    ),
  ],
  hard_tags: [
    line(
      "Тяжёлые фетиши. Не для слабых. Смотри в экран и принимай, что колесо выбрало за тебя.",
      "smug",
    ),
    line(
      "Специфика ждёт. Чем стыднее тег — тем внимательнее я смотрю на твою реакцию.",
      "dizzy",
    ),
  ],
};

/**
 * Highest-priority roll hook for the main verdict quote.
 * Denial and other sharp outcomes beat generic mood lines.
 */
export function detectVerdictOutcome(
  result: PlanRouletteResult,
  history: VerdictHistoryItem[],
): OutcomeHook | null {
  const p = result.params;

  if (p.mode === "chastity") return "chastity";
  if (p.mode === "cbt") return "cbt";
  if (hasStep(history, "cumplay_heavy")) return "cumplay_heavy";
  if (hasStep(history, "tags_sadistic")) return "sadistic_tags";
  if (hasStep(history, "tags_hard")) return "hard_tags";
  if (p.mode === "anal") return "anal";
  if (p.mode === "onahole") return "onahole";
  if (p.edgesTarget >= 10) return "heavy_edges";
  if (
    p.ruinsTarget >= 2 ||
    (byId(history, "ruins")?.label ?? "").includes("2")
  ) {
    return "ruins";
  }

  // Finale land is never pre-rolled — tease the end countdown instead.
  return "mystery_finale";
}

export function pickOutcomeVerdictLine(
  hook: OutcomeHook,
  rng: () => number,
): RouletteLine {
  const pack =
    getActiveMistress().id === "furina"
      ? FURINA_OUTCOME_VERDICT
      : OUTCOME_VERDICT;
  return pick(pack[hook], rng);
}

/**
 * Exactly 3 short RP orders derived from the roll (not a chip dump).
 */
export function buildVerdictOrders(
  result: PlanRouletteResult,
  history: VerdictHistoryItem[],
): string[] {
  const mood = result.mood;
  const p = result.params;
  const mins = Math.max(1, Math.round(p.durationSec / 60));
  const modeRu = modeLabel(p.mode);
  const hook = detectVerdictOutcome(result, history);

  const orders: string[] = [];

  if (hook === "chastity") {
    orders.push(
      toneOrder(
        mood,
        `Клетка на ${mins} мин. Руки — декорация. Слушай вибро и мой голос.`,
        `${mins} мин в замке. Тронешь без спроса — будет хуже, чем отказ.`,
        `Клетка + хаос. ${mins} мин беспомощности. Мне уже смешно.`,
      ),
    );
  } else if (hook === "cbt") {
    orders.push(
      toneOrder(
        mood,
        `CBT ${mins} мин. Считай удары. Без бравады — только точность.`,
        `${mins} мин «${modeRu}». Темп ${p.bpmMin}–${p.bpmMax}. Боль по протоколу.`,
        `CBT + хаос: ${mins} мин, ${p.bpmMin}–${p.bpmMax} BPM. Яйца в постановке.`,
      ),
    );
  } else {
    orders.push(
      toneOrder(
        mood,
        `${mins} мин в режиме «${modeRu}» — без торга и без ускорений с твоей стороны.`,
        `${mins} мин «${modeRu}». Темп ${p.bpmMin}–${p.bpmMax}. Сбился — начинаем жёстче.`,
        `${mins} мин хаоса: «${modeRu}», ${p.bpmMin}–${p.bpmMax} BPM. Правила меняю я.`,
      ),
    );
  }

  if (p.edgesTarget <= 0) {
    orders.push(
      toneOrder(
        mood,
        "Эджей почти нет — держи ровно и не проси финала раньше времени.",
        "Без эджей не значит легко: выдержишь ровно столько, сколько я скажу.",
        "Эджей ноль? Значит буду ломать тебя другими кнопками.",
      ),
    );
  } else if (p.edgesTarget <= 4) {
    orders.push(
      toneOrder(
        mood,
        `Эджи: ${p.edgesTarget}. На грани — стоп и жди моего «можно».`,
        `Эджи: ${p.edgesTarget}. Каждый — маленькая капитуляция. Считай вслух.`,
        `Эджи: ${p.edgesTarget}. Можешь сбиться… мне даже интереснее.`,
      ),
    );
  } else {
    orders.push(
      toneOrder(
        mood,
        `Эджи: ${p.edgesTarget}. Дыши. Не геройствуй — доводи до края аккуратно.`,
        `Эджи: ${p.edgesTarget}. Много. Ноги мягкие — язык ещё мягче.`,
        `Эджи: ${p.edgesTarget}. Карусель. Выпадешь — я только усмехнусь.`,
      ),
    );
  }

  const finish = byId(history, "finish");
  const cumplay = firstOf(history, ["cumplay", "cumplay_heavy"]);
  const fetish = firstOf(history, [
    "tags",
    "tags_medium",
    "tags_hard",
    "tags_sadistic",
  ]);
  const character = byId(history, "character");
  const media = byId(history, "media_type");
  const ruins = byId(history, "ruins");

  if (hook === "mystery_finale") {
    const where = finish?.label;
    orders.push(
      toneOrder(
        mood,
        where
          ? `Место «${where}» — если колесо скажет «да». Сначала «ГОТОВ КОНЧИТЬ», десять секунд до грани — и крутка.`
          : "Финал не в раскладе. «ГОТОВ КОНЧИТЬ» → 10 сек до грани → колесо. Исход только там.",
        where
          ? `Мечтай про «${where}». Решит колесо в конце таймера — не раньше.`
          : "Исход спрятан до конца. Десять секунд на край — потом рулетка.",
        where
          ? `«${where}» или пустые руки? Узнаешь после крутки. Хи-хи.`
          : "Сюрприз в конце: таймер + колесо. Не порть себе кайф подглядыванием.",
      ),
    );
  } else if (hook === "cumplay_heavy" && cumplay) {
    orders.push(
      toneOrder(
        mood,
        `После края: «${cumplay.label}». Грязно, стыдно, по протоколу. Исход колеса — отдельно.`,
        `Cumplay: «${cumplay.label}». Вытришь — только когда я скажу. Сначала — отсчёт финала.`,
        `Ритуал «${cumplay.label}». Чем противнее — тем старательнее. Колесо ещё впереди.`,
      ),
    );
  } else {
    const flavor = cumplay ?? finish ?? fetish ?? character ?? media ?? ruins;

    if (flavor) {
      const label = flavor.label;
      if (cumplay || finish) {
        orders.push(
          toneOrder(
            mood,
            `Если разрешу — «${label}». Разрешение даёт колесо на краю, не этот экран.`,
            `Место/ритуал «${label}» ждёт. Сначала отсчёт финала — потом разговор.`,
            `«${label}» в меню. А победитель? Только на нуле~`,
          ),
        );
      } else if (fetish) {
        orders.push(
          toneOrder(
            mood,
            `Фетиш в кадре: «${label}». Держи фокус — я смотрю.`,
            `Фетиш: «${label}». Это не опция. Это приказ.`,
            `В меню фетишей выпало «${label}». Импровизируй под мой смех.`,
          ),
        );
      } else if (character || media) {
        orders.push(
          toneOrder(
            mood,
            `Экран: «${label}». Смотри туда, когда я скажу «смотри».`,
            `Контент: «${label}». Глаза на экран — руки по правилам.`,
            `На экране «${label}». Путаница разрешена. Скука — нет.`,
          ),
        );
      } else {
        orders.push(
          toneOrder(
            mood,
            `Ещё из расклада: «${label}». Прими и иди дальше.`,
            `Добивка: «${label}». Без обсуждений.`,
            `И вишенка: «${label}». Даже я не всегда знаю, зачем~`,
          ),
        );
      }
    } else {
      orders.push(
        toneOrder(
          mood,
          "Остальное — на краю: отсчёт и колесо. Сейчас дыши и согласись.",
          "Финал спрятан до нуля. Кнопка внизу — твоя клятва.",
          "Дальше будет веселее. Или больнее. Узнаешь на отсчёте.",
        ),
      );
    }
  }

  return orders.slice(0, 3);
}

export function buildVerdictHeat(
  result: PlanRouletteResult,
): VerdictHeatMeter[] {
  const p = result.params;
  const mood = result.mood;
  const mins = p.durationSec / 60;

  let heat = p.edgesTarget / 3;
  if (mood === "horny") heat += 1.5;
  if (mood === "cruel") heat += 1.2;
  if (mood === "sweet") heat -= 0.4;
  if (p.bpmMax >= 140) heat += 0.6;
  if (p.bpmMax <= 80) heat -= 0.4;
  // Finale odds are unknown at verdict — don't tip heat from pCum.

  let control = mins / 25;
  if (p.mode === "chastity") control += 2;
  if (p.mode === "cbt") control += 1.2;
  if (p.mode === "anal") control += 0.8;
  if (mood === "calm") control += 1.4;
  if (mood === "cruel") control += 1;
  if (mood === "chaotic") control -= 0.8;
  if (p.edgesTarget >= 10) control += 0.5;

  let chaos = 1;
  if (mood === "chaotic") chaos += 2.2;
  if (mood === "bored") chaos += 1.2;
  if (mood === "calm") chaos -= 1;
  // Mystery finale always adds a little chaos tease.
  chaos += 0.9;
  if (p.bpmMax - p.bpmMin >= 60) chaos += 0.8;

  return [
    { id: "heat", label: "Жара", value: clampHeat(heat) },
    { id: "control", label: "Контроль", value: clampHeat(control) },
    { id: "chaos", label: "Хаос", value: clampHeat(chaos) },
  ];
}

export function buildVerdictPack(
  result: PlanRouletteResult,
  history?: VerdictHistoryItem[],
): VerdictPack {
  let s = (result.seed ^ 0x9e3779b9) >>> 0;
  const rng = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
  const hist: VerdictHistoryItem[] =
    history ??
    result.summary.map((row) => ({
      id: row.stepId,
      title: row.stepId,
      label: row.labelRu,
    }));

  const hook = detectVerdictOutcome(result, hist);
  const outcomeLine = hook ? pickOutcomeVerdictLine(hook, rng) : null;
  const moodLine = pickRouletteVerdictLine(result.mood, rng);
  const chosen = outcomeLine ?? moodLine;
  const portrait = getActiveMistress().assets.moodPortrait[result.mood];

  return {
    line: { text: chosen.text, emoji: chosen.emoji },
    faceLabel: portrait.labelRu,
    portraitSrc: portrait.src,
    orders: buildVerdictOrders(result, hist),
    meters: buildVerdictHeat(result),
  };
}
