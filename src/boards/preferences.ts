import {KeyValueStore} from '../storage/keyValueStore';

/** Storage key of the boards page preferences. */
export const BOARDS_PREFERENCES_KEY = 'supertrello.boards.preferences';

export interface BoardsPreferences {
  /** Shows the Supernote section with the official roadmap card. */
  showSupernoteRoadmap: boolean;
}

export const DEFAULT_BOARDS_PREFERENCES: BoardsPreferences = {
  showSupernoteRoadmap: true,
};

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
