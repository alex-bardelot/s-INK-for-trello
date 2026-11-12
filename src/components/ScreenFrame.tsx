import React, {useCallback} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {PluginManager} from 'sn-plugin-lib';

import {useTranslation} from '../i18n';
import {borders, colors, spacing, typography} from '../theme';

export interface ScreenFrameProps {
  title: string;
  children: React.ReactNode;
}

/** Common layout of the plugin screens: title bar with a close button. */
export function ScreenFrame({
  title,
  children,
}: ScreenFrameProps): React.JSX.Element {
  const {t} = useTranslation();

  const handleClose = useCallback(() => {
    PluginManager.closePluginView().catch(error =>
      console.warn('[SuperTrello] Failed to close plugin view', error),
    );
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text accessibilityRole="header" style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
          hitSlop={spacing.md}
          onPress={handleClose}
          style={styles.closeButton}>
          <Text style={styles.closeIcon}>✕</Text>
        </Pressable>
      </View>
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomColor: colors.foreground,
    borderBottomWidth: borders.width,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  title: {
    flex: 1,
    color: colors.foreground,
    fontSize: typography.heading,
    fontWeight: '700',
  },
  closeButton: {
    padding: spacing.sm,
  },
  closeIcon: {
    color: colors.foreground,
    fontSize: typography.icon,
    fontWeight: '600',
  },
  content: {
    flex: 1,
    padding: spacing.lg,
  },
});
