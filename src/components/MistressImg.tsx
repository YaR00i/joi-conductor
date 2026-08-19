import { useEffect, useState, type ImgHTMLAttributes } from "react";

type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & {
  /** Asset path ending in .svg or .png — PNG is preferred when present. */
  src: string;
};

/**
 * Prefers a same-basename .png if the user dropped one; falls back to .svg.
 */
export function MistressImg({ src, alt = "", ...rest }: Props) {
  const [current, setCurrent] = useState(src);

  useEffect(() => {
    if (!src.endsWith(".svg")) {
      setCurrent(src);
      return;
    }
    const png = src.replace(/\.svg$/i, ".png");
    let cancelled = false;
    const probe = new Image();
    probe.onload = () => {
      if (!cancelled) setCurrent(png);
    };
    probe.onerror = () => {
      if (!cancelled) setCurrent(src);
    };
    probe.src = png;
    return () => {
      cancelled = true;
    };
  }, [src]);

  return <img src={current} alt={alt} {...rest} />;
}
