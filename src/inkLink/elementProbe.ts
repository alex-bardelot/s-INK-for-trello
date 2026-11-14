/**
 * Pure helpers of the lasso diagnostic (see docs/ink-link-tracking.md):
 * bounds and a move-invariant fingerprint of a stroke, and a one-line
 * summary of a note element as the host returns it.
 */

export type Point = {x: number; y: number};
export type Bounds = {left: number; top: number; right: number; bottom: number};

/** Points sampled along a stroke for its fingerprint. */
const FINGERPRINT_SAMPLES = 8;
/** Quantization steps of a sampled point, relative to the bounds. */
const FINGERPRINT_LEVELS = 16;

export function boundsOf(points: readonly Point[]): Bounds | null {
  if (points.length === 0) {
    return null;
  }
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const {x, y} of points) {
    left = Math.min(left, x);
    top = Math.min(top, y);
    right = Math.max(right, x);
    bottom = Math.max(bottom, y);
  }
  return {left, top, right, bottom};
}

/** 32-bit FNV-1a hash, as 8 hex digits. */
/* eslint-disable no-bitwise */
function hash(text: string): string {
  let value = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    value ^= text.charCodeAt(index);
    value = Math.imul(value, 0x01000193);
  }
  return (value >>> 0).toString(16).padStart(8, '0');
}
/* eslint-enable no-bitwise */

/**
 * Fingerprint of a stroke that does not change when the stroke is moved:
 * point count, size and a few points relative to the top left corner,
 * quantized. Resizing changes the size part but not the shape hash, so
 * `n{count}:{shape}` alone also survives a uniform resize.
 *
 * @returns `n{count}:{shape}:{width}x{height}`, or `null` without points.
 */
export function strokeFingerprint(points: readonly Point[]): string | null {
  const bounds = boundsOf(points);
  if (!bounds) {
    return null;
  }
  const width = bounds.right - bounds.left;
  const height = bounds.bottom - bounds.top;
  const samples: string[] = [];
  const count = Math.min(FINGERPRINT_SAMPLES, points.length);
  for (let sample = 0; sample < count; sample += 1) {
    const index =
      count === 1
        ? 0
        : Math.round((sample * (points.length - 1)) / (count - 1));
    const {x, y} = points[index];
    const top = FINGERPRINT_LEVELS - 1;
    const qx = width > 0 ? Math.round(((x - bounds.left) / width) * top) : 0;
    const qy = height > 0 ? Math.round(((y - bounds.top) / height) * top) : 0;
    samples.push(qx.toString(16) + qy.toString(16));
  }
  return `n${points.length}:${hash(samples.join(''))}:${Math.round(
    width,
  )}x${Math.round(height)}`;
}

function rectText(rect: unknown): string | null {
  const value = rect as Partial<Bounds> | null | undefined;
  if (
    !value ||
    typeof value.left !== 'number' ||
    typeof value.top !== 'number' ||
    typeof value.right !== 'number' ||
    typeof value.bottom !== 'number'
  ) {
    return null;
  }
  return `${Math.round(value.left)},${Math.round(value.top)}-${Math.round(
    value.right,
  )},${Math.round(value.bottom)}`;
}

function shorten(text: string, length: number): string {
  return text.length > length ? `${text.slice(0, length - 1)}…` : text;
}

/** Fields of a raw element read by {@link describeElement}. */
export interface RawElement {
  type?: number;
  uuid?: string;
  numInPage?: number;
  /** Not in the SDK typings, but a key of the host (`TrailKey`). */
  trailNum?: number;
  userData?: string | null;
  layerNum?: number;
  status?: number;
  recognizeResult?: {
    up_left_point_x?: number;
    up_left_point_y?: number;
    down_right_point_x?: number;
    down_right_point_y?: number;
  } | null;
  textBox?: {textContentFull?: string | null; textRect?: unknown} | null;
  picture?: {rect?: unknown} | null;
  link?: {
    destPath?: string | null;
    linkType?: number;
    controlTrailNums?: number[] | null;
  } | null;
  [key: string]: unknown;
}

/** Stroke data read through the SDK accessors, if any. */
export interface StrokeProbe {
  pointCount: number;
  /** Bounds of the sampled points, EMR coordinates. */
  bounds: Bounds | null;
  fingerprint: string | null;
}

/**
 * One-line summary of an element: identity fields, `userData`, and the
 * geometry that matters for its type.
 */
export function describeElement(
  element: RawElement,
  stroke?: StrokeProbe | null,
): string {
  const parts = [
    `type ${element.type ?? '?'}`,
    `num ${element.numInPage ?? '?'}`,
  ];
  if (element.trailNum !== undefined) {
    parts.push(`trail ${String(element.trailNum)}`);
  }
  parts.push(`uuid ${shorten(String(element.uuid ?? '?'), 9)}`);
  parts.push(
    `ud ${element.userData ? JSON.stringify(shorten(element.userData, 40)) : '-'}`,
  );
  if (element.layerNum !== undefined) {
    parts.push(`layer ${element.layerNum}`);
  }
  if (stroke) {
    parts.push(`pts ${stroke.pointCount}`);
    const bounds = rectText(stroke.bounds);
    if (bounds) {
      parts.push(`emr ${bounds}`);
    }
    if (stroke.fingerprint) {
      parts.push(`fp ${stroke.fingerprint}`);
    }
  }
  const recognized = element.recognizeResult;
  if (
    recognized &&
    (recognized.down_right_point_x ?? 0) > (recognized.up_left_point_x ?? 0)
  ) {
    parts.push(
      `rec ${rectText({
        left: recognized.up_left_point_x,
        top: recognized.up_left_point_y,
        right: recognized.down_right_point_x,
        bottom: recognized.down_right_point_y,
      })}`,
    );
  }
  const textRect = rectText(element.textBox?.textRect);
  if (textRect) {
    parts.push(`text ${textRect}`);
  }
  const text = element.textBox?.textContentFull;
  if (text) {
    parts.push(JSON.stringify(shorten(text.replace(/\n/g, ' / '), 30)));
  }
  const picture = rectText(element.picture?.rect);
  if (picture) {
    parts.push(`pic ${picture}`);
  }
  if (element.link) {
    const trails = element.link.controlTrailNums;
    parts.push(
      `link ${element.link.linkType ?? '?'} ${JSON.stringify(
        shorten(element.link.destPath ?? '', 40),
      )}${Array.isArray(trails) ? ` trails [${trails.join(',')}]` : ''}`,
    );
  }
  return parts.join(', ');
}

/** Top-level keys of an element whose value is set, sorted. */
export function presentKeys(element: Record<string, unknown>): string {
  return Object.keys(element)
    .filter(key => element[key] !== null && element[key] !== undefined)
    .sort()
    .join(',');
}
