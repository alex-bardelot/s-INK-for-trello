/**
 * A tiny stroke font to draw the `s-INK/c` and `s-INK/b` labels of linked
 * selections with line segments. Drawn this way, a label is made of the
 * same kind of elements as handwriting and moves with it in a lasso, which
 * a text box does not.
 *
 * Glyphs are polylines in a box one unit high: y = 0 is the top of the
 * capitals, y = 1 the baseline; lowercase letters start at y = 0.4.
 */

type UnitPoint = readonly [number, number];

interface Glyph {
  /** Advance width, in units. */
  width: number;
  /** Polylines, drawn as consecutive segments. */
  paths: readonly (readonly UnitPoint[])[];
}

const GLYPHS: Readonly<Record<string, Glyph>> = {
  s: {
    width: 0.55,
    paths: [
      [
        [0.5, 0.48],
        [0.38, 0.4],
        [0.14, 0.4],
        [0.03, 0.5],
        [0.1, 0.64],
        [0.42, 0.75],
        [0.52, 0.87],
        [0.4, 1],
        [0.12, 1],
        [0, 0.92],
      ],
    ],
  },
  '-': {
    width: 0.45,
    paths: [
      [
        [0.05, 0.68],
        [0.4, 0.68],
      ],
    ],
  },
  I: {
    width: 0.2,
    paths: [
      [
        [0.08, 0],
        [0.08, 1],
      ],
    ],
  },
  N: {
    width: 0.72,
    paths: [
      [
        [0, 1],
        [0, 0],
        [0.6, 1],
        [0.6, 0],
      ],
    ],
  },
  K: {
    width: 0.66,
    paths: [
      [
        [0, 0],
        [0, 1],
      ],
      [
        [0.56, 0],
        [0, 0.62],
      ],
      [
        [0.2, 0.42],
        [0.6, 1],
      ],
    ],
  },
  '/': {
    width: 0.48,
    paths: [
      [
        [0, 1],
        [0.4, 0],
      ],
    ],
  },
  c: {
    width: 0.56,
    paths: [
      [
        [0.5, 0.48],
        [0.37, 0.4],
        [0.15, 0.4],
        [0.02, 0.54],
        [0.02, 0.86],
        [0.15, 1],
        [0.37, 1],
        [0.5, 0.92],
      ],
    ],
  },
  b: {
    width: 0.62,
    paths: [
      [
        [0, 0],
        [0, 1],
      ],
      [
        [0, 0.54],
        [0.15, 0.41],
        [0.38, 0.4],
        [0.53, 0.54],
        [0.53, 0.86],
        [0.38, 1],
        [0.15, 1],
        [0, 0.88],
      ],
    ],
  },
};

/** Space between two glyphs, in units. */
const LETTER_SPACING = 0.14;

export type Point = {x: number; y: number};
export type Segment = [Point, Point];

/**
 * Lays out a text as line segments.
 *
 * @param left - Left edge of the first glyph, in pixels.
 * @param baseline - Baseline, in pixels.
 * @param capHeight - Height of the capitals, in pixels.
 * @returns The segments and the width of the drawn text. Characters
 *   without a glyph are skipped.
 */
export function layoutStrokeText(
  text: string,
  left: number,
  baseline: number,
  capHeight: number,
): {segments: Segment[]; width: number} {
  const segments: Segment[] = [];
  let x = 0;
  let drawn = 0;
  const top = baseline - capHeight;
  const toPage = ([u, v]: UnitPoint): Point => ({
    x: Math.round(left + (x + u) * capHeight),
    y: Math.round(top + v * capHeight),
  });
  for (const character of Array.from(text)) {
    const glyph = GLYPHS[character];
    if (!glyph) {
      continue;
    }
    if (drawn > 0) {
      x += LETTER_SPACING;
    }
    for (const path of glyph.paths) {
      for (let index = 1; index < path.length; index += 1) {
        segments.push([toPage(path[index - 1]), toPage(path[index])]);
      }
    }
    x += glyph.width;
    drawn += 1;
  }
  return {segments, width: Math.round(x * capHeight)};
}

/** Width of a text drawn by {@link layoutStrokeText}, in pixels. */
export function strokeTextWidth(text: string, capHeight: number): number {
  return layoutStrokeText(text, 0, capHeight, capHeight).width;
}
