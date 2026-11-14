/**
 * Turns the raw touch events of `PluginManager.registerMotionListener`
 * into finger taps.
 */

/** The fields of the SDK's `MotionEvent` used here, all optional: the host may leave some out. */
export interface TouchSample {
  /** Android action: 0 = down, 1 = up, 2 = move, 3 = cancel. */
  action?: number;
  x?: number;
  y?: number;
  eventTime?: number;
  pointerCount?: number;
  /** 0 = unknown, 1 = finger, 2 = pen. */
  toolType?: number;
  pointers?: {x?: number; y?: number; toolType?: number}[] | null;
}

/** A touch event with every field resolved. */
export interface Touch {
  action: number;
  x: number;
  y: number;
  time: number;
  pointerCount: number;
  toolType: number;
}

export type Tap = {x: number; y: number};

/** How the last finger release was judged, for the diagnostics. */
export interface Release {
  durationMs: number;
  distancePx: number;
  tap: boolean;
}

export const MotionAction = {Down: 0, Up: 1, Move: 2, Cancel: 3} as const;
export const ToolType = {Finger: 1, Pen: 2} as const;

/** Longest press still counted as a tap. */
export const TAP_MAX_DURATION_MS = 350;
/** Farthest the finger may move during a tap, in screen pixels. */
export const TAP_MAX_DISTANCE_PX = 24;

function finite(...values: (number | undefined)[]): number | undefined {
  return values.find(
    (value): value is number =>
      typeof value === 'number' && Number.isFinite(value),
  );
}

/**
 * Resolves a raw event: the position and tool are taken from the event, or
 * else from its first pointer; the time defaults to the reception time.
 *
 * @returns `null` if the event has no action or no position.
 */
export function normalizeTouch(
  event: TouchSample,
  now: number = Date.now(),
): Touch | null {
  const pointer = event.pointers?.[0];
  const action = finite(event.action);
  const x = finite(event.x, pointer?.x);
  const y = finite(event.y, pointer?.y);
  if (action === undefined || x === undefined || y === undefined) {
    return null;
  }
  return {
    action,
    x,
    y,
    time: finite(event.eventTime) ?? now,
    pointerCount: finite(event.pointerCount, event.pointers?.length) ?? 1,
    toolType: finite(event.toolType, pointer?.toolType) ?? 0,
  };
}

/**
 * Detects single-finger taps: a press and release close together in time
 * and space. Pen events, multi-finger gestures and drags are ignored.
 */
export class TapDetector {
  private start: {x: number; y: number; time: number} | null = null;
  private moved = false;

  /**
   * The release judged by the last `feed` call, whether it made a tap or
   * not; `null` if that event was not an accepted release.
   */
  lastRelease: Release | null = null;

  /**
   * @param acceptsTool - Whether taps made with a tool count, by
   *   `toolType`. By default every tool but the pen.
   */
  constructor(
    private readonly acceptsTool: (toolType: number) => boolean = toolType =>
      toolType !== ToolType.Pen,
  ) {}

  /**
   * Feeds one touch event.
   *
   * @returns The tap position when this event ends a tap, else `null`.
   */
  feed(touch: Touch): Tap | null {
    this.lastRelease = null;
    if (!this.acceptsTool(touch.toolType) || touch.pointerCount > 1) {
      this.start = null;
      return null;
    }
    switch (touch.action) {
      case MotionAction.Down:
        this.start = {x: touch.x, y: touch.y, time: touch.time};
        this.moved = false;
        return null;
      case MotionAction.Move:
        if (this.start && this.distance(touch) > TAP_MAX_DISTANCE_PX) {
          this.moved = true;
        }
        return null;
      case MotionAction.Up: {
        const start = this.start;
        this.start = null;
        if (!start) {
          return null;
        }
        const durationMs = touch.time - start.time;
        const distancePx = this.distance(touch, start);
        const tap =
          !this.moved &&
          distancePx <= TAP_MAX_DISTANCE_PX &&
          durationMs <= TAP_MAX_DURATION_MS;
        this.lastRelease = {durationMs, distancePx, tap};
        return tap ? {x: start.x, y: start.y} : null;
      }
      default:
        this.start = null;
        return null;
    }
  }

  private distance(
    touch: Touch,
    start: {x: number; y: number} | null = this.start,
  ): number {
    return start
      ? Math.hypot(touch.x - start.x, touch.y - start.y)
      : Number.POSITIVE_INFINITY;
  }
}
