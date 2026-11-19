import {KeyValueStore} from '../storage/keyValueStore';

/** Storage key of the New Trello Card settings. */
export const NEW_CARD_SETTINGS_KEY = 'supertrello.newCard.settings';

/** How many of the most used labels and members are offered at once. */
export const MIN_SUGGESTIONS = 0;
export const MAX_SUGGESTIONS = 10;

/** `true` for a whole number of suggestions within the range offered. */
export function isSuggestionCount(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= MIN_SUGGESTIONS &&
    value <= MAX_SUGGESTIONS
  );
}

/** What the New Trello Card page does by itself. */
export interface NewCardSettings {
  /**
   * Labels and members of the board shown as chips, the most used first;
   * the others are in the list of the + button.
   */
  suggestionCount: number;
  /** Adds the connected member to the members of each new card. */
  assignMe: boolean;
  /**
   * Once the card is created, links the lasso selection it was made from
   * to it, as the Insert Trello Link button does.
   */
  linkSelection: boolean;
  /**
   * Experimental: a link just placed by Link in note, or the title of the
   * note Start work made, is selected with the lasso once the plugin view
   * closes, ready to be moved. Off by default: right after a note opens,
   * the lasso may fall on the note shown before.
   */
  selectNewLinks: boolean;
}

export const DEFAULT_NEW_CARD_SETTINGS: NewCardSettings = {
  suggestionCount: 3,
  assignMe: true,
  linkSelection: false,
  selectNewLinks: false,
};

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

/** Reads the settings; any missing or corrupted value yields its default. */
export async function loadNewCardSettings(
  store: KeyValueStore,
): Promise<NewCardSettings> {
  const defaults = DEFAULT_NEW_CARD_SETTINGS;
  try {
    const raw = await store.getItem(NEW_CARD_SETTINGS_KEY);
    const parsed: Partial<Record<keyof NewCardSettings, unknown>> =
      (raw ? JSON.parse(raw) : null) ?? {};
    return {
      suggestionCount: isSuggestionCount(parsed.suggestionCount)
        ? parsed.suggestionCount
        : defaults.suggestionCount,
      assignMe: readBoolean(parsed.assignMe, defaults.assignMe),
      linkSelection: readBoolean(parsed.linkSelection, defaults.linkSelection),
      selectNewLinks: readBoolean(
        parsed.selectNewLinks,
        defaults.selectNewLinks,
      ),
    };
  } catch (error) {
    console.warn('[sINK] Failed to read the New card settings', error);
    return defaults;
  }
}

export async function saveNewCardSettings(
  store: KeyValueStore,
  settings: NewCardSettings,
): Promise<void> {
  try {
    await store.setItem(NEW_CARD_SETTINGS_KEY, JSON.stringify(settings));
  } catch (error) {
    console.warn('[sINK] Failed to save the New card settings', error);
  }
}
