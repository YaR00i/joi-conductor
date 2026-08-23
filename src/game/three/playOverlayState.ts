/**
 * Play overlay freeze / Esc routing as pure flags.
 *
 * Shop is often opened after a talk script: `openDialogue` sets `pausedLogic`.
 * Closing the shop must clear that leftover or WASD/camera/F stay dead even
 * though `shopOpen` is already false.
 */

export type PlayOverlayFlags = {
  pausedLogic: boolean;
  shopOpen: boolean;
  inventoryOpen: boolean;
  dialogueOpen: boolean;
  awaitingLoot: boolean;
  finished: boolean;
  fadeBusy: boolean;
};

export type PlayEscOverlayAction =
  | "close_shop"
  | "close_inventory"
  | "ignore"
  | "pause";

export function playMovementFrozen(flags: PlayOverlayFlags): boolean {
  return (
    flags.pausedLogic ||
    flags.awaitingLoot ||
    flags.shopOpen ||
    flags.inventoryOpen ||
    flags.dialogueOpen ||
    flags.finished ||
    flags.fadeBusy
  );
}

export function playLookBlocked(flags: PlayOverlayFlags): boolean {
  return (
    flags.pausedLogic ||
    flags.finished ||
    flags.awaitingLoot ||
    flags.shopOpen ||
    flags.inventoryOpen ||
    flags.dialogueOpen
  );
}

/** Esc: shop, then inventory, then ignore dialogue, then pause. */
export function playEscOverlayAction(
  flags: Pick<
    PlayOverlayFlags,
    "shopOpen" | "inventoryOpen" | "dialogueOpen"
  >,
): PlayEscOverlayAction {
  if (flags.shopOpen) return "close_shop";
  if (flags.inventoryOpen) return "close_inventory";
  if (flags.dialogueOpen) return "ignore";
  return "pause";
}

export function closeShopOverlayFlags(
  flags: PlayOverlayFlags,
): PlayOverlayFlags {
  return {
    ...flags,
    shopOpen: false,
    pausedLogic:
      flags.dialogueOpen || flags.awaitingLoot || flags.finished
        ? flags.pausedLogic
        : false,
  };
}

export function closeInventoryOverlayFlags(
  flags: PlayOverlayFlags,
): PlayOverlayFlags {
  return {
    ...flags,
    inventoryOpen: false,
    pausedLogic:
      flags.dialogueOpen || flags.awaitingLoot || flags.finished || flags.shopOpen
        ? flags.pausedLogic
        : false,
  };
}

export function restorePlayOverlayFocus(canvas: HTMLElement | null): void {
  const active = document.activeElement;
  if (
    active instanceof HTMLElement &&
    active !== canvas &&
    active !== document.body
  ) {
    active.blur();
  }
  canvas?.focus({ preventScroll: true });
}
