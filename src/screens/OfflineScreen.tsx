import React, {useState} from 'react';
import {StyleSheet, Text, View} from 'react-native';

import {Button} from '../components/Button';
import {ScreenFrame} from '../components/ScreenFrame';
import {useTranslation} from '../i18n';
import {connectivity} from '../network/connectivity';
import {colors, spacing, typography} from '../theme';

export interface OfflineScreenProps {
  /** Checks the Trello account again. */
  onRetry: () => void;
}

/**
 * Shown when s-INK opens without internet while a Trello account is linked:
 * the account is kept, nothing is lost. Nothing is checked in the
 * background (battery): Retry, or opening s-INK again, checks the internet
 * and goes on to the boards once it is back.
 */
export function OfflineScreen({onRetry}: OfflineScreenProps): React.JSX.Element {
  const {t} = useTranslation();
  const [checking, setChecking] = useState(false);

  const retry = async () => {
    setChecking(true);
    const online = await connectivity.probe();
    setChecking(false);
    if (online) {
      onRetry();
    }
  };

  return (
    <ScreenFrame title={t('app.name')} hideOfflineBanner>
      <View style={styles.center}>
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
