import {
  estimateTextSize,
  LINE_HEIGHT_RATIO,
  Rect,
  TEXT_BOX_PADDING_PX,
} from './hitTest';

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

/** Space between a linked selection and the line drawn under it. */
export const MARK_LINE_GAP_PX = 8;
/** Space between a linked selection and its label. */
export const MARK_LABEL_GAP_PX = 8;
/** Font size of the `s-INK/c` or `s-INK/b` label of a linked selection. */
export const MARK_FONT_SIZE = 32;
/**
 * Average glyph width of the label, as a share of the font size: the
 * device font is narrower than the estimate used to size text boxes.
 */
export const MARK_GLYPH_RATIO = 0.45;

/** Label of a linked selection: `s-INK/c` for a card, `s-INK/b` for a board. */
export function markLabel(kind: 'card' | 'board'): string {
  return `s-INK/${kind === 'card' ? 'c' : 'b'}`;
}

/** Matches the label of a linked selection. */
export const MARK_LABEL_PATTERN = /^s-INK\/[cb]$/;

/** What marks a linked selection, in screen pixels. */
export interface LinkMarkLayout {
  /** Ends of the line under the selection and its label. */
  line: [{x: number; y: number}, {x: number; y: number}];
  label: string;
  labelRect: Rect;
}

/**
 * Lays out the mark of a linked selection, like the note app's own links:
 * a line under it, and at its right end, standing on the line, a small
 * `s-INK/c` (card) or `s-INK/b` (board) label in place of the chain icon.
 * Everything stays on the page.
 */
export function layoutLinkMark(
  bounds: Rect,
  kind: 'card' | 'board',
  pageWidth: number,
  pageHeight: number,
): LinkMarkLayout {
  const label = markLabel(kind);
  // The box keeps the generous estimate so the label never wraps.
  const size = estimateTextSize(label, MARK_FONT_SIZE);
  const y = Math.min(bounds.bottom + MARK_LINE_GAP_PX, pageHeight - 1);
  const labelLeft = Math.max(
    0,
    Math.min(bounds.right + MARK_LABEL_GAP_PX, pageWidth - 1 - size.width),
  );
  // Lowered by its inner margin and line spacing, so the letters, not the
  // box, rest on the line.
  const drop = markLabelDrop();
  const bottom = Math.min(y + drop, pageHeight - 1);
  const labelRect = {
    left: labelLeft,
    top: Math.max(0, bottom - size.height),
    right: labelLeft + size.width,
    bottom,
  };
  const textEnd =
    labelLeft +
    TEXT_BOX_PADDING_PX +
    Math.ceil(Array.from(label).length * MARK_FONT_SIZE * MARK_GLYPH_RATIO);
  return {
    line: [
      {x: Math.max(0, Math.min(bounds.left, labelLeft)), y},
      {x: Math.min(pageWidth - 1, textEnd), y},
    ],
    label,
    labelRect,
  };
}

/**
 * How far below the line the label's box ends: its inner margin plus the
 * line spacing under the letters.
 */
export function markLabelDrop(): number {
  return (
    TEXT_BOX_PADDING_PX +
    Math.round(((LINE_HEIGHT_RATIO - 1) * MARK_FONT_SIZE) / 2)
  );
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
