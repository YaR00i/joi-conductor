import type { MapRegionKind } from "../content/types";

export const EDITOR_VIEWPORT_SELECTION_KINDS = [
  "voxel",
  "sprite",
  "light",
  "region",
  "tile",
] as const;

export type EditorViewportSelectionKind =
  (typeof EDITOR_VIEWPORT_SELECTION_KINDS)[number];

export type EditorSelectionFilter = Record<
  EditorViewportSelectionKind,
  boolean
>;

export const DEFAULT_EDITOR_SELECTION_FILTER: Readonly<EditorSelectionFilter> =
  Object.freeze({
    voxel: true,
    sprite: true,
    light: true,
    region: true,
    tile: true,
  });

/** Safely restores a persisted filter while defaulting new kinds to enabled. */
export function normalizeEditorSelectionFilter(
  value: unknown,
): EditorSelectionFilter {
  const record =
    value && typeof value === "object"
      ? (value as Partial<Record<EditorViewportSelectionKind, unknown>>)
      : {};
  return Object.fromEntries(
    EDITOR_VIEWPORT_SELECTION_KINDS.map((kind) => [
      kind,
      typeof record[kind] === "boolean" ? record[kind] : true,
    ]),
  ) as EditorSelectionFilter;
}

/**
 * Applies authoring filters to a front-to-back viewport hit stack.
 * Locked scene objects are skipped in the viewport, but remain accessible in
 * the Outliner where they can be explicitly selected and unlocked.
 */
export function filterEditorSelectionStack<
  TItem extends { kind: EditorViewportSelectionKind },
>(
  items: readonly TItem[],
  filter: Readonly<EditorSelectionFilter>,
  isLocked: (item: TItem) => boolean = () => false,
): TItem[] {
  return items.filter((item) => filter[item.kind] && !isLocked(item));
}

/**
 * `camera_bound` is an editor overlay, not a placeable object.
 * Including it in the viewport hit stack steals the first click from tiles
 * on maps that wrap the whole playable area.
 */
export function includeRegionInViewportPick(kind: MapRegionKind): boolean {
  return kind !== "camera_bound";
}

