import React, {useState} from 'react';
import {StyleSheet, Text, View} from 'react-native';

import {BoardsPreferences, removePublicBoard} from '../boards/preferences';
import {Button} from '../components/Button';
import {Switch} from '../components/Switch';
import {useTranslation} from '../i18n';
import {SUPERNOTE_ROADMAP_NAME, TrelloClient} from '../trello';
import {colors, spacing, typography} from '../theme';
import {AddPublicBoardForm} from './AddPublicBoardForm';

export interface PublicBoardsSettingsProps {
  /** Reads the board being added (anonymous when signed out). */
  client: TrelloClient;
  /** Asks for network access; resolves `false` if refused. */
  ensureNetwork: () => Promise<boolean>;
  preferences: BoardsPreferences;
  onChange: (preferences: BoardsPreferences) => void;
}

/**
 * Public boards of the boards page: Supernote's roadmap, which can only be
 * hidden, then the boards the user added, which can be removed, and the
 * form adding one.
 */
export function PublicBoardsSettings({
  client,
  ensureNetwork,
  preferences,
  onChange,
}: PublicBoardsSettingsProps): React.JSX.Element {
  const {t} = useTranslation();
  const [adding, setAdding] = useState(false);

  return (
    <View style={styles.container}>
      <Switch
        label={SUPERNOTE_ROADMAP_NAME}
        help={t('settings.roadmapHelp')}
        value={preferences.showSupernoteRoadmap}
        onChange={show =>
          onChange({...preferences, showSupernoteRoadmap: show})
        }
      />

      {preferences.publicBoards.map(ref => (
        <View key={ref.shortLink} style={styles.row}>
          <View style={styles.texts}>
            <Text style={styles.name} numberOfLines={1}>
              {ref.name}
            </Text>
            <Text style={styles.small}>trello.com/b/{ref.shortLink}</Text>
          </View>
          <Button
            label={t('settings.publicBoardRemove')}
            onPress={() => onChange(removePublicBoard(preferences, ref.shortLink))}
          />
        </View>
      ))}

      {adding ? (
        <AddPublicBoardForm
          client={client}
          ensureNetwork={ensureNetwork}
          preferences={preferences}
          onChange={onChange}
          onClose={() => setAdding(false)}
        />
      ) : (
        <Button
          label={`+ ${t('settings.publicBoardNew')}`}
          onPress={() => setAdding(true)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.xs,
  },
  texts: {
    flex: 1,
    gap: spacing.xs,
  },
  name: {
    color: colors.foreground,
    fontSize: typography.label,
    fontWeight: '600',
  },
  small: {
    color: colors.foreground,
    fontSize: typography.small,
  },
});
