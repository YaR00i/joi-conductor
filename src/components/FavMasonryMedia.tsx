import { useEffect, useRef, useState } from "react";
import type { MediaItem } from "../lib/media";

type Props = {
  item: MediaItem;
};

function freezeGifFrame(
  img: HTMLImageElement,
  canvas: HTMLCanvasElement,
): boolean {
  if (!img.naturalWidth || !img.naturalHeight) return false;
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return false;
  ctx.drawImage(img, 0, 0);
  return true;
}

function stopGifDecoder(img: HTMLImageElement) {
  img.removeAttribute("src");
  img.src = "";
}

/**
 * Masonry thumb: GIFs only decode while on (or just off) screen.
 * Off-screen thumbs keep a still canvas frame so the wall doesn't jump.
 */
export function FavMasonryMedia({ item }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [live, setLive] = useState(false);
  const [hasFreeze, setHasFreeze] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || item.kind !== "gif") return;

    const observer = new IntersectionObserver(
      (entries) => {
        const vis = entries.some(
          (entry) => entry.isIntersecting && entry.intersectionRatio > 0,
        );
        const img = imgRef.current;
        const canvas = canvasRef.current;
        if (vis) {
          if (img && img.getAttribute("src") !== item.url) {
            img.src = item.url;
          }
          setLive(true);
          return;
        }
        if (img && canvas && freezeGifFrame(img, canvas)) {
          setHasFreeze(true);
        }
        if (img) stopGifDecoder(img);
        setLive(false);
      },
      { root: null, rootMargin: "140px 0px", threshold: 0.01 },
    );
    observer.observe(host);
    return () => observer.disconnect();
  }, [item.kind, item.url]);

  if (item.kind === "video") {
    return (
      <video
        className="fav-masonry__media"
        src={item.url}
        muted
        loop
        playsInline
        preload="metadata"
      />
    );
  }

  if (item.kind !== "gif") {
    return (
      <img
        className="fav-masonry__media"
        src={item.url}
        alt={item.tags ?? ""}
        loading="lazy"
        draggable={false}
      />
    );
  }

  return (
    <div ref={hostRef} className="fav-masonry__media-host">
      <img
        ref={imgRef}
        className="fav-masonry__media"
        alt={item.tags ?? ""}
        draggable={false}
        hidden={!live}
      />
      <canvas
        ref={canvasRef}
        className="fav-masonry__media"
        hidden={live || !hasFreeze}
        aria-hidden
      />
    </div>
  );
}
