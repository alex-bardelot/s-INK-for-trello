/**
 * Design tokens tuned for the Supernote E Ink display: black on white, with
 * a few well separated greys for surfaces only (fine shades render poorly),
 * and generous sizes for pen and finger input.
 */

export const colors = {
  background: '#FFFFFF',
  foreground: '#000000',
  /** Header band of the lists on the board view. */
  listHeader: '#5A5A5A',
  listHeaderText: '#FFFFFF',
  /** Outline of label chips, so that light ones stand out on white cards. */
  labelBorder: '#8A8A8A',
  /** Fallback disc behind member initials. */
  avatar: '#D0D0D0',
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
