import React, {useCallback, useEffect, useRef, useState} from 'react';
import {Pressable, StyleSheet, Text} from 'react-native';

import {useTranslation} from '../i18n';
import {connectivity} from '../network/connectivity';
import {colors, spacing, typography} from '../theme';
import {Button} from './Button';
import {Popup} from './Popup';
import {WifiOffIcon} from './WifiOffIcon';

/**
 * Size of the Wi-Fi sign in the title bar: that of the other header icons
 * (`HEADER_ICON_SIZE`, not imported to keep ScreenFrame free of a cycle).
 */
const ICON_SIZE = 32;

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

/**
 * Header button shown while the tablet has no internet: the Wi-Fi sign
 * alone, borderless like the refresh arrow it stands in for. Its name is
 * only read out by accessibility services.
 */
export function OfflineButton({
  checking,
  onPress,
}: {
  checking: boolean;
  onPress: () => void;
}): React.JSX.Element {
  const {t} = useTranslation();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={checking ? t('offline.checking') : t('offline.button')}
      accessibilityState={{busy: checking, disabled: checking}}
      disabled={checking}
      hitSlop={spacing.md}
      onPress={onPress}
      style={styles.iconButton}>
      <WifiOffIcon size={ICON_SIZE} />
    </Pressable>
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
    <Popup
      title={t('offline.popupTitle')}
      icon={<WifiOffIcon size={ICON_SIZE * 2} />}
      onClose={onClose}
      actions={<Button primary label={t('common.ok')} onPress={onClose} />}>
      <Text accessibilityRole="alert" style={styles.message}>
        {t('offline.popupMessage')}
      </Text>
    </Popup>
  );
}

const styles = StyleSheet.create({
  iconButton: {
    padding: spacing.sm,
  },
  message: {
    color: colors.foreground,
    fontSize: typography.label,
  },
});
