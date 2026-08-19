import type { AvatarAdapter, SessionEvent } from "../types";

/**
 * Phase 3 placeholder — VRM / R3F will implement AvatarAdapter here.
 * Keep the class so UI can swap adapters without touching runtime.
 */
export class ThreeAvatarStub implements AvatarAdapter {
  onEvent(_event: SessionEvent): void {
    // no-op until Phase 3
  }
}
