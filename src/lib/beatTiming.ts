/** Shared timing so visual balls and metronome stay in sync. */
export const BEAT_LEAD_IN_MS = 2400;
export const BEAT_LOOK_AHEAD_MS = 2400;
export const BEAT_LOOK_BEHIND_MS = 800;
/** After hit line → fully off the left edge */
export const BEAT_EXIT_TAIL_MS = Math.ceil(BEAT_LOOK_AHEAD_MS * 0.55);
/**
 * Pause after a block ends before the next block's shared beat origin
 * (metronome + highway). Old balls keep exiting in parallel.
 */
export const BEAT_BLOCK_GAP_MS = BEAT_EXIT_TAIL_MS + 800;