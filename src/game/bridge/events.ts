import type { EmberDialogueUse } from "../content/types";
import type {
  EmberExploreAutosaveReason,
  EmberExploreSaveState,
} from "../content/emberSave";
import type {
  EmberEquipment,
  EmberEquipSlot,
  InventoryItemView,
} from "../content/emberEquipment";

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
  | { type: "pause_menu"; relockWaitMs: number }
  | {
      type: "shop";
      shopId: string;
      nameRu: string;
      wallet: number;
      listings: Array<{
        itemId: string;
        nameRu: string;
        buyPrice: number;
        sellPrice: number;
        stock: number | null;
      }>;
      sellable: Array<{
        itemId: string;
        nameRu: string;
        count: number;
        sellPrice: number;
      }>;
      errorRu: string | null;
    }
  | { type: "shop_close" }
  | {
      type: "inventory";
      items: InventoryItemView[];
      equipment: EmberEquipment;
      atk: number;
      def: number;
      arenaAtk: number;
      errorRu: string | null;
    }
  | { type: "inventory_close" }
  | {
      type: "dialogue";
      sceneId: string;
      use: EmberDialogueUse;
    }
  | { type: "explore_autosave"; reason: EmberExploreAutosaveReason };

export type EmberBridgeHandler = (event: EmberBridgeEvent) => void;

export type EmberGameApi = {
  ready: Promise<void>;
  /** Request pointer lock from a user gesture (Start click). */
  lockLook: () => void;
  pause: () => void;
  resume: () => void;
  applyLoot: (itemId: string) => void;
  buyShopItem: (itemId: string) => void;
  sellShopItem: (itemId: string) => void;
  closeShop: () => void;
  toggleInventory: () => void;
  closeInventory: () => void;
  equipItem: (itemId: string) => void;
  unequipSlot: (slot: EmberEquipSlot) => void;
  useItem: (itemId: string) => void;
  /** Resume an action list after the play dialogue overlay closes. */
  advanceDialogue: () => void;
  captureExploreSave: () => EmberExploreSaveState | null;
  applyExploreSave: (save: EmberExploreSaveState) => boolean;
  destroy: () => void;
};
