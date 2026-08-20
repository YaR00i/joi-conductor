export type EditorPickCycleState = Readonly<{
  signature: string;
  clientX: number;
  clientY: number;
  index: number;
}>;

/** Advance through a stable front-to-back hit stack on repeated nearby clicks. */
export function advanceEditorPickCycle(
  previous: EditorPickCycleState | null,
  signature: string,
  clientX: number,
  clientY: number,
  itemCount: number,
  tolerancePx = 6,
): { state: EditorPickCycleState | null; index: number } {
  if (itemCount <= 0) return { state: null, index: -1 };
  const sameSpot =
    previous != null &&
    previous.signature === signature &&
    Math.abs(previous.clientX - clientX) <= tolerancePx &&
    Math.abs(previous.clientY - clientY) <= tolerancePx;
  const index = sameSpot ? (previous.index + 1) % itemCount : 0;
  return {
    state: { signature, clientX, clientY, index },
    index,
  };
}
