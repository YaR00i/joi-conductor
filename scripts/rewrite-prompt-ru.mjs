/**
 * Rewrite Russian prompt questions/answers for clarity.
 * Also attaches afterGoals for contextual feeling prompts.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const file = path.join(root, "data/character/hu-tao-prompts.json");
const raw = JSON.parse(fs.readFileSync(file, "utf8"));

const YES_NO_MUTE = [
  { id: "yes", labelRu: "Да", effect: null },
  { id: "no", labelRu: "Нет", effect: null },
  { id: "mute", labelRu: "Не отвечу", effect: "mute" },
];

function patchOptions(opts, labelById) {
  return opts.map((o) => ({
    ...o,
    labelRu: labelById[o.id] ?? o.labelRu,
  }));
}

/** Feeling: clearer RU + afterGoals context */
const FEELING = {
  feeling_holding: {
    labelRu: "Как ты сейчас держишься после паузы / «держи»?",
    afterGoals: ["hold"],
    options: { good: "Нормально держусь", bad: "Тяжело / трясёт", mute: "Не отвечу" },
  },
  feeling_edge: {
    labelRu: "Только что был эдж. Ещё на грани или уже срываешься?",
    afterGoals: ["edge"],
    options: { good: "Ещё терплю", bad: "Срываюсь", mute: "Не отвечу" },
  },
  feeling_brain: {
    labelRu: "Мозг ещё думает своими словами — или уже только о члене?",
    afterGoals: ["stroke", "ladder", "countdown"],
    options: { good: "Ещё думаю", bad: "Только похоть", mute: "Не отвечу" },
  },
  feeling_need: {
    labelRu: "Насколько сильно сейчас нуждаешься в моём контроле?",
    afterGoals: ["edge", "hold"],
    options: { good: "Ещё терпимо", bad: "Очень нуждаюсь", mute: "Не отвечу" },
  },
  feeling_shake: {
    labelRu: "Ноги / тело уже трясутся от напряжения?",
    afterGoals: ["edge", "hold"],
    options: { good: "Держусь ровно", bad: "Да, трясусь", mute: "Не отвечу" },
  },
  feeling_pace: {
    labelRu: "Как тебе темп дрочки только что — нормально или слишком?",
    afterGoals: ["stroke", "ladder", "countdown"],
    options: { good: "В самый раз", bad: "Слишком много", mute: "Не отвечу" },
  },
  feeling_drip: {
    labelRu: "Уже течёшь / мокрый — или ещё сухо и упрямо?",
    afterGoals: ["stroke", "edge"],
    options: { good: "Ещё сухо", bad: "Уже мокрый", mute: "Не отвечу" },
  },
  feeling_focus: {
    labelRu: "Куда смотришь сейчас: на меня или залип в порно на экране?",
    afterGoals: [],
    options: { good: "На тебя", bad: "В экран", mute: "Не отвечу" },
  },
  feeling_pride: {
    labelRu: "Гордость ещё на месте — или уже готов назвать себя моей игрушкой?",
    afterGoals: ["edge", "hold"],
    options: { good: "Ещё гордый", bad: "Я игрушка", mute: "Не отвечу" },
  },
  feeling_cum_urge: {
    labelRu: "После эджей / руина — насколько громко хочется кончить прямо сейчас?",
    afterGoals: ["ruin_attempt", "edge"],
    options: { good: "Ещё терпимо", bad: "Очень сильно", mute: "Не отвечу" },
  },
  feeling_obey: {
    labelRu: "Ты сейчас слушаешься меня — или тихо сопротивляешься?",
    afterGoals: ["stroke", "edge", "hold"],
    options: { good: "Слушаюсь", bad: "Сопротивляюсь", mute: "Не отвечу" },
  },
  feeling_shame: {
    labelRu: "Стыдно от того, что я тобой командую?",
    afterGoals: ["hold", "edge"],
    options: { good: "Немного", bad: "Очень стыдно", mute: "Не отвечу" },
  },
  feeling_hutao_focus: {
    labelRu: "Мозг сейчас залип на мне (Ху Тао) — или мысли разбежались?",
    afterGoals: [],
    options: { good: "Только о тебе", bad: "Мысли разбежались", mute: "Не отвечу" },
  },
  feeling_guest_girl: {
    labelRu: "Чужие девочки на экране (Фурина, Norma…) — возбуждают сильнее, чем я?",
    afterGoals: [],
    options: { good: "Да, сильнее", bad: "Хочу только тебя", mute: "Не отвечу" },
  },
  feeling_pride_crush: {
    labelRu: "Если я раздавлю твою гордость «на стриме» — тебе страшно или приятно?",
    afterGoals: [],
    options: { good: "Приятно", bad: "Страшно", mute: "Не отвечу" },
  },
};

const CONFESS = {
  confess_crave: {
    labelRu: "Что сильнее всего тебя ломает прямо сейчас? Выбери одно.",
    options: {
      feet: "Ножки / стопы",
      flat: "Маленькая грудь",
      hum: "Унижение",
      mute: "Не отвечу",
    },
  },
  confess_hutao_only: {
    labelRu: "Ты дрочишь именно на меня (Ху Тао) — или «любая красивая» тоже ок?",
    options: {
      hutao: "Только на тебя",
      any: "Любая красивая",
      mute: "Не отвечу",
    },
  },
  confess_girl_pick: {
    labelRu: "На ком из этих девочек ты сейчас плывёшь сильнее всего?",
    options: {
      hutao: "Ху Тао",
      furina: "Фурина",
      norma: "Norma",
      sunna: "Sunna",
      aria: "Aria",
      mute: "Не отвечу",
    },
  },
  confess_zzz_or_genshin: {
    labelRu: "Что тебе ближе по вселенной контента: Genshin или Zenless Zone Zero?",
    options: {
      genshin: "Genshin",
      zzz: "ZZZ",
      both: "Оба / всё равно",
      mute: "Не отвечу",
    },
  },
  confess_owned: {
    labelRu: "Стыдно, что геймерша-Ху Тао тобой командует — или гордишься этим?",
    options: {
      yes: "Да, стыдно",
      proud: "Горжусь этим",
      mute: "Не отвечу",
    },
  },
  confess_hate: {
    labelRu: "Что бесит, но всё равно возбуждает? Выбери то, от чего морщишься.",
    options: {
      cum: "Играть со спермой",
      cbt: "Удары / давление на яйца",
      toilet: "Туалет / унижение там",
      mute: "Не отвечу",
    },
  },
  confess_body: {
    labelRu: "На какую часть тела тебе важнее смотреть сейчас?",
    options: {
      feet: "Ноги / стопы",
      thighs: "Бёдра",
      armpit: "Подмышки",
      mute: "Не отвечу",
    },
  },
  confess_mean: {
    labelRu: "От чего сильнее вздрагиваешь (даже если «не любишь»)?",
    options: {
      bondage: "Бондаж / фиксация",
      denial: "Отказ кончить / denial",
      anal: "Жёсткий анал",
      mute: "Не отвечу",
    },
  },
  confess_oral: {
    labelRu: "Какой oral-контент на экране тебе ближе?",
    options: {
      soft: "Нежный, «поклонение»",
      messy: "Грязный / слюни",
      size: "Огромный размер / шок",
      mute: "Не отвечу",
    },
  },
  confess_public: {
    labelRu: "Что цепляет сильнее: уют «дома за компом» или риск / стыд на людях?",
    options: {
      gamer: "Уют / геймерша",
      public: "Публичный стыд",
      pet: "Pet play",
      mute: "Не отвечу",
    },
  },
};

const LOYALTY = {
  loyalty_hands_15: {
    labelRu: "Руки прочь от члена на 15 секунд. Согласен выдержать?",
    options: { yes: "Да", no: "Нет", mute: "Не отвечу" },
  },
  loyalty_hands_25: {
    labelRu: "Руки прочь от члена на 25 секунд. Согласен выдержать?",
    options: { yes: "Да", no: "Нет", mute: "Не отвечу" },
  },
  loyalty_edge_hold: {
    labelRu: "Держи грань ~20 секунд без срыва. Согласен?",
    options: { yes: "Да", no: "Нет", mute: "Не отвечу" },
  },
  loyalty_eyes: {
    labelRu: "Смотри на экран / на меня и не трогай себя ~18 секунд. Согласен?",
    options: { yes: "Да", no: "Нет", mute: "Не отвечу" },
  },
  loyalty_tip_only: {
    labelRu: "Только головка, без полного хода ~22 секунды. Согласен?",
    options: { yes: "Да", no: "Нет", mute: "Не отвечу" },
  },
  loyalty_hutao_gaze: {
    labelRu: "Смотри на меня (Ху Тао) ~20 секунд без отвода глаз. Согласен?",
    options: { yes: "Да", no: "Нет", mute: "Не отвечу" },
  },
};

const OBEY = {
  obey_tip: {
    labelRu: "Проверка: что я только что приказала делать с членом?",
    options: {
      tip: "Только головка",
      full: "Полный ход",
      off: "Руки прочь",
    },
  },
  obey_stop: {
    labelRu: "Проверка: какой приказ сейчас правильный?",
    options: {
      fast: "Быстрее",
      off: "Руки прочь",
      hard: "Жёстче",
    },
  },
  obey_slow: {
    labelRu: "Проверка: какое правило темпа сейчас действует?",
    options: {
      slow: "Медленно",
      fast: "Быстро",
      cum: "Можно кончать",
    },
  },
  obey_balls: {
    labelRu: "Проверка: что сейчас делать руками?",
    options: {
      shaft: "Дрочить ствол",
      balls: "Мягко яйца",
      nip: "Соски",
    },
  },
  obey_breathe: {
    labelRu: "Проверка: что я велела вместо «гнать к эджу»?",
    options: {
      stroke: "Дрочить",
      breathe: "Дышать / стоп",
      edge: "Гнать к эджу",
    },
  },
  obey_match: {
    labelRu: "Проверка: чей темп ты обязан повторять?",
    options: {
      mine: "Мой темп",
      beat: "Темп Ху Тао",
      skip: "Можно пропустить",
    },
  },
  obey_who: {
    labelRu: "Проверка: кто хозяин этой сессии?",
    options: {
      hutao: "Ху Тао",
      me: "Я сам",
      noone: "Никто",
    },
  },
  obey_role: {
    labelRu: "Проверка: кем я для тебя сейчас?",
    options: {
      gamer: "Геймерша / хозяйка",
      npc: "NPC из игры",
      friend: "Просто подруга",
    },
  },
};

const DARE = {
  dare_cbt_20: {
    labelRu: "Смелость: 20 лёгких ударов по яйцам за ~10 секунд. Берёшься?",
  },
  dare_cbt_squeeze: {
    labelRu: "Смелость: сжать яйца и держать ~15 секунд. Берёшься?",
  },
  dare_tip_only: {
    labelRu: "Смелость: только головка ~20 секунд, без полного хода. Берёшься?",
  },
  dare_hands_off_edge: {
    labelRu: "Смелость: руки прочь и держи грань ~25 секунд. Берёшься?",
  },
  dare_spit: {
    labelRu: "Смелость: плюнь на головку (сделай за ~8 секунд). Берёшься?",
  },
  dare_slap_head: {
    labelRu: "Смелость: 10 шлепков по головке за ~12 секунд. Берёшься?",
  },
  dare_cage_lock: {
    labelRu: "Смелость: надеть клетку сейчас (и оставить часы после сессии). Берёшься?",
  },
  dare_cage_long: {
    labelRu: "Смелость: долгая клетка после сессии (примерно 4–12 часов). Берёшься?",
  },
  dare_cum_eat: {
    labelRu: "Обещание: если кончишь / будет руин — съешь для меня. Обещаешь?",
  },
  dare_base_squeeze: {
    labelRu: "Смелость: сжать у основания члена ~18 секунд. Берёшься?",
  },
  dare_edge_ad: {
    labelRu: "Смелость: несколько эджей подряд (edge-ad) прямо сейчас. Берёшься?",
  },
  dare_dice_chaos: {
    labelRu: "Смелость: бросить «кости хаоса» — случайно ломаем план сессии. Берёшься?",
  },
  dare_say_hutao: {
    labelRu: "Смелость: скажи вслух «Ху Тао» 10 раз за ~15 секунд. Берёшься?",
  },
  dare_thank_hutao: {
    labelRu: "Смелость: вслух поблагодари Ху Тао за то, что она тобой командует. Берёшься?",
  },
  dare_stare_no_touch: {
    labelRu: "Смелость: руки за спину, смотри на экран ~20 секунд. Берёшься?",
  },
  dare_slow_count: {
    labelRu: "Смелость: дрочи медленно и считай вслух до 25. Берёшься?",
  },
  dare_edge_whisper: {
    labelRu: "Смелость: на грани шепчи «please» ~18 секунд. Берёшься?",
  },
};

const DARE_OPTS = {
  yes: "Да",
  no: "Нет",
  mute: "Не отвечу",
  accept: "Да",
  refuse: "Нет",
  promise: "Обещаю",
  roll: "Бросай",
};

const PERMISSION = {
  perm_beg_release: {
    labelRu: "Хочешь умолять меня о разрешении кончить — или сразу отказ?",
    options: {
      please: "Умоляю…",
      skip: "Не буду умолять",
      deny: "Хочу отказ (denial)",
    },
  },
  perm_beg_mean: {
    labelRu: "Встань на колени в голове: умолять… или честно хочешь denial?",
    options: {
      please: "Пожалуйста…",
      skip: "Промолчу",
      deny: "Хочу denial",
    },
  },
};

const FINALE = {
  finale_bias_cum: {
    labelRu: "Хочешь, чтобы финал чаще вёл к полноценному оргазму?",
    options: {
      yes: "Да, хочу кончить",
      deny: "Нет, хочу denial",
      ruin: "Лучше руин",
    },
  },
  finale_bias_deny: {
    labelRu: "Честно про финал: кончить, руин или полный отказ?",
    options: {
      cum: "Кончить",
      ruin: "Руин",
      deny: "Denial / отказ",
    },
  },
};

const MOOD = {
  offer_meaner_sweet: {
    labelRu: "Хочешь, чтобы я стала злее и жёстче (меньше «милости»)?",
  },
  offer_harsher_horny: {
    labelRu: "Хочешь, чтобы я вела жёстче — меньше дразнилок, больше приказов?",
  },
  offer_softer_cruel: {
    labelRu: "Хочешь, чтобы я стала добрее и мягче до конца сессии?",
  },
  offer_even_meaner: {
    labelRu: "Хочешь ещё злее / хаотичнее, чем сейчас?",
  },
  offer_horny_up: {
    labelRu: "Хочешь, чтобы я стала похотливее и грязнее вместо «милой»?",
  },
  offer_deny_more: {
    labelRu: "Хочешь меньше жалости дальше: больше эджей, меньше пощады?",
  },
};

const EQUIP = {
  equip_plug: {
    labelRu: "Засунь пробку в попку и оставь. Когда сделаешь — жми «Да».",
  },
  equip_vibe_plug: {
    labelRu: "Вставь вибро-пробку. Когда сделаешь — жми «Да».",
  },
  equip_edge2: {
    labelRu: "Вставь Edge 2 (вместо пробки). Когда сделаешь — жми «Да».",
  },
  equip_wand: {
    labelRu: "Возьми wand в руку. Когда готов — жми «Да».",
  },
  equip_cage: {
    labelRu: "Надень клетку. Когда надел — жми «Да».",
  },
  equip_dildo_s: {
    labelRu: "Возьми / вставь маленькое дилдо. Когда готово — жми «Да».",
  },
};

const WAGER_LABELS = {
  wg_feet_soft: "Показать на экране мягкие ножки / стопы?",
  wg_foot_worship: "Показать поклонение стопам (foot worship)?",
  wg_footjob_soft: "Показать мягкий футджоб?",
  wg_soles_close: "Показать стопы крупным планом?",
  wg_socks: "Показать носочки / босые после кроссовок?",
  wg_thighhighs: "Показать чулки / thighhighs?",
  wg_heels: "Показать каблуки и ножки?",
  wg_small_chest: "Показать маленькую грудь?",
  wg_paizuri_small: "Показать пайзури с маленькой грудью?",
  wg_oral_soft: "Показать нежный oral / «поклонение»?",
  wg_handjob: "Показать handjob от первого лица?",
  wg_pet_soft: "Показать мягкий pet play?",
  wg_armpit: "Показать подмышки?",
  wg_wet_panties: "Показать мокрые трусики?",
  wg_upskirt: "Показать заглядывание под юбку?",
  wg_shy_blush: "Показать смущение / румянец?",
  wg_hoodie: "Показать худи / crop top вайб?",
  wg_gamer: "Показать геймершу за сетапом?",
  wg_thighs: "Показать бёдра / мягкий facesitting?",
  wg_kiss_feet: "Показать поцелуи / лизание стоп?",
  wg_mirror: "Показать зеркальное селфи-дразнение?",
  wg_sleepy: "Показать сонную / ленивую дразнилку?",
  wg_covered_eyes: "Показать закрытые / закрытые руками глаза?",
  wg_huge_penis: "Показать огромный размер на экране?",
  wg_hutao_me: "Хочешь подрочить на меня (Ху Тао) на экране?",
  wg_hutao_only: "Только Ху Тао на экране дальше?",
  wg_hutao_setup: "Показать Ху Тао за компом / в гарнитуре?",
  wg_hutao_hat: "Показать улыбку геймерши Ху Тао?",
  wg_hutao_lingerie: "Показать Ху Тао в белье?",
  wg_hutao_feet: "Показать стопы Ху Тао?",
  wg_furina_me: "Показать Фурину на экране?",
  wg_furina_look: "Показать Фурину с прямым взглядом?",
  wg_furina_lingerie: "Показать Фурину в белье?",
  wg_norma_me: "Показать Norma (ZZZ) на экране?",
  wg_norma_look: "Показать Norma с прямым взглядом?",
  wg_sunna_me: "Показать Sunna (ZZZ) на экране?",
  wg_sunna_look: "Показать Sunna с прямым взглядом?",
  wg_aria_me: "Показать Aria (ZZZ) на экране?",
  wg_aria_look: "Показать Aria с прямым взглядом?",
  wg_zzz_trio: "Показать ZZZ-девочек (Norma / Sunna / Aria)?",
  wb_cum_feet: "Показать сперму на ножках?",
  wb_lick_cum_feet: "Показать сперму на стопах + вылизывание?",
  wb_facial: "Показать facial / сперму на лице?",
  wb_cum_eat: "Показать поедание спермы / snowball?",
  wb_creampie: "Показать creampie / выпуклость живота?",
  wb_ahegao_break: "Показать ахегао / «слом мозга»?",
  wb_corruption: "Показать corruption / сердечки в глазах?",
  wb_deepthroat: "Показать deepthroat / выпуклость в горле?",
  wb_bdsm: "Показать BDSM / зажимы / пробку?",
  wb_denial_toys: "Показать denial / пытку вибратором?",
  wb_pet_humiliation: "Показать pet play + унижение?",
  wb_public: "Показать публичность / exhibitionism?",
  wb_size_awe: "Показать огромный размер / разницу?",
  wb_huge_penis: "Показать огромный пенис жёстко?",
  wb_covered_eyes: "Показать закрытые глаза жёстко / бондаж?",
  wb_choking: "Показать choking / breath play?",
  wb_squirt_overstim: "Показать сквирт / перестимуляцию?",
  wb_spit: "Показать слюни / spit / messy?",
  wb_torn: "Показать рваную одежду / мокрое?",
  wb_cbt: "Показать CBT / фокус на яйцах?",
  wb_ruin: "Показать ruined orgasm на экране?",
  wb_chastity: "Показать chastity / клетку?",
  wb_spank: "Показать шлепки / следы?",
  wb_toilet: "Показать туалет / bathroom humiliation?",
  wb_blackmail: "Показать фантазию шантажа?",
  wb_anal_rough: "Показать жёсткий анал / gaping?",
  wb_eye_contact: "Показать жёсткий взгляд в камеру?",
  wb_hutao_ahegao: "Показать ахегао Ху Тао?",
  wb_hutao_bondage: "Показать Ху Тао в бондаже?",
  wb_hutao_cum: "Показать кончить на лицо Ху Тао (экран)?",
  wb_hutao_after: "Показать Ху Тао после секса / used?",
  wb_furina_ahegao: "Показать ахегао Фурины?",
  wb_furina_cum: "Показать facial на Фурину (экран)?",
  wb_norma_ahegao: "Показать ахегао Norma?",
  wb_norma_bondage: "Показать Norma в бондаже?",
  wb_sunna_ahegao: "Показать ахегао Sunna?",
  wb_sunna_cum: "Показать facial на Sunna (экран)?",
  wb_aria_ahegao: "Показать ахегао Aria?",
  wb_aria_cum: "Показать facial на Aria (экран)?",
};

function applyMap(list, map, { forceYesNoMute = false, dareStyle = false } = {}) {
  for (const p of list) {
    const m = map[p.id];
    if (!m) continue;
    if (m.labelRu) p.labelRu = m.labelRu;
    if (m.afterGoals) p.afterGoals = m.afterGoals;
    if (m.afterGoals && m.afterGoals.length === 0) delete p.afterGoals;
    if (m.options) {
      p.options = p.options.map((o) => ({
        ...o,
        labelRu: m.options[o.id] ?? o.labelRu,
      }));
    }
    if (forceYesNoMute) {
      p.options = p.options.map((o) => {
        if (o.effect === "mute") return { ...o, labelRu: "Не отвечу" };
        if (
          o.effect === "mood_harsher" ||
          o.effect === "mood_softer" ||
          o.effect === "mood_horny" ||
          o.effect === "equip_yes" ||
          o.effect === "loyalty_yes" ||
          o.effect === "dare_accept" ||
          o.effect === "wager_yes"
        ) {
          return { ...o, labelRu: "Да" };
        }
        if (
          o.effect === "mood_refuse" ||
          o.effect === "equip_no" ||
          o.effect === "loyalty_no" ||
          o.effect === "dare_refuse" ||
          o.effect === "wager_no"
        ) {
          return { ...o, labelRu: "Нет" };
        }
        return o;
      });
    }
    if (dareStyle) {
      p.options = p.options.map((o) => ({
        ...o,
        labelRu: DARE_OPTS[o.id] ?? o.labelRu,
      }));
      // normalize accept labels
      for (const o of p.options) {
        if (o.effect === "dare_accept") o.labelRu = o.id === "promise" ? "Обещаю" : o.id === "roll" ? "Бросай" : "Да";
        if (o.effect === "dare_refuse") o.labelRu = "Нет";
        if (o.effect === "mute") o.labelRu = "Не отвечу";
      }
    }
  }
}

applyMap(raw.feeling, FEELING);
applyMap(raw.confess, CONFESS);
applyMap(raw.loyalty, LOYALTY, { forceYesNoMute: true });
applyMap(raw.obey, OBEY);
applyMap(raw.dare, DARE, { dareStyle: true });
applyMap(raw.permission, PERMISSION);
applyMap(raw.finaleBias, FINALE);
applyMap(raw.moodOffer, MOOD, { forceYesNoMute: true });
applyMap(raw.equip, EQUIP, { forceYesNoMute: true });

for (const p of [...(raw.wagerGood ?? []), ...(raw.wagerBad ?? [])]) {
  if (WAGER_LABELS[p.id]) p.labelRu = WAGER_LABELS[p.id];
  p.options = p.options.map((o) => {
    if (o.effect === "wager_yes") return { ...o, labelRu: "Да" };
    if (o.effect === "wager_no") return { ...o, labelRu: "Нет" };
    if (o.effect === "mute") return { ...o, labelRu: "Не отвечу" };
    return o;
  });
}

fs.writeFileSync(file, JSON.stringify(raw, null, 2) + "\n", "utf8");
console.log("Rewrote RU prompts + afterGoals in", file);
