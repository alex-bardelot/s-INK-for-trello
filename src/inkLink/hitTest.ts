import {InkLinkTarget, parseInkLink} from './inkLink';

/** Element types, from `Element.TYPE_*` in the Supernote SDK. */
export const NoteElementType = {
  Picture: 200,
  Text: 500,
  TextDigestQuote: 501,
  TextDigestCreate: 502,
  Link: 600,
} as const;

export type Rect = {left: number; top: number; right: number; bottom: number};

/** The fields of a page element (`PluginFileAPI.getElements`) read here. */
export interface PageElement {
  type: number;
  userData?: string | null;
  textBox?: {
    textContentFull?: string | null;
    textRect?: Rect | null;
    fontSize?: number | null;
  } | null;
  link?: {
    X: number;
    Y: number;
    width: number;
    height: number;
    fullText?: string | null;
    destPath?: string | null;
  } | null;
  /** Picture bounds are in EMR coordinates, not screen pixels. */
  picture?: {rect?: Rect | null} | null;
}

/** Where the link of an element was found. */
export type LinkSource = 'userData' | 'text';

export interface InkLinkElement {
  target: InkLinkTarget;
  source: LinkSource;
  rect: Rect;
}

/** Extra margin around an element that still counts as a hit. */
export const HIT_SLOP_PX = 8;

/** Average glyph width of Latin text, as a share of the font size. */
const LATIN_GLYPH_RATIO = 0.6;
/** Line height, as a share of the font size. */
export const LINE_HEIGHT_RATIO = 1.3;
/** Inner margin of a text box, around its text. */
export const TEXT_BOX_PADDING_PX = 12;

/** Whether a character is drawn full width (CJK, kana, full-width forms). */
function isWide(character: string): boolean {
  const code = character.codePointAt(0) ?? 0;
  return (
    (code >= 0x1100 && code <= 0x115f) ||
    (code >= 0x2e80 && code <= 0xa4cf) ||
    (code >= 0xac00 && code <= 0xd7a3) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xfe30 && code <= 0xfe4f) ||
    (code >= 0xff00 && code <= 0xff60) ||
    (code >= 0xffe0 && code <= 0xffe6)
  );
}

/**
 * Estimates the size a text takes in a text box: the longest line for the
 * width, the number of lines for the height, padding included. The host
 * font is not measurable from the plugin, hence an average glyph width.
 */
export function estimateTextSize(
  text: string,
  fontSize: number,
): {width: number; height: number} {
  const lines = text.split('\n');
  const longest = Math.max(
    ...lines.map(line =>
      Array.from(line).reduce(
        (width, character) =>
          width + fontSize * (isWide(character) ? 1 : LATIN_GLYPH_RATIO),
        0,
      ),
    ),
  );
  return {
    width: Math.ceil(longest + 2 * TEXT_BOX_PADDING_PX),
    height: Math.ceil(
      lines.length * fontSize * LINE_HEIGHT_RATIO + 2 * TEXT_BOX_PADDING_PX,
    ),
  };
}

/**
 * Bounds of a text box, narrowed to its text: a text box frame is often
 * much wider than what it shows.
 */
function textBounds(textBox: NonNullable<PageElement['textBox']>): Rect | null {
  const rect = textBox.textRect;
  if (!rect) {
    return null;
  }
  const text = textBox.textContentFull;
  const fontSize = textBox.fontSize;
  if (!text || !fontSize || fontSize <= 0) {
    return rect;
  }
  const size = estimateTextSize(text, fontSize);
  return {
    left: rect.left,
    top: rect.top,
    right: Math.min(rect.right, rect.left + size.width),
    bottom: Math.min(rect.bottom, rect.top + size.height),
  };
}

function boundsOf(
  element: PageElement,
  pictureToScreen?: (rect: Rect) => Rect,
): Rect | null {
  if (element.textBox?.textRect) {
    return textBounds(element.textBox);
  }
  const link = element.link;
  if (link) {
    return {
      left: link.X,
      top: link.Y,
      right: link.X + link.width,
      bottom: link.Y + link.height,
    };
  }
  const picture = element.picture?.rect;
  if (picture && pictureToScreen) {
    return pictureToScreen(picture);
  }
  return null;
}

function textOf(element: PageElement): string | null {
  return (
    element.textBox?.textContentFull ??
    element.link?.fullText ??
    element.link?.destPath ??
    null
  );
}

/**
 * Lists the s-INK links of a page, with their bounds. The `userData` of an
 * element is preferred; its text is the fallback.
 *
 * @param pictureToScreen - Converts picture bounds (EMR) to screen pixels;
 *   without it, pictures are skipped.
 */
export function findInkLinks(
  elements: readonly PageElement[],
  pictureToScreen?: (rect: Rect) => Rect,
): InkLinkElement[] {
  const found: InkLinkElement[] = [];
  for (const element of elements) {
    const rect = boundsOf(element, pictureToScreen);
    if (!rect) {
      continue;
    }
    const fromUserData = parseInkLink(element.userData);
    const target = fromUserData ?? parseInkLink(textOf(element));
    if (target) {
      found.push({target, source: fromUserData ? 'userData' : 'text', rect});
    }
  }
  return found;
}

/**
 * Finds the s-INK link under a point, the last drawn one if several
 * overlap.
 */
export function inkLinkAt(
  links: readonly InkLinkElement[],
  x: number,
  y: number,
): InkLinkElement | null {
  for (let index = links.length - 1; index >= 0; index -= 1) {
    const {rect} = links[index];
    if (
      x >= rect.left - HIT_SLOP_PX &&
      x <= rect.right + HIT_SLOP_PX &&
      y >= rect.top - HIT_SLOP_PX &&
      y <= rect.bottom + HIT_SLOP_PX
    ) {
      return links[index];
    }
  }
  return null;
}
