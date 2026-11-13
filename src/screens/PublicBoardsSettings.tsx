import React, {useCallback, useState} from 'react';
import {StyleSheet, Text, TextInput, View} from 'react-native';

import {
  addPublicBoard,
  BoardsPreferences,
  parseBoardShortLink,
  removePublicBoard,
} from '../boards/preferences';
import {Button} from '../components/Button';
import {Switch} from '../components/Switch';
import {TranslationKey, useTranslation} from '../i18n';
import {isClipboardAvailable, readClipboardText} from '../platform/clipboard';
import {
  isTrelloApiError,
  SUPERNOTE_ROADMAP_NAME,
  SUPERNOTE_ROADMAP_SHORT_LINK,
  TrelloClient,
} from '../trello';
import {borders, colors, spacing, typography} from '../theme';

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
 * hidden, then the boards the user added, which can be removed. A board is
 * added from its link (`https://trello.com/b/{id}/…`) or its id; it is read
 * from Trello first, to check it exists, is public, and get its name.
 */
export function PublicBoardsSettings({
  client,
  ensureNetwork,
  preferences,
  onChange,
}: PublicBoardsSettingsProps): React.JSX.Element {
  const {t} = useTranslation();
  const [adding, setAdding] = useState(false);
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<TranslationKey | null>(null);

  const closeForm = () => {
    setAdding(false);
    setLink('');
    setError(null);
  };

  const add = useCallback(
    async (input: string) => {
      const shortLink = parseBoardShortLink(input);
      if (!shortLink) {
        setError('settings.publicBoardInvalid');
        return;
      }
      if (
        shortLink === SUPERNOTE_ROADMAP_SHORT_LINK ||
        preferences.publicBoards.some(ref => ref.shortLink === shortLink)
      ) {
        setError('settings.publicBoardDuplicate');
        return;
      }
      setBusy(true);
      setError(null);
      try {
        if (!(await ensureNetwork())) {
          setError('error.network');
          return;
        }
        const board = await client.getBoard(shortLink);
        const level = board.prefs?.permissionLevel;
        if (level && level !== 'public') {
          setError('settings.publicBoardNotPublic');
          return;
        }
        onChange(
          addPublicBoard(preferences, {
            shortLink: board.shortLink || shortLink,
            name: board.name,
          }),
        );
        setAdding(false);
        setLink('');
      } catch (failure) {
        console.warn('[sINK] Failed to add a public board', failure);
        setError(
          isTrelloApiError(failure) && failure.kind === 'network'
            ? 'error.network'
            : 'settings.publicBoardNotFound',
        );
      } finally {
        setBusy(false);
      }
    },
    [client, ensureNetwork, onChange, preferences],
  );

  // Long-press paste is not offered in the plugin view: read the clipboard
  // directly, and add the board at once when it holds a board link.
  const paste = useCallback(async () => {
    if (!isClipboardAvailable()) {
      setError('connect.clipboardUnavailable');
      return;
    }
    const text = (await readClipboardText())?.trim();
    if (!text) {
      setError('connect.clipboardEmpty');
      return;
    }
    setLink(text);
    if (parseBoardShortLink(text)) {
      add(text);
    }
  }, [add]);

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
        <View style={styles.form}>
          <Text style={styles.text}>{t('settings.publicBoardHint')}</Text>
          <TextInput
            accessibilityLabel={t('settings.publicBoardHint')}
            autoCapitalize="none"
            autoComplete="off"
            autoCorrect={false}
            editable={!busy}
            onChangeText={text => {
              setLink(text);
              setError(null);
            }}
            onSubmitEditing={() => add(link)}
            placeholder="https://trello.com/b/…"
            placeholderTextColor={colors.foreground}
            returnKeyType="done"
            spellCheck={false}
            style={styles.input}
            value={link}
          />
          {error && (
            <Text accessibilityRole="alert" style={[styles.text, styles.bold]}>
              {t(error)}
            </Text>
          )}
          <View style={styles.actions}>
            <Button label={t('common.cancel')} onPress={closeForm} />
            <Button
              disabled={busy}
              label={t('settings.publicBoardPaste')}
              onPress={paste}
            />
            <Button
              primary
              disabled={busy || link.trim().length === 0}
              label={
                busy
                  ? t('settings.publicBoardChecking')
                  : t('settings.publicBoardAdd')
              }
              onPress={() => add(link)}
            />
          </View>
        </View>
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
  text: {
    color: colors.foreground,
    fontSize: typography.body,
  },
  bold: {
    fontWeight: '700',
  },
  form: {
    gap: spacing.md,
    borderColor: colors.foreground,
    borderWidth: borders.width,
    borderRadius: borders.radius,
    padding: spacing.md,
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
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
});
