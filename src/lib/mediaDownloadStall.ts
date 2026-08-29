import type { MediaKind } from "./media";

/** No bytes for this long → abort. Healthy slow transfers keep going. */
export const MEDIA_IMAGE_STALL_MS = 20_000;
export const MEDIA_VIDEO_STALL_MS = 30_000;

export function mediaDownloadStallMs(kind?: MediaKind): number {
  return kind === "video" || kind === "gif"
    ? MEDIA_VIDEO_STALL_MS
    : MEDIA_IMAGE_STALL_MS;
}

type TimerId = ReturnType<typeof setTimeout>;

export function createStallTimer(opts: {
  stallMs: number;
  onStall: () => void;
  setTimeout?: (fn: () => void, ms: number) => TimerId;
  clearTimeout?: (id: TimerId) => void;
}): { ping: () => void; clear: () => void } {
  const start = opts.setTimeout ?? setTimeout;
  const stop = opts.clearTimeout ?? clearTimeout;
  let id: TimerId | null = null;

  const arm = () => {
    if (id != null) stop(id);
    id = start(() => {
      id = null;
      opts.onStall();
    }, opts.stallMs);
  };

  arm();
  return {
    ping: arm,
    clear: () => {
      if (id == null) return;
      stop(id);
      id = null;
    },
  };
}
