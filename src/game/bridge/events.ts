export type EmberLootOption = {
  id: string;
  itemId: string;
  labelRu: string;
  rarity: string;
  weight: number;
  color?: string;
};

export type EmberBridgeEvent =
  | {
      type: "hud";
      hp: number;
      maxHp: number;
      level: number;
      xp: number;
      xpToLevel: number;
      elapsedSec: number;
      durationSec: number;
      stripTier: number;
      filthMs: number;
      killed: number;
      paused: boolean;
    }
  | {
      type: "level_up";
      options: EmberLootOption[];
      targetId: string;
    }
  | {
      type: "chest";
      options: EmberLootOption[];
      targetId: string;
    }
  | {
      type: "stage_result";
      outcome: "clear" | "fail";
      cinders: number;
      elapsedSec: number;
      killed: number;
      level: number;
      onClearEventId?: string;
      onFailEventId?: string;
    }
  | {
      type: "pending_event";
      eventId: string;
    }
  | { type: "toast"; textRu: string }
  | { type: "load_progress"; ratio: number; labelRu: string }
  | { type: "pause_menu"; relockWaitMs: number };

export type EmberBridgeHandler = (event: EmberBridgeEvent) => void;

export type EmberGameApi = {
  ready: Promise<void>;
  /** Request pointer lock from a user gesture (Start click). */
  lockLook: () => void;
  pause: () => void;
  resume: () => void;
  applyLoot: (itemId: string) => void;
  destroy: () => void;
};
