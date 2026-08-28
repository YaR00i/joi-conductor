import { useEffect, useRef, useState } from "react";
import {
  masonryPreviewSrc,
  masonryUpgradeSrc,
  type MediaItem,
} from "../lib/media";

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

function revealWhenDecoded(img: HTMLImageElement, onReady: () => void) {
  const done = () => onReady();
  if (typeof img.decode === "function") {
    void img.decode().then(done, done);
    return;
  }
  done();
}

function ProgressiveStill({ item }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const loRef = useRef<HTMLImageElement>(null);
  const hiRef = useRef<HTMLImageElement>(null);
  const retriesRef = useRef(0);
  const retryTimerRef = useRef(0);
  const [inView, setInView] = useState(false);
  const [loReady, setLoReady] = useState(false);
  const [hiReady, setHiReady] = useState(false);
  const [hiFailed, setHiFailed] = useState(false);
  const [hiSrc, setHiSrc] = useState<string | null>(null);
  const lo = masonryPreviewSrc(item);
  const upgrade = masonryUpgradeSrc(item);

  useEffect(() => {
    setLoReady(false);
    const img = loRef.current;
    if (img?.complete && img.naturalWidth > 0) setLoReady(true);
  }, [lo]);

  useEffect(() => {
    setHiReady(false);
    setHiFailed(false);
    setHiSrc(null);
    setInView(false);
    retriesRef.current = 0;
    window.clearTimeout(retryTimerRef.current);
    const host = hostRef.current;
    if (!host) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        setInView(true);
        observer.disconnect();
        if (upgrade) setHiSrc(upgrade);
      },
      { root: null, rootMargin: "480px 0px", threshold: 0.01 },
    );
    observer.observe(host);
    return () => {
      observer.disconnect();
      window.clearTimeout(retryTimerRef.current);
    };
  }, [upgrade]);

  useEffect(() => {
    const img = hiRef.current;
    if (!img || !hiSrc || hiReady) return;
    if (img.complete && img.naturalWidth > 0) {
      revealWhenDecoded(img, () => {
        if (!img.isConnected) return;
        setHiReady(true);
      });
    }
  }, [hiSrc, hiReady]);

  const pending =
    inView &&
    (!loReady || Boolean(upgrade && !hiReady && !hiFailed));

  return (
    <div
      ref={hostRef}
      className="fav-masonry__media-host is-still"
      aria-busy={pending}
    >
      <img
        ref={loRef}
        className="fav-masonry__media is-lo"
        src={lo}
        alt={item.tags ?? ""}
        loading="lazy"
        decoding="async"
        draggable={false}
        onLoad={() => setLoReady(true)}
        onError={() => setLoReady(true)}
      />
      {hiSrc ? (
        <img
          ref={hiRef}
          className={
            "fav-masonry__media is-hi" +
            (hiReady && loReady ? " is-ready" : "")
          }
          src={hiSrc}
          alt=""
          draggable={false}
          onLoad={(e) => {
            const img = e.currentTarget;
            revealWhenDecoded(img, () => {
              if (!img.isConnected) return;
              setHiReady(true);
            });
          }}
          onError={() => {
            if (retriesRef.current < 1 && upgrade) {
              retriesRef.current += 1;
              setHiReady(false);
              setHiSrc(null);
              retryTimerRef.current = window.setTimeout(() => {
                setHiSrc(upgrade);
              }, 450);
              return;
            }
            setHiFailed(true);
          }}
        />
      ) : null}
      {pending ? (
        <span className="fav-masonry__load" aria-hidden>
          <span className="fav-masonry__load-bar" />
        </span>
      ) : null}
    </div>
  );
}

/**
 * Masonry thumb: GIFs only decode while on (or just off) screen.
 * Off-screen thumbs keep a still canvas frame so the wall doesn't jump.
 * Gelbooru stills paint the tiny preview first, then fade in the sample.
 */
export function FavMasonryMedia({ item }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [live, setLive] = useState(false);
  const [hasFreeze, setHasFreeze] = useState(false);
  const src = masonryPreviewSrc(item);

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
          if (img && img.getAttribute("src") !== src) {
            img.src = src;
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
  }, [item.kind, src]);

  if (item.kind === "video") {
    return (
      <video
        className="fav-masonry__media"
        src={src}
        muted
        loop
        playsInline
        preload="metadata"
      />
    );
  }

  if (item.kind !== "gif") {
    return <ProgressiveStill item={item} />;
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
