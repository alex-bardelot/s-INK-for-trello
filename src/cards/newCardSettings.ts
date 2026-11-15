import {KeyValueStore} from '../storage/keyValueStore';

/** Storage key of the New Trello Card settings. */
export const NEW_CARD_SETTINGS_KEY = 'supertrello.newCard.settings';

/** How many of the most used labels and members are offered at once. */
export const SUGGESTION_COUNTS = [0, 3, 5] as const;
export type SuggestionCount = (typeof SUGGESTION_COUNTS)[number];

/** What the New Trello Card page does by itself. */
export interface NewCardSettings {
  /**
   * Labels and members of the board shown as chips, the most used first;
   * the others are in the list of the + button.
   */
  suggestionCount: SuggestionCount;
  /** Adds the connected member to the members of each new card. */
  assignMe: boolean;
  /**
   * Once the card is created, links the lasso selection it was made from
   * to it, as the Insert Trello Link button does.
   */
  linkSelection: boolean;
}

export const DEFAULT_NEW_CARD_SETTINGS: NewCardSettings = {
  suggestionCount: 3,
  assignMe: true,
  linkSelection: false,
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
    const count = SUGGESTION_COUNTS.find(
      value => value === parsed.suggestionCount,
    );
    return {
      suggestionCount: count ?? defaults.suggestionCount,
      assignMe: readBoolean(parsed.assignMe, defaults.assignMe),
      linkSelection: readBoolean(parsed.linkSelection, defaults.linkSelection),
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
