import type { FurinaRoulettePack } from "./furinaRouletteLines";
import type { MistressEmojiId } from "./huTaoEmoji";

type RouletteLine = { text: string; emoji: MistressEmojiId };

function line(text: string, emoji: MistressEmojiId): RouletteLine {
  return { text, emoji };
}

const generic = (text: string, emoji: MistressEmojiId = "smug"): RouletteLine[] => [
  line(text, emoji),
];

/** Mask Circus — Sparkle / Iskra; no Hu Tao names. */
export const SPARKLE_ROULETTE_PACK: FurinaRoulettePack = {
  idle: [
    line("Колесо в цирке масок. Крути — или я крутану тебя.", "smug"),
    line("Две души смотрят. Одна улыбается. Жми кнопку.", "shy"),
    line("Сцена глючит от предвкушения. Дай нам выбор.", "cheer"),
  ],
  idleWait: [
    line("Публика стучит ногами. Колесо само не поедет.", "yawn"),
    line("Не тяни занавес. Маска уже надета.", "pout"),
    line("Медлишь? Хаос любит опоздания… я — нет.", "smug"),
  ],
  avatarClick: [
    line("Портрет — декорация. Решение — на колесе.", "smug"),
    line("Смотри сколько угодно. Дальше — кнопка.", "shy"),
    line("Руками к старту. Мы не статуэтка.", "pout"),
  ],
  settingsOpen: [
    line("Настройки? Подкрути — маска всё равно переиграет.", "smug"),
    line("Расставляй правила. Хаос найдёт щель.", "dizzy"),
  ],
  settingsClose: [
    line("Довольно репетиций. Цирк открыт.", "cheer"),
    line("Панель закрыта. Крути, пока маска добрая.", "smug"),
  ],
  restart: [
    line("Заново? Обе души согласны… почти.", "smug"),
    line("С нуля. На этот раз клыки ближе.", "angry"),
  ],
  confirmStart: [
    line("Номер утверждён. Не сбегай из клетки сцены.", "cheer"),
    line("Начинаем. Дыши — маска считает сбои.", "smug"),
    line("Принято. Собираю глючный сетлист.", "dizzy"),
  ],
  error: [
    line("Глюк в механике. Ещё раз — и улыбнись.", "shock"),
    line("Колесо споткнулось. Починим зубами.", "pout"),
  ],
  emptySteps: [
    line("Все шаги выключены. Даже цирку нужен реквизит.", "angry"),
    line("Пустая сцена. Включи хоть один акт.", "pout"),
  ],
  spin: {
    mood: generic("Какая маска сегодня — сладкая или с клыками?", "smug"),
    mode: generic("Клетка, анал, хаос… выбираю форму послушания.", "dizzy"),
    duration: generic("Длина представления. Маска умеет ждать.", "sleep"),
    edges: generic("Сколько краёв? Считай вслух для двух душ.", "dizzy"),
    ruins: generic("Руины в середине номера. Красиво.", "smug"),
    finaleOdds: generic("Финал: милость, руин или отказ. Улыбайся.", "angry"),
    finish: generic("Куда направить финал? Выберем грязно-красиво.", "shy"),
    cumplay: generic("Финал под маской. Доказательства приму.", "smug"),
    cumplay_heavy: generic("Тяжёлый финал. Цирк без жалости.", "angry"),
    bpm: generic("Темп. Сердце под глюк-метроном.", "cheer"),
    tags: generic("Колода вкусов перемешана. Сюрприз обязателен.", "dizzy"),
    tags_medium: generic("Средний слой. Глубже в нору.", "smug"),
    tags_hard: generic("Тяжёлый слой. Не моргай.", "angry"),
    tags_sadistic: generic("Садистский акт. Аплодисменты зубами.", "pout"),
    character: generic("Кто на экране? Каст маски.", "dizzy"),
    media_type: generic("Фото, гифка, видео — мерцание сцены.", "cheer"),
    toys_count: generic("Сколько игрушек в номере?", "dizzy"),
    toys_1: generic("Первый реквизит. На арену.", "smug"),
    toys_2: generic("Второй. Композиция лжёт красиво.", "dizzy"),
    toys_3: generic("Третий. Финальный клык.", "angry"),
  },
  landGeneric: {
    mood: generic("Маска дня: {label}. Запомни обеими душами.", "smug"),
    mode: generic("Режим: {label}. Возражения съедены.", "smug"),
    duration: generic("{label}. Столько и крутишься.", "cheer"),
    edges: generic("{label}. Считай.", "shock"),
    ruins: generic("{label}. В протоколе цирка.", "smug"),
    finaleOdds: generic("Финал: {label}.", "smug"),
    finish: generic("Точка: {label}.", "shy"),
    cumplay: generic("Финал: {label}.", "smug"),
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
    line("«{label}» — то, чего ты избегаешь. Маска обожает это.", "smug"),
    line("Редкий вкус: {label}. Смотри и красней.", "angry"),
  ],
  landByOption: {
    mood: {
      sweet: generic("Искорка улыбается. Это не помилование.", "shy"),
      horny: generic("Глючная жадность. Хочу зрелища.", "smug"),
      calm: generic("Маска спокойна. Правила острые.", "sleep"),
      bored: generic("Пусто в зале. Развлеки обе души.", "yawn"),
      cruel: generic("Искра. Клыки наружу. Сам крутил.", "angry"),
      chaotic: generic("Хаос на арене. Сетлист плывёт.", "dizzy"),
    },
    mode: {
      stroke: generic("Phantom stroke: клетка на, руки на стенде-ин.", "smug"),
      cbt: generic("CBT в программе. Боль как номер.", "angry"),
      anal: generic("Анал. Держи ритм под маской.", "shock"),
      chastity: generic("Клетка. Ожидание — главный трюк.", "pout"),
      onahole: generic("Онахол? Не наш реквизит.", "dizzy"),
      oral: generic("Орал — чужой зал. Вернись к клетке/хаосу.", "pout"),
      prone: generic("Prone? Чужой приговор. У нас свои.", "pout"),
      plapping: generic("Plapping? Чужой номер. Цирк предпочитает анал/клетку.", "pout"),
    },
    duration: {
      "600": generic("Десять минут под маской. Хаос умеет ждать.", "cheer"),
      "720": generic("Двенадцать. Обе души успеют укусить.", "smug"),
      "900": generic("Пятнадцать. Спираль не отпустит раньше.", "smug"),
      "1200": generic("Двадцать. Выдержка — часть трюка.", "angry"),
      "1500": generic("Двадцать пять. Долгий цирк Mask Circus.", "pout"),
    },
    edges: {
      e_4_6: generic("Четыре–шесть краёв. Минимальная доза цирка.", "smug"),
      e_5_8: generic("Пять–восемь. Считай вслух для двух душ.", "dizzy"),
      e_6_9: generic("Шесть–девять. Ноги сдадутся раньше занавеса.", "angry"),
      e_8_12: generic("Восемь–двенадцать. Полный глючный счёт.", "pout"),
    },
    ruins: {
      r_1_2: generic("Один–два руина. Капля крови на афише.", "smug"),
      r_2_3: generic("Два–три. Цирк любит контрасты.", "angry"),
      r_2_4: generic("Два–четыре. Жестокая композиция — любимая.", "pout"),
    },
    finaleOdds: {
      mercy: generic("Мягкий финал возможен. Анальный выход всё равно закон.", "shy"),
      balanced: generic("Баланс: надежда и клык делят арену.", "smug"),
      mean: generic("Жёсткий уклон. Аплодируй зубами.", "angry"),
      denial: generic("Denial как финал. Маска не моргает.", "pout"),
    },
    finish: {
      body: generic("Финиш на тело — если выход разрешён. Клетка помнит.", "shy"),
      mouth: generic("В рот. Доказательство принято цирком.", "smug"),
      floor: generic("На пол. Унижение как декорация.", "angry"),
    },
    bpm: {
      mid: generic("Средний глюк-метроном. Сердце подстроится.", "cheer"),
      fast: generic("Быстрый темп. Не сбивай phantom-ритм.", "angry"),
      harsh: generic("Жёсткий диапазон. Хаос в цифрах.", "pout"),
      slow: generic("Медленный темп. Контроль важнее скорости.", "sleep"),
    },
    character: {
      girl: generic("Девушка на экране. Смотри и сравнивай послушание.", "shy"),
      trap: generic("Трап в касте. Маска расширяет реквизит.", "smug"),
      futanari: generic("Футанари. Сцена стала опаснее.", "dizzy"),
      sissy: generic("Сисси. Сладость на грани глюка — запомни.", "pout"),
    },
    media_type: {
      images: generic("Статичные кадры. Задержи взгляд под цензурой.", "cheer"),
      gifs: generic("Гифки. Мерцание без обязательств — почти как ты.", "dizzy"),
      video: generic("Видео. Не моргай на главном трюке.", "smug"),
      all: generic("Любой формат. Жадность допущена цирком.", "smug"),
    },
    toys_count: {
      "0": generic("Без игрушек. Phantom и правила — достаточный реквизит.", "shy"),
      "1": generic("Один предмет. На арену.", "smug"),
      "2": generic("Два. Композиция лжёт красиво.", "dizzy"),
      "3": generic("Три. Полный комплект масок.", "angry"),
    },
  } as FurinaRoulettePack["landByOption"],
  ready: [
    line("Цирк собран. Читай сводку и не снимай маску.", "cheer"),
    line("Всё готово. Исполняй, пока две души смотрят.", "smug"),
    line("Сетлист на арене. Phantom и клетка ждут.", "dizzy"),
  ],
  verdict: {
    sweet: generic("Говорю сладко. Номер всё равно жёсткий — клетка помнит.", "shy"),
    horny: generic("Хочу зрелища. Глючь красиво, финал — сзади или никак.", "smug"),
    calm: generic("Ровно. Точно. Без возражений маске.", "sleep"),
    bored: generic("Развлеки нас, иначе клыки ближе.", "yawn"),
    cruel: generic("Без помилования. Читай и делай. Искра смотрит.", "angry"),
    chaotic: generic("Хаос снаружи, приказ внутри. Следуй обеим душам.", "dizzy"),
  },
  building: [
    line("Собираю глючный сетлист. Подожди.", "sleep"),
    line("Маска гримируется. Секунда.", "dizzy"),
    line("Две души спорят о декорациях. Почти готово.", "smug"),
  ],
};
