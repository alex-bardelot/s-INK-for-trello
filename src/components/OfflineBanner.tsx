import React from 'react';
import {StyleSheet, Text, View} from 'react-native';

import {useTranslation} from '../i18n';
import {useConnectivity} from '../network/connectivity';
import {colors, spacing, typography} from '../theme';

/**
 * Black strip under the title bar while the internet is unreachable, so the
 * user knows why Trello does not answer. It goes away by itself once the
 * connection is back.
 */
export function OfflineBanner(): React.JSX.Element | null {
  const {t} = useTranslation();
  if (useConnectivity() !== 'offline') {
    return null;
  }
  return (
    <View accessibilityRole="alert" style={styles.banner}>
      <Text style={styles.text}>
        <Text style={styles.title}>{t('offline.bannerTitle')}</Text>
        {'  '}
        {t('offline.banner')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: colors.foreground,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  text: {
    color: colors.background,
    fontSize: typography.body,
  },
  title: {
    fontWeight: '700',
  },
});
