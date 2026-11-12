/**
 * Translation catalogs bundled with the plugin.
 *
 * Every locale file lives in `./locales/<code>.json`, where `<code>` follows
 * the language codes emitted by the Supernote firmware (`en`, `zh_CN`,
 * `zh_TW`, `ja`, ...). English is the reference catalog: its keys define the
 * set of valid translation keys, and it is used as the fallback whenever a
 * key is missing from another catalog.
 */
import en from './locales/en.json';
import fr from './locales/fr.json';
import ja from './locales/ja.json';
import zhCN from './locales/zh_CN.json';
import zhTW from './locales/zh_TW.json';

/** A translation key, derived from the reference (English) catalog. */
export type TranslationKey = keyof typeof en;

/** A catalog maps translation keys to localized strings. */
export type Catalog = Readonly<Record<TranslationKey, string>>;

/** Locale codes supported by this plugin. */
export const SUPPORTED_LOCALES = ['en', 'fr', 'ja', 'zh_CN', 'zh_TW'] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];

/** Locale used when the system language is unknown or unsupported. */
export const DEFAULT_LOCALE: Locale = 'en';

/**
 * Catalogs indexed by locale. Non-reference catalogs are typed as partial so
 * that a missing translation degrades gracefully to English instead of
 * breaking the build.
 */
export const CATALOGS: Readonly<Record<Locale, Partial<Catalog>>> = {
  en,
  fr,
  ja,
  zh_CN: zhCN,
  zh_TW: zhTW,
};

/** The reference catalog, guaranteed to contain every key. */
export const REFERENCE_CATALOG: Catalog = en;
