import type {KeyValueStore} from '../storage/keyValueStore';
import {Locale, SUPPORTED_LOCALES} from './catalogs';
import {I18n, i18n} from './i18n';

/** The language chosen in Settings: the system's, or a fixed one. */
export type LanguageChoice = 'system' | Locale;

export const LANGUAGE_CHOICES: readonly LanguageChoice[] = [
  'system',
  ...SUPPORTED_LOCALES,
];

export const DEFAULT_LANGUAGE_CHOICE: LanguageChoice = 'system';

/** Storage key of the language setting. */
export const LANGUAGE_KEY = 'supertrello.language';

/** Each language is named in itself, so that anyone can find their own. */
export const LANGUAGE_NAMES: Readonly<Record<Locale, string>> = {
  en: 'English',
  fr: 'Français',
  ja: '日本語',
  zh_CN: '简体中文',
  zh_TW: '繁體中文',
};

export async function loadLanguageChoice(
  store: KeyValueStore,
): Promise<LanguageChoice> {
  try {
    const raw = await store.getItem(LANGUAGE_KEY);
    return (
      LANGUAGE_CHOICES.find(value => value === raw) ?? DEFAULT_LANGUAGE_CHOICE
    );
  } catch (error) {
    console.warn('[sINK] Failed to read the language', error);
    return DEFAULT_LANGUAGE_CHOICE;
  }
}

export async function saveLanguageChoice(
  store: KeyValueStore,
  choice: LanguageChoice,
): Promise<void> {
  try {
    await store.setItem(LANGUAGE_KEY, choice);
  } catch (error) {
    console.warn('[sINK] Failed to save the language', error);
  }
}

/**
 * Picks the active locale from the system language and the choice made in
 * Settings: "system" follows the Supernote's language as it changes, any
 * other choice stays fixed.
 */
export class LanguageController {
  private system: string | null | undefined;
  private choice: LanguageChoice = DEFAULT_LANGUAGE_CHOICE;

  constructor(private readonly target: I18n) {}

  getChoice(): LanguageChoice {
    return this.choice;
  }

  /**
   * Records the system language (at startup, then on each change).
   *
   * @returns `true` if the active locale changed.
   */
  setSystemLanguage(raw: string | null | undefined): boolean {
    this.system = raw;
    return this.apply();
  }

  /**
   * Records the choice made in Settings.
   *
   * @returns `true` if the active locale changed.
   */
  setChoice(choice: LanguageChoice): boolean {
    this.choice = choice;
    return this.apply();
  }

  private apply(): boolean {
    return this.target.setLocale(
      this.choice === 'system' ? this.system : this.choice,
    );
  }
}

/** Application-wide language controller, driving {@link i18n}. */
export const language = new LanguageController(i18n);
