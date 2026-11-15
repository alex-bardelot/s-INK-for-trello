import {KeyValueStore} from '../storage/keyValueStore';
import {
  COLUMN_COUNTS,
  ColumnCount,
  DEFAULT_COLUMNS,
  Orientation,
} from './layout';

/** Storage key of the board view preferences. */
export const BOARD_PREFERENCES_KEY = 'supertrello.board.preferences';

/** Column count chosen by the user, per screen orientation. */
export type BoardPreferences = Readonly<Record<Orientation, ColumnCount>>;

function columnCountFor(orientation: Orientation, value: unknown): ColumnCount {
  return COLUMN_COUNTS[orientation].includes(value as ColumnCount)
    ? (value as ColumnCount)
    : DEFAULT_COLUMNS[orientation];
}

/** Reads the preferences; any missing or corrupted value yields the defaults. */
export async function loadBoardPreferences(
  store: KeyValueStore,
): Promise<BoardPreferences> {
  try {
    const raw = await store.getItem(BOARD_PREFERENCES_KEY);
    const parsed: Partial<Record<Orientation, unknown>> =
      (raw ? JSON.parse(raw) : null) ?? {};
    return {
      portrait: columnCountFor('portrait', parsed.portrait),
      landscape: columnCountFor('landscape', parsed.landscape),
    };
  } catch (error) {
    console.warn('[sINK] Failed to read board preferences', error);
    return DEFAULT_COLUMNS;
  }
}

export async function saveBoardPreferences(
  store: KeyValueStore,
  preferences: BoardPreferences,
): Promise<void> {
  try {
    await store.setItem(BOARD_PREFERENCES_KEY, JSON.stringify(preferences));
  } catch (error) {
    console.warn('[sINK] Failed to save board preferences', error);
  }
}
