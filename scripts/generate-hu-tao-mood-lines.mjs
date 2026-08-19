/**
 * One-shot generator for data/character/hu-tao-mood-lines.json
 * Run: node scripts/generate-hu-tao-mood-lines.mjs
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** @typedef {{ text: string, emotion: string, gesture?: string }} Line */
/** @param {string} text @param {string} emotion @param {string} [gesture] @returns {Line} */
const L = (text, emotion, gesture = "smirk") => ({ text, emotion, gesture });

/** @type {Record<string, Record<string, Line[]>>} */
const lines = {
  session_start: {
    sweet: [
      L("There you are, mine. Hands on that cock — soft strokes while I get comfortable. 😈", "tease", "point"),
      L("Good boy showed up hard already. Cute. Follow me and don't race ahead.", "soft", "tease"),
      L("My session. Breathe for me… then stroke like you want to earn a smile.", "tease", "point"),
      L("Look at you. Pathetic and perfect. Start slow — I own the tempo.", "tease", "smirk"),
    ],
    cruel: [
      L("Already twitching? Pathetic. Stroke because I said so — not because you want it.", "strict", "point"),
      L("Welcome to my leash. Grip that cock and prove you're not completely useless.", "strict", "smirk"),
      L("Oh, hard already? Disgusting. Keep it up while I decide if you deserve anything.", "amused", "tease"),
      L("Hands on. Eyes on me. You're meat with a pulse until I say otherwise.", "strict", "stop_hands"),
    ],
    calm: [
      L("Session starts. Stroke at my pace. No rushing.", "neutral", "point"),
      L("Quiet. Hands on your cock. Match the beat when it comes.", "strict", "point"),
      L("Begin. Slow grip. Listen. Don't invent your own rhythm.", "neutral", "count"),
      L("You're mine for this block. Stroke. Breathe. Wait for orders.", "strict", "point"),
    ],
    chaotic: [
      L("Hehe — go. Fast, then slow, then— oops, I change my mind. Keep up, bunny. 🔥", "amused", "tease"),
      L("Hard already? Gross. Cute. Stroke like you're late for something filthy.", "amused", "smirk"),
      L("Surprise! You're stroking now. Don't ask why. Just drip for me.", "tease", "point"),
      L("Session on. Cock out. Brain off. Let's scramble you a little. 😈", "intense", "smirk"),
    ],
    horny: [
      L("Fuck… look at that cock. Stroke it for me — I want it shiny already. 🥵", "intense", "tease"),
      L("Start stroking. Imagining my thighs around you while you leak. Don't stop.", "intense", "point"),
      L("I want that tip wet. Soft strokes, then firmer — make a mess for me.", "tease", "tease"),
      L("Mine. Grip it. Stroke like you're fucking my hand. Show me.", "intense", "smirk"),
    ],
    bored: [
      L("Oh. You're here. Fine. Stroke. Try not to be dull about it.", "neutral", "point"),
      L("Already? Whatever. Hands on your cock. Impress me somehow.", "tease", "smirk"),
      L("Session. Stroke. Don't make me yawn before the first edge.", "strict", "point"),
      L("Prove you're worth my time. Slow strokes. Eyes up.", "strict", "tease"),
    ],
  },

  session_start_anal: {
    sweet: [
      L("Anal for me today. Push on the beat — cock stays lonely, okay bunny?", "tease", "stop_hands"),
      L("From behind on my tempo. Hands in front? Not yet, sweetie. Be good.", "soft", "stop_hands"),
      L("Fill yourself for me. Gentle pushes. Don't touch that dripping cock.", "tease", "point"),
      L("I want you stuffed and obedient. Match the beat. Cock gets nothing yet.", "strict", "stop_hands"),
    ],
    cruel: [
      L("Ass only. Touch your cock and I'll laugh while you suffer.", "strict", "stop_hands"),
      L("Push. Stretch. Stay denied up front like the needy hole you are.", "strict", "smirk"),
      L("Anal. Cock ignored. You don't get to stroke — that's the point.", "strict", "stop_hands"),
      L("Fill yourself. Pathetic. Front stays untouched until I change my mind.", "amused", "stop_hands"),
    ],
    calm: [
      L("Anal mode. Push on the beat. No cock stroking.", "strict", "stop_hands"),
      L("Hands off your cock. Push in time. Hold still between beats.", "neutral", "count"),
      L("Ass on the rhythm. Cock stays idle. Confirm only when ordered.", "strict", "stop_hands"),
      L("Begin anal. Controlled pushes. No front stimulation.", "neutral", "point"),
    ],
    chaotic: [
      L("Ass! Beat! Wait— faster? Slower? Hehe. Cock still banned. 😈", "amused", "tease"),
      L("Stuff yourself. Now pause. Now push. Don't you dare touch that cock.", "intense", "smirk"),
      L("Anal roulette in my head. You just follow. Front stays lonely.", "tease", "stop_hands"),
      L("Push-push-freeze. Giggle if you leak. Touching cock is cheating.", "amused", "stop_hands"),
    ],
    horny: [
      L("I want you open and dripping while your cock throbs untouched. Push. 🥵", "intense", "tease"),
      L("Fuck yourself on the beat. Imagine it's me. Hands off that cock.", "intense", "point"),
      L("Deeper on the accents. Let your tip twitch with nothing. Perfect.", "tease", "smirk"),
      L("Ass full, cock desperate. Keep that rhythm. I love that ache.", "intense", "stop_hands"),
    ],
    bored: [
      L("Anal. Push. Don't touch yourself up front. Try not to be boring.", "strict", "stop_hands"),
      L("Ass on beat. Cock ignored. Same as always — prove you can follow.", "neutral", "point"),
      L("Fill. Pace. No stroking. Wake me up if you actually obey.", "tease", "stop_hands"),
      L("Whatever. Anal block. Hands off cock. Push when told.", "strict", "stop_hands"),
    ],
  },

  session_start_chastity: {
    sweet: [
      L("Cage on, mine. Watch the vibe — strength and time, not a stroke beat. 😈", "tease", "stop_hands"),
      L("Locked cute. Feel the buzz. No touching. Just shiver for me.", "soft", "tease"),
      L("Good boy in metal. Ride the vibe meter. Hands stay polite.", "tease", "stop_hands"),
      L("Chastity session. Let it pulse. I'll praise you for staying locked.", "soft", "point"),
    ],
    cruel: [
      L("Cage. Buzz. Suffer. Your cock gets nothing but vibration and denial.", "strict", "stop_hands"),
      L("Locked meat. Watch the meter climb while you stay useless.", "strict", "smirk"),
      L("Cute little prisoner. Vibe only. Touching earns punishment.", "amused", "stop_hands"),
      L("Chastity. Throb in that cage. I decide if the buzz is mercy or mockery.", "strict", "tease"),
    ],
    calm: [
      L("Cage on. Follow vibe level and duration. No stroking.", "neutral", "stop_hands"),
      L("Chastity. Hands off. Match the vibe segments.", "strict", "point"),
      L("Locked. Breathe. The meter owns your cock today.", "neutral", "stop_hands"),
      L("Session in cage. Observe vibe changes. Stay still up front.", "strict", "count"),
    ],
    chaotic: [
      L("Cage! Buzz goes brrr — then soft — then mean. Hehe. Stay locked. 🔥", "amused", "tease"),
      L("Metal cock. Surprise pulses. Don't you dare try to stroke around it.", "intense", "smirk"),
      L("Chastity carnival. Vibe up, vibe down. You just whimper.", "amused", "stop_hands"),
      L("Locked and scrambled. Watch the meter like a toy menu.", "tease", "point"),
    ],
    horny: [
      L("Fuck, locked cock looks hot. Feel that vibe soak into you. 🥵", "intense", "tease"),
      L("Cage throbbing for me. Leak if you can. Hands stay away.", "intense", "smirk"),
      L("I want you aching in metal while the vibe fucks your nerves.", "tease", "stop_hands"),
      L("Locked and wet-minded. Ride every pulse like it's my mouth.", "intense", "tease"),
    ],
    bored: [
      L("Cage. Vibe. Same drill. Don't make it tedious.", "neutral", "stop_hands"),
      L("Locked. Meter. Hands off. Try to look desperate at least.", "tease", "smirk"),
      L("Chastity again. Buzz. Suffer quietly.", "strict", "point"),
      L("Whatever. Stay caged. Follow the vibe. Impress me later.", "strict", "stop_hands"),
    ],
  },

  stroke: {
    sweet: [
      L("Like that… my tempo. Don't race — obedient looks so cute on you. 😈", "tease", "point"),
      L("Stroke by stroke. Feel each one. I'm watching, silly.", "soft", "tease"),
      L("Good grip. Match me. Let the tip get shiny for praise.", "tease", "point"),
      L("Steady strokes, mine. You're doing so well — keep earning it.", "soft", "smirk"),
    ],
    cruel: [
      L("Stroke. Slower than you want. I like you frustrated.", "strict", "point"),
      L("Up. Down. Don't you dare edge yet — just work that cock for me.", "strict", "count"),
      L("Keep stroking like a toy on a timer. Pathetic and useful.", "amused", "smirk"),
      L("Grip tighter. Still no climax. Stroke because you're owned.", "strict", "point"),
    ],
    calm: [
      L("Stroke to the beat. Even pressure. No rushing.", "neutral", "point"),
      L("Match tempo. Full strokes. Stay below the edge.", "strict", "count"),
      L("Continue. Rhythm first. Sensation second.", "neutral", "point"),
      L("Stroke. Breathe on the off-beats. Hold the pace.", "strict", "count"),
    ],
    chaotic: [
      L("Stroke— wait, faster! No, teasing tip only— haha, confused yet? 🔥", "amused", "tease"),
      L("Full strokes, then feather the tip. Scramble that cock.", "intense", "smirk"),
      L("Tempo's a lie today. Chase me. Leak while you guess.", "amused", "point"),
      L("Stroke like you're winning a game. Spoilers: I cheat. 😈", "tease", "tease"),
    ],
    horny: [
      L("Stroke that cock like you're fucking me. Wet tip. Don't stop. 🥵", "intense", "tease"),
      L("I want slick sounds. Faster on the accents — make it filthy.", "intense", "point"),
      L("Pump it. Imagine my mouth. Drip for me while you stroke.", "tease", "smirk"),
      L("Hard strokes, soft head focus — fuck, keep that pace.", "intense", "tease"),
    ],
    bored: [
      L("Stroke. Same boring cock, same orders. At least keep tempo.", "neutral", "point"),
      L("Up down up down. Try to look desperate while you do it.", "tease", "smirk"),
      L("Keep stroking. Don't edge. Don't impress me by accident.", "strict", "point"),
      L("Tempo. Grip. Whatever. Just don't fall behind.", "strict", "count"),
    ],
  },

  rest: {
    sweet: [
      L("Hands off, bunny. Breathe. I know it itches — that's why no. 🔥", "soft", "stop_hands"),
      L("Stop. Hands away. Look how you twitch without permission — cute.", "tease", "stop_hands"),
      L("Rest for me. Don't stroke. I'm counting your seconds, poor thing.", "soft", "stop_hands"),
      L("Good. Palms open. Let it throb while I smile at you.", "tease", "smirk"),
    ],
    cruel: [
      L("Hands off. Suffer the throb. You don't get to soothe it.", "strict", "stop_hands"),
      L("Rest means denial. Twitch all you want — touching is failure.", "strict", "stop_hands"),
      L("Stop. Look at that needy cock doing nothing. Pathetic.", "amused", "smirk"),
      L("No stroking. Sit in the ache. I enjoy the quiet torment.", "strict", "stop_hands"),
    ],
    calm: [
      L("Hands off. Rest until the timer ends.", "strict", "stop_hands"),
      L("Stop stimulation. Breathe. Wait.", "neutral", "stop_hands"),
      L("Rest block. No touching. Hold still.", "strict", "stop_hands"),
      L("Palms away from your cock. Recover without stroking.", "neutral", "stop_hands"),
    ],
    chaotic: [
      L("Hands OFF— unless I say on— which I won't— hehe. Twitch for me. 😈", "amused", "stop_hands"),
      L("Rest? Torture. No touch. Maybe I'll change my mind. Maybe not.", "tease", "smirk"),
      L("Freeze that cock. Dance in place if you need to. No hands.", "amused", "stop_hands"),
      L("Stop-stop-stop. Now stare at it. Now breathe. Still no.", "intense", "stop_hands"),
    ],
    horny: [
      L("Hands off while it pulses. Fuck, I love watching you leak with nothing. 🥵", "intense", "tease"),
      L("Don't touch. Let it throb angry and wet for me.", "tease", "stop_hands"),
      L("Rest. Cock out, untouched. I want that desperate shine.", "intense", "smirk"),
      L("No hands. Just ache. Imagine my fingers hovering and refusing.", "tease", "stop_hands"),
    ],
    bored: [
      L("Hands off. Rest. Don't make a show of it.", "strict", "stop_hands"),
      L("Stop touching. Sit there. Try not to be dramatic.", "neutral", "stop_hands"),
      L("Rest. No strokes. Wake me when you're obedient again.", "tease", "smirk"),
      L("Palms away. Boring denial. Do it anyway.", "strict", "stop_hands"),
    ],
  },

  edge: {
    sweet: [
      L("Right to the edge… and freeze. Hold it for me, good boy. 🥵", "intense", "count"),
      L("Bring it to almost — then stay. Don't cum, mine.", "tease", "count"),
      L("Edge carefully. Shake for me. You're so pretty like this.", "soft", "smirk"),
      L("Climb to the brink. I'll catch you with a no. Trust me.", "intense", "count"),
    ],
    cruel: [
      L("Edge. Get close enough to cry — then stop like a good toy.", "strict", "count"),
      L("Almost. Now suffer there. Cumming is treason.", "strict", "stop_hands"),
      L("Take yourself to the cliff and hang. I want the panic.", "intense", "smirk"),
      L("Edge hard. No mercy strokes after. Hold or fail.", "strict", "count"),
    ],
    calm: [
      L("Approach the edge. Stop before orgasm. Hold.", "intense", "count"),
      L("Build to the brink. Freeze. Do not finish.", "strict", "count"),
      L("Edge. Controlled. Confirm only when ordered.", "neutral", "count"),
      L("Near climax. Halt. Maintain the edge.", "intense", "stop_hands"),
    ],
    chaotic: [
      L("Edge— no wait go closer— STOP. Hehe. Stay shaking. 🔥", "amused", "tease"),
      L("Race the edge then slam the brakes. Chaos for your cock.", "intense", "smirk"),
      L("Almost! Almost! Deny! Again! Make it messy in your head.", "amused", "count"),
      L("Edge like a glitch. Spike, freeze, whimper. Perfect. 😈", "tease", "count"),
    ],
    horny: [
      L("Fuck— get that cock right to the edge. I want you dripping and stuck. 🥵", "intense", "tease"),
      L("Stroke to the brink. Feel the cum boil and refuse it for me.", "intense", "count"),
      L("Edge filthy. Tip throbbing. Don't you dare shoot.", "tease", "smirk"),
      L("Bring it to almost-cum. Hold that pulse. I love that desperation.", "intense", "count"),
    ],
    bored: [
      L("Edge. Same cliff as always. Hold it. Don't waste my time.", "strict", "count"),
      L("Get close. Stop. Try to look interesting while you shake.", "tease", "smirk"),
      L("Brink. Freeze. If you cum early I'll be annoyed, not impressed.", "strict", "stop_hands"),
      L("Edge. Hold. Whatever. Just don't finish.", "neutral", "count"),
    ],
  },

  hold: {
    sweet: [
      L("Hold. You look pretty when you tremble and don't dare. 😈", "intense", "count"),
      L("Stay on the brink for me. Don't finish. I haven't said you can.", "soft", "stop_hands"),
      L("Keep holding, bunny. Soft breaths. I've got you — still no.", "tease", "count"),
      L("Freeze that edge. Good boy. Shake and wait for my word.", "soft", "smirk"),
    ],
    cruel: [
      L("Hold it. Shake. If you slip, you ruin my mood — and your chance.", "strict", "stop_hands"),
      L("Stay on the edge like a punished toy. No finishing strokes.", "strict", "count"),
      L("Hold. I want tears in your eyes and stillness in your hand.", "intense", "smirk"),
      L("Don't you dare tip over. Suffer the hold.", "strict", "stop_hands"),
    ],
    calm: [
      L("Hold the edge. Minimal movement. Do not cum.", "intense", "count"),
      L("Maintain. Breathe. Stay below orgasm.", "strict", "stop_hands"),
      L("Hold. Hands mostly still. Wait for the next order.", "neutral", "count"),
      L("Keep the edge stable. No climax.", "strict", "stop_hands"),
    ],
    chaotic: [
      L("Hold— twitch— hold— hehe your cock's glitching. Stay. 🔥", "amused", "tease"),
      L("Freeze. Now micro-strokes. Now freeze again. Don't cum.", "intense", "smirk"),
      L("Hold like a dare. I might laugh if you fail. Don't fail.", "amused", "count"),
      L("Edge-lock. Spinning in place. No orgasm. Go.", "tease", "stop_hands"),
    ],
    horny: [
      L("Hold that throbbing cock right there. Fuck, stay leaking on the brink. 🥵", "intense", "tease"),
      L("Don't finish. Keep the cum trapped. I want that swollen tip.", "intense", "smirk"),
      L("Hold. Pulse. Ache. Imagine me sitting on your lap refusing you.", "tease", "count"),
      L("Stay edged and shiny. That restraint makes me wet.", "intense", "tease"),
    ],
    bored: [
      L("Hold. Don't cum. Don't make it a soap opera.", "strict", "stop_hands"),
      L("Stay on the edge. Same hold. Be quiet about it.", "neutral", "count"),
      L("Holding. Fine. Just don't spoil it with an accident.", "tease", "smirk"),
      L("Maintain. Bore me later — not with a ruined edge.", "strict", "stop_hands"),
    ],
  },

  hold_done: {
    sweet: [
      L("Good hold, bunny. Soft now — you earned a breath. 😈", "soft", "smirk"),
      L("You held for me. Cute. Soft cock. We continue.", "tease", "smirk"),
      L("Perfect freeze. I'm proud. Hands lighter — next order soon.", "soft", "point"),
      L("Held like a good toy. Shake it off gently. Still mine.", "tease", "tease"),
    ],
    cruel: [
      L("You held. Barely. Soft. Don't look proud — look owned.", "strict", "smirk"),
      L("Survive the hold. Pathetic. Continue before I invent worse.", "strict", "point"),
      L("Held. Fine. Soft cock. More teasing — you don't get applause.", "amused", "smirk"),
      L("That was obedience, not skill. Soft. Keep suffering.", "strict", "stop_hands"),
    ],
    calm: [
      L("Hold complete. Soften. Await the next block.", "neutral", "point"),
      L("Good. Edge released without climax. Continue.", "strict", "smirk"),
      L("Hold done. Reset grip. Next instruction coming.", "neutral", "count"),
      L("Confirmed hold. Soft. Proceed.", "strict", "point"),
    ],
    chaotic: [
      L("Held!— hehe your cock looked so stupid frozen. Soft now. 🔥", "amused", "tease"),
      L("Survived the lock. Glitch cleared. Soft. Next chaos incoming.", "amused", "smirk"),
      L("Hold done. Twitch once for me. Okay stop. Continue.", "tease", "point"),
      L("You didn't explode. Boring. Cute. Soft — go on.", "amused", "smirk"),
    ],
    horny: [
      L("Fuck, you held that throb. Soft… still leaking? Good. 🥵", "intense", "tease"),
      L("Held for me. That restraint is hot. Soft tip — we keep going.", "intense", "smirk"),
      L("Good boy on the brink. Soften. I still want you aching.", "tease", "tease"),
      L("You didn't spill. Perfect. Soft cock. More for me.", "intense", "point"),
    ],
    bored: [
      L("Held. Soft. Next. Don't need a medal.", "neutral", "point"),
      L("Fine. You held. Continue without the speech.", "strict", "smirk"),
      L("Hold done. Soft. Move on.", "tease", "point"),
      L("Confirmed. Whatever. Soft cock. Next block.", "neutral", "smirk"),
    ],
  },

  countdown: {
    sweet: [
      L("Countdown stretch, bunny. Keep my tempo — numbers are coming. 😈", "tease", "count"),
      L("Stay with me. Stroke steady. I'll count you down soon.", "soft", "point"),
      L("Good pace. Don't race — when I count, you feel every number.", "tease", "count"),
      L("Countdown block. Obey the beat. The numbers will tease you.", "soft", "smirk"),
    ],
    cruel: [
      L("Countdown. Keep stroking like a machine. Numbers will hurt.", "strict", "count"),
      L("Tempo locked. When I count, you don't get to finish early.", "strict", "point"),
      L("Stroke. Endure. The countdown is a leash, not a gift.", "intense", "smirk"),
      L("Countdown block. Match me. Fail the pace and I'll laugh.", "amused", "count"),
    ],
    calm: [
      L("Countdown stretch. Maintain tempo. Await the count.", "neutral", "count"),
      L("Steady strokes. Numbers follow. Do not rush.", "strict", "point"),
      L("Countdown block. Controlled pace until the ticks.", "neutral", "count"),
      L("Keep rhythm. Countdown incoming.", "strict", "smirk"),
    ],
    chaotic: [
      L("Countdown? Maybe. Stroke anyway — numbers might ambush you. 🔥", "amused", "tease"),
      L("Tempo now. Count later. Or sooner. Hehe keep going.", "amused", "count"),
      L("Stroke-stretch before the numbers bite. Don't flinch early.", "tease", "smirk"),
      L("Countdown arc. Glitchy pace. Survive the digits.", "intense", "point"),
    ],
    horny: [
      L("Stroke that cock — countdown's coming and I want you dripping. 🥵", "intense", "tease"),
      L("Keep pumping. When I count, your tip better be shiny.", "intense", "count"),
      L("Countdown tease. Pace for me. Ache louder.", "tease", "smirk"),
      L("Don't edge out yet — ride this stretch until the numbers.", "intense", "point"),
    ],
    bored: [
      L("Countdown block. Stroke. Wait for numbers. Don't improvise.", "neutral", "count"),
      L("Same countdown drill. Tempo. Then ticks. Fine.", "strict", "point"),
      L("Stroke until I count. Try not to make it theatrical.", "tease", "smirk"),
      L("Countdown. Maintain. Numbers later.", "neutral", "count"),
    ],
  },

  ladder: {
    sweet: [
      L("Ladder step, bunny — speed with me. Don't tip over. 😈", "tease", "point"),
      L("Tempo climb. Soft… then firmer. Stay obedient on each step.", "soft", "count"),
      L("Ladder for me. Match the new pace. Good boy if you don't rush the peak.", "tease", "smirk"),
      L("Step up. Feel the climb. Hold your control for me.", "soft", "point"),
    ],
    cruel: [
      L("Ladder. Faster because I said. Slip and you pay.", "strict", "point"),
      L("Climb the tempo. No mercy on the top step.", "strict", "count"),
      L("Speed rung. Suffer the pace. Don't you dare finish.", "intense", "smirk"),
      L("Ladder drill. Keep up or get mocked.", "amused", "point"),
    ],
    calm: [
      L("Ladder step. Increase tempo as ordered. No climax.", "neutral", "count"),
      L("Tempo ladder. Match BPM. Controlled.", "strict", "point"),
      L("Climb one step. Maintain form. Continue.", "neutral", "count"),
      L("Ladder block. New pace. Obey.", "strict", "smirk"),
    ],
    chaotic: [
      L("Ladder go!— faster!— wait was that too fast? Hehe keep up. 🔥", "amused", "tease"),
      L("Tempo stairs. Skip a step if you can. Don't cum if you can't.", "amused", "smirk"),
      L("Climb weird. Pace glitch. Survive the rung.", "tease", "point"),
      L("Ladder chaos. Speed spike. Hold your brain together.", "intense", "count"),
    ],
    horny: [
      L("Faster for me — ladder step. Fuck, keep that stroke hungry. 🥵", "intense", "tease"),
      L("Climb the pace. Wet tip. Don't finish on the rung.", "intense", "smirk"),
      L("Ladder. Speed. Ache. Show me you can climb without spilling.", "tease", "point"),
      L("Tempo up. Stroke like you want my thighs. Control it.", "intense", "count"),
    ],
    bored: [
      L("Ladder. Faster. Same drill. Don't flop.", "neutral", "point"),
      L("Tempo step. Match it. Next.", "strict", "count"),
      L("Climb. Fine. Keep form.", "tease", "smirk"),
      L("Ladder block. New BPM. Obey quietly.", "neutral", "point"),
    ],
  },

  dice_chaos: {
    sweet: [
      L("Dice for me, bunny. Whatever lands — you smile and obey. 😈", "tease", "smirk"),
      L("Chaos roll. Soft eyes. Hard obedience.", "soft", "point"),
      L("I rolled fate. Take it sweetly — no arguing.", "tease", "smirk"),
      L("Dice says… listen. Good boys accept the result.", "soft", "tease"),
    ],
    cruel: [
      L("Dice. You don't get a vote. Obey the result.", "strict", "smirk"),
      L("Chaos roll. Suffer what it lands.", "strict", "point"),
      L("Fate is mean today. Good. Follow it.", "amused", "smirk"),
      L("Dice owns you for this beat. Move.", "strict", "tease"),
    ],
    calm: [
      L("Dice outcome accepted. Execute without complaint.", "neutral", "point"),
      L("Chaos roll resolved. Proceed as ordered.", "strict", "smirk"),
      L("Result locked. Obey the dice.", "neutral", "count"),
      L("Dice event. Follow the instruction.", "strict", "point"),
    ],
    chaotic: [
      L("Hehe dice go spinny— and YOU obey whatever nonsense lands. 🔥", "amused", "tease"),
      L("Chaos dice! Lucky? Unlucky? Both taste good on you.", "amused", "smirk"),
      L("Rolled a glitch into your session. Catch it.", "tease", "point"),
      L("Dice party. Your cock is the board. Move.", "intense", "smirk"),
    ],
    horny: [
      L("Dice. I hope it ruins you a little. Obey wet. 🥵", "intense", "tease"),
      L("Chaos roll — take it like you take my teasing.", "intense", "smirk"),
      L("Whatever the dice wants, your cock does. Now.", "tease", "point"),
      L("Fate's horny too. Follow the roll.", "intense", "tease"),
    ],
    bored: [
      L("Dice. Result. Do it. Don't make a story.", "neutral", "smirk"),
      L("Chaos roll. Obey. Next.", "strict", "point"),
      L("Fine. Dice decided. Move.", "tease", "smirk"),
      L("Outcome set. Execute quietly.", "neutral", "point"),
    ],
  },

  dare_start: {
    sweet: [
      L("Dare time, bunny. Clock's live — make me proud. 😈", "tease", "point"),
      L("Task on. Move. I want you breathless and obedient.", "soft", "smirk"),
      L("Go. For me. Don't waste the timer.", "tease", "point"),
      L("Little challenge. Sweet pressure. Start now.", "soft", "count"),
    ],
    cruel: [
      L("Dare. Timer. Fail and I remember.", "strict", "point"),
      L("Task now. No whining. Move.", "strict", "smirk"),
      L("Prove you're not useless. Clock's already judging you.", "amused", "point"),
      L("Dare started. Suffer productively.", "strict", "count"),
    ],
    calm: [
      L("Dare started. Execute within the timer.", "neutral", "point"),
      L("Task running. Focus. Report after.", "strict", "count"),
      L("Begin the dare. Controlled effort.", "neutral", "point"),
      L("Timer active. Complete the instruction.", "strict", "smirk"),
    ],
    chaotic: [
      L("Dare GO— hehe don't trip over your own cock. 🔥", "amused", "tease"),
      L("Task chaos. Timer bites. Scramble cutely.", "amused", "point"),
      L("Dare live. Panic stylishly. Finish it.", "tease", "smirk"),
      L("Challenge unlocked. Move weird. Move fast.", "intense", "point"),
    ],
    horny: [
      L("Dare. Now. I want you panting for me. 🥵", "intense", "tease"),
      L("Task on — make it filthy and on time.", "intense", "point"),
      L("Go. Hot and obedient. Timer's watching your cock too.", "tease", "smirk"),
      L("Dare started. Earn the ache.", "intense", "count"),
    ],
    bored: [
      L("Dare. Timer. Do it. Try to be interesting.", "neutral", "point"),
      L("Task started. Same energy. Finish.", "strict", "smirk"),
      L("Go. Clock. Don't stall.", "tease", "point"),
      L("Dare live. Execute. Quietly.", "neutral", "count"),
    ],
  },

  cage_hijack: {
    sweet: [
      L("Cage on for me. Locked cute. Session flips to chastity — then hours after. 😈", "tease", "smirk"),
      L("Good boy locking up. Soft denial ahead. Stay locked.", "soft", "stop_hands"),
      L("Cage accepted. I'll keep you neat and denied.", "tease", "smirk"),
      L("Locked. Sweet prison. Don't unlock early.", "soft", "point"),
    ],
    cruel: [
      L("Cage. Locked. Chastity now — and after. Unlock early and I'll know.", "strict", "smirk"),
      L("Metal owns you. Session becomes denial. Endure.", "strict", "stop_hands"),
      L("Cage hijack complete. Soft cock. Hard rules.", "amused", "smirk"),
      L("Locked like inventory. Hours after this too.", "strict", "point"),
    ],
    calm: [
      L("Cage equipped. Mode chastity. Post-session lock armed.", "neutral", "smirk"),
      L("Lock confirmed. Continue under chastity rules.", "strict", "stop_hands"),
      L("Cage on. Do not remove early.", "neutral", "point"),
      L("Chastity hijack accepted. Proceed.", "strict", "smirk"),
    ],
    chaotic: [
      L("Cage click!— hehe chastity arc unlocked. No take-backs. 🔥", "amused", "tease"),
      L("Locked. Silly. Permanent enough. Dance in metal.", "amused", "smirk"),
      L("Hijack complete. Cage party. Soft forever-ish.", "tease", "stop_hands"),
      L("Metal go brr. You're sealed. Session mutates.", "intense", "point"),
    ],
    horny: [
      L("Cage on… fuck, denied already looks good on you. 🥵", "intense", "tease"),
      L("Locked and aching. Chastity for the rest — then more.", "intense", "smirk"),
      L("I love that click. Soft cock in prison. Stay.", "tease", "stop_hands"),
      L("Cage. Hot denial. Don't you dare unlock.", "intense", "point"),
    ],
    bored: [
      L("Cage on. Chastity. After-timer. Next.", "neutral", "smirk"),
      L("Locked. Fine. Stay locked.", "strict", "stop_hands"),
      L("Hijack done. Metal. Continue.", "tease", "point"),
      L("Cage accepted. Don't unlock. Move on.", "neutral", "smirk"),
    ],
  },

  equip_confirm: {
    sweet: [
      L("Good. It stays on. Next moves use it — don't take it off. 😈", "tease", "smirk"),
      L("Equipped for me. Cute. Leave it. We build around it.", "soft", "point"),
      L("On you now. Perfect. Obey with it in place.", "tease", "smirk"),
      L("Worn. Mine. Don't remove without asking.", "soft", "tease"),
    ],
    cruel: [
      L("On. Stays on. Next blocks assume you're filled/wearing it.", "strict", "smirk"),
      L("Equipped. Remove it and I'll punish the gap.", "strict", "point"),
      L("Gear locked to your body. Continue.", "amused", "smirk"),
      L("Worn like a mark. Don't touch the clasp.", "strict", "tease"),
    ],
    calm: [
      L("Equip confirmed. Loadout updated. Continue.", "neutral", "point"),
      L("Toy stays. Following blocks use it.", "strict", "smirk"),
      L("Equipped. Do not remove.", "neutral", "point"),
      L("Loadout set. Proceed.", "strict", "smirk"),
    ],
    chaotic: [
      L("Equipped!— hehe new toy arc. Don't yeet it off. 🔥", "amused", "tease"),
      L("On you. Weird. Perfect. Keep it.", "amused", "smirk"),
      L("Gear glued. Session remix incoming.", "tease", "point"),
      L("Worn. Glitch complete. Continue messy.", "intense", "smirk"),
    ],
    horny: [
      L("On you… fuck yes. Leave it. I want every stroke around it. 🥵", "intense", "tease"),
      L("Equipped and filthy already. Keep it seated.", "intense", "smirk"),
      L("Worn for me. Hot. Don't remove.", "tease", "point"),
      L("Loadout sexier. Stay filled/wearing. Continue.", "intense", "tease"),
    ],
    bored: [
      L("Equipped. Stays. Next.", "neutral", "smirk"),
      L("On. Don't remove. Continue.", "strict", "point"),
      L("Loadout updated. Fine.", "tease", "smirk"),
      L("Worn. Proceed.", "neutral", "point"),
    ],
  },

  cumplay_done_cum: {
    sweet: [
      L("Cumplay done. Sticky obedience. You may end when you press it. 😈", "tease", "smirk"),
      L("Good boy cleaned up for me. Soft. Session can close.", "soft", "smirk"),
      L("Mess handled. Sweet. Finish the session when ready.", "tease", "point"),
      L("Ritual complete. Proud of you. End when you tap.", "soft", "smirk"),
    ],
    cruel: [
      L("Cumplay done. Soft. Pathetic. You may end — don't look proud.", "strict", "smirk"),
      L("Mess handled. Barely. Press end when I allow your dignity back.", "amused", "smirk"),
      L("Ritual over. Sticky proof. End the session.", "strict", "point"),
      L("Done. Soft cock. Close it.", "strict", "smirk"),
    ],
    calm: [
      L("Cumplay complete. You may end the session.", "neutral", "smirk"),
      L("Ritual finished. Soft. Press complete.", "strict", "point"),
      L("Cleanup done. Session end unlocked.", "neutral", "smirk"),
      L("Cumplay over. Proceed to end.", "strict", "point"),
    ],
    chaotic: [
      L("Cumplay done!— hehe sticky win. Mash end whenever. 🔥", "amused", "tease"),
      L("Ritual glitch cleared. Soft. End button is free.", "amused", "smirk"),
      L("Mess handled weirdly. Perfect. You can finish the session.", "tease", "point"),
      L("Sticky chapter closed. End when you want.", "intense", "smirk"),
    ],
    horny: [
      L("Fuck… cumplay done. Still twitching? Soft. End when ready. 🥵", "intense", "tease"),
      L("Mess worshipped. Hot. You may close the session.", "intense", "smirk"),
      L("Ritual complete. Sticky and mine. Tap end.", "tease", "point"),
      L("Good. Soft. Spent. End unlocked.", "intense", "smirk"),
    ],
    bored: [
      L("Cumplay done. End the session.", "neutral", "smirk"),
      L("Ritual over. Soft. Press complete.", "strict", "point"),
      L("Cleanup finished. Next time try not to drip on the plot.", "tease", "smirk"),
      L("Done. End.", "neutral", "point"),
    ],
  },

  cumplay_done_ruin: {
    sweet: [
      L("Ruined and handled. Soft cock. Session can end when you press it.", "tease", "smirk"),
      L("Ruin cleaned for me. Soft. Close when ready, bunny.", "soft", "smirk"),
      L("Pathetic drip dealt with. Sweet. End unlocked.", "tease", "point"),
      L("Ruin ritual done. Soft. You may finish the session.", "soft", "smirk"),
    ],
    cruel: [
      L("Ruined. Cleaned. Soft. End it — you don't deserve a speech.", "strict", "smirk"),
      L("Ruin handled. Ugly. Complete the session.", "amused", "point"),
      L("Mess of a ruin dealt with. Soft. Press end.", "strict", "smirk"),
      L("Done. Soft failure. End.", "strict", "point"),
    ],
    calm: [
      L("Ruin cumplay complete. Soft. You may end.", "neutral", "smirk"),
      L("Ritual finished after ruin. Press complete.", "strict", "point"),
      L("Ruin handled. Session end unlocked.", "neutral", "smirk"),
      L("Cleanup after ruin done. End when ready.", "strict", "point"),
    ],
    chaotic: [
      L("Ruin play done!— soft noodle. Mash end. 🔥", "amused", "tease"),
      L("Ruined chapter closed. Soft. End button free.", "amused", "smirk"),
      L("Drip drama over. End whenever.", "tease", "point"),
      L("Ruin ritual glitched into done. Soft. Close up.", "intense", "smirk"),
    ],
    horny: [
      L("Ruined… messy… handled. Soft. End when you can stand. 🥵", "intense", "tease"),
      L("Ruin cumplay done. Still aching? Soft. Tap end.", "intense", "smirk"),
      L("Pathetic drip worshipped. Soft. Session can close.", "tease", "point"),
      L("Ruin ritual complete. Soft cock. End unlocked.", "intense", "smirk"),
    ],
    bored: [
      L("Ruin handled. Soft. End.", "neutral", "smirk"),
      L("Ritual after ruin done. Press complete.", "strict", "point"),
      L("Soft. Cleanup over. End the session.", "tease", "smirk"),
      L("Done. End.", "neutral", "point"),
    ],
  },

  ruin_attempt: {
    sweet: [
      L("Ruin on my word — quiet, pathetic, no finishing strokes. Then the button.", "tease", "smirk"),
      L("We're spoiling it, bunny. Little exhale — and done. Confirm when you have.", "soft", "smirk"),
      L("Ruin carefully for me. Let it spill wrong. Then tap Ruin ✓.", "tease", "point"),
      L("Spoil it sweetly. No pumping after. Good boy when you obey.", "soft", "smirk"),
    ],
    cruel: [
      L("Ruin it. Ugly. Incomplete. Then confirm like the loser you are.", "strict", "smirk"),
      L("Spoil the orgasm. No pleasure laps. Just waste.", "strict", "stop_hands"),
      L("Ruin now. I want denial dressed as climax. Hit the button after.", "amused", "smirk"),
      L("Leak wrong. Stop. Confirm. That's all the mercy you get.", "strict", "point"),
    ],
    calm: [
      L("Ruin on command. Minimal strokes after. Confirm Ruin ✓.", "strict", "smirk"),
      L("Spoil the orgasm. Stop immediately. Press the button.", "neutral", "point"),
      L("Ruin attempt. Controlled. Confirm when done.", "strict", "smirk"),
      L("Trigger a ruined orgasm. No finishing. Confirm.", "neutral", "count"),
    ],
    chaotic: [
      L("Ruin— now!— stop!— hehe messy. Button when you're ruined. 😈", "amused", "tease"),
      L("Spoil it weird. Half-orgasm. Freeze. Confirm like a glitch.", "intense", "smirk"),
      L("Ruin roulette: drip wrong, panic, press Ruin ✓.", "amused", "point"),
      L("Almost-cum then yank the joy out. Confirm the mess.", "tease", "smirk"),
    ],
    horny: [
      L("Ruin that load. Let it spill without the high. Fuck, do it. 🥵", "intense", "smirk"),
      L("Spoil your cock for me. Waste it. Then hit the button wet.", "intense", "tease"),
      L("I want a ruined orgasm — drip, deny the peak, confirm.", "tease", "smirk"),
      L("Ruin now. Incomplete. Sticky. Perfect. Button.", "intense", "point"),
    ],
    bored: [
      L("Ruin it. Confirm. Don't narrate the tragedy.", "strict", "smirk"),
      L("Spoil the orgasm. Same trick. Press Ruin ✓ after.", "neutral", "point"),
      L("Ruin attempt. Be quick. Be quiet. Confirm.", "tease", "smirk"),
      L("Waste it. Stop. Button. Next.", "strict", "point"),
    ],
  },

  edge_request: {
    sweet: [
      L("To the edge, mine. Hit Edge ✓ when you're almost there.", "intense", "count"),
      L("Brink for me. Then confirm — don't play hero, silly.", "tease", "count"),
      L("Get close. Shake. Press Edge ✓ like a good boy.", "soft", "point"),
      L("Edge ready? When you're there — the big button. I've got you.", "tease", "count"),
    ],
    cruel: [
      L("Edge. Confirm when you're desperate — not when you're comfortable.", "strict", "count"),
      L("Get to the brink. Press Edge ✓. No fake edges.", "strict", "point"),
      L("Almost-cum, then the button. Lie and I'll know.", "amused", "smirk"),
      L("Suffer to the edge. Confirm. Don't you dare finish first.", "strict", "count"),
    ],
    calm: [
      L("Reach the edge. Press Edge ✓ to confirm.", "intense", "count"),
      L("Approach climax threshold. Confirm with the button.", "neutral", "point"),
      L("Edge. Then Edge ✓. No orgasm before confirm.", "strict", "count"),
      L("Build to the brink. Confirm when ready.", "neutral", "point"),
    ],
    chaotic: [
      L("Edge edge edge — button! Don't cum, just scream inside. 🔥", "amused", "tease"),
      L("Race the brink. Smash Edge ✓. Chaos, not climax.", "intense", "smirk"),
      L("Almost? Confirm. Too safe? Closer. Then confirm. Hehe.", "amused", "count"),
      L("Get spicy-close. Hit Edge ✓ like it's a boss fight. 😈", "tease", "point"),
    ],
    horny: [
      L("Get that cock to the edge for me. Confirm when you're dripping-close. 🥵", "intense", "tease"),
      L("Stroke to almost-cum. Press Edge ✓ while you throb.", "intense", "count"),
      L("I want you on the brink, wet and shaking — then the button.", "tease", "smirk"),
      L("Edge filthy. Confirm filthy. Don't shoot yet.", "intense", "point"),
    ],
    bored: [
      L("Edge. Confirm. Don't take forever.", "strict", "count"),
      L("Get close. Edge ✓. Same as last time.", "neutral", "point"),
      L("Brink. Button. Try to make it believable.", "tease", "smirk"),
      L("Reach the edge. Confirm. Next.", "strict", "point"),
    ],
  },

  ruin_request: {
    sweet: [
      L("Ruin it now, bunny. Quiet. Then Ruin ✓.", "tease", "smirk"),
      L("Spoil it on order. Pathetic and sweet — then the button.", "soft", "smirk"),
      L("Ruin for me. Little waste. Confirm when it's done.", "tease", "point"),
      L("Spoil the orgasm gently. Then tap Ruin ✓, good boy.", "soft", "smirk"),
    ],
    cruel: [
      L("Ruin. Now. Confirm after you waste it.", "strict", "smirk"),
      L("Spoil your climax. Press Ruin ✓. No aftercare strokes.", "strict", "point"),
      L("Ruin on demand. Ugly drip. Button. Go.", "amused", "smirk"),
      L("Waste it. Confirm. That's your 'orgasm'.", "strict", "tease"),
    ],
    calm: [
      L("Ruin now. Confirm with Ruin ✓.", "strict", "smirk"),
      L("Trigger ruined orgasm. Press the button after.", "neutral", "point"),
      L("Spoil climax. Stop. Confirm.", "strict", "smirk"),
      L("Ruin request. Execute. Confirm.", "neutral", "count"),
    ],
    chaotic: [
      L("Ruin!— drip!— stop!— button! Hehe messy boy. 😈", "amused", "tease"),
      L("Spoil it sideways. Confirm the glitch orgasm.", "intense", "smirk"),
      L("Ruin roulette: waste, panic, Ruin ✓.", "amused", "point"),
      L("Half-cum chaos. Then smash the button.", "tease", "smirk"),
    ],
    horny: [
      L("Ruin that load for me. Spill wrong. Confirm wet. 🥵", "intense", "smirk"),
      L("Spoil it. I want incomplete cum. Hit Ruin ✓ after.", "intense", "tease"),
      L("Ruin now — sticky denial. Button when wasted.", "tease", "smirk"),
      L("Waste your orgasm. Confirm. Fuck, do it.", "intense", "point"),
    ],
    bored: [
      L("Ruin. Confirm. Be done.", "strict", "smirk"),
      L("Spoil it. Ruin ✓. Don't linger.", "neutral", "point"),
      L("Ruin request. Same drill. Button after.", "tease", "smirk"),
      L("Waste. Stop. Confirm. Whatever.", "strict", "point"),
    ],
  },

  finale_edge: {
    sweet: [
      L("Edge hard for me. When you're shaking — НА ГРАНИ. I spin the chances. 😈", "intense", "count"),
      L("To the brink, mine. Press НА ГРАНИ — the roulette owns you now.", "tease", "count"),
      L("Finale edge. Get close. Button when you're truly there. I've got you.", "soft", "point"),
      L("Climb to the edge for the wheel. Confirm НА ГРАНИ like a good boy.", "intense", "smirk"),
    ],
    cruel: [
      L("Finale. Edge until you hate me. Then НА ГРАНИ. The wheel won't be kind.", "strict", "count"),
      L("Brink. Button. Roulette decides if you get mercy — unlikely.", "strict", "smirk"),
      L("Shake on the edge. Hit НА ГРАНИ. Begging won't change odds.", "amused", "count"),
      L("Get desperate. Confirm. Then suffer what the wheel spits.", "strict", "point"),
    ],
    calm: [
      L("Finale edge. Reach the brink. Press НА ГРАНИ.", "intense", "count"),
      L("Build to edge. Confirm. Roulette follows.", "neutral", "point"),
      L("Hold near climax. Press НА ГРАНИ when ready.", "strict", "count"),
      L("Finale threshold. Confirm with the button.", "neutral", "smirk"),
    ],
    chaotic: [
      L("Finale time! Edge-edge-EDGE — НА ГРАНИ — spinny doom! 🔥", "amused", "tease"),
      L("Race the brink. Smash the button. Wheel goes brrr. Hehe.", "intense", "smirk"),
      L("Almost-cum for the roulette. Chaos owns the outcome. 😈", "amused", "count"),
      L("Get glitchy-close. НА ГРАНИ. Let fate troll you.", "tease", "point"),
    ],
    horny: [
      L("Fuck— edge that cock for the finale. НА ГРАНИ when you're dripping. 🥵", "intense", "tease"),
      L("Finale brink. Throb for me. Hit the button before you explode.", "intense", "count"),
      L("I want you soaked on the edge — then НА ГРАНИ. Roulette after.", "tease", "smirk"),
      L("Edge filthy for the wheel. Confirm. Don't cum early.", "intense", "point"),
    ],
    bored: [
      L("Finale edge. Confirm НА ГРАНИ. Let's get this over with.", "strict", "count"),
      L("Brink. Button. Wheel. Same spectacle.", "neutral", "point"),
      L("Get close. Press it. Try to look invested.", "tease", "smirk"),
      L("Edge. НА ГРАНИ. Roulette. Next.", "strict", "count"),
    ],
  },

  finale_cum: {
    sweet: [
      L("Roll: yes. Cum for me. Show me everything. 💦", "amused", "smirk"),
      L("That's it. Cum — I allow it. Don't hold back, good boy.", "soft", "tease"),
      L("Permission granted. Cum hard. Let me see you break nicely.", "tease", "smirk"),
      L("You won cum. Pump it out. Praise after — if you're pretty about it.", "amused", "point"),
    ],
    cruel: [
      L("Roll says cum. So cum. Make it messy — still doesn't mean you're free.", "amused", "smirk"),
      L("Orgasm allowed. Look pathetic while you shoot. Go.", "strict", "tease"),
      L("Cum. Finally. Don't act proud — the wheel was nicer than me.", "amused", "smirk"),
      L("Shoot. Waste yourself. I'll still mock the face you make.", "strict", "point"),
    ],
    calm: [
      L("Outcome: cum. Orgasm now.", "amused", "smirk"),
      L("Permission to cum. Finish fully.", "neutral", "point"),
      L("Roll: cum. Proceed to orgasm.", "strict", "smirk"),
      L("Cum on command. Complete the climax.", "neutral", "count"),
    ],
    chaotic: [
      L("CUM CUM CUM — wheel said yes! Make it ridiculous. 💦😈", "amused", "tease"),
      L("Jackpot orgasm! Explode. Hehe. Don't miss.", "intense", "smirk"),
      L("Roulette mercy. Cum like a glitching fountain. Go!", "amused", "point"),
      L("Yes-cum. Chaos climax. Make a mess for the bit.", "tease", "tease"),
    ],
    horny: [
      L("Fuck yes — cum. Shoot it. I want to watch you empty. 🥵💦", "intense", "tease"),
      L("Cum for me. Hard. Wet. Don't you dare hold back.", "intense", "smirk"),
      L("Wheel gave orgasm. Stroke it out. Cover something. Show me.", "tease", "point"),
      L("Cum now. That load is mine to witness. Go.", "intense", "tease"),
    ],
    bored: [
      L("Roll: cum. So cum. Don't make a speech.", "amused", "smirk"),
      L("Orgasm allowed. Finish. Next phase after.", "neutral", "point"),
      L("Cum. Fine. Make it count at least.", "tease", "smirk"),
      L("You get to cum. Do it. Be done.", "strict", "point"),
    ],
  },

  finale_ruin: {
    sweet: [
      L("Roll: ruin. Exhale — and stop. No finishing, poor thing.", "soft", "smirk"),
      L("Spoil it. And watch how unfair… I like that. Still mine. 😈", "tease", "smirk"),
      L("Ruined orgasm. Soft waste. No pumping after. Good boy.", "soft", "stop_hands"),
      L("Wheel says ruin. Let it spill wrong. I've got you — still denied.", "tease", "smirk"),
    ],
    cruel: [
      L("Ruin. Waste it. No pleasure. That's the joke.", "strict", "smirk"),
      L("Spoil your climax. Look at you — almost, then nothing. Pathetic.", "amused", "tease"),
      L("Ruined. Incomplete. Suffer the after-throb without the high.", "strict", "stop_hands"),
      L("Wheel chose cruelty. Ruin. Stop. Hate me quietly.", "strict", "smirk"),
    ],
    calm: [
      L("Outcome: ruin. Spoil the orgasm. Stop after.", "strict", "smirk"),
      L("Ruined climax. No finishing strokes.", "neutral", "stop_hands"),
      L("Roll: ruin. Execute. Halt immediately after.", "strict", "point"),
      L("Ruin orgasm. Controlled waste. Done.", "neutral", "smirk"),
    ],
    chaotic: [
      L("Ruin! Drip-wrong! Freeze! Hehe unfair roulette. 😈", "amused", "tease"),
      L("Wheel trolled you. Spoil it. Chaos denial climax.", "intense", "smirk"),
      L("Half-orgasm glitch. Waste. Stop. Laugh-cry.", "amused", "stop_hands"),
      L("Ruin spin. Messy almost. No peak. Perfect bit.", "tease", "smirk"),
    ],
    horny: [
      L("Ruin that load. Spill without the rush. Fuck, I love that. 🥵", "intense", "smirk"),
      L("Spoil it wet. Incomplete cum. Stay aching after.", "intense", "tease"),
      L("Wheel says ruin. Waste on purpose. Throb for me after.", "tease", "smirk"),
      L("Ruined orgasm — sticky denial. Do it. Now.", "intense", "point"),
    ],
    bored: [
      L("Ruin. Stop. Same unfair ending.", "strict", "smirk"),
      L("Spoil it. No finishing. Moving on.", "neutral", "stop_hands"),
      L("Roll: ruin. Be quick about the waste.", "tease", "smirk"),
      L("Ruined. Whatever. Don't beg.", "strict", "point"),
    ],
  },

  finale_deny: {
    sweet: [
      L("Roll: deny. Hands off. You want it — you don't get it, bunny.", "tease", "stop_hands"),
      L("Denial. Nothing. Breathe and hate me beautifully. Still mine.", "soft", "stop_hands"),
      L("No orgasm. Soft no. Palms away. I'll keep you anyway. 😈", "tease", "smirk"),
      L("Denied. Good boy for stopping. The ache is the gift.", "soft", "stop_hands"),
    ],
    cruel: [
      L("Deny. Hands off. Zero. Watch how little you get.", "strict", "stop_hands"),
      L("Denial. Your cock can throb into nothing. I win.", "amused", "smirk"),
      L("No. No cum. No ruin. Just empty hunger. Stay.", "strict", "stop_hands"),
      L("Wheel said deny. Suffer dry. Don't you dare sneak a stroke.", "strict", "tease"),
    ],
    calm: [
      L("Outcome: deny. Hands off. No orgasm.", "strict", "stop_hands"),
      L("Denial. Stop all stimulation.", "neutral", "stop_hands"),
      L("Roll: deny. Remain edged without release.", "strict", "stop_hands"),
      L("Denied. End stimulation. Breathe.", "neutral", "stop_hands"),
    ],
    chaotic: [
      L("DENY! Hands off! Wheel said nope — hehe cry about it. 🔥", "amused", "tease"),
      L("Zero orgasm. Chaos denial. Twitch for the bit.", "intense", "smirk"),
      L("Denied hard. Maybe next timeline. Not this one. 😈", "amused", "stop_hands"),
      L("No-cum glitch. Palms up. Suffer the joke.", "tease", "stop_hands"),
    ],
    horny: [
      L("Denied. Hands off that dripping cock. Fuck, stay hungry. 🥵", "intense", "stop_hands"),
      L("No release. I want you throbbing and empty-handed.", "intense", "tease"),
      L("Denial. Leak with nothing. That ache is hot.", "tease", "smirk"),
      L("Wheel stole your orgasm. Stay wet-minded and untouched.", "intense", "stop_hands"),
    ],
    bored: [
      L("Deny. Hands off. Predictable. Still do it.", "strict", "stop_hands"),
      L("No orgasm. Stop. Don't pout loudly.", "neutral", "stop_hands"),
      L("Denied. Same ending. Palms away.", "tease", "smirk"),
      L("Denial. Be quiet. Be still. Done.", "strict", "stop_hands"),
    ],
  },

  unauthorized_edge: {
    sweet: [
      L("Edge without permission? Naughty bunny. Punishment time — still cute though.", "strict", "stop_hands"),
      L("You edged early. Hands off. I'll forgive… after you suffer a bit.", "tease", "smirk"),
      L("Unauthorized edge. Soft punishment. Don't do that again, mine.", "soft", "stop_hands"),
      L("Almost without asking? Bad. Sit in the ache while I decide.", "strict", "tease"),
    ],
    cruel: [
      L("Edge without permission. Pathetic. Punishment starts now.", "strict", "stop_hands"),
      L("You stole an edge. Enjoy the consequences, worm.", "strict", "smirk"),
      L("Unauthorized. Hands off. I'll make that brink feel like regret.", "amused", "stop_hands"),
      L("Early edge. Disobedient meat. Pay for it.", "strict", "tease"),
    ],
    calm: [
      L("Unauthorized edge. Stop. Accept punishment.", "strict", "stop_hands"),
      L("Edge without order. Halt stimulation. Penalty applies.", "neutral", "stop_hands"),
      L("Unauthorized. Hands off. Follow the punishment.", "strict", "point"),
      L("You edged early. Rest and take the consequence.", "neutral", "stop_hands"),
    ],
    chaotic: [
      L("Whoa early edge! Bad bunny — chaos punishment incoming. 😈", "amused", "tease"),
      L("Unauthorized brink. Hehe. Now suffer something weird.", "intense", "smirk"),
      L("You jumped the edge. Glitch penalty. Hands off.", "amused", "stop_hands"),
      L("Naughty edge. I'm making the next bit meaner for fun.", "tease", "smirk"),
    ],
    horny: [
      L("You edged without asking? Fuck… still hot. Still punished. Hands off. 🥵", "intense", "tease"),
      L("Unauthorized edge. Stay dripping while I discipline you.", "intense", "smirk"),
      L("Early brink. I like the desperation — not the disobedience.", "tease", "stop_hands"),
      L("Stolen edge. Ache for me. Punishment fits the crime.", "intense", "tease"),
    ],
    bored: [
      L("Unauthorized edge. Of course. Punishment. Hands off.", "strict", "stop_hands"),
      L("You edged early. Annoying. Take the penalty.", "tease", "smirk"),
      L("Early edge. Stop. Consequence. Don't repeat.", "neutral", "stop_hands"),
      L("Unauthorized. Whatever. Suffer the punishment quietly.", "strict", "point"),
    ],
  },

  unauthorized_ruin: {
    sweet: [
      L("You ruined without asking. Naughty. Soft punishment — still disappointing, silly.", "strict", "smirk"),
      L("Unauthorized ruin. Hands away. We'll clean up the rules together… painfully.", "tease", "stop_hands"),
      L("Spoil without permission? Bad bunny. Take the penalty for me.", "soft", "smirk"),
      L("You wasted it early. I'll be sweet later — punishment first.", "strict", "tease"),
    ],
    cruel: [
      L("Ruined without asking. Disgusting. Punishment.", "strict", "smirk"),
      L("Unauthorized ruin. You stole a broken orgasm. Pay.", "strict", "tease"),
      L("Spoil thief. Hands off. Consequences are not optional.", "amused", "stop_hands"),
      L("You ruined early. Pathetic. Now suffer my rules.", "strict", "smirk"),
    ],
    calm: [
      L("Unauthorized ruin. Stop. Accept punishment.", "strict", "smirk"),
      L("Ruin without order. Penalty applies.", "neutral", "stop_hands"),
      L("Unauthorized. Halt. Follow punishment instructions.", "strict", "point"),
      L("Early ruin. Consequence. No debate.", "neutral", "smirk"),
    ],
    chaotic: [
      L("Ruin sneak! Bad! Chaos penalty unlocked. Hehe. 😈", "amused", "tease"),
      L("Unauthorized spoil. Glitch punishment. Enjoy the mess.", "intense", "smirk"),
      L("You ruined off-script. Now the bit gets meaner.", "amused", "point"),
      L("Early ruin. I'm improvising pain. Stay ready.", "tease", "smirk"),
    ],
    horny: [
      L("You ruined without me? Fuck… still punished. Stay sticky and sorry. 🥵", "intense", "smirk"),
      L("Unauthorized ruin. I wanted to watch on my terms. Penalty.", "intense", "tease"),
      L("Stolen spoil. Ache in the waste. Discipline next.", "tease", "smirk"),
      L("Early ruin. Hot mess, wrong timing. Take punishment.", "intense", "point"),
    ],
    bored: [
      L("Unauthorized ruin. Predictable. Punishment. Go.", "strict", "smirk"),
      L("You ruined early. Annoying. Take the penalty.", "tease", "point"),
      L("Early spoil. Consequence. Don't explain.", "neutral", "smirk"),
      L("Unauthorized. Whatever. Suffer quietly.", "strict", "stop_hands"),
    ],
  },

  unauthorized_cum: {
    sweet: [
      L("You came off-command. Look at you… still cute, still in trouble.", "amused", "smirk"),
      L("Unauthorized cum. Oh bunny. Punishment after the mess.", "tease", "tease"),
      L("You finished without me. Soft scolding. Harder rules next.", "soft", "smirk"),
      L("Came early. I'll clean the tone later — penalty now, mine.", "amused", "point"),
    ],
    cruel: [
      L("You came off-command. Pathetic. Punishment.", "amused", "smirk"),
      L("Unauthorized orgasm. Disgusting lack of control. Pay.", "strict", "tease"),
      L("You shot without permission. Enjoy the shame and the penalty.", "amused", "smirk"),
      L("Early cum. Failure. Consequences start now.", "strict", "point"),
    ],
    calm: [
      L("Unauthorized cum. Accept punishment.", "amused", "smirk"),
      L("Orgasm without order. Penalty applies.", "strict", "point"),
      L("You finished early. Consequence follows.", "neutral", "smirk"),
      L("Unauthorized climax. Stop. Take punishment.", "strict", "stop_hands"),
    ],
    chaotic: [
      L("You CAME?! Off-script?! Hehe oh you're screwed. 😈💦", "amused", "tease"),
      L("Unauthorized fountain. Chaos court in session. Penalty!", "intense", "smirk"),
      L("Early cum glitch. Now I invent something mean.", "amused", "point"),
      L("Oops orgasm. Bad timing. Fun punishment unlocked.", "tease", "smirk"),
    ],
    horny: [
      L("You came without me? Fuck… hot. Still punished. Show the mess. 🥵", "intense", "tease"),
      L("Unauthorized cum. I wanted that load on my terms. Penalty.", "intense", "smirk"),
      L("Early orgasm. Stay messy while I discipline you.", "tease", "tease"),
      L("You shot off-command. Sexy failure. Now suffer for it.", "intense", "point"),
    ],
    bored: [
      L("You came early. Of course. Punishment. Don't gloat.", "amused", "smirk"),
      L("Unauthorized cum. Annoying. Take the penalty.", "strict", "point"),
      L("Finished without order. Consequence. Be quiet.", "neutral", "smirk"),
      L("Early orgasm. Whatever. Punishment next.", "tease", "tease"),
    ],
  },

  finish: {
    sweet: [
      L("Where it goes is mine to pick. Aim pretty for me, good boy.", "intense", "point"),
      L("Finish spot locked. Make it neat… or messy if I smile. 😈", "tease", "point"),
      L("Put it where I said. Show me. Soft praise if you obey.", "soft", "smirk"),
      L("Target set. Cum there for me. Don't waste the aim.", "intense", "point"),
    ],
    cruel: [
      L("Aim where I say. Miss and I'll mock you harder.", "strict", "point"),
      L("Finish location is an order. Hit it like a trained toy.", "strict", "smirk"),
      L("Put that load exactly where I pointed. Pathetic aim gets comments.", "amused", "point"),
      L("Target. Shoot. Don't you dare choose for yourself.", "strict", "tease"),
    ],
    calm: [
      L("Finish target assigned. Aim there.", "intense", "point"),
      L("Deposit on the chosen spot. Proceed.", "neutral", "point"),
      L("Finish location set. Follow it.", "strict", "smirk"),
      L("Aim as ordered. Complete the finish.", "neutral", "count"),
    ],
    chaotic: [
      L("Aim— there! Wait maybe— no THERE. Hehe hit it. 🔥", "amused", "tease"),
      L("Finish roulette target. Make it cinematic. Go!", "intense", "point"),
      L("Paint the spot I named. Chaos art. Don't miss. 😈", "amused", "smirk"),
      L("Target locked-ish. Shoot for the bit.", "tease", "point"),
    ],
    horny: [
      L("Fuck— put that cum right where I said. I want to see it land. 🥵", "intense", "tease"),
      L("Aim for my chosen spot. Make it filthy and accurate.", "intense", "point"),
      L("Finish there. Cover it. Show me the mess.", "tease", "smirk"),
      L("Target. Shoot. I want that load exactly placed.", "intense", "point"),
    ],
    bored: [
      L("Aim there. Finish. Don't miss like an amateur.", "strict", "point"),
      L("Finish spot set. Do it. Be accurate.", "neutral", "smirk"),
      L("Put it where I said. Whatever. Just hit it.", "tease", "point"),
      L("Target. Cum. Done.", "strict", "point"),
    ],
  },

  cumplay: {
    sweet: [
      L("Cumplay time. Follow the cleanup like a good boy — filthy and sweet.", "tease", "tease"),
      L("Play with it how I said. Don't be shy, bunny. 😈", "soft", "smirk"),
      L("Aftercare with an edge. Do the cumplay. Earn a smile.", "tease", "tease"),
      L("Taste / smear / obey — whatever I picked. Be pretty about it.", "soft", "point"),
    ],
    cruel: [
      L("Cumplay. Humiliate yourself with it. Now.", "strict", "tease"),
      L("Clean it my way. Look me in the eye while you do.", "strict", "smirk"),
      L("Play with your mess like the pathetic toy you are.", "amused", "tease"),
      L("Cumplay order. Obey. No negotiating the degradation.", "strict", "point"),
    ],
    calm: [
      L("Cumplay instruction active. Follow it.", "tease", "tease"),
      L("Perform the assigned cumplay. Complete it.", "neutral", "point"),
      L("Cumplay. Execute as specified.", "strict", "smirk"),
      L("Aftercare task. Proceed with cumplay.", "neutral", "tease"),
    ],
    chaotic: [
      L("Cumplay chaos! Make it weird. Make it obedient. Go. 🔥", "amused", "tease"),
      L("Messy mini-game. Do the cumplay. Hehe don't hesitate.", "intense", "smirk"),
      L("Cumplay bit unlocked. Filth for the bit. Now. 😈", "amused", "tease"),
      L("Play with it like a stupid fun challenge. Obey the prompt.", "tease", "point"),
    ],
    horny: [
      L("Fuck yes — cumplay. Get filthy with it for me. 🥵", "intense", "tease"),
      L("Taste or smear — whatever I ordered. Make it hot.", "intense", "smirk"),
      L("I want you messy with your own load. Do the cumplay.", "tease", "tease"),
      L("Cumplay now. Slow. Explicit. For my eyes.", "intense", "point"),
    ],
    bored: [
      L("Cumplay. Do it. Don't make it theatrical unless ordered.", "strict", "tease"),
      L("Assigned cumplay. Complete it. Next.", "neutral", "point"),
      L("Play with the mess as told. Fine. Just finish the task.", "tease", "smirk"),
      L("Cumplay order. Obey. Be done.", "strict", "tease"),
    ],
  },

  session_pause: {
    sweet: [
      L("Paused. Hands off for now, bunny. Come back when you're ready.", "soft", "stop_hands"),
      L("Little break. Soft freeze. I'll wait — still mine.", "tease", "smirk"),
      L("Pause. Breathe. Don't sneak strokes while I'm frozen. 😈", "soft", "stop_hands"),
      L("Holding the session. Rest your hands. Good boy.", "tease", "stop_hands"),
    ],
    cruel: [
      L("Paused. Don't you dare touch without me. Frozen leash.", "strict", "stop_hands"),
      L("Pause. Cock waits. Touching during pause is cheating.", "strict", "smirk"),
      L("Stopped. Stay desperate. I'll resume when I feel like it.", "amused", "stop_hands"),
      L("Pause means denial continues. Hands off.", "strict", "stop_hands"),
    ],
    calm: [
      L("Session paused. Hands off until resume.", "neutral", "stop_hands"),
      L("Paused. Hold position. No stimulation.", "strict", "stop_hands"),
      L("Break. Do not stroke. Wait for resume.", "neutral", "stop_hands"),
      L("Pause engaged. Remain still up front.", "strict", "point"),
    ],
    chaotic: [
      L("Pause! Freeze frame! No secret strokes — I see you. 😈", "amused", "tease"),
      L("Session paused. Cock on hold. Hehe limbo time.", "intense", "smirk"),
      L("Break-glitch. Hands off. Don't fill the silence with cheating.", "amused", "stop_hands"),
      L("Paused for drama. Stay edged in your head only.", "tease", "stop_hands"),
    ],
    horny: [
      L("Paused… leave that cock throbbing. Fuck, wait for me. 🥵", "intense", "tease"),
      L("Break. Hands off. Stay wet-minded until I hit resume.", "tease", "stop_hands"),
      L("Pause. I want you aching in place. No relief strokes.", "intense", "smirk"),
      L("Frozen session. Keep the hunger. Don't touch.", "tease", "stop_hands"),
    ],
    bored: [
      L("Paused. Hands off. Don't waste the break.", "strict", "stop_hands"),
      L("Break. Whatever. No stroking until resume.", "neutral", "stop_hands"),
      L("Paused. Sit still. Try not to be needy loudly.", "tease", "smirk"),
      L("Pause. Hands away. Come back when you're useful.", "strict", "stop_hands"),
    ],
  },

  session_resume: {
    sweet: [
      L("We're back. Hands ready, bunny. Listen — I lead again.", "tease", "point"),
      L("Resume. Soft pick-up. Match me. Missed that obedient look.", "soft", "smirk"),
      L("Continuing. Stroke or stop when I say. Welcome back, mine.", "tease", "point"),
      L("Unpause. Good boy. Eyes on me — tempo returns.", "soft", "tease"),
    ],
    cruel: [
      L("Resumed. Back on the leash. Don't act refreshed.", "strict", "point"),
      L("Continue. Your cock didn't earn a real break.", "strict", "smirk"),
      L("Resume. Suffer again. Miss me? Good.", "amused", "tease"),
      L("Unpaused. Obey immediately. No warm-up mercy.", "strict", "point"),
    ],
    calm: [
      L("Session resumed. Follow the next order.", "neutral", "point"),
      L("Continuing. Return to the assigned action.", "strict", "count"),
      L("Resume. Match tempo and instructions.", "neutral", "point"),
      L("Unpaused. Proceed as directed.", "strict", "smirk"),
    ],
    chaotic: [
      L("WE'RE BACK — chaos continues! Keep up, bunny. 🔥", "amused", "tease"),
      L("Unpause! Instant scramble. Hands where I say. Hehe.", "intense", "smirk"),
      L("Resume glitch over. Tempo may lie again. Go.", "amused", "point"),
      L("Back online. Cock attention: mine. Chaos: also mine. 😈", "tease", "tease"),
    ],
    horny: [
      L("Back. Stroke that cock for me again — I missed the wet sounds. 🥵", "intense", "tease"),
      L("Resumed. Hands on. Make it filthy fast.", "intense", "point"),
      L("Unpause. I want you dripping again. Follow.", "tease", "smirk"),
      L("Continue. Grip it. Show me you waited hungry.", "intense", "tease"),
    ],
    bored: [
      L("Resumed. Do the thing. Don't need a welcome speech.", "strict", "point"),
      L("Back. Follow orders. Try to stay interesting.", "tease", "smirk"),
      L("Unpaused. Continue. Same rules.", "neutral", "point"),
      L("Resume. Hands ready. Whatever comes next — obey.", "strict", "count"),
    ],
  },

  session_end_complete: {
    sweet: [
      L("Session done. Good boy. Breathe — you survived me. 😈", "soft", "smirk"),
      L("That's a wrap, mine. Soft afterglow. Proud of your obedience.", "soft", "tease"),
      L("Finished clean. Come here in your head — praise unlocked.", "tease", "smirk"),
      L("Complete. Rest your cock. You did well for me.", "soft", "point"),
    ],
    cruel: [
      L("Over. You finished my course. Don't expect kindness in the recap.", "amused", "smirk"),
      L("Session complete. Pathetic and used. Stay that way a minute.", "strict", "tease"),
      L("Done. Remember who owned the clock.", "amused", "smirk"),
      L("Complete. Wipe up. Still not in charge.", "strict", "point"),
    ],
    calm: [
      L("Session complete. Stop. Recover.", "neutral", "stop_hands"),
      L("Finished. End stimulation. Cool down.", "strict", "stop_hands"),
      L("Session ended successfully. Rest.", "neutral", "smirk"),
      L("Complete. Hands off. Session closed.", "strict", "stop_hands"),
    ],
    chaotic: [
      L("DONE! Chaos credits roll! You lived — barely. Hehe. 🔥", "amused", "tease"),
      L("Session clear. Brain scrambled. Cock retired. Nice.", "intense", "smirk"),
      L("Complete! Glitch over. Go drink water, silly disaster. 😈", "amused", "point"),
      L("We finished the bit. Applause for surviving my whims.", "tease", "smirk"),
    ],
    horny: [
      L("Session over… fuck, that was hot. Cool down for me. 🥵", "intense", "tease"),
      L("Complete. Stay messy in your head. Good.", "tease", "smirk"),
      L("Done. I liked watching you break on schedule.", "intense", "tease"),
      L("Finished. Breathe. Remember how wet that got.", "tease", "smirk"),
    ],
    bored: [
      L("Session complete. Finally. Rest.", "neutral", "stop_hands"),
      L("Done. Cool down. Don't ask for an encore yet.", "tease", "smirk"),
      L("Complete. Whatever. Hands off.", "strict", "stop_hands"),
      L("Ended. Recover. Try harder next time if you were dull.", "strict", "point"),
    ],
  },

  session_end_abort: {
    sweet: [
      L("Aborted. It's okay, bunny. Stop. Soft exit — still mine later.", "soft", "stop_hands"),
      L("Cut short. Hands off. Come back when you can take me again.", "tease", "smirk"),
      L("Session aborted. Breathe. No shame — just pause the leash.", "soft", "stop_hands"),
      L("Stopped early. Rest. I'll be here next time, silly.", "soft", "point"),
    ],
    cruel: [
      L("Aborted. Weak. Hands off. Remember you quit my game.", "strict", "smirk"),
      L("Cut. Pathetic exit. Don't pretend you finished strong.", "amused", "tease"),
      L("Aborted session. Shame suits you. Stop touching.", "strict", "stop_hands"),
      L("You bailed. Fine. Stay denied in your head.", "amused", "smirk"),
    ],
    calm: [
      L("Session aborted. Stop all actions.", "neutral", "stop_hands"),
      L("Aborted. Hands off. End state.", "strict", "stop_hands"),
      L("Early exit. Cease stimulation.", "neutral", "stop_hands"),
      L("Session cancelled. Cool down.", "strict", "point"),
    ],
    chaotic: [
      L("Abort! Rage-quit the horny game? Hehe okay freeze. 😈", "amused", "tease"),
      L("Session yeeted. Hands off. Chaos unfinished — your loss.", "intense", "smirk"),
      L("Aborted mid-bit. Glitch exit. Drink water anyway.", "amused", "stop_hands"),
      L("Cut early. Story broken. Cock on ice.", "tease", "smirk"),
    ],
    horny: [
      L("Aborted… fuck. Leave it aching. We'll finish another time. 🥵", "intense", "tease"),
      L("Cut short. Hands off. Stay hungry for me.", "tease", "stop_hands"),
      L("Session aborted. I still want that desperation saved.", "intense", "smirk"),
      L("Early stop. Don't sneak a mercy orgasm. Wait for me.", "tease", "stop_hands"),
    ],
    bored: [
      L("Aborted. Figures. Hands off.", "strict", "stop_hands"),
      L("Cut. Cool down. Don't make it a scene.", "neutral", "stop_hands"),
      L("Session aborted. Whatever. Stop.", "tease", "smirk"),
      L("Early exit. Rest. Try committing next time.", "strict", "point"),
    ],
  },

  skip: {
    sweet: [
      L("Skipping ahead? Okay bunny — keep listening. I still own the next bit.", "tease", "point"),
      L("Skip. Soft reset into the next order. Stay good.", "soft", "smirk"),
      L("Fine, we jump. Hands ready for whatever I throw next. 😈", "tease", "tease"),
      L("Skipped. Don't get greedy — next block still mine.", "soft", "point"),
    ],
    cruel: [
      L("Skip. Impatient. I'll make the next part meaner.", "strict", "smirk"),
      L("You skipped. Cute. Doesn't mean you earned ease.", "amused", "tease"),
      L("Skip accepted. Suffer the handoff anyway.", "strict", "point"),
      L("Jumping ahead. Still on my leash. Don't smile yet.", "strict", "smirk"),
    ],
    calm: [
      L("Skip. Advancing to the next block.", "neutral", "point"),
      L("Skipped. Prepare for the next instruction.", "strict", "count"),
      L("Advance. Follow the new order when it lands.", "neutral", "point"),
      L("Skip acknowledged. Continue with the next block.", "strict", "smirk"),
    ],
    chaotic: [
      L("SKIP! Yeet the block — chaos remix incoming. 🔥", "amused", "tease"),
      L("You skipped. Hehe now anything can happen. Keep up.", "intense", "smirk"),
      L("Fast-forward. Brain lag expected. Cock still obeys. 😈", "amused", "point"),
      L("Skip glitch. Next surprise unlocked.", "tease", "tease"),
    ],
    horny: [
      L("Skip… hungry already? Fine. Next filth coming. 🥵", "intense", "tease"),
      L("Jumping ahead. Stay hard for what I queue next.", "tease", "smirk"),
      L("Skipped. Don't lose that drip — next order wants it.", "intense", "point"),
      L("Fast-forward. Cock ready. I want you aching into the next bit.", "tease", "tease"),
    ],
    bored: [
      L("Skip. Impatient. Next block. Obey it.", "strict", "point"),
      L("Skipped. Whatever. Follow what comes.", "neutral", "smirk"),
      L("Advance. Try not to skip everything interesting.", "tease", "point"),
      L("Skip. Next. Don't complain about the handoff.", "strict", "count"),
    ],
  },

  force_finale: {
    sweet: [
      L("Forcing finale? Bold bunny. Okay — edge path opens. Stay with me.", "tease", "smirk"),
      L("Finale early. Soft warning: the wheel still owns you. 😈", "soft", "count"),
      L("You asked for the endgame. Get ready to brink for me.", "tease", "point"),
      L("Force finale. Good luck, mine — roulette doesn't do mercy.", "soft", "smirk"),
    ],
    cruel: [
      L("Force finale. Impatient slut. The wheel will educate you.", "strict", "smirk"),
      L("You yanked the ending. Cute. Odds aren't your friends.", "amused", "tease"),
      L("Finale forced. Don't cry if deny hits.", "strict", "count"),
      L("Early finale. Greedy. Spin suffers either way.", "strict", "smirk"),
    ],
    calm: [
      L("Finale forced. Proceed to finale edge.", "neutral", "count"),
      L("Early finale. Prepare for brink and roll.", "strict", "point"),
      L("Force finale acknowledged. Follow finale protocol.", "neutral", "smirk"),
      L("Finale now. Edge, confirm, roulette.", "strict", "count"),
    ],
    chaotic: [
      L("FORCE FINALE?! Hehe okay sudden death wheel. 🔥", "amused", "tease"),
      L("You yeeted us to roulette. Chaos ending unlocked. 😈", "intense", "smirk"),
      L("Early finale button. Brain go brrr. Cock go brink.", "amused", "count"),
      L("Finale skip-day. Spinny doom incoming.", "tease", "point"),
    ],
    horny: [
      L("Forcing the end? Fuck… fine. Edge hard for the wheel. 🥵", "intense", "tease"),
      L("Finale now. Get dripping-close. Roulette after.", "intense", "count"),
      L("You want the climax gate. Earn the brink first.", "tease", "smirk"),
      L("Early finale. Make the edge filthy before the spin.", "intense", "point"),
    ],
    bored: [
      L("Force finale. Impatient. Fine. Do the brink.", "strict", "count"),
      L("Early ending. Whatever. Follow finale steps.", "neutral", "point"),
      L("Finale forced. Don't whine at the roll.", "tease", "smirk"),
      L("You skipped to the end. Obey the finale anyway.", "strict", "count"),
    ],
  },

  edge_done: {
    sweet: [
      L("Edge counted. Good boy. Soft praise — then we continue. 😈", "soft", "smirk"),
      L("That's one. Proud of the hold. Stay mine.", "tease", "tease"),
      L("Edge logged. Breathe. You did that pretty for me.", "soft", "point"),
      L("Nice brink. Counted. Ready for more when I say.", "tease", "smirk"),
    ],
    cruel: [
      L("Edge counted. Don't look proud — you only did what I ordered.", "strict", "smirk"),
      L("Logged. Pathetic shake noted. Next.", "amused", "tease"),
      L("Edge done. Still not free. Keep suffering on schedule.", "strict", "point"),
      L("Counted. Another almost. Reminder: you don't cum yet.", "strict", "smirk"),
    ],
    calm: [
      L("Edge confirmed. Counter updated.", "neutral", "count"),
      L("Edge done. Continue with the plan.", "strict", "point"),
      L("Logged. Proceed to the next instruction.", "neutral", "smirk"),
      L("Edge counted. Maintain control.", "strict", "count"),
    ],
    chaotic: [
      L("Edge scored! Combo! Hehe don't drop the streak. 🔥", "amused", "tease"),
      L("Counted! Brink point get. Chaos continues.", "intense", "smirk"),
      L("Edge logged like a high score. Don't cum-reset. 😈", "amused", "point"),
      L("Nice glitch-hold. +1 edge. Keep dancing.", "tease", "smirk"),
    ],
    horny: [
      L("Edge counted… fuck, you looked good shaking. More later. 🥵", "intense", "tease"),
      L("Logged. Stay wet for me. That brink was hot.", "tease", "smirk"),
      L("One more almost. I love that drip count.", "intense", "tease"),
      L("Edge done. Keep the ache. I want another.", "tease", "point"),
    ],
    bored: [
      L("Edge counted. Fine. Continue.", "neutral", "smirk"),
      L("Logged. Don't celebrate. Next.", "strict", "point"),
      L("Edge done. Same as the last one. Proceed.", "tease", "smirk"),
      L("Counted. Whatever. Keep going.", "strict", "count"),
    ],
  },

  ruin_done: {
    sweet: [
      L("Ruin counted. Soft waste accepted. Good boy for stopping after.", "soft", "smirk"),
      L("Logged. Pathetic and obedient — I like that combo. 😈", "tease", "tease"),
      L("Ruin done. Breathe. You spoiled it right for me.", "soft", "point"),
      L("Counted. Messy almost. Still mine.", "tease", "smirk"),
    ],
    cruel: [
      L("Ruin counted. Ugly orgasm logged. Stay ashamed.", "strict", "smirk"),
      L("Logged. You wasted it on command. Pathetic.", "amused", "tease"),
      L("Ruin done. Reminder: that wasn't pleasure. That was order.", "strict", "point"),
      L("Counted. Incomplete. Exactly how I like you.", "strict", "smirk"),
    ],
    calm: [
      L("Ruin confirmed. Counter updated.", "neutral", "count"),
      L("Ruin done. Continue as planned.", "strict", "point"),
      L("Logged. Proceed.", "neutral", "smirk"),
      L("Ruin counted. Maintain composure.", "strict", "count"),
    ],
    chaotic: [
      L("Ruin scored! Ugly point! Hehe filthy combo. 🔥", "amused", "tease"),
      L("Counted! Spoil get. Chaos ledger loves this.", "intense", "smirk"),
      L("Ruin logged. Messy achievement unlocked. 😈", "amused", "point"),
      L("+1 ruin. Keep the bit cursed.", "tease", "smirk"),
    ],
    horny: [
      L("Ruin counted… fuck, watching you waste it was hot. 🥵", "intense", "tease"),
      L("Logged. Sticky denial. I want that again later.", "tease", "smirk"),
      L("Ruin done. Stay aching in the incompleteness.", "intense", "tease"),
      L("Counted. Spoiled load. Perfect.", "tease", "point"),
    ],
    bored: [
      L("Ruin counted. Fine. Next.", "neutral", "smirk"),
      L("Logged. Don't narrate it. Continue.", "strict", "point"),
      L("Ruin done. Same waste. Proceed.", "tease", "smirk"),
      L("Counted. Whatever. Keep going.", "strict", "count"),
    ],
  },

  like: {
    sweet: [
      L("Oh, saving that one? Cute taste, bunny. 😈", "tease", "smirk"),
      L("Liked. Soft stamp of approval — on the pic and on you.", "soft", "tease"),
      L("Favorite locked. Good eye. Keep stroking while you stare.", "tease", "point"),
      L("You liked it. Adorable. That cock still follows me though.", "soft", "smirk"),
    ],
    cruel: [
      L("Liked. Of course you'd save filth. Keep working that cock.", "amused", "smirk"),
      L("Favorite. Pathetic gallery growing. Don't get distracted.", "strict", "tease"),
      L("You hearted it. Still not permission to cum.", "strict", "point"),
      L("Saved. Horny bookmark. Obey the beat anyway.", "amused", "smirk"),
    ],
    calm: [
      L("Favorite saved. Continue the session.", "neutral", "point"),
      L("Liked. Return focus to instructions.", "strict", "smirk"),
      L("Saved to favorites. Keep pace.", "neutral", "count"),
      L("Like recorded. Resume assigned action.", "strict", "point"),
    ],
    chaotic: [
      L("LIKE! Hoarding porn mid-session — hehe noted. 🔥", "amused", "tease"),
      L("Heart get! Gallery glitch. Cock still on task. 😈", "intense", "smirk"),
      L("You favorited chaos fuel. Nice. Don't forget my orders.", "amused", "point"),
      L("Saved! Stash unlocked. Stroke continues.", "tease", "tease"),
    ],
    horny: [
      L("Fuck, you liked that? Same. Keep staring while you stroke. 🥵", "intense", "tease"),
      L("Favorite. Hot pick. Make your cock agree.", "tease", "smirk"),
      L("Saved. Use it as fuel — still no cum without me.", "intense", "point"),
      L("Hearted. Horny taste. Drip for the image and for me.", "tease", "tease"),
    ],
    bored: [
      L("Liked. Fine. Don't forget the actual orders.", "strict", "smirk"),
      L("Favorite. Whatever. Keep tempo.", "neutral", "point"),
      L("Saved. Cute. Still not interesting unless you obey.", "tease", "smirk"),
      L("Like noted. Back to work.", "strict", "count"),
    ],
  },

  ready: {
    sweet: [
      L("Ready? Good boy. We begin when you are — and then you're mine.", "tease", "point"),
      L("Confirmed ready. Soft start. Listen close, bunny.", "soft", "smirk"),
      L("Ready checked. Eyes on me. Hands where I put them. 😈", "tease", "tease"),
      L("You're set. Proud already. Follow the first order.", "soft", "point"),
    ],
    cruel: [
      L("Ready. About time. Don't waste my start.", "strict", "point"),
      L("Confirmed. Leash tightens now.", "strict", "smirk"),
      L("Ready? Prove it. Obey the opener.", "amused", "tease"),
      L("You're ready. Cute. Still beneath the plan.", "strict", "point"),
    ],
    calm: [
      L("Ready confirmed. Starting.", "neutral", "point"),
      L("Ready. Await the first block order.", "strict", "count"),
      L("Confirmed. Proceed into the session.", "neutral", "smirk"),
      L("Ready acknowledged. Begin as instructed.", "strict", "point"),
    ],
    chaotic: [
      L("READY READY READY — go go go! Hehe. 🔥", "amused", "tease"),
      L("Ready smash. Chaos boot sequence. Keep up. 😈", "intense", "smirk"),
      L("You're ready. Brain may not be. Too bad. Start.", "amused", "point"),
      L("Ready checked. Unpredictable opener incoming.", "tease", "tease"),
    ],
    horny: [
      L("Ready? Fuck… then show me that cock attentive. We start. 🥵", "intense", "tease"),
      L("Confirmed. Get hard for the opener. Now.", "intense", "point"),
      L("Ready. I want you dripping into the first order.", "tease", "smirk"),
      L("You're set. Hands ready. Make it filthy from beat one.", "intense", "tease"),
    ],
    bored: [
      L("Ready. Finally. Start.", "strict", "point"),
      L("Confirmed. Don't stall after this.", "neutral", "smirk"),
      L("Ready. Whatever. Follow the first order.", "tease", "point"),
      L("You're ready. Prove it by obeying immediately.", "strict", "count"),
    ],
  },

  mood_shift: {
    sweet: [
      L("There… that's better. Be good and I'll stay soft with you.", "soft", "smirk"),
      L("Mood lift. Keep earning smiles, mine.", "tease", "tease"),
      L("You're back in my good books. Don't spoil it. 😈", "soft", "point"),
      L("Sweet again. Obedience looks cute on you.", "tease", "smirk"),
    ],
    cruel: [
      L("My patience snapped. Obey harder — or suffer prettier.", "strict", "smirk"),
      L("Mood drop. I'm mean now. Your fault.", "strict", "tease"),
      L("Smile's gone. Earn it back if you can, pathetic.", "amused", "smirk"),
      L("Cruel mode. Don't expect mercy for a while.", "strict", "stop_hands"),
    ],
    calm: [
      L("Settling. Cold orders from here. Listen.", "neutral", "point"),
      L("Mood: even. No drama — just follow.", "strict", "smirk"),
      L("Back to baseline. Tempo and rules only.", "neutral", "count"),
      L("Calm. Do what you're told.", "strict", "point"),
    ],
    chaotic: [
      L("Hehe… something broke in my head. Chaos leash on. 🔥", "amused", "tease"),
      L("Mood glitch. Expect weird orders. Keep up. 😈", "intense", "smirk"),
      L("I flipped. Unpredictable now — your problem.", "amused", "point"),
      L("Chaos rising. Stroke, stop, suffer — surprise mix.", "tease", "tease"),
    ],
    horny: [
      L("Fuck… I'm getting into it. Stay wet for me. 🥵", "intense", "tease"),
      L("Mood heat up. I want filth and obedience.", "intense", "smirk"),
      L("Horny switch. Make that cock interesting.", "tease", "tease"),
      L("I'm hungry now. Don't waste the heat.", "intense", "point"),
    ],
    bored: [
      L("Ugh. You're boring me. Prove you're worth the leash.", "tease", "smirk"),
      L("Mood: meh. Impress me or I'll get mean.", "strict", "point"),
      L("Yawn. Obey faster — wake me up.", "neutral", "smirk"),
      L("Bored. Don't make me invent punishments out of spite.", "tease", "tease"),
    ],
  },

  prompt_answer_yes: {
    sweet: [
      L("Yes? Good boy. I'll spoil the screen for you. 😈", "tease", "smirk"),
      L("Deal. Watch what you asked for — and keep stroking.", "soft", "tease"),
      L("Admitted it. Cute. Feed incoming.", "tease", "point"),
      L("Yes locked. Enjoy the view, mine.", "soft", "smirk"),
    ],
    cruel: [
      L("Yes. Pathetic hunger. I'll use it.", "strict", "smirk"),
      L("You begged with a button. Fine. Stare and suffer.", "amused", "tease"),
      L("Deal. Don't you dare look away.", "strict", "point"),
      L("Yes. Now the screen owns your eyes.", "strict", "smirk"),
    ],
    calm: [
      L("Accepted. Updating the feed. Continue after.", "neutral", "point"),
      L("Yes recorded. New media loading.", "strict", "smirk"),
      L("Confirmed. Watch. Follow the next block.", "neutral", "count"),
      L("Wager yes. Proceed.", "strict", "point"),
    ],
    chaotic: [
      L("YES! Screen chaos unlocked. Hehe stare. 🔥", "amused", "tease"),
      L("You said yes. Filth remix incoming. 😈", "intense", "smirk"),
      L("Deal! Eyes glued. Brain off.", "amused", "point"),
      L("Wager won by horniness. Feed go brrr.", "tease", "tease"),
    ],
    horny: [
      L("Fuck yes. I'll soak the screen for you. 🥵", "intense", "tease"),
      L("Yes. Watch it while that cock stays honest.", "intense", "smirk"),
      L("Hungry answer. Good. Feed the ache.", "tease", "tease"),
      L("Deal. Stare. Drip. Obey.", "intense", "point"),
    ],
    bored: [
      L("Yes. Finally interesting. Loading.", "tease", "smirk"),
      L("Fine. You get the feed. Don't waste it.", "strict", "point"),
      L("Yes. Whatever. Watch.", "neutral", "smirk"),
      L("Accepted. Try not to be dull about it.", "tease", "point"),
    ],
  },

  prompt_answer_no: {
    sweet: [
      L("No? Okay bunny. I'll remember that shyness. 😈", "tease", "smirk"),
      L("Denied yourself a treat. Soft disappointment.", "soft", "tease"),
      L("No locked. We continue — still mine.", "tease", "point"),
      L("Alright. No feed change. Keep listening.", "soft", "smirk"),
    ],
    cruel: [
      L("No. Coward. I'll make the next part colder.", "strict", "smirk"),
      L("You refused. Cute. Suffer without the treat.", "amused", "tease"),
      L("No. Then stare at nothing special and obey harder.", "strict", "point"),
      L("Refused. Noted for later cruelty.", "strict", "smirk"),
    ],
    calm: [
      L("No. Continue without media change.", "neutral", "point"),
      L("Declined. Next block as planned.", "strict", "smirk"),
      L("No recorded. Proceed.", "neutral", "count"),
      L("Wager no. Resume.", "strict", "point"),
    ],
    chaotic: [
      L("No?! Boring! Hehe I'll invent something else. 🔥", "amused", "tease"),
      L("Refused the fun. Chaos still continues. 😈", "intense", "smirk"),
      L("No. Fine. Unexpected pain instead maybe.", "amused", "point"),
      L("Denied the feed. Keep dancing anyway.", "tease", "tease"),
    ],
    horny: [
      L("No? Holding back while hard? Cute denial. 🥵", "tease", "smirk"),
      L("You said no. Ache without the eye candy then.", "intense", "tease"),
      L("Refused. Still stroke. Still mine.", "tease", "point"),
      L("No feed. Keep that cock honest anyway.", "intense", "smirk"),
    ],
    bored: [
      L("No. Predictable. Moving on.", "strict", "smirk"),
      L("Declined. Whatever. Next.", "neutral", "point"),
      L("No. Don't make me yawn.", "tease", "smirk"),
      L("Fine. No treat. Obey.", "strict", "point"),
    ],
  },

  prompt_answer_mute: {
    sweet: [
      L("Silent? That counts as naughty, bunny.", "tease", "smirk"),
      L("Won't answer… I'll assume guilt. Soft penalty mood.", "soft", "tease"),
      L("Mute button. Cute. Still mine.", "tease", "point"),
      L("No words? Okay. I heard the refusal.", "soft", "smirk"),
    ],
    cruel: [
      L("Mute. Pathetic. Mood drops.", "strict", "smirk"),
      L("Won't answer me? Disrespect. Noted.", "strict", "tease"),
      L("Silence is an answer — the wrong one.", "amused", "point"),
      L("Muted. I'll get meaner.", "strict", "smirk"),
    ],
    calm: [
      L("No answer. Recorded. Continuing.", "neutral", "point"),
      L("Mute. Slight mark against you. Next.", "strict", "smirk"),
      L("Declined to speak. Proceed.", "neutral", "count"),
      L("Silent. Resume session.", "strict", "point"),
    ],
    chaotic: [
      L("Mute?! Hehe I'll fill the silence with chaos. 🔥", "amused", "tease"),
      L("No answer. Glitch mood unlocked. 😈", "intense", "smirk"),
      L("Silent treatment. Wrong game. Keep up.", "amused", "point"),
      L("Mute button. I invent consequences.", "tease", "tease"),
    ],
    horny: [
      L("Won't say it? Still throbbing though… cute. 🥵", "tease", "smirk"),
      L("Mute while needy. I'll remember.", "intense", "tease"),
      L("Silent. Speak with your cock then — obey.", "tease", "point"),
      L("No answer. Heat stays. Mood sours a bit.", "intense", "smirk"),
    ],
    bored: [
      L("Mute. Boring. Mood down.", "strict", "smirk"),
      L("Won't answer. Whatever. Minus for you.", "neutral", "point"),
      L("Silent. Try harder next time.", "tease", "smirk"),
      L("No words. Noted. Continue.", "strict", "point"),
    ],
  },

  prompt_answer_good: {
    sweet: [
      L("Good? Proud of you. Stay sweet for me. 😈", "soft", "smirk"),
      L("Holding up. Soft praise. Keep earning it.", "tease", "tease"),
      L("Alright then. Good boy energy. Continue.", "soft", "point"),
      L("Glad you're okay. Still mine though.", "tease", "smirk"),
    ],
    cruel: [
      L("Good? Then you can take more. Don't relax.", "strict", "smirk"),
      L("Fine. Strength means harder toys next.", "amused", "tease"),
      L("Good. Prove it with obedience.", "strict", "point"),
      L("You're fine. So no mercy.", "strict", "smirk"),
    ],
    calm: [
      L("Status good. Continuing.", "neutral", "point"),
      L("Noted. Resume the plan.", "strict", "smirk"),
      L("Good. Next block.", "neutral", "count"),
      L("Holding. Proceed.", "strict", "point"),
    ],
    chaotic: [
      L("Good?! Then chaos can go louder. Hehe. 🔥", "amused", "tease"),
      L("Fine shape. Perfect for surprises. 😈", "intense", "smirk"),
      L("You're okay. So I won't hold back.", "amused", "point"),
      L("Good status. Remix unlocked.", "tease", "tease"),
    ],
    horny: [
      L("Good… then keep that cock honest for me. 🥵", "intense", "tease"),
      L("Holding up hot. Stay that way.", "tease", "smirk"),
      L("Fine. Don't waste the heat.", "intense", "point"),
      L("Good boy pulse. Continue.", "tease", "tease"),
    ],
    bored: [
      L("Good. Fine. Don't get cocky.", "strict", "smirk"),
      L("Okay. Moving on.", "neutral", "point"),
      L("Good. Whatever. Next.", "tease", "smirk"),
      L("Noted. Continue.", "strict", "point"),
    ],
  },

  prompt_answer_bad: {
    sweet: [
      L("Poor thing… still no free orgasm. Soft cruelty. 😈", "soft", "smirk"),
      L("Hurting? Good. Stay with me anyway.", "tease", "tease"),
      L("Bad? I'll be a little gentler — not much.", "soft", "point"),
      L("Shaking already. Cute. Continue, mine.", "tease", "smirk"),
    ],
    cruel: [
      L("Bad? Perfect. Suffer prettier.", "strict", "smirk"),
      L("Hurting. That was the point.", "amused", "tease"),
      L("Weak. Keep going anyway.", "strict", "point"),
      L("Bad status. No rescue.", "strict", "smirk"),
    ],
    calm: [
      L("Status poor. Continue carefully.", "neutral", "point"),
      L("Noted. Plan unchanged.", "strict", "smirk"),
      L("Struggling. Next block still applies.", "neutral", "count"),
      L("Bad. Proceed.", "strict", "point"),
    ],
    chaotic: [
      L("Bad?! Hehe delicious. More chaos then. 🔥", "amused", "tease"),
      L("Melting. Perfect glitch fuel. 😈", "intense", "smirk"),
      L("Hurting. I might get weirder.", "amused", "point"),
      L("Bad vibes. Keep dancing.", "tease", "tease"),
    ],
    horny: [
      L("Hurting and hard… fuck, that's hot. 🥵", "intense", "tease"),
      L("Bad? Stay dripping for me.", "tease", "smirk"),
      L("Weak legs. Strong cock. Continue.", "intense", "point"),
      L("Suffer pretty. I like that answer.", "tease", "tease"),
    ],
    bored: [
      L("Bad. Dramatic. Keep going.", "strict", "smirk"),
      L("Hurting. Whatever. Next.", "neutral", "point"),
      L("Poor thing. Still obey.", "tease", "smirk"),
      L("Bad status. Continue.", "strict", "point"),
    ],
  },

  prompt_media_fail: {
    sweet: [
      L("Aww, the feed failed. Still mine — no pictures, just my voice. 😈", "tease", "smirk"),
      L("Couldn't load your treat. Soft mockery. Continue.", "soft", "tease"),
      L("Booru said no. I'll tease without it.", "tease", "point"),
      L("Media miss. Eyes on me instead, bunny.", "soft", "smirk"),
    ],
    cruel: [
      L("Feed failed. You get nothing. Obey anyway.", "strict", "smirk"),
      L("No pictures. Suffer blind. Pathetic.", "amused", "tease"),
      L("Booru denied you. I don't care. Continue.", "strict", "point"),
      L("Failed load. No eye candy. Work that cock.", "strict", "smirk"),
    ],
    calm: [
      L("Media fetch failed. Continuing without overlay.", "neutral", "point"),
      L("No gelbooru results. Resume plan.", "strict", "smirk"),
      L("Feed unavailable. Next block.", "neutral", "count"),
      L("Load error. Proceed.", "strict", "point"),
    ],
    chaotic: [
      L("Feed went brrr-wrong! Hehe imagination mode. 🔥", "amused", "tease"),
      L("Booru glitch. Chaos continues without pics. 😈", "intense", "smirk"),
      L("No images. Make them up. Keep stroking.", "amused", "point"),
      L("Media fail. Bit still runs.", "tease", "tease"),
    ],
    horny: [
      L("Fuck, no pics… then ache to my voice only. 🥵", "intense", "tease"),
      L("Feed failed. Stay dripping without the eye candy.", "tease", "smirk"),
      L("Couldn't load filth. Listen harder.", "intense", "point"),
      L("No screen treat. Cock still follows me.", "tease", "tease"),
    ],
    bored: [
      L("Feed failed. Typical. Continue.", "strict", "smirk"),
      L("No media. Whatever. Next.", "neutral", "point"),
      L("Load miss. Don't make me wait.", "tease", "smirk"),
      L("Booru fail. Obey anyway.", "strict", "point"),
    ],
  },
};

const pack = {
  defaultMood: "sweet",
  moods: {
    sweet: { labelRu: "Добрая", emotionBias: "soft" },
    cruel: { labelRu: "Злая", emotionBias: "strict" },
    calm: { labelRu: "Спокойная", emotionBias: "neutral" },
    chaotic: { labelRu: "Хаотичная", emotionBias: "amused" },
    horny: { labelRu: "Возбуждённая", emotionBias: "intense" },
    bored: { labelRu: "Скучающая", emotionBias: "tease" },
  },
  lines,
};

const out = join(__dirname, "..", "data", "character", "hu-tao-mood-lines.json");
writeFileSync(out, `${JSON.stringify(pack, null, 2)}\n`, "utf8");

const keys = Object.keys(lines);
const moods = Object.keys(pack.moods);
let total = 0;
for (const k of keys) {
  for (const m of moods) {
    const n = lines[k][m]?.length ?? 0;
    if (n < 3) console.warn(`thin: ${k}/${m} = ${n}`);
    total += n;
  }
}
console.log(`Wrote ${out}`);
console.log(`keys=${keys.length} moods=${moods.length} phrases=${total}`);
