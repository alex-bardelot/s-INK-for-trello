import {TrelloBoardCard} from '../trello';

/** Number of lists shown side by side on the board view. */
export type ColumnCount = 1 | 2 | 3;

export const COLUMN_COUNTS: readonly ColumnCount[] = [1, 2, 3];

export type Orientation = 'portrait' | 'landscape';

/** Column count used until the user picks one, per orientation. */
export const DEFAULT_COLUMNS: Readonly<Record<Orientation, ColumnCount>> = {
  portrait: 2,
  landscape: 3,
};

/** Returns the column count that follows `current` (1 → 2 → 3 → 1). */
export function nextColumnCount(current: ColumnCount): ColumnCount {
  const index = COLUMN_COUNTS.indexOf(current);
  return COLUMN_COUNTS[(index + 1) % COLUMN_COUNTS.length];
}

export function orientationOf(width: number, height: number): Orientation {
  return width > height ? 'landscape' : 'portrait';
}

/** Number of pages needed to show `itemCount` items, `perPage` at a time (at least 1). */
export function pageCount(itemCount: number, perPage: number): number {
  return Math.max(1, Math.ceil(itemCount / Math.max(1, perPage)));
}

/** Clamps a page index to the pages that exist. */
export function clampPage(
  page: number,
  itemCount: number,
  perPage: number,
): number {
  return Math.min(Math.max(0, page), pageCount(itemCount, perPage) - 1);
}

/**
 * Number of fixed-height cards that fit entirely in a column body, so that
 * no card is ever drawn under the column's page controls.
 */
export function cardsPerPage(
  bodyHeight: number,
  cardHeight: number,
  gap: number,
): number {
  if (bodyHeight <= 0) {
    return 1;
  }
  return Math.max(1, Math.floor((bodyHeight + gap) / (cardHeight + gap)));
}

/** Groups cards by list id, keeping their order. */
export function groupCardsByList(
  cards: readonly TrelloBoardCard[],
): ReadonlyMap<string, TrelloBoardCard[]> {
  const byList = new Map<string, TrelloBoardCard[]>();
  for (const card of cards) {
    const list = byList.get(card.idList);
    if (list) {
      list.push(card);
    } else {
      byList.set(card.idList, [card]);
    }
  }
  return byList;
}

export type SwipeDirection = 'left' | 'right' | 'up' | 'down';

/** Minimum travel, in pixels, for a two-finger swipe to turn a page. */
export const SWIPE_MIN_DISTANCE = 80;

/**
 * Classifies a gesture by its dominant axis. Returns `null` when the travel
 * is too short or too diagonal to be a deliberate swipe.
 */
export function classifySwipe(
  dx: number,
  dy: number,
  minDistance = SWIPE_MIN_DISTANCE,
): SwipeDirection | null {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (ax >= minDistance && ax > ay * 1.5) {
    return dx < 0 ? 'left' : 'right';
  }
  if (ay >= minDistance && ay > ax * 1.5) {
    return dy < 0 ? 'up' : 'down';
  }
  return null;
}
