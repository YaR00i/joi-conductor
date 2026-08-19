import type { SessionEvent } from "./types";

type Listener = (event: SessionEvent) => void;

/** Simple pub/sub for Stage / Avatar / Voice / EventLog */
export class SessionEventBus {
  private listeners = new Set<Listener>();

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  emit(event: SessionEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}
