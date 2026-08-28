import { useRef, useState } from "react";
import { proxiedImageUrl } from "../../lib/doujin/cdn";
import type { DoujinPage } from "../../lib/doujin/types";
import { clampScrubPreviewLeft, pageIndexFromScrub } from "./readerScrub";

const PREVIEW_W = 90;

type Props = {
  pages: DoujinPage[];
  index: number;
  onJump: (index: number) => void;
};

export function DoujinReaderScrubber({ pages, index, onJump }: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const armed = useRef(false);
  const [hover, setHover] = useState<number | null>(null);
  const [previewLeft, setPreviewLeft] = useState(0);
  const total = Math.max(1, pages.length);
  const current = Math.min(total - 1, Math.max(0, index));
  const fill = ((current + 1) / total) * 100;
  const shown = hover ?? current;
  const page = pages[shown];
  const previewSrc = page
    ? proxiedImageUrl(page.previewUrl || page.url)
    : "";

  function locate(clientX: number): number {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return current;
    setPreviewLeft(
      clampScrubPreviewLeft(clientX, rect.left, rect.width, PREVIEW_W),
    );
    return pageIndexFromScrub(clientX, rect.left, rect.width, total);
  }

  return (
    <div
      className={"doujin-scrub" + (hover !== null ? " is-hover" : "")}
      role="slider"
      tabIndex={0}
      aria-label="Страница"
      aria-valuemin={1}
      aria-valuemax={total}
      aria-valuenow={current + 1}
      aria-valuetext={`${current + 1} из ${total}`}
      onPointerLeave={() => setHover(null)}
      onPointerMove={(e) => setHover(locate(e.clientX))}
      onPointerDown={(e) => {
        armed.current = true;
        (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
        setHover(locate(e.clientX));
      }}
      onPointerUp={(e) => {
        if (!armed.current) return;
        armed.current = false;
        onJump(locate(e.clientX));
        setHover(null);
      }}
    >
      <div ref={trackRef} className="doujin-scrub__track">
        <div className="doujin-scrub__fill" style={{ width: `${fill}%` }} />
        <div className="doujin-scrub__thumb" style={{ left: `${fill}%` }} />
      </div>
      {hover !== null && previewSrc ? (
        <div
          className="doujin-scrub__preview"
          style={{ left: previewLeft }}
        >
          <img src={previewSrc} alt="" draggable={false} />
          <span>
            {shown + 1} / {total}
          </span>
        </div>
      ) : null}
    </div>
  );
}
