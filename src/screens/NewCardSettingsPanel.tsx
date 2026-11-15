import React, {useCallback, useEffect, useState} from 'react';

import {
  DEFAULT_NEW_CARD_SETTINGS,
  loadNewCardSettings,
  MAX_SUGGESTIONS,
  MIN_SUGGESTIONS,
  NewCardSettings,
  saveNewCardSettings,
} from '../cards/newCardSettings';
import {SettingsSection} from '../components/SettingsSection';
import {Stepper} from '../components/Stepper';
import {Switch} from '../components/Switch';
import {useTranslation} from '../i18n';
import {KeyValueStore} from '../storage/keyValueStore';

/**
 * "New card" category of Settings: what the New Trello Card page offers
 * and does by itself.
 */
export function NewCardSettingsPanel({
  store,
}: {
  store: KeyValueStore;
}): React.JSX.Element {
  const {t} = useTranslation();
  const [settings, setSettings] = useState<NewCardSettings>(
    DEFAULT_NEW_CARD_SETTINGS,
  );

  useEffect(() => {
    let cancelled = false;
    loadNewCardSettings(store).then(loaded => {
      if (!cancelled) {
        setSettings(loaded);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [store]);

  const update = useCallback(
    (change: Partial<NewCardSettings>) => {
      setSettings(current => {
        const next = {...current, ...change};
        saveNewCardSettings(store, next);
        return next;
      });
    },
    [store],
  );

  return (
    <SettingsSection title={t('card.title')}>
      <Stepper
        label={t('newCard.suggestions')}
        help={t('newCard.suggestionsHelp')}
        value={settings.suggestionCount}
        min={MIN_SUGGESTIONS}
        max={MAX_SUGGESTIONS}
        onChange={suggestionCount => update({suggestionCount})}
      />
      <Switch
        label={t('newCard.assignMe')}
        help={t('newCard.assignMeHelp')}
        value={settings.assignMe}
        onChange={assignMe => update({assignMe})}
      />
      <Switch
        label={t('newCard.linkSelection')}
        help={t('newCard.linkSelectionHelp')}
        value={settings.linkSelection}
        onChange={linkSelection => update({linkSelection})}
      />
    </SettingsSection>
  );
}
