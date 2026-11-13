import React, {useCallback} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {PluginManager} from 'sn-plugin-lib';

import {useTranslation} from '../i18n';
import {borders, colors, spacing, typography} from '../theme';
import {CloseIcon} from './CloseIcon';

/**
 * Size of the icons of the title bar (close, refresh). Icon buttons put
 * `spacing.sm` around it, like the close button, so they line up.
 */
export const HEADER_ICON_SIZE = 32;

export interface ScreenFrameProps {
  title: string;
  children: React.ReactNode;
  /** When set, a back button is shown before the title. */
  onBack?: () => void;
  /** Extra controls shown between the title and the close button. */
  actions?: React.ReactNode;
}

/** Common layout of the plugin screens: title bar with a close button. */
export function ScreenFrame({
  title,
  children,
  onBack,
  actions,
}: ScreenFrameProps): React.JSX.Element {
  const {t} = useTranslation();

  const handleClose = useCallback(() => {
    PluginManager.closePluginView().catch(error =>
      console.warn('[sINK] Failed to close plugin view', error),
    );
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        {onBack && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('common.back')}
            hitSlop={spacing.md}
            onPress={onBack}
            style={styles.backButton}>
            <Text style={styles.closeIcon}>‹</Text>
          </Pressable>
        )}
        <Text accessibilityRole="header" style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {actions && <View style={styles.actions}>{actions}</View>}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
          hitSlop={spacing.md}
          onPress={handleClose}
          style={styles.closeButton}>
          <CloseIcon size={HEADER_ICON_SIZE} color={colors.foreground} />
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
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginHorizontal: spacing.md,
  },
  closeButton: {
    padding: spacing.sm,
  },
  backButton: {
    paddingRight: spacing.md,
    paddingVertical: spacing.sm,
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
