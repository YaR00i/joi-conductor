import { getToy } from "./catalog";
import { GOAL_LABELS } from "./labels";
import { getActiveMistress } from "./mistress";
import type {
  BeatPatternDef,
  BlockGoal,
  BlockModifier,
  FunctionDef,
  SessionMode,
} from "./types";

export interface InstructionCardModel {
  goalRu: string;
  titleRu: string;
  summaryRu: string;
  stepsRu: string[];
  patternTitleRu: string;
  patternBodyRu: string;
  toysRu?: string[];
  restRemainingSec?: number;
  restTotalSec?: number;
}

/** Clear, non-redundant copy for the top-left instruction panel. */
export function buildInstructionCard(
  fn: FunctionDef,
  pattern: BeatPatternDef,
  goal: BlockGoal,
  opts?: {
    blockElapsedSec?: number;
    blockDurationSec?: number;
    modifiers?: BlockModifier[];
    holdArmed?: boolean;
    mode?: SessionMode;
  },
): InstructionCardModel {
  const goalRu = GOAL_LABELS[goal].nameRu;
  const toysRu = (opts?.modifiers ?? [])
    .map((m) => {
      const toy = getToy(m.toyId);
      if (!toy) return null;
      const role =
        m.role === "worn" ? "надето" : m.role === "active" ? "в руках" : m.role;
      return `${toy.nameRu}${role ? ` (${role})` : ""}`;
    })
    .filter((x): x is string => Boolean(x));

  const sunnaRest =
    goal === "rest" && getActiveMistress().id === "sunna";
  const stepsRu = dedupeLines(
    sunnaRest
      ? howToExtras(fn.id, opts?.mode)
      : [...fn.cuesRu, ...howToExtras(fn.id, opts?.mode)],
  );

  let summaryRu = fn.descriptionRu;
  if (goal === "rest") {
    summaryRu = sunnaRest
      ? "Отдых по-idol: ствол/клитор не трогай — мягко гладь яички, дыши, жди конца таймера."
      : "Полный стоп. Ничего не трогай, дыши ровно. Жди конца таймера — это отдых или наказание.";
  } else if (goal === "edge") {
    summaryRu = `${fn.descriptionRu} Дойди до края и нажми большую кнопку «Эдж ✓» над ритмом.`;
  } else if (goal === "hold") {
    const armed = opts?.holdArmed === true;
    const left =
      armed && opts?.blockDurationSec != null
        ? Math.max(0, opts.blockDurationSec - (opts.blockElapsedSec ?? 0))
        : null;
    summaryRu = !armed
      ? `${fn.descriptionRu} Есть время выйти на грань — потом жми «Держу грань ✓», затем держи таймер.`
      : left != null && left > 0
        ? `Удерживай грань без дрочки ещё ~${left}с, потом подтверди «Удержал ✓».`
        : `${fn.descriptionRu} Время вышло — подтверди «Удержал ✓».`;
  } else if (goal === "ruin_attempt") {
    summaryRu = `${fn.descriptionRu} Если руинишь по команде — подтверди «Руин ✓».`;
  } else if (goal === "countdown") {
    summaryRu = `${fn.descriptionRu} Держи темп — в конце будет отсчёт 10…1.`;
  } else if (goal === "ladder") {
    summaryRu = `${fn.descriptionRu} Лесенка темпа: ступень ускорения. Не срывайся.`;
  } else if (goal === "finale") {
    summaryRu =
      "Дойди до грани и нажми «НА ГРАНИ». Рулетка крутится по шансам сессии (кончить / руин / отказ) — исход узнаешь, когда она остановится.";
  } else if (goal === "breath") {
    summaryRu =
      "Сначала набери воздух по отсчёту. Потом — челлендж на задержке дыхания. Если стало плохо — выдохни и жми «Сдаюсь».";
  }

  const titleRu =
    goal === "finale" ? "Рулетка финала" : fn.nameRu;

  const restTotal = opts?.blockDurationSec;
  const elapsed = opts?.blockElapsedSec ?? 0;
  const restRemaining =
    goal === "rest" && restTotal != null
      ? Math.max(0, restTotal - elapsed)
      : undefined;

  return {
    goalRu,
    titleRu,
    summaryRu,
    stepsRu:
      goal === "finale"
        ? [
            "Дойди до грани (почти оргазм).",
            "Нажми большую кнопку «НА ГРАНИ».",
            "Смотри рулетку — сегменты = твои шансы.",
          ]
        : stepsRu,
    patternTitleRu: goal === "finale" ? "Исход" : pattern.nameRu,
    patternBodyRu:
      goal === "finale"
        ? "Кончить · Руин · Отказ — размер долей на колесе соответствует вероятностям."
        : pattern.descriptionRu,
    toysRu: toysRu.length ? toysRu : undefined,
    restRemainingSec: restRemaining,
    restTotalSec: goal === "rest" ? restTotal : undefined,
  };
}

function dedupeLines(lines: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const key = line.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(line);
  }
  return out;
}

function howToExtras(functionId: string, mode?: SessionMode): string[] {
  switch (functionId) {
    case "stroke_reverse":
      return [
        "Ладонь разверни: большой палец смотрит к тебе, а не от тебя.",
        "Ход короче обычного — легче попадать в акценты паттерна.",
      ];
    case "stroke_prone":
      return [
        "Ляг на живот. Руки прочь от члена — только бёдра. Счётчика ударов здесь нет.",
        "Упрись стволом в кровать/пол под собой и качай давлением в такт.",
        "На сильную долю сильнее прижмись; между — не сбрасывай ритм.",
      ];
    case "stroke_two_hands":
      return [
        "Одна рука у основания, вторая ближе к головке — или встречное скручивание.",
      ];
    case "stroke_head_only":
      return ["Только головка и уздечка. Ствол не гладить."];
    case "stroke_shaft_only":
      return ["Длинный ход по стволу. Головку не трогай — это тизер."];
    case "cbt_light":
      return [
        "Лёгкие шлепки или сжатия яиц на сильной доле — счётчик ведёт сама.",
        "Ствол не бить. Не выдержал — «НЕ ВЫДЕРЖАЛ». В конце: все удары или только норма.",
      ];
    case "cbt_medium":
      return [
        "Удар или сильное сжатие яиц на сильной доле; между — пауза и дыхание.",
        "Сорвался — «НЕ ВЫДЕРЖАЛ». В конце — признайся: до последнего или только норма.",
      ];
    case "cbt_cock_slap":
      return [
        "Открытой ладонью шлёпай по стволу на сильную долю — счётчик ведёт сама.",
        "Яйца не трогай в этом ходе. Клетка снимает такой ход из очереди.",
        "Не выдержал — «НЕ ВЫДЕРЖАЛ». В конце: все удары или только норма.",
      ];
    case "cbt_cock_thwack":
      return [
        "Плотнее шлепок по стволу на акцент (ладонь или тыльная сторона).",
        "Между — дыхание. Контроль важнее силы.",
        "Сорвался — «НЕ ВЫДЕРЖАЛ». В конце — все или только норма.",
      ];
    case "cbt_head_flick":
      return [
        "Щелчок пальцем по головке / уздечке на сильную долю.",
        "Остро и коротко — не размахивайся. Ствол и яйца не бей.",
        "Не выдержал — «НЕ ВЫДЕРЖАЛ».",
      ];
    case "cbt_underside_tap":
      return [
        "Пальцами тыкай снизу по стволу в такт — на акценте чуть заметнее.",
        "Это tap, не шлепок ладонью. Без клетки.",
        "Сорвался — «НЕ ВЫДЕРЖАЛ».",
      ];
    case "plapping":
      return [
        "Любой дилдо как колотушка. Шлепок по яйцам/члену на сильную долю.",
        "Не смог — «НЕ ВЫДЕРЖАЛ». После блока спрошу: все акценты или только норма.",
      ];
    case "oral_shallow":
      return getActiveMistress().id === "sunna"
        ? [
            "Chorus: мелкий ход на дилдо под бит — это твой припев.",
            "Сильный акцент = глоток/ход. Сорвался — «НЕ ВЫДЕРЖАЛ». Клитор в клетке.",
          ]
        : [
            "Дилдо во рту — мелкий ход губами под бит, без глубины.",
            "Каждая доля = короткий толчок. Слюна ок, глотку не форсируй.",
          ];
    case "oral_deep":
      return getActiveMistress().id === "sunna"
        ? [
            "Chorus deep: на акценте глубже, между — дыхание носом.",
            "Руки на дилдо/игрушке, не на стволе. Не выдержал горло — признайся.",
          ]
        : [
            "На сильной доле — глубже; между — пауза и дыхание носом.",
            "Контроль важнее рекорда глубины. Сорвался — вернись к мелкому ходу.",
          ];
    case "oral_hold":
      return getActiveMistress().id === "sunna"
        ? [
            "Держи глубину в такт — припев без качания.",
            "Яички можно гладить. Ствол/клитор — только клетка и vibe.",
          ]
        : [
            "Зафиксируй глубину и держи давление в такт — почти без качания.",
            "Дыши носом. Если темнеет — чуть вынь и продолжай мелким ходом.",
          ];
    case "anal_thrust":
      return [
        "Рукой не дрочи. Каждый бит = один толчок.",
        "Большой дилдо — короче ход; vibe-средний — вибрация на акцент.",
      ];
    case "hands_off_vibe":
      return getActiveMistress().id === "sunna"
        ? [
            "Buzz: игрушка на клиторе/клетке. Руки не гладят ствол.",
            "Жми «ДЕРЖУ» и продержись таймер — почти кончил = «НЕ ВЫДЕРЖАЛ».",
          ]
        : ["Руки убрать. Только wand или вибропуля."];
    case "vibe_press":
      return [
        "Прижми wand / вибропулю к клетке / членику. Руки только на игрушке.",
        "Buzz hold: выдержи вибрацию, не кончай. Ствол не гладить.",
      ];
    case "edge2_pulse":
      return ["Edge 2: пульс простаты в долю. Без дрочки."];
    case "vibe_plug_active":
      return ["Вибро-пробка — основной стимул. Ход рукой только если разрешено."];
    case "plug_passive": {
      const fill =
        "Пробка или дилдо worn внутри — не вынимай. Слегка гринди бёдрами, без thrust.";
      if (mode === "chastity" || mode === "plapping") {
        return [
          fill,
          "Клетка закрыта: ствол/клитор не гладить — только grind и дыхание.",
        ];
      }
      if (mode === "cbt") {
        return [
          fill,
          "Между ударами/сжатиями сиди на наполненности; руки — на CBT, не на thrust.",
        ];
      }
      // stroke / onahole
      return [
        fill,
        "Основной ход — рука/онахол по биту; попа остаётся наполненной.",
      ];
    }
    case "combo_vibe_plug_wand":
      return ["Два слоя: plug внутри + wand/пуля снаружи. Hands off."];
    case "combo_edge2_wand":
      return ["Edge 2 + wand/пуля синхронно. Сильная доля — оба громче."];
    case "combo_cage_wand":
      return getActiveMistress().id === "sunna"
        ? [
            "Клетка on. Wand / пуля к клитору — руки только на игрушке.",
            "Buzz: держись, не кончай. Членик остаётся игрушкой.",
          ]
        : ["Клетка on. Только wand / вибропуля, руками ствол не гладить."];
    case "combo_cage_vibe_plug":
      return getActiveMistress().id === "sunna"
        ? [
            "Клетка + вибро-plug. Hands-free denial для клитора.",
            "Руки прочь от ствола — только игрушки.",
          ]
        : ["Клетка + вибро-plug. Hands-free denial."];
    case "combo_cage_edge2":
      return ["Клетка + Edge 2 на простату. Без рук на член."];
    case "plapping_cage":
      return [
        "Клетка on. Дилдо — колотушка по яйцам на каждый сильный акцент.",
        "Счётчик считает акценты. Ствол/клитор не гладить. «НЕ ВЫДЕРЖАЛ» — если сорвался.",
      ];
    case "plapping_cage_heavy":
      return [
        "Жёстче: плотные шлепки дилдо по яйцам на акцент.",
        "Между акцентами можно слегка гриндить, если дилдо ещё worn. Клетка не снимается.",
      ];
    case "ball_pet":
      return getActiveMistress().id === "sunna"
        ? [
            "Пощада на сцене: гладь яички — клитор остаётся игрушкой в клетке.",
            "Мягкий ход пальцами в такт. Без шлепков, без ствола.",
          ]
        : [
            "Клетка закрыта — доступны только яички. Гладь мягко в такт.",
            "Это пощада / тизер, не CBT. Ствол не трогать.",
          ];
    case "ball_tug":
      return getActiveMistress().id === "furina"
        ? [
            "Приговор мягкий: на сильной доле подтяни яички вниз — без удара.",
            "Клетка остаётся. Дыши между долями.",
          ]
        : [
            "На сильной доле — мягкий tug яичек вниз/к себе.",
            "Между — отпусти. Ствол в клетке не гладить.",
          ];
    case "ball_cradle":
      return [
        "Согрей яички в ладони под клеткой. Лёгкое сжатие в такт.",
        "Медленно. Это уязвимое место — не сжимай до боли.",
      ];
    case "ball_weight":
      return getActiveMistress().id === "sunna"
        ? [
            "Ладонь снизу: на сильной доле чуть дави весом — клитор в клетке.",
            "Без tug и без шлепка. Между акцентами почти не двигай.",
          ]
        : [
            "Ладонь под яичками. На акценте — лёгкое давление весом руки.",
            "Не тяни и не бей. Между долями почти стоп.",
          ];
    case "rest_hands_off":
      return getActiveMistress().id === "sunna"
        ? [
            "Клитор / ствол не трогай.",
            "Мягко гладь яички, пока идёт таймер — это твой отдых.",
            "Клетку не снимай.",
          ]
        : ["Руки за голову. Ноль касаний. Игрушки можно оставить без стимуляции."];
    default:
      return [];
  }
}
