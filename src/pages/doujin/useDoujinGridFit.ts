import { useEffect, useState, type RefObject } from "react";
import {
  DEFAULT_DOUJIN_GRID_FIT,
  fitDoujinGrid,
  type DoujinGridFit,
} from "../../lib/doujin/fitGrid";

export function useDoujinGridFit(
  ref: RefObject<HTMLElement | null>,
  enabled: boolean,
  maxCols?: number,
): DoujinGridFit {
  const [fit, setFit] = useState(DEFAULT_DOUJIN_GRID_FIT);

  useEffect(() => {
    if (!enabled) return;
    const el = ref.current;
    if (!el) return;
    let timer = 0;
    const apply = () => {
      const next = fitDoujinGrid(el.clientWidth, el.clientHeight, {
        maxCols,
      });
      setFit((prev) =>
        prev.cols === next.cols &&
        prev.rows === next.rows &&
        prev.pageSize === next.pageSize
          ? prev
          : next,
      );
    };
    const ro = new ResizeObserver(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(apply, 140);
    });
    ro.observe(el);
    apply();
    return () => {
      window.clearTimeout(timer);
      ro.disconnect();
    };
  }, [enabled, maxCols, ref]);

  return fit;
}
