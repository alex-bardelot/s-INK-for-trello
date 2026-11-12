/**
 * Trello label colors rendered as greys on the E Ink display: each color
 * keeps its relative lightness, so labels stay distinguishable without
 * colors, and the text switches to white on dark chips.
 */

/** Approximate lightness (0–255) of Trello's base label colors. */
const BASE_LIGHTNESS: Readonly<Record<string, number>> = {
  yellow: 225,
  lime: 200,
  sky: 190,
  green: 175,
  orange: 175,
  pink: 160,
  purple: 140,
  red: 130,
  blue: 115,
  black: 70,
};

const DEFAULT_LIGHTNESS = 200;
const VARIANT_SHIFT = 50;

export interface LabelShade {
  background: string;
  text: string;
}

function grey(level: number): string {
  const hex = Math.round(level).toString(16).padStart(2, '0');
  return `#${hex}${hex}${hex}`.toUpperCase();
}

/** Maps a Trello label color (`green`, `red_dark`, `sky_light`, `null`…) to a grey chip. */
export function labelShade(color: string | null | undefined): LabelShade {
  const [base, variant] = (color ?? '').split('_');
  let level = BASE_LIGHTNESS[base] ?? DEFAULT_LIGHTNESS;
  if (variant === 'dark') {
    level -= VARIANT_SHIFT;
  } else if (variant === 'light') {
    level += VARIANT_SHIFT;
  }
  level = Math.min(240, Math.max(30, level));
  return {background: grey(level), text: level < 140 ? '#FFFFFF' : '#000000'};
}
