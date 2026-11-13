/** How long ago a board was last modified, for the board tiles. */
export type LastActivity =
  | {kind: 'today'}
  | {kind: 'yesterday'}
  | {kind: 'daysAgo'; days: number}
  | {kind: 'date'; date: Date};

/** Up to this many days, the age is shown as "N days ago". */
export const DAYS_AGO_LIMIT = 6;

/**
 * Classifies the last activity date by calendar days in the local time
 * zone: today, yesterday, a few days ago, or an older date. Returns `null`
 * for a missing or invalid date. Dates in the future count as today.
 */
export function describeLastActivity(
  iso: string | null | undefined,
  now: Date = new Date(),
): LastActivity | null {
  if (!iso) {
    return null;
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  const startOfDay = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);
  if (days <= 0) {
    return {kind: 'today'};
  }
  if (days === 1) {
    return {kind: 'yesterday'};
  }
  if (days <= DAYS_AGO_LIMIT) {
    return {kind: 'daysAgo', days};
  }
  return {kind: 'date', date};
}
