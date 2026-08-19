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
  | { type: "toast"; textRu: string };

export type EmberBridgeHandler = (event: EmberBridgeEvent) => void;

export type EmberGameApi = {
  pause: () => void;
  resume: () => void;
  applyLoot: (itemId: string) => void;
  destroy: () => void;
};
