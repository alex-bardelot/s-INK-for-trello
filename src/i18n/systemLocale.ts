import {I18nManager} from 'react-native';

/**
 * Reads the device language at startup.
 *
 * The Supernote SDK only notifies language *changes* (see
 * `PluginManager.registerLangListener`), so the initial value is taken from
 * the Android locale exposed by React Native, with `Intl` as a fallback.
 *
 * @returns A raw locale identifier (e.g. `fr_FR`), or `undefined`.
 */
export function getSystemLocale(): string | undefined {
  try {
    const {localeIdentifier} = I18nManager.getConstants();
    if (localeIdentifier) {
      return localeIdentifier;
    }
  } catch {
    // Fall through to Intl.
  }

  try {
    return Intl.DateTimeFormat().resolvedOptions().locale;
  } catch {
    return undefined;
  }
}
