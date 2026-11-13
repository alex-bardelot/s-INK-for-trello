/**
 * Line width of the icons drawn with views (close, refresh), so that icons
 * shown side by side have the same weight.
 */
export function iconStroke(size: number): number {
  return Math.max(3, Math.round(size * 0.1));
}
