import {estimateTextSize, Rect} from './hitTest';

/** Font size of the text of a new link. */
export const LINK_FONT_SIZE = 36;
/** Side of the app icon placed before the text (twice the 48 px icon). */
export const LINK_ICON_SIZE = 96;
/** Space between the icon and the text. */
export const LINK_ICON_GAP = 16;
/** Longest name kept; longer names are cut with an ellipsis. */
export const LINK_NAME_MAX_LENGTH = 40;

/** What a new link places on the page, in screen pixels. */
export interface LinkLayout {
  text: string;
  iconRect: Rect;
  textRect: Rect;
}

/** Cuts a name to `LINK_NAME_MAX_LENGTH` characters. */
export function shortName(name: string): string {
  const characters = Array.from(name.trim().replace(/\s+/g, ' '));
  return characters.length > LINK_NAME_MAX_LENGTH
    ? `${characters.slice(0, LINK_NAME_MAX_LENGTH - 1).join('')}…`
    : characters.join('');
}

/**
 * Lays out a new link from its top left corner: the app icon, then a text
 * box sized to the name and the link, both vertically centered on the
 * taller of the two.
 */
export function layoutLink(
  name: string,
  link: string,
  origin: {x: number; y: number},
): LinkLayout {
  const text = `${shortName(name)}\n${link}`;
  const size = estimateTextSize(text, LINK_FONT_SIZE);
  const height = Math.max(size.height, LINK_ICON_SIZE);
  const iconTop = origin.y + Math.round((height - LINK_ICON_SIZE) / 2);
  const textTop = origin.y + Math.round((height - size.height) / 2);
  const textLeft = origin.x + LINK_ICON_SIZE + LINK_ICON_GAP;
  return {
    text,
    iconRect: {
      left: origin.x,
      top: iconTop,
      right: origin.x + LINK_ICON_SIZE,
      bottom: iconTop + LINK_ICON_SIZE,
    },
    textRect: {
      left: textLeft,
      top: textTop,
      right: textLeft + size.width,
      bottom: textTop + size.height,
    },
  };
}
