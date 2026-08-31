import { getCumplay, getFinish } from "../catalog";
import {
  formatFallbackLine,
  huTaoBible,
  pickFallbackLine,
  type CharacterBible,
} from "../character";
import { answerPhraseKey } from "../mistressPrompts";
import type { Emotion, SessionEvent, SessionMood, VoiceLayer } from "../types";
import {
  getActiveMoodLines,
  pickMoodLine,
  type MistressMood,
  type MoodPhraseKey,
} from "./moodLines";

function speech(
  text: string,
  emotion: Emotion,
  gesture: string,
  durationMs = 3200,
): SessionEvent {
  return {
    type: "speech",
    text,
    emotion,
    gesture,
    durationMs,
    source: "template",
  };
}

function say(
  key: MoodPhraseKey,
  mood: MistressMood,
  bible: CharacterBible,
  legacyKey: string | null,
  legacyFallback: string,
  gestureFallback = "smirk",
  durationMs = 3200,
): SessionEvent {
  const picked = pickMoodLine(getActiveMoodLines(), key, mood);
  if (picked) {
    return speech(
      picked.text,
      picked.emotion,
      picked.gesture ?? gestureFallback,
      durationMs,
    );
  }
  const legacy =
    legacyKey != null
      ? (pickFallbackLine(bible, legacyKey) ?? legacyFallback)
      : legacyFallback;
  return speech(legacy, "tease", gestureFallback, durationMs);
}

export type TemplateVoiceOptions = {
  bible?: CharacterBible;
  getMood?: () => SessionMood;
};

/** Mood-library templates. Swap for LocalLlmVoice — same interface. */
export class TemplateVoice implements VoiceLayer {
  private bible: CharacterBible;
  private getMood: () => SessionMood;

  constructor(opts: TemplateVoiceOptions | CharacterBible = {}) {
    if (typeof opts === "object" && opts !== null && "fallbackLines" in opts) {
      this.bible = opts as CharacterBible;
      this.getMood = () => getActiveMoodLines().defaultMood;
      return;
    }
    const o = opts as TemplateVoiceOptions;
    this.bible = o.bible ?? huTaoBible;
    this.getMood = o.getMood ?? (() => getActiveMoodLines().defaultMood);
  }

  setMoodGetter(getMood: () => SessionMood): void {
    this.getMood = getMood;
  }

  setBible(bible: CharacterBible): void {
    this.bible = bible;
  }

  onEvent(event: SessionEvent): SessionEvent[] {
    const b = this.bible;
    const mood = this.getMood();

    switch (event.type) {
      case "session_start": {
        const mode = event.params.mode;
        if (mode === "anal") {
          return [
            say(
              "session_start_anal",
              mood,
              b,
              "session_start_anal",
              "Anal. Push on the beat — hands off your cock.",
              "stop_hands",
            ),
          ];
        }
        if (mode === "chastity") {
          return [
            say(
              "session_start_chastity",
              mood,
              b,
              null,
              "Cage on. Watch the vibe meter — strength and time, not stroke beat.",
              "stop_hands",
              2800,
            ),
          ];
        }
        return [
          say(
            "session_start",
            mood,
            b,
            "session_start",
            "Let's go. Eyes on me — I own the beat.",
            "point",
          ),
        ];
      }
      case "block_start": {
        switch (event.block.goal) {
          case "edge":
          case "hold":
          case "breath":
            // Spoken via edge_request — avoid double line on the same beat
            return [];
          case "ruin_attempt":
            // Spoken via ruin_request
            return [];
          case "finale":
            return [];
          case "stroke":
            return [
              say(
                "stroke",
                mood,
                b,
                "stroke",
                "Stroke to my tempo. Don't race ahead.",
                event.function.avatarHint?.gesture ?? "point",
              ),
            ];
          case "ladder":
            return [
              say(
                "ladder",
                mood,
                b,
                null,
                "Ladder step — speed up with me. Don't tip over.",
                "point",
                2600,
              ),
            ];
          case "countdown":
            return [
              say(
                "countdown",
                mood,
                b,
                null,
                "Countdown stretch. Keep the pace — numbers are coming.",
                "count",
                2600,
              ),
            ];
          case "rest":
            return [
              say(
                "rest",
                mood,
                b,
                "rest",
                "Rest. Hands off until the timer ends.",
                "stop_hands",
                2500,
              ),
            ];
          default: {
            const _exhaustive: never = event.block.goal;
            return _exhaustive;
          }
        }
      }
      case "finale_edge_request":
        // Silent — speech waits for «ГОТОВ КОНЧИТЬ» / finale_roll.
        return [];
      case "finale_edge_go":
        return [
          say(
            "finale_edge",
            mood,
            b,
            "finale_edge",
            "Good. Ten seconds — get to the edge. The wheel decides how you finish.",
            "count",
            3600,
          ),
        ];
      case "edge_request":
        return [
          say(
            "edge_request",
            mood,
            b,
            "edge_request",
            "To the edge. Big Edge ✓ button above the beat.",
            "count",
          ),
        ];
      case "hold_request":
        return [
          say(
            "hold",
            mood,
            b,
            null,
            "To the edge — you have time. Press hold when ready, then endure the timer and confirm.",
            "stop_hands",
            3400,
          ),
        ];
      case "hold_done":
        return [
          say(
            "hold_done",
            mood,
            b,
            null,
            "Good hold. Soft. We continue.",
            "smirk",
            2200,
          ),
        ];
      case "breath_prep":
        return [
          event.n <= 2
            ? speech(`${event.n}…`, "intense", "count", 900)
            : say(
                "breath_prep",
                mood,
                b,
                null,
                `Fill your lungs. ${event.n} seconds.`,
                "count",
                2200,
              ),
        ];
      case "breath_hold_start":
        return [
          say(
            "breath_hold",
            mood,
            b,
            null,
            "Hold it. Follow the challenge and don't breathe yet.",
            "stop_hands",
            2600,
          ),
        ];
      case "breath_done":
        return [
          say(
            event.success ? "breath_done" : "breath_fail",
            mood,
            b,
            null,
            event.success
              ? "Good. Breathe now — you made it."
              : "Breathe. You ran out; hands off for the penalty.",
            event.success ? "smirk" : "stop_hands",
            2600,
          ),
        ];
      case "timer_tease":
        return [
          say(
            event.phase === "freeze"
              ? "timer_tease_freeze"
              : "timer_tease_extend",
            mood,
            b,
            null,
            event.phase === "freeze"
              ? "Pause. The timer belongs to me."
              : `And I added ${event.addSec ?? 0} more seconds.`,
            "smirk",
            2400,
          ),
        ];
      case "countdown_tick":
        return [
          speech(
            event.n <= 3 ? `${event.n}…` : `${event.n}.`,
            "intense",
            "count",
            900,
          ),
        ];
      case "dice_chaos": {
        const picked = pickMoodLine(getActiveMoodLines(), "dice_chaos", mood);
        return [
          speech(
            picked
              ? `${picked.text} ${event.speakEn}`
              : event.speakEn,
            picked?.emotion ?? "amused",
            picked?.gesture ?? "smirk",
            4200,
          ),
        ];
      }
      case "mistress_edges_tax":
        return [
          speech(
            event.speakEn,
            event.phase === "applied" ? "amused" : "tease",
            event.phase === "applied" ? "smirk" : "point",
            event.phase === "applied" ? 3600 : 3200,
          ),
        ];
      case "ruin_request":
        return [
          say(
            "ruin_request",
            mood,
            b,
            "ruin_request",
            "Ruin it now. Confirm Ruin ✓.",
            "smirk",
          ),
        ];
      case "unauthorized": {
        const key: MoodPhraseKey =
          event.kind === "edge"
            ? "unauthorized_edge"
            : event.kind === "ruin"
              ? "unauthorized_ruin"
              : "unauthorized_cum";
        return [
          say(
            key,
            mood,
            b,
            null,
            event.kind === "cum"
              ? "You came off-command. Look at you."
              : event.kind === "ruin"
                ? "You ruined without asking. Naughty."
                : "Edge without permission. Punishment time.",
            event.kind === "cum" ? "smirk" : "stop_hands",
            3200,
          ),
        ];
      }
      case "finale_roll": {
        switch (event.outcome) {
          case "cum":
            return [
              say(
                "finale_cum",
                mood,
                b,
                "finale_cum",
                "Roll: cum.",
                "smirk",
              ),
            ];
          case "ruin":
            return [
              say(
                "finale_ruin",
                mood,
                b,
                "finale_ruin",
                "Roll: ruin.",
                "smirk",
              ),
            ];
          case "deny":
            return [
              say(
                "finale_deny",
                mood,
                b,
                "finale_deny",
                "Roll: deny. Hands off.",
                "stop_hands",
              ),
            ];
          default:
            return [
              speech("Finale.", "tease", "smirk", 2200),
            ];
        }
      }
      case "finish": {
        const f = getFinish(event.finishId);
        const picked = pickMoodLine(getActiveMoodLines(), "finish", mood);
        if (picked) {
          return [
            speech(
              picked.text,
              picked.emotion,
              picked.gesture ?? "point",
            ),
          ];
        }
        return [
          speech(
            `Where: ${f?.nameRu ?? event.finishId}.`,
            "intense",
            "point",
          ),
        ];
      }
      case "cumplay": {
        const c = getCumplay(event.cumplayId);
        const picked = pickMoodLine(getActiveMoodLines(), "cumplay", mood);
        if (picked) {
          return [
            speech(
              picked.text,
              picked.emotion,
              picked.gesture ?? "tease",
            ),
          ];
        }
        return [
          speech(
            `Cumplay: ${c?.nameRu ?? event.cumplayId}.`,
            "tease",
            "tease",
          ),
        ];
      }
      case "session_pause":
        return [
          say(
            "session_pause",
            mood,
            b,
            null,
            "Paused. Hands off until we continue.",
            "stop_hands",
            2400,
          ),
        ];
      case "session_resume":
        return [
          say(
            "session_resume",
            mood,
            b,
            null,
            "We're back. Listen — I lead again.",
            "point",
            2400,
          ),
        ];
      case "session_end":
        if (event.silent) return [];
        return [
          say(
            event.reason === "abort"
              ? "session_end_abort"
              : "session_end_complete",
            mood,
            b,
            null,
            event.reason === "abort"
              ? "Aborted. Hands off. Soft exit."
              : "Session done. Good boy. Breathe.",
            "smirk",
            2800,
          ),
        ];
      case "edge_done":
        return [
          say(
            "edge_done",
            mood,
            b,
            null,
            "Edge counted. Stay with me.",
            "smirk",
            2200,
          ),
        ];
      case "ruin_done":
        return [
          say(
            "ruin_done",
            mood,
            b,
            null,
            "Ruin counted. Continue.",
            "smirk",
            2200,
          ),
        ];
      case "mood_shift":
        return [
          say(
            "mood_shift",
            event.mood,
            b,
            null,
            "Mood shift. Keep up.",
            "smirk",
            2600,
          ),
        ];
      case "user_skip":
        return [
          say(
            "skip",
            mood,
            b,
            null,
            "Skipping ahead. Still mine.",
            "point",
            2200,
          ),
        ];
      case "user_force_finale":
        return [
          say(
            "force_finale",
            mood,
            b,
            null,
            "Forcing finale. Edge path opens.",
            "smirk",
            2600,
          ),
        ];
      case "user_like":
        return [
          say(
            "like",
            mood,
            b,
            null,
            "Liked. Good taste — keep following me, don't get distracted.",
            "smirk",
            2200,
          ),
        ];
      case "user_ready":
        return [
          say(
            "ready",
            mood,
            b,
            null,
            "Ready. We begin — you're mine.",
            "point",
            2400,
          ),
        ];
      case "mistress_prompt":
        return [
          speech(event.prompt.speakEn, "tease", "smirk", 4200),
        ];
      case "mistress_answer":
        return [
          say(
            answerPhraseKey(event.effect),
            mood,
            b,
            null,
            "Noted. Continue.",
            "smirk",
            2600,
          ),
        ];
      case "mistress_bribe": {
        const bribe =
          pickFallbackLine(b, "bribe") ??
          `Fine. {cost} cinders buy you a pass. I'm not mad — this time.`;
        return [
          speech(
            formatFallbackLine(bribe, { cost: event.cost }),
            "amused",
            "smirk",
            3200,
          ),
        ];
      }
      case "mistress_media_fail":
        return [
          say(
            "prompt_media_fail",
            mood,
            b,
            null,
            "Feed failed. Continue without pictures.",
            "smirk",
            2800,
          ),
        ];
      case "mistress_dare_start": {
        const picked = pickMoodLine(getActiveMoodLines(), "dare_start", mood);
        return [
          speech(
            picked
              ? `${picked.text} ${event.instructionRu} — ${event.taskSec}s.`
              : `Go. ${event.instructionRu} — ${event.taskSec}s.`,
            picked?.emotion ?? "strict",
            picked?.gesture ?? "point",
            3600,
          ),
        ];
      }
      case "mistress_cage_hijack": {
        const picked = pickMoodLine(getActiveMoodLines(), "cage_hijack", mood);
        return [
          speech(
            picked
              ? `${picked.text} (${event.hours}h after.)`
              : `Good. Cage on. Chastity for the rest — then ${event.hours} hours after. Don't unlock early.`,
            picked?.emotion ?? "tease",
            picked?.gesture ?? "smirk",
            4500,
          ),
        ];
      }
      case "mistress_promise_ask": {
        const promise =
          pickFallbackLine(b, "promise_ask") ??
          "Eat it. Every drop — for me. Tell me when you're done.";
        return [speech(promise, "intense", "tease", 3800)];
      }
      case "mistress_equip": {
        const picked = pickMoodLine(getActiveMoodLines(), "equip_confirm", mood);
        return [
          speech(
            picked
              ? `${picked.text} (${event.nameRu})`
              : `Good. ${event.nameRu} stays on. Next moves use it — don't take it off.`,
            picked?.emotion ?? "tease",
            picked?.gesture ?? "smirk",
            4200,
          ),
        ];
      }
      case "mistress_cumplay_step":
        return [
          speech(event.speakEn, "intense", "tease", 4500),
        ];
      case "mistress_cumplay_done": {
        const key =
          event.outcome === "ruin" ? "cumplay_done_ruin" : "cumplay_done_cum";
        return [
          say(
            key,
            mood,
            b,
            null,
            event.outcome === "ruin"
              ? "Ruined and handled. Soft cock. Session can end when you press it."
              : "Cumplay done. Sticky obedience. You may end the session now.",
            "smirk",
            4000,
          ),
        ];
      }
      case "mistress_wager_media":
      case "block_end":
      case "block_skip":
      case "beat":
      case "vibe_level":
      case "counters":
      case "speech":
      case "quest_offer":
      case "quest_accepted":
      case "quest_declined":
      case "quest_started":
        return [];
      case "quest_completed": {
        const done =
          pickFallbackLine(b, "quest_completed") ??
          "Good spark. +{reward} cinders. Don't get cocky.";
        return [
          speech(
            formatFallbackLine(done, { reward: event.reward }),
            "amused",
            "smirk",
            2800,
          ),
        ];
      }
      case "quest_failed": {
        const fail =
          pickFallbackLine(b, "quest_failed") ??
          "Failed the dare. Hands off — rest. Try harder next spark.";
        return [speech(fail, "strict", "glare", 3200)];
      }
      case "cumplay_prefetch":
        return [];
      case "tide_hit":
      case "tide_hits":
        return [];
      case "tide_miss":
        return [
          speech(event.speakEn, "strict", "glare", 3600),
        ];
      case "tide_complete":
        return [
          speech(
            event.speakEn,
            event.allDone ? "amused" : "tease",
            event.allDone ? "smirk" : "point",
            3400,
          ),
        ];
      case "idol_hit":
      case "idol_hits":
        return [];
      case "idol_miss":
        return [speech(event.speakEn, "strict", "glare", 3600)];
      case "idol_complete":
        return [
          speech(
            event.speakEn,
            event.allDone ? "amused" : "tease",
            event.allDone ? "smirk" : "point",
            3400,
          ),
        ];
      case "idol_buzz":
        if (event.speakEn) {
          return [
            speech(
              event.speakEn,
              event.phase === "success" ? "amused" : "strict",
              event.phase === "success" ? "smirk" : "glare",
              3400,
            ),
          ];
        }
        return [];
      default: {
        const _exhaustive: never = event;
        return _exhaustive;
      }
    }
  }
}
