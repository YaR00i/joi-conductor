import { ensureMediaCached } from "./mediaPreload";
import type { MediaItem } from "./media";

const MAX_EDGE = 720;
const JPEG_QUALITY = 0.84;

function canvasToJpegDataUrl(canvas: HTMLCanvasElement): string | null {
  try {
    const url = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
    return url.startsWith("data:image/") ? url : null;
  } catch {
    // tainted canvas / unsupported
    return null;
  }
}

function drawToCanvas(
  source: CanvasImageSource,
  width: number,
  height: number,
): string | null {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  const scale = Math.min(1, MAX_EDGE / Math.max(w, h));
  const cw = Math.max(1, Math.round(w * scale));
  const ch = Math.max(1, Math.round(h * scale));
  const canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#0c0908";
  ctx.fillRect(0, 0, cw, ch);
  try {
    ctx.drawImage(source, 0, 0, cw, ch);
  } catch {
    return null;
  }
  return canvasToJpegDataUrl(canvas);
}

/** Grab a still from the live MediaStage element (already decoded / no CORS). */
export function captureSouvenirFromStageDom(): string | null {
  const media = document.querySelector(
    ".media-stage__media",
  ) as HTMLImageElement | HTMLVideoElement | null;
  if (!media) return null;

  if (media instanceof HTMLVideoElement) {
    if (media.readyState < 2 || media.videoWidth <= 0) return null;
    return drawToCanvas(media, media.videoWidth, media.videoHeight);
  }

  if (media instanceof HTMLImageElement) {
    if (!media.complete || media.naturalWidth <= 0) return null;
    return drawToCanvas(media, media.naturalWidth, media.naturalHeight);
  }

  return null;
}

async function loadImageElement(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.decoding = "async";
    // blob:/data: don't need referrer; remote may taint — we prefer blob from cache.
    if (!url.startsWith("blob:") && !url.startsWith("data:")) {
      img.crossOrigin = "anonymous";
      img.referrerPolicy = "no-referrer";
    }
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

async function captureFromMediaItem(item: MediaItem): Promise<string | null> {
  try {
    const playUrl = await ensureMediaCached(item);
    if (item.kind === "video") {
      const video = document.createElement("video");
      video.muted = true;
      video.playsInline = true;
      video.preload = "auto";
      video.src = playUrl;
      await new Promise<void>((resolve, reject) => {
        video.onloadeddata = () => resolve();
        video.onerror = () => reject(new Error("video load failed"));
        window.setTimeout(() => reject(new Error("video timeout")), 8000);
      });
      try {
        await video.play();
        video.pause();
      } catch {
        // still may have a frame
      }
      if (video.videoWidth <= 0) return null;
      return drawToCanvas(video, video.videoWidth, video.videoHeight);
    }

    const img = await loadImageElement(playUrl);
    if (!img || img.naturalWidth <= 0) return null;
    return drawToCanvas(img, img.naturalWidth, img.naturalHeight);
  } catch {
    return null;
  }
}

/**
 * Compact JPEG data-URL for the diary souvenir.
 * Prefer the on-screen stage frame so we avoid CORS / giant video blobs.
 */
export async function captureDiarySouvenirDataUrl(
  item: MediaItem | null | undefined,
): Promise<string | null> {
  const fromDom = captureSouvenirFromStageDom();
  if (fromDom) return fromDom;
  if (!item) return null;
  return captureFromMediaItem(item);
}
