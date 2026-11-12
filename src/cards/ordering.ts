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
 * Boards offered for a new card.
 *
 * By default: the starred boards, plus the board used last, which comes
 * first. With `showAll`, every open board, still with the last one first.
 * Input boards are expected sorted (starred first, then by name), as returned
 * by `TrelloClient.getMyBoards`.
 */
export function orderBoards(
  boards: readonly TrelloBoard[],
  lastBoardId: string | undefined,
  showAll: boolean,
): TrelloBoard[] {
  const offered = showAll
    ? boards
    : boards.filter(board => board.starred || board.id === lastBoardId);
  return lastUsedFirst(offered, lastBoardId);
}

/** `true` if the default board selection would hide some boards. */
export function hasHiddenBoards(
  boards: readonly TrelloBoard[],
  lastBoardId: string | undefined,
): boolean {
  return orderBoards(boards, lastBoardId, false).length < boards.length;
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

/**
 * Splits text taken from the lasso selection into a card title (first
 * non-empty line) and a description (the remaining lines).
 */
export function splitCardText(text: string): {name: string; desc: string} {
  const lines = text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map(line => line.trim());
  const first = lines.findIndex(line => line.length > 0);
  if (first < 0) {
    return {name: '', desc: ''};
  }
  let name = lines[first];
  let desc = lines
    .slice(first + 1)
    .join('\n')
    .trim();
  if (name.length > TITLE_MAX_LENGTH) {
    desc = [name, desc].filter(Boolean).join('\n');
    name = name.slice(0, TITLE_MAX_LENGTH - 1).trimEnd() + '…';
  }
  return {name, desc};
}
