import {
  displayMediaUrl,
  mediaStreamsWithoutCache,
  type MediaItem,
} from "./media";
import {
  ensureMediaCached,
  hydratePlayUrlFromShelf,
  peekCachedPlayUrl,
  subscribeMediaCacheReady,
  type PreloadProgress,
} from "./mediaPreload";

export type MediaPlaySrcPlan = {
  src: string | null;
  streamed: boolean;
  useEnsureCache: boolean;
};

export function planMediaPlaySrc(input: {
  item: MediaItem;
  ramUrl: string | null;
  shelfUrl: string | null;
}): MediaPlaySrcPlan {
  if (input.ramUrl) {
    return { src: input.ramUrl, streamed: false, useEnsureCache: false };
  }
  if (
    input.item.source === "local" ||
    input.item.source === "favorites" ||
    input.item.url.startsWith("blob:") ||
    input.item.url.startsWith("data:")
  ) {
    return {
      src: displayMediaUrl(input.item),
      streamed: false,
      useEnsureCache: false,
    };
  }
  if (input.shelfUrl) {
    return { src: input.shelfUrl, streamed: false, useEnsureCache: false };
  }
  if (mediaStreamsWithoutCache(input.item)) {
    return {
      src: displayMediaUrl(input.item),
      streamed: true,
      useEnsureCache: false,
    };
  }
  return { src: null, streamed: false, useEnsureCache: true };
}

export function startMediaPlaySrc(
  item: MediaItem,
  opts: {
    onSrc: (src: string, streamed: boolean) => void;
    onProgress?: (p: PreloadProgress) => void;
    onError?: (err: unknown) => void;
  },
): () => void {
  let cancelled = false;

  const unsub = subscribeMediaCacheReady((id, url) => {
    if (cancelled || id !== item.id) return;
    opts.onSrc(url, false);
    opts.onProgress?.({ percent: 100, phase: "ready" });
  });

  const ram = peekCachedPlayUrl(item.id);
  const immediate = planMediaPlaySrc({
    item,
    ramUrl: ram,
    shelfUrl: null,
  });
  if (immediate.src && !immediate.streamed && !immediate.useEnsureCache) {
    opts.onSrc(immediate.src, false);
    opts.onProgress?.({ percent: 100, phase: "ready" });
    return () => {
      cancelled = true;
      unsub();
    };
  }

  if (mediaStreamsWithoutCache(item)) {
    const streamPlan = planMediaPlaySrc({
      item,
      ramUrl: null,
      shelfUrl: null,
    });
    if (streamPlan.src) {
      opts.onSrc(streamPlan.src, true);
    }
    void hydratePlayUrlFromShelf(item).then((shelfUrl) => {
      if (cancelled || !shelfUrl) return;
      opts.onSrc(shelfUrl, false);
      opts.onProgress?.({ percent: 100, phase: "ready" });
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }

  void ensureMediaCached(item, (progress) => {
    if (!cancelled) opts.onProgress?.(progress);
  })
    .then((url) => {
      if (cancelled) return;
      opts.onSrc(url, false);
    })
    .catch((err: unknown) => {
      if (cancelled) return;
      opts.onError?.(err);
    });

  return () => {
    cancelled = true;
    unsub();
  };
}
