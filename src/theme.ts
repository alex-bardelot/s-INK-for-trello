/**
 * Design tokens tuned for the Supernote E Ink display: pure black on white
 * (no greys, which render poorly), generous sizes for pen and finger input.
 */

export const colors = {
  background: '#FFFFFF',
  foreground: '#000000',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 40,
} as const;

export const typography = {
  body: 22,
  label: 24,
  heading: 30,
  icon: 28,
  title: 40,
} as const;

export const borders = {
  width: 2,
  radius: 6,
} as const;
