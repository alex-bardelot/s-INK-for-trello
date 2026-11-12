import {useCallback, useSyncExternalStore} from 'react';

import {Locale, TranslationKey} from './catalogs';
import {i18n, TranslationParams} from './i18n';

export interface UseTranslationResult {
  /** The active locale. */
  locale: Locale;
  /** Translates a key in the active locale. */
  t: (key: TranslationKey, params?: TranslationParams) => string;
}

/**
 * React hook giving access to translations.
 * Components using it re-render automatically when the system language changes.
 */
export function useTranslation(): UseTranslationResult {
  const locale = useSyncExternalStore(
    listener => i18n.subscribe(listener),
    () => i18n.getLocale(),
  );

  // `locale` is a dependency so that consumers get a new `t` on change.
  const t = useCallback(
    (key: TranslationKey, params?: TranslationParams) => i18n.t(key, params),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [locale],
  );

  return {locale, t};
}
