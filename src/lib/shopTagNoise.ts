/**
 * Meta / quality / count tags that should not become shop fetish offers.
 * Keep this list tight: body/act tags from favorites MUST be eligible.
 */

const NOISE = new Set(
  [
    "solo",
    "duo",
    "group",
    "1girl",
    "1boy",
    "1other",
    "2girls",
    "2boys",
    "3girls",
    "3boys",
    "multiple_girls",
    "multiple_boys",
    "male",
    "female",
    "male_focus",
    "female_focus",
    "solo_focus",
    "hetero",
    "yuri",
    "yaoi",
    "highres",
    "absurdres",
    "incredibly_absurdres",
    "lowres",
    "masterpiece",
    "best_quality",
    "high_quality",
    "normal_quality",
    "worst_quality",
    "very_aesthetic",
    "aesthetic",
    "score",
    "commentary",
    "english_commentary",
    "translated",
    "translation_request",
    "check_translation",
    "artist_name",
    "signature",
    "watermark",
    "username",
    "twitter_username",
    "patreon_username",
    "dated",
    "text",
    "english_text",
    "speech_bubble",
    "comic",
    "greyscale",
    "monochrome",
    "sketch",
    "simple_background",
    "white_background",
    "blurry",
    "depth_of_field",
    "from_side",
    "from_behind",
    "from_above",
    "from_below",
    "upper_body",
    "lower_body",
    "cowboy_shot",
    "full_body",
    "portrait",
    "close-up",
    "looking_at_viewer",
    "looking_away",
    "closed_eyes",
    "open_mouth",
    "smile",
    "blush",
    "teeth",
    "tongue",
    "fang",
    "long_hair",
    "short_hair",
    "black_hair",
    "brown_hair",
    "blonde_hair",
    "blue_hair",
    "pink_hair",
    "white_hair",
    "red_hair",
    "purple_hair",
    "green_hair",
    "grey_hair",
    "silver_hair",
    "bangs",
    "ahoge",
    "twintails",
    "ponytail",
    "braid",
    "hair_ornament",
    "blue_eyes",
    "brown_eyes",
    "red_eyes",
    "green_eyes",
    "yellow_eyes",
    "purple_eyes",
    "heterochromia",
    "lying",
    "sitting",
    "standing",
    "on_back",
    "on_bed",
    "indoors",
    "outdoors",
    "day",
    "night",
    "censored",
    "uncensored",
    "mosaic_censoring",
    "bar_censor",
    "artist_request",
    "commission",
    "virtual_youtuber",
    "animated",
    "video",
  ].map((t) => t.toLowerCase()),
);

export function isShopNoiseTag(tag: string): boolean {
  const key = tag.trim().toLowerCase();
  if (!key) return true;
  if (isJunkBooruTag(key)) return true;
  if (key.startsWith("rating:")) return true;
  if (key.startsWith("score:")) return true;
  if (key.startsWith("sort:")) return true;
  if (key.startsWith("order:")) return true;
  if (key.startsWith("user:")) return true;
  if (key.startsWith("-")) return true;
  if (/^\d+$/.test(key)) return true;
  return NOISE.has(key);
}

/**
 * Emoticon / punctuation / HTML-entity junk that sometimes leaks into
 * saved favorite tag strings (e.g. `;q`, `:d`, `!!`, `>._<`, `&gt;._&lt;`).
 */
export function isJunkBooruTag(tag: string): boolean {
  const raw = tag.trim();
  if (!raw) return true;

  const decoded = raw
    .replace(/&gt;/gi, ">")
    .replace(/&lt;/gi, "<")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#\d+;/g, "")
    .trim();
  const t = decoded.toLowerCase();
  if (!t) return true;

  // Still has HTML entity leftovers
  if (/&[a-z#0-9]+;/i.test(raw)) return true;

  // Pure digits already handled elsewhere; pure symbols / no alnum
  const alnum = (t.match(/[a-z0-9]/g) ?? []).length;
  if (alnum === 0) return true;
  if (alnum < 2) return true;

  // Short "emoticon stubs": `;q` `:d` `:q` `!!` `!?`
  if (/^[:;!?]/.test(t) && t.length <= 4) return true;
  if (/^[!?]{1,4}$/.test(t)) return true;

  // Face / kaomoji style: >._<  ^_^  o_o  etc.
  if (/[<>^~]/.test(t) && alnum / t.length < 0.55) return true;
  if (/^[.\-_'"*~^]+[a-z0-9]?[.\-_'"*~^]*$/i.test(t) && t.length <= 6) {
    return true;
  }

  // Mostly punctuation with a couple letters
  if (t.length <= 5 && alnum / t.length < 0.5) return true;

  return false;
}
