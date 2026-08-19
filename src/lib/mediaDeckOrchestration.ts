/**
 * Pure media-deck helpers — App keeps React refs/state; these own resume/key math.
 */

export type MainDeckResumeCursor = {
  index: number;
  itemId: string | null;
};

export function isMainMediaDeckKey(key: string): boolean {
  return key.startsWith("main");
}

export function resolveMainResumeIndex(
  playlist: ReadonlyArray<{ id: string }>,
  saved: MainDeckResumeCursor,
): number {
  if (saved.itemId) {
    const byId = playlist.findIndex((item) => item.id === saved.itemId);
    if (byId >= 0) return byId;
  }
  if (playlist.length <= 0) return 0;
  return Math.min(Math.max(0, saved.index), playlist.length - 1);
}

export function nextMainMediaDeckKey(
  epoch: number,
  resumeAt: number,
): string {
  return `main:${epoch}:${resumeAt}`;
}

export function questMediaDeckKey(offerId: string): string {
  return `quest:${offerId}`;
}

export function questResumeDeckKey(firstItemId: string | null | undefined): string {
  return `quest:resume:${firstItemId ?? Date.now()}`;
}

export function cumplayMediaDeckKey(stamp: number = Date.now()): string {
  return `cumplay:${stamp}`;
}

export function cumplayResumeDeckKey(stamp: number = Date.now()): string {
  return `cumplay:resume:${stamp}`;
}

/** Whether the main gelbooru deck should fetch more slides. */
export function shouldTopUpMainMediaDeck(info: {
  deckLength: number;
  unviewedRemaining: number;
  unviewedRatio: number;
  cycled?: boolean;
}): boolean {
  if (info.deckLength < 4) return false;
  return (
    info.cycled === true ||
    info.unviewedRemaining <= 5 ||
    info.unviewedRatio < 0.25
  );
}
