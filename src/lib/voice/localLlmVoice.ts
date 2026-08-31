import type { CharacterBible } from "../character";
import type { SessionEvent, VoiceLayer } from "../types";
import { extractChatContent, parseLlmContent } from "./parseLlmContent";

/** Build the chat user turn for LocalLlmVoice (exported for tests). */
export function buildLlmUserMessage(
  bible: CharacterBible,
  event: SessionEvent,
): string {
  const nicknames =
    (bible.diminutives ?? []).join(", ") || "silly, mine";
  const emojiRule = bible.emojiAllowed
    ? "Emoji ok: at most 1–2, only if they fit this mistress."
    : "No emoji.";
  const guide =
    bible.llmVoiceGuide?.trim() ||
    "Stay sharply in-character; avoid generic trainer-checklist JOI.";
  return [
    `You are speaking as ${bible.nameRu} (${bible.id}).`,
    `Session event:\n${buildUserPayload(event)}`,
    `Tone: ${bible.tone.join("; ")}.`,
    `Taboos: ${bible.taboo.join("; ")}.`,
    `Nicknames (use 0–1 naturally): ${nicknames}.`,
    `Voice guide: ${guide}`,
    emojiRule,
    "Write ONE living spoken line for THIS event — not a checklist, not dry UI copy.",
    "Stay distinct from other mistresses; do not borrow their nicknames or metaphors.",
    "English only. 1–2 short sentences. Prefer emotion tease|amused|intense|strict|soft (avoid neutral).",
    'Reply with ONLY one JSON object: {"text":"...","emotion":"tease","gesture":"smirk"}',
  ].join("\n");
}

export type VoiceActivity = {
  phase: "idle" | "thinking" | "llm" | "fallback" | "error";
  detail?: string;
};

export interface LocalLlmVoiceOptions {
  /** OpenAI-compat chat completions URL (proxied or absolute) */
  endpoint: string;
  model: string;
  bible: CharacterBible;
  fallback: VoiceLayer;
  /** Emit speech asynchronously (bus) */
  emit: (event: SessionEvent) => void;
  /** UI: thinking / llm / fallback */
  onActivity?: (activity: VoiceActivity) => void;
  timeoutMs?: number;
  enabled?: boolean;
}

function isNarratable(event: SessionEvent): boolean {
  switch (event.type) {
    case "session_start":
    case "block_start":
    case "edge_request":
    case "ruin_request":
    case "finale_edge_go":
    case "finale_roll":
    case "finish":
    case "cumplay":
      return true;
    default:
      return false;
  }
}

/** Always use mood templates (even when LLM is on). */
function isTemplateAlways(event: SessionEvent): boolean {
  switch (event.type) {
    case "session_pause":
    case "session_resume":
    case "session_end":
    case "edge_done":
    case "ruin_done":
    case "unauthorized":
    case "mood_shift":
    case "user_skip":
    case "user_force_finale":
    case "user_like":
    case "user_ready":
    case "mistress_prompt":
    case "mistress_answer":
    case "mistress_bribe":
    case "mistress_media_fail":
    case "mistress_dare_start":
    case "mistress_cage_hijack":
    case "mistress_promise_ask":
    case "mistress_equip":
    case "mistress_cumplay_step":
    case "mistress_cumplay_done":
    case "hold_request":
    case "hold_done":
    case "countdown_tick":
    case "finale_edge_go":
    case "dice_chaos":
    case "mistress_edges_tax":
    case "quest_completed":
    case "quest_failed":
      return true;
    default:
      return false;
  }
}

function buildUserPayload(event: SessionEvent): string {
  switch (event.type) {
    case "session_start":
      return JSON.stringify({
        kind: "session_start",
        mode: event.params.mode,
        edgesTarget: event.params.edgesTarget,
        ruinsTarget: event.params.ruinsTarget,
      });
    case "block_start":
      return JSON.stringify({
        kind: "block_start",
        goal: event.block.goal,
        function: event.function.nameRu,
        pattern: event.pattern.nameRu,
        bpm: event.block.bpm,
        durationSec: event.block.durationSec,
        index: event.index,
        total: event.total,
        cues: event.function.cuesRu.slice(0, 2),
      });
    case "edge_request":
    case "ruin_request":
      return JSON.stringify({ kind: event.type, blockId: event.blockId });
    case "finale_edge_go":
      return JSON.stringify({
        kind: "finale_edge_go",
        instruction:
          "They pressed ГОТОВ КОНЧИТЬ. Tell them: ten seconds to the edge, then the wheel decides how they finish. Do NOT say cum/ruin/deny yet.",
      });
    case "unauthorized":
      return JSON.stringify({
        kind: "unauthorized",
        offense: event.kind,
        punishment: event.punishmentRu,
      });
    case "finale_roll":
      return JSON.stringify({
        kind: "finale_roll",
        outcome: event.outcome,
        instruction:
          "Reveal ONLY this outcome. If deny — hands off, no orgasm. If cum — allow climax. If ruin — ruined orgasm only.",
      });
    case "finish":
      return JSON.stringify({ kind: "finish", finishId: event.finishId });
    case "cumplay":
      return JSON.stringify({ kind: "cumplay", cumplayId: event.cumplayId });
    default:
      return JSON.stringify({ kind: event.type });
  }
}

function scrubSpeechText(text: string, diminutives: string[]): string {
  const pick =
    diminutives[Math.floor(Math.random() * Math.max(1, diminutives.length))] ??
    "silly";
  return text
    // Drop accidental Cyrillic (LLM bleed) — SoVITS speaks English
    .replace(/[\u0400-\u04FF][\u0400-\u04FF'’-]*/g, pick)
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Phase 2 VoiceLayer: Ollama / OpenAI-compat.
 * Returns [] immediately and emits speech via `emit` when ready;
 * on timeout/error emits TemplateVoice fallback lines.
 */
export class LocalLlmVoice implements VoiceLayer {
  private opts: LocalLlmVoiceOptions;
  private generation = 0;
  private abort: AbortController | null = null;

  constructor(opts: LocalLlmVoiceOptions) {
    this.opts = opts;
  }

  setEnabled(enabled: boolean): void {
    this.opts = { ...this.opts, enabled };
    if (!enabled) this.invalidate();
  }

  configure(
    partial: Partial<
      Pick<
        LocalLlmVoiceOptions,
        "endpoint" | "model" | "timeoutMs" | "enabled" | "onActivity" | "bible"
      >
    >,
  ): void {
    this.opts = { ...this.opts, ...partial };
  }

  isEnabled(): boolean {
    return Boolean(this.opts.enabled);
  }

  onEvent(event: SessionEvent): SessionEvent[] {
    if (event.type === "block_end") {
      this.invalidate();
      this.opts.onActivity?.({ phase: "idle" });
      return [];
    }

    if (event.type === "session_pause" || event.type === "session_end") {
      this.invalidate();
      this.opts.onActivity?.({ phase: "idle" });
      return this.opts.fallback.onEvent(event);
    }

    // Finale block_start is silent — speech on finale_edge_go / finale_roll.
    if (event.type === "block_start" && event.block.goal === "finale") {
      return [];
    }

    if (isTemplateAlways(event)) {
      return this.opts.fallback.onEvent(event);
    }

    if (!isNarratable(event)) {
      // Still allow template reactions for any event TemplateVoice knows
      if (!this.opts.enabled) {
        return this.opts.fallback.onEvent(event);
      }
      return [];
    }

    if (!this.opts.enabled) {
      return this.opts.fallback.onEvent(event);
    }

    const fallback = this.opts.fallback.onEvent(event);
    const gen = ++this.generation;
    this.abort?.abort();
    this.abort = new AbortController();
    this.opts.onActivity?.({
      phase: "thinking",
      detail: event.type,
    });
    void this.run(event, gen, fallback, this.abort.signal);
    return [];
  }

  private invalidate(): void {
    this.generation += 1;
    this.abort?.abort();
    this.abort = null;
  }

  private async run(
    event: SessionEvent,
    gen: number,
    fallback: SessionEvent[],
    signal: AbortSignal,
  ): Promise<void> {
    const timeoutMs = this.opts.timeoutMs ?? 12000;
    let raceTimer: number | undefined;
    try {
      const speech = await Promise.race([
        this.fetchSpeech(event, signal),
        new Promise<"timeout">((resolve) => {
          raceTimer = window.setTimeout(() => resolve("timeout"), timeoutMs);
        }),
      ]);

      if (gen !== this.generation || signal.aborted) return;

      if (speech && speech !== "timeout") {
        this.opts.onActivity?.({ phase: "llm" });
        this.opts.emit(speech);
        return;
      }

      this.opts.onActivity?.({
        phase: "fallback",
        detail: speech === "timeout" ? `таймаут ${timeoutMs}мс` : "пустой ответ",
      });
      for (const e of fallback) this.opts.emit(e);
    } catch (err) {
      if (gen !== this.generation || signal.aborted) return;
      this.opts.onActivity?.({
        phase: "error",
        detail: err instanceof Error ? err.message : "ошибка LLM",
      });
      for (const e of fallback) this.opts.emit(e);
    } finally {
      // The losing timeout timer must not keep the event closure alive.
      window.clearTimeout(raceTimer);
    }
  }

  private async fetchSpeech(
    event: SessionEvent,
    signal: AbortSignal,
  ): Promise<SessionEvent | null> {
    const { endpoint, model, bible } = this.opts;
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal,
      body: JSON.stringify({
        model,
        temperature: 1.05,
        top_p: 0.92,
        max_tokens: 160,
        messages: [
          { role: "system", content: bible.systemPrompt },
          {
            role: "user",
            content: buildLlmUserMessage(bible, event),
          },
        ],
      }),
    });

    if (!res.ok) {
      throw new Error(`LLM HTTP ${res.status}`);
    }

    const data: unknown = await res.json();
    const content = extractChatContent(data);
    if (!content) return null;
    const parsed = parseLlmContent(content);
    if (!parsed) return null;
    const emotion =
      parsed.emotion === "neutral" ? "tease" : parsed.emotion;
    const text = scrubSpeechText(parsed.text, bible.diminutives ?? []);
    if (!text) return null;
    return {
      type: "speech",
      text,
      emotion,
      gesture: parsed.gesture ?? "smirk",
      durationMs: Math.min(7000, 2800 + text.length * 55),
      source: "llm",
    };
  }
}
