import { describe, expect, it } from "vitest";
import {
  closeInventoryOverlayFlags,
  closeShopOverlayFlags,
  playEscOverlayAction,
  playLookBlocked,
  playMovementFrozen,
  type PlayOverlayFlags,
} from "./playOverlayState";

const idle: PlayOverlayFlags = {
  pausedLogic: false,
  shopOpen: false,
  inventoryOpen: false,
  dialogueOpen: false,
  awaitingLoot: false,
  finished: false,
  fadeBusy: false,
};

describe("play overlay freeze", () => {
  it("routes Esc shop → inventory → dialogue ignore → pause", () => {
    expect(playEscOverlayAction(idle)).toBe("pause");
    expect(playEscOverlayAction({ ...idle, shopOpen: true })).toBe("close_shop");
    expect(
      playEscOverlayAction({ ...idle, shopOpen: true, inventoryOpen: true }),
    ).toBe("close_shop");
    expect(playEscOverlayAction({ ...idle, inventoryOpen: true })).toBe(
      "close_inventory",
    );
    expect(playEscOverlayAction({ ...idle, dialogueOpen: true })).toBe("ignore");
  });

  it("resumes walk/look after closing a shop that opened from dialogue", () => {
    const talking: PlayOverlayFlags = {
      ...idle,
      dialogueOpen: true,
      pausedLogic: true,
    };
    expect(playMovementFrozen(talking)).toBe(true);
    expect(playLookBlocked(talking)).toBe(true);

    const shopFromTalk: PlayOverlayFlags = {
      ...talking,
      dialogueOpen: false,
      shopOpen: true,
    };
    expect(playMovementFrozen(shopFromTalk)).toBe(true);

    const closed = closeShopOverlayFlags(shopFromTalk);
    expect(closed.shopOpen).toBe(false);
    expect(closed.pausedLogic).toBe(false);
    expect(playMovementFrozen(closed)).toBe(false);
    expect(playLookBlocked(closed)).toBe(false);
  });

  it("does not unpause if loot or a still-open dialogue owns the freeze", () => {
    expect(
      closeShopOverlayFlags({
        ...idle,
        shopOpen: true,
        awaitingLoot: true,
        pausedLogic: true,
      }).pausedLogic,
    ).toBe(true);
    expect(
      closeShopOverlayFlags({
        ...idle,
        shopOpen: true,
        dialogueOpen: true,
        pausedLogic: true,
      }).pausedLogic,
    ).toBe(true);
  });

  it("clears leftover pause when closing inventory after a leaked pausedLogic", () => {
    const closed = closeInventoryOverlayFlags({
      ...idle,
      inventoryOpen: true,
      pausedLogic: true,
    });
    expect(closed.inventoryOpen).toBe(false);
    expect(closed.pausedLogic).toBe(false);
    expect(playMovementFrozen(closed)).toBe(false);
  });

  it("keeps movement frozen during map fade even with overlays closed", () => {
    expect(playMovementFrozen({ ...idle, fadeBusy: true })).toBe(true);
  });
});
