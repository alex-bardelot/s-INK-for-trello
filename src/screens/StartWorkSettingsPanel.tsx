import React, {useCallback, useEffect, useState} from 'react';
import {Pressable, StyleSheet, Text, TextInput, View} from 'react-native';

import {Button} from '../components/Button';
import {CloseIcon} from '../components/CloseIcon';
import {SettingsSection} from '../components/SettingsSection';
import {Switch} from '../components/Switch';
import {useTranslation} from '../i18n';
import {
  addLabelName,
  cleanName,
  DEFAULT_START_WORK_SETTINGS,
  loadStartWorkSettings,
  removeLabelName,
  saveStartWorkSettings,
  START_WORK_NAME_MAX_LENGTH,
  StartWorkSettings,
} from '../startWork/settings';
import {CARD_NOTES_FOLDER} from '../startWork/noteFiles';
import {KeyValueStore} from '../storage/keyValueStore';
import {borders, colors, spacing, typography} from '../theme';

/**
 * "Start work" category of Settings: what the **Start** button of a card
 * does. Each action has its own switch; the labels removed and added, and
 * the list the card moves to, are named here.
 */
export function StartWorkSettingsPanel({
  store,
}: {
  store: KeyValueStore;
}): React.JSX.Element {
  const {t} = useTranslation();
  const [settings, setSettings] = useState<StartWorkSettings>(
    DEFAULT_START_WORK_SETTINGS,
  );

  useEffect(() => {
    let active = true;
    loadStartWorkSettings(store).then(loaded => active && setSettings(loaded));
    return () => {
      active = false;
    };
  }, [store]);

  const change = useCallback(
    (patch: Partial<StartWorkSettings>) => {
      const next = {...settings, ...patch};
      setSettings(next);
      saveStartWorkSettings(store, next);
    },
    [settings, store],
  );

  return (
    <>
      <SettingsSection title={t('settings.startWork')}>
        <Text style={styles.text}>{t('startWork.settingsIntro')}</Text>
      </SettingsSection>

      <SettingsSection title={t('startWork.membersSection')}>
        <Switch
          label={t('startWork.assignMe')}
          help={t('startWork.assignMeHelp')}
          value={settings.assignMe}
          onChange={assignMe => change({assignMe})}
        />
      </SettingsSection>

      <SettingsSection title={t('startWork.labelsSection')}>
        <Switch
          label={t('startWork.removeLabels')}
          help={t('startWork.removeLabelsHelp')}
          value={settings.removeLabels}
          onChange={removeLabels => change({removeLabels})}
        />
        {settings.removeLabels && (
          <LabelNamesEditor
            names={settings.removeLabelNames}
            onChange={removeLabelNames => change({removeLabelNames})}
          />
        )}
        <Switch
          label={t('startWork.addLabels')}
          help={t('startWork.addLabelsHelp')}
          value={settings.addLabels}
          onChange={addLabels => change({addLabels})}
        />
        {settings.addLabels && (
          <LabelNamesEditor
            names={settings.addLabelNames}
            onChange={addLabelNames => change({addLabelNames})}
          />
        )}
      </SettingsSection>

      <SettingsSection title={t('startWork.listSection')}>
        <Switch
          label={t('startWork.moveToList')}
          help={t('startWork.moveToListHelp')}
          value={settings.moveToList}
          onChange={moveToList => change({moveToList})}
        />
        {settings.moveToList && (
          <ListNameInput
            value={settings.listName}
            onChange={listName => change({listName})}
          />
        )}
      </SettingsSection>

      <SettingsSection title={t('startWork.noteSection')}>
        <Switch
          label={t('startWork.createNote')}
          help={t('startWork.createNoteHelp', {folder: CARD_NOTES_FOLDER})}
          value={settings.createNote}
          onChange={createNote => change({createNote})}
        />
      </SettingsSection>
    </>
  );
}

/** Label names as removable chips, then a field adding one. */
function LabelNamesEditor({
  names,
  onChange,
}: {
  names: readonly string[];
  onChange: (names: string[]) => void;
}): React.JSX.Element {
  const {t} = useTranslation();
  const [draft, setDraft] = useState('');

  const add = () => {
    if (cleanName(draft)) {
      onChange(addLabelName(names, draft));
    }
    setDraft('');
  };

  return (
    <View style={styles.editor}>
      {names.length > 0 ? (
        <View style={styles.chips}>
          {names.map(name => (
            <Pressable
              key={name}
              accessibilityRole="button"
              accessibilityLabel={t('startWork.removeName', {name})}
              onPress={() => onChange(removeLabelName(names, name))}
              style={({pressed}) => [styles.chip, pressed && styles.pressed]}>
              {({pressed}) => (
                <>
                  <Text
                    style={[styles.chipText, pressed && styles.pressedText]}
                    numberOfLines={1}>
                    {name}
                  </Text>
                  <CloseIcon
                    size={CHIP_ICON_SIZE}
                    color={pressed ? colors.background : colors.foreground}
                  />
                </>
              )}
            </Pressable>
          ))}
        </View>
      ) : (
        <Text style={styles.small}>{t('startWork.noLabels')}</Text>
      )}
      <View style={styles.addRow}>
        <TextInput
          accessibilityLabel={t('startWork.labelPlaceholder')}
          autoCapitalize="none"
          autoComplete="off"
          autoCorrect={false}
          maxLength={START_WORK_NAME_MAX_LENGTH}
          onChangeText={setDraft}
          onSubmitEditing={add}
          placeholder={t('startWork.labelPlaceholder')}
          placeholderTextColor={colors.labelBorder}
          returnKeyType="done"
          spellCheck={false}
          style={[styles.input, styles.addInput]}
          value={draft}
        />
        <Button
          label={t('startWork.addLabel')}
          disabled={!cleanName(draft)}
          onPress={add}
        />
      </View>
    </View>
  );
}

/** Name of the list the card moves to, saved when editing ends. */
function ListNameInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (name: string) => void;
}): React.JSX.Element {
  const {t} = useTranslation();
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => onChange(cleanName(draft));

  return (
    <View style={styles.editor}>
      <TextInput
        accessibilityLabel={t('startWork.listPlaceholder')}
        autoCorrect={false}
        maxLength={START_WORK_NAME_MAX_LENGTH}
        onBlur={commit}
        onChangeText={setDraft}
        onEndEditing={commit}
        onSubmitEditing={commit}
        placeholder={t('startWork.listPlaceholder')}
        placeholderTextColor={colors.labelBorder}
        returnKeyType="done"
        spellCheck={false}
        style={styles.input}
        value={draft}
      />
      {!cleanName(draft) && (
        <Text style={styles.small}>{t('startWork.noList')}</Text>
      )}
    </View>
  );
}

const CHIP_ICON_SIZE = 20;

const styles = StyleSheet.create({
  text: {
    color: colors.foreground,
    fontSize: typography.body,
  },
  small: {
    color: colors.foreground,
    fontSize: typography.small,
  },
  editor: {
    gap: spacing.sm,
    marginLeft: spacing.lg,
    marginBottom: spacing.sm,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderColor: colors.foreground,
    borderWidth: borders.width,
    borderRadius: borders.radius * 3,
    paddingLeft: spacing.md,
    paddingRight: spacing.sm,
    paddingVertical: spacing.xs,
  },
  chipText: {
    color: colors.foreground,
    fontSize: typography.body,
    fontWeight: '600',
  },
  pressed: {
    backgroundColor: colors.foreground,
  },
  pressedText: {
    color: colors.background,
  },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  input: {
    color: colors.foreground,
    borderColor: colors.foreground,
    borderRadius: borders.radius,
    borderWidth: borders.width,
    fontSize: typography.body,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  addInput: {
    flex: 1,
  },
});
