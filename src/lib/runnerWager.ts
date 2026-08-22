/**
 * Pre-run wager for the runner: stake cinders before the run — beat the boss
 * and the stake doubles, wipe and it burns. The stake is deducted when the
 * run starts (committed), the payout lands with the claim.
 */

export const WAGER_OPTIONS: readonly number[] = [0, 5, 10, 20, 40];

export function isWagerOption(n: unknown): n is number {
  return typeof n === "number" && WAGER_OPTIONS.includes(n);
}

export interface WagerVerdict {
  stake: number;
  /** True when the run survived and the stake doubles. */
  won: boolean;
  /** Cinders paid back on top of the run total at claim time. */
  payout: number;
}

export function wagerVerdict(stake: number, survived: boolean): WagerVerdict {
  if (stake <= 0) return { stake: 0, won: false, payout: 0 };
  return survived
    ? { stake, won: true, payout: stake * 2 }
    : { stake, won: false, payout: 0 };
}
