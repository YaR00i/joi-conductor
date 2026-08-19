import type { AvatarAdapter, Emotion, SessionEvent } from "../types";

export interface AvatarSnapshot {
  emotion: Emotion;
  gesture: string | null;
  lastSpeech: string | null;
  updatedAt: number;
}

const INITIAL: AvatarSnapshot = {
  emotion: "neutral",
  gesture: null,
  lastSpeech: null,
  updatedAt: 0,
};

/**
 * Phase 1/2 stub: tracks speech emotion/gesture for HUD.
 * Phase 3: replace with ThreeAvatar — same AvatarAdapter contract.
 */
export class DebugAvatar implements AvatarAdapter {
  private snap: AvatarSnapshot = { ...INITIAL };
  private listeners = new Set<(s: AvatarSnapshot) => void>();

  onEvent(event: SessionEvent): void {
    if (event.type === "speech") {
      this.snap = {
        emotion: event.emotion,
        gesture: event.gesture ?? null,
        lastSpeech: event.text,
        updatedAt: Date.now(),
      };
      this.notify();
      return;
    }
    if (event.type === "session_end" || event.type === "session_start") {
      this.snap = {
        ...INITIAL,
        emotion: event.type === "session_start" ? "tease" : "neutral",
        updatedAt: Date.now(),
      };
      this.notify();
    }
  }

  getSnapshot(): AvatarSnapshot {
    return this.snap;
  }

  subscribe(listener: (s: AvatarSnapshot) => void): () => void {
    this.listeners.add(listener);
    listener(this.snap);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const l of this.listeners) l(this.snap);
  }
}
