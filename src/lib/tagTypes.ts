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
      "Избранные теги — переноси сюда то, что чаще всего хочешь видеть.",
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

export type TagTypeMap = Record<string, TagTypeId>;

export function tagTypeMeta(id: TagTypeId): TagTypeMeta {
  return TAG_TYPE_META.find((t) => t.id === id) ?? TAG_TYPE_META[TAG_TYPE_META.length - 1]!;
}

export function loadTagTypeMap(): TagTypeMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const out: TagTypeMap = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === "string" && TAG_TYPE_META.some((t) => t.id === v)) {
        out[k.toLowerCase()] = v as TagTypeId;
      }
    }
    return out;
  } catch {
    return {};
  }
}

export function saveTagTypeMap(map: TagTypeMap): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // quota
  }
}

export function getTagType(
  tag: string,
  map: TagTypeMap = loadTagTypeMap(),
): TagTypeId {
  const key = tag.trim().toLowerCase();
  return map[key] ?? suggestTagType(key);
}

export function setTagType(tag: string, type: TagTypeId): TagTypeMap {
  const map = loadTagTypeMap();
  map[tag.trim().toLowerCase()] = type;
  saveTagTypeMap(map);
  return map;
}

export function setTagTypesBulk(
  entries: Array<{ tag: string; type: TagTypeId }>,
): TagTypeMap {
  const map = loadTagTypeMap();
  for (const { tag, type } of entries) {
    map[tag.trim().toLowerCase()] = type;
  }
  saveTagTypeMap(map);
  return map;
}

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
    ].includes(t) ||
    t.startsWith("rating:")
  ) {
    return "meta";
  }

  if (
    /(hair|eyes|smile|blush|tongue|teeth|fang|makeup|lipstick|eyelashes|twintails|ponytail|bangs)/.test(
      t,
    )
  ) {
    return "appearance";
  }

  if (
    /(breast|nipple|ass|thigh|hip|pussy|penis|testicle|anus|navel|abs|muscular|flat_chest|large_breasts|huge_breasts|barefoot|feet|toes|soles)/.test(
      t,
    )
  ) {
    return "body";
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
    return "fetish";
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

  return "other";
}

export function groupTagsByType<T extends { tag: string }>(
  items: T[],
  map: TagTypeMap = loadTagTypeMap(),
): Array<{ type: TagTypeId; meta: TagTypeMeta; items: T[] }> {
  const buckets = new Map<TagTypeId, T[]>();
  for (const item of items) {
    const type = getTagType(item.tag, map);
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
