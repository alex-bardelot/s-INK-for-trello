import {InkLinkTarget, parseInkLink} from './inkLink';

/** Element types, from `Element.TYPE_*` in the Supernote SDK. */
export const NoteElementType = {
  Text: 500,
  TextDigestQuote: 501,
  TextDigestCreate: 502,
  Link: 600,
} as const;

type Rect = {left: number; top: number; right: number; bottom: number};

/** The fields of a page element (`PluginFileAPI.getElements`) read here. */
export interface PageElement {
  type: number;
  userData?: string | null;
  textBox?: {textContentFull?: string | null; textRect?: Rect | null} | null;
  link?: {
    X: number;
    Y: number;
    width: number;
    height: number;
    fullText?: string | null;
    destPath?: string | null;
  } | null;
}

/** Where the link of an element was found. */
export type LinkSource = 'userData' | 'text';

export interface InkLinkElement {
  target: InkLinkTarget;
  source: LinkSource;
  rect: Rect;
}

/** Extra margin around an element that still counts as a hit. */
export const HIT_SLOP_PX = 16;

function boundsOf(element: PageElement): Rect | null {
  if (element.textBox?.textRect) {
    return element.textBox.textRect;
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
 */
export function findInkLinks(
  elements: readonly PageElement[],
): InkLinkElement[] {
  const found: InkLinkElement[] = [];
  for (const element of elements) {
    const rect = boundsOf(element);
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
