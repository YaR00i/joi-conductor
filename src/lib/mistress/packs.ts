import furinaBibleData from "../../../data/character/furina.json";
import furinaMoodLinesData from "../../../data/character/furina-mood-lines.json";
import huTaoBibleData from "../../../data/character/hu-tao.json";
import huTaoMoodLinesData from "../../../data/character/hu-tao-mood-lines.json";
import sparkleBibleData from "../../../data/character/sparkle.json";
import sparkleMoodLinesData from "../../../data/character/sparkle-mood-lines.json";
import sunnaBibleData from "../../../data/character/sunna.json";
import sunnaMoodLinesData from "../../../data/character/sunna-mood-lines.json";
import type { CharacterBible } from "../character";
import {
  HU_TAO_AVATAR_SRC,
  HU_TAO_MOOD_AVATAR,
  HU_TAO_MOOD_PORTRAIT,
  HU_TAO_SHOP_AVATAR_SRC,
} from "../huTaoEmoji";
import type { SessionMood } from "../types";
import type { MoodLinesPack } from "../voice/moodLines";
import type { MistressPack, MistressId } from "./types";
import { SESSION_MOODS } from "./types";
import {
  FURINA_SURFACES,
  HU_TAO_SURFACES,
  SPARKLE_SURFACES,
  SUNNA_SURFACES,
} from "./surfaces";
import {
  isMistressIdUnlocked,
  type MistressUnlockSnapshot,
} from "./mistressUnlocks";

const huTaoBible = huTaoBibleData as CharacterBible;
const huTaoMoodLines = huTaoMoodLinesData as MoodLinesPack;
const furinaBible = furinaBibleData as CharacterBible;
const furinaMoodLines = furinaMoodLinesData as MoodLinesPack;
const sunnaBible = sunnaBibleData as CharacterBible;
const sunnaMoodLines = sunnaMoodLinesData as MoodLinesPack;
const sparkleBible = sparkleBibleData as CharacterBible;
const sparkleMoodLines = sparkleMoodLinesData as MoodLinesPack;

function packMoodAssets(
  folder: string,
  labels: Record<SessionMood, string>,
  opts?: { ext?: "svg" | "png"; v?: number },
): MistressPack["assets"] {
  const ext = opts?.ext ?? "svg";
  const q = opts?.v != null ? `?v=${opts.v}` : "";
  const moodPortrait = {} as MistressPack["assets"]["moodPortrait"];
  const moodAvatar = {} as MistressPack["assets"]["moodAvatar"];
  for (const mood of SESSION_MOODS) {
    moodPortrait[mood] = {
      labelRu: labels[mood],
      src: `/${folder}/mood/${mood}.${ext}${q}`,
    };
    moodAvatar[mood] = `/${folder}/mood/full/${mood}.${ext}${q}`;
  }
  return {
    avatarFull: `/${folder}/avatar-full.${ext}${q}`,
    shopAvatar: `/${folder}/shop-avatar.${ext}${q}`,
    moodPortrait,
    moodAvatar,
  };
}

export const HU_TAO_PACK: MistressPack = {
  id: "hu_tao",
  displayNameRu: "Ху Тао",
  displayNameDativeRu: "Ху Тао",
  displayNameGenitiveRu: "Ху Тао",
  taglineRu: "Стартовая · тёплый ember JOI",
  characterTags: ["hu_tao_(genshin_impact)"],
  unlocked: true,
  theme: {
    accent: "#ff8a4a",
    accent2: "#3dd68c",
    soft: "#ffb070",
    bg0: "#0a0708",
    bg1: "#120c0b",
    bg2: "#1a100e",
    bg3: "#241612",
    line: "rgba(255, 140, 90, 0.14)",
    muted: "#b0704d",
    glowWarm: "rgba(255, 100, 50, 0.16)",
    glowCool: "rgba(255, 80, 40, 0.06)",
    scrollThumb: "rgba(255, 120, 70, 0.38)",
    scrollThumbHover: "rgba(255, 140, 90, 0.58)",
    surfaces: { ...HU_TAO_SURFACES },
  },
  bible: huTaoBible,
  moodLines: huTaoMoodLines,
  assets: {
    avatarFull: HU_TAO_AVATAR_SRC,
    shopAvatar: HU_TAO_SHOP_AVATAR_SRC,
    moodPortrait: HU_TAO_MOOD_PORTRAIT,
    moodAvatar: HU_TAO_MOOD_AVATAR,
  },
  media: {
    primaryDefaultTags: "hu_tao_(genshin_impact) rating:explicit",
    focusTags: ["1girl", "foot_focus", "solo"],
    secondaryBooruIds: [],
    cumplayBiasTags: [],
  },
  play: {
    summaryRu: "База: дрочка руками + онахол",
    hardnessRu: "Средняя",
    preferredModes: ["stroke", "onahole"],
    functionWeightHints: ["stroke", "onahole", "combo"],
    notesRu: [
      "Классический JOI: hand-stroke в приоритете",
      "Онахол — фирменный режим только у Ху Тао",
    ],
  },
  fx: {
    avatarCensor: false,
    spiralOverlay: false,
    floatingCaptions: false,
    glitchHud: false,
  },
  voice: {
    sovitsRefPath: "voice-refs/hu-tao/ref.wav",
    sovitsPromptText:
      'Hu as in "Who put me in this coffin?" and Tao as in "I can\'t geT OUt!" Hehe... No, not funny?',
    sovitsPromptLang: "en",
    sovitsTextLang: "en",
    ttsRate: 1.05,
    ttsPitch: 1.12,
  },
};

export const FURINA_PACK: MistressPack = {
  id: "furina",
  displayNameRu: "Фурина",
  displayNameDativeRu: "Фурине",
  displayNameGenitiveRu: "Фурины",
  taglineRu: "Жестокая · CBT и боль",
  characterTags: ["furina_(genshin_impact)"],
  unlocked: false,
  theme: {
    accent: "#4d8dff",
    accent2: "#f0d78c",
    soft: "#9ec1ff",
    bg0: "#060b14",
    bg1: "#0a1528",
    bg2: "#102040",
    bg3: "#183058",
    line: "rgba(77, 141, 255, 0.18)",
    muted: "#6a8ab8",
    glowWarm: "rgba(43, 108, 255, 0.2)",
    glowCool: "rgba(240, 215, 140, 0.08)",
    scrollThumb: "rgba(77, 141, 255, 0.4)",
    scrollThumbHover: "rgba(120, 170, 255, 0.58)",
    surfaces: { ...FURINA_SURFACES },
  },
  bible: furinaBible,
  moodLines: furinaMoodLines,
  assets: packMoodAssets(
    "furina",
    {
      sweet: "Мягкая",
      calm: "Холодная",
      bored: "Скучающая",
      cruel: "Судья",
      chaotic: "Драма",
      horny: "Голодная",
    },
    { ext: "png", v: 3 },
  ),
  media: {
    primaryDefaultTags: "furina_(genshin_impact) rating:explicit",
    focusTags: [
      "cbt",
      "balls",
      "pain",
      "prone_bone",
      "masturbation",
      "censored",
      "dark-skinned_male",
    ],
    secondaryBooruIds: ["censored", "blacked"],
    cumplayBiasTags: ["cum_in_mouth", "bukkake", "gokkun"],
  },
  play: {
    summaryRu: "CBT + prone (бёдра) · мало hand-stroke",
    hardnessRu: "Выше средней",
    preferredModes: ["cbt", "prone"],
    functionWeightHints: ["cbt", "plapping", "prone", "ball"],
    notesRu: [
      "Tide: разблок через CBT/plapping/prone + censored/blacked",
      "CBT и Prone — только при активной Фурине",
      "CBT: яйца (light/medium) + ствол (slap/thwack/underside) + головка (flick)",
      "Удары по члену — только без клетки; в клетке — ball mercy, не shaft CBT",
      "Prone ≠ дрочка: член упирается в поверхность, ритм бёдрами без рук",
      "Обычная дрочка руками редка — боль/давление в такт",
      "RouletteBias: жёсткие пулы · cum≤50%",
      "Tide: авто-счёт акцентов на CBT/plapping · НЕ ВЫДЕРЖАЛ → пропуски",
    ],
  },
  fx: {
    avatarCensor: false,
    spiralOverlay: false,
    floatingCaptions: false,
    glitchHud: false,
  },
  voice: {
    sovitsRefPath: "voice-refs/furina/ref.wav",
    sovitsPromptText:
      "Tea parties are a must for the well-mannered. If you'd like to learn the proper etiquette, I'd be happy to teach you.",
    sovitsPromptLang: "en",
    sovitsTextLang: "en",
    ttsRate: 0.98,
    ttsPitch: 1.08,
  },
};

export const SUNNA_PACK: MistressPack = {
  id: "sunna",
  displayNameRu: "Санна",
  displayNameDativeRu: "Санне",
  displayNameGenitiveRu: "Санны",
  taglineRu: "Idol soft · горло и клетка",
  characterTags: ["sunna_(zenless_zone_zero)"],
  unlocked: false,
  theme: {
    accent: "#f5a6c8",
    accent2: "#7ddbb5",
    soft: "#ffd0e0",
    bg0: "#120a12",
    bg1: "#1c121c",
    bg2: "#2a1a28",
    bg3: "#3a2438",
    line: "rgba(245, 166, 200, 0.2)",
    muted: "#b090a0",
    glowWarm: "rgba(245, 166, 200, 0.2)",
    glowCool: "rgba(125, 219, 181, 0.1)",
    scrollThumb: "rgba(245, 166, 200, 0.4)",
    scrollThumbHover: "rgba(125, 219, 181, 0.5)",
    surfaces: { ...SUNNA_SURFACES },
  },
  bible: sunnaBible,
  moodLines: sunnaMoodLines,
  assets: packMoodAssets(
    "sunna",
    {
      sweet: "Милая",
      calm: "Тихая",
      bored: "Зевает",
      cruel: "Строгая",
      chaotic: "Смущённая",
      horny: "Горячая",
    },
    { ext: "png", v: 2 },
  ),
  media: {
    primaryDefaultTags: "sunna_(zenless_zone_zero) rating:explicit",
    focusTags: [
      "trap",
      "sissy",
      "futanari",
      "oral",
      "deepthroat",
      "chastity_cage",
      "feminization",
      "vibrator",
    ],
    secondaryBooruIds: ["censored"],
    cumplayBiasTags: ["cum_in_mouth", "facial", "swallowing"],
  },
  play: {
    summaryRu: "Vibe-first · oral / клетка / plapping · без hand-stroke",
    hardnessRu: "Средняя+",
    preferredModes: ["oral", "chastity", "plapping"],
    functionWeightHints: ["oral", "vibe", "dildo", "ball", "plapping"],
    notesRu: [
      "Idol Soft: prep (клетка → яички → вибраторы) перед «Готов»",
      "Клетка всегда; дилдо всегда готовим (must в plapping/орал/анал; в клетке фокус — wand/пуля)",
      "Руки только на игрушках — ствол не гладить; клитор/членик в клетке",
      "Отдых: гладить яички (ствол/клитор нельзя)",
      "Chorus: oral_* — сильные акценты = глотки; «НЕ ВЫДЕРЖАЛ» горло",
      "Buzz hold: vibe endurance на клетке (руки на toy / hands-free)",
      "Plapping: клетка + дилдо — шлепки по яйцам на акцент (счётчик Tide)",
      "Cage mercy: ball_pet / ball_tug / ball_cradle / ball_weight — яички под клеткой",
      "Механика: oral_* · plapping_cage · vibe_press / hands_off_vibe · без vibe_assist",
    ],
  },
  fx: {
    avatarCensor: false,
    spiralOverlay: false,
    floatingCaptions: false,
    glitchHud: false,
  },
  voice: {
    sovitsRefPath: "voice-refs/sunna/ref.wav",
    sovitsPromptText:
      "Feels like Miss Cecilia really enjoys dolling us up like in a dress-up game.",
    sovitsPromptLang: "en",
    sovitsTextLang: "en",
    ttsRate: 1.02,
    ttsPitch: 1.15,
    /** Quiet home capture — start a bit hotter than 100%. */
    ttsVolume: 1.45,
  },
};

export const SPARKLE_PACK: MistressPack = {
  id: "sparkle",
  displayNameRu: "Искорка / Искра",
  displayNameDativeRu: "Искорке",
  displayNameGenitiveRu: "Искорки",
  taglineRu: "Две маски · хаос и анал",
  characterTags: ["sparkle_(honkai:_star_rail)"],
  unlocked: false,
  theme: {
    accent: "#c41e3a",
    accent2: "#f5f5f5",
    soft: "#f0a0b0",
    bg0: "#0a0608",
    bg1: "#12080c",
    bg2: "#1e0c12",
    bg3: "#2a0a12",
    line: "rgba(196, 30, 58, 0.22)",
    muted: "#a07078",
    glowWarm: "rgba(196, 30, 58, 0.22)",
    glowCool: "rgba(245, 245, 245, 0.06)",
    scrollThumb: "rgba(196, 30, 58, 0.45)",
    scrollThumbHover: "rgba(224, 64, 96, 0.55)",
    surfaces: { ...SPARKLE_SURFACES },
  },
  bible: sparkleBible,
  moodLines: sparkleMoodLines,
  assets: packMoodAssets("sparkle", {
    sweet: "Искорка",
    calm: "Маска",
    bored: "Пустая",
    cruel: "Искра",
    chaotic: "Хаос",
    horny: "Глючная",
  }),
  media: {
    primaryDefaultTags: "sparkle_(honkai:_star_rail) rating:explicit",
    focusTags: [
      "hypnosis",
      "anal",
      "chastity_cage",
      "censored",
      "sissy",
      "cbt",
      "penis",
    ],
    secondaryBooruIds: ["censored", "blacked"],
    cumplayBiasTags: ["cum_in_ass", "anal", "bukkake"],
  },
  play: {
    summaryRu: "Анал в клетке, phantom stroke, глюки",
    hardnessRu: "Максимум",
    preferredModes: ["anal", "chastity"],
    functionWeightHints: ["anal", "cbt", "vibe"],
    notesRu: [
      "Разблок: Tide+Idol · anal+клетка · оба пака · Маска+Клык · 1 сессия в клетке",
      "Phantom stroke + orgasm gate: anal/chastity only",
      "SessionFx + флаги sparkle_phantom / sparkle_session_fx при разблоке",
    ],
    phantomStroke: true,
    analOrgasmOnly: true,
  },
  fx: {
    avatarCensor: true,
    spiralOverlay: true,
    floatingCaptions: true,
    glitchHud: true,
  },
  voice: {
    sovitsRefPath: "voice-refs/sparkle/ref.wav",
    sovitsPromptText:
      "Look who's graced us with their presence! Guess I'll be in your shadow now.",
    sovitsPromptLang: "en",
    sovitsTextLang: "en",
    ttsRate: 1.12,
    ttsPitch: 1.18,
  },
};

const PACKS: Record<MistressId, MistressPack> = {
  hu_tao: HU_TAO_PACK,
  furina: FURINA_PACK,
  sunna: SUNNA_PACK,
  sparkle: SPARKLE_PACK,
};

export function listMistressPacks(): MistressPack[] {
  return [HU_TAO_PACK, FURINA_PACK, SUNNA_PACK, SPARKLE_PACK];
}

export function listMistressCatalog(
  unlocks?: MistressUnlockSnapshot | null,
): MistressPack[] {
  return listMistressPacks().map((pack) => {
    if (!unlocks) return pack;
    return {
      ...pack,
      unlocked: isMistressIdUnlocked(pack.id, unlocks),
    };
  });
}

export function resolveMistressUnlocked(
  id: MistressId,
  unlocks: MistressUnlockSnapshot,
): boolean {
  return isMistressIdUnlocked(id, unlocks);
}

export function getMistressPack(id: MistressId): MistressPack | null {
  return PACKS[id] ?? null;
}

export function isSelectableMistressId(id: string): id is MistressId {
  return id === "hu_tao" || id === "furina" || id === "sunna" || id === "sparkle";
}
