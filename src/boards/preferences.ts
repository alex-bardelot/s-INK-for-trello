import {SUPERNOTE_ROADMAP_SHORT_LINK} from '../trello/supernoteRoadmap';
import {KeyValueStore} from '../storage/keyValueStore';

/** Storage key of the boards page preferences. */
export const BOARDS_PREFERENCES_KEY = 'supertrello.boards.preferences';

/** A public Trello board the user registered to see on the boards page. */
export interface PublicBoardRef {
  /** Short id from the board URL (`trello.com/b/{shortLink}/...`). */
  shortLink: string;
  /** Board name when it was added, shown until it is read again. */
  name: string;
}

export interface BoardsPreferences {
  /** Shows Supernote's roadmap in the Public section. */
  showSupernoteRoadmap: boolean;
  /** Public boards added by the user, in the order they were added. */
  publicBoards: readonly PublicBoardRef[];
}

export const DEFAULT_BOARDS_PREFERENCES: BoardsPreferences = {
  showSupernoteRoadmap: true,
  publicBoards: [],
};

/** Trello short links are 8 letters or digits. */
const SHORT_LINK = /^[A-Za-z0-9]{8}$/;

/**
 * Extracts the board short link from what the user typed or pasted: a board
 * URL (`https://trello.com/b/{shortLink}/name`, with or without scheme) or
 * the short link alone. Returns `null` for anything else.
 */
export function parseBoardShortLink(input: string): string | null {
  const text = input.trim();
  if (SHORT_LINK.test(text)) {
    return text;
  }
  const match = /^(?:https?:\/\/)?(?:www\.)?trello\.com\/b\/([A-Za-z0-9]{8})(?:[/?#].*)?$/i.exec(
    text,
  );
  return match ? match[1] : null;
}

function isPublicBoardRef(value: unknown): value is PublicBoardRef {
  const ref = value as Partial<PublicBoardRef> | null;
  return (
    typeof ref?.shortLink === 'string' &&
    SHORT_LINK.test(ref.shortLink) &&
    typeof ref.name === 'string'
  );
}

/**
 * Adds a public board at the end of the list. Supernote's roadmap, always
 * present, and boards already in the list are not added again.
 */
export function addPublicBoard(
  preferences: BoardsPreferences,
  board: PublicBoardRef,
): BoardsPreferences {
  if (
    board.shortLink === SUPERNOTE_ROADMAP_SHORT_LINK ||
    preferences.publicBoards.some(ref => ref.shortLink === board.shortLink)
  ) {
    return preferences;
  }
  return {
    ...preferences,
    publicBoards: [...preferences.publicBoards, board],
  };
}

export function removePublicBoard(
  preferences: BoardsPreferences,
  shortLink: string,
): BoardsPreferences {
  return {
    ...preferences,
    publicBoards: preferences.publicBoards.filter(
      ref => ref.shortLink !== shortLink,
    ),
  };
}

/** Reads the preferences; any missing or corrupted value yields the defaults. */
export async function loadBoardsPreferences(
  store: KeyValueStore,
): Promise<BoardsPreferences> {
  try {
    const raw = await store.getItem(BOARDS_PREFERENCES_KEY);
    const parsed: Partial<Record<keyof BoardsPreferences, unknown>> =
      (raw ? JSON.parse(raw) : null) ?? {};
    return {
      showSupernoteRoadmap:
        typeof parsed.showSupernoteRoadmap === 'boolean'
          ? parsed.showSupernoteRoadmap
          : DEFAULT_BOARDS_PREFERENCES.showSupernoteRoadmap,
      publicBoards: Array.isArray(parsed.publicBoards)
        ? parsed.publicBoards.filter(isPublicBoardRef)
        : DEFAULT_BOARDS_PREFERENCES.publicBoards,
    };
  } catch (error) {
    console.warn('[sINK] Failed to read boards preferences', error);
    return DEFAULT_BOARDS_PREFERENCES;
  }
}

export async function saveBoardsPreferences(
  store: KeyValueStore,
  preferences: BoardsPreferences,
): Promise<void> {
  try {
    await store.setItem(BOARDS_PREFERENCES_KEY, JSON.stringify(preferences));
  } catch (error) {
    console.warn('[sINK] Failed to save boards preferences', error);
  }
}
