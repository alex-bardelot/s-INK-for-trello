import {
  CATALOGS,
  REFERENCE_CATALOG,
  SUPPORTED_LOCALES,
} from '../src/i18n/catalogs';
import {I18n} from '../src/i18n/i18n';
import {
  LANGUAGE_CHOICES,
  LANGUAGE_KEY,
  LANGUAGE_NAMES,
  LanguageController,
  loadLanguageChoice,
  saveLanguageChoice,
} from '../src/i18n/language';
import {matchLocale, resolveLocale} from '../src/i18n/resolveLocale';
import {createMemoryStore} from '../src/storage/keyValueStore';

describe('matchLocale', () => {
  it.each([
    ['en', 'en'],
    ['en_US', 'en'],
    ['fr-FR', 'fr'],
    ['FR', 'fr'],
    ['ja', 'ja'],
    ['ja_JP', 'ja'],
    ['zh_CN', 'zh_CN'],
    ['zh', 'zh_CN'],
    ['zh-Hans-CN', 'zh_CN'],
    ['zh_TW', 'zh_TW'],
    ['zh-Hant', 'zh_TW'],
    ['zh_HK_#Hant', 'zh_TW'],
  ])('maps %s to %s', (raw, expected) => {
    expect(matchLocale(raw)).toBe(expected);
  });

  it.each([undefined, null, '', '   ', 'de_DE', 'xx'])(
    'returns null for %p',
    raw => {
      expect(matchLocale(raw)).toBeNull();
    },
  );
});

describe('resolveLocale', () => {
  it('falls back to English for unsupported locales', () => {
    expect(resolveLocale('de_DE')).toBe('en');
    expect(resolveLocale(undefined)).toBe('en');
  });
});

describe('catalogs', () => {
  const referenceKeys = Object.keys(REFERENCE_CATALOG).sort();

  it.each(SUPPORTED_LOCALES)('%s defines every reference key', locale => {
    expect(Object.keys(CATALOGS[locale]).sort()).toEqual(referenceKeys);
  });

  it.each(SUPPORTED_LOCALES)('%s has no empty translation', locale => {
    Object.values(CATALOGS[locale]).forEach(value => {
      expect(value?.trim()).toBeTruthy();
    });
  });
});

describe('I18n', () => {
  it('translates in the active locale', () => {
    const i18n = new I18n();
    expect(i18n.t('common.close')).toBe('Close');

    i18n.setLocale('fr_FR');
    expect(i18n.t('common.close')).toBe('Fermer');
  });

  it('notifies subscribers only when the locale changes', () => {
    const i18n = new I18n();
    const listener = jest.fn();
    const unsubscribe = i18n.subscribe(listener);

    expect(i18n.setLocale('ja')).toBe(true);
    expect(i18n.setLocale('ja_JP')).toBe(false);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith('ja');

    unsubscribe();
    i18n.setLocale('en');
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe('LanguageController', () => {
  it('follows the system language by default', () => {
    const target = new I18n();
    const controller = new LanguageController(target);

    expect(controller.getChoice()).toBe('system');
    expect(controller.setSystemLanguage('fr_FR')).toBe(true);
    expect(target.getLocale()).toBe('fr');
    controller.setSystemLanguage('ja');
    expect(target.getLocale()).toBe('ja');
  });

  it('keeps a chosen language when the system one changes', () => {
    const target = new I18n();
    const controller = new LanguageController(target);
    controller.setSystemLanguage('fr_FR');

    expect(controller.setChoice('zh_TW')).toBe(true);
    expect(target.getLocale()).toBe('zh_TW');
    expect(controller.setSystemLanguage('ja')).toBe(false);
    expect(target.getLocale()).toBe('zh_TW');

    // Back to the system language, the latest one known.
    controller.setChoice('system');
    expect(target.getLocale()).toBe('ja');
  });
});

describe('language choice storage', () => {
  it('defaults to the system language', async () => {
    expect(await loadLanguageChoice(createMemoryStore())).toBe('system');
  });

  it('saves and reads a choice, ignoring unknown values', async () => {
    const store = createMemoryStore();
    await saveLanguageChoice(store, 'fr');
    expect(await loadLanguageChoice(store)).toBe('fr');

    await store.setItem(LANGUAGE_KEY, 'de');
    expect(await loadLanguageChoice(store)).toBe('system');
  });

  it('names every supported language', () => {
    expect(LANGUAGE_CHOICES).toEqual(['system', ...SUPPORTED_LOCALES]);
    SUPPORTED_LOCALES.forEach(locale =>
      expect(LANGUAGE_NAMES[locale]).toBeTruthy(),
    );
  });
});
