import type {TranslationKey, TranslationParams} from '../i18n';

type Translate = (key: TranslationKey, params?: TranslationParams) => string;

const COLOR_KEYS: Readonly<Record<string, TranslationKey>> = {
  green: 'labelColor.green',
  yellow: 'labelColor.yellow',
  orange: 'labelColor.orange',
  red: 'labelColor.red',
  purple: 'labelColor.purple',
  blue: 'labelColor.blue',
  sky: 'labelColor.sky',
  lime: 'labelColor.lime',
  pink: 'labelColor.pink',
  black: 'labelColor.black',
};

/**
 * Name of a Trello label color (`green`, `red_dark`, `sky_light`, `null`…),
 * since colors only show as greys on the tablet.
 */
export function labelColorName(
  color: string | null | undefined,
  t: Translate,
): string {
  const [base, variant] = (color ?? '').split('_');
  const key = COLOR_KEYS[base];
  if (!key) {
    return t('labelColor.none');
  }
  const name = t(key);
  if (variant === 'dark') {
    return t('labelColor.dark', {color: name});
  }
  if (variant === 'light') {
    return t('labelColor.light', {color: name});
  }
  return name;
}

/** What to call a label: its name, or its color when it has none. */
export function labelDisplayName(
  label: {name: string; color: string | null},
  t: Translate,
): string {
  return label.name.trim() || labelColorName(label.color, t);
}
