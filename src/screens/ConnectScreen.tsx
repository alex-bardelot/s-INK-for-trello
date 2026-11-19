import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  AppState,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import {Button} from '../components/Button';
import {QrCodeView} from '../components/QrCodeView';
import {ScreenFrame} from '../components/ScreenFrame';
import {SegmentedControl} from '../components/SegmentedControl';
import {SmallButton} from '../components/SmallButton';
import {TranslationKey, useTranslation} from '../i18n';
import {logInkLink} from '../inkLink/diagnostics';
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
  DEFAULT_TOKEN_EXPIRATION,
  normalizeToken,
  TokenExpiration,
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

/** Past this delay, a browser that did not answer is reported. */
const BROWSER_TIMEOUT_MS = 3000;

/** Side of the QR code of the authorization page, quiet zone included. */
const QR_SIZE = 220;

/** Where the token is kept once connected. */
type Persistence = 'session' | 'device';

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
  /**
   * Asks for network access, if not granted yet. Called as soon as the
   * page opens: waiting for the token on the relay already needs it.
   */
  ensureNetwork: () => Promise<boolean>;
}

/** Network access, asked when the page opens. */
type NetworkAccess = 'asking' | 'granted' | 'denied';

/** Failures worth retrying without typing the token again. */
const TRANSIENT_ERRORS: ReadonlySet<SessionErrorCode> = new Set([
  'permissionDenied',
  'network',
  'rateLimited',
  'unknown',
]);

/**
 * A new relay session asking for a token of this lifetime, or `null` when
 * no relay is configured.
 */
function newRelaySession(expiration: TokenExpiration): RelaySession | null {
  return TRELLO_RELAY_URL
    ? createRelaySession(TRELLO_RELAY_URL, expiration)
    : null;
}

/** Name and explanation of each token lifetime offered. */
const LIFETIMES: readonly {
  value: TokenExpiration;
  label: TranslationKey;
  help: TranslationKey;
}[] = [
  {
    value: '1day',
    label: 'connect.lifetime1day',
    help: 'connect.lifetime1dayHelp',
  },
  {
    value: '30days',
    label: 'connect.lifetime30days',
    help: 'connect.lifetime30daysHelp',
  },
  {
    value: 'never',
    label: 'connect.lifetimeNever',
    help: 'connect.lifetimeNeverHelp',
  },
];

/**
 * Shown when no Trello account is linked, in two framed steps:
 *
 * 1. Allow s-INK on Trello. With the relay, the QR code and the browser
 *    button open the relay's page, and the token comes back by itself.
 * 2. Copy the token from Trello's own page, for those who do not want to
 *    go through the relay or when it fails (the only way without a relay):
 *    the clipboard is watched, and the token may be typed.
 */
export function ConnectScreen({
  error,
  busy,
  onConnect,
  onRetry,
  onBack,
  ensureNetwork,
}: ConnectScreenProps): React.JSX.Element {
  const {t} = useTranslation();
  const [network, setNetwork] = useState<NetworkAccess>('asking');
  const askNetwork = useCallback(async () => {
    setNetwork('asking');
    const granted = await ensureNetwork();
    logInkLink(`connect: network access ${granted ? 'granted' : 'denied'}`);
    setNetwork(granted ? 'granted' : 'denied');
  }, [ensureNetwork]);
  // Asked on arrival, before anything on the page needs Trello or the relay.
  useEffect(() => {
    askNetwork();
    // Once per opening of the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [token, setToken] = useState('');
  // Saving the token on the tablet is opt-in: off until the user ticks it.
  const [remember, setRemember] = useState(false);
  const [browserError, setBrowserError] = useState(false);
  const [showAddress, setShowAddress] = useState(false);
  const [revealToken, setRevealToken] = useState(false);
  // How long the token works: asked of Trello by both pages, so chosen
  // before opening them.
  const [expiration, setExpiration] = useState<TokenExpiration>(
    DEFAULT_TOKEN_EXPIRATION,
  );
  const authorizeUrl = useMemo(
    () => buildAuthorizeUrl({apiKey: TRELLO_API_KEY, expiration}),
    [expiration],
  );
  const canConnect = error !== 'missingApiKey';
  const [clipboardWatched] = useState(isClipboardAvailable);

  // The watcher outlives renders: it reads the latest values through refs.
  const latest = useRef({busy, remember, onConnect, expiration});
  latest.current = {busy, remember, onConnect, expiration};

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
        latest.current.onConnect(text, latest.current.remember);
      },
    });
  }, [canConnect, clipboardWatched]);

  // Copy-free flow: wait for the token the browser deposits on the relay.
  // A session is single-use, so a new one (and a new QR code) replaces it
  // once it delivered a token or expired.
  const [relaySession, setRelaySession] = useState(() =>
    newRelaySession(DEFAULT_TOKEN_EXPIRATION),
  );
  // Another lifetime needs another page address: a new session (and QR code).
  const changeExpiration = useCallback((next: TokenExpiration) => {
    setExpiration(next);
    setRelaySession(newRelaySession(next));
  }, []);
  const networkGranted = network === 'granted';
  useEffect(() => {
    if (!canConnect || !relaySession || !networkGranted) {
      return undefined;
    }
    return watchRelaySession({
      session: relaySession,
      isPaused: () => latest.current.busy,
      onToken: relayToken => {
        setToken(relayToken);
        setRelaySession(newRelaySession(latest.current.expiration));
        latest.current.onConnect(relayToken, latest.current.remember);
      },
      onExpired: () =>
        setRelaySession(newRelaySession(latest.current.expiration)),
    });
  }, [canConnect, relaySession, networkGranted]);

  const pageUrl = relaySession?.pageUrl ?? authorizeUrl;
  const typed = token.replace(/\s+/g, '');
  const validToken = normalizeToken(token) !== null;

  // The browser opening is traced in the diagnostics log (host only: the
  // relay address carries the session key). A call that neither opens the
  // browser nor fails would otherwise leave the button looking dead.
  const openUrl = useCallback((url: string) => {
    setBrowserError(false);
    const host = url.replace(/^[a-z]+:\/\/([^/?#]+).*$/i, '$1');
    logInkLink(`browser: opening ${host} (app ${AppState.currentState})`);
    let settled = false;
    const timeout = setTimeout(() => {
      if (!settled) {
        logInkLink(`browser: no answer after ${BROWSER_TIMEOUT_MS} ms`);
        setBrowserError(true);
      }
    }, BROWSER_TIMEOUT_MS);
    Linking.openURL(url)
      .then(result => {
        settled = true;
        logInkLink(
          `browser: opened (${String(result)}, app ${AppState.currentState})`,
        );
      })
      .catch(openError => {
        settled = true;
        console.warn('[sINK] Failed to open the browser', openError);
        logInkLink(`browser: failed: ${String(openError)}`);
        setBrowserError(true);
      })
      .finally(() => clearTimeout(timeout));
  }, []);

  // Whether the browser really came over the plugin shows in the log.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', next =>
      logInkLink(`browser: app ${next}`),
    );
    return () => subscription.remove();
  }, []);

  const submit = useCallback(() => {
    if (validToken) {
      onConnect(token, remember);
    }
  }, [onConnect, token, remember, validToken]);

  return (
    <ScreenFrame title={t('connect.title')} onBack={onBack}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled">
        <Text style={styles.intro}>{t('connect.intro')}</Text>

        {error && (
          <Text accessibilityRole="alert" style={styles.error}>
            {t(ERROR_MESSAGES[error])}
          </Text>
        )}
        {error && TRANSIENT_ERRORS.has(error) && (
          <Button label={t('common.retry')} onPress={onRetry} />
        )}
        {/* Refused on arrival: said once, unless the error above says it. */}
        {network === 'denied' && error !== 'permissionDenied' && (
          <>
            <Text accessibilityRole="alert" style={styles.error}>
              {t('error.permissionDenied')}
            </Text>
            <Button label={t('common.retry')} onPress={askNetwork} />
          </>
        )}

        {canConnect && (
          <>
            {/* First, since the relay connects as soon as Trello answers. */}
            <StepCard number={1} title={t('connect.persistTitle')}>
              <SegmentedControl<Persistence>
                label={t('connect.persistLabel')}
                segments={[
                  {value: 'session', label: t('connect.persistSession')},
                  {value: 'device', label: t('connect.persistDevice')},
                ]}
                value={remember ? 'device' : 'session'}
                onChange={value => setRemember(value === 'device')}
              />
              <Text
                accessibilityLiveRegion="polite"
                style={[styles.paragraph, remember && styles.warning]}>
                {t(
                  remember ? 'connect.rememberWarning' : 'connect.sessionOnly',
                )}
              </Text>
              <SegmentedControl<TokenExpiration>
                label={t('connect.lifetimeLabel')}
                segments={LIFETIMES.map(lifetime => ({
                  value: lifetime.value,
                  label: t(lifetime.label),
                }))}
                value={expiration}
                onChange={changeExpiration}
              />
              <Text accessibilityLiveRegion="polite" style={styles.paragraph}>
                {t(
                  LIFETIMES.find(lifetime => lifetime.value === expiration)!
                    .help,
                )}
              </Text>
            </StepCard>

            <StepCard
              number={2}
              title={t('connect.step1Title')}
              // Without a relay, a phone would show the token, which would
              // then have to be typed on the tablet: no QR code then.
              aside={
                relaySession && (
                  <QrCodeView
                    accessibilityLabel={t('connect.qrLabel')}
                    size={QR_SIZE}
                    value={pageUrl}
                  />
                )
              }>
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
              {relaySession && (
                <Text
                  accessibilityLiveRegion="polite"
                  style={[styles.paragraph, styles.valid]}>
                  {t('connect.waiting')}
                </Text>
              )}
            </StepCard>

            <StepCard
              number={3}
              title={t(
                relaySession
                  ? 'connect.step2TitleFallback'
                  : 'connect.step2Title',
              )}>
              <Text style={styles.paragraph}>
                {t(relaySession ? 'connect.step2Fallback' : 'connect.step2')}
              </Text>
              <View style={styles.links}>
                {relaySession && (
                  <Pressable
                    accessibilityRole="button"
                    hitSlop={spacing.sm}
                    onPress={() => openUrl(authorizeUrl)}>
                    <Text style={styles.link}>
                      {t('connect.openTrelloDirectly')}
                    </Text>
                  </Pressable>
                )}
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{expanded: showAddress}}
                  hitSlop={spacing.sm}
                  onPress={() => setShowAddress(shown => !shown)}>
                  <Text style={styles.link}>
                    {t(
                      showAddress
                        ? 'connect.hideAddress'
                        : 'connect.showAddress',
                    )}
                  </Text>
                </Pressable>
              </View>
              {showAddress && (
                <Text selectable style={styles.url}>
                  {authorizeUrl}
                </Text>
              )}
              <View style={styles.tokenRow}>
                {/* Masked by default, like a password. Android cannot mask a
                    multiline field, so it is a single line until revealed. */}
                <TextInput
                  accessibilityLabel={t('connect.tokenPlaceholder')}
                  autoCapitalize="none"
                  autoComplete="off"
                  autoCorrect={false}
                  editable={!busy}
                  importantForAutofill="no"
                  multiline={revealToken}
                  secureTextEntry={!revealToken}
                  submitBehavior="blurAndSubmit"
                  onChangeText={setToken}
                  onSubmitEditing={submit}
                  placeholder={t('connect.tokenPlaceholder')}
                  placeholderTextColor={colors.foreground}
                  returnKeyType="done"
                  spellCheck={false}
                  style={[styles.input, revealToken && styles.inputRevealed]}
                  value={token}
                />
                <SmallButton
                  active={revealToken}
                  label={t(
                    revealToken ? 'connect.hideToken' : 'connect.showToken',
                  )}
                  accessibilityLabel={t(
                    revealToken ? 'connect.hideToken' : 'connect.showToken',
                  )}
                  onPress={() => setRevealToken(shown => !shown)}
                />
              </View>
              <View style={styles.actions}>
                <Button
                  primary
                  disabled={busy || !validToken}
                  label={busy ? t('connect.connecting') : t('connect.submit')}
                  onPress={submit}
                />
                {typed.length > 0 && (
                  <Text
                    accessibilityLiveRegion="polite"
                    style={[
                      styles.paragraph,
                      styles.feedback,
                      validToken && styles.valid,
                    ]}>
                    {validToken
                      ? t('connect.tokenValid', {count: typed.length})
                      : t('connect.tokenInvalid', {count: typed.length})}
                  </Text>
                )}
              </View>
            </StepCard>
          </>
        )}
      </ScrollView>
    </ScreenFrame>
  );
}

/**
 * A framed, numbered step of the connection flow. An `aside` (the QR code)
 * sits at the right, beside the title and the content, so it adds no
 * height of its own.
 */
function StepCard({
  number,
  title,
  aside,
  children,
}: {
  number: number;
  title: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <View style={styles.card}>
      <View style={styles.cardMain}>
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
      {aside}
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.md,
    paddingBottom: spacing.md,
  },
  paragraph: {
    color: colors.foreground,
    fontSize: typography.body,
  },
  intro: {
    color: colors.foreground,
    fontSize: typography.small,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.lg,
    borderColor: colors.foreground,
    borderWidth: borders.width,
    borderRadius: borders.radius * 2,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  cardMain: {
    flex: 1,
    gap: spacing.sm,
  },
  links: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: spacing.lg,
    rowGap: spacing.sm,
  },
  feedback: {
    flex: 1,
    alignSelf: 'center',
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
  warning: {
    borderColor: colors.foreground,
    borderWidth: borders.width,
    padding: spacing.sm,
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
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  input: {
    color: colors.foreground,
    borderColor: colors.foreground,
    borderRadius: borders.radius,
    borderWidth: borders.width,
    fontFamily: 'monospace',
    flex: 1,
    fontSize: typography.body,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    textAlignVertical: 'top',
  },
  inputRevealed: {
    minHeight: typography.body * 3,
  },
  tokenRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
});
