import React from 'react';
import {StyleSheet, Text, View} from 'react-native';

import {Button} from '../components/Button';
import {OfflinePopup, useOfflineRetry} from '../components/OfflineButton';
import {ScreenFrame} from '../components/ScreenFrame';
import {WifiOffIcon} from '../components/WifiOffIcon';
import {useTranslation} from '../i18n';
import {colors, spacing, typography} from '../theme';

export interface OfflineScreenProps {
  /** Checks the Trello account again. */
  onRetry: () => void;
}

/**
 * Shown when s-INK opens without internet while a Trello account is linked:
 * the account is kept, nothing is lost. Nothing is checked in the
 * background (battery): Retry, or opening s-INK again, checks the internet
 * and goes on to the boards once it is back; a popup says when it is not.
 */
export function OfflineScreen({onRetry}: OfflineScreenProps): React.JSX.Element {
  const {t} = useTranslation();
  const {checking, failed, retry, dismiss} = useOfflineRetry(onRetry);

  return (
    <ScreenFrame title={t('app.name')} hideOfflineButton>
      <View style={styles.center}>
        <WifiOffIcon
          size={64}
          color={colors.foreground}
          background={colors.background}
        />
        <Text accessibilityRole="header" style={styles.title}>
          {t('offline.title')}
        </Text>
        <Text style={styles.message}>{t('offline.message')}</Text>
        <Text style={styles.message}>{t('offline.autoRetry')}</Text>
        <Button
          primary
          disabled={checking}
          label={checking ? t('offline.checking') : t('common.retry')}
          onPress={retry}
        />
      </View>
      {failed && <OfflinePopup onClose={dismiss} />}
    </ScreenFrame>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
    paddingHorizontal: spacing.xl,
  },
  title: {
    color: colors.foreground,
    fontSize: typography.heading,
    fontWeight: '700',
    textAlign: 'center',
  },
  message: {
    color: colors.foreground,
    fontSize: typography.label,
    textAlign: 'center',
  },
});
