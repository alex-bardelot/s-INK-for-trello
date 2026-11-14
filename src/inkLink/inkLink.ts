/**
 * s-INK links: objects placed in a note that open a Trello card or board
 * in the plugin when tapped.
 *
 * A link is written `s-INK/c/{shortLink}` for a card and
 * `s-INK/b/{shortLink}` for a board, after Trello's own URLs
 * (`trello.com/c/...`, `trello.com/b/...`). It is stored in the `userData`
 * of the note element, and also shown in its text, so that the link can
 * still be found if the host does not keep `userData`.
 */

/** What an s-INK link points to. */
export type InkLinkTarget = {kind: 'card' | 'board'; shortLink: string};

const PREFIX = 's-INK';
const KIND_LETTER = {card: 'c', board: 'b'} as const;

/** Matches a link anywhere in a text; group 1 = c or b, group 2 = id. */
const LINK_PATTERN = /s-INK\/([cb])\/([A-Za-z0-9]{1,32})(?![A-Za-z0-9])/;

/** Writes the link of a card or board. */
export function formatInkLink(target: InkLinkTarget): string {
  return `${PREFIX}/${KIND_LETTER[target.kind]}/${target.shortLink}`;
}

/**
 * Finds an s-INK link in a text.
 *
 * @returns The target, or `null` if the text holds no link.
 */
export function parseInkLink(
  text: string | null | undefined,
): InkLinkTarget | null {
  const match = text ? LINK_PATTERN.exec(text) : null;
  if (!match) {
    return null;
  }
  return {kind: match[1] === 'c' ? 'card' : 'board', shortLink: match[2]};
}
