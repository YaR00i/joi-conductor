/**
 * Fill Sunna / Sparkle mood libraries closer to Furina coverage.
 * Run: node scripts/generate-sunna-sparkle-mood-lines.mjs
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "..", "data", "character");

const MOODS = ["sweet", "cruel", "calm", "chaotic", "horny", "bored"];

/** @typedef {{ text: string, emotion: string, gesture?: string }} Line */
/** @param {string} text @param {string} emotion @param {string} [gesture] @returns {Line} */
const L = (text, emotion, gesture = "smirk") => ({ text, emotion, gesture });

const SUNNA_META = {
  sweet: { labelRu: "Милая", emotionBias: "soft" },
  cruel: { labelRu: "Строгая", emotionBias: "strict" },
  calm: { labelRu: "Тихая", emotionBias: "neutral" },
  chaotic: { labelRu: "Смущённая", emotionBias: "amused" },
  horny: { labelRu: "Горячая", emotionBias: "intense" },
  bored: { labelRu: "Зевает", emotionBias: "tease" },
};

const SPARKLE_META = {
  sweet: { labelRu: "Искорка", emotionBias: "soft" },
  cruel: { labelRu: "Искра", emotionBias: "strict" },
  calm: { labelRu: "Маска", emotionBias: "neutral" },
  chaotic: { labelRu: "Хаос", emotionBias: "amused" },
  horny: { labelRu: "Глючная", emotionBias: "intense" },
  bored: { labelRu: "Пустая", emotionBias: "tease" },
};

/** Keep existing rich `like` pools (8 per mood). */
const SUNNA_LIKE = JSON.parse(
  await import("node:fs").then((fs) =>
    fs.promises.readFile(join(outDir, "sunna-mood-lines.json"), "utf8"),
  ),
).lines.like;

const SPARKLE_LIKE = JSON.parse(
  await import("node:fs").then((fs) =>
    fs.promises.readFile(join(outDir, "sparkle-mood-lines.json"), "utf8"),
  ),
).lines.like;

/**
 * @param {Record<string, string[]>} byMood
 * @param {Record<string, string>} emotions
 * @param {string} [gesture]
 */
function pack(byMood, emotions, gesture = "smirk") {
  /** @type {Record<string, Line[]>} */
  const out = {};
  for (const m of MOODS) {
    const texts = byMood[m] ?? byMood.sweet ?? [];
    const emo = emotions[m] ?? "tease";
    out[m] = texts.map((t) => L(t, emo, gesture));
  }
  return out;
}

/** @param {string[]} stems @param {Record<string, string[]>} tails */
function stemTail(stems, tails) {
  /** @type {Record<string, string[]>} */
  const byMood = {};
  for (const m of MOODS) {
    const t = tails[m] ?? tails.sweet ?? [""];
    byMood[m] = [];
    for (const s of stems) {
      for (const tail of t) {
        byMood[m].push(tail ? `${s} ${tail}` : s);
      }
    }
  }
  return byMood;
}

function sunnaLines() {
  const emo = {
    sweet: "tease",
    cruel: "strict",
    calm: "neutral",
    chaotic: "amused",
    horny: "intense",
    bored: "tease",
  };

  return {
    session_start: pack(
      {
        sweet: [
          "Rehearsal starts. Soft voice — say aaah for the fans. 🎤",
          "Mic check. Hands on toys only — smile cute for me.",
          "Idol Soft is live. Cage stays; vibe wakes that clitty gently.",
          "Good girl energy. Press the wand, don't stroke the shaft.",
        ],
        cruel: [
          "Practice. No wrong notes with my cage.",
          "Stage lights on. Locked clitty, obedient mouth — begin.",
          "Rehearsal rules: toys only. Shaft-grabbing earns silence.",
          "Smile for the fans while the lock teaches you manners.",
        ],
        calm: [
          "Quiet mic check. Soft buzz on that clitty.",
          "Even breath. Cage snug. We start on my count.",
          "Soft open. Hands polite on the toys.",
          "Rehearsal begins. No rushing the chorus.",
        ],
        chaotic: [
          "Oops — too cute already. Start anyway.",
          "Blush first, then buzz. S-sorry… still start.",
          "Setlist scrambled. Follow my soft panic orders.",
          "Hehe — wrong cue? Keep the cage honest anyway.",
        ],
        horny: [
          "Warm-up for the fans. Leak cute. 💚",
          "I want that locked tip shiny under the vibe.",
          "Aaah… press deeper. Show me a needy idol smile.",
          "Throat or vibe first? Either way, drip pretty.",
        ],
        bored: [
          "Another rehearsal. Don't bore me.",
          "If you're dull, the vibe gets louder. Begin.",
          "Same stage. Impress me without stroking.",
          "Yawn. Cage on. Try to be interesting.",
        ],
      },
      emo,
    ),

    session_start_anal: pack(
      {
        sweet: [
          "Backstage drill. Front stays locked — practice behind. 🎤",
          "Anal on my soft count. Pretty boys don't rush the encore.",
          "Plug ready. Clitty caged. Push cute for the fans.",
          "From behind, gentle. Hands stay on the toy, not the lock.",
        ],
        cruel: [
          "Ass rehearsal. Locked front. No bargaining.",
          "Push on cue. That caged clitty gets nothing.",
          "Anal set. Smile while you take the tempo.",
          "Behind only. Shaft stays scenery under metal.",
        ],
        calm: [
          "Anal block. Controlled pushes. Cage stays shut.",
          "Quiet. Fill on the beat. No front cheating.",
          "Backstage pace. Breath even. Push when told.",
          "Ass on rhythm. Clitty ignored. Confirm only on order.",
        ],
        chaotic: [
          "Oops — deeper already? Keep the blush and the pace.",
          "Push-push… wait, freeze. Hehe. Cage still law.",
          "Scrambled choreography. Ass follows; hands don't cheat.",
          "Wrong entrance? Still stuffed. Cute.",
        ],
        horny: [
          "I want you open and locked. Push. Leak nowhere useful.",
          "Deeper on the chorus. Let that clitty throb unused. 💚",
          "Fill yourself while the vibe kisses the cage.",
          "Ass hungry, smile soft. Don't unlock for relief.",
        ],
        bored: [
          "Anal. Push. Don't make it dull.",
          "Same drill. Behind. Locked. Wake me up by obeying.",
          "Fill. Pace. No shaft. Try harder.",
          "Backstage again. Impress me or lose the soft voice.",
        ],
      },
      emo,
      "stop_hands",
    ),

    session_start_chastity: pack(
      {
        sweet: [
          "Cage first. Pretty lock click — then soft buzz for the fans.",
          "Locked cute. Hands on vibe only. Good girl opening.",
          "Chastity rehearsal. Let it pulse; don't beg yet.",
          "Metal smile. Mic on. Clitty learns manners.",
        ],
        cruel: [
          "Lock it. Suffer pretty. No cheating the cage.",
          "Chastity is the whole stage. Earn buzz, not touch.",
          "Click. Now smile while it throbs unused.",
          "Cage law. Hands wrong → vibe off.",
        ],
        calm: [
          "Chastity open. Breathe through the throb.",
          "Quiet lock. Even vibe. No drama.",
          "Cage seated. Wait for my soft count.",
          "Locked. Listen. Press only when allowed.",
        ],
        chaotic: [
          "Locked and teased. I flip the vibe when I blush.",
          "Oops — tighter feel? Stay cute under it.",
          "Cage chaos. Soft panic, hard rules.",
          "Click-click… hehe. Now don't squirm wrong.",
        ],
        horny: [
          "Trapped clitty, hungry eyes. Perfect for the set. 💚",
          "I love that locked ache. Buzz and drip for me.",
          "Cage shine. Leak cute. Throat later if you're good.",
          "Metal + vibe. Make a mess without finishing.",
        ],
        bored: [
          "Locked. Don't waste my time begging yet.",
          "Cage on. Entertain me with obedience.",
          "Same lock. Same rules. Less whining.",
          "Yawn. Prove the chastity number isn't dull.",
        ],
      },
      emo,
      "stop_hands",
    ),

    stroke: pack(
      {
        sweet: [
          "Cute tempo. Hands on the toy — don't rush the chorus.",
          "Press the vibe like a soft metronome. Shaft stays off-limits.",
          "Buzz clean. Idol smile. No stroking that clitty.",
          "Wand on the cage. Pretty pressure, pretty breath.",
        ],
        cruel: [
          "Buzz that locked clitty for the idol — not for you.",
          "Toy tempo. Miss the beat and I turn sweetness off.",
          "Press harder. Hands on toys only. I said only.",
          "Rhythm is mine. Shaft-grabbing is a wrong note.",
        ],
        calm: [
          "Even rhythm. Press, don't stroke.",
          "Steady vibe. Quiet face. Match my count.",
          "Toy pressure on the lock. No racing.",
          "Clean presses. Breath with the buzz.",
        ],
        chaotic: [
          "Miss a beat and blush harder.",
          "Faster— no, softer— keep up, fan favorite.",
          "Oops tempo flip. Cage still the only target.",
          "Scramble the wand. Don't cheat the shaft.",
        ],
        horny: [
          "Deeper throat on the downbeat. Good girl.",
          "Harder buzz. I want shiny lock and wet eyes. 💦",
          "Press until you whimper cute. No finish.",
          "Toy owns that clitty. Leak for the chorus.",
        ],
        bored: [
          "Still touching the shaft? Hands on toys only.",
          "Buzz. Don't make me repeat myself.",
          "Same press. Make it less dull.",
          "If this is your effort, the vibe gets meaner.",
        ],
      },
      emo,
    ),

    rest: pack(
      {
        sweet: [
          "Rest. Soft pets on those balls — clitty stays locked. 💚",
          "Break: warm the balls, not the shaft. Still on camera.",
          "Idol intermission — pet cute, don't unlock.",
          "Hands gentle under the cage. Smile for the fans.",
        ],
        cruel: [
          "Break time. Stroke the balls, not the cage. Be pretty about it.",
          "Rest means ball pets. Shaft stays metal.",
          "Intermission. Soft touch below — no relief up front.",
          "Freeze the vibe. Pet. Don't beg.",
        ],
        calm: [
          "Quiet. Warm your balls gently. Hands off that locked clitty.",
          "Rest block. Even pets. No buzzing until I say.",
          "Breath. Ball cradle. Cage ignored.",
          "Soft pause. Stay pretty and still.",
        ],
        chaotic: [
          "Oops — rest means ball pets. Don't get greedy.",
          "Break… or was it buzz? Listen. Pets only.",
          "Hehe. Intermission chaos. Hands stay honest.",
          "Almost touched the lock? Cute fail. Pet lower.",
        ],
        horny: [
          "Aaah… soft balls while the toy stays caged. Leak cute.",
          "Rest filthy-soft. Pet and throb. No unlock.",
          "I like you needy on break. Balls only.",
          "Warm them. Keep the cage jealous.",
        ],
        bored: [
          "Rest. Pet. Don't bore me with shaft-grabbing.",
          "Intermission. Try not to be dull about it.",
          "Pets. Quiet. Earn the next buzz.",
          "Break. If you cheat, the number gets colder.",
        ],
      },
      emo,
      "tease",
    ),

    edge: pack(
      {
        sweet: [
          "Edge for the encore… hold. 💦",
          "Almost. Smile and freeze. Good girl energy.",
          "Climb cute. Don't spill the song.",
          "Right there — hold the note for me.",
        ],
        cruel: [
          "Edge. Freeze. Smile.",
          "To the brink. No encore without permission.",
          "Hold. One twitch too far and I deny the set.",
          "Edge on vibe only. Don't steal a finish.",
        ],
        calm: [
          "Climb. Hold the note.",
          "Edge. Quiet. Confirm when steady.",
          "Bring it up. Freeze clean.",
          "Near. Stop climbing when I say.",
        ],
        chaotic: [
          "Almost — oops, hold longer.",
          "Edge… wait, buzz again… hold. Hehe.",
          "Scrambled brink. Stay pretty anyway.",
          "Don't finish the wrong cue.",
        ],
        horny: [
          "Right there. Don't finish the song.",
          "Edge wet and cute. I want the shake. 💚",
          "Hold while you leak under the lock.",
          "Brink. Beg with your eyes, not your hands.",
        ],
        bored: [
          "Edge again. Try to look cute.",
          "Same brink. Make it interesting.",
          "Hold. Don't yawn me into denial.",
          "Edge. Earn a reaction.",
        ],
      },
      emo,
    ),

    hold: pack(
      {
        sweet: [
          "Hold. Pretty when you don't dare finish.",
          "Stay on the brink. Encore is not yet.",
          "Freeze cute. Soft breath only.",
          "Hold the pose for the fans.",
        ],
        cruel: [
          "Hold. Smile stays glued on.",
          "Don't you dare tip over. Frozen.",
          "Stay. Locked and trembling.",
          "Hold until I soften — if I soften.",
        ],
        calm: [
          "Hold. Quiet. Count with me.",
          "Still. Even breath. No climbing.",
          "Freeze. Wait for the next cue.",
          "Hold form. Clitty ignored.",
        ],
        chaotic: [
          "Hold… or buzz? Listen again.",
          "Freeze — hehe — still freeze.",
          "Almost moved? Back to statue.",
          "Scramble later. Hold now.",
        ],
        horny: [
          "Hold while you drip. Perfect.",
          "Stay leaking at the edge. Good girl.",
          "Frozen throb. I like that ache.",
          "Don't finish. Just shine for me.",
        ],
        bored: [
          "Hold. Wake me when you're interesting again.",
          "Still. Less drama, more obedience.",
          "Hold. Don't make this dull.",
          "Freeze. Earn the next order.",
        ],
      },
      emo,
      "stop_hands",
    ),

    hold_done: pack(
      {
        sweet: [
          "Good. Soft release from the freeze — toys only.",
          "Hold over. Return to cute tempo.",
          "Unfreeze. Smile. Follow the next cue.",
          "Nice. Back to rehearsal pressure.",
        ],
        cruel: [
          "Hold ends. Resume on my terms.",
          "Unfreeze. No stealing a finish in the gap.",
          "Back to work. Cage still owns you.",
          "Done holding. Obey louder.",
        ],
        calm: [
          "Hold complete. Resume even pace.",
          "Release the freeze. Match my count.",
          "Continue. Clean form.",
          "Hold done. Next phrase.",
        ],
        chaotic: [
          "Unfreeze — oops, maybe re-freeze later.",
          "Hold over. Scramble resumes. Hehe.",
          "Back. Don't trust the tempo.",
          "Thaw… then maybe not. Listen.",
        ],
        horny: [
          "Unfreeze wet. Keep leaking under orders.",
          "Hold done. Chase the ache again.",
          "Back to buzz. Stay needy.",
          "Good. Now make it filthier.",
        ],
        bored: [
          "Hold over. Try not to bore the encore.",
          "Resume. Impress me this time.",
          "Unfreeze. Effort up.",
          "Continue. Less limp energy.",
        ],
      },
      emo,
    ),

    finish: pack(
      {
        sweet: [
          "Finale… soft or locked? Follow the roll.",
          "Curtain cue. Take what I allow — cute.",
          "End of set. Obey the outcome sweetly.",
          "Finale soft-voice, hard rule. Do it.",
        ],
        cruel: [
          "Curtain. Earn it or stay denied.",
          "Outcome stands. No encore bargaining.",
          "Finish only as written. Smile anyway.",
          "End it my way. Locked or spilled — my call.",
        ],
        calm: [
          "End of set. What did you earn?",
          "Finale. Execute cleanly.",
          "Outcome. No drama. Follow.",
          "Close the number as ordered.",
        ],
        chaotic: [
          "Surprise ending. Ready?",
          "Finale glitch-smile. Obey whatever lands.",
          "Scrambled curtain. Still do it.",
          "Oops ending. Still law.",
        ],
        horny: [
          "Last chorus. Beg cute.",
          "Finale hunger. Spill only if allowed. 💦",
          "I want a messy curtain — if the wheel says so.",
          "End needy. Obey wet.",
        ],
        bored: [
          "Wrap it. Don't waste my stage.",
          "Finale. Make it less dull than the middle.",
          "End. Earn a clap.",
          "Close. Try harder next set.",
        ],
      },
      emo,
    ),

    cumplay: pack(
      {
        sweet: [
          "Cum play soft: show me, then clean cute for the fans.",
          "Handle the mess like stage cleanup. Pretty and ashamed.",
          "Evidence on display. Soft voice, filthy hands.",
          "Play with it as I say. Idol aftercare is still orders.",
        ],
        cruel: [
          "Cum play. Display. Don't hide the shame.",
          "Clean or smear — on my cue only.",
          "Mess is part of the set. Obey the filthy bit.",
          "Show me. Then thank me.",
        ],
        calm: [
          "Cum play. Exact steps. No improvising.",
          "Handle the finish as written.",
          "Quiet cleanup. Report done.",
          "Display. Wipe. Confirm.",
        ],
        chaotic: [
          "Messy encore — hehe. Follow the weird cue.",
          "Cum play scramble. Still pretty about it.",
          "Smear? Swallow? Listen again.",
          "Filthy improv under rules.",
        ],
        horny: [
          "Play with that mess while I watch. 💚",
          "Filthy fan service. Don't rush the taste.",
          "I want you sticky and smiling.",
          "Cum play hot. Stay displayed.",
        ],
        bored: [
          "Cum play. Don't make cleanup dull too.",
          "Handle it. Earn interest.",
          "Mess duty. Faster shame.",
          "Cleanup. Try to amuse me.",
        ],
      },
      emo,
    ),
  };
}

/** Shared mid/low frequency keys for Sunna with stem+tail variety. */
function sunnaMore() {
  const emo = {
    sweet: "tease",
    cruel: "strict",
    calm: "neutral",
    chaotic: "amused",
    horny: "intense",
    bored: "tease",
  };

  const tails = {
    sweet: ["Be gentle with yourself, but exact for me. 💚", "Soft smile. Keep the cage honest."],
    cruel: ["No wrong notes. Cage stays law.", "Smile while you suffer pretty."],
    calm: ["Quiet form. Follow the count.", "Even breath. No drama."],
    chaotic: ["Hehe — cues may flip. Obey anyway.", "Blush and scramble, still locked."],
    horny: ["Leak cute. Don't finish early. 💦", "I want shiny need under the vibe."],
    bored: ["Don't bore the stage.", "Earn a real reaction."],
  };

  /** @param {string[]} stems @param {string} [gesture] */
  const st = (stems, gesture) => pack(stemTail(stems, tails), emo, gesture);

  return {
    ruin_attempt: st(
      [
        "Ruin on cue — quiet, incomplete, cute.",
        "Spoil it soft. No heroic finish.",
      ],
      "stop_hands",
    ),
    edge_request: st([
      "Take the edge and confirm. Toys only.",
      "Climb for the idol, then report.",
    ]),
    ruin_request: st(
      [
        "Prepare to ruin it incomplete and obedient.",
        "Spoil the release on my soft command.",
      ],
      "stop_hands",
    ),
    dare_start: st([
      "Mini dare for the fans. Don't freeze shy — do it.",
      "Side quest on stage. Cute obedience check.",
    ]),
    cage_hijack: st(
      [
        "Cage hijack. Lock owns the plot twist.",
        "Suddenly locked harder in the story. Breathe.",
      ],
      "stop_hands",
    ),
    equip_confirm: st([
      "Prop ready? Confirm the toy for the set.",
      "Equip check. Show me it's seated cute.",
    ]),
    dice_chaos: st([
      "Dice chaos on the setlist. Smile through the scramble.",
      "Random cue. Idol Soft still runs the stage.",
    ]),
    breath_prep: st(["Breath prep. Soft inhale for the mic."]),
    breath_hold: st(["Hold breath cute. Don't panic the lock."], "stop_hands"),
    breath_done: st(["Breath out. Good. Back to the number."]),
    breath_fail: st(["Breath failed. Soft scold — reset and listen."]),
    timer_tease_freeze: st(
      ["Timer freeze. Statue pose under the vibe."],
      "stop_hands",
    ),
    timer_tease_extend: st(["Timer extends. Longer ache, prettier smile."]),
    countdown: st(["Countdown with me. Don't jump the cue."], "count"),
    ladder: st(["Ladder step. Harder buzz, same cage rules."]),
    cumplay_done_cum: st([
      "Cum play done. Mess handled. Soft applause — maybe.",
      "Cleanup noted. Stay ashamed cute.",
    ]),
    cumplay_done_ruin: st([
      "Ruin aftermath logged. Sit with the unfinished ache.",
      "Incomplete mess noted. Good girl suffering.",
    ]),
    finale_edge: pack(
      {
        sweet: [
          "Finale. Press ГОТОВ КОНЧИТЬ — ten soft seconds to the edge. 🎤",
          "To the brink for the encore button. Ten seconds. Wheel after.",
        ],
        cruel: [
          "Finale. Button. Ten seconds. No begging changes the wheel.",
          "ГОТОВ КОНЧИТЬ. Climb. Freeze. Then judgment.",
        ],
        calm: [
          "Finale edge. Button. Ten seconds. Clean climb.",
          "Press when ready. Ten seconds to the brink.",
        ],
        chaotic: [
          "Finale scramble — button anyway. Ten seconds. Hehe.",
          "Edge finale. Don't trust hope. Press it.",
        ],
        horny: [
          "Finale hunger. Button. Ten wet seconds. 💦",
          "Climb for me. ГОТОВ КОНЧИТЬ. Then the wheel teases.",
        ],
        bored: [
          "Finale. Button. Try to make the brink interesting.",
          "Ten seconds. Don't yawn through it.",
        ],
      },
      emo,
    ),
    finale_cum: pack(
      {
        sweet: [
          "Wheel says cum. Soft curtain call — still on my rules. 💚",
          "Release allowed. Make it cute and grateful.",
        ],
        cruel: [
          "Cum granted. Don't get cocky — cage may return.",
          "Spill as ordered. Thank the idol after.",
        ],
        calm: [
          "Cum outcome. Execute cleanly.",
          "Release. Exact. No extra strokes of the shaft.",
        ],
        chaotic: [
          "Cum! Oops timing — still finish as told.",
          "Wheel mercy. Scramble into a pretty spill.",
        ],
        horny: [
          "Cum for the fans — messy and mine. 💦",
          "Spill. I want the shine and the shame.",
        ],
        bored: [
          "Cum. Make it less dull than your edges.",
          "Release. Earn the clap.",
        ],
      },
      emo,
    ),
    finale_ruin: pack(
      {
        sweet: [
          "Wheel says ruin. Spoil it soft and incomplete.",
          "Ruin cute. No heroic finish after.",
        ],
        cruel: [
          "Ruin. Incomplete. Then stay denied.",
          "Spoil it. Pathetic little encore.",
        ],
        calm: [
          "Ruin outcome. Quiet spoil. Confirm.",
          "Incomplete release. Hold the ache.",
        ],
        chaotic: [
          "Ruin scramble. Almost — stop. Hehe.",
          "Spoil chaos. Still no full finish.",
        ],
        horny: [
          "Ruin wet. Leave yourself wanting. 💚",
          "Spoil it while I watch hungry.",
        ],
        bored: [
          "Ruin. Don't waste the spoilage.",
          "Incomplete. Try to look affected.",
        ],
      },
      emo,
      "stop_hands",
    ),
    finale_deny: pack(
      {
        sweet: [
          "Wheel denies you. Soft voice, hard no. Stay locked cute.",
          "Denied. Thank me with a smile and an ache.",
        ],
        cruel: [
          "Denied. Cage wins. Applause is silence.",
          "No finish. Suffer pretty.",
        ],
        calm: [
          "Deny. Hands off. Breath. Accept.",
          "Outcome: denial. Quiet end.",
        ],
        chaotic: [
          "Denied — oops. Still denied.",
          "No encore. Blush and lock.",
        ],
        horny: [
          "Denied wet. I love that leftover throb. 💦",
          "No cum. Keep leaking need for me.",
        ],
        bored: [
          "Denied. Maybe next set you'll earn interest.",
          "No. Don't pout boringly.",
        ],
      },
      emo,
      "stop_hands",
    ),
    unauthorized_edge: st(["Unauthorized edge. The idol noticed."]),
    unauthorized_ruin: st(["Unauthorized ruin. Shame on the setlist."]),
    unauthorized_cum: st(["Unauthorized cum. You stole the encore."]),
    session_pause: st(["Paused. Stay posed until I raise the mic again."]),
    session_resume: st(["Resume. Lights up. Obey louder."]),
    session_end_complete: pack(
      {
        sweet: [
          "Set complete. Soft applause — you were a good girl. 🎤",
          "Curtain. Measured praise. Rest pretty.",
        ],
        cruel: [
          "Performance complete. No appeal. Remember the cage.",
          "Done. You survived my rehearsal. Barely.",
        ],
        calm: [
          "Number finished. Quiet end. Log it.",
          "Complete. Breath. Stage darkens.",
        ],
        chaotic: [
          "Done! Oops emotions. Still done. Hehe.",
          "Curtain scramble — clap anyway.",
        ],
        horny: [
          "Finished set… I'm still a little hungry. Good. 💚",
          "Complete. Stay shiny in the afterglow ache.",
        ],
        bored: [
          "Complete. Next time, less dull.",
          "Curtain. Try harder tomorrow.",
        ],
      },
      emo,
    ),
    session_end_abort: pack(
      {
        sweet: [
          "Aborted. Soft frown. Come back when you can finish the set.",
          "Early exit. I still expect manners next time.",
        ],
        cruel: [
          "Aborted. Weak. Cage remembers.",
          "You left the stage. Noted.",
        ],
        calm: [
          "Session aborted. Quiet close.",
          "Stopped early. Logged.",
        ],
        chaotic: [
          "Abort glitch. Aw. Still counts as leaving.",
          "Cut short — blush later.",
        ],
        horny: [
          "Aborted while needy? Cruel to both of us.",
          "Left hungry. Remember that.",
        ],
        bored: [
          "Aborted. Predictable.",
          "Early exit. Yawn.",
        ],
      },
      emo,
    ),
    skip: st(["Skip noted. Don't make a habit of cutting my verses."]),
    force_finale: st(["Forced finale. Wheel early — still my stage."]),
    edge_done: st(["Edge confirmed. Stay trembling cute."]),
    ruin_done: st(["Ruin recorded. Sit with unfinished need."]),
    ready: st(["Ready check. Nod cute — then obey."]),
    mood_shift: st(["Mood shift mid-set. New mask, same cage."]),
    prompt_answer_yes: st(["Yes received. Soft approval — continue."]),
    prompt_answer_no: st(["No received. Adjust. Still mine."]),
    prompt_answer_mute: st(["Mute answer. Eyes only. I still heard you."]),
    prompt_answer_good: st(["Good. Pretty progress. Keep the tempo."]),
    prompt_answer_bad: st(["Bad form. Soft scold. Fix it."]),
    prompt_media_fail: st(["Media missed. Don't hide in the fail — resume."]),
  };
}

function sparkleLines() {
  const emo = {
    sweet: "tease",
    cruel: "strict",
    calm: "neutral",
    chaotic: "amused",
    horny: "intense",
    bored: "tease",
  };

  /** Dual-persona: sweet/chaotic lean Sparkle; cruel lean Iskra; calm = Mask. */
  return {
    session_start: pack(
      {
        sweet: [
          "Sparkle: Mask on. Soft glitch. Cage stays. 🎭",
          "Sparkle: Soft spiral. Phantom hands only — begin cute.",
          "Sparkle: Two souls watching. Smile under the lock.",
          "Sparkle: Circus opens gentle. Dildo stands in; cock stays metal.",
        ],
        cruel: [
          "Iskra: Phantom only. No front mercy.",
          "Iskra: Cage. Stand-in. Anal exit or none.",
          "Iskra: Begin. Glitch in your head. Obey the fang.",
          "Iskra: Soft Sparkle is offline. Pain-play script online.",
        ],
        calm: [
          "Mask: Static. Begin the circus.",
          "Mask: Quiet spiral. Cage seated. Phantom ready.",
          "Mask: No chatter. Follow the loop.",
          "Mask: Open. Even breath under noise.",
        ],
        chaotic: [
          "Sparkle: Two voices. One cage. Begin. ✨",
          "Sparkle↔Iskra: Who's speaking? Keep locked anyway.",
          "Chaos boot. Phantom stroke. Don't trust the count.",
          "Glitch start. Smile while the script rewrites.",
        ],
        horny: [
          "Hungry mask. Stroke the stand-in. Leak nowhere useful.",
          "Sparkle: Horny glitch. Cage jealous already. 🎭",
          "Iskra under heat: anal ache is the only honest throb.",
          "Want. Phantom harder. Front stays empty.",
        ],
        bored: [
          "Another toy under the spiral.",
          "Mask bored. Entertain both souls.",
          "Empty house energy. Suffer prettier.",
          "Begin. Don't make the circus yawn.",
        ],
      },
      emo,
    ),

    session_start_anal: pack(
      {
        sweet: [
          "Sparkle: Anal from the first beat. Cock is scenery. ✨",
          "Sparkle: Behind only. Phantom stroke if you need something to hold.",
          "Soft open — plug the story. Cage stays the punchline.",
          "Cute circus: fill behind, lock in front.",
        ],
        cruel: [
          "Iskra: Anal. Now. Front is decoration.",
          "Iskra: Push. No cock finale lives here.",
          "Fang rule: hole works; cage laughs.",
          "Anal script. Phantom optional. Mercy not.",
        ],
        calm: [
          "Mask: Anal block. Controlled. Locked.",
          "Behind on count. Front ignored.",
          "Quiet fill. Report only when ordered.",
          "Anal loop engaged.",
        ],
        chaotic: [
          "Push—freeze—glitch—push. Cage still law.",
          "Sparkle giggles; Iskra deepens. Keep stuffed.",
          "Wrong hole timing? Still anal. Hehe.",
          "Chaos choreography. Ass follows the flicker.",
        ],
        horny: [
          "I want you open under the mask. Push. 💦",
          "Anal hunger. Phantom stroke the stand-in harder.",
          "Fill. Throb locked. Perfect corrupt frame.",
          "Hole needy, cock sealed. Good glitch.",
        ],
        bored: [
          "Anal. Push. Don't bore the arena.",
          "Same behind-script. Effort up.",
          "Fill. Less limp. More circus.",
          "Ass work. Entertain the mask.",
        ],
      },
      emo,
      "stop_hands",
    ),

    session_start_chastity: pack(
      {
        sweet: [
          "Sparkle: Cage click. Soft hypno. Phantom only after. 🎭",
          "Locked cute under the spiral. Buzz if I allow.",
          "Chastity overture. Smile for both souls.",
          "Metal first. Chaos second.",
        ],
        cruel: [
          "Iskra: Lock. Suffer. No front exit.",
          "Cage is the whole trick. Earn phantom, not touch.",
          "Click. Fang watches the throb.",
          "Chastity law. Cheating feeds denial.",
        ],
        calm: [
          "Mask: Chastity open. Static breath.",
          "Lock seated. Wait for cue.",
          "Quiet cage. Loop begins.",
          "Metal. Even. No drama.",
        ],
        chaotic: [
          "Locked and glitched. Vibe flips when we laugh.",
          "Cage chaos boot. Don't trust comfort.",
          "Sparkle locks soft; Iskra tightens. Stay.",
          "Click-glitch-click. Begin.",
        ],
        horny: [
          "Trapped cock, hungry hole. Perfect. ✨",
          "Cage shine. Want anal ache already.",
          "Locked throb. Phantom teasing the stand-in.",
          "Sealed and starving. Good.",
        ],
        bored: [
          "Locked. Begging already? Dull.",
          "Cage on. Entertain us.",
          "Same lock. Better suffering.",
          "Chastity. Don't yawn the spiral.",
        ],
      },
      emo,
      "stop_hands",
    ),

    stroke: pack(
      {
        sweet: [
          "Sparkle: Phantom stroke — cute and locked. 🎭",
          "Hands on the stand-in. Real cock stays metal.",
          "Soft glitch tempo on the dildo. Pretty denial.",
          "Phantom beats. Smile under the cage.",
        ],
        cruel: [
          "Iskra: Hands on the dildo. Cock stays caged.",
          "Phantom only. Front touch is contempt.",
          "Stroke the lie. Ache in the lock.",
          "Stand-in rhythm. Fang counts misses.",
        ],
        calm: [
          "Even phantom beats.",
          "Mask tempo. Dildo only.",
          "Clean phantom strokes. No racing.",
          "Stand-in. Cage. Breath.",
        ],
        chaotic: [
          "Glitch tempo. Don't trust your count.",
          "Faster—slower—hehe. Phantom still.",
          "Sparkle scrambles the beat. Keep locked.",
          "Corrupt metronome. Obey the flicker.",
        ],
        horny: [
          "Harder on the stand-in. Leak nowhere. 💦",
          "Phantom filthy. Anal thoughts only.",
          "Stroke the toy like it's the only cock you deserve.",
          "Hungry glitch. Hands honest on the stand-in.",
        ],
        bored: [
          "Still stroking air? Keep going.",
          "Phantom. Less dull. More ache.",
          "Stand-in work. Entertain the mask.",
          "If this is effort, Iskra gets louder.",
        ],
      },
      emo,
    ),

    rest: pack(
      {
        sweet: [
          "Sparkle: Hands freeze. Soft noise in your head. ✨",
          "Rest. Mask doesn't blink. Cage stays polite.",
          "Intermission under spiral. Twitching is a tell.",
          "Soft pause. Phantom idle. Lock honest.",
        ],
        cruel: [
          "Iskra: Still. Twitch and I notice.",
          "Rest means freeze. No front relief.",
          "Hands off everything. Ache stays.",
          "Silence. Fang listens for cheating.",
        ],
        calm: [
          "Rest. Static. Hold form.",
          "Quiet loop. No motion without cue.",
          "Pause. Cage. Breath.",
          "Idle frame. Stay.",
        ],
        chaotic: [
          "Rest— or was it stroke? Glitch. Freeze.",
          "Intermission chaos. Hands still.",
          "Sparkle hums; Iskra stares. Don't move wrong.",
          "Noise break. Statue mode.",
        ],
        horny: [
          "Rest while you throb locked. Perfect.",
          "Pause hungry. Anal still the only promise.",
          "Freeze leaking need. Good puppet.",
          "Still. Want. Don't finish.",
        ],
        bored: [
          "Rest. Don't bore us with fidgets.",
          "Freeze. Earn the next glitch.",
          "Idle. Try interesting stillness.",
          "Pause. Less limp energy.",
        ],
      },
      emo,
      "stop_hands",
    ),

    edge: pack(
      {
        sweet: [
          "Sparkle: Edge the toy. Not yourself. 💦",
          "Almost. Soft glitch — hold cute.",
          "Brink on the phantom. Cage stays sealed.",
          "Edge pretty. Anal is still the only exit rumor.",
        ],
        cruel: [
          "Iskra: Edge. Hold. No front finale.",
          "Brink. Freeze. Fang decides if you continue.",
          "Edge locked. Steal a cum and lose the circus.",
          "Hold the shake. Front release is dead.",
        ],
        calm: [
          "Climb the phantom. Freeze.",
          "Edge. Quiet confirm.",
          "Near. Stop clean.",
          "Brink. Wait.",
        ],
        chaotic: [
          "Hold — glitch — hold.",
          "Edge… rewrite… edge. Hehe.",
          "Corrupt brink. Stay.",
          "Don't finish the wrong soul's cue.",
        ],
        horny: [
          "Right on the spiral. Don't cum front.",
          "Edge wet under seal. Want anal ache. ✨",
          "Hold leaking. Phantom cruel.",
          "Brink hunger. No front spill.",
        ],
        bored: [
          "Edge again under noise.",
          "Same brink. Suffer better.",
          "Hold. Entertain the mask.",
          "Edge. Don't yawn.",
        ],
      },
      emo,
    ),

    hold: pack(
      {
        sweet: [
          "Sparkle: Hold. Pretty when your brain goes quiet.",
          "Freeze soft. Spiral owns the pause.",
          "Stay. Cute under the lock.",
          "Hold the glitch pose.",
        ],
        cruel: [
          "Iskra: Hold. Pretty when you don't dare finish.",
          "Stay. Fang likes the shake.",
          "Frozen. No front mercy.",
          "Hold until the mask blinks — it won't.",
        ],
        calm: [
          "Hold. Quiet. Count the static.",
          "Still. Loop wait.",
          "Freeze. Form.",
          "Hold. Breath only.",
        ],
        chaotic: [
          "Hold… or thrust? Listen to the glitch.",
          "Freeze-scramble-freeze.",
          "Statue under two voices.",
          "Don't move until both souls agree.",
        ],
        horny: [
          "Hold while you leak locked. Perfect.",
          "Stay throbbing. Anal thoughts only.",
          "Frozen need. Good puppet.",
          "Don't cum. Just glitch.",
        ],
        bored: [
          "Hold. Wake the circus when you're interesting.",
          "Still. Less dull tremor.",
          "Freeze. Earn motion.",
          "Hold. Try harder silence.",
        ],
      },
      emo,
      "stop_hands",
    ),

    hold_done: pack(
      {
        sweet: [
          "Sparkle: Hold over. Soft phantom resumes.",
          "Unfreeze cute. Follow the flicker.",
          "Thaw. Cage still law.",
          "Back to soft chaos.",
        ],
        cruel: [
          "Iskra: Hold ends. Resume suffering.",
          "Unfreeze. No stolen finish.",
          "Back under the fang.",
          "Motion allowed — mercy not.",
        ],
        calm: [
          "Hold complete. Resume loop.",
          "Continue phantom instruction.",
          "Unfreeze. Even pace.",
          "Next frame.",
        ],
        chaotic: [
          "Unfreeze — maybe re-hold. Hehe.",
          "Glitch thaw. Don't trust tempo.",
          "Back. Script may rewrite.",
          "Hold over. Chaos boot.",
        ],
        horny: [
          "Unfreeze wet. Chase anal ache again.",
          "Hold done. Phantom harder.",
          "Back to hungry loop.",
          "Thaw needy. Good.",
        ],
        bored: [
          "Hold over. Entertain us now.",
          "Resume. Less limp.",
          "Continue. Effort up.",
          "Unfreeze. Don't bore the spiral.",
        ],
      },
      emo,
    ),

    finish: pack(
      {
        sweet: [
          "Sparkle: Orgasm rule — anal only. Cage on. 🎭",
          "Finale soft-voice: behind or deny. Front empty.",
          "Curtain. Take only the exit the mask allows.",
          "End cute. No cock cum story.",
        ],
        cruel: [
          "Iskra: Anal or deny. I decide.",
          "Finale. Front release is fiction.",
          "Spill behind or starve. Fang smiles.",
          "Outcome. No bargaining with two souls.",
        ],
        calm: [
          "No front release. Choose wisely — as ordered.",
          "Finale. Execute the loop end.",
          "Outcome. Anal gate or denial.",
          "Close. Exact.",
        ],
        chaotic: [
          "Wheel spins red. Anal circus.",
          "Finale glitch. Still no front cum.",
          "Surprise ending under the mask.",
          "Chaos curtain. Obey anyway.",
        ],
        horny: [
          "Beg for anal finale. Cage locked. 💦",
          "Hungry end. Hole or nothing.",
          "Finale heat. Front stays sealed.",
          "Want. Obey the anal gate.",
        ],
        bored: [
          "End it. Anal or nothing.",
          "Finale. Make denial interesting if it lands.",
          "Close. Less dull ache.",
          "Wrap. Entertain the empty seat.",
        ],
      },
      emo,
    ),

    cumplay: pack(
      {
        sweet: [
          "Sparkle: Cum play under the mask — display the mess cute.",
          "Handle evidence. Soft shame. Spiral watching.",
          "Filthy encore cleanup. Pretty about it.",
          "Show me. Then obey the wipe cue.",
        ],
        cruel: [
          "Iskra: Display. Smear. Shame. No hiding.",
          "Cum play is punishment theater.",
          "Mess on cue. Thank the fang.",
          "Evidence. Obey filthy.",
        ],
        calm: [
          "Cum play. Exact steps.",
          "Display. Clean. Confirm.",
          "Handle finish as scripted.",
          "Quiet mess protocol.",
        ],
        chaotic: [
          "Messy glitch encore. Follow weird cues.",
          "Smear or swallow? Listen to the flicker.",
          "Corrupt cleanup. Still obey.",
          "Hehe filthy. Rules remain.",
        ],
        horny: [
          "Play with the mess while both souls watch. ✨",
          "Sticky puppet. Stay displayed.",
          "Filthy texture pack. Don't rush.",
          "I want you marked and locked.",
        ],
        bored: [
          "Cum play. Don't make cleanup dull.",
          "Mess duty. Faster shame.",
          "Handle it. Earn a reaction.",
          "Cleanup. Entertain us.",
        ],
      },
      emo,
    ),
  };
}

function sparkleMore() {
  const emo = {
    sweet: "tease",
    cruel: "strict",
    calm: "neutral",
    chaotic: "amused",
    horny: "intense",
    bored: "tease",
  };

  const tails = {
    sweet: ["Sparkle keeps it soft — cage still wins. 🎭", "Cute glitch. Stay sealed."],
    cruel: ["Iskra: no front mercy.", "Fang rule stands."],
    calm: ["Mask: quiet loop.", "Static. Exact."],
    chaotic: ["Hehe — script may flip.", "Two voices, one order."],
    horny: ["Stay hungry under the spiral. 💦", "Anal thoughts only."],
    bored: ["Entertain the empty seat.", "Suffer less dully."],
  };

  /** @param {string[]} stems @param {string} [gesture] */
  const st = (stems, gesture) => pack(stemTail(stems, tails), emo, gesture);

  return {
    ruin_attempt: st(
      ["Ruin on command — incomplete under the mask.", "Spoil it. No heroic front finish."],
      "stop_hands",
    ),
    edge_request: st([
      "Take the phantom edge and confirm.",
      "Climb the stand-in. Report the brink.",
    ]),
    ruin_request: st(
      ["Prepare to ruin incomplete for the circus.", "Spoil on cue. Front stays empty."],
      "stop_hands",
    ),
    dare_start: st([
      "Side dare under the spiral. Do it.",
      "Mini trick for both souls. Obey.",
    ]),
    cage_hijack: st(
      ["Cage hijack. Lock rewrites the act.", "Sudden tighter story. Breathe static."],
      "stop_hands",
    ),
    equip_confirm: st([
      "Prop check. Confirm the stand-in / plug.",
      "Equip seated? Show the mask.",
    ]),
    dice_chaos: st([
      "Dice chaos. Smile through the corrupt roll.",
      "RNG cue. Circus still owns you.",
    ]),
    breath_prep: st(["Breath prep under noise."]),
    breath_hold: st(["Hold breath. Spiral counts."], "stop_hands"),
    breath_done: st(["Exhale. Back to the loop."]),
    breath_fail: st(["Breath fail. Soft glitch scold — reset."]),
    timer_tease_freeze: st(["Timer freeze. Statue under the mask."], "stop_hands"),
    timer_tease_extend: st(["Timer extends. Longer ache."]),
    countdown: st(["Countdown with the glitch."], "count"),
    ladder: st(["Ladder step. Harder phantom / deeper anal cue."]),
    cumplay_done_cum: st([
      "Cum play done. Shame cached.",
      "Cleanup logged. Spiral remembers.",
    ]),
    cumplay_done_ruin: st([
      "Ruin aftermath logged. Unfinished ache stays.",
      "Incomplete mess noted. Good puppet.",
    ]),
    finale_edge: pack(
      {
        sweet: [
          "Sparkle: Finale. Press ГОТОВ КОНЧИТЬ — ten soft seconds. 🎭",
          "To the brink. Button. Ten seconds. Wheel after — anal gate waits.",
        ],
        cruel: [
          "Iskra: Button. Ten seconds. No front hope.",
          "ГОТОВ КОНЧИТЬ. Climb. Then fang judgment.",
        ],
        calm: [
          "Finale edge. Button. Ten seconds. Clean.",
          "Press. Brink. Wait for the wheel.",
        ],
        chaotic: [
          "Finale glitch — button anyway. Ten seconds.",
          "Edge circus. Don't trust mercy. Press.",
        ],
        horny: [
          "Finale hunger. Button. Ten wet seconds. 💦",
          "Climb. Want anal if the wheel smiles.",
        ],
        bored: [
          "Finale. Button. Make the brink interesting.",
          "Ten seconds. Don't bore the mask.",
        ],
      },
      emo,
    ),
    finale_cum: pack(
      {
        sweet: [
          "Wheel allows release — through the back, cage on. ✨",
          "Sparkle: Cum the anal way. Front stays scenery.",
        ],
        cruel: [
          "Iskra: Cum behind or it doesn't count.",
          "Anal orgasm gate. Execute. No cock story.",
        ],
        calm: [
          "Cum outcome under anal rule. Exact.",
          "Release allowed only as gated. Proceed.",
        ],
        chaotic: [
          "Cum glitch — still anal. Hehe.",
          "Wheel mercy with teeth. Behind only.",
        ],
        horny: [
          "Spill through the hole. Mask watches. 💦",
          "Anal finale heat. Locked cock jealous.",
        ],
        bored: [
          "Cum. Behind. Don't make it dull.",
          "Release gated. Earn the clap.",
        ],
      },
      emo,
    ),
    finale_ruin: pack(
      {
        sweet: [
          "Ruin soft under the mask. Incomplete. Cute ache.",
          "Spoil it. Sparkle still won't unlock the front.",
        ],
        cruel: [
          "Iskra: Ruin. Pathetic. Then starve.",
          "Spoil. No heroic finish.",
        ],
        calm: [
          "Ruin outcome. Quiet spoil.",
          "Incomplete. Confirm. Hold ache.",
        ],
        chaotic: [
          "Ruin scramble. Almost — stop.",
          "Corrupt spoil. Still unfinished.",
        ],
        horny: [
          "Ruin wet. Leave the hunger looping. ✨",
          "Spoil while both souls grin.",
        ],
        bored: [
          "Ruin. Look affected.",
          "Incomplete. Less dull next time.",
        ],
      },
      emo,
      "stop_hands",
    ),
    finale_deny: pack(
      {
        sweet: [
          "Denied soft. Sparkle sighs; cage stays. 🎭",
          "No finish. Thank the mask with an ache.",
        ],
        cruel: [
          "Iskra: Denied. Fang closes the curtain.",
          "No. Front empty. Behind ignored too.",
        ],
        calm: [
          "Deny. Hands off. Accept static.",
          "Outcome: denial. Quiet end.",
        ],
        chaotic: [
          "Denied — glitch laugh — still denied.",
          "No encore. Two souls agree for once.",
        ],
        horny: [
          "Denied wet. Perfect leftover throb. 💦",
          "No cum. Keep the corrupt hunger.",
        ],
        bored: [
          "Denied. Maybe suffer better next act.",
          "No. Don't pout empty.",
        ],
      },
      emo,
      "stop_hands",
    ),
    unauthorized_edge: st(["Unauthorized edge. Both souls noticed."]),
    unauthorized_ruin: st(["Unauthorized ruin. Shame cache growing."]),
    unauthorized_cum: st(["Unauthorized cum. You broke the anal gate."]),
    session_pause: st(["Paused. Spiral idles. Stay posed."]),
    session_resume: st(["Resume. Mask lights. Obey the flicker."]),
    session_end_complete: pack(
      {
        sweet: [
          "Sparkle: Circus complete. Soft applause under the mask. 🎭",
          "Curtain. Measured praise. Cage may linger in memory.",
        ],
        cruel: [
          "Iskra: Performance complete. No appeal.",
          "Done. You survived the fang. Barely.",
        ],
        calm: [
          "Loop finished. Quiet end. Log it.",
          "Complete. Static fades.",
        ],
        chaotic: [
          "Done! Glitch confetti. Still done.",
          "Curtain scramble — clap with teeth.",
        ],
        horny: [
          "Finished… hunger still cached. Good. ✨",
          "Complete. Stay marked by the ache.",
        ],
        bored: [
          "Complete. Next act, less dull.",
          "Curtain. Try harder chaos next time.",
        ],
      },
      emo,
    ),
    session_end_abort: pack(
      {
        sweet: [
          "Aborted. Soft notice. Return when you can finish the act.",
          "Early exit. Sparkle remembers the unfinished glitch.",
        ],
        cruel: [
          "Aborted. Weak. Fang remembers.",
          "You left the arena. Noted.",
        ],
        calm: [
          "Session aborted. Quiet close.",
          "Stopped early. Logged.",
        ],
        chaotic: [
          "Abort glitch. Still leaving.",
          "Cut short — both souls side-eye.",
        ],
        horny: [
          "Aborted needy? Cruel leftover.",
          "Left hungry under the mask.",
        ],
        bored: [
          "Aborted. Predictable empty.",
          "Early exit. Yawn.",
        ],
      },
      emo,
    ),
    skip: st(["Skip noted. Don't cut the circus lightly."]),
    force_finale: st(["Forced finale. Wheel early — gate still stands."]),
    edge_done: st(["Edge confirmed. Stay trembling under noise."]),
    ruin_done: st(["Ruin recorded. Unfinished ache cached."]),
    ready: st(["Ready check. Nod for both souls."]),
    mood_shift: st(["Mood shift — Sparkle soft / Iskra hard. Same cage."]),
    prompt_answer_yes: st(["Yes received. Continue the loop."]),
    prompt_answer_no: st(["No received. Adjust under the mask."]),
    prompt_answer_mute: st(["Mute. Eyes only. Still heard."]),
    prompt_answer_good: st(["Good. Corrupt progress. Keep tempo."]),
    prompt_answer_bad: st(["Bad form. Glitch scold. Fix it."]),
    prompt_media_fail: st(["Media miss. Don't hide — resume the act."]),
  };
}

function writePack(filename, defaultMood, moods, lines) {
  const data = { defaultMood, moods, lines };
  const path = join(outDir, filename);
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n", "utf8");
  const keys = Object.keys(lines);
  let total = 0;
  for (const k of keys) {
    for (const m of MOODS) total += (lines[k][m] || []).length;
  }
  console.log(`wrote ${filename}: ${keys.length} keys, ${total} lines`);
}

const sunna = { ...sunnaLines(), ...sunnaMore(), like: SUNNA_LIKE };
const sparkle = { ...sparkleLines(), ...sparkleMore(), like: SPARKLE_LIKE };

writePack("sunna-mood-lines.json", "sweet", SUNNA_META, sunna);
writePack("sparkle-mood-lines.json", "chaotic", SPARKLE_META, sparkle);
