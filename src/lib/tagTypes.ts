/** Classification for owned / purchased booru tags. */

export type TagTypeId =
  | "fetish"
  | "appearance"
  | "character"
  | "artist"
  | "lore"
  | "clothing"
  | "body"
  | "action"
  | "setting"
  | "meta"
  | "other";

export type TagTypeMeta = {
  id: TagTypeId;
  nameRu: string;
  descriptionRu: string;
};

export const TAG_TYPE_META: TagTypeMeta[] = [
  {
    id: "fetish",
    nameRu: "Фавориты",
    descriptionRu:
      "Закреплённые теги. Цвет как на Gelbooru; если убрать из фаворитов — тег вернётся в свой отдел.",
  },
  {
    id: "appearance",
    nameRu: "Особенность внешности",
    descriptionRu: "Черты лица/стиля: глаза, волосы, выражение, макияж.",
  },
  {
    id: "character",
    nameRu: "Персонаж",
    descriptionRu: "Конкретный персонаж или серия (hu_tao, 2b…).",
  },
  {
    id: "artist",
    nameRu: "Артист",
    descriptionRu: "Автор арта / booru artist tag.",
  },
  {
    id: "lore",
    nameRu: "Лор",
    descriptionRu: "Вселенная, франшиза, сеттинг сюжета (genshin_impact…).",
  },
  {
    id: "clothing",
    nameRu: "Одежда",
    descriptionRu: "Костюмы, бельё, аксессуары, нудизм как стиль одежды.",
  },
  {
    id: "body",
    nameRu: "Тело",
    descriptionRu: "Фигура, грудь, бёдра, анатомия, body type.",
  },
  {
    id: "action",
    nameRu: "Действие",
    descriptionRu: "Поза, акт, взаимодействие (handjob, kissing…).",
  },
  {
    id: "setting",
    nameRu: "Место / сцена",
    descriptionRu: "Локация и атмосфера кадра (bedroom, outdoors…).",
  },
  {
    id: "meta",
    nameRu: "Мета",
    descriptionRu: "Служебные теги качества/ракурса (highres, pov, solo…).",
  },
  {
    id: "other",
    nameRu: "Другое",
    descriptionRu: "Не подходит ни под одну категорию.",
  },
];

const STORAGE_KEY = "joi-tag-types-v1";
const NATIVE_STORAGE_KEY = "joi-tag-gelbooru-native-v1";

export type TagTypeMap = Record<string, TagTypeId>;

/** Gelbooru site groups (autocomplete `category` / dapi `type`). */
export type GelbooruTagCategory =
  | "general"
  | "artist"
  | "copyright"
  | "character"
  | "metadata";

export type GelbooruNativeMap = Record<string, GelbooruTagCategory>;

const GELBOORU_CATEGORIES: readonly GelbooruTagCategory[] = [
  "general",
  "artist",
  "copyright",
  "character",
  "metadata",
];

export function tagTypeMeta(id: TagTypeId): TagTypeMeta {
  return TAG_TYPE_META.find((t) => t.id === id) ?? TAG_TYPE_META[TAG_TYPE_META.length - 1]!;
}

let typeMapCache: TagTypeMap | null = null;
let nativeMapCache: GelbooruNativeMap | null = null;
let nativePersistTimer: number | null = null;

export function resetTagTypeCaches(): void {
  if (nativePersistTimer != null) {
    if (typeof window !== "undefined") window.clearTimeout(nativePersistTimer);
    nativePersistTimer = null;
  }
  typeMapCache = null;
  nativeMapCache = null;
}

export function saveTagTypeMap(map: TagTypeMap): void {
  typeMapCache = map;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // quota
  }
}

export function loadTagTypeMap(): TagTypeMap {
  if (typeMapCache) return typeMapCache;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      typeMapCache = {};
      return typeMapCache;
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") {
      typeMapCache = {};
      return typeMapCache;
    }
    const out: TagTypeMap = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === "string" && TAG_TYPE_META.some((t) => t.id === v)) {
        out[k.toLowerCase()] = v as TagTypeId;
      }
    }
    typeMapCache = out;
    return out;
  } catch {
    typeMapCache = {};
    return typeMapCache;
  }
}

export function loadGelbooruNativeMap(): GelbooruNativeMap {
  if (nativeMapCache) return nativeMapCache;
  try {
    const raw = localStorage.getItem(NATIVE_STORAGE_KEY);
    if (!raw) {
      nativeMapCache = {};
      return nativeMapCache;
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") {
      nativeMapCache = {};
      return nativeMapCache;
    }
    const out: GelbooruNativeMap = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      const cat = parseGelbooruTagCategory(v);
      if (cat) out[k.toLowerCase()] = cat;
    }
    nativeMapCache = out;
    return out;
  } catch {
    nativeMapCache = {};
    return nativeMapCache;
  }
}

export function saveGelbooruNativeMap(map: GelbooruNativeMap): void {
  nativeMapCache = map;
  const write = () => {
    nativePersistTimer = null;
    try {
      localStorage.setItem(NATIVE_STORAGE_KEY, JSON.stringify(map));
    } catch {
      // quota
    }
  };
  if (typeof window === "undefined") {
    write();
    return;
  }
  if (nativePersistTimer != null) clearTimeout(nativePersistTimer);
  nativePersistTimer = window.setTimeout(write, 400);
}

/** Autocomplete `category` ("character") or dapi `type` (0–5). */
export function parseGelbooruTagCategory(
  raw: unknown,
): GelbooruTagCategory | null {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    switch (Math.trunc(raw)) {
      case 0:
      case 2:
        return "general";
      case 1:
        return "artist";
      case 3:
        return "copyright";
      case 4:
        return "character";
      case 5:
        return "metadata";
      default:
        return null;
    }
  }
  if (typeof raw !== "string") return null;
  const key = raw.trim().toLowerCase();
  switch (key) {
    case "general":
    case "tag":
    case "0":
      return "general";
    case "artist":
    case "1":
      return "artist";
    case "copyright":
    case "3":
      return "copyright";
    case "character":
    case "4":
      return "character";
    case "metadata":
    case "meta":
    case "5":
      return "metadata";
    default:
      return GELBOORU_CATEGORIES.includes(key as GelbooruTagCategory)
        ? (key as GelbooruTagCategory)
        : null;
  }
}

export function gelbooruCategoryToTagType(
  category: GelbooruTagCategory | null | undefined,
): TagTypeId | null {
  if (!category) return null;
  switch (category) {
    case "artist":
      return "artist";
    case "character":
      return "character";
    case "copyright":
      return "lore";
    case "metadata":
      return "meta";
    case "general":
      return null;
    default: {
      const _never: never = category;
      return _never;
    }
  }
}

export function tagTypeToGelbooruCategory(type: TagTypeId): GelbooruTagCategory {
  switch (type) {
    case "artist":
      return "artist";
    case "character":
      return "character";
    case "lore":
      return "copyright";
    case "meta":
      return "metadata";
    case "fetish":
    case "appearance":
    case "clothing":
    case "body":
    case "action":
    case "setting":
    case "other":
      return "general";
    default: {
      const _never: never = type;
      return _never;
    }
  }
}

export function rememberGelbooruNativeTypes(
  entries: ReadonlyArray<{ tag: string; category: unknown }>,
): boolean {
  const map = loadGelbooruNativeMap();
  let changed = false;
  for (const { tag, category } of entries) {
    const key = tag.trim().toLowerCase();
    const cat = parseGelbooruTagCategory(category);
    if (!key || !cat) continue;
    if (map[key] === cat) continue;
    map[key] = cat;
    changed = true;
  }
  if (changed) saveGelbooruNativeMap(map);
  return changed;
}

export function getNativeTagType(
  tag: string,
  native: GelbooruNativeMap = loadGelbooruNativeMap(),
): TagTypeId | null {
  const key = tag.trim().toLowerCase();
  return gelbooruCategoryToTagType(native[key] ?? null);
}

export function getTagType(
  tag: string,
  map: TagTypeMap = loadTagTypeMap(),
  native: GelbooruNativeMap = loadGelbooruNativeMap(),
): TagTypeId {
  const key = tag.trim().toLowerCase();
  if (!key) return "other";
  if (map[key]) return map[key];
  const fromSite = gelbooruCategoryToTagType(native[key] ?? null);
  if (fromSite) return fromSite;
  return suggestTagType(key);
}

function assignTagType(
  map: TagTypeMap,
  tag: string,
  type: TagTypeId,
  native: GelbooruNativeMap,
): void {
  const key = tag.trim().toLowerCase();
  if (!key) return;
  if (type === "fetish") {
    map[key] = "fetish";
    return;
  }
  const nativeType = gelbooruCategoryToTagType(native[key] ?? null);
  if (nativeType === type) {
    delete map[key];
    return;
  }
  map[key] = type;
}

export function setTagType(tag: string, type: TagTypeId): TagTypeMap {
  const map = loadTagTypeMap();
  assignTagType(map, tag, type, loadGelbooruNativeMap());
  saveTagTypeMap(map);
  return { ...map };
}

export function setTagTypesBulk(
  entries: Array<{ tag: string; type: TagTypeId }>,
): TagTypeMap {
  const map = loadTagTypeMap();
  const native = loadGelbooruNativeMap();
  for (const { tag, type } of entries) {
    assignTagType(map, tag, type, native);
  }
  saveTagTypeMap(map);
  return { ...map };
}

export function gelbooruChipCategory(
  tag: string,
  map: TagTypeMap = loadTagTypeMap(),
  native: GelbooruNativeMap = loadGelbooruNativeMap(),
): GelbooruTagCategory {
  const key = tag.trim().toLowerCase();
  if (native[key]) return native[key];
  return tagTypeToGelbooruCategory(getTagType(tag, map, native));
}

export function gelbooruCategoryClassName(
  category: GelbooruTagCategory,
): string {
  return `gb-tag--${category}`;
}

export function tagTypeSectionClass(type: TagTypeId): string {
  switch (type) {
    case "fetish":
      return "tag-type-section--favorite";
    case "artist":
      return "tag-type-section--artist";
    case "character":
      return "tag-type-section--character";
    case "lore":
      return "tag-type-section--copyright";
    case "meta":
      return "tag-type-section--metadata";
    case "appearance":
    case "clothing":
    case "body":
    case "action":
    case "setting":
    case "other":
      return "tag-type-section--general";
    default: {
      const _never: never = type;
      return _never;
    }
  }
}

function tagTokens(tag: string): string[] {
  return tag.split(/[_()]+/).filter(Boolean);
}

function hasTagToken(tag: string, tokens: ReadonlySet<string>): boolean {
  for (const part of tagTokens(tag)) {
    if (tokens.has(part)) return true;
  }
  return false;
}

/** Whole-token matches — avoids `hat` eating `that`, `hair` eating `chair`. */
const APPEARANCE_TOKENS = new Set([
  "halo",
  "horns",
  "wings",
  "tattoo",
  "antlers",
  "antennae",
  "kemonomimi",
  "pupils",
  "freckles",
  "ahoge",
  "sidelocks",
  "scar",
  "bruise",
  "lips",
  "nails",
  "toenails",
  "streaks",
  "furry",
  "gyaru",
  "tan",
  "tanline",
  "eyeliner",
  "ringlets",
  "frown",
  "smirk",
  "wink",
  "pout",
  "bandaid",
  "bandage",
  "bandages",
  "skin",
  "sclera",
  "bun",
  "jitome",
  "tareme",
  "tsurime",
  "mesugaki",
  "kogal",
  "tomboy",
  "plump",
  "curvy",
  "skinny",
  "oiled",
  "robot",
  "fangs",
  "snout",
  "feathers",
  "ears",
  "chibi",
  "updo",
]);

const CLOTHING_TOKENS = new Set([
  "bikini",
  "jacket",
  "hat",
  "cap",
  "socks",
  "shorts",
  "leotard",
  "collar",
  "choker",
  "sleeves",
  "hoodie",
  "coat",
  "blouse",
  "blazer",
  "bodysuit",
  "swimsuit",
  "lingerie",
  "belt",
  "garter",
  "legwear",
  "necktie",
  "ascot",
  "beanie",
  "cape",
  "scarf",
  "apron",
  "vest",
  "cardigan",
  "sweater",
  "jeans",
  "pants",
  "underwear",
  "fishnets",
  "thighhighs",
  "warmers",
  "clothes",
  "print",
  "babydoll",
  "bodystocking",
  "capelet",
  "corset",
  "cloak",
  "necklace",
  "neckerchief",
  "scrunchie",
  "harness",
  "helmet",
  "maid",
  "robe",
  "veil",
  "gauntlets",
  "camisole",
  "chaps",
  "circlet",
  "hakama",
  "qipao",
  "thong",
  "tiara",
  "sneakers",
  "sandals",
  "pajamas",
  "overalls",
  "suspenders",
  "tabi",
  "tuxedo",
  "wristband",
  "zipper",
  "cheerleader",
  "eyepatch",
  "goggles",
  "headphones",
  "headscarf",
  "headset",
  "mittens",
  "pasties",
  "pendant",
  "armor",
  "costume",
  "outfit",
  "cutout",
  "shrug",
  "heels",
  "eyewear",
  "earrings",
  "blindfold",
  "cuffs",
  "strap",
  "lace",
  "latex",
  "diaper",
  "suit",
  "towel",
  "bag",
  "backpack",
  "crown",
  "denim",
  "ofuda",
  "maebari",
  "kigurumi",
  "serafuku",
  "highleg",
  "halterneck",
  "coattails",
  "epaulettes",
  "unworn",
  "crop",
  "jewelry",
  "brooch",
  "fishnet",
  "cosplay",
  "o-ring",
  "over-kneehighs",
  "strapless",
  "sleeveless",
  "leather",
  "miko",
  "nun",
  "pumps",
  "uwabaki",
  "tailcoat",
  "skates",
  "wreath",
  "curtain",
  "fashion",
  "outfits",
  "mask",
]);

const BODY_TOKENS = new Set([
  "collarbone",
  "midriff",
  "belly",
  "piercing",
  "amputee",
  "bulge",
  "tentacles",
  "inflation",
  "underboob",
  "underbust",
  "areola",
  "areolae",
  "clitoris",
  "labia",
  "foreskin",
  "glans",
  "cervix",
  "perineum",
  "prostate",
  "hymen",
  "uterus",
  "pectorals",
  "flaccid",
  "urethra",
  "ovum",
  "ribs",
]);

const ACTION_TOKENS = new Set([
  "insertion",
  "gag",
  "anilingus",
  "asphyxiation",
  "ballbusting",
  "straddling",
  "grabbing",
  "grab",
  "footjob",
  "bathing",
  "biting",
  "threesome",
  "foursome",
  "fivesome",
  "orgy",
  "rape",
  "riding",
  "fisting",
  "cunnilingus",
  "gangbang",
  "shibari",
  "chained",
  "drinking",
  "peeking",
  "tickling",
  "hogtie",
  "frogtie",
  "deepthroat",
  "frottage",
  "dildo",
  "condom",
  "imminent",
  "pose",
  "enema",
  "buttjob",
  "facejob",
  "glansjob",
  "naizuri",
  "irrumatio",
  "pantyshot",
  "voyeurism",
  "spitroast",
  "gagged",
  "gagging",
  "handcuffed",
  "handcuffs",
  "sleeping",
  "walking",
  "waving",
  "carrying",
  "kneeling",
  "reclining",
  "pointing",
  "poking",
  "pulling",
  "punching",
  "kicking",
  "rubbing",
  "teasing",
  "talking",
  "eating",
  "feeding",
  "flashing",
  "molestation",
  "hypnosis",
  "impregnation",
  "castration",
  "electrostimulation",
  "spooning",
  "cuddling",
  "headpat",
  "selfie",
  "recording",
  "strangling",
  "torture",
  "spanking",
  "plap",
  "strap-on",
  "sandwiched",
  "seiza",
  "wariza",
  "bent",
  "nelson",
  "mating",
  "throatfuck",
  "netorare",
  "incest",
  "cbt",
]);

const SETTING_TOKENS = new Set([
  "alley",
  "arcade",
  "barn",
  "bath",
  "bathtub",
  "bench",
  "boat",
  "desk",
  "table",
  "pool",
  "kitchen",
  "onsen",
  "window",
  "bed",
  "chair",
  "classroom",
  "floor",
  "room",
  "wall",
  "ocean",
  "cave",
  "dungeon",
  "restaurant",
  "tree",
  "water",
  "door",
  "doorway",
  "mirror",
  "locker",
  "stage",
  "stadium",
  "street",
  "stairs",
  "lamp",
  "lantern",
  "sand",
  "tatami",
  "town",
  "urinal",
  "picnic",
  "nature",
  "moon",
  "ceiling",
  "pavement",
  "bookshelf",
  "kotatsu",
  "road",
  "hay",
  "shelf",
  "tiles",
  "stool",
  "television",
  "building",
  "refrigerator",
]);

const META_TOKENS = new Set([
  "background",
  "afterimage",
  "animated",
  "video",
  "koma",
  "pov",
  "username",
  "watermark",
  "sketch",
  "dated",
  "meme",
  "logo",
  "text",
  "cover",
  "censoring",
  "uncensored",
  "censored",
  "border",
  "letterboxed",
  "pillarboxed",
  "fisheye",
  "perspective",
  "sequential",
  "panels",
  "portrait",
  "timestamp",
  "subtitled",
  "spoken",
  "looking",
  "frame",
  "viewfinder",
  "realistic",
  "livestream",
  "cursor",
  "aged",
  "age",
  "style",
  "symbol",
  "object",
  "censor",
  "blur",
  "screenshot",
  "anatomy",
  "pixel",
]);

const SPECIES_BODY_RE =
  /^(?:fox|cat|dog|rabbit|bunny|cow|dragon|wolf|mouse|sheep|horse|demon|monster|ghost|insect|monkey|bee|shark|snake|bird|tiger|bear|arthropod|robot)_(?:girl|boy)$/;

const SPECIES_FEATURE_RE =
  /(?:^|_)(?:fox|cat|dog|rabbit|bunny|wolf|horse|demon|dragon|animal|bear|cow|deer|bird|tiger|mouse|sheep|monkey)_(?:ears?|tail)(?:_|$)/;

/** Exact leftover one-word tags from the shelf (no `_`). */
const ONE_WORD_TYPE: Record<string, TagTypeId> = {
  angry: "appearance",
  annoyed: "appearance",
  androgynous: "appearance",
  bald: "appearance",
  bored: "appearance",
  clueless: "appearance",
  defiant: "appearance",
  disappointed: "appearance",
  disgust: "appearance",
  excited: "appearance",
  exhausted: "appearance",
  expressionless: "appearance",
  faceless: "appearance",
  glaring: "appearance",
  grimace: "appearance",
  nervous: "appearance",
  sad: "appearance",
  scared: "appearance",
  scowl: "appearance",
  serious: "appearance",
  smug: "appearance",
  unamused: "appearance",
  worried: "appearance",
  wince: "appearance",
  sobbing: "appearance",
  wet: "appearance",
  aroused: "action",
  apologizing: "action",
  anal: "action",
  blinking: "action",
  brushing: "action",
  caught: "action",
  chikan: "action",
  crucifixion: "action",
  defloration: "action",
  drowning: "action",
  forced: "action",
  laughing: "action",
  pinching: "action",
  shaking: "action",
  shaving: "action",
  slurping: "action",
  smelling: "action",
  smoking: "action",
  struggling: "action",
  tattooing: "action",
  twitching: "action",
  architecture: "setting",
  69: "action",
  "one-eyed": "appearance",
  "wide-eyed": "appearance",
  "cross-eyed": "appearance",
  "nosebleed": "appearance",
  "pigeon-toed": "appearance",
  reaching: "action",
  screaming: "action",
  salute: "action",
  wading: "action",
  shushing: "action",
  throatfuck: "action",
  abuse: "action",
  public_nudity: "action",
};

/** Lightweight heuristic for first-time classification. */
export function suggestTagType(tag: string): TagTypeId {
  const t = tag.trim().toLowerCase();
  if (!t) return "other";

  if (t.startsWith("artist:") || /_\(artist\)$/.test(t)) {
    return "artist";
  }

  if (
    t.includes("_(genshin") ||
    t.includes("_(honkai") ||
    t.includes("_(fate") ||
    t.includes("_(azur") ||
    t.endsWith("_(series)") ||
    /_\(character\)$/.test(t)
  ) {
    return "character";
  }

  if (
    [
      "genshin_impact",
      "honkai_star_rail",
      "fate/grand_order",
      "original",
      "touhou",
    ].includes(t) ||
    t.startsWith("copyright:")
  ) {
    return "lore";
  }

  if (
    [
      "highres",
      "absurdres",
      "lowres",
      "solo",
      "1girl",
      "1boy",
      "2girls",
      "multiple_girls",
      "pov",
      "looking_at_viewer",
      "simple_background",
      "white_background",
      "greyscale",
      "monochrome",
      "translated",
      "translation_request",
      "commentary",
      "artist_request",
      "cowboy_shot",
      "from_above",
      "from_below",
      "from_side",
      "close-up",
      "dutch_angle",
      "depth_of_field",
      "blurry",
      "upper_body",
      "lower_body",
      "full_body",
    ].includes(t) ||
    t.startsWith("rating:") ||
    /^\d{4}$/.test(t) ||
    /^\d{2}s$/.test(t) ||
    /^\d+\+?(?:girls?|boys?|koma|futa)$/.test(t) ||
    hasTagToken(t, META_TOKENS)
  ) {
    return "meta";
  }

  if (t.endsWith("_pull")) {
    return "action";
  }

  if (
    SPECIES_BODY_RE.test(t) ||
    SPECIES_FEATURE_RE.test(t) ||
    hasTagToken(t, APPEARANCE_TOKENS)
  ) {
    return "appearance";
  }

  if (
    /(hair|eyes|smile|blush|tongue|teeth|fang|makeup|lipstick|eyelashes|twintails|ponytail|bangs|eyebrows)/.test(
      t,
    )
  ) {
    return "appearance";
  }

  if (hasTagToken(t, ACTION_TOKENS)) {
    return "action";
  }

  if (hasTagToken(t, BODY_TOKENS)) {
    return "body";
  }

  if (
    /(breast|nipple|ass|thigh|hip|pussy|penis|testicle|anus|navel|abs|muscular|flat_chest|large_breasts|huge_breasts|barefoot|feet|toes|soles)/.test(
      t,
    )
  ) {
    return "body";
  }

  if (hasTagToken(t, CLOTHING_TOKENS)) {
    return "clothing";
  }

  if (
    /(dress|skirt|panties|bra|stockings|pantyhose|uniform|kimono|shirt|nude|naked|footwear|shoes|boots|gloves|ribbon|bow)/.test(
      t,
    )
  ) {
    return "clothing";
  }

  if (
    /(sex|sex_|cum|ejaculation|fellatio|handjob|paizuri|penetration|kiss|licking|masturbation|fingering|orgasm|ahegao|bound|bondage|bdsm|spank|chastity|cage)/.test(
      t,
    )
  ) {
    return "action";
  }

  if (hasTagToken(t, SETTING_TOKENS)) {
    return "setting";
  }

  if (
    /(bedroom|outdoors|indoors|beach|school|bathroom|shower|night|day|rain|forest|city)/.test(
      t,
    )
  ) {
    return "setting";
  }

  if (/(holding|sitting|standing|lying|spread|from_behind|cowgirl|missionary)/.test(t)) {
    return "action";
  }

  if (ONE_WORD_TYPE[t]) {
    return ONE_WORD_TYPE[t];
  }

  return "other";
}

export function groupTagsByType<T extends { tag: string }>(
  items: T[],
  map: TagTypeMap = loadTagTypeMap(),
  native: GelbooruNativeMap = loadGelbooruNativeMap(),
): Array<{ type: TagTypeId; meta: TagTypeMeta; items: T[] }> {
  const buckets = new Map<TagTypeId, T[]>();
  for (const item of items) {
    const type = getTagType(item.tag, map, native);
    const list = buckets.get(type) ?? [];
    list.push(item);
    buckets.set(type, list);
  }
  return TAG_TYPE_META.map((meta) => ({
    type: meta.id,
    meta,
    items: buckets.get(meta.id) ?? [],
  })).filter((g) => g.items.length > 0);
}
