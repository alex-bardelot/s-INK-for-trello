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
  for (const [id, count] of Object.entries(
    preferences.useCountByBoard ?? {},
  )) {
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
    };
  } catch (error) {
    console.warn('[sINK] Failed to read card preferences', error);
    return EMPTY_PREFERENCES;
  }
}

/**
 * Remembers the board and list a card was just created in, and counts the
 * card for that board.
 */
export async function rememberCardDestination(
  store: KeyValueStore,
  current: CardPreferences,
  boardId: string,
  listId: string,
): Promise<CardPreferences> {
  const counts = current.useCountByBoard ?? {};
  const next: CardPreferences = {
    lastBoardId: boardId,
    lastListByBoard: {...current.lastListByBoard, [boardId]: listId},
    useCountByBoard: {...counts, [boardId]: (counts[boardId] ?? 0) + 1},
  };
  try {
    await store.setItem(CARD_PREFERENCES_KEY, JSON.stringify(next));
  } catch (error) {
    console.warn('[sINK] Failed to save card preferences', error);
  }
  return next;
}
