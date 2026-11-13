import {KeyValueStore} from '../storage/keyValueStore';
import {TrelloBoardCard, TrelloList} from '../trello';

/** Storage key of the board modes settings, shared by every board. */
export const FOCUS_SETTINGS_KEY = 'supertrello.board.focus';

/**
 * Filtered views of a board, of which at most one is on at a time: `focus`
 * keeps the member's open work, `review` the cards marked complete.
 */
export type BoardMode = 'focus' | 'review';

const BOARD_MODES: readonly BoardMode[] = ['focus', 'review'];

/** The board mode that is on, and the label names Focus mode keeps. */
export interface FocusSettings {
  /** `null`: the whole board is shown. */
  mode: BoardMode | null;
  /**
   * Label names a card needs one of to stay in Focus mode, compared without
   * case. Empty: the labels are not checked.
   */
  labels: readonly string[];
}

export const DEFAULT_FOCUS_SETTINGS: FocusSettings = {
  mode: null,
  labels: [],
};

/** Board mode as offered in the mode selectors; `all` stands for no mode. */
export type ModeChoice = BoardMode | 'all';

/** Normalized form of a label name, used to compare label names. */
export function labelKey(name: string): string {
  return name.trim().toLocaleLowerCase();
}

/**
 * Whether a card belongs to the Focus view: assigned to the member, not
 * marked complete (`dueComplete`) and, when Focus labels are set, carrying
 * at least one of them.
 */
export function isFocusCard(
  card: TrelloBoardCard,
  memberId: string,
  labels: readonly string[],
): boolean {
  if (card.dueComplete || !(card.idMembers ?? []).includes(memberId)) {
    return false;
  }
  if (labels.length === 0) {
    return true;
  }
  const wanted = new Set(labels.map(labelKey));
  return (card.labels ?? []).some(label => wanted.has(labelKey(label.name)));
}

/**
 * Keeps only the Focus cards of a board, and only the lists that still hold
 * at least one of them, so that the view shows nothing but the member's work.
 */
export function focusBoard(
  lists: readonly TrelloList[],
  cardsByList: ReadonlyMap<string, TrelloBoardCard[]>,
  memberId: string,
  labels: readonly string[],
): {lists: TrelloList[]; cardsByList: Map<string, TrelloBoardCard[]>} {
  return filterBoard(lists, cardsByList, card =>
    isFocusCard(card, memberId, labels),
  );
}

/** Whether a card belongs to the Review view: marked complete in Trello. */
export function isReviewCard(card: TrelloBoardCard): boolean {
  return card.dueComplete === true;
}

/**
 * Keeps only the completed cards of a board, whoever they are assigned to,
 * and only the lists that still hold at least one of them.
 */
export function reviewBoard(
  lists: readonly TrelloList[],
  cardsByList: ReadonlyMap<string, TrelloBoardCard[]>,
): {lists: TrelloList[]; cardsByList: Map<string, TrelloBoardCard[]>} {
  return filterBoard(lists, cardsByList, isReviewCard);
}

function filterBoard(
  lists: readonly TrelloList[],
  cardsByList: ReadonlyMap<string, TrelloBoardCard[]>,
  keep: (card: TrelloBoardCard) => boolean,
): {lists: TrelloList[]; cardsByList: Map<string, TrelloBoardCard[]>} {
  const kept = new Map<string, TrelloBoardCard[]>();
  for (const list of lists) {
    const cards = (cardsByList.get(list.id) ?? []).filter(keep);
    if (cards.length > 0) {
      kept.set(list.id, cards);
    }
  }
  return {
    lists: lists.filter(list => kept.has(list.id)),
    cardsByList: kept,
  };
}

/**
 * The distinct named labels used on the cards, sorted by name, plus the
 * selected Focus labels missing from this board (so they can be unselected).
 */
export function focusLabelChoices(
  cards: Iterable<TrelloBoardCard>,
  selected: readonly string[],
): string[] {
  const byKey = new Map<string, string>();
  const add = (name: string) => {
    const key = labelKey(name);
    if (key && !byKey.has(key)) {
      byKey.set(key, name.trim());
    }
  };
  for (const card of cards) {
    for (const label of card.labels ?? []) {
      add(label.name ?? '');
    }
  }
  selected.forEach(add);
  return [...byKey.values()].sort((a, b) =>
    a.localeCompare(b, undefined, {sensitivity: 'base'}),
  );
}

/** Adds or removes a label name from the Focus labels, ignoring case. */
export function toggleFocusLabel(
  labels: readonly string[],
  name: string,
): string[] {
  const key = labelKey(name);
  return labels.some(label => labelKey(label) === key)
    ? labels.filter(label => labelKey(label) !== key)
    : [...labels, name.trim()];
}

/**
 * Reads the board modes settings; any missing or corrupted value yields
 * defaults. Settings saved before Review mode existed (`enabled: true`) turn
 * Focus mode on.
 */
export async function loadFocusSettings(
  store: KeyValueStore,
): Promise<FocusSettings> {
  try {
    const raw = await store.getItem(FOCUS_SETTINGS_KEY);
    const parsed: Partial<Record<keyof FocusSettings | 'enabled', unknown>> =
      (raw ? JSON.parse(raw) : null) ?? {};
    const mode = BOARD_MODES.find(candidate => candidate === parsed.mode);
    return {
      mode: mode ?? (parsed.enabled === true ? 'focus' : null),
      labels: Array.isArray(parsed.labels)
        ? parsed.labels.filter(
            (name): name is string =>
              typeof name === 'string' && labelKey(name) !== '',
          )
        : [],
    };
  } catch (error) {
    console.warn('[sINK] Failed to read the Focus settings', error);
    return DEFAULT_FOCUS_SETTINGS;
  }
}

export async function saveFocusSettings(
  store: KeyValueStore,
  settings: FocusSettings,
): Promise<void> {
  try {
    await store.setItem(FOCUS_SETTINGS_KEY, JSON.stringify(settings));
  } catch (error) {
    console.warn('[sINK] Failed to save the Focus settings', error);
  }
}

/** Measured heights of a list: its header and each of its cards. */
export interface ListBlock {
  listId: string;
  header: number;
  cards: readonly {id: string; height: number}[];
}

/** A run of consecutive cards of one list placed in a column. */
export interface ColumnSegment {
  listId: string;
  cardIds: string[];
  /** `true` when the list started in a previous column. */
  continued: boolean;
}

/**
 * Stacks lists one under another in columns of `columnHeight`, so that short
 * lists share a column instead of each taking a full one. A list that does
 * not fit goes on in the next column, its header repeated; a header is never
 * left alone at the bottom of a column. Cards taller than a whole column get
 * a column of their own (and are clipped).
 *
 * @param cardGap space between a header and a card, or two cards.
 * @param listGap space between two lists of the same column.
 */
export function stackLists(
  blocks: readonly ListBlock[],
  columnHeight: number,
  cardGap: number,
  listGap: number,
): ColumnSegment[][] {
  const columns: ColumnSegment[][] = [];
  let column: ColumnSegment[] = [];
  let used = 0;
  const flush = () => {
    if (column.length > 0) {
      columns.push(column);
    }
    column = [];
    used = 0;
  };

  for (const block of blocks) {
    let index = 0;
    let continued = false;
    do {
      const first = block.cards[index]?.height;
      const opening =
        block.header + (first === undefined ? 0 : cardGap + first);
      if (column.length > 0 && used + listGap + opening > columnHeight) {
        flush();
      }
      const segment: ColumnSegment = {
        listId: block.listId,
        cardIds: [],
        continued,
      };
      used += (column.length > 0 ? listGap : 0) + block.header;
      while (index < block.cards.length) {
        const card = block.cards[index];
        if (
          segment.cardIds.length > 0 &&
          used + cardGap + card.height > columnHeight
        ) {
          break;
        }
        segment.cardIds.push(card.id);
        used += cardGap + card.height;
        index++;
      }
      column.push(segment);
      if (index < block.cards.length) {
        flush();
        continued = true;
      }
    } while (index < block.cards.length);
  }
  flush();
  return columns;
}
