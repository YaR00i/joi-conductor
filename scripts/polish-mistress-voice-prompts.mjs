import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "data",
  "character",
);

/** @typedef {{ speakEn: string, labelRu?: string, preferKey?: string }} Patch */

/** @type {Record<string, Patch>} */
const SUNNA = {
  sunna_f_breath: {
    speakEn:
      "Lungs still buzzing from rehearsal? How was that breath hold — cute or pathetic?",
    labelRu: "После задержки дыхания: мило терпишь или жалко?",
  },
  sunna_f_edge: {
    speakEn:
      "That edge was my chorus cue. Still on the note — or melting for the fans?",
    labelRu: "После эджа: ещё держишь ноту или уже плывёшь?",
  },
  sunna_f_brain: {
    speakEn: "Brain still yours — or just clitty, vibe, and stage lights?",
    labelRu: "Мозг ещё твой — или только клитор, вайб и свет софитов?",
  },
  sunna_f_humiliate_after: {
    speakEn:
      "After the soft encore, are you proud… or properly embarrassed for me?",
    labelRu: "После мягкого биса: гордишься или достаточно смущён?",
  },
  sunna_f_cruel: {
    speakEn:
      "Look at me. Does the strict idol scare you — or make that cage feel tighter?",
    labelRu: "Строгая айдол пугает или сильнее запирает?",
  },
  sunna_f_hold: {
    speakEn: "Still holding for the idol — or crumbling already?",
    labelRu: "После «держи»: ещё терпишь для айдол или сыпешься?",
  },
  sunna_wg_soft: {
    speakEn: "Want a softer encore for five minutes? Earn it cute.",
    labelRu: "Хочешь мягче пять минут? Заслужи мило.",
  },
  sunna_wg_edge_soft: {
    speakEn: "One clean edge for the fans. Accept?",
    labelRu: "Один чистый эдж для фанатов?",
  },
  sunna_wb_spank: {
    speakEn: "Slap your tip twice for the cameras. Accept?",
  },
  sunna_wb_denial_oath: {
    speakEn:
      "Swear to leave denied if I order it. Will you promise the idol?",
  },
  sunna_d_breath: {
    speakEn: "Breath drill — hold as I count. Fail and I mock you soft.",
  },
  sunna_d_breath_verdict: {
    speakEn:
      "Breath challenge: hold while the idol counts the beat. Smile if you shake.",
    labelRu: "Дыхательный челлендж: держи, пока айдол считает такт.",
  },
  sunna_c_pain: {
    speakEn: "Pain as stage polish — do you like it when it stings cute?",
    labelRu: "Боль как полировка номера — нравится, когда щиплет?",
  },
  sunna_l_verdict: {
    speakEn: "Will you accept my setlist without bargaining?",
    labelRu: "Примешь мой сетлист без торга?",
  },
  sunna_l_stage: {
    speakEn: "Who owns this rehearsal — you, or the idol?",
    labelRu: "Кто ведёт сессию — ты или айдол?",
  },
  sunna_mo_harsher: {
    speakEn: "Shall I sharpen the setlist? Harsher mood.",
    labelRu: "Сделать сетлист жёстче?",
  },
  sunna_mo_cruel: {
    speakEn: "Full strict-idol mode. Soft voice, hard rules. Accept?",
    labelRu: "Полный режим строгой айдол?",
  },
  sunna_fb_stage: {
    speakEn: "The stage hears cute pleas. Pick your preferred finish.",
    labelRu: "Выбери желаемый финал для сцены.",
  },
  sunna_fb_humiliate: {
    speakEn:
      "For the final encore, do you request mercy, ruin, or denial?",
    labelRu: "Для финального биса: милость, руин или отказ?",
  },
  sunna_ch_media: {
    speakEn: "Tip-only tease for the fans?",
  },
  sunna_eq_wand: {
    speakEn: "Wand on stage — pressed to the cage. Equip?",
  },
  sunna_eq_dildo: {
    speakEn:
      "Medium dildo — throat practice, or worn for a soft grind. Equip?",
  },
  sunna_eq_ring: {
    speakEn: "Cock ring as a cute stage prop for the next number. Equip?",
  },
};

/** @type {Record<string, Patch>} */
const SPARKLE = {
  spk_f_breath: {
    speakEn:
      "Lungs glitching already? How was that breath hold — bearable or broken?",
    labelRu: "После задержки дыхания: терпимо или уже глюк?",
  },
  spk_f_edge: {
    speakEn:
      "That edge was a phantom cue. Still on the loop — or melting under the mask?",
    labelRu: "После эджа: ещё в петле или уже плывёшь под маской?",
  },
  spk_f_brain: {
    speakEn: "Brain still yours — or just cage, dildo, and spiral noise?",
    labelRu: "Мозг ещё твой — или только клетка, дилдо и шум спирали?",
  },
  spk_f_pain: {
    speakEn: "Balls still ringing from Iskra's tap? Be honest for the mask.",
    labelRu: "Яйца ещё гудят после удара Искры? Честно.",
  },
  spk_f_denial_tide: {
    speakEn: "Still denied beneath the tide, or leaking through the glitch?",
    labelRu: "Всё ещё в отказе под приливом — или течёшь сквозь глюк?",
  },
  spk_f_humiliate_after: {
    speakEn:
      "After the circus beat, are you proud… or properly embarrassed under the mask?",
    labelRu: "После номера: гордишься или достаточно унижен под маской?",
  },
  spk_f_cruel: {
    speakEn:
      "Look at me. Does Iskra scare you — or make the cage feel tighter?",
    labelRu: "Искра пугает или сильнее запирает?",
  },
  spk_f_hold: {
    speakEn: "Still holding for the mask — or crumbling already?",
    labelRu: "После «держи»: ещё терпишь для маски или сыпешься?",
  },
  spk_wg_soft: {
    speakEn: "Want a softer glitch for five minutes? Earn it.",
  },
  spk_wg_edge_soft: {
    speakEn: "One clean phantom edge for the circus. Accept?",
    labelRu: "Один чистый phantom-эдж для цирка?",
  },
  spk_wb_pain: {
    speakEn: "Three sharp taps — Iskra's pain cue. Accept?",
    labelRu: "Три резких удара — боль по команде Искры?",
  },
  spk_wb_spank: {
    speakEn: "Slap your tip twice for the spiral. Accept?",
  },
  spk_wb_denial_oath: {
    speakEn:
      "Swear to leave denied if I order it. Will you swear to the mask?",
  },
  spk_d_breath: {
    speakEn:
      "Breath glitch — hold as I count. Fail and both souls mock you.",
  },
  spk_d_breath_verdict: {
    speakEn: "Breath challenge: hold while the mask counts the static.",
    labelRu: "Дыхательный челлендж: держи, пока маска считает шум.",
  },
  spk_c_furina: {
    speakEn:
      "Confess — leaking for Sparkle specifically, or any masked chaos brat?",
    labelRu: "Течёшь именно на Искорку — или на любую «маску»?",
    preferKey: "sparkle",
  },
  spk_c_prone: {
    speakEn: "Ass up, phantom in hand — favorite pose under the spiral?",
    labelRu: "Попа вверх, phantom в руке — любимая поза под спиралью?",
  },
  spk_c_pain: {
    speakEn: "Pain as circus spice — do you like it when it stings?",
    labelRu: "Боль как цирковая приправа — нравится, когда щиплет?",
  },
  spk_c_cbt: {
    speakEn: "Admit it — do you get harder when Iskra taps your balls?",
  },
  spk_l_verdict: {
    speakEn: "Will you accept the mask's script without bargaining?",
    labelRu: "Примешь сценарий маски без торга?",
  },
  spk_l_circus: {
    speakEn: "Who owns this session — you, or the Mask Circus?",
    labelRu: "Кто ведёт сессию — ты или цирк масок?",
  },
  spk_o_balls: {
    speakEn: "Balls free for the next glitch — not tucked away. Confirm.",
    labelRu: "Яйца доступны для следующего глюка?",
  },
  spk_mo_harsher: {
    speakEn: "Shall I sharpen the glitch? Harsher mood.",
    labelRu: "Сделать глюк жёстче?",
  },
  spk_mo_cruel: {
    speakEn: "Full Iskra mode. Cold fang. Accept the shift?",
    labelRu: "Полный режим Искры?",
  },
  spk_fb_circus: {
    speakEn:
      "The circus hears pleas. Pick your preferred finish — anal gate still law.",
    labelRu: "Выбери желаемый финал для цирка.",
  },
  spk_fb_tide: {
    speakEn: "Choose the tide's final glitch: release, ruin, or denial.",
    labelRu: "Выбери финал прилива: финал, руин или отказ.",
  },
  spk_fb_humiliate: {
    speakEn:
      "For the final spiral, do you request mercy, ruin, or denial?",
    labelRu: "Для финальной спирали: милость, руин или отказ?",
  },
  spk_ch_media: {
    speakEn: "Tip-only tease for the spiral?",
  },
  spk_eq_wand: {
    speakEn: "Wand against the cage — phantom heat. Equip?",
  },
  spk_eq_ring: {
    speakEn: "Cock ring as a circus prop for the next act. Equip?",
  },
  spk_eq_ball_stretcher: {
    speakEn: "Ball stretcher for a colder Iskra beat. Put it on?",
    labelRu: "Болл-стретчер для холодного такта Искры?",
  },
};

/**
 * @param {string} file
 * @param {Record<string, Patch>} map
 */
function patchFile(file, map) {
  const j = JSON.parse(fs.readFileSync(file, "utf8"));
  let n = 0;
  for (const key of Object.keys(j)) {
    if (!Array.isArray(j[key])) continue;
    for (const item of j[key]) {
      const patch = map[item.id];
      if (!patch) continue;
      if (patch.speakEn) item.speakEn = patch.speakEn;
      if (patch.labelRu) item.labelRu = patch.labelRu;
      if (patch.preferKey) {
        const like = (item.options || []).find((o) => o.id === "like");
        if (like) like.preferKey = patch.preferKey;
      }
      if (item.id === "spk_c_furina") {
        const like = (item.options || []).find((o) => o.id === "like");
        if (like) like.labelRu = "Именно Искорка";
      }
      n += 1;
    }
  }
  fs.writeFileSync(file, `${JSON.stringify(j, null, 2)}\n`);
  return n;
}

/**
 * @param {string} p
 */
function leftoverCourtish(p) {
  const j = JSON.parse(
    fs.readFileSync(path.join(root, `${p}-prompts.json`), "utf8"),
  );
  /** @type {string[]} */
  const leftover = [];
  for (const k of Object.keys(j)) {
    if (!Array.isArray(j[k])) continue;
    for (const x of j[k]) {
      const blob = `${x.speakEn || ""} ${x.labelRu || ""}`;
      const court =
        /court|verdict|defendant|gallery|trial|Fontaine|судья|приговор|аплодис|Фурин/i.test(
          blob,
        );
      const own =
        /idol|rehearsal|fans|mask|glitch|phantom|Iskra|Sparkle|spiral|chorus|encore|айдол|маск|Искр|спирал|бис|сетлист|цирк/i.test(
          blob,
        );
      if (court && !own) leftover.push(`${x.id}: ${x.speakEn}`);
    }
  }
  return leftover;
}

const sunnaN = patchFile(path.join(root, "sunna-prompts.json"), SUNNA);
const sparkleN = patchFile(path.join(root, "sparkle-prompts.json"), SPARKLE);
console.log(`patched sunna=${sunnaN} sparkle=${sparkleN}`);
console.log("sunna leftover", leftoverCourtish("sunna"));
console.log("sparkle leftover", leftoverCourtish("sparkle"));
