/** Fetish catalog data — no unlock/wallet imports (avoids circular deps). */

export type FetishTier = "light" | "medium" | "hard" | "sadistic";

export type FetishEntry = {
  id: string;
  labelRu: string;
  /**
   * Fetish / act tags only (space-separated).
   * Do NOT bake 1girl / trap / media type — those are separate roulette wheels.
   * Optional `rating:questionable` is kept when composing.
   */
  tags: string;
  weight?: number;
};

/** Soft / pretty / conventional — first fetish wheel. */
export const FETISH_LIGHT: FetishEntry[] = [
  { id: "light_beauty", labelRu: "Красота / взгляд", tags: "looking_at_viewer" },
  { id: "light_lingerie", labelRu: "Бельё", tags: "lingerie" },
  { id: "light_swimsuit", labelRu: "Купальник", tags: "swimsuit" },
  { id: "light_stockings", labelRu: "Чулки", tags: "stockings" },
  { id: "light_panties", labelRu: "Трусики", tags: "panties" },
  { id: "light_maid", labelRu: "Горничная", tags: "maid" },
  { id: "light_kiss", labelRu: "Поцелуй", tags: "kiss" },
  { id: "light_breasts", labelRu: "Грудь", tags: "breasts" },
  { id: "light_thighs", labelRu: "Бёдра", tags: "thighs" },
  { id: "light_ass", labelRu: "Попа", tags: "ass" },
  { id: "light_nude", labelRu: "Нюд", tags: "nude" },
  { id: "light_handjob", labelRu: "Handjob", tags: "handjob" },
  { id: "light_cleavage", labelRu: "Декольте", tags: "cleavage" },
  { id: "light_wet", labelRu: "Мокрая", tags: "wet" },
  { id: "light_aftercare", labelRu: "Afterglow", tags: "after_sex" },
];

/** More explicit acts — still “hot”, not niche. */
export const FETISH_MEDIUM: FetishEntry[] = [
  { id: "med_oral", labelRu: "Минет", tags: "fellatio" },
  { id: "med_cunnilingus", labelRu: "Куннилингус", tags: "cunnilingus" },
  { id: "med_paizuri", labelRu: "Пайзури", tags: "paizuri" },
  { id: "med_cowgirl", labelRu: "Наездница", tags: "cowgirl_position" },
  { id: "med_doggy", labelRu: "Сзади", tags: "doggystyle" },
  { id: "med_missionary", labelRu: "Миссионерская", tags: "missionary" },
  { id: "med_footjob", labelRu: "Footjob", tags: "footjob" },
  { id: "med_ahegao", labelRu: "Ахегао", tags: "ahegao" },
  { id: "med_bondage", labelRu: "Лёгкий бондаж", tags: "bondage" },
  { id: "med_creampie", labelRu: "Кримпай", tags: "creampie" },
  { id: "med_facial", labelRu: "Фейшал", tags: "facial" },
  { id: "med_cum_mouth", labelRu: "В рот", tags: "cum_in_mouth" },
  { id: "med_standing", labelRu: "Стоя", tags: "standing_sex" },
  { id: "med_from_behind", labelRu: "Сзади (вид)", tags: "sex_from_behind" },
  { id: "med_masturbation", labelRu: "Мастурбация", tags: "masturbation" },
];

/** Niche body / sweat / specific — less “pretty default”. */
export const FETISH_HARD: FetishEntry[] = [
  { id: "hard_armpit", labelRu: "Подмышки", tags: "armpits" },
  { id: "hard_soles", labelRu: "Складки стоп", tags: "soles" },
  { id: "hard_sweat", labelRu: "Пот", tags: "sweat" },
  { id: "hard_pubes", labelRu: "Волосатость", tags: "pubic_hair" },
  { id: "hard_body_writing", labelRu: "Надписи на теле", tags: "body_writing" },
  { id: "hard_spank", labelRu: "Шлёпанье", tags: "spanked" },
  { id: "hard_collar", labelRu: "Ошейник", tags: "collar" },
  { id: "hard_smell_feet", labelRu: "Запах ног", tags: "foot_worship" },
  { id: "hard_deepthroat", labelRu: "Deepthroat", tags: "deepthroat" },
  { id: "hard_anal", labelRu: "Анал", tags: "anal" },
  { id: "hard_precum", labelRu: "Предэякулят", tags: "precum" },
  { id: "hard_musk", labelRu: "Мускус / запах", tags: "smelling" },
  { id: "hard_chastity", labelRu: "Клетка (арт)", tags: "chastity_cage" },
  { id: "hard_pegging", labelRu: "Пеггинг", tags: "pegging" },
  { id: "hard_throat", labelRu: "Горло", tags: "irrumatio" },
];

/**
 * Sadistic / cruel tease: clothed denial, dirty, light etchi.
 * Character (girl/trap/…) is chosen on a separate wheel.
 */
export const FETISH_SADISTIC: FetishEntry[] = [
  {
    id: "sad_clothed",
    labelRu: "Одетая (etchi)",
    tags: "rating:questionable fully_clothed",
  },
  {
    id: "sad_skirt",
    labelRu: "Юбка / upskirt",
    tags: "rating:questionable upskirt",
  },
  {
    id: "sad_clothed_tease",
    labelRu: "Одетый tease",
    tags: "rating:questionable fully_clothed",
  },
  { id: "sad_smell_clothes", labelRu: "Запах одежды", tags: "used_panties" },
  { id: "sad_dirty", labelRu: "Грязь / messy", tags: "dirty" },
  { id: "sad_spit", labelRu: "Слюни", tags: "spit" },
  { id: "sad_public", labelRu: "Публично", tags: "exhibitionism" },
  { id: "sad_ignore", labelRu: "Игнор / cellphone", tags: "cellphone" },
  { id: "sad_shoes", labelRu: "Обувь / носки", tags: "sneakers" },
  { id: "sad_pantyhose", labelRu: "Колготки", tags: "pantyhose" },
  {
    id: "sad_cf_nm",
    labelRu: "Одета / он голый",
    tags: "clothed_female_nude_male",
  },
  { id: "sad_humiliation", labelRu: "Унижение", tags: "humiliation" },
];
