import type { PixelSelectionShape } from "./pixelSelection";

export type PixelColorAdjustments = {
  hue: number;
  saturation: number;
  brightness: number;
  contrast: number;
};

export type PixelColorDitherMode = "none" | "ordered" | "floyd";

export type PixelColorOperationResult = {
  pixels: string[];
  changed: boolean;
  count: number;
};

type Rgba = { r: number; g: number; b: number; a: number };
type WeightedColor = Rgba & { weight: number };

const BAYER_4 = [
  0, 8, 2, 10,
  12, 4, 14, 6,
  3, 11, 1, 9,
  15, 7, 13, 5,
];

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function clampPercent(value: number): number {
  return Math.max(-100, Math.min(100, Number.isFinite(value) ? value : 0));
}

function parsePixelColor(value: string): Rgba | null {
  if (!value || value === "transparent") return null;
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])([0-9a-f])?$/i.exec(value);
  if (short) {
    return {
      r: Number.parseInt(short[1]! + short[1]!, 16),
      g: Number.parseInt(short[2]! + short[2]!, 16),
      b: Number.parseInt(short[3]! + short[3]!, 16),
      a: short[4] ? Number.parseInt(short[4] + short[4], 16) : 255,
    };
  }
  const full = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(value);
  if (!full) return null;
  return {
    r: Number.parseInt(full[1]!.slice(0, 2), 16),
    g: Number.parseInt(full[1]!.slice(2, 4), 16),
    b: Number.parseInt(full[1]!.slice(4, 6), 16),
    a: full[2] ? Number.parseInt(full[2], 16) : 255,
  };
}

function pixelColorToHex(color: Rgba): string {
  if (color.a <= 0) return "";
  const rgb = [color.r, color.g, color.b]
    .map((value) => clampByte(value).toString(16).padStart(2, "0"))
    .join("");
  return color.a >= 255
    ? `#${rgb}`
    : `#${rgb}${clampByte(color.a).toString(16).padStart(2, "0")}`;
}

function selectionIncludes(
  selection: PixelSelectionShape | undefined,
  x: number,
  y: number,
): boolean {
  if (!selection) return true;
  const { rect, mask } = selection;
  if (x < rect.x || y < rect.y || x >= rect.x + rect.w || y >= rect.y + rect.h) {
    return false;
  }
  return !mask || mask[(y - rect.y) * rect.w + x - rect.x] === true;
}

function rgbToHsv({ r, g, b }: Rgba): { h: number; s: number; v: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;
  let h = 0;
  if (delta > 0) {
    if (max === rn) h = ((gn - bn) / delta) % 6;
    else if (max === gn) h = (bn - rn) / delta + 2;
    else h = (rn - gn) / delta + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max === 0 ? 0 : delta / max, v: max };
}

function hsvToRgb(h: number, s: number, v: number, a: number): Rgba {
  const chroma = v * s;
  const section = ((h % 360) + 360) % 360 / 60;
  const x = chroma * (1 - Math.abs((section % 2) - 1));
  let rgb: [number, number, number];
  if (section < 1) rgb = [chroma, x, 0];
  else if (section < 2) rgb = [x, chroma, 0];
  else if (section < 3) rgb = [0, chroma, x];
  else if (section < 4) rgb = [0, x, chroma];
  else if (section < 5) rgb = [x, 0, chroma];
  else rgb = [chroma, 0, x];
  const m = v - chroma;
  return { r: (rgb[0] + m) * 255, g: (rgb[1] + m) * 255, b: (rgb[2] + m) * 255, a };
}

function adjustUnit(value: number, amount: number): number {
  return amount >= 0 ? value + (1 - value) * amount : value * (1 + amount);
}

function colorDistanceSquared(a: Rgba, b: Rgba): number {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return dr * dr + dg * dg + db * db;
}

function nearestColor(color: Rgba, palette: Rgba[]): Rgba {
  let best = palette[0]!;
  let distance = Number.POSITIVE_INFINITY;
  for (const candidate of palette) {
    const next = colorDistanceSquared(color, candidate);
    if (next < distance) {
      distance = next;
      best = candidate;
    }
  }
  return best;
}

function makeMedianCutPalette(colors: WeightedColor[], limit: number): Rgba[] {
  const buckets: WeightedColor[][] = [colors];
  while (buckets.length < limit) {
    let splitIndex = -1;
    let splitRange = -1;
    let splitChannel: "r" | "g" | "b" = "r";
    for (let index = 0; index < buckets.length; index++) {
      const bucket = buckets[index]!;
      if (bucket.length < 2) continue;
      const ranges = (["r", "g", "b"] as const).map((channel) => ({
        channel,
        range: Math.max(...bucket.map((color) => color[channel])) - Math.min(...bucket.map((color) => color[channel])),
      }));
      const widest = ranges.sort((a, b) => b.range - a.range)[0]!;
      if (widest.range > splitRange) {
        splitIndex = index;
        splitRange = widest.range;
        splitChannel = widest.channel;
      }
    }
    if (splitIndex < 0) break;
    const bucket = [...buckets[splitIndex]!].sort((a, b) => a[splitChannel] - b[splitChannel]);
    const total = bucket.reduce((sum, color) => sum + color.weight, 0);
    let running = 0;
    let pivot = 1;
    for (; pivot < bucket.length; pivot++) {
      running += bucket[pivot - 1]!.weight;
      if (running >= total / 2) break;
    }
    buckets.splice(splitIndex, 1, bucket.slice(0, pivot), bucket.slice(pivot));
  }
  return buckets.map((bucket) => {
    const weight = bucket.reduce((sum, color) => sum + color.weight, 0) || 1;
    return {
      r: bucket.reduce((sum, color) => sum + color.r * color.weight, 0) / weight,
      g: bucket.reduce((sum, color) => sum + color.g * color.weight, 0) / weight,
      b: bucket.reduce((sum, color) => sum + color.b * color.weight, 0) / weight,
      a: 255,
    };
  });
}

export function adjustPixelColors(
  pixels: readonly string[],
  width: number,
  height: number,
  adjustments: PixelColorAdjustments,
  selection?: PixelSelectionShape,
): PixelColorOperationResult {
  const hue = Math.max(-180, Math.min(180, adjustments.hue || 0));
  const saturation = clampPercent(adjustments.saturation) / 100;
  const brightness = clampPercent(adjustments.brightness) / 100;
  const contrast = clampPercent(adjustments.contrast) * 2.55;
  if (hue === 0 && saturation === 0 && brightness === 0 && contrast === 0) {
    return { pixels: [...pixels], changed: false, count: 0 };
  }
  const contrastFactor = (259 * (contrast + 255)) / (255 * (259 - contrast));
  const next = [...pixels];
  let count = 0;
  const length = Math.min(next.length, Math.max(0, width) * Math.max(0, height));
  for (let index = 0; index < length; index++) {
    const x = index % width;
    const y = Math.floor(index / width);
    if (!selectionIncludes(selection, x, y)) continue;
    const source = parsePixelColor(next[index] ?? "");
    if (!source || source.a <= 0) continue;
    const hsv = rgbToHsv(source);
    const shifted = hsvToRgb(
      hsv.h + hue,
      Math.max(0, Math.min(1, adjustUnit(hsv.s, saturation))),
      Math.max(0, Math.min(1, adjustUnit(hsv.v, brightness))),
      source.a,
    );
    const output = pixelColorToHex({
      r: contrastFactor * (shifted.r - 128) + 128,
      g: contrastFactor * (shifted.g - 128) + 128,
      b: contrastFactor * (shifted.b - 128) + 128,
      a: source.a,
    });
    if (output === next[index]) continue;
    next[index] = output;
    count++;
  }
  return { pixels: count ? next : [...pixels], changed: count > 0, count };
}

export function quantizePixelColors(
  pixels: readonly string[],
  width: number,
  height: number,
  colorLimit: number,
  dither: PixelColorDitherMode = "none",
  ditherStrength = 50,
  selection?: PixelSelectionShape,
): PixelColorOperationResult & { palette: string[] } {
  const limit = Math.max(2, Math.min(32, Math.round(colorLimit || 2)));
  const length = Math.min(pixels.length, Math.max(0, width) * Math.max(0, height));
  const frequencies = new Map<string, WeightedColor>();
  for (let index = 0; index < length; index++) {
    const x = index % width;
    const y = Math.floor(index / width);
    if (!selectionIncludes(selection, x, y)) continue;
    const color = parsePixelColor(pixels[index] ?? "");
    if (!color || color.a <= 0) continue;
    const key = `${clampByte(color.r)},${clampByte(color.g)},${clampByte(color.b)}`;
    const known = frequencies.get(key);
    if (known) known.weight++;
    else frequencies.set(key, { ...color, a: 255, weight: 1 });
  }
  if (!frequencies.size) return { pixels: [...pixels], changed: false, count: 0, palette: [] };
  const sourceColors = [...frequencies.values()];
  const palette = sourceColors.length <= limit
    ? sourceColors.map(({ r, g, b }) => ({ r, g, b, a: 255 }))
    : makeMedianCutPalette(sourceColors, limit);
  const next = [...pixels];
  const strength = Math.max(0, Math.min(100, ditherStrength || 0)) / 100;
  const errors = new Array(length).fill(null).map(() => ({ r: 0, g: 0, b: 0 }));
  let count = 0;
  const addError = (index: number, error: Rgba, factor: number) => {
    if (index < 0 || index >= length) return;
    const x = index % width;
    const y = Math.floor(index / width);
    if (!selectionIncludes(selection, x, y)) return;
    const target = parsePixelColor(pixels[index] ?? "");
    if (!target || target.a <= 0) return;
    errors[index]!.r += error.r * factor * strength;
    errors[index]!.g += error.g * factor * strength;
    errors[index]!.b += error.b * factor * strength;
  };
  for (let index = 0; index < length; index++) {
    const x = index % width;
    const y = Math.floor(index / width);
    if (!selectionIncludes(selection, x, y)) continue;
    const source = parsePixelColor(pixels[index] ?? "");
    if (!source || source.a <= 0) continue;
    let sample = { ...source };
    if (dither === "ordered") {
      const threshold = (BAYER_4[(y % 4) * 4 + (x % 4)]! / 15 - 0.5) * 72 * strength;
      sample = { ...sample, r: sample.r + threshold, g: sample.g + threshold, b: sample.b + threshold };
    } else if (dither === "floyd") {
      sample = {
        ...sample,
        r: sample.r + errors[index]!.r,
        g: sample.g + errors[index]!.g,
        b: sample.b + errors[index]!.b,
      };
    }
    const mapped = nearestColor(sample, palette);
    const output = pixelColorToHex({ ...mapped, a: source.a });
    if (output !== pixels[index]) {
      next[index] = output;
      count++;
    }
    if (dither === "floyd") {
      const error = { r: sample.r - mapped.r, g: sample.g - mapped.g, b: sample.b - mapped.b, a: 255 };
      if (x + 1 < width) addError(index + 1, error, 7 / 16);
      if (x > 0) addError(index + width - 1, error, 3 / 16);
      addError(index + width, error, 5 / 16);
      if (x + 1 < width) addError(index + width + 1, error, 1 / 16);
    }
  }
  return {
    pixels: count ? next : [...pixels],
    changed: count > 0,
    count,
    palette: palette.map(pixelColorToHex),
  };
}

export function outlinePixelColors(
  pixels: readonly string[],
  width: number,
  height: number,
  color: string,
  thickness = 1,
  diagonal = false,
  selection?: PixelSelectionShape,
): PixelColorOperationResult {
  const outline = parsePixelColor(color);
  if (!outline || outline.a <= 0 || width <= 0 || height <= 0) {
    return { pixels: [...pixels], changed: false, count: 0 };
  }
  const length = Math.min(pixels.length, width * height);
  const next = [...pixels];
  let filled = new Array(length).fill(false) as boolean[];
  for (let index = 0; index < length; index++) {
    const x = index % width;
    const y = Math.floor(index / width);
    const parsed = parsePixelColor(pixels[index] ?? "");
    filled[index] = selectionIncludes(selection, x, y) && !!parsed && parsed.a > 0;
  }
  const directions = diagonal
    ? [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]]
    : [[0, -1], [-1, 0], [1, 0], [0, 1]];
  let count = 0;
  for (let pass = 0; pass < Math.max(1, Math.min(4, Math.round(thickness || 1))); pass++) {
    const expanded = [...filled];
    for (let index = 0; index < length; index++) {
      if (!filled[index]) continue;
      const x = index % width;
      const y = Math.floor(index / width);
      for (const [dx, dy] of directions) {
        const nx = x + dx!;
        const ny = y + dy!;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height || !selectionIncludes(selection, nx, ny)) continue;
        const target = ny * width + nx;
        if (expanded[target]) continue;
        const existing = parsePixelColor(pixels[target] ?? "");
        if (existing && existing.a > 0) continue;
        expanded[target] = true;
        next[target] = pixelColorToHex(outline);
        count++;
      }
    }
    filled = expanded;
  }
  return { pixels: count ? next : [...pixels], changed: count > 0, count };
}
