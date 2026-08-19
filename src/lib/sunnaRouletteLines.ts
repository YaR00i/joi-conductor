import type { FurinaRoulettePack } from "./furinaRouletteLines";
import type { MistressEmojiId } from "./huTaoEmoji";

type RouletteLine = { text: string; emoji: MistressEmojiId };

function line(text: string, emoji: MistressEmojiId): RouletteLine {
  return { text, emoji };
}

const generic = (text: string, emoji: MistressEmojiId = "smug"): RouletteLine[] => [
  line(text, emoji),
];

/** Idol Soft — Sanne; no Hu Tao / Furina names. */
export const SUNNA_ROULETTE_PACK: FurinaRoulettePack = {
  idle: [
    line("Отдаёшь колесо айдолу? Умно. Я выберу мило… и жёстко.", "smug"),
    line("Сцена готова, вибро уже мурлычет. Жми — и слушайся.", "shy"),
    line("Колесо ждёт фаната. Не тормози, солнце.", "cheer"),
  ],
  idleWait: [
    line("Публика скучает. Колесо само не крутится от твоей робости.", "yawn"),
    line("Не тяни. У меня репетиция, а у тебя — задание.", "pout"),
    line("Медлишь? Тогда вибрация станет громче.", "smug"),
  ],
  avatarClick: [
    line("Портрет не заменит выбор. Кнопку, пожалуйста.", "smug"),
    line("Любоваться можно. Дальше — к колесу, милый.", "shy"),
    line("Руками лучше к старту. Я не только картинка.", "pout"),
  ],
  settingsOpen: [
    line("Настройки? Подкрути пулы — я всё равно сделаю красиво.", "smug"),
    line("Расставляй условия. Айдол умеет импровизировать.", "dizzy"),
  ],
  settingsClose: [
    line("Хватит копаться. Время номера.", "cheer"),
    line("Панель закрыта. Крути, пока я в настроении.", "smug"),
  ],
  restart: [
    line("Заново? Ладно. Этот дубль будет слаще… или злее.", "smug"),
    line("С нуля. Не привыкай к жалости.", "angry"),
  ],
  confirmStart: [
    line("Репетиция утверждена. Не уходи со сцены.", "cheer"),
    line("Начинаем. Дыши ровно — вибрация не прощает суеты.", "smug"),
    line("Принято. Собираю номер под тебя.", "dizzy"),
  ],
  error: [
    line("Маленький сбой в номере. Ещё раз, милый.", "shock"),
    line("Колесо споткнулось. Это поправимо.", "pout"),
  ],
  emptySteps: [
    line("Все шаги выключены. Даже айдолу нужен сетлист.", "angry"),
    line("Пустой номер не сыграть. Включи хотя бы один шаг.", "pout"),
  ],
  spin: {
    mood: generic("Какая я сегодня — сладкая или строгая?", "smug"),
    mode: generic("Клетка, горло или вибро-номер? Выбираю форму.", "dizzy"),
    duration: generic("Длина репетиции. Я умею ждать… недолго.", "sleep"),
    edges: generic("Сколько раз подвести к краю? Считай со мной.", "dizzy"),
    ruins: generic("Руины посреди номера… милая жестокость.", "smug"),
    finaleOdds: generic("Финал: милость, руин или отказ. Надейся тихо.", "angry"),
    finish: generic("Куда направить финал? Выберем красиво.", "shy"),
    cumplay: generic("Что станет с финалом? Айдол всё заметит.", "smug"),
    cumplay_heavy: generic("Тяжёлый финальный номер. Держись.", "angry"),
    bpm: generic("Темп. Сердце подстроится под метроном… или вибро.", "cheer"),
    tags: generic("Колода вкусов. Может выпасть сладко и стыдно.", "dizzy"),
    tags_medium: generic("Средний слой. Номер становится глубже.", "smug"),
    tags_hard: generic("Тяжёлый слой. Не отводи взгляд.", "angry"),
    tags_sadistic: generic("Жёсткая часть сетлиста. Жалости мало.", "pout"),
    character: generic("Кто на экране? Архетип выбираю я.", "dizzy"),
    media_type: generic("Фото, гифка или видео — ритм картинки.", "cheer"),
    toys_count: generic("Сколько игрушек в номере?", "dizzy"),
    toys_1: generic("Первый реквизит. На сцену.", "smug"),
    toys_2: generic("Второй. Композиция важна.", "dizzy"),
    toys_3: generic("Третий. Финальный штрих.", "angry"),
  },
  landGeneric: {
    mood: generic("Сегодняшняя маска: {label}. Запомни.", "smug"),
    mode: generic("Режим номера: {label}. Спорить поздно.", "smug"),
    duration: generic("{label}. Столько и будешь слушаться.", "cheer"),
    edges: generic("{label}. Считай грани.", "shock"),
    ruins: generic("{label}. Записала.", "smug"),
    finaleOdds: generic("Финал: {label}. Я ничего не обещаю.", "smug"),
    finish: generic("Финальная точка: {label}.", "shy"),
    cumplay: generic("Финальный акт: {label}.", "smug"),
    cumplay_heavy: generic("Тяжёлый финал: {label}.", "angry"),
    bpm: generic("Темп: {label}.", "cheer"),
    tags: generic("Вкус: {label}.", "shy"),
    tags_medium: generic("Средний слой: {label}.", "smug"),
    tags_hard: generic("Тяжёлый слой: {label}.", "angry"),
    tags_sadistic: generic("Жёсткий слой: {label}.", "pout"),
    character: generic("На экране: {label}.", "smug"),
    media_type: generic("Формат: {label}.", "cheer"),
    toys_count: generic("Игрушек: {label}.", "smug"),
    toys_1: generic("Реквизит I: {label}.", "dizzy"),
    toys_2: generic("Реквизит II: {label}.", "smug"),
    toys_3: generic("Реквизит III: {label}.", "angry"),
  },
  dislikedTagLand: [
    line("«{label}» — то, чего ты избегаешь. Тем вкуснее смотреть.", "smug"),
    line("Редкий для тебя вкус: {label}. Не отводи глаза.", "angry"),
  ],
  landByOption: {
    mood: {
      sweet: generic("Сладкая сегодня. Не принимай за помилование.", "shy"),
      horny: generic("Горячая. Хочу зрелища и вибрации.", "smug"),
      calm: generic("Тихая. Правила всё равно железные.", "sleep"),
      bored: generic("Зеваю. Развлеки меня убедительно.", "yawn"),
      cruel: generic("Строгая. Сам нажал кнопку.", "angry"),
      chaotic: generic("Смущённо-хаотичная. Сетлист плывёт.", "dizzy"),
    },
    mode: {
      stroke: generic("Дрочка руками? Не мой номер. Вернись к вибро.", "pout"),
      cbt: generic("CBT? Это чужая сцена. У меня другие правила.", "pout"),
      anal: generic("Анал. Держи осанку, милый.", "shock"),
      chastity: generic("Клетка + вибро. Феминный номер.", "pout"),
      onahole: generic("Онахол — не мой реквизит.", "dizzy"),
      oral: generic("Горло. Репетируем послушность.", "smug"),
      prone: generic("Prone? Не мой зал.", "pout"),
      plapping: generic("Plapping: клетка + шлепки по яйцам на акцент.", "dizzy"),
    },
    duration: {
      "300": generic("Пять минут. Короткий номер — слушайся плотнее.", "cheer"),
      "420": generic("Семь минут. Как раз на разогрев вибро.", "smug"),
      "600": generic("Десять. Idol Soft успеет засмущать.", "smug"),
      "720": generic("Двенадцать. Не зевай на репетиции.", "angry"),
      "900": generic("Пятнадцать. Длинный сет — клетка не скучает.", "pout"),
    },
    edges: {
      e_2_4: generic("Два–четыре края. Мягкий разгон для фаната.", "shy"),
      e_3_5: generic("Три–пять. Считай грани вместе со мной.", "dizzy"),
      e_4_6: generic("Четыре–шесть. Ноги станут ватными раньше занавеса.", "smug"),
      e_5_7: generic("Пять–семь. Полный idol-счёт на краю.", "angry"),
    },
    ruins: {
      r_0_0: generic("Без руинов. Сладко — не значит легко.", "shy"),
      r_0_1: generic("Ноль–один руин. Капля стыда посреди номера.", "smug"),
      r_1_2: generic("Один–два руина. Милая жестокость в сетлисте.", "angry"),
    },
    finaleOdds: {
      mercy: generic("Мягкий финал возможен. Ещё не заслужен.", "shy"),
      balanced: generic("Баланс: надежда и клетка делят сцену.", "smug"),
      mean: generic("Жёсткий уклон. Улыбнись своей смелости.", "angry"),
      denial: generic("Denial как финал. Мягкий голос, твёрдое нет.", "pout"),
    },
    finish: {
      body: generic("Финиш на тело. Сцена должна остаться… относительно чистой.", "shy"),
      mouth: generic("В рот. Доказательство для айдола принято.", "smug"),
      floor: generic("На пол. Стыд как декорация номера.", "angry"),
    },
    bpm: {
      slow: generic("Медленный метроном. Вибро важнее гонки.", "sleep"),
      mid: generic("Средний темп. Сердце подстроится под buzz.", "cheer"),
      fast: generic("Быстрый темп. Не сбивай феминный ритм.", "angry"),
    },
    character: {
      girl: generic("Девушка на экране. Сравни послушание.", "shy"),
      trap: generic("Трап в касте. Феминность расширяется.", "smug"),
      futanari: generic("Футанари. Сцена стала смелее.", "dizzy"),
      sissy: generic("Сисси. Сладость и стыд — мой жанр.", "pout"),
    },
    media_type: {
      images: generic("Статичные кадры. Задержи взгляд.", "cheer"),
      gifs: generic("Гифки. Движение без обязательств — почти как ты.", "dizzy"),
      video: generic("Видео. Не моргай на главной сцене.", "smug"),
      all: generic("Любой формат. Жадность допущена на репетиции.", "smug"),
    },
    toys_count: {
      "0": generic("Без игрушек? Спорно для vibe-first. Импровизируй честно.", "pout"),
      "1": generic("Один реквизит. Вынеси на сцену.", "smug"),
      "2": generic("Два. Композиция важна.", "dizzy"),
      "3": generic("Три. Полный idol-комплект.", "angry"),
    },
  } as FurinaRoulettePack["landByOption"],
  ready: [
    line("Номер готов. Смотри сводку и слушайся.", "cheer"),
    line("Всё собрано. Твоя роль — исполнить красиво.", "smug"),
    line("Сетлист на столе. Клетка и вибро ждут.", "cheer"),
  ],
  verdict: {
    sweet: generic("Говорю мягко, но номер всё равно мой. Не расслабляйся.", "shy"),
    horny: generic("Хочу зрелища. Исполни сладко и мокро.", "smug"),
    calm: generic("Ровное дыхание. Точные движения. Без возражений.", "sleep"),
    bored: generic("Развлеки меня, иначе вибрация станет злее.", "yawn"),
    cruel: generic("Без жалости. Читай сводку и улыбайся.", "angry"),
    chaotic: generic("Хаос в голове, порядок в задании. Следуй.", "dizzy"),
  },
  building: [
    line("Собираю номер и вибро-партитуру. Подожди.", "sleep"),
    line("Ещё секунда — и занавес.", "dizzy"),
    line("Расставляю реквизит Idol Soft. Не убегай.", "smug"),
  ],
};
