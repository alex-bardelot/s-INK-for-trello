import React, {useCallback} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {PluginManager} from 'sn-plugin-lib';

import {useTranslation} from '../i18n';
import {colors, spacing, typography} from '../theme';

/** Landing screen of the plugin. */
export function HomeScreen(): React.JSX.Element {
  const {t} = useTranslation();

  const handleClose = useCallback(() => {
    PluginManager.closePluginView().catch(error =>
      console.warn('[SuperTrello] Failed to close plugin view', error),
    );
  }, []);

  return (
    <View style={styles.container}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('common.close')}
        hitSlop={spacing.md}
        onPress={handleClose}
        style={styles.closeButton}>
        <Text style={styles.closeIcon}>✕</Text>
      </Pressable>
      <Text accessibilityRole="header" style={styles.greeting}>
        {t('home.greeting')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  closeButton: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    padding: spacing.sm,
  },
  closeIcon: {
    color: colors.foreground,
    fontSize: typography.icon,
    fontWeight: '600',
  },
  greeting: {
    color: colors.foreground,
    fontSize: typography.title,
    fontWeight: '600',
    textAlign: 'center',
  },
});
