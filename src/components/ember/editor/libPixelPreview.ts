/** Rasterize a width×height pixel buffer to a PNG data URL. */
export function pixelsToDataUrl(
  pixels: string[] | undefined,
  width: number,
  height: number,
  displaySize = 96,
): string {
  if (!pixels?.length || width < 1 || height < 1) return "";
  if (pixels.length < width * height) return "";
  const scale = Math.max(
    1,
    Math.floor(displaySize / Math.max(width, height)),
  );
  const w = width * scale;
  const h = height * scale;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#1a120e";
  ctx.fillRect(0, 0, w, h);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const c = pixels[y * width + x];
      if (!c || c === "" || c === "#00000000") continue;
      ctx.fillStyle = c;
      ctx.fillRect(x * scale, y * scale, scale, scale);
    }
  }
  try {
    return canvas.toDataURL("image/png");
  } catch {
    return "";
  }
}
