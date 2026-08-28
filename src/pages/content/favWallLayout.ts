import { useEffect, useState } from "react";

export function favColumnCountForWidth(width: number): number {
  if (width <= 700) return 1;
  if (width <= 1100) return 2;
  return 3;
}

export function splitIntoColumns<T>(items: T[], columnCount: number): T[][] {
  const count = Math.max(1, columnCount);
  const cols: T[][] = Array.from({ length: count }, () => []);
  items.forEach((item, index) => {
    cols[index % count]!.push(item);
  });
  return cols;
}

export function useFavColumnCount(): number {
  const [count, setCount] = useState(() =>
    favColumnCountForWidth(window.innerWidth),
  );
  useEffect(() => {
    function onResize() {
      setCount(favColumnCountForWidth(window.innerWidth));
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return count;
}
