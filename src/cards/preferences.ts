import {KeyValueStore} from '../storage/keyValueStore';

/** Storage key of the card creation preferences. */
export const CARD_PREFERENCES_KEY = 'supertrello.cards.preferences';

/** Choices remembered between two card creations. */
export interface CardPreferences {
  /** Board picked last. */
  lastBoardId?: string;
  /** List picked last, per board id. */
  lastListByBoard: Readonly<Record<string, string>>;
  /** Cards created so far, per board id (absent before 0.21.0). */
  useCountByBoard?: Readonly<Record<string, number>>;
  /** How often each label was put on a new card, per board id. */
  labelUseByBoard?: Readonly<Record<string, UseStats>>;
  /** How often each member was assigned to a new card, per board id. */
  memberUseByBoard?: Readonly<Record<string, UseStats>>;
}

/** Times used and when last (milliseconds since 1970), per label or member id. */
export type UseStats = Readonly<Record<string, {count: number; last: number}>>;

/** What a new card used, to suggest it first next time. */
export interface CardUse {
  labelIds: readonly string[];
  memberIds: readonly string[];
  /** When the card was created, in milliseconds since 1970. */
  at: number;
}

export const EMPTY_PREFERENCES: CardPreferences = {lastListByBoard: {}};

/**
 * The board most cards were created in, ties going to the board used last,
 * then to the board that reached the count first. `undefined` before the
 * first card.
 */
export function mostUsedBoardId(
  preferences: CardPreferences,
): string | undefined {
  let best: string | undefined;
  let bestCount = 0;
  for (const [id, count] of Object.entries(preferences.useCountByBoard ?? {})) {
    if (
      count > bestCount ||
      (count === bestCount && id === preferences.lastBoardId)
    ) {
      best = id;
      bestCount = count;
    }
  }
  return best;
}

function isCountRecord(value: unknown): value is Record<string, number> {
  return (
    !!value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.values(value).every(
      count => typeof count === 'number' && Number.isFinite(count) && count > 0,
    )
  );
}

function isUseStats(value: unknown): value is UseStats {
  return (
    !!value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.values(value).every(
      stat =>
        !!stat &&
        typeof stat === 'object' &&
        typeof stat.count === 'number' &&
        stat.count > 0 &&
        typeof stat.last === 'number',
    )
  );
}

/** Keeps the boards whose statistics are well formed. */
function readUseByBoard(
  value: unknown,
): Readonly<Record<string, UseStats>> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  const entries = Object.entries(value).filter(([, stats]) =>
    isUseStats(stats),
  );
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

/** Counts one more use of each id, now. */
function countUse(
  stats: UseStats | undefined,
  ids: readonly string[],
  at: number,
): UseStats {
  const next = {...(stats ?? {})};
  for (const id of ids) {
    next[id] = {count: (next[id]?.count ?? 0) + 1, last: at};
  }
  return next;
}

/**
 * The ids used most on a board, ties going to the one used last, among
 * those still available, at most `count` of them.
 */
export function mostUsedIds(
  stats: UseStats | undefined,
  available: readonly string[],
  count: number,
): string[] {
  if (!stats || count <= 0) {
    return [];
  }
  return available
    .filter(id => stats[id])
    .sort(
      (a, b) =>
        stats[b].count - stats[a].count || stats[b].last - stats[a].last,
    )
    .slice(0, count);
}

/** Reads the preferences; any missing or corrupted value yields defaults. */
export async function loadCardPreferences(
  store: KeyValueStore,
): Promise<CardPreferences> {
  try {
    const raw = await store.getItem(CARD_PREFERENCES_KEY);
    if (!raw) {
      return EMPTY_PREFERENCES;
    }
    const parsed = JSON.parse(raw) as Partial<CardPreferences> | null;
    const lastListByBoard =
      parsed?.lastListByBoard && typeof parsed.lastListByBoard === 'object'
        ? parsed.lastListByBoard
        : {};
    return {
      lastBoardId:
        typeof parsed?.lastBoardId === 'string'
          ? parsed.lastBoardId
          : undefined,
      lastListByBoard,
      ...(isCountRecord(parsed?.useCountByBoard)
        ? {useCountByBoard: parsed?.useCountByBoard}
        : {}),
      ...optional('labelUseByBoard', readUseByBoard(parsed?.labelUseByBoard)),
      ...optional('memberUseByBoard', readUseByBoard(parsed?.memberUseByBoard)),
    };
  } catch (error) {
    console.warn('[sINK] Failed to read card preferences', error);
    return EMPTY_PREFERENCES;
  }
}

/** `{[key]: value}`, or nothing when the value is absent. */
function optional<K extends string, V>(
  key: K,
  value: V | undefined,
): Partial<Record<K, V>> {
  return value === undefined ? {} : ({[key]: value} as Record<K, V>);
}

/**
 * Remembers the board and list a card was just created in, counts the card
 * for that board, and counts the labels and members it was given there.
 */
export async function rememberCardDestination(
  store: KeyValueStore,
  current: CardPreferences,
  boardId: string,
  listId: string,
  use?: CardUse,
): Promise<CardPreferences> {
  const counts = current.useCountByBoard ?? {};
  const labels = current.labelUseByBoard ?? {};
  const members = current.memberUseByBoard ?? {};
  const next: CardPreferences = {
    lastBoardId: boardId,
    lastListByBoard: {...current.lastListByBoard, [boardId]: listId},
    useCountByBoard: {...counts, [boardId]: (counts[boardId] ?? 0) + 1},
    ...optional(
      'labelUseByBoard',
      use && use.labelIds.length > 0
        ? {
            ...labels,
            [boardId]: countUse(labels[boardId], use.labelIds, use.at),
          }
        : current.labelUseByBoard,
    ),
    ...optional(
      'memberUseByBoard',
      use && use.memberIds.length > 0
        ? {
            ...members,
            [boardId]: countUse(members[boardId], use.memberIds, use.at),
          }
        : current.memberUseByBoard,
    ),
  };
  try {
    await store.setItem(CARD_PREFERENCES_KEY, JSON.stringify(next));
  } catch (error) {
    console.warn('[sINK] Failed to save card preferences', error);
  }
  return next;
}
