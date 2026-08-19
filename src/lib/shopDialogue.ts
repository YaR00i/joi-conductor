/**
 * Shop dialogue lines (comic bubble under avatar).
 * Mistress-aware via SHOP_DIALOGUE_BY_ID registry.
 */

import type { ShopItem } from "./wallet";
import { getActiveMistress } from "./mistress";
import type { MistressId } from "./mistress/types";
import { FURINA_SHOP_DIALOGUE } from "./shopDialogueFurina";
import { SPARKLE_SHOP_DIALOGUE } from "./shopDialogueSparkle";
import { SUNNA_SHOP_DIALOGUE } from "./shopDialogueSunna";

type ShopDialoguePack = {
  GREET: string[];
  IDLE: string[];
  CLICK: string[];
  FETISH_BUY: string[];
  PREMIUM_BUY: Record<string, string[]>;
  PREMIUM_FALLBACK: string[];
  FAIL_LOW: string[];
  FAIL_OWNED: string[];
  FAIL_GENERIC: string[];
};

const GREET: string[] = [
  "Ого, зашёл… Не притворяйся, что «просто посмотреть».",
  "Добро пожаловать в мою ночную лавку. Кошелёк готов?",
  "Хе-хе. Выбрал меня — теперь выбирай, за что заплатишь.",
  "Смотри не стесняйся. Здесь стесняются только те, у кого мало угольков.",
];

const IDLE: string[] = [
  "Ну? Будешь глазеть или уже купишь что-нибудь грязное?",
  "Я могу ждать вечность… но угольки — нет.",
  "Тишина. Скучно. Купи фетиш — развесели меня.",
  "Не торопись… я всё равно вижу, на что ты пялишься.",
  "Эй. Я тут не для декора. Хотя… почти.",
  "Если будешь так стоять — начну комментировать твой вкус вслух.",
];

const CLICK: string[] = [
  "Эй! Руками можно и по витрине.",
  "Мм? Нравится смотреть? Тогда плати за зрелище.",
  "Тыкаешь… мило. Но угольки милее.",
  "Аха. Поймал. Дальше — покупка, не глазки.",
  "Хватит тискать портрет. Выбирай товар.",
];

const FETISH_BUY: string[] = [
  "«{name}»… Ох, прямо в точку. Забирай — и не делай невинное лицо.",
  "Купил «{name}». Значит, это твоё слабое место? Запомнила.",
  "«{name}» теперь твоё. Пользуйся… аккуратно. Или нет.",
  "Хе. «{name}» — хороший вкус. Или плохой. Мне нравится и то, и то.",
  "Оплачено: «{name}». Можешь благодарить на коленях.",
  "«{name}» снято с витрины специально для тебя. Гордись.",
];

/** Unique lines per premium catalog item id. */
const PREMIUM_BUY: Record<string, string[]> = {
  fn_plapping: [
    "Шлёпанье? Классика. Сейчас очередь научится хлопать громче.",
    "Plapping открыт. Не жалуйся, если ладони устанут… не твои.",
  ],
  fn_cbt_medium: [
    "CBT пожёстче… Смелый. Или глупый. Проверим на сессии.",
    "Средний CBT разблокирован. Дыши ровнее — пригодится.",
  ],
  fn_stroke_prone: [
    "Лёжа на животе — милая поза для послушания. Бери.",
    "Stroke prone твой. Лицом в подушку — это не стыдно. Для меня.",
  ],
  fn_vibe_assist: [
    "Вибратор в деле. Руки могут… иногда… отдыхать.",
    "Vibe assist куплен. Не делай вид, что «сам контролируешь».",
  ],
  fn_hands_off_vibe: [
    "Руки прочь + вибро. Любимый коктейль. Наслаждайся.",
    "Hands off. Только вибрация и мои правила.",
  ],
  pat_rlgl: [
    "Стоп / ход. Красный — замри. Зелёный — дрожи. Понял?",
    "RLGL твой. Не перепутай цвета… иначе будет веселее.",
  ],
  pat_cluster: [
    "Пачка. Короткие взрывы — длинные слёзы радости. Угу.",
    "Cluster открыт. Готовься к рваному темпу.",
  ],
  pat_tease: [
    "Тизер on/off. Я люблю, когда ты почти… и не совсем.",
    "Tease-паттерн твой. Терпение — тоже валюта.",
  ],
  pack_hutao: [
    "Пак «Искорки»… Намекаешь, кого хочешь видеть чаще? Хе-хе.",
    "Мои искорки в твоих тегах. Лестно. И дорого.",
  ],
  pack_ruin: [
    "Пак «Грань». На грани — самое вкусное место.",
    "Ruin-вкус куплен. Не удивляйся, если кончить будет… почти.",
  ],
  beg_spark: [
    "Лишняя мольба. Учись просить красиво — я люблю шоу.",
    "+1 beg. Используй, когда голос уже дрожит.",
  ],
  cum_boost: [
    "Шанс кончить выше. Не зазнавайся — я всё ещё решаю.",
    "Cum boost твой. На следующую сессию… если заслужишь.",
  ],
  mode_anal: [
    "Режим анал открыт. Спинка прямая, дыхание ровное. Шучу. Почти.",
    "Анал в рулетке. Удачи… тебе понадобится.",
  ],
  mode_chastity: [
    "Клетка. Ключ у меня в улыбке. Чувствуешь?",
    "Chastity-режим твой. Терпение теперь официальное.",
  ],
  mode_cbt: [
    "CBT-режим. Это уже не «поиграть» — это Tide.",
    "Яйца в протоколе. Фурина будет довольна… если доживёшь.",
  ],
  mode_prone: [
    "Prone открыт. Бёдрами в кровать — руки не нужны.",
    "Tide prone: упрись и качай. Это не дрочка, это приговор.",
  ],
  mode_oral: [
    "Орал открыт. Горло — сцена для Санны.",
    "Oral-режим. Не путай с Tide: там боль, здесь… послушность.",
  ],
  mode_onahole: [
    "Онахол — только для Ху Тао. Как дрочка, но честнее.",
    "Onahole открыт. Ритм тот же — ощущения другие.",
  ],
  pack_censored: [
    "Censored-пак. Запретное на витрине — мой любимый жанр.",
    "Мозаика куплена. Смотри сквозь полосы… или не смотри.",
  ],
  pack_blacked: [
    "Blacked-колода. Контраст — тоже фетиш.",
    "Тёмный каст открыт. Не отводи глаз.",
  ],
  key_sparkle_mask: [
    "Маска Искорки… hypno, censored, tease. Одна душа из двух.",
    "Надела маску? Пока только половину цирка. Нужен ещё Клык.",
  ],
  key_iskra_fang: [
    "Клык Искры. Anal, cbt, deny — острый край второй души.",
    "Клык куплен. Без Маски цирк не откроется. Две души — один ключ к Искре.",
  ],
  mood_cruel: [
    "Злая Ху Тао в комплекте. Не плачь сразу — сначала постарайся.",
    "Mood «cruel». Я предупреждала улыбкой.",
  ],
  mood_chaotic: [
    "Хаос куплен. Планов нет. Веселья — слишком много.",
    "Chaotic mood. Держись за стул… и за рассудок.",
  ],
  mood_bored: [
    "Скучающая… значит, тебе придётся стараться громче.",
    "Bored mood. Развлеки меня, или я развлекусь тобой.",
  ],
  char_trap: [
    "Трап на колесе. Вкус расширяется — мне нравится.",
    "Архетип «трап» открыт. Не делай круглые глаза.",
  ],
  char_futanari: [
    "Футанари… Ох. Аппетиты растут. Бери.",
    "Архетип «футанари» открыт. Витрина стала интереснее.",
  ],
  char_sissy: [
    "Сисси на колесе. Сладость, стыд и дрожь — всё сразу.",
    "Архетип «сисси» открыт. Не делай круглые глаза.",
  ],
  media_gifs: [
    "Гифки. Движение без обязательств. Почти как ты.",
    "GIF-медиа открыто. Пусть дёргается красиво.",
  ],
  media_video: [
    "Видео. Дольше смотреть — дольше краснеть.",
    "Video unlocked. Не моргай — пропустишь лучшее.",
  ],
  media_all: [
    "Всё медиа. Жадность мне к лицу… и тебе тоже.",
    "Фильтр снят. Пусть идёт всё, что захочет рулетка.",
  ],
};

const PREMIUM_FALLBACK: string[] = [
  "Куплено. Хороший мальчик… или нет. Разберёмся на сессии.",
  "Угольки приняты. Товар твой — совесть оставь у двери.",
  "Сделка. Мне нравится, когда ты платишь без лишних слов.",
];

const HU_TAO_SHOP: ShopDialoguePack = {
  GREET,
  IDLE,
  CLICK,
  FETISH_BUY,
  PREMIUM_BUY,
  PREMIUM_FALLBACK,
  FAIL_LOW: [
    "Эй. Угольков мало. Заработай — потом торгуйся.",
    "Пустой карман? Тогда глазки с витрины убери.",
    "Не хватает. Послушание сначала — покупки потом.",
  ],
  FAIL_OWNED: [
    "Уже куплено. Жадина… но милая жадина.",
    "Это уже твоё. Не жми дважды — я заметила.",
  ],
  FAIL_GENERIC: [
    "Не вышло. Попробуй ещё… или просто смотри на меня.",
    "Сбой сделки. Не на меня злись — на кошелёк.",
  ],
};

const SHOP_DIALOGUE_BY_ID: Record<MistressId, ShopDialoguePack> = {
  hu_tao: HU_TAO_SHOP,
  furina: FURINA_SHOP_DIALOGUE as unknown as ShopDialoguePack,
  sunna: SUNNA_SHOP_DIALOGUE as unknown as ShopDialoguePack,
  sparkle: SPARKLE_SHOP_DIALOGUE as unknown as ShopDialoguePack,
};

function activeShopDialogue(): ShopDialoguePack {
  return SHOP_DIALOGUE_BY_ID[getActiveMistress().id];
}

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function fetishDisplayName(item: ShopItem): string {
  const fromQuotes = item.nameRu.match(/[«"]([^»"]+)[»"]/);
  if (fromQuotes?.[1]) return fromQuotes[1];
  return item.payload.replace(/_/g, " ");
}

export function shopGreetLine(): string {
  return pick(activeShopDialogue().GREET);
}

export function shopIdleLine(): string {
  return pick(activeShopDialogue().IDLE);
}

export function shopClickLine(): string {
  return pick(activeShopDialogue().CLICK);
}

export function shopPurchaseLine(item: ShopItem): string {
  const pack = activeShopDialogue();
  if (item.kind === "dyn_tag" || item.kind === "fetish") {
    const name = fetishDisplayName(item);
    return pick(pack.FETISH_BUY).replaceAll("{name}", name);
  }
  const unique = pack.PREMIUM_BUY[item.id];
  if (unique && unique.length > 0) return pick(unique);
  return pick(pack.PREMIUM_FALLBACK);
}

export function shopPurchaseFailLine(reason: string): string {
  const pack = activeShopDialogue();
  if (reason.includes("Мало") || reason.toLowerCase().includes("угол")) {
    return pick(pack.FAIL_LOW);
  }
  if (reason.includes("Уже")) {
    return pick(pack.FAIL_OWNED);
  }
  return pick(pack.FAIL_GENERIC);
}
