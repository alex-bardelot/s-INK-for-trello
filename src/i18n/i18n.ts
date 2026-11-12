import {
  CATALOGS,
  DEFAULT_LOCALE,
  Locale,
  REFERENCE_CATALOG,
  TranslationKey,
} from './catalogs';
import {resolveLocale} from './resolveLocale';

/** Values substituted into `{placeholder}` tokens of a translation. */
export type TranslationParams = Readonly<Record<string, string | number>>;

/** Callback invoked whenever the active locale changes. */
export type LocaleListener = (locale: Locale) => void;

const PLACEHOLDER_PATTERN = /\{(\w+)\}/g;

/**
 * Minimal, dependency-free translation service.
 *
 * It holds the active locale, resolves keys against the bundled catalogs
 * (falling back to English, then to the key itself) and notifies subscribers
 * when the locale changes so the UI and toolbar buttons can refresh.
 */
export class I18n {
  private locale: Locale;
  private readonly listeners = new Set<LocaleListener>();

  constructor(initialLocale: Locale = DEFAULT_LOCALE) {
    this.locale = initialLocale;
  }

  /** Returns the active locale. */
  getLocale(): Locale {
    return this.locale;
  }

  /**
   * Changes the active locale from a raw language identifier.
   * Unsupported identifiers resolve to the default locale.
   *
   * @param raw - A firmware language code or BCP 47 tag.
   * @returns `true` if the active locale actually changed.
   */
  setLocale(raw: string | null | undefined): boolean {
    const next = resolveLocale(raw);
    if (next === this.locale) {
      return false;
    }
    this.locale = next;
    this.listeners.forEach(listener => listener(next));
    return true;
  }

  /**
   * Translates a key in the active locale.
   *
   * @param key - The translation key.
   * @param params - Optional values for `{placeholder}` tokens.
   * @returns The localized string.
   */
  t(key: TranslationKey, params?: TranslationParams): string {
    const template =
      CATALOGS[this.locale][key] ?? REFERENCE_CATALOG[key] ?? key;
    if (!params) {
      return template;
    }
    return template.replace(PLACEHOLDER_PATTERN, (token, name: string) =>
      name in params ? String(params[name]) : token,
    );
  }

  /**
   * Subscribes to locale changes.
   *
   * @param listener - Called with the new locale after each change.
   * @returns A function that removes the subscription.
   */
  subscribe(listener: LocaleListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}

/** Application-wide translation service. */
export const i18n = new I18n();
