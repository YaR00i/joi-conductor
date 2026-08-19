import type { MistressEmojiId } from "./huTaoEmoji";
import type { RouletteStepId } from "./planRoulette";

/** Same shape as huTaoRouletteLines — kept local to avoid circular imports. */
export type RouletteLine = {
  text: string;
  emoji: MistressEmojiId;
};

type OptionLines = Partial<Record<RouletteStepId, Record<string, RouletteLine[]>>>;

function line(text: string, emoji: MistressEmojiId): RouletteLine {
  return { text, emoji };
}

const generic = (text: string, emoji: MistressEmojiId = "smug"): RouletteLine[] => [
  line(text, emoji),
];

export type FurinaRoulettePack = {
  idle: RouletteLine[];
  idleWait: RouletteLine[];
  avatarClick: RouletteLine[];
  settingsOpen: RouletteLine[];
  settingsClose: RouletteLine[];
  restart: RouletteLine[];
  confirmStart: RouletteLine[];
  error: RouletteLine[];
  emptySteps: RouletteLine[];
  spin: Record<RouletteStepId, RouletteLine[]>;
  landGeneric: Record<RouletteStepId, RouletteLine[]>;
  dislikedTagLand: RouletteLine[];
  landByOption: OptionLines;
  ready: RouletteLine[];
  verdict: Record<string, RouletteLine[]>;
  building: RouletteLine[];
};

export const FURINA_ROULETTE_PACK: FurinaRoulettePack = {
  idle: [
    line("Передаёшь колесо суду? Прекрасно. Фурина вынесет решение.", "smug"),
    line("Сцена готова, вода неподвижна. Нажми кнопку и доверься приговору.", "shy"),
    line("Колесо ждёт. У судьбы сегодня безупречный вкус.", "cheer"),
  ],
  idleWait: [
    line("Публика ждёт. Колесо не закрутится от одной твоей тревоги.", "yawn"),
    line("Не тяни занавес. Суд уже собрался.", "pout"),
    line("Медлишь? Тогда приговор станет интереснее.", "smug"),
  ],
  avatarClick: [
    line("Портрет не заменит решение суда. Нажми на колесо.", "smug"),
    line("Любоваться разрешаю. Но дальше — к постановке.", "shy"),
    line("Руками лучше к кнопке. Я не декорация, как бы ни старалась.", "pout"),
  ],
  settingsOpen: [
    line("Настройки? Подправь реквизит, но финальное слово за судом.", "smug"),
    line("Расставляй условия. Я элегантно обойду их, если понадобится.", "dizzy"),
  ],
  settingsClose: [
    line("Довольно репетиций. Время основного акта.", "cheer"),
    line("Панель закрыта — вода снова спокойна. Крути.", "smug"),
  ],
  restart: [
    line("Переписать постановку? Суд великодушно разрешает.", "smug"),
    line("С нуля. На этот раз волна может быть холоднее.", "angry"),
  ],
  confirmStart: [
    line("Постановка утверждена. Не уходи со сцены.", "cheer"),
    line("Начинаем. Дыши ровно — суд заметит каждую ошибку.", "smug"),
    line("Принято. Собираю декорации и твой приговор.", "dizzy"),
  ],
  error: [
    line("Небольшая трещина в сценарии. Попробуй ещё раз.", "shock"),
    line("Судебный механизм споткнулся. Это поправимо.", "pout"),
  ],
  emptySteps: [
    line("Все акты выключены. Даже суду нужен реквизит.", "angry"),
    line("Пустая сцена не даст приговора. Включи хотя бы один шаг.", "pout"),
  ],
  spin: {
    mood: generic("Сначала выберем маску судьи. Мягкая волна или холодный приговор?", "smug"),
    mode: generic("Каким будет следующий акт? Суд выбирает форму послушания.", "dizzy"),
    duration: generic("Длительность слушания. Вода умеет ждать.", "sleep"),
    edges: generic("Сколько раз подвести к краю? Зал считает вместе со мной.", "dizzy"),
    ruins: generic("Руины в середине акта… изящная жестокость.", "smug"),
    finaleOdds: generic("Финал: милость, руин или отказ. Надейся тихо.", "angry"),
    finish: generic("Куда направить финальный прилив? Выберем красиво.", "shy"),
    cumplay: generic("Что станет с финалом? Суд изучит все доказательства.", "smug"),
    cumplay_heavy: generic("Тяжёлый финальный акт. Сцена требует смелости.", "angry"),
    bpm: generic("Темп постановки. Сердце подстроится под метроном.", "cheer"),
    tags: generic("Колода вкусов перемешана. Приговор может быть неожиданным.", "dizzy"),
    tags_medium: generic("Средний слой реквизита. Волна становится глубже.", "smug"),
    tags_hard: generic("Тяжёлый слой. Держи взгляд прямо.", "angry"),
    tags_sadistic: generic("Садистская часть сценария. Здесь не ждут жалости.", "pout"),
    character: generic("Кто выйдет на сцену? Каст выбирает суд.", "dizzy"),
    media_type: generic("Фото, гифка или видео — выбираю движение волны.", "cheer"),
    toys_count: generic("Сколько предметов понадобится этой постановке?", "dizzy"),
    toys_1: generic("Первый реквизит. Вынесите на сцену.", "smug"),
    toys_2: generic("Второй предмет. Суд любит продуманную композицию.", "dizzy"),
    toys_3: generic("Третий предмет. Финальный штрих постановки.", "angry"),
  },
  landGeneric: {
    mood: generic("Сегодняшняя маска суда: {label}. Запомни.", "smug"),
    mode: generic("Режим слушания: {label}. Возражения отклонены.", "smug"),
    duration: generic("{label}. Сцена продлится ровно столько, сколько нужно.", "cheer"),
    edges: generic("{label}. Считай грани для протокола.", "shock"),
    ruins: generic("{label}. Приговор записан.", "smug"),
    finaleOdds: generic("Финал: {label}. Вода ничего не обещает.", "smug"),
    finish: generic("Финальная точка: {label}. Держи сцену чистой.", "shy"),
    cumplay: generic("Финальный акт: {label}.", "smug"),
    cumplay_heavy: generic("Тяжёлый финальный акт: {label}.", "angry"),
    bpm: generic("Темп: {label}.", "cheer"),
    tags: generic("Фетиш внесён в протокол: {label}.", "shy"),
    tags_medium: generic("Средний слой: {label}.", "smug"),
    tags_hard: generic("Тяжёлый слой: {label}.", "angry"),
    tags_sadistic: generic("Садистский слой: {label}.", "pout"),
    character: generic("На сцене: {label}.", "smug"),
    media_type: generic("Формат: {label}.", "cheer"),
    toys_count: generic("Реквизита на акт: {label}.", "smug"),
    toys_1: generic("Реквизит I: {label}.", "dizzy"),
    toys_2: generic("Реквизит II: {label}.", "smug"),
    toys_3: generic("Реквизит III: {label}.", "angry"),
  },
  dislikedTagLand: [
    line("«{label}» — то, что ты избегаешь. Суд особенно ценит этот выбор.", "smug"),
    line("Редкий для тебя реквизит: {label}. Не отводи взгляд.", "angry"),
    line("Ты почти не выбираешь {label}. Тем интереснее наблюдать.", "dizzy"),
  ],
  landByOption: {
    mood: {
      sweet: generic("Сегодня суд улыбается. Не принимай это за помилование.", "shy"),
      horny: generic("Вода стала тёплой. Я хочу зрелища.", "smug"),
      calm: generic("Спокойно. Холодно. Каждое правило будет исполнено.", "sleep"),
      bored: generic("Мне скучно. Значит, играть придётся убедительнее.", "yawn"),
      cruel: generic("Жестокий приговор уже подписан. Ты сам нажал кнопку.", "angry"),
      chaotic: generic("Хаос вышел на сцену. Сценарий теперь плывёт.", "dizzy"),
    },
    mode: {
      stroke: generic("Классический акт… редко. Ритм всё равно у суда.", "smug"),
      cbt: generic("CBT. Яйца и член под приговором — считай удары.", "angry"),
      prone: generic("Prone. Бёдрами в поверхность — руки не трогают.", "angry"),
      anal: generic("Анал. Держи осанку ради приличий.", "shock"),
      chastity: generic("Клетка. Ожидание становится главным номером.", "pout"),
      onahole: generic("Онахол? Чужой реквизит. Не мой главный акт.", "dizzy"),
      oral: generic("Орал? Не мой зал. Вернись к суду.", "pout"),
    },
    duration: {
      "600": generic("Десять минут на сцене. Вода умеет ждать столько.", "cheer"),
      "720": generic("Двенадцать минут. Приговор успеет осесть.", "smug"),
      "900": generic("Пятнадцать. Зал не отпустит раньше.", "smug"),
      "1200": generic("Двадцать минут. Выдержка — часть приговора.", "angry"),
      "1500": generic("Двадцать пять. Долгое слушание Tide.", "pout"),
    },
    edges: {
      "5": generic("Пять краёв. Минимальная доза Tide.", "smug"),
      "6": generic("Шесть. Зал уже считает вместе со мной.", "dizzy"),
      "7": generic("Семь граней. Считай для протокола.", "smug"),
      "8": generic("Восемь краёв. Ноги станут мягкими раньше финала.", "angry"),
      "9": generic("Девять. Карусель почти без конца.", "angry"),
      "10": generic("Десять. Полный счёт суда.", "pout"),
    },
    finaleOdds: {
      mercy: generic("Мягкий финал возможен. Но ещё не заслужен.", "shy"),
      balanced: generic("Баланс: надежда и тревога делят сцену.", "smug"),
      mean: generic("Жёсткий уклон. Аплодируй своей смелости.", "angry"),
      denial: generic("Отказ как финал. Холодно, чисто, без апелляции.", "pout"),
      verdict: generic("Приговор суда. Финал решит постановка, не твоя надежда.", "angry"),
    },
    ruins: {
      "1": generic("Один руин. Капля холодной воды в нужный момент.", "smug"),
      "2": generic("Два руина. Постановка любит контрасты.", "angry"),
      "3": generic("Три руина. Жестокая композиция — моя любимая.", "pout"),
    },
    finish: {
      body: generic("Финиш на тело. Сцена должна остаться чистой… относительно.", "shy"),
      mouth: generic("В рот. Доказательство принято судом.", "smug"),
      floor: generic("На пол. Унижение как декорация.", "angry"),
    },
    bpm: {
      mid: generic("Средний метроном. Сердце подстроится.", "cheer"),
      fast: generic("Быстрый темп. Не сбивай ритм суда.", "angry"),
      harsh: generic("Суд 90–150. Холодный контроль в цифрах.", "pout"),
      slow: generic("Медленный темп. Контроль важнее скорости.", "sleep"),
    },
    character: {
      girl: generic("Девушка на экране. Смотри и сравнивай послушание.", "shy"),
      trap: generic("Трап в касте. Суд расширяет реквизит.", "smug"),
      futanari: generic("Футанари. Сцена стала интереснее.", "dizzy"),
      sissy: generic("Сисси. Сладость на грани стыда — запомни.", "pout"),
    },
    media_type: {
      images: generic("Статичные кадры. Задержи взгляд.", "cheer"),
      gifs: generic("Гифки. Движение без обязательств — почти как ты.", "dizzy"),
      video: generic("Видео. Не моргай на главной сцене.", "smug"),
      all: generic("Любой формат. Жадность допущена судом.", "smug"),
    },
    toys_count: {
      "0": generic("Без игрушек. Руки и правила — достаточный реквизит.", "shy"),
      "1": generic("Один предмет. Вынесите на сцену.", "smug"),
      "2": generic("Два. Суд любит продуманную композицию.", "dizzy"),
      "3": generic("Три. Полный комплект постановки.", "angry"),
    },
    tags: { escalate_light: generic("Поднимаемся к среднему слою. Занавес не опускай.", "dizzy") },
    tags_medium: { escalate_medium: generic("Тяжёлый слой открыт. Суд не отворачивается.", "angry") },
    tags_hard: { escalate_hard: generic("Садистский слой. Приговор теперь звучит громче.", "pout") },
    cumplay: { escalate_cumplay: generic("Обычного финала мало? Внесём тяжёлый акт.", "smug") },
  },
  ready: [
    line("Постановка готова. Смотри сводку и прими приговор.", "cheer"),
    line("Всё собрано по вкусу суда. Твоя роль — исполнить.", "smug"),
    line("Сценарий на столе. Подчинись, пока вода спокойна.", "cheer"),
  ],
  verdict: {
    sweet: generic("Я говорю мягко, но постановка остаётся моей. Не расслабляйся.", "shy"),
    horny: generic("Мне хочется зрелища. Исполни красиво.", "smug"),
    calm: generic("Ровное дыхание, точные движения, никаких возражений.", "sleep"),
    bored: generic("Развлеки меня достойно, иначе сценарий станет острее.", "yawn"),
    cruel: generic("Помилования не будет. Читай сводку и исполняй.", "angry"),
    chaotic: generic("Хаос на сцене, порядок в решении суда. Просто следуй.", "dizzy"),
  },
  building: [
    line("Расставляю реквизит и поднимаю занавес. Подожди.", "sleep"),
    line("Собираю постановку. Красивый приговор требует времени.", "dizzy"),
  ],
};
