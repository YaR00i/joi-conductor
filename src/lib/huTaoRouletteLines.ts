import type { MistressEmojiId } from "./huTaoEmoji";
import type { RouletteStepId } from "./planRoulette";
import { getActiveRouletteLinePack } from "./rouletteLines";

export type RouletteLine = {
  text: string;
  emoji: MistressEmojiId;
};

function pick<T>(arr: T[], rng: () => number = Math.random): T {
  return arr[Math.floor(rng() * arr.length)]!;
}

function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => vars[key] ?? "");
}

function line(text: string, emoji: MistressEmojiId): RouletteLine {
  return { text, emoji };
}

const IDLE: RouletteLine[] = [
  line(
    "Ооо~ сегодня ты отдаёшь мне рулетку? Умно. Я выберу всё сама — тебе останется только слушаться.",
    "smug",
  ),
  line(
    "Ха-ха. Закрой глаза… шучу. Смотри на колесо и молись, что я в хорошем настроении.",
    "smug",
  ),
  line(
    "Пусть я решаю? Мм. Тогда не ной потом, что «слишком жестоко».",
    "pout",
  ),
  line(
    "Ночная рулетка открыта. Жми кнопку — или так и будешь глазеть на меня?",
    "shy",
  ),
  line(
    "Я уже придумала пару жестокостей. Осталось крутануть… и ты.",
    "smug",
  ),
];

const IDLE_WAIT: RouletteLine[] = [
  line("Ну? Колесо само не крутится. Или крутится… в моей голове.", "yawn"),
  line("Скучно стоять. Дай мне решить твою судьбу уже.", "pout"),
  line("Я могу ждать вечность. Твой стояк — нет.", "smug"),
  line("Эй. Кнопка зелёная не для декора.", "dizzy"),
  line("Если будешь медлить — накручу тебе пожёстче. Шучу… почти.", "angry"),
];

const AVATAR_CLICK: RouletteLine[] = [
  line("Тыкаешь портрет вместо колеса? Мило. И бесполезно.", "smug"),
  line("Мм? Нравится смотреть? Тогда жми «пусть я решаю».", "shy"),
  line("Руками можно и по кнопке. Я не статуя… почти.", "pout"),
  line("Аха. Поймал. Дальше — рулетка, не тисканье.", "cheer"),
  line("Глазки на мне — угольки и сессия сами себя не соберут.", "dizzy"),
];

const SETTINGS_OPEN: RouletteLine[] = [
  line("Настройки? Ладно. Крути рычажки… я всё равно перерешу.", "smug"),
  line("Ооо, хочешь подкрутить пулы. Смелый. Или трус.", "dizzy"),
  line("Настраивай. Я разрешаю… пока мне весело.", "yawn"),
];

const SETTINGS_CLOSE: RouletteLine[] = [
  line("Хватит копаться. Вернёмся к главному — ко мне.", "smug"),
  line("Панель закрыта. Теперь крути, пока я не передумала.", "cheer"),
];

const RESTART: RouletteLine[] = [
  line("Заново? Ха. Первый раунд тебе не понравился? Жаль~", "smug"),
  line("Крутим с нуля. На этот раз я могу быть злее.", "angry"),
  line("Окей, перетасую. Не привыкай к жалости.", "dizzy"),
];

const CONFIRM_START: RouletteLine[] = [
  line("Погнали. Сессию соберу — ты только не сбеги.", "cheer"),
  line("Начинаем. Дыши ровнее… пригодится.", "smug"),
  line("Принято. Сейчас вытащу тебе картинки и блоки.", "dizzy"),
  line("Хи~ подчинился. Жди — я раскладываю пытку.", "cheer"),
];

const ERROR: RouletteLine[] = [
  line("Упс. Что-то сломалось… не я. Попробуй ещё раз.", "shock"),
  line("Сессия не собралась. Почини мир — или жми снова.", "pout"),
  line("Ошибка. Даже я иногда… почти… ошибаюсь. Почти.", "dizzy"),
];

const EMPTY_STEPS: RouletteLine[] = [
  line("Все шаги выключены. Включи хоть один — я не фокусник без реквизита.", "angry"),
  line("Пустая рулетка? В настройках включи шаги, умник.", "pout"),
];

const SPIN: Record<RouletteStepId, RouletteLine[]> = {
  mood: [
    line("Сначала — кто я сегодня. Добрая… или та, от которой ты дрожишь?", "smug"),
    line("Кручу настроение~ Не моргай, а то пропустишь момент.", "dizzy"),
    line("Mood wheel. Улыбайся — или не надо. Мне всё равно.", "shy"),
  ],
  mode: [
    line("Чем будешь служить? Руками… или клеткой? Хи~", "smug"),
    line("Режим сессии. Выбираю, как тебя ломать.", "dizzy"),
    line("Mode… классика или что-то постыднее?", "cheer"),
  ],
  duration: [
    line(
      "Сколько тебя держать на крючке? Минуты летят быстро, когда тебе плохо~",
      "dizzy",
    ),
    line("Длительность… я люблю, когда ты думаешь, что вот-вот конец.", "smug"),
    line("Таймер пытки. Кручу.", "yawn"),
  ],
  edges: [
    line("Эджи. Чем больше — тем слаще твоя беспомощность.", "dizzy"),
    line("Считаю грани. Ты же любишь останавливаться на краю, да?", "smug"),
    line("Edges… задержи дыхание заранее.", "shock"),
  ],
  ruins: [
    line("Руины mid… иногда я люблю испортить тебе оргазм заранее~", "smug"),
    line("Может, обойдёмся без руинов. А может — нет.", "dizzy"),
    line("Ruin count. Маленькая жестокость на разогрев.", "pout"),
  ],
  finaleOdds: [
    line("Финал. Cum, ruin или denial — кручу, а ты трясёшься.", "dizzy"),
    line("Шансы финала. Не вздумай надеяться слишком сильно.", "smug"),
    line("Finale odds. Молись тихо.", "angry"),
  ],
  finish: [
    line("Куда кончишь, если я позволю… Хи-хи.", "shy"),
    line("Место для месси. Я уже представляю картинку.", "dizzy"),
    line("Finish spot. Красиво будет… или грязно. Или оба.", "smug"),
  ],
  cumplay: [
    line("Cumplay — мягко… или кнопка «тяжёлые»?", "dizzy"),
    line("Что делать с месси. Обычные варианты — или глубже.", "smug"),
    line("Cumplay wheel. Не отводи глаз.", "shy"),
  ],
  cumplay_heavy: [
    line("Тяжёлый cumplay. Глотать, жевать, размазывать…", "angry"),
    line("Без пощады. Выбираю грязный финал.", "pout"),
    line("Heavy layer. Ты сам эскалировал. Помни.", "smug"),
  ],
  bpm: [
    line("Темп. Быстро или медленно мучить — вот в чём вкус.", "dizzy"),
    line("BPM… я люблю, когда ты не успеваешь дышать.", "smug"),
    line("Ритм. Сердце тоже подстроится.", "cheer"),
  ],
  tags: [
    line("Твои лайки… и то, что ты избегаешь. Кручу колоду.", "dizzy"),
    line("Двенадцать тегов под моё настроение. Не ной.", "smug"),
    line("Избранное vs редкое. Угадаешь, что выпадет?", "shy"),
  ],
  tags_medium: [
    line("Средний слой фетишей. Уже не так мило.", "dizzy"),
    line("Акты… или ещё глубже, в тяжёлые?", "smug"),
    line("Medium. Температура растёт.", "cheer"),
  ],
  tags_hard: [
    line("Тяжёлые фетиши. Специфика. Не отводи глаз.", "angry"),
    line("Или садистское? Одетое, грязное, злое~", "smug"),
    line("Hard tier. Здесь уже пахнет опасностью.", "pout"),
  ],
  tags_sadistic: [
    line("Садистский пул. Одетое, грязь… жестоко.", "angry"),
    line("Тут нет «мило». Только то, что ломает привычку.", "pout"),
    line("Sadistic. Мой любимый этаж.", "smug"),
  ],
  character: [
    line("Архетип на экране? Девочка, трап, группа… выбираю.", "dizzy"),
    line("Лицо / тело / компания — кручу архетип.", "smug"),
    line("Колесо архетипа. Не делай круглые глаза заранее.", "shy"),
  ],
  media_type: [
    line("Фото, гифки или видео? Хи-хи.", "dizzy"),
    line("Тип контента. Статика или движение — решаю я.", "smug"),
    line("Media. Пусть мелькает так, как я хочу.", "cheer"),
  ],
  toys_count: [
    line("Сколько игрушек тебя уронит сегодня?", "dizzy"),
    line("Ноль — везение. Больше — моя щедрость~", "smug"),
    line("Считаю слоты для железа…", "cheer"),
  ],
  toys_1: [
    line("Первая игрушка. Что наденем?", "dizzy"),
    line("Слот один. Выбираю оружие.", "smug"),
  ],
  toys_2: [
    line("Вторая игрушка. Тебе мало одной?", "smug"),
    line("Слот два. Добавляю вес.", "dizzy"),
  ],
  toys_3: [
    line("Третья… жестоко. Хи-хи.", "angry"),
    line("Слот три. Полный комплект.", "smug"),
  ],
};

const LAND_GENERIC: Record<RouletteStepId, RouletteLine[]> = {
  mood: [line("Значит, сегодня я — «{label}». Запомни.", "smug")],
  mode: [line("Режим: {label}. Не спорь.", "smug")],
  duration: [line("{label}. Хватит, чтобы ты начал ныть.", "cheer")],
  edges: [line("{label}. Считай вслух, если осмелишься.", "shock")],
  ruins: [line("{label}. Принято.", "smug")],
  finaleOdds: [line("Финал: {label}. Удачи~", "smug")],
  finish: [line("Куда: {label}. Красиво будет.", "shy")],
  cumplay: [line("Cumplay: {label}.", "smug")],
  cumplay_heavy: [line("Тяжёлый cumplay: {label}.", "angry")],
  bpm: [line("Темп: {label}.", "cheer")],
  tags: [line("Фетиш: {label}. Не отводи глаз.", "shy")],
  tags_medium: [line("Средние: {label}.", "smug")],
  tags_hard: [line("Тяжёлые: {label}.", "angry")],
  tags_sadistic: [line("Садистские: {label}.", "pout")],
  character: [line("На экране: {label}.", "smug")],
  media_type: [line("Формат: {label}.", "cheer")],
  toys_count: [line("Игрушек на сессию: {label}.", "smug")],
  toys_1: [line("Игрушка 1: {label}.", "dizzy")],
  toys_2: [line("Игрушка 2: {label}.", "smug")],
  toys_3: [line("Игрушка 3: {label}.", "angry")],
};

const DISLIKED_TAG_LAND: RouletteLine[] = [
  line(
    "Ха! «{label}» — то, что ты почти не лайкаешь. Смотри и красней~",
    "smug",
  ),
  line(
    "Нелюбимое выпало: {label}. Я специально тасовала колоду.",
    "angry",
  ),
  line(
    "Ой-ой… {label}. Редкое для тебя. Тем вкуснее смотреть, как ты ёрзаешь.",
    "dizzy",
  ),
  line(
    "Ты это почти не сохраняешь — {label}. А я как раз хочу именно это.",
    "pout",
  ),
];

const LAND_BY_OPTION: Partial<
  Record<RouletteStepId, Record<string, RouletteLine[]>>
> = {
  mood: {
    sweet: [
      line("Добрая сегодня~ …относительно. Не расслабляйся.", "shy"),
      line("Ооо, сладкая сегодня. Тебе повезло. Немного.", "cheer"),
    ],
    horny: [
      line("Похотливая… мм. Я уже хочу смотреть, как ты течёшь.", "shy"),
      line("Хорни-режим. Сегодня я буду жадной.", "smug"),
    ],
    calm: [
      line("Спокойная. Тихо, холодно, без пощады в голосе.", "smug"),
      line("Спокойствие. Это не милосердие — это контроль.", "yawn"),
    ],
    bored: [
      line("Скучаю уже. Развлеки меня, или станет хуже.", "yawn"),
      line("Скучающая я — опасная я.", "pout"),
    ],
    cruel: [
      line("Злая. Хи-хи. Ты сам нажал кнопку.", "angry"),
      line("Жестокая сегодня. Не ной — ты просил, чтобы я решала.", "angry"),
    ],
    chaotic: [
      line(
        "Хаос! Я сама не знаю, что выкину… а тебе придётся терпеть.",
        "shock",
      ),
      line("Хаотичная~ Правила? Какие правила?", "dizzy"),
    ],
  },
  mode: {
    stroke: [line("Дрочка. Классика. Руки мои — через тебя.", "smug")],
    cbt: [line("CBT. Яйца и член — под мой счёт. Не геройствуй.", "angry")],
    anal: [line("Анал. Ооо, смелый день.", "shock")],
    chastity: [
      line("Клетка. Замок щёлкнет — и ты мой наглухо.", "pout"),
      line("Клетка… как трогательно беспомощно.", "smug"),
    ],
    onahole: [
      line("Онахол. Честнее обычной дрочки — признай.", "smug"),
      line("Onahole mode. Ритм тот же, ощущения другие.", "dizzy"),
    ],
    oral: [line("Орал. Горло на репетиции — скажи aaah.", "shy")],
  },
  finaleOdds: {
    mercy: [line("Мягкий финал. Может, даже кончишь. Может.", "shy")],
    balanced: [line("Баланс. Никаких гарантий — только нервы.", "smug")],
    mean: [line("Жёсткий уклон. Надейся… и готовься к отказу.", "angry")],
    denial: [line("Denial bias. Ха. Люблю этот звук — «нет».", "pout")],
  },
  ruins: {
    "0": [line("Без mid-руинов. Щедро с моей стороны~", "cheer")],
    "1": [line("Один руин mid. Маленький подарок боли.", "smug")],
    "2": [line("Два руина. Жестоко? Да. Заслужено? Тоже.", "angry")],
  },
  tags: {
    escalate_light: [
      line("Ооо… средние. Скучно быть милой~", "smug"),
      line("Глубже. Средний слой открываю.", "dizzy"),
    ],
  },
  tags_medium: {
    escalate_medium: [
      line("Тяжёлые… уже не для слабых.", "angry"),
      line("Специфика ждёт. Кручу дальше.", "smug"),
    ],
  },
  tags_hard: {
    escalate_hard: [
      line("Садистские. Одетое, грязное, злое — моё.", "angry"),
      line("Последний слой. Без жалости.", "pout"),
    ],
  },
  cumplay: {
    escalate_cumplay: [
      line("Тяжёлые способы… хи-хи. Смелый день.", "smug"),
      line("Обычного мало? Тогда грязь по полной.", "angry"),
    ],
  },
};

const READY: RouletteLine[] = [
  line("Всё. Я решила. Смотри сводку — и не торгуйся.", "cheer"),
  line(
    "Готово~ Сессия собрана по моему вкусу. Твоё дело — выдержать.",
    "smug",
  ),
  line("Хи-хи. План готов. Жми «Подчинись», пока я не передумала.", "cheer"),
  line("Сводка на столе. Прими или крути заново… я не обижусь. Почти.", "smug"),
];

const VERDICT: Record<string, RouletteLine[]> = {
  sweet: [
    line("Я сегодня ласковая… но расклад всё равно мой. Не расслабляйся.", "shy"),
    line("Сладость в голосе — не пощада. Просто буду улыбаться, пока ты мучаешься.", "smug"),
    line("Говорю мягко. Делаю — как решила колесом. Целуй правила.", "shy"),
  ],
  horny: [
    line("Мне жарко. Тебе будет хуже — и это комплимент.", "smug"),
    line("Возбуждена? Да. Скучать тебе сегодня не дам.", "cheer"),
    line("Дыши чаще. Я уже выбрала, как тебя разобрать.", "smug"),
  ],
  calm: [
    line("Спокойно. Ровно. Ты будешь дышать в моём темпе — точка.", "sleep"),
    line("Без истерик. Я веду — ты следуешь. Как и должно быть.", "smug"),
    line("Тихий голос. Жёсткий расклад. Не путай одно с другим.", "sleep"),
  ],
  bored: [
    line("Мне почти скучно… поэтому расклад подострее. Развлеки меня.", "yawn"),
    line("Зеваю. Если сдашься рано — станет ещё скучнее. Для тебя.", "pout"),
    line("Покажи, что ты не декорация. Расклад уже ждёт.", "yawn"),
  ],
  cruel: [
    line("Жалости не будет. Читай расклад и готовься платить.", "angry"),
    line("Я выбрала жёстко. Спорить можно… себе под нос.", "smug"),
    line("Улыбка — декорация. Приказы — нет.", "angry"),
  ],
  chaotic: [
    line("Хаос в колесе — порядок в моей голове. Тебе не понять. И не надо.", "dizzy"),
    line("Сегодня без логики. Только мои прихоти и твои стоны.", "cheer"),
    line("Правила? Есть. Я их просто ещё не озвучила~", "dizzy"),
  ],
};

const BUILDING: RouletteLine[] = [
  line("Собираю блоки… и тяну картинки с booru. Подожди.", "sleep"),
  line("Секунду. Я раскладываю твою пытку по полочкам.", "yawn"),
  line("Загрузка… не ной. Красивое насилие требует времени.", "dizzy"),
];

export function pickRouletteIdleLine(rng?: () => number): RouletteLine {
  return pick(getActiveRouletteLinePack()?.idle ?? IDLE, rng);
}

export function pickRouletteIdleWaitLine(rng?: () => number): RouletteLine {
  return pick(getActiveRouletteLinePack()?.idleWait ?? IDLE_WAIT, rng);
}

export function pickRouletteAvatarClickLine(rng?: () => number): RouletteLine {
  return pick(getActiveRouletteLinePack()?.avatarClick ?? AVATAR_CLICK, rng);
}

export function pickRouletteSettingsOpenLine(rng?: () => number): RouletteLine {
  return pick(getActiveRouletteLinePack()?.settingsOpen ?? SETTINGS_OPEN, rng);
}

export function pickRouletteSettingsCloseLine(rng?: () => number): RouletteLine {
  return pick(
    getActiveRouletteLinePack()?.settingsClose ?? SETTINGS_CLOSE,
    rng,
  );
}

export function pickRouletteRestartLine(rng?: () => number): RouletteLine {
  return pick(getActiveRouletteLinePack()?.restart ?? RESTART, rng);
}

export function pickRouletteConfirmStartLine(rng?: () => number): RouletteLine {
  return pick(
    getActiveRouletteLinePack()?.confirmStart ?? CONFIRM_START,
    rng,
  );
}

export function pickRouletteErrorLine(rng?: () => number): RouletteLine {
  return pick(getActiveRouletteLinePack()?.error ?? ERROR, rng);
}

export function pickRouletteEmptyStepsLine(rng?: () => number): RouletteLine {
  return pick(getActiveRouletteLinePack()?.emptySteps ?? EMPTY_STEPS, rng);
}

export function pickRouletteSpinLine(
  stepId: RouletteStepId,
  rng?: () => number,
): RouletteLine {
  const spin = getActiveRouletteLinePack()?.spin ?? SPIN;
  return pick(spin[stepId] ?? [line("Кручу~", "dizzy")], rng);
}

export function pickRouletteLandLine(
  stepId: RouletteStepId,
  optionId: string,
  labelRu: string,
  rng?: () => number,
  opts?: { disliked?: boolean },
): RouletteLine {
  const pack = getActiveRouletteLinePack();
  if (stepId === "tags" && opts?.disliked) {
    const chosen = pick(pack?.dislikedTagLand ?? DISLIKED_TAG_LAND, rng);
    return { text: fill(chosen.text, { label: labelRu }), emoji: chosen.emoji };
  }
  const byOpt = (pack?.landByOption ?? LAND_BY_OPTION)[stepId]?.[optionId];
  const chosen = byOpt?.length
    ? pick(byOpt, rng)
    : pick(
        (pack?.landGeneric ?? LAND_GENERIC)[stepId] ?? [
          line("{label}.", "smug"),
        ],
        rng,
      );
  return { text: fill(chosen.text, { label: labelRu }), emoji: chosen.emoji };
}

export function pickRouletteReadyLine(rng?: () => number): RouletteLine {
  return pick(getActiveRouletteLinePack()?.ready ?? READY, rng);
}

export function pickRouletteVerdictLine(
  mood: string,
  rng?: () => number,
): RouletteLine {
  const verdict = getActiveRouletteLinePack()?.verdict ?? VERDICT;
  const pool = verdict[mood] ?? verdict.sweet!;
  return pick(pool, rng);
}

export function pickRouletteBuildingLine(rng?: () => number): RouletteLine {
  return pick(getActiveRouletteLinePack()?.building ?? BUILDING, rng);
}
