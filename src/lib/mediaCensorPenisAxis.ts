/**
 * Shaft axis for the penis reveal hole. YOLO boxes are axis-aligned;
 * a diagonal shaft sits on a box diagonal, so an unrotated ellipse
 * clips the tip. PCA on a center blob (not the busy frame edge)
 * estimates the angle.
 */

export const PENIS_AXIS_MIN_RATIO = 1.35;
/** Rotated hole is thinner than the AABB so neighbours stay mosaicked. */
export const PENIS_AXIS_THIN = 0.34;

function lumaAt(rgba: ArrayLike<number>, i: number): number {
  const o = i * 4;
  return 0.2126 * (rgba[o] ?? 0) + 0.7152 * (rgba[o + 1] ?? 0) + 0.0722 * (rgba[o + 2] ?? 0);
}

function borderMedian(luma: Float32Array, width: number, height: number): number {
  const mx = Math.max(1, Math.floor(width * 0.12));
  const my = Math.max(1, Math.floor(height * 0.12));
  const vals: number[] = [];
  for (let y = 0; y < height; y += 1) {
    const edgeY = y < my || y >= height - my;
    for (let x = 0; x < width; x += 1) {
      if (!edgeY && x >= mx && x < width - mx) continue;
      vals.push(luma[y * width + x] ?? 0);
    }
  }
  if (vals.length === 0) return 0;
  vals.sort((a, b) => a - b);
  return vals[vals.length >> 1] ?? 0;
}

function innerBounds(width: number, height: number): {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
} {
  const mx = Math.max(1, Math.floor(width * 0.12));
  const my = Math.max(1, Math.floor(height * 0.12));
  return { x0: mx, y0: my, x1: width - mx, y1: height - my };
}

function markContrast(
  luma: Float32Array,
  width: number,
  height: number,
  mean: number,
  mask: Uint8Array,
): number {
  const { x0, y0, x1, y1 } = innerBounds(width, height);
  let count = 0;
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const i = y * width + x;
      if (Math.abs((luma[i] ?? 0) - mean) >= 16) {
        mask[i] = 1;
        count += 1;
      }
    }
  }
  return count;
}

function markSobel(
  luma: Float32Array,
  width: number,
  height: number,
  mask: Uint8Array,
): number {
  const { x0, y0, x1, y1 } = innerBounds(width, height);
  let maxMag = 1e-6;
  const mag = new Float32Array(width * height);
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const i = y * width + x;
      const gx =
        (luma[i + 1] ?? 0) -
        (luma[i - 1] ?? 0) +
        0.5 *
          ((luma[i - width + 1] ?? 0) -
            (luma[i - width - 1] ?? 0) +
            (luma[i + width + 1] ?? 0) -
            (luma[i + width - 1] ?? 0));
      const gy =
        (luma[i + width] ?? 0) -
        (luma[i - width] ?? 0) +
        0.5 *
          ((luma[i + width + 1] ?? 0) -
            (luma[i - width + 1] ?? 0) +
            (luma[i + width - 1] ?? 0) -
            (luma[i - width - 1] ?? 0));
      const m = Math.hypot(gx, gy);
      mag[i] = m;
      if (m > maxMag) maxMag = m;
    }
  }
  const cut = maxMag * 0.4;
  let count = 0;
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const i = y * width + x;
      if ((mag[i] ?? 0) >= cut) {
        mask[i] = 1;
        count += 1;
      }
    }
  }
  return count;
}

function bestCenterBlob(
  mask: Uint8Array,
  width: number,
  height: number,
  minCount: number,
): { xs: number[]; ys: number[] } | null {
  const { x0, y0, x1, y1 } = innerBounds(width, height);
  const seen = new Uint8Array(width * height);
  const cx = width / 2;
  const cy = height / 2;
  const reach = Math.hypot(width, height) / 2;
  let bestXs: number[] | null = null;
  let bestYs: number[] | null = null;
  let bestScore = -1;
  const stack: number[] = [];

  const flood = (start: number): void => {
    stack.length = 0;
    stack.push(start);
    seen[start] = 1;
    const xs: number[] = [];
    const ys: number[] = [];
    let sx = 0;
    let sy = 0;
    while (stack.length > 0) {
      const i = stack.pop()!;
      const x = i % width;
      const y = (i - x) / width;
      xs.push(x + 0.5);
      ys.push(y + 0.5);
      sx += x + 0.5;
      sy += y + 0.5;
      const neigh = [i - 1, i + 1, i - width, i + width];
      for (const n of neigh) {
        if (n < 0 || n >= mask.length) continue;
        const nx = n % width;
        const ny = (n - nx) / width;
        if (nx < x0 || nx >= x1 || ny < y0 || ny >= y1) continue;
        if (!mask[n] || seen[n]) continue;
        seen[n] = 1;
        stack.push(n);
      }
    }
    const area = xs.length;
    if (area < minCount) return;
    const mx = sx / area;
    const my = sy / area;
    const dist = Math.hypot(mx - cx, my - cy) / Math.max(reach, 1);
    const score = area * Math.exp(-5.2 * dist * dist);
    if (score > bestScore) {
      bestScore = score;
      bestXs = xs;
      bestYs = ys;
    }
  };

  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const i = y * width + x;
      if (!mask[i] || seen[i]) continue;
      flood(i);
    }
  }
  if (!bestXs || !bestYs) return null;
  return { xs: bestXs, ys: bestYs };
}

function collectForeground(
  luma: Float32Array,
  width: number,
  height: number,
): { xs: number[]; ys: number[] } | null {
  const n = width * height;
  if (n < 16) return null;
  const minCount = Math.max(10, Math.floor(n * 0.03));
  const mean = borderMedian(luma, width, height);
  const mask = new Uint8Array(n);
  markContrast(luma, width, height, mean, mask);
  const blob = bestCenterBlob(mask, width, height, minCount);
  if (blob) return blob;
  mask.fill(0);
  markSobel(luma, width, height, mask);
  return bestCenterBlob(mask, width, height, minCount);
}

function pcaAngle(xs: number[], ys: number[], width: number, height: number): number | null {
  const n = xs.length;
  if (n < 8) return null;
  const cx = width / 2;
  const cy = height / 2;
  const reach = Math.hypot(width, height) / 2;
  let wsum = 0;
  let mx = 0;
  let my = 0;
  const wt = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    const x = xs[i] ?? 0;
    const y = ys[i] ?? 0;
    const dist = Math.hypot(x - cx, y - cy) / Math.max(reach, 1);
    const w = 1 / (0.45 + dist);
    wt[i] = w;
    wsum += w;
    mx += x * w;
    my += y * w;
  }
  if (wsum < 1e-6) return null;
  mx /= wsum;
  my /= wsum;
  let cxx = 0;
  let cyy = 0;
  let cxy = 0;
  for (let i = 0; i < n; i += 1) {
    const w = wt[i] ?? 0;
    const dx = (xs[i] ?? 0) - mx;
    const dy = (ys[i] ?? 0) - my;
    cxx += w * dx * dx;
    cyy += w * dy * dy;
    cxy += w * dx * dy;
  }
  cxx /= wsum;
  cyy /= wsum;
  cxy /= wsum;
  const disc = Math.sqrt(Math.max(0, ((cxx - cyy) / 2) ** 2 + cxy * cxy));
  const l1 = (cxx + cyy) / 2 + disc;
  const l2 = (cxx + cyy) / 2 - disc;
  if (l1 < PENIS_AXIS_MIN_RATIO * Math.max(l2, 1e-8)) return null;
  let vx: number;
  let vy: number;
  if (Math.abs(cxy) > 1e-8) {
    vx = l1 - cyy;
    vy = cxy;
  } else if (cxx >= cyy) {
    vx = 1;
    vy = 0;
  } else {
    vx = 0;
    vy = 1;
  }
  return Math.atan2(vy, vx);
}

/** Radians, or null to keep the axis-aligned hole. */
export function penisHoleOrientationRad(
  rgba: ArrayLike<number>,
  width: number,
  height: number,
): number | null {
  if (width < 8 || height < 8 || rgba.length < width * height * 4) return null;
  const luma = new Float32Array(width * height);
  for (let i = 0; i < luma.length; i += 1) luma[i] = lumaAt(rgba, i);
  const fg = collectForeground(luma, width, height);
  if (!fg) return null;
  return pcaAngle(fg.xs, fg.ys, width, height);
}

export function penisHoleEllipse(
  boxW: number,
  boxH: number,
  axisRad: number | null,
): { rx: number; ry: number; rotation: number } {
  const w = Math.max(0, boxW);
  const h = Math.max(0, boxH);
  if (axisRad == null) {
    return { rx: w / 2, ry: h / 2, rotation: 0 };
  }
  return {
    rx: Math.hypot(w, h) * 0.5,
    ry: Math.min(w, h) * PENIS_AXIS_THIN,
    rotation: axisRad,
  };
}
