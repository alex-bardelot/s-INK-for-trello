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

/**
 * Member id standing for the account signed in on the tablet, whoever it
 * is: the modes keep "my" cards on every board and after a change of
 * account.
 */
export const SELF_MEMBER = 'me';

/** A member a mode keeps the cards of. */
export interface ModeMember {
  /** Trello member id, or {@link SELF_MEMBER}. */
  id: string;
  /**
   * Full name when the member was checked, so that it can be listed (and
   * unchecked) without reading a board. Empty for {@link SELF_MEMBER}.
   */
  name: string;
}

/** What a card needs to stay in a mode. */
export interface ModeFilter {
  /**
   * Label names a card needs one of, compared without case. Empty: the
   * labels are not checked.
   */
  labels: readonly string[];
  /**
   * Members a card needs to be assigned to one of. Empty: the members are
   * not checked.
   */
  members: readonly ModeMember[];
}

/** Cards Review mode keeps by completion (`dueComplete`). */
export type ReviewCompletion = 'all' | 'complete' | 'incomplete';

export const REVIEW_COMPLETIONS: readonly ReviewCompletion[] = [
  'all',
  'complete',
  'incomplete',
];

export interface ReviewFilter extends ModeFilter {
  completion: ReviewCompletion;
}

/** The board mode that is on, and what each mode keeps. */
export interface FocusSettings {
  /** `null`: the whole board is shown. */
  mode: BoardMode | null;
  /** Focus mode keeps open cards (not marked complete) matching this. */
  focus: ModeFilter;
  review: ReviewFilter;
}

const SELF_ONLY: readonly ModeMember[] = [{id: SELF_MEMBER, name: ''}];

export const DEFAULT_FOCUS_SETTINGS: FocusSettings = {
  mode: null,
  focus: {labels: [], members: SELF_ONLY},
  review: {labels: [], members: SELF_ONLY, completion: 'complete'},
};

/** Board mode as offered in the mode selectors; `all` stands for no mode. */
export type ModeChoice = BoardMode | 'all';

/** Normalized form of a label name, used to compare label names. */
export function labelKey(name: string): string {
  return name.trim().toLocaleLowerCase();
}

/**
 * Whether a card carries one of the filter's labels (when it has any) and
 * is assigned to one of its members (when it has any). `memberId` is the
 * signed-in member, which {@link SELF_MEMBER} stands for.
 */
export function matchesModeFilter(
  card: TrelloBoardCard,
  memberId: string,
  filter: ModeFilter,
): boolean {
  if (filter.members.length > 0) {
    const wanted = new Set(
      filter.members.map(member =>
        member.id === SELF_MEMBER ? memberId : member.id,
      ),
    );
    if (!(card.idMembers ?? []).some(id => wanted.has(id))) {
      return false;
    }
  }
  if (filter.labels.length === 0) {
    return true;
  }
  const wanted = new Set(filter.labels.map(labelKey));
  return (card.labels ?? []).some(label => wanted.has(labelKey(label.name)));
}

/**
 * Whether a card belongs to the Focus view: not marked complete
 * (`dueComplete`) and matching the Focus labels and members.
 */
export function isFocusCard(
  card: TrelloBoardCard,
  memberId: string,
  filter: ModeFilter,
): boolean {
  return !card.dueComplete && matchesModeFilter(card, memberId, filter);
}

/**
 * Keeps only the Focus cards of a board, and only the lists that still hold
 * at least one of them, so that the view shows nothing but that work.
 */
export function focusBoard(
  lists: readonly TrelloList[],
  cardsByList: ReadonlyMap<string, TrelloBoardCard[]>,
  memberId: string,
  filter: ModeFilter,
): {lists: TrelloList[]; cardsByList: Map<string, TrelloBoardCard[]>} {
  return filterBoard(lists, cardsByList, card =>
    isFocusCard(card, memberId, filter),
  );
}

/**
 * Whether a card belongs to the Review view: its completion is the one
 * chosen, and it matches the Review labels and members.
 */
export function isReviewCard(
  card: TrelloBoardCard,
  memberId: string,
  filter: ReviewFilter,
): boolean {
  const complete = card.dueComplete === true;
  if (
    (filter.completion === 'complete' && !complete) ||
    (filter.completion === 'incomplete' && complete)
  ) {
    return false;
  }
  return matchesModeFilter(card, memberId, filter);
}

/**
 * Keeps only the Review cards of a board, and only the lists that still
 * hold at least one of them.
 */
export function reviewBoard(
  lists: readonly TrelloList[],
  cardsByList: ReadonlyMap<string, TrelloBoardCard[]>,
  memberId: string,
  filter: ReviewFilter,
): {lists: TrelloList[]; cardsByList: Map<string, TrelloBoardCard[]>} {
  return filterBoard(lists, cardsByList, card =>
    isReviewCard(card, memberId, filter),
  );
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
 * The distinct label names of a board (unnamed ones left out), sorted by
 * name, plus the selected Focus labels missing from it (so they can be
 * unselected).
 */
export function focusLabelChoices(
  names: Iterable<string>,
  selected: readonly string[],
): string[] {
  const byKey = new Map<string, string>();
  const add = (name: string) => {
    const key = labelKey(name);
    if (key && !byKey.has(key)) {
      byKey.set(key, name.trim());
    }
  };
  for (const name of names) {
    add(name ?? '');
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

/** A member a mode can keep, as listed in Settings. */
export interface ModeMemberChoice extends ModeMember {
  /** Whether it is {@link SELF_MEMBER}, the tablet's account. */
  self: boolean;
}

/**
 * Members offered to a mode: the tablet's account first, then the board's
 * other members and the checked ones missing from the board (so they can
 * be unchecked), sorted by name. The signed-in member among the board's
 * members is the tablet's account, not listed twice.
 */
export function modeMemberChoices(
  boardMembers: readonly {id: string; fullName: string}[],
  selected: readonly ModeMember[],
  memberId: string | null,
): ModeMemberChoice[] {
  const others = new Map<string, ModeMember>();
  const add = (member: ModeMember) => {
    if (
      member.id !== SELF_MEMBER &&
      member.id !== memberId &&
      !others.has(member.id)
    ) {
      others.set(member.id, member);
    }
  };
  boardMembers.forEach(member => add({id: member.id, name: member.fullName}));
  selected.forEach(add);
  const sorted = [...others.values()].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, {sensitivity: 'base'}),
  );
  return [
    {id: SELF_MEMBER, name: '', self: true},
    ...sorted.map(member => ({...member, self: false})),
  ];
}

/** Adds or removes a member from a mode's members. */
export function toggleModeMember(
  members: readonly ModeMember[],
  member: ModeMember,
): ModeMember[] {
  return members.some(candidate => candidate.id === member.id)
    ? members.filter(candidate => candidate.id !== member.id)
    : [...members, {id: member.id, name: member.name}];
}

function parseLabels(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter(
        (name): name is string =>
          typeof name === 'string' && labelKey(name) !== '',
      )
    : [];
}

/** Saved members; a missing list (older settings) keeps the tablet's account. */
function parseMembers(value: unknown): ModeMember[] {
  if (!Array.isArray(value)) {
    return [...SELF_ONLY];
  }
  const members: ModeMember[] = [];
  for (const item of value) {
    if (
      item &&
      typeof item.id === 'string' &&
      item.id !== '' &&
      !members.some(member => member.id === item.id)
    ) {
      members.push({
        id: item.id,
        name: typeof item.name === 'string' ? item.name : '',
      });
    }
  }
  return members;
}

function parseFilter(value: unknown, legacyLabels: unknown): ModeFilter {
  const filter: Record<string, unknown> =
    value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  return {
    labels: parseLabels('labels' in filter ? filter.labels : legacyLabels),
    members: parseMembers(filter.members),
  };
}

/**
 * Reads the board modes settings; any missing or corrupted value yields
 * defaults. Settings saved before Review mode existed (`enabled: true`) turn
 * Focus mode on; the single label list saved before the Focus and Review
 * settings were apart becomes Focus mode's.
 */
export async function loadFocusSettings(
  store: KeyValueStore,
): Promise<FocusSettings> {
  try {
    const raw = await store.getItem(FOCUS_SETTINGS_KEY);
    const parsed: Partial<
      Record<keyof FocusSettings | 'enabled' | 'labels', unknown>
    > = (raw ? JSON.parse(raw) : null) ?? {};
    const mode = BOARD_MODES.find(candidate => candidate === parsed.mode);
    const review =
      parsed.review && typeof parsed.review === 'object'
        ? (parsed.review as Record<string, unknown>)
        : {};
    return {
      mode: mode ?? (parsed.enabled === true ? 'focus' : null),
      focus: parseFilter(parsed.focus, parsed.labels),
      review: {
        ...parseFilter(review, []),
        completion:
          REVIEW_COMPLETIONS.find(choice => choice === review.completion) ??
          'complete',
      },
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
