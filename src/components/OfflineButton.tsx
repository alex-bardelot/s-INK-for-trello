import React, {useCallback, useEffect, useRef, useState} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';

import {useTranslation} from '../i18n';
import {connectivity} from '../network/connectivity';
import {borders, colors, spacing, typography} from '../theme';
import {Button} from './Button';
import {WifiOffIcon} from './WifiOffIcon';

/**
 * Size of the Wi-Fi off sign: a little more than the Settings gear (24),
 * since its thin arcs weigh less than the solid gear.
 */
const ICON_SIZE = 30;

function wifiOffIcon(color: string, background: string): React.ReactNode {
  return <WifiOffIcon size={ICON_SIZE} color={color} background={background} />;
}

/**
 * Checks the tablet's internet again on demand.
 * @returns `retry`, whether a check runs, and whether the last one failed
 *   (until `dismiss`).
 */
export function useOfflineRetry(onOnline?: () => void): {
  checking: boolean;
  failed: boolean;
  retry: () => void;
  dismiss: () => void;
} {
  const [checking, setChecking] = useState(false);
  const [failed, setFailed] = useState(false);
  const mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );

  const retry = useCallback(async () => {
    setChecking(true);
    const online = await connectivity.probe();
    if (!mounted.current) {
      return;
    }
    setChecking(false);
    if (online) {
      onOnline?.();
    } else {
      setFailed(true);
    }
  }, [onOnline]);

  const dismiss = useCallback(() => setFailed(false), []);
  return {checking, failed, retry, dismiss};
}

/** Header button shown while the tablet has no internet. */
export function OfflineButton({
  checking,
  onPress,
}: {
  checking: boolean;
  onPress: () => void;
}): React.JSX.Element {
  const {t} = useTranslation();
  return (
    <Button
      label={checking ? t('offline.checking') : t('offline.button')}
      disabled={checking}
      icon={wifiOffIcon}
      onPress={onPress}
    />
  );
}

/**
 * Popup over the whole page when a check failed: the tablet must be
 * connected to the internet. Drawn in the page (no system dialog), with a
 * plain border for e-ink.
 */
export function OfflinePopup({
  onClose,
}: {
  onClose: () => void;
}): React.JSX.Element {
  const {t} = useTranslation();
  return (
    <Pressable
      accessibilityViewIsModal
      style={styles.backdrop}
      onPress={onClose}>
      {/* Taps on the card itself do not close it. */}
      <Pressable style={styles.card} onPress={() => {}}>
        <View style={styles.header}>
          <WifiOffIcon
            size={ICON_SIZE * 2}
            color={colors.foreground}
            background={colors.background}
          />
          <Text accessibilityRole="header" style={styles.title}>
            {t('offline.popupTitle')}
          </Text>
        </View>
        <Text accessibilityRole="alert" style={styles.message}>
          {t('offline.popupMessage')}
        </Text>
        <View style={styles.actions}>
          <Button primary label={t('common.ok')} onPress={onClose} />
        </View>
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    // Faded page behind, without the grey e-ink renders poorly.
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
  },
  card: {
    maxWidth: 560,
    width: '100%',
    gap: spacing.md,
    backgroundColor: colors.background,
    borderColor: colors.foreground,
    borderWidth: borders.width * 2,
    borderRadius: borders.radius * 2,
    padding: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  title: {
    flex: 1,
    color: colors.foreground,
    fontSize: typography.heading,
    fontWeight: '700',
  },
  message: {
    color: colors.foreground,
    fontSize: typography.label,
  },
  actions: {
    alignItems: 'flex-end',
  },
});
