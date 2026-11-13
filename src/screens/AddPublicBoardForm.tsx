import React, {useCallback, useState} from 'react';
import {StyleSheet, Text, TextInput, View} from 'react-native';

import {
  addPublicBoard,
  BoardsPreferences,
  parseBoardShortLink,
} from '../boards/preferences';
import {Button} from '../components/Button';
import {TranslationKey, useTranslation} from '../i18n';
import {isClipboardAvailable, readClipboardText} from '../platform/clipboard';
import {
  isTrelloApiError,
  SUPERNOTE_ROADMAP_SHORT_LINK,
  TrelloClient,
} from '../trello';
import {borders, colors, spacing, typography} from '../theme';

export interface AddPublicBoardFormProps {
  /** Reads the board being added (anonymous when signed out). */
  client: TrelloClient;
  /** Asks for network access; resolves `false` if refused. */
  ensureNetwork: () => Promise<boolean>;
  preferences: BoardsPreferences;
  onChange: (preferences: BoardsPreferences) => void;
  /** Called after the board is added, and on Cancel. */
  onClose: () => void;
}

/**
 * Form adding a public board from its link (`https://trello.com/b/{id}/…`)
 * or its id. The board is read from Trello first, to check it exists and is
 * public, and to get its name. Used in Settings and on the boards page.
 */
export function AddPublicBoardForm({
  client,
  ensureNetwork,
  preferences,
  onChange,
  onClose,
}: AddPublicBoardFormProps): React.JSX.Element {
  const {t} = useTranslation();
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<TranslationKey | null>(null);

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
        onClose();
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
    [client, ensureNetwork, onChange, onClose, preferences],
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
        <Button label={t('common.cancel')} onPress={onClose} />
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
  );
}

const styles = StyleSheet.create({
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
