import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import {Button} from '../components/Button';
import {Checkbox} from '../components/Checkbox';
import {QrCodeView} from '../components/QrCodeView';
import {ScreenFrame} from '../components/ScreenFrame';
import {TranslationKey, useTranslation} from '../i18n';
import {isClipboardAvailable, readClipboardText} from '../platform/clipboard';
import {watchClipboardForToken} from '../session/clipboardTokenWatch';
import {SessionErrorCode} from '../session/trelloSession';
import {
  createRelaySession,
  RelaySession,
  watchRelaySession,
} from '../relay/relaySession';
import {
  buildAuthorizeUrl,
  normalizeToken,
  TRELLO_API_KEY,
  TRELLO_RELAY_URL,
} from '../trello';
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

/** Side of the QR code of the authorization page, quiet zone included. */
const QR_SIZE = 260;

/** Size of the step number discs. */
const STEP_BADGE_SIZE = 40;

export interface ConnectScreenProps {
  error?: SessionErrorCode;
  busy: boolean;
  /** Connects; the token is saved on the tablet only if `remember` is set. */
  onConnect: (token: string, remember: boolean) => void;
  /** Checks the stored account again after a transient failure. */
  onRetry: () => void;
  /** When set, a back button returns to the boards page. */
  onBack?: () => void;
}

/** Failures worth retrying without typing the token again. */
const TRANSIENT_ERRORS: ReadonlySet<SessionErrorCode> = new Set([
  'permissionDenied',
  'network',
  'rateLimited',
  'unknown',
]);

/** A new relay session, or `null` when no relay is configured. */
function newRelaySession(): RelaySession | null {
  return TRELLO_RELAY_URL ? createRelaySession(TRELLO_RELAY_URL) : null;
}

/**
 * Shown when no Trello account is linked, in two framed steps:
 *
 * 1. Allow sINK on Trello. With the relay, the QR code and the browser
 *    button open the relay's page, and the token comes back by itself.
 * 2. Paste the token, as a fallback (or the only way without a relay); the
 *    clipboard is watched too.
 */
export function ConnectScreen({
  error,
  busy,
  onConnect,
  onRetry,
  onBack,
}: ConnectScreenProps): React.JSX.Element {
  const {t} = useTranslation();
  const [token, setToken] = useState('');
  // Saving the token on the tablet is opt-in: off until the user ticks it.
  const [remember, setRemember] = useState(false);
  const [browserError, setBrowserError] = useState(false);
  const [showAddress, setShowAddress] = useState(false);
  const [pasteError, setPasteError] = useState<TranslationKey | null>(null);
  const authorizeUrl = useMemo(
    () => buildAuthorizeUrl({apiKey: TRELLO_API_KEY}),
    [],
  );
  const canConnect = error !== 'missingApiKey';
  const [clipboardWatched] = useState(isClipboardAvailable);

  // The watcher outlives renders: it reads the latest values through refs.
  const latest = useRef({busy, remember, onConnect});
  latest.current = {busy, remember, onConnect};

  // Connect by itself as soon as a token is copied (typically in the
  // browser), so coming back to the plugin is enough.
  useEffect(() => {
    if (!canConnect || !clipboardWatched) {
      return undefined;
    }
    return watchClipboardForToken({
      read: readClipboardText,
      isPaused: () => latest.current.busy,
      onToken: text => {
        setToken(text.trim());
        setPasteError(null);
        latest.current.onConnect(text, latest.current.remember);
      },
    });
  }, [canConnect, clipboardWatched]);

  // Copy-free flow: wait for the token the browser deposits on the relay.
  // A session is single-use, so a new one (and a new QR code) replaces it
  // once it delivered a token or expired.
  const [relaySession, setRelaySession] = useState(newRelaySession);
  useEffect(() => {
    if (!canConnect || !relaySession) {
      return undefined;
    }
    return watchRelaySession({
      session: relaySession,
      isPaused: () => latest.current.busy,
      onToken: relayToken => {
        setToken(relayToken);
        setPasteError(null);
        setRelaySession(newRelaySession());
        latest.current.onConnect(relayToken, latest.current.remember);
      },
      onExpired: () => setRelaySession(newRelaySession()),
    });
  }, [canConnect, relaySession]);

  const pageUrl = relaySession?.pageUrl ?? authorizeUrl;
  const typed = token.replace(/\s+/g, '');
  const validToken = normalizeToken(token) !== null;

  const openUrl = useCallback((url: string) => {
    setBrowserError(false);
    Linking.openURL(url).catch(openError => {
      console.warn('[sINK] Failed to open the browser', openError);
      setBrowserError(true);
    });
  }, []);

  const submit = useCallback(() => {
    if (validToken) {
      onConnect(token, remember);
    }
  }, [onConnect, token, remember, validToken]);

  const changeToken = useCallback((text: string) => {
    setToken(text);
    setPasteError(null);
  }, []);

  // Long-press paste is not offered in the plugin view: read the clipboard
  // directly and connect at once when it holds something token-shaped.
  const paste = useCallback(async () => {
    if (!isClipboardAvailable()) {
      setPasteError('connect.clipboardUnavailable');
      return;
    }
    const text = await readClipboardText();
    setPasteError(text ? null : 'connect.clipboardEmpty');
    if (!text) {
      return;
    }
    setToken(text.trim());
    if (normalizeToken(text)) {
      onConnect(text, remember);
    }
  }, [onConnect, remember]);

  return (
    <ScreenFrame title={t('connect.title')} onBack={onBack}>
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
            <StepCard number={1} title={t('connect.step1Title')}>
              <View style={styles.allowRow}>
                <View style={styles.allowTexts}>
                  <Text style={styles.paragraph}>
                    {t(relaySession ? 'connect.step1Relay' : 'connect.step1')}
                  </Text>
                  <Button
                    primary
                    label={t('connect.openBrowser')}
                    onPress={() => openUrl(pageUrl)}
                  />
                  {browserError && (
                    <Text style={styles.paragraph}>
                      {t('error.browserUnavailable')}
                    </Text>
                  )}
                  <Text
                    accessibilityLiveRegion="polite"
                    style={[styles.paragraph, relaySession && styles.valid]}>
                    {t(relaySession ? 'connect.waiting' : 'connect.scan')}
                  </Text>
                </View>
                <QrCodeView
                  accessibilityLabel={t('connect.qrLabel')}
                  size={QR_SIZE}
                  value={pageUrl}
                />
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{expanded: showAddress}}
                hitSlop={spacing.sm}
                onPress={() => setShowAddress(shown => !shown)}>
                <Text style={styles.link}>
                  {t(
                    showAddress ? 'connect.hideAddress' : 'connect.showAddress',
                  )}
                </Text>
              </Pressable>
              {showAddress && (
                <Text selectable style={styles.url}>
                  {pageUrl}
                </Text>
              )}
              {showAddress && relaySession && (
                <Pressable
                  accessibilityRole="button"
                  hitSlop={spacing.sm}
                  onPress={() => openUrl(authorizeUrl)}>
                  <Text style={styles.link}>
                    {t('connect.openTrelloDirectly')}
                  </Text>
                </Pressable>
              )}
            </StepCard>

            <StepCard
              number={2}
              title={t(
                relaySession
                  ? 'connect.step2TitleFallback'
                  : 'connect.step2Title',
              )}>
              <Text style={styles.paragraph}>
                {t(relaySession ? 'connect.step2Fallback' : 'connect.step2')}
              </Text>
              {clipboardWatched && (
                <Text style={[styles.paragraph, styles.valid]}>
                  {t('connect.clipboardWatch')}
                </Text>
              )}
              <TextInput
                accessibilityLabel={t('connect.tokenPlaceholder')}
                autoCapitalize="none"
                autoComplete="off"
                autoCorrect={false}
                editable={!busy}
                multiline
                submitBehavior="blurAndSubmit"
                onChangeText={changeToken}
                onSubmitEditing={submit}
                placeholder={t('connect.tokenPlaceholder')}
                placeholderTextColor={colors.foreground}
                returnKeyType="done"
                spellCheck={false}
                style={styles.input}
                value={token}
              />
              {typed.length > 0 && (
                <Text
                  accessibilityLiveRegion="polite"
                  style={[styles.paragraph, validToken && styles.valid]}>
                  {validToken
                    ? t('connect.tokenValid', {count: typed.length})
                    : t('connect.tokenInvalid', {count: typed.length})}
                </Text>
              )}
              {pasteError && (
                <Text style={styles.paragraph}>{t(pasteError)}</Text>
              )}
              <View style={styles.actions}>
                <Button
                  disabled={busy}
                  label={t('connect.paste')}
                  onPress={paste}
                />
                <Button
                  primary
                  disabled={busy || !validToken}
                  label={busy ? t('connect.connecting') : t('connect.submit')}
                  onPress={submit}
                />
              </View>
              <View style={styles.remember}>
                <Checkbox
                  checked={remember}
                  disabled={busy}
                  label={t('connect.remember')}
                  onChange={setRemember}
                />
                <Text
                  accessibilityRole={remember ? 'alert' : undefined}
                  style={[styles.note, remember && styles.warning]}>
                  {t(
                    remember
                      ? 'connect.rememberWarning'
                      : 'connect.sessionOnly',
                  )}
                </Text>
              </View>
            </StepCard>
          </>
        )}
      </ScrollView>
    </ScreenFrame>
  );
}

/** A framed, numbered step of the connection flow. */
function StepCard({
  number,
  title,
  children,
}: {
  number: number;
  title: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{number}</Text>
        </View>
        <Text accessibilityRole="header" style={styles.cardTitle}>
          {title}
        </Text>
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.lg,
    paddingBottom: spacing.xl,
  },
  paragraph: {
    color: colors.foreground,
    fontSize: typography.body,
  },
  note: {
    color: colors.foreground,
    fontSize: typography.small,
  },
  card: {
    gap: spacing.md,
    borderColor: colors.foreground,
    borderWidth: borders.width,
    borderRadius: borders.radius * 2,
    padding: spacing.lg,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  badge: {
    width: STEP_BADGE_SIZE,
    height: STEP_BADGE_SIZE,
    borderRadius: STEP_BADGE_SIZE / 2,
    backgroundColor: colors.foreground,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: colors.background,
    fontSize: typography.label,
    fontWeight: '700',
  },
  cardTitle: {
    flex: 1,
    color: colors.foreground,
    fontSize: typography.label,
    fontWeight: '700',
  },
  allowRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.lg,
  },
  allowTexts: {
    flexBasis: 320,
    flexGrow: 1,
    flexShrink: 1,
    gap: spacing.md,
  },
  link: {
    color: colors.foreground,
    fontSize: typography.small,
    textDecorationLine: 'underline',
  },
  url: {
    color: colors.foreground,
    fontFamily: 'monospace',
    fontSize: typography.small,
  },
  remember: {
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  warning: {
    borderColor: colors.foreground,
    borderWidth: borders.width,
    padding: spacing.md,
  },
  valid: {
    fontWeight: '700',
  },
  error: {
    color: colors.foreground,
    fontSize: typography.body,
    fontWeight: '700',
    borderColor: colors.foreground,
    borderWidth: borders.width,
    padding: spacing.md,
  },
  input: {
    color: colors.foreground,
    borderColor: colors.foreground,
    borderRadius: borders.radius,
    borderWidth: borders.width,
    fontFamily: 'monospace',
    fontSize: typography.body,
    minHeight: typography.body * 3,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    textAlignVertical: 'top',
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
});
