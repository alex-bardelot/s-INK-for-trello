import {estimateTextSize, Rect} from './hitTest';
import {layoutStrokeText, Segment, strokeTextWidth} from './strokeFont';

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
export const MARK_LABEL_GAP_PX = 10;
/** Space between the label's baseline and the line. */
export const MARK_LABEL_RISE_PX = 14;
/** Height of the label's capitals. */
export const MARK_CAP_HEIGHT_PX = 24;

/** Label of a linked selection: `s-INK/c` for a card, `s-INK/b` for a board. */
export function markLabel(kind: 'card' | 'board'): string {
  return `s-INK/${kind === 'card' ? 'c' : 'b'}`;
}

/** Matches the label text box drawn by versions 0.30.x. */
export const MARK_LABEL_PATTERN = /^s-INK\/[cb]$/;

/** What marks a linked selection, in screen pixels. */
export interface LinkMarkLayout {
  /** Ends of the line under the selection and its label. */
  line: Segment;
  /** The label, drawn with line segments. */
  label: Segment[];
  labelRect: Rect;
}

/**
 * Lays out the mark of a linked selection, like the note app's own links:
 * a line under it, and at its right end, standing on the line, a small
 * `s-INK/c` (card) or `s-INK/b` (board) label in place of the chain icon.
 * The label is drawn with line segments, so that it moves with the
 * selection in a lasso. Everything stays on the page.
 */
export function layoutLinkMark(
  bounds: Rect,
  kind: 'card' | 'board',
  pageWidth: number,
  pageHeight: number,
): LinkMarkLayout {
  const text = markLabel(kind);
  const width = strokeTextWidth(text, MARK_CAP_HEIGHT_PX);
  const y = Math.min(bounds.bottom + MARK_LINE_GAP_PX, pageHeight - 1);
  const left = Math.max(
    0,
    Math.min(bounds.right + MARK_LABEL_GAP_PX, pageWidth - 1 - width),
  );
  const baseline = Math.max(MARK_CAP_HEIGHT_PX, y - MARK_LABEL_RISE_PX);
  const {segments} = layoutStrokeText(text, left, baseline, MARK_CAP_HEIGHT_PX);
  return {
    line: [
      {x: Math.max(0, Math.min(bounds.left, left)), y},
      {x: left + width, y},
    ],
    label: segments,
    labelRect: {
      left,
      top: baseline - MARK_CAP_HEIGHT_PX,
      right: left + width,
      bottom: baseline,
    },
  };
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
/** Top of the title of a card's note: just under the page's upper edge. */
export const TITLE_TOP = 120;

/**
 * Lays a link out as the title of a page: centred across the page, near
 * its top.
 */
export function layoutTitleLink(
  name: string,
  link: string,
  pageWidth: number,
): LinkLayout {
  const width = linkBounds(layoutLink(name, link, {x: 0, y: 0})).right;
  return layoutLink(name, link, {
    x: Math.max(0, Math.round((pageWidth - width) / 2)),
    y: TITLE_TOP,
  });
}

/** Rectangle around the icon and the text of a link. */
export function linkBounds(layout: LinkLayout): Rect {
  return {
    left: Math.min(layout.iconRect.left, layout.textRect.left),
    top: Math.min(layout.iconRect.top, layout.textRect.top),
    right: Math.max(layout.iconRect.right, layout.textRect.right),
    bottom: Math.max(layout.iconRect.bottom, layout.textRect.bottom),
  };
}

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
