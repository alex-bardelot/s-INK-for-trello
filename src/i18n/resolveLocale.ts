import {DEFAULT_LOCALE, Locale, SUPPORTED_LOCALES} from './catalogs';

/** Region or script subtags that identify Traditional Chinese. */
const TRADITIONAL_CHINESE_SUBTAGS = new Set(['tw', 'hk', 'mo', 'hant']);

/**
 * Maps a raw language identifier to a supported locale.
 *
 * Accepts the codes sent by the Supernote firmware (`en`, `zh_CN`, `zh_TW`,
 * `ja`), as well as BCP 47 tags (`fr-FR`, `zh-Hant-TW`) and Android/ICU
 * identifiers (`en_US`, `zh_HK_#Hant`).
 *
 * @param raw - The language identifier to resolve.
 * @returns The matching supported locale, or `null` if none matches.
 */
export function matchLocale(raw: string | null | undefined): Locale | null {
  if (typeof raw !== 'string') {
    return null;
  }

  const subtags = raw
    .trim()
    .toLowerCase()
    .split(/[-_#@.]+/)
    .filter(Boolean);

  const [language, ...rest] = subtags;
  if (!language) {
    return null;
  }

  if (language === 'zh') {
    return rest.some(tag => TRADITIONAL_CHINESE_SUBTAGS.has(tag))
      ? 'zh_TW'
      : 'zh_CN';
  }

  return (SUPPORTED_LOCALES as readonly string[]).includes(language)
    ? (language as Locale)
    : null;
}

/**
 * Same as {@link matchLocale}, but falls back to {@link DEFAULT_LOCALE}.
 *
 * @param raw - The language identifier to resolve.
 * @returns A supported locale, never `null`.
 */
export function resolveLocale(raw: string | null | undefined): Locale {
  return matchLocale(raw) ?? DEFAULT_LOCALE;
}
