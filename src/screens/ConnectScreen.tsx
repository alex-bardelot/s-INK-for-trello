import React, {useCallback, useMemo, useState} from 'react';
import {
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import {Button} from '../components/Button';
import {ScreenFrame} from '../components/ScreenFrame';
import {TranslationKey, useTranslation} from '../i18n';
import {SessionErrorCode} from '../session/trelloSession';
import {buildAuthorizeUrl, TRELLO_API_KEY} from '../trello';
import {borders, colors, spacing, typography} from '../theme';

const ERROR_MESSAGES: Record<SessionErrorCode, TranslationKey> = {
  missingApiKey: 'error.missingApiKey',
  permissionDenied: 'error.permissionDenied',
  malformedToken: 'error.malformedToken',
  invalidToken: 'error.invalidToken',
  network: 'error.network',
  rateLimited: 'error.rateLimited',
  unknown: 'error.unknown',
};

export interface ConnectScreenProps {
  error?: SessionErrorCode;
  busy: boolean;
  persistentStorage: boolean;
  onConnect: (token: string) => void;
  /** Checks the stored account again after a transient failure. */
  onRetry: () => void;
}

/** Failures worth retrying without typing the token again. */
const TRANSIENT_ERRORS: ReadonlySet<SessionErrorCode> = new Set([
  'permissionDenied',
  'network',
  'rateLimited',
  'unknown',
]);

/**
 * Shown when no Trello account is linked: guides the user through the manual
 * token flow (open the authorization page, allow, type the token back).
 */
export function ConnectScreen({
  error,
  busy,
  persistentStorage,
  onConnect,
  onRetry,
}: ConnectScreenProps): React.JSX.Element {
  const {t} = useTranslation();
  const [token, setToken] = useState('');
  const [browserError, setBrowserError] = useState(false);
  const authorizeUrl = useMemo(
    () => buildAuthorizeUrl({apiKey: TRELLO_API_KEY}),
    [],
  );
  const canConnect = error !== 'missingApiKey';

  const openBrowser = useCallback(() => {
    setBrowserError(false);
    Linking.openURL(authorizeUrl).catch(openError => {
      console.warn('[SuperTrello] Failed to open the browser', openError);
      setBrowserError(true);
    });
  }, [authorizeUrl]);

  const submit = useCallback(() => onConnect(token), [onConnect, token]);

  return (
    <ScreenFrame title={t('connect.title')}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled">
        <Text style={styles.paragraph}>{t('connect.intro')}</Text>

        {error && (
          <Text accessibilityRole="alert" style={styles.error}>
            {t(ERROR_MESSAGES[error])}
          </Text>
        )}
        {error && TRANSIENT_ERRORS.has(error) && (
          <Button label={t('common.retry')} onPress={onRetry} />
        )}

        {canConnect && (
          <>
            <Text style={styles.paragraph}>{t('connect.step1')}</Text>
            <Text selectable style={styles.url}>
              {authorizeUrl}
            </Text>
            <Button label={t('connect.openBrowser')} onPress={openBrowser} />
            {browserError && (
              <Text style={styles.paragraph}>
                {t('error.browserUnavailable')}
              </Text>
            )}

            <Text style={[styles.paragraph, styles.step]}>
              {t('connect.step2')}
            </Text>
            <TextInput
              accessibilityLabel={t('connect.tokenPlaceholder')}
              autoCapitalize="none"
              autoComplete="off"
              autoCorrect={false}
              editable={!busy}
              onChangeText={setToken}
              onSubmitEditing={submit}
              placeholder={t('connect.tokenPlaceholder')}
              placeholderTextColor={colors.foreground}
              returnKeyType="done"
              spellCheck={false}
              style={styles.input}
              value={token}
            />
            <View style={styles.actions}>
              <Button
                primary
                disabled={busy || token.trim().length === 0}
                label={busy ? t('connect.connecting') : t('connect.submit')}
                onPress={submit}
              />
            </View>

            {!persistentStorage && (
              <Text style={[styles.paragraph, styles.note]}>
                {t('connect.storageWarning')}
              </Text>
            )}
          </>
        )}
      </ScrollView>
    </ScreenFrame>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.md,
    paddingBottom: spacing.xl,
  },
  paragraph: {
    color: colors.foreground,
    fontSize: typography.body,
  },
  step: {
    marginTop: spacing.lg,
  },
  note: {
    marginTop: spacing.lg,
    fontStyle: 'italic',
  },
  error: {
    color: colors.foreground,
    fontSize: typography.body,
    fontWeight: '700',
    borderColor: colors.foreground,
    borderWidth: borders.width,
    padding: spacing.md,
  },
  url: {
    color: colors.foreground,
    fontFamily: 'monospace',
    fontSize: typography.body - 4,
  },
  input: {
    color: colors.foreground,
    borderColor: colors.foreground,
    borderRadius: borders.radius,
    borderWidth: borders.width,
    fontFamily: 'monospace',
    fontSize: typography.body,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  actions: {
    flexDirection: 'row',
  },
});
