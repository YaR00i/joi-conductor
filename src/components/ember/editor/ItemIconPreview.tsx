import { useMemo } from "react";
import { ITEM_ICON_SIZE } from "../../../game/content/emberItem";

type PreviewProps = {
  pixels: string[] | undefined;
  size?: number;
  display?: number;
  className?: string;
  title?: string;
};

export function ItemIconPreview({
  pixels,
  size = ITEM_ICON_SIZE,
  display = 32,
  className,
  title,
}: PreviewProps) {
  const cells = useMemo(() => {
    const out: string[] = [];
    const total = size * size;
    for (let i = 0; i < total; i++) out.push(pixels?.[i] ?? "");
    return out;
  }, [pixels, size]);

  return (
    <div
      className={`ember-item-icon ${className ?? ""}`}
      title={title}
      style={{
        width: display,
        height: display,
        gridTemplateColumns: `repeat(${size}, 1fr)`,
      }}
      aria-hidden
    >
      {cells.map((color, i) => (
        <span
          key={i}
          style={{ background: color || "transparent" }}
        />
      ))}
    </div>
  );
}

type PainterProps = {
  pixels: string[];
  size?: number;
  color: string;
  onChange: (pixels: string[]) => void;
};

export function ItemIconPainter({
  pixels,
  size = ITEM_ICON_SIZE,
  color,
  onChange,
}: PainterProps) {
  const paint = (index: number, erase: boolean) => {
    const next = pixels.slice();
    while (next.length < size * size) next.push("");
    next[index] = erase ? "" : color;
    onChange(next);
  };

  return (
    <div
      className="ember-item-icon-painter"
      style={{ gridTemplateColumns: `repeat(${size}, 1fr)` }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {Array.from({ length: size * size }, (_, i) => (
        <button
          key={i}
          type="button"
          className="ember-item-icon-painter__cell"
          style={{ background: pixels[i] || "transparent" }}
          onClick={() => paint(i, false)}
          onContextMenu={(e) => {
            e.preventDefault();
            paint(i, true);
          }}
          aria-label={`pixel ${i}`}
        />
      ))}
    </div>
  );
}

export const ITEM_ICON_PALETTE = [
  "#00000000",
  "#1c100c",
  "#4a2c1c",
  "#6a4030",
  "#c4a078",
  "#efe4d4",
  "#d4b44a",
  "#f4e8a0",
  "#c45c26",
  "#e88840",
  "#ffb040",
  "#8b3048",
  "#5a1830",
  "#3d6a38",
  "#6a9a48",
  "#8a9098",
  "#d8dce0",
  "#c87850",
  "#e8c8a0",
];

export function downsampleImageToIcon(
  image: HTMLImageElement,
  size = ITEM_ICON_SIZE,
): string[] {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Array.from({ length: size * size }, () => "");
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, size, size);
  ctx.drawImage(image, 0, 0, size, size);
  const data = ctx.getImageData(0, 0, size, size).data;
  const pixels: string[] = [];
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3] ?? 0;
    if (a < 16) {
      pixels.push("");
      continue;
    }
    const r = (data[i] ?? 0).toString(16).padStart(2, "0");
    const g = (data[i + 1] ?? 0).toString(16).padStart(2, "0");
    const b = (data[i + 2] ?? 0).toString(16).padStart(2, "0");
    pixels.push(`#${r}${g}${b}`);
  }
  return pixels;
}
