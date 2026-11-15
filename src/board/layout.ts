import {TrelloBoardCard} from '../trello';

/** Number of lists shown side by side on the board view. */
export type ColumnCount = 1 | 2 | 3 | 4;

export type Orientation = 'portrait' | 'landscape';

/** Column counts offered per orientation: four only fit in landscape. */
export const COLUMN_COUNTS: Readonly<
  Record<Orientation, readonly ColumnCount[]>
> = {
  portrait: [1, 2, 3],
  landscape: [1, 2, 3, 4],
};

/** Column count used until the user picks one, per orientation. */
export const DEFAULT_COLUMNS: Readonly<Record<Orientation, ColumnCount>> = {
  portrait: 2,
  landscape: 3,
};

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

/** A page of cards: indexes `[start, end)` in the list. */
export interface CardPage {
  start: number;
  end: number;
}

/**
 * Splits cards of measured heights into pages that fit in `available`
 * pixels, so that no card is ever cut or drawn under the page controls.
 * A card taller than the column gets a page of its own.
 */
export function paginate(
  heights: readonly number[],
  available: number,
  gap: number,
): CardPage[] {
  const pages: CardPage[] = [];
  let start = 0;
  let used = 0;
  heights.forEach((height, index) => {
    if (index > start && used + gap + height > available) {
      pages.push({start, end: index});
      start = index;
      used = height;
    } else {
      used = index === start ? height : used + gap + height;
    }
  });
  pages.push({start, end: heights.length});
  return pages;
}

/**
 * The page that holds the card at `index`, or `null` if none does (the
 * card is not in the list: `index` is -1).
 */
export function pageOfItem(
  pages: readonly CardPage[],
  index: number,
): number | null {
  const found = pages.findIndex(
    page => index >= page.start && index < page.end,
  );
  return found >= 0 ? found : null;
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
