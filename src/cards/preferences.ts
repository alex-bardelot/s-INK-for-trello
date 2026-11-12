import {KeyValueStore} from '../storage/keyValueStore';

/** Storage key of the card creation preferences. */
export const CARD_PREFERENCES_KEY = 'supertrello.cards.preferences';

/** Choices remembered between two card creations. */
export interface CardPreferences {
  /** Board picked last. */
  lastBoardId?: string;
  /** List picked last, per board id. */
  lastListByBoard: Readonly<Record<string, string>>;
}

export const EMPTY_PREFERENCES: CardPreferences = {lastListByBoard: {}};

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
    };
  } catch (error) {
    console.warn('[SuperTrello] Failed to read card preferences', error);
    return EMPTY_PREFERENCES;
  }
}

/** Remembers the board and list a card was just created in. */
export async function rememberCardDestination(
  store: KeyValueStore,
  current: CardPreferences,
  boardId: string,
  listId: string,
): Promise<CardPreferences> {
  const next: CardPreferences = {
    lastBoardId: boardId,
    lastListByBoard: {...current.lastListByBoard, [boardId]: listId},
  };
  try {
    await store.setItem(CARD_PREFERENCES_KEY, JSON.stringify(next));
  } catch (error) {
    console.warn('[SuperTrello] Failed to save card preferences', error);
  }
  return next;
}
