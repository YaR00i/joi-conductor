export const PLAY_CAMERA_YAW_SENSITIVITY = 0.0045;

export function playCameraYawFromMovement(
  movementX: number,
  sensitivity = PLAY_CAMERA_YAW_SENSITIVITY,
): number {
  if (!Number.isFinite(movementX) || movementX === 0) return 0;
  return -movementX * sensitivity;
}

export function playCameraPitchFromMovement(
  movementY: number,
  sensitivity = PLAY_CAMERA_YAW_SENSITIVITY,
): number {
  if (!Number.isFinite(movementY) || movementY === 0) return 0;
  return movementY * sensitivity;
}

/** Coalesce irregular pointer events into one camera update per render frame. */
export function accumulatePlayLookMovement(
  pendingMovementX: number,
  movementX: number,
): number {
  return Number.isFinite(movementX)
    ? pendingMovementX + movementX
    : pendingMovementX;
}

export function isPlayMenuToggleKey(ev: {
  code: string;
  key: string;
}): boolean {
  return ev.code === "Escape" || ev.key === "Escape";
}

export function playLookKeepsPointerLock(opts: {
  paused: boolean;
  finished: boolean;
  awaitingLoot: boolean;
}): boolean {
  return !opts.paused && !opts.finished && !opts.awaitingLoot;
}

export function playLookActive(opts: {
  paused: boolean;
  finished: boolean;
  awaitingLoot: boolean;
}): boolean {
  return playLookKeepsPointerLock(opts);
}

export function playLookWantsPointerLock(opts: {
  paused: boolean;
  finished: boolean;
  awaitingLoot: boolean;
  warmupComplete?: boolean;
}): boolean {
  return playLookKeepsPointerLock(opts);
}

export function playCanvasCursor(lookActive: boolean): "none" | "default" {
  return lookActive ? "none" : "default";
}

export function playCursorClipShouldApply(
  looking: boolean,
  windowFocused: boolean,
): boolean {
  return looking && windowFocused;
}

export function playCursorClipCssRect(
  bounds: { left: number; top: number; width: number; height: number },
  inset = 2,
): { left: number; top: number; width: number; height: number } | null {
  const width = Math.max(0, Math.round(bounds.width) - inset * 2);
  const height = Math.max(0, Math.round(bounds.height) - inset * 2);
  if (width < 8 || height < 8) return null;
  return {
    left: Math.round(bounds.left + inset),
    top: Math.round(bounds.top + inset),
    width,
    height,
  };
}

export function syncPlayCursorClip(
  looking: boolean,
  target: HTMLElement | null,
  windowFocused = typeof document !== "undefined" ? document.hasFocus() : false,
): void {
  const api =
    typeof window !== "undefined" ? window.joiDesktop?.cursor : undefined;
  if (!api?.clip || !api?.unclip) return;
  if (!playCursorClipShouldApply(looking, windowFocused) || !target) {
    void api.unclip();
    return;
  }
  void api.clip();
}

export function warpPlayCursorIfNeeded(
  looking: boolean,
  pointerLocked: boolean,
): boolean {
  if (!looking || pointerLocked) return false;
  if (typeof window === "undefined") return false;
  const warpCenter = window.joiDesktop?.cursor?.warpCenter;
  if (!warpCenter) return false;
  warpCenter();
  return true;
}

export function playLookTakeMove(skipRemaining: number): {
  apply: boolean;
  skipRemaining: number;
} {
  if (skipRemaining > 0) {
    return { apply: false, skipRemaining: skipRemaining - 1 };
  }
  return { apply: true, skipRemaining: 0 };
}

export function playLookWarpSkipCount(
  pointerLocked: boolean,
  cursorWarped = !pointerLocked,
): number {
  return pointerLocked || !cursorWarped ? 0 : 2;
}

export function releasePlayCursorClip(): void {
  if (typeof window === "undefined") return;
  void window.joiDesktop?.cursor?.unclip?.();
}

/**
 * Chromium refuses requestPointerLock for ~1.25s after the user exits with Esc.
 * https://w3c.github.io/pointerlock/ — default unlock gesture MUST fail re-lock
 * even with a fresh click. Programmatic exitPointerLock() can re-lock immediately.
 */
export const PLAY_POINTER_LOCK_RELOCK_MS = 1500;

/** Alt-tab / hidden tab: freeze play. Do not auto-resume on focus. */
export function playBackgroundShouldPause(opts: {
  warmupComplete: boolean;
  movementFrozen: boolean;
}): boolean {
  return opts.warmupComplete === true && opts.movementFrozen !== true;
}

export function playPointerLockRelockReady(
  unlockedAtMs: number,
  nowMs: number,
  cooldownMs = PLAY_POINTER_LOCK_RELOCK_MS,
): boolean {
  return nowMs >= unlockedAtMs + cooldownMs;
}

export const PLAY_LOOK_LOCK_UI_SELECTOR =
  "button, input, select, textarea, a, .ember-hud, .ember-play-bar, .ember-play__menu, .ember-shop-overlay, .ember-inv-overlay, .ember-save-panel, .ember-save-debug";

export function playPointerDownShouldLock(
  insideShell: boolean,
  isUiControl: boolean,
): boolean {
  return insideShell && !isUiControl;
}

/** Lock is valid on the canvas, play stage, shell, or any node inside them. */
export function isPlayPointerLockTarget(
  locked: object | null,
  ...targets: Array<object | null | undefined>
): boolean {
  if (locked == null) return false;
  for (const target of targets) {
    if (target == null) continue;
    if (locked === target) return true;
    if (
      typeof Node !== "undefined" &&
      locked instanceof Node &&
      target instanceof Node &&
      (target.contains(locked) || locked.contains(target))
    ) {
      return true;
    }
  }
  return false;
}

let playPointerLockPending: HTMLElement | null = null;

/**
 * Plain requestPointerLock only. Options like `unadjustedMovement` reject in
 * Electron and consume the user gesture, so the cursor never actually locks.
 */
export function requestPlayPointerLock(element: HTMLElement): void {
  if (document.pointerLockElement === element) return;
  if (playPointerLockPending === element) {
    if (document.pointerLockElement) return;
    playPointerLockPending = null;
  }
  playPointerLockPending = element;
  const clearPending = () => {
    if (playPointerLockPending === element) playPointerLockPending = null;
  };
  try {
    const result = element.requestPointerLock();
    if (result && typeof (result as Promise<void>).then === "function") {
      void (result as Promise<void>).then(clearPending, clearPending);
      return;
    }
  } catch {
    /* some embeds throw instead of returning a rejected promise */
  }
  clearPending();
}
