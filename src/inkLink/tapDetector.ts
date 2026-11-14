/**
 * Turns the raw touch events of `PluginManager.registerMotionListener`
 * into finger taps.
 */

/** The fields of the SDK's `MotionEvent` used here. */
export interface TouchSample {
  /** Android action: 0 = down, 1 = up, 2 = move, 3 = cancel. */
  action: number;
  x: number;
  y: number;
  eventTime: number;
  pointerCount: number;
  /** 0 = unknown, 1 = finger, 2 = pen. */
  toolType: number;
}

export type Tap = {x: number; y: number};

export const MotionAction = {Down: 0, Up: 1, Move: 2, Cancel: 3} as const;
export const ToolType = {Finger: 1, Pen: 2} as const;

/** Longest press still counted as a tap. */
export const TAP_MAX_DURATION_MS = 350;
/** Farthest the finger may move during a tap, in screen pixels. */
export const TAP_MAX_DISTANCE_PX = 24;

/**
 * Detects single-finger taps: a press and release close together in time
 * and space. Pen events, multi-finger gestures and drags are ignored.
 */
export class TapDetector {
  private start: {x: number; y: number; time: number} | null = null;

  /**
   * Feeds one touch event.
   *
   * @returns The tap position when this event ends a tap, else `null`.
   */
  feed(event: TouchSample): Tap | null {
    if (event.toolType !== ToolType.Finger || event.pointerCount > 1) {
      this.start = null;
      return null;
    }
    switch (event.action) {
      case MotionAction.Down:
        this.start = {x: event.x, y: event.y, time: event.eventTime};
        return null;
      case MotionAction.Move:
        if (this.start && !this.isClose(event)) {
          this.start = null;
        }
        return null;
      case MotionAction.Up: {
        const start = this.start;
        this.start = null;
        if (
          start &&
          this.isClose(event, start) &&
          event.eventTime - start.time <= TAP_MAX_DURATION_MS
        ) {
          return {x: start.x, y: start.y};
        }
        return null;
      }
      default:
        this.start = null;
        return null;
    }
  }

  private isClose(
    event: TouchSample,
    start: {x: number; y: number} | null = this.start,
  ): boolean {
    return (
      start !== null &&
      Math.hypot(event.x - start.x, event.y - start.y) <= TAP_MAX_DISTANCE_PX
    );
  }
}
