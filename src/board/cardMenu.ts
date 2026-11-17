/** A rectangle in the page, in layout points from its top left corner. */
export interface MenuRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface MenuSize {
  width: number;
  height: number;
}

export interface MenuPlacement {
  left: number;
  top: number;
  /** Side of the card the menu stands on. */
  side: 'left' | 'right';
}

/**
 * Where the menu of a card stands: beside the card, on its right when
 * there is room for it, else on its left; with room on neither side, on
 * the roomier one, over the card but within the page. Its top is the
 * card's, moved up as far as needed for the menu to fit in the page.
 *
 * @param card - The card pressed, in the coordinates of `page`.
 * @param page - Size of the area the menu is drawn in.
 * @param gap - Space between the card and the menu, and the menu's margin
 *   to the edges of the page.
 */
export function placeCardMenu(
  card: MenuRect,
  menu: MenuSize,
  page: MenuSize,
  gap: number,
): MenuPlacement {
  const right = card.left + card.width;
  const roomRight = page.width - right - 2 * gap;
  const roomLeft = card.left - 2 * gap;

  let left: number;
  let side: MenuPlacement['side'];
  if (roomRight >= menu.width) {
    side = 'right';
    left = right + gap;
  } else if (roomLeft >= menu.width) {
    side = 'left';
    left = card.left - gap - menu.width;
  } else {
    side = roomRight >= roomLeft ? 'right' : 'left';
    left = side === 'right' ? right + gap : card.left - gap - menu.width;
  }

  return {
    side,
    left: clamp(left, gap, page.width - gap - menu.width),
    top: clamp(card.top, gap, page.height - gap - menu.height),
  };
}

/** `value` within `[min, max]`; `min` wins when the range is empty. */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}
