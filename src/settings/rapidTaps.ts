/** Presses on About that unlock the Diagnostics category. */
export const DIAGNOSTICS_UNLOCK_TAPS = 7;
/** Longest pause between two presses that still counts as "quickly". */
export const RAPID_TAP_GAP_MS = 700;

/**
 * Counts presses made in quick succession, like the "tap 7 times on the
 * build number" of Android: a pause longer than `maxGapMs` starts over.
 */
export class RapidTapCounter {
  private count = 0;
  private last = -Infinity;

  constructor(
    private readonly needed: number = DIAGNOSTICS_UNLOCK_TAPS,
    private readonly maxGapMs: number = RAPID_TAP_GAP_MS,
  ) {}

  /** Records a press; `true` when it completes the series. */
  tap(now: number = Date.now()): boolean {
    this.count = now - this.last <= this.maxGapMs ? this.count + 1 : 1;
    this.last = now;
    if (this.count >= this.needed) {
      this.count = 0;
      this.last = -Infinity;
      return true;
    }
    return false;
  }
}

let unlocked = false;

/** Whether Diagnostics was unlocked since the plugin started. */
export function diagnosticsUnlocked(): boolean {
  return unlocked;
}

export function unlockDiagnostics(): void {
  unlocked = true;
}
