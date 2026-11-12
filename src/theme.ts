/**
 * Design tokens tuned for the Supernote E Ink display: pure black on white
 * (no greys, which render poorly), generous sizes for pen and finger input.
 */

export const colors = {
  background: '#FFFFFF',
  foreground: '#000000',
} as const;

export const spacing = {
  sm: 8,
  md: 16,
  lg: 24,
} as const;

export const typography = {
  icon: 28,
  title: 40,
} as const;
