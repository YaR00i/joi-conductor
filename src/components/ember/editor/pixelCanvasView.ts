export type PixelGuideAxis = "x" | "y";

export type PixelCanvasGuide = {
  id: string;
  axis: PixelGuideAxis;
  position: number;
};

export type PixelReferenceMode = "under" | "over" | "side";

export type PixelCanvasReference = {
  url: string;
  name: string;
  mode: PixelReferenceMode;
  opacity: number;
  scale: number;
  offsetX: number;
  offsetY: number;
  mirror: boolean;
};

export const MAX_PIXEL_REFERENCE_BYTES = 20 * 1024 * 1024;

export function clampPixelGuidePosition(position: number, extent: number): number {
  const safe = Number.isFinite(position) ? Math.round(position) : 0;
  return Math.max(0, Math.min(Math.max(0, Math.round(extent)), safe));
}

export function addPixelCanvasGuide(
  guides: readonly PixelCanvasGuide[],
  axis: PixelGuideAxis,
  position: number,
  extent: number,
  id: string,
): PixelCanvasGuide[] {
  const nextPosition = clampPixelGuidePosition(position, extent);
  if (guides.some((guide) => guide.axis === axis && guide.position === nextPosition)) {
    return [...guides];
  }
  return [...guides, { id, axis, position: nextPosition }];
}

export function movePixelCanvasGuide(
  guides: readonly PixelCanvasGuide[],
  id: string,
  position: number,
  extent: number,
): PixelCanvasGuide[] {
  const current = guides.find((guide) => guide.id === id);
  if (!current) return [...guides];
  const nextPosition = clampPixelGuidePosition(position, extent);
  return guides.map((guide) => guide.id === id ? { ...guide, position: nextPosition } : guide);
}

export function clampPixelCanvasGuides(
  guides: readonly PixelCanvasGuide[],
  width: number,
  height: number,
): PixelCanvasGuide[] {
  const seen = new Set<string>();
  const next: PixelCanvasGuide[] = [];
  for (const guide of guides) {
    const position = clampPixelGuidePosition(
      guide.position,
      guide.axis === "x" ? width : height,
    );
    const key = `${guide.axis}:${position}`;
    if (seen.has(key)) continue;
    seen.add(key);
    next.push({ ...guide, position });
  }
  return next;
}

export function validatePixelReferenceFile(file: {
  type: string;
  size: number;
}): string | null {
  if (!file.type.toLowerCase().startsWith("image/")) return "Нужен файл изображения";
  if (!Number.isFinite(file.size) || file.size <= 0) return "Файл изображения пуст";
  if (file.size > MAX_PIXEL_REFERENCE_BYTES) return "Референс больше 20 МБ";
  return null;
}
