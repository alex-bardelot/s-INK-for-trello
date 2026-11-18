import {CARD_NAME_MAX_LENGTH, TrelloBoard, TrelloList} from '../trello';

/** Moves the item with the given id, if any, to the front. */
function lastUsedFirst<T extends {id: string}>(
  items: readonly T[],
  lastId: string | undefined,
): T[] {
  const last = items.find(item => item.id === lastId);
  return last ? [last, ...items.filter(item => item !== last)] : [...items];
}

/**
 * `true` if the member can add cards to the board: an active, non-observer
 * member of it. Without membership data (`memberships` not returned),
 * answers `unknown`.
 */
export function canAddCards(
  board: Pick<TrelloBoard, 'memberships'>,
  memberId: string,
  unknown: boolean,
): boolean {
  if (!Array.isArray(board.memberships)) {
    return unknown;
  }
  return board.memberships.some(
    membership =>
      membership.idMember === memberId &&
      !membership.deactivated &&
      (membership.memberType === 'normal' || membership.memberType === 'admin'),
  );
}

/**
 * `true` if the member can comment on the board's cards, following the
 * board's `comments` preference: an editor may also be refused (comments
 * disabled), and an observer or a non-member allowed. Workspace membership
 * is not known: on an `org` board, only the board's own members are
 * allowed. Without the preference, Trello's default (`members`) applies.
 */
export function canComment(
  board: Pick<TrelloBoard, 'memberships' | 'prefs'>,
  memberId: string,
): boolean {
  const level = board.prefs?.comments ?? 'members';
  if (level === 'disabled') {
    return false;
  }
  if (level === 'public') {
    return true;
  }
  if (canAddCards(board, memberId, false)) {
    return true;
  }
  const mine = board.memberships?.find(
    membership => membership.idMember === memberId && !membership.deactivated,
  );
  return (
    mine?.memberType === 'observer' &&
    (level === 'observers' || level === 'org')
  );
}

/**
 * `true` if the member is known to be only an observer of the board, who
 * can read it but not add cards.
 */
export function isObserverOf(
  board: Pick<TrelloBoard, 'memberships'>,
  memberId: string,
): boolean {
  const mine = board.memberships?.find(
    membership => membership.idMember === memberId,
  );
  return mine?.memberType === 'observer';
}

/** Why a board is put forward in the board picker. */
export type BoardBadge = 'mostUsed' | 'lastUsed' | 'public';

export interface OfferedBoard {
  board: TrelloBoard;
  badges: BoardBadge[];
}

export interface OfferBoardsInput {
  /**
   * The member's boards, sorted starred first then by name, as returned by
   * `TrelloClient.getMyBoards`.
   */
  boards: readonly TrelloBoard[];
  /** Public boards added in Settings that the member can add cards to. */
  publicBoards?: readonly TrelloBoard[];
  /** Board most cards were created in. */
  mostUsedId?: string;
  /** Board the last card was created in. */
  lastUsedId?: string;
  /** Every board rather than the default selection. */
  showAll: boolean;
}

/**
 * Boards offered for a new card, the most used board first, then the board
 * used last, then the others in input order, then the public boards that
 * are not already among the member's boards.
 *
 * By default only the starred boards, the most and last used ones and the
 * public boards are offered; with `showAll`, every board.
 */
export function offerBoards({
  boards,
  publicBoards = [],
  mostUsedId,
  lastUsedId,
  showAll,
}: OfferBoardsInput): OfferedBoard[] {
  const own = new Set(boards.map(board => board.id));
  const extra = publicBoards.filter(
    (board, index) =>
      !own.has(board.id) &&
      publicBoards.findIndex(other => other.id === board.id) === index,
  );
  const all = [...boards, ...extra];
  const publicIds = new Set(publicBoards.map(board => board.id));
  const offered = showAll
    ? all
    : all.filter(
        board =>
          board.starred ||
          publicIds.has(board.id) ||
          board.id === mostUsedId ||
          board.id === lastUsedId,
      );
  const ordered = lastUsedFirst(lastUsedFirst(offered, lastUsedId), mostUsedId);
  return ordered.map(board => ({
    board,
    badges: [
      ...(board.id === mostUsedId ? (['mostUsed'] as const) : []),
      ...(board.id === lastUsedId ? (['lastUsed'] as const) : []),
      ...(publicIds.has(board.id) ? (['public'] as const) : []),
    ],
  }));
}

/** `true` if the default board selection hides some boards. */
export function hasHiddenBoards(
  input: Omit<OfferBoardsInput, 'showAll'>,
): boolean {
  return (
    offerBoards({...input, showAll: false}).length <
    offerBoards({...input, showAll: true}).length
  );
}

/** Lists of a board in board order, with the list used last first. */
export function orderLists(
  lists: readonly TrelloList[],
  lastListId: string | undefined,
): TrelloList[] {
  return lastUsedFirst(lists, lastListId);
}

/** Maximum length of a card title built from the selection. */
const TITLE_MAX_LENGTH = Math.min(CARD_NAME_MAX_LENGTH, 200);

/** An item of the checklist written in the selection. */
export interface CardCheckItem {
  name: string;
  checked: boolean;
}

/** A card title, description and checklist taken from the selection. */
export interface CardText {
  name: string;
  desc: string;
  checkItems: CardCheckItem[];
}

/** Squares the recognition engine or a text box may start a line with. */
const EMPTY_BOXES = '□☐▢◻◽⬜❏❐❑❒⧠';
/** Squares that are ticked or filled in. */
const TICKED_BOXES = '☑☒✅■▣◼◾⬛';
/** Groups: an empty square, a ticked square, then the item text. */
const CHECKBOX_LINE = new RegExp(
  `^(?:([${EMPTY_BOXES}]|\\[\\s?\\])|([${TICKED_BOXES}]|\\[[xX✓✔]\\]))\\s*(.*)$`,
  'u',
);

/**
 * Reads a checkbox line (`☐ Buy milk`, `☑ Done`, `[ ] Buy milk`, `[x] Done`).
 * Returns `null` for any other line.
 */
export function parseCheckItem(line: string): CardCheckItem | null {
  const match = CHECKBOX_LINE.exec(line.trim());
  if (!match) {
    return null;
  }
  const name = match[3].trim();
  if (!name) {
    return null;
  }
  return {name, checked: Boolean(match[2])};
}

/**
 * Splits text taken from the lasso selection into a card title (first
 * non-empty line without a square), a description (the other lines) and a
 * checklist (every line that starts with a square).
 */
export function splitCardText(text: string): CardText {
  const lines = text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map(line => line.trim());
  const checkItems: CardCheckItem[] = [];
  const textLines: string[] = [];
  for (const line of lines) {
    const item = parseCheckItem(line);
    if (item) {
      checkItems.push(item);
    } else {
      textLines.push(line);
    }
  }
  const first = textLines.findIndex(line => line.length > 0);
  if (first < 0) {
    return {name: '', desc: '', checkItems};
  }
  let name = textLines[first];
  let desc = textLines
    .slice(first + 1)
    .join('\n')
    .trim();
  if (name.length > TITLE_MAX_LENGTH) {
    desc = [name, desc].filter(Boolean).join('\n');
    name = name.slice(0, TITLE_MAX_LENGTH - 1).trimEnd() + '…';
  }
  return {name, desc, checkItems};
}
